import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { PARTES, type ParteClave } from '../lib/anatomia';
import { azar, crece, preparar, type Semilla } from '../lib/jardin';
import { sonar } from '../lib/sonido';
import { Munon, Vegetacion, type Tono } from '../player/AnatomiaDeco';
import { JardinEscena } from './JardinEscena';

/**
 * LA DESTRUCCIÓN DEL ROBOT, EN LA PARED.
 *
 * El robot del lobby, en grande, y una muerte distinta para cada parte.
 * La lámina es mitad estatua (izquierda, mármol) y mitad máquina
 * (derecha, circuito), y cada parte muere como lo que es:
 *
 *   pierna izq.  DESMORONADA    el mármol se raja y revienta en losas
 *   pierna der.  CORTOCIRCUITO  rayos entre las juntas y sale despedida
 *   brazo izq.   ARRANCADO      la enredadera lo estruja y lo arranca
 *   brazo der.   SOBRECARGA     al rojo blanco y revienta en una bola de fuego
 *   torso        FRACTURA       grietas de luz y el pecho estalla en dos
 *   cabeza       APAGADO        se descompone y revienta en píxeles
 *   corazón      FLORECE        late hasta reventar en una tormenta de pétalos
 *
 * Cada muerte va en tres tiempos: AMENAZA (alerta roja, la parte falla
 * y el temblor crece), GOLPE (el impacto: la cámara se sacude, la
 * pantalla se quema en blanco y los colores se separan) y CAOS (escombro,
 * humo y brasas que siguen cayendo). Todo se mide desde el instante del
 * impacto de cada parte (`IMPACTO`, la variable CSS `--i`): alargar o
 * acortar una muerte es cambiar un número.
 *
 * Se reproducen EN ORDEN (`cola`). Lo ya destrozado antes (`rotas`) se
 * pinta como resto: el mismo dibujo de la animación saltado a su último
 * fotograma (clase `hecha`), así que el escombro queda donde cayó.
 *
 * Detrás, la maleza de siempre: raíces de circuito, enredaderas y buses,
 * que laten con cada golpe; y en el suelo crecen hierba y pistas entre
 * los restos.
 */

export type Golpe = {
  id: string;
  parte: ParteClave;
  /** El equipo que la superó primero; null si no hay nadie que mostrar. */
  equipo: string | null;
  /** Su logo (URL), para el cartel final. */
  logo?: string | null;
  /** Un ensayo: el cartel lo dice, para que nadie lo tome por real. */
  ensayo?: boolean;
  /** El número de su fase, si tiene. */
  fase: number | null;
};

const VERBO: Record<ParteClave, string> = {
  'pierna-izq': 'DESMORONADA',
  'pierna-der': 'CORTOCIRCUITO',
  'brazo-izq': 'ARRANCADO',
  'brazo-der': 'SOBRECARGA',
  torso: 'FRACTURA',
  cabeza: 'APAGADO',
  corazon: 'FLORECE',
};

/** El instante del golpe de cada parte, en segundos desde que arranca. */
const IMPACTO: Record<ParteClave, number> = {
  'pierna-izq': 3.2, 'pierna-der': 3.4, 'brazo-izq': 3.6, 'brazo-der': 3.6,
  torso: 3.4, cabeza: 3.8, corazon: 4.2,
};

/** Lo que dura cada parte en pantalla, y lo que se queda la pared al
 *  terminar la secuencia antes de volver a la escena de la fase. */
export const PASO_MS = 9000;
/** El cartel del equipo que la superó, al final de cada parte. */
const CARTEL_MS = 4800;
const FIN_MS = 3200;
const HUNDIDO = 318;
/** Lo que dura la sacudida de cámara del golpe; el CSS dura lo mismo. */
const SACUDIDA_MS = 1300;

