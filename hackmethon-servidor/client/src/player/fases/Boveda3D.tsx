import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FOV, H, W, pintar, type Celda } from './motor3d';

// ============================================================
//  LA BÓVEDA DE LOS RECUERDOS en 3D · lo que ve Pantalla (Fase 5)
//
//  Un pasillo del torso con las paredes llenas de cajones de memoria.
//  Los cajones ENCENDIDOS son los recuerdos que siguen cumpliendo la
//  última consulta: con cada condición nueva se apagan, uno tras otro, y
//  el embudo se ve cerrarse. Cuando quedan doce o menos, cada cajón es un
//  recuerdo; si se buscaron, sobresalen con su id.
//
//  En la capa 2 la pared derecha son las doce PERSONAS. Al unir, cables
//  de luz cruzan el pasillo de los recuerdos a sus personas; al agrupar,
//  cada grupo se levanta como una columna de luz en medio del pasillo, la
//  más alta en rosa.
//
//  Abajo, la consulta en SQL: lo que la bóveda entendió.
//
//  Ligera como las demás vistas: el pasillo se pinta una vez; solo se
//  anima un momento después de cada consulta.
// ============================================================

export type DibujoBoveda = {
  capa: 1 | 2;
  resuelta: boolean;
  total: number;
  personas: { id: string; nombre: string }[];
  consulta: {
    n: number;
    tipo: 'contar' | 'buscar' | 'agrupar';
    quedan: number;
    ids: string[];
    grupos: { clave: string; n: number }[] | null;
    agrupadoPor: string | null;
    unida: boolean;
    sql: string;
  } | null;
  abierto: { n: number; id: string; ok: boolean } | null;
};

const SALA = ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'];
const CAM = { x: 2.5, y: 11.6, ojo: 0.5 };
const IZQ = 1, DER = 4;
const Y_CERCA = 9.0, Y_LEJOS = 2.2;
const COLS = 12, FILAS = 6;
const ANIM_MS = 900;
const ABRE_MS = 1600;

const proy = (x: number, y: number, h: number) => {
  const z = Math.max(0.05, CAM.y - y);
  return { sx: (W / 2) * (1 + (x - CAM.x) / (z * FOV)), sy: H / 2 + ((CAM.ojo - h) * H) / z, z };
};
const luzA = (z: number) => Math.max(0.28, Math.pow(Math.max(0, 1 - z / 11), 1.1));
const azar = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

type Cajon = { pared: number; y0: number; y1: number; h0: number; h1: number; orden: number };

/** Los cajones de una pared: una rejilla de columnas (a lo hondo) por filas. */
function rejilla(pared: number, cols: number, filas: number, hMin: number, hMax: number, semilla: number,
  cerca = Y_CERCA, lejos = Y_LEJOS): Cajon[] {
  const out: Cajon[] = [];
  const dy = (cerca - lejos) / cols, dh = (hMax - hMin) / filas;
  for (let c = 0; c < cols; c++) {
    for (let f = 0; f < filas; f++) {
      out.push({
        pared, y0: cerca - c * dy - dy * 0.08, y1: cerca - (c + 1) * dy + dy * 0.08,
        h0: hMin + f * dh + dh * 0.1, h1: hMin + (f + 1) * dh - dh * 0.1, orden: azar(semilla + c * 31 + f * 7),
      });
    }
  }
  return out;
}

/** Cuántos cajones quedan encendidos: uno por recuerdo cuando son pocos,
 *  y en escala logarítmica cuando son muchos (de 1000 a 1 hay que ver los
 *  últimos pasos, que son los interesantes). */
function encendidos(quedan: number, total: number, cajones: number): number {
  if (quedan <= 0) return 0;
  if (quedan <= 12) return quedan;
  if (quedan >= total) return cajones;
  return Math.min(cajones, Math.max(13, Math.ceil((cajones * Math.log(quedan + 1)) / Math.log(total + 1))));
}

const poli = (ctx: CanvasRenderingContext2D, pts: { sx: number; sy: number }[], color: string) => {
  ctx.fillStyle = color;
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy))); ctx.closePath(); ctx.fill();
};

