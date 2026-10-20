import { useState } from 'react';
import type { FormEvent } from 'react';
import type { AppSocket } from '../lib/socket';
import { call } from '../lib/socket';
import { sonar } from '../lib/sonido';
import {
  DURACION_ESCUDO_MS, DURACION_SUPER_MS, ENFRIAMIENTO_SUPER_MS, INTENSIDAD_BASE, INTENSIDAD_MAX,
  INTENSIDAD_MIN, PRECIO_ESCUDO, PRECIO_SUPER, TICKETS_FASE, TICKETS_FASE_RESTO, TICKETS_MINIJUEGO,
  TICKETS_MINIJUEGO_PARTICIPAR,
} from '../shared/constants';

/**
 * Los ataques entre equipos, vistos desde el panel: sus reglas y la
 * espera entre un ataque y el siguiente, que se ajusta en caliente.
 *
 * Las reglas no se pueden cambiar desde aquí a propósito —un ataque es
 * siempre de equipo a equipo y nunca dos seguidos al mismo—, pero se
 * escriben a la vista porque es lo primero que preguntará alguien de la
 * sala.
 */

const ATAJOS = [30, 60, 120, 300];
const ERRORES: Record<string, string> = {
  ENFRIAMIENTO_FUERA_DE_RANGO: 'Entre 5 segundos y 30 minutos',
  NOT_ALLOWED: 'Esa acción es solo del panel',
  TIMEOUT: 'El servidor no respondió',
};

/** «90» → «1 min 30 s». */
const duracion = (s: number) => {
  const m = Math.floor(s / 60), r = s % 60;
  return m && r ? `${m} min ${r} s` : m ? `${m} min` : `${r} s`;
};

export function PanelAtaques({ enfriamientoMs, socket, bloqueado, onAviso, onProbar }: {
  enfriamientoMs: number;
  socket: AppSocket;
  bloqueado: boolean;
  onAviso: (a: { tipo: 'ok' | 'err'; texto: string }) => void;
  onProbar: () => void;
}) {
  const actual = Math.round(enfriamientoMs / 1000);
  const [borrador, setBorrador] = useState(String(actual));
  const [guardando, setGuardando] = useState(false);
  // Si otro admin lo cambia, el campo lo refleja.
  const [visto, setVisto] = useState(actual);
  if (visto !== actual) { setVisto(actual); setBorrador(String(actual)); }

  async function fijar(segundos: number) {
    if (!Number.isFinite(segundos) || segundos === actual) { setBorrador(String(actual)); return; }
    sonar('boton');
    setGuardando(true);
    const r = await call(socket, 'admin:ataque:enfriamiento', { segundos });
    setGuardando(false);
    if (r.ok) onAviso({ tipo: 'ok', texto: `Espera entre ataques: ${duracion(Math.round(segundos))}` });
    else {
      setBorrador(String(actual));
      onAviso({ tipo: 'err', texto: ERRORES[r.error ?? ''] ?? r.error ?? 'No se pudo cambiar' });
    }
  }
  const enviar = (e: FormEvent) => { e.preventDefault(); void fijar(Number(borrador)); };
  const quieto = bloqueado || guardando;

  return (
    <section className="panel">
      <div className="panel__bar">
        <span className="panel__name">ATAQUES ENTRE EQUIPOS</span>
        <span className="panel__stat">UNO CADA {duracion(actual).toUpperCase()}</span>
      </div>
      <div className="panel__body">
        <ul className="ataques-reglas">
          <li>Se ataca a un <b>equipo</b>, nunca a una persona: a cada integrante le cae la avería de su puesto.</li>
          <li>Un equipo <b>no puede atacar dos veces seguidas al mismo</b>: tiene que atacar a otro antes de volver a por él.</li>
          <li>Después de atacar, el equipo <b>espera</b> lo que diga aquí abajo. La espera es del equipo, no de la persona.</li>
          <li>
            La <b>intensidad depende de la distancia en fases</b> superadas: ×{INTENSIDAD_BASE} por cada fase que el
            atacado le lleve al atacante, y al revés divide (entre ×{INTENSIDAD_MIN} y ×{INTENSIDAD_MAX}). En la misma
            fase, la avería de serie (Terminal 3 s, Pantalla y Datos 12 s).
          </li>
        </ul>

        <h3 className="ataques-subtitulo">Tickets</h3>
        <ul className="ataques-reglas">
          <li>
            Se ganan <b>superando fases</b>: {TICKETS_FASE.map((t, i) => `${i + 1}.º ${t}`).join(' · ')} · resto {TICKETS_FASE_RESTO}.
          </li>
          <li>
            Y en las <b>rondas de minijuego</b> lanzadas desde aquí, por el mejor jugador de cada equipo
            al cerrar la ronda: {TICKETS_MINIJUEGO.map((t, i) => `${i + 1}.º ${t}`).join(' · ')} · participar {TICKETS_MINIJUEGO_PARTICIPAR}.
            La sala de espera no da tickets.
          </li>
          <li>
            <b>Escudo</b> · {PRECIO_ESCUDO} T: los ataques normales rebotan durante {DURACION_ESCUDO_MS / 1000} s. El atacante gasta
            igual su espera.
          </li>
          <li>
            <b>Súper ataque</b> · {PRECIO_SUPER} T: inmoviliza a todo el equipo rival {DURACION_SUPER_MS / 1000} s y atraviesa el
            escudo. Espera propia de {ENFRIAMIENTO_SUPER_MS / 60_000} min.
          </li>
          <li>Los tickets son <b>privados</b>: solo los ven el equipo y este panel. Se ajustan a mano en la tarjeta de cada equipo.</li>
        </ul>
        {/* Sin la validación del navegador: su globo dice «valor no válido»
            y el aviso del panel dice el rango, que es lo que hay que saber. */}
        <form className="ataques-espera" onSubmit={enviar} noValidate>
          <label>
            <span>Espera entre ataques (segundos)</span>
            <input
              type="number" min={5} max={1800} step={1} value={borrador} disabled={quieto}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setBorrador(String(actual)); }}
            />
          </label>
          {Number(borrador) !== actual && (
            <button type="submit" disabled={quieto}>{guardando ? 'GUARDANDO…' : 'APLICAR'}</button>
          )}
          <span className="ataques-atajos">
            {ATAJOS.map((s) => (
              <button key={s} type="button" className={s === actual ? 'activo' : ''} disabled={quieto} onClick={() => void fijar(s)}>
                {duracion(s)}
              </button>
            ))}
          </span>
          <button type="button" className="ataques-probar" onClick={onProbar}>▸ PROBAR ATAQUE</button>
        </form>
        <p className="ayuda">
          Se aplica al momento, también a los equipos que ya están esperando: su reloj se recalcula con
          la espera nueva. La pausa del evento sigue congelando la espera.
        </p>
      </div>
    </section>
  );
}
