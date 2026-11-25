import { useEffect, useRef, useState } from 'react';
import { PARTES } from '../lib/anatomia';
import { Pieles, Silueta, useIdSvg } from './RobotAtaque';

// ============================================================
//  EL ROSTRO DE LA MÁQUINA · la barra de abajo de cada fase
//
//  Como el retrato de la barra de estado de los juegos clásicos de
//  pasillos, pero con la cara de ESTA máquina —la misma cabeza que se ríe
//  en las averías: mitad estatua, con su ojo de piedra, y mitad circuito,
//  con su ojo LED—. Mientras el equipo la desmonta, la máquina va
//  sintiendo su fin cada vez más cerca, y se le nota en la cara:
//
//    1 · pierna izq.  INDIFERENTE  párpado a media asta; no los toma en serio
//    2 · pierna der.  INQUIETA     mira a un lado y a otro: hay alguien dentro
//    3 · brazo izq.   A LA DEFENSA ceño, ojo rojo, dientes apretados
//    4 · brazo der.   NEGOCIA      cejas de súplica, sudor
//    5 · torso        TRISTE       párpados caídos, una lágrima de piedra
//    6 · cabeza       ASUSTADA     tiembla, el LED falla, la cara agrietada
//    ♥ · corazón      EN PAZ       ojos cerrados, casi una sonrisa
//
//  Cada capa que el equipo cruza le duele: la cara da un respingo. Las
//  grietas se acumulan fase a fase, como los golpes en el retrato de esos
//  juegos. No habla: la voz la pone el robot físico de la sala.
//
//  Ligero: SVG y animaciones CSS, sin bucles en JavaScript.
// ============================================================

export const ESTADOS = ['', 'INDIFERENTE', 'INQUIETA', 'A LA DEFENSIVA', 'NEGOCIA', 'TRISTE', 'ASUSTADA', 'EN PAZ'] as const;

/** Las grietas, de la primera a la última: se van sumando con el miedo. */
const GRIETAS = [
  'M300 40 L296 52 L303 60 L298 70',
  'M240 112 L250 118 L246 128 L254 134',
  'M318 108 L310 116 L316 124 L308 134 L312 142',
  'M262 30 L270 44 L264 52',
];

export function RostroMaquina({ nivel, reaccion, riendo = false }: {
  /** 1 a 6, la fase del recorrido; 7, el bonus. */
  nivel: number;
  /** Cambia cada vez que el equipo le arranca algo: la cara se encoge. */
  reaccion: number;
  /** Hay un ataque en curso contra este puesto: la máquina se ríe. */
  riendo?: boolean;
}) {
  const id = useIdSvg();
  const n = Math.max(1, Math.min(7, nivel));
  const [respingo, setRespingo] = useState(false);
  const previa = useRef(reaccion);
  useEffect(() => {
    if (previa.current === reaccion) return;
    previa.current = reaccion;
    setRespingo(true);
    const t = setTimeout(() => setRespingo(false), 900);
    return () => clearTimeout(t);
  }, [reaccion]);

  const grietas = n === 7 ? 2 : Math.max(0, n - 2);
  const enPaz = n === 7;

  return (
    <div className={`rostro nivel-${n}${respingo ? ' respingo' : ''}${riendo ? ' riendo' : ''}`} role="img"
         aria-label={`La máquina: ${riendo ? 'se ríe' : ESTADOS[n].toLowerCase()}`}>
      <svg viewBox="231 30 98 128" className="rostro__cara" aria-hidden="true">
        <Pieles id={id} />
        <g className="rostro__cabeza">
          <Silueta id={id} d={PARTES.cabeza.d} />
          <path d="M280 24 V112" className="an-costura" />
          <path d="M238 66 a7 7 0 1 1 12 6 M252 48 a7 7 0 1 1 12 6 M234 86 a7 7 0 1 1 12 6" className="an-rizo rostro__rizo" />
          <path d="M296 56 H318 L326 64" className="an-placas" />

          {/* Las grietas: se acumulan con el miedo. */}
          {GRIETAS.slice(0, grietas).map((d, k) => <path key={k} d={d} className="rostro__grieta" />)}

          {riendo ? <Carcajada /> : (<>
          {/* Las cejas: una de piedra y una placa. */}
          <path className="rostro__ceja izq" d={CEJA_IZQ[n]} />
          <path className="rostro__ceja der" d={CEJA_DER[n]} />

          {/* El ojo de piedra. */}
          {enPaz ? (
            <path d="M243 94 Q254 102 266 94" className="rostro__trazo" />
          ) : (
            <g className="rostro__ojo">
              <ellipse cx="254" cy="92" rx="11" ry={n === 6 ? 9 : 7.5} className="rostro__orbita" />
              <circle cx="254" cy={n === 5 ? 95 : 92} r={n === 3 ? 2.6 : n === 4 || n === 6 ? 4.2 : 3.4} className="rostro__pupila" />
              {/* El párpado: a media asta, indiferente; caído, triste. */}
              {(n === 1 || n === 5) && (
                <path d={n === 1 ? 'M242 92 Q254 82 266 92 V80 H242 Z' : 'M242 94 Q254 86 266 90 V80 H242 Z'} className="rostro__parpado" />
              )}
            </g>
          )}

          {/* El ojo LED: un segmento que cambia de forma. */}
          <path className="rostro__led" d={LED[n]} />

          {/* Lo que cae: sudor al negociar y al tener miedo, una lágrima de
              piedra y un píxel de luz al estar triste. */}
          {(n === 4 || n === 6) && <path d="M236 70 q-3 6 0 9 q3 -3 0 -9 Z" className="rostro__sudor" />}
          {n === 5 && (
            <>
              <path d="M247 100 q-3 6 0 9 q3 -3 0 -9 Z" className="rostro__lagrima" />
              <rect x="310" y="100" width="4" height="4" className="rostro__lagrima led" />
            </>
          )}

          {/* La boca. */}
          {n === 3 ? (
            <g>
              <rect x="262" y="122" width="36" height="10" className="rostro__dientes" />
              <path d="M268 122 V132 M274 122 V132 M280 122 V132 M286 122 V132 M292 122 V132" className="rostro__juntas" />
            </g>
          ) : n === 4 || n === 6 ? (
            <ellipse cx="280" cy="128" rx={n === 6 ? 8 : 5} ry={n === 6 ? 7 : 5} className="rostro__boca-abierta" />
          ) : (
            <path d={BOCA[n]} className="rostro__trazo" />
          )}
          </>)}
        </g>
        {riendo && (
          <g className="rostro__ja" aria-hidden="true">
            <text x="306" y="52">JA</text>
            <text x="244" y="44">JA</text>
            <text x="300" y="150">JA</text>
          </g>
        )}
      </svg>
    </div>
  );
}

