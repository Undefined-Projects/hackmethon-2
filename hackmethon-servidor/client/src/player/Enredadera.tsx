import { useEffect, useRef } from 'react';
import { azar, clamp, crece, paleta, pintaPlanta, preparar, type Planta } from '../lib/jardin';

/**
 * Las enredaderas de los paneles de la portada 2.0, en cada fase del
 * lobby. Nacen soldadas al marco y crecen hacia el margen: en
 * escritorio hay margen de sobra y se abren; en un teléfono hay 14 px y
 * trepan pegadas al marco. Mientras más abajo la fase, más semillas y
 * más hondas las ramas, como en el sitio — pero a menos de la mitad
 * de su densidad: una fase mide la quinta parte que un panel de la
 * portada, y siete juntas con la receta del sitio eran un muro.
 *
 * Una fase resuelta florece: mismas semillas, más flores. Así el
 * lobby se va llenando de lo vivo conforme el equipo avanza.
 *
 * Se pinta en dos <canvas> a resolución 1:1, uno por margen, y solo
 * se anima al brotar: después queda quieta y solo se resiembra si
 * cambian las medidas.
 */
const ORILLA = 14, PAD = 14, BROTE = 1500;

export function Enredadera({ indice, florece }: { indice: number; florece: boolean }) {
  const izqRef = useRef<HTMLCanvasElement>(null);
  const derRef = useRef<HTMLCanvasElement>(null);
  // Lo que ya creció, creció: un resize o un cambio de estado no la
  // vuelve a sembrar desde cero.
  const crecido = useRef(0);

  useEffect(() => {
    const izq = izqRef.current, der = derRef.current;
    const panel = izq?.parentElement;
    const tubo = document.getElementById('root');
    if (!izq || !der || !panel || !tubo) return;

    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const P = paleta();
    let capas: { ctx: CanvasRenderingContext2D; ox: number; plantas: Planta[] }[] = [];
    let raf = 0, firma = '';

    function siembra() {
      const pr = panel!.getBoundingClientRect(), tr = tubo!.getBoundingClientRect();
      const margen = pr.left - (tr.left + parseFloat(getComputedStyle(tubo!).paddingLeft));
      const W = panel!.offsetWidth, H = panel!.offsetHeight;
      const nueva = `${W},${H},${Math.round(margen)}`;
      if (nueva === firma) return false;
      firma = nueva;

      const M = Math.round(clamp(margen - 6, 8, 230));
      const amplio = M > 60;
      const i = indice;
      // Las coordenadas son las de un solo lienzo de W + 2M; se pinta en
      // dos franjas, una por margen, para no reservar la fase entera.
      const bl = panel!.clientLeft, bt = panel!.clientTop;
      const ubica = (c: HTMLCanvasElement, x: number) => {
        c.width = M + ORILLA; c.height = H + 2 * PAD;
        c.style.cssText = `left:${x - bl}px;top:${-PAD - bt}px;width:${c.width}px;height:${c.height}px`;
        return c.getContext('2d')!;
      };
      capas = [
        { ctx: ubica(izq!, -M), ox: 0, plantas: [] },
        { ctx: ubica(der!, W - ORILLA), ox: -(M + W - ORILLA), plantas: [] },
      ];

      const r = azar(1000 + i * 7919);
      const semillas = amplio ? 1 + (i >> 1) : 1;
      for (let s = 0; s < semillas; s++) {
        const lado = s % 2 === 0;
        const y = Math.round(H * (0.06 + 0.88 * r()));
        capas[lado ? 0 : 1].plantas.push(preparar(crece({
          x: lado ? M : M + W, y,
          dir: lado ? [4, 3, 5][Math.floor(r() * 3)] : [0, 1, 7][Math.floor(r() * 3)],
          rnd: r,
          caja: lado ? [3, 3, M + 2, H - 3] : [M + W - 2, 3, W + 2 * M - 3, H - 3],
          paso: amplio ? [8, 16] : [6, 10],
          largo: [2 + (i >> 2), 4 + (i >> 1)],
          giro: 0.3,
          rama: amplio ? 0.38 : 0.22,
          prof: Math.min(3, 1 + (i >> 2) + (amplio ? 1 : 0)),
          hoja: 0.6, tamHoja: amplio ? 10 : 6,
          flor: (florece ? 0.45 : 0.1) + i * 0.035, tamFlor: amplio ? 3 : 2.4,
          chip: amplio ? 0.06 : 0,
          max: amplio ? 26 + i * 9 : 14 + i * 3,
        })));
      }
      return true;
    }

    function pinta(f: number) {
      for (const c of capas) {
        const { ctx } = c;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.setTransform(1, 0, 0, 1, c.ox, PAD);
        for (const p of c.plantas) pintaPlanta(ctx, p, f, P);
      }
    }

    // Brota en cascada: cada fase un poco después que la de arriba.
    function brota() {
      cancelAnimationFrame(raf);
      if (quieto || crecido.current >= 1) { crecido.current = 1; pinta(1); return; }
      const desde = crecido.current, t0 = performance.now() + indice * 140;
      const paso = (t: number) => {
        const k = clamp((t - t0) / BROTE), e = 1 - (1 - k) ** 3;
        crecido.current = desde + (1 - desde) * e;
        pinta(crecido.current);
        if (k < 1) raf = requestAnimationFrame(paso);
      };
      raf = requestAnimationFrame(paso);
    }

    siembra();
    brota();

    // Se resiembra solo si cambian las medidas de verdad: la fase
    // cambia de alto al partirse un texto, o el margen al girar la
    // pantalla. Con un poco de espera, para no sembrar en cada cuadro.
    let espera: ReturnType<typeof setTimeout> | undefined;
    const vigila = () => {
      clearTimeout(espera);
      espera = setTimeout(() => { if (siembra()) brota(); }, 160);
    };
    const ojo = new ResizeObserver(vigila);
    ojo.observe(panel);
    ojo.observe(tubo);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(espera);
      ojo.disconnect();
    };
  }, [indice, florece]);

  return (
    <>
      <canvas ref={izqRef} className="enredadera" aria-hidden="true" />
      <canvas ref={derRef} className="enredadera" aria-hidden="true" />
    </>
  );
}
