// ============================================================
//  FASE 4 — Núcleo Modular   ·   FUNCIONES, PILAS Y COLAS
//
//  Nuestros virus ya lograron entrar al sistema, aprovechando que no
//  parecian peligrosos. Ahora toca danar las funciones del robot desde
//  adentro: enganarlas para que, haciendo su trabajo aparentemente
//  "bien", entren exactamente por el hueco entre lo que el robot
//  aguanta (`aguanta_max`) y el fusible de emergencia (`fusible_corte`).
//
//  POR QUÉ NO SE PUEDE PASAR TANTEANDO NÚMEROS AL AZAR:
//    1. Las funciones intermedias (medio/) y maestras (nucleo/) tienen
//       ramas segun la paridad (si x es PAR vs si x es IMPAR).
//    2. En operacion normal, la paridad que sale de base/ encierra a la
//       funcion maestra en la rama que el seguro del robot bloquea
//       (por ejemplo, reactor siempre devuelve PAR para cualquier n,
//       pero el hueco entre aguanta_max y fusible_corte exige un IMPAR).
//    3. Si metes un numero chico no supera aguanta_max; si metes un
//       numero gigante revienta el fusible_corte; y si no inviertes la
//       paridad exacta que pide la funcion, el seguro interno lo corta.
//    4. Cada equipo (y cada ciclo Parte 1 -> Parte 2) tiene ventanas
//       distintas generadas por su semilla de ciclo, evitando que un
//       equipo copie los numeros de la mesa vecina.
// ============================================================

import type { Role } from '../lib/constants.js';
import type { ContextoComando, ModuloFase, ResultadoComando } from './types.js';
import {
  ANCHO_CAMARA, AYUDA_CAMARAS, circuitoCerrado, lienzo, lista, mandoDeCamaras, tira,
  type CamaraDef, type Escena, type Rotulo,
} from './comun.js';
import {
  cuarentenaActiva, error, exito, normalizar, numero, rechazo, tabla, texto,
} from './comun.js';

// ---------- Funciones del núcleo con ramas par / impar ----------

type Nivel = 'nucleo' | 'medio' | 'base';

type PiezaInfo = {
  id: string;
  nombre: string;
  carpeta: Nivel;
  llama: string | null;
  param: string;
  /** En base/ hay una sola cuenta; en medio/ y nucleo/ hay rama par e impar. */
  cuentaPar: string;
  cuentaImpar: string;
  evalPar: (x: number) => number;
  evalImpar: (x: number) => number;
};

const esPar = (n: number) => Math.abs(n % 2) === 0;

export const PIEZAS: Record<string, PiezaInfo> = {
  // base/ (Nivel C · nunca llaman a nadie)
  carga: {
    id: 'F1',
    nombre: 'carga',
    carpeta: 'base',
    llama: null,
    param: 'n',
    cuentaPar: 'n * 2',
    cuentaImpar: 'n * 2',
    evalPar: (n) => n * 2,
    evalImpar: (n) => n * 2,
  },
  pulso: {
    id: 'F2',
    nombre: 'pulso',
    carpeta: 'base',
    llama: null,
    param: 'n',
    cuentaPar: 'n * 3',
    cuentaImpar: 'n * 3',
    evalPar: (n) => n * 3,
    evalImpar: (n) => n * 3,
  },
  freno: {
    id: 'F3',
    nombre: 'freno',
    carpeta: 'base',
    llama: null,
    param: 'n',
    cuentaPar: 'n - 2',
    cuentaImpar: 'n - 2',
    evalPar: (n) => n - 2,
    evalImpar: (n) => n - 2,
  },

  // medio/ (Nivel B · llaman a una de base/ y ramifican por paridad)
  presion: {
    id: 'F4',
    nombre: 'presion',
    carpeta: 'medio',
    llama: 'carga',
    param: 'x',
    // Si recibe par (normal de carga): suma 5 -> lo vuelve IMPAR.
    // Si recibe impar (saboteado): suma 5 -> lo vuelve PAR (abre el hueco de reactor).
    cuentaPar: 'x + 5',
    cuentaImpar: 'x + 5',
    evalPar: (x) => x + 5,
    evalImpar: (x) => x + 5,
  },
  valvula: {
    id: 'F5',
    nombre: 'valvula',
    carpeta: 'medio',
    llama: 'pulso',
    param: 'x',
    // Si recibe par (normal de pulso(6)=18): resta 3 -> sale 15 (IMPAR).
    // Si recibe impar (hueco): suma 5 -> sale PAR (abre la rama par de escudo).
    cuentaPar: 'x - 3',
    cuentaImpar: 'x + 5',
    evalPar: (x) => x - 3,
    evalImpar: (x) => x + 5,
  },
  flujo: {
    id: 'F6',
    nombre: 'flujo',
    carpeta: 'medio',
    llama: 'freno',
    param: 'x',
    // Si recibe par: multiplica por 2 -> sale PAR.
    // Si recibe impar (normal de freno(5)=3): multiplica por 3 -> sale IMPAR.
    cuentaPar: 'x * 2',
    cuentaImpar: 'x * 3',
    evalPar: (x) => x * 2,
    evalImpar: (x) => x * 3,
  },

  // nucleo/ (Nivel A · llaman a medio/ y tienen el seguro par/impar)
  reactor: {
    id: 'F7',
    nombre: 'reactor',
    carpeta: 'nucleo',
    llama: 'presion',
    param: 'x',
    // Normalmente presion(5)=15 es IMPAR -> reactor hace x * 2 = 30 (siempre PAR).
    // El hueco exige salida IMPAR, que solo ocurre si a reactor le entra un PAR (x + 25 = IMPAR).
    cuentaPar: 'x + 25',
    cuentaImpar: 'x * 2',
    evalPar: (x) => x + 25,
    evalImpar: (x) => x * 2,
  },
  escudo: {
    id: 'F8',
    nombre: 'escudo',
    carpeta: 'nucleo',
    llama: 'valvula',
    param: 'x',
    // Normalmente valvula(6)=15 es IMPAR -> escudo hace x + 6 = 21 (siempre IMPAR).
    // El hueco exige salida PAR, que solo ocurre si a escudo le entra un PAR (x + 10 = PAR).
    cuentaPar: 'x + 10',
    cuentaImpar: 'x + 6',
    evalPar: (x) => x + 10,
    evalImpar: (x) => x + 6,
  },
  latido: {
    id: 'F9',
    nombre: 'latido',
    carpeta: 'nucleo',
    llama: 'flujo',
    param: 'x',
    // Si entra par: x - 2 (sale PAR, bloqueado por el seguro de M3).
    // Si entra impar: x - 4 (sale IMPAR, que es la paridad del hueco de M3).
    cuentaPar: 'x - 2',
    cuentaImpar: 'x - 4',
    evalPar: (x) => x - 2,
    evalImpar: (x) => x - 4,
  },
};

const CARPETAS: Nivel[] = ['nucleo', 'medio', 'base'];

// ---------- Condiciones por ciclo y por equipo (Semilla) ----------
//
// Cada equipo (y cada ciclo Parte 1 / Parte 2) obtiene una combinación
// (d1, d2, d3) en {0, 1, 2}^3 a partir de `estado.semilla`.
// Con seed = 0 (por defecto en tests sin semilla), d1 = 0, d2 = 0, d3 = 0.

export type CaracteristicaCiclo = {
  id: string;
  orden: number;
  nombre: string;
  funcionId: string;
  piezaA: string;
  piezaB: string;
  piezaC: string;
  entrada: number;
  normal: number;
  aguantaMax: number;
  fusibleCorte: number;
  paridadHueco: 'IMPAR' | 'PAR';
  descripcionHueco: string;
};

export function variantesDeCiclo(estado: Record<string, unknown>): [number, number, number] {
  const s = Math.abs(Math.trunc(numero(estado, 'semilla')));
  if (s === 0) return [0, 0, 0];
  return [s % 3, Math.floor(s / 3) % 3, Math.floor(s / 9) % 3];
}

