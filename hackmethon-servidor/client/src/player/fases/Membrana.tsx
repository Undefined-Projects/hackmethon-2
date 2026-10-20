import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { azar, crece } from '../../lib/jardin';
import { sonar } from '../../lib/sonido';

// ============================================================
//  LA MEMBRANA · el circuito cerrado de la Fase 1
//
//  La rodilla de la máquina vista de lado: a la izquierda la fila de
//  programas, en medio la membrana de raíces entre dos pilares —uno de
//  placas y remaches, otro de hueso con vetas: la misma estatua a medias
//  que el robot del lobby— y encima la rótula con el ganglio que decide.
//
//  Cada programa llega, el reflejo lo PALPA (un zarcillo sale del pilar y
//  lo toca), el impulso sube por el nervio hasta el ganglio y baja por el
//  otro lado hasta las raíces, que se apartan o se cierran con espinas.
//  Es el arco reflejo dibujado: estímulo, decisión, respuesta.
//
//  La escena se anima AQUÍ con un reloj local. El servidor solo dice
//  quién hay en la cola y si pasa —lo mismo que los fotogramas de texto—
//  y esta pantalla lo representa. Nunca sabe por qué pasa nadie, y eso es
//  deliberado: la causa es de `probar`.
// ============================================================

/** Un programa en la fila de la membrana. Solo su nombre, si pasa y si
 *  llegó con la muda: lo mismo que dicen los fotogramas de texto. */
export type Cuidador = { nombre: string; pasa: boolean; nuevo?: boolean; origen?: string };

type Etapa = 'espera' | 'llega' | 'palpa' | 'decide' | 'veredicto' | 'fin';

/** Lo que dura cada tiempo del reflejo. Una persona son ~3,8 s: a ese
 *  ritmo se sigue a cada uno sin que la cola se haga eterna. */
const DUR: Record<Etapa, number> = {
  espera: 700, llega: 900, palpa: 820, decide: 640, veredicto: 1550, fin: 1800,
};
/** La transición de capa: primero se celebra (la rótula cede), luego la
 *  pierna muda. Lo bastante larga para que se entienda que algo se ganó. */
const MUDA_MS = { cede: 3400, seca: 1500, cae: 1300, brota: 1900 };

/** La última muda que se vio en esta pestaña. La escena puede montarse
 *  DESPUÉS de la muda —si Pantalla tenía puesta la cámara del interior,
 *  el servidor la devuelve a la membrana con la muda ya hecha— y aun así
 *  tiene que enseñarla. Por pestaña: una recarga no la repite. */
const CLAVE_MUDA = 'hm:muda-vista';
function mudaYaVista(): number | null {
  try { const v = sessionStorage.getItem(CLAVE_MUDA); return v === null ? null : Number(v); } catch { return null; }
}
function guardarMudaVista(n: number) {
  try { sessionStorage.setItem(CLAVE_MUDA, String(n)); } catch { /* sin almacenamiento */ }
}

// ---------- la geometría ----------
const W = 960, H = 400, SUELO = 340;
const GX = 600;                  // el eje de la membrana
const HUECO: [number, number] = [572, 628];
const CX = 506;                  // donde se planta el candidato
const COLA0 = 452, COLA_PASO = 44;
const DENTRO0 = 706, DENTRO_PASO = 38, POR_FILA = 7;
const FUERA = -70;
const GANGLIO: [number, number] = [GX, 86];
/** La puerta entera —pilares, rótula, raíces, ganglio— se dibuja en sus
 *  medidas y se agranda desde el pie: así se lee a la distancia de una
 *  mesa sin tener que recolocar cada pieza. */
const ESCALA_PUERTA = 1.18;
const puerta = `translate(${GX} ${SUELO}) scale(${ESCALA_PUERTA}) translate(${-GX} ${-SUELO})`;

/** La rótula: arco exterior e interior. El hueco de la membrana es lo
 *  que queda debajo del interior. */
const ROTULA_EXT = 'M528 178 Q600 64 672 178 L652 178 Q600 104 548 178 Z';
const ROTULA_INT = { p0: [572, 178], p1: [600, 130], p2: [628, 178] } as const;
const enArco = (t: number): [number, number] => {
  const { p0, p1, p2 } = ROTULA_INT, u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
};

/** Nervio sensitivo (sube por el pilar de placas) y motor (baja por el
 *  de hueso). Son el mismo dibujo que el arco reflejo de un libro. */
const NERVIO_SUBE = 'M548 268 C540 262 538 250 538 236 L538 192 C538 160 556 118 580 98';
const NERVIO_BAJA = 'M620 98 C644 118 662 160 662 192 L662 232 C662 246 652 252 640 254';
const ZARCILLO = `M548 268 C536 262 530 278 ${CX + 24} 282`;

/** Los rótulos de la lámina, en coordenadas de la escena ya agrandada.
 *  Nombran las piezas del reflejo —nunca a nadie de la cola—: son la
 *  leyenda del dibujo, no una pista. */
