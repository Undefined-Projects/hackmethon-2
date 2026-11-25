import type { CSSProperties } from 'react';
import { Kbd, Motas, Robot } from './IntroReflejo';
import type { EscenaIntro } from './IntroFase';

// ============================================================
//  LA INTRODUCCIÓN DE LA FASE 5 · La Bóveda de los Recuerdos
//
//  Al entrar (el embudo):
//    1. el torso guarda la memoria de la máquina;
//    2. una tabla: cada fila es un recuerdo, cada columna una de sus
//       características;
//    3. una consulta es un embudo: cada condición tira registros;
//    4. Y no es O, y los paréntesis mandan;
//    5. nadie lo tiene todo.
//  Al llegar a la capa 2 (INTRO_COMPARTIDO):
//    1. dos tablas que se apuntan: la clave foránea;
//    2. unir: usar las columnas de la otra tabla;
//    3. agrupar y contar por grupo.
// ============================================================

const v = (o: Record<string, string | number>) => o as CSSProperties;
const aparece = (d: string) => ({ className: 'ir-aparece', style: v({ '--d': d }) });

function E1() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <Robot x={170} y={40} alto={440} enciende="torso" />
      <g {...aparece('1.6s')}>
        <text className="ir-rotulo" x="700" y="120" textAnchor="middle">EL TORSO</text>
        <text className="imn-codigo" x="700" y="250" textAnchor="middle">1000 recuerdos</text>
      </g>
      <text className="im-nota" x="700" y="440" textAnchor="middle" style={v({ animationDelay: '3s' })}>
        aquí guarda todo lo que ha vivido
      </text>
    </svg>
  );
}

function ETabla() {
  const cols = ['id', 'emocion', 'lugar', 'año'];
  const filas = [['R-0001', 'calma', 'taller', '2021'], ['R-0002', 'miedo', 'patio', '2024'], ['R-0003', 'alegria', 'taller', '2025']];
  const x0 = 200, ancho = 140;
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <text className="imn-codigo" x="480" y="70" textAnchor="middle">la tabla recuerdos</text>
      {cols.map((c, i) => (
        <g key={c}>
          <rect className="imn-caja cero" x={x0 + i * ancho} y="100" width={ancho - 6} height="44" rx="2" />
          <text className="imn-indice chico" x={x0 + i * ancho + ancho / 2 - 3} y="130" textAnchor="middle">{c}</text>
        </g>
      ))}
      {filas.map((f, r) => (
        <g key={r} {...aparece(`${0.6 + r * 0.4}s`)}>
          {f.map((x, i) => (
            <g key={i}>
              <rect className="imn-caja" x={x0 + i * ancho} y={152 + r * 52} width={ancho - 6} height="44" rx="2" />
              <text className="imn-indice chico" x={x0 + i * ancho + ancho / 2 - 3} y={182 + r * 52} textAnchor="middle">{x}</text>
            </g>
          ))}
        </g>
      ))}
      <g {...aparece('2.4s')}>
        <rect className="ibv-marca" x={x0 - 6} y="198" width={ancho * 4 + 6} height="56" rx="3" />
        <text className="imn-aviso" x={x0 - 20} y="232" textAnchor="end">una fila = un recuerdo</text>
      </g>
      <g {...aparece('3.6s')}>
        <rect className="ibv-marca azul" x={x0 + ancho - 4} y="94" width={ancho + 2} height="216" rx="3" />
        <text className="imn-aviso" x={x0 + ancho * 1.5} y="350" textAnchor="middle">una columna = una característica</text>
      </g>
      <text className="im-nota" x="480" y="460" textAnchor="middle" style={v({ animationDelay: '5s' })}>
        a mil filas no se les busca con los ojos: se les pregunta
      </text>
    </svg>
  );
}

function EEmbudo() {
  const pasos = [
    ['1000', 'contar en recuerdos'],
    ['214', 'donde lugar = taller'],
    ['70', 'y emocion = miedo'],
    ['1', 'y año > 2024 y …'],
  ];
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      {pasos.map(([n, q], i) => {
        const w = 520 - i * 140;
        return (
          <g key={i} {...aparece(`${0.4 + i * 1.1}s`)}>
            <rect className={`imn-caja${i === 3 ? ' cero' : ''}`} x={480 - w / 2 - 120} y={70 + i * 100} width={w} height="70" rx="3" />
            <text className="imn-valor" x={480 - 120} y={116 + i * 100} textAnchor="middle">{n}</text>
            <text className="ibv-consulta" x={600} y={112 + i * 100}>{q}</text>
          </g>
        );
      })}
      <text className="im-nota" x="480" y="495" textAnchor="middle" style={v({ animationDelay: '5s' })}>
        cada condición tira registros · contar antes de buscar
      </text>
    </svg>
  );
}

