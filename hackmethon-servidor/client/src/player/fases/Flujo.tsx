import type { CSSProperties, ReactNode } from 'react';
import type { BloqueSalida } from '../../shared/events';

// ============================================================
//  EL FLUJO de la Fase 1, dibujado dos veces.
//
//  · El PSEUDOCÓDIGO: el flujo tal cual se escribe, con sus palabras
//    clave coloreadas. Lo pide Pantalla con `flujo` y lo ve Datos.
//  · El DIAGRAMA: el mismo flujo como diagrama de flujo, un rombo por
//    filtro con su salida a «descartar». Es lo que Datos tiene arriba.
//    Enseña la ESTRUCTURA, nunca el resultado: quién cae en cada filtro
//    es de Pantalla.
//  Lo que da cada `probar` no se dibuja aquí: se guarda como corrida en
//  las tablas de Datos, para buscarlo.
// ============================================================

type Flujo = Extract<BloqueSalida, { tipo: 'flujo' }>;

const vars = (o: Record<string, string | number>) => o as CSSProperties;

/** Colorea una condición: campos en azul, valores en fósforo, `y`/`o`
 *  como palabras clave. Sin parser: es una línea de cuatro palabras. */
function Condicion({ texto }: { texto: string }) {
  const piezas = texto.split(' ');
  return (
    <>
      {piezas.map((w, i) => {
        const tipo = w === 'y' || w === 'o' ? 'pc-clave'
          : /^(=|!=|>=|<=|>|<)$/.test(w) ? 'pc-op'
          : i % 4 === 0 ? 'pc-campo' : 'pc-valor';
        return <span key={i} className={tipo}>{w}{i < piezas.length - 1 ? ' ' : ''}</span>;
      })}
    </>
  );
}

