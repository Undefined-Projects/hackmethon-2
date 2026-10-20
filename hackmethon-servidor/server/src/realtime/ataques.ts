// ============================================================
//  Ataques entre equipos.
//
//  Lo único que un equipo puede hacerle a otro. El daño es el mismo que
//  ya provoca el panel —la avería de cada puesto— y eso es deliberado:
//  está probado, dura poco y estorba sin impedir. Un ataque que quitara
//  tiempo del marcador convertiría el evento en una guerra de todos
//  contra todos en vez de en una carrera.
//
//  Tres reglas, y las tres se comprueban AQUÍ y no en el desplegable:
//  un jugador con la consola del navegador abierta puede emitir lo que
//  quiera.
//
//   1. Un ataque por equipo y por enfriamiento (un minuto de serie; el
//      panel lo ajusta). Del EQUIPO, no de la persona:
//      los tres puestos comparten el mismo botón. Es la misma regla que
//      gobierna el resto del juego —nadie resuelve una fase solo—
//      aplicada a lo único que aquí se le puede hacer a un rival, y
//      obliga a los tres a ponerse de acuerdo en a quién.
//   2. No dos veces seguidas al mismo. Sin esto, diez equipos se
//      convierten en diez contra el que va ganando.
//   3. Solo con el evento EN JUEGO. En pausa el enfriamiento tampoco
//      corre, así que una parada no le regala el ataque a nadie.
//
//  La INTENSIDAD sale de la distancia en fases: atacar a quien va por
//  delante pega más fuerte, y a quien va por detrás, más flojo. Es lo
//  que le da al último una forma de alcanzar al primero.
//
//  Con tickets se compran dos cosas más (ver tickets.ts):
//   - El ESCUDO: los ataques normales rebotan mientras dura. El atacante
//     gasta igual su enfriamiento; si no, el escudo no se notaría.
//   - El SÚPER ATAQUE: la avería de Pantalla para todo el equipo rival,
//     a pantalla completa, sin poder tocar nada. Atraviesa el escudo y
//     tiene su propia espera, aparte de la del ataque normal.
// ============================================================

import { prisma } from '../lib/prisma.js';
import { esperaDeAtaqueMs, restanteSinPausaMs } from '../lib/timing.js';
import { DURACION_AVERIA, registrarAveria } from '../lib/averias.js';
import {
  DURACION_ESCUDO_MS, DURACION_SUPER_MS, ENFRIAMIENTO_SUPER_MS, PRECIO_ESCUDO, PRECIO_SUPER,
  VIDA_LINEA_ATAQUE_MS, intensidadAtaque, type Role,
} from '../lib/constants.js';
import { cobrarTickets, fasesSuperadas, reembolsarTickets } from './tickets.js';
import { pushAdminState } from './admin.js';
import type { AtaqueReciente } from '../lib/events.js';
import { teamRoom, userRoom } from './rooms.js';
import { getIO, pushSnapshotToUser } from './server.js';
import { dispararLuces } from './luces.js';

