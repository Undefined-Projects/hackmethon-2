import { useEffect, useRef } from 'react';
import { azar, clamp, crece, paleta, pintaPlanta, preparar, tramo, type Paleta, type Planta } from '../lib/jardin';

/**
 * La maleza de la carrera. Dos piezas, del mismo generador que el sitio,
 * el lobby y los recreos:
 *
 * - `Rastro`: dentro de cada pista, una pista de circuito con hojas que
 *   crece desde la salida DETRÁS del caballo. No se calcula dónde va el
 *   caballo: se mide, así que el rastro lo sigue durante la transición
 *   del CSS en vez de saltar al poste nuevo. Pasar una barrera manda un
 *   pulso de luz por el rastro; llegar a meta lo hace florecer.
 *
 * - `JardinCarrera`: la pared. Raíces de circuito que cuelgan del borde
 *   de arriba, a la derecha de la cabecera, y trepadoras pegadas a los
 *   márgenes. Las raíces laten cada vez que alguien pasa una barrera.
 *
 * Todo a resolución 1:1 y con semilla: la misma sala crece siempre igual.
 */

const BROTE = 1400, PULSO = 1300;

/** Una semilla estable por equipo: la calle no cambia de planta al repintar. */
const semillaDe = (id: string) => [...id].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);

const quieto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Rastro({ equipo, resueltas, meta }: { equipo: string; resueltas: number; meta: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const estado = useRef({ pulso: -1, floreceDesde: meta ? -1e9 : Infinity });

  // Pasó una barrera: pulso. Llegó a meta: florece. Al montar no, que
  // abrir la carrera a media partida no es pasar nada.
  const antes = useRef({ resueltas, meta });
  useEffect(() => {
    const s = estado.current, t = performance.now();
    if (resueltas > antes.current.resueltas) s.pulso = t;
    if (meta && !antes.current.meta) s.floreceDesde = t;
    if (!meta) s.floreceDesde = Infinity;
    antes.current = { resueltas, meta };
  }, [resueltas, meta]);

  useEffect(() => {
    const c = cv.current, pista = c?.parentElement;
    if (!c || !pista) return;
    const ctx = c.getContext('2d')!;
    const P = paleta();
    const css = getComputedStyle(document.documentElement);
    const luzHi = css.getPropertyValue('--clorofila-hi').trim() || '#b4f5d4';
    const sin = quieto();

    let W = 0, H = 0, raf = 0, t0 = 0, ultimo = '';
    let rastro: Planta | null = null, flor: Planta | null = null;

    function siembra() {
      W = c!.width = pista!.clientWidth;
      H = c!.height = pista!.clientHeight;
      ultimo = '';
      const r = azar(semillaDe(equipo));
      // El tronco tiene que cruzar la pista entera, así que su largo
      // sale del ancho; las ramas, del mismo largo, corren a su lado
      // como un bus y se acaban con el presupuesto.
      const paso: [number, number] = [Math.max(6, H * 0.18), Math.max(10, H * 0.32)];
      const n = Math.ceil(W / ((paso[0] + paso[1]) / 2)) + 6;
      rastro = preparar(crece({
        x: 0, y: H - 3, dir: 0, sesgo: 0, tiron: 0.55, rnd: r,
        caja: [0, Math.round(H * 0.42), W - 2, H - 2],
        paso, largo: [n, n + 8], giro: 0.3, rama: 0.07, prof: 1,
        hoja: 0.55, tamHoja: clamp(H * 0.24, 6, 14), flor: 0, chip: 0.09,
        max: n * 3,
      }));
      // La mata de la meta: sube desde el suelo de la calle, justo antes
      // de donde se para el caballo, y se llena de flores.
      const cab = (pista!.querySelector('.caballo') as HTMLElement | null)?.offsetWidth ?? H;
      const x1 = W - cab, x0 = Math.max(0, x1 - H * 1.4);
      flor = preparar(crece({
        x: Math.round((x0 + x1) / 2), y: H - 2, dir: 6, sesgo: 6, tiron: 0.4, rnd: r,
        caja: [x0, 2, x1, H - 2],
        paso: [Math.max(5, H * 0.12), Math.max(8, H * 0.2)], largo: [3, 5], giro: 0.35, rama: 0.6, prof: 3,
        hoja: 0.5, tamHoja: clamp(H * 0.14, 4, 9), flor: 0.9, tamFlor: clamp(H * 0.05, 2, 4),
        max: 26,
      }));
    }

    const cuadro = (t: number) => {
      raf = requestAnimationFrame(cuadro);
      const s = estado.current;
      const caballo = pista!.querySelector('.caballo') as HTMLElement | null;
      // `.caballo` se centra con translateX(-50%): su `left` es su centro.
      const hasta = Math.min(caballo?.offsetLeft ?? 0, sin ? W : ((t - t0) / BROTE) * W);
      const kp = (t - s.pulso) / PULSO;
      const kf = sin ? (s.floreceDesde <= t ? 1 : 0) : clamp((t - s.floreceDesde) / BROTE);
      const pulsando = !sin && kp >= 0 && kp < 1;
      const firma = `${Math.round(hasta)},${kf.toFixed(2)}`;
      if (!pulsando && firma === ultimo) return;
      ultimo = pulsando ? '' : firma;

      ctx.clearRect(0, 0, W, H);
      if (!rastro) return;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, Math.max(0, hasta), H); ctx.clip();
      pintaPlanta(ctx, rastro, 1, P);
      if (pulsando) {
        ctx.strokeStyle = luzHi; ctx.lineWidth = 3; ctx.globalAlpha = 1 - kp * 0.6;
        const D = kp * rastro.dmax!;
        for (const tl of rastro.tallos) {
          const a = D - tl.d0 - 30, b = D - tl.d0;
          if (b > 0 && a < tl.len) tramo(ctx, tl, Math.max(0, a), Math.min(tl.len, b));
        }
      }
      ctx.restore();
      if (flor && kf > 0) pintaPlanta(ctx, flor, 1 - (1 - kf) ** 3, P);
    };

    siembra();
    t0 = performance.now();
    raf = requestAnimationFrame(cuadro);

    let espera: ReturnType<typeof setTimeout> | undefined;
    const ojo = new ResizeObserver(() => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        if (pista.clientWidth === W && pista.clientHeight === H) return;
        siembra(); t0 = -1e9; // ya crecido: no vuelve a brotar por mover la ventana
      }, 160);
    });
    ojo.observe(pista);
    return () => { cancelAnimationFrame(raf); clearTimeout(espera); ojo.disconnect(); };
  }, [equipo]);

  return <canvas ref={cv} className="rastro" aria-hidden="true" />;
}

