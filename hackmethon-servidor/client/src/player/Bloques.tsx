import type { BloqueSalida, SalidaComando } from '../shared/events';

/** Pinta un bloque de salida. El servidor decide QUÉ; esto solo decide CÓMO. */
export function Bloque({ b }: { b: BloqueSalida }) {
  switch (b.tipo) {
    case 'texto':
      return (
        <div className="bloque">
          {b.titulo && <h4>{b.titulo}</h4>}
          {b.lineas.map((l, i) => <div key={i} className="linea">{l}</div>)}
        </div>
      );

    case 'lista':
      return (
        <div className="bloque">
          {b.titulo && <h4>{b.titulo}</h4>}
          <dl className="pares">
            {b.items.map((it, i) => (
              <div key={i}>
                <dt>{it.clave}</dt>
                <dd>{it.valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      );

    case 'tabla':
      return (
        <div className="bloque">
          {b.titulo && <h4>{b.titulo}</h4>}
          <div className="tabla-scroll">
            <table className="tabla-datos">
              <thead>
                <tr>{b.columnas.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {b.filas.map((f, i) => (
                  <tr key={i}>{f.map((c, j) => <td key={j}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    case 'error':
      return <div className="bloque bloque-error">{b.texto}</div>;

    case 'exito':
      return (
        <div className="bloque bloque-exito">
          <h4>{b.titulo}</h4>
          {b.lineas.map((l, i) => <div key={i} className="linea">{l}</div>)}
        </div>
      );
  }
}

export function Salida({ s }: { s: SalidaComando }) {
  return (
    <article className="salida">
      <div className="salida-eco">
        <span className="prompt">&gt;</span> {s.comando}
      </div>
      {s.bloques.map((b, i) => <Bloque key={i} b={b} />)}
    </article>
  );
}
