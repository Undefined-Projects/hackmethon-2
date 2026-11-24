import type { CSSProperties, ReactNode } from 'react';
import { BroteArriba } from './Marana';
import { Cursor, Kbd, Motas, Robot } from './IntroReflejo';
import type { EscenaIntro } from './IntroFase';

// ============================================================
//  LA INTRODUCCIÓN DE LA FASE 1 · La Maraña
//
//  Es lo primero que ve gente que quizá nunca ha programado. Seis
//  escenas, casi sin leer, y una idea por escena:
//    1. para entrar a la máquina hay que cruzar su pierna, una maraña;
//    2. su brote: una flecha, como Karel; nace, llega… o choca;
//    3. lo que sabe hacer: avanzar y girar, una instrucción por línea;
//    4. izquierda y derecha son las DEL BROTE;
//    5. nadie lo tiene todo;
//    6. las dos capas: el semillero para calentar y el seto.
//
//  Al llegar al seto sale otra (INTRO_SETO): los ciclos y las espinas.
//  Y el bonus, La Espesura, tiene la suya (INTRO_ESPESURA).
//
//  Español de México. Es la misma lámina que el juego —el mismo brote, el
//  mismo seto—, pero en pizarra: nada de lo que sale aquí es un dato de la
//  partida. Ni el laberinto de ninguna mesa, ni la solución.
// ============================================================

const v = (o: Record<string, string | number>) => o as CSSProperties;

/** Un seto de pizarra. `#` pared, `.` camino, `S` salida, `E` entrada. */
function MiniSeto({ plano, x, y, k, d0 = 0, oscuro = false }: {
  plano: string[]; x: number; y: number; k: number; d0?: number; oscuro?: boolean;
}) {
  return (
    <g className={`im-seto${oscuro ? ' oscuro' : ''}`} transform={`translate(${x} ${y})`}>
      {plano.flatMap((fila, f) => [...fila].map((ch, c) => {
        if (ch === '#') {
          return (
            <rect key={`${f}-${c}`} className="im-muro" x={c * k} y={f * k} width={k} height={k} rx={k * 0.18}
                  style={v({ '--d': `${d0 + (f + c) * 0.045}s` })} />
          );
        }
        if (ch === 'S') {
          return (
            <g key={`${f}-${c}`} className="im-salida" transform={`translate(${c * k + k / 2} ${f * k + k / 2})`}>
              <circle r={k * 0.42} />
              <circle className="aro" r={k * 0.42} />
            </g>
          );
        }
        if (ch === 'E') {
          return <circle key={`${f}-${c}`} className="im-entrada" cx={c * k + k / 2} cy={f * k + k / 2} r={k * 0.36} />;
        }
        return null;
      }))}
    </g>
  );
}

/** El camino por los centros de unas casillas, para que el brote lo ande. */
const ruta = (x: number, y: number, k: number, celdas: [number, number][]) =>
  'M' + celdas.map(([f, c]) => `${x + c * k + k / 2} ${y + f * k + k / 2}`).join(' L');

/** Un brote que anda una ruta. `fin` dice cómo acaba. */
function BroteAnda({ d, dur, retardo, fin = 'llega', esc = 1 }: {
  d: string; dur: number; retardo: number; fin?: 'llega' | 'choca'; esc?: number;
}) {
  return (
    <g className={`im-brote ${fin}`} style={v({ offsetPath: `path('${d}')`, '--dur': `${dur}s`, '--d': `${retardo}s` })}>
      <g style={{ transform: `rotate(90deg) scale(${esc})` }}>
        <BroteArriba />
      </g>
    </g>
  );
}

// ---------- las escenas ----------

const SETO_E1 = [
  '#########',
  '#.....#S#',
  '#.###.#.#',
  '#.#...#.#',
  '#.#.###.#',
  '#...#...#',
  '###.#.###',
  '#E....#.#',
  '#########',
];

