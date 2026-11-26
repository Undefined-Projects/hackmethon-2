// ============================================================
//  PISTAS
//
//  Cada capa de cada fase tiene tres niveles —no obvia, normal, muy
//  obvia— con tres pistas en cada uno. Las tres de un nivel tratan tres
//  atascos distintos, en el orden en que un equipo se los encuentra; la
//  pista 1 del nivel normal es la misma duda que la 1 del sutil, dicha
//  más claro. Así, a un equipo muy atascado se le puede ir subiendo el
//  nivel sin repetirle nada.
//
//  Todo el equipo ve la misma pista: los textos nombran el puesto cuando
//  hace falta. Los textos viven en `pistas-texto.ts`.
// ============================================================

import type { NivelPista, PistaEnviada } from './events.js';
import { PISTAS } from './pistas-texto.js';
import { prisma } from './prisma.js';

export { PISTAS };

export const NOMBRE_NIVEL: Record<NivelPista, string> = {
  sutil: 'NO OBVIA',
  normal: 'NORMAL',
  obvia: 'MUY OBVIA',
};

/**
 * La capa en que va un equipo, leída de su estado. Casi todas las fases
 * la guardan en `capa`; Núcleo Modular, en `parte`.
 */
export function capaDeEstado(stateJson: string | null | undefined): number {
  let e: Record<string, unknown> = {};
  try { e = JSON.parse(stateJson || '{}'); } catch { /* estado roto: capa 1 */ }
  const n = typeof e.capa === 'number' ? e.capa : typeof e.parte === 'number' ? e.parte : 1;
  return Math.max(1, Math.floor(n));
}

/** Las pistas de una capa, o null si esa fase no tiene. La capa se acota
 *  a las que hay: una fase con una sola capa sigue teniendo pistas. */
export function capaPistas(faseKey: string, capa: number) {
  const fase = PISTAS[faseKey];
  if (!fase || fase.capas.length === 0) return null;
  const i = Math.min(Math.max(1, capa), fase.capas.length) - 1;
  return { capa: i + 1, ...fase.capas[i] };
}

/**
 * Qué pista de un nivel le toca a un equipo: la primera que no ha
 * recibido en esa fase y capa. Si ya recibió las tres, la que recibió
 * hace más tiempo, para que al menos no se repita la última.
 */
export function siguienteIndice(
  enviadas: PistaEnviada[],
  phaseId: string, capa: number, nivel: NivelPista, total: number,
): number {
  const previas = enviadas.filter((p) => p.phaseId === phaseId && p.capa === capa && p.nivel === nivel);
  for (let i = 0; i < total; i++) if (!previas.some((p) => p.indice === i)) return i;
  const ultimaVez = (i: number) => Math.max(...previas.filter((p) => p.indice === i).map((p) => p.at));
  let mejor = 0;
  for (let i = 1; i < total; i++) if (ultimaVez(i) < ultimaVez(mejor)) mejor = i;
  return mejor;
}

/**
 * Dónde está un equipo para efectos de pista: la fase empezada que tocó
 * por última vez; si no tiene, la primera abierta que le falta (capa 1).
 * Solo fases abiertas: en una cerrada ya no hay nada que destrabar.
 */
export function ubicacionDe(
  progreso: { phaseId: string; status: string; stateJson: string; updatedAt: Date }[],
  fases: { id: string; order: number; status: string }[],
): { phaseId: string; capa: number } | null {
  const abierta = new Map(fases.filter((f) => f.status === 'ACTIVE').map((f) => [f.id, f.order]));
  const empezada = progreso
    .filter((p) => p.status === 'IN_PROGRESS' && abierta.has(p.phaseId))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  if (empezada) return { phaseId: empezada.phaseId, capa: capaDeEstado(empezada.stateJson) };
  const pendiente = progreso
    .filter((p) => p.status === 'PENDING' && abierta.has(p.phaseId))
    .sort((a, b) => abierta.get(a.phaseId)! - abierta.get(b.phaseId)!)[0];
  return pendiente ? { phaseId: pendiente.phaseId, capa: 1 } : null;
}

/** Las pistas que ya recibió cada equipo desde el último reinicio. */
export async function pistasEnviadas(): Promise<Map<string, PistaEnviada[]>> {
  const reinicio = await prisma.eventLog.findFirst({ where: { type: 'GAME_RESET' }, orderBy: { createdAt: 'desc' } });
  const filas = await prisma.eventLog.findMany({
    where: { type: 'PISTA', createdAt: reinicio ? { gt: reinicio.createdAt } : undefined },
    orderBy: { createdAt: 'asc' },
  });
  const porEquipo = new Map<string, PistaEnviada[]>();
  for (const f of filas) {
    if (!f.teamId) continue;
    try {
      const d = JSON.parse(f.dataJson) as Omit<PistaEnviada, 'at'>;
      const lista = porEquipo.get(f.teamId) ?? [];
      lista.push({ at: f.createdAt.getTime(), phaseId: d.phaseId, capa: d.capa, nivel: d.nivel, indice: d.indice });
      porEquipo.set(f.teamId, lista);
    } catch { /* fila rota: se ignora */ }
  }
  return porEquipo;
}
