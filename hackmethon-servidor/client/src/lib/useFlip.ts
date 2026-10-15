import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Desliza lo que cambió de sitio en vez de teletransportarlo (FLIP).
 *
 * Después de cada repintado mide los elementos con `data-flip` dentro de
 * `caja`; al que se movió desde el repintado anterior lo devuelve a
 * donde estaba con un transform y lo suelta, y la transición hace el
 * resto. Lo que se mide es el id de `data-flip`, no el nodo: una ficha
 * que React remonta (por ejemplo, para relanzar un destello) también
 * viaja desde su sitio viejo.
 *
 * Un cambio de tamaño de la ventana no cuenta como movimiento: ahí todo
 * se recoloca a la vez y deslizarlo sería un terremoto.
 */
export function useFlip(caja: RefObject<HTMLElement | null>, ms = 700) {
  const antes = useRef<Map<string, DOMRect>>(new Map());
  const ventana = useRef('');

  useLayoutEffect(() => {
    const raiz = caja.current;
    if (!raiz) return;
    const els = [...raiz.querySelectorAll<HTMLElement>('[data-flip]')];
    // Medir sin el transform de una transición a medias.
    for (const el of els) { el.style.transition = 'none'; el.style.transform = ''; }
    const ahora = new Map(els.map((el) => [el.dataset.flip!, el.getBoundingClientRect()]));

    const medida = `${window.innerWidth}x${window.innerHeight}`;
    const mueve = medida === ventana.current
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ventana.current = medida;

    if (mueve) {
      for (const el of els) {
        const a = antes.current.get(el.dataset.flip!), b = ahora.get(el.dataset.flip!)!;
        if (!a) continue;
        const dx = a.left - b.left, dy = a.top - b.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        void el.offsetWidth; // fija el punto de partida antes de soltarlo
        el.style.transition = `transform ${ms}ms cubic-bezier(.22,.61,.36,1)`;
        el.style.transform = '';
      }
    }
    antes.current = ahora;
  });
}
