import { useEffect, useRef } from 'react';
import { azar, clamp, crece, paleta, pintaPlanta, preparar, tramo, type Paleta, type Planta } from '../lib/jardin';

/**
 * El jardín del lobby: vegetación y circuitos que abrazan los bordes de
 * los paneles (la lámina del robot y las dos fichas).
 *
 * Es el mismo jardín que envuelve las ventanas de los minijuegos, pero
 * con varios marcos a la vez: de cada borde superior trepan enredaderas,
 * de cada inferior cuelgan raíces de circuito, por los costados se
 * escapan ramas y en las esquinas hay buses con componentes. Las plantas
 * montan los bordes y el interior de cada panel se deja limpio.
 *
 * Brota al llegar al lobby y luego corren pulsos de luz por raíces y
 * buses. Un lienzo para las plantas (quieto en cuanto crece) y otro para
 * los pulsos (el único que se repinta en cada cuadro).
 */

const BROTE = 1900, PULSO = 1300, CADA = 2000;
/** Hasta dónde se alejan las plantas de su borde, en px. */
const ALCANCE = { arriba: 70, abajo: 110, lado: 120 };

type Maceta = { p: Planta; paleta: Paleta; retraso: number; pulsa: boolean };

export function JardinLobby({ selectores, techo }: {
  selectores: string[];
  /** Lo que las plantas no deben tapar por arriba (la fila del equipo):
   *  nada trepa más alto que su borde inferior. */
  techo?: string;
}) {
  const plantas = useRef<HTMLCanvasElement>(null);
  const luz = useRef<HTMLCanvasElement>(null);
  const firmaSel = selectores.join('|');

  useEffect(() => {
    const cvP = plantas.current, cvL = luz.current;
    const caja = cvP?.parentElement;
    if (!cvP || !cvL || !caja) return;
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const css = getComputedStyle(document.documentElement);
    const v = (n: string, d = '#888') => css.getPropertyValue(n).trim() || d;
    const base = paleta();
    const PAL_RAIZ: Paleta = { ...base, tallo: [v('--violet'), v('--clorofila-dim'), v('--blue-dim'), v('--blue-dim')] };
    const PAL_BUS: Paleta = { ...base, tallo: [v('--blue-hi'), v('--blue-dim'), v('--blue-dim'), v('--blue-dim')] };
    const luzVerde = v('--clorofila-hi'), luzRosa = v('--phos-hi');

    let W = 0, H = 0, raf = 0, t0 = 0, siguiente = 0, brotando = true, firma = '';
    let huecos: { x: number; y: number; w: number; h: number }[] = [];
    let macetas: Maceta[] = [];
    let pulsos: { m: Maceta; desde: number }[] = [];

    const marcos = () => selectores.flatMap((s) => [...caja!.querySelectorAll<HTMLElement>(s)]);
    const mide = () => {
      const o = caja!.getBoundingClientRect();
      return [caja!.clientWidth, caja!.clientHeight, ...marcos().map((m) => {
        const r = m.getBoundingClientRect();
        return `${Math.round(r.left - o.left)},${Math.round(r.top - o.top)},${Math.round(r.width)},${Math.round(r.height)}`;
      })].join(';');
    };

    function siembra() {
      firma = mide();
      W = caja!.clientWidth; H = caja!.clientHeight;
      cvP!.width = cvL!.width = W; cvP!.height = cvL!.height = H;
      const o = caja!.getBoundingClientRect();
      const rnd = azar(7070);
      macetas = []; huecos = [];
      const t = techo ? caja!.querySelector(techo)?.getBoundingClientRect() : null;
      const tope = t ? t.bottom - o.top + 4 : 2;
      let orden = 0;
      const pon = (p: Planta, pal: Paleta, pulsa: boolean) =>
        macetas.push({ p: preparar(p), paleta: pal, retraso: (orden++ % 12) * 95 + rnd() * 200, pulsa });

      for (const m of marcos()) {
        const r = m.getBoundingClientRect();
        const x0 = r.left - o.left, y0 = r.top - o.top, x1 = x0 + r.width, y1 = y0 + r.height;
        if (r.width < 40 || r.height < 40) continue;
        huecos.push({ x: x0 + 3, y: y0 + 3, w: r.width - 6, h: r.height - 6 });

        // Enredaderas que trepan desde el borde de arriba.
        const nArriba = Math.max(1, Math.round(r.width / 150));
        for (let k = 0; k < nArriba; k++) {
          const x = Math.round(x0 + 12 + (r.width - 24) * (k + 0.2 + rnd() * 0.6) / nArriba);
          pon(crece({
            x, y: y0 + 1, dir: 6, sesgo: 6, tiron: 0.35, rnd,
            caja: [x0 - 30, Math.max(tope, y0 - ALCANCE.arriba), x1 + 30, y0 + 4],
            paso: [6, 12], largo: [3, 6], giro: 0.35, rama: 0.4, prof: 3,
            hoja: 0.6, tamHoja: 8, flor: 0.3, tamFlor: 3, chip: 0.03, max: 22,
          }), base, false);
        }
        // Raíces de circuito que cuelgan del borde de abajo.
        const nAbajo = Math.max(1, Math.round(r.width / 120));
        for (let k = 0; k < nAbajo; k++) {
          const x = Math.round(x0 + 10 + (r.width - 20) * (k + 0.2 + rnd() * 0.6) / nAbajo);
          pon(crece({
            x, y: y1 - 1, dir: 2, sesgo: 2, tiron: 0.45, rnd,
            caja: [x0 - 30, y1 - 4, x1 + 30, Math.min(H - 2, y1 + ALCANCE.abajo)],
            paso: [6, 12], largo: [3, 7], giro: 0.35, rama: 0.42, prof: 3,
            hoja: 0.15, tamHoja: 7, flor: 0.08, tamFlor: 2.6, chip: 0.16, max: 26,
          }), PAL_RAIZ, true);
        }
        // Ramas que se escapan por los costados.
        for (const [xs, dir, cx0, cx1] of [
          [x0 + 1, 4, Math.max(2, x0 - ALCANCE.lado), x0 + 4],
          [x1 - 1, 0, x1 - 4, Math.min(W - 2, x1 + ALCANCE.lado)],
        ] as const) {
          if (Math.abs(cx1 - cx0) < 20) continue;
          const nLado = Math.max(1, Math.round(r.height / 170));
          for (let k = 0; k < nLado; k++) {
            const y = Math.round(y0 + 16 + (r.height - 32) * (k + 0.2 + rnd() * 0.6) / nLado);
            pon(crece({
              x: xs, y, dir, sesgo: dir, tiron: 0.3, rnd,
              caja: [cx0, Math.max(tope, y0 - 30), cx1, y1 + 30],
              paso: [6, 12], largo: [3, 6], giro: 0.4, rama: 0.4, prof: 3,
              hoja: 0.6, tamHoja: 8, flor: 0.28, tamFlor: 3, chip: 0.05, max: 22,
            }), k % 2 ? PAL_RAIZ : base, k % 2 === 1);
          }
        }
        // Buses de circuito en las cuatro esquinas, siguiendo el marco.
        for (const [cx, cy, sesgo] of [[x0 + 2, y0 + 2, 6], [x1 - 2, y0 + 2, 6], [x0 + 2, y1 - 2, 2], [x1 - 2, y1 - 2, 2]] as const) {
          pon(crece({
            x: cx, y: cy, dir: cx < (x0 + x1) / 2 ? 4 : 0, sesgo, tiron: 0.3, rnd,
            caja: [cx - 70, Math.max(tope, cy - 70), cx + 70, cy + 70],
            paso: [9, 15], largo: [3, 5], giro: 0.2, rama: 0.4, prof: 2,
            hoja: 0, flor: 0, chip: 0.32, max: 14,
          }), PAL_BUS, true);
        }
      }
    }

    const despeja = (ctx: CanvasRenderingContext2D) => { for (const h of huecos) ctx.clearRect(h.x, h.y, h.w, h.h); };

    function pintaPlantas(t: number) {
      const ctx = cvP!.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);
      let listo = true;
      for (const mc of macetas) {
        const k = quieto ? 1 : clamp((t - t0 - mc.retraso) / BROTE);
        if (k < 1) listo = false;
        if (k > 0) pintaPlanta(ctx, mc.p, 1 - (1 - k) ** 3, mc.paleta);
      }
      despeja(ctx);
      return listo;
    }

    function pintaLuz(t: number) {
      const ctx = cvL!.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);
      pulsos = pulsos.filter((q) => t - q.desde < PULSO);
      ctx.lineCap = 'square'; ctx.lineWidth = 3;
      for (const q of pulsos) {
        const u = (t - q.desde) / PULSO;
        if (u < 0) continue;
        ctx.globalAlpha = 1 - u * 0.6;
        ctx.strokeStyle = q.m.paleta === PAL_BUS ? luzRosa : luzVerde;
        const D = u * q.m.p.dmax!;
        for (const tl of q.m.p.tallos) {
          const a = D - tl.d0 - 22, b = D - tl.d0;
          if (b > 0 && a < tl.len) tramo(ctx, tl, Math.max(0, a), Math.min(tl.len, b));
        }
      }
      ctx.globalAlpha = 1;
      despeja(ctx);
    }

    const cuadro = (t: number) => {
      if (brotando) brotando = !pintaPlantas(t);
      if (!quieto && !brotando) {
        if (t >= siguiente) {
          const vivas = macetas.filter((mc) => mc.pulsa);
          for (let i = 0; i < 4 && vivas.length; i++) pulsos.push({ m: vivas[Math.floor(Math.random() * vivas.length)], desde: t + i * 110 });
          siguiente = t + CADA * (0.7 + Math.random() * 0.6);
        }
        pintaLuz(t);
      }
      raf = requestAnimationFrame(cuadro);
    };

    // Un respiro antes de sembrar: que el lobby termine de acomodarse.
    const arranque = setTimeout(() => {
      siembra();
      t0 = performance.now();
      raf = requestAnimationFrame(cuadro);
    }, quieto ? 0 : 250);

    // Si cambian las medidas (otra ficha, otra ventana), se resiembra ya
    // crecido: no vuelve a brotar desde cero.
    let espera: ReturnType<typeof setTimeout> | undefined;
    const vigila = () => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        if (!firma || mide() === firma) return;
        siembra(); t0 = -1e9; brotando = true;
      }, 180);
    };
    const ojo = new ResizeObserver(vigila);
    ojo.observe(caja);
    for (const m of marcos()) ojo.observe(m);
    caja.querySelectorAll<HTMLElement>('.lamina__lado').forEach((m) => ojo.observe(m));
    return () => { clearTimeout(arranque); clearTimeout(espera); cancelAnimationFrame(raf); ojo.disconnect(); };
  }, [firmaSel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <canvas ref={plantas} className="jardin-lobby" aria-hidden="true" />
      <canvas ref={luz} className="jardin-lobby jardin-lobby--luz" aria-hidden="true" />
    </>
  );
}