export function caracteristicasDe(estado: Record<string, unknown>): CaracteristicaCiclo[] {
  const [d1, d2, d3] = variantesDeCiclo(estado);

  const m1Min = 40 + d1 * 12;
  const m1Max = m1Min + 12;

  const m2Min = 30 + d2 * 12;
  const m2Max = m2Min + 14;

  const m3Min = 20 + d3 * 14;
  const m3Max = m3Min + 14;

  return [
    {
      id: 'M1',
      orden: 1,
      nombre: '1. traccion motriz',
      funcionId: 'F7',
      piezaA: 'reactor',
      piezaB: 'presion',
      piezaC: 'carga',
      entrada: 5,
      normal: 30,
      aguantaMax: m1Min,
      fusibleCorte: m1Max,
      paridadHueco: 'IMPAR',
      descripcionHueco: `IMPAR entre ${m1Min + 1} y ${m1Max - 1} (el seguro bloquea pares)`,
    },
    {
      id: 'M2',
      orden: 2,
      nombre: '2. presion hidraulica',
      funcionId: 'F8',
      piezaA: 'escudo',
      piezaB: 'valvula',
      piezaC: 'pulso',
      entrada: 6,
      normal: 21,
      aguantaMax: m2Min,
      fusibleCorte: m2Max,
      paridadHueco: 'PAR',
      descripcionHueco: `PAR entre ${m2Min + 2} y ${m2Max - 2} (el seguro bloquea impares)`,
    },
    {
      id: 'M3',
      orden: 3,
      nombre: '3. enfriamiento de marcha',
      funcionId: 'F9',
      piezaA: 'latido',
      piezaB: 'flujo',
      piezaC: 'freno',
      entrada: 5,
      normal: 5,
      aguantaMax: m3Min,
      fusibleCorte: m3Max,
      paridadHueco: 'IMPAR',
      descripcionHueco: `IMPAR entre ${m3Min + 1} y ${m3Max - 1} (el seguro bloquea pares)`,
    },
  ];
}

/** Verifica si una salida entra exactamente por el hueco de esa característica. */
function evaluarImpacto(c: CaracteristicaCiclo, salida: number): {
  rota: boolean;
  motivo: string;
} {
  if (salida <= c.aguantaMax) {
    return { rota: false, motivo: `AGUANTA (<= ${c.aguantaMax})` };
  }
  if (salida >= c.fusibleCorte) {
    return { rota: false, motivo: `FUSIBLE QUEMADO (>= ${c.fusibleCorte})` };
  }
  const paridadActual = esPar(salida) ? 'PAR' : 'IMPAR';
  if (paridadActual !== c.paridadHueco) {
    return { rota: false, motivo: `BLOQUEADO POR SEGURO (salio ${paridadActual}, hueco exige ${c.paridadHueco})` };
  }
  return { rota: true, motivo: `HUECO VULNERADO (${salida} ${paridadActual})` };
}

/** Avanza la semilla al cambiar de ciclo para que la Parte 2 tenga otras ventanas. */
function siguienteSemilla(semillaActual: number): number {
  if (semillaActual <= 0) return 0; // mantiene determinismo cuando semilla === 0 en tests base
  const nueva = ((semillaActual * 13 + 7) % 26) + 1;
  return nueva === semillaActual ? (nueva % 26) + 1 : nueva;
}

// ---------- Paquetes de Cola (Parte 2) ----------

type PaqueteCola = {
  cola: 'COLA-A' | 'COLA-B' | 'COLA-C';
  etiqueta: 'NUC' | 'CTL' | 'SEN';
  nivel: Nivel;
  valor: number;
  firma?: number;
};

function paquetesDe(estado: Record<string, unknown>): PaqueteCola[] {
  return Array.isArray(estado.paquetes) ? (estado.paquetes as PaqueteCola[]) : [];
}

// ---------- Evaluador de expresiones y ejecutor de la Pila ----------

function tokenizarExpr(expr: string): string[] {
  return expr.replace(/([+\-*/])/g, ' $1 ').trim().split(/\s+/).filter(Boolean);
}

function evaluarExpr(expr: string, vars: Record<string, number>): number | null {
  const tokens = tokenizarExpr(expr);
  const leer = (t: string): number | null => {
    if (t in vars) return vars[t];
    if (t === 'n' && 'x' in vars) return vars.x;
    if (t === 'x' && 'n' in vars) return vars.n;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  if (tokens.length === 1) return leer(tokens[0]);
  if (tokens.length === 3) {
    const a = leer(tokens[0]);
    const op = tokens[1];
    const b = leer(tokens[2]);
    if (a === null || b === null) return null;
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? null : Math.trunc(a / b);
      default: return null;
    }
  }
  return null;
}

function coincideRama(exprJugador: string, fnReal: (v: number) => number): boolean {
  const pruebas = [2, 3, 4, 5, 6, 7, 10];
  for (const v of pruebas) {
    const real = fnReal(v);
    const jugador = evaluarExpr(exprJugador, { n: v, x: v });
    if (jugador === null || jugador !== real) return false;
  }
  return true;
}

/**
 * Comprueba si la expresión propuesta en `armar` coincide con la pieza.
 * Acepta:
 *  - `par <expr1> impar <expr2>` (o al revés) comprobando ambas ramas.
 *  - `<expr>` simple si coincide con al menos una de las ramas reales de la pieza.
 */
function validarArmado(exprTexto: string, pieza: PiezaInfo): boolean {
  const t = exprTexto.trim();
  const mParImpar = t.match(/^par\s+(.+?)\s+impar\s+(.+)$/i);
  if (mParImpar) {
    return coincideRama(mParImpar[1], pieza.evalPar) && coincideRama(mParImpar[2], pieza.evalImpar);
  }
  const mImparPar = t.match(/^impar\s+(.+?)\s+par\s+(.+)$/i);
  if (mImparPar) {
    return coincideRama(mImparPar[1], pieza.evalImpar) && coincideRama(mImparPar[2], pieza.evalPar);
  }
  return coincideRama(t, pieza.evalPar) || coincideRama(t, pieza.evalImpar);
}

function evalPiezaReal(pieza: PiezaInfo, x: number): number {
  return esPar(x) ? pieza.evalPar(x) : pieza.evalImpar(x);
}

type TrazaPaso = {
  pieza: string;
  nivel: Nivel;
  entrada: number;
  rama: 'par' | 'impar';
  salida: number;
  llamaA?: string;
  esEnganada?: boolean;
};

function ejecutarCadena(
  nombre: string,
  entrada: number,
  enganos: Record<string, string> = {}
): { salida: number; traza: TrazaPaso[]; error?: string } {
  const pieza = PIEZAS[nombre];
  if (!pieza) return { salida: NaN, traza: [], error: `Pieza «${nombre}» no existe` };

  if (pieza.carpeta === 'base') {
    const rama: 'par' | 'impar' = esPar(entrada) ? 'par' : 'impar';
    let salida: number;
    if (enganos[nombre]) {
      const v = evaluarExpr(enganos[nombre], { n: entrada, x: entrada });
      if (v === null) return { salida: NaN, traza: [], error: `Error evaluando enganar en ${nombre}` };
      salida = v;
    } else {
      salida = evalPiezaReal(pieza, entrada);
    }
    return {
      salida,
      traza: [{ pieza: nombre, nivel: 'base', entrada, rama, salida, esEnganada: !!enganos[nombre] }],
    };
  }

  const sub = ejecutarCadena(pieza.llama!, entrada, enganos);
  if (sub.error) return sub;

  const rama: 'par' | 'impar' = esPar(sub.salida) ? 'par' : 'impar';
  let salida: number;
  if (enganos[nombre]) {
    const v = evaluarExpr(enganos[nombre], { n: sub.salida, x: sub.salida });
    if (v === null) return { salida: NaN, traza: [], error: `Error evaluando enganar en ${nombre}` };
    salida = v;
  } else {
    salida = evalPiezaReal(pieza, sub.salida);
  }

  return {
    salida,
    traza: [
      ...sub.traza,
      {
        pieza: nombre,
        nivel: pieza.carpeta,
        entrada: sub.salida,
        rama,
        salida,
        llamaA: pieza.llama!,
        esEnganada: !!enganos[nombre],
      },
    ],
  };
}