export async function atacarEquipo(atacanteId: string, objetivoTeamId: string) {
  const yo = await prisma.user.findUniqueOrThrow({
    where: { id: atacanteId },
    include: { team: { include: { members: { select: { id: true } } } } },
  });
  if (yo.isAdmin || !yo.team) throw new Error('NO_TEAM');
  if (!objetivoTeamId || objetivoTeamId === yo.team.id) throw new Error('A_TI_NO');

  const event = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
  if (event.status !== 'RUNNING') throw new Error('EVENTO_NO_EN_JUEGO');

  const objetivo = await prisma.team.findUnique({
    where: { id: objetivoTeamId },
    include: { members: true },
  });
  if (!objetivo) throw new Error('EQUIPO_DESCONOCIDO');

  if (yo.team.ultimoObjetivoId === objetivoTeamId) throw new Error('OBJETIVO_REPETIDO');

  const espera = esperaDeAtaqueMs(yo.team, event);
  if (espera > 0) throw new Error('ENFRIANDO');

  const fases = await fasesSuperadas();
  const intensidad = intensidadAtaque(fases.get(yo.team.id) ?? 0, fases.get(objetivo.id) ?? 0);
  const bloqueado = escudoRestanteMs(objetivo, event) > 0;

  // Se sella ANTES de disparar. Si se hiciera al revés, dos pulsaciones
  // en el mismo instante —los tres puestos tienen el mismo botón— se
  // colarían las dos por el hueco entre el envío y el registro.
  await prisma.team.update({
    where: { id: yo.team.id },
    data: {
      ultimoAtaqueAt: new Date(),
      ultimoObjetivoId: objetivoTeamId,
      ultimoAtaquePausaMs: event.totalPausedMs,
    },
  });

  // A cada uno la avería de SU puesto, escalada por la distancia en
  // fases, y con remite: saber quién te lo ha hecho es la mitad de la
  // gracia, y la otra mitad es devolvérselo.
  const io = getIO();
  if (bloqueado) {
    io.to(teamRoom(objetivo.id)).emit('ataque:bloqueado', { de: yo.team.name });
  } else {
    for (const m of objetivo.members) {
      if (m.isAdmin) continue;
      const tipo = m.role as Role;
      // Anotada en el servidor: recargar la página no la quita.
      const averia = registrarAveria(m.id, tipo, yo.team.name, DURACION_AVERIA[tipo] * intensidad);
      if (averia) io.to(userRoom(m.id)).emit('player:averia', averia);
    }
  }

  const log = await prisma.eventLog.create({
    data: {
      type: 'ATAQUE',
      message: bloqueado
        ? `${yo.team.name} atacó a ${objetivo.name} · rebotó en su escudo`
        : `${yo.team.name} atacó a ${objetivo.name} · intensidad ×${intensidad.toFixed(2)}`,
      teamId: yo.team.id,
      userId: atacanteId,
      dataJson: JSON.stringify({ objetivo: objetivo.id, puestos: objetivo.members.length, intensidad, bloqueado }),
    },
  });

  // La línea del mapa, a toda la sala: jugadores y panel. Sale de la
  // misma fila de la bitácora que leen los snapshots, así que quien
  // reconecte ve la misma línea con el mismo id y no la pinta dos veces.
  io.emit('ataque:lanzado', {
    id: log.id, de: yo.team.id, a: objetivo.id, at: log.createdAt.getTime(),
    ...(bloqueado ? { bloqueado: true } : {}),
  });

  // Los tres del equipo atacante tienen que ver arrancar el
  // enfriamiento, no solo quien pulsó.
  await Promise.all(yo.team.members.map((m) => pushSnapshotToUser(m.id)));

  // La luz va con el equipo que ATACA: es quien hizo la acción, y es a
  // quien tiene sentido acotar una regla.
  dispararLuces('ATAQUE', { teamId: yo.team.id });

  return { esperaMs: event.enfriamientoAtaqueMs, objetivo: objetivo.name, intensidad, bloqueado };
}

/** Lo que le queda de escudo a un equipo. Se congela en pausa, igual
 *  que el enfriamiento: una parada no le gasta el escudo a nadie. */
export const escudoRestanteMs = (
  equipo: { escudoAt: Date | null; escudoPausaMs: number },
  event: { pausedAt: Date | null; totalPausedMs: number },
  now = Date.now(),
) => restanteSinPausaMs(equipo.escudoAt, equipo.escudoPausaMs, DURACION_ESCUDO_MS, event, now);

export const superEsperaMs = (
  equipo: { ultimoSuperAt: Date | null; ultimoSuperPausaMs: number },
  event: { pausedAt: Date | null; totalPausedMs: number },
  now = Date.now(),
) => restanteSinPausaMs(equipo.ultimoSuperAt, equipo.ultimoSuperPausaMs, ENFRIAMIENTO_SUPER_MS, event, now);

/** Lo comprueban el escudo y el súper ataque antes de cobrar nada. */
async function equipoDe(userId: string) {
  const yo = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { team: { include: { members: { select: { id: true } } } } },
  });
  if (yo.isAdmin || !yo.team) throw new Error('NO_TEAM');
  const event = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
  if (event.status !== 'RUNNING') throw new Error('EVENTO_NO_EN_JUEGO');
  return { yo, team: yo.team, event };
}

/**
 * Compra un escudo. No se acumula: con uno puesto se rechaza, porque
 * apilar escudos sería comprarse la inmunidad para toda la tarde.
 */