function EYO() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <text className="ir-capa-n" x="250" y="80" textAnchor="middle">Y · LAS DOS A LA VEZ</text>
      <circle className="ibv-circulo" cx="215" cy="210" r="80" /><circle className="ibv-circulo azul" cx="285" cy="210" r="80" />
      <path className="ibv-cruce" d="M250 140 A80 80 0 0 1 250 280 A80 80 0 0 1 250 140 Z" />
      <text className="imn-aviso" x="250" y="340" textAnchor="middle">taller Y miedo</text>
      <g {...aparece('1.8s')}>
        <text className="ir-capa-n" x="710" y="80" textAnchor="middle">O · CUALQUIERA</text>
        <circle className="ibv-circulo lleno" cx="675" cy="210" r="80" /><circle className="ibv-circulo azul lleno" cx="745" cy="210" r="80" />
        <text className="imn-aviso" x="710" y="340" textAnchor="middle">miedo O calma</text>
      </g>
      <g {...aparece('3.4s')}>
        <text className="imn-codigo" x="480" y="420" textAnchor="middle">lugar = taller y ( emocion = miedo o emocion = calma )</text>
      </g>
      <text className="im-nota" x="480" y="480" textAnchor="middle" style={v({ animationDelay: '4.6s' })}>
        «y» se resuelve antes que «o»: los paréntesis mandan
      </text>
    </svg>
  );
}

function EEquipo() {
  const carta = (x: number, puesto: string, lineas: string[], clase: string, d: string) => (
    <g {...aparece(d)}>
      <rect className={`ir-carta ${clase}`} x={x - 135} y="80" width="270" height="200" rx="3" />
      <rect className={`ir-carta-cab ${clase}`} x={x - 135} y="80" width="270" height="34" />
      <text className="ir-carta-t" x={x} y="103" textAnchor="middle">{puesto}</text>
      {lineas.map((l, i) => <text key={i} className="ir-carta-l" x={x} y={152 + i * 30} textAnchor="middle">{l}</text>)}
    </g>
  );
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      {carta(170, 'DATOS', ['el diccionario:', 'columnas y valores', 'y el encargo'], 'datos', '0.3s')}
      {carta(480, 'PANTALLA', ['lo que contesta', 'la bóveda', 'y su SQL'], 'pantalla', '1.2s')}
      {carta(790, 'TERMINAL', ['pregunta a ciegas:', 'contar en recuerdos', 'donde …'], 'terminal', '2.1s')}
      <text className="im-nota" x="480" y="400" textAnchor="middle" style={v({ animationDelay: '3.4s' })}>
        cuando quede uno: abrir R-…  ·  abrir el equivocado cierra la bóveda un rato
      </text>
    </svg>
  );
}

export const INTRO_BOVEDA: EscenaIntro[] = [
  {
    clave: 'torso', dur: 8500, Dibujo: E1,
    titulo: 'El torso',
    texto: <>El torso guarda la <b className="a">memoria</b> de la máquina: mil recuerdos. Entre ellos está el que lo abre. Para llegar hay que preguntarle bien… y no quiere recordar.</>,
  },
  {
    clave: 'tabla', dur: 11000, Dibujo: ETabla,
    titulo: 'Una tabla',
    texto: <>Una base de datos guarda todo en <b className="a">tablas</b>: cada <b>fila</b> es un recuerdo y cada <b>columna</b>, una de sus características: la emoción, el lugar, el año…</>,
  },
  {
    clave: 'embudo', dur: 10500, Dibujo: EEmbudo,
    titulo: 'El embudo',
    texto: <>Una <b className="a">consulta</b> es un embudo: cada condición tira registros. Usen <Kbd>contar</Kbd> para saber cuántos quedan y <Kbd>buscar</Kbd> solo cuando sean pocos.</>,
  },
  {
    clave: 'yo', dur: 11000, Dibujo: EYO,
    titulo: 'Y no es O',
    texto: <><b className="a">Y</b> pide las dos condiciones a la vez; <b className="r">O</b>, cualquiera de las dos. Si mezclan, la bóveda resuelve primero los «y»: pongan <b>paréntesis</b>.</>,
  },
  {
    clave: 'equipo', dur: 10000, Dibujo: EEquipo,
    titulo: 'Nadie lo tiene todo',
    texto: <>Datos tiene el <b>diccionario</b> y el encargo, Pantalla ve lo que responde la bóveda —con su traducción a SQL— y Terminal pregunta a ciegas: <Kbd>contar en recuerdos donde lugar = patio</Kbd>.</>,
  },
];