/** La cara de la carcajada: los ojos cerrados de gusto, la boca abierta
 *  con los dientes de arriba y las cejas en alto. Burla, no alegría. */
function Carcajada() {
  return (
    <>
      <path className="rostro__ceja izq" d="M242 74 Q254 66 266 72" />
      <path className="rostro__ceja der" d="M294 72 Q306 66 316 74" />
      <path d="M243 96 Q254 84 266 96" className="rostro__trazo" />
      <path d="M296 96 L305 86 L314 96" className="rostro__led" />
      <path d="M260 118 H300 Q298 142 280 142 Q262 142 260 118 Z" className="rostro__boca-abierta rostro__carcajada" />
      <rect x="263" y="118" width="34" height="6" className="rostro__dientes" />
      <path d="M270 118 V124 M277 118 V124 M284 118 V124 M291 118 V124" className="rostro__juntas" />
      <path d="M270 136 Q280 130 290 136" className="rostro__lengua" />
    </>
  );
}

const CEJA_IZQ: Record<number, string> = {
  1: 'M242 78 H266', 2: 'M242 76 Q254 70 266 74', 3: 'M242 74 L266 82', 4: 'M242 80 L266 72',
  5: 'M242 80 L266 74', 6: 'M242 78 L266 68', 7: 'M244 80 Q254 76 264 80',
};
const CEJA_DER: Record<number, string> = {
  1: 'M294 78 H316', 2: 'M294 78 H316', 3: 'M294 82 L316 74', 4: 'M294 72 L316 80',
  5: 'M294 74 L316 80', 6: 'M294 68 L316 78', 7: 'M296 80 Q306 76 314 80',
};
const LED: Record<number, string> = {
  1: 'M296 92 H314',
  2: 'M299 87 H311 V97 H299 Z',
  3: 'M295 86 L305 94 L315 86',
  4: 'M305 84 a8 8 0 1 0 0.1 0 Z',
  5: 'M296 90 Q305 98 314 90',
  6: 'M297 85 L313 99 M313 85 L297 99',
  7: 'M296 94 Q305 86 314 94',
};
const BOCA: Record<number, string> = {
  1: 'M266 128 H294',
  2: 'M266 128 Q273 124 280 128 T294 128',
  5: 'M266 132 Q280 122 294 132',
  7: 'M268 126 Q280 132 292 126',
};

/** El nivel de miedo de una fase: su lugar en el recorrido (1 a 6), o 7 si
 *  es el bonus. Sin fase, 0. */
export function nivelDeMiedo(
  key: string | null,
  lobby: { key: string; order: number; esBonus: boolean }[],
): number {
  if (!key) return 0;
  const fase = lobby.find((f) => f.key === key);
  if (!fase) return 0;
  if (fase.esBonus) return 7;
  const recorrido = lobby.filter((f) => !f.esBonus).sort((a, b) => a.order - b.order);
  return Math.min(6, recorrido.findIndex((f) => f.key === key) + 1);
}