function E1() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <Robot x={150} y={40} alto={440} enciende="pierna-izq" />
      <rect className="ir-escaner" x="150" y="40" width="200" height="6" />
      <circle className="ir-lupa-origen" cx="304" cy="360" r="20" />
      <path className="ir-lupa-haz" d="M322 350 L560 140 M322 370 L560 470" />
      <g className="ir-aparece" style={v({ '--d': '2.4s' })}>
        <MiniSeto plano={SETO_E1} x={565} y={100} k={40} d0={2.8} />
      </g>
      <text className="ir-rotulo" x="745" y="80" textAnchor="middle">LA PIERNA IZQUIERDA</text>
      <text className="ir-aviso" x="745" y="500" textAnchor="middle" style={v({ animationDelay: '6.4s' })}>
        para entrar a la máquina, hay que cruzarla
      </text>
    </svg>
  );
}

const SETO_E2 = [
  '###########',
  '#E....#..S#',
  '####.##.###',
  '#....#..#.#',
  '#.##...##.#',
  '#.........#',
  '###########',
];
function E2() {
  const k = 50, x = 205, y = 70;
  // El primero llega; el segundo se pasa de largo y se estrella.
  const llega = ruta(x, y, k, [[1, 1], [1, 2], [1, 3], [1, 4], [2, 4], [3, 4], [4, 4], [4, 5], [4, 6], [3, 6], [3, 7], [2, 7], [1, 7], [1, 8], [1, 9]]);
  const choca = ruta(x, y, k, [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 5.62]]);
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <MiniSeto plano={SETO_E2} x={x} y={y} k={k} />
      <BroteAnda d={llega} dur={5.4} retardo={0.8} esc={1.5} />
      <g className="ir-aparece" style={v({ '--d': '6.2s' })}>
        <text className="im-sello llega" x={x + 9.5 * k} y={y - 14} textAnchor="middle">LLEGA</text>
      </g>
      <BroteAnda d={choca} dur={2.4} retardo={7.2} fin="choca" esc={1.5} />
      <g className="im-impacto" transform={`translate(${x + 6 * k} ${y + 1.5 * k})`}>
        <circle r="26" />
      </g>
      <g className="ir-aparece" style={v({ '--d': '9.8s' })}>
        <text className="im-sello choca" x={x + 5.5 * k} y={y + 7.8 * k} textAnchor="middle">CHOCA · SE DESCONECTA</text>
      </g>
      <text className="im-nota" x="480" y="500" textAnchor="middle">…y el siguiente vuelve a empezar desde la entrada</text>
    </svg>
  );
}

function E3() {
  const carta = (cx: number, titulo: string, d: number, Dibujo: () => ReactNode) => (
    <g className="ir-carta-gira" style={v({ '--d': `${d}s`, transformOrigin: `${cx}px 250px` })}>
      <rect className="im-tarjeta" x={cx - 135} y="60" width="270" height="360" rx="4" />
      <Dibujo />
      <text className="im-instr" x={cx} y="390" textAnchor="middle">{titulo}</text>
    </g>
  );
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      {carta(170, 'avanzar', 0.3, () => (
        <g>
          {[0, 1, 2].map((i) => <rect key={i} className="im-casilla" x={110 + i * 40} y="210" width="40" height="40" />)}
          <g className="im-avanza" style={v({ '--d': '1.2s' })}>
            <g transform="translate(130 230) rotate(90) scale(1.5)"><BroteArriba /></g>
          </g>
        </g>
      ))}
      {carta(480, 'girar izquierda', 2, () => (
        <g transform="translate(480 230)">
          <path className="im-arco" d="M-46 -10 A46 46 0 0 1 -10 -46" />
          <g className="im-gira izq" style={v({ '--d': '2.8s' })}><g transform="scale(1.9)"><BroteArriba /></g></g>
        </g>
      ))}
      {carta(790, 'girar derecha', 3.7, () => (
        <g transform="translate(790 230)">
          <path className="im-arco" d="M10 -46 A46 46 0 0 1 46 -10" />
          <g className="im-gira der" style={v({ '--d': '4.5s' })}><g transform="scale(1.9)"><BroteArriba /></g></g>
        </g>
      ))}
      <text className="im-nota" x="480" y="480" textAnchor="middle" style={v({ animationDelay: '6s' })}>
        una instrucción por línea · se cumplen en orden, de arriba abajo
      </text>
    </svg>
  );
}

