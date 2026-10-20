// ============================================================
//  Cronometraje y ranking
//  Regla de oro: el reloj OFICIAL de cada equipo arranca cuando el
//  admin abre la fase (mismo instante para todos), no cuando el equipo
//  decide entrar desde el lobby. Así el dato es comparable.
//  En paralelo medimos el tiempo de TRABAJO REAL (desde que entran),
//  que sirve para desempates y para analizar rendimiento.
// ============================================================

import type { EventState, Phase, Team, TeamPhaseProgress } from '@prisma/client';

/** Pausa en curso: ms transcurridos desde que el admin pulsó PAUSE. */
export function inFlightPauseMs(event: Pick<EventState, 'pausedAt'>, now = Date.now()): number {
  return event.pausedAt ? Math.max(0, now - event.pausedAt.getTime()) : 0;
}

function net(fromMs: number, toMs: number, pausedMs: number, inFlight: number): number {
  return Math.max(0, toMs - fromMs - pausedMs - inFlight);
}

/**
 * Lo que le queda a la FINAL, con las pausas descontadas. Puede salir
 * NEGATIVO a propósito: así quien llama sabe no solo que se acabó, sino
 * cuándo, y la proyección no repite la animación del desenlace cada vez
 * que alguien abre la ventana.
 *
 * La pausa acumulada la llevan las filas de progreso de esta misma fase:
 * todas arrancan en `phase.openedAt` y el reloj global las incrementa a
 * la vez. Se toma la mayor porque una fila ya resuelta dejó de sumar.
 */
export function finalRestanteMs(
  phase: Pick<Phase, 'openedAt' | 'limiteMs'>,
  progresos: Pick<TeamPhaseProgress, 'pausedMs'>[],
  event: Pick<EventState, 'pausedAt'>,
  now = Date.now(),
): number | null {
  if (!phase.openedAt || !phase.limiteMs) return null;
  const pausado = progresos.reduce((m, p) => Math.max(m, p.pausedMs), 0);
  const transcurrido = Math.max(
    0,
    now - phase.openedAt.getTime() - pausado - inFlightPauseMs(event, now),
  );
  return phase.limiteMs - transcurrido;
}

/** Lo que un equipo espera entre ataques si nadie lo ha cambiado. El de
 *  verdad vive en EventState y se ajusta desde el panel. */
export const ENFRIAMIENTO_ATAQUE_MS = 60_000;
/** Los topes del ajuste del panel: menos de 5 s es una ametralladora y
 *  más de media hora es quitar los ataques sin decirlo. */
export const ENFRIAMIENTO_MIN_S = 5;
export const ENFRIAMIENTO_MAX_S = 30 * 60;

/**
 * Enfriamiento restante de un equipo, con las pausas descontadas.
 *
 * La pausa se mide con el contador GLOBAL del evento: se guarda cuánto
 * llevaba acumulado en el momento del ataque y se resta la diferencia.
 * Así una parada de cinco minutos no le regala el ataque a quien acaba
 * de gastarlo ni se lo quita a quien ya estaba esperando.
 */
export function esperaDeAtaqueMs(
  equipo: Pick<Team, 'ultimoAtaqueAt' | 'ultimoAtaquePausaMs'>,
  event: Pick<EventState, 'pausedAt' | 'totalPausedMs' | 'enfriamientoAtaqueMs'>,
  now = Date.now(),
): number {
  // Se aplica el valor de AHORA, no el que había al atacar: si el panel
  // acorta la espera, quien ya estaba esperando también se beneficia.
  return restanteSinPausaMs(equipo.ultimoAtaqueAt, equipo.ultimoAtaquePausaMs, event.enfriamientoAtaqueMs, event, now);
}

/**
 * Lo que le queda a algo que se selló en `desde` y dura `duracionMs`,
 * descontando la pausa global que hubo después. Es la cuenta del
 * enfriamiento de ataque, la del súper ataque y la del escudo: las tres
 * se congelan con el evento en pausa.
 */
export function restanteSinPausaMs(
  desde: Date | null,
  pausaAlSellar: number,
  duracionMs: number,
  event: Pick<EventState, 'pausedAt' | 'totalPausedMs'>,
  now = Date.now(),
): number {
  if (!desde) return 0;
  const pausaDesde = event.totalPausedMs - pausaAlSellar + inFlightPauseMs(event, now);
  const transcurrido = Math.max(0, now - desde.getTime() - Math.max(0, pausaDesde));
  return Math.max(0, duracionMs - transcurrido);
}

