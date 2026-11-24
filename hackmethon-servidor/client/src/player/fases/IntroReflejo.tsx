import type { CSSProperties, ReactNode } from 'react';
import { PARTES, type ParteClave } from '../../lib/anatomia';
import { Silueta } from './Membrana';
import type { EscenaIntro } from './IntroFase';

// ============================================================
//  LA INTRODUCCIÓN DE LA FASE 1 · El Reflejo
//
//  Seis escenas que cuentan, casi sin leer, qué hay que hacer:
//    1. dónde estamos: la rodilla y su membrana;
//    2. quién es quién: esporas, anticuerpos, rutina;
//    3. el problema: la defensa de la pierna deja fuera a las esporas;
//    4. la solución: quitarla y escribir filtros que descarten;
//    5. cómo se juega: nadie lo tiene todo;
//    6. probar, desplegar y las dos capas.
//
//  Va en español de México (ustedes, nunca vosotros): es el de la sala.
//  Es la misma lámina que el juego —los mismos programas, la misma
//  membrana, el mismo duotono—, pero en pizarra: nada de lo que sale aquí
//  son datos de la partida. Ni nombres, ni valores, ni la solución.
// ============================================================

const v = (o: Record<string, string | number>) => o as CSSProperties;

/** Esporas flotando en el aire de cada escena: la máquina está viva aunque
 *  no pase nada. Con posiciones fijas, para que no salten entre escenas. */
const MOTAS = Array.from({ length: 22 }, (_, i) => ({
  x: (i * 211) % 940 + 10, y: (i * 137) % 480 + 20, r: 1.2 + (i % 3) * 0.7, d: (i % 7) * 0.9, t: 7 + (i % 5) * 1.6,
}));
export function Motas() {
  return (
    <g className="ir-motas" aria-hidden="true">
      {MOTAS.map((m, i) => (
        <circle key={i} cx={m.x} cy={m.y} r={m.r} style={v({ animationDelay: `${-m.d}s`, animationDuration: `${m.t}s` })} />
      ))}
    </g>
  );
}

/** Un programa de la intro: la misma figura que en la cámara, con su
 *  papel en el color, y espinas si es anticuerpo. `anda` le mueve las
 *  patas; si no, respira en su sitio. */
function Prog({ x, y, rol, esc = 1, clase = '', estilo, anda = false }: {
  x: number; y: number; rol: 'espora' | 'anti' | 'rutina'; esc?: number; clase?: string; estilo?: CSSProperties; anda?: boolean;
}) {
  return (
    <g className={`ir-prog ${rol} ${clase}`} style={{ ...estilo, transform: `translate(${x}px, ${y}px) scale(${esc})` }}>
      <g className={`ir-prog-cuerpo ${anda ? 'anda' : 'respira'}`}>
        <Silueta nuevo={rol === 'espora'} />
        {rol === 'anti' && (
          <g className="ir-espinas">
            {[-56, -44, -32, -20].map((yy) => (
              <g key={yy}>
                <path d={`M-17 ${yy} L-24 ${yy + 3} L-17 ${yy + 6} Z`} />
                <path d={`M17 ${yy} L24 ${yy + 3} L17 ${yy + 6} Z`} />
              </g>
            ))}
          </g>
        )}
      </g>
    </g>
  );
}

/** La membrana en pizarra: dos pilares, la rótula y las raíces. */
function MiniMembrana({ x, y, esc = 1, abierta = false, alarma = false, clase = '' }: {
  x: number; y: number; esc?: number; abierta?: boolean; alarma?: boolean; clase?: string;
}) {
  return (
    <g className={`ir-mem ${abierta ? 'abierta' : ''} ${alarma ? 'alarma' : ''} ${clase}`} transform={`translate(${x} ${y}) scale(${esc})`}>
      <rect className="ir-pilar mec" x="-46" y="-110" width="16" height="110" />
      <path className="ir-pilar org" d="M30 -110 C28 -80 34 -50 31 -20 L32 0 L46 0 C48 -30 44 -70 46 -110 Z" />
      <path className="ir-rotula" d="M-56 -106 Q0 -178 56 -106 L42 -106 Q0 -150 -42 -106 Z" />
      <g className="ir-raices">
        {[-24, -12, 0, 12, 24].map((dx, i) => (
          <path key={dx} className="ir-raiz" pathLength={1} style={v({ '--i': i, transformOrigin: `${dx}px -116px` })}
                d={`M${dx} -116 C${dx + 8} -90 ${dx - 8} -60 ${dx + 4} -30 S${dx - 4} -6 ${dx} 0`} />
        ))}
      </g>
    </g>
  );
}

