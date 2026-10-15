// ============================================================
//  Rotación de roles.
//
//  Un equipo es de 3 a 5 personas, con UNA sola TERMINAL: es quien
//  teclea a ciegas, y que sea una persona es lo que obliga al resto a
//  dictarle. Los demás se reparten entre DATOS y PANTALLA, equilibrados:
//
//      3 → 1 TERMINAL · 1 DATOS · 1 PANTALLA
//      4 → 1 TERMINAL · 2 DATOS · 1 PANTALLA
//      5 → 1 TERMINAL · 2 DATOS · 2 PANTALLA
//
//  Al mezclar:
//   - La TERMINAL pasa a quien MENOS veces la ha tenido (`vecesTerminal`),
//     y nunca a quien la tiene ahora; si puede, tampoco a quien la tuvo
//     justo antes. Entre empatados, al azar. Así todos pasan por el
//     teclado antes de repetir.
//   - Los demás procuran no repetir su rol (regla dura cuando se puede)
//     y, además, no volver al anterior (preferencia).
//
//  Con tres personas esto da exactamente los dos «desarreglos» de
//  siempre —nadie conserva su rol—, a partes iguales si nadie tiene
//  historial.
// ============================================================

import { randomInt } from 'node:crypto';
import type { Role } from './constants.js';

export type ShuffleInput = { userId: string; role: Role; previousRole: Role | null; vecesTerminal?: number };
export type ShuffleResult = { userId: string; from: Role; to: Role };

/** Los roles de un equipo de `n` personas: una TERMINAL y el resto
 *  alternando DATOS y PANTALLA (con 4, el puesto doble es DATOS). */
export function composicion(n: number): Role[] {
  const out: Role[] = n > 0 ? ['TERMINAL'] : [];
  for (let i = 1; i < n; i++) out.push(i % 2 === 1 ? 'DATOS' : 'PANTALLA');
  return out;
}

const pick = <T>(arr: T[]): T => arr[randomInt(arr.length)];

/** Las ordenaciones DISTINTAS de una lista con repetidos. */
function ordenaciones<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  const vistos = new Set<T>();
  items.forEach((item, i) => {
    if (vistos.has(item)) return;
    vistos.add(item);
    const resto = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const o of ordenaciones(resto)) out.push([item, ...o]);
  });
  return out;
}

/**
 * Devuelve la nueva asignación, o null si es imposible (equipo de 1
 * persona: no hay con quién cambiar).
 */
export function shuffleTeamRoles(members: ShuffleInput[]): ShuffleResult[] | null {
  if (members.length < 2) return null;

  // 1. La TERMINAL: a quien menos la ha tenido, sin repetir a quien la
  //    tiene; si se puede, tampoco a quien la tuvo justo antes.
  const sinTerminal = members.filter((m) => m.role !== 'TERMINAL');
  if (!sinTerminal.length) return null;
  const preferidos = sinTerminal.filter((m) => m.previousRole !== 'TERMINAL');
  const candidatos = preferidos.length ? preferidos : sinTerminal;
  const minimo = Math.min(...candidatos.map((m) => m.vecesTerminal ?? 0));
  const terminal = pick(candidatos.filter((m) => (m.vecesTerminal ?? 0) === minimo));

  // 2. El resto de puestos, entre los demás.
  const resto = members.filter((m) => m !== terminal);
  const roles = composicion(members.length).slice(1);
  const opciones = ordenaciones(roles).map((o) => ({
    o,
    // Cuántos repiten su rol (lo que se evita sí o sí) y cuántos vuelven
    // al anterior (lo que se evita si se puede).
    repiten: o.filter((r, i) => r === resto[i].role).length,
    vuelven: o.filter((r, i) => r === resto[i].previousRole).length,
  }));
  const menosRepiten = Math.min(...opciones.map((x) => x.repiten));
  const sinRepetir = opciones.filter((x) => x.repiten === menosRepiten);
  const menosVuelven = Math.min(...sinRepetir.map((x) => x.vuelven));
  const elegida = pick(sinRepetir.filter((x) => x.vuelven === menosVuelven)).o;

  const nuevo = new Map<string, Role>([[terminal.userId, 'TERMINAL']]);
  resto.forEach((m, i) => nuevo.set(m.userId, elegida[i]));
  return members.map((m) => ({ userId: m.userId, from: m.role, to: nuevo.get(m.userId)! }));
}
