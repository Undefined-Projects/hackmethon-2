import { useEffect, useRef, useState } from 'react';
import { FOV, H, W, pintar, type Celda } from '../fases/motor3d';

// ============================================================
//  EL NERVIO EN 3D · la consola de Terminal
//
//  Terminal es el nervio: el que manda impulsos al cuerpo. Aquí lo ve:
//  mira hacia el fondo de un túnel nervioso —mitad fibra, mitad circuito—
//  y cada comando sale como un IMPULSO de luz que viaja hacia la sinapsis
//  del fondo, con su texto encima.
//
//    · ENTREGADO: el juego lo ejecutó. Llega al fondo y la sinapsis destella.
//    · RECHAZADO: el juego no lo pudo ejecutar (no existe, mal escrito,
//      fuera de rango, imposible ahora) o el sistema no lo dejó pasar
//      (fase cerrada, pausa, sin rol). Rebota en rojo y vuelve.
//  Nunca enseña el resultado del juego: si un despliegue salió bien o mal
//  es de Pantalla, y el impulso llega igual.
//
//  Al teclear, las paredes echan chispas. En cuarentena el nervio se
//  ADORMECE: se enfría, se apaga y cuenta lo que falta. En una avería, la
//  interferencia se mete en el túnel.
//
//  Ligero como las demás vistas: el túnel se pinta una vez; encima, señales
//  tenues por las fibras a ~8 cuadros por segundo (más rápido solo con
//  impulsos en el aire), que se apagan con «reducir movimiento».
// ============================================================

const reducido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export type Impulso = { id: number; texto: string; estado: 'enviando' | 'entregado' | 'rechazado'; motivo?: string };

const TUNEL = [
  '#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#',
  '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#####',
];
const CAM = { x: 2.5, y: 12.4 };
/** Dónde está la sinapsis del fondo: hasta ahí viaja cada impulso. */
const FONDO_Y = 1.6;
const VIAJE_MS = 1300;
const REBOTE_MS = 700;
const DESTELLO_MS = 600;

const proy = (x: number, y: number, h: number) => {
  const z = Math.max(0.05, CAM.y - y);
  return { sx: (W / 2) * (1 + (x - CAM.x) / (z * FOV)), sy: H / 2 + ((0.5 - h) * H) / z, z };
};

function hacerFondo(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const celda: Celda = (f, c) => TUNEL[f]?.[c] ?? '#';
  pintar(new Uint32Array(img.data.buffer), new Float32Array(W), celda, { x: CAM.x, y: CAM.y, ang: 0 }, {
    niebla: 12, ambiente: 0.06, salto: 0,
    sprites: [
      // La sinapsis del fondo, y anillos de luz a lo largo del nervio.
      { x: CAM.x, y: FONDO_Y, rgb: [250, 57, 186], alto: 1, ancho: 0.9, base: 0 },
      ...[4, 7, 10].map((y) => ({ x: CAM.x, y, rgb: [79, 134, 238] as [number, number, number], alto: 1, ancho: 1.3, base: 0 })),
    ],
  });
  ctx.putImageData(img, 0, 0);
  // Las fibras del nervio: hebras rosas a lo largo de las paredes.
  ctx.strokeStyle = 'rgba(250,57,186,.35)'; ctx.lineWidth = 1;
  for (const [x, h] of FIBRAS) {
    const a = proy(x, CAM.y - 0.9, h), b = proy(x, FONDO_Y, h);
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
  }
  return cv;
}

/** Las fibras del nervio (x, altura), las mismas que pinta el fondo. */
const FIBRAS: [number, number][] = [[1.05, 0.15], [1.05, 0.85], [3.95, 0.2], [3.95, 0.8], [1.6, 0.98], [3.4, 0.98]];
/** El ambiente: señales que corren por las fibras hacia la sinapsis y,
 *  cada tanto, un anillo que recorre el túnel. Tenue: no es un comando. */
type Senal = { tipo: 'fibra'; f: number; desde: number; dura: number } | { tipo: 'anillo'; desde: number; dura: number };

type Vivo = { id: number; texto: string; desde: number; estado: Impulso['estado']; cambio: number; u0: number };

/** Dónde va un impulso (0 cerca, 1 en la sinapsis) y de qué color. */
function posicion(v: Vivo, ahora: number): { u: number; rojo: boolean; fin: boolean } {
  const avance = Math.min(1, (ahora - v.desde) / VIAJE_MS);
  if (v.estado === 'rechazado') {
    const r = Math.min(1, (ahora - v.cambio) / REBOTE_MS);
    return { u: v.u0 * (1 - r), rojo: true, fin: r >= 1 };
  }
  if (v.estado === 'entregado') return { u: avance, rojo: false, fin: ahora - v.desde > VIAJE_MS + DESTELLO_MS };
  // Mientras no hay acuse, avanza hasta la mitad y espera ahí.
  return { u: Math.min(avance, 0.5), rojo: false, fin: false };
}

