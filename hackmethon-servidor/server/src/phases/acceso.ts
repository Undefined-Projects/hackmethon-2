// ============================================================
//  FASE 1 — El Reflejo   ·   CONDICIONALES
//  Lámina I · la pierna izquierda
//
//  «La pierna decide qué la toca antes de pensarlo.»
//
//  La membrana de raíces de la rodilla es el SISTEMA INMUNE de la pierna:
//  un flujo de filtros que decide qué entra. El equipo trae sus ESPORAS
//  y tiene que reescribir ese flujo desde dentro para que las esporas
//  pasen, arraiguen y la pierna se marchite hasta quedar fuera de juego.
//
//      para cada programa que llega:
//          si origen = externo y permisos <= 2   → descartar   [defensa]
//          si ...                                 → descartar   [de ustedes]
//          dejar pasar
//
//  Es un EMBUDO: cada filtro descarta lo que cumple su condición. El flujo
//  arranca con las DEFENSAS de la propia pierna, que hoy dejan fuera a las
//  esporas. Se gana cuando, a la vez:
//    · pasan las ESPORAS del equipo,
//    · caen los ANTICUERPOS de la pierna (si entran con las esporas, las
//      encuentran y las secan),
//    · y la RUTINA de la pierna sigue pasando, para que no se dé cuenta.
//
//  Para quién sale al final el orden da igual; lo difícil es escribir
//  condiciones PRECISAS, y atreverse a quitar la defensa que estorba.
//
//  DOS CAPAS (unos 25 minutos entre las dos)
//    1 · LA RÓTULA  Quitar la defensa que frena a las esporas y dejar fuera
//                   a los cinco anticuerpos. Como mucho 3 filtros: nombrarlos
//                   uno a uno no cabe, hay que describirlos.
//    2 · LA MUDA    La pierna reacciona: levanta una defensa nueva, se secan
//                   los filtros que nombraban a alguien (`nombre` deja de
//                   valer), `savia` se vuelve anticuerpo y llega otra oleada
//                   con dos esporas más, un anticuerpo nuevo y un programa de
//                   rutina que se parece a un anticuerpo.
//
//  LO QUE ENSEÑA
//    · una condición es una pregunta con respuesta sí/no
//    · `y` estrecha, `o` ensancha, y se nota en quién cae
//    · una condición demasiado ancha tira a quien no querías
//    · nombrar no es condicionar: describir sí
//    · probar es gratis, desplegar no
//
//  EL REPARTO
//    DATOS     el registro de programas, el encargo (qué es espora, qué es
//              anticuerpo), el FLUJO dibujado y las CORRIDAS: cada `probar`
//              se guarda en tablas que se buscan —cuántos pasan, quién cae
//              y en qué filtro—.
//    PANTALLA  la membrana por cámara, sin números: ve pasar y rebotar a
//              cada programa por su nombre. No sabe qué es cada uno.
//    TERMINAL  reescribe el flujo, y no ve nada.
// ============================================================

import type { Role } from '../lib/constants.js';
import type { BloqueSalida, ContextoComando, ModuloFase, ResultadoComando } from './types.js';
import {
  AYUDA_CAMARAS, circuitoCerrado, cuarentenaActiva, error, exito, lienzo,
  mandoDeCamaras, normalizar, numero, rechazo, texto, tira,
  type CamaraDef, type Escena,
} from './comun.js';

type Capa = 1 | 2;
const CAPAS = 2;
const NOMBRES_CAPA = ['LA RÓTULA', 'LA MUDA'];
/** Cuántos filtros admite el flujo. En la capa 1 no da para nombrar a
 *  los cinco anticuerpos uno a uno; en la 2 hace falta uno por familia. */
const MAX_FILTROS: Record<Capa, number> = { 1: 3, 2: 5 };

// ---------- El registro ----------
//
// Los nombres son todos de jardín, esporas, anticuerpos y rutina por
// igual: si las esporas se llamaran «espora-1», Pantalla sabría qué tiene
// que pasar sin preguntar, y el encargo es de Datos. Por lo mismo no llevan extensión: `.sh` o
// `.bin` le cantarían el tipo a la cámara.
//
// Cómo está montado el reparto:
//   · `brote`, `raiz` y `polen` son las ESPORAS: externas y de permisos
//     bajos, justo lo que la defensa de la pierna deja fuera.
//   · `poda` y `polen` tienen la firma caducada: «firma = caducada» se los
//     lleva, y uno de los dos es espora.
//   · `savia` es rutina con permisos 4: «permisos >= 4» la tira.
//   · `corteza` es anticuerpo con la firma válida: la firma sola no basta.
//   · En la muda, `micelio` es espora, externa y de permisos 3: el filtro
//     «origen = externo y permisos >= 3» se la lleva, y hay que afinarlo.
//     `savia` se vuelve anticuerpo y `tallo` es un driver anticuerpo, como
//     `xilema`, que es rutina. Y la nueva defensa de la pierna, contra lo
//     externo caducado, tira a `polen` y a `nectar`.
type Programa = {
  id: string;
  /** El nombre canónico. El encargo y las pruebas hablan por él; lo que ve
   *  cada equipo es `nombre`, que cambia de una mesa a otra. */
  clave: string;
  nombre: string;
  tipo: string;
  origen: string;
  permisos: number;
  firma: string;
  capa: Capa;
};

