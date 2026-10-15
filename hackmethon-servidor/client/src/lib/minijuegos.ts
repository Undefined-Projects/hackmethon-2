import type { MinijuegoClave } from '../shared/events';

/** El catálogo de recreos: lo usan el panel (para lanzarlos) y la
 *  proyección (para rotular su escena). */
export const CATALOGO: { clave: MinijuegoClave; nombre: string; nota: string }[] = [
  { clave: 'snake', nombre: 'ENREDADERA · SNAKE', nota: 'un brote de circuito que crece comiendo semillas' },
  { clave: 'plaga', nombre: 'PLAGA · WHAC-A-MOLE', nota: 'golpear los gusanos de circuito sin pisar las flores · 30 s' },
  { clave: 'sinapsis', nombre: 'SINAPSIS · REFLEJOS', nota: 'disparar en cuanto se enciende la neurona, sin caer en las flores · 5 rondas' },
  { clave: 'latido', nombre: 'LATIDO · RITMO', nota: 'marcar cada latido del paciente justo a tiempo, aunque se vuelva arrítmico' },
];

/**
 * SINAPSIS se mide en milisegundos (menos es mejor), pero el ranking
 * ordena de mayor a menor. Por eso el puntaje es `1000 − promedio`, y
 * con esto la proyección recupera el tiempo de verdad para cantarlo.
 */
export const SINAPSIS_BASE = 1000;
export const msDeSinapsis = (puntos: number) => SINAPSIS_BASE - puntos;
