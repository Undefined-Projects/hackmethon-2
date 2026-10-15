// ============================================================
//  Construcción de snapshots.
//
//  Principio central del Paso 2: el servidor NO guarda en memoria el
//  estado del jugador. Cada vez que alguien conecta —o reconecta— el
//  snapshot se reconstruye desde SQLite. Consecuencia práctica: da
//  exactamente igual si el jugador recargó, se le murió el wifi o el
//  servidor se reinició; recupera su estado exacto porque su estado
//  nunca estuvo en la conexión, estuvo en la base de datos.
//
//  Segundo principio: el snapshot está PROYECTADO POR ROL. El Operador
//  de Terminal no recibe los datos del de Datos. La ceguera del juego
//  se garantiza en el servidor; ocultar en el front sería decorativo.
// ============================================================

import { prisma } from './prisma.js';
import { leerPlano } from './plano.js';
import { averiaDe } from './averias.js';
import { ataquesRecientes } from '../realtime/ataques.js';
import {
  buildLobbyView, computeAvailability, esperaDeAtaqueMs, finalRestanteMs, liveElapsedMs,
} from './timing.js';
import { moduloDeFase } from '../phases/index.js';
import { salidasDe } from '../realtime/commands.js';
import { filtroDeFlujo, flujoActivo } from '../realtime/trafico.js';
import { marcasDe, recordsSala, tableroMinijuego, vistaMinijuego } from '../realtime/minijuegos.js';
import type { Role, EventStatus } from './constants.js';
import type {
  AdminSnapshot, AtaqueView, FinalView, LobbyPhaseView, MemberView, PhaseWorkspace, PlayerSnapshot,
} from './events.js';

/** Lobby de un equipo + sellado de `availableAt` si tocaba. */
export async function buildLobbyFor(teamId: string): Promise<LobbyPhaseView[]> {
  const event = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
  let rows = await prisma.teamPhaseProgress.findMany({
    where: { teamId },
    include: { phase: true },
  });

  const updates = computeAvailability(rows, event.libreAcceso);
  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.teamPhaseProgress.update({ where: { id: u.id }, data: { availableAt: u.availableAt } }),
      ),
    );
    rows = await prisma.teamPhaseProgress.findMany({ where: { teamId }, include: { phase: true } });
  }

  return buildLobbyView(rows, event) as LobbyPhaseView[];
}

/**
 * Proyección del contenido de una fase según el rol. Delega en el módulo
 * de la fase: este archivo no sabe qué hay dentro de ningún reto.
 *
 * Que la asimetría se calcule AQUÍ, en el servidor, es lo que hace real
 * la ceguera del juego: al Operador de Terminal no le llegan los
 * registros, no es que se los escondamos con CSS.
 */
export async function projectPhaseForRole(
  role: Role,
  phase: { id: string; key: string; title: string },
  teamId: string,
): Promise<PhaseWorkspace> {
  const base = { phaseId: phase.id, key: phase.key, title: phase.title, role };
  const modulo = moduloDeFase(phase.key);
  if (!modulo) return { ...base, payload: null };

  const progreso = await prisma.teamPhaseProgress.findUnique({
    where: { teamId_phaseId: { teamId, phaseId: phase.id } },
  });
  const estado = JSON.parse(progreso?.stateJson || '{}') as Record<string, unknown>;

  // El historial solo se reconstruye para quien debe verlo.
  const salidas = role === 'PANTALLA' ? await salidasDe(teamId, phase.id) : [];

  return {
    ...base,
    payload: modulo.proyectar(role, {
      estado,
      salidas,
      traficoActivo: flujoActivo(teamId),
      filtroTrafico: filtroDeFlujo(teamId),
    }),
  };
}

/**
 * El menú de ataques de un equipo: cuánto le falta para el siguiente,
 * a quién no puede repetir y contra quién puede ir.
 *
 * La lista sale de la base de datos en cada snapshot en vez de cachearse
 * porque los nombres y los logos se cambian EN CALIENTE desde el panel:
 * un desplegable con el nombre viejo sería un desplegable que miente.
 */
