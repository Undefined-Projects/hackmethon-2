import { useEffect, useMemo, useState } from 'react';
import type { AtaqueReciente } from '../shared/events';
import { VIDA_LINEA_ATAQUE_MS } from '../shared/constants';
import type { AppSocket } from './socket';
import { useTicker } from './useTicker';

/** Un ataque con su hora pasada al reloj de ESTE navegador. */
export type AtaqueVivo = AtaqueReciente & { local: number };

/**
 * Los ataques que se ven en el mapa: los del último minuto.
 *
 * Llegan por dos sitios. El snapshot trae los que ya había al conectar
 * (o al reconectar), y `ataque:lanzado` los nuevos en el momento. Los
 * dos llevan el id de la misma fila de la bitácora, así que un ataque
 * que llega por las dos vías se pinta una vez.
 *
 * La hora del servidor se pasa al reloj local con el desfase de la
 * sesión: un portátil con el reloj adelantado medio minuto borraría las
 * líneas a la mitad de su vida.
 */
export function useAtaques(socket: AppSocket | null, iniciales: AtaqueReciente[], desfase: number): AtaqueVivo[] {
  useTicker(1000);
  const [vivos, setVivos] = useState<Map<string, AtaqueVivo>>(new Map());

  useEffect(() => {
    if (!socket) return;
    // Al llegar uno se tiran los caducados: la sesión dura horas.
    const nuevo = (a: AtaqueReciente) => setVivos((m) => {
      const t = Date.now();
      const sig = new Map([...m].filter(([, x]) => t - x.local < VIDA_LINEA_ATAQUE_MS));
      return sig.set(a.id, { ...a, local: t });
    });
    socket.on('ataque:lanzado', nuevo);
    return () => { socket.off('ataque:lanzado', nuevo); };
  }, [socket]);

  const ahora = Date.now();
  return useMemo(() => {
    const todos = new Map<string, AtaqueVivo>();
    for (const a of iniciales) todos.set(a.id, { ...a, local: a.at - desfase });
    for (const [id, a] of vivos) if (!todos.has(id)) todos.set(id, a);
    return [...todos.values()]
      .filter((a) => ahora - a.local < VIDA_LINEA_ATAQUE_MS)
      .sort((a, b) => a.local - b.local);
    // `ahora` cambia cada segundo (useTicker): así caducan solas.
  }, [iniciales, vivos, desfase, ahora]);
}