/** Izquierda y derecha son las del brote: la flecha baja por la pantalla,
 *  gira a SU derecha y acaba yendo hacia la izquierda de quien mira. */
function ELado() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <g transform="translate(480 250)">
        {[-1, 0, 1].map((f) => [-1, 0, 1].map((c) => (
          <rect key={`${f}${c}`} className="im-casilla" x={c * 70 - 35} y={f * 70 - 35} width="70" height="70" />
        )))}
        {/* La flecha apunta hacia abajo; gira a SU derecha y queda mirando
            a la izquierda de la pantalla. */}
        <g className="im-lado-gira" style={v({ '--d': '2.6s' })}>
          <g transform="rotate(180) scale(3)"><BroteArriba /></g>
        </g>
      </g>
      <g className="ir-aparece" style={v({ '--d': '0.8s' })}>
        <text className="im-lado su" x="250" y="256" textAnchor="middle">su derecha</text>
        <text className="im-lado su" x="710" y="256" textAnchor="middle">su izquierda</text>
      </g>
      <g className="ir-aparece" style={v({ '--d': '1.6s' })}>
        <text className="im-lado tuya" x="250" y="284" textAnchor="middle">(tu izquierda)</text>
        <text className="im-lado tuya" x="710" y="284" textAnchor="middle">(tu derecha)</text>
      </g>
      <g className="ir-aparece" style={v({ '--d': '2.4s' })}>
        <rect className="ir-boton" x="370" y="400" width="220" height="50" rx="3" />
        <text className="ir-boton-t" x="480" y="432" textAnchor="middle">girar derecha</text>
      </g>
      <text className="im-nota" x="480" y="500" textAnchor="middle" style={v({ animationDelay: '4.6s' })}>
        piensen como la flecha: hacia donde apunta es «enfrente»
      </text>
    </svg>
  );
}

function E4() {
  const largo = ['avanzar', 'girar derecha', 'avanzar', 'girar derecha', 'avanzar', 'girar derecha', 'avanzar', 'girar derecha'];
  const corto: [string, number][] = [['repetir 4 veces', 0], ['avanzar', 1], ['girar derecha', 1], ['fin', 0]];
  const cuadro = 'M700 150 L840 150 L840 290 L700 290 Z';
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <g className="ir-codigo" transform="translate(30 40)">
        <rect width="260" height="300" rx="3" />
        {largo.map((l, i) => (
          <text key={i} x="22" y={36 + i * 32} className="im-largo" style={v({ '--i': i })}>
            <tspan className="n">{i + 1}</tspan> {l}
          </text>
        ))}
        <line className="im-tacha" x1="14" y1="20" x2="246" y2="282" />
      </g>
      <text className="im-cupo" x="160" y="378" textAnchor="middle">8 líneas</text>
      <path className="im-flecha" d="M305 190 L360 190" />
      <g className="ir-codigo" transform="translate(375 80)">
        <rect width="260" height="170" rx="3" />
        {corto.map(([l, s], i) => (
          <text key={i} className="ir-teclea" x={22 + s * 26} y={38 + i * 36} style={v({ '--d': `${2.6 + i * 0.7}s` })}>
            <tspan className="n">{i + 1}</tspan> <tspan className={l === 'avanzar' || l.startsWith('girar') ? '' : 'k'}>{l}</tspan>
          </text>
        ))}
      </g>
      <text className="im-cupo bien" x="505" y="290" textAnchor="middle">4 líneas</text>
      {/* La vuelta en la que va el ciclo: sube con cada lado del cuadro. */}
      {[1, 2, 3, 4].map((n) => (
        <text key={n} className="im-vuelta" x="505" y="340" textAnchor="middle" style={v({ '--d': `${5.6 + (n - 1) * 1.6}s` })}>
          vuelta {n} de 4
        </text>
      ))}
      <path className="im-cuadro" d={cuadro} />
      <g className="im-brote cuadro" style={v({ offsetPath: `path('${cuadro}')`, '--d': '5.6s' })}>
        <g style={{ transform: 'rotate(90deg) scale(1.4)' }}><BroteArriba /></g>
      </g>
    </svg>
  );
}