async function buildAtaque(
  equipo: { id: string; ultimoAtaqueAt: Date | null; ultimoObjetivoId: string | null; ultimoAtaquePausaMs: number },
  event: { pausedAt: Date | null; totalPausedMs: number; enfriamientoAtaqueMs: number },
): Promise<AtaqueView> {
  const [equipos, plano, recientes] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, logoAt: true },
    }),
    leerPlano(),
    ataquesRecientes(),
  ]);
  const objetivos = equipos.filter((o) => o.id !== equipo.id);
  return {
    esperaMs: esperaDeAtaqueMs(equipo, event),
    ultimoObjetivoId: equipo.ultimoObjetivoId,
    objetivos: objetivos.map((o) => ({ id: o.id, name: o.name, logoAt: o.logoAt?.getTime() ?? null })),
    plano,
    recientes,
  };
}

export async function buildPlayerSnapshot(userId: string): Promise<PlayerSnapshot | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      // `select` y no `include`: con `include` vendrían TODOS los campos
      // del equipo, y uno de ellos son los bytes del logo. Medio mega por
      // equipo cargado de la base en cada snapshot, para tirarlo justo
      // después, porque el logo se sirve aparte por HTTP.
      team: {
        select: {
          id: true, name: true, score: true, logoAt: true,
          ultimoAtaqueAt: true, ultimoObjetivoId: true, ultimoAtaquePausaMs: true,
          members: {
            orderBy: { displayName: 'asc' },
            select: { id: true, displayName: true, role: true, connected: true },
          },
        },
      },
    },
  });
  if (!user?.team) return null;

  const event = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
  const lobby = await buildLobbyFor(user.team.id);

  // ¿El equipo está dentro de una fase? Lo dice el progreso, no la sesión.
  // Por eso reconectar devuelve al jugador al mismo sitio donde estaba.
  const inProgress = await prisma.teamPhaseProgress.findFirst({
    where: { teamId: user.team.id, status: 'IN_PROGRESS' },
    include: { phase: true },
  });
  const entry = inProgress ? lobby.find((l) => l.phaseId === inProgress.phaseId) : null;
  const workspace =
    inProgress && entry?.canEnter
      ? await projectPhaseForRole(user.role as Role, inProgress.phase, user.team.id)
      : null;

  return {
    kind: 'PLAYER',
    serverTime: Date.now(),
    me: {
      id: user.id,
      displayName: user.displayName,
      role: user.role as Role,
      teamId: user.team.id,
    },
    team: {
      id: user.team.id,
      logoAt: user.team.logoAt?.getTime() ?? null,
      name: user.team.name,
      score: user.team.score,
      members: user.team.members as MemberView[],
    },
    event: {
      status: event.status as EventStatus,
      focusPhaseId: event.focusPhaseId,
      paused: event.pausedAt !== null,
      libreAcceso: event.libreAcceso,
    },
    lobby,
    workspace,
    ataque: await buildAtaque(user.team, event),
    minijuego: vistaMinijuego(),
    misMarcas: marcasDe(user.id),
    averia: averiaDe(user.id),
    recordsSala: recordsSala(),
  };
}

/**
 * La final, derivada de los hechos: cuándo se abrió la fase, cuánto
 * dura y si alguien llegó. Nada de esto se guarda, así que no puede
 * quedar desincronizado de lo que realmente pasó.
 */
