// ============================================================
//  FASE 4 — Núcleo Modular   ·   FUNCIONES Y PILA DE LLAMADAS
//
//  Nuestros virus ya lograron infiltrarse hasta el sistema interno del
//  robot. Ahora toca colapsar sus 3 subsistemas fisicos (Traccion,
//  Hidraulica y Enfriamiento) sobrecargando las funciones que los
//  controlan para que superen `aguanta_max` sin quemar `fusible_corte`.
//
//  LO QUE ENSEÑA:
//    1. Funciones dependientes y Pila de Llamadas (Call Stack · LIFO):
//       Una funcion de `nucleo/` llama a una de `medio/`, y esta llama
//       a una de `base/`. La llamada baja hasta el fondo y los valores
//       de retorno suben de vuelta.
//    2. Descompilacion y pruebas (`sondear`, `armar`, `probar`):
//       El codigo empieza oculto con `[ ??? ]`. Cruzando las trazas de
//       ejecucion con el manual de Datos, el equipo reconstruye (`armar`)
//       cada pieza para revelar su codigo fuente real en Pantalla.
//    3. Malas practicas de programacion en funciones dependientes:
//       Las funciones maestras de `nucleo/` tienen la firma sellada y
//       no se pueden editar. Hay que atacar sus dependencias en `medio/`
//       o `base/`, pero no cualquiera: cada cadena tiene una validacion
//       activa y una MALA PRACTICA donde una funcion confia a ciegas en
//       otra y no comprueba lo que le devuelve:
//         · En M1 (`reactor -> presion -> carga`):
//           `presion` SI comprueba el tope de lo que devuelve `carga`
//           (si carga > 12, lo bloquea). Pero `reactor` NO comprueba lo
//           que le devuelve `presion`. El hueco esta en `presion`.
//         · En M2 (`escudo -> valvula -> pulso`):
//           `escudo` SI vigila que `valvula` no altere su formula. Pero
//           `valvula` solo comprueba el parametro `n` ANTES de llamar a
//           `pulso(n)` y olvida comprobar el valor `x` que regresa de la
//           pila. El hueco esta en `pulso`.
//         · En M3 (`latido -> flujo -> freno`):
//           `latido` comprueba que `flujo(n)` cuadre con `freno(n) * 3`
//           volviendo a llamar a la misma dependencia `freno(n)`, pero
//           ni `flujo` ni `latido` comprueban el tope maximo de `freno`.
//           Al enganar a la dependencia compartida `freno`, ambos lados
//           de la comprobacion reciben el valor inflado y pasa limpio.
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

// ---------- Las 9 funciones del núcleo ----------

type Nivel = 'nucleo' | 'medio' | 'base';

type PiezaInfo = {
  id: string;
  nombre: string;
  carpeta: Nivel;
  llama: string | null;
  param: string;
  formula: string;
  evalFn: (x: number) => number;
  lineasArmada: string[];
};

export const PIEZAS: Record<string, PiezaInfo> = {
  // base/ (Nivel C · fondo de la pila, no llaman a otra funcion)
  carga: {
    id: 'F1',
    nombre: 'carga',
    carpeta: 'base',
    llama: null,
    param: 'n',
    formula: 'n * 2',
    evalFn: (n) => n * 2,
    lineasArmada: [
      'recibe n',
      'devuelve n * 2',
    ],
  },
  pulso: {
    id: 'F2',
    nombre: 'pulso',
    carpeta: 'base',
    llama: null,
    param: 'n',
    formula: 'n * 3',
    evalFn: (n) => n * 3,
    lineasArmada: [
      'recibe n',
      '// sin comprobacion de tope al salir hacia valvula',
      'devuelve n * 3',
    ],
  },
  freno: {
    id: 'F3',
    nombre: 'freno',
    carpeta: 'base',
    llama: null,
    param: 'n',
    formula: 'n - 2',
    evalFn: (n) => n - 2,
    lineasArmada: [
      'recibe n',
      'si n < 0 -> bloquear ("entrada negativa")',
      '// mala practica: comprueba negativo pero no tiene tope maximo',
      'devuelve n - 2',
    ],
  },

  // medio/ (Nivel B · funciones intermedias)
  presion: {
    id: 'F4',
    nombre: 'presion',
    carpeta: 'medio',
    llama: 'carga',
    param: 'x',
    formula: 'x + 5',
    evalFn: (x) => x + 5,
    lineasArmada: [
      'recibe n',
      'x = carga(n)',
      'si x > 12 -> bloquear ("retorno de carga supera tope 12")',
      'devuelve x + 5',
    ],
  },
  valvula: {
    id: 'F5',
    nombre: 'valvula',
    carpeta: 'medio',
    llama: 'pulso',
    param: 'x',
    formula: 'x - 3',
    evalFn: (x) => x - 3,
    lineasArmada: [
      'recibe n',
      'si n > 10 -> bloquear ("entrada n supera tope 10")',
      'x = pulso(n)',
      '// mala practica: valido n antes, pero no comprueba x al volver de pulso',
      'devuelve x - 3',
    ],
  },
  flujo: {
    id: 'F6',
    nombre: 'flujo',
    carpeta: 'medio',
    llama: 'freno',
    param: 'x',
    formula: 'x * 3',
    evalFn: (x) => x * 3,
    lineasArmada: [
      'recibe n',
      'x = freno(n)',
      '// mala practica: confia en freno(n) sin comprobar tope maximo',
      'devuelve x * 3',
    ],
  },

  // nucleo/ (Nivel A · funciones maestras con firma sellada)
  reactor: {
    id: 'F7',
    nombre: 'reactor',
    carpeta: 'nucleo',
    llama: 'presion',
    param: 'x',
    formula: 'x * 2',
    evalFn: (x) => x * 2,
    lineasArmada: [
      'recibe n',
      '[firma sellada en nucleo · no editable]',
      'x = presion(n)',
      '// mala practica: confia en presion(n) y no comprueba su retorno',
      'devuelve x * 2',
    ],
  },
  escudo: {
    id: 'F8',
    nombre: 'escudo',
    carpeta: 'nucleo',
    llama: 'valvula',
    param: 'x',
    formula: 'x + 6',
    evalFn: (x) => x + 6,
    lineasArmada: [
      'recibe n',
      '[firma sellada en nucleo · no editable]',
      'x = valvula(n)',
      'si valvula fue alterada (x != pulso(n) - 3) -> bloquear',
      'devuelve x + 6',
    ],
  },
  latido: {
    id: 'F9',
    nombre: 'latido',
    carpeta: 'nucleo',
    llama: 'flujo',
    param: 'x',
    formula: 'x - 4',
    evalFn: (x) => x - 4,
    lineasArmada: [
      'recibe n',
      '[firma sellada en nucleo · no editable]',
      'x = flujo(n)',
      'si x != freno(n) * 3 -> bloquear ("desfase entre flujo y freno")',
      'devuelve x - 4',
    ],
  },
};