function E5() {
  const carta = (x: number, puesto: string, organo: string, lineas: string[], clase: string, d: number, desde: string) => (
    <g className="ir-desliza" style={v({ '--d': `${d}s`, '--desde': desde })}>
      <rect className={`ir-carta ${clase}`} x={x - 135} y="40" width="270" height="200" rx="3" />
      <rect className={`ir-carta-cab ${clase}`} x={x - 135} y="40" width="270" height="34" />
      <text className="ir-carta-t" x={x} y="63" textAnchor="middle">{puesto} · {organo}</text>
      {lineas.map((l, i) => <text key={i} className="ir-carta-l" x={x} y={112 + i * 30} textAnchor="middle">{l}</text>)}
    </g>
  );
  const hilos = [
    { d: 'M170 240 C170 330 400 330 480 380', t: '3.6s' },
    { d: 'M480 240 L480 380', t: '3.9s' },
    { d: 'M790 240 C790 330 560 330 480 380', t: '4.2s' },
  ];
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      {carta(170, 'DATOS', 'la memoria', ['el programa, vivo', 'el manual', 'la bitácora de viajes'], 'datos', 0.3, '-60px, 0px')}
      {carta(480, 'PANTALLA', 'el ojo', ['el laberinto', 'y el brote andando'], 'pantalla', 1.3, '0px, -50px')}
      {carta(790, 'TERMINAL', 'el nervio', ['escribe el programa', 'y lo lanza, a ciegas'], 'terminal', 2.3, '60px, 0px')}
      {hilos.map((h, i) => (
        <g key={i}>
          <path className="ir-hilo" d={h.d} style={v({ '--d': h.t })} pathLength={1} />
          <circle className="ir-viajera" r="6" style={v({ '--d': h.t, offsetPath: `path('${h.d}')` })} />
        </g>
      ))}
      <g className="ir-aparece" style={v({ '--d': '5s' })}>
        <rect className="ir-pizarra" x="280" y="380" width="400" height="100" rx="3" />
        <text className="ir-pizarra-t" x="480" y="412" textAnchor="middle">LA PIZARRA DEL EQUIPO</text>
        {['el camino', 'cuántas', 'qué lado', 'en orden'].map((p, i) => (
          <g key={p} className="ir-pieza" style={v({ '--d': `${5.6 + i * 0.5}s` })}>
            <rect x={296 + i * 93} y="430" width="85" height="30" rx="2" />
            <text x={338 + i * 93} y="450" textAnchor="middle">{p}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

const SEMILLERO_E6 = [
  '#######',
  '#E...##',
  '####.##',
  '####.S#',
  '#######',
];
const SETO_E6 = [
  '#######',
  '#E..#S#',
  '###.#.#',
  '#...*.#',
  '#######',
];
const SETO_LARGO_E6 = [
  '#########',
  '#E..#...#',
  '###.#.#.#',
  '#...#.#S#',
  '#.###.###',
  '#.....#.#',
  '#########',
];
function E6() {
  const kk = 38;
  const corto = ruta(90, 150, 40, [[1, 1], [1, 2], [1, 3], [1, 4], [2, 4], [3, 4], [3, 5]]);
  const anda = ruta(560, 150, kk, [[1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [4, 1], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [4, 5], [3, 5], [2, 5], [1, 5], [1, 6], [1, 7], [2, 7], [3, 7]]);
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <g className="ir-aparece" style={v({ '--d': '0.3s' })}>
        <rect className="ir-capa ir-enciende" x="40" y="40" width="380" height="70" rx="3" style={v({ '--d': '0.7s' })} />
        <text className="ir-capa-n" x="230" y="68" textAnchor="middle">CAPA 1 · EL SEMILLERO</text>
        <text className="ir-capa-l" x="230" y="92" textAnchor="middle">para calentar: corto y sin trampas</text>
        <MiniSeto plano={SEMILLERO_E6} x={90} y={150} k={40} />
        <BroteAnda d={corto} dur={3.4} retardo={1.2} />
      </g>
      <path className="ir-flecha" d="M440 250 L500 250" />
      <g className="ir-aparece" style={v({ '--d': '4.4s' })}>
        <rect className="ir-capa dos ir-enciende" x="520" y="40" width="400" height="70" rx="3" style={v({ '--d': '4.8s' })} />
        <text className="ir-capa-n" x="720" y="68" textAnchor="middle">CAPA 2 · EL SETO</text>
        <text className="ir-capa-l" x="720" y="92" textAnchor="middle">largo, y con espinas escondidas</text>
        <MiniSeto plano={SETO_LARGO_E6} x={560} y={150} k={kk} />
        <BroteAnda d={anda} dur={8} retardo={5.4} />
      </g>
      <g className="ir-aparece" style={v({ '--d': '9s' })}>
        <rect className="ir-boton ir-pulsa" x="380" y="440" width="200" height="54" rx="3" style={v({ '--d': '10.4s' })} />
        <text className="ir-boton-t" x="480" y="474" textAnchor="middle">&gt; lanzar</text>
      </g>
      <Cursor x={470} y={470} d="9.6s" />
    </svg>
  );
}

export const INTRO_MARANA: EscenaIntro[] = [
  {
    clave: 'pierna', dur: 10000, Dibujo: E1,
    titulo: 'La pierna izquierda',
    texto: <>Para entrar en la máquina hay que cruzar su <b>pierna izquierda</b>, y con los años se volvió una <b className="v">maraña</b> de raíces y circuitos. No hay camino abierto: tendrán que mandar algo que la cruce por ustedes.</>,
  },
  {
    clave: 'brote', dur: 12500, Dibujo: E2,
    titulo: 'Su brote',
    texto: <>Lo que mandan es un <b className="v">brote</b>: una flecha, como <b>Karel</b>, el robot con el que generaciones aprendieron a programar. Nace en la entrada y tiene que llegar a la salida. Si choca contra una pared, <b className="r">se desconecta</b> y el siguiente vuelve a empezar desde la entrada.</>,
  },
  {
    clave: 'sabe', dur: 11500, Dibujo: E3,
    titulo: 'Lo que sabe hacer',
    texto: <>El brote solo sabe tres cosas: <Kbd>avanzar</Kbd> una casilla, <Kbd>girar izquierda</Kbd> y <Kbd>girar derecha</Kbd>. Terminal se las escribe <b>una por línea</b> y lo manda con <Kbd>lanzar</Kbd>. El brote las cumple en orden, de arriba abajo, al pie de la letra. Esa lista es un <b className="v">programa</b>.</>,
  },
  {
    clave: 'lado', dur: 10500, Dibujo: ELado,
    titulo: 'Su izquierda, no la tuya',
    texto: <>Ojo: <b className="a">izquierda y derecha son las del brote</b>, hacia donde apunta la flecha. Si la flecha baja por la pantalla, su derecha es <b>la izquierda de quien la mira</b>. Pantalla tiene que pensar como el brote.</>,
  },
  {
    clave: 'equipo', dur: 12500, Dibujo: E5,
    titulo: 'Nadie lo tiene todo',
    texto: <>Pantalla ve el laberinto, Datos ve el programa completo, el manual y la bitácora, y Terminal escribe <b>a ciegas</b>. Para que el brote llegue tienen que platicarlo en voz alta: por dónde, cuántas casillas y hacia qué lado.</>,
  },
  {
    clave: 'capas', dur: 11000, Dibujo: E6,
    titulo: 'Dos capas',
    texto: <><b>El semillero</b> es para calentar: un camino corto y sin trampas. Luego viene <b className="a">el seto</b>: un camino tan largo que escrito paso a paso no cabe, y con espinas escondidas.</>,
  },
];

// ============================================================
//  AL LLEGAR AL SETO · la capa 2 de La Maraña
//
//  Sale sola a los tres puestos cuando cede el semillero. Dos ideas:
//    1. los ciclos: lo que se repite se escribe una vez;
//    2. las espinas: el plano no las enseña, Datos sabe dónde están.
// ============================================================

function EEspinas() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <MiniSeto plano={SETO_E6} x={340} y={110} k={40} />
      {/* La espina escondida: aparece cuando alguien la nombra. */}
      <g className="im-espina" transform="translate(520 250)" style={v({ '--d': '2.6s' })}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} d="M-3 0 L0 -16 L3 0 Z" transform={`rotate(${a})`} />)}
      </g>
      <text className="ir-capa-l" x="480" y="80" textAnchor="middle">en el plano, una espina parece camino</text>
      <text className="im-nota" x="480" y="400" textAnchor="middle" style={v({ animationDelay: '2.8s' })}>
        Datos sabe dónde están: columna en letra, fila en número
      </text>
    </svg>
  );
}

