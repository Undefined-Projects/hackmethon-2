import { useEffect, useMemo, useState } from 'react';
import type { PhaseWorkspace } from '../../shared/events';
import { useMountId } from './mount';
import { useSession } from '../../session/SessionContext';
import { JardinEscena } from '../../admin/JardinEscena';
import { FlujoDiagrama, Pseudocodigo } from '../fases/Flujo';
import { ProgramaDatos } from '../fases/ProgramaBrote';
import { Archivo3D } from './Archivo3D';
import { ANTICOPIA } from './anticopia';

type Tabla = {
  id: string;
  nombre: string;
  x: number; y: number; w: number;
  descripcion: string;
  clave: string;
  columnas: string[];
  filas: string[][];
  /** Filas recién llegadas (la muda de la Fase 1): se marcan, porque lo
   *  primero que hay que decir en voz alta es quién es nuevo. */
  nuevas?: string[];
};

type Relacion = { desde: string; campo: string; hasta: string };

type Payload = {
  titulo: string;
  nota: string;
  lienzo: { w: number; h: number };
  tablas: Tabla[];
  relaciones: Relacion[];
  /** El flujo que va escribiendo Terminal (Fase 1). Datos ve su forma,
   *  nunca su resultado: quién pasa es de Pantalla. */
  flujo?: { filtros: string[]; max: number; marchitos: string[]; capa: number; pierna?: boolean[] };
  /** El programa del brote (Fase 2): lo que escribe Terminal, vivo. */
  programa?: Parameters<typeof ProgramaDatos>[0]['programa'];
  /** El bonus del corazón: el manual se imprime, sin archivo 3D. */
  ibm?: boolean;
};

/**
 * Operador de Datos: el esquema primero, el contenido después.
 *
 * El mapa no es decoración. Con una sola tabla, este puesto se limitaba
 * a leer en voz alta; con el esquema, para responder «¿desde qué máquina
 * entró?» hay que saltar de `operaciones` a `sesiones` y de ahí a
 * `equipos`. Cada salto es una frase que alguien tiene que decir en voz
 * alta, que es exactamente el juego.
 */
