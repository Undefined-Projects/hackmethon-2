import type { CSSProperties } from 'react';
import { Kbd, Motas, Robot } from './IntroReflejo';
import type { EscenaIntro } from './IntroFase';

// ============================================================
//  LA INTRODUCCIÓN DE LA FASE 4 · La Mano
//
//  Al entrar (las falanges):
//    1. la mano derecha es la que ofrece, y guarda todo en listas;
//    2. una lista: cosas en fila, y a cada una se llega por su índice,
//       que empieza en CERO;
//    3. una lista de listas: dos índices, mano[dedo][falange];
//    4. el tipo de dato: el mismo «10» se ordena distinto como número
//       que como texto;
//    5. nadie lo tiene todo: Datos tiene los tipos, Pantalla una cara cada
//       vez (el frente o el reverso), Terminal mueve a ciegas.
//  Al llegar a los tendones (INTRO_TENDONES):
//    1. ordenar por dos criterios: primero el dedo, luego la tensión;
//    2. ordenar cuesta: planear antes de mover.
// ============================================================

const v = (o: Record<string, string | number>) => o as CSSProperties;
const caja = (x: number, y: number, w: number, h: number, txt: string, cls = '', d?: string) => (
  <g className={d ? 'ir-aparece' : ''} style={d ? v({ '--d': d }) : undefined}>
    <rect className={`imn-caja ${cls}`} x={x} y={y} width={w} height={h} rx="3" />
    <text className="imn-valor" x={x + w / 2} y={y + h / 2 + 8} textAnchor="middle">{txt}</text>
  </g>
);

function E1() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <Robot x={170} y={40} alto={440} enciende="brazo-der" />
      <g className="ir-aparece" style={v({ '--d': '1.6s' })}>
        <text className="ir-rotulo" x="700" y="120" textAnchor="middle">EL BRAZO DERECHO</text>
        <text className="imn-codigo" x="700" y="250" textAnchor="middle">mano = [ [4,7,2], [9,1,6], … ]</text>
      </g>
      <text className="im-nota" x="700" y="440" textAnchor="middle" style={v({ animationDelay: '3s' })}>
        la mano que ofrece guarda todo en listas
      </text>
    </svg>
  );
}

function E2() {
  const valores = [7, 3, 9, 2, 5];
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <text className="imn-codigo" x="480" y="110" textAnchor="middle">agarre = [7, 3, 9, 2, 5]</text>
      {valores.map((x, i) => (
        <g key={i}>
          {caja(230 + i * 104, 180, 88, 88, String(x), i === 0 ? 'cero' : '', `${0.6 + i * 0.3}s`)}
          <text className="imn-indice" x={274 + i * 104} y="310" textAnchor="middle">{i}</text>
        </g>
      ))}
      <g className="ir-aparece" style={v({ '--d': '2.6s' })}>
        <path className="imn-flecha" d="M274 380 L274 330" />
        <text className="imn-aviso" x="274" y="410" textAnchor="middle">el primero es el 0</text>
      </g>
      <text className="im-nota" x="480" y="480" textAnchor="middle" style={v({ animationDelay: '4s' })}>
        agarre[1] es el SEGUNDO: 3
      </text>
    </svg>
  );
}

function E3() {
  const mano = [[4, 7, 2], [9, 1, 6], [3, 8, 5], [7, 2, 9], [1, 6, 4]];
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      {mano.map((dedo, d) => (
        <g key={d}>
          <text className="imn-indice" x={250 + d * 110} y="60" textAnchor="middle">{d}</text>
          {dedo.map((x, f) => caja(212 + d * 110, 330 - f * 92, 76, 76, String(x), d === 3 && f === 2 ? 'cero' : '', `${0.3 + d * 0.2}s`))}
        </g>
      ))}
      {[0, 1, 2].map((f) => <text key={f} className="imn-indice chico" x="180" y={376 - f * 92} textAnchor="end">{f}</text>)}
      <g className="ir-aparece" style={v({ '--d': '2.6s' })}>
        <text className="imn-codigo" x="480" y="470" textAnchor="middle">mano[3][2] = 9   ·   dedo 3, falange 2</text>
      </g>
    </svg>
  );
}

function E4() {
  const carta = (x: number, puesto: string, lineas: string[], clase: string, d: string) => (
    <g className="ir-aparece" style={v({ '--d': d })}>
      <rect className={`ir-carta ${clase}`} x={x - 135} y="80" width="270" height="200" rx="3" />
      <rect className={`ir-carta-cab ${clase}`} x={x - 135} y="80" width="270" height="34" />
      <text className="ir-carta-t" x={x} y="103" textAnchor="middle">{puesto}</text>
      {lineas.map((l, i) => <text key={i} className="ir-carta-l" x={x} y={152 + i * 30} textAnchor="middle">{l}</text>)}
    </g>
  );
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      {carta(170, 'DATOS', ['el TIPO', 'de cada dedo:', 'numero o texto'], 'datos', '0.3s')}
      {carta(480, 'PANTALLA', ['una cara a la vez:', 'FRENTE o REVERSO'], 'pantalla', '1.2s')}
      {carta(790, 'TERMINAL', ['mueve a ciegas:', 'intercambiar 2 0 2'], 'terminal', '2.1s')}
      <text className="im-nota" x="480" y="400" textAnchor="middle" style={v({ animationDelay: '3.4s' })}>
        el reverso se ve en espejo: el pulgar queda del otro lado
      </text>
    </svg>
  );
}

