// ============================================================
//  FASE 4 — La Mano   ·   LISTAS Y TIPOS DE DATOS
//  Lámina IV · el brazo derecho
//
//  «Con esta mano les ofrezco lo que quieran. Solo no me la quiten.»
//
//  La mano derecha es la que negocia: la que ofrece. Para desarmarla hay
//  que entender cómo la guarda la máquina: como LISTAS, y ordenadas.
//
//  DOS CAPAS (unos 30-35 minutos entre las dos)
//    1 · LAS FALANGES  La mano es una lista de listas: cinco dedos y tres
//                      falanges por dedo, `mano[dedo][falange]`. Cada
//                      falange lleva DOS datos: en el FRENTE un número y en
//                      el REVERSO un texto («100», «25», «3»). Cada dedo hay
//                      que ORDENARLO, de la base (0) a la punta (2), y cómo
//                      depende de su TIPO DE DATO, que solo tiene Datos:
//                        · numero → por el frente, como número: 2 < 9 < 10
//                        · texto  → por el reverso, como texto, carácter
//                                   por carácter: "10" < "2" < "9"
//                      Pantalla ve el frente o el reverso —una cámara cada
//                      vez, y el reverso en espejo— y Terminal cambia la
//                      cámara y mueve falanges a ciegas.
//    2 · LOS TENDONES  Doce tendones revueltos. Para soltar la mano hay que
//                      ordenarlos con DOS CRITERIOS —primero por dedo y,
//                      dentro de cada dedo, por tensión— y con un
//                      PRESUPUESTO de intercambios: el mínimo posible más
//                      dos. Mover sin plan agota el presupuesto.
//
//  LO QUE ENSEÑA
//    · una lista guarda cosas en orden, y a cada una se llega por su índice
//    · los índices empiezan en 0; una lista puede guardar listas
//    · los datos tienen TIPO, y el tipo cambia cómo se comparan: el mismo
//      «10» va antes que el «9» como texto y después como número
//    · ordenar es un algoritmo; se puede ordenar por varios criterios
//    · un algoritmo tiene un costo, y planear lo abarata
//
//  EL REPARTO
//    PANTALLA  la mano en 3D: el frente (cámara 1) o el reverso (cámara 2),
//              con el número de cada dedo y el índice de cada falange
//              (capa 1); los tendones en su orden, con su letra (capa 2).
//    DATOS     el tipo de dato de cada dedo y cómo se compara cada tipo
//              (capa 1); la tabla de tendones con su dedo y su tensión, y
//              las reglas del orden (capa 2). No ve la mano.
//    TERMINAL  escribe a ciegas, con índices, y cambia la cámara.
//
//  Una versión por mesa: otros datos, otros tipos, otro revoltijo.
// ============================================================

import type { Role } from '../lib/constants.js';
import type { ContextoComando, ModuloFase, ResultadoComando } from './types.js';
import {
  cuarentenaActiva, error, exito, mandoDeCamaras, normalizar, numero, rechazo, texto, AYUDA_CAMARAS,
  type CamaraDef,
} from './comun.js';

type Capa = 1 | 2;
const CAPAS = 2;
const NOMBRES_CAPA = ['LAS FALANGES', 'LOS TENDONES'];

export const DEDOS = ['pulgar', 'indice', 'medio', 'anular', 'menique'];
export const FALANGES = ['base', 'media', 'punta'];
export type TipoDato = 'numero' | 'texto';
/** Cuántos tendones lleva cada dedo: doce en total. */
const POR_DEDO = [2, 3, 2, 3, 2];
const LETRAS = 'ABCDEFGHIJKL'.split('');
/** El presupuesto es el mínimo posible más esto. */
const HOLGURA = 2;