export function DatosView({ workspace }: { workspace: PhaseWorkspace }) {
  const mountId = useMountId();
  const { averia } = useSession();
  // El ataque: la mano del robot secuestra el archivo y la base de datos
  // entera queda inutilizable hasta que lo suelte.
  const secuestro = averia?.tipo === 'DATOS' && averia.hasta > Date.now() ? averia : null;
  const datos = workspace.payload as Payload | null;

  const [abierta, setAbierta] = useState<string | null>(null);
  const [aperturas, setAperturas] = useState(0);
  const [filtro, setFiltro] = useState('');
  const [resaltado, setResaltado] = useState<string | null>(null);
  // El último salto por una relación (la luz recorre ese cable en el
  // archivo) y cuántas filas deja ver la consulta de la hoja.
  const [viaje, setViaje] = useState<{ n: number; de: string; a: string } | null>(null);
  const [visibles, setVisibles] = useState<number | null>(null);

  // Si aparece una tabla nueva en el esquema (ej. al pasar de Parte 1 a Parte 2),
  // volvemos al mapa para que el Operador de Datos vea la nueva tabla de inmediato.
  useEffect(() => {
    setAbierta(null);
    setResaltado(null);
  }, [datos?.tablas.length]);

  if (!datos) {
    return (
      <section className={`vista vista-datos${secuestro ? ' secuestrada' : ''}`} {...ANTICOPIA}>
      {/* La máquina viva de fondo: late al abrir cada tabla. */}
      <JardinEscena variante="datos" marco={150} latido={aperturas} />
        <p className="pendiente">Esta fase no tiene base de datos.</p>
      </section>
    );
  }

  const tabla = datos.tablas.find((t) => t.id === abierta) ?? null;
  // La torre que agarra la mano: la abierta; si no hay, una al azar
  // (la misma durante todo el ataque).
  const agarrada = secuestro
    ? tabla?.id ?? datos.tablas[Math.floor(secuestro.hasta / 7) % Math.max(1, datos.tablas.length)]?.id ?? null
    : null;
  // Lo que queda inutilizable: ni clic ni teclado, y corrupto a la vista.
  // Sin desmontarlo: la consulta que estaba armada vuelve intacta.
  const bloqueo = secuestro
    ? { inert: true, className: 'datos-bloque corrupto', 'aria-hidden': true }
    : { className: 'datos-bloque' };

  const abrir = (id: string, filtroInicial = '', destacar: string | null = null) => {
    if (abierta && abierta !== id) setViaje((v) => ({ n: (v?.n ?? 0) + 1, de: abierta, a: id }));
    setVisibles(null);
    setAbierta(id);
    setAperturas((n) => n + 1);
    setFiltro(filtroInicial);
    setResaltado(destacar);
  };

  return (
    <section className={`vista vista-datos${secuestro ? ' secuestrada' : ''}`} {...ANTICOPIA}>
      {/* La máquina viva de fondo: late al abrir cada tabla. */}
      <JardinEscena variante="datos" marco={150} latido={aperturas} />
      <header>
        <h2>{tabla ? `tabla · ${tabla.nombre}` : datos.titulo}</h2>
        <span className="organo">la memoria</span>
        <span className="rol rol-DATOS">Operador de Datos</span>
      </header>

      <p className="ayuda">{datos.nota}</p>

      <div {...bloqueo}>
      {datos.flujo && (
        <div className="flujo-datos">
          <FlujoDiagrama {...datos.flujo} />
          <div className="flujo-datos__codigo">
            <p className="flujo-datos__rotulo">El flujo, en pseudocódigo</p>
            <Pseudocodigo filtros={datos.flujo.filtros} max={datos.flujo.max} pierna={datos.flujo.pierna} />
            <p className="flujo-datos__nota">
              En azul, las defensas de la propia pierna: también se pueden quitar. Lo que
              escribe Terminal se dibuja aquí al instante, y lo que da cada `probar` se
              guarda abajo, en corridas, corrida_filtros y resultados.
            </p>
          </div>
        </div>
      )}

      {datos.programa && <ProgramaDatos programa={datos.programa} />}
      </div>

      {datos.ibm ? <ManualIBM tablas={datos.tablas} /> : <>

      {/* El archivo: las tablas como torres y las relaciones como cables.
          Siempre a la vista; la tabla abierta se lee abajo, en la hoja. */}
      <Archivo3D
        tablas={datos.tablas} relaciones={datos.relaciones} lienzo={datos.lienzo}
        seleccion={tabla?.id ?? null} visibles={tabla ? visibles : null} viaje={viaje}
        alAbrir={(id) => abrir(id)}
        secuestro={secuestro ? { hasta: secuestro.hasta, tabla: agarrada, de: secuestro.de } : null}
      />

      <div {...bloqueo}>

      {tabla ? (
        <DetalleTabla
          key={tabla.id}
          alVisibles={setVisibles}
          tabla={tabla}
          relaciones={datos.relaciones}
          tablas={datos.tablas}
          filtro={filtro}
          setFiltro={setFiltro}
          resaltado={resaltado}
          alVolver={() => { setAbierta(null); setResaltado(null); }}
          alSaltar={abrir}
        />
      ) : (
        <p className="archivo-pista">Toca una torre para abrir su tabla y consultarla.</p>
      )}
      </div>
      </>}

      <footer className="huella">montaje #{mountId}</footer>
    </section>
  );
}

/* ── el manual impreso (bonus del corazón) ───────────────────
   Papel de impresora de los ochenta: cada tabla, un capítulo, en
   monoespaciada y con sus columnas alineadas. Todo a la vista: aquí no
   hay consultas, hay un manual que leer. */