/** Un cajón en su pared; si sobresale, con su costado hacia el pasillo. */
function pintarCajon(ctx: CanvasRenderingContext2D, k: Cajon, luz: string, saca = 0) {
  const x = k.pared === IZQ ? IZQ + saca : DER - saca;
  if (saca > 0) {
    // El costado de cerca y la tapa: lo que se ve del cajón que sale.
    poli(ctx, [proy(k.pared, k.y0, k.h0), proy(x, k.y0, k.h0), proy(x, k.y0, k.h1), proy(k.pared, k.y0, k.h1)], 'rgba(20,30,40,.95)');
    poli(ctx, [proy(k.pared, k.y0, k.h0), proy(k.pared, k.y1, k.h0), proy(x, k.y1, k.h0), proy(x, k.y0, k.h0)], 'rgba(40,60,70,.9)');
  }
  const cara = [proy(x, k.y0, k.h0), proy(x, k.y1, k.h0), proy(x, k.y1, k.h1), proy(x, k.y0, k.h1)];
  poli(ctx, cara, luz);
  // El canto del cajón: separa uno de otro aunque estén apagados.
  ctx.strokeStyle = 'rgba(79,134,238,.35)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); cara.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy))); ctx.closePath(); ctx.stroke();
  // El tirador.
  const m = proy(x, (k.y0 + k.y1) / 2, (k.h0 + k.h1) / 2);
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(m.sx - 1, m.sy - 0.5, 3, 1);
}

function hacerFondo(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const celda: Celda = (f, c) => SALA[f]?.[c] ?? '#';
  pintar(new Uint32Array(img.data.buffer), new Float32Array(W), celda, { x: CAM.x, y: CAM.y, ang: 0 }, {
    niebla: 12, ambiente: 0.06, salto: 0,
    sprites: [{ x: CAM.x, y: 1.4, rgb: [250, 57, 186], alto: 0.9, ancho: 1.2, base: 0.05 }],
  });
  ctx.putImageData(img, 0, 0);
  return cv;
}

type Escena = {
  recuerdos: Cajon[];
  personas: Cajon[];
};

function escena(capa: 1 | 2): Escena {
  const izq = rejilla(IZQ, COLS, FILAS, 0.06, 0.94, 1);
  if (capa === 1) {
    const recuerdos = [...izq, ...rejilla(DER, COLS, FILAS, 0.06, 0.94, 2)].sort((a, b) => a.orden - b.orden);
    return { recuerdos, personas: [] };
  }
  return {
    recuerdos: izq.sort((a, b) => a.orden - b.orden),
    // Las personas, grandes y en la mitad cercana: que se lean sus nombres.
    personas: rejilla(DER, 4, 3, 0.16, 0.9, 3, Y_CERCA, 5.0).sort((a, b) => b.y0 - a.y0 || b.h0 - a.h0),
  };
}

/** Dónde va cada columna de luz de un agrupado, en el pasillo. */
function columnas(n: number) {
  const ancho = (DER - IZQ - 0.5) / Math.max(1, n);
  return Array.from({ length: n }, (_, i) => ({ x0: IZQ + 0.25 + i * ancho + ancho * 0.18, x1: IZQ + 0.25 + (i + 1) * ancho - ancho * 0.18 }));
}
const Y_COL = 7.4, PROF_COL = 0.16, ALTO_COL = 0.78;

