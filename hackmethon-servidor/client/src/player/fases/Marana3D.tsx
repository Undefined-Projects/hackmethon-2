import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { casilla, columna, type Accion, type Etapa } from './caminata';
import type { BroteViaje, Fin, Mundo, ViajePantalla } from './Marana';
import { H, W, pintar, type Celda, type Pose, type Sprite } from './motor3d';

// ============================================================
//  LA MARAÑA EN PRIMERA PERSONA · la vista 3D de Pantalla
//
//  Lo que ve Pantalla: el lanzamiento, con el mismo reloj que Datos, visto
//  desde los ojos del brote, y el plano 2D de minimapa en la esquina: un raycaster de pasillos como los de los
//  juegos clásicos en 3D, con la estética de la máquina —muros de seto y
//  circuito, piso de casillas que se pueden contar—. No es adorno: en
//  primera persona «girar izquierda» siempre es TU izquierda, que es la
//  lección que más cuesta en el semillero.
//
//  No sabe nada que el 2D no sepa. Las espinas y las minas no viajan: se
//  ven como camino. En la espesura solo se dibuja lo alumbrado; lo demás
//  es oscuridad. Y un brote que se desconecta se queda en estática: el
//  porqué está en la bitácora de Datos.
//
//  Avanza A SALTOS, un cuadro por casilla, como los clásicos de laberinto
//  por cuadrícula: cada `avanzar` cambia la imagen de golpe a la casilla
//  siguiente y cada giro, de golpe a 90°, al ritmo del servidor. Así se
//  cuentan los pasos mirando, igual que se cuentan las líneas del programa.
//
//  Se dibuja a 320 × 200 en un búfer de píxeles y se escala sin suavizar.
// ============================================================

const NOMBRE_ACCION: Record<Accion, string> = {
  av: 'AVANZAR', gi: 'GIRAR IZQUIERDA', gd: 'GIRAR DERECHA', ch: 'SIN SEÑAL', x: 'SIN SEÑAL',
};
/** La instrucción en curso, dibujada: una flecha recta para avanzar y una
 *  curva para cada giro. El texto queda para los lectores de pantalla. */
const FLECHA: Partial<Record<Accion, string>> = {
  av: 'M0 -18 L14 -2 L5 -2 L5 18 L-5 18 L-5 -2 L-14 -2 Z',
  gi: 'M10 18 L10 2 C10 -6 4 -10 -4 -10 L-4 -18 L-20 -4 L-4 10 L-4 2 C-1 2 0 3 0 6 L0 18 Z',
  gd: 'M-10 18 L-10 2 C-10 -6 -4 -10 4 -10 L4 -18 L20 -4 L4 10 L4 2 C1 2 0 3 0 6 L0 18 Z',
};
/** Los colores de los cuatro brotes, los mismos que en el monitor 2D. */
const TINTE: [number, number, number][] = [[61, 220, 151], [250, 57, 186], [79, 134, 238], [232, 178, 58]];


/** Dónde está y hacia dónde mira un brote tras su paso `k` (−1: al nacer).
 *  El ángulo se acumula —no se reduce a 0..360— para girar siempre por el
 *  lado corto, igual que en el 2D. */
function poseTras(b: BroteViaje, k: number): Pose {
  let ang = b.rumbo * 90;
  let f = b.entrada[0], c = b.entrada[1];
  for (let j = 0; j <= k && j < b.pasos.length; j++) {
    const [a, pf, pc] = b.pasos[j];
    if (a === 'gi') ang -= 90;
    else if (a === 'gd') ang += 90;
    else if (a === 'av') { f = pf; c = pc; }
  }
  return { x: c + 0.5, y: f + 0.5, ang };
}

/** La pose de este instante: la del paso en curso, ya dado. Sin nada
 *  entre una casilla y la siguiente: un cuadro por casilla. */
function poseEn(b: BroteViaje, i: number, etapa: Etapa): Pose {
  if (etapa === 'quieta' || etapa === 'nace' || i < 0) return poseTras(b, -1);
  return poseTras(b, Math.min(i, b.pasos.length - 1));
}

/** El plano 2D de la esquina: lo que se conoce, la flecha y las
 *  coordenadas —columna en letra, fila en número—, que son las de la tabla
 *  de espinas y las de la bitácora. Es lo que Pantalla usa para dictar. */
