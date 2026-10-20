// ============================================================
//  Utilidades compartidas por los módulos de fase.
//
//  Todo lo que había acabado copiado y pegado en cada fase: los
//  constructores de bloques, la cuarentena creciente y los lectores del
//  estado persistido. Nada de esto sabe de ninguna fase en concreto.
//
//  La cuarentena vive aquí y no en cada módulo por una razón de diseño,
//  no de ahorro: el castigo por acusar en falso tiene que sentirse igual
//  en las seis fases. Si cada una eligiera el suyo, el equipo no podría
//  aprender cuánto cuesta equivocarse.
// ============================================================

import type { BloqueSalida, ContextoComando, ResultadoComando } from './types.js';

export { normalizar } from './types.js';
import { normalizar as normalizarTexto } from './types.js';

// ---------- Bloques de salida ----------

export const texto = (lineas: string[], titulo?: string): BloqueSalida =>
  ({ tipo: 'texto', titulo, lineas });

export const error = (t: string): BloqueSalida => ({ tipo: 'error', texto: t });

export const exito = (titulo: string, lineas: string[]): BloqueSalida =>
  ({ tipo: 'exito', titulo, lineas });

export const lista = (titulo: string, items: { clave: string; valor: string }[]): BloqueSalida =>
  ({ tipo: 'lista', titulo, items });

export const tabla = (titulo: string, columnas: string[], filas: string[][]): BloqueSalida =>
  ({ tipo: 'tabla', titulo, columnas, filas });

// ---------- Cuarentena ----------
//
// Plana, barrer el espacio de respuestas salía más barato que razonar.
// Creciendo, el tercer palo de ciego ya cuesta minuto y medio. El primer
// error sigue siendo barato: equivocarse una vez mientras se piensa es
// parte del juego, y cobrarlo caro enseñaría a no probar.

export const CUARENTENAS_MS = [20_000, 45_000, 90_000];

export const cuarentenaPara = (fallosPrevios: number) =>
  CUARENTENAS_MS[Math.min(Math.max(fallosPrevios, 0), CUARENTENAS_MS.length - 1)];

/** Si el equipo está en cuarentena, el bloque que hay que devolver. */
export function cuarentenaActiva(ctx: ContextoComando): ResultadoComando | null {
  const hasta = (ctx.estado.cuarentenaHasta as number) ?? 0;
  if (ctx.ahora >= hasta) return null;
  const restan = Math.ceil((hasta - ctx.ahora) / 1000);
  return { bloques: [error(`Sistema en cuarentena. Reintenta en ${restan} s.`)] };
}

/**
 * El rechazo estándar: penaliza, agranda la siguiente cuarentena y lo
 * dice. `motivo` tiene que ser IDÉNTICO para todos los caminos que
 * fallan: si un rechazo se distinguiera de otro, ir fallando iría
 * diciendo por dónde se acerca uno y la fase se barrería a ciegas.
 */
export function rechazo(
  ctx: ContextoComando,
  motivo: string,
  extra: Record<string, unknown> = {},
): ResultadoComando {
  const fallos = numero(ctx.estado, 'fallos');
  const castigo = cuarentenaPara(fallos);
  return {
    fallo: true,
    estado: { ...ctx.estado, ...extra, fallos: fallos + 1, cuarentenaHasta: ctx.ahora + castigo },
    bloques: [
      error(motivo),
      texto([`Sistema en cuarentena ${castigo / 1000} s.`]),
    ],
  };
}

// ---------- Lectores del estado persistido ----------

export const listaDe = (estado: Record<string, unknown>, campo: string): string[] =>
  Array.isArray(estado[campo]) ? (estado[campo] as string[]) : [];

export const numero = (estado: Record<string, unknown>, campo: string): number =>
  typeof estado[campo] === 'number' ? (estado[campo] as number) : 0;

// ---------- Circuito cerrado ----------
//
//  Lo comparten las fases que tienen camaras. El dibujo es de cada fase
//  —una rampa de lanzamiento y un control de acceso no se parecen en
//  nada— pero el lienzo es el mismo, y tiene que serlo: el cliente pinta
//  las dos con el mismo monitor, y un fotograma de otro alto le haria dar
//  un salto a la caja.

/** Alto y ancho del lienzo, en caracteres. */
export const ALTO_CAMARA = 15;
export const ANCHO_CAMARA = 36;

/** Recorta o rellena hasta el alto fijo. Rellena por ARRIBA para que el
 *  suelo de la escena se quede donde esta. */
export const lienzo = (l: string[]): string[] => {
  const c = l.slice(0, ALTO_CAMARA);
  while (c.length < ALTO_CAMARA) c.unshift(' '.repeat(ANCHO_CAMARA));
  return c;
};

/** Rellena o recorta una tira a lo ancho, para que las columnas de dos
 *  fotogramas seguidos caigan en el mismo sitio. */
export const tira = (s: string, n: number): string => (s + ' '.repeat(n)).slice(0, n);

export type Escena = {
  /** Fotogramas en bucle. Uno solo = imagen quieta. */
  fotogramas: string[][];
  /** Milisegundos por fotograma. */
  ritmo: number;
};

export type TonoRotulo = 'ok' | 'alerta' | 'neutro';
export type Rotulo = { texto: string; tono: TonoRotulo };

/** Una camara del circuito de una fase. */
export type CamaraDef = {
  n: number;
  id: string;
  nombre: string;
  sector: string;
  /** Lo que enfoca, para el listado. Se lee detras de «Enfoca …». */
  que: string;
};

