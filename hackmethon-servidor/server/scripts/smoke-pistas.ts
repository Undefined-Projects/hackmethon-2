// Prueba de humo de las pistas: niveles, destinos (equipos, fase, todos),
// la siguiente no enviada, la capa de cada equipo y el reinicio. Contra el
// servidor con base sembrada (¡nunca dev.db!):
//
//   DATABASE_URL=file:./prueba.db PORT=4100 npm run dev   # en otra terminal
//   SMOKE_URL=http://localhost:4100 DATABASE_URL=file:./prueba.db npm run smoke:pistas
import { io, type Socket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';
import { PISTAS } from '../src/lib/pistas-texto.js';

const URL = process.env.SMOKE_URL ?? 'http://localhost:4000';
const prisma = new PrismaClient();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
const check = (ok: boolean, txt: string) => { console.log(`  ${ok ? '✔' : '✘'} ${txt}`); if (!ok) fallos++; };

function connect(code: string) {
  const s: Socket = io(URL, { auth: { code }, transports: ['websocket'] });
  const buzon: Record<string, any[]> = {};
  s.onAny((ev, data) => (buzon[ev] ??= []).push(data));
  const fresh = (ev: string, ms = 4000) =>
    new Promise<any>((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), ms); s.once(ev, (d: any) => { clearTimeout(t); res(d); }); });
  const send = (ev: string, p: any) =>
    new Promise<any>((r) => {
      const t = setTimeout(() => r({ ok: false, error: `TIMEOUT:${ev}` }), 8000);
      s.emit(ev as any, p, (res: any) => { clearTimeout(t); r(res); });
    });
  const resync = () => new Promise<any>((res) => { s.emit('session:resync' as any, {}, res); });
  return { s, buzon, fresh, snap: () => fresh('session:snapshot'), send, resync };
}

console.log('\n1) El catálogo');
{
  const claves = Object.keys(PISTAS);
  check(claves.length === 8, `8 fases con pistas (${claves.join(', ')})`);
  const capas = Object.values(PISTAS).flatMap((f) => f.capas);
  check(capas.every((c) => ['sutil', 'normal', 'obvia'].every((n) => (c as any)[n].length === 3)), `${capas.length} capas, cada una con 3 niveles × 3 pistas`);
  const todas = capas.flatMap((c) => [...c.sutil, ...c.normal, ...c.obvia]);
  check(todas.every((t) => t.trim().length > 20 && t.length <= 230), `${todas.length} pistas, ninguna vacía ni de más de 230 caracteres`);
  check(!todas.some((t) => /vosotr|\bos\b|habéis|tenéis/i.test(t)), 'en español de México (sin «vosotros»)');
}

// Estado limpio: todas las fases abiertas y acceso libre.
await prisma.teamPhaseProgress.updateMany({ data: { status: 'PENDING', attempts: 0, stateJson: '{}', unlockedAt: null, availableAt: null, enteredAt: null, firstMoveAt: null, solvedAt: null, pausedMs: 0, timeToSolveMs: null, activeMs: null } });
await prisma.phase.updateMany({ data: { status: 'ACTIVE', openedAt: new Date(), closedAt: null } });
await prisma.eventState.update({ where: { id: 'singleton' }, data: { status: 'RUNNING', pausedAt: null, libreAcceso: true } });
await prisma.eventLog.create({ data: { type: 'GAME_RESET', message: 'smoke:pistas' } });

const fase = async (key: string) => prisma.phase.findFirstOrThrow({ where: { key } });
const equipo = async (name: string) => prisma.team.findFirstOrThrow({ where: { name } });
const [mano, nucleo] = await Promise.all([fase('fase-mano-listas'), fase('fase-4-nucleo')]);
const [alfa, bravo, charlie] = await Promise.all([equipo('ALFA'), equipo('BRAVO'), equipo('CHARLIE')]);
const meter = (teamId: string, phaseId: string, estado: object) => prisma.teamPhaseProgress.updateMany({
  where: { teamId, phaseId }, data: { status: 'IN_PROGRESS', stateJson: JSON.stringify(estado), enteredAt: new Date() },
});
await meter(alfa.id, mano.id, {});              // La Mano, capa 1
await meter(bravo.id, mano.id, { capa: 2 });    // La Mano, capa 2
await meter(charlie.id, nucleo.id, { parte: 2 }); // Núcleo guarda la capa en `parte`

const admin = connect('ADMIN-2026');
const a1 = connect('ALFA-1'), a2 = connect('ALFA-2'), a3 = connect('ALFA-3');
const b1 = connect('BRAVO-1'), c1 = connect('CHARLIE-1');
await Promise.all([admin, a1, a2, a3, b1, c1].map((c) => c.snap()));

const equipoEnPanel = async (id: string) => (await admin.resync()).teams.find((t: any) => t.id === id);

console.log('\n2) Dónde está cada equipo');
{
  const [a, b, c] = await Promise.all([equipoEnPanel(alfa.id), equipoEnPanel(bravo.id), equipoEnPanel(charlie.id)]);
  check(a.ubicacion?.phaseId === mano.id && a.ubicacion.capa === 1, 'ALFA: La Mano, capa 1');
  check(b.ubicacion?.phaseId === mano.id && b.ubicacion.capa === 2, 'BRAVO: La Mano, capa 2');
  check(c.ubicacion?.phaseId === nucleo.id && c.ubicacion.capa === 2, 'CHARLIE: Núcleo, parte 2 cuenta como capa 2');
  check(a.pistas.length === 0, 'sin pistas todavía');
}

