import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useCaminata, type Accion, type Ritmo } from './caminata';

// ============================================================
//  EL PROGRAMA DEL BROTE · La Maraña y La Espesura
//
//  Solo lo ve Datos: ni Terminal ni Pantalla tienen el programa.
//  · El LISTADO: el programa tal cual, con su sangría y una guía por
//    cada bloque abierto.
//  · El de DATOS: el mismo listado, vivo. Cuando sale un brote, la línea
//    que lo está moviendo se enciende y cada ciclo enseña en qué vuelta
//    va. Es la manera de VER un ciclo: la luz baja, vuelve arriba y el
//    contador sube.
//    En la espesura salen cuatro con el mismo programa: cada uno marca su
//    línea con su color, y Datos elige a cuál seguirle las vueltas.
//  Datos ve qué línea va, nunca dónde está el brote: eso es de Pantalla.
// ============================================================

type Fin = 'salida' | 'choque' | 'espina' | 'mina' | 'quieto' | 'agotado';
type ViajeDatos = {
  n: number; capa: number;
  ritmo: Ritmo;
  /** Uno en el seto; cuatro en la espesura, a compás. */
  brotes: { fin: Fin; pasos: { a: Accion; l: number; v: [number, number][] }[] }[];
  /** El programa con el que salió este brote. */
  lineas: string[];
  sangria: number[];
};

const v = (o: Record<string, string | number>) => o as CSSProperties;

const CLAVES = new Set(['repetir', 'mientras', 'si', 'sino', 'fin', 'veces', 'vez']);
const SENSORES = new Set(['frente', 'izquierda', 'derecha', 'libre', 'bloqueado', 'bloqueada']);

/** Colorea una línea: palabras clave en violeta, acciones en fósforo,
 *  sensores en azul y números en blanco. Sin parser: son tres palabras. */
function Tokens({ linea }: { linea: string }) {
  const ws = linea.split(' ');
  return (
    <>
      {ws.map((w, i) => {
        const cls = CLAVES.has(w) ? 'pb-clave'
          : /^\d+$/.test(w) ? 'pb-num'
          : w === 'avanzar' ? 'pb-avanza'
          : w === 'girar' ? 'pb-gira'
          : SENSORES.has(w) ? 'pb-sensor' : '';
        return <span key={i} className={cls}>{w}{i < ws.length - 1 ? ' ' : ''}</span>;
      })}
    </>
  );
}

/** Las vueltas que da un `repetir N veces`, leídas del propio texto. */
const totalDe = (linea: string) => {
  const m = /^repetir (\d+) ve/.exec(linea);
  return m ? Number(m[1]) : null;
};

export function ProgramaListado({
  lineas, sangria, max, actual = null, vueltas, marcas, aviso, vivo = false,
}: {
  lineas: string[];
  sangria: number[];
  max?: number;
  /** La línea que está moviendo al brote ahora mismo. */
  actual?: number | null;
  /** En qué vuelta va cada ciclo abierto, por línea. */
  vueltas?: Map<number, number>;
  /** Qué brotes (1 a 4) van por cada línea: un punto de su color. */
  marcas?: Map<number, number[]>;
  aviso?: string | null;
  vivo?: boolean;
}) {
  const huecos = max ? Math.max(0, max - lineas.length) : 0;
  return (
    <div className={`pb${vivo ? ' vivo' : ''}`}>
      {lineas.length === 0 && (
        <div className="pb-linea vacia">
          <span className="pb-n">·</span>
          <span className="pb-com">— el brote no lleva ninguna instrucción —</span>
        </div>
      )}
      {lineas.map((l, i) => {
        const nivel = sangria[i] ?? 0;
        const vuelta = vueltas?.get(i);
        const total = totalDe(l);
        const enCiclo = vuelta !== undefined;
        return (
          <div key={`${i}-${l}`} className={`pb-linea${actual === i ? ' actual' : ''}${enCiclo ? ' en-ciclo' : ''}`}
               style={v({ '--i': i })}>
            <span className="pb-n">{i + 1}</span>
            <span className="pb-guias" aria-hidden="true">
              {Array.from({ length: nivel }, (_, k) => <i key={k} />)}
            </span>
            <span className="pb-txt"><Tokens linea={l} /></span>
            {marcas?.get(i)?.map((b) => <span key={b} className={`pb-marca b${b}`} title={`brote ${b}`}>{b}</span>)}
            {(total !== null || l.startsWith('repetir mientras')) && (
              <span className={`pb-vuelta${enCiclo ? ' viva' : ''}`} key={enCiclo ? `v${vuelta}` : 'q'}>
                {enCiclo
                  ? (total !== null ? `vuelta ${vuelta} de ${total}` : `vuelta ${vuelta}`)
                  : (total !== null ? `×${total}` : '↻')}
              </span>
            )}
          </div>
        );
      })}
      {Array.from({ length: huecos }, (_, k) => (
        <div key={`h${k}`} className="pb-linea hueco">
          <span className="pb-n">{lineas.length + k + 1}</span>
          <span className="pb-com">—</span>
        </div>
      ))}
      {aviso && <p className="pb-aviso">{aviso}</p>}
    </div>
  );
}

const DESENLACE: Record<Fin, string> = {
  salida: 'llegó a la salida',
  choque: 'chocó contra una pared',
  espina: 'pisó una espina',
  mina: 'pisó una mina',
  quieto: 'se quedó quieto: se le acabó el programa',
  agotado: 'se agotó',
};

