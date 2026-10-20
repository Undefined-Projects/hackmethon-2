import { useSession } from '../session/SessionContext';
import { useTicker } from '../lib/useTicker';

/**
 * Los tickets de un equipo, en su tarjeta del panel, con el ajuste a
 * mano: premios de la sala, una corrección, un castigo. El saldo nunca
 * baja de cero, aunque se reste más de lo que tiene.
 *
 * Solo existe en el panel. La proyección y la carrera NO lo pintan: el
 * saldo es privado de cada equipo, y la pared la ve toda la sala.
 */
const PASOS = [-5, -1, 1, 5];

export function BolsaEquipo({ equipo, bloqueado, accion }: {
  equipo: { id: string; name: string; tickets: number; escudoMs: number };
  bloqueado: boolean;
  accion: (key: string, event: string, payload: unknown, exito: string) => Promise<unknown>;
}) {
  const { stampedAt, snapshot } = useSession();
  useTicker(1000);
  const pausado = snapshot?.event.paused ?? false;
  const escudo = pausado ? equipo.escudoMs : Math.max(0, equipo.escudoMs - (Date.now() - stampedAt));
  const s = Math.ceil(escudo / 1000);

  return (
    <div className="bolsa-equipo">
      <span className="bolsa-equipo__saldo" title="Tickets del equipo (privado)">{equipo.tickets} T</span>
      {escudo > 0 && <span className="bolsa-equipo__escudo">ESCUDO {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>}
      <span className="bolsa-equipo__ajuste">
        {PASOS.map((d) => (
          <button
            key={d} type="button" className="sutil" disabled={bloqueado || (d < 0 && equipo.tickets === 0)}
            title={`${d > 0 ? 'Dar' : 'Quitar'} ${Math.abs(d)} ticket(s) a ${equipo.name}`}
            onClick={() => void accion(
              `tickets-${equipo.id}`, 'admin:equipo:tickets', { teamId: equipo.id, delta: d },
              `${equipo.name}: ${d > 0 ? '+' : ''}${d} tickets`,
            )}
          >
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </span>
    </div>
  );
}
