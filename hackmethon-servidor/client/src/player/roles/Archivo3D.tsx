import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FOV, H, W, pintar, type Celda } from '../fases/motor3d';
import { sonar } from '../../lib/sonido';

// ============================================================
//  EL ARCHIVO DE LA MÁQUINA · la base de datos de Datos, en 3D
//
//  Lo que antes era un mapa de cajas ahora es una sala: cada TABLA es una
//  torre de datos y sus FILAS, placas de luz apiladas (cuántas hay se ve
//  de un vistazo). Las RELACIONES son cables de luz entre torres, con el
//  campo que las une. Abajo, el PUERTO DE ENTRADA: por ahí llega lo que
//  escribe el resto del equipo.
//
//  Lo que la hace viva:
//    · cuando llegan filas nuevas, sale un pulso del puerto, viaja hasta
//      cada tabla que las recibe, enciende sus placas y sigue por sus
//      cables hacia las tablas relacionadas;
//    · al saltar de una tabla a otra por una relación, la luz recorre ese
//      cable;
//    · la consulta que haga Datos en la hoja (filtrar, ordenar…) se ve en
//      la torre: las placas que no cumplen se apagan.
//
//  El ataque a Datos ocurre AQUÍ: la mano del robot baja del techo y agarra
//  una torre, todas tiemblan y sueltan sus placas al suelo, los cables se
//  cortan y la sala entra en alarma. Mientras dura, el archivo no se usa;
//  al acabar, las placas vuelven a subir.
//
//  Cada torre ocupa en pantalla el mismo lugar relativo que tenía en el
//  mapa 2D de cada fase —se proyecta al revés: de la posición en pantalla
//  a la del mundo—, así que nada se encima; la profundidad y la altura le
//  dan volumen y perspectiva. Ligera como las demás vistas: la sala se
//  pinta una vez; encima, ~8 cuadros por segundo con los flujos y un
//  ambiente tenue (paquetes por los cables) que se apaga con «reducir
//  movimiento» y se detiene con la pestaña oculta.
// ============================================================

export type TablaArchivo = {
  id: string; nombre: string; x: number; y: number; w: number;
  columnas: string[]; filas: string[][]; nuevas?: string[];
};
export type RelacionArchivo = { desde: string; campo: string; hasta: string };

