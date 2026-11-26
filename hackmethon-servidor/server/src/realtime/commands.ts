// ============================================================
//  Motor de comandos.
//
//  Este archivo no sabe NADA del contenido de ninguna fase: valida,
//  registra y reparte. El significado de un comando lo pone el módulo.
//
//  Las tres validaciones que no pueden faltar, y por qué:
//    1. El rol debe ser TERMINAL — comprobado en el servidor. En el
//       front basta con abrir la consola del navegador para emitir
//       `terminal:command` desde cualquier rol.
//    2. La fase debe estar ACTIVE y el equipo dentro de ella. Sin esto,
//       un equipo seguiría jugando una fase que el admin ya cerró.
//    3. La respuesta va SOLO a la room PANTALLA. El acuse que recibe
//       Terminal confirma la entrega, jamás el contenido: si le
//       devolviéramos la salida, se acabó la ceguera y el juego.
//
//  Un comando puede además abrir o cerrar un flujo continuo hacia
//  Pantalla (el monitor de tráfico). El motor pone el reloj y el
//  reparto; el guion lo escribe el módulo.
// ============================================================

import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { computeSolveMetrics } from '../lib/timing.js';
import { dispararLuces } from './luces.js';
import { projectPhaseForRole } from '../lib/snapshot.js';
import { moduloDeFase } from '../phases/index.js';
import type { SalidaComando } from '../lib/events.js';
import { ROLES, type Role } from '../lib/constants.js';
import { roleRoom, teamRoom } from './rooms.js';
import { getIO, pushLobby } from './server.js';
import { pushAdminState } from './admin.js';
import { detenerFlujo, filtrarFlujo, flujoActivo, iniciarFlujo } from './trafico.js';

const MAX_LONGITUD = 400;

export class ErrorComando extends Error {}

export async function procesarComando(
  { userId, teamId, role }: { userId: string; teamId: string; role: Role },
  textoBruto: string,
): Promise<{ aceptado: boolean }> {
  // --- 1. Rol ---
  if (role !== 'TERMINAL') throw new ErrorComando('NO_ERES_TERMINAL');

  const texto = String(textoBruto ?? '').slice(0, MAX_LONGITUD).trim();
  if (!texto) throw new ErrorComando('COMANDO_VACIO');

  // --- 2. Fase activa y equipo dentro ---
  const progreso = await prisma.teamPhaseProgress.findFirst({
    where: { teamId, status: 'IN_PROGRESS' },
    include: { phase: true },
  });
  if (!progreso) throw new ErrorComando('SIN_FASE_ACTIVA');
  if (progreso.phase.status !== 'ACTIVE') throw new ErrorComando('FASE_CERRADA');

  const modulo = moduloDeFase(progreso.phase.key);
  if (!modulo) throw new ErrorComando('FASE_SIN_MODULO');

  const evento = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
  if (evento.pausedAt) throw new ErrorComando('EVENTO_EN_PAUSA');

  // --- 3. Ejecutar ---
  const ahora = Date.now();
  const estado = JSON.parse(progreso.stateJson || '{}') as Record<string, unknown>;
  const resultado = modulo.ejecutar(texto, {
    estado,
    intentos: progreso.attempts,
    ahora,
    traficoActivo: flujoActivo(teamId),
  });

  const salida: SalidaComando = {
    id: randomUUID(),
    comando: texto,
    at: ahora,
    bloques: resultado.bloques,
  };

  // --- 4. Persistir antes de emitir ---
  await prisma.commandLog.create({
    data: {
      teamId, userId,
      phaseId: progreso.phaseId,
      raw: texto,
      accepted: true,
      responseJson: JSON.stringify(salida),
    },
  });

  await prisma.teamPhaseProgress.update({
    where: { id: progreso.id },
    data: {
      firstMoveAt: progreso.firstMoveAt ?? new Date(ahora),
      attempts: resultado.fallo ? { increment: 1 } : undefined,
      stateJson: resultado.estado ? JSON.stringify(resultado.estado) : undefined,
    },
  });

  // --- 5. Repartir ---
  const io = getIO();
  io.to(roleRoom(teamId, 'PANTALLA')).emit('pantalla:output', salida);

  // El monitor se toca DESPUÉS de emitir la salida: el aviso de captura
  // debe aparecer debajo del comando que la pidió, no encima.
  if (resultado.flujo?.accion === 'iniciar') iniciarFlujo(teamId, resultado.flujo);
  else if (resultado.flujo?.accion === 'filtrar') filtrarFlujo(teamId, resultado.flujo.filtro);
  else if (resultado.flujo?.accion === 'detener') detenerFlujo(teamId);

  // Las proyecciones dejan de ser una foto. Si el módulo cambió su estado,
  // lo que ve cada puesto pudo cambiar con él —un árbol de código, un
  // cursor, un marcador— y hay que repartirlo. Sin esto, una fase que se
  // navega sería una terminal hablándole a una pantalla congelada.
  //
  // Se reparte solo cuando hay estado nuevo: `probar` o `ayuda` no mueven
  // nada, y tres proyecciones por comando que no cambia nada es trabajo
  // tirado.
  if (resultado.estado) await repartirWorkspace(teamId, progreso.phase);

  if (resultado.resuelto) await marcarResuelta(teamId, progreso.id, resultado.esperaVictoriaMs ?? 0);

  return { aceptado: true };
}

/** Reproyecta la fase para los tres puestos y le manda a cada uno la suya.
 *  Cada rol recibe SOLO su proyección: el reparto asimétrico se calcula
 *  aquí igual que al entrar, no se recorta en el cliente. */