function ManualIBM({ tablas }: { tablas: Tabla[] }) {
  return (
    <div className="manual-ibm">
      {tablas.map((t, i) => (
        <section key={t.id} className="manual-ibm__capitulo">
          <h3>{`${i + 1}. ${t.descripcion.toUpperCase()}`}</h3>
          <table>
            <thead><tr>{t.columnas.map((c) => <th key={c}>{c.toUpperCase()}</th>)}</tr></thead>
            <tbody>{t.filas.map((f, k) => <tr key={k}>{f.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
          </table>
        </section>
      ))}
      <p className="manual-ibm__pie">- FIN DEL MANUAL -</p>
    </div>
  );
}

/* ── el contenido de una tabla ───────────────────────────── */

/** Como número si los dos lo parecen; si no, como texto. */
const pareceNumero = (v: string) => v.trim() !== '' && !Number.isNaN(Number(v));
const comparar = (a: string, b: string) =>
  (pareceNumero(a) && pareceNumero(b) ? Number(a) - Number(b) : a.localeCompare(b, 'es'));
const OPS = ['=', '≠', 'contiene', '>', '<', '≥', '≤'] as const;
type Op = (typeof OPS)[number];
const cumple = (v: string, op: Op, x: string) => {
  const c = comparar(v, x);
  switch (op) {
    case '=': return c === 0;
    case '≠': return c !== 0;
    case 'contiene': return v.toLowerCase().includes(x.toLowerCase());
    case '>': return c > 0;
    case '<': return c < 0;
    case '≥': return c >= 0;
    case '≤': return c <= 0;
  }
};
const SQL_OP: Record<Op, string> = { '=': '=', '≠': '<>', contiene: 'LIKE', '>': '>', '<': '<', '≥': '>=', '≤': '<=' };

function DetalleTabla({
  tabla, relaciones, tablas, filtro, setFiltro, resaltado, alVolver, alSaltar, alVisibles,
}: {
  tabla: Tabla;
  relaciones: Relacion[];
  tablas: Tabla[];
  filtro: string;
  setFiltro: (v: string) => void;
  resaltado: string | null;
  alVolver: () => void;
  alSaltar: (id: string, filtro?: string, destacar?: string | null) => void;
  /** Cuántas filas quedan con la consulta (null: todas), para el archivo. */
  alVisibles: (n: number | null) => void;
}) {
  const salidas = relaciones.filter((r) => r.desde === tabla.id);
  const entradas = relaciones.filter((r) => r.hasta === tabla.id);
  const nombre = (id: string) => tablas.find((t) => t.id === id)?.nombre ?? id;

  // La consulta: filtrar por una columna, ordenar y unir con otra tabla.
  const [col, setCol] = useState('');
  const [op, setOp] = useState<Op>('=');
  const [valor, setValor] = useState('');
  const [ordenCol, setOrdenCol] = useState('');
  const [desc, setDesc] = useState(false);
  const [union, setUnion] = useState('');

  const relUnion = salidas.find((r) => r.campo === union) ?? null;
  const otra = relUnion ? tablas.find((t) => t.id === relUnion.hasta) ?? null : null;
  const extra = otra ? otra.columnas.filter((c) => c !== otra.clave).map((c) => `${otra.nombre}.${c}`) : [];
  const columnas = [...tabla.columnas, ...extra];

  const filas = useMemo(() => {
    let xs = tabla.filas.map((f) => {
      if (!otra || !relUnion) return f;
      const i = tabla.columnas.indexOf(relUnion.campo);
      const k = otra.columnas.indexOf(otra.clave);
      const par = otra.filas.find((g) => g[k] === f[i]);
      return [...f, ...otra.columnas.filter((c) => c !== otra.clave).map((c) => (par ? par[otra.columnas.indexOf(c)] : ''))];
    });
    const q = filtro.trim().toLowerCase();
    if (q) xs = xs.filter((f) => f.some((c) => c.toLowerCase().includes(q)));
    const ic = columnas.indexOf(col);
    if (ic >= 0 && valor.trim() !== '') xs = xs.filter((f) => cumple(f[ic] ?? '', op, valor.trim()));
    const io = columnas.indexOf(ordenCol);
    if (io >= 0) xs = [...xs].sort((a, b) => (desc ? -1 : 1) * comparar(a[io] ?? '', b[io] ?? ''));
    return xs;
  }, [tabla, otra, relUnion, filtro, col, op, valor, ordenCol, desc, columnas]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { alVisibles(filas.length === tabla.filas.length ? null : filas.length); }, [filas.length, tabla.filas.length, alVisibles]);

  // La misma consulta, dicha como la diría una base de datos.
  const sql = [
    `SELECT * FROM ${tabla.nombre}`,
    otra && relUnion ? `JOIN ${otra.nombre} ON ${tabla.nombre}.${relUnion.campo} = ${otra.nombre}.${otra.clave}` : '',
    col && valor.trim() ? `WHERE ${col} ${SQL_OP[op]} ${op === 'contiene' ? `'%${valor.trim()}%'` : pareceNumero(valor) ? valor.trim() : `'${valor.trim()}'`}` : '',
    ordenCol ? `ORDER BY ${ordenCol} ${desc ? 'DESC' : 'ASC'}` : '',
  ].filter(Boolean).join(' ');
  const limpiar = () => { setCol(''); setValor(''); setOrdenCol(''); setDesc(false); setUnion(''); setFiltro(''); };
  const firmaConsulta = `${filtro}|${col}|${op}|${valor}|${ordenCol}|${desc}|${union}`;

  return (
    <>
      <div className="detalle-barra">
        <button className="sutil" onClick={alVolver}>&lt;&lt; CERRAR HOJA</button>
        <span className="detalle-desc">{tabla.descripcion}</span>
      </div>

      {(salidas.length > 0 || entradas.length > 0) && (
        <div className="saltos">
          {salidas.map((r) => (
            <button key={`s-${r.campo}`} className="salto" onClick={() => alSaltar(r.hasta)}>
              {r.campo} → {nombre(r.hasta)}
            </button>
          ))}
          {entradas.map((r) => (
            <button key={`e-${r.desde}-${r.campo}`} className="salto entrante"
                    onClick={() => alSaltar(r.desde)}>
              {nombre(r.desde)}.{r.campo} ←
            </button>
          ))}
        </div>
      )}

      {/* Las consultas: el superpoder de este puesto. Gratis e instantáneas. */}
      <div className="consulta" role="group" aria-label={`Consultar ${tabla.nombre}`}>
        <input className="filtro" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="buscar…" aria-label="Buscar en todas las columnas" />
        <span className="consulta__grupo">
          <b>filtrar</b>
          <select value={col} onChange={(e) => setCol(e.target.value)} aria-label="Columna para filtrar">
            <option value="">columna…</option>
            {columnas.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={op} onChange={(e) => setOp(e.target.value as Op)} aria-label="Comparación">
            {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="valor" aria-label="Valor para filtrar" />
        </span>
        <span className="consulta__grupo">
          <b>ordenar</b>
          <select value={ordenCol} onChange={(e) => setOrdenCol(e.target.value)} aria-label="Columna para ordenar">
            <option value="">—</option>
            {columnas.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" className="sutil" onClick={() => setDesc((d) => !d)} aria-label={desc ? 'De mayor a menor' : 'De menor a mayor'}>{desc ? '▼' : '▲'}</button>
        </span>
        {salidas.length > 0 && (
          <span className="consulta__grupo">
            <b>unir</b>
            <select value={union} onChange={(e) => setUnion(e.target.value)} aria-label="Unir con otra tabla">
              <option value="">—</option>
              {salidas.map((r) => <option key={r.campo} value={r.campo}>{nombre(r.hasta)} (por {r.campo})</option>)}
            </select>
          </span>
        )}
        <button type="button" className="sutil" onClick={limpiar}>limpiar</button>
        <span className="consulta__cuenta">{filas.length} de {tabla.filas.length} filas</span>
      </div>
      <p className="consulta__sql" aria-label="La consulta, en lenguaje de base de datos"><code>{sql};</code></p>

      <div className="tabla-scroll">
        <table className="tabla-datos">
          <thead>
            <tr>{columnas.map((c) => <th key={c} className={c.includes('.') ? 'unida' : ''}>{c}</th>)}</tr>
          </thead>
          <tbody key={firmaConsulta}>
            {filas.map((f, n) => (
              <tr key={`${f[0]}-${n}`} style={{ animationDelay: `${Math.min(n, 20) * 18}ms` }}
                  className={`${resaltado && f[0] === resaltado ? 'resaltada' : ''}${tabla.nuevas?.includes(f[0]) ? ' nueva' : ''}`}>
                {f.map((celda, j) => {
                  const rel = j < tabla.columnas.length
                    ? relaciones.find((r) => r.desde === tabla.id && r.campo === tabla.columnas[j]) : undefined;
                  // Una celda de clave ajena es un salto: se pulsa y te
                  // lleva a la fila referenciada, ya filtrada.
                  return (
                    <td key={j} className={j >= tabla.columnas.length ? 'unida' : ''}>
                      {rel && celda ? (
                        <button className="ref" onClick={() => alSaltar(rel.hasta, celda, celda)}>
                          {celda}
                        </button>
                      ) : (
                        celda || <span className="vacio">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length === 0 && <p className="pendiente">Ninguna fila coincide.</p>}
    </>
  );
}
