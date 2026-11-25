import type { CSSProperties } from 'react';
import { Kbd, Motas, Robot } from './IntroReflejo';
import type { EscenaIntro } from './IntroFase';

// ============================================================
//  LA INTRODUCCIÓN DE LA FINAL · El Asalto a la Mente
//
//  Al entrar: la cabeza; una petición y sus cuatro partes; los códigos;
//  quién tiene qué. Al llegar a la voluntad: la conversación de tres
//  pasos y los contraataques.
// ============================================================

const v = (o: Record<string, string | number>) => o as CSSProperties;
const aparece = (d: string) => ({ className: 'ir-aparece', style: v({ '--d': d }) });

function E1() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <Robot x={170} y={40} alto={440} enciende="cabeza" />
      <g {...aparece('1.6s')}>
        <text className="ir-rotulo" x="700" y="120" textAnchor="middle">LA MENTE</text>
        <text className="imn-codigo" x="700" y="250" textAnchor="middle">lo último que queda</text>
      </g>
      <text className="im-nota" x="700" y="440" textAnchor="middle" style={v({ animationDelay: '3s' })}>
        y no se va a dejar
      </text>
    </svg>
  );
}

function EPeticion() {
  const partes: [string, string, string, number][] = [
    ['DELETE', 'metodo', 'qué quieres hacer', 120],
    ['/mente/procesos/p-3a1', 'ruta', 'a qué', 280],
    ['cabecera token=tk-…', 'cab', 'quién eres', 560],
    ['cuerpo fuerza=3', 'cuerpo', 'con qué', 800],
  ];
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <text className="imn-codigo" x="480" y="90" textAnchor="middle">enviar … una petición</text>
      {partes.map(([t, c, d, x], i) => (
        <g key={c} {...aparece(`${0.5 + i * 0.9}s`)}>
          <text className={`imt-parte ${c}`} x={x} y="230" textAnchor="middle">{t}</text>
          <path className="imn-flecha" d={`M${x} 260 L${x} 300`} />
          <text className="imn-aviso" x={x} y="335" textAnchor="middle">{d}</text>
        </g>
      ))}
      <text className="im-nota" x="480" y="450" textAnchor="middle" style={v({ animationDelay: '4.6s' })}>
        método · ruta · cabecera · cuerpo: si falta una, la mente no obedece
      </text>
    </svg>
  );
}

function ECodigos() {
  const cods: [string, string, boolean][] = [['200', 'hecho', true], ['401', '¿quién eres?', false], ['403', 'tu token no vale', false],
    ['404', 'no existe', false], ['422', 'falta algo', false], ['429', 'más despacio', false]];
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      {cods.map(([c, t, ok], i) => (
        <g key={c} {...aparece(`${0.3 + i * 0.5}s`)}>
          <text className={`imt-codigo ${ok ? 'ok' : 'mal'}`} x={180 + (i % 3) * 300} y={170 + Math.floor(i / 3) * 150} textAnchor="middle">{c}</text>
          <text className="imn-aviso" x={180 + (i % 3) * 300} y={210 + Math.floor(i / 3) * 150} textAnchor="middle">{t}</text>
        </g>
      ))}
      <text className="im-nota" x="480" y="470" textAnchor="middle" style={v({ animationDelay: '3.8s' })}>
        cada código dice qué corregir · la tabla completa la tiene Datos
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
      {carta(170, 'DATOS', ['las rutas, los códigos', 'y la clave de acceso'], 'datos', '0.3s')}
      {carta(480, 'PANTALLA', ['la mente por dentro', 'y lo que responde:', 'tokens, ids, retos'], 'pantalla', '1.2s')}
      {carta(790, 'TERMINAL', ['dispara a ciegas:', 'enviar POST …'], 'terminal', '2.1s')}
      <text className="im-nota" x="480" y="400" textAnchor="middle" style={v({ animationDelay: '3.4s' })}>
        primero el acceso: sin token, nada funciona
      </text>
    </svg>
  );
}

