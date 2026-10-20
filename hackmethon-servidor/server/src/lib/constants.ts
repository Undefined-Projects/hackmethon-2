// Fuente única de verdad para los "enums" que SQLite no soporta.
// El backend valida contra estos arrays; el front importa los mismos
// literales (Paso 4) para que no haya strings mágicos divergentes.

export const ROLES = ['DATOS', 'TERMINAL', 'PANTALLA'] as const;
export type Role = (typeof ROLES)[number];

export const PHASE_STATUS = ['LOCKED', 'ACTIVE', 'COMPLETED'] as const;
export type PhaseStatus = (typeof PHASE_STATUS)[number];

export const EVENT_STATUS = ['LOBBY', 'RUNNING', 'PAUSED', 'FINISHED'] as const;
export type EventStatus = (typeof EVENT_STATUS)[number];

export const PROGRESS_STATUS = ['PENDING', 'IN_PROGRESS', 'SOLVED', 'FAILED'] as const;
export type ProgressStatus = (typeof PROGRESS_STATUS)[number];

/** Cuánto vive en el mapa la línea de un ataque. Lo mismo que el
 *  enfriamiento: mientras un equipo no puede volver a atacar, la sala
 *  todavía ve a quién le dio. */
export const VIDA_LINEA_ATAQUE_MS = 60_000;

/** Las averías de cada puesto, más la del súper ataque: la de Pantalla
 *  para todo el equipo, a pantalla completa y sin poder tocar nada. */
export type TipoAveria = Role | 'SUPER';

// ------------------------------------------------------------
//  Tickets: el dinero de cada equipo.
//
//  Aquí y no en el servidor a secas porque el cliente los enseña —el
//  precio en el botón, las reglas en el panel—, y dos copias de un
//  precio acaban diciendo cosas distintas.
// ------------------------------------------------------------

/** Por superar una fase, según el puesto de llegada: el primero cobra
 *  más. Del cuarto en adelante, `TICKETS_FASE_RESTO`. */
export const TICKETS_FASE = [10, 8, 6] as const;
export const TICKETS_FASE_RESTO = 4;

/** Por una ronda de minijuego del panel, según el puesto del EQUIPO (su
 *  mejor jugador). Quien juega y no llega al podio se lleva el consuelo. */
export const TICKETS_MINIJUEGO = [6, 4, 2] as const;
export const TICKETS_MINIJUEGO_PARTICIPAR = 1;

/** El escudo: los ataques normales rebotan mientras dure. */
export const PRECIO_ESCUDO = 8;
export const DURACION_ESCUDO_MS = 90_000;

/** El súper ataque: atraviesa el escudo e inmoviliza a todo el equipo. */
export const PRECIO_SUPER = 12;
export const DURACION_SUPER_MS = 15_000;
export const ENFRIAMIENTO_SUPER_MS = 120_000;

/**
 * La intensidad del ataque normal según la distancia en fases. Cada fase
 * que el atacado le lleva al atacante multiplica la avería por `BASE`; cada
 * fase que el atacante le lleva al atacado la divide. Con la misma fase,
 * ×1. Acotada para que ni el golpe del último sea eterno ni el del primero
 * desaparezca.
 */
export const INTENSIDAD_BASE = 1.3;
export const INTENSIDAD_MIN = 0.4;
export const INTENSIDAD_MAX = 2.5;

export const intensidadAtaque = (fasesAtacante: number, fasesObjetivo: number): number =>
  Math.min(INTENSIDAD_MAX, Math.max(INTENSIDAD_MIN, INTENSIDAD_BASE ** (fasesObjetivo - fasesAtacante)));

export const isRole = (v: unknown): v is Role => ROLES.includes(v as Role);
