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

const COLS = 24, ROWS = 16, CELDA = 24;
const W = COLS * CELDA, H = ROWS * CELDA;
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
  const pinta = useCallback((t: number, marchita: boolean) => {
    const ctx = lienzo.current?.getContext('2d');
    if (!ctx) return;
    const { P, sangre, sangreHi, fondo } = colores();
    const g = juego.current;

    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, W, H);
    // Papel de electrocardiograma, como el monitor de la portada.
    ctx.strokeStyle = 'rgba(79,134,238,.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= COLS; x++) { ctx.moveTo(x * CELDA + 0.5, 0); ctx.lineTo(x * CELDA + 0.5, H); }
    for (let y = 0; y <= ROWS; y++) { ctx.moveTo(0, y * CELDA + 0.5); ctx.lineTo(W, y * CELDA + 0.5); }
    ctx.stroke();

    // La semilla en flor: cuatro pétalos y el centro, latiendo.
    const s = g.semilla, late = 1 + 0.18 * Math.sin(t / 160);
    const entra = Math.min(1, (t - g.semillaEn) / 260);
    const cx = s.x * CELDA + CELDA / 2, cy = s.y * CELDA + CELDA / 2, p = 5 * late * (entra < 1 ? 1.6 - 0.6 * entra : 1) * entra;
    // Un halo que respira alrededor de la semilla: se ve desde lejos.
    ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t / 160);
    ctx.fillStyle = P.petalo[0];
    ctx.fillRect(cx - 11, cy - 11, 22, 22);
    ctx.globalAlpha = 1;
    ctx.fillStyle = P.petalo[0];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
      ctx.fillRect(cx + dx * p - p / 2, cy + dy * p - p / 2, p, p);
    ctx.fillStyle = P.centro;
    ctx.fillRect(cx - p / 2, cy - p / 2, p, p);

    // El tallo: de la cola a la cabeza, para que la cabeza quede encima.
    const n = g.cuerpo.length;
    ctx.lineCap = 'square';
    // El marchitarse corre de la cabeza a la cola, un tramo cada 28 ms.
    const seca = (i: number) => marchita && t - g.muerte > i * 28;
    for (let i = n - 1; i >= 1; i--) {
      const a = g.cuerpo[i], b = g.cuerpo[i - 1];
      const ax = a.x * CELDA + CELDA / 2, ay = a.y * CELDA + CELDA / 2;
      const bx = b.x * CELDA + CELDA / 2, by = b.y * CELDA + CELDA / 2;
      // Del tronco a las puntas: grueso y vivo cerca de la cabeza, fino
      // y en circuito azul hacia la cola, como las ramas del jardín.
      const k = Math.min(3, Math.floor((i / n) * 4));
      ctx.strokeStyle = seca(i) ? sangre : P.tallo[k];
      ctx.lineWidth = [8, 7, 6, 4][k];
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();

      // Una hoja cada dos tramos, alternando de lado.
      if (i % 2 === 0 && !seca(i)) {
        const lado = i % 4 === 0 ? 1 : -1;
        const vx = bx - ax, vy = by - ay, L = Math.hypot(vx, vy) || 1;
        const px = (-vy / L) * lado, py = (vx / L) * lado;
        // La hoja brota: crece de nada a su tamaño, con un pequeño rebote.
        const edad = (t - (g.brotes[i] ?? 0)) / 320;
        const brote = edad >= 1 ? 1 : edad <= 0 ? 0 : 1 + Math.sin(edad * Math.PI) * 0.35 * (1 - edad) - (1 - edad) ** 2;
        const mx = (ax + bx) / 2, my = (ay + by) / 2, tam = 9 * Math.max(0, brote);
        ctx.fillStyle = P.hoja[i % 3];
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + px * tam * 0.6 + (vx / L) * tam * 0.4, my + py * tam * 0.6 + (vy / L) * tam * 0.4);
        ctx.lineTo(mx + px * tam, my + py * tam);
        ctx.lineTo(mx + px * tam * 0.5 - (vx / L) * tam * 0.2, my + py * tam * 0.5 - (vy / L) * tam * 0.2);
        ctx.fill();
      }
    }
    // La raíz, al final de la cola: una vía de soldadura.
    const raiz = g.cuerpo[n - 1];
    ctx.fillStyle = seca(n - 1) ? sangre : P.punta;
    ctx.beginPath(); ctx.arc(raiz.x * CELDA + CELDA / 2, raiz.y * CELDA + CELDA / 2, 3, 0, Math.PI * 2); ctx.fill();

    // La cabeza: el punto de soldadura que va abriendo pista.
    const c = g.cuerpo[0];
    const hx = c.x * CELDA + CELDA / 2, hy = c.y * CELDA + CELDA / 2;
    ctx.fillStyle = marchita ? sangre : P.raiz;
    // La cabeza brilla: es la punta de crecimiento, lo único que avanza.
    ctx.shadowColor = marchita ? sangre : P.raiz; ctx.shadowBlur = marchita ? 4 : 14;
    ctx.beginPath(); ctx.arc(hx, hy, 8, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = marchita ? sangreHi : P.raizBorde;
    ctx.lineWidth = 2; ctx.stroke();
    // El ojo mira hacia donde va.
    ctx.fillStyle = fondo;
    ctx.fillRect(hx + DX[g.dir] * 3 - 2, hy + DY[g.dir] * 3 - 2, 4, 4);
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
        const c = enLienzo(lienzo.current, q.x * CELDA + CELDA / 2, q.y * CELDA + CELDA / 2);
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
            const c = enLienzo(lienzo.current, g.semilla.x * CELDA + CELDA / 2, g.semilla.y * CELDA + CELDA / 2);
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