const CARPETAS: Nivel[] = ['nucleo', 'medio', 'base'];

// ---------- Tolerancias por equipo (Semilla) ----------
//
// Cada equipo obtiene una combinación (d1, d2, d3) en {0, 1, 2}^3 a partir
// de `estado.semilla` para evitar que dos mesas vecinas se copien los números.
// Con semilla = 0 (por defecto en tests sin semilla), d1 = 0, d2 = 0, d3 = 0.

export type SubsistemaInfo = {
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
};

export function variantesDeSemilla(estado: Record<string, unknown>): [number, number, number] {
  const s = Math.abs(Math.trunc(numero(estado, 'semilla')));
  if (s === 0) return [0, 0, 0];
  return [s % 3, Math.floor(s / 3) % 3, Math.floor(s / 9) % 3];
}

export function subsistemasDe(estado: Record<string, unknown>): SubsistemaInfo[] {
  const [d1, d2, d3] = variantesDeSemilla(estado);

  const m1Min = 40 + d1 * 12;
  const m1Max = m1Min + 14;

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
    },
  ];
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

function coincideFormula(exprJugador: string, fnReal: (v: number) => number): boolean {
  const pruebas = [2, 3, 4, 5, 6, 7, 10];
  for (const v of pruebas) {
    const real = fnReal(v);
    const jugador = evaluarExpr(exprJugador, { n: v, x: v });
    if (jugador === null || jugador !== real) return false;
  }
  return true;
}

export type TrazaPaso = {
  pieza: string;
  nivel: Nivel;
  entrada: number;
  salida: number;
  llamaA?: string;
  esEnganada?: boolean;
  comprobacion: string;
  bloqueado?: boolean;
};

export type ResultadoCadena = {
  salida: number;
  traza: TrazaPaso[];
  bloqueado: boolean;
  bloqueadoPor?: string;
  motivoBloqueo?: string;
  error?: string;
};

function evaluarPiezaBase(
  nombre: string,
  n: number,
  enganos: Record<string, string>,
): { valor: number; esEnganada: boolean; bloqueado?: string; error?: string } {
  const pieza = PIEZAS[nombre];
  if (nombre === 'freno' && n < 0) {
    return {
      valor: NaN,
      esEnganada: false,
      bloqueado: `freno rechazo entrada negativa (n = ${n} < 0)`,
    };
  }
  if (enganos[nombre]) {
    const v = evaluarExpr(enganos[nombre], { n, x: n });
    if (v === null) return { valor: NaN, esEnganada: true, error: `Error evaluando operacion en ${nombre}` };
    return { valor: v, esEnganada: true };
  }
  return { valor: pieza.evalFn(n), esEnganada: false };
}