const COTAS: { texto: string; desde: Punto; codo: Punto; hasta: Punto; lado: 'izq' | 'der' }[] = [
  { texto: 'GANGLIO', desde: [568, 46], codo: [536, 30], hasta: [470, 30], lado: 'izq' },
  { texto: 'NERVIO SENSITIVO', desde: [534, 168], codo: [492, 128], hasta: [430, 128], lado: 'izq' },
  { texto: 'RÓTULA', desde: [668, 132], codo: [704, 146], hasta: [748, 146], lado: 'der' },
  { texto: 'NERVIO MOTOR', desde: [676, 196], codo: [716, 186], hasta: [756, 186], lado: 'der' },
  { texto: 'MEMBRANA DE RAÍCES', desde: [622, 236], codo: [716, 226], hasta: [760, 226], lado: 'der' },
];

type Punto = [number, number];

/** Una curva suave por puntos (Catmull-Rom pasada a Bézier). */
function suave(pts: Punto[]): string {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1: Punto = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Punto = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

type Raiz = {
  d: string; ax: number; ay: number; arriba: boolean; grueso: number; retraso: number;
  hojas: { x: number; y: number; g: number }[];
  espinas: { x: number; y: number; g: number }[];
};

/**
 * Las raíces de la membrana. Con semilla: la misma capa crece siempre
 * igual, en todas las pantallas. Las de arriba cuelgan de la rótula y las
 * de abajo trepan del suelo; se cruzan en medio, que es lo que las hace
 * leerse como un tejido cerrado y no como una cortina.
 *
 * Tras la muda crecen más y más gruesas: la pierna se ha endurecido.
 */
function raices(capa: number): Raiz[] {
  const r = azar(capa === 2 ? 977 : 413);
  const out: Raiz[] = [];
  const nArriba = capa === 2 ? 9 : 7, nAbajo = capa === 2 ? 7 : 6;
  const lado = (x: number) => Math.min(HUECO[1] - 3, Math.max(HUECO[0] + 3, x));

  const una = (ax: number, ay: number, hasta: number, arriba: boolean) => {
    const pts: Punto[] = [[ax, ay]];
    const paso = 20;
    let x = ax;
    const dir = arriba ? 1 : -1;
    for (let y = ay + dir * paso; arriba ? y < hasta : y > hasta; y += dir * paso) {
      x = lado(x + (r() - 0.5) * 16);
      pts.push([x, y]);
    }
    pts.push([lado(x + (r() - 0.5) * 10), hasta]);
    const hojas: Raiz['hojas'] = [], espinas: Raiz['espinas'] = [];
    pts.slice(1).forEach(([px, py]) => {
      if (r() < 0.42) hojas.push({ x: px + (r() < 0.5 ? -4 : 4), y: py, g: Math.round(r() * 180) });
      if (r() < 0.5) espinas.push({ x: px, y: py + (r() - 0.5) * 8, g: r() < 0.5 ? -1 : 1 });
    });
    out.push({
      d: suave(pts), ax, ay, arriba,
      grueso: (capa === 2 ? 2.6 : 2) + r() * 1.2,
      retraso: Math.round(r() * 1400),
      hojas, espinas,
    });
  };

  for (let k = 0; k < nArriba; k++) {
    const [ax, ay] = enArco(0.08 + (0.84 * k) / (nArriba - 1));
    una(ax, ay + 2, SUELO - 6 - r() * 46, true);
  }
  for (let k = 0; k < nAbajo; k++) {
    const ax = HUECO[0] + 6 + ((HUECO[1] - HUECO[0] - 12) * k) / (nAbajo - 1);
    una(ax, SUELO, 186 + r() * 70, false);
  }
  return out;
}

/** El tejido del fondo: pistas de circuito a la izquierda, fibras de
 *  músculo a la derecha. La pierna es mitad máquina y mitad carne. */
function fondo() {
  const r = azar(2026);
  const pistas: string[] = [];
  const vias: Punto[] = [];
  const DIR8: Punto[] = [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1]];
  for (let k = 0; k < 11; k++) {
    let x = 20 + r() * 480, y = 30 + r() * 270;
    let d = Math.floor(r() * 8);
    const pts: Punto[] = [[x, y]];
    for (let s = 0; s < 4 + Math.floor(r() * 4); s++) {
      if (r() < 0.55) d = (d + (r() < 0.5 ? 1 : 7)) % 8;
      const L = 24 + r() * 46;
      const [dx, dy] = DIR8[d];
      x = Math.max(8, Math.min(520, x + dx * L));
      y = Math.max(16, Math.min(318, y + dy * L));
      pts.push([x, y]);
    }
    pistas.push('M' + pts.map(([a, b]) => `${a.toFixed(0)} ${b.toFixed(0)}`).join(' L'));
    vias.push(pts[pts.length - 1]);
  }
  const fibras: string[] = [];
  for (let k = 0; k < 9; k++) {
    const y0 = 20 + k * 36 + r() * 14;
    fibras.push(`M${680 + r() * 30} ${y0} C${760 + r() * 40} ${y0 - 30 + r() * 60} ${860 + r() * 30} ${y0 + 10 + r() * 40} ${W + 10} ${y0 + 20 + r() * 30}`);
  }
  // Las raíces de verdad, bajo tierra: el jardín de la 2.0 creciendo
  // hacia abajo. Lo de arriba se mueve; esto se queda quieto.
  const subsuelo = [90, 300, 600, 830].map((x, i) =>
    crece({
      x, y: SUELO + 2, dir: 2, rnd: azar(91 + i * 7), caja: [0, SUELO + 2, W, H - 2],
      paso: [6, 12], largo: [3, 7], giro: 0.4, rama: 0.4, prof: 3, sesgo: 2, tiron: 0.2,
      hoja: 0.18, tamHoja: 4, flor: 0, max: 60,
    }));
  const hierba = Array.from({ length: 46 }, (_, i) => {
    const x = 8 + i * 21 + r() * 10;
    return { x, h: 4 + r() * 8, g: (r() - 0.5) * 6 };
  }).filter((h) => h.x < HUECO[0] - 26 || h.x > HUECO[1] + 26);
  return { pistas, vias, fibras, subsuelo, hierba };
}