// ---------- Esquema Relacional Dinámico para el Operador de Datos ----------
//
// 3 tablas permanentes (`funciones`, `resultados`, `tolerancias`) presentes
// en ambas partes.
// La 4ª tabla (`colas_filtro`) SOLO aparece cuando el equipo pasa a la Parte 2.

function construirTablasBase(estado: Record<string, unknown>) {
  const caracteristicas = caracteristicasDe(estado);

  return [
    {
      id: 'funciones',
      nombre: 'funciones',
      x: 40, y: 30, w: 290,
      descripcion: 'Catalogo de funciones internas del robot',
      clave: 'id',
      columnas: ['id', 'funcion', 'comportamiento'],
      filas: [
        ['F1', 'carga', 'operacion directa'],
        ['F2', 'pulso', 'operacion directa'],
        ['F3', 'freno', 'operacion directa'],
        ['F4', 'presion', 'segun paridad (par / impar)'],
        ['F5', 'valvula', 'segun paridad (par / impar)'],
        ['F6', 'flujo', 'segun paridad (par / impar)'],
        ['F7', 'reactor', 'segun paridad (par / impar)'],
        ['F8', 'escudo', 'segun paridad (par / impar)'],
        ['F9', 'latido', 'segun paridad (par / impar)'],
      ],
    },
    {
      id: 'resultados',
      nombre: 'resultados',
      x: 610, y: 30, w: 350,
      descripcion: 'Salidas observadas con distintas entradas y paridades',
      clave: 'id',
      columnas: ['id', 'funcion_id', 'condicion_entrada', 'salida'],
      filas: [
        ['R1', 'F1', 'n = 4', '8'],
        ['R2', 'F1', 'n = 5', '10'],
        ['R3', 'F2', 'n = 5', '15'],
        ['R4', 'F2', 'n = 6', '18'],
        ['R5', 'F3', 'n = 5', '3'],
        ['R6', 'F3', 'n = 6', '4'],
        ['R7', 'F4', 'n = 5 (recibe x=10 par)', '15'],
        ['R8', 'F4', 'si recibe x=11 impar', '16'],
        ['R9', 'F5', 'n = 6 (recibe x=18 par)', '15'],
        ['R10', 'F5', 'n = 5 (recibe x=15 impar)', '20'],
        ['R11', 'F6', 'n = 5 (recibe x=3 impar)', '9'],
        ['R12', 'F6', 'n = 6 (recibe x=4 par)', '8'],
        ['R13', 'F7', 'n = 5 (recibe x=15 impar)', '30'],
        ['R14', 'F7', 'si recibe x=20 par', '45'],
        ['R15', 'F8', 'n = 6 (recibe x=15 impar)', '21'],
        ['R16', 'F8', 'n = 5 (recibe x=20 par)', '30'],
        ['R17', 'F9', 'n = 5 (recibe x=9 impar)', '5'],
        ['R18', 'F9', 'n = 6 (recibe x=8 par)', '6'],
      ],
    },
    {
      id: 'tolerancias',
      nombre: 'tolerancias',
      x: 40, y: 300, w: 450,
      descripcion: 'Limites que aguanta el robot, fusible superior y hueco del seguro en este ciclo',
      clave: 'id',
      columnas: ['id', 'caracteristica', 'funcion_id', 'entrada', 'aguanta_max', 'fusible_corte', 'hueco_vulnerable'],
      filas: caracteristicas.map((c) => [
        c.id,
        c.nombre,
        c.funcionId,
        String(c.entrada),
        String(c.aguantaMax),
        String(c.fusibleCorte),
        c.descripcionHueco,
      ]),
    },
  ];
}

const TABLA_COLAS_PARTE_2 = {
  id: 'colas_filtro',
  nombre: 'colas_filtro',
  x: 540, y: 300, w: 420,
  descripcion: 'Blindaje activo · Reglas de cada cola y su efecto en las 3 caracteristicas (M1->M2->M3)',
  clave: 'id',
  columnas: ['id', 'cola', 'tolerancia_id', 'exigencia', 'requisitos', 'efecto_en_pila'],
  filas: [
    ['Q1', 'COLA-A (nucleo)', 'M1', 'BAJA', 'Etiqueta NUC · cualquier entero (-100 a 100)', 'Recorre la pila y al final suma V a la salida de nucleo'],
    ['Q2', 'COLA-B (medio)', 'M2', 'MEDIA', 'Etiqueta CTL · multiplo de 5 · entre -50 y 50', 'Baja a base y al subir a medio suma V antes de entrar a nucleo'],
    ['Q3', 'COLA-C (base)', 'M3', 'MAXIMA', 'Etiqueta SEN · multiplo de 3 · IMPAR · firma = valor + 7', 'Entra directo al fondo y reemplaza con V la salida de base'],
  ],
};

function esquemaParaDatos(estado: Record<string, unknown>) {
  const parte = numero(estado, 'parte') || 1;
  const tablasBase = construirTablasBase(estado);

  if (parte === 1) {
    return {
      tablas: tablasBase,
      relaciones: [
        { desde: 'resultados', campo: 'funcion_id', hasta: 'funciones' },
        { desde: 'tolerancias', campo: 'funcion_id', hasta: 'funciones' },
      ],
    };
  }
  return {
    tablas: [...tablasBase, TABLA_COLAS_PARTE_2],
    relaciones: [
      { desde: 'resultados', campo: 'funcion_id', hasta: 'funciones' },
      { desde: 'tolerancias', campo: 'funcion_id', hasta: 'funciones' },
      { desde: 'colas_filtro', campo: 'tolerancia_id', hasta: 'tolerancias' },
    ],
  };
}

// ---------- Circuito cerrado de cámaras (Animaciones ASCII 15×36) ----------

const CAMARAS: CamaraDef[] = [
  { n: 1, id: 'nucleo', nombre: 'SALA DEL NUCLEO', sector: 'N-01', que: 'las tres torres del nucleo y el pulso' },
  { n: 2, id: 'filtro', nombre: 'CONDUCTO Y FILTRO', sector: 'N-02', que: 'el movimiento de la pila y las cintas de cola' },
];

function escenaNucleo(
  parte: number,
  armadasCount: number,
  saboteadasCount: number,
  abierta: string | null,
  f: number
): string[] {
  const nivelAbierto = abierta && PIEZAS[abierta] ? PIEZAS[abierta].carpeta : null;
  const colDron = nivelAbierto === 'nucleo' ? 6 : nivelAbierto === 'medio' ? 17 : nivelAbierto === 'base' ? 28 : 4 + (f * 5) % 26;

  const bobina = (i: number) => {
    if (parte === 2) return f % 2 === 0 ? '|###|' : '|[!]|';
    if (saboteadasCount > 0 && i === 2) return f % 2 === 0 ? '|*!*|' : '|!#!|';
    return (f + i) % 2 === 0 ? '|/\\/|' : '|\\/\\|';
  };

  const posPulso = [0, 1, 2, 2, 1, 0][f % 6];
  const cable1 = posPulso === 0 ? '==(*)==' : posPulso === 1 ? '====(*)' : '=======';
  const cable2 = posPulso === 1 ? '(*)====' : posPulso === 2 ? '==(*)==' : '=======';

  const enCol = (s: string, c: number) => tira(' '.repeat(Math.max(0, c)) + s, ANCHO_CAMARA);

  return lienzo([
    '   .-----.     .-----.     .-----.  ',
    tira('   |NUC-A|     |MED-B|     |BAS-C|', ANCHO_CAMARA),
    tira(`   ${bobina(0)}=====${bobina(1)}=====${bobina(2)}`, ANCHO_CAMARA),
    tira(`   ${bobina(0)}${cable1.slice(0, 5)}${bobina(1)}${cable2.slice(0, 5)}${bobina(2)}`, ANCHO_CAMARA),
    "   '--+--'     '--+--'     '--+--'  ",
    tira('      |           |           |', ANCHO_CAMARA),
    tira(
      `     ${posPulso === 0 ? '(*)' : ' | '}         ${posPulso === 1 ? '(*)' : ' | '}         ${posPulso === 2 ? '(*)' : ' | '}`,
      ANCHO_CAMARA,
    ),
    '      +-----------+-----------+     ',
    enCol(f % 2 === 0 ? '<o>' : '{o}', colDron),
    enCol('/|\\', colDron),
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira(
      parte === 1
        ? `  armadas: ${armadasCount}/9 · ${saboteadasCount > 0 ? 'pulso alterado' : 'flujo estable'}`
        : '  blindaje activo · 3 cintas en guardia',
      ANCHO_CAMARA,
    ),
  ]);
}