export function ejecutarCadena(
  nombre: string,
  entrada: number,
  enganos: Record<string, string> = {},
): ResultadoCadena {
  const pieza = PIEZAS[nombre];
  if (!pieza) {
    return { salida: NaN, traza: [], bloqueado: false, error: `Pieza «${nombre}» no existe` };
  }

  // Nivel C: base/
  if (pieza.carpeta === 'base') {
    const r = evaluarPiezaBase(nombre, entrada, enganos);
    if (r.error) return { salida: NaN, traza: [], bloqueado: false, error: r.error };
    if (r.bloqueado) {
      return {
        salida: NaN,
        bloqueado: true,
        bloqueadoPor: nombre,
        motivoBloqueo: r.bloqueado,
        traza: [
          {
            pieza: nombre,
            nivel: 'base',
            entrada,
            salida: NaN,
            esEnganada: r.esEnganada,
            comprobacion: `BLOQUEADO: ${r.bloqueado}`,
            bloqueado: true,
          },
        ],
      };
    }
    const notaBase = nombre === 'freno'
      ? `n >= 0 OK · sin comprobacion de tope maximo`
      : `sin comprobacion de salida`;
    return {
      salida: r.valor,
      bloqueado: false,
      traza: [
        {
          pieza: nombre,
          nivel: 'base',
          entrada,
          salida: r.valor,
          esEnganada: r.esEnganada,
          comprobacion: notaBase,
        },
      ],
    };
  }

  // Nivel B: medio/
  if (pieza.carpeta === 'medio') {
    //En valvula, la comprobación de n <= 10 ocurre ANTES de llamar a pulso(n)
    if (nombre === 'valvula' && entrada > 10) {
      const motivo = `valvula rechazo entrada n = ${entrada} (supera tope 10)`;
      return {
        salida: NaN,
        bloqueado: true,
        bloqueadoPor: 'valvula',
        motivoBloqueo: motivo,
        traza: [
          {
            pieza: 'valvula',
            nivel: 'medio',
            entrada,
            salida: NaN,
            llamaA: 'pulso',
            comprobacion: `BLOQUEADO: ${motivo}`,
            bloqueado: true,
          },
        ],
      };
    }

    const sub = ejecutarCadena(pieza.llama!, entrada, enganos);
    if (sub.error || sub.bloqueado) return sub;

    const x = sub.salida;

    // En presion, SI comprueba lo que devuelve carga(n): x <= 12
    if (nombre === 'presion' && (x > 12 || x < 0)) {
      const motivo = `presion rechazo el retorno de carga (recibio x = ${x}, tope maximo 12)`;
      return {
        salida: NaN,
        bloqueado: true,
        bloqueadoPor: 'presion',
        motivoBloqueo: motivo,
        traza: [
          ...sub.traza,
          {
            pieza: 'presion',
            nivel: 'medio',
            entrada: x,
            salida: NaN,
            llamaA: 'carga',
            comprobacion: `BLOQUEADO: ${motivo}`,
            bloqueado: true,
          },
        ],
      };
    }

    let salida: number;
    const esEnganada = !!enganos[nombre];
    if (esEnganada) {
      const v = evaluarExpr(enganos[nombre], { n: entrada, x });
      if (v === null) {
        return { salida: NaN, traza: [], bloqueado: false, error: `Error evaluando operacion en ${nombre}` };
      }
      salida = v;
    } else {
      salida = pieza.evalFn(x);
    }

    const notaMedio = nombre === 'presion'
      ? `comprobo retorno de carga (x = ${x} <= 12 OK)`
      : nombre === 'valvula'
        ? `comprobo n = ${entrada} <= 10 antes · NO comprobo retorno x = ${x} de pulso`
        : `NO comprobo tope de retorno x = ${x} de freno`;

    return {
      salida,
      bloqueado: false,
      traza: [
        ...sub.traza,
        {
          pieza: nombre,
          nivel: 'medio',
          entrada: x,
          salida,
          llamaA: pieza.llama!,
          esEnganada,
          comprobacion: notaMedio,
        },
      ],
    };
  }

  // Nivel A: nucleo/
  const sub = ejecutarCadena(pieza.llama!, entrada, enganos);
  if (sub.error || sub.bloqueado) return sub;

  const x = sub.salida;

  // En escudo (M2): vigila que valvula no haya sido alterada (x debe ser pulso(n) - 3)
  if (nombre === 'escudo') {
    const resPulso = evaluarPiezaBase('pulso', entrada, enganos);
    const esperadoDeValvula = resPulso.valor - 3;
    if (enganos.valvula || x !== esperadoDeValvula) {
      const motivo = `escudo detecto alteracion en valvula (devolvio ${x} en vez de pulso(${entrada}) - 3 = ${esperadoDeValvula})`;
      return {
        salida: NaN,
        bloqueado: true,
        bloqueadoPor: 'escudo',
        motivoBloqueo: motivo,
        traza: [
          ...sub.traza,
          {
            pieza: 'escudo',
            nivel: 'nucleo',
            entrada: x,
            salida: NaN,
            llamaA: 'valvula',
            comprobacion: `BLOQUEADO: ${motivo}`,
            bloqueado: true,
          },
        ],
      };
    }
  }

  // En latido (M3): comprueba que flujo(n) == freno(n) * 3 llamando a la misma dependencia freno(n)
  if (nombre === 'latido') {
    const resFreno = evaluarPiezaBase('freno', entrada, enganos);
    const esperadoDeFlujo = resFreno.valor * 3;
    if (x !== esperadoDeFlujo) {
      const motivo = `latido detecto desfase entre flujo (${x}) y freno(${entrada}) * 3 (${esperadoDeFlujo})`;
      return {
        salida: NaN,
        bloqueado: true,
        bloqueadoPor: 'latido',
        motivoBloqueo: motivo,
        traza: [
          ...sub.traza,
          {
            pieza: 'latido',
            nivel: 'nucleo',
            entrada: x,
            salida: NaN,
            llamaA: 'flujo',
            comprobacion: `BLOQUEADO: ${motivo}`,
            bloqueado: true,
          },
        ],
      };
    }
  }

  const salida = pieza.evalFn(x);
  const notaNucleo = nombre === 'reactor'
    ? `NO comprobo el retorno x = ${x} de presion`
    : nombre === 'escudo'
      ? `comprobo integridad de valvula (x = pulso(${entrada}) - 3 OK) · sin tope maximo`
      : `comprobo x == freno(${entrada}) * 3 (${x} == ${x} OK) · sin tope maximo`;

  return {
    salida,
    bloqueado: false,
    traza: [
      ...sub.traza,
      {
        pieza: nombre,
        nivel: 'nucleo',
        entrada: x,
        salida,
        llamaA: pieza.llama!,
        esEnganada: false,
        comprobacion: notaNucleo,
      },
    ],
  };
}

