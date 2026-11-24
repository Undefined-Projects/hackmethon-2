import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { sonar } from '../../lib/sonido';
import { columna, useCaminata, type Accion, type Ritmo } from './caminata';
import { Marana3D } from './Marana3D';

// ============================================================
//  LA MARAÑA · lo que ve Pantalla en la Fase 1 (y en el bonus)
//
//  La pierna izquierda vista desde arriba: un laberinto de seto —mitad
//  hoja, mitad placa de circuito— que creció con los años. Los brotes del
//  equipo nacen en su semillero y andan lo que les dice su programa,
//  casilla a casilla.
//
//  El brote es una FLECHA, como Karel: lo único que importa de él es
//  dónde está y hacia dónde apunta, porque izquierda y derecha son las
//  suyas. Es la lección del semillero.
//
//  En EL SEMILLERO y en EL SETO sale un brote y se ve todo, menos las
//  espinas del seto, que el plano pinta como camino.
//
//  Un brote que no llega SE DESCONECTA, y Pantalla no sabe más: ni si chocó,
//  ni si pisó una espina o una mina, ni si se le acabó el programa. Eso
//  queda en su bitácora, en la base de datos de Datos.
//
//  En LA ESPESURA salen CUATRO, uno por esquina, a compás, cada uno de su
//  color, hacia el claro del centro. Está oscuro: se ve lo que alumbran al
//  pasar, y lo alumbrado se queda encendido de un lanzamiento al otro.
//
//  El servidor manda el lanzamiento entero ya resuelto; aquí se anda con
//  el reloj de `caminata.ts`, el mismo que usa Datos para su programa.
// ============================================================

type Celda = [number, number];
/** Lo único que Pantalla sabe de cómo acabó un brote. */
export type Fin = 'salida' | 'desconectado';
export type Mundo = {
  capa: number;
  /** «semillero», «seto» o «espesura». */
  tipo?: string;
  /** Cómo se llama la capa: «el semillero». */
  nombre?: string;
  /** Lo que se le dice a Pantalla al llegar a ella. */
  lema?: string;
  filas: number; cols: number;
  /** El plano, fila a fila. `null` en la espesura: allí no viaja. */
  celdas: string[] | null;
  salida: Celda;
  /** Dónde nace cada brote y hacia dónde mira. En el seto, uno. */
  brotes: { entrada: Celda; rumbo: number }[];
  /** Espesura: lo que ya se alumbró en lanzamientos anteriores. */
  conocidas?: [number, number, string][];
};
export type BroteViaje = {
  entrada: Celda; rumbo: number;
  fin: Fin;
  pasos: [Accion, number, number, number][];
};
export type ViajePantalla = {
  n: number; capa: number;
  brotes: BroteViaje[];
  ritmo: Ritmo;
  mundo: Mundo;
  /** Espesura: lo que alumbran al nacer y lo NUEVO de cada golpe de reloj. */
  luz0?: [number, number, string][];
  luz?: [number, number, string][][];
};

const S = 40;          // lado de una casilla
const ML = 30;         // margen para los números de fila
const MT = 26;         // margen para las letras de columna
const v = (o: Record<string, string | number>) => o as CSSProperties;

const centro = (f: number, c: number): [number, number] => [ML + c * S + S / 2, MT + f * S + S / 2];
/** Cuánto se quedan los brotes marchitos, con su veredicto, antes de volver
 *  a la entrada. Lo que dura el letrero (`.mz-veredicto`, 4.4 s). */
const VUELTA_MS = 4400;
const hash = (a: number, b: number) => (((a * 73856093) ^ (b * 19349663)) >>> 0) % 1000;

const VEREDICTO: Record<Fin, { t: string; sub: string; corto: string }> = {
  salida: { t: 'LLEGÓ A LA SALIDA', sub: 'el brote arraiga', corto: 'llegó' },
  desconectado: { t: 'SE DESCONECTÓ', sub: 'sin señal · lo que le pasó quedó en la base de datos', corto: 'se desconectó' },
};