const SALA = ['#########', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#########'];
const CAM = { x: 4.5, y: 7.6, ojo: 0.5 };
const PROF = 0.35;
const PULSO_MS = 1400;
const VIAJE_MS = 900;

const proy = (x: number, y: number, h: number) => {
  const z = Math.max(0.05, CAM.y - y);
  return { sx: (W / 2) * (1 + (x - CAM.x) / (z * FOV)), sy: H / 2 + ((CAM.ojo - h) * H) / z, z };
};

/** La torre de una tabla: dónde va en el mundo para caer en pantalla donde
 *  estaba en el mapa 2D. Las de arriba del mapa, al fondo y más altas. */
type Torre = { id: string; x0: number; x1: number; y0: number; y1: number; h0: number; h1: number; sx: number; base: number; cima: number; ancho: number };
function torres(tablas: TablaArchivo[], lienzo: { w: number; h: number }): Map<string, Torre> {
  const m = new Map<string, Torre>();
  for (const t of tablas) {
    const xn = (t.x + t.w / 2) / lienzo.w;
    const yn = Math.min(1, (t.y + 40) / lienzo.h);
    const z = 4.9 - yn * 2.7;                         // de 4.9 (fondo) a 2.2 (cerca)
    const wy = CAM.y - z;
    const sx = 18 + xn * (W - 36);
    const sBase = 62 + yn * 112;                      // dónde queda la base en pantalla
    const wx = CAM.x + (sx / (W / 2) - 1) * z * FOV;
    const anchoPx = Math.max(26, Math.min(96, (t.w / lienzo.w) * (W - 36) * 0.78));
    const ancho = (anchoPx / (W / 2)) * z * FOV;
    const h0 = CAM.ojo - ((sBase - H / 2) * z) / H;
    const altoPx = 14 + Math.min(1, t.filas.length / 24) * 22;
    const h1 = h0 + (altoPx * z) / H;
    m.set(t.id, {
      id: t.id, x0: wx - ancho / 2, x1: wx + ancho / 2, y0: wy - PROF, y1: wy, h0, h1,
      sx, base: sBase, cima: sBase - altoPx, ancho: anchoPx,
    });
  }
  return m;
}

const PUERTO = { x: CAM.x, y: CAM.y - 1.35 };
const luzA = (z: number) => Math.max(0.3, Math.pow(Math.max(0, 1 - z / 8), 1.1));

function hacerFondo(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const celda: Celda = (f, c) => SALA[f]?.[c] ?? '#';
  pintar(new Uint32Array(img.data.buffer), new Float32Array(W), celda, { x: CAM.x, y: CAM.y, ang: 0 }, {
    niebla: 8, ambiente: 0.07, salto: 0,
    sprites: [{ x: PUERTO.x, y: PUERTO.y, rgb: [79, 134, 238], alto: 0.35, ancho: 0.5, base: 0 }],
  });
  ctx.putImageData(img, 0, 0);
  return cv;
}

type Pulso = { desde: number; tablas: string[]; cables: RelacionArchivo[] };
/** El ambiente: lo que se mueve aunque nadie escriba. Paquetes tenues por
 *  los cables, alguna chispa desde el puerto y placas que parpadean como si
 *  las estuvieran leyendo. Más pequeño y apagado que un flujo de verdad,
 *  para no confundirse con él. */
type Ambiente = { desde: number; dura: number } & (
  | { tipo: 'cable'; rel: RelacionArchivo; vuelta: boolean }
  | { tipo: 'puerto'; tabla: string }
  | { tipo: 'placa'; tabla: string; k: number }
);
type Viaje = { desde: number; de: string; a: string };

/** EL ATAQUE: la mano del robot secuestra el archivo. `desde` y `fin` en
 *  el reloj de performance; `tabla`, la torre que agarra. */
type Ataque = { desde: number; fin: number; tabla: string | null };
const ENTRA_MS = 700, CAE_MS = 800, REPARA_MS = 900;
/** Qué tanto cayeron las placas (0 en su sitio, 1 en el suelo). */
const caida = (a: Ataque, t: number) => {
  if (t >= a.fin) return 0;
  if (t > a.fin - REPARA_MS) return (a.fin - t) / REPARA_MS;
  return Math.max(0, Math.min(1, (t - a.desde - ENTRA_MS * 0.6) / CAE_MS));
};
/** Dónde está la mano: 0 fuera de cuadro, 1 agarrando. */
const agarre = (a: Ataque, t: number) => {
  if (t >= a.fin) return 0;
  if (t > a.fin - REPARA_MS) return (a.fin - t) / REPARA_MS;
  return Math.min(1, (t - a.desde) / ENTRA_MS);
};
/** Un pseudoaleatorio estable por número: las placas caen siempre igual. */
const azar = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Un punto de una curva cuadrática, para los cables y los pulsos. */
const curva = (a: { x: number; y: number }, b: { x: number; y: number }, u: number, combar = 14) => {
  const cx = (a.x + b.x) / 2, cy = Math.max(a.y, b.y) + combar;
  return { x: (1 - u) ** 2 * a.x + 2 * (1 - u) * u * cx + u * u * b.x, y: (1 - u) ** 2 * a.y + 2 * (1 - u) * u * cy + u * u * b.y, cx, cy };
};

/** Un haz de luz que avanza por una curva hasta `u`: lo recorrido queda
 *  encendido y se apaga hacia atrás; la cabeza lleva un halo. */
function haz(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }, u: number, combar: number, rgb: string) {
  if (u <= 0) return;
  const pasos = 18;
  for (let k = 1; k <= pasos; k++) {
    const t0 = ((k - 1) / pasos) * u, t1 = (k / pasos) * u;
    const p0 = curva(a, b, t0, combar), p1 = curva(a, b, t1, combar);
    ctx.strokeStyle = `rgba(${rgb},${(0.15 + 0.75 * (k / pasos)) * (u < 1 ? 1 : 0.6)})`;
    ctx.lineWidth = 1 + 2 * (k / pasos);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
  }
  if (u < 1) {
    const q = curva(a, b, u, combar);
    ctx.fillStyle = `rgba(${rgb},.25)`; ctx.fillRect(q.x - 6, q.y - 6, 12, 12);
    ctx.fillStyle = `rgba(${rgb},.5)`; ctx.fillRect(q.x - 4, q.y - 4, 8, 8);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
  }
}