/** Evalúa si un subsistema colapsa con el resultado de su cadena. */
function evaluarImpactoSubsistema(s: SubsistemaInfo, res: ResultadoCadena): {
  rota: boolean;
  estado: string;
} {
  if (res.bloqueado) {
    return { rota: false, estado: `BLOQUEADO (${res.motivoBloqueo})` };
  }
  if (res.salida <= s.aguantaMax) {
    return { rota: false, estado: `AGUANTA (${res.salida} <= ${s.aguantaMax})` };
  }
  if (res.salida >= s.fusibleCorte) {
    return { rota: false, estado: `FUSIBLE QUEMADO (${res.salida} >= ${s.fusibleCorte})` };
  }
  return { rota: true, estado: `SOBRECARGA (${res.salida} entre ${s.aguantaMax} y ${s.fusibleCorte})` };
}

// ---------- Esquema Relacional para el Operador de Datos ----------

function esquemaParaDatos(estado: Record<string, unknown>) {
  const subsistemas = subsistemasDe(estado);

  return {
    tablas: [
      {
        id: 'funciones',
        nombre: 'funciones',
        x: 40, y: 30, w: 300,
        descripcion: 'Catalogo de funciones internas del robot',
        clave: 'id',
        columnas: ['id', 'funcion', 'rol_en_sistema'],
        filas: [
          ['F1', 'carga', 'impulso base de traccion'],
          ['F2', 'pulso', 'caudal base hidraulico'],
          ['F3', 'freno', 'retencion base de enfriamiento'],
          ['F4', 'presion', 'regulador intermedio de traccion'],
          ['F5', 'valvula', 'paso intermedio hidraulico'],
          ['F6', 'flujo', 'multiplicador intermedio termico'],
          ['F7', 'reactor', 'controlador maestro de traccion'],
          ['F8', 'escudo', 'controlador maestro hidraulico'],
          ['F9', 'latido', 'controlador maestro de enfriamiento'],
        ],
      },
      {
        id: 'resultados',
        nombre: 'resultados',
        x: 590, y: 30, w: 370,
        descripcion: 'Salidas observadas de cada funcion en operacion normal',
        clave: 'id',
        columnas: ['id', 'funcion_id', 'entrada_prueba', 'salida'],
        filas: [
          ['R1', 'F1', 'n = 4 (directa)', '8'],
          ['R2', 'F1', 'n = 5 (directa)', '10'],
          ['R3', 'F2', 'n = 5 (directa)', '15'],
          ['R4', 'F2', 'n = 6 (directa)', '18'],
          ['R5', 'F3', 'n = 5 (directa)', '3'],
          ['R6', 'F3', 'n = 6 (directa)', '4'],
          ['R7', 'F4', 'n = 5 (recibe x = 10)', '15'],
          ['R8', 'F4', 'n = 6 (recibe x = 12)', '17'],
          ['R9', 'F5', 'n = 5 (recibe x = 15)', '12'],
          ['R10', 'F5', 'n = 6 (recibe x = 18)', '15'],
          ['R11', 'F6', 'n = 5 (recibe x = 3)', '9'],
          ['R12', 'F6', 'n = 6 (recibe x = 4)', '12'],
          ['R13', 'F7', 'n = 5 (recibe x = 15)', '30'],
          ['R14', 'F7', 'n = 6 (recibe x = 17)', '34'],
          ['R15', 'F8', 'n = 5 (recibe x = 12)', '18'],
          ['R16', 'F8', 'n = 6 (recibe x = 15)', '21'],
          ['R17', 'F9', 'n = 5 (recibe x = 9)', '5'],
          ['R18', 'F9', 'n = 6 (recibe x = 12)', '8'],
        ],
      },
      {
        id: 'tolerancias',
        nombre: 'tolerancias',
        x: 40, y: 310, w: 500,
        descripcion: 'Limites fisicos de cada subsistema: debe superar aguanta_max sin tocar fusible_corte',
        clave: 'id',
        columnas: ['id', 'subsistema', 'funcion_id', 'entrada', 'normal', 'aguanta_max', 'fusible_corte'],
        filas: subsistemas.map((s) => [
          s.id,
          s.nombre,
          s.funcionId,
          String(s.entrada),
          String(s.normal),
          String(s.aguantaMax),
          String(s.fusibleCorte),
        ]),
      },
    ],
    relaciones: [
      { desde: 'resultados', campo: 'funcion_id', hasta: 'funciones' },
      { desde: 'tolerancias', campo: 'funcion_id', hasta: 'funciones' },
    ],
  };
}