const BASE: Omit<Programa, 'clave'>[] = [
  { id: 'P1', nombre: 'riego', tipo: 'servicio', origen: 'interno', permisos: 2, firma: 'valida', capa: 1 },
  { id: 'P2', nombre: 'liquen', tipo: 'binario', origen: 'externo', permisos: 5, firma: 'ausente', capa: 1 },
  { id: 'P3', nombre: 'savia', tipo: 'servicio', origen: 'interno', permisos: 4, firma: 'valida', capa: 1 },
  { id: 'P4', nombre: 'poda', tipo: 'script', origen: 'interno', permisos: 1, firma: 'caducada', capa: 1 },
  { id: 'P5', nombre: 'esqueje', tipo: 'script', origen: 'externo', permisos: 4, firma: 'caducada', capa: 1 },
  { id: 'P6', nombre: 'clorofila', tipo: 'binario', origen: 'interno', permisos: 3, firma: 'valida', capa: 1 },
  { id: 'P7', nombre: 'resina', tipo: 'servicio', origen: 'interno', permisos: 5, firma: 'ausente', capa: 1 },
  { id: 'P8', nombre: 'brote', tipo: 'script', origen: 'externo', permisos: 1, firma: 'valida', capa: 1 },
  { id: 'P9', nombre: 'corteza', tipo: 'binario', origen: 'externo', permisos: 3, firma: 'valida', capa: 1 },
  { id: 'P10', nombre: 'raiz', tipo: 'servicio', origen: 'externo', permisos: 2, firma: 'valida', capa: 1 },
  { id: 'P11', nombre: 'humus', tipo: 'script', origen: 'interno', permisos: 4, firma: 'caducada', capa: 1 },
  { id: 'P12', nombre: 'polen', tipo: 'binario', origen: 'externo', permisos: 2, firma: 'caducada', capa: 1 },
  { id: 'P13', nombre: 'micelio', tipo: 'servicio', origen: 'externo', permisos: 3, firma: 'valida', capa: 2 },
  { id: 'P14', nombre: 'tallo', tipo: 'driver', origen: 'interno', permisos: 2, firma: 'valida', capa: 2 },
  { id: 'P15', nombre: 'xilema', tipo: 'driver', origen: 'interno', permisos: 5, firma: 'valida', capa: 2 },
  { id: 'P16', nombre: 'nectar', tipo: 'script', origen: 'externo', permisos: 1, firma: 'caducada', capa: 2 },
];

// ---------- Una versión por equipo ----------
//
// Cada mesa juega la MISMA fase —las mismas trampas, la misma forma de
// resolverla— con otra piel: otros nombres, otros ids, otro orden en la
// fila, otras palabras para el origen, el tipo y la firma, y otra escala de
// permisos (desplazada, y a veces al revés). Una solución que se pasa de
// una mesa a otra no sirve: hay que entender la de la propia.
//
// Todo sale de una semilla —el id del equipo—, así que la versión de un
// equipo es siempre la misma aunque se reinicie el servidor. Sin semilla,
// la versión canónica: la de arriba, que es la que usan las pruebas.

const NOMBRES = [
  'riego', 'liquen', 'savia', 'poda', 'esqueje', 'clorofila', 'resina', 'brote', 'corteza', 'raiz',
  'humus', 'polen', 'micelio', 'tallo', 'xilema', 'nectar', 'floema', 'estoma', 'rizoma', 'yema',
  'sepalo', 'pistilo', 'antera', 'musgo', 'helecho', 'hifa', 'lignina', 'cambium',
];
const VOCES = {
  origen: [['interno', 'externo'], ['local', 'remoto'], ['raiz', 'aire']],
  tipo: [['servicio', 'script', 'binario', 'driver'], ['demonio', 'rutina', 'modulo', 'controlador'], ['proceso', 'macro', 'ejecutable', 'enlace']],
  firma: [['valida', 'caducada', 'ausente'], ['sellada', 'vencida', 'sin-sello'], ['verde', 'ambar', 'gris']],
} as const;
const CANON = { origen: VOCES.origen[0], tipo: VOCES.tipo[0], firma: VOCES.firma[0] };

type Instancia = { registro: Programa[]; defensaInicial: Filtro[]; defensaMuda: Filtro };