/** Un trozo de seto: la hoja y la placa de circuito en la misma casilla. */
function Seto({ f, c, filas, cols, flor }: { f: number; c: number; filas: number; cols: number; flor?: boolean }) {
  const x = ML + c * S, y = MT + f * S;
  const h = hash(f, c);
  const borde = f === 0 || c === 0 || f === filas - 1 || c === cols - 1;
  // Unas casillas tienen hojas, otras un chip incrustado, otras espinas de
  // adorno: el seto se lee como algo que creció, no como baldosas.
  const hojas = [
    { x: x + 8 + (h % 22), y: y + 9 + ((h >> 3) % 20), g: (h * 7) % 360 },
    { x: x + 10 + ((h >> 2) % 20), y: y + 12 + ((h >> 4) % 18), g: (h * 13) % 360 },
  ];
  return (
    <g className={`mz-seto${borde ? ' borde' : ''}`}>
      <rect x={x - 1} y={y - 1} width={S + 2} height={S + 2} rx="7" />
      {!borde && h % 3 === 0 && <path className="mz-pista" d={`M${x + 6} ${y + 20} H${x + 18} L${x + 24} ${y + 14} H${x + 34}`} />}
      {!borde && h % 5 === 1 && <rect className="mz-chip" x={x + 13} y={y + 13} width="14" height="14" rx="2" />}
      {hojas.slice(0, borde ? 1 : 2).map((o, k) => (
        <path key={k} className="mz-hoja" d={`M${o.x} ${o.y - 5} L${o.x + 4} ${o.y} L${o.x} ${o.y + 5} L${o.x - 4} ${o.y} Z`}
              style={v({ transformOrigin: `${o.x}px ${o.y}px`, '--g': `${o.g}deg`, '--k': (h % 7) })} />
      ))}
      {flor && !borde && h % 2 === 0 && (
        <g className="mz-flor" style={v({ transformOrigin: `${x + S / 2}px ${y + S / 2}px`, '--k': h % 9 })}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx={x + S / 2} cy={y + S / 2 - 5} rx="3" ry="5.4" transform={`rotate(${a} ${x + S / 2} ${y + S / 2})`} />
          ))}
          <circle className="mz-flor-centro" cx={x + S / 2} cy={y + S / 2} r="2.4" />
        </g>
      )}
    </g>
  );
}

/** El brote desde arriba: una FLECHA, en homenaje a Karel the Robot
 *  (Richard E. Pattis, 1981), el robot de flecha con el que generaciones
 *  aprendieron a programar. Una punta de flecha con la nervadura de una
 *  hoja, porque aquí la flecha es un brote. Va apuntando hacia arriba;
 *  quien la coloca la gira. */
export function BroteArriba() {
  return (
    <g className="mz-brote-cuerpo">
      <path className="mz-capsula" d="M0 -15 L12 11 L0 5 L-12 11 Z" />
      <path className="mz-vena" d="M0 -10 L0 4 M0 -4 L-4.5 2 M0 -4 L4.5 2" />
    </g>
  );
}

/** Cómo va un brote en el golpe de reloj `i`. */
type Estado = {
  f: number; c: number; ang: number; rastro: Celda[];
  /** Su acción de ahora, si aún anda. */
  paso: [Accion, number, number, number] | null;
  /** Cómo acabó, en cuanto acaba: los demás pueden seguir andando. */
  fin: Fin | null;
};