// ---------- Circuito cerrado de cámaras (Animaciones ASCII 15×36) ----------

const CAMARAS: CamaraDef[] = [
  { n: 1, id: 'nucleo', nombre: 'SALA DEL NUCLEO', sector: 'N-01', que: 'las tres torres del nucleo y el pulso' },
  { n: 2, id: 'pila', nombre: 'PILA DE EJECUCION', sector: 'N-02', que: 'el flujo de llamadas entre niveles (LIFO)' },
];

function escenaNucleo(
  armadasCount: number,
  saboteadasCount: number,
  abierta: string | null,
  f: number,
): string[] {
  const nivelAbierto = abierta && PIEZAS[abierta] ? PIEZAS[abierta].carpeta : null;
  const colDron = nivelAbierto === 'nucleo' ? 6 : nivelAbierto === 'medio' ? 17 : nivelAbierto === 'base' ? 28 : 4 + (f * 5) % 26;

  const bobina = (i: number) => {
    if (saboteadasCount > 0 && i >= 1) return f % 2 === 0 ? '|*!*|' : '|!#!|';
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
      `  armadas: ${armadasCount}/9 · ${saboteadasCount > 0 ? 'dependencia alterada' : 'flujo original'}`,
      ANCHO_CAMARA,
    ),
  ]);
}

function escenaPila(f: number): string[] {
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
        ? '     [v] APILANDO LLAMADAS...       '
        : '     [^] RETORNANDO VALORES...      ',
      ANCHO_CAMARA,
    ),
    '                                    ',
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira('  el fondo se resuelve primero.', ANCHO_CAMARA),
  ]);
}

function vistaDeCamaras(estado: Record<string, unknown>) {
  const armadas = (estado.armadas as Record<string, boolean>) ?? {};
  const armadasCount = Object.keys(armadas).filter((k) => armadas[k]).length;
  const enganos = (estado.enganos as Record<string, string>) ?? {};
  const saboteadasCount = Object.keys(enganos).length;
  const abierta = (estado.abierta as string | null) ?? null;

  return circuitoCerrado(CAMARAS, estado, (cam) => {
    const escena: Escena = cam.id === 'nucleo'
      ? {
          fotogramas: [0, 1, 2, 3, 4, 5].map((f) =>
            escenaNucleo(armadasCount, saboteadasCount, abierta, f),
          ),
          ritmo: 300,
        }
      : {
          fotogramas: [0, 1, 2, 3, 4, 5].map((f) => escenaPila(f)),
          ritmo: 260,
        };
    const rotulos: Rotulo[] = [
      { texto: `ARMADAS ${armadasCount}/9`, tono: armadasCount === 9 ? 'ok' : 'neutro' },
      { texto: `SABOTAJES ${saboteadasCount}`, tono: saboteadasCount > 0 ? 'alerta' : 'neutro' },
    ];
    return {
      escena,
      rotulos,
      clave: `${cam.n}:${armadasCount}:${saboteadasCount}:${abierta ?? '-'}`,
    };
  });
}

// ---------- Visualizador de Documentos `.fn` para PantallaView ----------

