import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FOV, H, W, pintar, type Celda } from './motor3d';

// ============================================================
//  LA MANO EN 3D · lo que ve Pantalla en la Fase 4
//
//  La mano es un OBJETO de la sala, no un dibujo pegado encima: vive en
//  las mismas coordenadas del mundo que el pasillo y se proyecta con la
//  misma cámara (y la misma altura de ojo), así que tiene perspectiva,
//  volumen y la luz de la sala. Cada falange es un cubo con su cara de
//  frente, su costado y su cara de abajo —lo que se ve depende de dónde
//  quede respecto a la cámara—; la palma sale de un pedestal con base en
//  el suelo, que proyecta su sombra, y la lámpara rosa del fondo le pinta
//  el contorno a contraluz. Mitad placa y mitad mármol, como el robot.
//
//  Capa 1 · LAS FALANGES. Dos cámaras: el FRENTE (la palma, con el número
//  de cada falange) y el REVERSO (el dorso, con su texto y los nudillos).
//  Desde atrás la mano se ve EN ESPEJO —el pulgar a la derecha, y la placa
//  y el mármol cambiados de lado—, como pasaría de verdad. Encima de cada
//  dedo, su número (el pulgar es el 0); en cada falange, su índice (0 en la
//  base, 2 en la punta). Las dos falanges que se acaban de intercambiar
//  destellan.
//
//  Capa 2 · LOS TENDONES. Doce cables cilíndricos entre dos vigas, cada uno
//  con su letra y su índice; al intercambiar dos, saltan. Las tensiones no
//  llegan: son de Datos.
//
//  Ligera como las demás: la sala se pinta una vez; la mano, solo al
//  cambiar algo y durante el destello del último cambio.
// ============================================================

type Ultimo = { n: number; tipo: 'intercambio-falange'; dedo: number; i: number; j: number } | { n: number; tipo: 'intercambio'; i: number; j: number };
type Falange = { frente: number; reverso: string };
export type DibujoMano = {
  capa: number;
  resuelta: boolean;
  /** 5 dedos × 3 falanges, con sus dos datos, en el orden de ahora. */
  falanges: Falange[][];
  /** La cara que enseña la cámara puesta. */
  cara: 'frente' | 'reverso';
  orden: string[] | null;
  usados: number;
  presupuesto: number | null;
  ultimo: Ultimo | null;
};

const SALA = ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######'];
const CAM = { x: 3.5, y: 5.25, ojo: 0.5 };
const NIEBLA = 7;
const DESTELLO_MS = 900;
/** Lo de la izquierda de esta x es placa; lo de la derecha, mármol. */
const COSTURA = 3.45;

/** Un punto del mundo (x, profundidad, altura) en el lienzo. */
const proy = (x: number, y: number, h: number) => {
  const z = Math.max(0.05, CAM.y - y);
  return { sx: (W / 2) * (1 + (x - CAM.x) / (z * FOV)), sy: H / 2 + ((CAM.ojo - h) * H) / z, z };
};
const luzA = (z: number) => Math.max(0.25, Math.pow(Math.max(0, 1 - z / NIEBLA), 1.1));

type Caja = { x0: number; x1: number; y0: number; y1: number; h0: number; h1: number };