/** El programa en el puesto de Datos, vivo. */
export function ProgramaDatos({ programa }: {
  programa: {
    lineas: string[]; sangria: number[]; max: number; usadas?: number; abiertos: number; aviso: string | null;
    capa: number; varios?: boolean; viaje: ViajeDatos | null;
  };
}) {
  const { viaje } = programa;
  const acciones = useMemo(() => {
    const largo = viaje?.brotes.reduce((a, b) => (b.pasos.length > a.length ? b.pasos : a), [] as ViajeDatos['brotes'][number]['pasos']) ?? [];
    return largo.map((p) => p.a);
  }, [viaje]);
  const { i, etapa } = useCaminata(
    viaje ? { n: viaje.n, acciones, ritmo: viaje.ritmo } : null,
    'hm:marana-visto-datos',
  );
  const varios = (viaje?.brotes.length ?? 0) > 1;
  // A quién se le siguen las vueltas. Los demás solo marcan su línea.
  const [sigue, setSigue] = useState(0);
  const elegido = Math.min(sigue, Math.max(0, (viaje?.brotes.length ?? 1) - 1));
  const anda = !!viaje && etapa === 'anda' && i >= 0;
  const pasoDe = (k: number) => (anda && viaje ? viaje.brotes[k].pasos[i] ?? null : null);
  const paso = pasoDe(elegido);
  const vueltas = useMemo(() => new Map(paso?.v ?? []), [paso]);
  const marcas = useMemo(() => {
    const m = new Map<number, number[]>();
    if (!varios || !viaje || !anda) return m;
    viaje.brotes.forEach((_, k) => {
      const p = pasoDe(k);
      if (p) m.set(p.l, [...(m.get(p.l) ?? []), k + 1]);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viaje, i, anda, varios]);
  // Mientras los brotes andan se enseña el programa CON EL QUE SALIERON:
  // si Terminal ya lo está cambiando, la luz caería en líneas que no son.
  const andando = !!viaje && (etapa === 'nace' || etapa === 'anda');
  const lineas = andando ? viaje!.lineas : programa.lineas;
  const sangria = andando ? viaje!.sangria : programa.sangria;
  const llegaron = viaje?.brotes.filter((b) => b.fin === 'salida').length ?? 0;
  const quien = varios ? `Lanzamiento ${viaje?.n}` : `Brote ${viaje?.n}`;
  const vueltasTxt = (p: NonNullable<typeof paso>) => (p.v.length ? ` · ${p.v.map(([l, k]) => `ciclo de la línea ${l + 1}: vuelta ${k}`).join(' · ')}` : '');

  const estado = !viaje ? 'Todavía no ha salido ningún brote.'
    : etapa === 'nace' ? `${quien} · ${varios ? 'germinando en las cuatro esquinas' : 'germinando en la entrada'}…`
    : etapa === 'anda' && paso ? `${quien} · ${varios ? `brote ${elegido + 1} · ` : ''}línea ${paso.l + 1}${vueltasTxt(paso)}`
    : etapa === 'anda' ? `${quien} · el brote ${elegido + 1} ${DESENLACE[viaje.brotes[elegido].fin]}.`
    : varios ? `${quien} · ${llegaron} de ${viaje.brotes.length} llegaron al claro.`
    : `${quien} · ${DESENLACE[viaje.brotes[0].fin]}.`;
  const finClase = viaje && etapa === 'fin' ? ` ${varios ? (llegaron === viaje.brotes.length ? 'salida' : 'agotado') : viaje.brotes[0].fin}` : '';

  return (
    <div className="programa-datos">
      <div className="programa-datos__cab">
        <p className="programa-datos__rotulo">El programa del brote</p>
        <p className="programa-datos__cupo">
          {programa.usadas ?? programa.lineas.length} de {programa.max} líneas
          {programa.abiertos > 0 && <span className="abiertos"> · {programa.abiertos} bloque{programa.abiertos === 1 ? '' : 's'} sin cerrar</span>}
        </p>
      </div>
      <ProgramaListado
        lineas={lineas} sangria={sangria} max={programa.max}
        actual={paso ? paso.l : null} vueltas={vueltas} marcas={marcas} aviso={andando ? null : programa.aviso} vivo
      />
      {varios && viaje && (
        <div className="programa-datos__brotes" role="group" aria-label="A qué brote seguir">
          {viaje.brotes.map((b, k) => {
            const p = pasoDe(k);
            const acabo = etapa === 'fin' || (anda && i >= b.pasos.length);
            return (
              <button key={k} type="button" className={`pd-brote b${k + 1}${k === elegido ? ' sigue' : ''}${acabo ? ` ${b.fin}` : ''}`}
                      onClick={() => setSigue(k)} aria-pressed={k === elegido}>
                <span className="pd-brote__n">{k + 1}</span>
                {acabo ? DESENLACE[b.fin] : p ? `línea ${p.l + 1}` : etapa === 'nace' ? 'germina' : '—'}
              </button>
            );
          })}
        </div>
      )}
      <p className={`programa-datos__estado ${etapa}${finClase}`}>{estado}</p>
      <p className="programa-datos__nota">
        Lo escribe Terminal, y solo lo ven ustedes: léanselo antes de lanzar. El brote lo cumple de arriba abajo,
        una línea tras otra. Cuando sale, la línea que lo mueve se enciende y cada ciclo cuenta sus
        vueltas{programa.varios ? ' (las del brote que elijan seguir; los otros marcan su línea con su número)' : ''}.
        Dónde está el brote lo ve Pantalla; cómo acabó, queda en `viajes`.
      </p>
    </div>
  );
}
