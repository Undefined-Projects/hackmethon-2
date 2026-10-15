import type { LobbyPhaseView } from '../shared/events';

/**
 * ¿Está el equipo ESPERANDO? Es decir: ya superó todo lo que hay
 * abierto y la siguiente fase todavía no la abre el panel.
 *
 * - el evento corre (en pausa no: ahí no espera nadie, está todo parado);
 * - ya superó al menos una fase (al principio no se espera: se empieza);
 * - no tiene ninguna fase abierta pendiente, tampoco la bonus;
 * - y aún queda alguna por abrir (si no, ya terminó: no está esperando).
 *
 * Devuelve también la siguiente que le toca, para decirla por su nombre.
 */
export function enEspera(lobby: LobbyPhaseView[], estado: { status: string; paused: boolean }) {
  const orden = [...lobby].sort((a, b) => a.order - b.order);
  const resuelta = (f: LobbyPhaseView) => f.teamStatus === 'SOLVED';
  // Lo que falta por abrir: lo que el panel aún tiene BLOQUEADO. Una fase
  // que ya cerró sin que el equipo la superara no vuelve: no se espera.
  const porAbrir = (f: LobbyPhaseView) => !resuelta(f) && f.phaseStatus === 'LOCKED';
  const siguiente = orden.find((f) => porAbrir(f) && !f.esBonus) ?? orden.find(porAbrir) ?? null;
  const esperando = estado.status === 'RUNNING' && !estado.paused
    && orden.some(resuelta)
    && !orden.some((f) => f.canEnter && !resuelta(f))
    && siguiente !== null;
  return { esperando, siguiente };
}
