import type { CSSProperties } from 'react';
import { Kbd, Motas, Robot } from './IntroReflejo';
import type { EscenaIntro } from './IntroFase';

// ============================================================
//  LA INTRODUCCIÓN DEL BONUS · El Corazón
//  Al entrar: no era ella, era un virus; una terminal vieja; el
//  respaldo sano y su suma; quién tiene qué. Al llegar al virus:
//  depurar línea por línea, y arreglar la causa, no el síntoma.
// ============================================================

const v = (o: Record<string, string | number>) => o as CSSProperties;
const aparece = (d: string) => ({ className: 'ir-aparece', style: v({ '--d': d }) });
const linea = (y: number, t: string, d: string, cls = 'ico-linea') => (
  <text key={t + y} {...aparece(d)} x="140" y={y}><tspan className={cls}>{t}</tspan></text>
);

function E1() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <Robot x={170} y={40} alto={440} enciende="corazon" />
      <g {...aparece('1.6s')}>
        <text className="ir-rotulo" x="700" y="140" textAnchor="middle">NO ERA YO</text>
        <text className="imn-codigo" x="700" y="250" textAnchor="middle">era un virus</text>
      </g>
      <text className="im-nota" x="700" y="420" textAnchor="middle" style={v({ animationDelay: '3s' })}>revivan su corazón</text>
    </svg>
  );
}

function E2() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <rect className="ico-pantalla" x="100" y="60" width="760" height="360" rx="18" />
      {linea(120, 'C:\\> DIR', '0.4s')}
      {linea(160, '   CORAZON     <DIR>', '1.0s', 'ico-salida')}
      {linea(195, '   RESPALDO    <DIR>', '1.2s', 'ico-salida')}
      {linea(245, 'C:\\> CD RESPALDO', '2.0s')}
      {linea(295, 'C:\\RESPALDO> TYPE 1991\\MARCAPASO.SYS', '2.8s')}
      {linea(335, '   SUMA: 7F3A', '3.6s', 'ico-salida')}
      <text className="im-nota" x="480" y="480" textAnchor="middle" style={v({ animationDelay: '4.4s' })}>
        DIR lista · CD entra · TYPE lee · COPY copia
      </text>
    </svg>
  );
}

function E3() {
  const r = [['1987', '2C10', false], ['1991', '7F3A', true], ['1994', 'B004', false]] as const;
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <text className="ir-capa-n" x="480" y="80" textAnchor="middle">TRES RESPALDOS · UNO SANO</text>
      {r.map(([a, s, ok], i) => (
        <g key={a} {...aparece(`${0.4 + i * 0.6}s`)}>
          <rect className={`imn-caja${ok ? ' cero' : ''}`} x={170 + i * 220} y="150" width="180" height="120" rx="3" />
          <text className="imn-indice chico" x={260 + i * 220} y="195" textAnchor="middle">{a}</text>
          <text className="imn-valor" x={260 + i * 220} y="245" textAnchor="middle">{s}</text>
        </g>
      ))}
      <text className="im-nota" x="480" y="380" textAnchor="middle" style={v({ animationDelay: '2.6s' })}>
        el sano es el que tiene la suma del manual · cópienlo a C:\CORAZON y ARRANCAR
      </text>
    </svg>
  );
}

function E4() {
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
      {carta(170, 'DATOS', ['el manual tecnico:', 'comandos, rutas', 'y la suma sana'], 'datos', '0.3s')}
      {carta(480, 'PANTALLA', ['el monitor:', 'lo que contesta', 'y el corazon'], 'pantalla', '1.2s')}
      {carta(790, 'TERMINAL', ['teclea a ciegas:', 'C:\\> DIR'], 'terminal', '2.1s')}
    </svg>
  );
}

export const INTRO_CORAZON: EscenaIntro[] = [
  { clave: 'virus', dur: 8500, Dibujo: E1, titulo: 'No era yo',
    texto: <>La máquina no era mala: tenía un <b className="r">virus</b>. Su corazón es una computadora vieja, y está apagado. Hay que <b className="a">revivirlo</b>.</> },
  { clave: 'terminal', dur: 11000, Dibujo: E2, titulo: 'Una terminal',
    texto: <>Aquí no hay ratón: todo se hace con <b className="a">comandos</b>. <Kbd>DIR</Kbd> lista una carpeta, <Kbd>CD</Kbd> entra, <Kbd>TYPE</Kbd> lee un archivo y <Kbd>COPY</Kbd> lo copia.</> },
  { clave: 'respaldo', dur: 10500, Dibujo: E3, titulo: 'El respaldo sano',
    texto: <>El marcapasos está dañado. Hay tres respaldos, y solo uno tiene la <b className="a">suma de verificación</b> que dice el manual. Cópienlo a su sitio y <Kbd>ARRANCAR</Kbd>.</> },
  { clave: 'equipo', dur: 9000, Dibujo: E4, titulo: 'Nadie lo tiene todo',
    texto: <>Datos tiene el <b>manual</b>, Pantalla ve el <b>monitor</b> y Terminal teclea a ciegas.</> },
];

function C1() {
  const cod = [['10', 'PULSO = 72', false], ['20', 'SI PULSO < 60 ENTONCES PULSO = PULSO + 4', false], ['25', 'LLAMA ORDEN.MAESTRA', true], ['30', 'SI PULSO > 180 ENTONCES LLAMA CALMA', false], ['40', 'LATE', false]] as const;
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <rect className="ico-pantalla" x="100" y="60" width="760" height="320" rx="18" />
      {cod.map(([n, t, mal], i) => (
        <g key={n} {...aparece(`${0.3 + i * 0.4}s`)}>
          {mal && <rect className="ico-marca" x="120" y={92 + i * 52} width="720" height="40" />}
          <text className="ico-linea" x="140" y={120 + i * 52}>{`${n}  ${t}`}</text>
        </g>
      ))}
      <text className="im-nota" x="480" y="450" textAnchor="middle" style={v({ animationDelay: '3s' })}>
        BORRAR RITMO.BAS 25 · ojo: la línea 30 se le parece, y es sana
      </text>
    </svg>
  );
}

function C2() {
  return (
    <svg viewBox="0 0 960 520" className="ir-svg">
      <Motas />
      <rect className="ico-pantalla" x="100" y="80" width="760" height="260" rx="18" />
      {linea(140, 'C:\\> TERMINAR 642', '0.4s')}
      {linea(185, '   PROCESO 642 TERMINADO.', '1.0s', 'ico-salida')}
      {linea(230, '   ...', '1.6s', 'ico-salida')}
      {linea(275, '   ORDEN.EXE SE VOLVIO A CARGAR.', '2.2s', 'ico-salida')}
      <text className="im-nota" x="480" y="420" textAnchor="middle" style={v({ animationDelay: '3s' })}>
        apagar el síntoma no sirve: hay que borrar la causa, en el código
      </text>
    </svg>
  );
}

export const INTRO_VIRUS: EscenaIntro[] = [
  { clave: 'depurar', dur: 11000, Dibujo: C1, titulo: 'Depurar',
    texto: <>El virus está en su <b className="a">código</b>: unas pocas líneas entre muchas sanas. Datos tiene las <b>firmas</b> del virus. <Kbd>BORRAR archivo línea</Kbd>, una por una. Borrar una sana le quita un recuerdo.</> },
  { clave: 'causa', dur: 10000, Dibujo: C2, titulo: 'La causa, no el síntoma',
    texto: <>Terminar el proceso del virus no sirve: se vuelve a cargar mientras el código siga infectado. Limpien el código y <Kbd>REINICIAR</Kbd>.</> },
];
