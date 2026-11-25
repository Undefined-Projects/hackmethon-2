// Registro de módulos de fase. Añadir una fase = añadir una línea.
//
// Los módulos se nombran por su concepto, no por su número: cuando el
// recorrido cambia de orden, `fase4.ts` no le dice nada a nadie y
// `nucleo.ts` sí. El orden lo fija el seed, no este archivo.
import type { ModuloFase } from './types.js';
import { acceso } from './acceso.js';
import { espesura, marana } from './marana.js';
import { mano } from './mano.js';
import { muro } from './muro.js';
import { nucleo } from './nucleo.js';
import { boveda } from './boveda.js';
import { mente } from './mente.js';
import { rastro } from './rastro.js';

const MODULOS: Record<string, ModuloFase> = {
  [acceso.key]: acceso,
  [marana.key]: marana,
  [espesura.key]: espesura,
  [muro.key]: muro,
  [nucleo.key]: nucleo,
  [mano.key]: mano,
  [boveda.key]: boveda,
  [mente.key]: mente,
  [rastro.key]: rastro,
};

export const moduloDeFase = (key: string): ModuloFase | null => MODULOS[key] ?? null;
export const fasesImplementadas = () => Object.keys(MODULOS);

/** La semilla de la versión de cada mesa. Con FASES_CANONICAS=1 todas
 *  juegan la versión canónica: es la que conocen las pruebas por sockets. */
export const semillaDe = (teamId: string): string | undefined =>
  (process.env.FASES_CANONICAS ? undefined : teamId);