function pintarMinimapa(cv: HTMLCanvasElement, mundo: Mundo, celda: Celda, poses: Pose[], sigue: number) {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const k = Math.max(6, Math.min(22, Math.floor(196 / Math.max(mundo.cols, mundo.filas))));
  const m = k >= 10 ? 16 : 12;
  const w = m + mundo.cols * k, h = m + mundo.filas * k;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(4,3,8,.78)';
  ctx.fillRect(0, 0, w, h);
  const yo = poses[sigue];
  const fYo = yo ? Math.floor(yo.y) : -1, cYo = yo ? Math.floor(yo.x) : -1;
  // Las coordenadas: en la espesura, una de cada dos para que quepan.
  ctx.font = `${k >= 10 ? 9 : 7}px "IBM Plex Mono", monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const paso = k >= 10 ? 1 : 2;
  for (let c = 0; c < mundo.cols; c += paso) {
    ctx.fillStyle = c === cYo ? '#b4f5d4' : 'rgba(250,57,186,.75)';
    ctx.fillText(columna(c), m + c * k + k / 2, m / 2);
  }
  for (let f = 0; f < mundo.filas; f += paso) {
    ctx.fillStyle = f === fYo ? '#b4f5d4' : 'rgba(250,57,186,.75)';
    ctx.fillText(String(f + 1), m / 2, m + f * k + k / 2);
  }
  for (let f = 0; f < mundo.filas; f++) {
    for (let c = 0; c < mundo.cols; c++) {
      const ch = celda(f, c);
      ctx.fillStyle = ch === '?' ? 'rgba(0,0,0,.6)' : ch === '#' ? 'rgba(31,110,78,.9)' : ch === 'S' ? '#b4f5d4' : 'rgba(14,20,24,.95)';
      ctx.fillRect(m + c * k, m + f * k, k, k);
      if (ch !== '#' && ch !== '?' && k >= 10) {
        ctx.strokeStyle = 'rgba(61,220,151,.12)';
        ctx.strokeRect(m + c * k + 0.5, m + f * k + 0.5, k - 1, k - 1);
      }
    }
  }
  // La entrada: un anillo en cada semillero.
  for (const b of mundo.brotes) {
    ctx.strokeStyle = 'rgba(61,220,151,.7)';
    ctx.beginPath();
    ctx.arc(m + (b.entrada[1] + 0.5) * k, m + (b.entrada[0] + 0.5) * k, k * 0.36, 0, Math.PI * 2);
    ctx.stroke();
  }
  poses.forEach((p, n) => {
    const [r, g, b] = TINTE[n % 4];
    ctx.save();
    ctx.translate(m + p.x * k, m + p.y * k);
    ctx.rotate((p.ang * Math.PI) / 180);
    ctx.fillStyle = n === sigue ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},.55)`;
    const s = k * 0.48;
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, s * 0.75); ctx.lineTo(0, s * 0.3); ctx.lineTo(-s * 0.8, s * 0.75);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  });
}