function pintarAmbiente(
  ctx: CanvasRenderingContext2D, geo: Map<string, Torre>, ambiente: Ambiente[], ahora: number,
) {
  const p = proy(PUERTO.x, PUERTO.y, 0);
  const ancla = (id: string) => { const g = geo.get(id)!; return { x: g.sx, y: g.base - 2 }; };
  for (const a of ambiente) {
    const u = (ahora - a.desde) / a.dura;
    if (u < 0 || u > 1) continue;
    if (a.tipo === 'placa') {
      const g = geo.get(a.tabla);
      if (!g) continue;
      const y = g.base - (a.k + 1) * Math.min(g.base - g.cima, 6);
      ctx.fillStyle = `rgba(180,245,212,${0.7 * Math.sin(u * Math.PI)})`;
      ctx.fillRect(g.sx - g.ancho / 2 + 3, Math.max(g.cima + 1, y), g.ancho - 6, 2);
      continue;
    }
    let de: { x: number; y: number }, a2: { x: number; y: number }, combar = 14;
    if (a.tipo === 'cable') {
      if (!geo.has(a.rel.desde) || !geo.has(a.rel.hasta)) continue;
      de = ancla(a.vuelta ? a.rel.hasta : a.rel.desde); a2 = ancla(a.vuelta ? a.rel.desde : a.rel.hasta);
    } else {
      if (!geo.has(a.tabla)) continue;
      de = { x: p.sx, y: p.sy }; a2 = ancla(a.tabla); combar = 18;
    }
    // Una cabeza pequeña con una estela corta detrás.
    for (let k = 0; k < 5; k++) {
      const q = curva(de, a2, Math.max(0, u - k * 0.03), combar);
      ctx.fillStyle = `rgba(${a.tipo === 'puerto' ? '250,57,186' : '180,245,212'},${(0.85 - k * 0.16) * Math.sin(u * Math.PI)})`;
      const r = k ? 1.5 : 2.5;
      ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
    }
  }
}