// ---------- al llegar a la capa 2 ----------

function C1() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <text className="ir-capa-n" x="260" y="80" textAnchor="middle">recuerdos</text>
      {[['R-0042', 'P-07'], ['R-0043', 'P-02'], ['R-0044', 'P-07']].map(([id, p], i) => (
        <g key={id}>
          <rect className="imn-caja" x="120" y={110 + i * 60} width="140" height="48" rx="2" />
          <text className="imn-indice chico" x="190" y={141 + i * 60} textAnchor="middle">{id}</text>
          <rect className="imn-caja cero" x="266" y={110 + i * 60} width="120" height="48" rx="2" />
          <text className="imn-indice chico" x="326" y={141 + i * 60} textAnchor="middle">{p}</text>
        </g>
      ))}
      <g {...aparece('1.4s')}>
        <text className="ir-capa-n" x="710" y="80" textAnchor="middle">personas</text>
        {[['P-02', 'tomas'], ['P-07', 'lucia']].map(([id, n], i) => (
          <g key={id}>
            <rect className="imn-caja cero" x="580" y={130 + i * 80} width="110" height="48" rx="2" />
            <text className="imn-indice chico" x="635" y={161 + i * 80} textAnchor="middle">{id}</text>
            <rect className="imn-caja" x="696" y={130 + i * 80} width="140" height="48" rx="2" />
            <text className="imn-indice chico" x="766" y={161 + i * 80} textAnchor="middle">{n}</text>
          </g>
        ))}
      </g>
      <g {...aparece('2.6s')}>
        <path className="imn-flecha" d="M390 134 C480 134 500 234 576 234" />
        <path className="imn-flecha" d="M390 254 C480 254 500 234 576 234" />
        <path className="imn-flecha" d="M390 194 C480 194 500 154 576 154" />
      </g>
      <text className="im-nota" x="480" y="420" textAnchor="middle" style={v({ animationDelay: '3.8s' })}>
        persona_id apunta a una fila de personas: es una clave foránea
      </text>
    </svg>
  );
}

function C2() {
  const barras = [['lucia', 25], ['tomas', 19], ['ines', 16], ['bruno', 14]] as const;
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <text className="imn-codigo" x="480" y="70" textAnchor="middle">contar en recuerdos agrupar por nombre</text>
      {barras.map(([n, c], i) => (
        <g key={n} {...aparece(`${0.6 + i * 0.4}s`)}>
          <rect className={`ibv-barra${i === 0 ? ' top' : ''}`} x={250 + i * 130} y={400 - c * 10} width="80" height={c * 10} />
          <text className="imn-valor" x={290 + i * 130} y={390 - c * 10} textAnchor="middle">{c}</text>
          <text className="imn-indice chico" x={290 + i * 130} y="430" textAnchor="middle">{n}</text>
        </g>
      ))}
      <text className="im-nota" x="480" y="490" textAnchor="middle" style={v({ animationDelay: '3s' })}>
        agrupar junta los recuerdos de cada persona y cuenta cuántos hay
      </text>
    </svg>
  );
}

export const INTRO_COMPARTIDO: EscenaIntro[] = [
  {
    clave: 'foranea', dur: 11000, Dibujo: C1,
    titulo: 'Dos tablas que se apuntan',
    texto: <>Cada recuerdo tiene un <Kbd>persona_id</Kbd> que apunta a una fila de <b className="a">personas</b>: es una <b>clave foránea</b>. Para usar las columnas de la otra tabla, como el oficio, hay que <Kbd>unir personas</Kbd>.</>,
  },
  {
    clave: 'agrupar', dur: 11000, Dibujo: C2,
    titulo: 'Agrupar y contar',
    texto: <><Kbd>agrupar por</Kbd> junta las filas que comparten un valor y cuenta cuántas hay en cada grupo. Para «el más intenso»: <Kbd>ordenar por intensidad desc limitar 1</Kbd>. Ojo: quien más aparece en total puede no ser a quien buscan.</>,
  },
];
