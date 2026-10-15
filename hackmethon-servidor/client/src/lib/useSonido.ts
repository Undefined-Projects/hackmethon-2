import { useSyncExternalStore } from 'react';
import { estadoSonido, suscribirSonido } from './sonido';

/** Lo que el usuario quiere y lo que el navegador deja. */
export function useSonido(): { encendido: boolean; bloqueado: boolean } {
  return useSyncExternalStore(suscribirSonido, estadoSonido, estadoSonido);
}
