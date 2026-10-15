// Registro de módulos de fase. Añadir una fase = añadir una línea.
//
// Los módulos se nombran por su concepto, no por su número: con seis
// fases en el recorrido, `fase4.ts` no le dice nada a nadie y
// `nucleo.ts` sí. El orden lo fija el seed, no este archivo.
import type { ModuloFase } from './types.js';
import { acceso } from './acceso.js';
import { enemigo } from './enemigo.js';
import { muro } from './muro.js';
import { nucleo } from './nucleo.js';
import { boveda } from './boveda.js';
import { puente } from './puente.js';
import { rastro } from './rastro.js';

const MODULOS: Record<string, ModuloFase> = {
  [acceso.key]: acceso,
  [enemigo.key]: enemigo,
  [muro.key]: muro,
  [nucleo.key]: nucleo,
  [boveda.key]: boveda,
  [puente.key]: puente,
  [rastro.key]: rastro,
};

export const moduloDeFase = (key: string): ModuloFase | null => MODULOS[key] ?? null;
export const fasesImplementadas = () => Object.keys(MODULOS);
