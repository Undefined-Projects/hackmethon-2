// Prueba de humo de las reglas del ataque y de la espera ajustable.
// Requiere el server levantado y el evento EN JUEGO (RUNNING).
//
// Deja todo como lo encontró: la espera configurada, el último ataque de
// ALFA y las filas de la bitácora que crea.
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
  const resync = () => new Promise<any>((r) => s.emit('session:resync', {}, r));
  return { s, fresh, send, resync };
}

const evento = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
if (evento.status !== 'RUNNING' || evento.pausedAt) {
  console.log('El evento no está en juego: esta prueba necesita poder atacar. No se toca nada.');
  process.exit(1);
}
const [alfa, bravo, charlie] = await Promise.all(
  ['ALFA', 'BRAVO', 'CHARLIE'].map((n) => prisma.team.findUniqueOrThrow({ where: { name: n } })));
const desde = new Date();

const admin = connect(ADMIN);
const jugador = connect('ALFA-1');

try {
  await Promise.all([admin.fresh('session:snapshot'), jugador.fresh('session:snapshot')]);

  console.log('\n1) La espera se ajusta desde el panel');
  const r1 = await admin.send('admin:ataque:enfriamiento', { segundos: 20 });
  check(r1.ok && r1.data?.enfriamientoAtaqueMs === 20_000, `el panel la pone en 20 s (${r1.error ?? 'ok'})`);
  const sa = await admin.resync();
  check(sa.event.enfriamientoAtaqueMs === 20_000, 'y el panel la ve en su snapshot');
  for (const [txt, v] of [['menos de 5 s', 2], ['más de 30 min', 5000], ['algo que no es un número', 'mucho']] as const) {
    const r = await admin.send('admin:ataque:enfriamiento', { segundos: v });
    check(!r.ok && r.error === 'ENFRIAMIENTO_FUERA_DE_RANGO', `rechaza ${txt} (${r.error})`);
  }
  const rj = await jugador.send('admin:ataque:enfriamiento', { segundos: 5 });
  check(!rj.ok && rj.error === 'NOT_ALLOWED', `un jugador no la puede tocar (${rj.error})`);

  console.log('\n2) La espera manda');
  const a1 = await jugador.send('player:ataque', { teamId: bravo.id });
  check(a1.ok && a1.data?.esperaMs === 20_000, `ALFA ataca a BRAVO y le toca esperar 20 s (${a1.error ?? a1.data?.esperaMs})`);
  const a2 = await jugador.send('player:ataque', { teamId: charlie.id });
  check(!a2.ok && a2.error === 'ENFRIANDO', `y no puede atacar a nadie más mientras enfría (${a2.error})`);

  console.log('\n3) Cambiarla alcanza a quien ya espera');
  const llega = jugador.fresh('session:snapshot');
  await admin.send('admin:ataque:enfriamiento', { segundos: 5 });
  const sj = await llega.catch(() => null);
  check(!!sj && sj.ataque.esperaMs <= 5_000, `al bajarla a 5 s, el reloj de ALFA se recalcula solo (${sj?.ataque.esperaMs} ms)`);
  await wait(5300);

  console.log('\n4) Nunca dos seguidas al mismo equipo');
  const a3 = await jugador.send('player:ataque', { teamId: bravo.id });
  check(!a3.ok && a3.error === 'OBJETIVO_REPETIDO', `ya sin espera, a BRAVO otra vez no (${a3.error})`);
  const a4 = await jugador.send('player:ataque', { teamId: charlie.id });
  check(a4.ok, `a otro equipo sí: ALFA ataca a CHARLIE (${a4.error ?? 'ok'})`);
  await wait(5300);
  const a5 = await jugador.send('player:ataque', { teamId: bravo.id });
  check(a5.ok, `y después de atacar a otro, ya puede volver a por BRAVO (${a5.error ?? 'ok'})`);
  const ra = await jugador.send('player:ataque', { teamId: alfa.id });
  check(!ra.ok && ['A_TI_NO', 'ENFRIANDO'].includes(ra.error), `a su propio equipo nunca (${ra.error})`);
} finally {
  // Dejarlo todo como estaba. La espera, por el panel: así los paneles
  // abiertos la ven volver; y por la base, por si el socket ya cayó.
  await admin.send('admin:ataque:enfriamiento', { segundos: evento.enfriamientoAtaqueMs / 1000 });
  await prisma.eventState.update({ where: { id: 'singleton' }, data: { enfriamientoAtaqueMs: evento.enfriamientoAtaqueMs } });
  await prisma.team.update({
    where: { id: alfa.id },
    data: { ultimoAtaqueAt: alfa.ultimoAtaqueAt, ultimoObjetivoId: alfa.ultimoObjetivoId, ultimoAtaquePausaMs: alfa.ultimoAtaquePausaMs },
  });
  await prisma.eventLog.deleteMany({
    where: { createdAt: { gte: desde }, type: { in: ['ATAQUE', 'ATAQUE_ENFRIAMIENTO'] } },
  });
  admin.s.close(); jugador.s.close();
  await prisma.$disconnect();
}

console.log(fallos ? `\n✘ ${fallos} fallos` : '\n✔ todo bien');
process.exit(fallos ? 1 : 0);