/** El robot del lobby, entero, con una parte encendida. */
export function Robot({ x, y, alto, enciende, marchita = false }: { x: number; y: number; alto: number; enciende: ParteClave; marchita?: boolean }) {
  const k = alto / 760;
  return (
    <g className="ir-flota">
      <g transform={`translate(${x} ${y}) scale(${k}) translate(-104 -14)`} className={`ir-robot${marchita ? ' marchita' : ''}`}>
        {(Object.keys(PARTES) as ParteClave[]).map((c) => (
          <path key={c} d={PARTES[c].d} className={c === enciende ? 'enciende' : ''} />
        ))}
      </g>
    </g>
  );
}

/** El cursor que hace clic: llega, pulsa y deja un aro. */
export function Cursor({ x, y, d }: { x: number; y: number; d: string }) {
  return (
    <g className="ir-cursor" style={v({ '--x': `${x}px`, '--y': `${y}px`, '--d': d })}>
      <circle className="ir-clic" r="16" />
      <path d="M0 0 L0 22 L6 16 L10 26 L14 24 L10 14 L18 14 Z" />
    </g>
  );
}

// ---------- las escenas ----------

function E1() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <Robot x={170} y={40} alto={440} enciende="pierna-der" />
      {/* El escáner baja por el robot y se para en la rodilla. */}
      <rect className="ir-escaner" x="150" y="40" width="200" height="6" />
      {/* La lupa: de la rodilla a la membrana. */}
      <circle className="ir-lupa-origen" cx="248" cy="355" r="20" />
      <circle className="ir-lupa-onda" cx="248" cy="355" r="20" />
      <path className="ir-lupa-haz" d="M266 345 L560 120 M266 365 L560 470" />
      <circle className="ir-lupa" cx="690" cy="295" r="175" />
      <g className="ir-aparece" style={v({ '--d': '2.2s' })}>
        <MiniMembrana x={690} y={380} esc={1.25} />
      </g>
      <g className="ir-aparece" style={v({ '--d': '4.6s' })}>
        <Prog x={600} y={380} rol="rutina" esc={0.8} anda clase="ir-se-asoma" />
      </g>
      <text className="ir-rotulo" x="690" y="96" textAnchor="middle">LA RODILLA</text>
    </svg>
  );
}

function E2() {
  const col = (x: number, rol: 'espora' | 'anti' | 'rutina', titulo: string, verbo: string, d: number) => (
    <g className="ir-carta-gira" style={v({ '--d': `${d}s`, transformOrigin: `${x}px 250px` })}>
      <rect className={`ir-tarjeta ${rol}`} x={x - 130} y="60" width="260" height="380" rx="4" />
      <g className="ir-trio">
        {[-50, 0, 50].map((dx, k) => (
          <Prog key={dx} x={x + dx} y={k === 1 ? 262 : 250} rol={rol} esc={k === 1 ? 1.5 : 1.3}
                clase="ir-llega" estilo={v({ '--k': k, '--d': `${d + 0.5 + k * 0.25}s` })} anda />
        ))}
      </g>
      <text className={`ir-titulo ${rol}`} x={x} y="320" textAnchor="middle">{titulo}</text>
      <text className={`ir-verbo ${rol} ir-sello`} x={x} y="375" textAnchor="middle" style={v({ '--d': `${d + 1.4}s` })}>{verbo}</text>
    </g>
  );
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      {col(180, 'espora', 'ESPORAS', 'PASAN', 0.3)}
      {col(480, 'anti', 'ANTICUERPOS', 'CAEN', 2.3)}
      {col(780, 'rutina', 'RUTINA', 'SIGUE PASANDO', 4.3)}
    </svg>
  );
}

/** La fila de programas que cruza un filtro. `caen` dice qué papeles
 *  atrapa el filtro: los atrapados chocan, rebotan y caen; el resto sigue
 *  hasta la membrana. */
function Fila({ caen, y0 = 330, filtroX = 470, tono }: { caen: ('espora' | 'anti' | 'rutina')[]; y0?: number; filtroX?: number; tono: 'defensa' | 'vuestro' }) {
  const orden: ('espora' | 'anti' | 'rutina')[] = ['anti', 'espora', 'rutina', 'anti', 'espora', 'anti', 'rutina', 'espora'];
  return (
    <g>
      <rect className={`ir-filtro ${tono}`} x={filtroX - 18} y={y0 - 120} width="36" height="140" />
      <rect className={`ir-filtro-barrido ${tono}`} x={filtroX - 18} y={y0 - 120} width="36" height="10" />
      {orden.map((rol, i) => {
        const cae = caen.includes(rol);
        return (
          <Prog key={i} x={0} y={y0} rol={rol} anda clase={`ir-anda ${cae ? 'cae' : 'pasa'}`}
                estilo={v({ '--k': i, '--filtro': `${filtroX}px`, '--y0': `${y0}px` })} />
        );
      })}
    </g>
  );
}