export function Nervio3D({ impulsos, tecleo, cuarentenaHasta, averia }: {
  impulsos: Impulso[];
  /** Sube con cada tecla: chispas en las paredes. */
  tecleo: number;
  cuarentenaHasta: number | null;
  averia: boolean;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const fondo = useRef<HTMLCanvasElement | null>(null);
  const etiquetas = useRef<Map<number, HTMLSpanElement | null>>(new Map());
  const vivos = useRef<Map<number, Vivo>>(new Map());
  const chispas = useRef<{ x: number; y: number; h: number; desde: number }[]>([]);
  const [, setTick] = useState(0);
  const senales = useRef<Senal[]>([]);
  const proximo = useRef(0);
  const [ahora, setAhora] = useState(() => Date.now());

  // Cada impulso nuevo empieza a viajar; los que cambian de estado,
  // rebotan o siguen. Los que ya llegaron se olvidan.
  useEffect(() => {
    const t = performance.now();
    let nuevos = false;
    for (const i of impulsos.slice(-6)) {
      const v = vivos.current.get(i.id);
      if (!v) {
        vivos.current.set(i.id, { id: i.id, texto: i.texto, desde: t, estado: i.estado, cambio: t, u0: 0 });
        nuevos = true;
      } else if (v.estado !== i.estado) {
        v.u0 = posicion(v, t).u;
        v.estado = i.estado;
        v.cambio = t;
      }
    }
    if (nuevos) setTick((n) => n + 1);
  }, [impulsos]);

  useEffect(() => {
    if (!tecleo) return;
    const t = performance.now();
    for (let k = 0; k < 3; k++) {
      chispas.current.push({ x: Math.random() < 0.5 ? 1.02 : 3.98, y: CAM.y - 1 - Math.random() * 4, h: Math.random(), desde: t });
    }
    if (chispas.current.length > 40) chispas.current.splice(0, chispas.current.length - 40);
  }, [tecleo]);

  // La cuarentena se cuenta en segundos.
  const enCuarentena = !!cuarentenaHasta && cuarentenaHasta > ahora;
  useEffect(() => {
    if (!cuarentenaHasta || cuarentenaHasta <= Date.now()) return;
    const id = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(id);
  }, [cuarentenaHasta]);

  useEffect(() => {
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    if (!fondo.current) fondo.current = hacerFondo();
    let id = 0;
    let ultimo = 0;
    const sinAmbiente = reducido();
    const cuadro = (t: number) => {
      id = requestAnimationFrame(cuadro);
      const quieto = vivos.current.size === 0 && chispas.current.length === 0;
      // ~12 cuadros por segundo con impulsos en el aire; ~8 con solo ambiente.
      if (t - ultimo < (quieto ? 120 : 80)) return;
      ultimo = t;
      if (quieto && sinAmbiente && !averia) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(fondo.current!, 0, 0);
      // El ambiente: el nervio no está nunca del todo quieto.
      if (!sinAmbiente) {
        if (t >= proximo.current) {
          proximo.current = t + 350 + Math.random() * 650;
          senales.current.push(Math.random() < 0.12
            ? { tipo: 'anillo', desde: t, dura: 2600 }
            : { tipo: 'fibra', f: Math.floor(Math.random() * FIBRAS.length), desde: t, dura: 1500 + Math.random() * 900 });
        }
        senales.current = senales.current.filter((x) => t < x.desde + x.dura);
        for (const sn of senales.current) {
          const u = (t - sn.desde) / sn.dura;
          const y = CAM.y - 0.9 - u * (CAM.y - 0.9 - FONDO_Y);
          if (sn.tipo === 'anillo') {
            const a = proy(1, y, 1), b = proy(4, y, 0);
            ctx.strokeStyle = `rgba(79,134,238,${0.35 * Math.sin(u * Math.PI)})`; ctx.lineWidth = 1;
            ctx.strokeRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
            continue;
          }
          const [x, h] = FIBRAS[sn.f];
          for (let k = 0; k < 3; k++) {
            const q = proy(x, Math.min(CAM.y - 0.9, y + k * 0.25), h);
            ctx.fillStyle = `rgba(250,57,186,${(0.75 - k * 0.22) * Math.sin(u * Math.PI)})`;
            ctx.fillRect(q.sx - (k ? 0.5 : 1), q.sy - (k ? 0.5 : 1), k ? 1 : 2, k ? 1 : 2);
          }
        }
      }
      // Las chispas de las teclas.
      chispas.current = chispas.current.filter((c) => t - c.desde < 400);
      for (const c of chispas.current) {
        const p = proy(c.x, c.y, c.h);
        ctx.fillStyle = `rgba(180,245,212,${1 - (t - c.desde) / 400})`;
        ctx.fillRect(p.sx - 1, p.sy - 1, 2, 2);
      }
      // Los impulsos.
      const fin = proy(CAM.x, FONDO_Y, 0.5);
      for (const v of [...vivos.current.values()]) {
        const { u, rojo, fin: acabado } = posicion(v, t);
        const el = etiquetas.current.get(v.id);
        if (acabado) { vivos.current.delete(v.id); if (el) el.style.opacity = '0'; continue; }
        const y = CAM.y - 1.8 - u * (CAM.y - 1.8 - FONDO_Y);
        const p = proy(CAM.x, y, 0.5);
        const r = Math.max(2, Math.min(9, 18 / p.z));
        const color = rojo ? '255,68,102' : '180,245,212';
        // La estela, hacia la cámara.
        const atras = proy(CAM.x, Math.min(CAM.y - 0.6, y + 0.9), 0.5);
        const g = ctx.createLinearGradient(p.sx, p.sy, atras.sx, atras.sy);
        g.addColorStop(0, `rgba(${color},.7)`); g.addColorStop(1, `rgba(${color},0)`);
        ctx.strokeStyle = g; ctx.lineWidth = r * 0.9;
        ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(atras.sx, atras.sy); ctx.stroke();
        ctx.fillStyle = `rgba(${color},.3)`; ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(${color},1)`; ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 0.45, 0, Math.PI * 2); ctx.fill();
        // Llegó: la sinapsis destella.
        if (!rojo && v.estado === 'entregado' && u >= 1) {
          const k = 1 - Math.min(1, (t - v.desde - VIAJE_MS) / DESTELLO_MS);
          ctx.fillStyle = `rgba(250,57,186,${0.6 * k})`; ctx.beginPath(); ctx.arc(fin.sx, fin.sy, 30 * (1.4 - k), 0, Math.PI * 2); ctx.fill();
        }
        if (el) {
          el.style.left = `${(p.sx / W) * 100}%`;
          el.style.top = `${((p.sy - r * 2.4) / H) * 100}%`;
          el.style.transform = `translate(-50%, -100%) scale(${Math.max(0.55, Math.min(1.1, 3 / p.z))})`;
          // Se desvanece al llegar a la sinapsis o al volver del rebote.
          const desvanece = v.estado === 'entregado' && u >= 1
            ? 1 - Math.min(1, (t - v.desde - VIAJE_MS) / DESTELLO_MS)
            : rojo ? Math.min(1, u / Math.max(0.05, v.u0) + 0.2) : 1;
          el.style.opacity = String(desvanece);
          el.dataset.estado = v.estado;
        }
      }
      // La interferencia de una avería: líneas que rasgan el túnel.
      if (averia) {
        for (let k = 0; k < 6; k++) {
          ctx.fillStyle = `rgba(${k % 2 ? '250,57,186' : '255,255,255'},.25)`;
          ctx.fillRect(0, (t / 7 + k * 37) % H, W, 1 + (k % 3));
        }
      }
    };
    id = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(id);
  }, [impulsos, tecleo, averia]);

  const restan = enCuarentena ? Math.ceil((cuarentenaHasta! - ahora) / 1000) : 0;
  const ultimos = impulsos.slice(-6);
  return (
    <div className={`nervio3d${enCuarentena ? ' adormecido' : ''}${averia ? ' averia' : ''}`}>
      <canvas ref={cv} width={W} height={H} className="nervio3d-lienzo" role="img"
              aria-label="El nervio: cada comando sale como un impulso hacia el fondo" />
      <span className="nervio3d-ojo" aria-hidden="true">EL NERVIO · cada comando es un impulso</span>
      {ultimos.map((i) => (
        <span key={i.id} ref={(el) => { etiquetas.current.set(i.id, el); }} className="nervio3d-impulso" style={{ opacity: 0 }}>
          {i.texto}
          <small>{i.estado === 'entregado' ? 'ENTREGADO' : i.estado === 'rechazado' ? 'RECHAZADO' : '…'}</small>
        </span>
      ))}
      {enCuarentena && (
        <div className="nervio3d-cuarentena" role="status">
          <b>NERVIO ADORMECIDO</b>
          <span>cuarentena · {restan} s</span>
        </div>
      )}
    </div>
  );
}
