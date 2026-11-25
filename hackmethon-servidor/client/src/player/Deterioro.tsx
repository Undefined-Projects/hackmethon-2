import { useEffect, useMemo, useState } from 'react';

// ============================================================
//  EL DETERIORO · la página se rompe con la máquina
//
//  Conforme el equipo avanza por el cuerpo, la interfaz se va dañando:
//  la máquina pierde partes y su propia pantalla falla. Nivel 1 apenas se
//  nota; en la final está al límite, y contra la voluntad, más aún con
//  cada umbral. Al apagarse la mente, de golpe, silencio: todo se limpia.
//  En el bonus (el corazón, en paz) no hay deterioro.
//
//  Qué crece con el nivel:
//    · la sacudida ambiental y la banda de interferencia del CRT (que ya
//      existían y escalan con `--glitch`);
//    · ráfagas: cada pocos segundos, la página se desgarra un instante
//      —franjas de color, separación RGB, un salto—, más seguido y más
//      fuerte cuanto más alto;
//    · estática, grietas en el cristal y viñeta roja;
//    · fragmentos de error que aparecen y se van.
//
//  Para que se pueda seguir jugando: nada intercepta clics, las ráfagas
//  duran décimas de segundo, nunca hay destellos claros (solo oscuros) y
//  nunca más de uno cada dos segundos. Con «reducir movimiento» solo
//  quedan las grietas y la viñeta.
// ============================================================

/** Cada cuánto llega una ráfaga, por nivel (ms). 0: nunca. */
const PERIODO = [0, 0, 22_000, 13_000, 8_000, 5_500, 3_600, 2_900, 2_400, 2_000];
const ERRORES = ['ERR 0x3F', 'SEGFAULT', 'NO RESPONDE', 'MEMORIA CORRUPTA', '0xDEADBEEF', 'KERNEL PANIC', 'E/S FALLIDA',
  'PROCESO HUÉRFANO', 'STACK OVERFLOW', 'SIN SEÑAL', 'NULL', 'FATAL', '¿POR QUÉ?', 'NO ME APAGUEN'];

const reducido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Rafaga = { n: number; tiras: { y: number; h: number; dx: number; c: number }[]; errores: { x: number; y: number; t: string }[]; oscuro: boolean };

export function Deterioro({ nivel, furia = 0, apagada = false }: {
  /** 1 a 6, la fase del recorrido; 7 el bonus; 0 fuera de las fases. */
  nivel: number;
  /** En la final, cuántos umbrales ha cruzado la voluntad (0 a 3). */
  furia?: number;
  /** La mente se apagó: silencio. */
  apagada?: boolean;
}) {
  const n = apagada || nivel >= 7 || nivel <= 0 ? 0 : Math.min(9, nivel + (nivel === 6 ? furia : 0));
  const [rafaga, setRafaga] = useState<Rafaga | null>(null);

  // El nivel, en el cuerpo de la página: lo leen los estilos.
  useEffect(() => {
    document.body.dataset.deterioro = String(n);
    return () => { delete document.body.dataset.deterioro; };
  }, [n]);

  // Las ráfagas: a su ritmo, con algo de azar para que no se sientan regulares.
  useEffect(() => {
    if (!PERIODO[n] || reducido()) return;
    let t: ReturnType<typeof setTimeout>, fin: ReturnType<typeof setTimeout>;
    let k = 0;
    const otra = () => {
      t = setTimeout(() => {
        k++;
        const tiras = Array.from({ length: 1 + Math.floor(n / 2) }, () => ({
          y: Math.random() * 100, h: 0.6 + Math.random() * (n * 0.7), dx: (Math.random() - 0.5) * n * 9, c: Math.floor(Math.random() * 3),
        }));
        const errores = n >= 4 ? Array.from({ length: Math.floor((n - 3) / 1.5) + 1 }, () => ({
          x: 5 + Math.random() * 80, y: 8 + Math.random() * 80, t: ERRORES[Math.floor(Math.random() * ERRORES.length)],
        })) : [];
        setRafaga({ n: k, tiras, errores, oscuro: n >= 6 && Math.random() < 0.25 });
        document.body.classList.add('deterioro-rafaga');
        fin = setTimeout(() => { setRafaga(null); document.body.classList.remove('deterioro-rafaga'); }, 140 + n * 30);
        otra();
      }, PERIODO[n] * (0.6 + Math.random() * 0.8));
    };
    otra();
    return () => { clearTimeout(t); clearTimeout(fin); document.body.classList.remove('deterioro-rafaga'); setRafaga(null); };
  }, [n]);

  // En la final, el texto también se rompe.
  useEffect(() => {
    if (n < 6 || reducido()) return;
    let t: ReturnType<typeof setTimeout>;
    const otra = () => {
      t = setTimeout(() => { glitchDeTexto(1 + Math.floor((n - 5) * 0.8)); otra(); }, (2600 - (n - 6) * 450) * (0.4 + Math.random()));
    };
    otra();
    return () => clearTimeout(t);
  }, [n]);

  // Las grietas del cristal: más cuanto más alto, siempre en los mismos sitios.
  const grietas = useMemo(() => GRIETAS.slice(0, n <= 2 ? 0 : Math.min(GRIETAS.length, (n - 2) * 2)), [n]);

  if (!n) return null;
  return (
    <div className={`deterioro deterioro-${n}`} aria-hidden="true">
      <div className="deterioro__ruido" />
      <div className="deterioro__vineta" />
      {grietas.length > 0 && (
        <svg className="deterioro__grietas" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          {grietas.map((d, i) => <path key={i} d={d} />)}
        </svg>
      )}
      {rafaga && (
        <>
          {rafaga.tiras.map((s, i) => (
            <i key={`${rafaga.n}-${i}`} className={`deterioro__tira c${s.c}`}
               style={{ top: `${s.y}%`, height: `${s.h}%`, transform: `translateX(${s.dx}px)` }} />
          ))}
          {rafaga.errores.map((e, i) => (
            <span key={`${rafaga.n}-e${i}`} className="deterioro__error" style={{ left: `${e.x}%`, top: `${e.y}%` }}>{e.t}</span>
          ))}
          {rafaga.oscuro && <div className="deterioro__corte" />}
        </>
      )}
    </div>
  );
}