export async function activarEscudo(userId: string) {
  const { yo, team, event } = await equipoDe(userId);
  if (escudoRestanteMs(team, event) > 0) throw new Error('ESCUDO_ACTIVO');

  const saldo = await cobrarTickets(team.id, PRECIO_ESCUDO, 'Escudo');
  // Condicionado a que siga sin escudo: si dos puestos compran a la vez,
  // el segundo cobra, no sella, y se le devuelve.
  const ahora = new Date();
  const r = await prisma.team.updateMany({
    where: { id: team.id, escudoAt: team.escudoAt },
    data: { escudoAt: ahora, escudoPausaMs: event.totalPausedMs },
  });
  if (r.count === 0) {
    await reembolsarTickets(team.id, PRECIO_ESCUDO, 'Escudo duplicado · devuelto');
    throw new Error('ESCUDO_ACTIVO');
  }

  await prisma.eventLog.create({
    data: { type: 'ESCUDO', message: `${team.name} activó su escudo`, teamId: team.id, userId: yo.id },
  });
  await Promise.all(team.members.map((m) => pushSnapshotToUser(m.id)));
  await pushAdminState();
  dispararLuces('ESCUDO', { teamId: team.id });
  return { escudoMs: DURACION_ESCUDO_MS, saldo };
}

/**
 * El súper ataque: a todos los del equipo rival, la avería de Pantalla a
 * pantalla completa, durante `DURACION_SUPER_MS`, sin poder tocar nada.
 * No le importa el escudo, ni la distancia en fases, ni la regla de no
 * repetir objetivo: para eso se paga.
 */
export async function lanzarSuperAtaque(userId: string, objetivoTeamId: string) {
  const { yo, team, event } = await equipoDe(userId);
  if (!objetivoTeamId || objetivoTeamId === team.id) throw new Error('A_TI_NO');
  const objetivo = await prisma.team.findUnique({ where: { id: objetivoTeamId }, include: { members: true } });
  if (!objetivo) throw new Error('EQUIPO_DESCONOCIDO');
  if (superEsperaMs(team, event) > 0) throw new Error('SUPER_ENFRIANDO');

  const saldo = await cobrarTickets(team.id, PRECIO_SUPER, `Súper ataque a ${objetivo.name}`);
  // Sellado condicionado, por el mismo motivo que el escudo.
  const r = await prisma.team.updateMany({
    where: { id: team.id, ultimoSuperAt: team.ultimoSuperAt },
    data: { ultimoSuperAt: new Date(), ultimoSuperPausaMs: event.totalPausedMs },
  });
  if (r.count === 0) {
    await reembolsarTickets(team.id, PRECIO_SUPER, 'Súper ataque duplicado · devuelto');
    throw new Error('SUPER_ENFRIANDO');
  }

  const io = getIO();
  for (const m of objetivo.members) {
    if (m.isAdmin) continue;
    const averia = registrarAveria(m.id, 'SUPER', team.name, DURACION_SUPER_MS);
    if (averia) io.to(userRoom(m.id)).emit('player:averia', averia);
  }

  const log = await prisma.eventLog.create({
    data: {
      type: 'ATAQUE',
      message: `${team.name} lanzó un SÚPER ATAQUE a ${objetivo.name}`,
      teamId: team.id,
      userId: yo.id,
      dataJson: JSON.stringify({ objetivo: objetivo.id, puestos: objetivo.members.length, super: true }),
    },
  });
  io.emit('ataque:lanzado', { id: log.id, de: team.id, a: objetivo.id, at: log.createdAt.getTime(), super: true });

  await Promise.all(team.members.map((m) => pushSnapshotToUser(m.id)));
  dispararLuces('SUPER_ATAQUE', { teamId: team.id });
  return { objetivo: objetivo.name, saldo };
}

/**
 * Los ataques del último minuto, para las líneas del mapa. Salen de la
 * bitácora: no hace falta guardarlos aparte, y así el reinicio del juego
 * —que la deja como estaba— no deja líneas colgando de otra partida.
 */
export async function ataquesRecientes(): Promise<AtaqueReciente[]> {
  const filas = await prisma.eventLog.findMany({
    where: { type: 'ATAQUE', createdAt: { gte: new Date(Date.now() - VIDA_LINEA_ATAQUE_MS) } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, teamId: true, dataJson: true, createdAt: true },
  });
  return filas.flatMap((f) => {
    try {
      const d = JSON.parse(f.dataJson);
      const a = d.objetivo;
      return f.teamId && typeof a === 'string'
        ? [{
            id: f.id, de: f.teamId, a, at: f.createdAt.getTime(),
            ...(d.super ? { super: true } : {}), ...(d.bloqueado ? { bloqueado: true } : {}),
          }]
        : [];
    } catch {
      return [];
    }
  });
}