/** Azar con semilla (mulberry32), a partir de un texto. */
function azarDe(semilla: string) {
  let a = [...semilla].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function barajar<T>(xs: readonly T[], r: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const instancias = new Map<string, Instancia>();

function instancia(semilla?: string): Instancia {
  const clave = semilla ?? '';
  const hecha = instancias.get(clave);
  if (hecha) return hecha;

  const r = semilla ? azarDe(semilla) : null;
  const nombres = r ? barajar(NOMBRES, r).slice(0, BASE.length) : BASE.map((p) => p.nombre);
  const ids = r ? barajar(BASE.map((_, i) => `P${i + 1}`), r) : BASE.map((p) => p.id);
  const elegir = <K extends keyof typeof VOCES>(k: K) => (r ? VOCES[k][Math.floor(r() * VOCES[k].length)] : CANON[k]);
  const voz = { origen: elegir('origen'), tipo: elegir('tipo'), firma: elegir('firma') };
  const desplaza = r ? Math.floor(r() * 4) : 0;
  const invierte = r ? r() < 0.5 : false;

  const traduce = (campo: 'origen' | 'tipo' | 'firma', v: string) =>
    voz[campo][(CANON[campo] as readonly string[]).indexOf(v)];
  const escala = (v: number) => (invierte ? 6 - v : v) + desplaza;
  const giraOp: Record<Op, Op> = { '=': '=', '!=': '!=', '>': '<', '<': '>', '>=': '<=', '<=': '>=' };
  const traduceFiltro = (f: Filtro): Filtro => ({
    ...f,
    cond: f.cond.map((c) => c.campo === 'permisos'
      ? { ...c, valor: String(escala(Number(c.valor))), op: invierte ? giraOp[c.op] : c.op }
      : c.campo === 'nombre' ? c : { ...c, valor: traduce(c.campo as 'origen' | 'tipo' | 'firma', c.valor) }),
  });

  const programas: Programa[] = BASE.map((p, i) => ({
    ...p,
    clave: p.nombre,
    id: ids[i],
    nombre: nombres[i],
    origen: traduce('origen', p.origen),
    tipo: traduce('tipo', p.tipo),
    firma: traduce('firma', p.firma),
    permisos: escala(p.permisos),
  }));
  // El orden de la fila también cambia, pero cada oleada sigue llegando
  // detrás de la anterior.
  const registro = r
    ? [...barajar(programas.filter((p) => p.capa === 1), r), ...barajar(programas.filter((p) => p.capa === 2), r)]
    : programas;

  const hecha2: Instancia = {
    registro,
    defensaInicial: DEFENSA_INICIAL.map(traduceFiltro),
    defensaMuda: traduceFiltro(DEFENSA_MUDA),
  };
  instancias.set(clave, hecha2);
  return hecha2;
}

/** Solo para las pruebas: la versión de una mesa, con sus claves canónicas. */
export const instanciaDeAcceso = (semilla?: string) => instancia(semilla);

const registroDe = (inst: Instancia, capa: Capa) => inst.registro.filter((p) => p.capa <= capa);

/** Los anticuerpos: lo que tiene que caer en cada capa. Solo consta en la
 *  tabla `encargo`, por id: el registro no dice qué es cada programa. */
const ANTICUERPOS: Record<Capa, string[]> = {
  1: ['liquen', 'esqueje', 'resina', 'corteza', 'humus'],
  2: ['liquen', 'esqueje', 'resina', 'corteza', 'humus', 'tallo', 'savia'],
};

type Veredicto = 'PASA' | 'CAE';
/** Las esporas del equipo. Tienen que pasar, igual que la rutina: la
 *  diferencia es de historia, no de regla, y por eso solo constan en el
 *  encargo. */
const ESPORAS: Record<Capa, string[]> = {
  1: ['brote', 'raiz', 'polen'],
  2: ['brote', 'raiz', 'polen', 'micelio', 'nectar'],
};

const objetivoDe = (capa: Capa, p: Programa): Veredicto => (ANTICUERPOS[capa].includes(p.clave) ? 'CAE' : 'PASA');

// ---------- Filtros ----------

type Rasgo = Exclude<keyof Programa, 'id' | 'capa' | 'clave'>;
type Op = '=' | '!=' | '>' | '<' | '>=' | '<=';
type Condicion = { campo: Rasgo; op: Op; valor: string };
/** `pierna`: es una defensa de la propia pierna, no un filtro del equipo.
 *  Se quita igual que cualquier otro; solo se dibuja distinto. */
type Filtro = { cond: Condicion[]; junta: 'y' | 'o'; pierna?: boolean };

/** Con lo que arranca el flujo: la defensa de la pierna, que hoy deja
 *  fuera justo a las esporas (externas y de permisos bajos). */
const DEFENSA_INICIAL: Filtro[] = [
  { cond: [{ campo: 'origen', op: '=', valor: 'externo' }, { campo: 'permisos', op: '<=', valor: '2' }], junta: 'y', pierna: true },
];
/** Lo que levanta la pierna en la muda: cierra el paso a lo externo con la
 *  firma caducada, que tira a dos esporas. */
const DEFENSA_MUDA: Filtro = {
  cond: [{ campo: 'origen', op: '=', valor: 'externo' }, { campo: 'firma', op: '=', valor: 'caducada' }], junta: 'y', pierna: true,
};

/** Lo que el flujo sabe mirar en cada capa. Tras la muda ya no reconoce
 *  nombres: solo rasgos. */
const CAMPOS: Record<Capa, Rasgo[]> = {
  1: ['nombre', 'tipo', 'origen', 'permisos', 'firma'],
  2: ['tipo', 'origen', 'permisos', 'firma'],
};
const OPS: Op[] = ['=', '!=', '>=', '<=', '>', '<'];

function cumple(p: Programa, c: Condicion): boolean {
  const izq = p[c.campo];
  // Los permisos se comparan como número; lo demás, como texto. Comparar
  // «10» con «9» como cadenas daría que 10 es menor, que es el clásico.
  if (c.campo === 'permisos') {
    const a = Number(izq);
    const b = Number(c.valor);
    if (Number.isNaN(b)) return false;
    switch (c.op) {
      case '=': return a === b;
      case '!=': return a !== b;
      case '>': return a > b;
      case '<': return a < b;
      case '>=': return a >= b;
      case '<=': return a <= b;
    }
  }
  const a = String(izq);
  switch (c.op) {
    case '=': return a === c.valor;
    case '!=': return a !== c.valor;
    // Ordenar texto con > y < no significa nada aquí, y fingir que sí
    // enseñaría algo falso: se declara que no encaja.
    default: return false;
  }
}

const atrapa = (p: Programa, f: Filtro): boolean =>
  f.junta === 'o' ? f.cond.some((c) => cumple(p, c)) : f.cond.every((c) => cumple(p, c));

/** El embudo: el primer filtro que lo atrapa lo descarta (0 = pasa). Para
 *  quién sale al final el orden da igual; para DÓNDE cae cada uno, no, y
 *  eso es lo que guarda cada corrida. */
function recorrer(p: Programa, filtros: Filtro[]): { veredicto: Veredicto; filtro: number } {
  for (let i = 0; i < filtros.length; i++) {
    if (atrapa(p, filtros[i])) return { veredicto: 'CAE', filtro: i + 1 };
  }
  return { veredicto: 'PASA', filtro: 0 };
}

const pintarCond = (f: Filtro): string =>
  f.cond.map((c) => `${c.campo} ${c.op} ${c.valor}`).join(` ${f.junta} `);
const pintarFiltro = (f: Filtro): string => `si ${pintarCond(f)} → descartar`;

const usaNombre = (f: Filtro) => f.cond.some((c) => c.campo === 'nombre');

const capaDe = (estado: Record<string, unknown>): Capa => (estado.capa === 2 ? 2 : 1);

const filtrosDe = (inst: Instancia, estado: Record<string, unknown>): Filtro[] =>
  Array.isArray(estado.filtros) ? (estado.filtros as Filtro[]) : inst.defensaInicial.map((f) => ({ ...f }));
const dePierna = (filtros: Filtro[]) => filtros.map((f) => f.pierna === true);

type Muda = { n: number; marchitos: string[] };
const mudaDe = (estado: Record<string, unknown>): Muda =>
  (estado.muda as Muda | undefined) ?? { n: 0, marchitos: [] };

/** Quién sale distinto de lo que pide el encargo. */
function desviaciones(inst: Instancia, filtros: Filtro[], capa: Capa) {
  return registroDe(inst, capa).map((p) => ({ nombre: p.nombre, ...recorrer(p, filtros), esperado: objetivoDe(capa, p) }))
    .filter((x) => x.veredicto !== x.esperado);
}

/** El flujo como pseudocódigo. Lo pide Pantalla con `flujo`, y es el
 *  mismo dibujo que Datos ve en su diagrama. */
const bloqueFlujo = (filtros: Filtro[], capa: Capa, titulo: string, marchitos?: string[]): BloqueSalida => ({
  tipo: 'flujo',
  titulo,
  filtros: filtros.map(pintarCond),
  pierna: dePierna(filtros),
  max: MAX_FILTROS[capa],
  ...(marchitos && marchitos.length ? { marchitos } : {}),
});

// ---------- Las corridas: la simulación, guardada en la base de datos ----------
//
// `probar` no le enseña el resultado a nadie: lo GUARDA. Cada simulación
// es una corrida numerada (R1, R2…) con los filtros que tenía y lo que le
// pasó a cada programa, y se consulta en las tablas de Datos. Así cuántos
// pasan, quién cae y en qué filtro es algo que se busca, no que se ve.
// Pantalla se queda con la cámara, que enseña la membrana sin números.

type Corrida = { n: number; capa: Capa; filtros: string[]; pierna: boolean[]; caen: number[] };
/** Las que se guardan. Más atrás no se consulta nada y el estado crece. */
const MAX_CORRIDAS = 10;

const corridasDe = (estado: Record<string, unknown>): Corrida[] =>
  Array.isArray(estado.corridas) ? (estado.corridas as Corrida[]) : [];

function correr(inst: Instancia, filtros: Filtro[], capa: Capa, n: number): Corrida {
  return {
    n, capa,
    filtros: filtros.map(pintarCond),
    pierna: dePierna(filtros),
    caen: registroDe(inst, capa).map((p) => recorrer(p, filtros).filtro),
  };
}

/** Las tres tablas de resultados, con la corrida más reciente arriba. */
function tablasDeCorridas(inst: Instancia, corridas: Corrida[]) {
  const recientes = [...corridas].reverse();
  const ultima = recientes[0];
  const filasCorridas = recientes.map((c) => {
    const pasan = c.caen.filter((x) => x === 0).length;
    return [`R${c.n}`, String(c.filtros.length), String(pasan), String(c.caen.length - pasan)];
  });
  const filasFiltros = recientes.flatMap((c) =>
    c.filtros.map((f, k) => [`R${c.n}-${k + 1}`, `R${c.n}`, String(k + 1), f, c.pierna[k] ? 'pierna' : 'equipo']));
  const filasResultados = recientes.flatMap((c) =>
    registroDe(inst, c.capa).map((p, i) => [
      `R${c.n}-${p.id}`, `R${c.n}`, p.id,
      c.caen[i] === 0 ? 'PASA' : 'CAE',
      c.caen[i] === 0 ? '' : String(c.caen[i]),
    ]));
  const deLaUltima = (filas: string[][]) => (ultima ? filas.filter((f) => f[1] === `R${ultima.n}`).map((f) => f[0]) : []);
  return [
    {
      id: 'corridas',
      nombre: 'corridas',
      x: 380, y: 340, w: 240,
      descripcion: 'Cada `probar`, con su recuento',
      clave: 'id',
      columnas: ['id', 'filtros', 'pasan', 'caen'],
      filas: filasCorridas,
      nuevas: ultima ? [`R${ultima.n}`] : [],
    },
    {
      id: 'corrida_filtros',
      nombre: 'corrida_filtros',
      x: 660, y: 340, w: 320,
      descripcion: 'El flujo que tenia cada corrida',
      clave: 'id',
      columnas: ['id', 'corrida_id', 'n', 'condicion', 'de'],
      filas: filasFiltros,
      nuevas: deLaUltima(filasFiltros),
    },
    {
      // Debajo de `programas`, a la que apunta: la línea va recta.
      id: 'resultados',
      nombre: 'resultados',
      x: 40, y: 340, w: 300,
      descripcion: 'Que le paso a cada programa',
      clave: 'id',
      columnas: ['id', 'corrida_id', 'programa_id', 'veredicto', 'cae_en_filtro'],
      filas: filasResultados,
      nuevas: deLaUltima(filasResultados),
    },
  ];
}

// ---------- La mitad del Operador de Datos ----------

function esquemaDe(inst: Instancia, capa: Capa, corridas: Corrida[]) {
  const registro = registroDe(inst, capa);
  const nuevos = capa === 2 ? inst.registro.filter((p) => p.capa === 2).map((p) => p.id) : [];
  // El encargo habla por la clave canónica; aquí se traduce al id de la mesa.
  const idDe = (clave: string) => inst.registro.find((p) => p.clave === clave)!.id;
  const anticuerpos1 = ANTICUERPOS[1].map((n, i) => [`E${i + 1}`, idDe(n), 'ANTICUERPO. Si entra, seca las esporas: tiene que caer.']);
  const esporas1 = ESPORAS[1].map((n, i) => [`E${i + 6}`, idDe(n), 'ESPORA nuestra. Tiene que pasar.']);
  const encargo: string[][] = capa === 1
    ? [...anticuerpos1, ...esporas1,
        ['E9', '', `El resto es rutina de la pierna: tiene que seguir pasando o se dara cuenta. Como mucho ${MAX_FILTROS[1]} filtros, contando sus defensas.`]]
    : [
        ...anticuerpos1, ...esporas1,
        ['E9', idDe('savia'), 'Se ha vuelto ANTICUERPO con la muda. Ahora tiene que caer.'],
        ['E10', idDe('tallo'), 'ANTICUERPO. Llego con la muda. Tiene que caer.'],
        ['E11', idDe('micelio'), 'ESPORA nuestra. Llego con la muda. Tiene que pasar.'],
        ['E12', idDe('nectar'), 'ESPORA nuestra. Llego con la muda. Tiene que pasar.'],
        ['E13', '', `El resto es rutina: tiene que seguir pasando. Ya no se puede filtrar por nombre. Como mucho ${MAX_FILTROS[2]} filtros, contando sus defensas.`],
      ];
  return {
    tablas: [
      {
        id: 'programas',
        nombre: 'programas',
        x: 40, y: 30, w: 300,
        descripcion: 'Lo que quiere entrar en la pierna',
        clave: 'id',
        columnas: ['id', 'nombre', 'tipo', 'permisos'],
        filas: registro.map((p) => [p.id, p.nombre, p.tipo, String(p.permisos)]),
        nuevas: nuevos,
      },
      {
        // El encargo apunta a ids, no a nombres: hay que saltar a
        // `programas` para saber de quién hablamos.
        id: 'encargo',
        nombre: 'encargo',
        x: 380, y: 30, w: 600,
        descripcion: 'Lo que el equipo tiene que conseguir',
        clave: 'id',
        columnas: ['id', 'programa_id', 'instruccion'],
        filas: encargo,
        nuevas: capa === 2 ? ['E9', 'E10', 'E11', 'E12', 'E13'] : [],
      },
      ...tablasDeCorridas(inst, corridas),
    ],
    relaciones: [
      { desde: 'encargo', campo: 'programa_id', hasta: 'programas' },
      { desde: 'corrida_filtros', campo: 'corrida_id', hasta: 'corridas' },
      { desde: 'resultados', campo: 'corrida_id', hasta: 'corridas' },
      { desde: 'resultados', campo: 'programa_id', hasta: 'programas' },
    ],
  };
}

// ---------- La mitad del Operador de Pantalla: el circuito cerrado ----------
//
//  Dos cámaras de la rodilla. En la de la membrana los programas llegan
//  en fila, el reflejo los palpa y las raíces se apartan o se cierran.
//
//  Lo que la cámara enseña es el EFECTO —quién pasa y quién no—, y SIN
//  NÚMEROS: cuántos pasan, quién cae y en qué filtro se busca en las
//  tablas de corridas, que son de Datos. La imagen
//  llega dos veces: como fotogramas de texto (la de reserva, y la que
//  vigilan las pruebas) y como `dibujo`, los mismos datos para que el
//  cliente pinte la membrana de verdad.

const CAMARAS: CamaraDef[] = [
  { n: 1, id: 'membrana', nombre: 'MEMBRANA', sector: 'R-01', que: 'los programas en fila, el ganglio y la membrana de raices' },
  { n: 2, id: 'interior', nombre: 'INTERIOR', sector: 'R-02', que: 'lo que ha conseguido entrar en la rodilla' },
];

/** Tres lineas con `n` programas en fila, de tres caracteres cada uno. */
function figuras(n: number): [string, string, string] {
  let a = '', b = '', c = '';
  for (let i = 0; i < n; i++) { a += ' Y '; b += '[#]'; c += '/ \\'; }
  return [a, b, c];
}

type Momento = { quien: string; origen: string; pasa: boolean; cola: number; dentro: number; fase: 'mira' | 'falla' };

/** Un fotograma de la membrana. Las columnas estan fijadas a mano para
 *  que dos fotogramas seguidos caigan exactamente en el mismo sitio. */
function fotogramaMembrana(m: Momento): string[] {
  const [q1, q2, q3] = figuras(Math.min(4, m.cola));
  const pasando = m.fase === 'mira' ? false : m.pasa;
  const cand = pasando ? ['   ', '   ', '   '] : [' Y ', '[#]', '/ \\'];
  const [d1, d2, d3] = figuras(Math.min(3, m.dentro + (pasando ? 1 : 0)));
  const raices = pasando ? ['/ ', '  ', '\\ '] : ['}{', '}{', '}{'];
  const ojos = m.fase === 'mira' ? '[O] [O]' : m.pasa ? '[o] [o]' : '[-] [-]';
  const fila = (a: string, b: string, c: string, d: string) =>
    '  ' + tira(a, 12) + tira(b, 5) + tira(c, 3) + tira(d, 14);
  const ganglio = (dentro: string) => '     |' + tira(dentro, 11) + '|';

  return lienzo([
    '     .-----------.                  ',
    ganglio('  GANGLIO  '),
    ganglio(`  ${ojos}  `),
    ganglio('    ---    '),
    "     '-----------'                  ",
    '                                    ',
    fila(q1, cand[0], raices[0], d1),
    fila(q2, cand[1], raices[1], d2),
    fila(q3, cand[2], raices[2], d3),
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    tira(`  EN LA MEMBRANA: ${m.quien}`, 36),
    tira(`  viene de: ${m.origen}`, 36),
    m.fase === 'mira'
      ? '  palpando...'
      : m.pasa ? '  >> PASA' : '  >> ALTO. No pasa.',
  ]);
}

function escenaMembrana(veredictos: { nombre: string; origen: string; pasa: boolean }[]): Escena {
  const fotogramas: string[][] = [];
  let dentro = 0;
  veredictos.forEach((v, i) => {
    const cola = veredictos.length - i - 1;
    fotogramas.push(fotogramaMembrana({ quien: v.nombre, origen: v.origen, pasa: v.pasa, cola, dentro, fase: 'mira' }));
    fotogramas.push(fotogramaMembrana({ quien: v.nombre, origen: v.origen, pasa: v.pasa, cola, dentro, fase: 'falla' }));
    if (v.pasa) dentro++;
  });
  return { fotogramas, ritmo: 780 };
}

function escenaInterior(dentro: number, f: number): string[] {
  const [a, b, c] = figuras(Math.min(5, dentro));
  return lienzo([
    '  __________________________________',
    '                                    ',
    tira(`  ${f % 2 === 0 ? '[+]' : '[ ]'}   INTERIOR DE LA RODILLA`, 36),
    '                                    ',
    '                                    ',
    '  ' + tira(a, 34),
    '  ' + tira(b, 34),
    '  ' + tira(c, 34),
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira(dentro === 0 ? '  no ha entrado nada.' : `  ${dentro} programa(s) dentro.`, 36),
  ]);
}

function vistaDeCamaras(inst: Instancia, estado: Record<string, unknown>) {
  const capa = capaDe(estado);
  const filtros = filtrosDe(inst, estado);
  const resuelta = estado.resuelta === true;
  const muda = mudaDe(estado);
  const veredictos = registroDe(inst, capa).map((p) => ({
    nombre: p.nombre,
    // El origen solo existe aquí: no está en las tablas de Datos. La
    // membrana lo «palpa» y la cámara lo enseña mientras cada uno está
    // delante, así que hay que mirar la fila pasar para saberlo.
    origen: p.origen,
    pasa: recorrer(p, filtros).veredicto === 'PASA',
    // Recién llegado con la muda. No dice nada de sus rasgos: solo que
    // ayer no estaba en la fila, que es lo que se ve a simple vista.
    nuevo: capa === 2 && p.capa === 2,
  }));
  const dentro = veredictos.filter((v) => v.pasa).length;
  const firma = veredictos.map((v) => (v.pasa ? '1' : '0')).join('');

  return circuitoCerrado(CAMARAS, estado, (cam) => ({
    escena: cam.id === 'membrana'
      ? escenaMembrana(veredictos)
      : { fotogramas: [0, 1].map((f) => escenaInterior(dentro, f)), ritmo: 900 },
    rotulos: [],
    // Mientras el flujo no cambie, la imagen es la misma y el bucle no se
    // reinicia: reproyectar no puede devolver la fila al primero.
    clave: `${capa}:${resuelta ? 'r' : ''}:${firma}`,
    extra: {
      dibujo: cam.id === 'membrana'
        ? { tipo: 'membrana', capa, resuelta, muda: muda.n, cola: veredictos }
        : { tipo: 'interior', capa, resuelta, dentro: veredictos.filter((v) => v.pasa).map((v) => v.nombre) },
    },
  }));
}

/** Lo que pinta la cabecera de la lámina en los tres puestos. Que la
 *  capa se vea no regala nada: es progreso, no contenido. */
const laminaDe = (estado: Record<string, unknown>) => ({
  capa: capaDe(estado),
  capas: CAPAS,
  nombres: NOMBRES_CAPA,
  resuelta: estado.resuelta === true,
});

function ayuda(capa: Capa): ResultadoComando {
  return {
    bloques: [
      texto(
        [
          'flujo                        — el flujo de la membrana, en pseudocodigo',
          'filtrar si <condicion>       — añadir un filtro que descarta lo que la cumpla',
          'quitar <n>                   — quitar el filtro n',
          'probar                       — guarda una corrida en la base de datos. Gratis',
          'desplegar                    — aplicarlo de verdad. Esto no es gratis',
          'estado                       — que falta',
          'firmas tipo <tipo>           — la firma de los programas de ese tipo',
          'firmas <nombre|id>           — la firma de un programa',
          ...AYUDA_CAMARAS,
        ],
        'Comandos disponibles',
      ),
      texto(
        [
          `Campos:      ${CAMPOS[capa].join(' · ')}`,
          'Operadores:  =  !=  >  <  >=  <=   (los de orden solo valen con permisos)',
          'Se pueden unir condiciones con `y` o con `o`, pero no mezclar las dos.',
          '',
          '  filtrar si permisos >= 9',
          '  filtrar si tipo = demonio y origen = luna',
          '',
          'Esos valores son de ejemplo y no existen. Los de verdad los tiene Datos.',
          `Como mucho ${MAX_FILTROS[capa]} filtros en esta capa.`,
          ...(capa === 2 ? ['', 'Desde la muda el flujo ya no reconoce nombres: `nombre` no vale.'] : []),
        ],
        'Como se escribe un filtro',
      ),
      texto(
        [
          'para cada programa que llega a la membrana:',
          '    si <filtro 1>  → descartar',
          '    si <filtro 2>  → descartar',
          '    ...',
          '    dejar pasar',
          '',
          'Es el sistema inmune de la pierna. Arranca con SUS defensas, que tambien se',
          'pueden quitar. Cada filtro descarta lo que cumple su condicion. Se gana cuando',
          'pasan las esporas, caen los anticuerpos y la rutina sigue pasando.',
          'Datos ve el flujo dibujado tal cual esta, y sabe que es cada programa.',
        ],
        'Como funciona el flujo',
      ),
      texto(
        [
          'Pantalla esta viendo la membrana por circuito cerrado. Tu la cambias a ciegas.',
          'La camara enseña QUIEN pasa y quien no, sin numeros. Cuantos pasan y en que',
          'filtro cae cada uno se guarda con `probar` en la base de datos de Datos.',
          '',
          `La pierna tiene ${CAPAS} capas. Ahora están en la ${capa}: ${NOMBRES_CAPA[capa - 1]}.`,
        ],
        'El circuito cerrado y las capas',
      ),
    ],
  };
}

export const acceso: ModuloFase = {
  key: 'fase-1-acceso',

  proyectar(role: Role, ctx) {
    const capa = capaDe(ctx.estado);
    const lamina = laminaDe(ctx.estado);
    const inst = instancia(ctx.semilla);
    const filtros = filtrosDe(inst, ctx.estado);
    switch (role) {
      case 'DATOS':
        return {
          titulo: capa === 1 ? 'Registro · lo que quiere entrar' : 'Registro · después de la muda',
          nota: capa === 1
            ? 'Arriba tienes el sistema inmune de la pierna: su flujo de filtros, con sus defensas en '
              + 'azul y lo que vaya escribiendo Terminal. Abajo, el registro y el encargo: qué '
              + 'programas son nuestras esporas, cuáles son anticuerpos y cuáles rutina. Aquí no '
              + 'está todo: de dónde viene cada programa lo ve Pantalla en la cámara, y su firma se '
              + 'la pide Terminal a la pierna. Cada `probar` se guarda en corridas, corrida_filtros y '
              + 'resultados: búscala y compárala con el encargo.'
            : 'LA MUDA. La pierna ha reaccionado: ha levantado una defensa nueva, uno de sus programas '
              + 'de rutina se ha vuelto anticuerpo y ha llegado otra oleada —va marcada—. Lee el encargo entero. Los filtros '
              + 'que nombraban a alguien se han secado: ya solo se filtra por rasgos. Las corridas '
              + 'nuevas incluyen a los recién llegados.',
          lienzo: { w: 1000, h: 640 },
          lamina,
          // El flujo y las corridas son de Datos: lo que se ha escrito y
          // lo que dio cada `probar`, para buscarlo en tablas.
          flujo: {
            filtros: filtros.map(pintarCond),
            pierna: dePierna(filtros),
            max: MAX_FILTROS[capa],
            marchitos: mudaDe(ctx.estado).marchitos,
            capa,
          },
          ...esquemaDe(inst, capa, corridasDe(ctx.estado)),
        };

      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          nota: 'Ves la membrana por cámara: cada programa llega, la membrana lo palpa —y mientras lo '
              + 'palpa, la cámara dice DE DÓNDE VIENE: eso no está en ninguna tabla, apúntalo— y lo '
              + 'deja pasar o lo rebota. Las firmas que pida Terminal también te llegan a ti. Cuántos '
              + 'pasan se guarda con `probar` en la base de datos de Datos.',
          camaras: vistaDeCamaras(inst, ctx.estado),
          lamina,
        };

      case 'TERMINAL':
        return {
          pista: capa === 1
            ? 'Escribe `ayuda`. Tú reescribes el sistema inmune de la pierna para que pasen las esporas. '
              + 'Datos tiene el registro y las corridas; Pantalla ve de dónde viene cada programa; las '
              + 'firmas las pides tú con `firmas`. Nadie lo tiene todo: júntenlo.'
            : 'La muda: la pierna ha levantado otra defensa y ya no reconoce nombres. Pregunta a Datos '
              + 'cómo quedó el flujo y qué dice la última corrida.',
          filtros: filtros.length,
          camara: numero(ctx.estado, 'camara') || 1,
          cuarentenaHasta: (ctx.estado.cuarentenaHasta as number) ?? null,
          lamina,
        };
    }
  },

  ejecutar(comandoBruto: string, ctx: ContextoComando): ResultadoComando {
    const enCuarentena = cuarentenaActiva(ctx);
    if (enCuarentena) return enCuarentena;

    const cmd = normalizar(comandoBruto);
    const [verbo, ...resto] = cmd.split(' ');
    const arg = resto.join(' ');
    const capa = capaDe(ctx.estado);
    const inst = instancia(ctx.semilla);
    const filtros = filtrosDe(inst, ctx.estado);

    // El circuito cerrado se atiende antes del switch: es el mismo mando
    // en todas las fases que tienen camaras.
    const mando = mandoDeCamaras(CAMARAS, verbo, arg, ctx.estado);
    if (mando) return mando;

    switch (verbo) {
      case 'ayuda':
      case 'help':
        return ayuda(capa);

      case 'flujo':
      case 'filtros':
      case 'reglas':
        return { bloques: [bloqueFlujo(filtros, capa, 'El flujo de la membrana')] };

      case 'probar':
      case 'simular': {
        // Gratis, como siempre: no penaliza. Pero ya no canta nada aquí;
        // guarda la corrida y el resultado se busca en la base de datos.
        const n = numero(ctx.estado, 'corridaN') + 1;
        const corrida = correr(inst, filtros, capa, n);
        return {
          estado: {
            ...ctx.estado,
            corridaN: n,
            corridas: [...corridasDe(ctx.estado), corrida].slice(-MAX_CORRIDAS),
          },
          bloques: [
            texto(
              [
                `Corrida R${n} guardada: ${filtros.length} filtro(s) contra ${corrida.caen.length} programas.`,
                'El resultado esta en la base de datos —corridas, corrida_filtros y',
                'resultados—. Pideselo a Datos. La camara sigue enseñando la membrana.',
              ],
              'Simulacion guardada',
            ),
          ],
        };
      }

      case 'filtrar':
      case 'filtro':
      case 'insertar': {
        if (filtros.length >= MAX_FILTROS[capa]) {
          return {
            bloques: [error(`El flujo no admite mas de ${MAX_FILTROS[capa]} filtros en esta capa. `
              + 'Quita alguno, o junta dos en uno.')],
          };
        }
        const r = parsearFiltro(arg, capa);
        if ('fallo' in r) return r.fallo;
        const nuevos = [...filtros, r.filtro];
        return {
          estado: { ...ctx.estado, filtros: nuevos },
          bloques: [
            texto([`${nuevos.length}.  ${pintarFiltro(r.filtro)}`], 'Filtro añadido'),
            texto(['Nada se ha aplicado todavia. `probar` para verlo correr.']),
          ],
        };
      }

      case 'quitar':
      case 'borrar': {
        const n = Number(arg);
        if (!Number.isInteger(n) || n < 1 || n > filtros.length) {
          return {
            bloques: [error(filtros.length === 0
              ? 'No hay ningun filtro que quitar.'
              : `«${arg}» no es un numero de filtro. Van del 1 al ${filtros.length}.`)],
          };
        }
        const nuevos = filtros.filter((_, i) => i !== n - 1);
        return {
          estado: { ...ctx.estado, filtros: nuevos },
          bloques: [texto([`Fuera el filtro ${n}. Quedan ${nuevos.length}.`], 'Filtro quitado')],
        };
      }

      case 'firmas':
      case 'firma': {
        // La firma no está en ninguna tabla: hay que preguntársela a la
        // pierna, y la respuesta le llega a Pantalla. Nunca todas de golpe:
        // se pregunta por un tipo o por un programa, y ni el tipo ni los
        // nombres los sabe esta consola. Los sabe Datos.
        const registro = registroDe(inst, capa);
        if (!arg) {
          return {
            bloques: [error(`Hay ${registro.length} programas: acota la pregunta. `
              + '`firmas tipo <tipo>` o `firmas <nombre|id>`. Los tipos y los nombres los tiene Datos.')],
          };
        }
        const [primero, ...demas] = arg.split(' ');
        const porTipo = primero === 'tipo';
        const buscado = porTipo ? demas.join(' ') : arg;
        const hallados = porTipo
          ? registro.filter((p) => normalizar(p.tipo) === buscado)
          : registro.filter((p) => normalizar(p.nombre) === buscado || p.id.toLowerCase() === buscado);
        if (hallados.length === 0) {
          return {
            bloques: [error(porTipo
              ? `Ningun programa de la fila es de tipo «${buscado}». Pregunta a Datos que tipos hay.`
              : `No hay ningun programa «${buscado}» en la fila. Pregunta a Datos por su nombre o su id.`)],
          };
        }
        return {
          bloques: [texto(
            hallados.map((p) => `${tira(p.nombre, 12)} ${tira(p.id, 5)} firma: ${p.firma}`),
            porTipo ? `Firmas · tipo ${buscado}` : 'Firma',
          )],
        };
      }

      case 'estado': {
        const ultima = corridasDe(ctx.estado).at(-1);
        return {
          bloques: [
            texto(
              [
                `Capa ${capa} de ${CAPAS}: ${NOMBRES_CAPA[capa - 1]}.`,
                `Filtros en el flujo: ${filtros.length} de ${MAX_FILTROS[capa]}.`,
                ultima ? `Ultima corrida guardada: R${ultima.n}.` : 'Todavia no hay ninguna corrida: `probar`.',
              ],
              'Estado',
            ),
          ],
        };
      }

      case 'desplegar':
      case 'aplicar': {
        const fuera = desviaciones(inst, filtros, capa);
        if (fuera.length > 0) {
          // Mismo rechazo se haya pasado de ancho o se haya quedado corto:
          // decir CUÁL sobra sería resolverle la condición al equipo.
          return rechazo(
            ctx,
            'La pierna ha notado algo fuera de sitio y ha revertido el flujo. '
            + 'Se ha puesto en guardia.',
            { filtros },
          );
        }

        if (capa === 1) {
          // LA MUDA. La rótula cede, pero la pierna reacciona: se seca lo
          // que nombraba a alguien, levanta una defensa nueva delante de
          // todo y llega otra oleada.
          const marchitos = filtros.filter(usaNombre);
          const vivos = [{ ...inst.defensaMuda }, ...filtros.filter((f) => !usaNombre(f))];
          const muda = mudaDe(ctx.estado);
          return {
            estado: {
              ...ctx.estado,
              capa: 2,
              filtros: vivos,
              camara: 1,
              muda: { n: muda.n + 1, marchitos: marchitos.map(pintarCond) },
            },
            bloques: [
              exito('Capa 1 superada · la rótula cede', [
                'Las tres esporas han arraigado en la rodilla, los cinco anticuerpos se',
                'han quedado fuera y la rutina sigue pasando como si nada.',
              ]),
              texto(
                [
                  'La pierna se ha dado cuenta de algo y muda la piel. Lo que nombraba a',
                  'alguien se seca y se cae: el flujo ya NO reconoce nombres, solo rasgos.',
                  '',
                  'Ha levantado una defensa nueva, uno de sus programas se ha vuelto',
                  'anticuerpo y llega otra oleada con mas esporas. Datos tiene el encargo.',
                ],
                'Capa 2 · LA MUDA',
              ),
              bloqueFlujo(vivos, 2, 'Lo que sobrevive a la muda', marchitos.map(pintarCond)),
            ],
          };
        }

        return {
          resuelto: true,
          estado: { ...ctx.estado, filtros, resuelta: true, camara: 1 },
          // La membrana se rinde en cámara: que la cortinilla no la tape.
          esperaVictoriaMs: 4200,
          bloques: [
            exito('Flujo desplegado · la pierna se rinde', [
              'Las cinco esporas han arraigado y ningun anticuerpo ha llegado a verlas.',
              'La pierna izquierda se marchita: ya no responde.',
              '',
              'Lo que acaban de escribir tiene nombre: condiciones. Cada filtro es',
              'una pregunta de si o no, y el flujo entero es un embudo de preguntas.',
              'Cuando no puedes nombrar algo, lo describes: eso es condicionar.',
            ]),
          ],
        };
      }

      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto}». Prueba \`ayuda\`.`)] };
    }
  },
};

