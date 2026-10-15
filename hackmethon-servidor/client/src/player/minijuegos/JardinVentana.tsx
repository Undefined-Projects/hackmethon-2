import { useEffect, useRef, type RefObject } from 'react';
import { azar, clamp, crece, paleta, pintaPlanta, preparar, tramo, type Paleta, type Planta } from '../../lib/jardin';

/**
 * El jardín que envuelve la ventana de un minijuego.
 *
 * La ventana no flota sobre el lobby: la máquina viva la tomó. Del borde
 * de arriba trepan enredaderas, del de abajo cuelgan raíces de circuito,
 * por los costados se escapan ramas y en las esquinas hay buses con
 * componentes soldados. Todas nacen montadas sobre el marco rosa, así
 * que parece que la planta lo abraza; el interior se deja limpio para
 * no estorbar el juego.
 *
 * Brota en cascada cuando la ventana termina de encenderse, y luego
 * corren pulsos de luz por las raíces y los buses. Como en el resto del
 * jardín: un lienzo para las plantas (quieto en cuanto crece) y otro
 * para los pulsos (el único que se repinta en cada cuadro).
 */

export type VarianteVentana = 'snake' | 'plaga' | 'sinapsis' | 'latido';

const RECETA: Record<VarianteVentana, {
  semilla: number; hoja: number; flor: number; chip: number; densidad: number;
  /** Colores de las raíces y de los pulsos, por nombre de variable CSS. */
  raiz: [string, string, string]; luz: string;
}> = {
  snake:    { semilla: 101, hoja: 0.6, flor: 0.32, chip: 0.04, densidad: 1, raiz: ['--violet', '--clorofila-dim', '--blue-dim'], luz: '--clorofila-hi' },
  plaga:    { semilla: 202, hoja: 0.3, flor: 0.1, chip: 0.2, densidad: 1.1, raiz: ['--phos-dim', '--violet', '--blue-dim'], luz: '--phos-hi' },
  sinapsis: { semilla: 303, hoja: 0.18, flor: 0.08, chip: 0.1, densidad: 1.2, raiz: ['--blue-hi', '--blue-dim', '--clorofila-dim'], luz: '--clorofila-hi' },
  latido:   { semilla: 404, hoja: 0.4, flor: 0.2, chip: 0.08, densidad: 1, raiz: ['--phos', '--violet', '--blue-dim'], luz: '--phos-hi' },
};

const BROTE = 1700, RETRASO = 650, PULSO = 1200, CADA = 2200;

type Maceta = { p: Planta; paleta: Paleta; retraso: number; pulsa: boolean };

