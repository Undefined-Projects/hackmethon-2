import { useEffect, useRef } from 'react';
import type { MinijuegoTablero, PuntajeMinijuego } from '../shared/events';
import { useTicker } from '../lib/useTicker';
import { formatMs } from '../lib/format';
import { azar, clamp, paleta } from '../lib/jardin';
import { Bicho, Tierra } from '../player/minijuegos/Plaga';
import { JardinEscena } from './JardinEscena';
import { msDeSinapsis } from '../lib/minijuegos';

// ============================================================
//  Las escenas de sala de los minijuegos.
//
//  El ranking de un recreo NO está en los portátiles: se canta aquí,
//  en la pared, en vivo. Cada juego tiene su escena, con la misma
//  idea que el juego: en ENREDADERA cada persona es una planta que
//  crece con sus puntos; en PLAGA, un conteo de gusanos aplastados.
// ============================================================

export function EscenaMinijuego({
  tablero, clockOffset,
}: { tablero: MinijuegoTablero; clockOffset: number }) {
  switch (tablero.clave) {
    case 'plaga': return <EscenaPlaga tablero={tablero} clockOffset={clockOffset} />;
    case 'sinapsis': return <EscenaSinapsis tablero={tablero} clockOffset={clockOffset} />;
    case 'latido': return <EscenaLatido tablero={tablero} clockOffset={clockOffset} />;
    default: return <EscenaEnredadera tablero={tablero} clockOffset={clockOffset} />;
  }
}

/** Cambia cada vez que alguien de la sala mejora: con eso late el jardín. */
const latidoDe = (t: MinijuegoTablero) => t.ranking.reduce((s, r) => s + r.puntos, 0);

/** La cabecera común: qué se juega, cuántos y desde cuándo. */
function Cabecera({
  titulo, lema, tablero, clockOffset,
}: { titulo: string; lema: string; tablero: MinijuegoTablero; clockOffset: number }) {
  useTicker(1000);
  const transcurrido = Math.max(0, Date.now() + clockOffset - tablero.desde);
  return (
    <header className="mini-cab">
      <p className="mini-cab__tag"><span className="mini-cab__vivo" aria-hidden="true" />RECREO · EN VIVO</p>
      <h1 className="mini-cab__titulo">{titulo}</h1>
      <p className="mini-cab__sub">
        {lema} · <b>{tablero.participantes}</b> con intento · <b>{formatMs(transcurrido)}</b>
      </p>
    </header>
  );
}

/** Una fila del ranking. El destello lleva `key` por puntaje: cada vez
 *  que alguien mejora, su fila se enciende una vez. */
function Fila({
  r, i, children, valor,
}: { r: PuntajeMinijuego; i: number; children: React.ReactNode; valor?: React.ReactNode }) {
  return (
    <li className={`mini-fila ${i === 0 ? 'mini-fila--primero' : ''}`}>
      <span key={r.puntos} className="mini-fila__destello" aria-hidden="true" />
      <span className="mini-fila__n">{String(i + 1).padStart(2, '0')}</span>
      <span className="mini-fila__quien">
        {r.nombre}
        <small>{r.equipo}</small>
      </span>
      <span className="mini-fila__barra">{children}</span>
      <span className="mini-fila__p">{valor ?? r.puntos}</span>
    </li>
  );
}

const Vacio = ({ texto }: { texto: string }) => (
  <p className="mini-vacio">{texto}<span className="esp-cursor" aria-hidden="true">_</span></p>
);

/* ============================================================
   ENREDADERA: el invernadero.
   Cada persona es una enredadera que nace de un punto de soldadura y
   crece hacia la derecha. Su largo es su puntaje contra el del primer
   lugar; la del primero lleva una flor abierta en la punta.
   ============================================================ */
