import { useCallback, useRef, useState } from 'react';
import type { AppSocket } from '../../lib/socket';
import { call } from '../../lib/socket';

export type Envio = 'nada' | 'enviando' | 'ok' | 'err';

/**
 * El fin de un intento, igual en todos los minijuegos: se manda el
 * puntaje y el servidor contesta con el mejor de la persona en esta
 * ronda. Una ronda vieja o un número absurdo los rechaza él.
 */
export function usePuntaje(socket: AppSocket | null, ronda: string) {
  const [mejor, setMejor] = useState(0);
  const [envio, setEnvio] = useState<Envio>('nada');
  // Récord = este intento superó el mejor anterior de la persona (y no
  // es el primero en cero). Es lo que dispara la lluvia de pétalos.
  const [record, setRecord] = useState(false);
  const previo = useRef(0);

  const enviar = useCallback(async (puntos: number) => {
    if (!socket) return;
    setEnvio('enviando');
    const r = await call<{ mejor: number }>(socket, 'minijuego:puntaje', { ronda, puntos });
    if (r.ok && r.data) {
      setRecord(puntos > 0 && puntos > previo.current && r.data.mejor === puntos);
      previo.current = r.data.mejor;
      setMejor(r.data.mejor);
      setEnvio('ok');
    } else setEnvio('err');
  }, [socket, ronda]);

  const olvidar = useCallback(() => { setEnvio('nada'); setRecord(false); }, []);

  return { mejor, envio, enviar, olvidar, record };
}

/** Lo que dice la pantalla de fin mientras el puntaje viaja. */
export const textoEnvio = (envio: Envio, mejor: number) =>
  envio === 'enviando' ? 'registrando…'
    : envio === 'ok' ? `tu mejor: ${mejor}`
    : envio === 'err' ? 'no se pudo registrar' : '';