function pintarArchivo(
  ctx: CanvasRenderingContext2D, fondo: HTMLCanvasElement, tablas: TablaArchivo[], rels: RelacionArchivo[],
  geo: Map<string, Torre>, sel: { id: string | null; visibles: number | null }, pulso: Pulso | null, viaje: Viaje | null, ahora: number,
  ataque: Ataque | null = null, quieto = false,
) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fondo, 0, 0);
  const atk = ataque && ahora < ataque.fin ? ataque : null;
  const cae = atk ? caida(atk, ahora) : 0;
  // Todo tiembla mientras la mano sostiene el archivo (sin «reducir movimiento»).
  const temblor = (k: number) => (atk && !quieto ? (azar(Math.floor(ahora / 60) + k) - 0.5) * 3 * (0.4 + cae) : 0);
  const anclaje = (id: string) => {
    const g = geo.get(id)!;
    return { x: g.sx, y: g.base - 2 };
  };

  // Los cables: entre las bases de las torres, combados hacia el suelo.
  for (const r of rels) {
    if (!geo.has(r.desde) || !geo.has(r.hasta)) continue;
    const a = anclaje(r.desde), b = anclaje(r.hasta);
    const { cx, cy } = curva(a, b, 0);
    if (atk) {
      // Cortado: dos cabos colgando y chispas rojas en el corte.
      ctx.strokeStyle = `rgba(255,68,102,${0.35 + 0.3 * azar(Math.floor(ahora / 90) + a.x)})`; ctx.lineWidth = 1.5;
      for (const [o, f] of [[a, 0.42], [b, 0.58]] as const) {
        ctx.beginPath(); ctx.moveTo(o.x, o.y);
        for (let k = 1; k <= 8; k++) {
          const u = o === a ? (k / 8) * f : 1 - (k / 8) * (1 - f);
          const q = curva(a, b, u); ctx.lineTo(q.x, q.y + (k / 8) * 6 * cae);
        }
        ctx.stroke();
      }
      const m = curva(a, b, 0.5);
      for (let k = 0; k < 4; k++) {
        if (azar(Math.floor(ahora / 70) * 7 + k + a.x) < 0.5) continue;
        ctx.fillStyle = k % 2 ? '#ffd3dc' : '#ff4466';
        ctx.fillRect(m.x + (azar(ahora + k) - 0.5) * 10, m.y + 4 * cae + (azar(ahora * 2 + k) - 0.5) * 8, 2, 2);
      }
      continue;
    }
    const vivo = sel.id === r.desde || sel.id === r.hasta;
    ctx.strokeStyle = vivo ? 'rgba(180,245,212,.85)' : 'rgba(79,134,238,.6)';
    ctx.lineWidth = vivo ? 2 : 1.5;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y); ctx.stroke();
  }

  // El puerto de entrada.
  const p = proy(PUERTO.x, PUERTO.y, 0);
  ctx.strokeStyle = 'rgba(79,134,238,.9)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(p.sx, p.sy, 16, 4, 0, 0, Math.PI * 2); ctx.stroke();

  // Las torres, del fondo hacia delante.
  const orden = [...tablas].filter((t) => geo.has(t.id)).sort((a, b) => geo.get(a.id)!.y1 - geo.get(b.id)!.y1);
  for (const t of orden) {
    const g = geo.get(t.id)!;
    const l = luzA(CAM.y - g.y1);
    const dx = temblor(g.sx);
    ctx.save(); ctx.translate(dx, 0);
    const elegida = !atk && sel.id === t.id;
    // El poste que la sostiene, hasta el suelo.
    const suelo = proy((g.x0 + g.x1) / 2, g.y1, 0);
    if (suelo.sy > g.base + 1) { ctx.fillStyle = 'rgba(42,51,80,.9)'; ctx.fillRect(g.sx - 1, g.base, 2, suelo.sy - g.base); }
    // El costado que mira a la cámara y la cara de arriba o de abajo.
    const lado = g.x1 < CAM.x ? g.x1 : g.x0 > CAM.x ? g.x0 : null;
    const pol = (pts: { sx: number; sy: number }[], c: string) => {
      ctx.fillStyle = c; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.sx, q.sy) : ctx.moveTo(q.sx, q.sy))); ctx.closePath(); ctx.fill();
    };
    if (lado !== null) {
      pol([proy(lado, g.y1, g.h0), proy(lado, g.y0, g.h0), proy(lado, g.y0, g.h1), proy(lado, g.y1, g.h1)], `rgba(20,26,44,${0.95})`);
    }
    const tapa = g.h1 < CAM.ojo ? g.h1 : g.h0 > CAM.ojo ? g.h0 : null;
    if (tapa !== null) {
      pol([proy(g.x0, g.y1, tapa), proy(g.x1, g.y1, tapa), proy(g.x1, g.y0, tapa), proy(g.x0, g.y0, tapa)], tapa === g.h1 ? 'rgba(60,72,110,.95)' : 'rgba(14,18,30,.95)');
    }
    // La cara de frente, con una placa por fila.
    const a = proy(g.x0, g.y1, g.h1), b = proy(g.x1, g.y1, g.h0);
    const x = a.sx, y = a.sy, w = b.sx - a.sx, h = b.sy - a.sy;
    ctx.fillStyle = `rgba(${18 * l + 6 | 0},${26 * l + 8 | 0},${40 * l + 12 | 0},.96)`;
    ctx.fillRect(x, y, w, h);
    const n = t.filas.length;
    const placas = Math.min(n, Math.max(1, Math.floor(h / 2.4)));
    // Las nuevas se encienden en rosa arriba de la pila; con una consulta
    // abierta, las placas de lo que no cumple se apagan.
    const ids = new Set(t.nuevas ?? []);
    const nNuevas = t.filas.filter((f) => ids.has(f[0])).length;
    const placasNuevas = nNuevas ? Math.max(1, Math.round((nNuevas / Math.max(1, n)) * placas)) : 0;
    const placasVivas = elegida && sel.visibles !== null ? Math.round((sel.visibles / Math.max(1, n)) * placas) : placas;
    for (let k = 0; k < placas; k++) {
      const yy = y + h - (k + 1) * (h / placas) + 1;
      const nueva = k >= placas - placasNuevas;
      const apagada = k >= placasVivas;
      const alto = Math.max(1, h / placas - 1.4);
      if (atk) {
        // Se sueltan de arriba abajo y quedan regadas en el suelo, en rojo.
        const r1 = azar(g.sx * 13 + k), r2 = azar(g.sx * 7 + k * 3);
        const c = Math.max(0, Math.min(1, cae * 1.6 - (k / placas) * 0.6));
        const sy = suelo.sy - 1 - (k % 3) * 2;
        const px = x + 3 + (r1 - 0.5) * w * 1.3 * c, py = yy + (sy - yy) * c * c;
        ctx.fillStyle = c > 0.98 ? `rgba(255,68,102,${0.35 + 0.3 * r2})` : `rgba(61,220,151,${0.5 - 0.2 * c})`;
        ctx.fillRect(px, py, (w - 6) * (1 - 0.45 * c), alto * (1 - 0.3 * c));
        continue;
      }
      ctx.fillStyle = apagada ? 'rgba(61,220,151,.1)' : nueva ? 'rgba(250,57,186,.9)' : `rgba(61,220,151,${0.35 + 0.45 * l})`;
      ctx.fillRect(x + 3, yy, w - 6, alto);
    }
    ctx.strokeStyle = elegida ? '#ffffff' : 'rgba(79,134,238,.85)';
    ctx.lineWidth = elegida ? 1.5 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // El contraluz frío del puerto, en el canto.
    ctx.fillStyle = atk ? 'rgba(255,68,102,.5)' : 'rgba(180,245,212,.45)'; ctx.fillRect(x, y, w, 1);
    ctx.restore();
  }

  // El pulso: del puerto a las tablas con filas nuevas, y de ahí por sus cables.
  // Se dibuja como un haz que se va encendiendo por el camino, con una
  // cabeza brillante y su halo: la información, viajando.
  if (pulso && !atk) {
    const u = (ahora - pulso.desde) / PULSO_MS;
    const ida = Math.min(1, u / 0.6), sigue = Math.max(0, Math.min(1, (u - 0.6) / 0.4));
    for (const id of pulso.tablas) {
      if (!geo.has(id)) continue;
      haz(ctx, { x: p.sx, y: p.sy }, anclaje(id), ida, 18, '250,57,186');
    }
    if (sigue > 0) {
      for (const r of pulso.cables) {
        if (!geo.has(r.desde) || !geo.has(r.hasta)) continue;
        const ya = pulso.tablas.includes(r.desde);
        haz(ctx, ya ? anclaje(r.desde) : anclaje(r.hasta), ya ? anclaje(r.hasta) : anclaje(r.desde), sigue, 14, '180,245,212');
      }
    }
  }
  // El viaje de un salto: la luz recorre el cable de una tabla a otra.
  if (viaje && !atk && geo.has(viaje.de) && geo.has(viaje.a)) {
    const u = Math.min(1, (ahora - viaje.desde) / VIAJE_MS);
    if (u < 1) haz(ctx, anclaje(viaje.de), anclaje(viaje.a), u, 14, '255,255,255');
  }
  if (atk) pintarSecuestro(ctx, geo, atk, ahora, quieto);
}

