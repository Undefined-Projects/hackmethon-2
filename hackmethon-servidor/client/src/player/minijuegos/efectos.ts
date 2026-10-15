import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Los efectos de los minijuegos: partículas, anillos, textos que
 * flotan, destellos y sacudidas. Un solo lienzo encima de la pantalla
 * del juego (lo pone el Marco) y un solo motor para los cuatro juegos.
 *
 * Todo en coordenadas de VENTANA (clientX/clientY): cada juego dice
 * dónde pasó algo como lo vería el ratón, y el motor lo traduce a su
 * lienzo. Así da igual si el juego es un <canvas> escalado o una
 * rejilla de botones.
 *
 * El bucle solo corre mientras hay algo vivo: un juego quieto no gasta
 * un cuadro en efectos.
 */

type Forma = 'pixel' | 'hoja' | 'petalo' | 'chispa' | 'escombro';

type Particula = {
  x: number; y: number; vx: number; vy: number;
  vida: number; dura: number; tam: number; giro: number; vgiro: number;
  color: string; forma: Forma; gravedad: number;
};
type Anillo = { x: number; y: number; r0: number; r1: number; vida: number; dura: number; color: string; grosor: number };
type Texto = { x: number; y: number; txt: string; vida: number; dura: number; color: string; tam: number; sube: number };
type Destello = { color: string; vida: number; dura: number; fuerza: number };

export type OpcionesEstallido = {
  n?: number;
  colores?: string[];
  formas?: Forma[];
  fuerza?: number;
  gravedad?: number;
  dura?: number;
  tam?: number;
  /** Ángulo central y apertura, en radianes. Sin ellos, en todas direcciones. */
  angulo?: number;
  apertura?: number;
};

export type Fx = {
  estallido: (x: number, y: number, o?: OpcionesEstallido) => void;
  anillo: (x: number, y: number, o?: { color?: string; radio?: number; dura?: number; grosor?: number }) => void;
  texto: (x: number, y: number, txt: string, o?: { color?: string; tam?: number; dura?: number }) => void;
  destello: (color: string, fuerza?: number, dura?: number) => void;
  sacudida: (fuerza?: number) => void;
  /** Lluvia de pétalos y hojas desde arriba: el récord. */
  lluvia: (n?: number) => void;
};

const nada: Fx = { estallido() {}, anillo() {}, texto() {}, destello() {}, sacudida() {}, lluvia() {} };
export const FxCtx = createContext<Fx>(nada);
export const useFx = () => useContext(FxCtx);

/** Colores de la hoja, leídos una vez. */
let tonos: Record<string, string> | null = null;
export function color(nombre: 'phos' | 'phosHi' | 'phosDim' | 'verde' | 'verdeHi' | 'verdeDim' | 'azul' | 'azulHi' | 'uv' | 'violeta' | 'sangre' | 'sangreHi'): string {
  if (!tonos) {
    const css = getComputedStyle(document.documentElement);
    const v = (n: string, d: string) => css.getPropertyValue(n).trim() || d;
    tonos = {
      phos: v('--phos', '#fa39ba'), phosHi: v('--phos-hi', '#ffd3ee'), phosDim: v('--phos-dim', '#b0559b'),
      verde: v('--clorofila', '#3ddc97'), verdeHi: v('--clorofila-hi', '#b4f5d4'), verdeDim: v('--clorofila-dim', '#23805a'),
      azul: v('--blue', '#21498e'), azulHi: v('--blue-hi', '#4f86ee'), uv: v('--uv', '#d946ef'),
      violeta: v('--violet', '#a32198'), sangre: v('--sangre', '#ff3355'), sangreHi: v('--sangre-hi', '#ffc2cc'),
    };
  }
  return tonos[nombre];
}