// ============================================================
//  El analizador de `filtrar`
//
//  Devuelve mensajes que enseñan a escribir el filtro en vez de un «error
//  de sintaxis»: esta fase va de aprender a escribir condiciones, y un
//  parser hosco enseñaría a rendirse.
// ============================================================

type LecturaFiltro = { filtro: Filtro } | { fallo: ResultadoComando };

function parsearFiltro(arg: string, capa: Capa): LecturaFiltro {
  let palabras = arg.split(' ').filter(Boolean);
  const malo = (t: string): LecturaFiltro => ({ fallo: { bloques: [error(t)] } });

  // `insertar 2 si ...` era la sintaxis de antes: se acepta el número y
  // se ignora, porque en un embudo el orden no cambia quién sale.
  if (palabras.length && Number.isInteger(Number(palabras[0]))) palabras = palabras.slice(1);
  if (palabras[0] !== 'si') return malo('Un filtro empieza por `si`. Ejemplo: filtrar si permisos >= 4');
  // Lo que venga tras `entonces` / `→` sobra: un filtro siempre descarta.
  const corte = palabras.findIndex((w) => w === 'entonces' || w === '→' || w === '->');
  if (corte !== -1 && palabras[corte + 1] === 'permitir') {
    return malo('En el embudo los filtros solo descartan: lo que no cae en ninguno, pasa. '
      + 'Escribe la condicion de lo que tiene que CAER.');
  }
  const cuerpo = palabras.slice(1, corte === -1 ? undefined : corte);
  if (cuerpo.length === 0) return malo('No has escrito ninguna condicion despues de `si`.');

  const hayY = cuerpo.includes('y');
  const hayO = cuerpo.includes('o');
  if (hayY && hayO) {
    return malo('No mezcles `y` con `o` en el mismo filtro: no se sabria cual manda. Usa una sola, o parte el filtro en dos.');
  }
  const junta: 'y' | 'o' = hayO ? 'o' : 'y';

  const trozos: string[][] = [[]];
  for (const w of cuerpo) {
    if (w === 'y' || w === 'o') trozos.push([]);
    else trozos[trozos.length - 1].push(w);
  }

  const campos = CAMPOS[capa];
  const cond: Condicion[] = [];
  for (const t of trozos) {
    if (t.length !== 3) {
      return malo(`Cada condicion son tres piezas: campo operador valor. «${t.join(' ') || '(vacio)'}» no lo es.`);
    }
    const [campo, op, valor] = t;
    // Antes que el «no es un campo» genérico: aquí `nombre` SÍ era un
    // campo hasta hace un momento, y hay que decir por qué ya no.
    if (campo === 'nombre' && capa === 2) {
      return malo(`Desde la muda el flujo ya no reconoce nombres, solo rasgos: ${campos.join(' · ')}. `
        + 'Describe lo que quieres que caiga.');
    }
    if (!campos.includes(campo as Rasgo)) {
      return malo(`«${campo}» no es un campo. Son: ${campos.join(' · ')}.`);
    }
    if (!OPS.includes(op as Op)) {
      return malo(`«${op}» no es un operador. Son: ${OPS.join('  ')}.`);
    }
    if (campo !== 'permisos' && !['=', '!='].includes(op)) {
      return malo(`Con «${campo}» solo valen = y !=. Ordenar texto con ${op} no significa nada.`);
    }
    if (campo === 'permisos' && Number.isNaN(Number(valor))) {
      return malo(`«${valor}» no es un numero, y `+ '`permisos` es un numero.');
    }
    cond.push({ campo: campo as Rasgo, op: op as Op, valor });
  }

  return { filtro: { cond, junta } };
}