async function repartirWorkspace(
  teamId: string,
  phase: { id: string; key: string; title: string },
) {
  const io = getIO();
  for (const role of ROLES) {
    const ws = await projectPhaseForRole(role as Role, phase, teamId);
    io.to(roleRoom(teamId, role as Role)).emit('workspace:update', ws);
  }
}

/** Sella los tiempos y avisa al equipo y al panel. */
async function marcarResuelta(teamId: string, progresoId: string, esperaMs = 0) {
  const progreso = await prisma.teamPhaseProgress.findUniqueOrThrow({
    where: { id: progresoId },
    include: { phase: true },
  });
  if (progreso.solvedAt) return; // ya estaba resuelta: nunca se re-sella

  // El ataque cesa al contenerlo. Dejarlo corriendo bajo la pantalla de
  // celebración contaría una historia que ya no es cierta.
  detenerFlujo(teamId, 'Amenaza contenida · captura cerrada.');

  const solvedAt = new Date();
  const metricas = computeSolveMetrics(progreso, solvedAt);

  await prisma.teamPhaseProgress.update({
    where: { id: progresoId },
    data: { status: 'SOLVED', solvedAt, ...metricas },
  });
  await prisma.eventLog.create({
    data: {
      type: 'PHASE_SOLVED',
      message: `Fase resuelta: ${progreso.phase.title}`,
      teamId,
      dataJson: JSON.stringify({ phaseId: progreso.phaseId, ...metricas }),
    },
  });

  const io = getIO();
  // Lo que se retrasa es la CORTINILLA, no el sello: la fase ya esta
  // marcada como resuelta arriba y el tiempo oficial ya esta calculado.
  // Asi una fase con desenlace puede enseñarlo sin regalarle segundos al
  // equipo ni quitarselos.
  const levantarCortinilla = () =>
    io.to(teamRoom(teamId)).emit('phase:solved', {
      phaseId: progreso.phaseId,
      title: progreso.phase.title,
      timeToSolveMs: metricas.timeToSolveMs,
      activeMs: metricas.activeMs,
      attempts: progreso.attempts,
    });
  if (esperaMs > 0) setTimeout(levantarCortinilla, esperaMs);
  else levantarCortinilla();

  await pushLobby(teamId);
  await pushAdminState(); // el panel ve el tiempo en cuanto se sella

  await anunciarSiEsPrimera(teamId, progreso.id, progreso.phase);

  // Las luces de la sala. Tres cosas pueden haber pasado a la vez con
  // un solo sello: pasar una fase, pasar LA final, y con ella llegar a
  // la meta. Cada una puede tener su propia luz.
  dispararLuces('FASE_RESUELTA', { teamId });
  if (progreso.phase.esFinal) dispararLuces('FINAL_VICTORIA', { teamId });

  // ¿Le quedaba alguna barrera? El bonus no cuenta: la meta está en la
  // final, igual que en la carrera.
  const pendientes = await prisma.teamPhaseProgress.count({
    where: { teamId, status: { not: 'SOLVED' }, phase: { esBonus: false } },
  });
  if (pendientes === 0) dispararLuces('EQUIPO_META', { teamId });
}

/**
 * ¿Es el PRIMER equipo en superar esta fase? Entonces toda la sala lo
 * ve: cada pantalla destroza la parte del robot que es esa fase y acaba
 * con el logo y el nombre de quien lo hizo.
 *
 * El primero se decide por la hora del sello, no por quién llega antes
 * a esta línea: si dos equipos sellan casi a la vez, los dos miran la
 * misma lista ordenada y solo uno se reconoce como primero. Sin memoria
 * aparte, así que un reinicio del juego —que borra los sellos— deja
 * cada fase lista para tener otro primero.
 */
async function anunciarSiEsPrimera(
  teamId: string,
  progresoId: string,
  phase: { id: string; order: number; esFinal: boolean; esBonus: boolean },
) {
  const resueltas = await prisma.teamPhaseProgress.findMany({
    where: { phaseId: phase.id, status: 'SOLVED', solvedAt: { not: null } },
    orderBy: [{ solvedAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
    take: 1,
  });
  if (resueltas[0]?.id !== progresoId) return;

  const [equipo, previas] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { name: true, logoAt: true } }),
    // Lo que ya está roto: las demás fases que tienen al menos un sello.
    prisma.phase.findMany({
      where: { NOT: { id: phase.id }, progress: { some: { status: 'SOLVED' } } },
      select: { id: true },
    }),
  ]);
  const log = await prisma.eventLog.create({
    data: {
      type: 'PHASE_FIRST',
      message: `${equipo.name}, primero en superar la fase ${phase.order}`,
      teamId,
      dataJson: JSON.stringify({ phaseId: phase.id }),
    },
  });
  getIO().emit('fase:primera', {
    id: log.id, phaseId: phase.id, order: phase.order, esFinal: phase.esFinal, esBonus: phase.esBonus,
    teamId, teamName: equipo.name, logoAt: equipo.logoAt?.getTime() ?? null,
    previas: previas.map((p) => p.id),
  });
}

/** Historial de salidas de un equipo, para repintar Pantalla al reconectar. */
export async function salidasDe(teamId: string, phaseId: string, limite = 40): Promise<SalidaComando[]> {
  const filas = await prisma.commandLog.findMany({
    where: { teamId, phaseId, accepted: true },
    orderBy: { createdAt: 'desc' },
    take: limite,
  });
  return filas
    .reverse()
    .map((f) => {
      try {
        return JSON.parse(f.responseJson) as SalidaComando;
      } catch {
        return null;
      }
    })
    .filter((x): x is SalidaComando => x !== null);
}