/** Métricas congeladas en el momento de resolver. */
export function computeSolveMetrics(
  p: Pick<TeamPhaseProgress, 'unlockedAt' | 'enteredAt' | 'pausedMs'>,
  solvedAt: Date,
) {
  const solved = solvedAt.getTime();
  return {
    timeToSolveMs: p.unlockedAt ? net(p.unlockedAt.getTime(), solved, p.pausedMs, 0) : null,
    activeMs: p.enteredAt ? net(p.enteredAt.getTime(), solved, p.pausedMs, 0) : null,
  };
}

/** Cronómetro vivo para pintar en el lobby mientras la fase no está resuelta. */
export function liveElapsedMs(
  p: Pick<TeamPhaseProgress, 'unlockedAt' | 'solvedAt' | 'timeToSolveMs' | 'pausedMs'>,
  event: Pick<EventState, 'pausedAt'>,
  now = Date.now(),
): number | null {
  if (p.solvedAt) return p.timeToSolveMs;
  if (!p.unlockedAt) return null;
  return net(p.unlockedAt.getTime(), now, p.pausedMs, inFlightPauseMs(event, now));
}

export const formatMs = (ms: number | null): string => {
  if (ms === null) return '--:--';
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

// ------------------------------------------------------------
// Proyección del LOBBY: qué ve un equipo de cada fase.
//
// Reglas de acceso (las tres son independientes y se aplican en orden):
//   1. La fase debe estar ACTIVE (el admin la abrió).
//   2. El equipo debe haber resuelto la fase ANTERIOR (cadena secuencial),
//      SALVO que el admin ya la haya cerrado (COMPLETED): cerrar una fase
//      es declarar "esto ya terminó para todos" y libera la cadena. Sin
//      esta salida, un equipo atascado en la Fase 1 quedaría fuera del
//      evento para siempre en cuanto la cerraras.
//   3. Una fase ya resuelta NO se puede reabrir.
//
// El contenido real (description, y luego el reto entero) solo viaja al
// cliente si el equipo puede entrar o ya la resolvió. Una fase que el
// admin abrió pero que el equipo aún no ha ganado sigue censurada: si no,
// el equipo lee la Fase 3 desde las DevTools mientras pelea la Fase 1.
// ------------------------------------------------------------
type ProgressWithPhase = TeamPhaseProgress & { phase: Phase };

export type LockReason = 'ADMIN' | 'PREREQUISITE' | 'COMPLETED' | null;

export function buildLobbyView(
  rows: ProgressWithPhase[],
  event: Pick<EventState, 'pausedAt' | 'status' | 'focusPhaseId' | 'libreAcceso'>,
  now = Date.now(),
) {
  const ordered = [...rows].sort((a, b) => a.phase.order - b.phase.order);

  return ordered.map(({ phase, ...p }, i) => {
    const prev = i > 0 ? ordered[i - 1] : null;
    // Con acceso libre, abrir una fase basta: la cadena deja de exigir que
    // la anterior esté resuelta. Lo que NO cambia es el resto —una fase
    // sigue necesitando que el admin la abra, y una ya resuelta sigue sin
    // poder rejugarse—, porque esto libera el prerrequisito, no el control.
    const prereqMet =
      event.libreAcceso
      || prev === null || prev.status === 'SOLVED' || prev.phase.status === 'COMPLETED';
    const solved = p.status === 'SOLVED';
    const isActive = phase.status === 'ACTIVE';
    const canEnter = isActive && prereqMet && !solved;
    const revealed = canEnter || solved;

    const lockReason: LockReason = solved
      ? 'COMPLETED'
      : !isActive
        ? 'ADMIN'
        : !prereqMet
          ? 'PREREQUISITE'
          : null;

    return {
      phaseId: phase.id,
      key: phase.key,
      order: phase.order,
      title: phase.title,
      // El lobby dibuja al robot: la final es la cabeza y la bonus el corazón.
      esFinal: phase.esFinal,
      esBonus: phase.esBonus,
      description: revealed ? phase.description : null,
      teaser: revealed ? null : phase.teaser,
      phaseStatus: phase.status, // LOCKED | ACTIVE | COMPLETED (global, del admin)
      teamStatus: p.status,      // PENDING | IN_PROGRESS | SOLVED | FAILED
      canEnter,
      lockReason,
      // Para pintar "Completa la Fase 1 para desbloquear" sin adivinar en el front:
      blockedByPhaseId: lockReason === 'PREREQUISITE' ? prev!.phaseId : null,
      blockedByTitle: lockReason === 'PREREQUISITE' ? prev!.phase.title : null,
      isFocus: event.focusPhaseId === phase.id,
      attempts: p.attempts,
      // El reloj OFICIAL corre desde que el admin abrió la fase, aunque el
      // equipo siga bloqueado por la cadena. Ver nota en README.
      elapsedMs: liveElapsedMs(p, event, now),
      timeToSolveMs: p.timeToSolveMs,
      activeMs: p.activeMs,
      // Cuánto tiempo del reloj oficial el equipo estuvo bloqueado por la
      // fase anterior (dato para auditar el ranking si hay reclamación).
      blockedMs:
        p.unlockedAt && p.availableAt
          ? Math.max(0, p.availableAt.getTime() - p.unlockedAt.getTime())
          : null,
      solvedAt: p.solvedAt,
    };
  });
}

/**
 * Recalcula `availableAt`: el instante en que el equipo REALMENTE pudo entrar.
 * No altera el reloj oficial; solo deja auditable cuánto esperó bloqueado.
 * Devuelve los updates a persistir (vacío si no hay cambios).
 */
export function computeAvailability(
  rows: ProgressWithPhase[],
  libreAcceso = false,
  now = new Date(),
): { id: string; availableAt: Date }[] {
  const ordered = [...rows].sort((a, b) => a.phase.order - b.phase.order);
  const updates: { id: string; availableAt: Date }[] = [];

  ordered.forEach(({ phase, ...p }, i) => {
    if (p.availableAt || phase.status !== 'ACTIVE') return;
    const prev = i > 0 ? ordered[i - 1] : null;
    // Mismo criterio que buildLobbyView: resuelta por el equipo o cerrada por
    // el admin —o acceso libre—. Si no se mirara aquí tambien, el equipo
    // podria entrar a una fase cuyo `availableAt` nunca se sella, y el
    // ranking se quedaria sin el dato con el que se audita una reclamacion.
    if (!libreAcceso && prev && prev.status !== 'SOLVED' && prev.phase.status !== 'COMPLETED') return;

    const openedAt = phase.openedAt ?? now;
    const prevSolved = prev?.solvedAt;
    const at = prevSolved && prevSolved > openedAt ? prevSolved : openedAt;
    updates.push({ id: p.id, availableAt: at });
  });

  return updates;
}

// ------------------------------------------------------------
// Ranking: 1) más fases resueltas, 2) menos tiempo oficial acumulado,
// 3) menos intentos. El tiempo activo queda como cuarto criterio.
// ------------------------------------------------------------
export function buildLeaderboard(
  teams: { id: string; name: string; score: number; progress: TeamPhaseProgress[] }[],
) {
  return teams
    .map((t) => {
      const solved = t.progress.filter((p) => p.status === 'SOLVED');
      return {
        teamId: t.id,
        name: t.name,
        score: t.score,
        phasesSolved: solved.length,
        totalTimeMs: solved.reduce((a, p) => a + (p.timeToSolveMs ?? 0), 0),
        totalActiveMs: solved.reduce((a, p) => a + (p.activeMs ?? 0), 0),
        attempts: t.progress.reduce((a, p) => a + p.attempts, 0),
        perPhase: t.progress.map((p) => ({
          phaseId: p.phaseId,
          status: p.status,
          timeToSolveMs: p.timeToSolveMs,
          activeMs: p.activeMs,
          attempts: p.attempts,
        })),
      };
    })
    .sort(
      (a, b) =>
        b.phasesSolved - a.phasesSolved ||
        a.totalTimeMs - b.totalTimeMs ||
        a.attempts - b.attempts ||
        a.totalActiveMs - b.totalActiveMs,
    )
    .map((t, i) => ({ rank: i + 1, ...t }));
}