// ---------- el reloj de la escena ----------

type Paso = { ciclo: number; i: number; etapa: Etapa };

function siguiente(p: Paso, n: number): Paso {
  switch (p.etapa) {
    case 'espera': return { ...p, etapa: 'llega' };
    case 'llega': return { ...p, etapa: 'palpa' };
    case 'palpa': return { ...p, etapa: 'decide' };
    case 'decide': return { ...p, etapa: 'veredicto' };
    case 'veredicto': return p.i + 1 < n ? { ...p, i: p.i + 1, etapa: 'llega' } : { ...p, etapa: 'fin' };
    case 'fin': return { ciclo: p.ciclo + 1, i: 0, etapa: 'espera' };
  }
}

const reducido = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Modo = 'cola' | 'candidato' | 'entrando' | 'rebotando' | 'dentro' | 'fuera';

/** Dónde está cada programa en este instante del reflejo. */
function sitio(j: number, p: Paso, cola: Cuidador[]): { x: number; y: number; modo: Modo; esc: number } {
  const dentroIdx = cola.slice(0, j).filter((c) => c.pasa).length;
  const dentro = (modo: Modo) => {
    const fila = Math.floor(dentroIdx / POR_FILA);
    return {
      x: DENTRO0 + (dentroIdx % POR_FILA) * DENTRO_PASO + fila * 18,
      y: SUELO - fila * 10, modo, esc: 1 - fila * 0.1,
    };
  };
  // Con muchos en la fila se aprietan y encogen un poco, en vez de salirse
  // por el borde de la cámara: dieciséis programas no caben a 44 px.
  const paso = Math.min(COLA_PASO, (COLA0 - 26) / Math.max(1, cola.length - 2));
  const esc = Math.min(1, paso / 36);
  const enCola = (slot: number) => ({ x: COLA0 - slot * paso, y: SUELO, modo: 'cola' as Modo, esc });

  const hecho = j < p.i || (j === p.i && p.etapa === 'fin');
  if (hecho) return cola[j].pasa ? dentro('dentro') : { x: FUERA, y: SUELO, modo: 'fuera', esc: 1 };
  if (j === p.i) {
    if (p.etapa === 'espera') return enCola(0);
    if (p.etapa === 'veredicto') {
      return cola[j].pasa ? dentro('entrando') : { x: FUERA, y: SUELO, modo: 'rebotando', esc: 1 };
    }
    return { x: CX, y: SUELO, modo: 'candidato', esc: 1 };
  }
  return enCola(p.etapa === 'espera' ? j - p.i : j - p.i - 1);
}

/** Un programa, con las patas en el origen: una cápsula de circuito con
 *  tres pares de patillas —anda como un bicho— y un brote en la antena.
 *  Lo artificial que se comporta como algo vivo, que es la máquina
 *  entera. Va en `currentColor` para no romper el duotono. */
export function Silueta({ nuevo }: { nuevo?: boolean }) {
  return (
    <g className="m-silueta">
      <g className="m-patas">
        <path className="izq" d="M-10 -12 L-15 -5 L-17 0 M-3 -11 L-5 -4 L-6 0" />
        <path className="der" d="M10 -12 L15 -5 L17 0 M3 -11 L5 -4 L6 0" />
      </g>
      <path className="m-cuerpo-prog" d="M-11 -52 L11 -52 L17 -44 L17 -18 L11 -10 L-11 -10 L-17 -18 L-17 -44 Z" />
      <rect className="m-pantallita" x="-10" y="-45" width="20" height="13" rx="2" />
      <circle className="m-led" cx="-4" cy="-38.5" r="2.4" />
      <circle className="m-led" cx="4" cy="-38.5" r="2.4" />
      <path className="m-pistas" d="M-12 -26 L-6 -26 L-3 -22 L3 -22 M12 -26 L7 -26 M-12 -18 L12 -18" />
      <g className={`m-brote${nuevo ? ' nuevo' : ''}`}>
        <path d="M0 -52 L0 -60" />
        <path d="M0 -57 L5 -61 L3.5 -56 Z" />
        <path d="M0 -55.5 L-4.5 -58.5 L-3.4 -54 Z" />
      </g>
    </g>
  );
}

