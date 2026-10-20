import { DURACION_SUPER_MS, type Role, type TipoAveria } from './constants.js';

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
type Averia = { tipo: TipoAveria; hasta: number; de?: string };
const activas = new Map<string, Averia>();

/**
 * Anota la avería de una persona y devuelve lo que se le emite. Si ya
 * tenía una del mismo tipo, se queda con la que acabe más tarde: dos
 * ataques seguidos no se acortan el uno al otro.
 *
 * `duracionMs` la trae el ataque entre equipos, que la escala según la
 * distancia en fases; sin ella, la de serie del puesto.
 *
 * Un súper ataque en curso no lo pisa nada que no sea otro súper: un
 * ataque normal que llegue encima devuelve `null` y no se emite, porque
 * quien está inmovilizado no tiene puesto que averiar.
 */
export function registrarAveria(userId: string, tipo: TipoAveria, de?: string, duracionMs?: number) {
  const dura = Math.round(duracionMs ?? (tipo === 'SUPER' ? DURACION_SUPER_MS : DURACION_AVERIA[tipo]));
  const ahora = Date.now();
  const hasta = ahora + dura;
  const previa = activas.get(userId);
  if (previa && previa.hasta > ahora && previa.tipo === 'SUPER' && tipo !== 'SUPER') return null;
  activas.set(userId, previa && previa.tipo === tipo && previa.hasta > hasta ? previa : { tipo, hasta, de });
  return { tipo, duracionMs: dura, ...(de ? { de } : {}) };
}

/** La avería en curso de una persona, con lo que le queda; o null. */
export function averiaDe(userId: string): { tipo: TipoAveria; restanteMs: number; de?: string } | null {
  const a = activas.get(userId);
  if (!a) return null;
  const restanteMs = a.hasta - Date.now();
  if (restanteMs <= 0) { activas.delete(userId); return null; }
  return { tipo: a.tipo, restanteMs, ...(a.de ? { de: a.de } : {}) };
}
