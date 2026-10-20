import { useEffect, useRef } from 'react';
import { azar, clamp, crece, paleta, pintaPlanta, preparar, tramo, type Paleta, type Planta } from '../lib/jardin';

/**
 * El jardín de fondo de las escenas de minijuego, del mapa de ataque y,
 * detrás de su vista, de cada puesto del jugador.
 *
 * La pared del recreo no es una tabla sobre negro: es la máquina viva
 * de la portada. Del borde de arriba cuelgan raíces de circuito, desde
 * las esquinas de abajo trepan enredaderas, y por los costados corren
 * buses con componentes soldados. Todo sale del mismo generador que el
 * sitio y el lobby.
 *
 * Por las raíces baja un pulso de luz cada tanto, y uno más cada vez
 * que alguien de la sala mejora su puntaje (`latido`): la pared late
 * con el ranking.
 *
 * Dos lienzos: el del jardín se pinta mientras brota y luego se queda
 * quieto; el de los pulsos es el único que se repinta en cada cuadro,
 * y solo dibuja unos cuantos tramos cortos.
 */

type Variante = 'enredadera' | 'plaga' | 'sinapsis' | 'latido' | 'ataque' | 'robot' | 'espera' | 'terminal' | 'datos' | 'pantalla';

/** Cada juego crece distinto: el snake más vivo y con flores; la plaga
 *  más circuito, más chips, menos hojas. */
const RECETA: Record<Variante, { semilla: number; hoja: number; flor: number; chip: number; raices: number }> = {
  enredadera: { semilla: 313, hoja: 0.55, flor: 0.3, chip: 0.04, raices: 7 },
  plaga:      { semilla: 777, hoja: 0.22, flor: 0.08, chip: 0.16, raices: 9 },
  // Dendritas: muy ramificadas, casi sin hojas.
  sinapsis:   { semilla: 4242, hoja: 0.12, flor: 0.05, chip: 0.1, raices: 11 },
  // Vasos: el corazón alimenta la pared, con algo de vida.
  latido:     { semilla: 7272, hoja: 0.35, flor: 0.18, chip: 0.08, raices: 8 },
  // La ventana de ataques: más circuito que hoja, que es una sala de
  // guerra, pero con la maleza colándose igual.
  ataque:     { semilla: 6661, hoja: 0.32, flor: 0.14, chip: 0.15, raices: 8 },
  // Detrás del robot que se destroza: mitad jardín, mitad placa, como él.
  robot:      { semilla: 1919, hoja: 0.45, flor: 0.22, chip: 0.14, raices: 10 },
  // La espera de la proyección: la más frondosa, que se pasa horas en la pared.
  espera:     { semilla: 2020, hoja: 0.5, flor: 0.3, chip: 0.1, raices: 10 },
  // Los tres puestos, de fondo detrás de su vista. La consola es la más
  // máquina —pistas y chips, apenas una hoja—; la base de datos, raíces
  // y vida que la alimentan; la pantalla, a medias entre las dos.
  terminal:   { semilla: 3141, hoja: 0.18, flor: 0.05, chip: 0.22, raices: 6 },
  datos:      { semilla: 2718, hoja: 0.45, flor: 0.24, chip: 0.08, raices: 8 },
  pantalla:   { semilla: 1618, hoja: 0.32, flor: 0.15, chip: 0.14, raices: 7 },
};

const BROTE = 2600, PULSO = 1300, CADA = 2600;

type Maceta = { p: Planta; paleta: Paleta; retraso: number; pulsa: boolean };

/**
 * `marco` cambia el reparto: en vez de llenar una pared, la máquina crece
 * en una franja de ese ancho a cada lado —el borde de una vista del
 * jugador, montándose sobre él— y como hierba a lo largo del canto de
 * abajo. El centro se queda limpio: ahí hay tablas y salidas que leer.
 */