/** Centro de un elemento, en coordenadas de ventana. */
export function centro(el: Element | null): { x: number; y: number } {
  if (!el) return { x: 0, y: 0 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** De coordenadas internas de un <canvas> (su width/height) a ventana. */
export function enLienzo(cv: HTMLCanvasElement | null, x: number, y: number): { x: number; y: number } {
  if (!cv) return { x: 0, y: 0 };
  const r = cv.getBoundingClientRect();
  return { x: r.left + (x * r.width) / cv.width, y: r.top + (y * r.height) / cv.height };
}

export class MotorFx implements Fx {
  private ps: Particula[] = [];
  private as: Anillo[] = [];
  private ts: Texto[] = [];
  private ds: Destello[] = [];
  private raf = 0;
  private antes = 0;
  private quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private ctx: CanvasRenderingContext2D;
  private ojo: ResizeObserver;

  private cv: HTMLCanvasElement;
  private marco: HTMLElement | null;

  constructor(cv: HTMLCanvasElement, marco: HTMLElement | null) {
    this.cv = cv;
    this.marco = marco;
    this.ctx = cv.getContext('2d')!;
    this.ojo = new ResizeObserver(() => this.mide());
    this.ojo.observe(cv);
    this.mide();
  }

  destruir() { cancelAnimationFrame(this.raf); this.ojo.disconnect(); }

  private mide() { this.cv.width = this.cv.clientWidth; this.cv.height = this.cv.clientHeight; }

  /** De ventana a este lienzo. */
  private aqui(x: number, y: number) {
    const r = this.cv.getBoundingClientRect();
    return { x: x - r.left, y: y - r.top };
  }

  private despierta() {
    if (this.raf) return;
    this.antes = performance.now();
    this.raf = requestAnimationFrame(this.cuadro);
  }

  estallido = (cx: number, cy: number, o: OpcionesEstallido = {}) => {
    if (this.quieto) return;
    const { x, y } = this.aqui(cx, cy);
    const n = o.n ?? 18, fuerza = o.fuerza ?? 0.35;
    const colores = o.colores ?? [color('phos'), color('phosHi')];
    const formas = o.formas ?? ['pixel'];
    for (let i = 0; i < n; i++) {
      const ang = o.angulo !== undefined
        ? o.angulo + (Math.random() - 0.5) * (o.apertura ?? Math.PI)
        : Math.random() * Math.PI * 2;
      const v = fuerza * (0.35 + Math.random() * 0.9);
      const forma = formas[Math.floor(Math.random() * formas.length)];
      this.ps.push({
        x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
        vida: 0, dura: (o.dura ?? 700) * (0.6 + Math.random() * 0.7),
        tam: (o.tam ?? 4) * (0.6 + Math.random() * 0.8),
        giro: Math.random() * Math.PI, vgiro: (Math.random() - 0.5) * 0.02,
        color: colores[Math.floor(Math.random() * colores.length)], forma,
        gravedad: o.gravedad ?? (forma === 'hoja' || forma === 'petalo' ? 0.0004 : 0.0009),
      });
    }
    this.despierta();
  };

  anillo = (cx: number, cy: number, o: { color?: string; radio?: number; dura?: number; grosor?: number } = {}) => {
    if (this.quieto) return;
    const { x, y } = this.aqui(cx, cy);
    this.as.push({ x, y, r0: 4, r1: o.radio ?? 60, vida: 0, dura: o.dura ?? 450, color: o.color ?? color('verdeHi'), grosor: o.grosor ?? 3 });
    this.despierta();
  };

  texto = (cx: number, cy: number, txt: string, o: { color?: string; tam?: number; dura?: number } = {}) => {
    const { x, y } = this.aqui(cx, cy);
    this.ts.push({ x, y, txt, vida: 0, dura: o.dura ?? 800, color: o.color ?? color('phosHi'), tam: o.tam ?? 18, sube: 40 });
    this.despierta();
  };

  destello = (c: string, fuerza = 0.35, dura = 260) => {
    if (this.quieto) return;
    this.ds.push({ color: c, vida: 0, dura, fuerza });
    this.despierta();
  };

  sacudida = (fuerza = 1) => {
    const m = this.marco;
    if (!m || this.quieto) return;
    m.style.setProperty('--sacude', String(fuerza));
    // Quitar y volver a poner la clase reinicia la animación aunque ya
    // estuviera sacudiéndose.
    m.classList.remove('fx-sacude');
    void m.offsetWidth;
    m.classList.add('fx-sacude');
  };

  lluvia = (n = 70) => {
    if (this.quieto) return;
    const W = this.cv.width;
    const colores = [color('verde'), color('verdeHi'), color('uv'), color('violeta'), color('phosHi')];
    for (let i = 0; i < n; i++) {
      const forma: Forma = Math.random() < 0.5 ? 'hoja' : 'petalo';
      this.ps.push({
        x: Math.random() * W, y: -10 - Math.random() * 120,
        vx: (Math.random() - 0.5) * 0.08, vy: 0.04 + Math.random() * 0.08,
        vida: 0, dura: 2200 + Math.random() * 1400, tam: 4 + Math.random() * 5,
        giro: Math.random() * Math.PI, vgiro: (Math.random() - 0.5) * 0.01,
        color: colores[i % colores.length], forma, gravedad: 0.00006,
      });
    }
    this.despierta();
  };

  private cuadro = (t: number) => {
    const dt = Math.min(50, t - this.antes); this.antes = t;
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
    ctx.clearRect(0, 0, W, H);

    for (const d of this.ds) {
      d.vida += dt;
      const k = 1 - d.vida / d.dura;
      if (k <= 0) continue;
      ctx.globalAlpha = d.fuerza * k;
      ctx.fillStyle = d.color;
      ctx.fillRect(0, 0, W, H);
    }
    this.ds = this.ds.filter((d) => d.vida < d.dura);

    for (const a of this.as) {
      a.vida += dt;
      const k = a.vida / a.dura;
      if (k >= 1) continue;
      const r = a.r0 + (a.r1 - a.r0) * (1 - (1 - k) ** 3);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = a.color; ctx.lineWidth = a.grosor * (1 - k * 0.6);
      // Anillo cuadrado: en esta terminal no hay círculos suaves.
      ctx.strokeRect(Math.round(a.x - r), Math.round(a.y - r), Math.round(r * 2), Math.round(r * 2));
    }
    this.as = this.as.filter((a) => a.vida < a.dura);

    for (const p of this.ps) {
      p.vida += dt;
      p.vy += p.gravedad * dt;
      const roce = p.forma === 'hoja' || p.forma === 'petalo' ? 0.995 : 0.985;
      p.vx *= roce; p.vy *= roce;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.giro += p.vgiro * dt;
      const k = p.vida / p.dura;
      if (k >= 1) continue;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
      const s = p.tam;
      if (p.forma === 'chispa') {
        ctx.lineWidth = Math.max(1, s / 3);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 30, p.y - p.vy * 30); ctx.stroke();
      } else if (p.forma === 'hoja') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.giro);
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.6, 0); ctx.fill();
        ctx.restore();
      } else if (p.forma === 'petalo') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.giro);
        ctx.fillRect(-s / 2, -s / 2, s, s * 0.6);
        ctx.restore();
      } else {
        const t2 = p.forma === 'escombro' ? s * 1.4 : s;
        ctx.fillRect(Math.round(p.x - t2 / 2), Math.round(p.y - s / 2), Math.round(t2), Math.round(s));
      }
    }
    this.ps = this.ps.filter((p) => p.vida < p.dura && p.y < H + 40);

    ctx.textAlign = 'center';
    for (const x of this.ts) {
      x.vida += dt;
      const k = x.vida / x.dura;
      if (k >= 1) continue;
      // Entra grande y se asienta, luego sube y se apaga.
      const escala = k < 0.15 ? 1.5 - (k / 0.15) * 0.5 : 1;
      ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      ctx.font = `${Math.round(x.tam * escala)}px Silkscreen, monospace`;
      ctx.fillStyle = '#0a070c';
      ctx.fillText(x.txt, x.x + 2, x.y - x.sube * k + 2);
      ctx.fillStyle = x.color;
      ctx.fillText(x.txt, x.x, x.y - x.sube * k);
    }
    this.ts = this.ts.filter((x) => x.vida < x.dura);
    ctx.globalAlpha = 1;

    if (this.ps.length || this.as.length || this.ts.length || this.ds.length) {
      this.raf = requestAnimationFrame(this.cuadro);
    } else {
      this.raf = 0;
    }
  };
}

