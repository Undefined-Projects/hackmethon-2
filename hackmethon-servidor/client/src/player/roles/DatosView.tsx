import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PhaseWorkspace } from '../../shared/events';
import { useMountId } from './mount';
import { useSession } from '../../session/SessionContext';
import { sonar } from '../../lib/sonido';

type Tabla = {
  id: string;
  nombre: string;
  x: number; y: number; w: number;
  descripcion: string;
  clave: string;
  columnas: string[];
  filas: string[][];
  totalFilas?: number;
  soloEstructura?: boolean;
};

type Relacion = { desde: string; campo: string; hasta: string };

type ResultadoFiltro = {
  titulo: string;
  consulta: string;
  tablasUnidas: string[];
  total: number;
  columnas: string[];
  filas: string[][];
  nota?: string;
};

type Payload = {
  titulo: string;
  nota: string;
  lienzo: { w: number; h: number };
  tablas: Tabla[];
  relaciones: Relacion[];
  resultadoFiltro?: ResultadoFiltro | null;
};

type Arista = { clave: string; d: string; etiqueta: string; lx: number; ly: number };

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
  const temblando = averia?.tipo === 'DATOS';
  const datos = workspace.payload as Payload | null;

  const [abierta, setAbierta] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [resaltado, setResaltado] = useState<string | null>(null);

  // Si aparece una tabla nueva en el esquema (ej. al pasar de Parte 1 a Parte 2),
  // volvemos al mapa para que el Operador de Datos vea la nueva tabla de inmediato.
  useEffect(() => {
    setAbierta(null);
    setResaltado(null);
  }, [datos?.titulo, datos?.tablas.length]);

  if (!datos) {
    return (
      <section className={`vista vista-datos${temblando ? ' temblando' : ''}`}>
        <p className="pendiente">Esta fase no tiene base de datos.</p>
      </section>
    );
  }

  const tabla = datos.tablas.find((t) => t.id === abierta) ?? null;

  const abrir = (id: string, filtroInicial = '', destacar: string | null = null) => {
    setAbierta(id);
    setFiltro(filtroInicial);
    setResaltado(destacar);
  };

  return (
    <section className={`vista vista-datos${temblando ? ' temblando' : ''}`}>
      <header>
        <h2>{tabla ? `tabla · ${tabla.nombre}` : datos.titulo}</h2>
        <span className="rol rol-DATOS">Operador de Datos</span>
      </header>

      <p className="ayuda">{datos.nota}</p>

      {tabla ? (
        <DetalleTabla
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
        <>
          <Mapa datos={datos} alAbrir={(id) => abrir(id)} />
          {datos.resultadoFiltro && (
            <PantallaFiltro resultado={datos.resultadoFiltro} />
          )}
        </>
      )}

      <footer className="huella">montaje #{mountId}</footer>
    </section>
  );
}

/* ── el mapa ─────────────────────────────────────────────── */

