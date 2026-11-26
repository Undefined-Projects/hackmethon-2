// Prueba de humo de `limpiar terminal`: el comando que vale en todas las
// fases y bonus, y que borra lo que ve Pantalla. Contra el servidor, con
// base sembrada (¡nunca dev.db!):
//
//   DATABASE_URL=file:./prueba.db PORT=4100 npm run dev   # en otra terminal
//   SMOKE_URL=http://localhost:4100 DATABASE_URL=file:./prueba.db npm run smoke:limpiar
import { io, type Socket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

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

// Estado limpio y acceso libre: se prueba cada fase suelta.
await prisma.teamPhaseProgress.updateMany({ data: { status: 'PENDING', attempts: 0, stateJson: '{}', unlockedAt: null, availableAt: null, enteredAt: null, firstMoveAt: null, solvedAt: null, pausedMs: 0, timeToSolveMs: null, activeMs: null } });
await prisma.phase.updateMany({ data: { status: 'LOCKED', openedAt: null, closedAt: null } });
await prisma.commandLog.deleteMany({});
await prisma.eventState.update({ where: { id: 'singleton' }, data: { status: 'LOBBY', pausedAt: null, totalPausedMs: 0, startedAt: null, focusPhaseId: null, libreAcceso: true } });
const alfa = await prisma.team.findFirstOrThrow({ where: { name: 'ALFA' }, include: { members: { orderBy: { displayName: 'asc' } } } });
const ROLES = ['DATOS', 'TERMINAL', 'PANTALLA'];
await Promise.all(alfa.members.map((m, i) => prisma.user.update({ where: { id: m.id }, data: { role: ROLES[i], previousRole: null } })));

const admin = connect('ADMIN-2026');
const datos = connect('ALFA-1'), term = connect('ALFA-2'), pant = connect('ALFA-3');
const [sa] = await Promise.all([admin.snap(), datos.snap(), term.snap(), pant.snap()]);

// Todas las del recorrido y los bonus, menos la que solo abre el panel.
const fases = (sa.phases as any[]).filter((f) => f.key !== 'fase-bonus-espesura');
const salidasDePantalla = async () => (await pant.resync()).workspace?.payload?.salidas ?? null;

for (const fase of fases) {
  console.log(`\n${fase.title}`);
  // La fase anterior queda resuelta a mano para que ALFA no siga dentro.
  await prisma.teamPhaseProgress.updateMany({ where: { teamId: alfa.id, status: 'IN_PROGRESS' }, data: { status: 'SOLVED', solvedAt: new Date() } });
  await admin.send('admin:phase:open', { phaseId: fase.id });
  await wait(200);
  const entrar = await datos.send('phase:enter', { phaseId: fase.id });
  check(entrar.ok === true, `ALFA entra (${entrar.error ?? 'ok'})`);
  await wait(300);

  const ayudaEnPantalla = pant.fresh('pantalla:output');
  await term.send('terminal:command', { texto: 'ayuda' });
  const ayuda = await ayudaEnPantalla;
  check(JSON.stringify(ayuda.bloques).includes('limpiar terminal'), 'la ayuda anuncia «limpiar terminal»');
  check(((await salidasDePantalla()) ?? []).length === 1, 'Pantalla tiene una salida antes de limpiar');

  const antes = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { teamId: alfa.id, phaseId: fase.id } });
  const limpiarEnPantalla = pant.fresh('pantalla:output');
  datos.buzon['pantalla:output'] = [];
  const r = await term.send('terminal:command', { texto: '  Limpiar   TERMINAL ' });
  const limpia = await limpiarEnPantalla;
  check(r.ok === true && r.data?.valido === true, 'Terminal recibe acuse válido');
  check(limpia.limpiar === true && limpia.bloques.length === 0, 'Pantalla recibe la orden de limpiar');
  await wait(200);
  check((datos.buzon['pantalla:output'] ?? []).length === 0, 'Datos no recibe nada');
  const despues = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { teamId: alfa.id, phaseId: fase.id } });
  check(despues.attempts === antes.attempts && despues.stateJson === antes.stateJson, 'no gasta intento ni toca el estado de la fase');
  check(((await salidasDePantalla()) ?? [-1]).length === 0, 'al recargar, Pantalla sigue limpia');

  await term.send('terminal:command', { texto: 'ayuda' });
  await wait(200);
  check(((await salidasDePantalla()) ?? []).length === 1, 'lo nuevo vuelve a aparecer después de limpiar');
}

for (const c of [admin, datos, term, pant]) c.s.close();
await prisma.$disconnect();
console.log(fallos ? `\n❌ ${fallos} fallos` : '\n✅ limpiar terminal OK en todas las fases');
process.exit(fallos ? 1 : 0);