export const INTRO_MENTE: EscenaIntro[] = [
  {
    clave: 'mente', dur: 8500, Dibujo: E1,
    titulo: 'La mente',
    texto: <>Cayeron las piernas, los brazos y el torso. Queda la <b className="a">mente</b>: donde la máquina procesa todo. Sus partes se hablan por una <b>API</b>, y ustedes la van a usar para destruirlas.</>,
  },
  {
    clave: 'peticion', dur: 11000, Dibujo: EPeticion,
    titulo: 'Una petición',
    texto: <>Cada orden es una <b className="a">petición</b> con cuatro partes: el <b className="r">método</b> (GET, POST, PATCH, DELETE), la <b>ruta</b>, la <b>cabecera</b> (quién eres) y el <b>cuerpo</b> (qué quieres).</>,
  },
  {
    clave: 'codigos', dur: 10000, Dibujo: ECodigos,
    titulo: 'Lo que contesta',
    texto: <>La mente responde con un <b className="a">código</b>: 200 es que funcionó; los 400 dicen qué salió mal, y cada uno se arregla distinto. Si la bombardean, cierra y <b className="r">contraataca</b>.</>,
  },
  {
    clave: 'equipo', dur: 9500, Dibujo: EEquipo,
    titulo: 'Nadie lo tiene todo',
    texto: <>Datos tiene las rutas y la clave; Pantalla ve la mente y lo que responde; Terminal dispara: <Kbd>enviar POST /mente/sesion cuerpo clave=…</Kbd></>,
  },
];

// ---------- la voluntad ----------

function C1() {
  const pasos: [string, string][] = [['GET', '/mente/nucleo/reto'], ['PATCH', 'escudo=abajo reto=…'], ['DELETE', 'fuerza=25']];
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      {pasos.map(([m, r], i) => (
        <g key={m} {...aparece(`${0.4 + i * 1.1}s`)}>
          <text className="imt-parte metodo" x="300" y={150 + i * 100} textAnchor="end">{m}</text>
          <text className="imt-parte ruta" x="330" y={150 + i * 100}>{r}</text>
        </g>
      ))}
      <text className="im-nota" x="480" y="460" textAnchor="middle" style={v({ animationDelay: '4s' })}>
        el reto cambia cada 45 s · el escudo vuelve a los 25 s
      </text>
    </svg>
  );
}

function C2() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <rect className="imn-caja" x="180" y="150" width="600" height="40" rx="2" />
      <g {...aparece('0.4s')}><rect className="ibv-barra top" x="182" y="152" width="596" height="36" /></g>
      {[75, 50, 25].map((u, i) => (
        <g key={u} {...aparece(`${1 + i * 0.8}s`)}>
          <path className="imn-flecha" d={`M${180 + u * 6} 230 L${180 + u * 6} 200`} />
          <text className="imt-codigo mal" x={180 + u * 6} y="270" textAnchor="middle">{u}</text>
          <text className="imn-aviso" x={180 + u * 6} y="305" textAnchor="middle">{['ataca a 1', 'ataca a 2', 'ataca a todos'][i]}</text>
        </g>
      ))}
      <text className="im-nota" x="480" y="420" textAnchor="middle" style={v({ animationDelay: '3.8s' })}>
        a cada umbral: escudo arriba, token inválido y contraataque
      </text>
    </svg>
  );
}

export const INTRO_VOLUNTAD: EscenaIntro[] = [
  {
    clave: 'conversacion', dur: 10500, Dibujo: C1,
    titulo: 'Una conversación',
    texto: <>La <b className="a">voluntad</b> tiene escudo. Apagarla no es un disparo: es una conversación de tres pasos. Pidan el <b>reto</b>, bajen el escudo con él y <b className="r">golpeen</b> antes de que vuelva.</>,
  },
  {
    clave: 'contraataque', dur: 10500, Dibujo: C2,
    titulo: 'Se va a defender',
    texto: <>A los 75, 50 y 25 de vida, la mente se <b className="r">desespera</b>: sube el escudo, invalida el token y contraataca, cada vez a más puestos. Quien quede averiado, que aguante; los demás, a pedir acceso otra vez.</>,
  },
];