function Mapa({ datos, alAbrir }: { datos: Payload; alAbrir: (id: string) => void }) {
  const lienzoRef = useRef<HTMLDivElement>(null);
  const nodos = useRef<Record<string, HTMLElement | null>>({});
  const [aristas, setAristas] = useState<Arista[]>([]);
  const [caja, setCaja] = useState({ w: datos.lienzo.w, h: datos.lienzo.h });

  // Las aristas se calculan MIDIENDO el DOM, no a partir de las
  // coordenadas del módulo: la altura de cada nodo depende de cuántas
  // columnas tenga, y estimarla dejaría las líneas despegadas del borde.
  const recalcular = useCallback(() => {
    const base = lienzoRef.current?.getBoundingClientRect();
    if (!base) return;
    setCaja({ w: base.width, h: base.height });

    const nuevas: Arista[] = [];
    for (const r of datos.relaciones) {
      const a = nodos.current[r.desde]?.getBoundingClientRect();
      const b = nodos.current[r.hasta]?.getBoundingClientRect();
      if (!a || !b) continue;

      const rel = (c: DOMRect) => ({
        izq: c.left - base.left, der: c.right - base.left,
        arr: c.top - base.top, aba: c.bottom - base.top,
        cx: c.left + c.width / 2 - base.left,
        cy: c.top + c.height / 2 - base.top,
      });
      const A = rel(a), B = rel(b);
      const dx = B.cx - A.cx, dy = B.cy - A.cy;

      let d: string, lx: number, ly: number;
      if (Math.abs(dx) >= Math.abs(dy)) {
        // Codo horizontal: sale por el costado y entra por el contrario.
        const x1 = dx > 0 ? A.der : A.izq;
        const x2 = dx > 0 ? B.izq : B.der;
        const mx = (x1 + x2) / 2;
        d = `M ${x1} ${A.cy} H ${mx} V ${B.cy} H ${x2}`;
        lx = mx; ly = (A.cy + B.cy) / 2;
      } else {
        const y1 = dy > 0 ? A.aba : A.arr;
        const y2 = dy > 0 ? B.arr : B.aba;
        const my = (y1 + y2) / 2;
        d = `M ${A.cx} ${y1} V ${my} H ${B.cx} V ${y2}`;
        lx = (A.cx + B.cx) / 2; ly = my;
      }
      nuevas.push({ clave: `${r.desde}.${r.campo}`, d, etiqueta: r.campo, lx, ly });
    }
    setAristas(nuevas);
  }, [datos.relaciones]);

  useLayoutEffect(recalcular, [recalcular]);
  useEffect(() => {
    const ro = new ResizeObserver(recalcular);
    if (lienzoRef.current) ro.observe(lienzoRef.current);
    window.addEventListener('resize', recalcular);
    return () => { ro.disconnect(); window.removeEventListener('resize', recalcular); };
  }, [recalcular]);

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="mapa-scroll">
      <div
        className="mapa"
        ref={lienzoRef}
        style={{ aspectRatio: `${datos.lienzo.w} / ${datos.lienzo.h}` }}
      >
        <svg className="mapa-aristas" width={caja.w} height={caja.h} aria-hidden="true">
          {aristas.map((a) => (
            <g key={a.clave}>
              <path d={a.d} />
              <text x={a.lx} y={a.ly - 5}>{a.etiqueta}</text>
            </g>
          ))}
        </svg>

        {datos.tablas.map((t) => (
          <button
            key={t.id}
            type="button"
            className="nodo"
            data-tabla={t.id}
            ref={(el) => { nodos.current[t.id] = el; }}
            style={{
              left: pct(t.x, datos.lienzo.w),
              top: pct(t.y, datos.lienzo.h),
              width: pct(t.w, datos.lienzo.w),
            }}
            onClick={() => { sonar('abrir'); alAbrir(t.id); }}
          >
            <span className="nodo__nombre">{t.nombre}</span>
            <span className="nodo__desc">{t.descripcion}</span>
            <ul className="nodo__cols">
              {t.columnas.map((c) => (
                <li key={c} className={c === t.clave ? 'clave' : c.endsWith('_id') ? 'ajena' : ''}>
                  {c}
                </li>
              ))}
            </ul>
            <span className="nodo__n">{t.totalFilas ?? t.filas.length} filas</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── el contenido de una tabla ───────────────────────────── */

function DetalleTabla({
  tabla, relaciones, tablas, filtro, setFiltro, resaltado, alVolver, alSaltar,
}: {
  tabla: Tabla;
  relaciones: Relacion[];
  tablas: Tabla[];
  filtro: string;
  setFiltro: (v: string) => void;
  resaltado: string | null;
  alVolver: () => void;
  alSaltar: (id: string, filtro?: string, destacar?: string | null) => void;
}) {
  const salidas = relaciones.filter((r) => r.desde === tabla.id);
  const entradas = relaciones.filter((r) => r.hasta === tabla.id);
  const nombre = (id: string) => tablas.find((t) => t.id === id)?.nombre ?? id;

  const q = filtro.trim().toLowerCase();
  const filas = q ? tabla.filas.filter((f) => f.some((c) => c.toLowerCase().includes(q))) : tabla.filas;
  const visibles = filas.slice(0, 150);

  return (
    <>
      <div className="detalle-barra">
        <button className="sutil" onClick={alVolver}>&lt;&lt; MAPA</button>
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

      {tabla.soloEstructura ? (
        <p className="pendiente">
          Esta tabla tiene {tabla.totalFilas ?? tabla.filas.length} registros en la memoria.
          Para consultarlos o cruzarlos, pidele a Terminal que ejecute{' '}
          <code>MOSTRAR TODO DE {tabla.nombre}</code> y miralos en la Pantalla de Filtro en Vivo.
        </p>
      ) : (
        <>
          <input
            className="filtro"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder={`Filtrar ${tabla.nombre}…`}
          />

          <div className="tabla-scroll">
            <table className="tabla-datos">
              <thead>
                <tr>{tabla.columnas.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f[0]} className={resaltado && f[0] === resaltado ? 'resaltada' : ''}>
                    {f.map((celda, j) => {
                      const rel = relaciones.find(
                        (r) => r.desde === tabla.id && r.campo === tabla.columnas[j],
                      );
                      return (
                        <td key={j}>
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
          {filas.length > visibles.length && (
            <p className="datos-filtro-pie">
              Mostrando {visibles.length} de {filas.length} filas. Usa el filtro o ejecuta una consulta desde Terminal.
            </p>
          )}
        </>
      )}
    </>
  );
}

/* ── pantalla en vivo del resultado del filtro / join ─────── */

const FILAS_POR_PAGINA = 100;

function PantallaFiltro({ resultado }: { resultado: ResultadoFiltro }) {
  const [pagina, setPagina] = useState(0);

  useEffect(() => {
    setPagina(0);
  }, [resultado.consulta, resultado.total]);

  const totalPaginas = Math.max(1, Math.ceil(resultado.filas.length / FILAS_POR_PAGINA));
  const pagActual = Math.min(pagina, totalPaginas - 1);
  const desde = pagActual * FILAS_POR_PAGINA;
  const filasPagina = resultado.filas.slice(desde, desde + FILAS_POR_PAGINA);

  return (
    <div className="datos-filtro-panel" data-testid="datos-resultado-filtro">
      <div className="datos-filtro-cab">
        <div className="datos-filtro-tit">
          <span className="datos-filtro-etq">PANTALLA DE FILTRO EN VIVO</span>
          <strong>{resultado.titulo}</strong>
        </div>
        <div className="datos-filtro-meta">
          <span className="datos-filtro-tablas">
            TABLAS: {resultado.tablasUnidas.join(' + ')}
          </span>
          <span className={`datos-filtro-cuenta${resultado.total === 1 ? ' unica' : resultado.total === 0 ? ' vacia' : ''}`}>
            {resultado.total} {resultado.total === 1 ? 'REGISTRO RESTANTE' : 'REGISTROS RESTANTES'}
          </span>
        </div>
      </div>

      <div className="datos-filtro-sql">
        <code>{resultado.consulta}</code>
      </div>

      {resultado.nota && (
        <p className="datos-filtro-nota">{resultado.nota}</p>
      )}

      {totalPaginas > 1 && (
        <div className="datos-paginacion">
          <button
            type="button"
            className="sutil"
            disabled={pagActual === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
          >
            &lt; ANTERIOR
          </button>
          <span className="datos-paginacion-info">
            Pagina {pagActual + 1} de {totalPaginas} · filas {desde + 1} a {Math.min(desde + FILAS_POR_PAGINA, resultado.filas.length)} de {resultado.total}
          </span>
          <button
            type="button"
            className="sutil"
            disabled={pagActual >= totalPaginas - 1}
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
          >
            SIGUIENTE &gt;
          </button>
        </div>
      )}

      <div className="tabla-scroll datos-filtro-scroll">
        <table className="tabla-datos">
          <thead>
            <tr>
              {resultado.columnas.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filasPagina.map((f, idx) => (
              <tr key={`${f[0]}-${desde + idx}`} className={resultado.total === 1 ? 'resaltada' : ''}>
                {f.map((celda, j) => (
                  <td key={j}>{celda && celda !== 'NULL' ? celda : <span className="vacio">—</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filasPagina.length === 0 && (
        <p className="pendiente">Ningun registro coincide con el filtro actual.</p>
      )}
    </div>
  );
}
