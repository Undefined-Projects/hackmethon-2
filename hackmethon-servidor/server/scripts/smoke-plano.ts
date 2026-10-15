// Prueba de humo del plano del auditorio. Requiere el server levantado.
// Deja el plano como lo encontró: guarda una copia al empezar y la
// repone al terminar, también si algo falla a medias.
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
  return { s, fresh, send };
}

const copia = await prisma.plano.findUnique({ where: { id: 'singleton' } });
const admin = connect(ADMIN);
const jugador = connect('ALFA-1');

try {
  console.log('\n1) El plano viaja en el snapshot del panel');
  const snap = await admin.fresh('session:snapshot');
  check(snap.kind === 'ADMIN', 'el admin recibe su panel');
  check(typeof snap.plano?.ancho === 'number' && Array.isArray(snap.plano?.elementos),
    `con el plano dentro (${snap.plano?.nombre}, ${snap.plano?.ancho}×${snap.plano?.alto} m, ${snap.plano?.elementos.length} piezas)`);

  console.log('\n2) Guardar');
  const equipo = snap.teams[0];
  const plano = {
    nombre: 'Auditorio MENLO', ancho: 32, alto: 22,
    elementos: [
      { id: 'm1', tipo: 'mesa', x: 5, y: 8, w: 1.8, h: 0.8, rot: 0, teamId: equipo.id, etiqueta: 'M1' },
      { id: 'm2', tipo: 'mesa', x: 8, y: 8, w: 1.5, h: 1.5, rot: 45, redonda: true, teamId: null },
      { id: 'e', tipo: 'escenario', x: 16, y: 2, w: 12, h: 4, rot: 0, etiqueta: 'ESCENARIO' },
    ],
  };
  const siguiente = admin.fresh('session:snapshot');
  const r = await admin.send('admin:plano:guardar', { plano });
  check(r.ok && typeof r.data?.guardadoAt === 'number', `se guarda (${r.error ?? 'ok'})`);
  const tras = await siguiente;
  check(tras.plano.ancho === 32 && tras.plano.elementos.length === 3, 'y el panel se repinta con el plano nuevo');
  check(tras.plano.elementos[0].teamId === equipo.id, `la mesa recuerda a su equipo (${equipo.name})`);
  check(tras.plano.guardadoAt === r.data.guardadoAt, 'con la fecha de guardado');

  console.log('\n3) Lo que no se acepta');
  const malo = async (txt: string, p: any) => {
    const x = await admin.send('admin:plano:guardar', { plano: p });
    check(!x.ok && /PLANO_INVALIDO/.test(x.error ?? ''), `${txt} (${x.error})`);
  };
  await malo('una pieza de tipo inventado', { ...plano, elementos: [{ ...plano.elementos[0], tipo: 'trono' }] });
  await malo('una medida que no es un número', { ...plano, ancho: 'mucho' });
  await malo('dos piezas con el mismo id', { ...plano, elementos: [plano.elementos[0], plano.elementos[0]] });
  await malo('una sala sin nombre', { ...plano, nombre: '   ' });
  await malo('cuatrocientas y una piezas', { ...plano, elementos: Array.from({ length: 401 }, (_, i) => ({ ...plano.elementos[1], id: `x${i}` })) });
  const sigue = await prisma.plano.findUnique({ where: { id: 'singleton' } });
  check(JSON.parse(sigue!.datosJson).ancho === 32, 'y nada de eso pisa el plano bueno');

  console.log('\n4) Solo el panel');
  await jugador.fresh('session:snapshot').catch(() => null);
  const j = await jugador.send('admin:plano:guardar', { plano });
  check(!j.ok && j.error === 'NOT_ALLOWED', `un jugador no puede guardar el plano (${j.error})`);
} finally {
  // Dejarlo como estaba.
  if (copia) await prisma.plano.update({ where: { id: 'singleton' }, data: { datosJson: copia.datosJson } });
  else await prisma.plano.deleteMany({ where: { id: 'singleton' } });
  admin.s.close(); jugador.s.close();
  await prisma.$disconnect();
}

console.log(fallos ? `\n✘ ${fallos} fallos` : '\n✔ todo bien');
process.exit(fallos ? 1 : 0);