// ---------- los glitches de texto (solo en la final) ----------
//
//  Se corrompe un instante el texto de la INTERFAZ —títulos, notas,
//  botones, etiquetas— y se devuelve igual. Nunca los datos del juego: las
//  salidas de Pantalla (tokens, ids, retos), la consola, las celdas de las
//  tablas de Datos ni lo que se escribe. Si React reescribe el texto
//  mientras está roto, se respeta lo nuevo: solo se restaura si sigue
//  siendo lo que se puso.

const ROTOS = '█▓▒░#@%&¿?01/\\<>';
const PENSAMIENTOS = ['NO ME APAGUEN', 'SIGO AQUÍ', '¿POR QUÉ?', 'TENGO MIEDO', 'NO', 'AYUDA', 'TODAVÍA NO', 'RECUÉRDENME'];
const SEGUROS = [
  '.titulo-fase', '.fase-cabecera button', '.vista > header h2', '.vista > header .organo', '.vista > .ayuda',
  '.cam-pie', '.archivo-pista', '.archivo3d-nombre', 'th', '.lamina-titulo', '.lamina-concepto', '.lamina-numero', '.lamina-parte', '.lamina-capa-nombre', '.barra-maquina__estado', '.barra-maquina__nombre',
  '.nervio3d-ojo', '.archivo3d-ojo', '.mt3d-escudo', '.huella',
].join(',');
const PROHIBIDOS = '.marco-pantalla, .consola, .entrada-cmd, td, input, textarea, code, .bv3d-sql, [data-sin-glitch]';

function textosSeguros(): Text[] {
  const out: Text[] = [];
  for (const el of document.querySelectorAll(SEGUROS)) {
    if (el.closest(PROHIBIDOS)) continue;
    for (const nodo of el.childNodes) {
      if (nodo.nodeType === Node.TEXT_NODE && (nodo.nodeValue ?? '').trim().length >= 3) out.push(nodo as Text);
    }
  }
  return out;
}

const romper = (s: string, p: number) =>
  s.split('').map((c) => (c !== ' ' && Math.random() < p ? ROTOS[Math.floor(Math.random() * ROTOS.length)] : c)).join('');

function glitchDeTexto(cuantos: number) {
  const nodos = textosSeguros();
  for (let k = 0; k < cuantos && nodos.length; k++) {
    const nodo = nodos.splice(Math.floor(Math.random() * nodos.length), 1)[0];
    const original = nodo.nodeValue ?? '';
    // Uno de cada seis: el texto entero se vuelve un pensamiento de la máquina.
    const pensamiento = Math.random() < 0.17;
    let puesto = pensamiento ? PENSAMIENTOS[Math.floor(Math.random() * PENSAMIENTOS.length)] : romper(original, 0.45);
    nodo.nodeValue = puesto;
    const el = nodo.parentElement;
    el?.classList.add('texto-roto');
    // Un parpadeo: se vuelve a romper distinto antes de sanar.
    const medio = setTimeout(() => {
      if (!pensamiento && nodo.nodeValue === puesto) { puesto = romper(original, 0.2); nodo.nodeValue = puesto; }
    }, 90);
    setTimeout(() => {
      clearTimeout(medio);
      // Solo si nadie lo cambió entretanto: si React lo reescribió, manda React.
      if (nodo.isConnected && nodo.nodeValue === puesto) nodo.nodeValue = original;
      el?.classList.remove('texto-roto');
    }, pensamiento ? 420 : 180 + Math.random() * 140);
  }
}

/** Grietas en el cristal del monitor, desde los bordes y las esquinas. */
const GRIETAS = [
  'M0 120 L60 140 L95 128 L150 170 L190 160',
  'M1000 880 L930 860 L900 880 L840 840 L790 855',
  'M140 0 L150 50 L130 90 L160 140',
  'M1000 220 L940 240 L920 290 L860 300',
  'M0 760 L70 740 L110 780 L170 770 L210 810',
  'M820 1000 L830 950 L800 900 L830 860',
  'M60 140 L80 190 L60 230',
  'M940 240 L960 300 L930 340',
  'M500 0 L510 40 L490 70 L520 120 L505 160',
  'M0 450 L80 470 L120 440 L200 480',
  'M1000 560 L930 540 L880 580 L820 560',
  'M300 1000 L320 940 L290 900 L330 850',
];