function escenaFiltro(
  parte: number,
  colasCount: { A: number; B: number; C: number; total: number },
  f: number
): string[] {
  if (parte === 1) {
    const paso = f % 6;
    const bajando = paso < 3;
    const pisoActivo = bajando ? paso : 5 - paso;
    const flecha = bajando ? 'v' : '^';

    const caja = (piso: number, etq: string) => {
      const activo = piso === pisoActivo;
      const marca = activo ? (bajando ? '>>' : '<<') : '  ';
      const luz = activo ? '(*)' : '( )';
      return tira(`    ${marca} | ${luz} ${etq.padEnd(10)} | ${activo ? flecha : ' '}`, ANCHO_CAMARA);
    };

    return lienzo([
      '       .--------------------.       ',
      caja(0, 'NIVEL A'),
      tira(`       |       ${pisoActivo === 0 ? flecha : '|'}            |`, ANCHO_CAMARA),
      caja(1, 'NIVEL B'),
      tira(`       |       ${pisoActivo === 1 ? flecha : '|'}            |`, ANCHO_CAMARA),
      caja(2, 'NIVEL C'),
      "       '--------------------'       ",
      '                                    ',
      tira(
        bajando
          ? '     [v] BAJANDO POR LA PILA...    '
          : '     [^] SUBIENDO RESULTADOS...    ',
        ANCHO_CAMARA,
      ),
      '                                    ',
      '  ==================================',
      '  ::::::::::::::::::::::::::::::::::',
      '                                    ',
      tira('  el fondo se resuelve primero.', ANCHO_CAMARA),
    ]);
  }

  const cinta = (n: number, desfase: number) => {
    if (n <= 0) return '........';
    const carriles = Array(8).fill('.');
    for (let k = 0; k < Math.min(n, 3); k++) {
      const pos = (f + desfase + k * 3) % 8;
      carriles[pos] = '#';
    }
    return carriles.join('');
  };

  const scan = f % 2 === 0 ? '|!|' : '|:|';
  const rodillos = f % 2 === 0 ? 'o-o-o-o-' : '-o-o-o-o';

  return lienzo([
    '                                    ',
    tira(`  COLA-A [${cinta(colasCount.A, 0)}]${scan}->[NUC]`, ANCHO_CAMARA),
    tira(`         ${rodillos}                   `, ANCHO_CAMARA),
    tira(`  COLA-B [${cinta(colasCount.B, 2)}]${scan}->[MED]`, ANCHO_CAMARA),
    tira(`         ${rodillos}                   `, ANCHO_CAMARA),
    tira(`  COLA-C [${cinta(colasCount.C, 4)}]${scan}->[BAS]`, ANCHO_CAMARA),
    tira(`         ${rodillos}                   `, ANCHO_CAMARA),
    '                                    ',
    tira(`  ESCANER ${scan}  formados: ${colasCount.total}/3`, ANCHO_CAMARA),
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira('  1o->M1 · 2o->M2 · 3o->M3 (FIFO).', ANCHO_CAMARA),
  ]);
}

function vistaDeCamaras(estado: Record<string, unknown>) {
  const parte = numero(estado, 'parte') || 1;
  const armadas = (estado.armadas as Record<string, boolean>) ?? {};
  const armadasCount = Object.keys(armadas).filter((k) => armadas[k]).length;
  const enganos = (estado.enganos as Record<string, string>) ?? {};
  const saboteadasCount = Object.keys(enganos).length;
  const abierta = (estado.abierta as string | null) ?? null;
  const pcks = paquetesDe(estado);
  const colasCount = {
    A: pcks.filter((p) => p.cola === 'COLA-A').length,
    B: pcks.filter((p) => p.cola === 'COLA-B').length,
    C: pcks.filter((p) => p.cola === 'COLA-C').length,
    total: pcks.length,
  };

  return circuitoCerrado(CAMARAS, estado, (cam) => {
    const escena: Escena = cam.id === 'nucleo'
      ? {
          fotogramas: [0, 1, 2, 3, 4, 5].map((f) =>
            escenaNucleo(parte, armadasCount, saboteadasCount, abierta, f),
          ),
          ritmo: 300,
        }
      : {
          fotogramas: [0, 1, 2, 3, 4, 5].map((f) => escenaFiltro(parte, colasCount, f)),
          ritmo: 260,
        };
    const rotulos: Rotulo[] = [
      { texto: parte === 1 ? 'PARTE 1 · PILA' : 'PARTE 2 · COLAS', tono: parte === 1 ? 'neutro' : 'alerta' },
      { texto: `ARMADAS ${armadasCount}/9`, tono: armadasCount === 9 ? 'ok' : 'neutro' },
    ];
    if (parte === 2) {
      rotulos.push({ texto: `EN COLA ${colasCount.total}/3`, tono: colasCount.total === 3 ? 'ok' : 'neutro' });
    }
    return {
      escena,
      rotulos,
      clave: `${cam.n}:${parte}:${armadasCount}:${saboteadasCount}:${abierta ?? '-'}:${colasCount.A}-${colasCount.B}-${colasCount.C}`,
    };
  });
}

// ---------- Visualizador de Documentos para PantallaView ----------

