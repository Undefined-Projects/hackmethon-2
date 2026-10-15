import type { Role } from './constants.js';

/**
 * Cuánto dura la avería de cada puesto.
 *
 * Vive aquí y no en el panel porque ahora la provocan DOS cosas: el
 * admin sobre una persona, y un equipo sobre otro equipo entero. Un
 * segundo sitio con estos números acabaría teniendo otros.
 *
 * Terminal dura mucho menos a propósito: tres segundos con el teclado
 * loco cuestan un comando, y doce serían cuatro. Los otros dos puestos
 * estorban sin impedir, así que aguantan más.
 */
export const DURACION_AVERIA: Record<Role, number> = {
  TERMINAL: 3_000,
  PANTALLA: 12_000,
  DATOS: 12_000,
};

/**
 * Las averías EN CURSO, por persona. El servidor tiene que recordarlas:
 * si solo las supiera el navegador, recargar la página las borraría, y
 * eso es exactamente la trampa que no puede existir. Cada snapshot del
 * jugador lleva la suya con lo que le queda, y al recargar la retoma
 * donde estaba.
 *
 * En memoria a propósito: duran segundos. Si el servidor se reinicia, se
 * acaban, que es lo que pasaría de todos modos.
 */
type Averia = { tipo: Role; hasta: number; de?: string };
const activas = new Map<string, Averia>();

/** Anota la avería de una persona y devuelve lo que se le emite. Si ya
 *  tenía una del mismo puesto, se queda con la que acabe más tarde: dos
 *  ataques seguidos no se acortan el uno al otro. */
export function registrarAveria(userId: string, tipo: Role, de?: string) {
  const duracionMs = DURACION_AVERIA[tipo];
  const hasta = Date.now() + duracionMs;
  const previa = activas.get(userId);
  activas.set(userId, previa && previa.tipo === tipo && previa.hasta > hasta ? previa : { tipo, hasta, de });
  return { tipo, duracionMs, ...(de ? { de } : {}) };
}

/** La avería en curso de una persona, con lo que le queda; o null. */
export function averiaDe(userId: string): { tipo: Role; restanteMs: number; de?: string } | null {
  const a = activas.get(userId);
  if (!a) return null;
  const restanteMs = a.hasta - Date.now();
  if (restanteMs <= 0) { activas.delete(userId); return null; }
  return { tipo: a.tipo, restanteMs, ...(a.de ? { de: a.de } : {}) };
}