type Maceta = { p: Planta; paleta: Paleta; retraso: number; pulsa: boolean };

export function JardinCarrera({ latido }: { latido: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const fondo = useRef<HTMLCanvasElement>(null);
  const luz = useRef<HTMLCanvasElement>(null);
  const disparo = useRef<(() => void) | null>(null);

  useEffect(() => {
    const div = caja.current, cvF = fondo.current, cvL = luz.current;
    const sala = div?.parentElement?.parentElement; // .carrera → .admin-carrera
    if (!div || !cvF || !cvL || !sala) return;
    const sin = quieto();
    const base = paleta();
    const css = getComputedStyle(document.documentElement);
    const v = (n: string, d: string) => css.getPropertyValue(n).trim() || d;
    const PAL_RAIZ: Paleta = { ...base, tallo: [v('--violet', '#a32198'), v('--clorofila-dim', '#23805a'), v('--blue-dim', '#2f4a9a'), v('--blue-dim', '#2f4a9a')] };
    const luzHi = v('--clorofila-hi', '#b4f5d4');

    let macetas: Maceta[] = [];
    let W = 0, H = 0, raf = 0, t0 = 0, siguiente = 0, brotando = true;
    let pulsos: { m: Maceta; desde: number }[] = [];

    function siembra() {
      W = cvF!.width = cvL!.width = div!.clientWidth;
      H = cvF!.height = cvL!.height = div!.clientHeight;
      const r = azar(9091);
      macetas = [];
      // Las raíces no bajan de los números de barrera: por encima la
      // pared es suya; por debajo, postes y calles tienen que leerse.
      const postes = sala!.querySelector('.carrera-postes');
      const techo = postes
        ? postes.getBoundingClientRect().top - div!.getBoundingClientRect().top - 2
        : H * 0.12;
      const ancho = W > 900, n = ancho ? 6 : 3;
      for (let k = 0; k < n; k++) {
        // De la mitad derecha hacia el canto: la cabecera va a la izquierda.
        const x = Math.round(W * (0.5 + 0.47 * (k + r() * 0.7) / n));
        macetas.push({
          p: preparar(crece({
            x, y: 0, dir: 2, sesgo: 2, tiron: 0.45, rnd: r,
            caja: [W * 0.46, 0, W - 2, Math.max(20, techo)],
            paso: ancho ? [9, 16] : [6, 10], largo: [4, 9], giro: 0.4, rama: 0.45, prof: 3,
            hoja: 0.2, tamHoja: 8, flor: 0.12, tamFlor: 3, chip: 0.14, max: ancho ? 50 : 24,
          })),
          paleta: PAL_RAIZ, retraso: k * 150, pulsa: true,
        });
      }
      // Trepadoras por los márgenes del tubo, desde las esquinas de abajo.
      const pad = Math.max(10, parseFloat(getComputedStyle(sala!).paddingLeft) - 2);
      for (const [x, x0, x1] of [[3, 0, pad], [W - 3, W - pad, W]] as const) {
        macetas.push({
          p: preparar(crece({
            x, y: H, dir: 6, sesgo: 6, tiron: 0.45, rnd: r,
            caja: [x0, H * 0.1, x1, H],
            paso: [8, 14], largo: [5, 9], giro: 0.3, rama: 0.35, prof: 2,
            hoja: 0.65, tamHoja: Math.min(12, pad * 0.45), flor: 0.3, tamFlor: 3, chip: 0.04, max: ancho ? 90 : 40,
          })),
          paleta: base, retraso: 500, pulsa: false,
        });
      }
    }

    function pintaFondo(t: number) {
      const ctx = cvF!.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);
      let listo = true;
      for (const m of macetas) {
        const k = sin ? 1 : clamp((t - t0 - m.retraso) / (BROTE * 1.8));
        if (k < 1) listo = false;
        if (k > 0) pintaPlanta(ctx, m.p, 1 - (1 - k) ** 3, m.paleta);
      }
      return listo;
    }

    function pintaLuz(t: number) {
      const ctx = cvL!.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'square'; ctx.strokeStyle = luzHi; ctx.lineWidth = 3;
      pulsos = pulsos.filter((q) => t - q.desde < PULSO);
      for (const q of pulsos) {
        const u = (t - q.desde) / PULSO;
        if (u < 0) continue;
        ctx.globalAlpha = 1 - u * 0.6;
        const D = u * q.m.p.dmax!;
        for (const tl of q.m.p.tallos) {
          const a = D - tl.d0 - 26, b = D - tl.d0;
          if (b > 0 && a < tl.len) tramo(ctx, tl, Math.max(0, a), Math.min(tl.len, b));
        }
      }
      ctx.globalAlpha = 1;
    }

    const lanza = (t: number, cuantos: number) => {
      const raices = macetas.filter((m) => m.pulsa);
      for (let i = 0; i < cuantos && raices.length; i++)
        pulsos.push({ m: raices[Math.floor(Math.random() * raices.length)], desde: t + i * 90 });
    };
    disparo.current = () => lanza(performance.now(), 4);

    const cuadro = (t: number) => {
      if (brotando) brotando = !pintaFondo(t);
      if (!sin) {
        if (t >= siguiente) { lanza(t, 1); siguiente = t + 3200 * (0.7 + Math.random() * 0.6); }
        pintaLuz(t);
      }
      raf = requestAnimationFrame(cuadro);
    };

    siembra();
    t0 = performance.now();
    siguiente = t0 + BROTE * 2;
    raf = requestAnimationFrame(cuadro);

    let espera: ReturnType<typeof setTimeout> | undefined;
    const ojo = new ResizeObserver(() => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        if (div.clientWidth === W && div.clientHeight === H) return;
        siembra(); t0 = -1e9; brotando = true;
      }, 200);
    });
    ojo.observe(div);
    return () => { cancelAnimationFrame(raf); clearTimeout(espera); ojo.disconnect(); disparo.current = null; };
  }, []);

  // Alguien pasó una barrera: la pared late.
  const primero = useRef(true);
  useEffect(() => {
    if (primero.current) { primero.current = false; return; }
    disparo.current?.();
  }, [latido]);

  return (
    <div ref={caja} className="jardin-carrera" aria-hidden="true">
      <canvas ref={fondo} />
      <canvas ref={luz} />
    </div>
  );
}
