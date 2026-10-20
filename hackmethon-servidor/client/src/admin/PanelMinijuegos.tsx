import type { MinijuegoTablero } from '../shared/events';
import { CATALOGO } from '../lib/minijuegos';
import { useTicker } from '../lib/useTicker';
import { formatMs } from '../lib/format';
import { useSession } from '../session/SessionContext';

/**
 * Los recreos del evento. Un botón por minijuego: al pulsarlo, a todos
 * los jugadores se les pone encima, a la vez, sin sacarlos de su fase.
 * Terminarlo los devuelve justo donde estaban.
 *
 * Lanzar otro (o el mismo otra vez) abre una ronda nueva y el ranking
 * vuelve a cero.
 */
export function PanelMinijuegos({
  minijuego, bloqueado, accion,
}: {
  minijuego: MinijuegoTablero | null;
  bloqueado: boolean;
  accion: (key: string, event: string, payload: unknown, exito: string) => Promise<unknown>;
}) {
  // `desde` es reloj del servidor: se compara contra el mismo reloj.
  useTicker(1000);
  const { clockOffset } = useSession();
  const ahora = Date.now() + clockOffset;
  const enCurso = minijuego ? CATALOGO.find((c) => c.clave === minijuego.clave) : null;

  return (
    <section className="panel">
      <div className="panel__bar">
        <span className="panel__name">MINIJUEGOS</span>
        <span className="panel__stat">
          {minijuego
            ? `EN CURSO · ${formatMs(Math.max(0, ahora - minijuego.desde))} · ${minijuego.participantes} jugando`
            : 'NINGUNO'}
        </span>
      </div>
      <div className="panel__body">
        <div className="cabecera-seccion">
          <p className="ayuda">
            Al lanzar uno, a todas las personas se les pone encima de lo que estén haciendo.
            No toca cronómetros: al terminarlo, cada quien sigue donde estaba. Al cerrar la
            ronda —terminarla o lanzar otra— cada equipo cobra TICKETS según el puesto de su
            mejor jugador (solo con el evento en marcha). Los puntajes en vivo solo se ven
            aquí y en la proyección, que cambia sola a la escena del juego.
          </p>
          {/* En su propia ventana, para arrastrarla al proyector: el panel
              se queda aquí para seguir gobernando. */}
          <button
            className="ir-carrera"
            onClick={() => window.open(`${window.location.pathname}#proyeccion`, 'hm-proyeccion')}
          >
            &gt;&gt; ABRIR PROYECCIÓN
          </button>
        </div>

        <ul className="minijuegos">
          {CATALOGO.map((c) => {
            const activo = minijuego?.clave === c.clave;
            return (
              <li key={c.clave} className={activo ? 'activo' : ''}>
                <div>
                  <strong>{c.nombre}</strong>
                  <span>{c.nota}</span>
                </div>
                <button
                  className={activo ? 'sutil' : 'primaria'}
                  disabled={bloqueado}
                  onClick={() => {
                    if (activo && !confirm('¿Reiniciar la ronda? Se reparten los tickets de esta y el ranking vuelve a cero.')) return;
                    // Cambiar de juego a medio recreo también tira el ranking del anterior.
                    if (!activo && enCurso && !confirm(`¿Cambiar ${enCurso.nombre} por ${c.nombre}? Se reparten los tickets de la ronda actual.`)) return;
                    accion(`mini-${c.clave}`, 'admin:minijuego', { clave: c.clave },
                      activo ? `${c.nombre}: ronda nueva` : `${c.nombre} lanzado a todos`);
                  }}
                >
                  {activo ? 'Ronda nueva' : 'Lanzar ▸'}
                </button>
              </li>
            );
          })}
        </ul>

        {minijuego && enCurso && (
          <>
            <div className="cabecera-seccion">
              <h3>Invernadero · {enCurso.nombre}</h3>
              <button
                className="peligro"
                disabled={bloqueado}
                onClick={() => accion('mini-fin', 'admin:minijuego', { clave: null }, 'Minijuego terminado')}
              >
                Terminar minijuego
              </button>
            </div>
            {minijuego.ranking.length === 0 ? (
              <p className="pendiente">Nadie ha terminado un intento todavía.</p>
            ) : (
              <table>
                <thead><tr><th>#</th><th>Jugador</th><th>Equipo</th><th>Puntos</th></tr></thead>
                <tbody>
                  {minijuego.ranking.map((r, i) => (
                    <tr key={r.userId} className={i === 0 ? 'destacada' : ''}>
                      <td>{i + 1}</td><td>{r.nombre}</td><td>{r.equipo}</td><td>{r.puntos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </section>
  );
}
