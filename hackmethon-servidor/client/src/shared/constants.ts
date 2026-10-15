// ⚠️ GENERADO — no editar aquí.
// Fuente: server/src/lib/constants.ts · regenerar con `npm run sync:shared` en /server

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

export const isRole = (v: unknown): v is Role => ROLES.includes(v as Role);