function E3() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <text className="ir-etq defensa" x="470" y="186" textAnchor="middle">DEFENSA DE LA PIERNA</text>
      <Fila caen={['espora']} tono="defensa" />
      <MiniMembrana x={840} y={350} esc={0.9} alarma />
      <text className="ir-aviso" x="470" y="470" textAnchor="middle">sus esporas se quedan afuera… y los anticuerpos entran</text>
    </svg>
  );
}

function E4() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <g className="ir-codigo" transform="translate(30 30)">
        <rect width="500" height="170" rx="3" />
        <text x="18" y="34"><tspan className="k">para cada</tspan> programa:</text>
        <g className="ir-tachada">
          <text x="38" y="66"><tspan className="k">si</tspan> &lt;defensa de la pierna&gt; <tspan className="d">→ descartar</tspan></text>
          <line x1="34" y1="61" x2="380" y2="61" />
          {[60, 110, 160, 210, 260, 310, 360].map((px, i) => (
            <rect key={px} className="ir-ceniza" x={px} y="56" width="5" height="5" style={v({ '--i': i })} />
          ))}
        </g>
        <text className="ir-teclea" x="38" y="98" style={v({ '--d': '2.6s' })}><tspan className="k">si</tspan> &lt;lo que tienen los anticuerpos&gt; <tspan className="d">→ descartar</tspan></text>
        <text className="ir-teclea" x="38" y="128" style={v({ '--d': '4.2s' })}><tspan className="k">si</tspan> &lt;…y lo que les falta&gt; <tspan className="d">→ descartar</tspan></text>
        <rect className="ir-caret" x="38" y="140" width="9" height="16" />
        <text x="38" y="156" className="p"><tspan>dejar pasar</tspan></text>
      </g>
      <g className="ir-tarde">
        <text className="ir-etq vuestro" x="620" y="385" textAnchor="middle">SUS FILTROS</text>
        <Fila caen={['anti']} tono="vuestro" filtroX={620} />
        <MiniMembrana x={880} y={350} esc={0.9} abierta />
        <g className="ir-chispas" transform="translate(880 260)">
          {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d="M0 -5 L4 0 L0 5 L-4 0 Z" style={v({ '--i': i })} />)}
        </g>
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
      {carta(170, 'DATOS', 'la memoria', ['el registro y el encargo', 'qué es cada programa', 'las corridas de `probar`'], 'datos', 0.3, '-60px, 0px')}
      {carta(480, 'PANTALLA', 'el ojo', ['la cámara de la membrana', 'de dónde viene', 'cada programa'], 'pantalla', 1.3, '0px, -50px')}
      {carta(790, 'TERMINAL', 'el nervio', ['escribe el flujo a ciegas', 'y pide las firmas'], 'terminal', 2.3, '60px, 0px')}
      {hilos.map((h, i) => (
        <g key={i}>
          <path className="ir-hilo" d={h.d} style={v({ '--d': h.t })} pathLength={1} />
          {/* La pieza que viaja por el hilo hasta la pizarra. */}
          <circle className="ir-viajera" r="6" style={v({ '--d': h.t, offsetPath: `path('${h.d}')` })} />
        </g>
      ))}
      <g className="ir-aparece" style={v({ '--d': '5s' })}>
        <rect className="ir-pizarra" x="280" y="380" width="400" height="100" rx="3" />
        <text className="ir-pizarra-t" x="480" y="412" textAnchor="middle">LA PIZARRA DEL EQUIPO</text>
        {['tipo', 'permisos', 'origen', 'firma', 'qué es'].map((p, i) => (
          <g key={p} className="ir-pieza" style={v({ '--d': `${5.6 + i * 0.5}s` })}>
            <rect x={296 + i * 74} y="430" width="68" height="30" rx="2" />
            <text x={330 + i * 74} y="450" textAnchor="middle">{p}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function E6() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <g className="ir-aparece" style={v({ '--d': '0.3s' })}>
        <rect className="ir-boton ir-pulsa" x="60" y="60" width="200" height="54" rx="3" style={v({ '--d': '1.6s' })} />
        <text className="ir-boton-t" x="160" y="94" textAnchor="middle">&gt; probar</text>
        <text className="ir-nota" x="160" y="140" textAnchor="middle">gratis: guarda una corrida</text>
        <g className="ir-tabla" transform="translate(40 170)">
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i} className="ir-fila" style={v({ '--d': `${2.1 + i * 0.3}s` })}>
              <rect y={i * 34} width="240" height="28" />
              <text x="12" y={i * 34 + 19}>R1 · {['PASA', 'CAE', 'PASA', 'CAE', 'PASA'][i]}</text>
            </g>
          ))}
        </g>
      </g>
      <g className="ir-aparece" style={v({ '--d': '4s' })}>
        <rect className="ir-boton fuerte ir-pulsa" x="360" y="60" width="200" height="54" rx="3" style={v({ '--d': '5.6s' })} />
        <text className="ir-boton-t" x="460" y="94" textAnchor="middle">&gt; desplegar</text>
        <text className="ir-nota" x="460" y="140" textAnchor="middle">en serio: si falla, cuarentena</text>
        <Robot x={400} y={170} alto={300} enciende="pierna-der" marchita />
        <g className="ir-hojas" transform="translate(452 400)">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <path key={i} d="M0 -5 L4 0 L0 5 L-4 0 Z" style={v({ '--i': i })} />)}
        </g>
      </g>
      <Cursor x={150} y={92} d="1s" />
      <Cursor x={450} y={92} d="5s" />
      <g className="ir-aparece" style={v({ '--d': '8s' })}>
        <rect className="ir-capa ir-enciende" x="650" y="90" width="260" height="70" rx="3" style={v({ '--d': '8.4s' })} />
        <text className="ir-capa-n" x="780" y="118" textAnchor="middle">CAPA 1 · LA RÓTULA</text>
        <text className="ir-capa-l" x="780" y="142" textAnchor="middle">entrar</text>
        <path className="ir-flecha" d="M780 168 L780 208" />
        <rect className="ir-capa dos ir-enciende" x="650" y="214" width="260" height="70" rx="3" style={v({ '--d': '9.4s' })} />
        <text className="ir-capa-n" x="780" y="242" textAnchor="middle">CAPA 2 · LA MUDA</text>
        <text className="ir-capa-l" x="780" y="266" textAnchor="middle">la pierna se defiende</text>
      </g>
    </svg>
  );
}

