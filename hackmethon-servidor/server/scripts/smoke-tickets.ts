// Prueba de humo de los tickets: el ajuste del panel, el escudo, la
// intensidad por distancia en fases, el súper ataque y el reparto de una
// ronda de minijuego.
// Requiere el server levantado y el evento EN JUEGO (RUNNING).
//
// Usa los tres primeros equipos y deja todo como lo encontró: sus
// tickets, escudos, esperas y progreso, y las filas de la bitácora que crea.
import 'dotenv/config';
import { io, type Socket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

const URL = process.env.SMOKE_URL ?? 'http://localhost:4000';
const ADMIN = process.env.ADMIN_CODE ?? 'ADMIN-2026';
const prisma = new PrismaClient();
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
  const resync = () => new Promise<any>((r) => s.emit('session:resync', {}, r));
  return { s, fresh, send, resync };
}

const evento = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
if (evento.status !== 'RUNNING' || evento.pausedAt) {
  console.log('El evento no está en juego: esta prueba necesita poder atacar. No se toca nada.');
  process.exit(1);
}

const equipos = await prisma.team.findMany({
  orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 3,
  include: { members: { orderBy: { displayName: 'asc' } }, progress: true },
});
if (equipos.length < 3) { console.log('Hacen falta tres equipos.'); process.exit(1); }
const [A, B, C] = equipos;
const CAMPOS = ['tickets', 'escudoAt', 'escudoPausaMs', 'ultimoSuperAt', 'ultimoSuperPausaMs', 'ultimoAtaqueAt', 'ultimoObjetivoId', 'ultimoAtaquePausaMs'] as const;
const originales = equipos.map((t) => ({ id: t.id, data: Object.fromEntries(CAMPOS.map((k) => [k, t[k]])) }));
const desde = new Date();

// Que ninguno arranque con espera, escudo ni saldo de antes.
await prisma.team.updateMany({
  where: { id: { in: equipos.map((t) => t.id) } },
  data: { tickets: 0, escudoAt: null, ultimoSuperAt: null, ultimoAtaqueAt: null, ultimoObjetivoId: null },
});
// C va una fase por delante: así se nota la intensidad.
const faseC = C.progress.find((p) => p.status !== 'SOLVED');
const faseCAntes = faseC ? { status: faseC.status, solvedAt: faseC.solvedAt } : null;

const admin = connect(ADMIN);
const a = connect(A.members[0].accessCode);
const b = connect(B.members[0].accessCode);
const c = connect(C.members[0].accessCode);