type Voz = Parameters<typeof sonar>[0];
/** Cuándo suena qué: [segundos relativos al impacto, voz]. */
const SONIDOS: Record<ParteClave, [number, Voz][]> = {
  'pierna-izq': [[-3.2, 'averia'], [-2.4, 'estatica'], [-1.6, 'golpe'], [-0.9, 'estatica'], [-0.4, 'golpe'], [0, 'estallido'], [0.7, 'golpe'], [1, 'golpe'], [1.3, 'golpe'], [2, 'estatica']],
  'pierna-der': [[-3.4, 'estatica'], [-2.8, 'estatica'], [-2.2, 'averia'], [-1.6, 'estatica'], [-1, 'estatica'], [-0.5, 'estatica'], [0, 'estallido'], [1.1, 'golpe'], [1.6, 'estatica']],
  'brazo-izq': [[-3.6, 'canal'], [-2.2, 'golpe'], [-1.4, 'golpe'], [-0.6, 'golpe'], [0, 'estallido'], [1.2, 'golpe'], [1.8, 'averia']],
  'brazo-der': [[-3.6, 'averia'], [-2.4, 'estatica'], [-1.4, 'averia'], [-0.6, 'estatica'], [0, 'estallido'], [0.35, 'estallido'], [1, 'golpe'], [1.8, 'estatica']],
  torso: [[-3.4, 'estatica'], [-2.4, 'averia'], [-1.4, 'estatica'], [-0.5, 'estatica'], [0, 'estallido'], [0.4, 'estallido'], [1.2, 'golpe']],
  cabeza: [[-3.8, 'estatica'], [-2.6, 'estatica'], [-1.8, 'averia'], [-1, 'estatica'], [-0.4, 'estatica'], [0, 'estallido'], [0.3, 'salir'], [1.3, 'golpe']],
  corazon: [[-4.2, 'tic'], [-3.2, 'tic'], [-2.4, 'tic'], [-1.8, 'tic'], [-1.3, 'tic'], [-0.9, 'tic'], [-0.6, 'tic'], [-0.35, 'tic'], [-0.15, 'tic'], [0, 'estallido'], [0.5, 'meta']],
};

/** El orden canónico, para el marcador de abajo. */
const CUERPO: ParteClave[] = ['pierna-izq', 'pierna-der', 'brazo-izq', 'brazo-der', 'torso', 'cabeza', 'corazon'];

