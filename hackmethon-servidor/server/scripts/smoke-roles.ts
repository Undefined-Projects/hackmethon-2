// Prueba de humo de los roles con equipos de 3 a 5: una sola TERMINAL,
// el cambio de rol a mano desde el panel y la mezcla entre conectados.
// Requiere el server levantado. Usa el equipo más numeroso que haya y
// lo deja como estaba: roles, contadores, mezclas y bitácora.
import 'dotenv/config';
import { io, type Socket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

const URL = process.env.SMOKE_URL ?? 'http://localhost:4000';
const ADMIN = process.env.ADMIN_CODE ?? 'ADMIN-2026';
const prisma = new PrismaClient();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
const check = (ok: boolean, txt: string) => { console.log(`  ${ok ? '✔' : '✘'} ${txt}`); if (!ok) fallos++; };

function connect(code: string) {
  const s: Socket = io(URL, { auth: { code }, transports: ['websocket'] });
  const fresh = (ev: string, ms = 4000) =>
    new Promise<any>((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), ms); s.once(ev, (d: any) => { clearTimeout(t); res(d); }); });
  const send = (ev: string, p: any) =>
    new Promise<any>((r) => {
      const t = setTimeout(() => r({ ok: false, error: `TIMEOUT:${ev}` }), 8000);
      s.emit(ev as any, p, (res: any) => { clearTimeout(t); r(res); });
    });
  return { s, fresh, send };
}

const equipos = await prisma.team.findMany({ include: { members: { orderBy: { accessCode: 'asc' } } } });
const equipo = equipos.sort((a, b) => b.members.length - a.members.length)[0];
const gente = equipo.members.filter((m) => !m.isAdmin);
const copia = gente.map((m) => ({ id: m.id, role: m.role, previousRole: m.previousRole, vecesTerminal: m.vecesTerminal }));
const evento = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
const desde = new Date();
const roles = async () => new Map((await prisma.user.findMany({ where: { teamId: equipo.id } })).map((u) => [u.accessCode, u.role]));
const terminales = (m: Map<string, string>) => [...m.values()].filter((r) => r === 'TERMINAL').length;

console.log(`Equipo de prueba: ${equipo.name} (${gente.length} jugadores)`);
const admin = connect(ADMIN);
const abiertos: ReturnType<typeof connect>[] = [admin];
try {
  await admin.fresh('session:snapshot');

  console.log('\n1) Una sola TERMINAL, también a mano');
  const t0 = gente.find((m) => m.role === 'TERMINAL')!;
  const otro = gente.find((m) => m.role !== 'TERMINAL')!;
  const r1 = await admin.send('admin:jugador:rol', { userId: otro.id, rol: 'TERMINAL' });
  const tras1 = await roles();
  check(r1.ok && tras1.get(otro.accessCode) === 'TERMINAL', `dar la TERMINAL a ${otro.accessCode} funciona (${r1.error ?? 'ok'})`);
  check(tras1.get(t0.accessCode) === otro.role, `y quien la tenía (${t0.accessCode}) pasa al puesto que quedó libre: ${tras1.get(t0.accessCode)}`);
  check(terminales(tras1) === 1, 'sigue habiendo una sola TERMINAL');
  const r2 = await admin.send('admin:jugador:rol', { userId: otro.id, rol: 'DATOS' });
  check(!r2.ok && r2.error === 'SIN_TERMINAL', `quitarle la TERMINAL sin dársela a otro se rechaza (${r2.error})`);
  const libre = gente.find((m) => tras1.get(m.accessCode) !== 'TERMINAL')!;
  const destino = tras1.get(libre.accessCode) === 'DATOS' ? 'PANTALLA' : 'DATOS';
  const r3 = await admin.send('admin:jugador:rol', { userId: libre.id, rol: destino });
  check(r3.ok && (await roles()).get(libre.accessCode) === destino, `entre DATOS y PANTALLA se cambia libremente (${libre.accessCode} → ${destino})`);
  const jug = connect(libre.accessCode); abiertos.push(jug);
  await jug.fresh('session:snapshot');
  const r4 = await jug.send('admin:jugador:rol', { userId: libre.id, rol: 'TERMINAL' });
  check(!r4.ok && r4.error === 'NOT_ALLOWED', `un jugador no puede cambiarse el rol (${r4.error})`);

  console.log('\n2) La mezcla cuenta solo a los conectados');
  // La TERMINAL actual se queda FUERA: así se ve que la mezcla se la da a
  // alguien presente y a ella la pasa a otro puesto.
  const ahora = await roles();
  const ausente = gente.find((m) => ahora.get(m.accessCode) === 'TERMINAL')!;
  const presentes = gente.filter((m) => m.id !== ausente.id).slice(0, Math.max(2, gente.length - 2));
  for (const m of presentes) if (m.id !== libre.id) { const c = connect(m.accessCode); abiertos.push(c); await c.fresh('session:snapshot'); }
  await wait(500);
  const cambio = jug.fresh('role:changed', 6000).catch(() => null);
  const r5 = await admin.send('admin:roles:shuffle', { teamIds: [equipo.id] });
  const tras5 = await roles();
  check(r5.ok, `mezclar funciona (${r5.error ?? 'ok'})`);
  check(terminales(tras5) === 1, 'tras mezclar, una sola TERMINAL');
  const nueva = gente.find((m) => tras5.get(m.accessCode) === 'TERMINAL')!;
  check(presentes.some((m) => m.id === nueva.id), `la TERMINAL cae en alguien conectado (${nueva.accessCode})`);
  check(tras5.get(ausente.accessCode) !== 'TERMINAL', `la ausente (${ausente.accessCode}) deja la TERMINAL: pasa a ${tras5.get(ausente.accessCode)}`);
  const cuenta = (r: string) => [...tras5.values()].filter((x) => x === r).length;
  check(Math.abs(cuenta('DATOS') - cuenta('PANTALLA')) <= 1, `DATOS y PANTALLA quedan equilibrados (${cuenta('DATOS')}/${cuenta('PANTALLA')})`);
  const aviso = await cambio;
  check(!aviso || aviso.role === tras5.get(libre.accessCode), 'quien cambia de rol recibe el aviso con el rol nuevo');
} finally {
  for (const c of abiertos) c.s.close();
  await wait(300);
  for (const u of copia) await prisma.user.update({ where: { id: u.id }, data: { role: u.role, previousRole: u.previousRole, vecesTerminal: u.vecesTerminal } });
  await prisma.eventState.update({ where: { id: 'singleton' }, data: { shuffleCount: evento.shuffleCount, lastShuffleAt: evento.lastShuffleAt } });
  await prisma.eventLog.deleteMany({ where: { createdAt: { gte: desde }, type: { in: ['ROLE_SET', 'ROLE_SHUFFLE'] } } });
  await prisma.$disconnect();
}
console.log(fallos ? `\n✘ ${fallos} fallos` : '\n✔ todo bien');
process.exit(fallos ? 1 : 0);