try {
  await Promise.all([admin, a, b, c].map((x) => x.fresh('session:snapshot')));

  console.log(`\n1) El panel reparte tickets (${A.name})`);
  const mov = a.fresh('tickets:movimiento');
  const r1 = await admin.send('admin:equipo:tickets', { teamId: A.id, delta: 20 });
  check(r1.ok && r1.data?.saldo === 20, `el panel le da 20 (${r1.error ?? r1.data?.saldo})`);
  const m1 = await mov;
  check(m1.saldo === 20 && m1.delta === 20, 'y el equipo recibe el movimiento con su saldo');
  const rj = await a.send('admin:equipo:tickets', { teamId: A.id, delta: 100 });
  check(!rj.ok && rj.error === 'NOT_ALLOWED', `un jugador no se los puede dar (${rj.error})`);
  const sa = await a.resync();
  check(sa.team.tickets === 20, 'el saldo viaja en su snapshot');
  const sb = await b.resync();
  check(!JSON.stringify(sb.ataque).includes('"tickets"'), 'y NO en el de los rivales');

  console.log('\n2) El escudo');
  const e1 = await a.send('player:escudo', {});
  check(e1.ok && e1.data?.saldo === 12, `cuesta 8 (${e1.error ?? e1.data?.saldo})`);
  const e2 = await a.send('player:escudo', {});
  check(!e2.ok && e2.error === 'ESCUDO_ACTIVO', `no se apila (${e2.error})`);
  const eb = await b.send('player:escudo', {});
  check(!eb.ok && eb.error === 'SIN_TICKETS', `sin saldo no se compra (${eb.error})`);
  const bloq = a.fresh('ataque:bloqueado');
  const at1 = await b.send('player:ataque', { teamId: A.id });
  check(at1.ok && at1.data?.bloqueado === true, `el ataque de ${B.name} rebota (${at1.error ?? at1.data?.bloqueado})`);
  check((await bloq).de === B.name, 'y el escudado se entera de quién fue');
  const at2 = await b.send('player:ataque', { teamId: C.id });
  check(!at2.ok && at2.error === 'ENFRIANDO', `el que rebotó gasta igual su espera (${at2.error})`);

  console.log('\n3) La intensidad según la distancia en fases');
  if (faseC) {
    await prisma.teamPhaseProgress.update({ where: { id: faseC.id }, data: { status: 'SOLVED', solvedAt: new Date() } });
    const sc = await c.resync();
    const contraB = sc.ataque.objetivos.find((o: any) => o.id === B.id);
    check(Math.abs(contraB.intensidad - 1 / 1.3) < 1e-6, `${C.name} (1 fase) contra ${B.name} (0): ×${contraB.intensidad.toFixed(2)}`);
    const sb2 = await b.resync();
    const contraC = sb2.ataque.objetivos.find((o: any) => o.id === C.id);
    check(Math.abs(contraC.intensidad - 1.3) < 1e-6, `${B.name} contra ${C.name}: ×${contraC.intensidad.toFixed(2)}`);
    const termB = B.members.find((m) => m.role === 'TERMINAL');
    const tb = termB ? connect(termB.accessCode) : null;
    if (tb) await tb.fresh('session:snapshot');
    const golpe = tb?.fresh('player:averia');
    const at3 = await c.send('player:ataque', { teamId: B.id });
    check(at3.ok && Math.abs(at3.data.intensidad - 1 / 1.3) < 1e-6, `el ataque de ${C.name} pega flojo (×${at3.data?.intensidad?.toFixed(2)})`);
    if (golpe) {
      const av = await golpe;
      check(av.tipo === 'TERMINAL' && av.duracionMs === Math.round(3000 / 1.3), `la Terminal de ${B.name} sufre ${av.duracionMs} ms en vez de 3000`);
    }
    tb?.s.close();
  } else {
    console.log('  (sin fase pendiente en C: se salta)');
  }

  console.log('\n4) El súper ataque');
  const victima = connect(C.members[C.members.length - 1].accessCode);
  await victima.fresh('session:snapshot');
  const sup = victima.fresh('player:averia');
  const s1 = await a.send('player:super', { teamId: C.id });
  check(s1.ok && s1.data?.saldo === 0, `cuesta 12 (${s1.error ?? s1.data?.saldo})`);
  const av = await sup;
  check(av.tipo === 'SUPER' && av.duracionMs === 15000 && av.de === A.name, `inmoviliza 15 s a todo ${C.name} (${av.tipo}, ${av.duracionMs})`);
  await admin.send('admin:equipo:tickets', { teamId: A.id, delta: 12 });
  const s2 = await a.send('player:super', { teamId: B.id });
  check(!s2.ok && s2.error === 'SUPER_ENFRIANDO', `tiene su propia espera (${s2.error})`);
  // Atraviesa el escudo: B se escuda y C… no tiene saldo, así que A
  // vuelve a cargar y la espera se borra a mano.
  await admin.send('admin:equipo:tickets', { teamId: B.id, delta: 8 });
  await b.send('player:escudo', {});
  await prisma.team.update({ where: { id: A.id }, data: { ultimoSuperAt: null } });
  const vb = connect(B.members[B.members.length - 1].accessCode);
  await vb.fresh('session:snapshot');
  const supB = vb.fresh('player:averia');
  const s3 = await a.send('player:super', { teamId: B.id });
  check(s3.ok, `con escudo puesto también entra (${s3.error ?? 'ok'})`);
  check((await supB).tipo === 'SUPER', 'y la avería llega igual');
  victima.s.close(); vb.s.close();

  console.log('\n5) Los tickets de una ronda de minijuego');
  await prisma.team.updateMany({ where: { id: { in: [A.id, B.id, C.id] } }, data: { tickets: 0 } });
  const l = await admin.send('admin:minijuego', { clave: 'snake' });
  const ronda = l.data?.ronda;
  check(l.ok && !!ronda, 'el panel lanza una ronda');
  await a.send('minijuego:puntaje', { ronda, puntos: 500 });
  await b.send('minijuego:puntaje', { ronda, puntos: 300 });
  await c.send('minijuego:puntaje', { ronda, puntos: 0 });
  const fin = await admin.send('admin:minijuego', { clave: null });
  check(fin.ok && fin.data?.premiados === 2, `al cerrarla se premia a 2 equipos (${fin.data?.premiados})`);
  const [ta, tb2, tc] = await Promise.all([A, B, C].map((t) => prisma.team.findUniqueOrThrow({ where: { id: t.id } })));
  check(ta.tickets === 6, `1.º ${A.name}: 6 (${ta.tickets})`);
  check(tb2.tickets === 4, `2.º ${B.name}: 4 (${tb2.tickets})`);
  check(tc.tickets === 0, `${C.name} jugó a cero: nada (${tc.tickets})`);
  const libre = await a.send('minijuego:puntaje', { ronda: 'libre:snake', puntos: 900 });
  const ta2 = await prisma.team.findUniqueOrThrow({ where: { id: A.id } });
  check(libre.ok && ta2.tickets === 6, 'la sala de espera no da tickets');
} finally {
  for (const o of originales) await prisma.team.update({ where: { id: o.id }, data: o.data as any });
  if (faseC && faseCAntes) await prisma.teamPhaseProgress.update({ where: { id: faseC.id }, data: faseCAntes });
  await prisma.eventLog.deleteMany({ where: { createdAt: { gte: desde }, type: { in: ['TICKETS', 'TICKETS_AJUSTE', 'ESCUDO', 'ATAQUE', 'MINIJUEGO'] } } });
  for (const x of [admin, a, b, c]) x.s.close();
  await prisma.$disconnect();
}

console.log(fallos ? `\n✘ ${fallos} fallo(s)` : '\n✔ todo en orden');
process.exit(fallos ? 1 : 0);
