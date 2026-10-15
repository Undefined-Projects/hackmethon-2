import { useState } from 'react';
import { PARTES_ROBOT, type ParteRobot } from '../shared/events';
import { nombreParte } from '../lib/anatomia';

/**
 * El robot del lobby: cada fase superada destruye una parte de su
 * cuerpo. Desde aquí se ENSAYA esa animación en los lobbies —una parte o
 * la secuencia entera—, sin tocar ningún dato: cae, espera unos segundos
 * y el robot se recompone. Solo la ve quien esté en el lobby.
 */
export function PanelRobot({
  bloqueado, accion,
}: {
  bloqueado: boolean;
  accion: (key: string, event: string, payload: unknown, exito: string) => Promise<unknown>;
}) {
  const [parte, setParte] = useState<ParteRobot | 'todo'>('todo');
  const nombre = parte === 'todo' ? 'la secuencia completa' : nombreParte(parte).toLowerCase();
  return (
    <section className="panel">
      <div className="panel__bar">
        <span className="panel__name">EL ROBOT DEL LOBBY</span>
        <span className="panel__stat">ENSAYO DE DESTRUCCIÓN</span>
      </div>
      <div className="panel__body">
        <p className="ayuda">
          Al superar una fase, su parte del robot se destruye en el lobby del equipo: las piernas,
          los brazos, la cabeza y el corazón caen al suelo; el torso se agrieta. Aquí se ensaya la
          animación en todos los lobbies. No guarda nada: el robot se recompone a los pocos segundos.
          En la proyección cada parte tiene su propia muerte —desmoronada, cortocircuito, arrancado,
          sobrecarga, fractura, apagado, florece— y la secuencia completa va en el orden de las fases.
          En la partida salta sola, en todas las pantallas menos este panel, cuando un equipo es el
          primero en superar una fase, y termina con el logo y el nombre de ese equipo.
        </p>
        <div className="robot-ensayo">
          <label>
            <span>Parte</span>
            <select value={parte} onChange={(e) => setParte(e.target.value as ParteRobot | 'todo')}>
              <option value="todo">Secuencia completa (todas, una tras otra)</option>
              {PARTES_ROBOT.map((p) => <option key={p} value={p}>{nombreParte(p)}</option>)}
            </select>
          </label>
          <button
            className="ensayar-todo"
            disabled={bloqueado}
            onClick={() => accion('robot-ensayo', 'admin:anatomia:ensayo', { parte }, `Ensayo de destrucción lanzado: ${nombre}`)}
          >
            ▸ PROBAR EN LOS LOBBIES
          </button>
          <button
            className="ensayar-todo"
            disabled={bloqueado}
            title="Abre la proyección (>> PROYECCIÓN) en otra ventana para verlo"
            onClick={() => accion('robot-proyeccion', 'admin:destruccion:ensayo', { parte }, `En la proyección: ${nombre}`)}
          >
            ▸ PROBAR EN LA PROYECCIÓN
          </button>
          <button
            className="ensayar-todo"
            disabled={bloqueado}
            title="La animación sale en TODAS las pantallas: jugadores y proyección. Interrumpe a quien esté jugando."
            onClick={() => {
              if (!window.confirm('La animación saldrá en todas las pantallas, también en las de quien esté jugando. ¿Seguir?')) return;
              void accion('robot-todos', 'admin:destruccion:ensayo', { parte, todos: true }, `En todas las pantallas: ${nombre}`);
            }}
          >
            ▸ PROBAR EN TODAS LAS PANTALLAS
          </button>
        </div>
      </div>
    </section>
  );
}