export const INTRO_SETO: EscenaIntro[] = [
  {
    clave: 'ciclos', dur: 14000, Dibujo: E4,
    titulo: 'Los ciclos',
    texto: <>En el seto el brote carga <b>solo 10 líneas</b>, y el camino es mucho más largo. Lo que se repite se escribe <b className="v">una sola vez</b> dentro de un <Kbd>repetir 4 veces</Kbd> … <Kbd>fin</Kbd>, y el ciclo lo repite por ustedes. Ocho líneas caben en cuatro.</>,
  },
  {
    clave: 'espinas', dur: 10000, Dibujo: EEspinas,
    titulo: 'Las espinas',
    texto: <>Hay más de un camino con forma de escalera, pero algunos tienen <b className="r">espinas</b> que el plano de Pantalla pinta como camino. <b>Datos sabe dónde están</b>. Antes de lanzar, crucen el camino con su tabla.</>,
  },
];

// ============================================================
//  EL BONUS · La Espesura
//
//  Sale al entrar en el bonus. Tres escenas para un solo mensaje: ya no se trata de
//  dictar un camino, sino de escribir UN programa que lleve a cuatro
//  brotes, desde cuatro esquinas, al mismo claro.
//    1. cuatro brotes, uno por esquina, el mismo programa, un claro;
//    2. el brote pregunta antes de moverse: sensores, `mientras`, `si`;
//    3. el camino más corto tiene una mina: Datos sabe dónde.
//  Ni un programa entero: las piezas sí, cómo se arman lo deciden ellos.
// ============================================================