// ---------- la escena ----------

export function Membrana({
  cola, capa = 1, resuelta = false, muda = 0, etiquetas = true, conSonido = true, sala = false,
}: {
  cola: Cuidador[];
  capa?: number;
  resuelta?: boolean;
  /** Contador de mudas. Cuando sube con la escena montada, se ve mudar. */
  muda?: number;
  /** Nombres y sello del veredicto. En la proyección van fuera: lo que
   *  se ve en la pared no puede decir por dónde va nadie. */
  etiquetas?: boolean;
  conSonido?: boolean;
  /** Para la proyección: más grande el trazo, sin rótulos de la cámara. */
  sala?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const quieto = useMemo(reducido, []);
  const geo = useMemo(() => raices(capa), [capa]);
  const tejido = useMemo(fondo, []);
  const clave = cola.map((c) => `${c.nombre}:${c.pasa ? 1 : 0}`).join('|') + `#${capa}`;

  // --- la muda ---
  // Se dispara con el CAMBIO del contador, no con su valor: quien entra
  // con la muda ya hecha ve la pierna mudada, no una muda que ya pasó.
  const [mudando, setMudando] = useState<null | 'cede' | 'seca' | 'cae' | 'brota'>(null);
  // Dos pasos separados a propósito: uno decide CUÁNDO empieza (y anota
  // que esta muda ya se vio) y otro reparte las etapas desde ese instante.
  // Juntos, repetir el efecto —React lo hace al montar en desarrollo—
  // cancelaba los relojes y la escena se quedaba congelada en la primera.
  const [mudaDesde, setMudaDesde] = useState<number | null>(null);
  // En la sala no se recuerda nada: allí la muda no ocurre nunca.
  const mudaVista = useRef(sala ? muda : (mudaYaVista() ?? muda));
  useEffect(() => {
    if (!sala) guardarMudaVista(Math.max(muda, mudaVista.current));
    if (muda <= mudaVista.current) { mudaVista.current = muda; return; }
    mudaVista.current = muda;
    if (!quieto) setMudaDesde(Date.now());
  }, [muda, quieto, sala]);
  useEffect(() => {
    if (mudaDesde === null) return;
    const t = MUDA_MS;
    const pasado = Date.now() - mudaDesde;
    const etapas: [number, 'cede' | 'seca' | 'cae' | 'brota' | null][] = [
      [0, 'cede'], [t.cede, 'seca'], [t.cede + t.seca, 'cae'],
      [t.cede + t.seca + t.cae, 'brota'], [t.cede + t.seca + t.cae + t.brota, null],
    ];
    const relojes = etapas.map(([en, etapa]) => setTimeout(() => {
      setMudando(etapa);
      if (!conSonido) return;
      if (etapa === 'cede') sonar('victoria');
      if (etapa === 'seca') sonar('muda');
    }, Math.max(0, en - pasado)));
    return () => relojes.forEach(clearTimeout);
  }, [mudaDesde, conSonido]);

  // Las raíces que se secan son las de ANTES de la muda: mientras dura,
  // se siguen pintando las de la capa vieja.
  const geoVieja = useMemo(() => raices(Math.max(1, capa - 1)), [capa]);
  const raicesAhora = mudando === 'cede' || mudando === 'seca' || mudando === 'cae' ? geoVieja : geo;

  // --- la rendición ---
  const [rindiendo, setRindiendo] = useState(false);
  const eraResuelta = useRef(resuelta);
  useEffect(() => {
    const acaba = !eraResuelta.current && resuelta;
    eraResuelta.current = resuelta;
    if (!acaba || quieto) return;
    setRindiendo(true);
    if (conSonido) sonar('abre');
    const t = setTimeout(() => setRindiendo(false), 3600);
    return () => clearTimeout(t);
  }, [resuelta, quieto, conSonido]);

  // --- el reflejo ---
  const n = cola.length;
  const final: Paso = { ciclo: 0, i: Math.max(0, n - 1), etapa: 'fin' };
  const [paso, setPaso] = useState<Paso>(() => (quieto || resuelta ? final : { ciclo: 0, i: 0, etapa: 'espera' }));
  const anda = !quieto && !resuelta && mudando === null && n > 0;

  // Otro reglamento, otra cola: el bucle vuelve a empezar desde el
  // primero. Con el mismo, sigue donde iba.
  const vista = useRef(clave);
  useEffect(() => {
    if (vista.current === clave) return;
    vista.current = clave;
    setPaso((p) => (quieto || resuelta ? final : { ciclo: p.ciclo + 1, i: 0, etapa: 'espera' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  useEffect(() => { if (resuelta) setPaso((p) => ({ ...final, ciclo: p.ciclo + 1 })); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [resuelta]);

  useEffect(() => {
    if (!anda) return;
    const t = setTimeout(() => setPaso((p) => siguiente(p, n)), DUR[paso.etapa]);
    return () => clearTimeout(t);
  }, [paso, anda, n]);

  const actual = cola[Math.min(paso.i, n - 1)];
  const enJuego = paso.etapa === 'llega' || paso.etapa === 'palpa' || paso.etapa === 'decide' || paso.etapa === 'veredicto';

  // El sonido va con lo que se ve, no con el servidor.
  useEffect(() => {
    if (!conSonido || !anda || !actual) return;
    if (paso.etapa === 'palpa') sonar('palpa');
    else if (paso.etapa === 'decide') sonar('impulso');
    else if (paso.etapa === 'veredicto') sonar(actual.pasa ? 'abre' : 'cierra');
  }, [paso, conSonido, anda, actual]);

  const estado = resuelta || rindiendo ? 'rendida'
    : mudando ? `muda-${mudando}`
    : paso.etapa === 'veredicto' && actual ? (actual.pasa ? 'abre' : 'rechaza')
    : paso.etapa === 'palpa' || paso.etapa === 'decide' ? 'alerta'
    : 'cerrada';

  const mirada = paso.etapa === 'palpa' ? 'mira' : paso.etapa === 'decide' ? 'piensa'
    : paso.etapa === 'veredicto' && actual ? (actual.pasa ? 'calma' : 'furia') : 'vela';

  return (
    <svg
      className={`membrana${sala ? ' sala' : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      data-estado={estado}
      data-capa={capa}
      data-mirada={resuelta ? 'duerme' : mirada}
      role="img"
      aria-label={actual && enJuego ? `Membrana: ${actual.nombre} ${paso.etapa === 'veredicto' ? (actual.pasa ? 'pasa' : 'no pasa') : 'en la membrana'}` : 'La membrana de la rodilla'}
    >
      <defs>
        <filter id={`brillo-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id={`halo-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: 'var(--m-halo)', stopOpacity: 0.55 }} />
          <stop offset="100%" style={{ stopColor: 'var(--m-halo)', stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id={`velo-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--m-velo)', stopOpacity: 0.05 }} />
          <stop offset="60%" style={{ stopColor: 'var(--m-velo)', stopOpacity: 0.18 }} />
          <stop offset="100%" style={{ stopColor: 'var(--m-velo)', stopOpacity: 0.04 }} />
        </linearGradient>
        <clipPath id={`izq-${uid}`}><rect x="0" y="0" width={GX} height={H} /></clipPath>
        <clipPath id={`der-${uid}`}><rect x={GX} y="0" width={W - GX} height={H} /></clipPath>
      </defs>

      {/* ── el tejido del fondo ── */}
      <g className="m-fondo" aria-hidden="true">
        {tejido.pistas.map((d, i) => <path key={i} className="m-pista" d={d} />)}
        {tejido.vias.map(([x, y], i) => <rect key={i} className="m-via" x={x - 2.5} y={y - 2.5} width="5" height="5" />)}
        {tejido.fibras.map((d, i) => <path key={i} className="m-fibra" d={d} style={{ animationDelay: `${-i * 0.7}s` }} />)}
      </g>

      {/* ── el suelo y lo que hay debajo ── */}
      <g className="m-suelo" aria-hidden="true">
        {tejido.subsuelo.map((pl, k) => (
          <g key={k}>
            {pl.tallos.map((t, i) => (
              <polyline key={i} className={`m-sub p${Math.min(t.prof, 3)}`} points={t.pts.map((q) => q.join(',')).join(' ')} />
            ))}
            {pl.vias.filter((v) => !v.raiz).map((v, i) => <rect key={i} className="m-sub-via" x={v.x - 1.5} y={v.y - 1.5} width="3" height="3" />)}
          </g>
        ))}
        <line className="m-horizonte" x1="0" y1={SUELO} x2={W} y2={SUELO} />
        {tejido.hierba.map((h, i) => (
          <path key={i} className="m-hierba" d={`M${h.x} ${SUELO} l${h.g * 0.4} ${-h.h} M${h.x + 3} ${SUELO} l${h.g} ${-h.h * 0.7}`}
                style={{ animationDelay: `${-(i % 7) * 0.4}s` }} />
        ))}
      </g>

      {/* ── la pierna: el contorno y sus rótulos, como en una lámina ── */}
      <g className="m-anatomia" aria-hidden="true">
        <path className="m-contorno" d="M250 -10 C300 80 420 150 512 176 M470 -10 C500 60 560 92 690 150 M686 182 C740 230 790 300 840 410 M540 340 C600 360 660 380 700 410" />
        {COTAS.map((c) => (
          <g key={c.texto} className="m-cota">
            <circle cx={c.desde[0]} cy={c.desde[1]} r="2.2" />
            <path d={`M${c.desde[0]} ${c.desde[1]} L${c.codo[0]} ${c.codo[1]} L${c.hasta[0]} ${c.codo[1]}`} />
            <text x={c.hasta[0] + (c.lado === 'der' ? 5 : -5)} y={c.codo[1] + 3}
                  textAnchor={c.lado === 'der' ? 'start' : 'end'}>{c.texto}</text>
          </g>
        ))}
      </g>

      {/* ── la membrana ── */}
      <g transform={puerta}>
      <g className="m-puerta">
        <rect className="m-velo" x={HUECO[0]} y="150" width={HUECO[1] - HUECO[0]} height={SUELO - 150} fill={`url(#velo-${uid})`} />
        <rect className="m-velo-alarma" x={HUECO[0]} y="150" width={HUECO[1] - HUECO[0]} height={SUELO - 150} />

        <g className={`m-raices${mudando === 'brota' ? ' brotando' : ''}`}>
          {raicesAhora.map((rz, i) => (
            <g key={`${capa}-${mudando === 'cede' || mudando === 'seca' || mudando === 'cae' ? 'v' : 'n'}-${i}`} className={`m-raiz-g ${rz.arriba ? 'cuelga' : 'trepa'}`}
               style={{ transformOrigin: `${rz.ax}px ${rz.ay}px`, animationDelay: `${-rz.retraso}ms` } as CSSProperties}>
              <path className="m-raiz" d={rz.d} pathLength={1}
                    style={{ ['--grueso' as string]: rz.grueso, transitionDelay: `${(i % 5) * 40}ms` } as CSSProperties} />
              {rz.espinas.map((e, k) => (
                <path key={`e${k}`} className="m-espina" d={`M${e.x} ${e.y - 2.4} L${e.x + 7 * e.g} ${e.y} L${e.x} ${e.y + 2.4} Z`}
                      style={{ transformOrigin: `${e.x}px ${e.y}px`, transitionDelay: `${(k % 4) * 45}ms` }} />
              ))}
              {rz.hojas.map((h, k) => (
                <path key={`h${k}`} className="m-hoja" d={`M${h.x} ${h.y - 4} L${h.x + 4} ${h.y} L${h.x} ${h.y + 4} L${h.x - 4} ${h.y} Z`}
                      style={{ transformOrigin: `${h.x}px ${h.y}px`, ['--g' as string]: `${h.g}deg`, ['--k' as string]: k } as CSSProperties} />
              ))}
            </g>
          ))}
        </g>

        {/* Las hojas que se lleva la muda, cayendo. */}
        {(mudando === 'seca' || mudando === 'cae' || rindiendo) && (
          <g className="m-hojarasca" aria-hidden="true">
            {geoVieja.flatMap((rz) => rz.hojas).slice(0, 34).map((h, k) => (
              <path key={k} className="m-hoja-cae" d={`M${h.x} ${h.y - 4} L${h.x + 4} ${h.y} L${h.x} ${h.y + 4} L${h.x - 4} ${h.y} Z`}
                    style={{ transformOrigin: `${h.x}px ${h.y}px`, ['--caida' as string]: `${SUELO - h.y - 2}px`,
                             ['--deriva' as string]: `${((k * 37) % 50) - 25}px`, animationDelay: `${(k % 12) * 90}ms` } as CSSProperties} />
            ))}
          </g>
        )}

        {/* Pilar de placas: lo mecánico. */}
        <g className="m-pilar mecanico">
          <rect x="548" y="176" width="24" height={SUELO - 176} />
          {[196, 222, 248, 274, 300, 326].map((y) => <line key={y} x1="548" y1={y} x2="572" y2={y} />)}
          {[186, 238, 290].map((y) => <circle key={y} className="m-remache" cx="553" cy={y} r="1.6" />)}
          {[186, 238, 290].map((y) => <circle key={`d${y}`} className="m-remache" cx="567" cy={y} r="1.6" />)}
          <rect className="m-piston" x="555" y="206" width="10" height="38" />
        </g>
        {/* Pilar de hueso: lo vivo. */}
        <g className="m-pilar organico">
          <path d={`M628 178 C626 210 632 240 629 270 C627 300 632 320 630 ${SUELO} L652 ${SUELO} C654 318 649 296 651 268 C653 238 648 206 652 178 Z`} />
          <path className="m-veta" d="M636 190 C642 214 634 236 641 262 C646 282 637 306 643 330" />
          <path className="m-veta" d="M646 200 C641 222 648 246 643 270" />
        </g>

        {/* La rótula: mitad placa, mitad mármol. */}
        <path className="m-rotula mecanica" d={ROTULA_EXT} clipPath={`url(#izq-${uid})`} />
        <path className="m-rotula organica" d={ROTULA_EXT} clipPath={`url(#der-${uid})`} />
        <g className="m-rotula-detalle">
          <path d="M545 158 L560 140 M562 130 L578 116 M552 168 L572 146" />
          <path className="m-veta" d="M612 112 C626 122 636 138 650 160 M622 126 C632 140 638 150 642 166" />
        </g>

        {/* Las grietas de la rótula: se abren al superar la capa 1 y se
            quedan. La pierna mudada lleva la marca de lo que ya cedió. */}
        <g className={`m-grietas${mudando === 'cede' ? ' abriendo' : ''}`} aria-hidden="true">
          <path pathLength={1} d="M600 98 L593 112 L603 124 L595 138 L601 152 L596 166 L600 176" />
          <path pathLength={1} d="M593 112 L578 118 L570 132 M603 124 L618 128 L628 142 M595 138 L582 150 M601 152 L614 160" />
        </g>
        {mudando === 'cede' && (
          <g className="m-estallido" transform="translate(600 130)" aria-hidden="true">
            {Array.from({ length: 20 }, (_, k) => (
              <path key={k} d="M0 -5 L4 0 L0 5 L-4 0 Z"
                    style={{ ['--a' as string]: `${k * 18}deg`, ['--k' as string]: k } as CSSProperties} />
            ))}
          </g>
        )}

        {/* Lo que florece cuando la pierna se rinde. */}
        <g className="m-flores" aria-hidden="true">
          {[[548, 176], [584, 124], [618, 122], [654, 168], [560, 230], [650, 214], [561, 300], [641, 292]].map(([x, y], k) => (
            <g key={k} className="m-flor" style={{ transformOrigin: `${x}px ${y}px`, transitionDelay: `${300 + k * 160}ms` } as CSSProperties}>
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse key={a} cx={x} cy={y - 4.5} rx="2.6" ry="4.6" transform={`rotate(${a} ${x} ${y})`} />
              ))}
              <circle className="m-flor-centro" cx={x} cy={y} r="2" />
            </g>
          ))}
        </g>
      </g>

      {/* ── el arco reflejo ── */}
      <g className="m-arco">
        <path className="m-nervio sube" d={NERVIO_SUBE} />
        <path className="m-nervio baja" d={NERVIO_BAJA} />
        <path className="m-zarcillo" d={ZARCILLO} pathLength={1} />
        <circle className="m-yema" cx={CX + 22} cy={286} r="3" />
        {paso.etapa === 'palpa' && anda && (
          <path key={`s${paso.ciclo}-${paso.i}`} className="m-impulso sube" d={NERVIO_SUBE} pathLength={1} filter={`url(#brillo-${uid})`} />
        )}
        {paso.etapa === 'decide' && anda && (
          <path key={`b${paso.ciclo}-${paso.i}`} className="m-impulso baja" d={NERVIO_BAJA} pathLength={1} filter={`url(#brillo-${uid})`} />
        )}

        {/* El ganglio: quien decide. Tiene ojo porque palpa; no tiene boca
            porque no explica. */}
        <g className="m-ganglio" transform={`translate(${GANGLIO[0]} ${GANGLIO[1]})`}>
          <circle className="m-halo" r="46" fill={`url(#halo-${uid})`} />
          <path className="m-dendrita" d="M-24 -6 L-38 -14 L-46 -10 M-38 -14 L-40 -26 M24 -6 L38 -16 L48 -12 M38 -16 L36 -28 M-10 -24 L-14 -38 M10 -24 L16 -38 L24 -40" />
          <path className="m-cuerpo" d="M0 -27 C14 -27 25 -16 26 -2 C27 12 18 25 2 26 C-14 27 -26 16 -26 0 C-26 -15 -15 -27 0 -27 Z" />
          <g className="m-ojo">
            <ellipse className="m-esclera" rx="15" ry="9.5" />
            <g className="m-iris"><circle r="6.4" /><circle className="m-pupila" r="2.6" /></g>
            <path className="m-parpado arriba" d="M-16 0 C-10 -12 10 -12 16 0 L16 -14 L-16 -14 Z" />
            <path className="m-parpado abajo" d="M-16 0 C-10 12 10 12 16 0 L16 14 L-16 14 Z" />
          </g>
        </g>
      </g>
      </g>

      {/* ── los programas ── */}
      <g className="m-gente">
        {cola.map((c, j) => {
          const s = sitio(j, paso, cola);
          const mueve = s.modo === 'entrando' || s.modo === 'rebotando'
            || (paso.etapa === 'llega' && (s.modo === 'candidato' || s.modo === 'cola'))
            || (paso.etapa === 'espera' && s.modo === 'cola');
          return (
            <g
              key={`${paso.ciclo}-${j}`}
              className={`m-cuidador m-${s.modo}${mueve ? ' anda' : ''}${j === paso.i && enJuego ? ' turno' : ''}${c.nuevo ? ' nuevo' : ''}`}
              style={{ transform: `translate(${s.x}px, ${s.y}px) scale(${s.esc})`, ['--j' as string]: j } as CSSProperties}
            >
              <g className="m-cuerpo-anda"><Silueta nuevo={c.nuevo} /></g>
            </g>
          );
        })}
      </g>

      {/* ── el rótulo de quien está en la membrana ── */}
      {etiquetas && actual && enJuego && (
        <g className="m-etiqueta" key={`${paso.ciclo}-${paso.i}`}>
          <text className="m-nombre" x={CX} y={236} textAnchor="middle">{actual.nombre}</text>
          {/* De dónde viene solo se sabe aquí, mientras la membrana lo
              palpa: no está en ninguna tabla. Por eso dura lo que dura
              el turno de cada uno y hay que mirar la fila entera. */}
          {actual.origen && paso.etapa !== 'llega' && (
            <text className="m-origen" x={CX} y={253} textAnchor="middle">viene de: {actual.origen}</text>
          )}
          {paso.etapa === 'palpa' && <text className="m-palpando" x={CX} y={218} textAnchor="middle">palpando…</text>}
          {paso.etapa === 'veredicto' && (
            <text className={`m-sello ${actual.pasa ? 'pasa' : 'alto'}`} x={CX} y={212} textAnchor="middle">
              {actual.pasa ? 'PASA' : 'ALTO'}
            </text>
          )}
        </g>
      )}

      {mudando && (
        <g className={`m-muda-rotulo ${mudando}`} key={mudando === 'cede' ? 'cede' : 'muda'} role="status"
           aria-label={mudando === 'cede' ? 'Capa 1 superada' : 'Capa 2: la muda'}>
          <rect className="m-muda-banda" x="0" y={mudando === 'cede' ? 86 : 100} width={W} height={mudando === 'cede' ? 96 : 66} />
          {mudando === 'cede' ? (
            <>
              <text className="kick" x={W / 2} y={112} textAnchor="middle">[OK] LA RÓTULA CEDE</text>
              <text x={W / 2} y={152} textAnchor="middle">CAPA 1 SUPERADA</text>
              <text className="sub" x={W / 2} y={174} textAnchor="middle">sus esporas ya están dentro</text>
            </>
          ) : (
            <>
              <text x={W / 2} y={134} textAnchor="middle">CAPA 2 · LA MUDA</text>
              <text className="sub" x={W / 2} y={156} textAnchor="middle">
                {mudando === 'brota' ? 'la pierna levanta otra defensa' : 'la pierna muda la piel: lo que nombraba a alguien se seca'}
              </text>
            </>
          )}
        </g>
      )}
    </svg>
  );
}

// ============================================================
//  EL INTERIOR · la segunda cámara
//
//  Lo que ha cruzado, dentro de la rodilla. Por cada programa brota una
//  planta: lo que entra en la máquina se queda a vivir en ella.
// ============================================================

const hash = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

export function Interior({ dentro, resuelta = false }: { dentro: string[]; resuelta?: boolean }) {
  const plantas = useMemo(() => {
    // Centradas: con dos dentro no pueden quedarse arrinconadas a la izquierda.
    const n = Math.min(dentro.length, 9), paso = 96;
    const x0 = W / 2 - ((n - 1) * paso) / 2;
    return dentro.map((u, k) => {
      const x = x0 + (k % 9) * paso + Math.floor(k / 9) * 48;
      return {
        u, x,
        pl: crece({
          x, y: SUELO - 2, dir: 6, rnd: azar(hash(u)), caja: [x - 52, 110, x + 52, SUELO - 2],
          paso: [7, 13], largo: [3, 7], giro: 0.4, rama: 0.5, prof: 4, sesgo: 6, tiron: 0.4,
          hoja: 0.5, tamHoja: 7, flor: 0.45, tamFlor: 3.4, max: 80,
        }),
      };
    });
  }, [dentro]);
  const esporas = useMemo(() => {
    const r = azar(5);
    return Array.from({ length: 16 }, () => ({ x: 40 + r() * 880, y: 160 + r() * 170, d: r() * 6, t: 5 + r() * 5 }));
  }, []);

  return (
    <svg className={`interior${resuelta ? ' rendida' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img"
         aria-label={dentro.length ? `Dentro: ${dentro.join(', ')}` : 'No ha entrado nada'}>
      <path className="i-cueva" d={`M0 ${SUELO} L0 120 C120 40 300 20 480 22 C660 20 840 40 ${W} 120 L${W} ${SUELO} Z`} />
      <path className="i-costilla" d="M60 330 C70 200 150 110 250 74 M900 330 C890 200 810 110 710 74 M480 24 L480 60" />
      <line className="m-horizonte" x1="0" y1={SUELO} x2={W} y2={SUELO} />
      {esporas.map((e, i) => (
        <circle key={i} className="i-espora" cx={e.x} cy={e.y} r="1.8"
                style={{ animationDelay: `${-e.d}s`, animationDuration: `${e.t}s` }} />
      ))}
      {plantas.map(({ u, x, pl }, k) => (
        <g key={u} className="i-planta" style={{ ['--k' as string]: k } as CSSProperties}>
          {pl.tallos.map((t, i) => (
            <polyline key={i} className={`i-tallo p${Math.min(t.prof, 3)}`} pathLength={1}
                      points={t.pts.map((q) => q.join(',')).join(' ')} />
          ))}
          {pl.hojas.map((h, i) => (
            <path key={`h${i}`} className="i-hoja" d={`M${h.x} ${h.y - 3.5} L${h.x + 3.5} ${h.y} L${h.x} ${h.y + 3.5} L${h.x - 3.5} ${h.y} Z`} />
          ))}
          {pl.flores.map((f, i) => <circle key={`f${i}`} className="i-flor" cx={f.x} cy={f.y} r={f.tam} />)}
          <g className="m-cuidador m-dentro" style={{ transform: `translate(${x}px, ${SUELO}px)` }}>
            <g className="m-cuerpo-anda"><Silueta /></g>
          </g>
          <text className="i-nombre" x={x} y={SUELO + 18} textAnchor="middle">{u}</text>
        </g>
      ))}
      {dentro.length === 0 && (
        <text className="i-vacio" x={W / 2} y={220} textAnchor="middle">no ha entrado nada</text>
      )}
    </svg>
  );
}