export function JardinVentana({
  variante, marco,
}: { variante: VarianteVentana; marco: RefObject<HTMLDivElement | null> }) {
  const plantas = useRef<HTMLCanvasElement>(null);
  const luz = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvP = plantas.current, cvL = luz.current, m = marco.current;
    const caja = cvP?.parentElement;
    if (!cvP || !cvL || !m || !caja) return;
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const R = RECETA[variante];
    const css = getComputedStyle(document.documentElement);
    const v = (n: string, d = '#888') => css.getPropertyValue(n).trim() || d;
    const base = paleta();
    const PAL_RAIZ: Paleta = { ...base, tallo: [v(R.raiz[0]), v(R.raiz[1]), v(R.raiz[2]), v('--blue-dim')] };
    const PAL_BUS: Paleta = { ...base, tallo: [v('--blue-hi'), v('--blue-dim'), v('--blue-dim'), v('--blue-dim')] };
    const colorLuz = v(R.luz);

    let W = 0, H = 0, raf = 0, t0 = 0, siguiente = 0;
    let hueco = { x: 0, y: 0, w: 0, h: 0 };
    let macetas: Maceta[] = [];
    let pulsos: { m: Maceta; desde: number }[] = [];
    let brotando = true;
    /** Las medidas con que se sembró: solo se resiembra si cambian. */
    let firma = '';
    const mide = () => {
      const r = m!.getBoundingClientRect();
      return `${caja!.clientWidth}x${caja!.clientHeight}:${Math.round(r.width)}x${Math.round(r.height)}`;
    };

    function siembra() {
      firma = mide();
      W = caja!.clientWidth; H = caja!.clientHeight;
      cvP!.width = cvL!.width = W; cvP!.height = cvL!.height = H;
      const o = caja!.getBoundingClientRect(), r = m!.getBoundingClientRect();
      // El marco sin la transformación de la entrada: se mide ya asentado.
      const x0 = r.left - o.left, y0 = r.top - o.top, x1 = x0 + r.width, y1 = y0 + r.height;
      hueco = { x: x0 + 3, y: y0 + 3, w: r.width - 6, h: r.height - 6 };
      const rnd = azar(R.semilla);
      const arriba = y0, abajo = H - y1, lado = Math.min(x0, W - x1);
      const n = (espacio: number, por: number) => Math.max(1, Math.round((r.width / por) * R.densidad * clamp(espacio / 60, 0.4, 1.4)));
      macetas = [];
      let orden = 0;
      const pon = (p: Planta, pal: Paleta, pulsa: boolean) =>
        macetas.push({ p: preparar(p), paleta: pal, retraso: (orden++ % 9) * 110 + rnd() * 160, pulsa });

      // 1. Enredaderas que trepan desde el borde de arriba.
      const nArriba = n(arriba, 130);
      for (let k = 0; k < nArriba; k++) {
        const x = Math.round(x0 + 14 + (r.width - 28) * (k + 0.2 + rnd() * 0.6) / nArriba);
        pon(crece({
          x, y: y0 + 1, dir: 6, sesgo: 6, tiron: 0.35, rnd,
          caja: [x0 - lado * 0.6, Math.max(2, y0 - Math.min(arriba, 170)), x1 + lado * 0.6, y0 + 4],
          paso: [7, 14], largo: [3, 7], giro: 0.35, rama: 0.4, prof: 3,
          hoja: R.hoja, tamHoja: 9, flor: R.flor, tamFlor: 3, chip: R.chip * 0.5, max: 34,
        }), base, false);
      }

      // 2. Raíces de circuito que cuelgan del borde de abajo.
      const nAbajo = n(abajo, 110);
      for (let k = 0; k < nAbajo; k++) {
        const x = Math.round(x0 + 10 + (r.width - 20) * (k + 0.2 + rnd() * 0.6) / nAbajo);
        pon(crece({
          x, y: y1 - 1, dir: 2, sesgo: 2, tiron: 0.45, rnd,
          caja: [x0 - lado * 0.6, y1 - 4, x1 + lado * 0.6, Math.min(H - 2, y1 + Math.min(abajo, 200))],
          paso: [7, 13], largo: [3, 8], giro: 0.35, rama: 0.42, prof: 3,
          hoja: R.hoja * 0.3, tamHoja: 7, flor: R.flor * 0.4, tamFlor: 2.6, chip: R.chip, max: 40,
        }), PAL_RAIZ, true);
      }

      // 3. Ramas que se escapan por los costados.
      if (lado > 10) {
        for (const [xs, dir, cx0, cx1] of [[x0 + 1, 4, Math.max(2, x0 - Math.min(lado, 200)), x0 + 4], [x1 - 1, 0, x1 - 4, Math.min(W - 2, x1 + Math.min(lado, 200))]] as const) {
          const nLado = Math.max(1, Math.round(((y1 - y0) / 120) * R.densidad));
          for (let k = 0; k < nLado; k++) {
            const y = Math.round(y0 + 20 + (y1 - y0 - 40) * (k + 0.2 + rnd() * 0.6) / nLado);
            pon(crece({
              x: xs, y, dir, sesgo: dir, tiron: 0.3, rnd,
              caja: [cx0, y0 - 40, cx1, y1 + 40],
              paso: [7, 13], largo: [3, 7], giro: 0.4, rama: 0.4, prof: 3,
              hoja: R.hoja, tamHoja: 9, flor: R.flor, tamFlor: 3, chip: R.chip * 0.5, max: 30,
            }), k % 2 ? PAL_RAIZ : base, k % 2 === 1);
          }
        }
      }

      // 4. Buses de circuito en las cuatro esquinas, siguiendo el marco.
      for (const [cx, cy, dir] of [[x0 + 2, y0 + 2, 6], [x1 - 2, y0 + 2, 6], [x0 + 2, y1 - 2, 2], [x1 - 2, y1 - 2, 2]] as const) {
        const fuera = cx < W / 2 ? 4 : 0;
        pon(crece({
          x: cx, y: cy, dir: fuera, sesgo: dir, tiron: 0.3, rnd,
          caja: [cx - 90, cy - 90, cx + 90, cy + 90],
          paso: [10, 16], largo: [3, 5], giro: 0.2, rama: 0.4, prof: 2,
          hoja: 0, flor: 0, chip: 0.3, max: 18,
        }), PAL_BUS, true);
      }
    }

    /** Lo de adentro del marco se borra: el juego se ve limpio. */
    const despeja = (ctx: CanvasRenderingContext2D) => ctx.clearRect(hueco.x, hueco.y, hueco.w, hueco.h);

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
      ctx.lineCap = 'square'; ctx.strokeStyle = colorLuz; ctx.lineWidth = 3;
      for (const q of pulsos) {
        const u = (t - q.desde) / PULSO;
        if (u < 0) continue;
        ctx.globalAlpha = 1 - u * 0.6;
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
          for (let i = 0; i < 3 && vivas.length; i++) pulsos.push({ m: vivas[Math.floor(Math.random() * vivas.length)], desde: t + i * 120 });
          siguiente = t + CADA * (0.7 + Math.random() * 0.6);
        }
        pintaLuz(t);
      }
      raf = requestAnimationFrame(cuadro);
    };

    // Se siembra cuando la ventana ya terminó de encenderse: antes, el
    // marco todavía está escalado y las medidas saldrían chuecas.
    const arranque = setTimeout(() => {
      siembra();
      t0 = performance.now();
      raf = requestAnimationFrame(cuadro);
    }, quieto ? 0 : RETRASO);

    // Si cambia el tamaño (girar el teléfono, otra ventana), se resiembra
    // ya crecido: no vuelve a brotar desde cero.
    let espera: ReturnType<typeof setTimeout> | undefined;
    // (El observador avisa también al empezar a observar: sin la firma,
    // ese primer aviso se saltaría la animación de brote.)
    const ojo = new ResizeObserver(() => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        if (!firma || mide() === firma) return;
        siembra(); t0 = -1e9; brotando = true;
      }, 200);
    });
    ojo.observe(caja);
    ojo.observe(m);
    return () => { clearTimeout(arranque); clearTimeout(espera); cancelAnimationFrame(raf); ojo.disconnect(); };
  }, [variante, marco]);

  return (
    <>
      <canvas ref={plantas} className="jardin-ventana" aria-hidden="true" />
      <canvas ref={luz} className="jardin-ventana jardin-ventana--luz" aria-hidden="true" />
    </>
  );
}