/** Los colores de los cuatro brotes, los mismos que en el monitor. */
const TINTES = [
  { '--bt': '#3ddc97', '--bt-hi': '#b4f5d4' },
  { '--bt': '#fa39ba', '--bt-hi': '#ffd3ee' },
  { '--bt': '#4f86ee', '--bt-hi': '#c7d9ff' },
  { '--bt': '#e8b23a', '--bt-hi': '#fde7ad' },
];

const ESP_CUATRO = [
  '###########',
  '#E...#...E#',
  '#.#.###.#.#',
  '#.#.....#.#',
  '#.###S###.#',
  '#.#.....#.#',
  '#.#.###.#.#',
  '#E...#...E#',
  '###########',
];
function C1() {
  const k = 40, x = 260, y = 120;
  const caminos: [number, number][][] = [
    [[1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [3, 4], [3, 5], [4, 5]],
    [[1, 9], [1, 8], [1, 7], [2, 7], [3, 7], [3, 6], [3, 5], [4, 5]],
    [[7, 1], [7, 2], [7, 3], [6, 3], [5, 3], [5, 4], [5, 5], [4, 5]],
    [[7, 9], [7, 8], [7, 7], [6, 7], [5, 7], [5, 6], [5, 5], [4, 5]],
  ];
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <g className="ir-aparece" style={v({ '--d': '0.2s' })}>
        <rect className="ir-capa dos" x="280" y="26" width="400" height="56" rx="3" />
        <text className="ir-capa-n" x="480" y="52" textAnchor="middle">UN PROGRAMA · CUATRO BROTES</text>
        <text className="ir-capa-l" x="480" y="72" textAnchor="middle">uno en cada esquina, todos al mismo claro</text>
      </g>
      <MiniSeto plano={ESP_CUATRO} x={x} y={y} k={k} d0={0.6} oscuro />
      {caminos.map((cam, i) => (
        <g key={i} style={v(TINTES[i])}>
          <BroteAnda d={ruta(x, y, k, cam)} dur={3.4} retardo={2.4} esc={1.05} />
        </g>
      ))}
      <g className="ir-aparece" style={v({ '--d': '6.2s' })}>
        <text className="im-sello llega" x="480" y={y + 9.9 * k} textAnchor="middle">LOS CUATRO LLEGAN</text>
      </g>
      <text className="im-nota" x="480" y="508" textAnchor="middle" style={v({ animationDelay: '7.4s' })}>
        salen de sitios distintos: no hay un camino que dictar
      </text>
    </svg>
  );
}

