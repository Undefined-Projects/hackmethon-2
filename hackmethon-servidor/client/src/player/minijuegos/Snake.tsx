import { useCallback, useEffect, useRef, useState } from 'react';
import type { MinijuegoView } from '../../shared/events';
import type { AppSocket } from '../../lib/socket';
import { sonar } from '../../lib/sonido';
import { paleta } from '../../lib/jardin';
import { Cifra, Final, Marco } from './Marco';
import { usePuntaje } from './puntaje';
import { color, enLienzo, useCuentaAtras, useMotorFx } from './efectos';

/**
 * SNAKE, versión 2.0: la serpiente es una enredadera de circuito.
 *
 * La cabeza es un punto de soldadura, el cuerpo un tallo de clorofila
 * con hojas, y lo que se come son semillas en flor. Cada semilla la
 * hace crecer un tramo y la acelera un poco. Si choca con el marco o
 * consigo misma, se marchita a rojo, como el jardín de la portada
 * cuando el paciente entra en paro.
 *
 * El juego corre entero en el navegador; al servidor solo viaja el
 * puntaje final de cada intento, y él se queda con el mejor.
 */

const COLS = 24, ROWS = 16;
/** El lienzo: bajo y pixelado, como las vistas 3D de las fases. */
const W = 384, H = 256;

// ── la proyección del tablero ───────────────────────────────
// El tablero es un piso visto desde arriba y atrás: la fila 0 al fondo,
// la última cerca. Un objeto a altura `h` (en celdas) sube f·h/z.
const Z0 = ROWS * 1.5;                      // la distancia a la fila de cerca
const F = (W * 0.46 * Z0) / (COLS / 2);
const CAMH = ((H * 0.93 - H * 0.2) / F) / (1 / Z0 - 1 / (Z0 + ROWS));
const HOR = H * 0.93 - (F * CAMH) / Z0;
/** De una posición del tablero (x de 0 a COLS, y de 0 a ROWS) y una altura, al lienzo. */
function proy(x: number, y: number, h = 0) {
  const z = Z0 + (ROWS - y);
  return { x: W / 2 + (F * (x - COLS / 2)) / z, y: HOR + (F * (CAMH - h)) / z, z };
}
/** El centro de una celda, un poco levantado: de ahí salen los efectos. */
const centro = (c: Celda) => proy(c.x + 0.5, c.y + 0.5, 0.5);
const PUNTOS_SEMILLA = 10;
const PASO_INICIAL = 150, PASO_MIN = 65, ACELERA = 4;

type Dir = 0 | 1 | 2 | 3; // → ↓ ← ↑
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
type Celda = { x: number; y: number };
type Estado = 'listo' | 'cuenta' | 'creciendo' | 'marchita';

type Juego = {
  cuerpo: Celda[];        // [0] es la cabeza
  dir: Dir;
  cola: Dir[];            // giros pedidos, a lo más 2: dos teclas rápidas no se pierden
  semilla: Celda;
  paso: number;
  acum: number;
  puntos: number;
  /** Cuándo se alcanzó cada largo: la hoja de ese tramo brota desde ahí. */
  brotes: number[];
  /** Cuándo apareció la semilla actual: entra creciendo. */
  semillaEn: number;
  /** Cuándo se marchitó: el rojo corre de la cabeza a la cola. */
  muerte: number;
};

function nuevaSemilla(cuerpo: Celda[]): Celda {
  const libres: Celda[] = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (!cuerpo.some((c) => c.x === x && c.y === y)) libres.push({ x, y });
  return libres[Math.floor(Math.random() * libres.length)] ?? { x: 0, y: 0 };
}

function juegoNuevo(): Juego {
  const y = Math.floor(ROWS / 2);
  const cuerpo = [{ x: 6, y }, { x: 5, y }, { x: 4, y }, { x: 3, y }];
  const t = performance.now();
  return {
    cuerpo, dir: 0, cola: [], semilla: nuevaSemilla(cuerpo), paso: PASO_INICIAL, acum: 0, puntos: 0,
    brotes: cuerpo.map(() => t - 1000), semillaEn: t, muerte: 0,
  };
}

