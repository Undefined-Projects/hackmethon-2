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
// ============================================================

import { prisma } from '../lib/prisma.js';
import { registrarAveria } from '../lib/averias.js';
import { esperaDeAtaqueMs } from '../lib/timing.js';
import { VIDA_LINEA_ATAQUE_MS, type Role } from '../lib/constants.js';
import type { AtaqueReciente } from '../lib/events.js';
import { userRoom } from './rooms.js';
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

  // A cada uno la avería de SU puesto, y con remite: saber quién te lo
  // ha hecho es la mitad de la gracia, y la otra mitad es devolvérselo.
  const io = getIO();
  for (const m of objetivo.members) {
    if (m.isAdmin) continue;
    const tipo = m.role as Role;
    // Anotada en el servidor: recargar la página no la quita.
    io.to(userRoom(m.id)).emit('player:averia', registrarAveria(m.id, tipo, yo.team.name));
  }

  const log = await prisma.eventLog.create({
    data: {
      type: 'ATAQUE',
      message: `${yo.team.name} atacó a ${objetivo.name}`,
      teamId: yo.team.id,
      userId: atacanteId,
      dataJson: JSON.stringify({ objetivo: objetivo.id, puestos: objetivo.members.length }),
    },
  });

  // La línea del mapa, a toda la sala: jugadores y panel. Sale de la
  // misma fila de la bitácora que leen los snapshots, así que quien
  // reconecte ve la misma línea con el mismo id y no la pinta dos veces.
  io.emit('ataque:lanzado', { id: log.id, de: yo.team.id, a: objetivo.id, at: log.createdAt.getTime() });

  // Los tres del equipo atacante tienen que ver arrancar el
  // enfriamiento, no solo quien pulsó.
  await Promise.all(yo.team.members.map((m) => pushSnapshotToUser(m.id)));

  // La luz va con el equipo que ATACA: es quien hizo la acción, y es a
  // quien tiene sentido acotar una regla.
  dispararLuces('ATAQUE', { teamId: yo.team.id });

  return { esperaMs: event.enfriamientoAtaqueMs, objetivo: objetivo.name };
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
      const a = JSON.parse(f.dataJson).objetivo;
      return f.teamId && typeof a === 'string' ? [{ id: f.id, de: f.teamId, a, at: f.createdAt.getTime() }] : [];
    } catch {
      return [];
    }
  });
}