console.log('\n3) Solo el admin manda pistas');
{
  const r = await a1.send('admin:pista', { destino: { tipo: 'todos' }, nivel: 'sutil' });
  check(r.ok === false && r.error === 'NOT_ALLOWED', `un jugador no puede (${r.error})`);
  const r2 = await admin.send('admin:pista', { destino: { tipo: 'todos' }, nivel: 'facil' });
  check(r2.ok === false && r2.error === 'NIVEL_DESCONOCIDO', `nivel inventado rechazado (${r2.error})`);
}

const capa1 = PISTAS['fase-mano-listas'].capas[0];
const capa2 = PISTAS['fase-mano-listas'].capas[1];

console.log('\n4) A un equipo: la siguiente que no tiene');
{
  const llegan = Promise.all([a1.fresh('player:consejo'), a2.fresh('player:consejo'), a3.fresh('player:consejo')]);
  b1.buzon['player:consejo'] = [];
  const r = await admin.send('admin:pista', { destino: { tipo: 'equipos', teamIds: [alfa.id] }, nivel: 'sutil' });
  const vistos = await llegan;
  check(r.ok && r.data.enviadas.length === 1 && r.data.enviadas[0].indice === 0, 'sale la pista 1 del nivel');
  check(vistos.every((v) => v.texto === capa1.sutil[0] && v.nivel === 'sutil' && v.numero === 1), 'los tres puestos ven la MISMA pista, con nivel y número');
  check(vistos[0].nombreCapa === capa1.nombre && vistos[0].capa === 1, `de su capa (${vistos[0].nombreCapa})`);
  await wait(200);
  check((b1.buzon['player:consejo'] ?? []).length === 0, 'a otro equipo no le llega');

  const indices = [];
  for (let k = 0; k < 3; k++) {
    const r2 = await admin.send('admin:pista', { destino: { tipo: 'equipos', teamIds: [alfa.id] }, nivel: 'sutil' });
    indices.push(r2.data.enviadas[0].indice);
    await wait(20);
  }
  check(indices.join(',') === '1,2,0', `luego la 2 y la 3; ya con las tres, vuelve a la más vieja (${indices.join(',')})`);
  const r3 = await admin.send('admin:pista', { destino: { tipo: 'equipos', teamIds: [alfa.id] }, nivel: 'normal' });
  check(r3.data.enviadas[0].indice === 0, 'otro nivel lleva su propia cuenta: empieza en la 1');
  const r4 = await admin.send('admin:pista', { destino: { tipo: 'equipos', teamIds: [alfa.id] }, nivel: 'obvia', indice: 2 });
  check(r4.data.enviadas[0].indice === 2, 'elegida a mano, sale esa');
  const a = await equipoEnPanel(alfa.id);
  check(a.pistas.length === 6, `el panel lleva la cuenta (${a.pistas.length} pistas)`);
}

console.log('\n5) A una fase: solo los que están en ella, cada quien en su capa');
{
  const enB = b1.fresh('player:consejo');
  c1.buzon['player:consejo'] = [];
  const r = await admin.send('admin:pista', { destino: { tipo: 'fase', phaseId: mano.id }, nivel: 'normal' });
  const nombres = r.data.enviadas.map((e: any) => e.equipo).sort().join(',');
  check(nombres === 'ALFA,BRAVO', `ALFA y BRAVO, no CHARLIE (${nombres})`);
  const vb = await enB;
  check(vb.texto === capa2.normal[0] && vb.capa === 2, 'BRAVO recibe la de la capa 2');
  check(r.data.enviadas.find((e: any) => e.equipo === 'ALFA').indice === 1, 'ALFA, que ya tenía la normal 1, recibe la 2');
  await wait(200);
  check((c1.buzon['player:consejo'] ?? []).length === 0, 'CHARLIE no recibe nada');
}

console.log('\n6) A todos');
{
  const enC = c1.fresh('player:consejo');
  const r = await admin.send('admin:pista', { destino: { tipo: 'todos' }, nivel: 'obvia', indice: 0 });
  const total = await prisma.team.count();
  check(r.ok && r.data.enviadas.length + r.data.omitidos.length === total, `todos los equipos cuentan (${r.data.enviadas.length} enviadas, ${r.data.omitidos.length} sin pista)`);
  const vc = await enC;
  check(vc.texto === PISTAS['fase-4-nucleo'].capas[1].obvia[0], 'CHARLIE recibe la de Núcleo, parte 2');
}

console.log('\n7) Fase cerrada: sin pista');
{
  await prisma.phase.update({ where: { id: nucleo.id }, data: { status: 'COMPLETED' } });
  await prisma.phase.updateMany({ where: { NOT: { id: nucleo.id } }, data: { status: 'LOCKED' } });
  const r = await admin.send('admin:pista', { destino: { tipo: 'equipos', teamIds: [charlie.id] }, nivel: 'sutil' });
  check(r.ok && r.data.enviadas.length === 0 && r.data.omitidos[0]?.motivo.includes('ninguna fase'), `se dice por qué (${r.data.omitidos[0]?.motivo})`);
}

console.log('\n8) Reiniciar el juego borra la cuenta');
{
  const r = await admin.send('admin:event:reset', {});
  check(r.ok, `reinicio (${r.error ?? 'ok'})`);
  const a = await equipoEnPanel(alfa.id);
  check(a.pistas.length === 0, 'ALFA vuelve a cero pistas');
}

for (const c of [admin, a1, a2, a3, b1, c1]) c.s.close();
await prisma.$disconnect();
console.log(fallos ? `\n❌ ${fallos} fallos` : '\n✅ Pistas OK');
process.exit(fallos ? 1 : 0);
