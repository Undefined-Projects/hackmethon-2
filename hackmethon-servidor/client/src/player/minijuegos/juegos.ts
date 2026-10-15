import type { ComponentType } from 'react';
import type { MinijuegoClave, MinijuegoView } from '../../shared/events';
import type { AppSocket } from '../../lib/socket';
import { Snake } from './Snake';
import { Plaga } from './Plaga';
import { Sinapsis } from './Sinapsis';
import { Latido } from './Latido';

/** Qué componente pinta cada recreo. Una clave del servidor sin juego
 *  aquí simplemente no aparece: mejor eso que una pantalla rota. Lo usan
 *  el recreo del panel y la sala de espera. */
export const JUEGOS: Record<MinijuegoClave, ComponentType<{ minijuego: MinijuegoView; socket: AppSocket | null }>> = {
  snake: Snake, plaga: Plaga, sinapsis: Sinapsis, latido: Latido,
};