/** Los colores salen de index.css una sola vez, no en cada cuadro. */
let cache: { P: ReturnType<typeof paleta>; sangre: string; sangreHi: string; fondo: string } | null = null;
function colores() {
  if (cache) return cache;
  const css = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => css.getPropertyValue(n).trim() || d;
  return (cache = {
    P: paleta(),
    sangre: v('--sangre', '#ff3355'), sangreHi: v('--sangre-hi', '#ffc2cc'), fondo: v('--screen', '#0a070c'),
  });
}

const TECLAS: Record<string, Dir> = {
  ArrowRight: 0, ArrowDown: 1, ArrowLeft: 2, ArrowUp: 3,
  d: 0, s: 1, a: 2, w: 3, D: 0, S: 1, A: 2, W: 3,
};

export function Snake({
  minijuego, socket,
}: { minijuego: MinijuegoView; socket: AppSocket | null }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const juego = useRef<Juego>(juegoNuevo());
  const [estado, setEstado] = useState<Estado>('listo');
  const [puntos, setPuntos] = useState(0);
  const { mejor, envio, enviar, olvidar, record } = usePuntaje(socket, minijuego.ronda);
  const motor = useMotorFx();
  const { fx } = motor;
  const { cuenta, iniciar } = useCuentaAtras();
  // La pantalla final espera a que termine de marchitarse.
  const [verFin, setVerFin] = useState(false);
  const [largo, setLargo] = useState(0);
  // El bucle lee el estado sin esperar a un render; se escribe junto
  // con setEstado en cada cambio.
  const estadoRef = useRef<Estado>('listo');

  /* ── pintar ─────────────────────────────────────────────── */
  const fondo3d = useRef<HTMLCanvasElement | null>(null);
  const pinta = useCallback((t: number, marchita: boolean) => {
    const ctx = lienzo.current?.getContext('2d');
    if (!ctx) return;
    const { P, sangre, sangreHi } = colores();
    const g = juego.current;
    if (!fondo3d.current) fondo3d.current = hacerFondo();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fondo3d.current, 0, 0);

    // Lo que se dibuja, del fondo hacia delante: la semilla y los tramos.
    type Pieza = { y: number; x: number; dibuja: () => void };
    const piezas: Pieza[] = [];

    // La semilla en flor: un cristal que flota, gira y late sobre su sombra.
    const s = g.semilla;
    const entra = Math.min(1, (t - g.semillaEn) / 260);
    piezas.push({ y: s.y, x: s.x, dibuja: () => {
      const sombra = proy(s.x + 0.5, s.y + 0.5, 0);
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(sombra.x, sombra.y, (F * 0.32) / sombra.z, (F * 0.12) / sombra.z, 0, 0, Math.PI * 2); ctx.fill();
      const alto = 0.75 + 0.12 * Math.sin(t / 220);
      const c = proy(s.x + 0.5, s.y + 0.5, alto);
      const r = ((F * 0.36) / c.z) * entra * (1 + 0.12 * Math.sin(t / 160));
      const giro = Math.cos(t / 300);
      // El halo, para verla de lejos.
      const halo = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 3);
      halo.addColorStop(0, 'rgba(255,122,209,.45)'); halo.addColorStop(1, 'rgba(255,122,209,0)');
      ctx.fillStyle = halo; ctx.fillRect(c.x - r * 3, c.y - r * 3, r * 6, r * 6);
      // El cristal: dos mitades, con su cara clara y su cara oscura.
      ctx.fillStyle = P.petalo[0];
      ctx.beginPath(); ctx.moveTo(c.x, c.y - r * 1.3); ctx.lineTo(c.x + r * giro, c.y); ctx.lineTo(c.x, c.y + r * 1.3); ctx.lineTo(c.x - r * 0.15, c.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = P.centro;
      ctx.beginPath(); ctx.moveTo(c.x, c.y - r * 1.3); ctx.lineTo(c.x - r * Math.abs(1 - giro * 0.3), c.y); ctx.lineTo(c.x, c.y + r * 1.3); ctx.lineTo(c.x - r * 0.15, c.y); ctx.closePath(); ctx.fill();
    } });

    // El tallo: un cubo por tramo, más alto y vivo cerca de la cabeza.
    const n = g.cuerpo.length;
    const seca = (i: number) => marchita && t - g.muerte > i * 28;
    g.cuerpo.forEach((q, i) => {
      piezas.push({ y: q.y, x: q.x, dibuja: () => {
        const k = Math.min(3, Math.floor((i / n) * 4));
        const cabeza = i === 0;
        // La hoja que brota: el tramo nuevo crece desde el piso.
        const edad = (t - (g.brotes[i] ?? 0)) / 320;
        const brote = edad >= 1 ? 1 : edad <= 0 ? 0 : 1 + Math.sin(edad * Math.PI) * 0.35 * (1 - edad) - (1 - edad) ** 2;
        const alto = (cabeza ? 0.95 : [0.75, 0.65, 0.55, 0.42][k]) * Math.max(0.15, brote);
        const base = cabeza ? (marchita ? sangre : P.raiz) : seca(i) ? sangre : P.tallo[k];
        const m = cabeza ? 0.06 : 0.14;
        cubo(ctx, q.x + m, q.y + m, q.x + 1 - m, q.y + 1 - m, alto, base);
        if (cabeza) {
          // El ojo mira hacia donde va, sobre la tapa.
          const o = proy(q.x + 0.5 + DX[g.dir] * 0.25, q.y + 0.5 + DY[g.dir] * 0.25, alto);
          ctx.fillStyle = marchita ? sangreHi : '#0a070c';
          ctx.fillRect(o.x - 2, o.y - 2, 4, 4);
          if (!marchita) {
            // La punta de crecimiento brilla.
            const c = proy(q.x + 0.5, q.y + 0.5, alto);
            const h = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 22);
            h.addColorStop(0, 'rgba(255,122,209,.35)'); h.addColorStop(1, 'rgba(255,122,209,0)');
            ctx.fillStyle = h; ctx.fillRect(c.x - 22, c.y - 22, 44, 44);
          }
        } else if (i % 2 === 0 && !seca(i)) {
          // Una hoja sobre la tapa, cada dos tramos.
          const c = proy(q.x + 0.5, q.y + 0.5, alto);
          ctx.fillStyle = P.hoja[i % 3];
          ctx.fillRect(c.x - 2, c.y - 3, 4, 3);
        }
      } });
    });

    // Del fondo hacia delante; en la misma fila, de los costados al centro.
    piezas.sort((a, b) => a.y - b.y || Math.abs(b.x + 0.5 - COLS / 2) - Math.abs(a.x + 0.5 - COLS / 2));
    for (const p of piezas) p.dibuja();
  }, []);

  /* ── el reloj del juego ─────────────────────────────────── */
  const terminar = useCallback(async () => {
    sonar('golpe');
    const g = juego.current;
    g.muerte = performance.now();
    estadoRef.current = 'marchita';
    setEstado('marchita');
    fx.sacudida(1.6);
    fx.destello(color('sangre'), 0.3, 420);
    // Las hojas se caen conforme el rojo las alcanza.
    g.cuerpo.forEach((q, i) => {
      if (i % 2) return;
      setTimeout(() => {
        const p = centro(q);
        const c = enLienzo(lienzo.current, p.x, p.y);
        fx.estallido(c.x, c.y, {
          n: 2, formas: ['hoja'], colores: [color('verdeDim'), '#5a1626'],
          fuerza: 0.08, angulo: Math.PI / 2, apertura: 2, dura: 1400, tam: 5,
        });
      }, i * 28);
    });
    setLargo(g.cuerpo.length);
    setTimeout(() => setVerFin(true), Math.min(1100, 300 + g.cuerpo.length * 28));
    await enviar(g.puntos);
  }, [enviar, fx]);

  useEffect(() => {
    let raf = 0, antes = performance.now();
    const cuadro = (t: number) => {
      const dt = Math.min(250, t - antes); antes = t;
      const g = juego.current;
      if (estadoRef.current === 'creciendo') {
        g.acum += dt;
        while (g.acum >= g.paso && estadoRef.current === 'creciendo') {
          g.acum -= g.paso;
          const giro = g.cola.shift();
          if (giro !== undefined) g.dir = giro;
          const cabeza = g.cuerpo[0];
          const nx = cabeza.x + DX[g.dir], ny = cabeza.y + DY[g.dir];
          const come = nx === g.semilla.x && ny === g.semilla.y;
          // La cola se mueve en este mismo paso, así que perseguirla no mata.
          const cuerpo = come ? g.cuerpo : g.cuerpo.slice(0, -1);
          const choca = nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS
            || cuerpo.some((q) => q.x === nx && q.y === ny);
          if (choca) { estadoRef.current = 'marchita'; void terminar(); break; }
          g.cuerpo = [{ x: nx, y: ny }, ...cuerpo];
          if (g.brotes.length < g.cuerpo.length) g.brotes.push(t);
          if (come) {
            g.puntos += PUNTOS_SEMILLA;
            g.paso = Math.max(PASO_MIN, g.paso - ACELERA);
            const ps = centro(g.semilla);
            const c = enLienzo(lienzo.current, ps.x, ps.y);
            // La semilla revienta en pétalos y hojas.
            fx.estallido(c.x, c.y, {
              n: 22, formas: ['petalo', 'hoja', 'pixel'],
              colores: [color('uv'), color('violeta'), color('verde'), color('verdeHi'), color('phosHi')],
              fuerza: 0.32, dura: 800, tam: 5,
            });
            fx.anillo(c.x, c.y, { color: color('verdeHi'), radio: 34 });
            fx.texto(c.x, c.y - 10, `+${PUNTOS_SEMILLA}`, { color: color('verdeHi'), tam: 16 });
            g.semilla = nuevaSemilla(g.cuerpo);
            g.semillaEn = t;
            setPuntos(g.puntos);
            const semillas = g.puntos / PUNTOS_SEMILLA;
            if (semillas % 5 === 0) {
              // Cada cinco: un estirón, y la pantalla lo celebra.
              const m = enLienzo(lienzo.current, W / 2, H / 2);
              fx.texto(m.x, m.y, '¡CRECE!', { color: color('verdeHi'), tam: 38, dura: 1000 });
              fx.destello(color('verde'), 0.16, 380);
              fx.sacudida(0.6);
              sonar('barrera');
            } else sonar('abrir');
          }
        }
      }
      pinta(t, estadoRef.current === 'marchita');
      raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(raf);
  }, [pinta, terminar, fx]);

  /* ── controles ──────────────────────────────────────────── */
  const girar = useCallback((d: Dir) => {
    const g = juego.current;
    const ultima = g.cola.length ? g.cola[g.cola.length - 1] : g.dir;
    // Ni el mismo sentido ni darse la vuelta sobre sí misma.
    if (d === ultima || (d + 2) % 4 === ultima) return;
    if (g.cola.length < 2) g.cola.push(d);
  }, []);

  const arrancar = useCallback(() => {
    if (estadoRef.current === 'creciendo' || estadoRef.current === 'cuenta') return;
    juego.current = juegoNuevo();
    setPuntos(0);
    setVerFin(false);
    olvidar();
    estadoRef.current = 'cuenta';
    setEstado('cuenta');
    // 3 · 2 · 1 · ¡YA! Los giros que se pulsen durante la cuenta se
    // guardan: quien ya sabe a dónde va, sale disparado.
    iniciar(() => {
      juego.current.acum = 0;
      estadoRef.current = 'creciendo';
      setEstado('creciendo');
    }, (k) => sonar(k === 0 ? 'entrar' : 'tic'));
  }, [olvidar, iniciar]);

  // Flechas, toques y cruceta arrancan solo la primera vez. Después de
  // marchitarse hace falta espacio o el botón: quien venía pulsando
  // flechas al chocar no debería rebrotar sin darse cuenta.
  const empieza = useCallback(() => {
    if (estadoRef.current === 'listo') arrancar();
  }, [arrancar]);

  useEffect(() => {
    // El minijuego cae encima de lo que estuviera abierto: si el foco se
    // quedó en la consola de la Terminal, las flechas escribirían ahí.
    (document.activeElement as HTMLElement | null)?.blur?.();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        if (estadoRef.current !== 'creciendo') { e.preventDefault(); arrancar(); }
        return;
      }
      const d = TECLAS[e.key];
      if (d === undefined) return;
      e.preventDefault();
      empieza();
      if (estadoRef.current !== 'marchita') girar(d);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [arrancar, empieza, girar]);

  // Deslizar el dedo, para el teléfono.
  const toque = useRef<{ x: number; y: number } | null>(null);
  const alTocar = (e: React.PointerEvent) => { toque.current = { x: e.clientX, y: e.clientY }; };
  const alSoltar = (e: React.PointerEvent) => {
    const t0 = toque.current; toque.current = null;
    if (!t0) return;
    const dx = e.clientX - t0.x, dy = e.clientY - t0.y;
    empieza();
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    girar(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3));
  };

  return (
    <Marco
      nombre="ENREDADERA · SNAKE"
      marcador={<>SEMILLAS <Cifra v={puntos / PUNTOS_SEMILLA} /> · PUNTOS <Cifra v={puntos} /></>}
      mejor={mejor}
      motor={motor}
      variante="snake"
      cuenta={cuenta}
      pie={
        // Cruceta para el teléfono. En escritorio estorba, y el CSS la
        // esconde donde hay ratón.
        <div className="minijuego__cruceta" aria-hidden="true">
          <button onPointerDown={() => { empieza(); girar(3); }}>▲</button>
          <button onPointerDown={() => { empieza(); girar(2); }}>◀</button>
          <button onPointerDown={() => { empieza(); girar(1); }}>▼</button>
          <button onPointerDown={() => { empieza(); girar(0); }}>▶</button>
        </div>
      }
    >
      <canvas
        ref={lienzo}
        width={W}
        height={H}
        onPointerDown={alTocar}
        onPointerUp={alSoltar}
        aria-label="Tablero de la enredadera"
      />
      {estado === 'listo' && (
        <div className="minijuego__msg">
          <p className="minijuego__titulo fx-glitch">ENREDADERA</p>
          <p className="minijuego__txt">
            Eres un brote de circuito. Come semillas para crecer, sin
            chocar con el marco ni contigo: lo que crece no se puede
            deshacer.
          </p>
          <p className="minijuego__tecla">FLECHAS · WASD · DESLIZA PARA EMPEZAR</p>
        </div>
      )}
      {estado === 'marchita' && verFin && (
        <Final
          titulo="SE MARCHITÓ" malo
          puntos={puntos}
          detalle={<>{puntos / PUNTOS_SEMILLA} semillas · {largo} tramos de tallo</>}
          envio={envio} mejor={mejor} record={record}
          otra="REBROTAR ▸" onOtra={arrancar}
        />
      )}
    </Marco>
  );
}