export function Marana({
  mundo, viaje, capa, resuelta = false, sala = false, conSonido = true, recordar = !sala,
  titulo = 'LA MARAÑA', final = { t: 'LA MARAÑA CRUZADA', sub: 'la pierna izquierda se queda sin trucos' },
}: {
  mundo: Mundo;
  viaje: ViajePantalla | null;
  capa: number;
  resuelta?: boolean;
  /** El nombre de la cámara: LA MARAÑA o LA ESPESURA. */
  titulo?: string;
  /** El letrero de cuando la fase se cruza. */
  final?: { t: string; sub: string };
  /** La proyección: sin rótulos, sin sonido y sin recordar nada. */
  sala?: boolean;
  conSonido?: boolean;
  /** Recordar en la pestaña qué viaje ya se vio. El banco de pruebas del
   *  panel no: repite viajes a propósito. */
  recordar?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  // Pantalla lo ve en primera persona, con el plano 2D de minimapa. La
  // proyección de sala (y el banco de escenas) sigue con el plano entero.
  const en3d = !sala;
  const suena = conSonido && !sala;
  // Andan a compás: el reloj es el del brote que más anda. En la espesura
  // todas las acciones duran lo mismo, así que da igual cuál; en el seto
  // solo hay uno.
  const acciones = useMemo(() => {
    const largo = viaje?.brotes.reduce((a, b) => (b.pasos.length > a.length ? b.pasos : a), [] as BroteViaje['pasos']) ?? [];
    return largo.map((p) => p[0]);
  }, [viaje]);
  const camino = useCaminata(
    viaje ? { n: viaje.n, acciones, ritmo: viaje.ritmo } : null,
    recordar ? 'hm:marana-visto' : null,
  );
  const { i, etapa } = camino;
  const varios = (viaje?.brotes.length ?? mundo.brotes.length) > 1;

  // --- el paso de capa: la capa cede y llega la siguiente ---
  const [transicion, setTransicion] = useState<'no' | 'cede' | 'apaga' | 'hecha'>(
    // Al montar con el viaje que cruzó ya visto (quien recarga), el paso
    // de capa ya pasó. Sin recordar (el banco de pruebas), se anda siempre.
    () => (recordar && viaje && viaje.capa !== capa ? 'hecha' : 'no'),
  );
  useEffect(() => {
    if (!viaje || viaje.capa === capa) { setTransicion('no'); return; }
    if (etapa !== 'fin') return;
    if (!camino.recienVisto) { setTransicion('hecha'); return; }
    setTransicion('cede');
    if (suena) sonar('victoria');
    const a = setTimeout(() => { setTransicion('apaga'); if (suena) sonar('muda'); }, 3400);
    const b = setTimeout(() => setTransicion('hecha'), 6200);
    return () => { clearTimeout(a); clearTimeout(b); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viaje?.n, viaje?.capa, capa, etapa]);

  // --- los que no llegan vuelven a la entrada ---
  // En cuanto se ha dicho qué les pasó, los brotes vuelven al semillero,
  // listos para el siguiente lanzamiento. Quien recarga los encuentra ahí.
  const [devuelto, setDevuelto] = useState<number | null>(null);
  const llegaron = viaje ? viaje.brotes.filter((b) => b.fin === 'salida').length : 0;
  const fracaso = !!viaje && llegaron < viaje.brotes.length && viaje.capa === capa;
  useEffect(() => {
    if (!viaje || !fracaso || etapa !== 'fin') return;
    if (!camino.recienVisto) { setDevuelto(viaje.n); return; }
    const t = setTimeout(() => setDevuelto(viaje.n), VUELTA_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viaje?.n, fracaso, etapa]);

  // Qué se pinta: el viaje (con SU mundo) o el mundo de ahora con brotes
  // nuevos esperando en sus semilleros.
  const conViaje = !!viaje && etapa !== 'quieta' && devuelto !== viaje.n
    && !(viaje.capa !== capa && transicion === 'hecha');
  const m = conViaje ? viaje!.mundo : mundo;
  const oscuro = m.celdas === null;
  const acabado = conViaje && etapa === 'fin';

  // --- dónde está cada brote ---
  const brotes = useMemo((): Estado[] => {
    if (!conViaje || !viaje) {
      return m.brotes.map((b) => ({
        f: b.entrada[0], c: b.entrada[1], ang: b.rumbo * 90, rastro: [b.entrada],
        paso: null, fin: null,
      }));
    }
    return viaje.brotes.map((b) => {
      let ang = b.rumbo * 90;
      let f = b.entrada[0], c = b.entrada[1];
      const rastro: Celda[] = [[f, c]];
      for (let k = 0; k <= i && k < b.pasos.length; k++) {
        const [a, pf, pc] = b.pasos[k];
        if (a === 'gi') ang -= 90;
        else if (a === 'gd') ang += 90;
        else if (a === 'av') { f = pf; c = pc; rastro.push([f, c]); }
      }
      const anda = etapa === 'anda';
      // Uno acaba cuando se le terminan las acciones: el último del seto,
      // con el letrero; en la espesura, cada uno a su golpe de reloj.
      const fin = etapa === 'fin' || (anda && i >= b.pasos.length) ? b.fin : null;
      // El paso de la desconexión ya cuenta como acabado: se apaga ahí.
      const paso = anda && i >= 0 && i < b.pasos.length ? b.pasos[i] : null;
      return { f, c, ang, rastro, paso, fin: paso?.[0] === 'x' ? b.fin : fin };
    });
  }, [conViaje, viaje, i, etapa, m.brotes]);

  // --- el sonido va con lo que se ve ---
  const ultimoSonido = useRef('');
  useEffect(() => {
    if (!suena || !conViaje || !viaje) return;
    const k = `${viaje.n}:${etapa}:${i}`;
    if (k === ultimoSonido.current) return;
    ultimoSonido.current = k;
    if (etapa === 'nace') { sonar('brota'); return; }
    if (etapa === 'anda' && varios) {
      // Cuatro a compás: un paso de cada dos, y lo que importa —uno que
      // llega, uno que se desconecta— en su golpe.
      const acaban = viaje.brotes.filter((b) => b.pasos.length === i
        || (b.pasos[i]?.[0] === 'x'));
      if (acaban.some((b) => b.fin === 'desconectado')) sonar('estatica');
      else if (acaban.some((b) => b.fin === 'salida')) sonar('arraiga');
      else if (i % 2 === 0) sonar('paso', 0.6);
      return;
    }
    const paso = brotes[0]?.paso;
    if (etapa === 'anda' && paso) {
      if (paso[0] === 'av') sonar('paso');
      else if (paso[0] === 'x') sonar('estatica');
      else sonar('giro');
    } else if (etapa === 'fin' && camino.recienVisto) {
      if (llegaron === viaje.brotes.length) sonar('arraiga');
      else if (viaje.brotes[0].pasos[viaje.brotes[0].pasos.length - 1]?.[0] !== 'x') sonar('estatica');
    }
  }, [suena, conViaje, viaje, etapa, i, brotes, varios, llegaron, camino.recienVisto]);

  // --- la luz de la espesura ---
  const alumbradas = useMemo(() => {
    const mapa = new Map<string, string>();
    if (!oscuro) return mapa;
    const poner = (xs?: [number, number, string][]) => xs?.forEach(([f, c, ch]) => mapa.set(`${f},${c}`, ch));
    poner(m.conocidas);
    if (conViaje && viaje) {
      poner(viaje.luz0);
      for (let k = 0; k <= i && k < (viaje.luz?.length ?? 0); k++) poner(viaje.luz![k]);
    } else {
      // Un brote recién germinado alumbra su propia casilla, nada más.
      m.brotes.forEach((b) => { if (!mapa.has(`${b.entrada}`)) mapa.set(`${b.entrada}`, '.'); });
    }
    return mapa;
  }, [oscuro, conViaje, viaje, i, m.conocidas, m.brotes]);

  const W = ML + m.cols * S + 8;
  const H = MT + m.filas * S + 8;
  const flores = resuelta && (!conViaje || acabado);

  // El suelo y el seto no cambian a cada paso: solo cuando se alumbra algo.
  const nAlumbradas = alumbradas.size;
  const suelo = useMemo(() => {
    const out: ReactElement[] = [];
    for (let f = 0; f < m.filas; f++) {
      for (let c = 0; c < m.cols; c++) {
        const ch = oscuro ? alumbradas.get(`${f},${c}`) : m.celdas![f][c];
        if (ch === undefined) continue;
        out.push(ch === '#'
          ? <Seto key={`${f}-${c}`} f={f} c={c} filas={m.filas} cols={m.cols} flor={flores} />
          : (
            <g key={`${f}-${c}`} className="mz-camino">
              <rect x={ML + c * S} y={MT + f * S} width={S} height={S} />
              <circle cx={ML + c * S + S / 2} cy={MT + f * S + S / 2} r="1.4" />
            </g>
          ));
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, oscuro, nAlumbradas, flores]);

  // --- el letrero: lo que hay que cantar en voz alta ---
  const resumen = viaje ? viaje.brotes.map((b, k) => `${k + 1} ${VEREDICTO[b.fin].corto}`).join(' · ') : '';
  const solo = brotes[0];
  const finSolo = acabado && viaje ? viaje.brotes[0].fin : null;
  const letrero: { clase: string; t: string; sub: string } | null =
    !acabado || !camino.recienVisto || transicion === 'hecha' || !viaje ? null
      : transicion === 'cede' ? {
          clase: 'salida', t: `[OK] ${(viaje.mundo.nombre ?? 'la capa').toUpperCase()} CEDE`,
          sub: `capa ${viaje.capa} superada · el brote llegó a la salida`,
        }
      : transicion === 'apaga' ? {
          clase: 'apagon', t: `CAPA ${capa} · ${(mundo.nombre ?? '').toUpperCase()}`, sub: mundo.lema ?? '',
        }
      : resuelta && llegaron === viaje.brotes.length ? { clase: 'rendida', t: final.t, sub: final.sub }
      : varios ? {
          clase: llegaron === 0 ? 'desconectado' : 'parcial',
          t: `${llegaron} DE ${viaje.brotes.length} LLEGARON`,
          sub: `lanzamiento ${viaje.n} · ${resumen}`,
        }
      : { clase: finSolo!, t: VEREDICTO[finSolo!].t, sub: `brote ${viaje.n} · ${VEREDICTO[finSolo!].sub}` };

  // La barra del monitor: qué capa, y qué hacen los brotes. El desenlace
  // no se dice hasta que se ve.
  const quien = varios ? `lanzamiento ${viaje?.n ?? ''}` : `brote ${viaje?.n ?? ''}`;
  const estadoBrote = !viaje || !conViaje
    ? (varios ? 'cuatro brotes esperan a oscuras' : oscuro ? 'un brote espera a oscuras' : 'un brote espera en la entrada')
    : etapa === 'nace' ? `${quien} · germina${varios ? 'n' : ''}`
    : etapa === 'anda' ? `${quien} · en camino${varios ? ` · ${brotes.filter((b) => b.fin === 'salida').length} en el claro` : ''}`
    : varios ? `${quien} · ${llegaron} de ${viaje.brotes.length} llegaron`
    : `${quien} · ${VEREDICTO[viaje.brotes[0].fin].t.toLowerCase()}`;
  // Las coordenadas que se resaltan: las del brote, si solo hay uno.
  const aqui = !varios ? solo : null;
  const llegoAlguno = brotes.some((b) => b.fin === 'salida');
  const [sx, sy] = centro(m.salida[0], m.salida[1]);

  return (
    <div className={`marana-escena${sala ? ' sala' : ''}`}>
      {!sala && (
        <div className="cam-osd">
          <span className="cam-rec">REC</span>
          <span className="cam-nombre">{titulo}</span>
          <span className="cam-sector">capa {m.capa} · {m.nombre ?? (oscuro ? 'la espesura' : 'el seto')}</span>
          <span className={`mz-estado ${etapa}`}>{estadoBrote}</span>
        </div>
      )}
      {en3d && (
        <Marana3D mundo={m} viaje={conViaje ? viaje : null} i={conViaje ? i : -1} etapa={conViaje ? etapa : 'quieta'}
                  alumbradas={alumbradas} fines={brotes.map((b) => b.fin)} varios={varios} />
      )}
      {!en3d && <svg
        className={`marana${oscuro ? ' oscuro' : ''}${flores ? ' rendida' : ''}${varios ? ' varios' : ''}`}
        viewBox={`0 0 ${W} ${H}`}
        data-capa={m.capa}
        data-transicion={transicion}
        role="img"
        aria-label={oscuro ? 'La espesura, a oscuras' : `${m.nombre ?? 'El seto'}, visto desde arriba`}
      >
        <defs>
          <radialGradient id={`luz-${uid}`}>
            <stop offset="0%" style={{ stopColor: 'var(--clorofila-hi)', stopOpacity: 0.32 }} />
            <stop offset="100%" style={{ stopColor: 'var(--clorofila)', stopOpacity: 0 }} />
          </radialGradient>
          <radialGradient id={`claro-${uid}`}>
            <stop offset="0%" style={{ stopColor: 'var(--clorofila-hi)', stopOpacity: 0.9 }} />
            <stop offset="55%" style={{ stopColor: 'var(--clorofila)', stopOpacity: 0.25 }} />
            <stop offset="100%" style={{ stopColor: 'var(--clorofila)', stopOpacity: 0 }} />
          </radialGradient>
          <filter id={`brillo-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <rect className="mz-fondo" x={ML} y={MT} width={m.cols * S} height={m.filas * S} />

        {/* Las coordenadas: columna en letra, fila en número. Son las de la
            tabla de espinas (o de minas) y las de la bitácora. */}
        {!sala && (
          <g className="mz-coords" aria-hidden="true">
            {Array.from({ length: m.cols }, (_, c) => (
              <text key={`c${c}`} x={ML + c * S + S / 2} y={MT - 9} textAnchor="middle"
                    className={c === aqui?.c ? 'aqui' : ''}>{columna(c)}</text>
            ))}
            {Array.from({ length: m.filas }, (_, f) => (
              <text key={`f${f}`} x={ML - 8} y={MT + f * S + S / 2 + 3.5} textAnchor="end"
                    className={f === aqui?.f ? 'aqui' : ''}>{f + 1}</text>
            ))}
          </g>
        )}

        {/* el suelo y el seto */}
        {suelo}

        {/* los semilleros */}
        {m.brotes.map((b, k) => (
          <g key={`s${k}`} className={`mz-semillero b${k + 1}`} transform={`translate(${centro(b.entrada[0], b.entrada[1]).join(' ')})`}>
            <circle r="15" />
            <circle className="anillo" r="15" />
          </g>
        ))}
        {/* la salida: un claro donde entra la luz. Se ve aunque esté oscuro:
            es lo único que se sabe de la espesura. */}
        <g className="mz-claro" transform={`translate(${sx} ${sy})`}>
          <circle className="halo" r={S * 0.95} fill={`url(#claro-${uid})`} />
          <circle className="aro" r="12" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <path key={a} className="rayo" d="M0 -16 L0 -21" transform={`rotate(${a})`} />
          ))}
        </g>
        {!sala && (
          <>
            {m.brotes.map((b, k) => {
              const [x, y] = centro(b.entrada[0], b.entrada[1]);
              const abajo = b.entrada[0] < m.filas / 2;
              return (
                <text key={`r${k}`} className={`mz-rotulo b${k + 1}`} x={x} y={abajo ? y + 30 : y - 24} textAnchor="middle">
                  {varios ? `BROTE ${k + 1}` : 'ENTRADA'}
                </text>
              );
            })}
            <text className="mz-rotulo claro" x={sx} y={sy - 24} textAnchor="middle">{varios ? 'CLARO' : 'SALIDA'}</text>
          </>
        )}

        {/* el rastro: lo que cada brote ya anduvo, como musgo que brilla */}
        {conViaje && brotes.map((b, k) => b.rastro.length > 1 && (
          <polyline key={`t${k}`} className={`mz-rastro b${k + 1}${b.fin && b.fin !== 'salida' ? ' seco' : ''}`}
                    points={b.rastro.map(([f, c]) => centro(f, c).join(',')).join(' ')} />
        ))}

        {/* la oscuridad: la luz de cada brote */}
        {oscuro && brotes.map((b, k) => {
          const [x, y] = centro(b.f, b.c);
          return <circle key={`l${k}`} className="mz-luz" cx={x} cy={y} r={S * 2.2} fill={`url(#luz-${uid})`} />;
        })}

        {/* los brotes */}
        {brotes.map((b, k) => {
          const [bx, by] = centro(b.f, b.c);
          const dir = ((Math.round(b.ang / 90) % 4) + 4) % 4;
          const andando = conViaje && etapa === 'anda' && b.paso?.[0] === 'av' && !b.fin;
          return (
            <g key={`${viaje?.n ?? 0}-${conViaje}-${k}`} className={`mz-brote-pos b${k + 1}`}
               style={v({ transform: `translate(${bx}px, ${by}px)`, '--t': `${viaje?.ritmo.paso ?? 300}ms` })}>
              <g
                className={`mz-brote${etapa === 'nace' && conViaje ? ' nace' : ''}${andando ? ' anda' : ''}`
                  + `${b.fin === 'desconectado' ? ' desconectado' : ''}`
                  + `${b.fin === 'salida' ? ' arraiga' : ''}${!conViaje ? ' espera' : ''}`}
                style={v({ '--dx': [0, 1, 0, -1][dir], '--dy': [-1, 0, 1, 0][dir] })}
                filter={`url(#brillo-${uid})`}
              >
                <g className="mz-brote-gira" style={v({ transform: `rotate(${b.ang}deg)` })}>
                  <BroteArriba />
                </g>
                {b.fin === 'desconectado' && (
                  <g className="mz-sin-senal" aria-hidden="true">
                    <path d="M-7 -24 Q0 -31 7 -24 M-4 -21 Q0 -25 4 -21" />
                    <path className="tacha" d="M-8 -30 L8 -18" />
                  </g>
                )}
              </g>
            </g>
          );
        })}

        {/* lo que florece al llegar */}
        {conViaje && llegoAlguno && (
          <g key={`f${brotes.filter((b) => b.fin === 'salida').length}`} className="mz-estallido" transform={`translate(${sx} ${sy})`} aria-hidden="true">
            {Array.from({ length: 16 }, (_, k) => (
              <path key={k} d="M0 -4 L3 0 L0 4 L-3 0 Z" style={v({ '--a': `${k * 22.5}deg`, '--k': k })} />
            ))}
          </g>
        )}
        {conViaje && llegoAlguno && <circle className="mz-onda" cx={sx} cy={sy} r="16" />}
      </svg>}

      {/* El veredicto, grande, encima: es lo que hay que cantar en voz alta. */}
      {letrero && (
        <div className={`mz-veredicto ${letrero.clase}`} role="status" key={`${viaje?.n}-${transicion}`}>
          <span className="t">{letrero.t}</span>
          <span className="sub">{letrero.sub}</span>
        </div>
      )}
    </div>
  );
}