/** Lo que el cliente necesita para pintar una camara. */
export type VistaCamara = {
  n: number;
  nombre: string;
  sector: string;
  /** Firma de la imagen: mientras no cambie, el bucle del cliente no se
   *  reinicia. Sin ella, cualquier reproyeccion —un contador que sube—
   *  devolvia la escena al primer fotograma. */
  clave: string;
  fotogramas: string[][];
  ritmo: number;
  rotulos: Rotulo[];
  /** Secuencia de un solo pase. Solo la usa la fase que tiene desenlace. */
  detonacion: string[][] | null;
  ritmoDetonacion: number;
  armada: boolean;
  tension: number;
  ruido: number;
  /**
   * La escena en datos, para la fase que tiene dibujo propio en el
   * cliente (la membrana de la Fase 1). Los fotogramas de texto siguen
   * llegando: son la imagen de reserva y lo que vigilan las pruebas. El
   * dibujo NO puede llevar nada que los fotogramas no lleven ya —quién
   * está en la cola y si pasa—, o la cámara cantaría lo que es de Datos.
   */
  dibujo?: { tipo: string } & Record<string, unknown>;
};

/**
 * El sobre del circuito cerrado, igual para todas las fases que tienen
 * camaras. Cada fase pone SU dibujo y SUS rotulos; el resto —cual esta
 * puesta, la lista, la firma— es siempre lo mismo y no tiene por que
 * escribirse cinco veces.
 *
 * `ventana` solo la manda la fase que tiene un reloj que enseñar; que
 * falte entera significa «aqui no hay reloj», y es lo que impide que el
 * rotulo de una fase enseñe una mecanica de otra.
 */
export function circuitoCerrado(
  camaras: readonly CamaraDef[],
  estado: Record<string, unknown>,
  pintar: (cam: CamaraDef) => {
    escena: Escena;
    rotulos: Rotulo[];
    clave: string;
    extra?: Partial<VistaCamara>;
  },
  ventana?: { hasta: number | null },
) {
  const n = Math.min(camaras.length, Math.max(1, numero(estado, 'camara') || 1));
  const cam = camaras[n - 1];
  const { escena, rotulos, clave, extra } = pintar(cam);
  return {
    activa: n,
    lista: camaras.map((c) => ({ n: c.n, nombre: c.nombre, sector: c.sector })),
    ...(ventana ? { ventana } : {}),
    vista: {
      n: cam.n,
      nombre: cam.nombre,
      sector: cam.sector,
      clave: `${cam.id}:${clave}`,
      fotogramas: escena.fotogramas,
      ritmo: escena.ritmo,
      rotulos,
      detonacion: null,
      ritmoDetonacion: 0,
      armada: true,
      tension: 0,
      ruido: 0,
      ...extra,
    } as VistaCamara,
  };
}

/** `camara 2`, `camara vestibulo`, `camara b-07`, `camara siguiente`. Se
 *  acepta el numero, el nombre y el sector porque por radio se dice lo que
 *  sale, no lo que toca. */
export function resolverCamara(
  camaras: readonly CamaraDef[],
  arg: string,
  actual: number,
): number | null {
  if (!arg) return null;
  if (arg === 'siguiente' || arg === 'sig') return (actual % camaras.length) + 1;
  if (arg === 'anterior' || arg === 'ant') return ((actual - 2 + camaras.length) % camaras.length) + 1;
  const n = Number(arg);
  if (Number.isInteger(n) && n >= 1 && n <= camaras.length) return n;
  const porNombre = camaras.find(
    (c) => c.id === arg || normalizarTexto(c.sector) === arg || normalizarTexto(c.nombre).includes(arg),
  );
  return porNombre ? porNombre.n : null;
}

/**
 * El mando de las camaras, entero. Devuelve `null` si el verbo no es de
 * camara, para que la fase siga con su `switch`.
 *
 * Mirar NUNCA penaliza, en ninguna fase: observar es la mitad del juego y
 * cobrarla enseñaria a no mirar, que es lo contrario de lo que hace falta.
 */
export function mandoDeCamaras(
  camaras: readonly CamaraDef[],
  verbo: string,
  arg: string,
  estado: Record<string, unknown>,
): ResultadoComando | null {
  if (verbo !== 'camara' && verbo !== 'camaras' && verbo !== 'cam') return null;
  const actual = numero(estado, 'camara') || 1;

  if (verbo === 'camaras' && !arg) {
    return {
      bloques: [
        texto(
          camaras.map((c) => `${c.n}  ${c.nombre}  ·  sector ${c.sector}  —  ${c.que}`),
          'Circuito cerrado',
        ),
        texto([`Ahora mismo se esta viendo la ${actual}. Cambia con \`camara <n>\`.`]),
      ],
    };
  }

  const n = resolverCamara(camaras, arg, actual);
  if (n === null) {
    return {
      bloques: [
        error(`No hay ninguna camara «${arg || '(nada)'}».`),
        texto([`Van de la 1 a la ${camaras.length}. \`camaras\` las lista.`]),
      ],
    };
  }

  const cam = camaras[n - 1];
  return {
    // Cambiar de camara toca el estado, y por eso se reproyecta: es la
    // unica forma de que la imagen le cambie a Pantalla.
    estado: { ...estado, camara: n },
    bloques: [
      texto(
        [`CAM-${cam.n}  ·  ${cam.nombre}  ·  sector ${cam.sector}`, `Enfoca ${cam.que}.`],
        'Camara en pantalla',
      ),
    ],
  };
}

/** Las lineas de ayuda del mando, para que las cinco fases digan lo mismo. */
export const AYUDA_CAMARAS = [
  'camaras                      — que camaras hay',
  'camara <n|nombre>            — cambiar a esa camara',
  'camara siguiente             — pasar a la de al lado',
];