function ETipo() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <text className="ir-capa-n" x="250" y="90" textAnchor="middle">COMO NÚMERO</text>
      {['2', '9', '10'].map((x, i) => caja(115 + i * 92, 140, 78, 78, x))}
      <text className="imn-aviso" x="250" y="270" textAnchor="middle">2 &lt; 9 &lt; 10</text>
      <g className="ir-aparece" style={v({ '--d': '1.8s' })}>
        <text className="ir-capa-n" x="710" y="90" textAnchor="middle">COMO TEXTO</text>
        {['"10"', '"2"', '"9"'].map((x, i) => caja(575 + i * 92, 140, 78, 78, x, 'cero'))}
        <text className="imn-aviso" x="710" y="270" textAnchor="middle">"10" &lt; "2" &lt; "9"</text>
      </g>
      <text className="im-nota" x="480" y="380" textAnchor="middle" style={v({ animationDelay: '3.2s' })}>
        como texto se compara carácter por carácter: "1" va antes que "2"
      </text>
    </svg>
  );
}

export const INTRO_MANO: EscenaIntro[] = [
  {
    clave: 'mano', dur: 9000, Dibujo: E1,
    titulo: 'La mano derecha',
    texto: <>Es la mano con la que la máquina <b className="v">ofrece</b> cosas. Para desarmarla hay que entender cómo las guarda: en <b className="a">listas</b>.</>,
  },
  {
    clave: 'lista', dur: 10500, Dibujo: E2,
    titulo: 'Una lista',
    texto: <>Una lista guarda cosas en fila, y a cada una se llega por su <b className="a">índice</b>. Ojo: se cuenta desde <b className="r">cero</b>. El primero es el 0; el segundo, el 1.</>,
  },
  {
    clave: 'listas', dur: 10500, Dibujo: E3,
    titulo: 'Una lista de listas',
    texto: <>La mano es una lista de cinco dedos, y cada dedo es una lista de tres falanges. Para llegar a una hacen falta <b className="a">dos índices</b>: <Kbd>mano[dedo][falange]</Kbd>. La base es la 0 y la punta, la 2.</>,
  },
  {
    clave: 'tipo', dur: 11000, Dibujo: ETipo,
    titulo: 'El tipo de dato',
    texto: <>Cada falange tiene un número en el <b>frente</b> y un texto en el <b>reverso</b>. Hay que ordenar cada dedo de la base a la punta, y <b className="a">cómo</b> depende de su tipo: como número, 9 va antes que 10; como <b className="r">texto</b>, "10" va antes que "9".</>,
  },
  {
    clave: 'equipo', dur: 10000, Dibujo: E4,
    titulo: 'Nadie lo tiene todo',
    texto: <>Datos tiene el <b>tipo</b> de cada dedo, Pantalla ve <b>una cara a la vez</b> (Terminal cambia la cámara) y Terminal mueve falanges a ciegas: <Kbd>intercambiar 2 0 2</Kbd>. Antes de <Kbd>apretar</Kbd>, <Kbd>probar</Kbd> es gratis.</>,
  },
];

// ---------- al llegar a los tendones ----------

function T1() {
  const antes = [['K', 'medio'], ['B', 'pulgar'], ['G', 'medio'], ['A', 'pulgar']];
  const despues = [['B', 'pulgar'], ['A', 'pulgar'], ['G', 'medio'], ['K', 'medio']];
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <text className="ir-capa-n" x="250" y="90" textAnchor="middle">REVUELTOS</text>
      {antes.map(([l, d], i) => (
        <g key={`a${i}`}>{caja(90 + i * 84, 150, 70, 70, l)}<text className="imn-indice chico" x={125 + i * 84} y="250" textAnchor="middle">{d}</text></g>
      ))}
      <path className="ir-flecha" d="M450 185 L510 185" />
      <g className="ir-aparece" style={v({ '--d': '1.8s' })}>
        <text className="ir-capa-n" x="710" y="90" textAnchor="middle">ORDENADOS</text>
        {despues.map(([l, d], i) => (
          <g key={`d${i}`}>{caja(550 + i * 84, 150, 70, 70, l, 'cero')}<text className="imn-indice chico" x={585 + i * 84} y="250" textAnchor="middle">{d}</text></g>
        ))}
      </g>
      <text className="im-nota" x="480" y="380" textAnchor="middle" style={v({ animationDelay: '3s' })}>
        primero por dedo · dentro de cada dedo, por tensión
      </text>
    </svg>
  );
}

function T2() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      {['C', 'A', 'B'].map((l, i) => caja(330 + i * 110, 170, 90, 90, l, i === 1 ? 'cero' : ''))}
      <g className="ir-aparece" style={v({ '--d': '1.2s' })}>
        <path className="imn-flecha" d="M375 290 Q430 340 485 290" />
        <text className="imn-aviso" x="430" y="370" textAnchor="middle">intercambiar 0 1</text>
      </g>
      <text className="im-nota" x="480" y="450" textAnchor="middle" style={v({ animationDelay: '2.6s' })}>
        cada intercambio gasta · un buen intercambio deja a uno en su lugar final
      </text>
    </svg>
  );
}

export const INTRO_TENDONES: EscenaIntro[] = [
  {
    clave: 'orden', dur: 10000, Dibujo: T1,
    titulo: 'Ordenar con dos criterios',
    texto: <>Doce tendones revueltos. Para soltar la mano tienen que quedar <b className="a">primero por dedo</b> y, dentro de cada dedo, <b className="a">por tensión</b>, de menor a mayor. Pantalla ve las letras; Datos, a qué dedo va cada una y cuánto tira.</>,
  },
  {
    clave: 'costo', dur: 10000, Dibujo: T2,
    titulo: 'Ordenar cuesta',
    texto: <>Cada <Kbd>intercambiar i j</Kbd> gasta del presupuesto, y no alcanza para mover a lo loco. <b className="v">Planeen antes de mover</b>: busquen qué va en la posición 0 y llévenlo ahí; luego la 1, y así.</>,
  },
];