function vistaDeCodigo(estado: Record<string, unknown>) {
  const armadas = (estado.armadas as Record<string, boolean>) ?? {};
  const enganos = (estado.enganos as Record<string, string>) ?? {};
  const abiertaRaw = (estado.abierta as string | null) ?? null;
  const abiertaKey = abiertaRaw && PIEZAS[abiertaRaw] ? abiertaRaw : null;

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

  if (!estaArmada) {
    lineas.push({ n: 1, texto: 'recibe n', cursor: false });
    if (pz.carpeta === 'nucleo') {
      lineas.push({ n: 2, texto: '[firma sellada en nucleo · no editable]', cursor: false });
      lineas.push({ n: 3, texto: 'x = [ ??? ](n)', cursor: false });
      lineas.push({ n: 4, texto: 'comprobacion: [ ??? ]', cursor: false });
      lineas.push({ n: 5, texto: 'devuelve [ ??? ]', cursor: true });
    } else if (pz.carpeta === 'medio') {
      lineas.push({ n: 2, texto: 'x = [ ??? ](n)', cursor: false });
      lineas.push({ n: 3, texto: 'comprobacion: [ ??? ]', cursor: false });
      lineas.push({ n: 4, texto: 'devuelve [ ??? ]', cursor: true });
    } else {
      lineas.push({ n: 2, texto: 'devuelve [ ??? ]', cursor: true });
    }
  } else {
    pz.lineasArmada.forEach((txt, idx) => {
      const esUltima = idx === pz.lineasArmada.length - 1;
      lineas.push({ n: idx + 1, texto: txt, cursor: esUltima && !enganada });
    });
    if (enganada) {
      lineas.push({
        n: lineas.length + 1,
        texto: `sabotaje activo -> devuelve ${enganada}`,
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

function ayuda(): ResultadoComando {
  return {
    bloques: [
      texto(
        [
          'abrir <pieza>                                — ver un archivo .fn en Pantalla',
          'sondear <pieza> <numero>                     — correr una funcion y ver su traza. Gratis',
          'armar <pieza> <operacion>                    — reconstruir una funcion de base/',
          'armar <pieza> llama <hija> luego <operacion> — reconstruir una funcion de medio/ o nucleo/',
          'enganar <pieza> <operacion>                  — alterar una dependencia ya armada',
          'probar                                       — simular el ciclo en los 3 sistemas. Gratis',
          'ejecutar                                     — lanzar el sabotaje real al nucleo. No es gratis',
          'reiniciar                                    — quitar los sabotajes (conserva lo armado)',
          'estado                                       — ver piezas armadas y sabotajes activos',
          ...AYUDA_CAMARAS,
        ],
        'Comandos disponibles',
      ),
      texto(
        [
          'El codigo del robot esta partido en tres niveles: `nucleo/` llama a `medio/`,',
          'y `medio/` llama a `base/`. Cuando se ejecuta una funcion maestra, la llamada',
          'baja por la Pila hasta el fondo y los valores de retorno suben de vuelta.',
          '',
          'Al inicio cada archivo `.fn` tiene su interior oculto con `[ ??? ]`.',
          'Cruza lo que devuelve `sondear` con las tablas de Datos para reconstruirlo',
          'usando `armar`. Al armar una pieza, Pantalla podra leer su codigo completo.',
        ],
        'Como descompilar las funciones',
      ),
      texto(
        [
          'Las 3 funciones maestras de `nucleo/` estan selladas y no se pueden editar,',
          'asi que tienes que colapsarlas enganando a las funciones de las que dependen.',
          '',
          'Algunas funciones comprueban lo que les devuelve su dependencia y bloquean',
          'cualquier valor fuera de lugar, pero otras tienen malas practicas al programar',
          'y no comprueban el retorno. Lee el codigo armado en Pantalla para descubrir',
          'donde falta la comprobacion, usa `enganar`, verifica con `probar` y confirma',
          'con Datos que las 3 salidas superen `aguanta_max` sin quemar `fusible_corte`.',
        ],
        'Condicion de victoria',
      ),
    ],
  };
}

export const nucleo: ModuloFase = {
  key: 'fase-4-nucleo',

  proyectar(role: Role, ctx) {
    switch (role) {
      case 'DATOS':
        return {
          titulo: 'Manual del nucleo · funciones y tolerancias del robot',
          nota: 'Tu tienes el catalogo de funciones, que devuelve cada una en operacion normal '
              + 'y los limites fisicos de los 3 subsistemas (`aguanta_max` y `fusible_corte`). '
              + 'No ves las carpetas ni las comprobaciones del codigo: cuando Pantalla te cante '
              + 'que salio en una prueba, tu le dices si supera `aguanta_max` sin quemar el fusible.',
          lienzo: { w: 1000, h: 520 },
          ...esquemaParaDatos(ctx.estado),
        };

      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          camaras: vistaDeCamaras(ctx.estado),
          codigo: vistaDeCodigo(ctx.estado),
          nota: 'Tu ves el nucleo por circuito cerrado, el arbol de carpetas y el archivo `.fn` '
              + 'abierto. Al armar una funcion se revela su codigo y que comprobaciones hace '
              + '(o cuales olvido hacer). Cuanto aguanta el robot y donde salta el fusible lo '
              + 'tiene Datos. Quien escribe no ve nada: cantaselo.',
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

    const armadas = { ...((ctx.estado.armadas as Record<string, boolean>) ?? {}) };
    const enganos = { ...((ctx.estado.enganos as Record<string, string>) ?? {}) };
    const subsistemas = subsistemasDe(ctx.estado);

    const mando = mandoDeCamaras(CAMARAS, verbo, arg, ctx.estado);
    if (mando) return mando;

    switch (verbo) {
      case 'ayuda':
      case 'help':
        return ayuda();

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

      case 'sondear': {
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
          const nombreMostrar = estaArmada ? paso.pieza : `${paso.pieza} [sin armar]`;
          const estadoPaso = paso.bloqueado
            ? `-> ${paso.comprobacion}`
            : `-> devuelve ${paso.salida}${paso.esEnganada ? ' (saboteada)' : ''} [${paso.comprobacion}]`;
          trazaLineas.push(`  [${paso.nivel.padEnd(6)}] ${nombreMostrar}(${paso.entrada}) ${estadoPaso}`);
        }

        return {
          estado: { ...ctx.estado, abierta: piezaNombre },
          bloques: [
            texto(
              [
                `Sondeo de ${piezaNombre}(${num})`,
                res.bloqueado
                  ? `Resultado: BLOQUEADO POR VALIDACION (${res.motivoBloqueo})`
                  : `Resultado devuelto: ${res.salida}`,
                `Profundidad de Pila: ${nivelDesc}`,
                '',
                'Traza de ejecucion en la Pila (LIFO):',
                ...trazaLineas,
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
                'Para medio/nucleo: `armar <pieza> llama <hija> luego <operacion>`.',
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
            return {
              bloques: [
                error(`«${piezaNombre}» vive en base/: nunca llama a nadie. Usa: \`armar ${piezaNombre} <operacion>\`.`),
              ],
            };
          }
          const expr = tokens.slice(1).join(' ');
          if (!expr) return { bloques: [error(`Falta la operacion para ${piezaNombre}.`)] };

          if (!coincideFormula(expr, pieza.evalFn)) {
            return {
              bloques: [
                error(`La formula «${expr}» no coincide con el comportamiento de ${piezaNombre}.`),
                texto(['Verifica con `sondear` y con la tabla `resultados` de Datos.']),
              ],
            };
          }

          armadas[piezaNombre] = true;
          return {
            estado: { ...ctx.estado, armadas, abierta: piezaNombre },
            bloques: [
              texto(
                [
                  `[OK] Codigo de ${piezaNombre}.fn reconstruido: devuelve ${pieza.formula}.`,
                  'El archivo completo y sus comprobaciones ya son visibles en Pantalla.',
                ],
                'Pieza armada',
              ),
            ],
          };
        }

        const idxLlama = tokens.indexOf('llama');
        if (idxLlama === -1 || idxLlama !== 1 || !tokens[idxLlama + 1]) {
          return {
            bloques: [
              error(`«${piezaNombre}» vive en ${pieza.carpeta}/: depende de otra funcion.`),
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

        if (!coincideFormula(expr, pieza.evalFn)) {
          return {
            bloques: [
              error(`La operacion «${expr}» no coincide con lo que hace ${piezaNombre} tras recibir el valor de ${pieza.llama}.`),
              texto(['Revisa en la tabla `resultados` de Datos que recibe y que devuelve.']),
            ],
          };
        }

        armadas[piezaNombre] = true;
        return {
          estado: { ...ctx.estado, armadas, abierta: piezaNombre },
          bloques: [
            texto(
              [
                `[OK] Codigo de ${piezaNombre}.fn reconstruido:`,
                ...pieza.lineasArmada.map((l) => `  · ${l}`),
                'Revisa en Pantalla que comprobaciones hace y cuales olvido hacer.',
              ],
              'Pieza armada',
            ),
          ],
        };
      }

      case 'enganar':
      case 'sabotear': {
        const tokens = arg.split(/\s+/).filter(Boolean);
        const piezaNombre = tokens[0]?.replace(/\.fn$/, '').toLowerCase();
        if (!piezaNombre || !(piezaNombre in PIEZAS)) {
          return { bloques: [error('Formato: `enganar <pieza> <operacion>`.')] };
        }

        const pieza = PIEZAS[piezaNombre];
        if (pieza.carpeta === 'nucleo') {
          return {
            bloques: [
              error(`No puedes modificar «${piezaNombre}»: las funciones maestras de nucleo/ tienen la firma sellada.`),
              texto(['Debes sabotear una funcion dependiente en `medio/` o `base/` cuyo retorno no sea comprobado.']),
            ],
          };
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
                `[OK] Sabotaje inyectado en ${piezaNombre}.fn: ahora devolvera «${expr}».`,
                'Usa `probar` o `sondear` para verificar si el cambio pasa las comprobaciones de la Pila y pregunta a Datos si cae en rango.',
              ],
              'Dependencia intervenida',
            ),
          ],
        };
      }

      case 'probar':
      case 'simular': {
        const filasSim = subsistemas.map((s) => {
          const res = ejecutarCadena(s.piezaA, s.entrada, enganos);
          const pasos = res.traza
            .map((p) => (p.bloqueado ? `${p.pieza}=BLOQUEO` : `${p.pieza}=${p.salida}`))
            .join(' -> ');
          const salidaTxt = res.bloqueado ? 'BLOQUEADO' : String(res.salida);
          const estadoInterno = res.bloqueado
            ? `BLOQUEADO: ${res.motivoBloqueo}`
            : 'PASO LIMPIO (sin bloqueo interno)';
          return [s.id, `${s.piezaA}(${s.entrada})`, pasos, salidaTxt, estadoInterno];
        });

        return {
          bloques: [
            tabla(
              'Simulacion de la Pila en los 3 subsistemas',
              ['id', 'llamada', 'recorrido_pila', 'salida', 'comprobaciones_internas'],
              filasSim,
            ),
            texto([
              'Compara cada `salida` que paso limpio con la tabla `tolerancias` de Datos:',
              'debe superar `aguanta_max` y quedar por debajo de `fusible_corte`.',
              'Probar es gratis. Cuando los 3 subsistemas esten listos, usa `ejecutar`.',
            ]),
          ],
        };
      }

      case 'ejecutar':
      case 'desplegar':
      case 'aplicar': {
        const sinArmar = subsistemas.filter(
          (s) => !armadas[s.piezaA] && !armadas[s.piezaB] && !armadas[s.piezaC],
        );
        if (sinArmar.length > 0) {
          return {
            bloques: [
              error(`Falta mapear funciones en ${sinArmar.length} de las 3 cadenas del robot.`),
              texto(['Debes armar al menos una funcion en cada una de las 3 cadenas antes de ejecutar el ataque.']),
            ],
          };
        }

        const evaluaciones = subsistemas.map((s) => {
          const res = ejecutarCadena(s.piezaA, s.entrada, enganos);
          const imp = evaluarImpactoSubsistema(s, res);
          return { s, res, rota: imp.rota, estado: imp.estado };
        });

        const rotasCount = evaluaciones.filter((e) => e.rota).length;

        if (rotasCount === subsistemas.length) {
          return {
            resuelto: true,
            bloques: [
              tabla(
                'Colapso de los 3 subsistemas del nucleo',
                ['id', 'subsistema', 'llamada', 'salida_final', 'diagnostico'],
                evaluaciones.map((e) => [
                  e.s.id,
                  e.s.nombre,
                  `${e.s.piezaA}(${e.s.entrada})`,
                  String(e.res.salida),
                  e.estado,
                ]),
              ),
              exito('NUCLEO SABOTEADO · Los 3 subsistemas del robot han colapsado', [
                'Habeis explotado las malas practicas de programacion en las funciones dependientes:',
                '  · En M1: `presion` comprobaba a `carga`, pero `reactor` no comprobaba a `presion`.',
                '  · En M2: `escudo` vigilaba a `valvula`, pero `valvula` validaba antes de llamar a `pulso` y no comprobaba su retorno.',
                '  · En M3: `latido` verificaba a `flujo` llamando a la misma dependencia `freno` sin comprobar su tope maximo.',
                '',
                'Una funcion es tan segura como las comprobaciones que hace sobre lo que le devuelven sus dependencias.',
              ]),
            ],
          };
        }

        const detalleFallo = rechazo(
          ctx,
          `Solo ${rotasCount} de los 3 subsistemas colapsaron. Revisa en Pantalla si una validacion interna bloqueo el cambio y verifica con Datos los limites aguanta_max y fusible_corte.`,
          { armadas, enganos },
        );

        return {
          ...detalleFallo,
          bloques: [
            tabla(
              'Resultado de la ejecucion en el nucleo',
              ['id', 'llamada', 'salida', 'diagnostico'],
              evaluaciones.map((e) => [
                e.s.id,
                `${e.s.piezaA}(${e.s.entrada})`,
                e.res.bloqueado ? 'BLOQUEADO' : String(e.res.salida),
                e.estado,
              ]),
            ),
            ...detalleFallo.bloques,
          ],
        };
      }

      case 'reiniciar':
      case 'reset': {
        const fallos = numero(ctx.estado, 'fallos');
        const cuarentenaHasta = ctx.estado.cuarentenaHasta;
        const semilla = numero(ctx.estado, 'semilla');

        return {
          estado: { semilla, armadas, enganos: {}, abierta: null, fallos, cuarentenaHasta },
          bloques: [
            texto(
              [
                'Sabotajes limpiados. Las funciones que ya habiais armado se conservan.',
                'Los intentos fallidos y la cuarentena siguen vigentes.',
              ],
              'Reinicio de sabotajes',
            ),
          ],
        };
      }

      case 'estado':
      case 'donde': {
        const armadasLista = Object.keys(armadas).filter((k) => armadas[k]);
        return {
          bloques: [
            lista('Estado del nucleo', [
              { clave: 'Piezas armadas', valor: `${armadasLista.length} de 9 (${armadasLista.join(', ') || 'ninguna'})` },
              {
                clave: 'Sabotajes activos',
                valor: Object.keys(enganos).map((k) => `${k} -> ${enganos[k]}`).join(', ') || 'ninguno',
              },
            ]),
          ],
        };
      }

      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto}». Prueba \`ayuda\`.`)] };
    }
  },
};