// ---------- el dibujo en 3D ----------

const sombrea = (hex: string, k: number) => {
  const v = hex.replace('#', '');
  const n = v.length === 3 ? v.split('').map((c) => parseInt(c + c, 16)) : [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  return `rgb(${n.map((c) => Math.min(255, Math.round(c * k))).join(',')})`;
};

/** Un cubo sobre el tablero: la cara de delante, el costado que mira a la
 *  cámara y la tapa. */
function cubo(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, alto: number, color: string) {
  const pol = (pts: { x: number; y: number }[], c: string) => {
    ctx.fillStyle = c; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
  };
  const col = color.startsWith('#') ? color : '#3ddc97';
  // El costado: el de la izquierda si el cubo está a la derecha del centro, y al revés.
  const cx = (x0 + x1) / 2;
  if (cx > COLS / 2 + 0.01) pol([proy(x0, y1, 0), proy(x0, y0, 0), proy(x0, y0, alto), proy(x0, y1, alto)], sombrea(col, 0.5));
  else if (cx < COLS / 2 - 0.01) pol([proy(x1, y1, 0), proy(x1, y0, 0), proy(x1, y0, alto), proy(x1, y1, alto)], sombrea(col, 0.5));
  // La cara de delante.
  pol([proy(x0, y1, 0), proy(x1, y1, 0), proy(x1, y1, alto), proy(x0, y1, alto)], sombrea(col, 0.72));
  // La tapa, iluminada.
  pol([proy(x0, y1, alto), proy(x1, y1, alto), proy(x1, y0, alto), proy(x0, y0, alto)], sombrea(col, 1.08));
  const a = proy(x0, y0, alto), b = proy(x1, y0, alto);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(a.x, a.y, b.x - a.x, 1);
}

/** El piso del tablero, con su papel de electrocardiograma en perspectiva,
 *  y los muros de circuito alrededor. Se pinta una sola vez. */
function hacerFondo(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const cielo = ctx.createLinearGradient(0, 0, 0, H);
  cielo.addColorStop(0, '#1a0820'); cielo.addColorStop(0.35, '#0d0612'); cielo.addColorStop(1, '#05030a');
  ctx.fillStyle = cielo; ctx.fillRect(0, 0, W, H);
  // Un resplandor al fondo, como en las fases.
  const luz = ctx.createRadialGradient(W / 2, H * 0.12, 4, W / 2, H * 0.12, W * 0.55);
  luz.addColorStop(0, 'rgba(250,57,186,.35)'); luz.addColorStop(1, 'rgba(250,57,186,0)');
  ctx.fillStyle = luz; ctx.fillRect(0, 0, W, H);
  // Dendritas en la pared del fondo.
  for (let k = 0; k < 14; k++) {
    const x0 = (Math.sin(k * 91.7) * 0.5 + 0.5) * W, y0 = H * (0.02 + (Math.sin(k * 37.3) * 0.5 + 0.5) * 0.16);
    ctx.strokeStyle = `rgba(${k % 3 ? '250,57,186' : '79,134,238'},.25)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 12, y0); ctx.lineTo(x0 + 18, y0 + 6); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x0 + 17, y0 + 5, 2, 2);
  }
  // El piso.
  const pol = (pts: { x: number; y: number }[], c: string | CanvasGradient) => {
    ctx.fillStyle = c; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
  };
  const piso = ctx.createLinearGradient(0, proy(0, 0).y, 0, proy(0, ROWS).y);
  piso.addColorStop(0, '#120e26'); piso.addColorStop(1, '#231a40');
  pol([proy(0, 0), proy(COLS, 0), proy(COLS, ROWS), proy(0, ROWS)], piso);
  // La cuadrícula, cada vez más tenue al fondo.
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x++) {
    const a = proy(x, 0), b = proy(x, ROWS);
    ctx.strokeStyle = x % 4 ? 'rgba(79,134,238,.24)' : 'rgba(79,134,238,.45)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    const a = proy(0, y), b = proy(COLS, y);
    ctx.strokeStyle = `rgba(79,134,238,${(y % 4 ? 0.16 : 0.36) + (y / ROWS) * 0.12})`;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // Los muros: el del fondo y los de los costados, bajos, con una pista de luz.
  const MURO = 0.6;
  pol([proy(0, 0, 0), proy(COLS, 0, 0), proy(COLS, 0, MURO), proy(0, 0, MURO)], '#2a1838');
  pol([proy(0, 0, 0), proy(0, ROWS, 0), proy(0, ROWS, MURO), proy(0, 0, MURO)], '#1f1430');
  pol([proy(COLS, 0, 0), proy(COLS, ROWS, 0), proy(COLS, ROWS, MURO), proy(COLS, 0, MURO)], '#1f1430');
  ctx.strokeStyle = 'rgba(250,57,186,.85)'; ctx.lineWidth = 1;
  for (const [a, b] of [[proy(0, 0, MURO), proy(COLS, 0, MURO)], [proy(0, 0, MURO), proy(0, ROWS, MURO)], [proy(COLS, 0, MURO), proy(COLS, ROWS, MURO)]] as const) {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(61,220,151,.4)';
  for (const [a, b] of [[proy(0, 0, MURO * 0.4), proy(COLS, 0, MURO * 0.4)]] as const) {
    ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
  }
  return cv;
}