function vistaDeCodigo(estado: Record<string, unknown>) {
  const parte = numero(estado, 'parte') || 1;
  const armadas = (estado.armadas as Record<string, boolean>) ?? {};
  const enganos = (estado.enganos as Record<string, string>) ?? {};
  const abiertaRaw = (estado.abierta as string | null) ?? null;
  const abiertaKey = abiertaRaw && PIEZAS[abiertaRaw] ? abiertaRaw : null;
  const pcks = paquetesDe(estado);

  const carpetas = CARPETAS.map((c) => ({
    nombre: c,
    piezas: Object.values(PIEZAS)
      .filter((p) => p.carpeta === c)
      .map((p) => ({ nombre: `${p.nombre}.fn`, abierta: abiertaKey === p.nombre })),
  }));

  if (!abiertaKey) {
    return {
      raiz: 'nucleo/',
      carpetas,
      abierta: null,
      pila: [],
    };
  }

  const pz = PIEZAS[abiertaKey];
  const estaArmada = !!armadas[pz.nombre];
  const enganada = enganos[pz.nombre];
  const lineas: { n: number; texto: string; cursor: boolean }[] = [];

  lineas.push({ n: 1, texto: `recibe ${pz.param}`, cursor: false });
  if (pz.carpeta === 'base') {
    lineas.push({
      n: 2,
      texto: estaArmada ? `devuelve ${pz.cuentaPar}` : 'devuelve [ ??? ]',
      cursor: !enganada,
    });
    if (enganada) {
      lineas.push({ n: 3, texto: `sabotaje -> devuelve ${enganada}`, cursor: true });
    }
  } else {
    lineas.push({
      n: 2,
      texto: estaArmada ? `x = ${pz.llama}(n)` : 'x = [ ??? ](n)',
      cursor: false,
    });
    lineas.push({
      n: 3,
      texto: estaArmada ? `si x es par   -> devuelve ${pz.cuentaPar}` : 'si x es par   -> devuelve [ ??? ]',
      cursor: !enganada,
    });
    lineas.push({
      n: 4,
      texto: estaArmada ? `si x es impar -> devuelve ${pz.cuentaImpar}` : 'si x es impar -> devuelve [ ??? ]',
      cursor: !enganada,
    });
    if (enganada) {
      lineas.push({ n: 5, texto: `sabotaje -> devuelve ${enganada}`, cursor: true });
    }
  }

  if (parte === 2) {
    const deEsteNivel = pcks.filter((p) => p.nivel === pz.carpeta);
    if (deEsteNivel.length > 0) {
      const txt = deEsteNivel
        .map((p) => (p.firma !== undefined ? `${p.etiqueta} ${p.valor} (sig:${p.firma})` : `${p.etiqueta} ${p.valor}`))
        .join(', ');
      lineas.push({
        n: lineas.length + 1,
        texto: `cola en espera -> [ ${txt} ]`,
        cursor: true,
      });
    }
  }

  const cadena: string[] = [pz.nombre];
  let cur: PiezaInfo | undefined = pz;
  while (cur && cur.llama && armadas[cur.nombre]) {
    cadena.push(cur.llama);
    cur = PIEZAS[cur.llama];
  }

  return {
    raiz: 'nucleo/',
    carpetas,
    abierta: { ruta: `nucleo/${pz.carpeta}/${pz.nombre}.fn`, lineas },
    pila: cadena,
  };
}

function ayuda(parte: number): ResultadoComando {
  return {
    bloques: [
      texto(
        [
          'abrir <pieza>                   — inspeccionar un documento en Pantalla',
          'sondear <pieza> <numero>        — probar una funcion y ver que rama toma. Gratis',
          'armar <pieza> <operacion>       — registrar formula de funcion base',
          'armar <pieza> llama <hija> luego <operacion> — registrar funcion intermedia o maestra',
          'estado                          — ver avance de armado y sabotaje',
          'reiniciar                       — limpiar sabotajes o colas (conserva lo armado)',
          ...(parte === 1
            ? [
                'enganar <pieza> <operacion>     — intervenir una funcion descubierta',
                'ejecutar                        — probar si las 3 caracteristicas entran por su hueco. No es gratis',
              ]
            : [
                'colas                           — ver los paquetes formados para M1, M2 y M3',
                'encolar <etiqueta> <valor> [sig]— formar paquete en cola (NUC, CTL o SEN)',
                'vaciar                          — limpiar los paquetes formados',
                'disparar                        — desencolar en orden FIFO y atacar las 3 caracteristicas. No es gratis',
              ]),
          ...AYUDA_CAMARAS,
        ],
        'Comandos disponibles',
      ),
      texto(
        [
          'Las funciones de medio/ y nucleo/ cambian su operacion segun si el valor',
          'que reciben es PAR o IMPAR.',
          '',
          'En operacion normal, la paridad que sale de base/ encierra al sistema en',
          'una rama que el seguro del robot bloquea. Para colarte por el hueco tienes',
          'que calcular como invertir o conservar la paridad para caer exactamente',
          'entre `aguanta_max` y `fusible_corte` con la paridad que pide Datos.',
        ],
        'El hueco y el fusible',
      ),
      texto(
        [
          parte === 1
            ? 'Para superar esta parte hay que vulnerar el hueco de las 3 caracteristicas a la vez: superar `aguanta_max`, no tocar `fusible_corte` y entrar con la paridad del hueco.'
            : 'El robot procesa las 3 caracteristicas en orden FIFO (1er paquete -> M1, 2o -> M2, 3o -> M3). Forma los 3 paquetes cumpliendo las reglas de `colas_filtro` y usa `disparar`.',
        ],
        'Condicion de victoria',
      ),
    ],
  };
}