/** La alarma roja y la mano del robot, agarrando una torre desde arriba. */
function pintarSecuestro(ctx: CanvasRenderingContext2D, geo: Map<string, Torre>, atk: Ataque, t: number, quieto: boolean) {
  const m = agarre(atk, t);
  // La alarma: la sala se tiñe de rojo y parpadea.
  const late = quieto ? 0.5 : 0.5 + 0.5 * Math.sin(t / 180);
  ctx.fillStyle = `rgba(255,30,70,${(0.1 + 0.1 * late) * Math.min(1, m * 2)})`;
  ctx.fillRect(0, 0, W, H);
  // Rayas de interferencia.
  if (!quieto) {
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = 'rgba(255,68,102,.18)';
      ctx.fillRect(0, (t / 9 + k * 53) % H, W, 1 + (k % 2));
    }
  }
  const g = (atk.tabla && geo.get(atk.tabla)) || [...geo.values()][0];
  if (!g || m <= 0) return;
  // La mano baja del techo y se cierra sobre la cima de la torre.
  const sac = quieto ? 0 : (azar(Math.floor(t / 70)) - 0.5) * 6;
  const cx = g.sx + sac, ancho = Math.max(30, g.ancho * 0.9);
  const cima = g.cima - 4 - (1 - m) * (g.cima + 70);
  const piel = '#2a1630', borde = '#fa39ba', brillo = '#ff7ad1';
  // El antebrazo, desde arriba del cuadro.
  ctx.fillStyle = piel; ctx.fillRect(cx - ancho * 0.22, -10, ancho * 0.44, cima + 4);
  ctx.fillStyle = borde; ctx.fillRect(cx - ancho * 0.22, -10, 1, cima + 4); ctx.fillRect(cx + ancho * 0.22 - 1, -10, 1, cima + 4);
  // Juntas del brazo, como pistones.
  for (let y = cima - 14; y > -10; y -= 14) { ctx.fillStyle = 'rgba(250,57,186,.5)'; ctx.fillRect(cx - ancho * 0.22, y, ancho * 0.44, 1); }
  // La palma.
  const py = cima - 12;
  ctx.fillStyle = piel; ctx.fillRect(cx - ancho / 2, py, ancho, 14);
  ctx.strokeStyle = borde; ctx.lineWidth = 1; ctx.strokeRect(cx - ancho / 2 + 0.5, py + 0.5, ancho - 1, 13);
  // Cuatro dedos que se cierran sobre los costados y el frente de la torre.
  const cierra = Math.min(1, m * 1.4);
  for (let k = 0; k < 4; k++) {
    const grueso = Math.max(5, Math.round(ancho / 6));
    const fx = cx - ancho / 2 + 1 + k * ((ancho - grueso - 2) / 3);
    const largo = 8 + 14 * cierra;
    ctx.fillStyle = piel; ctx.fillRect(fx, py + 13, grueso, largo);
    ctx.strokeStyle = borde; ctx.strokeRect(fx + 0.5, py + 13.5, grueso - 1, largo - 1);
    // Los nudillos y la uña de cada dedo.
    ctx.fillStyle = 'rgba(250,57,186,.6)'; ctx.fillRect(fx, py + 13 + largo * 0.45, grueso, 1);
    ctx.fillStyle = borde; ctx.fillRect(fx, py + 13 + largo - 3, grueso, 3);
    ctx.fillStyle = brillo; ctx.fillRect(fx + 1, py + 15, 1, largo - 6);
  }
  // El ojo del robot, en el dorso: lo vigila todo.
  ctx.fillStyle = quieto || Math.sin(t / 120) > -0.6 ? '#ff4466' : '#401020';
  ctx.fillRect(cx - 3, py + 4, 6, 5);
  ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1, py + 5, 2, 2);
}

