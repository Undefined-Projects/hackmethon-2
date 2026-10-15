import { createPortal } from 'react-dom';
import { usePlayer, useSession } from '../session/SessionContext';
import { useDestruccion } from '../lib/destruccion';
import { DestruccionRobot } from '../admin/DestruccionRobot';

/**
 * El anuncio del primer ganador de una fase, en la pantalla del jugador.
 *
 * Cuando un equipo es el PRIMERO en superar una fase, toda la sala lo ve:
 * aquí, encima de lo que esté haciendo cada uno —el lobby o una fase, en
 * cualquier puesto—, la misma destrucción del robot que en la
 * proyección, con el cartel del equipo al final.
 *
 * Dos diferencias con la pared, a propósito:
 * - Va SIN SONIDO. Treinta equipos de tres son noventa portátiles: el
 *   estruendo lo pone la proyección, una vez.
 * - Se puede cerrar (SEGUIR JUGANDO). El cronómetro de cada equipo sigue
 *   corriendo, y la cortesía de enseñarlo no puede costarle la fase a
 *   quien va justo de tiempo.
 *
 * Va en un portal a <body>: la app del jugador lleva efectos con
 * `transform`, y debajo de uno de ellos un `position: fixed` deja de
 * cubrir la pantalla.
 */
export function AnuncioPrimera() {
  const player = usePlayer();
  const { socket } = useSession();
  const fases = player.lobby.map((f) => ({ id: f.phaseId, order: f.order, esFinal: f.esFinal, esBonus: f.esBonus }));
  const { cola, base, terminar } = useDestruccion(socket, fases);
  if (!cola) return null;
  return createPortal(
    <DestruccionRobot key={cola[0].id} cola={cola} rotas={base} onFin={terminar} mudo alSaltar={terminar} />,
    document.body,
  );
}