/**
 * El motor de un juego. Lo crea el juego (que es quien dispara los
 * efectos) y se lo pasa al Marco (que es quien tiene el lienzo). El
 * `fx` es estable y delega en el motor: se puede guardar en cualquier
 * callback aunque el lienzo aún no exista.
 */
export function useMotorFx() {
  const motor = useRef<MotorFx | null>(null);
  const fx = useMemo<Fx>(() => ({
    estallido: (...a) => motor.current?.estallido(...a),
    anillo: (...a) => motor.current?.anillo(...a),
    texto: (...a) => motor.current?.texto(...a),
    destello: (...a) => motor.current?.destello(...a),
    sacudida: (...a) => motor.current?.sacudida(...a),
    lluvia: (...a) => motor.current?.lluvia(...a),
  }), []);
  const montar = useCallback((cv: HTMLCanvasElement, marco: HTMLElement | null) => {
    motor.current = new MotorFx(cv, marco);
    return () => { motor.current?.destruir(); motor.current = null; };
  }, []);
  return { fx, montar };
}
export type MotorDeJuego = ReturnType<typeof useMotorFx>;

/* ── piezas comunes de animación ─────────────────────────── */

/** Un número que llega contando, no de golpe: para la pantalla final. */
export function useConteo(meta: number, dura = 900): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / dura);
      setV(Math.round(meta * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [meta, dura]);
  return v;
}

/**
 * La cuenta regresiva antes de empezar: 3 · 2 · 1 · ¡YA!. Devuelve el
 * número que toca pintar (o null) y la función que la arranca; al
 * terminar llama a `alFinal`.
 */
export function useCuentaAtras(paso = 650) {
  const [n, setN] = useState<number | null>(null);
  const relojes = useRef<ReturnType<typeof setTimeout>[]>([]);
  const iniciar = (alFinal: () => void, alPaso?: (n: number) => void) => {
    relojes.current.forEach(clearTimeout);
    relojes.current = [3, 2, 1, 0].map((k, i) => setTimeout(() => {
      setN(k);
      alPaso?.(k);
      if (k === 0) {
        alFinal();
        relojes.current.push(setTimeout(() => setN(null), 450));
      }
    }, i * paso));
  };
  useEffect(() => () => relojes.current.forEach(clearTimeout), []);
  return { cuenta: n, iniciar };
}
