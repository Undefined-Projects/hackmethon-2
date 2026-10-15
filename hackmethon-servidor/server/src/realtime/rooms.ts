// ============================================================
//  Nomenclatura de rooms. Centralizada a propósito: en el Paso 3
//  la mezcla de roles mueve sockets entre rooms, y un nombre
//  construido a mano en otro archivo sería un fallo imposible de ver.
// ============================================================

import type { Role } from '../lib/constants.js';

/** Todo el equipo (lobby, cambios de fase, presencia). */
export const teamRoom = (teamId: string) => `team:${teamId}`;

/** Un rol concreto dentro de un equipo. Aquí viven los envíos dirigidos:
 *  el resultado visual va SOLO a la room PANTALLA de ese equipo. */
export const roleRoom = (teamId: string, role: Role) => `team:${teamId}:${role}`;

/** Todas las pestañas/dispositivos de una misma persona.
 *  Necesario porque un jugador puede tener el móvil y el portátil abiertos. */
export const userRoom = (userId: string) => `user:${userId}`;

/** Panel de control. */
export const ADMIN_ROOM = 'admin';