function pintarBoveda(ctx: CanvasRenderingContext2D, fondo: HTMLCanvasElement, d: DibujoBoveda, esc: Escena,
  antes: number, u: number, abre: number) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fondo, 0, 0);
  const c = d.consulta;
  const total = esc.recuerdos.length;
  const vivos = c ? encendidos(c.quedan, d.total, total) : total;
  // Mientras anima, se van apagando (o encendiendo) de uno en uno.
  const mostrados = Math.round(antes + (vivos - antes) * Math.min(1, u));
  const sacados = c?.tipo === 'buscar' ? c.ids.length : 0;

  // Los cajones, del fondo hacia delante.
  const lista = esc.recuerdos.map((k, i) => ({ k, i })).sort((a, b) => a.k.y1 - b.k.y1);
  for (const { k, i } of lista) {
    const l = luzA(CAM.y - k.y0);
    const vivo = i < mostrados || d.resuelta;
    const recien = !vivo && i < antes && u < 1;        // se acaba de apagar: un destello rojo
    const color = d.resuelta ? `rgba(250,57,186,${0.5 + 0.4 * l})`
      : vivo ? `rgba(61,220,151,${0.3 + 0.6 * l})`
      : recien ? `rgba(255,68,102,${0.6 + 0.3 * (1 - u)})` : `rgb(${14 + 16 * l | 0},${18 + 20 * l | 0},${28 + 30 * l | 0})`;
    pintarCajon(ctx, k, color, vivo && i < sacados ? 0.16 * Math.min(1, u * 1.5) : 0);
    if (vivo && !d.resuelta) {
      // El brillo del frente: una línea de luz.
      const a = proy(k.pared === IZQ ? IZQ + (i < sacados ? 0.16 : 0) : DER - (i < sacados ? 0.16 : 0), (k.y0 + k.y1) / 2, k.h1 - 0.01);
      ctx.fillStyle = `rgba(180,245,212,${0.5 * l})`; ctx.fillRect(a.sx - 1, a.sy, 2, 1);
    }
  }

  // La pared de las personas (capa 2).
  const grupoTop = c?.grupos?.[0]?.clave ?? null;
  esc.personas.forEach((k, i) => {
    const p = d.personas[i];
    const l = luzA(CAM.y - k.y0);
    const top = !!p && !!grupoTop && (grupoTop === p.nombre || grupoTop === p.id);
    const color = top ? `rgba(250,57,186,${0.6 + 0.35 * l})` : c?.unida ? `rgba(79,134,238,${0.4 + 0.5 * l})` : `rgb(${20 + 20 * l | 0},${26 + 26 * l | 0},${44 + 40 * l | 0})`;
    pintarCajon(ctx, k, color, top ? 0.12 : 0);
  });

  // Unidas: cables de luz de los recuerdos encendidos a las personas.
  if (c?.unida && esc.personas.length) {
    const desde = esc.recuerdos.slice(0, Math.min(mostrados, 10));
    desde.forEach((k, j) => {
      const dest = esc.personas[j % esc.personas.length];
      const a = proy(IZQ + 0.02, (k.y0 + k.y1) / 2, (k.h0 + k.h1) / 2);
      const b = proy(DER - 0.02, (dest.y0 + dest.y1) / 2, (dest.h0 + dest.h1) / 2);
      const t = Math.min(1, u * 1.4);
      ctx.strokeStyle = `rgba(79,134,238,${0.55})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy);
      ctx.quadraticCurveTo((a.sx + b.sx) / 2, Math.min(a.sy, b.sy) - 14, a.sx + (b.sx - a.sx) * t, a.sy + (b.sy - a.sy) * t);
      ctx.stroke();
    });
  }

  // Agrupado: una columna de luz por grupo, la más alta en rosa.
  if (c?.grupos?.length) {
    const max = c.grupos[0].n || 1;
    const cols = columnas(c.grupos.length);
    c.grupos.forEach((g, i) => {
      const { x0, x1 } = cols[i];
      const alto = 0.04 + (ALTO_COL * g.n / max) * Math.min(1, u * 1.3);
      const pink = i === 0;
      const y0 = Y_COL, y1 = Y_COL - PROF_COL;
      // Costado, tapa y frente.
      const lado = x1 < CAM.x ? x1 : x0 > CAM.x ? x0 : null;
      if (lado !== null) poli(ctx, [proy(lado, y0, 0), proy(lado, y1, 0), proy(lado, y1, alto), proy(lado, y0, alto)], pink ? 'rgba(150,30,110,.95)' : 'rgba(30,110,80,.95)');
      poli(ctx, [proy(x0, y0, alto), proy(x1, y0, alto), proy(x1, y1, alto), proy(x0, y1, alto)], pink ? 'rgba(255,150,220,.95)' : 'rgba(150,240,200,.9)');
      poli(ctx, [proy(x0, y0, 0), proy(x1, y0, 0), proy(x1, y0, alto), proy(x0, y0, alto)], pink ? 'rgba(250,57,186,.92)' : 'rgba(61,220,151,.8)');
    });
  }

  // Abrir: un cajón sale flotando hacia la cámara, verde o rojo.
  if (d.abierto && abre < 1) {
    const s = Math.sin(Math.min(1, abre * 1.6) * Math.PI / 2);
    const y = 6.5 + s * 3.2;
    const ok = d.abierto.ok;
    const a = proy(CAM.x - 0.3, y, 0.62), b = proy(CAM.x + 0.3, y, 0.38);
    ctx.fillStyle = ok ? 'rgba(61,220,151,.95)' : 'rgba(255,68,102,.95)';
    ctx.fillRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(a.sx + 0.5, a.sy + 0.5, b.sx - a.sx - 1, b.sy - a.sy - 1);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect((a.sx + b.sx) / 2 - 3, (a.sy + b.sy) / 2, 7, 1.5);
  }

  // El torso abierto: la luz del fondo lo invade todo.
  if (d.resuelta) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.6);
    g.addColorStop(0, 'rgba(250,57,186,.35)'); g.addColorStop(1, 'rgba(250,57,186,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

const reducido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Boveda3D(d: DibujoBoveda) {
  const cv = useRef<HTMLCanvasElement>(null);
  const fondo = useRef<HTMLCanvasElement | null>(null);
  const esc = useRef<{ capa: number; e: Escena } | null>(null);
  if (!esc.current || esc.current.capa !== d.capa) esc.current = { capa: d.capa, e: escena(d.capa) };
  const e = esc.current.e;
  const vivos = d.consulta ? encendidos(d.consulta.quedan, d.total, e.recuerdos.length) : e.recuerdos.length;

  // Cada consulta nueva anima desde cuántos había encendidos.
  const n = d.consulta?.n ?? 0;
  const previo = useRef(vivos);
  const [anim, setAnim] = useState({ desde: 0, antes: vivos });
  useEffect(() => {
    if (!n) return;
    setAnim({ desde: performance.now(), antes: previo.current });
    previo.current = vivos;
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { previo.current = vivos; }, [d.capa]); // eslint-disable-line react-hooks/exhaustive-deps
  const nAbre = d.abierto?.n ?? 0;
  const [abreDesde, setAbreDesde] = useState(0);
  useEffect(() => { if (nAbre) setAbreDesde(performance.now()); }, [nAbre]);

  useLayoutEffect(() => {
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    if (!fondo.current) fondo.current = hacerFondo();
    const quieto = reducido();
    const dibujar = () => {
      const t = performance.now();
      const u = quieto || !anim.desde ? 1 : (t - anim.desde) / ANIM_MS;
      const abre = quieto || !abreDesde ? 1 : (t - abreDesde) / ABRE_MS;
      pintarBoveda(ctx, fondo.current!, d, e, anim.desde ? anim.antes : vivos, u, abre);
    };
    dibujar();
    const fin = Math.max(anim.desde + ANIM_MS, abreDesde + ABRE_MS) - performance.now();
    if (quieto || fin <= 0) return;
    const id = setInterval(dibujar, 90);
    const alto = setTimeout(() => { clearInterval(id); dibujar(); }, fin + 60);
    return () => { clearInterval(id); clearTimeout(alto); };
  }, [d, e, anim, abreDesde, vivos]);

  const pct = (v: number, t: number) => `${(v / t) * 100}%`;
  const c = d.consulta;
  const sacados = c?.tipo === 'buscar' ? c.ids : [];
  return (
    <div className={`bv3d capa-${d.capa}${d.resuelta ? ' resuelta' : ''}`}>
      <canvas ref={cv} width={W} height={H} className="bv3d-lienzo" role="img"
              aria-label={`La bóveda de los recuerdos: ${c ? c.quedan : d.total} de ${d.total} siguen encendidos`} />
      <span className="bv3d-ojo" aria-hidden="true">LA BÓVEDA · {d.capa === 1 ? 'recuerdos' : 'recuerdos ⟷ personas'}</span>
      <div className="bv3d-cuenta" aria-hidden="true">
        <b>{d.resuelta ? '✓' : c ? c.quedan : d.total}</b>
        <span>{d.resuelta ? 'el torso se abre' : `de ${d.total} recuerdos`}</span>
      </div>
      {/* Los recuerdos que se buscaron: su id sobre el cajón que sobresale. */}
      {sacados.map((id, i) => {
        const k = e.recuerdos[i];
        if (!k) return null;
        const p = proy(k.pared === IZQ ? IZQ + 0.16 : DER - 0.16, (k.y0 + k.y1) / 2, k.h1 + 0.02);
        return <span key={id} className="bv3d-id" style={{ left: pct(p.sx, W), top: pct(p.sy, H) }}>{id}</span>;
      })}
      {/* Las personas, con su nombre sobre su cajón. */}
      {e.personas.map((k, i) => {
        const p = d.personas[i];
        if (!p) return null;
        const q = proy(DER - 0.02, (k.y0 + k.y1) / 2, k.h1 + 0.03);
        // Solo se rotula a quien gana el agrupado: los demás nombres ya
        // están en las columnas de luz y en la tabla de la respuesta.
        const top = c?.grupos?.[0] && (c.grupos[0].clave === p.nombre || c.grupos[0].clave === p.id);
        if (!top) return null;
        return <span key={p.id} className="bv3d-persona top" style={{ left: pct(q.sx, W), top: pct(q.sy, H) }}>{p.nombre}</span>;
      })}
      {/* Cada grupo, con su clave y cuántos. */}
      {c?.grupos && columnas(c.grupos.length).map((col, i) => {
        const g = c.grupos![i];
        const alto = 0.04 + ALTO_COL * g.n / (c.grupos![0].n || 1);
        const p = proy((col.x0 + col.x1) / 2, Y_COL, alto);
        const pie = proy((col.x0 + col.x1) / 2, Y_COL, 0);
        const muchos = c.grupos!.length > 6;
        return (
          <span key={g.clave}>
            <span className={`bv3d-grupo${i === 0 ? ' top' : ''}`} style={{ left: pct(p.sx, W), top: pct(p.sy, H) }}>{g.n}</span>
            <span className={`bv3d-grupo-nombre${i === 0 ? ' top' : ''}${muchos ? ' inclinado' : ''}`} style={{ left: pct(pie.sx, W), top: pct(pie.sy + 2, H) }}>
              {g.clave}
            </span>
          </span>
        );
      })}
      {d.abierto && (
        <span key={d.abierto.n} className={`bv3d-abierto ${d.abierto.ok ? 'ok' : 'mal'}`}>
          {d.abierto.id} · {d.abierto.ok ? 'ABIERTO' : 'NO ES ESTE'}
        </span>
      )}
      {c && <code className="bv3d-sql">{c.sql}</code>}
    </div>
  );
}