export function JardinEscena({ variante, latido, marco }: { variante: Variante; latido: number; marco?: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const fondo = useRef<HTMLCanvasElement>(null);
  const luz = useRef<HTMLCanvasElement>(null);
  const disparo = useRef<(() => void) | null>(null);

  useEffect(() => {
    const div = caja.current, cvF = fondo.current, cvL = luz.current;
    if (!div || !cvF || !cvL) return;
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const R = RECETA[variante];
    const base = paleta();
    // Las raíces van en tonos de micelio, como entre los paneles del
    // sitio; las trepadoras en clorofila; los buses en el cañón azul.
    const css = getComputedStyle(document.documentElement);
    const v = (n: string, d: string) => css.getPropertyValue(n).trim() || d;
    const azulDim = v('--blue-dim', '#2f4a9a'), violeta = v('--violet', '#a32198');
    const verdeDim = v('--clorofila-dim', '#23805a'), azulHi = v('--blue-hi', '#4f86ee');
    const PAL_RAIZ: Paleta = { ...base, tallo: [violeta, verdeDim, azulDim, azulDim] };
    const PAL_BUS: Paleta = { ...base, tallo: [azulHi, azulDim, azulDim, azulDim] };
    const luzHi = v('--clorofila-hi', '#b4f5d4'), luzPhos = v('--phos-hi', '#ffd3ee');

    let macetas: Maceta[] = [];
    let W = 0, H = 0, raf = 0, t0 = 0;
    let pulsos: { m: Maceta; desde: number }[] = [];
    let siguiente = 0;

    function siembra() {
      W = div!.clientWidth; H = div!.clientHeight;
      cvF!.width = cvL!.width = W; cvF!.height = cvL!.height = H;
      const r = azar(R.semilla);
      const ancho = W > 900;
      macetas = [];
      if (marco) return siembraMarco(r, Math.min(marco, W * 0.3));

      // 1. Raíces que cuelgan del borde de arriba, a los dos lados del
      //    título: la franja del centro se deja limpia para que el
      //    nombre del juego se lea desde la última fila.
      for (let k = 0; k < R.raices; k++) {
        const lado = k % 2, n = Math.ceil(R.raices / 2), j = k >> 1;
        const u = 0.03 + 0.28 * (j + r() * 0.6) / n;
        const x = Math.round(W * (lado ? 1 - u : u));
        macetas.push({
          p: preparar(crece({
            x, y: 0, dir: 2, sesgo: 2, tiron: 0.45, rnd: r,
            caja: lado ? [W * 0.66, 0, W, H * (0.22 + r() * 0.2)] : [0, 0, W * 0.34, H * (0.22 + r() * 0.2)],
            paso: ancho ? [10, 20] : [7, 12], largo: [4, 9], giro: 0.35, rama: 0.42, prof: 3,
            hoja: R.hoja * 0.4, tamHoja: 8, flor: R.flor * 0.5, tamFlor: 3,
            chip: R.chip, max: ancho ? 60 : 30,
          })),
          paleta: PAL_RAIZ, retraso: k * 140, pulsa: true,
        });
      }

      // 2. Trepadoras desde las esquinas de abajo, pegadas a los costados.
      const margen = Math.max(40, W * 0.14);
      for (const [x, dir, x0, x1] of [[6, 7, 0, margen], [W - 6, 5, W - margen, W]] as const) {
        for (let k = 0; k < 2; k++) {
          macetas.push({
            p: preparar(crece({
              x: x + (k ? (dir === 7 ? 30 : -30) : 0), y: H, dir: 6, sesgo: 6, tiron: 0.4, rnd: r,
              caja: [x0, H * 0.3, x1, H],
              paso: [10, 18], largo: [4, 8], giro: 0.3, rama: 0.4, prof: 3,
              hoja: R.hoja + 0.15, tamHoja: 11, flor: R.flor, tamFlor: 3.5,
              chip: R.chip * 0.5, max: ancho ? 80 : 35,
            })),
            paleta: base, retraso: 400 + k * 260, pulsa: false,
          });
        }
      }

      // 3. Buses de circuito que corren por los costados, a media altura.
      for (const [x, dir] of [[2, 0], [W - 2, 4]] as const) {
        macetas.push({
          p: preparar(crece({
            // Salen del canto hacia adentro y, al topar con su franja,
            // bajan pegados al marco como una pista de tarjeta.
            x, y: Math.round(H * (0.35 + r() * 0.2)), dir, sesgo: 2, tiron: 0.25, rnd: r,
            caja: dir === 0 ? [0, H * 0.25, margen * 0.7, H * 0.85] : [W - margen * 0.7, H * 0.25, W, H * 0.85],
            paso: [12, 20], largo: [3, 7], giro: 0.25, rama: 0.35, prof: 2,
            hoja: 0, flor: 0, chip: R.chip + 0.18, max: 40,
          })),
          paleta: PAL_BUS, retraso: 800, pulsa: true,
        });
      }
    }

    // El marco de una vista: raíces colgando por las dos franjas,
    // trepadoras desde las esquinas, un bus por costado y una fila de
    // hierba a lo largo del canto de abajo.
    function siembraMarco(r: () => number, B: number) {
      const franja = (lado: number, y0: number, y1: number): [number, number, number, number] =>
        lado ? [W - B, y0, W, y1] : [0, y0, B, y1];
      for (let k = 0; k < R.raices; k++) {
        const lado = k % 2;
        const u = B * (0.15 + 0.7 * r());
        macetas.push({
          p: preparar(crece({
            x: Math.round(lado ? W - u : u), y: 0, dir: 2, sesgo: 2, tiron: 0.45, rnd: r,
            caja: franja(lado, 0, H * (0.3 + r() * 0.35)),
            paso: [7, 14], largo: [4, 8], giro: 0.35, rama: 0.42, prof: 3,
            hoja: R.hoja * 0.6, tamHoja: 7, flor: R.flor * 0.6, tamFlor: 2.8,
            chip: R.chip, max: 34,
          })),
          paleta: PAL_RAIZ, retraso: k * 140, pulsa: true,
        });
      }
      for (const lado of [0, 1]) {
        for (let k = 0; k < 2; k++) {
          const x = lado ? W - 6 - k * B * 0.4 : 6 + k * B * 0.4;
          macetas.push({
            p: preparar(crece({
              x: Math.round(x), y: H, dir: 6, sesgo: 6, tiron: 0.4, rnd: r,
              caja: franja(lado, H * 0.35, H),
              paso: [8, 15], largo: [4, 8], giro: 0.3, rama: 0.4, prof: 3,
              hoja: R.hoja + 0.15, tamHoja: 9, flor: R.flor, tamFlor: 3,
              chip: R.chip * 0.5, max: 46,
            })),
            paleta: base, retraso: 400 + k * 260, pulsa: false,
          });
        }
        macetas.push({
          p: preparar(crece({
            x: lado ? W - 2 : 2, y: Math.round(H * (0.3 + r() * 0.25)), dir: lado ? 4 : 0, sesgo: 2, tiron: 0.25, rnd: r,
            caja: franja(lado, H * 0.2, H * 0.8),
            paso: [10, 18], largo: [3, 7], giro: 0.25, rama: 0.35, prof: 2,
            hoja: 0, flor: 0, chip: R.chip + 0.18, max: 26,
          })),
          paleta: PAL_BUS, retraso: 800, pulsa: true,
        });
      }
      // La hierba: matas cortas y tupidas a lo ancho del canto de abajo.
      const n = Math.max(4, Math.round(W / 64));
      for (let i = 0; i < n; i++) {
        const x = Math.round(((i + 0.5 + (r() - 0.5) * 0.7) * W) / n);
        macetas.push({
          p: preparar(crece({
            x, y: H, dir: 6, sesgo: 6, tiron: 0.5, rnd: r,
            caja: [x - 24, H - 44, x + 24, H],
            paso: [4, 8], largo: [2, 4], giro: 0.45, rama: 0.55, prof: 2,
            hoja: 0.85, tamHoja: 6, flor: R.flor * 0.8, tamFlor: 2.4,
            chip: R.chip * 0.3, max: 9,
          })),
          paleta: base, retraso: 300 + (i % 7) * 110, pulsa: false,
        });
      }
    }

    function pintaFondo(t: number) {
      const ctx = cvF!.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);
      let listo = true;
      for (const m of macetas) {
        const k = quieto ? 1 : clamp((t - t0 - m.retraso) / BROTE);
        if (k < 1) listo = false;
        if (k > 0) pintaPlanta(ctx, m.p, 1 - (1 - k) ** 3, m.paleta);
      }
      return listo;
    }

    // Un pulso: un tramo brillante que recorre el tronco de una raíz.
    function pintaLuz(t: number) {
      const ctx = cvL!.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'square';
      pulsos = pulsos.filter((q) => t - q.desde < PULSO);
      for (const q of pulsos) {
        const u = (t - q.desde) / PULSO;
        ctx.globalAlpha = 1 - u * 0.6;
        ctx.strokeStyle = q.m.paleta === PAL_BUS ? luzPhos : luzHi;
        ctx.lineWidth = 3;
        // El pulso baja por el tronco y por cada rama, desde su distancia a la raíz.
        const D = u * q.m.p.dmax!;
        for (const tl of q.m.p.tallos) {
          const a = D - tl.d0 - 26, b = D - tl.d0;
          if (b > 0 && a < tl.len) tramo(ctx, tl, Math.max(0, a), Math.min(tl.len, b));
        }
      }
      ctx.globalAlpha = 1;
    }

    const lanzaPulsos = (t: number, cuantos: number) => {
      const candidatas = macetas.filter((m) => m.pulsa);
      for (let i = 0; i < cuantos && candidatas.length; i++) {
        const m = candidatas[Math.floor(Math.random() * candidatas.length)];
        pulsos.push({ m, desde: t + i * 90 });
      }
    };
    disparo.current = () => lanzaPulsos(performance.now(), 4);

    let brotando = true;
    const cuadro = (t: number) => {
      if (brotando) brotando = !pintaFondo(t);
      if (!quieto) {
        if (t >= siguiente) { lanzaPulsos(t, 2); siguiente = t + CADA * (0.7 + Math.random() * 0.6); }
        pintaLuz(t);
      }
      raf = requestAnimationFrame(cuadro);
    };

    siembra();
    t0 = performance.now();
    siguiente = t0 + BROTE;
    raf = requestAnimationFrame(cuadro);

    // Al cambiar de tamaño se resiembra ya crecido: la pared no vuelve a
    // brotar desde cero porque alguien movió la ventana.
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
  }, [variante, marco]);

  // Alguien mejoró: la pared late.
  const primero = useRef(true);
  useEffect(() => {
    if (primero.current) { primero.current = false; return; }
    disparo.current?.();
  }, [latido]);

  return (
    <div
      ref={caja} className={`jardin-escena${marco ? ' jardin-escena--marco' : ''}`} aria-hidden="true"
      style={marco ? { ['--marco' as string]: `${marco}px` } : undefined}
    >
      <canvas ref={fondo} />
      <canvas ref={luz} />
    </div>
  );
}