async function buildFinal(
  event: { pausedAt: Date | null },
  phases: { id: string; title: string; esFinal: boolean; limiteMs: number | null; openedAt: Date | null }[],
  now = Date.now(),
): Promise<FinalView | null> {
  const fase = phases.find((p) => p.esFinal);
  if (!fase || !fase.limiteMs) return null;

  const progresos = await prisma.teamPhaseProgress.findMany({
    where: { phaseId: fase.id },
    select: { pausedMs: true, solvedAt: true, team: { select: { name: true } } },
  });

  const base = { phaseId: fase.id, title: fase.title, limiteMs: fase.limiteMs };

  // Basta con que UN equipo lo aborte: el cohete no despega dos veces.
  const primera = progresos
    .filter((p) => p.solvedAt)
    .sort((a, b) => a.solvedAt!.getTime() - b.solvedAt!.getTime())[0];
  if (primera) {
    return {
      ...base, estado: 'VICTORIA', restanteMs: null,
      ganador: primera.team.name, desenlaceAt: primera.solvedAt!.getTime(),
    };
  }

  if (!fase.openedAt) {
    return { ...base, estado: 'ESPERA', restanteMs: fase.limiteMs, ganador: null, desenlaceAt: null };
  }

  const restante = finalRestanteMs(fase, progresos, event, now) ?? 0;
  if (restante <= 0) {
    // El desenlace fue cuando la cuenta llegó a cero, no ahora: una
    // ventana que se abre diez minutos tarde no repite el despegue.
    return { ...base, estado: 'DERROTA', restanteMs: restante, ganador: null, desenlaceAt: now + restante };
  }
  return { ...base, estado: 'CUENTA', restanteMs: restante, ganador: null, desenlaceAt: null };
}

export async function buildAdminSnapshot(userId: string): Promise<AdminSnapshot | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.isAdmin) return null;

  const [event, phases, teams] = await Promise.all([
    prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } }),
    prisma.phase.findMany({ orderBy: { order: 'asc' } }),
    // Mismo motivo que en el snapshot de jugador: `select` para dejar
    // fuera los bytes del logo, que aquí serían los de los diez equipos.
    //
    // Y por ANTIGÜEDAD, no por nombre. Con el orden alfabético, renombrar
    // un equipo le hacía saltar la tarjeta a otro sitio de la rejilla, y
    // la siguiente cosa que tocara el admin sería la de otro equipo. Es
    // la misma razón por la que las calles de la carrera —que salen de
    // esta misma lista— no se rebarajan solas.
    prisma.team.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true, name: true, score: true, logoAt: true,
        members: {
          orderBy: { displayName: 'asc' },
          select: { id: true, displayName: true, role: true, connected: true },
        },
        progress: true,
      },
    }),
  ]);

  return {
    kind: 'ADMIN',
    serverTime: Date.now(),
    me: { id: user.id, displayName: user.displayName },
    event: {
      status: event.status as EventStatus,
      focusPhaseId: event.focusPhaseId,
      paused: event.pausedAt !== null,
      shuffleCount: event.shuffleCount,
      libreAcceso: event.libreAcceso,
      enfriamientoAtaqueMs: event.enfriamientoAtaqueMs,
    },
    final: await buildFinal(event, phases),
    plano: await leerPlano(),
    ataques: await ataquesRecientes(),
    minijuego: tableroMinijuego(),
    phases: phases.map((p) => ({
      id: p.id, key: p.key, order: p.order, title: p.title, teaser: p.teaser,
      esFinal: p.esFinal, esBonus: p.esBonus, limiteMs: p.limiteMs,
      status: p.status, openedAt: p.openedAt, closedAt: p.closedAt,
    })),
    teams: teams.map((t) => ({
      id: t.id, name: t.name, score: t.score,
      logoAt: t.logoAt?.getTime() ?? null,
      members: t.members as MemberView[],
      progress: t.progress.map((p) => ({
        phaseId: p.phaseId, status: p.status,
        timeToSolveMs: p.timeToSolveMs, attempts: p.attempts,
        elapsedMs: liveElapsedMs(p, event),
      })),
    })),
  };
}

export async function buildSnapshotFor(userId: string, isAdmin: boolean) {
  return isAdmin ? buildAdminSnapshot(userId) : buildPlayerSnapshot(userId);
}
