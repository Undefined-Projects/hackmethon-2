import { useEffect, useRef, useState } from 'react';

// ============================================================
//  EL RELOJ DE LA CAMINATA · Fase 2
//
//  El servidor resuelve el viaje entero de una vez —qué hizo el brote
//  paso a paso y cómo acabó— y cada puesto lo ANDA con este reloj:
//  Pantalla mueve al brote por el laberinto y Datos enciende la línea
//  del programa que lo está moviendo. Los dos usan el mismo ritmo, que
//  viene del servidor, así que van al mismo paso sin hablarse.
//
//  No se salta con «reducir movimiento»: aquí la animación no es adorno,
//  es la información. Lo que se apaga en ese caso es la suavidad (CSS).
// ============================================================

export type Ritmo = { inicio: number; paso: number; giro: number; choque: number; fin: number };
/** `ch` es un choque (lo ve Datos); `x`, el mismo paso visto desde Pantalla:
 *  el brote se desconecta, sin decir por qué. */
export type Accion = 'av' | 'gi' | 'gd' | 'ch' | 'x';
/** quieta: no hay viaje · nace: el brote germina en la entrada ·
 *  anda: va por el paso `i` · fin: ya acabó (bien o mal). */
export type Etapa = 'quieta' | 'nace' | 'anda' | 'fin';

/** Cuánto dura cada acción en pantalla. */
export const duracionDe = (a: Accion, r: Ritmo) => (a === 'av' ? r.paso : a === 'ch' || a === 'x' ? r.choque : r.giro);

/**
 * Anda un viaje. `n` identifica el viaje: cuando cambia, se anda el nuevo
 * desde la entrada. `clave` es dónde se recuerda el último que ya se vio
 * entero en esta pestaña: quien recarga no tiene que volver a mirarlo.
 * Sin clave (la proyección de la sala), se anda siempre.
 */
export function useCaminata(
  viaje: { n: number; acciones: Accion[]; ritmo: Ritmo } | null,
  clave: string | null,
): { i: number; etapa: Etapa; recienVisto: boolean } {
  const visto = (): number => {
    if (!clave) return -1;
    try { return Number(sessionStorage.getItem(clave) ?? -1); } catch { return -1; }
  };
  const [estado, setEstado] = useState<{ n: number | null; i: number; etapa: Etapa; recienVisto: boolean }>(() => {
    if (!viaje) return { n: null, i: -1, etapa: 'quieta', recienVisto: false };
    // Al montar con un viaje que ya se vio: directamente cómo acabó.
    if (viaje.n <= visto()) return { n: viaje.n, i: viaje.acciones.length - 1, etapa: 'fin', recienVisto: false };
    return { n: null, i: -1, etapa: 'quieta', recienVisto: false };
  });

  const n = viaje?.n ?? null;
  const acciones = useRef(viaje?.acciones ?? []);
  acciones.current = viaje?.acciones ?? [];
  const ritmo = useRef(viaje?.ritmo);
  ritmo.current = viaje?.ritmo;

  useEffect(() => {
    if (n === null) { setEstado({ n: null, i: -1, etapa: 'quieta', recienVisto: false }); return; }
    const acc = acciones.current;
    const r = ritmo.current!;
    if (n <= visto()) {
      setEstado({ n, i: acc.length - 1, etapa: 'fin', recienVisto: false });
      return;
    }
    setEstado({ n, i: -1, etapa: 'nace', recienVisto: false });
    const relojes: ReturnType<typeof setTimeout>[] = [];
    let t = r.inicio;
    acc.forEach((a, k) => {
      relojes.push(setTimeout(() => setEstado({ n, i: k, etapa: 'anda', recienVisto: false }), t));
      t += duracionDe(a, r);
    });
    relojes.push(setTimeout(() => {
      setEstado({ n, i: acc.length - 1, etapa: 'fin', recienVisto: true });
      if (clave) { try { sessionStorage.setItem(clave, String(n)); } catch { /* sin almacenamiento */ } }
    }, t));
    return () => relojes.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, clave]);

  return { i: estado.i, etapa: estado.etapa, recienVisto: estado.recienVisto };
}

/** La columna en letras, como en una hoja de cálculo: A…Z, AA, AB… La
 *  espesura tiene 31 columnas. La misma cuenta que el servidor. */
export const columna = (c: number): string =>
  (c >= 26 ? columna(Math.floor(c / 26) - 1) : '') + String.fromCharCode(65 + (c % 26));
/** «D7»: columna en letra y fila en número. La misma cuenta que el servidor. */
export const casilla = (f: number, c: number) => `${columna(c)}${f + 1}`;