export const Kbd = ({ children }: { children: ReactNode }) => <code className="ir-kbd">{children}</code>;

export const INTRO_REFLEJO: EscenaIntro[] = [
  {
    clave: 'pierna', dur: 10000, Dibujo: E1,
    titulo: 'La pierna derecha',
    texto: <>Cruzaron la maraña: ya están dentro de la pierna derecha de la máquina. Su rodilla tiene un <b>sistema inmune</b>: una membrana de raíces que decide qué programas entran.</>,
  },
  {
    clave: 'quien', dur: 12500, Dibujo: E2,
    titulo: 'Quién es quién',
    texto: <>Las <b className="v">esporas</b> son de ustedes: tienen que <b className="v">pasar</b>. Los <b className="r">anticuerpos</b> son de la pierna: tienen que <b className="r">caer</b>, o van a secar las esporas. Y la <b>rutina</b> tiene que seguir pasando, para que la pierna no sospeche.</>,
  },
  {
    clave: 'defensa', dur: 11000, Dibujo: E3,
    titulo: 'El problema',
    texto: <>El flujo de la membrana ya trae una <b className="a">defensa de la propia pierna</b>… y es justo la que deja afuera a sus esporas.</>,
  },
  {
    clave: 'filtros', dur: 13500, Dibujo: E4,
    titulo: 'Reescriban el flujo',
    texto: <>Quiten la defensa con <Kbd>quitar 1</Kbd> y escriban sus propios filtros con <Kbd>filtrar si …</Kbd>. Cada filtro <b>descarta</b> lo que cumple su condición: que caigan los anticuerpos y pase todo lo demás.</>,
  },
  {
    clave: 'equipo', dur: 12500, Dibujo: E5,
    titulo: 'Nadie lo tiene todo',
    texto: <>Cada puesto ve solo una parte. Para escribir un buen filtro tienen que juntar las piezas en voz alta: el tipo, los permisos, de dónde viene, la firma y qué es cada programa.</>,
  },
  {
    clave: 'desplegar', dur: 13000, Dibujo: E6,
    titulo: 'Probar y desplegar',
    texto: <><Kbd>probar</Kbd> es gratis y guarda una corrida en la base de datos. <Kbd>desplegar</Kbd> lo aplica en serio. Son dos capas: en la segunda, la pierna se defiende.</>,
  },
];