export function DestruccionRobot({ cola, rotas, onFin, mudo, alSaltar }: {
  cola: Golpe[];
  /** Lo que ya estaba destrozado antes de esta secuencia. */
  rotas: Set<ParteClave>;
  onFin: () => void;
  /** Sin sonido: en los portátiles de la sala lo pone la proyección. */
  mudo?: boolean;
  /** Si llega, un botón para cerrarla antes de tiempo. */
  alSaltar?: () => void;
}) {
  const [i, setI] = useState(0);
  const [cartel, setCartel] = useState(false);
  const [sacude, setSacude] = useState(false);
  const [golpes, setGolpes] = useState(0); // para que la maleza lata
  const golpe = cola[Math.min(i, cola.length - 1)];
  const terminado = i >= cola.length;

  // Una parte tras otra; al acabar, un respiro y fuera.
  useEffect(() => {
    if (terminado) {
      const t = setTimeout(onFin, FIN_MS);
      return () => clearTimeout(t);
    }
    const imp = IMPACTO[golpe.parte] * 1000;
    const relojes = mudo ? [] : SONIDOS[golpe.parte].map(([s, voz]) => setTimeout(() => sonar(voz), Math.max(0, imp + s * 1000)));
    relojes.push(setTimeout(() => { setSacude(true); setGolpes((n) => n + 1); }, imp));
    relojes.push(setTimeout(() => setSacude(false), imp + SACUDIDA_MS));
    // Al acabar la parte, el cartel de quien la superó; luego, la siguiente.
    const siguiente = () => { setCartel(false); setI((n) => n + 1); };
    if (golpe.equipo) {
      relojes.push(setTimeout(() => { setCartel(true); if (!mudo) sonar('victoria'); }, PASO_MS));
      relojes.push(setTimeout(siguiente, PASO_MS + CARTEL_MS));
    } else {
      relojes.push(setTimeout(siguiente, PASO_MS));
    }
    return () => relojes.forEach(clearTimeout);
    // `terminado` también: si llega otra parte justo cuando la secuencia
    // acababa, se reproduce en vez de cerrarse la pared.
  }, [i, terminado]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lo que ya está roto en este instante: lo de antes y lo ya reproducido.
  const hechas = new Set(rotas);
  cola.slice(0, terminado ? cola.length : i).forEach((g) => hechas.add(g.parte));
  const actual = terminado ? null : golpe.parte;

  // Sin piernas el robot no se tiene: se ladea con una y se hunde sin las dos.
  const sinIzq = hechas.has('pierna-izq'), sinDer = hechas.has('pierna-der');
  const postura = sinIzq && sinDer ? 'hundido' : sinIzq ? 'ladea-izq' : sinDer ? 'ladea-der' : 'firme';
  const deCuerpo = (c: ParteClave) => c === 'torso' || c === 'corazon' || c === 'cabeza' || c.startsWith('brazo');
  const imp = actual ? IMPACTO[actual] : 0;

  return (
    <div
      className={`destruccion ${terminado ? 'destruccion--sale' : ''} ${sacude ? 'destruccion--golpe' : ''}`}
      style={{ '--i': imp } as CSSProperties}
      role="status" aria-live="polite"
    >
      {/* La maleza del fondo: la misma pared viva de los recreos. */}
      <JardinEscena variante="robot" latido={golpes} />
      {/* La alerta de la amenaza, el fogonazo del golpe. */}
      {actual && <span key={`a-${golpe.id}`} className="dr-alerta" aria-hidden="true" />}
      {sacude && <span key={`f-${golpes}`} className="dr-flash" aria-hidden="true" />}
      {alSaltar && <button type="button" className="dr-saltar" onClick={alSaltar}>SEGUIR JUGANDO ▸</button>}

      {/* El cartel final: quién fue el primero en superarla. */}
      {cartel && golpe && !terminado && (
        <div key={`c-${golpe.id}`} className="dr-cartel">
          <span className="dr-cartel__primero">PRIMERO EN SUPERAR</span>
          <span className="dr-cartel__fase">
            {golpe.fase !== null && <b>F{golpe.fase}</b>} {PARTES[golpe.parte].nombre} · {VERBO[golpe.parte]}
          </span>
          {golpe.logo
            ? <img className="dr-cartel__logo" src={golpe.logo} alt="" />
            : <span className="dr-cartel__logo dr-cartel__logo--hueco" aria-hidden="true">{golpe.equipo!.slice(0, 2)}</span>}
          <strong className="dr-cartel__nombre">{golpe.equipo}</strong>
          {golpe.ensayo && <span className="dr-cartel__ensayo">ensayo · no cuenta para la partida</span>}
        </div>
      )}

      <svg className={`dr-lienzo ${actual ? `dr-lienzo--${actual}` : ''}`} viewBox="-34 0 628 884" aria-hidden="true">
        <defs>
          <pattern id="an-marmol" width="46" height="46" patternUnits="userSpaceOnUse">
            <path d="M0 34 C10 22 18 30 26 20 S40 8 46 12" className="an-veta" />
            <path d="M6 0 C10 8 4 14 12 22" className="an-veta an-veta--fina" />
          </pattern>
          <pattern id="an-circuito" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M0 12 H8 L12 8 H24 M12 8 V0 M18 8 V16 L22 20 H24" className="an-pista" />
            <rect x="6" y="10" width="3" height="3" className="an-via" />
            <rect x="16" y="14" width="4" height="4" className="an-via" />
          </pattern>
          <clipPath id="an-organica"><rect x="-40" y="0" width="320" height="884" /></clipPath>
          <clipPath id="an-maquina"><rect x="280" y="0" width="320" height="884" /></clipPath>
          {CUERPO.map((c) => <clipPath key={c} id={`dr-clip-${c}`}><path d={PARTES[c].d} /></clipPath>)}
          <radialGradient id="dr-fuego">
            <stop offset="0" stopColor="#fff6d0" />
            <stop offset=".35" stopColor="#ffb347" />
            <stop offset=".7" stopColor="#ff4a1c" stopOpacity=".8" />
            <stop offset="1" stopColor="#a3122a" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* El suelo, con su hierba y sus pistas entre los restos. */}
        <SueloVivo />
        <path d="M-30 878 H590" className="an-suelo" />
        <rect x="196" y="762" width="168" height="6" className="an-pedestal" />
        <rect x="216" y="770" width="128" height="4" className="an-pedestal an-pedestal--b" />

        {/* Lo que sigue en pie (o colgando del cuerpo), con su postura. */}
        <g className={`dr-cuerpo dr-cuerpo--${postura}`}>
          {CUERPO.filter((c) => !hechas.has(c) && c !== actual && c !== 'corazon').map((c) => <Silueta key={c} c={c} />)}
          <path d="M282 232 H330 V288 H282 Z" className="an-placa" />
          {!hechas.has('corazon') && actual !== 'corazon' && <Silueta c="corazon" />}
          {hechas.has('torso') && actual !== 'torso' && <Rotura c="torso" hecha />}
          {hechas.has('corazon') && actual !== 'corazon' && <Rotura c="corazon" hecha />}
          {actual && deCuerpo(actual) && <Rotura key={golpe.id} c={actual} hundido={postura === 'hundido'} />}
          {CUERPO.filter((c) => hechas.has(c) && c !== 'torso' && c !== 'corazon').map((c) => (
            <Munon key={`m-${c}`} x={PARTES[c].munon[0]} y={PARTES[c].munon[1]} cuello={c === 'cabeza'} />
          ))}
        </g>

        {/* Las piernas mueren en su sitio aunque el cuerpo se ladee. Y el
            escombro de lo ya caído. */}
        {actual && !deCuerpo(actual) && <Rotura key={golpe.id} c={actual} />}
        {CUERPO.filter((c) => hechas.has(c) && c !== actual && c !== 'torso' && c !== 'corazon').map((c) => (
          <Rotura key={`r-${c}`} c={c} hecha />
        ))}
      </svg>

      <div className="dr-rotulo">
        {golpe && !terminado && (
          <div key={golpe.id} className="dr-rotulo__golpe">
            <span className="dr-rotulo__alerta">!! ALERTA ESTRUCTURAL</span>
            <span className="dr-rotulo__parte">
              {golpe.fase !== null && <b>F{golpe.fase}</b>} {PARTES[golpe.parte].nombre}
            </span>
            <strong className={`dr-rotulo__verbo dr-rotulo__verbo--${golpe.parte}`}>{VERBO[golpe.parte]}</strong>
            <span className="dr-rotulo__quien">
              {golpe.ensayo ? 'ensayo · no cuenta para la partida' : golpe.equipo ? <>la ha destrozado <b>{golpe.equipo}</b></> : null}
            </span>
          </div>
        )}
        {terminado && <strong className="dr-rotulo__verbo dr-rotulo__verbo--fin">{hechas.size === CUERPO.length ? 'DESMONTADO' : 'SIGUE EN PIE'}</strong>}
        <ol className="dr-marcador" aria-label="Partes destrozadas">
          {CUERPO.map((c) => (
            <li key={c} className={hechas.has(c) ? 'rota' : c === actual ? 'cae' : ''}>{PARTES[c].corto}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** La parte entera, con sus dos pieles: mármol a la izquierda, circuito a la derecha. */
function Silueta({ c, clase }: { c: ParteClave; clase?: string }) {
  const d = PARTES[c].d;
  return (
    <g className={`dr-silueta ${clase ?? ''}`}>
      <path d={d} className="parte__base" />
      <path d={d} className="parte__piel parte__piel--marmol" clipPath="url(#an-organica)" />
      <path d={d} className="parte__piel parte__piel--circuito" clipPath="url(#an-maquina)" />
      <path d={d} className="parte__borde" />
    </g>
  );
}

/** Hierba y pistas de circuito creciendo por el suelo, a los dos lados
 *  del pedestal: el escombro cae sobre algo vivo. */
function SueloVivo() {
  const plantas = useMemo(() => {
    const r = azar(8080);
    const base = { rnd: r, paso: [7, 13] as [number, number], largo: [4, 8] as [number, number], giro: 0.35, rama: 0.45, prof: 3, tiron: 0.45 };
    const sembrar: { tono: Tono; o: Partial<Semilla> }[] = [
      { tono: 'vida', o: { x: -30, y: 878, dir: 7, sesgo: 6, caja: [-34, 690, 190, 880], hoja: 0.65, tamHoja: 10, flor: 0.3, tamFlor: 3.4, max: 60 } },
      { tono: 'circuito', o: { x: 40, y: 878, dir: 0, sesgo: 0, caja: [-30, 820, 200, 880], hoja: 0, flor: 0, chip: 0.3, max: 30 } },
      { tono: 'vida', o: { x: 590, y: 878, dir: 5, sesgo: 6, caja: [370, 690, 594, 880], hoja: 0.65, tamHoja: 10, flor: 0.3, tamFlor: 3.4, max: 60 } },
      { tono: 'raiz', o: { x: 520, y: 878, dir: 4, sesgo: 4, caja: [360, 820, 594, 880], hoja: 0.2, flor: 0.1, chip: 0.25, max: 30 } },
    ];
    return sembrar.map(({ tono, o }) => ({ tono, p: preparar(crece({ ...base, ...o } as Semilla)) }));
  }, []);
  return <g className="dr-suelo-vivo">{plantas.map(({ p, tono }, k) => <Vegetacion key={k} p={p} tono={tono} />)}</g>;
}

const v = (o: Record<string, string | number>) => o as CSSProperties;

/** Un puñado de partículas que salen de (x, y) en abanico, `t` segundos
 *  después de que arranque la parte. */
function Estallido({ x, y, n, radio, clase, t = 0, caen = false, semilla = 1, sube = 20 }: {
  x: number; y: number; n: number; radio: number; clase: string; t?: number; caen?: boolean; semilla?: number; sube?: number;
}) {
  const r = azar(semilla);
  return (
    <g className={`dr-estallido ${clase}`}>
      {Array.from({ length: n }, (_, k) => {
        const a = (k / n) * Math.PI * 2 + r() * 0.5;
        const d = radio * (0.45 + r() * 0.8);
        const tam = 3 + r() * 6;
        return (
          <rect
            key={k} x={x - tam / 2} y={y - tam / 2} width={tam} height={tam}
            style={v({
              '--vx': `${Math.cos(a) * d}px`, '--vy': `${Math.sin(a) * d - (caen ? sube : 20)}px`,
              '--suelo': `${876 - y - tam}px`, '--gira': `${(r() - 0.5) * 720}deg`,
              animationDelay: `${t + r() * 0.15}s`,
            })}
          />
        );
      })}
    </g>
  );
}

/** Humo que sube y se abre, y brasas que caen despacio. */
function Humo({ x, y, n, t, semilla = 1 }: { x: number; y: number; n: number; t: number; semilla?: number }) {
  const r = azar(semilla);
  return (
    <g className="dr-humo">
      {Array.from({ length: n }, (_, k) => (
        <circle
          key={k} cx={x + (r() - 0.5) * 40} cy={y + (r() - 0.5) * 20} r={10 + r() * 14}
          style={v({ '--vx': `${(r() - 0.5) * 120}px`, '--vy': `${-120 - r() * 160}px`, animationDelay: `${t + k * 0.12}s` })}
        />
      ))}
    </g>
  );
}

/** La bola de fuego del golpe: núcleo blanco, fuego y onda. */
function Bola({ x, y, r, t }: { x: number; y: number; r: number; t: number }) {
  return (
    <g className="dr-bola" style={{ ['--t' as string]: `${t}s` }}>
      <circle cx={x} cy={y} r={r} fill="url(#dr-fuego)" className="dr-bola__fuego" />
      <circle cx={x} cy={y} r={r * 0.9} className="dr-onda" />
      <circle cx={x} cy={y} r={r * 0.6} className="dr-onda dr-onda--2" />
    </g>
  );
}

/** El trozo `k` de una parte cortada en franjas o en rejilla, con su animación. */
function Trozo({ c, x, y, w, h, k, estilo }: { c: ParteClave; x: number; y: number; w: number; h: number; k: string; estilo: CSSProperties }) {
  return (
    <g className="dr-trozo" style={{ transformOrigin: `${x + w / 2}px ${y + h / 2}px`, ...estilo }}>
      <clipPath id={`dr-t-${c}-${k}`}><rect x={x} y={y} width={w} height={h} /></clipPath>
      <g clipPath={`url(#dr-t-${c}-${k})`}><Silueta c={c} /></g>
    </g>
  );
}

/** Corta una parte en rejilla y la hace volar desde (cx, cy). */
function Rejilla({ c, caja: [x0, y0, x1, y1], cols, filas, cx, cy, t, fuerza, semilla }: {
  c: ParteClave; caja: [number, number, number, number]; cols: number; filas: number;
  cx: number; cy: number; t: number; fuerza: number; semilla: number;
}) {
  const r = azar(semilla), cw = (x1 - x0) / cols, ch = (y1 - y0) / filas;
  return (
    <>
      {Array.from({ length: cols * filas }, (_, k) => {
        const x = x0 + (k % cols) * cw, y = y0 + Math.floor(k / cols) * ch;
        const a = Math.atan2(y + ch / 2 - cy, x + cw / 2 - cx);
        const d = fuerza * (0.6 + r() * 0.9);
        return (
          <Trozo key={k} c={c} k={`${k}`} x={x} y={y} w={cw} h={ch} estilo={v({
            '--tx': `${Math.cos(a) * d}px`, '--ty': `${Math.sin(a) * d}px`, '--rot': `${(r() - 0.5) * 900}deg`,
            animationDelay: `${t + r() * 0.06}s`,
          })} />
        );
      })}
    </>
  );
}

/** La muerte de cada parte. Con `hecha`, su último fotograma: el resto. */
function Rotura({ c, hecha, hundido }: { c: ParteClave; hecha?: boolean; hundido?: boolean }) {
  const p = PARTES[c];
  const cae = p.caida;
  const I = IMPACTO[c];
  // La caída al suelo, con los mismos números que la del lobby. Si el
  // cuerpo está hundido, lo que cae de él sale desde más abajo y cae menos.
  const alSuelo = cae ? v({
    transformOrigin: `${cae.centro[0]}px ${cae.centro[1]}px`,
    '--tx': `${cae.destino[0] - cae.centro[0]}px`, '--ty': `${cae.destino[1] - cae.centro[1] - (hundido ? HUNDIDO : 0)}px`,
    '--rot': `${cae.giro}deg`, '--esc': cae.esc,
  }) : undefined;
  const suelo = (x: number) => <path className="dr-grieta-suelo" d={`M${x - 70} 878 L${x - 40} 872 L${x - 18} 880 L${x + 6} 870 L${x + 30} 879 L${x + 58} 873 L${x + 80} 878`} />;

  const enredadera = useMemo(() => c === 'brazo-izq' ? preparar(crece({
    ...p.brote, tiron: 0.45, rnd: azar(4242), paso: [6, 11], largo: [5, 9], giro: 0.35, rama: 0.6, prof: 3,
    hoja: 0.8, tamHoja: 11, flor: 0.3, tamFlor: 3, max: 90,
  })) : null, [c, p.brote]);

  let cuerpo: ReactNode = null;
  switch (c) {
    case 'pierna-izq': {
      // El mármol se raja con el temblor; en el golpe, las losas salen
      // disparadas hacia arriba y se estrellan contra el suelo.
      const [x0, y0, x1, y1] = [228, 432, 284, 762], N = 10, alto = (y1 - y0) / N;
      const r = azar(77);
      cuerpo = (
        <>
          <g className="dr-tiembla">
            {Array.from({ length: N }, (_, k) => {
              const y = y0 + k * alto;
              return (
                <Trozo key={k} c={c} k={`${k}`} x={x0} y={y} w={x1 - x0} h={alto} estilo={v({
                  '--tx': `${(r() - 0.5) * 320}px`, '--alza': `${-60 - r() * 140}px`,
                  '--ty': `${870 - (y + alto / 2) - r() * 12}px`, '--rot': `${(r() - 0.5) * 300}deg`,
                  animationDelay: `${I + (N - 1 - k) * 0.035}s`,
                })} />
              );
            })}
            <path className="dr-grieta" d="M252 440 L246 480 L258 512 L244 556 L256 600 L248 650 L260 700 L250 752" />
            <path className="dr-grieta dr-grieta--fina" d="M246 480 L232 494 M258 512 L274 528 M256 600 L272 612 M248 650 L234 666 M260 700 L276 716" />
          </g>
          {/* Guijarros que se sueltan durante la amenaza. */}
          <Estallido x={252} y={600} n={10} radio={30} clase="dr-guijarro" t={1.2} caen sube={0} semilla={31} />
          <Estallido x={256} y={560} n={26} radio={160} clase="dr-esquirla dr-esquirla--piedra" t={I} caen semilla={33} />
          <Estallido x={256} y={866} n={30} radio={150} clase="dr-polvo" t={I + 0.6} caen={false} semilla={35} />
          <Humo x={256} y={850} n={8} t={I + 0.7} semilla={37} />
          {suelo(256)}
        </>
      );
      break;
    }
    case 'pierna-der':
      // Rayos entre las juntas, chispazos cada vez más seguidos y, en el
      // golpe, la pierna sale despedida y se estrella.
      cuerpo = (
        <>
          <g className="dr-cae" style={alSuelo}>
            <g className="dr-parpadea"><Silueta c={c} /></g>
            <g clipPath={`url(#dr-clip-${c})`}><rect x="270" y="430" width="70" height="340" className="dr-destello-azul" /></g>
          </g>
          <polyline className="dr-rayo" points="304,440 296,470 312,500 294,532 310,566" />
          <polyline className="dr-rayo dr-rayo--b" points="304,566 314,600 296,640 312,680 298,712 306,742" />
          {[[440, 0.3], [566, 0.9], [742, 1.5], [440, 2.1], [566, 2.6], [742, 3.0]].map(([y, t], k) => (
            <Estallido key={k} x={304} y={y} n={16} radio={70} clase="dr-chispa" t={t} semilla={3 + k} />
          ))}
          <Bola x={304} y={440} r={60} t={I} />
          <Estallido x={304} y={444} n={14} radio={170} clase="dr-tornillo" t={I} caen semilla={11} />
          <Estallido x={436} y={850} n={22} radio={90} clase="dr-chispa" t={I + 0.75} semilla={12} />
          <Humo x={304} y={440} n={7} t={I + 0.3} semilla={14} />
          {suelo(436)}
        </>
      );
      break;
    case 'brazo-izq':
      // La enredadera lo cubre, lo estruja tres veces y lo arranca.
      cuerpo = (
        <>
          <g className="dr-arranca" style={alSuelo}>
            <g className="dr-aprieta" style={{ transformOrigin: '161px 347px' }}>
              <Silueta c={c} />
              {enredadera && <g className="dr-enredadera"><Vegetacion p={enredadera} /></g>}
            </g>
          </g>
          <Estallido x={196} y={204} n={30} radio={150} clase="dr-hoja" t={I} caen semilla={13} />
          <Estallido x={196} y={204} n={16} radio={90} clase="dr-esquirla" t={I} caen semilla={15} />
          <circle cx={196} cy={204} r={40} className="dr-onda dr-onda--verde" />
          <Humo x={150} y={806} n={6} t={I + 1.1} semilla={17} />
          {suelo(150)}
        </>
      );
      break;
    case 'brazo-der':
      // Al rojo, luego al blanco, vibra y revienta en una bola de fuego.
      cuerpo = (
        <>
          <g className="dr-al-rojo">
            <Rejilla c={c} caja={[350, 188, 446, 506]} cols={5} filas={10} cx={397} cy={347} t={I} fuerza={360} semilla={99} />
            <g clipPath={`url(#dr-clip-${c})`}><rect x="340" y="180" width="120" height="340" className="dr-calor" /></g>
          </g>
          <Humo x={397} y={300} n={6} t={1} semilla={41} />
          <Bola x={397} y={347} r={95} t={I} />
          <Bola x={380} y={280} r={55} t={I + 0.35} />
          <Estallido x={397} y={347} n={34} radio={260} clase="dr-brasa" t={I} caen sube={80} semilla={43} />
          <Humo x={397} y={330} n={10} t={I + 0.4} semilla={45} />
        </>
      );
      break;
    case 'torso':
      // Las grietas de luz crecen, el pecho late de luz y estalla en dos.
      cuerpo = (
        <>
          <g className="dr-mitad dr-mitad--izq" style={{ transformOrigin: '280px 432px' }}>
            <g clipPath="url(#an-organica)"><Silueta c={c} /></g>
          </g>
          <g className="dr-mitad dr-mitad--der" style={{ transformOrigin: '280px 432px' }}>
            <g clipPath="url(#an-maquina)"><Silueta c={c} /></g>
          </g>
          <g className="dr-luz">
            <path className="dr-grieta dr-grieta--luz" d="M280 192 L272 236 L288 274 L270 318 L286 362 L274 404 L282 430" />
            <path className="dr-grieta dr-grieta--luz dr-grieta--fina" d="M272 236 L238 252 L222 286 M288 274 L322 288 L346 270 M270 318 L232 336 M286 362 L322 380 L340 410 M238 252 L214 236 M322 288 L352 316" />
          </g>
          <Bola x={280} y={310} r={110} t={I} />
          <Bola x={250} y={260} r={50} t={I + 0.4} />
          <Estallido x={280} y={330} n={40} radio={240} clase="dr-esquirla" t={I} caen semilla={17} />
          <Humo x={280} y={300} n={10} t={I + 0.4} semilla={19} />
        </>
      );
      break;
    case 'cabeza':
      // Los ojos fallan, la imagen se descompone cada vez más fuerte y la
      // cabeza revienta en píxeles con un último destello de tubo.
      cuerpo = (
        <>
          <g className="dr-cabeza-entera">
            <g className="dr-fantasma dr-fantasma--a"><Silueta c={c} /></g>
            <g className="dr-fantasma dr-fantasma--b"><Silueta c={c} /></g>
            <Silueta c={c} />
            <path d="M244 92 L262 88 L266 96 L248 98 Z" className="dr-ojo" />
            <rect x="294" y="88" width="20" height="8" className="dr-ojo dr-ojo--led" />
          </g>
          <g className="dr-pixeles">
            <Rejilla c={c} caja={[228, 22, 332, 192]} cols={6} filas={9} cx={280} cy={100} t={I} fuerza={330} semilla={61} />
          </g>
          <rect x="120" y="102" width="320" height="8" className="dr-raya" />
          <Bola x={280} y={100} r={70} t={I} />
          <Estallido x={280} y={100} n={30} radio={220} clase="dr-chispa dr-chispa--blanca" t={I} semilla={63} />
        </>
      );
      break;
    case 'corazon':
      // Late cada vez más deprisa y revienta en una tormenta de pétalos.
      cuerpo = (
        <>
          <g className="dr-late" style={{ transformOrigin: '304px 260px' }}><Silueta c={c} /></g>
          <Bola x={304} y={260} r={80} t={I} />
          <Estallido x={304} y={260} n={70} radio={300} clase="dr-petalo" t={I} caen sube={60} semilla={23} />
          <Estallido x={304} y={260} n={30} radio={160} clase="dr-petalo dr-petalo--lento" t={I + 0.3} caen sube={120} semilla={25} />
          <g className="dr-brota">
            {[[-14, -8], [0, -18], [14, -8], [-6, 6], [10, 8], [-20, 10], [22, 4]].map(([dx, dy], k) => (
              <g key={k}>
                {[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([a, b], j) => (
                  <rect key={j} x={304 + dx + a * 5 - 2.5} y={258 + dy + b * 5 - 2.5} width="5" height="5" className="vida__petalo" />
                ))}
                <rect x={304 + dx - 2.5} y={258 + dy - 2.5} width="5" height="5" className="vida__centro" />
              </g>
            ))}
          </g>
        </>
      );
      break;
  }
  return (
    <g className={`dr-rotura dr-rotura--${c} ${hecha ? 'hecha' : ''}`} style={{ ['--i' as string]: I }}>
      {cuerpo}
    </g>
  );
}