function EscenaEnredadera({ tablero, clockOffset }: { tablero: MinijuegoTablero; clockOffset: number }) {
  const max = Math.max(1, tablero.ranking[0]?.puntos ?? 1);
  return (
    <div className="esc esc-mini esc-mini--enredadera">
      <JardinEscena variante="enredadera" latido={latidoDe(tablero)} />
      <Cabecera titulo="ENREDADERA" lema="INVERNADERO" tablero={tablero} clockOffset={clockOffset} />
      {tablero.ranking.length === 0 ? (
        <Vacio texto="Esperando el primer brote" />
      ) : (
        <ol className="mini-tabla">
          {tablero.ranking.map((r, i) => (
            <Fila key={r.userId} r={r} i={i}>
              <Tallo semilla={r.userId} fraccion={r.puntos / max} florece={i === 0} />
            </Fila>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Un número estable a partir de un texto: la misma persona tiene
 *  siempre la misma planta, aunque cambie de lugar en la tabla. */
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

/**
 * El tallo de una fila, en <canvas>. La forma sale de la semilla (pistas
 * a 45° que suben y bajan dentro de su renglón) y lo que se anima es
 * solo el largo: cuando el puntaje sube, crece hasta su nueva marca.
 */
function Tallo({ semilla, fraccion, florece }: { semilla: string; fraccion: number; florece: boolean }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const actual = useRef(0);
  const meta = useRef(fraccion);
  const florRef = useRef(florece);
  // El bucle lee la meta del ref: así un puntaje nuevo no rehace la forma.
  useEffect(() => { meta.current = fraccion; florRef.current = florece; }, [fraccion, florece]);

  useEffect(() => {
    const cv = lienzo.current;
    if (!cv) return;
    const P = paleta();
    let W = 0, H = 0, raf = 0;
    let pts: [number, number][] = [], acum: number[] = [];
    let hojas: { i: number; lado: number }[] = [];

    // La forma: se rehace solo si cambia el tamaño del renglón.
    const forma = () => {
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W; cv.height = H;
      const r = azar(hash(semilla));
      const medio = H / 2, banda = Math.max(2, H / 2 - 6);
      let x = 6, y = medio;
      pts = [[x, y]]; acum = [0]; hojas = [];
      while (x < W - 8) {
        const paso = 10 + r() * 8;
        // Sube, baja o sigue recto; nunca se sale de su renglón.
        const giro = r();
        let dy = giro < 0.25 ? -paso : giro < 0.5 ? paso : 0;
        if (Math.abs(y + dy - medio) > banda) dy = 0;
        x += paso; y += dy;
        const [px, py] = pts[pts.length - 1];
        acum.push(acum[acum.length - 1] + Math.hypot(x - px, y - py));
        pts.push([x, y]);
        if (r() < 0.55) hojas.push({ i: pts.length - 1, lado: r() < 0.5 ? 1 : -1 });
      }
    };

    const pinta = (f: number) => {
      const ctx = cv.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);
      const L = acum[acum.length - 1] * f;
      ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
      ctx.strokeStyle = P.tallo[0]; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      let punta = pts[0];
      for (let i = 1; i < pts.length; i++) {
        if (acum[i] <= L) { ctx.lineTo(pts[i][0], pts[i][1]); punta = pts[i]; continue; }
        const u = (L - acum[i - 1]) / (acum[i] - acum[i - 1]);
        punta = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u];
        ctx.lineTo(punta[0], punta[1]);
        break;
      }
      ctx.stroke();

      // Hojas en los nudos ya crecidos.
      hojas.forEach((h, k) => {
        if (acum[h.i] > L - 4) return;
        const [x, y] = pts[h.i], s = 7 + (k % 3);
        ctx.fillStyle = P.hoja[k % 3];
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + s * 0.4, y - h.lado * s * 0.5);
        ctx.lineTo(x + s * 0.3, y - h.lado * s);
        ctx.lineTo(x - s * 0.1, y - h.lado * s * 0.45);
        ctx.fill();
      });

      // La raíz: el punto de soldadura de donde nace.
      ctx.fillStyle = P.raiz; ctx.strokeStyle = P.raizBorde; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // La punta: brote, o flor abierta si es la del primer lugar.
      const [tx, ty] = punta;
      if (florRef.current && f > 0.05) {
        const p = 5;
        ctx.fillStyle = P.petalo[0];
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillRect(tx + dx * p - p / 2, ty + dy * p - p / 2, p, p);
        ctx.fillStyle = P.centro; ctx.fillRect(tx - p / 2, ty - p / 2, p, p);
      } else {
        ctx.fillStyle = P.punta;
        ctx.beginPath(); ctx.arc(tx, ty, 3, 0, Math.PI * 2); ctx.fill();
      }
    };

    // Crece hacia su meta con un poco de inercia; quieto, no repinta.
    const cuadro = () => {
      const m = clamp(meta.current);
      const d = m - actual.current;
      if (Math.abs(d) > 0.002) { actual.current += d * 0.08; pinta(actual.current); }
      raf = requestAnimationFrame(cuadro);
    };

    forma();
    pinta(actual.current);
    raf = requestAnimationFrame(cuadro);
    const ojo = new ResizeObserver(() => { forma(); pinta(actual.current); });
    ojo.observe(cv);
    return () => { cancelAnimationFrame(raf); ojo.disconnect(); };
  }, [semilla]);

  return <canvas ref={lienzo} className="mini-tallo" aria-hidden="true" />;
}

/* ============================================================
   PLAGA: el conteo de la cuarentena.
   A la izquierda, las nueve macetas con gusanos asomando solos (de
   adorno: es la pared, no el juego). A la derecha, cada persona con su
   hilera de gusanos aplastados, uno por cada 10 puntos.
   ============================================================ */
// Una sola hilera por persona: más allá del tope se resume en «+N», que
// en una pared se lee mejor que un segundo renglón de gusanos.
const POR_ICONO = 10, MAX_ICONOS = 24;

/** Quién asoma en cada maceta de adorno y con qué retraso. Fijo: la
 *  pared no necesita azar nuevo en cada repintado. */
const ADORNO: ('gusano' | 'mutado' | 'flor')[] = ['gusano', 'flor', 'gusano', 'mutado', 'gusano', 'gusano', 'flor', 'gusano', 'mutado'];

function EscenaPlaga({ tablero, clockOffset }: { tablero: MinijuegoTablero; clockOffset: number }) {
  return (
    <div className="esc esc-mini esc-mini--plaga">
      <JardinEscena variante="plaga" latido={latidoDe(tablero)} />
      <Cabecera titulo="PLAGA" lema="CONTEO DE CUARENTENA" tablero={tablero} clockOffset={clockOffset} />
      <div className="plaga-sala">
        <div className="plaga-sala__macetas" aria-hidden="true">
          {ADORNO.map((tipo, i) => (
            <div key={i} className="plaga-sala__maceta" style={{ animationDelay: `${(i * 0.73) % 4.4}s` }}>
              <div className="plaga-sala__bicho" style={{ animationDelay: `${(i * 0.73) % 4.4}s` }}>
                <Bicho tipo={tipo} />
              </div>
              <Tierra />
            </div>
          ))}
        </div>

        {tablero.ranking.length === 0 ? (
          <Vacio texto="Esperando el primer gusano" />
        ) : (
          <ol className="mini-tabla">
            {tablero.ranking.map((r, i) => {
              const n = Math.floor(r.puntos / POR_ICONO);
              return (
                <Fila key={r.userId} r={r} i={i}>
                  <span className="plaga-conteo">
                    {Array.from({ length: Math.min(n, MAX_ICONOS) }, (_, k) => (
                      <svg key={k} className="plaga-conteo__g" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
                        <rect x="1" y="2" width="6" height="5" />
                        <rect x="2" y="3" width="1" height="1" className="o" />
                        <rect x="5" y="3" width="1" height="1" className="o" />
                        <rect x="1" y="1" width="1" height="1" /><rect x="6" y="1" width="1" height="1" />
                      </svg>
                    ))}
                    {n > MAX_ICONOS && <b className="plaga-conteo__mas">+{n - MAX_ICONOS}</b>}
                  </span>
                </Fila>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   SINAPSIS: la conducción.
   Cada persona es un axón: un soma a la izquierda y una fibra con su
   mielina. Lo largo es lo rápido (contra el primer lugar), y por cada
   axón corre un impulso a la velocidad de esa persona: en la pared se
   VE quién contesta antes. El número es el tiempo de verdad, en ms.
   ============================================================ */
function EscenaSinapsis({ tablero, clockOffset }: { tablero: MinijuegoTablero; clockOffset: number }) {
  const max = Math.max(1, tablero.ranking[0]?.puntos ?? 1);
  return (
    <div className="esc esc-mini esc-mini--sinapsis">
      <JardinEscena variante="sinapsis" latido={latidoDe(tablero)} />
      <Cabecera titulo="SINAPSIS" lema="CONDUCCIÓN DE LA SALA" tablero={tablero} clockOffset={clockOffset} />
      {tablero.ranking.length === 0 ? (
        <Vacio texto="Esperando el primer impulso" />
      ) : (
        <ol className="mini-tabla">
          {tablero.ranking.map((r, i) => {
            const ms = msDeSinapsis(r.puntos);
            return (
              <Fila key={r.userId} r={r} i={i} valor={<>{ms}<small> ms</small></>}>
                <span className="axon" style={{ width: `${Math.max(8, (r.puntos / max) * 100)}%` }}>
                  <span className="axon__soma" />
                  <span className="axon__fibra" />
                  {/* El impulso tarda en cruzar lo que tarda esa persona, por diez. */}
                  <span className="axon__impulso" style={{ animationDuration: `${Math.max(600, ms * 10)}ms` }} />
                </span>
              </Fila>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* ============================================================
   LATIDO: el monitor de la sala.
   Cada persona es una derivación del paciente: su propio trazo de ECG
   en barrido, como en una central de monitoreo. Su frecuencia sube con
   su puntaje, así que el primer lugar es el corazón más acelerado de
   la pared.
   ============================================================ */
function EscenaLatido({ tablero, clockOffset }: { tablero: MinijuegoTablero; clockOffset: number }) {
  return (
    <div className="esc esc-mini esc-mini--latido">
      <JardinEscena variante="latido" latido={latidoDe(tablero)} />
      <Cabecera titulo="LATIDO" lema="CENTRAL DE MONITOREO" tablero={tablero} clockOffset={clockOffset} />
      {tablero.ranking.length === 0 ? (
        <Vacio texto="Esperando la primera lectura" />
      ) : (
        <ol className="mini-tabla">
          {tablero.ranking.map((r, i) => (
            <Fila key={r.userId} r={r} i={i}>
              <Derivacion semilla={r.userId} lpm={lpmDe(r.puntos)} primero={i === 0} />
              <span className="derivacion__fc">{lpmDe(r.puntos)}<small> lpm</small></span>
            </Fila>
          ))}
        </ol>
      )}
    </div>
  );
}

/** De puntos a frecuencia: de 60 lpm (nada) a 160 (el tope del juego). */
const lpmDe = (p: number) => Math.round(60 + Math.min(100, p / 25));

const gauss = (x: number, a: number, mu: number, s: number) => a * Math.exp(-((x - mu) ** 2) / (2 * s * s));
const ondaEcg = (u: number) =>   // u: fase del ciclo, 0-1
  gauss(u, 0.12, 0.18, 0.03) - gauss(u, 0.1, 0.36, 0.008) + gauss(u, 1, 0.38, 0.01)
  - gauss(u, 0.25, 0.4, 0.01) + gauss(u, 0.22, 0.62, 0.05);

/** Un trazo en barrido: la pluma avanza y borra delante de sí, como un
 *  monitor de cabecera. Un lienzo por fila; a 1:1, pixelado. */
function Derivacion({ semilla, lpm, primero }: { semilla: string; lpm: number; primero: boolean }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const lpmRef = useRef(lpm);
  const primeroRef = useRef(primero);
  useEffect(() => { lpmRef.current = lpm; primeroRef.current = primero; }, [lpm, primero]);

  useEffect(() => {
    const cv = lienzo.current;
    if (!cv) return;
    const css = getComputedStyle(document.documentElement);
    const phos = css.getPropertyValue('--phos').trim() || '#fa39ba';
    const verde = css.getPropertyValue('--clorofila-hi').trim() || '#b4f5d4';
    const fondo = css.getPropertyValue('--screen-2').trim() || '#120a16';
    const desfase = (hash(semilla) >>> 0) % 1000 / 1000;
    let raf = 0, W = 0, H = 0, x = 0, antes = performance.now(), fase = desfase, yAnt = 0;
    const PX_MS = 0.12;
    // Avanza la pluma `pasos` pixeles.
    const avanza = (pasos: number) => {
      const ctx = cv.getContext('2d')!;
      for (let k = 0; k < pasos; k++) {
        fase = (fase + (lpmRef.current / 60000) / PX_MS) % 1;
        const y = H * 0.62 - ondaEcg(fase) * H * 0.55;
        // Borra una franja delante de la pluma.
        ctx.fillStyle = fondo; ctx.fillRect(x, 0, 14, H);
        ctx.strokeStyle = primeroRef.current ? verde : phos; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 1, x === 0 ? y : yAnt); ctx.lineTo(x, y); ctx.stroke();
        yAnt = y;
        x++;
        if (x >= W) x = 0;
      }
    };
    // Al aparecer, la fila ya trae una pantalla entera de trazo: un
    // monitor de la central nunca se ve vacío.
    const mide = () => {
      W = cv.clientWidth; H = cv.clientHeight; cv.width = W; cv.height = H; x = 0;
      avanza(W);
    };
    mide();
    const cuadro = (t: number) => {
      const dt = Math.min(100, t - antes); antes = t;
      avanza(Math.max(1, Math.round(dt * PX_MS)));
      raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    const ojo = new ResizeObserver(mide);
    ojo.observe(cv);
    return () => { cancelAnimationFrame(raf); ojo.disconnect(); };
  }, [semilla]);

  return <canvas ref={lienzo} className="derivacion" aria-hidden="true" />;
}