function C2() {
  const k = 76, cx = 260, cy = 270;
  // Lo que tiene alrededor: pared enfrente y a la derecha, libre a la izquierda.
  const muros: [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, -1]];
  const rayos = [
    { d: `M${cx} ${cy - 22} L${cx} ${cy - k / 2}`, t: 'frente bloqueado', x: cx, y: cy - k * 1.5 - 16, libre: false, ret: 1, ancla: undefined },
    { d: `M${cx + 22} ${cy} L${cx + k / 2} ${cy}`, t: 'derecha bloqueada', x: cx + k * 1.5 + 70, y: cy + 5, libre: false, ret: 2, ancla: undefined },
    { d: `M${cx - 22} ${cy} L${cx - k * 1.4} ${cy}`, t: 'izquierda libre', x: cx - k * 1.4 - 14, y: cy + 5, libre: true, ret: 3, ancla: 'end' as const },
  ];
  const piezas = ['frente libre', 'izquierda libre', 'derecha bloqueada', 'repetir mientras …', 'si … sino … fin'];
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      {muros.map(([df, dc]) => (
        <rect key={`${df},${dc}`} className="im-muro" x={cx + dc * k - k / 2} y={cy + df * k - k / 2} width={k} height={k} rx={k * 0.18}
              style={v({ '--d': `${0.2 + (df + dc + 2) * 0.08}s` })} />
      ))}
      {rayos.map((r) => (
        <g key={r.t} className="ir-aparece" style={v({ '--d': `${r.ret}s` })}>
          <path className={`im-rayo${r.libre ? ' libre' : ''}`} d={r.d} />
          <text className={`im-sensor${r.libre ? ' libre' : ''}`} x={r.x} y={r.y} textAnchor={r.ancla ?? 'middle'}>{r.t}</text>
        </g>
      ))}
      <g transform={`translate(${cx} ${cy})`}>
        <g className="im-decide-anda">
          <g className="im-decide-gira"><g style={{ transform: 'scale(2.2)', color: 'var(--clorofila-hi)' }}><BroteArriba /></g></g>
        </g>
      </g>
      <text className="im-nota" x={cx} y="490" textAnchor="middle" style={v({ animationDelay: '5.6s' })}>
        …y gira hacia donde está libre
      </text>

      <g className="ir-aparece" style={v({ '--d': '6.4s' })}>
        <rect className="ir-pizarra" x="560" y="90" width="360" height="340" rx="3" />
        <text className="ir-pizarra-t" x="740" y="124" textAnchor="middle">LO QUE EL BROTE YA ENTIENDE</text>
        {piezas.map((p, i) => (
          <g key={p} className="ir-pieza" style={v({ '--d': `${7 + i * 0.5}s` })}>
            <rect x="590" y={150 + i * 52} width="300" height="38" rx="2" />
            <text x="740" y={174 + i * 52} textAnchor="middle">{p}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

const ESP_MINA = [
  '#########',
  '#E.....S#',
  '#.#####.#',
  '#.......#',
  '#########',
];
function C3() {
  const k = 40, y = 170, xa = 40, xb = 560;
  const corto = ruta(xa, y, k, [[1, 1], [1, 2], [1, 3], [1, 4]]);
  const largo = ruta(xb, y, k, [[1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7], [2, 7], [1, 7]]);
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <text className="ir-capa-n" x={xa + 4.5 * k} y="130" textAnchor="middle">POR LO MÁS CORTO</text>
      <MiniSeto plano={ESP_MINA} x={xa} y={y} k={k} oscuro />
      <BroteAnda d={corto} dur={1.6} retardo={0.8} fin="choca" esc={1.3} />
      <g className="im-espina" transform={`translate(${xa + 4.5 * k} ${y + 1.5 * k})`} style={v({ '--d': '2.4s' })}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} d="M-3 0 L0 -16 L3 0 Z" transform={`rotate(${a})`} />)}
      </g>
      <g className="ir-aparece" style={v({ '--d': '2.8s' })}>
        <text className="im-sello choca" x={xa + 4.5 * k} y={y + 5.6 * k} textAnchor="middle">UNA MINA</text>
      </g>

      <path className="ir-flecha" d="M420 270 L540 270" />
      <g className="ir-aparece" style={v({ '--d': '3.6s' })}>
        <text className="ir-capa-n" x={xb + 4.5 * k} y="130" textAnchor="middle">POR LA PARED</text>
        <MiniSeto plano={ESP_MINA} x={xb} y={y} k={k} d0={3.8} oscuro />
      </g>
      <BroteAnda d={largo} dur={4.2} retardo={4.6} esc={1.3} />
      <g className="ir-aparece" style={v({ '--d': '9s' })}>
        <text className="im-sello llega" x={xb + 4.5 * k} y={y + 5.6 * k} textAnchor="middle">LLEGA</text>
      </g>
      <text className="im-nota" x="480" y="480" textAnchor="middle" style={v({ animationDelay: '9.6s' })}>
        el camino más corto siempre tiene una mina · Datos sabe dónde
      </text>
    </svg>
  );
}