const PLACA: [number, number, number] = [62, 76, 112];
const MARMOL: [number, number, number] = [222, 212, 196];
const rgb = (c: [number, number, number], k: number) => `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;

/** Un cubo con sus caras visibles: costado y cara de arriba o de abajo,
 *  según quede respecto a la cámara, y al final la de frente. */
function cubo(ctx: CanvasRenderingContext2D, c: Caja, k: number,
  opciones: { borde?: string; brillo?: number; mat?: [number, number, number]; dorso?: boolean } = {}) {
  const mat = opciones.mat ?? ((c.x0 + c.x1) / 2 < COSTURA ? PLACA : MARMOL);
  const l = luzA(CAM.y - c.y1) * k;
  const poli = (pts: { sx: number; sy: number }[], color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy))); ctx.closePath(); ctx.fill();
  };
  // El costado que mira hacia la cámara.
  if (c.x1 < CAM.x) {
    poli([proy(c.x1, c.y1, c.h0), proy(c.x1, c.y0, c.h0), proy(c.x1, c.y0, c.h1), proy(c.x1, c.y1, c.h1)], rgb(mat, l * 0.62));
  } else if (c.x0 > CAM.x) {
    poli([proy(c.x0, c.y1, c.h0), proy(c.x0, c.y0, c.h0), proy(c.x0, c.y0, c.h1), proy(c.x0, c.y1, c.h1)], rgb(mat, l * 0.62));
  }
  // Por encima del ojo se le ve la cara de abajo; por debajo, la de arriba.
  if (c.h0 > CAM.ojo) {
    poli([proy(c.x0, c.y1, c.h0), proy(c.x1, c.y1, c.h0), proy(c.x1, c.y0, c.h0), proy(c.x0, c.y0, c.h0)], rgb(mat, l * 0.42));
  } else if (c.h1 < CAM.ojo) {
    poli([proy(c.x0, c.y1, c.h1), proy(c.x1, c.y1, c.h1), proy(c.x1, c.y0, c.h1), proy(c.x0, c.y0, c.h1)], rgb(mat, l * 0.9));
  }
  // La cara de frente: paralela a la cámara, un rectángulo.
  const a = proy(c.x0, c.y1, c.h1), b = proy(c.x1, c.y1, c.h0);
  const x = a.sx, y = a.sy, w = b.sx - a.sx, h = b.sy - a.sy;
  ctx.fillStyle = rgb(mat, l * (0.8 + (opciones.brillo ?? 0) * 0.45));
  ctx.fillRect(x, y, w, h);
  // La textura: placas con remaches, o vetas de mármol.
  if (mat === PLACA) {
    ctx.fillStyle = rgb(PLACA, l * 0.55);
    for (let yy = y + 4; yy < y + h - 1; yy += 6) ctx.fillRect(x + 1, yy, w - 2, 1);
    ctx.fillStyle = rgb([150, 170, 210], l);
    ctx.fillRect(x + 2, y + 2, 1, 1); ctx.fillRect(x + w - 3, y + 2, 1, 1);
  } else {
    ctx.strokeStyle = rgb([150, 138, 118], l); ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + 1); ctx.lineTo(x + w * 0.45, y + h * 0.5); ctx.lineTo(x + w * 0.35, y + h - 1); ctx.stroke();
  }
  // El dorso: un nudillo que sobresale en la parte de arriba de la cara.
  if (opciones.dorso) {
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x, y + h * 0.55, w, h * 0.45);
    ctx.fillStyle = rgb(mat, l * 1.15); ctx.fillRect(x + w * 0.2, y + 2, w * 0.6, Math.max(2, h * 0.18));
  }
  // El contraluz rosa de la lámpara del fondo, en el canto de arriba.
  ctx.fillStyle = 'rgba(250,57,186,.55)'; ctx.fillRect(x, y, w, 1);
  if (opciones.borde) { ctx.strokeStyle = opciones.borde; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
  return { x, y, w, h };
}

// ---------- la mano ----------

/** Cada dedo en el mundo: su centro, su ancho, dónde nace y cuánto mide cada falange. */
const DEDOS = [
  { x: 2.74, w: 0.2, pie: 0.36, h: 0.13 },   // pulgar: al costado y más bajo
  { x: 3.07, w: 0.2, pie: 0.63, h: 0.18 },
  { x: 3.33, w: 0.2, pie: 0.63, h: 0.2 },
  { x: 3.59, w: 0.2, pie: 0.63, h: 0.18 },
  { x: 3.84, w: 0.18, pie: 0.6, h: 0.14 },
];
const FONDO_Y = 2.62, FRENTE_Y = 2.78;
const cajaFalange = (d: number, f: number): Caja => {
  const g = DEDOS[d];
  const h0 = g.pie + f * (g.h + 0.018);
  return { x0: g.x - g.w / 2, x1: g.x + g.w / 2, y0: FONDO_Y, y1: FRENTE_Y, h0, h1: h0 + g.h };
};

function sombra(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number) {
  const a = proy(x0, y, 0), b = proy(x1, y, 0);
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.beginPath(); ctx.ellipse((a.sx + b.sx) / 2, a.sy, (b.sx - a.sx) / 2, 4, 0, 0, Math.PI * 2); ctx.fill();
}

/** Desde atrás, la mano se ve en espejo respecto a la cámara. */
const espejo = (c: Caja, atras: boolean): Caja => (atras ? { ...c, x0: 2 * CAM.x - c.x1, x1: 2 * CAM.x - c.x0 } : c);
const material = (c: Caja) => ((c.x0 + c.x1) / 2 < COSTURA ? PLACA : MARMOL);

function pintarMano(ctx: CanvasRenderingContext2D, d: DibujoMano, destello: number) {
  const atras = d.cara === 'reverso';
  const pieza = (c: Caja, k: number, op: { borde?: string; brillo?: number } = {}) =>
    cubo(ctx, espejo(c, atras), k, { ...op, mat: material(c), dorso: atras });
  sombra(ctx, 2.7, 4.2, 2.7);
  // La base en el suelo, el antebrazo y la palma (dos mitades).
  pieza({ x0: 2.95, x1: 4.05, y0: 2.45, y1: 2.95, h0: 0, h1: 0.05 }, 0.9);
  pieza({ x0: 3.2, x1: 3.45, y0: 2.58, y1: 2.82, h0: 0.05, h1: 0.3 }, 0.95);
  pieza({ x0: 3.45, x1: 3.72, y0: 2.58, y1: 2.82, h0: 0.05, h1: 0.3 }, 0.95);
  pieza({ x0: 2.92, x1: COSTURA, y0: 2.58, y1: 2.82, h0: 0.3, h1: 0.62 }, atras ? 0.85 : 1);
  pieza({ x0: COSTURA, x1: 3.97, y0: 2.58, y1: 2.82, h0: 0.3, h1: 0.62 }, atras ? 0.85 : 1);
  // La raíz del pulgar, que sale del costado de la palma.
  pieza({ x0: 2.66, x1: 2.92, y0: 2.6, y1: 2.8, h0: 0.3, h1: 0.36 }, 0.95);
  // Los dedos, de fuera hacia dentro: así los costados quedan debajo.
  for (const dd of [0, 4, 1, 3, 2]) {
    for (let f = 0; f < 3; f++) {
      const r = pieza(cajaFalange(dd, f), 1, { brillo: atras ? 0.2 : 0.4 });
      const ult = d.ultimo;
      if (ult?.tipo === 'intercambio-falange' && ult.dedo === dd && (ult.i === f || ult.j === f) && destello > 0) {
        ctx.fillStyle = `rgba(250,57,186,${0.7 * destello})`; ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }
  }
}

// ---------- los tendones ----------

const TENDON_Y = 2.6;
const tendonX = (i: number) => 2.42 + i * (2.16 / 11);

function pintarTendones(ctx: CanvasRenderingContext2D, d: DibujoMano, destello: number) {
  sombra(ctx, 2.2, 4.8, 2.6);
  // Las dos vigas de la muñeca, abajo y arriba.
  cubo(ctx, { x0: 2.25, x1: COSTURA, y0: 2.5, y1: 2.72, h0: 0, h1: 0.1 }, 0.9);
  cubo(ctx, { x0: COSTURA, x1: 4.75, y0: 2.5, y1: 2.72, h0: 0, h1: 0.1 }, 0.9);
  (d.orden ?? []).forEach((_, i) => {
    const salta = d.ultimo?.tipo === 'intercambio' && (d.ultimo.i === i || d.ultimo.j === i) ? destello : 0;
    const x = tendonX(i);
    const a = proy(x, TENDON_Y, 1.08 + salta * 0.08), b = proy(x, TENDON_Y, 0.1 + salta * 0.08);
    const r = 0.045 * (H / a.z);
    // Un cilindro: oscuro en los bordes y claro en medio.
    const g = ctx.createLinearGradient(a.sx - r, 0, a.sx + r, 0);
    const base = salta ? [250, 57, 186] : [61, 220, 151];
    const l = luzA(a.z);
    g.addColorStop(0, rgb(base as [number, number, number], l * 0.35));
    g.addColorStop(0.45, rgb(base as [number, number, number], l * 1.05));
    g.addColorStop(1, rgb(base as [number, number, number], l * 0.3));
    ctx.fillStyle = g;
    ctx.fillRect(a.sx - r, a.sy, r * 2, b.sy - a.sy);
    // Los anillos, como fibras de un tendón.
    ctx.fillStyle = 'rgba(4,18,12,.55)';
    for (let yy = a.sy + 7; yy < b.sy; yy += 12) ctx.fillRect(a.sx - r, yy, r * 2, 2);
  });
  cubo(ctx, { x0: 2.25, x1: COSTURA, y0: 2.5, y1: 2.72, h0: 1.08, h1: 1.2 }, 1);
  cubo(ctx, { x0: COSTURA, x1: 4.75, y0: 2.5, y1: 2.72, h0: 1.08, h1: 1.2 }, 1);
}

function hacerFondo(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const celda: Celda = (f, c) => SALA[f]?.[c] ?? '#';
  pintar(new Uint32Array(img.data.buffer), new Float32Array(W), celda, { x: CAM.x, y: CAM.y, ang: 0 }, {
    niebla: NIEBLA, ambiente: 0.08, salto: 0,
    sprites: [{ x: 3.5, y: 1.4, rgb: [250, 57, 186], alto: 1.4, ancho: 0.8, base: 0 }],
  });
  ctx.putImageData(img, 0, 0);
  return cv;
}

export function Mano3D(d: DibujoMano) {
  const cv = useRef<HTMLCanvasElement>(null);
  const fondo = useRef<HTMLCanvasElement | null>(null);
  const n = d.ultimo?.n ?? 0;
  const [desde, setDesde] = useState(0);
  useEffect(() => { if (n) setDesde(performance.now()); }, [n]);

  useLayoutEffect(() => {
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    if (!fondo.current) fondo.current = hacerFondo();
    const dibujar = () => {
      const t = desde ? Math.max(0, 1 - (performance.now() - desde) / DESTELLO_MS) : 0;
      const destello = Math.sin((t * Math.PI) / 2);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(fondo.current!, 0, 0);
      if (d.capa === 1) pintarMano(ctx, d, destello); else pintarTendones(ctx, d, destello);
    };
    dibujar();
    if (!desde) return;
    const id = setInterval(dibujar, 100);
    const fin = setTimeout(() => { clearInterval(id); dibujar(); }, DESTELLO_MS + 50);
    return () => { clearInterval(id); clearTimeout(fin); };
  }, [d, desde]);

  const pct = (v: number, t: number) => `${(v / t) * 100}%`;
  return (
    <div className={`mn3d capa-${d.capa}${d.resuelta ? ' resuelta' : ''}`}>
      <canvas ref={cv} width={W} height={H} className="mn3d-lienzo" role="img"
              aria-label={d.capa === 1 ? `La mano derecha de la máquina, vista por el ${d.cara}` : 'Los doce tendones de la muñeca, en su orden'} />
      <span className="mn3d-ojo" aria-hidden="true">
        LA MANO · {d.capa === 1 ? 'CAPA 1 · LAS FALANGES' : 'CAPA 2 · LOS TENDONES'}
      </span>
      {d.capa === 1 ? (
        <>
          {DEDOS.map((_, dd) => {
            const c = espejo(cajaFalange(dd, 2), d.cara === 'reverso');
            const p = proy((c.x0 + c.x1) / 2, c.y1, c.h1);
            return <span key={`d${dd}`} className="mn3d-dedo" style={{ left: pct(p.sx, W), top: pct(p.sy - 3, H) }}>{dd}</span>;
          })}
          {DEDOS.map((_, dd) => [0, 1, 2].map((f) => {
            const c = espejo(cajaFalange(dd, f), d.cara === 'reverso');
            const p = proy((c.x0 + c.x1) / 2, c.y1, (c.h0 + c.h1) / 2);
            const dato = d.falanges[dd]?.[f];
            return (
              <span key={`${dd}-${f}`} className={`mn3d-falange ${d.cara}`} style={{ left: pct(p.sx, W), top: pct(p.sy, H) }}>
                {d.cara === 'frente' ? dato?.frente : `"${dato?.reverso ?? ''}"`}<small>{f}</small>
              </span>
            );
          }))}
          <span className={`mn3d-cara ${d.cara}`} aria-hidden="true">
            {d.cara === 'frente' ? 'CÁMARA 1 · FRENTE' : 'CÁMARA 2 · REVERSO · EN ESPEJO'}
          </span>
          <span className="mn3d-leyenda" aria-hidden="true">arriba de cada dedo, su número · en cada falange, su dato y su índice (0 base · 2 punta)</span>
        </>
      ) : (
        <>
          {(d.orden ?? []).map((l, i) => {
            const arriba = proy(tendonX(i), 2.72, 1.2), abajo = proy(tendonX(i), 2.72, 0);
            return (
              <span key={`t${i}`}>
                <span className={`mn3d-letra${d.ultimo?.tipo === 'intercambio' && (d.ultimo.i === i || d.ultimo.j === i) ? ' movida' : ''}`}
                      style={{ left: pct(arriba.sx, W), top: pct(arriba.sy - 2, H) }}>{l}</span>
                <span className="mn3d-indice" style={{ left: pct(abajo.sx, W), top: pct(abajo.sy + 3, H) }}>{i}</span>
              </span>
            );
          })}
          {d.presupuesto !== null && (
            <span className={`mn3d-presupuesto${d.usados >= d.presupuesto ? ' agotado' : ''}`}>
              INTERCAMBIOS {d.usados} / {d.presupuesto}
            </span>
          )}
        </>
      )}
    </div>
  );
}
