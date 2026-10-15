/**
 * El jardín de la 2.0, portado de hackmethon-2/sitio/jardin.js.
 *
 * Un solo generador: un trazo que avanza como pista de circuito
 * impreso (solo giros de 45°) pero se ramifica como planta. Hojas de
 * clorofila, puntas de soldadura o flores, y de vez en cuando un chip
 * sentado sobre la pista. Todo con azar con semilla: la misma pantalla
 * siempre crece igual.
 *
 * Aquí solo vive lo que usan el fondo y las enredaderas del lobby;
 * el corazón, el micelio y el marchitarse se quedaron en el sitio.
 */

/** Azar con semilla (mulberry32). */
export function azar(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** Ocho direcciones a 45°, con y hacia abajo:
 *  0 →  1 ↘  2 ↓  3 ↙  4 ←  5 ↖  6 ↑  7 ↗ */
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;

/** Un paso de giro de `dir` hacia `meta`, por el lado más corto. */
const hacia = (dir: number, meta: number) => {
  const dif = (meta - dir + 8) % 8;
  return dif === 0 ? dir : dif <= 4 ? (dir + 1) % 8 : (dir + 7) % 8;
};

type Punto = [number, number];
export interface Tallo { pts: Punto[]; d0: number; len: number; prof: number; segs?: number[] }
export interface Hoja { x: number; y: number; dir: number; lado: number; d: number; tam: number; poly?: Punto[] }
export interface Via { x: number; y: number; d: number; raiz?: boolean; punta?: boolean }
export interface Flor { x: number; y: number; d: number; tam: number }
export interface Chip { x: number; y: number; dir: number; d: number }
export interface Planta {
  tallos: Tallo[]; hojas: Hoja[]; vias: Via[]; flores: Flor[]; chips: Chip[];
  dmax?: number;
}

export interface Semilla {
  x: number; y: number; dir: number; rnd: () => number;
  /** [x0, y0, x1, y1]: la planta no sale de aquí. */
  caja: [number, number, number, number];
  paso: [number, number]; largo: [number, number];
  giro: number; rama: number; prof: number;
  /** Hacia dónde tira la planta (una de las 8 direcciones): las raíces
   *  hacia abajo, las trepadoras hacia arriba. Sin él vaga a su aire. */
  sesgo?: number;
  /** Con qué fuerza tira el sesgo en cada paso (0-1). */
  tiron?: number;
  hoja: number; tamHoja?: number;
  flor: number; tamFlor?: number;
  chip?: number; max?: number;
}

/** El generador. Cada pieza lleva su distancia a la raíz (d), que es
 *  lo que permite hacerlas crecer en orden. Las tiradas de azar van en
 *  el mismo orden que en el sitio: misma semilla, mismo dibujo. */
export function crece(o: Semilla): Planta {
  const r = o.rnd;
  const out: Planta = { tallos: [], hojas: [], vias: [], flores: [], chips: [] };
  let presupuesto = o.max || 200;
  const [x0, y0, x1, y1] = o.caja;
  const dentro = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

  out.vias.push({ x: o.x, y: o.y, d: 0, raiz: true });

  function rama(x: number, y: number, dir: number, d: number, prof: number) {
    const pts: Punto[] = [[x, y]], d0 = d;
    const hijos: [number, number, number, number, number][] = [];
    const n = o.largo[0] + Math.floor(r() * (o.largo[1] - o.largo[0] + 1));
    for (let i = 0; i < n && presupuesto > 0; i++) {
      if (r() < o.giro) dir = (dir + (r() < 0.5 ? 1 : 7)) % 8;
      if (o.sesgo != null && r() < (o.tiron ?? 0.35)) dir = hacia(dir, o.sesgo);
      const L = o.paso[0] + r() * (o.paso[1] - o.paso[0]);
      let paso: [number, number, number] | null = null;
      // Si la pista se sale de su caja, prueba a doblar antes de rendirse:
      // así en un margen angosto la planta trepa pegada al marco.
      for (const t of [0, 1, 7, 2, 6]) {
        const dd = (dir + t) % 8, [dx, dy] = DIRS[dd];
        const k = dx && dy ? L / Math.SQRT2 : L;
        const nx = Math.round(x + dx * k), ny = Math.round(y + dy * k);
        if (dentro(nx, ny)) { paso = [nx, ny, dd]; break; }
      }
      if (!paso) break;
      d += Math.hypot(paso[0] - x, paso[1] - y);
      [x, y, dir] = paso;
      presupuesto--;
      pts.push([x, y]);
      if (r() < o.hoja)
        out.hojas.push({ x, y, dir, lado: r() < 0.5 ? 1 : -1, d, tam: (o.tamHoja ?? 6) * (0.7 + r() * 0.6) });
      if (o.chip && r() < o.chip) out.chips.push({ x, y, dir, d });
      if (prof < o.prof && r() < o.rama) {
        out.vias.push({ x, y, d });
        const giro = (r() < 0.5 ? 1 : 7) * (r() < 0.6 ? 1 : 2);
        hijos.push([x, y, (dir + giro) % 8, d, prof + 1]);
      }
    }
    if (pts.length > 1) {
      out.tallos.push({ pts, d0, len: d - d0, prof });
      if (r() < o.flor) out.flores.push({ x, y, d, tam: o.tamFlor || 3 });
      else out.vias.push({ x, y, d, punta: true });
    }
    hijos.forEach((h) => rama(...h));
  }
  rama(o.x, o.y, o.dir, 0, 0);
  return out;
}

/* ── pintar en <canvas> ──────────────────────────────────── */

export interface Paleta {
  tallo: string[]; hoja: string[];
  via: string; viaBorde: string; punta: string; raiz: string; raizBorde: string;
  chip: string; chipBorde: string; petalo: string[]; centro: string;
}

/** Los colores salen de las variables de index.css, para que el
 *  jardín cambie si cambia la hoja. */
export function paleta(): Paleta {
  const raiz = getComputedStyle(document.documentElement);
  const t = (n: string, d: string) => raiz.getPropertyValue(n).trim() || d;
  const verde = t('--clorofila', '#3ddc97'), verdeHi = t('--clorofila-hi', '#b4f5d4');
  const verdeDim = t('--clorofila-dim', '#23805a'), azulDim = t('--blue-dim', '#2f4a9a');
  return {
    tallo: [verde, verde, verdeDim, azulDim],
    hoja: [verde, verdeHi, verdeDim],
    via: t('--screen', '#0a070c'), viaBorde: t('--phos', '#fa39ba'),
    punta: t('--phos-dim', '#b0559b'),
    raiz: t('--phos', '#fa39ba'), raizBorde: t('--phos-hi', '#ffd3ee'),
    chip: t('--blue', '#21498e'), chipBorde: t('--blue-hi', '#4f86ee'),
    petalo: [t('--uv', '#d946ef'), t('--violet', '#a32198')],
    centro: t('--phos-hi', '#ffd3ee'),
  };
}

/** La hoja como rombo perpendicular a la pista. */
function puntosHoja(h: Hoja): Punto[] {
  const [fx, fy] = DIRS[h.dir], fl = Math.hypot(fx, fy);
  const [px, py] = DIRS[(h.dir + 2 * h.lado + 8) % 8], pl = Math.hypot(px, py);
  const F = [fx / fl, fy / fl], P = [px / pl, py / pl], s = h.tam;
  return ([[0, 0], [s * 0.5, s * 0.38], [s, s * 0.3], [s * 0.45, -s * 0.12]] as Punto[])
    .map(([a, b]) => [P[0] * a + F[0] * b, P[1] * a + F[1] * b]);
}

/** Precalcula lo que el pintado necesita en cada cuadro. */
export function preparar(p: Planta): Planta {
  p.hojas.forEach((h) => { h.poly = puntosHoja(h); });
  p.tallos.forEach((t) => {
    t.segs = [];
    for (let i = 1; i < t.pts.length; i++)
      t.segs.push(Math.hypot(t.pts[i][0] - t.pts[i - 1][0], t.pts[i][1] - t.pts[i - 1][1]));
    t.len = t.segs.reduce((a, b) => a + b, 0);
  });
  p.dmax = Math.max(1, ...p.tallos.map((t) => t.d0 + t.len),
    ...[...p.hojas, ...p.vias, ...p.flores, ...p.chips].map((q) => q.d));
  return p;
}

/** Traza un tallo desde la distancia a hasta la b, medidas desde su inicio. */
export function tramo(ctx: CanvasRenderingContext2D, t: Tallo, a: number, b: number) {
  let acc = 0, dentro = false;
  const segs = t.segs!;
  ctx.beginPath();
  for (let i = 0; i < segs.length; i++) {
    const [x0, y0] = t.pts[i], [x1, y1] = t.pts[i + 1], L = segs[i];
    if (acc + L >= a && acc <= b) {
      const u0 = clamp((a - acc) / L), u1 = clamp((b - acc) / L);
      if (!dentro) { ctx.moveTo(x0 + (x1 - x0) * u0, y0 + (y1 - y0) * u0); dentro = true; }
      ctx.lineTo(x0 + (x1 - x0) * u1, y0 + (y1 - y0) * u1);
    }
    acc += L;
    if (acc > b) break;
  }
  if (dentro) ctx.stroke();
}

/** Cada pieza brota en tres pasos, no suave: es una terminal. */
const brote = (D: number, d: number) => Math.ceil(clamp((D - d) / 12) * 3) / 3;

/** Pinta la planta crecida hasta la fracción f (0 semilla, 1 entera). */
export function pintaPlanta(ctx: CanvasRenderingContext2D, p: Planta, f: number, P: Paleta) {
  const D = f * p.dmax!;
  ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
  for (const t of p.tallos) {
    if (D <= t.d0) continue;
    const k = Math.min(t.prof, 3);
    ctx.strokeStyle = P.tallo[k];
    ctx.lineWidth = [2.5, 2, 2, 1.5][k];
    tramo(ctx, t, 0, D - t.d0);
  }
  p.hojas.forEach((h, i) => {
    const s = brote(D, h.d); if (!s) return;
    ctx.fillStyle = P.hoja[i % 3 === 2 ? 1 : i % 4 === 3 ? 2 : 0];
    ctx.beginPath();
    h.poly!.forEach(([a, b], j) => (j ? ctx.lineTo(h.x + a * s, h.y + b * s) : ctx.moveTo(h.x, h.y)));
    ctx.fill();
  });
  for (const c of p.chips) {
    const s = brote(D, c.d); if (!s) continue;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate((c.dir * Math.PI) / 4); ctx.scale(s, s);
    ctx.fillStyle = P.chip; ctx.fillRect(-3.5, -2, 7, 4);
    ctx.strokeStyle = P.chipBorde; ctx.lineWidth = 1; ctx.strokeRect(-3.5, -2, 7, 4);
    ctx.restore();
  }
  for (const v of p.vias) {
    const s = brote(D, v.d); if (!s) continue;
    ctx.beginPath(); ctx.arc(v.x, v.y, (v.punta ? 1.8 : 2.4) * s, 0, Math.PI * 2);
    if (v.punta) { ctx.fillStyle = P.punta; ctx.fill(); continue; }
    ctx.fillStyle = v.raiz ? P.raiz : P.via; ctx.fill();
    ctx.strokeStyle = v.raiz ? P.raizBorde : P.viaBorde; ctx.lineWidth = 1.4; ctx.stroke();
  }
  p.flores.forEach((fl, i) => {
    const s = brote(D, fl.d) * fl.tam; if (!s) return;
    ctx.fillStyle = P.petalo[i % 2];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
      ctx.fillRect(fl.x + dx * s - s / 2, fl.y + dy * s - s / 2, s, s);
    ctx.fillStyle = P.centro; ctx.fillRect(fl.x - s / 2, fl.y - s / 2, s, s);
  });
}
