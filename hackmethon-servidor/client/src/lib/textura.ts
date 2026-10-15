import { azar, crece } from './jardin';

/**
 * La textura de nervaduras del fondo, la misma de la portada 2.0
 * (hackmethon-2/sitio/jardin.js, sección 4): pistas de circuito a 45°
 * que se ramifican como hojas, casi invisibles. Va como fondo de #root
 * con `background-attachment:local`, así que se desplaza con la página
 * y solo asoma en márgenes y huecos.
 *
 * Misma semilla que el sitio: sale el mismo dibujo en las dos pantallas.
 */
export function sembrarTextura(destino: HTMLElement) {
  const T = 520, r = azar(31337);
  const raiz = getComputedStyle(document.documentElement);
  const tono = (n: string, d: string) => raiz.getPropertyValue(n).trim() || d;
  const verde = tono('--clorofila', '#3ddc97'), azul = tono('--blue-hi', '#4f86ee');

  let trazos = '';
  for (let k = 0; k < 6; k++) {
    const p = crece({
      x: Math.round(r() * T), y: Math.round(r() * T), dir: Math.floor(r() * 8), rnd: r,
      caja: [0, 0, T, T], paso: [10, 22], largo: [5, 12], giro: 0.35, rama: 0.45, prof: 3,
      hoja: 0, flor: 0, max: 60,
    });
    const c = k % 2 ? azul : verde;
    for (const t of p.tallos)
      trazos += `<polyline points="${t.pts.map((q) => q.join(',')).join(' ')}" stroke="${c}" stroke-opacity="${t.prof ? 0.05 : 0.08}"/>`;
    for (const v of p.vias)
      trazos += `<circle cx="${v.x}" cy="${v.y}" r="2" stroke="${c}" stroke-opacity=".08"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}" fill="none" stroke-width="1.5" shape-rendering="crispEdges">${trazos}</svg>`;
  destino.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