/** Las dos caras de la mano: la palma y el dorso. */
const CAMARAS: CamaraDef[] = [
  { n: 1, id: 'frente', nombre: 'FRENTE', sector: 'M-01', que: 'la palma: el dato del frente de cada falange' },
  { n: 2, id: 'reverso', nombre: 'REVERSO', sector: 'M-02', que: 'el dorso: el dato del reverso, visto en espejo' },
];

// ---------- Azar con semilla ----------

function azarDe(semilla: string) {
  let a = [...semilla].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const entero = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
function barajar<T>(xs: T[], r: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Comparar según el tipo ----------

/** Como número: 2 < 9 < 10. Como texto, carácter por carácter: "10" < "2" < "9". */
export const comoNumero = (a: number, b: number) => a - b;
export const comoTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export type Falange = { frente: number; reverso: string };
/** El orden bueno de un dedo, como índices de sus falanges de llegada. */
export function ordenDeDedo(falanges: Falange[], tipo: TipoDato): number[] {
  return [0, 1, 2].sort((i, j) => (tipo === 'numero'
    ? comoNumero(falanges[i].frente, falanges[j].frente)
    : comoTexto(falanges[i].reverso, falanges[j].reverso)));
}

// ---------- La versión de cada mesa ----------

type Tendon = { letra: string; dedo: number; tension: number };
export type InstanciaMano = {
  /** Las falanges como llegan, revueltas: 5 dedos × 3. */
  falanges: Falange[][];
  /** El tipo de dato de cada dedo: decide cómo se ordena. */
  tipos: TipoDato[];
  tendones: Tendon[];
  /** El orden en que llegan los tendones, por letra. */
  inicial: string[];
  /** El orden bueno: por dedo y, dentro, por tensión. */
  objetivo: string[];
  minimo: number;
  presupuesto: number;
};

/** Cuántos intercambios hacen falta, como mínimo, para pasar de un orden
 *  a otro: los elementos menos los ciclos de la permutación. */
export function intercambiosMinimos(actual: string[], objetivo: string[]): number {
  const pos = new Map(objetivo.map((l, i) => [l, i]));
  const visto = new Array(actual.length).fill(false);
  let ciclos = 0;
  for (let i = 0; i < actual.length; i++) {
    if (visto[i]) continue;
    ciclos++;
    let j = i;
    while (!visto[j]) { visto[j] = true; j = pos.get(actual[j])!; }
  }
  return actual.length - ciclos;
}

const iguales = (a: number[], b: number[]) => a.every((x, i) => x === b[i]);

/** Un dedo con trampa: su orden bueno no coincide con NINGUNO de los
 *  equivocados (la otra cara, o la cara buena comparada con el otro tipo),
 *  y no llega ya ordenado. Así cada error se paga. */
function dedoConTrampa(r: () => number, tipo: TipoDato): Falange[] {
  for (let intento = 0; intento < 2000; intento++) {
    // Números de uno y dos dígitos mezclados: ahí es donde texto y número
    // dejan de estar de acuerdo.
    const frentes = barajar([entero(r, 2, 9), entero(r, 10, 29), entero(r, 30, 99)], r);
    const reversos = barajar([String(entero(r, 2, 9)), String(entero(r, 10, 99)), String(entero(r, 100, 400))], r);
    if (new Set(frentes).size < 3 || new Set(reversos).size < 3) continue;
    const f: Falange[] = frentes.map((x, i) => ({ frente: x, reverso: reversos[i] }));
    const bueno = ordenDeDedo(f, tipo);
    const otros = [
      [0, 1, 2].sort((i, j) => comoTexto(String(f[i].frente), String(f[j].frente))),   // frente como texto
      [0, 1, 2].sort((i, j) => comoNumero(Number(f[i].reverso), Number(f[j].reverso))), // reverso como número
      ordenDeDedo(f, tipo === 'numero' ? 'texto' : 'numero'),                           // la otra regla
    ];
    if (otros.some((o) => iguales(o, bueno)) || iguales(bueno, [0, 1, 2])) continue;
    return f;
  }
  throw new Error('No se pudo armar un dedo con trampa');
}

const instancias = new Map<string, InstanciaMano>();

export function instanciaDeMano(semilla?: string): InstanciaMano {
  const clave = semilla ?? '';
  const hecha = instancias.get(clave);
  if (hecha) return hecha;
  const r = azarDe(`${semilla ?? 'canon'}:mano`);

  // Dos o tres dedos de cada tipo, repartidos al azar.
  const tipos = barajar<TipoDato>(['numero', 'numero', 'texto', 'texto', r() < 0.5 ? 'numero' : 'texto'], r);
  const falanges = tipos.map((t) => dedoConTrampa(r, t));

  // Los tendones: tensiones distintas, y un revoltijo que pida entre 8 y 10
  // intercambios como mínimo (ni trivial ni eterno).
  const tensiones = barajar(Array.from({ length: 60 }, (_, k) => 12 + k), r).slice(0, 12);
  const letras = barajar(LETRAS, r);
  let k = 0;
  const tendones: Tendon[] = [];
  POR_DEDO.forEach((cuantos, dedo) => {
    for (let i = 0; i < cuantos; i++) tendones.push({ letra: letras[k], dedo, tension: tensiones[k++] });
  });
  const objetivo = [...tendones].sort((a, b) => a.dedo - b.dedo || a.tension - b.tension).map((t) => t.letra);
  let inicial = objetivo;
  let minimo = 0;
  for (let intento = 0; intento < 500; intento++) {
    const prueba = barajar(objetivo, r);
    const m = intercambiosMinimos(prueba, objetivo);
    if (m >= 8 && m <= 10) { inicial = prueba; minimo = m; break; }
  }

  const hecha2: InstanciaMano = { falanges, tipos, tendones, inicial, objetivo, minimo, presupuesto: minimo + HOLGURA };
  instancias.set(clave, hecha2);
  return hecha2;
}

// ---------- El estado ----------

const capaDe = (e: Record<string, unknown>): Capa => (e.capa === 2 ? 2 : 1);
/** El orden actual de cada dedo, como índices de sus falanges de llegada. */
const permDe = (e: Record<string, unknown>): number[][] =>
  (Array.isArray(e.perm) ? (e.perm as number[][]) : DEDOS.map(() => [0, 1, 2]));
const manoActual = (inst: InstanciaMano, e: Record<string, unknown>): Falange[][] =>
  permDe(e).map((p, d) => p.map((i) => inst.falanges[d][i]));
const ordenDe = (inst: InstanciaMano, e: Record<string, unknown>): string[] =>
  (Array.isArray(e.orden) ? (e.orden as string[]) : [...inst.inicial]);
type Ultimo = { n: number; tipo: 'intercambio-falange'; dedo: number; i: number; j: number } | { n: number; tipo: 'intercambio'; i: number; j: number };

/** Qué dedos están ya en su orden. */
function dedosOrdenados(inst: InstanciaMano, e: Record<string, unknown>): boolean[] {
  return permDe(e).map((p, d) => iguales(p, ordenDeDedo(inst.falanges[d], inst.tipos[d])));
}

// ---------- Lo que ve cada puesto ----------

const laminaDe = (estado: Record<string, unknown>) => ({
  capa: capaDe(estado), capas: CAPAS, nombres: NOMBRES_CAPA, resuelta: estado.resuelta === true,
});

function esquemaDatos(inst: InstanciaMano, capa: Capa) {
  if (capa === 1) {
    return {
      lienzo: { w: 900, h: 360 },
      tablas: [
        {
          id: 'dedos', nombre: 'dedos', x: 40, y: 30, w: 300,
          descripcion: 'El tipo de dato de cada dedo',
          clave: 'id',
          columnas: ['id', 'dedo', 'tipo'],
          filas: inst.tipos.map((t, d) => [`D${d + 1}`, DEDOS[d], t]),
        },
        {
          id: 'tipos', nombre: 'tipos', x: 380, y: 30, w: 480,
          descripcion: 'Como se ordena cada tipo de dato',
          clave: 'tipo',
          columnas: ['tipo', 'que_dato', 'como_se_compara'],
          filas: [
            ['numero', 'el del FRENTE', 'como numero: 2 < 9 < 10'],
            ['texto', 'el del REVERSO', 'como texto, caracter por caracter: "10" < "2" < "9"'],
          ],
        },
        {
          id: 'reglas', nombre: 'reglas', x: 380, y: 200, w: 480,
          descripcion: 'Como tiene que quedar la mano',
          clave: 'id',
          columnas: ['id', 'regla'],
          filas: [
            ['R1', 'Cada dedo se ordena por separado, de menor a mayor.'],
            ['R2', 'Lo menor va en la base (falange 0); lo mayor, en la punta (falange 2).'],
            ['R3', 'Una falange se mueve entera: con su frente y su reverso.'],
          ],
        },
      ],
      relaciones: [{ desde: 'dedos', campo: 'tipo', hasta: 'tipos' }],
    };
  }
  return {
    lienzo: { w: 900, h: 420 },
    tablas: [
      {
        id: 'tendones', nombre: 'tendones', x: 40, y: 30, w: 360,
        descripcion: 'A que dedo va cada tendon y cuanto tira',
        clave: 'letra',
        columnas: ['letra', 'dedo', 'tension'],
        // Por letra, no en el orden bueno: el orden es lo que hay que sacar.
        filas: [...inst.tendones].sort((a, b) => a.letra.localeCompare(b.letra))
          .map((t) => [t.letra, DEDOS[t.dedo], String(t.tension)]),
      },
      {
        id: 'reglas', nombre: 'reglas', x: 440, y: 30, w: 420,
        descripcion: 'Como tienen que quedar para soltar la mano',
        clave: 'id',
        columnas: ['id', 'regla'],
        filas: [
          ['R1', 'Primero por dedo: pulgar, indice, medio, anular y menique.'],
          ['R2', 'Dentro de cada dedo, de menor a mayor tension.'],
          ['R3', `Hay ${inst.presupuesto} intercambios. Si se acaban, la mano no se suelta: hay que reiniciar.`],
          ['R4', 'Un buen intercambio deja al menos un tendon en su lugar final.'],
        ],
      },
    ],
    relaciones: [],
  };
}

function dibujo(inst: InstanciaMano, estado: Record<string, unknown>) {
  const capa = capaDe(estado);
  return {
    capa,
    resuelta: estado.resuelta === true,
    // Las dos caras viajan, pero el cliente solo pinta la de la cámara puesta.
    falanges: manoActual(inst, estado),
    cara: (numero(estado, 'camara') || 1) === 2 ? 'reverso' : 'frente',
    orden: capa === 2 ? ordenDe(inst, estado) : null,
    usados: numero(estado, 'usados'),
    presupuesto: capa === 2 ? inst.presupuesto : null,
    ultimo: (estado.ultimo as Ultimo | undefined) ?? null,
  };
}

function ayuda(capa: Capa): ResultadoComando {
  return {
    bloques: [
      texto(capa === 1 ? [
        'intercambiar <dedo> <i> <j> — cambiar de lugar dos falanges de un dedo',
        'probar                      — cuantos dedos estan en su orden. Gratis',
        'apretar                     — cerrar la mano asi. No es gratis',
        'reiniciar                   — dejar la mano como llego',
        ...AYUDA_CAMARAS,
      ] : [
        'tendones                 — el orden actual, con su indice',
        'intercambiar <i> <j>     — cambiar de lugar dos tendones',
        'soltar                   — comprobar el orden. No es gratis',
        'reiniciar                — volver al revoltijo inicial (recupera los intercambios)',
      ], 'Comandos disponibles'),
      texto(capa === 1 ? [
        'La mano es una LISTA DE LISTAS: mano[dedo][falange], contando desde CERO.',
        'Cada falange tiene dos datos: uno en el FRENTE y otro en el REVERSO.',
        'Pantalla ve una cara cada vez: tu cambias la camara (1 frente, 2 reverso).',
        '',
        'Cada dedo se ordena de la base (0) a la punta (2), y COMO depende de su',
        'TIPO DE DATO. Los tipos los tiene Datos. Ojo: "10" no se ordena igual',
        'como numero que como texto.',
      ] : [
        'Doce tendones en fila, del indice 0 al 11. Para soltar la mano tienen',
        'que quedar ordenados: primero por dedo y, dentro de cada dedo, por tension.',
        '',
        'Cada intercambio gasta del presupuesto. Planeen ANTES de mover: un',
        'buen intercambio deja al menos un tendon en su lugar final.',
      ], capa === 1 ? 'Como se guarda la mano' : 'Como se ordena'),
    ],
  };
}

// ---------- El módulo ----------

export const mano: ModuloFase = {
  key: 'fase-mano-listas',

  proyectar(role: Role, ctx) {
    const inst = instanciaDeMano(ctx.semilla);
    const capa = capaDe(ctx.estado);
    const lamina = laminaDe(ctx.estado);
    switch (role) {
      case 'DATOS':
        return {
          titulo: capa === 1 ? 'Los tipos de la mano' : 'Los tendones',
          nota: capa === 1
            ? 'Tienes el TIPO DE DATO de cada dedo y como se ordena cada tipo: por que cara y comparando como '
              + 'que. No ves la mano. Pantalla la ve —una cara cada vez— con sus numeros; Terminal mueve las '
              + 'falanges a ciegas. Ojo con el texto: "10" va antes que "9".'
            : 'Tienes a que dedo va cada tendon y cuanto tira, y las reglas del orden. Pantalla ve en que '
              + 'orden estan, por letra. Planeen juntos antes de que Terminal mueva nada: los intercambios '
              + 'se acaban.',
          lamina,
          ...esquemaDatos(inst, capa),
        };
      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          nota: capa === 1
            ? 'Ves la mano por una cámara: el FRENTE (la palma) o el REVERSO (el dorso, en espejo: el '
              + 'pulgar queda a la derecha). Cada falange tiene un dato en cada cara. Terminal cambia la '
              + 'cámara; Datos sabe qué cara manda en cada dedo y cómo se compara.'
            : 'Ves los doce tendones en su orden actual, cada uno con su letra y su indice. No sabes cuanto '
              + 'tira cada uno: eso lo sabe Datos. Diganle a Terminal que intercambiar.',
          mano: dibujo(inst, ctx.estado),
          lamina,
        };
      case 'TERMINAL':
        return {
          pista: capa === 1
            ? 'Escribe `ayuda`. La mano es una lista de listas y tu solo sabes numeros: `intercambiar <dedo> '
              + '<i> <j>`. Con `camara 1` y `camara 2` Pantalla ve el frente o el reverso.'
            : 'Los tendones van del 0 al 11. `intercambiar <i> <j>` gasta del presupuesto: no muevas '
              + 'nada hasta que el equipo tenga el plan.',
          cuarentenaHasta: (ctx.estado.cuarentenaHasta as number) ?? null,
          lamina,
        };
    }
  },

  ejecutar(comandoBruto: string, ctx: ContextoComando): ResultadoComando {
    const inst = instanciaDeMano(ctx.semilla);
    const cmd = normalizar(comandoBruto);
    const [verbo, ...resto] = cmd.split(' ').filter(Boolean);
    const capa = capaDe(ctx.estado);
    const n = numero(ctx.estado, 'accionN') + 1;

    if (ctx.estado.resuelta === true && verbo !== 'ayuda') {
      return { bloques: [texto(['La mano derecha ya no responde. Esta suelta.'])] };
    }
    if (verbo === 'ayuda' || verbo === 'help') return ayuda(capa);
    if (capa === 1) {
      const mando = mandoDeCamaras(CAMARAS, verbo, resto.join(' '), ctx.estado);
      if (mando) return mando;
    }
    const enCuarentena = cuarentenaActiva(ctx);
    if (enCuarentena && ['intercambiar', 'apretar', 'soltar'].includes(verbo)) return enCuarentena;

    const indice = (s: string | undefined, max: number, que: string): number | string => {
      const v = Number(s);
      if (s === undefined || !Number.isInteger(v)) return `Falta el ${que}: un numero entero.`;
      if (v < 0 || v > max) return `No hay ${que} ${v}: van del 0 al ${max}. Se cuenta desde cero.`;
      return v;
    };

    if (capa === 1) {
      const perm = permDe(ctx.estado);
      switch (verbo) {
        case 'intercambiar':
        case 'cambiar': {
          const d = indice(resto[0], 4, 'dedo'), i = indice(resto[1], 2, 'falange'), j = indice(resto[2], 2, 'falange');
          const uso = ' Asi: intercambiar <dedo> <i> <j>.';
          if (typeof d === 'string') return { bloques: [error(d + uso)] };
          if (typeof i === 'string') return { bloques: [error(i + uso)] };
          if (typeof j === 'string') return { bloques: [error(j + uso)] };
          if (i === j) return { bloques: [error('Intercambiar una falange consigo misma no hace nada.')] };
          const nueva = perm.map((p) => [...p]);
          [nueva[d][i], nueva[d][j]] = [nueva[d][j], nueva[d][i]];
          return {
            estado: { ...ctx.estado, perm: nueva, accionN: n, ultimo: { n, tipo: 'intercambio-falange', dedo: d, i, j } },
            bloques: [texto([`Dedo ${d}: intercambiadas las falanges ${i} y ${j}.`], 'Falanges')],
          };
        }
        case 'probar':
        case 'revisar': {
          const ok = dedosOrdenados(inst, ctx.estado).filter(Boolean).length;
          return { bloques: [texto([`${ok} de 5 dedos estan en su orden.`], 'Revision de la mano')] };
        }
        case 'reiniciar':
          return {
            estado: { ...ctx.estado, perm: DEDOS.map(() => [0, 1, 2]), accionN: n, ultimo: null },
            bloques: [texto(['La mano vuelve a como llego.'])],
          };
        case 'apretar':
        case 'cerrar':
        case 'desplegar': {
          if (!dedosOrdenados(inst, ctx.estado).every(Boolean)) {
            return rechazo(ctx, 'La mano se cerro mal: algun dedo no esta en el orden de su tipo. Se ha puesto en guardia.');
          }
          return {
            estado: { ...ctx.estado, capa: 2, accionN: n, ultimo: null, usados: 0, camara: 1 },
            bloques: [
              exito('Capa 1 superada · las falanges ceden', [
                'Cada dedo quedo ordenado segun su tipo de dato.',
                'Lo que manejaron tiene nombre: TIPOS DE DATOS. El mismo "10" va despues del 9',
                'si es un numero, y antes si es un texto: el tipo cambia como se compara.',
              ]),
              texto([
                'Ahora LOS TENDONES: doce, revueltos. Para soltar la mano tienen que quedar',
                'ordenados primero por dedo y, dentro de cada dedo, por tension.',
                `Hay un presupuesto de ${inst.presupuesto} intercambios: planeen antes de mover.`,
              ], 'Capa 2 · LOS TENDONES'),
            ],
          };
        }
        default:
          return { bloques: [error(`Comando no reconocido: «${comandoBruto.trim()}». Prueba \`ayuda\`.`)] };
      }
    }

    // ---- Capa 2 · los tendones ----
    const orden = ordenDe(inst, ctx.estado);
    const usados = numero(ctx.estado, 'usados');
    const fila = () => orden.map((l, i) => `${i}:${l}`).join('  ');
    switch (verbo) {
      case 'tendones':
      case 'ver':
      case 'orden':
        return { bloques: [texto([fila(), '', `Intercambios: ${usados} de ${inst.presupuesto}.`], 'Los tendones')] };
      case 'intercambiar':
      case 'cambiar': {
        const i = indice(resto[0], 11, 'tendon'), j = indice(resto[1], 11, 'tendon');
        if (typeof i === 'string') return { bloques: [error(`${i} Asi: intercambiar <i> <j>.`)] };
        if (typeof j === 'string') return { bloques: [error(`${j} Asi: intercambiar <i> <j>.`)] };
        if (i === j) return { bloques: [error('Intercambiar un tendon consigo mismo no hace nada.')] };
        if (usados >= inst.presupuesto) {
          return { bloques: [error('No quedan intercambios. `soltar` para comprobar, o `reiniciar` para empezar de nuevo.')] };
        }
        const nuevo = [...orden];
        [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
        return {
          estado: { ...ctx.estado, orden: nuevo, usados: usados + 1, accionN: n, ultimo: { n, tipo: 'intercambio', i, j } },
          bloques: [texto([
            `Intercambiados ${i} y ${j}: ${orden[i]} <-> ${orden[j]}.`,
            `Quedan ${inst.presupuesto - usados - 1} intercambios.`,
          ], 'Tendones')],
        };
      }
      case 'reiniciar':
        return {
          estado: { ...ctx.estado, orden: [...inst.inicial], usados: 0, accionN: n, ultimo: null },
          bloques: [texto([`Los tendones vuelven al revoltijo inicial. Hay ${inst.presupuesto} intercambios otra vez.`])],
        };
      case 'soltar':
      case 'desplegar': {
        const bien = orden.every((l, i) => l === inst.objetivo[i]);
        if (!bien) {
          return rechazo(ctx, 'La mano no se suelta: los tendones no estan en el orden que piden las reglas.');
        }
        return {
          resuelto: true,
          estado: { ...ctx.estado, resuelta: true, accionN: n },
          esperaVictoriaMs: 2600,
          bloques: [exito('La mano suelta · el brazo derecho cede', [
            `Los doce tendones quedaron en orden con ${usados} intercambios (el minimo era ${inst.minimo}).`,
            '',
            'Lo que acaban de hacer tiene nombre. Ordenar es un ALGORITMO, y se puede',
            'ordenar por varios criterios: primero uno y, a igualdad, el siguiente.',
            'Y todo algoritmo tiene un COSTO: planear antes de mover lo abarata.',
          ])],
        };
      }
      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto.trim()}». Prueba \`ayuda\`.`)] };
    }
  },
};

/** Para la guía de la organización: un plan mínimo de intercambios. */
export function planDeIntercambios(actual: string[], objetivo: string[]): [number, number][] {
  const a = [...actual];
  const plan: [number, number][] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === objetivo[i]) continue;
    const j = a.indexOf(objetivo[i]);
    [a[i], a[j]] = [a[j], a[i]];
    plan.push([i, j]);
  }
  return plan;
}

/** Para la guía y las pruebas: los intercambios que ordenan cada dedo. */
export function planDeFalanges(inst: InstanciaMano): [number, number, number][] {
  const plan: [number, number, number][] = [];
  inst.falanges.forEach((f, d) => {
    const meta = ordenDeDedo(f, inst.tipos[d]);
    const a = [0, 1, 2];
    for (let i = 0; i < 3; i++) {
      if (a[i] === meta[i]) continue;
      const j = a.indexOf(meta[i]);
      [a[i], a[j]] = [a[j], a[i]];
      plan.push([d, i, j]);
    }
  });
  return plan;
}