export function Marana3D({ mundo, viaje, i, etapa, alumbradas, fines, varios }: {
  mundo: Mundo;
  /** El lanzamiento que se está viendo, o null si los brotes esperan. */
  viaje: ViajePantalla | null;
  i: number;
  etapa: Etapa;
  /** Espesura: lo alumbrado, `f,c` → casilla. */
  alumbradas: Map<string, string>;
  /** Cómo acabó ya cada brote, en este instante (null: sigue andando). */
  fines: (Fin | null)[];
  varios: boolean;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const [sigue, setSigue] = useState(0);
  const elegido = Math.min(sigue, Math.max(0, (viaje?.brotes.length ?? mundo.brotes.length) - 1));

  // Un cuadro por paso: se dibuja cuando cambia algo, no a cada fotograma,
  // y antes de pintar, para que la imagen y el HUD cambien a la vez.
  const bufer = useRef<{ img: ImageData; px: Uint32Array; zbuf: Float32Array } | null>(null);
  useLayoutEffect(() => {
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    if (!bufer.current) {
      const img = ctx.createImageData(W, H);
      bufer.current = { img, px: new Uint32Array(img.data.buffer), zbuf: new Float32Array(W) };
    }
    const { img, px, zbuf } = bufer.current;
    const m = mundo;
    const celda: Celda = (f, c) => {
      if (f < 0 || c < 0 || f >= m.filas || c >= m.cols) return '#';
      if (m.celdas) return m.celdas[f][c];
      return alumbradas.get(`${f},${c}`) ?? '?';
    };
    const brotes: BroteViaje[] = viaje
      ? viaje.brotes
      : m.brotes.map((b) => ({ entrada: b.entrada, rumbo: b.rumbo, fin: 'salida' as Fin, pasos: [] }));
    const poses = brotes.map((b) => poseEn(b, i, etapa));
    const pose = poses[elegido] ?? poses[0];
    if (!pose) return;
    const sprites: Sprite[] = [
      { x: m.salida[1] + 0.5, y: m.salida[0] + 0.5, rgb: [180, 245, 212], alto: 1.4, ancho: 0.22, base: 0 },
      ...poses.map((q, n) => ({ x: q.x, y: q.y, rgb: TINTE[n % 4], alto: 0.32, ancho: 0.14, base: 0.05 }))
        .filter((_, n) => n !== elegido),
    ];
    pintar(px, zbuf, celda, pose, { niebla: m.celdas ? 11 : 3.6, ambiente: m.celdas ? 0.07 : 0, sprites, salto: 0 });
    ctx.putImageData(img, 0, 0);
    if (mini.current) pintarMinimapa(mini.current, m, celda, poses, elegido);
  }, [mundo, viaje, i, etapa, alumbradas, elegido]);

  // El letrero de lo que está haciendo el brote que se sigue.
  const yo = viaje?.brotes[elegido];
  const paso = etapa === 'anda' && yo && i >= 0 && i < yo.pasos.length ? yo.pasos[i] : null;
  const fin = fines[elegido] ?? null;
  const sinSenal = fin === 'desconectado';
  const llego = fin === 'salida';
  const pose = useMemo(() => {
    const b = viaje?.brotes[elegido];
    if (b) return poseEn(b, i, etapa);
    const m = mundo.brotes[elegido] ?? mundo.brotes[0];
    return { x: m.entrada[1] + 0.5, y: m.entrada[0] + 0.5, ang: m.rumbo * 90 };
  }, [viaje, elegido, i, etapa, mundo.brotes]);
  const aqui = casilla(Math.floor(pose.y), Math.floor(pose.x));

  return (
    <div className={`mz3d${sinSenal ? ' sin-senal' : ''}${llego ? ' llego' : ''}`}>
      <canvas ref={cv} width={W} height={H} className="mz3d-lienzo"
              role="img" aria-label={`El laberinto visto desde el brote, en la casilla ${aqui}`} />
      <canvas ref={mini} className="mz3d-mini" aria-hidden="true" />
      <div className="mz3d-hud" aria-hidden="true">
        <span className="mz3d-ojo">1ª PERSONA{varios ? ` · BROTE ${elegido + 1}` : ''}</span>
        <span className="mz3d-donde">casilla {aqui}</span>
        {yo && etapa !== 'quieta' && (
          <span className="mz3d-paso">
            paso {etapa === 'nace' ? 0 : Math.min(i + 1, yo.pasos.length)} de {yo.pasos.length}
          </span>
        )}
      </div>
      {paso && !sinSenal && FLECHA[paso[0]] && (
        <div className={`mz3d-accion ${paso[0]}`} key={`${viaje?.n}-${i}`} role="status" aria-label={NOMBRE_ACCION[paso[0]]}>
          <svg viewBox="-24 -24 48 48" aria-hidden="true"><path d={FLECHA[paso[0]]} /></svg>
        </div>
      )}
      {/* Con un solo brote, el letrero grande ya dice que se desconectó; con
          cuatro, los demás siguen andando y hay que saber cuál cayó. */}
      {sinSenal && <div className="mz3d-estatica">{varios && <span>BROTE {elegido + 1} · SIN SEÑAL</span>}</div>}
      {varios && (
        <div className="mz3d-brotes" role="group" aria-label="Qué brote seguir">
          {(viaje?.brotes ?? mundo.brotes).map((_, k) => (
            <button key={k} type="button" className={`b${k + 1}${k === elegido ? ' sigue' : ''}`}
                    aria-pressed={k === elegido} onClick={() => setSigue(k)}>{k + 1}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Banco de pruebas: dibuja `n` cuadros del seto completo (raycaster,
 *  piso, luces, minimapa y volcado al lienzo) desde poses distintas y dice
 *  cuánto tarda cada uno. Lo usan las pruebas de rendimiento (`e2e`); en el
 *  juego no se llama nunca. */
export function medirRendimiento3D(n = 120): { media: number; p95: number; max: number } {
  const plano = [
    '############', '##.####.b.S#', '##...##.##.#', '####.##.##.#', '#..#.......#', '#.##.##.##.#',
    '#.##.##.##.#', '#.......##.#', '#.##.###.#.#', '#.##.#.#.#.#', '#E.........#', '############',
  ].map((f) => f.replace(/[ab]/g, '.'));
  const mundo: Mundo = {
    capa: 2, filas: 12, cols: 12, celdas: plano, salida: [1, 10], brotes: [{ entrada: [10, 1], rumbo: 1 }],
  };
  const celda: Celda = (f, c) => (f < 0 || c < 0 || f >= 12 || c >= 12 ? '#' : plano[f][c]);
  const lienzo = document.createElement('canvas');
  lienzo.width = W; lienzo.height = H;
  const ctx = lienzo.getContext('2d')!;
  const mini = document.createElement('canvas');
  const img = ctx.createImageData(W, H);
  const px = new Uint32Array(img.data.buffer);
  const zbuf = new Float32Array(W);
  const libres: [number, number][] = [];
  plano.forEach((f, y) => [...f].forEach((ch, x) => { if (ch !== '#') libres.push([x, y]); }));
  const tiempos: number[] = [];
  for (let k = 0; k < n; k++) {
    const [x, y] = libres[k % libres.length];
    const pose = { x: x + 0.5, y: y + 0.5, ang: (k % 4) * 90 };
    const t = performance.now();
    pintar(px, zbuf, celda, pose, {
      niebla: 11, ambiente: 0.07, salto: 0,
      sprites: [{ x: 10.5, y: 1.5, rgb: [180, 245, 212], alto: 1.4, ancho: 0.22, base: 0 }],
    });
    ctx.putImageData(img, 0, 0);
    pintarMinimapa(mini, mundo, celda, [pose], 0);
    tiempos.push(performance.now() - t);
  }
  tiempos.sort((a, b) => a - b);
  const media = tiempos.reduce((a, b) => a + b, 0) / n;
  return { media, p95: tiempos[Math.floor(n * 0.95)], max: tiempos[n - 1] };
}
