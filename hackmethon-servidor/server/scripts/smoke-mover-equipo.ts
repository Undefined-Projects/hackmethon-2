// Prueba de humo: cambiar a alguien de equipo desde el panel.
// Requiere el server levantado (SMOKE_URL) contra una base de PRUEBA:
// reescribe los roles de BIZNAGA y CHISPA y mueve gente entre ellos.
import { io, type Socket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

const URL = process.env.SMOKE_URL ?? 'http://localhost:4000';
const prisma = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, txt: string) => { console.log(`  ${ok ? '✔' : '✘'} ${txt}`); if (!ok) fallos++; };

function connect(code: string) {
  const s: Socket = io(URL, { auth: { code }, transports: ['websocket'] });
  const fresh = (ev: string, ms = 5000) =>
    new Promise<any>((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), ms); s.once(ev, (d: any) => { clearTimeout(t); res(d); }); });
  const send = (ev: string, p: any) =>
    new Promise<any>((r) => {
      const t = setTimeout(() => r({ ok: false, error: `TIMEOUT:${ev}` }), 8000);
      s.emit(ev as any, p, (res: any) => { clearTimeout(t); r(res); });
    });
  // Lo que hace el cliente de verdad al recibir el aviso.
  s.on('session:reconectar', () => { s.disconnect(); s.connect(); });
  return { s, fresh, snap: () => fresh('session:snapshot'), send };
}

// Estado conocido: una TERMINAL por equipo, nombres con su prefijo.
const ROLES5 = ['DATOS', 'TERMINAL', 'PANTALLA', 'DATOS', 'PANTALLA'];
for (const nombre of ['BIZNAGA', 'CHISPA']) {
  const team = await prisma.team.findUniqueOrThrow({ where: { name: nombre } });
  for (let i = 1; i <= 5; i++) {
    await prisma.user.updateMany({
      where: { accessCode: `${nombre}-${i}` },
      data: { teamId: team.id, role: ROLES5[i - 1], displayName: `${nombre} · Jugador ${i}`, vecesTerminal: 0 },
    });
  }
}
const biznaga = await prisma.team.findUniqueOrThrow({ where: { name: 'BIZNAGA' } });
const chispa = await prisma.team.findUniqueOrThrow({ where: { name: 'CHISPA' } });
const terminalesDe = async (teamId: string) => prisma.user.count({ where: { teamId, role: 'TERMINAL' } });

const admin = connect('ADMIN-2026');
const p3 = connect('BIZNAGA-3');
const p2 = connect('BIZNAGA-2');
await Promise.all([admin.snap(), p3.snap(), p2.snap()]);

console.log('\n1) Guardia');
{
  const u = await prisma.user.findUniqueOrThrow({ where: { accessCode: 'BIZNAGA-3' } });
  const r = await p3.send('admin:jugador:equipo', { userId: u.id, teamId: chispa.id });
  check(r.ok === false && r.error === 'NOT_ALLOWED', `un jugador no puede moverse solo (${r.error})`);
}

console.log('\n2) Mover a PANTALLA conectada');
{
  const u = await prisma.user.findUniqueOrThrow({ where: { accessCode: 'BIZNAGA-3' } });
  const aviso = p3.fresh('session:reconectar');
  // El snapshot de la reconexión llega ANTES que el ack: se escucha ya.
  const tras = aviso.then(() => p3.snap());
  const r = await admin.send('admin:jugador:equipo', { userId: u.id, teamId: chispa.id });
  check(r.ok && r.data?.equipo === 'CHISPA', `ack ok → ${r.data?.equipo}`);
  check(r.data?.rol === 'PANTALLA', `conserva su puesto, CHISPA ya tiene terminal (${r.data?.rol})`);
  await aviso;
  check(true, 'le llega session:reconectar');
  const snap = await tras;
  check(snap.team?.id === chispa.id, `al reconectar, su snapshot es de CHISPA (${snap.team?.name})`);
  check(snap.me?.displayName === 'CHISPA · Jugador 3', `nombre con el prefijo nuevo (${snap.me?.displayName})`);
  check(snap.team.members.some((m: any) => m.id === u.id), 'aparece entre los miembros de CHISPA');
}

console.log('\n3) Mover a la TERMINAL');
{
  const u = await prisma.user.findUniqueOrThrow({ where: { accessCode: 'BIZNAGA-2' } });
  const aviso = p2.fresh('session:reconectar');
  const tras = aviso.then(() => p2.snap());
  const r = await admin.send('admin:jugador:equipo', { userId: u.id, teamId: chispa.id });
  await aviso;
  check(r.ok && r.data?.rol !== 'TERMINAL', `en CHISPA no toma la terminal (${r.data?.rol})`);
  check(await terminalesDe(chispa.id) === 1, 'CHISPA sigue con UNA terminal');
  check(await terminalesDe(biznaga.id) === 1, 'BIZNAGA heredó la terminal en otra persona');
  const snap = await tras;
  check(snap.team?.id === chispa.id && snap.me.role === r.data?.rol, 'su pantalla llega con el rol nuevo');
}

console.log('\n4) Errores');
{
  const u = await prisma.user.findUniqueOrThrow({ where: { accessCode: 'BIZNAGA-1' } });
  const r = await admin.send('admin:jugador:equipo', { userId: u.id, teamId: 'no-existe' });
  check(r.ok === false && r.error === 'EQUIPO_DESCONOCIDO', `equipo inexistente → ${r.error}`);
  const mismo = await admin.send('admin:jugador:equipo', { userId: u.id, teamId: biznaga.id });
  check(mismo.ok && mismo.data?.equipo === 'BIZNAGA', 'al mismo equipo no hace nada');
}

for (const c of [admin, p3, p2]) c.s.close();
await prisma.$disconnect();
console.log(fallos ? `\n✘ ${fallos} fallo(s)` : '\n✔ todo bien');
process.exit(fallos ? 1 : 0);
