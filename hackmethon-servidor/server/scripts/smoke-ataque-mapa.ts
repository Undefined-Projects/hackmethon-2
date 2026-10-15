// Prueba de humo del mapa de ataque. Requiere el server levantado y el
// evento EN JUEGO (RUNNING), que es cuando se puede atacar.
//
// Deja todo como lo encontró: el plano, el enfriamiento del equipo que
// ataca y la fila de la bitácora del ataque de prueba (si no, su línea
// seguiría un minuto en el mapa de todos).
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

const evento = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
if (evento.status !== 'RUNNING' || evento.pausedAt) {
  console.log('El evento no está en juego: esta prueba necesita poder atacar. No se toca nada.');
  process.exit(1);
}
const [alfa, bravo] = await Promise.all(['ALFA', 'BRAVO'].map((n) => prisma.team.findUniqueOrThrow({ where: { name: n } })));
const copiaPlano = await prisma.plano.findUnique({ where: { id: 'singleton' } });
let logId: string | null = null;

const admin = connect(ADMIN);
const atacante = connect('ALFA-1');
const atacado = connect('BRAVO-1');
const tercero = connect('CHARLIE-1');

try {
  await Promise.all([admin, atacante, atacado, tercero].map((c) => c.fresh('session:snapshot')));

  console.log('\n1) El plano llega al jugador');
  const plano = {
    nombre: 'Auditorio MENLO', ancho: 20, alto: 12,
    elementos: [
      { id: 'mA', tipo: 'mesa', x: 4, y: 6, w: 1.8, h: 0.8, rot: 0, teamId: alfa.id, etiqueta: 'M1' },
      { id: 'mB', tipo: 'mesa', x: 12, y: 6, w: 1.8, h: 0.8, rot: 0, teamId: bravo.id, etiqueta: 'M2' },
    ],
  };
  const tras = atacante.fresh('session:snapshot', 6000);
  const g = await admin.send('admin:plano:guardar', { plano });
  check(g.ok, `el panel guarda un plano con las mesas de ALFA y BRAVO (${g.error ?? 'ok'})`);
  // Guardar le reenvía el snapshot a cada jugador conectado: el mapa de
  // ataque es este mismo plano y no puede esperar a otro repintado.
  const snapJ: any = await tras.catch(() => null);
  check(snapJ?.ataque?.plano?.elementos?.length === 2, 'y al jugador le llega solo, en su snapshot, dentro de `ataque`');
  check(Array.isArray(snapJ?.ataque?.recientes), `con los ataques recientes (${snapJ?.ataque?.recientes?.length ?? '¿?'})`);

  console.log('\n2) Un ataque se anuncia a toda la sala');
  const llegaAtacado = atacado.fresh('ataque:lanzado');
  const llegaTercero = tercero.fresh('ataque:lanzado');
  const llegaPanel = admin.fresh('ataque:lanzado');
  const r = await atacante.send('player:ataque', { teamId: bravo.id });
  check(r.ok, `ALFA ataca a BRAVO (${r.error ?? 'ok'})`);
  const [a1, a2, a3] = await Promise.all([llegaAtacado, llegaTercero, llegaPanel].map((p) => p.catch(() => null)));
  logId = a1?.id ?? null;
  check(a1?.de === alfa.id && a1?.a === bravo.id, 'le llega al atacado, con quién y a quién');
  check(a2?.id === a1?.id, 'y a un tercero que no tiene nada que ver: los ataques son públicos');
  check(a3?.id === a1?.id, 'y al panel, para las líneas del proyector');
  check(typeof a1?.at === 'number' && Math.abs(a1.at - Date.now()) < 10_000, 'con la hora del servidor');

  console.log('\n3) Quien llega tarde ve la misma línea');
  const tarde = connect('DELTA-1');
  const snapT = await tarde.fresh('session:snapshot');
  const visto = snapT.ataque.recientes.find((x: any) => x.id === a1?.id);
  check(!!visto && visto.de === alfa.id && visto.a === bravo.id, 'el snapshot de quien conecta después la trae, con el mismo id');
  const snapA: any = await new Promise((rr) => admin.s.emit('session:resync', {}, rr));
  check(snapA?.ataques?.some((x: any) => x.id === a1?.id), 'y el del panel también');
  tarde.s.close();
} finally {
  // Dejarlo todo como estaba.
  if (logId) await prisma.eventLog.deleteMany({ where: { id: logId } });
  await prisma.team.update({
    where: { id: alfa.id },
    data: { ultimoAtaqueAt: alfa.ultimoAtaqueAt, ultimoObjetivoId: alfa.ultimoObjetivoId, ultimoAtaquePausaMs: alfa.ultimoAtaquePausaMs },
  });
  if (copiaPlano) await prisma.plano.update({ where: { id: 'singleton' }, data: { datosJson: copiaPlano.datosJson } });
  else await prisma.plano.deleteMany({ where: { id: 'singleton' } });
  for (const c of [admin, atacante, atacado, tercero]) c.s.close();
  await prisma.$disconnect();
}

console.log(fallos ? `\n✘ ${fallos} fallos` : '\n✔ todo bien');
process.exit(fallos ? 1 : 0);