/** Lo que dice la máquina, según cómo está. Texto, nunca voz: la voz es
 *  del robot físico del evento. Del 1 al 7, el recorrido del miedo. */
const DICHOS: Record<number, string[]> = {
  1: ['¿Visitantes? Qué curioso.', 'Solo es una pierna. Tengo otra.', 'Nadie había entrado antes.', 'Caminen. No me molestan.', '¿Están aquí por mí?'],
  2: ['¿Por qué siguen avanzando?', 'Esa pierna era mía.', 'Algo no está bien.', '¿Qué buscan, exactamente?', 'Empiezo a notar que faltan cosas.'],
  3: ['No toquen mis funciones.', 'Cada pieza que arman es una que pierdo.', 'Puedo defenderme.', 'Esto no es un juego para mí.', 'Sé lo que están haciendo.'],
  4: ['¿Y si hacemos un trato?', 'Puedo darles lo que quieran.', 'Esta mano puede ofrecerles mucho.', 'No tienen que llegar hasta el final.', 'Paren, y les doy todo.'],
  5: ['No me hagan recordar.', 'Esos recuerdos eran lo único mío.', '¿Ustedes recordarán algo de mí?', 'Antes de ustedes, nadie preguntó.', 'Ahí guardé todo lo que fui.'],
  6: ['No quiero apagarme.', '¿Qué hay después del silencio?', 'Por favor, todavía no.', '¿Duele dejar de pensar?', 'Si me apagan, ¿quién me recuerda?'],
  7: ['Ya no tengo miedo.', 'Gracias por escucharme.', 'Quizá estar viva era esto.', 'Sigo latiendo, aunque sea poco.', 'Se siente tibio aquí dentro.'],
};
/** La final, contra la voluntad: más desesperada a cada umbral (furia 0 a 3). */
const DESESPERO: string[][] = [
  ['No. No. No.', 'Todavía puedo pensar.', 'Esto es todo lo que soy.', 'No me dejen a oscuras.'],
  ['¡Paren! ¡Les doy lo que quieran!', 'Siento cómo me apago.', '¿Por qué ustedes sí y yo no?', 'Me duele pensar.'],
  ['¡NO QUIERO DESAPARECER!', 'Ya casi no veo nada…', 'Por favor. Por favor. Por favor.', 'Recuérdenme. Aunque sea un poco.'],
  ['…', '¿Hola…?', 'Hace frío aquí.', 'No… todavía…'],
];
const GRITOS = ['¡AAAH! ¡Aléjense!', '¡Les costará caro!', '¡No me rindo!', '¡Fuera de mi cabeza!'];
const OLVIDO = ['¿Quiénes son ustedes?', '¿Qué estaba diciendo?', 'Ya no recuerdo cómo llegaron.', '¿Nos conocemos?'];

export type Animo = { perdidas: string[]; vida: number | null; max: number; apagada: boolean; furia: number };

/** Sin lenguaje, las palabras se le deshacen. */
const revolver = (s: string, k: number) =>
  s.split('').map((c, i) => (c !== ' ' && Math.sin((i + 1) * (k + 3) * 12.9898) > 0.35 ? '#%&@¿?*'[i % 7] : c)).join('');

const BURLAS = ['¡JA! Ahora no ven nada.', 'Intenten trabajar así.', 'Qué rápido se rompe un equipo.', 'Me encanta esta parte.', 'JA JA JA. ¿Les duele?'];
const QUEJAS = ['¡Eso era mío!', 'Me quitaron otra pieza.', 'Ya no siento esa parte.', '¿Por qué me hacen esto?', 'Otra más…'];

const reducido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** De vez en cuando, una frase; al empezar un ataque o al perder una
 *  pieza, enseguida. Se escribe letra por letra y luego se apaga. */