export const INTRO_ESPESURA: EscenaIntro[] = [
  {
    clave: 'cuatro', dur: 12500, Dibujo: C1,
    titulo: 'Cuatro brotes, un claro',
    texto: <>La espesura es <b>el doble de grande</b> y ahora salen <b className="v">cuatro brotes</b> a la vez, uno en cada esquina, con <b>el mismo programa</b>. Los cuatro tienen que llegar al claro del centro <b className="a">en el mismo lanzamiento</b>.</>,
  },
  {
    clave: 'decide', dur: 13000, Dibujo: C2,
    titulo: 'Que el brote decida',
    texto: <>Como salen de sitios distintos, no hay camino que dictar. El brote ahora puede <b className="v">preguntar</b> antes de moverse: si tiene libre el frente, la izquierda o la derecha. Con <Kbd>repetir mientras</Kbd> y <Kbd>si … sino</Kbd> decide solo a cada paso.</>,
  },
  {
    clave: 'minas', dur: 12500, Dibujo: C3,
    titulo: 'Lo corto tiene minas',
    texto: <>El camino más corto de cada brote pasa por una <b className="r">mina</b> que ni Pantalla ni los sensores ven: <b>Datos sabe dónde</b>, y en <Kbd>crecimiento</Kbd> cómo creció la espesura. No cambia: lo que alumbren los brotes <b className="v">se queda encendido</b>.</>,
  },
];