export const nucleo: ModuloFase = {
  key: 'fase-4-nucleo',

  proyectar(role: Role, ctx) {
    const parte = numero(ctx.estado, 'parte') || 1;

    switch (role) {
      case 'DATOS':
        return {
          titulo: parte === 1
            ? 'Nucleo · funciones y tolerancias del robot'
            : 'Nucleo · funciones, tolerancias y filtrado de colas',
          nota: parte === 1
            ? 'Tu tienes que funciones existen, sus salidas para entradas pares e impares, y la ventana entre `aguanta_max` y `fusible_corte` con la paridad del hueco que rompe cada caracteristica.'
            : 'El robot activo el blindaje y cambio el ciclo de tolerancias: ha aparecido la tabla `colas_filtro` en tu esquema. Revisa las ventanas actuales de M1, M2 y M3.',
          lienzo: { w: 1000, h: 550 },
          ...esquemaParaDatos(ctx.estado),
        };

      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          camaras: vistaDeCamaras(ctx.estado),
          codigo: vistaDeCodigo(ctx.estado),
          nota: 'Tu ves el nucleo por circuito cerrado, el arbol de carpetas y el documento abierto '
              + 'con sus ramas par e impar. Cuanto aguanta el robot, donde salta el fusible y que '
              + 'paridad pide cada hueco lo tiene Datos. Quien escribe no ve nada: cantaselo.',
        };

      case 'TERMINAL':
        return {
          camara: numero(ctx.estado, 'camara') || 1,
          pista: 'Escribe `ayuda` y pregunta a Pantalla que aparecio. Tambien mandas tu las '
               + 'camaras del nucleo, aunque no las veas.',
          cuarentenaHasta: (ctx.estado.cuarentenaHasta as number) ?? null,
        };
    }
  },

  ejecutar(comandoBruto: string, ctx: ContextoComando): ResultadoComando {
    const enCuarentena = cuarentenaActiva(ctx);
    if (enCuarentena) return enCuarentena;

    const cmd = normalizar(comandoBruto);
    const [verbo, ...resto] = cmd.split(' ');
    const arg = resto.join(' ');

    const parte = numero(ctx.estado, 'parte') || 1;
    const armadas = { ...((ctx.estado.armadas as Record<string, boolean>) ?? {}) };
    const enganos = { ...((ctx.estado.enganos as Record<string, string>) ?? {}) };
    const paquetes = [...paquetesDe(ctx.estado)];
    const caracteristicas = caracteristicasDe(ctx.estado);

    const mando = mandoDeCamaras(CAMARAS, verbo, arg, ctx.estado);
    if (mando) return mando;

    switch (verbo) {
      case 'ayuda':
      case 'help':
        return ayuda(parte);

      case 'abrir': {
        if (!arg) return { bloques: [error('Falta la pieza. `abrir <pieza>`.')] };
        const pieza = arg.replace(/\.fn$/, '').toLowerCase();
        if (!(pieza in PIEZAS)) {
          return { bloques: [error(`No existe la pieza «${pieza}». Pideselas a Pantalla, que ve el arbol.`)] };
        }
        return {
          estado: { ...ctx.estado, abierta: pieza },
          bloques: [texto([`Abierto ${pieza}.fn en Pantalla.`])],
        };
      }

      case 'sondear':
      case 'probar': {
        const partes = arg.split(/\s+/).filter(Boolean);
        if (partes.length < 2) {
          return { bloques: [error('Formato: `sondear <pieza> <numero>`.')] };
        }
        const piezaNombre = partes[0].replace(/\.fn$/, '').toLowerCase();
        const num = Number(partes[1]);
        if (!(piezaNombre in PIEZAS)) {
          return { bloques: [error(`No existe la pieza «${piezaNombre}». Pideselas a Pantalla.`)] };
        }
        if (!Number.isFinite(num) || !Number.isInteger(num)) {
          return { bloques: [error('El valor debe ser un numero entero.')] };
        }

        const res = ejecutarCadena(piezaNombre, num, enganos);
        if (res.error) return { bloques: [error(res.error)] };

        const nivelDesc = PIEZAS[piezaNombre].carpeta === 'base'
          ? '1 nivel (base — no llama a nadie)'
          : PIEZAS[piezaNombre].carpeta === 'medio'
            ? '2 niveles (medio -> base)'
            : '3 niveles (nucleo -> medio -> base)';

        const trazaLineas: string[] = [];
        for (const paso of res.traza) {
          const estaArmada = !!armadas[paso.pieza];
          const paridadSalida = esPar(paso.salida) ? 'PAR' : 'IMPAR';
          const desc = estaArmada
            ? `${paso.pieza}(${paso.entrada}) [rama ${paso.rama}] -> ${paso.salida} (${paridadSalida})`
            : `[pieza sin armar](${paso.entrada}) [rama ${paso.rama}] -> ${paso.salida} (${paridadSalida})`;
          trazaLineas.push(`  [${paso.nivel.padEnd(6)}] ${desc}`);
        }

        return {
          estado: { ...ctx.estado, abierta: piezaNombre },
          bloques: [
            texto(
              [
                `Sondeo de ${piezaNombre}(${num})`,
                `Resultado devuelto: ${res.salida} (${esPar(res.salida) ? 'PAR' : 'IMPAR'})`,
                `Profundidad de Pila: ${nivelDesc}`,
                '',
                'Traza de ejecucion (LIFO):',
                ...trazaLineas,
                '',
                'Observa que rama (par o impar) tomo cada nivel y comparalo con las tablas de Datos.',
              ],
              'Resultado del sondeo',
            ),
          ],
        };
      }

      case 'armar': {
        if (!arg) {
          return {
            bloques: [
              error('Falta la especificacion.'),
              texto([
                'Para base: `armar <pieza> <operacion>`.',
                'Para medio/nucleo: `armar <pieza> llama <otra> luego <operacion>`.',
              ]),
            ],
          };
        }

        const tokens = arg.split(/\s+/).filter(Boolean);
        const piezaNombre = tokens[0]?.replace(/\.fn$/, '').toLowerCase();
        if (!(piezaNombre in PIEZAS)) {
          return { bloques: [error(`No existe la pieza «${piezaNombre}». Revisa el arbol en Pantalla.`)] };
        }

        const pieza = PIEZAS[piezaNombre];

        if (pieza.carpeta === 'base') {
          if (tokens.includes('llama')) {
            return { bloques: [error(`«${piezaNombre}» vive en base/: nunca llama a nadie. Usa: \`armar ${piezaNombre} <operacion>\`.`)] };
          }
          const opTokens = tokens.slice(1);
          const expr = opTokens.join(' ');
          if (!expr) return { bloques: [error(`Falta la operacion para ${piezaNombre}.`)] };

          if (!validarArmado(expr, pieza)) {
            return {
              bloques: [
                error(`La formula «${expr}» no coincide con las respuestas del robot para ${piezaNombre}.`),
                texto(['Verifica con `sondear` y con la tabla de resultados de Datos.']),
              ],
            };
          }

          armadas[piezaNombre] = true;
          return {
            estado: { ...ctx.estado, armadas, abierta: piezaNombre },
            bloques: [
              texto(
                [
                  `[OK] Estructura de ${piezaNombre}.fn confirmada: devuelve ${pieza.cuentaPar}.`,
                  'El documento ahora muestra su codigo en Pantalla.',
                ],
                'Pieza armada',
              ),
            ],
          };
        } else {
          const idxLlama = tokens.indexOf('llama');
          if (idxLlama === -1 || idxLlama !== 1 || !tokens[idxLlama + 1]) {
            return {
              bloques: [
                error(`«${piezaNombre}» vive en ${pieza.carpeta}/: debe llamar a otra funcion.`),
                texto([`Sintaxis: \`armar ${piezaNombre} llama <hija> luego <operacion>\`.`]),
              ],
            };
          }

          const hijaPropuesta = tokens[idxLlama + 1].replace(/\.fn$/, '').toLowerCase();
          if (hijaPropuesta !== pieza.llama) {
            return {
              bloques: [
                error(`«${piezaNombre}» no llama a «${hijaPropuesta}».`),
                texto(['Recuerda: nucleo/ llama a medio/, y medio/ llama a base/. Usa `sondear` para ver la Pila.']),
              ],
            };
          }

          let opTokens = tokens.slice(idxLlama + 2);
          if (opTokens[0] === 'luego') opTokens = opTokens.slice(1);
          const expr = opTokens.join(' ');
          if (!expr) {
            return { bloques: [error(`Falta la operacion despues de llamar a ${hijaPropuesta}.`)] };
          }

          if (!validarArmado(expr, pieza)) {
            return {
              bloques: [
                error(`La formula «${expr}» no coincide con ninguna rama de ${piezaNombre}.`),
                texto(['Revisa en la tabla `resultados` de Datos que devuelve cuando recibe un valor par o impar.']),
              ],
            };
          }

          armadas[piezaNombre] = true;
          return {
            estado: { ...ctx.estado, armadas, abierta: piezaNombre },
            bloques: [
              texto(
                [
                  `[OK] Estructura de ${piezaNombre}.fn confirmada:`,
                  `  · llama a ${pieza.llama}(n)`,
                  `  · si x es par   -> devuelve ${pieza.cuentaPar}`,
                  `  · si x es impar -> devuelve ${pieza.cuentaImpar}`,
                  'El documento completo ahora es visible en Pantalla.',
                ],
                'Pieza armada',
              ),
            ],
          };
        }
      }

      case 'enganar':
      case 'sabotear': {
        if (parte === 2) {
          return {
            bloques: [
              error('El robot ha blindado las funciones con colas de inspeccion.'),
              texto(['En la Parte 2 debes infiltrar paquetes usando `encolar` y lanzarlos con `disparar`.']),
            ],
          };
        }

        const tokens = arg.split(/\s+/).filter(Boolean);
        const piezaNombre = tokens[0]?.replace(/\.fn$/, '').toLowerCase();
        if (!piezaNombre || !(piezaNombre in PIEZAS)) {
          return { bloques: [error('Formato: `enganar <pieza> <operacion>`.')] };
        }

        if (!armadas[piezaNombre]) {
          return {
            bloques: [
              error(`No puedes enganar «${piezaNombre}» a ciegas.`),
              texto(['Primero descubre como funciona y confirmala con `armar`.']),
            ],
          };
        }

        const expr = tokens.slice(1).join(' ');
        if (!expr) return { bloques: [error(`Falta la operacion saboteada para ${piezaNombre}.`)] };

        const testVal = evaluarExpr(expr, { n: 5, x: 5 });
        if (testVal === null) {
          return { bloques: [error(`No entiendo la operacion «${expr}». Usa variables (n o x) y operadores (+ - * /).`)] };
        }

        enganos[piezaNombre] = expr;
        return {
          estado: { ...ctx.estado, enganos, abierta: piezaNombre },
          bloques: [
            texto(
              [
                `[OK] Sabotaje infiltrado en ${piezaNombre}.fn: ahora devolvera «${expr}».`,
                'Usa `sondear` sobre la funcion maestra para verificar que el resultado caiga en el hueco sin quemar el fusible.',
              ],
              'Funcion enganada',
            ),
          ],
        };
      }

      case 'ejecutar':
      case 'aplicar': {
        if (parte === 2) {
          return nucleo.ejecutar(`disparar ${arg}`, ctx);
        }

        const sinArmar = caracteristicas.filter(
          (c) => !armadas[c.piezaA] && !armadas[c.piezaB] && !armadas[c.piezaC],
        );
        if (sinArmar.length > 0) {
          return {
            bloques: [
              error(`Falta descubrir funciones en ${sinArmar.length} de las 3 cadenas del robot.`),
              texto(['Debes armar al menos una funcion en cada una de las 3 cadenas antes de ejecutar el sabotaje.']),
            ],
          };
        }

        const evaluaciones = caracteristicas.map((c) => {
          const r = ejecutarCadena(c.piezaA, c.entrada, enganos);
          const imp = evaluarImpacto(c, r.salida);
          return { c, salida: r.salida, rota: imp.rota, motivo: imp.motivo };
        });

        const rotasCount = evaluaciones.filter((e) => e.rota).length;

        if (rotasCount === caracteristicas.length) {
          const semillaActual = numero(ctx.estado, 'semilla');
          const nuevaSemilla = siguienteSemilla(semillaActual);

          return {
            estado: {
              ...ctx.estado,
              parte: 2,
              semilla: nuevaSemilla,
              enganos: {},
              abierta: null,
              paquetes: [],
            },
            bloques: [
              tabla(
                'Impacto en las 3 caracteristicas (Parte 1 superada)',
                ['id', 'funcion', 'resultado', 'estado'],
                evaluaciones.map((e) => [
                  e.c.id,
                  `${e.c.piezaA}(${e.c.entrada})`,
                  `${e.salida} (${esPar(e.salida) ? 'PAR' : 'IMPAR'})`,
                  e.motivo,
                ]),
              ),
              exito('LAS 3 CARACTERISTICAS COLAPSARON · Sabotaje inicial confirmado', [
                'Los tres sistemas entraron exactamente por el hueco de paridad sin disparar el fusible.',
                '',
                '[!] ALERTA DEL ROBOT: "INFILTRACION EN LOS 3 REGULADORES DE PARIDAD."',
                '[!] "ROTANDO VENTANAS DE TOLERANCIA Y ACTIVANDO BLINDAJE POR COLAS (FIFO)."',
                '',
                '--- PASO A LA PARTE 2 ---',
                '1. Ha aparecido la 4a tabla (`colas_filtro`) en el esquema de Datos.',
                '2. Si el robot rozo limites, las ventanas de `tolerancias` pueden haberse ajustado para este nuevo ciclo: pidele a Datos que las verifique.',
                '3. Encola 3 paquetes en orden FIFO (1er paquete -> M1, 2o -> M2, 3o -> M3) y usa `disparar`.',
              ]),
            ],
          };
        }

        return {
          ...rechazo(
            ctx,
            `Solo ${rotasCount} de las 3 caracteristicas entraron por el hueco vulnerable. Revisa en Datos el limite inferior, el fusible de corte y la paridad exigida.`,
            { armadas, enganos },
          ),
          bloques: [
            tabla(
              'Resultado de la ejecucion',
              ['id', 'funcion', 'resultado', 'diagnostico'],
              evaluaciones.map((e) => [
                e.c.id,
                `${e.c.piezaA}(${e.c.entrada})`,
                `${e.salida} (${esPar(e.salida) ? 'PAR' : 'IMPAR'})`,
                e.rota ? 'HUECO VULNERADO (ROTA)' : 'BLOQUEADO / FUERA DE HUECO',
              ]),
            ),
            ...rechazo(
              ctx,
              `Solo ${rotasCount} de las 3 caracteristicas entraron por su hueco vulnerable.`,
              { armadas, enganos },
            ).bloques,
          ],
        };
      }

      case 'colas': {
        if (parte === 1) {
          return { bloques: [error('El blindaje por colas todavia no esta activo (aparece en la Parte 2).')] };
        }
        return {
          bloques: [
            tabla(
              'Paquetes formados en orden FIFO (1o->M1, 2o->M2, 3o->M3)',
              ['turno', 'destino_ciclo', 'cola', 'paquete'],
              [0, 1, 2].map((i) => {
                const c = caracteristicas[i];
                const p = paquetes[i];
                return [
                  `${i + 1}o`,
                  `${c.id} (${c.piezaA})`,
                  p ? p.cola : '—',
                  p
                    ? p.firma !== undefined
                      ? `${p.etiqueta} ${p.valor} (sig:${p.firma})`
                      : `${p.etiqueta} ${p.valor}`
                    : '(pendiente)',
                ];
              }),
            ),
            texto([
              'Consulta la tabla `colas_filtro` y las ventanas actuales de `tolerancias` en Datos.',
              'Usa `encolar <etiqueta> <valor> [firma]` para formar los 3 paquetes.',
            ]),
          ],
        };
      }

      case 'encolar': {
        if (parte === 1) {
          return { bloques: [error('Las colas se activan en la Parte 2. En la Parte 1 usa `enganar` y `ejecutar`.')] };
        }

        if (paquetes.length >= 3) {
          return {
            bloques: [
              error('Ya hay 3 paquetes formados para las 3 caracteristicas (M1, M2 y M3).'),
              texto(['Usa `disparar` para procesarlos o `vaciar` si quieres volver a formarlos.']),
            ],
          };
        }

        const tokens = arg.split(/\s+/).filter(Boolean);
        if (tokens.length < 2) {
          return { bloques: [error('Formato: `encolar <etiqueta> <valor> [firma]` (etiquetas: NUC, CTL, SEN).')] };
        }

        const etiqueta = tokens[0].toUpperCase();
        const valor = Number(tokens[1]);

        if (!Number.isFinite(valor) || !Number.isInteger(valor)) {
          return { bloques: [error('El valor debe ser un numero entero.')] };
        }

        const destinoCar = caracteristicas[paquetes.length];

        if (etiqueta === 'NUC') {
          if (valor < -100 || valor > 100) {
            return { bloques: [error('COLA-A rechazo el paquete: el valor debe estar entre -100 y 100.')] };
          }
          paquetes.push({ cola: 'COLA-A', etiqueta: 'NUC', nivel: 'nucleo', valor });
          return {
            estado: { ...ctx.estado, paquetes },
            bloques: [
              texto([
                `[OK] Paquete #${paquetes.length} [ NUC ${valor} ] admitido en COLA-A (ira hacia ${destinoCar.id}).`,
                `Paquetes listos: ${paquetes.length} de 3.`,
              ]),
            ],
          };
        } else if (etiqueta === 'CTL') {
          // COLA-B (medio): múltiplo de 5 entre -50 y 50
          if (valor % 5 !== 0) {
            return {
              bloques: [
                error('COLA-B rechazo el paquete: no cumple los requisitos de entrada.'),
                texto(['Pide a Datos que revise la tabla colas_filtro para COLA-B.']),
              ],
            };
          }
          if (valor < -50 || valor > 50) {
            return {
              bloques: [
                error('COLA-B rechazo el paquete: valor fuera del rango permitido.'),
                texto(['Pide a Datos que revise el rango en colas_filtro.']),
              ],
            };
          }
          paquetes.push({ cola: 'COLA-B', etiqueta: 'CTL', nivel: 'medio', valor });
          return {
            estado: { ...ctx.estado, paquetes },
            bloques: [
              texto([
                `[OK] Paquete #${paquetes.length} [ CTL ${valor} ] admitido en COLA-B (ira hacia ${destinoCar.id}).`,
                `Paquetes listos: ${paquetes.length} de 3.`,
              ]),
            ],
          };
        } else if (etiqueta === 'SEN') {
          if (tokens.length < 3) {
            return { bloques: [error('COLA-C exige firma de seguridad: `encolar SEN <valor> <firma>`.')] };
          }
          const firma = Number(tokens[2]);

          if (valor % 3 !== 0 || Math.abs(valor % 2) !== 1 || firma !== valor + 7) {
            return {
              bloques: [
                error('COLA-C rechazo el paquete: no cumple las reglas de maxima seguridad.'),
                texto(['Datos tiene las condiciones exactas en colas_filtro.']),
              ],
            };
          }

          paquetes.push({ cola: 'COLA-C', etiqueta: 'SEN', nivel: 'base', valor, firma });
          return {
            estado: { ...ctx.estado, paquetes },
            bloques: [
              texto([
                `[OK] Paquete #${paquetes.length} [ SEN ${valor} (sig:${firma}) ] admitido en COLA-C (ira hacia ${destinoCar.id}).`,
                `Paquetes listos: ${paquetes.length} de 3.`,
              ]),
            ],
          };
        } else {
          return { bloques: [error(`Etiqueta desconocida «${etiqueta}». Usa NUC, CTL o SEN.`)] };
        }
      }

      case 'vaciar': {
        return {
          estado: { ...ctx.estado, paquetes: [] },
          bloques: [texto(['Las colas de inspeccion han sido vaciadas (0 de 3 paquetes).'])],
        };
      }

      case 'disparar':
      case 'procesar':
      case 'desplegar': {
        if (parte === 1) {
          return { bloques: [error('En la Parte 1 debes usar `ejecutar`.')] };
        }

        if (paquetes.length < 3) {
          return {
            bloques: [
              error(`Faltan paquetes en las colas: llevas ${paquetes.length} de 3.`),
              texto(['Debes encolar 3 paquetes (en orden FIFO para M1, M2 y M3) antes de disparar.']),
            ],
          };
        }

        // Comprobar conocimiento de la Pila en cada cadena según la cola usada
        for (let i = 0; i < 3; i++) {
          const c = caracteristicas[i];
          const p = paquetes[i];
          if (p.cola === 'COLA-C' && !armadas[c.piezaC]) {
            return {
              bloques: [
                error(`La seguridad de la Pila intercepto el paquete #${i + 1} (${c.id}) en COLA-C.`),
                texto([`Para entrar por base/ en ${c.id} debes haber armado «${c.piezaC}» primero.`]),
              ],
            };
          }
          if (p.cola === 'COLA-B' && (!armadas[c.piezaC] || !armadas[c.piezaB])) {
            return {
              bloques: [
                error(`La seguridad de la Pila intercepto el paquete #${i + 1} (${c.id}) en COLA-B.`),
                texto([`Para entrar por medio/ en ${c.id} debes haber armado «${c.piezaC}» y «${c.piezaB}».`]),
              ],
            };
          }
          if (p.cola === 'COLA-A' && (!armadas[c.piezaC] || !armadas[c.piezaB] || !armadas[c.piezaA])) {
            return {
              bloques: [
                error(`La seguridad de la Pila intercepto el paquete #${i + 1} (${c.id}) en COLA-A.`),
                texto([`COLA-A tiene entrada facil pero exige haber armado toda la cadena de ${c.id}: «${c.piezaC}», «${c.piezaB}» y «${c.piezaA}».`]),
              ],
            };
          }
        }

        // Desencolar en orden FIFO (paquete 0 -> M1, paquete 1 -> M2, paquete 2 -> M3)
        // Cada nivel evalúa su rama par o impar según el valor que le entra!
        const resultadosP2 = caracteristicas.map((c, i) => {
          const p = paquetes[i];
          const fnC = PIEZAS[c.piezaC];
          const fnB = PIEZAS[c.piezaB];
          const fnA = PIEZAS[c.piezaA];

          // 1. Fondo (C)
          let valC = evalPiezaReal(fnC, c.entrada);
          if (p.cola === 'COLA-C') valC = p.valor;

          // 2. Medio (B): toma la rama par o impar según valC
          let valB = evalPiezaReal(fnB, valC);
          if (p.cola === 'COLA-B') valB += p.valor;

          // 3. Nucleo (A): toma la rama par o impar según valB
          let valA = evalPiezaReal(fnA, valB);
          if (p.cola === 'COLA-A') valA += p.valor;

          const imp = evaluarImpacto(c, valA);
          return { c, p, valC, valB, valA, rota: imp.rota, motivo: imp.motivo };
        });

        const rotasCount = resultadosP2.filter((r) => r.rota).length;

        if (rotasCount === 3) {
          return {
            resuelto: true,
            bloques: [
              tabla(
                'Colapso total de las 3 caracteristicas (FIFO -> LIFO)',
                ['turno', 'caracteristica', 'cola_usada', 'salida_final', 'estado'],
                resultadosP2.map((r, i) => [
                  `${i + 1}o`,
                  r.c.id,
                  r.p.cola,
                  `${r.valA} (${esPar(r.valA) ? 'PAR' : 'IMPAR'})`,
                  r.motivo,
                ]),
              ),
              exito('NUCLEO SABOTEADO · El blindaje y los 3 sistemas han colapsado', [
                'Los 3 paquetes atravesaron las colas de inspeccion en orden FIFO, burlaron',
                'los reguladores de paridad y entraron exactamente por el hueco antes del fusible.',
                '',
                'Traccion, hidraulica y enfriamiento quedaron fuera de combate sin que',
                'el filtro ni los fusibles de emergencia pudieran detener la infiltracion.',
                '',
                'Habeis dominado las Funciones con Ramas, la Pila de Llamadas y las Colas de Filtrado.',
              ]),
            ],
          };
        }

        return {
          ...rechazo(
            ctx,
            `Solo ${rotasCount} de las 3 caracteristicas entraron por su hueco vulnerable. Las colas fueron purgadas.`,
            { armadas, paquetes: [] },
          ),
          bloques: [
            tabla(
              'Resultado del disparo en las 3 caracteristicas',
              ['turno', 'caracteristica', 'cola_usada', 'salida_final', 'diagnostico'],
              resultadosP2.map((r, i) => [
                `${i + 1}o`,
                r.c.id,
                r.p.cola,
                `${r.valA} (${esPar(r.valA) ? 'PAR' : 'IMPAR'})`,
                r.rota ? 'HUECO VULNERADO (ROTA)' : 'BLOQUEADO / FUERA DE HUECO',
              ]),
            ),
            ...rechazo(
              ctx,
              `Solo ${rotasCount} de las 3 caracteristicas entraron por su hueco vulnerable. Las colas fueron purgadas.`,
              { armadas, paquetes: [] },
            ).bloques,
          ],
        };
      }

      case 'reiniciar':
      case 'reset': {
        const fallos = numero(ctx.estado, 'fallos');
        const cuarentenaHasta = ctx.estado.cuarentenaHasta;
        const semilla = numero(ctx.estado, 'semilla');

        if (parte === 1) {
          return {
            estado: { parte: 1, semilla, armadas, enganos: {}, abierta: null, fallos, cuarentenaHasta },
            bloques: [
              texto([
                'Sabotajes limpiados. Las piezas que ya habiais armado se conservan.',
                'Los despliegues fallidos y la cuarentena no se borran.',
              ], 'Reinicio de Parte 1'),
            ],
          };
        } else {
          return {
            estado: { parte: 2, semilla, armadas, enganos: {}, paquetes: [], abierta: null, fallos, cuarentenaHasta },
            bloques: [
              texto([
                'Colas de inspeccion vaciadas. Las piezas armadas se conservan.',
                'Los fallos y la cuarentena siguen vigentes.',
              ], 'Reinicio de Parte 2'),
            ],
          };
        }
      }

      case 'estado':
      case 'donde': {
        const armadasLista = Object.keys(armadas).filter((k) => armadas[k]);
        return {
          bloques: [
            lista('Estado', [
              { clave: 'Etapa', valor: `Parte ${parte} (${parte === 1 ? 'Sabotaje en la Pila' : 'Blindaje de Colas'})` },
              { clave: 'Piezas armadas', valor: `${armadasLista.length} de 9 (${armadasLista.join(', ') || 'ninguna'})` },
              ...(parte === 1
                ? [{ clave: 'Sabotajes activos', valor: Object.keys(enganos).map((k) => `${k} -> ${enganos[k]}`).join(', ') || 'ninguno' }]
                : [{ clave: 'Paquetes en cola (FIFO)', valor: `${paquetes.length} de 3` }]),
            ]),
          ],
        };
      }

      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto}». Prueba \`ayuda\`.`)] };
    }
  },
};