/** El flujo en pseudocódigo. */
export function Pseudocodigo({ filtros, max, marchitos, pierna }: {
  filtros: string[]; max: number; marchitos?: string[]; pierna?: boolean[];
}) {
  return (
    <div className="pseudo">
      <div className="pc-linea cab">
        <span className="pc-n" />
        <span><span className="pc-clave">para cada</span> programa <span className="pc-clave">que llega</span>:</span>
      </div>
      {filtros.length === 0 && (
        <div className="pc-linea vacia">
          <span className="pc-n">·</span>
          <span className="pc-com">— sin filtros: no se descarta nada —</span>
        </div>
      )}
      {filtros.map((f, i) => (
        <div key={`${i}-${f}`} className={`pc-filtro${pierna?.[i] ? ' defensa' : ''}`} style={vars({ '--i': i })}>
          <div className="pc-linea">
            <span className="pc-n">{i + 1}</span>
            <span className="pc-sangria"><span className="pc-clave">si</span> <Condicion texto={f} /></span>
            {pierna?.[i] && <span className="pc-defensa">defensa de la pierna</span>}
          </div>
          <div className="pc-linea">
            <span className="pc-n" />
            <span className="pc-sangria doble"><span className="pc-descartar">descartar</span></span>
          </div>
        </div>
      ))}
      <div className="pc-linea pie">
        <span className="pc-n" />
        <span className="pc-sangria"><span className="pc-pasar">dejar pasar</span></span>
      </div>
      <p className="pc-cupo">filtros {filtros.length} / {max}</p>
      {marchitos && marchitos.length > 0 && (
        <div className="pc-marchitos">
          <p>Se secaron con la muda</p>
          <ul>
            {marchitos.map((m, i) => (
              <li key={i} style={vars({ '--i': i })}><span className="pc-hoja" aria-hidden="true" />si {m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** El bloque de `flujo` en la salida de Pantalla. */
export function BloqueFlujo({ b }: { b: Flujo }) {
  return (
    <div className="bloque flujo">
      {b.titulo && <h4>{b.titulo}</h4>}
      <Pseudocodigo filtros={b.filtros} max={b.max} marchitos={b.marchitos} pierna={b.pierna} />
    </div>
  );
}

// ---------- el diagrama de Datos ----------

const DX = 210;          // la columna vertebral del diagrama
const ALTO_FILTRO = 92;
const Y0 = 96;

/** Parte una condición larga en dos líneas por el `y`/`o` del medio. */
function partirCond(c: string): string[] {
  if (c.length <= 30) return [c];
  const w = c.split(' ');
  const juntas = w.map((x, i) => (x === 'y' || x === 'o' ? i : -1)).filter((i) => i > 0);
  const corte = juntas.length ? juntas[Math.floor((juntas.length - 1) / 2)] : Math.ceil(w.length / 2);
  return [w.slice(0, corte).join(' '), w.slice(corte).join(' ')];
}

/**
 * El flujo como diagrama: entra la fila de programas por arriba, cada
 * filtro es un rombo con su salida «sí» a descartar y su salida «no»
 * hacia abajo, y al fondo la membrana que deja pasar. Los huecos que
 * quedan libres se ven punteados: cuántos filtros caben también es
 * parte del problema.
 */
export function FlujoDiagrama({ filtros, max, marchitos, capa, pierna }: {
  filtros: string[]; max: number; marchitos: string[]; capa: number; pierna?: boolean[];
}) {
  const huecos = Math.max(0, max - filtros.length);
  const filas = filtros.length + huecos;
  const yPasar = Y0 + filas * ALTO_FILTRO + 20;
  const alto = yPasar + 92;

  const nodos: ReactNode[] = [];
  filtros.forEach((f, i) => {
    const y = Y0 + i * ALTO_FILTRO + 34;
    const lineas = partirCond(f);
    nodos.push(
      <g key={`f-${i}-${f}`} className={`fd-filtro${pierna?.[i] ? ' defensa' : ''}`} style={vars({ '--i': i })}>
        <text className="fd-etq" x={DX - 150} y={y - 32}>
          FILTRO {i + 1}{pierna?.[i] ? ' · DEFENSA DE LA PIERNA' : ' · VUESTRO'}
        </text>
        <path className="fd-rombo" d={`M${DX - 160} ${y} L${DX - 128} ${y - 26} L${DX + 128} ${y - 26} L${DX + 160} ${y} L${DX + 128} ${y + 26} L${DX - 128} ${y + 26} Z`} />
        {lineas.map((l, k) => (
          <text key={k} className="fd-cond" x={DX} y={y + 4 + (k - (lineas.length - 1) / 2) * 14} textAnchor="middle">
            <tspan className="fd-si">{k === 0 ? '¿' : ''}</tspan>{l}<tspan className="fd-si">{k === lineas.length - 1 ? '?' : ''}</tspan>
          </text>
        ))}
        {/* la salida «sí»: a descartar */}
        <path className="fd-rama" d={`M${DX + 160} ${y} L${DX + 214} ${y}`} />
        <text className="fd-si-no" x={DX + 168} y={y - 6}>sí</text>
        <g className="fd-descartar" transform={`translate(${DX + 216} ${y - 15})`}>
          <rect width="96" height="30" />
          <text x="48" y="19" textAnchor="middle">DESCARTAR</text>
          <path className="fd-cae" d="M48 34 L48 50" />
        </g>
        {/* la salida «no»: sigue bajando */}
        <text className="fd-si-no" x={DX + 8} y={y + 44}>no</text>
      </g>,
    );
  });
  for (let k = 0; k < huecos; k++) {
    const i = filtros.length + k;
    const y = Y0 + i * ALTO_FILTRO + 34;
    nodos.push(
      <g key={`h-${i}`} className="fd-hueco">
        <path d={`M${DX - 160} ${y} L${DX - 128} ${y - 26} L${DX + 128} ${y - 26} L${DX + 160} ${y} L${DX + 128} ${y + 26} L${DX - 128} ${y + 26} Z`} />
        <text x={DX} y={y + 4} textAnchor="middle">filtro {i + 1} · libre</text>
      </g>,
    );
  }

  return (
    <div className="fd" data-capa={capa}>
      <svg className="fd-svg" viewBox={`0 0 560 ${alto}`} role="img"
           aria-label={filtros.length ? `Flujo con ${filtros.length} filtros` : 'Flujo sin filtros: pasa todo'}>
        {/* la columna: el caudal bajando */}
        <path className="fd-espina" d={`M${DX} 44 L${DX} ${yPasar}`} />
        <path className="fd-caudal" d={`M${DX} 44 L${DX} ${yPasar}`} />

        {/* la entrada */}
        <g className="fd-entrada">
          <rect x={DX - 110} y="14" width="220" height="30" rx="15" />
          <text x={DX} y="34" textAnchor="middle">LLEGA UN PROGRAMA</text>
          {[0, 1, 2, 3].map((k) => (
            <g key={k} className="fd-ficha" style={vars({ '--k': k })} transform={`translate(${DX - 150 + k * 18} 29)`}>
              <rect x="-5" y="-6" width="10" height="9" rx="2" />
              <path d="M-3 3 L-4 7 M0 3 L0 7 M3 3 L4 7" />
            </g>
          ))}
        </g>

        {nodos}

        {/* la salida: la membrana */}
        <g className="fd-pasar">
          <rect x={DX - 110} y={yPasar} width="220" height="32" rx="4" />
          <text x={DX} y={yPasar + 21} textAnchor="middle">DEJAR PASAR</text>
          <path className="fd-membrana" d={`M${DX - 34} ${yPasar + 82} L${DX - 34} ${yPasar + 56} Q${DX} ${yPasar + 30} ${DX + 34} ${yPasar + 56} L${DX + 34} ${yPasar + 82}`} />
          {[-22, -11, 0, 11, 22].map((dx) => (
            <path key={dx} className="fd-raiz" d={`M${DX + dx} ${yPasar + 50 + Math.abs(dx) * 0.6} q4 8 0 16 q-4 8 0 14`} />
          ))}
          <text className="fd-etq" x={DX + 48} y={yPasar + 72}>a la rodilla</text>
        </g>
      </svg>

      {marchitos.length > 0 && (
        <div className="fd-marchitos">
          <p>Se secaron con la muda</p>
          <ul>{marchitos.map((m) => <li key={m}>si {m}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
