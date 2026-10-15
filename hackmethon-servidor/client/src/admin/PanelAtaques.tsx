import { useState } from 'react';
import type { FormEvent } from 'react';
import type { AppSocket } from '../lib/socket';
import { call } from '../lib/socket';
import { sonar } from '../lib/sonido';

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
