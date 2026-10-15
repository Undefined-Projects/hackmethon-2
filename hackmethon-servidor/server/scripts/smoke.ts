// Prueba de humo del Paso 2. Ejecuta: npm run smoke (con el server levantado).
import { io, type Socket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

const URL = process.env.SMOKE_URL ?? 'http://localhost:4000';
const prisma = new PrismaClient();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
const check = (ok: boolean, txt: string) => {
  console.log(`  ${ok ? '✔' : '✘'} ${txt}`);
  if (!ok) fallos++;
};

function connect(code: string) {
  const s: Socket = io(URL, { auth: { code }, transports: ['websocket'] });
  const inbox: { ev: string; data: any }[] = [];
  s.onAny((ev, data) => inbox.push({ ev, data }));
  const nextOf = (ev: string, ms = 3000) =>
    new Promise<any>((res, rej) => {
      const hit = inbox.find((m) => m.ev === ev);
      if (hit) return res(hit.data);
      const t = setTimeout(() => rej(new Error(`timeout esperando ${ev}`)), ms);
      s.once(ev, (d: any) => { clearTimeout(t); res(d); });
    });
  // Solo eventos FUTUROS (ignora el buzón acumulado).
  const fresh = (ev: string, ms = 3000) =>
    new Promise<any>((res, rej) => {
      const t = setTimeout(() => rej(new Error(`timeout esperando ${ev}`)), ms);
      s.once(ev, (d: any) => { clearTimeout(t); res(d); });
    });
  return { s, inbox, nextOf, fresh };
}

// --- Preparación: estado limpio + abrir la Fase 1 (el panel llega en el Paso 3) ---
await prisma.teamPhaseProgress.updateMany({
  data: { status: 'PENDING', attempts: 0, unlockedAt: null, availableAt: null, enteredAt: null,
          firstMoveAt: null, solvedAt: null, pausedMs: 0, timeToSolveMs: null, activeMs: null },
});
await prisma.phase.updateMany({ data: { status: 'LOCKED', openedAt: null, closedAt: null } });
// Roles canónicos: esta prueba comprueba el reparto inicial por nombre.
for (const t of await prisma.team.findMany({ include: { members: { orderBy: { displayName: 'asc' } } } })) {
  const roles = ['DATOS', 'TERMINAL', 'PANTALLA'];
  await Promise.all(t.members.map((m, i) =>
    prisma.user.update({ where: { id: m.id }, data: { role: roles[i], previousRole: null } })));
}

const f1 = await prisma.phase.findFirstOrThrow({ where: { order: 1 } });
await prisma.phase.update({ where: { id: f1.id }, data: { status: 'ACTIVE', openedAt: new Date() } });
await prisma.teamPhaseProgress.updateMany({ where: { phaseId: f1.id }, data: { unlockedAt: new Date() } });

console.log('\n1) Autenticación');
await new Promise<void>((res) => {
  const bad = io(URL, { auth: { code: 'NO-EXISTE' }, transports: ['websocket'] });
  bad.on('connect_error', (e) => { check(e.message === 'INVALID_CODE', `código inválido rechazado (${e.message})`); bad.close(); res(); });
  bad.on('connect', () => { check(false, 'código inválido NO fue rechazado'); bad.close(); res(); });
});
await new Promise<void>((res) => {
  const bad = io(URL, { auth: {}, transports: ['websocket'] });
  const done = () => { bad.close(); res(); };
  bad.on('connect_error', (e) => { check(e.message === 'NO_CODE', `sin código rechazado (${e.message})`); done(); });
  bad.on('connect', () => { check(false, 'conexión sin código NO fue rechazada'); done(); });
});

console.log('\n2) Los tres roles de ALFA + admin');
const datos = connect('ALFA-1'), term = connect('ALFA-2'), pant = connect('ALFA-3'), admin = connect('ADMIN-2026');
const [sd, st, sp, sa] = await Promise.all([
  datos.nextOf('session:snapshot'), term.nextOf('session:snapshot'),
  pant.nextOf('session:snapshot'), admin.nextOf('session:snapshot'),
]);
check(sd.kind === 'PLAYER' && sd.me.role === 'DATOS', `ALFA-1 → ${sd.me.role}`);
check(st.me.role === 'TERMINAL', `ALFA-2 → ${st.me.role}`);
check(sp.me.role === 'PANTALLA', `ALFA-3 → ${sp.me.role}`);
// Contra lo que hay sembrado, no contra un número escrito aquí: el seed
// pasó de cuatro equipos a diez y esta prueba no tiene por qué enterarse.
const equiposSembrados = await prisma.team.count();
check(sa.kind === 'ADMIN' && sa.teams.length === equiposSembrados,
  `admin recibe snapshot con ${sa.teams?.length} equipos (sembrados ${equiposSembrados})`);
check(sd.team.members.length === 3, `equipo con ${sd.team.members.length} miembros`);
check(sd.lobby[0].canEnter === true && sd.lobby[1].canEnter === false, 'lobby: fase 1 abierta, fase 2 bloqueada');
check(sd.workspace === null, 'arranca en el lobby (workspace null)');

console.log('\n3) Presencia');
await wait(300);
const pres = sp.team.members.filter((m: any) => m.connected).length;
const presAhora = await prisma.user.count({ where: { teamId: sd.me.teamId, connected: true } });
check(presAhora === 3, `3 conectados en BD (${presAhora})`);

console.log('\n4) phase:enter es un acto de equipo');
const wsAll = Promise.all([datos.nextOf('workspace:update'), term.nextOf('workspace:update'), pant.nextOf('workspace:update')]);
const ack = await new Promise<any>((r) => datos.s.emit('phase:enter', { phaseId: sd.lobby[0].phaseId }, r));
check(ack.ok === true, 'ack ok');
const [wd, wt, wp] = await wsAll;
check(wd.role === 'DATOS' && wt.role === 'TERMINAL' && wp.role === 'PANTALLA', 'cada rol recibe SU proyección');
check(wd.phaseId === f1.id, 'los tres entran a la misma fase');

console.log('\n5) Fase bloqueada rechazada');
const ack2 = await new Promise<any>((r) => term.s.emit('phase:enter', { phaseId: sd.lobby[1].phaseId }, r));
check(ack2.ok === false && ack2.error === 'ADMIN', `rechazo con motivo (${ack2.error})`);

console.log('\n6) Reconexión: recupera el estado exacto');
term.s.close();
await wait(500);
const term2 = connect('ALFA-2');
const s2 = await term2.nextOf('session:snapshot');
check(s2.me.role === 'TERMINAL', 'mismo rol tras reconectar');
check(s2.workspace?.phaseId === f1.id, 'vuelve DENTRO de la fase, no al lobby');
const aunConectado = await prisma.user.findFirstOrThrow({ where: { accessCode: 'ALFA-2' } });
check(aunConectado.connected === true, 'no se marcó como caído (margen de gracia)');

console.log('\n7) Multi-pestaña');
const term3 = connect('ALFA-2');
await term3.nextOf('session:snapshot');
term3.s.close();
await wait(1000);
const trasCerrarPestana = await prisma.user.findFirstOrThrow({ where: { accessCode: 'ALFA-2' } });
check(trasCerrarPestana.connected === true, 'cerrar una pestaña no lo desconecta');

console.log('\n8) Caída real tras el margen de gracia (9s)...');
const presPromise = datos.fresh('presence:update', 12000);
term2.s.close();
const pu = await presPromise;
const caido = pu.members.find((m: any) => m.role === 'TERMINAL');
check(caido?.connected === false, 'el equipo recibe presence:update con TERMINAL caído');

for (const c of [datos, pant, admin]) c.s.close();
await prisma.$disconnect();
console.log(fallos === 0 ? '\n✅ Paso 2 OK\n' : `\n❌ ${fallos} fallos\n`);
process.exit(fallos === 0 ? 0 : 1);