const reducido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const firma = (t: TablaArchivo) => `${t.filas.length}:${(t.nuevas ?? []).join(',')}`;

export function Archivo3D({ tablas, relaciones, lienzo, seleccion, visibles, viaje, alAbrir, secuestro }: {
  tablas: TablaArchivo[];
  relaciones: RelacionArchivo[];
  lienzo: { w: number; h: number };
  /** La tabla abierta en la hoja. */
  seleccion: string | null;
  /** Cuántas filas deja ver la consulta de la hoja (null: todas). */
  visibles: number | null;
  /** El último salto por una relación: la luz recorre ese cable. */
  viaje: { n: number; de: string; a: string } | null;
  alAbrir: (id: string) => void;
  /** El ataque a Datos: hasta cuándo (reloj del sistema), qué torre agarra
   *  la mano y quién lo mandó. Mientras dura, el archivo no se usa. */
  secuestro?: { hasta: number; tabla: string | null; de?: string } | null;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const fondo = useRef<HTMLCanvasElement | null>(null);
  const geo = useMemo(() => torres(tablas, lienzo), [tablas, lienzo]);

  // ¿Llegó algo? Se compara cada tabla con cómo estaba la última vez.
  const previas = useRef<Map<string, string> | null>(null);
  const [pulso, setPulso] = useState<Pulso | null>(null);
  useEffect(() => {
    const ahora = new Map(tablas.map((t) => [t.id, firma(t)]));
    const antes = previas.current;
    previas.current = ahora;
    if (!antes) return;
    const cambian = tablas.filter((t) => antes.has(t.id) && antes.get(t.id) !== ahora.get(t.id) && (t.nuevas?.length ?? 0) > 0).map((t) => t.id);
    if (!cambian.length) return;
    setPulso({ desde: performance.now(), tablas: cambian, cables: relaciones.filter((r) => cambian.includes(r.desde) || cambian.includes(r.hasta)) });
    sonar('brota');
  }, [tablas, relaciones]);

  const [viajeVivo, setViajeVivo] = useState<Viaje | null>(null);
  useEffect(() => {
    if (viaje) setViajeVivo({ desde: performance.now(), de: viaje.de, a: viaje.a });
  }, [viaje?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // El secuestro, pasado al reloj de los cuadros.
  const [ataque, setAtaque] = useState<Ataque | null>(null);
  useEffect(() => {
    if (!secuestro || secuestro.hasta <= Date.now()) {
      // Acabó: si no estaba ya reparándose, que se vea cómo vuelve todo.
      const ahora = performance.now();
      setAtaque((a) => (a && a.fin > ahora ? { ...a, fin: Math.min(a.fin, ahora + REPARA_MS) } : null));
      return;
    }
    const ahora = performance.now();
    // Si ya venía en curso (al recargar), las placas ya están en el suelo.
    setAtaque((a) => ({ desde: a && a.fin > ahora ? a.desde : ahora, fin: ahora + (secuestro.hasta - Date.now()), tabla: secuestro.tabla }));
    sonar('error');
  }, [secuestro?.hasta, secuestro?.tabla]); // eslint-disable-line react-hooks/exhaustive-deps
  // La cuenta de lo que falta y el aviso de que acabó.
  const [, setTic] = useState(0);
  useEffect(() => {
    if (!ataque) return;
    const id = setInterval(() => {
      setTic((n) => n + 1);
      if (performance.now() >= ataque.fin) { clearInterval(id); setAtaque(null); }
    }, 250);
    return () => clearInterval(id);
  }, [ataque]);
  const secuestrado = !!ataque && performance.now() < ataque.fin;

  // Lo que se pinta en cada cuadro, al día, sin rehacer el bucle.
  const actual = useRef({ tablas, relaciones, geo, seleccion, visibles, pulso, viajeVivo, ataque });
  actual.current = { tablas, relaciones, geo, seleccion, visibles, pulso, viajeVivo, ataque };
  const ambiente = useRef<Ambiente[]>([]);

  // Al cambiar algo se pinta enseguida; el resto lo hace el bucle.
  useLayoutEffect(() => {
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    if (!fondo.current) fondo.current = hacerFondo();
    pintarArchivo(ctx, fondo.current, tablas, relaciones, geo, { id: seleccion, visibles }, pulso, viajeVivo, performance.now(), ataque, reducido());
  }, [tablas, relaciones, geo, seleccion, visibles, pulso, viajeVivo, ataque]);

  // Un solo bucle a ~8 cuadros por segundo: los flujos de verdad y el
  // ambiente. requestAnimationFrame se detiene solo con la pestaña oculta;
  // con «reducir movimiento» no hay ambiente y solo se anima lo que llega.
  useEffect(() => {
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    const quieto = reducido();
    let id = 0, ultimo = 0, proximo = performance.now() + 600;
    const cuadro = (t: number) => {
      id = requestAnimationFrame(cuadro);
      if (t - ultimo < 120 || !fondo.current) return;
      ultimo = t;
      const s = actual.current;
      const vivo = (s.pulso && t < s.pulso.desde + PULSO_MS) || (s.viajeVivo && t < s.viajeVivo.desde + VIAJE_MS)
        || (s.ataque && t < s.ataque.fin + 200);
      if (quieto && !vivo) return;
      const enAtaque = !!s.ataque && t < s.ataque.fin;
      if (!quieto && !enAtaque && t >= proximo && s.tablas.length) {
        // Algo se mueve cada segundo, más o menos (a veces dos cosas a la vez).
        proximo = t + 500 + Math.random() * 900;
        const r = Math.random();
        const rel = s.relaciones[Math.floor(Math.random() * Math.max(1, s.relaciones.length))];
        const tabla = s.tablas[Math.floor(Math.random() * s.tablas.length)].id;
        ambiente.current.push(rel && r < 0.55
          ? { tipo: 'cable', rel, vuelta: Math.random() < 0.5, desde: t, dura: 1600 }
          : r < 0.8 ? { tipo: 'puerto', tabla, desde: t, dura: 1800 }
          : { tipo: 'placa', tabla, k: Math.floor(Math.random() * 6), desde: t, dura: 700 });
      }
      ambiente.current = ambiente.current.filter((a) => t < a.desde + a.dura);
      pintarArchivo(ctx, fondo.current, s.tablas, s.relaciones, s.geo, { id: s.seleccion, visibles: s.visibles }, s.pulso, s.viajeVivo, t, s.ataque, quieto);
      if (!enAtaque) pintarAmbiente(ctx, s.geo, ambiente.current, t);
    };
    id = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(id);
  }, []);

  const pct = (v: number, t: number) => `${(v / t) * 100}%`;
  return (
    <div className={`archivo3d${secuestrado ? ' secuestrado' : ''}`}>
      <canvas ref={cv} width={W} height={H} className="archivo3d-lienzo" role="img"
              aria-label="El archivo de la máquina: las tablas como torres y sus relaciones como cables" />
      <span className="archivo3d-ojo" aria-hidden="true">EL ARCHIVO · {tablas.length} tablas · {relaciones.length} relaciones</span>
      <span className="archivo3d-puerto" aria-hidden="true" style={{ left: pct(proy(PUERTO.x, PUERTO.y, 0).sx, W), top: pct(proy(PUERTO.x, PUERTO.y, 0).sy + 5, H) }}>
        puerto de entrada
      </span>
      {relaciones.map((r) => {
        const a = geo.get(r.desde), b = geo.get(r.hasta);
        if (!a || !b) return null;
        const q = curva({ x: a.sx, y: a.base }, { x: b.sx, y: b.base }, 0.5);
        return <span key={`${r.desde}.${r.campo}`} className="archivo3d-campo" style={{ left: pct(q.x, W), top: pct(q.y, H) }}>{r.campo}</span>;
      })}
      {tablas.map((t) => {
        const g = geo.get(t.id);
        if (!g) return null;
        return (
          <button key={t.id} type="button"
                  className={`archivo3d-torre${seleccion === t.id ? ' elegida' : ''}`}
                  style={{ left: pct(g.sx - g.ancho / 2, W), top: pct(g.cima - 11, H), width: pct(g.ancho, W), height: pct(g.base - g.cima + 13, H) }}
                  disabled={secuestrado}
                  onClick={() => { sonar('abrir'); alAbrir(t.id); }}
                  aria-label={`Abrir la tabla ${t.nombre}, ${t.filas.length} filas`}>
            <span className="archivo3d-nombre">{t.nombre}</span>
            <span className="archivo3d-n">
              {t.filas.length}{!!t.nuevas?.length && <b> +{t.nuevas.length}</b>}
            </span>
          </button>
        );
      })}
      {secuestrado && ataque && (
        <div className="archivo3d-secuestro" role="alert">
          <b>ARCHIVO SECUESTRADO</b>
          <span>la mano del robot tiene la memoria{secuestro?.de ? ` · lo manda ${secuestro.de}` : ''}</span>
          <span className="archivo3d-secuestro-n">{Math.max(1, Math.ceil((ataque.fin - performance.now()) / 1000))} s</span>
        </div>
      )}
    </div>
  );
}