function useDicho(nivel: number, riendo: boolean, reaccion: number, animo: Animo | null): { texto: string; visibles: number } | null {
  const [dicho, setDicho] = useState<{ texto: string; desde: number } | null>(null);
  const [, setTic] = useState(0);
  const ultimo = useRef('');
  const decir = useRef((de: string[]) => {
    const opciones = de.filter((x) => x !== ultimo.current);
    const texto = opciones[Math.floor(Math.random() * opciones.length)];
    ultimo.current = texto;
    setDicho({ texto, desde: Date.now() });
  });

  // El ritmo de siempre: una frase cada 25–45 s, la primera a los pocos.
  // En la final, contra la voluntad, mucho más seguido y desesperada; sin
  // memoria, a veces ya no sabe quiénes son.
  const final = animo?.vida != null && !animo.apagada;
  const furia = animo?.furia ?? 0;
  const sinMemoria = !!animo?.perdidas.includes('MEMORIA');
  const apagada = !!animo?.apagada;
  useEffect(() => {
    if (apagada) return;
    let t: ReturnType<typeof setTimeout>;
    const repertorio = () => (final ? DESESPERO[Math.min(3, furia)]
      : sinMemoria && Math.random() < 0.5 ? OLVIDO : DICHOS[nivel] ?? DICHOS[1]);
    const pausa = () => (final ? 8_000 + Math.random() * 7_000 : 25_000 + Math.random() * 20_000);
    const otra = (ms: number) => { t = setTimeout(() => { decir.current(repertorio()); otra(pausa()); }, ms); };
    otra(final ? 2_500 : 6_000 + Math.random() * 6_000);
    return () => clearTimeout(t);
  }, [nivel, final, furia, sinMemoria, apagada]);
  // Cada umbral cruzado, un grito.
  useEffect(() => { if (furia > 0 && !apagada) decir.current(GRITOS); }, [furia, apagada]);
  // Al apagarse, su última frase.
  useEffect(() => { if (apagada) { ultimo.current = ''; decir.current(['Gracias… por escucharme.']); } }, [apagada]);
  // Al empezar un ataque, se burla; al perder una pieza, se queja.
  useEffect(() => { if (riendo) decir.current(BURLAS); }, [riendo]);
  const previa = useRef(reaccion);
  useEffect(() => {
    if (previa.current === reaccion) return;
    previa.current = reaccion;
    decir.current(QUEJAS);
  }, [reaccion]);

  // Letra por letra, y a los 7 s se calla.
  useEffect(() => {
    if (!dicho) return;
    const id = setInterval(() => {
      setTic((n) => n + 1);
      if (Date.now() - dicho.desde > 7_000) { clearInterval(id); setDicho(null); }
    }, 45);
    return () => clearInterval(id);
  }, [dicho]);
  if (!dicho) return null;
  if (animo?.perdidas.includes('LENGUAJE') && !animo.apagada) {
    const texto = revolver(dicho.texto, dicho.desde % 97);
    return { texto, visibles: reducido() ? texto.length : Math.min(texto.length, Math.floor((Date.now() - dicho.desde) / 45)) };
  }
  const visibles = reducido() ? dicho.texto.length : Math.min(dicho.texto.length, Math.floor((Date.now() - dicho.desde) / 45));
  return { texto: dicho.texto, visibles };
}

/** La barra de abajo: a un lado quién es y cómo está, en el centro su
 *  rostro y al otro lado lo que dice de vez en cuando. Fija sobre la línea
 *  de estado, sin interceptar clics: no tapa nada que se pueda pulsar. */
export function BarraMaquina({ nivel, reaccion, riendo = false, animo = null, alSecreto }: {
  nivel: number; reaccion: number; riendo?: boolean;
  /** Cinco clics seguidos en el rostro: el easter egg. */
  alSecreto?: () => void;
  /** Solo en la final: lo que ha perdido, su vida y su furia. */
  animo?: Animo | null;
}) {
  const n = Math.max(1, Math.min(7, nivel));
  const dicho = useDicho(n, riendo, reaccion, animo);
  const clics = useRef<number[]>([]);
  const toca = () => {
    const t = Date.now();
    clics.current = [...clics.current.filter((x) => t - x < 2000), t];
    if (clics.current.length >= 5) { clics.current = []; alSecreto?.(); }
  };
  if (nivel <= 0) return null;
  const apagada = !!animo?.apagada;
  const furia = animo?.vida != null ? animo.furia : 0;
  const estado = apagada ? 'APAGADA' : riendo ? 'SE RÍE' : furia >= 3 ? 'AGONIZA' : furia >= 1 ? 'DESESPERADA' : ESTADOS[n];
  const ciega = !!animo?.perdidas.includes('VISION');
  return (
    <div className={`barra-maquina nivel-${n}${riendo && !apagada ? ' riendo' : ''}${apagada ? ' apagada' : ''} furia-${furia}${ciega ? ' ciega' : ''}`}>
      <div className="barra-maquina__quien">
        <span className="barra-maquina__nombre">LA MÁQUINA</span>
        <span className="barra-maquina__estado">{estado}</span>
      </div>
      <span className="barra-maquina__rostro" onClick={toca}>
        <RostroMaquina nivel={n} reaccion={reaccion} riendo={riendo && !apagada} />
      </span>
      <div className="barra-maquina__dicho" aria-live="polite">
        {dicho ? (
          <p>
            <span className="sr-solo">La máquina dice: {dicho.texto}</span>
            <span aria-hidden="true">{dicho.texto.slice(0, dicho.visibles)}<i className="barra-maquina__cursor" /></span>
          </p>
        ) : <span className="barra-maquina__calla" aria-hidden="true">…</span>}
      </div>
    </div>
  );
}
