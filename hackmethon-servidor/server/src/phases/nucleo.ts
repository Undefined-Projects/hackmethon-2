// ============================================================
//  FASE 4 — Núcleo Modular   ·   FUNCIONES
//
//  El código del enemigo está partido en piezas que se llaman entre sí.
//  Una está rota y, como las demás la usan, todo lo que pasa por ella
//  sale mal. Hay que encontrarla, ANDAR HASTA ELLA y arreglarla una vez.
//
//  EL REPARTO, que en esta fase no es «uno ve y otro escribe»:
//
//    PANTALLA  el arbol de carpetas y el codigo de la pieza abierta, con
//              el cursor marcado. Lee el codigo en voz alta. No sabe que
//              deberia dar ninguna cuenta.
//    TERMINAL  la consola Y un navegador que le dice DONDE esta —ruta,
//              linea, pila de llamadas y que movimientos tiene— pero
//              nunca QUE pone ahi. Camina a ciegas por un codigo que lee
//              otro.
//    DATOS     el manual: que deberia devolver cada caso, cuanto pesa
//              cada nodo y que piezas se tocaron ultimamente. No ve ni
//              una linea de codigo ni un resultado.
//
//  Moverse ES el grafo de llamadas. `entrar` en una linea que llama a
//  otra pieza te mete DENTRO de esa pieza y `volver` te saca: la pila
//  del navegador es la pila de llamadas, recorrida con los pies. Y
//  `corregir` actua sobre donde estas, no sobre un nombre que teclees,
//  porque una funcion vive en UN sitio y hay que ir hasta el.
// ============================================================

import type { Role } from '../lib/constants.js';
import type { ContextoComando, ModuloFase, ResultadoComando } from './types.js';
import {
  ANCHO_CAMARA, AYUDA_CAMARAS, circuitoCerrado, lienzo, mandoDeCamaras, tira,
  type CamaraDef, type Escena, type Rotulo,
} from './comun.js';
import {
  cuarentenaActiva, error, exito, normalizar, numero, rechazo, tabla, texto,
} from './comun.js';

// ---------- El núcleo, como archivos ----------

type Linea = {
  texto: string;
  /** La pieza a la que llama esta línea. Es lo que habilita `entrar`. */
  llama?: string;
  /** true → es el cuerpo corregible de una hoja. */
  cuerpo?: boolean;
};

type Pieza = {
  carpeta: string;
  /** Las hojas reciben parámetros y tienen una cuenta que se puede tocar. */
  params?: string[];
  lineas: Linea[];
};

/**
 * Las tres hojas están rotas, y ninguna se adivina: cada una se DEDUCE
 * de un renglón del contrato que tiene Datos, y en cadena.
 *
 *   prioridad(NODO-A) debe dar 12  y es escalar(peso(A), 3) = escalar(4, 3)
 *      -> escalar tiene que multiplicar
 *   orden(NODO-A) debe dar 24      y es doblar(prioridad(A)) = doblar(12)
 *      -> doblar tiene que duplicar
 *   riesgo(NODO-A) debe dar 23     y es margen(orden(A)) = margen(24)
 *      -> margen tiene que restar uno
 *
 * Cada peldaño necesita el anterior, y por eso los casos se ponen en
 * verde de uno en uno y en orden: el equipo ve la escalera subir.
 */
const HOJAS_ORIGINALES: Record<string, string> = {
  escalar: 'v + f', // debe ser v * f
  doblar: 'n + 2',  // debe ser n * 2
  margen: 'n - 2',  // debe ser n - 1
};

// Una llamada por línea, a propósito: si una línea llamara a dos piezas,
// `entrar` tendría que preguntar a cuál, y el movimiento dejaría de ser
// evidente.
const PIEZAS: Record<string, Pieza> = {
  peso: {
    carpeta: 'base',
    lineas: [{ texto: 'recibe nodo' }, { texto: 'devuelve lo que diga la tabla de pesos' }],
  },
  escalar: {
    carpeta: 'base', params: ['v', 'f'],
    lineas: [{ texto: 'recibe v, f' }, { texto: 'devuelve', cuerpo: true }],
  },
  doblar: {
    carpeta: 'base', params: ['n'],
    lineas: [{ texto: 'recibe n' }, { texto: 'devuelve', cuerpo: true }],
  },
  margen: {
    carpeta: 'base', params: ['n'],
    lineas: [{ texto: 'recibe n' }, { texto: 'devuelve', cuerpo: true }],
  },
  prioridad: {
    carpeta: 'cadena',
    lineas: [
      { texto: 'recibe nodo' },
      { texto: 'p = peso(nodo)', llama: 'peso' },
      { texto: 'devuelve escalar(p, 3)', llama: 'escalar' },
    ],
  },
  orden: {
    carpeta: 'cadena',
    lineas: [
      { texto: 'recibe nodo' },
      { texto: 'p = prioridad(nodo)', llama: 'prioridad' },
      { texto: 'devuelve doblar(p)', llama: 'doblar' },
    ],
  },
  riesgo: {
    carpeta: 'cadena',
    lineas: [
      { texto: 'recibe nodo' },
      { texto: 'o = orden(nodo)', llama: 'orden' },
      { texto: 'devuelve margen(o)', llama: 'margen' },
    ],
  },
  lote: {
    carpeta: 'cadena',
    lineas: [
      { texto: 'a = riesgo(NODO-A)', llama: 'riesgo' },
      { texto: 'b = riesgo(NODO-B)', llama: 'riesgo' },
      { texto: 'c = riesgo(NODO-C)', llama: 'riesgo' },
      { texto: 'devuelve a + b + c' },
    ],
  },
  simple: {
    carpeta: 'suelto',
    lineas: [
      { texto: 'recibe n' },
      { texto: 'm = margen(n)', llama: 'margen' },
      { texto: 'devuelve doblar(m)', llama: 'doblar' },
    ],
  },
};

const CARPETAS = ['base', 'cadena', 'suelto'];
const ruta = (pieza: string) => `nucleo/${PIEZAS[pieza].carpeta}/${pieza}.fn`;

/** El texto de una línea tal y como está AHORA: el cuerpo de una hoja
 *  cambia cuando se corrige, y el árbol tiene que enseñarlo cambiado. */
function pintarLinea(pieza: string, i: number, hojas: Record<string, string>): string {
  const l = PIEZAS[pieza].lineas[i];
  return l.cuerpo ? `${l.texto} ${hojas[pieza]}` : l.texto;
}

const PESOS: Record<string, number> = { 'nodo-a': 4, 'nodo-b': 6, 'nodo-c': 9 };

// ---------- La mitad del Operador de Datos: el manual ----------
//
// Ni una línea de código. Lo que debería dar cada cosa, cuánto pesa cada
// nodo, y qué se tocó últimamente. Sin esto, Pantalla lee el código
// entero y no puede decir si está bien.
const ESQUEMA = {
  tablas: [
    {
      id: 'contrato',
      nombre: 'contrato',
      x: 40, y: 30, w: 420,
      descripcion: 'Lo que cada caso DEBERIA devolver',
      clave: 'id',
      columnas: ['id', 'caso', 'debe dar'],
      filas: [
        ['C1', 'prioridad(NODO-A)', '12'],
        ['C2', 'orden(NODO-A)', '24'],
        ['C3', 'riesgo(NODO-A)', '23'],
        ['C4', 'lote()', '111'],
        ['C5', 'simple(10)', '18'],
      ],
    },
    {
      id: 'pesos',
      nombre: 'pesos',
      x: 560, y: 30, w: 300,
      descripcion: 'Lo que vale cada nodo',
      clave: 'id',
      columnas: ['id', 'nodo', 'peso'],
      filas: [['W1', 'NODO-A', '4'], ['W2', 'NODO-B', '6'], ['W3', 'NODO-C', '9']],
    },
    {
      // Dice QUE piezas se tocaron, nunca que deberian hacer. Saber donde
      // mirar no es saber que poner: eso sale del contrato, y en cadena.
      id: 'revisiones',
      nombre: 'revisiones',
      x: 40, y: 300, w: 560,
      descripcion: 'Piezas tocadas esa noche',
      clave: 'id',
      columnas: ['id', 'pieza', 'fecha', 'quien'],
      filas: [
        ['R1', 'escalar', '12 mar 03:14', '— cuenta no identificada —'],
        ['R2', 'doblar', '12 mar 03:14', '— cuenta no identificada —'],
        ['R3', 'margen', '12 mar 03:14', '— cuenta no identificada —'],
        // Tocada tambien, pero no hace ninguna cuenta: no hay nada que
        // arreglar ahi dentro, y descubrirlo es parte de la leccion.
        ['R4', 'lote', '12 mar 03:14', '— cuenta no identificada —'],
      ],
    },
  ],
  relaciones: [],
} as const;

// ---------- Los casos ----------

type Caso = { id: string; llamada: string; esperado: number };

// Los tres primeros son el mismo nodo a tres profundidades: eso es lo que
// convierte el contrato en una escalera en vez de en cinco pistas sueltas.
const CASOS: Caso[] = [
  { id: 'C1', llamada: 'prioridad NODO-A', esperado: 12 },
  { id: 'C2', llamada: 'orden NODO-A', esperado: 24 },
  { id: 'C3', llamada: 'riesgo NODO-A', esperado: 23 },
  { id: 'C4', llamada: 'lote', esperado: 111 },
  { id: 'C5', llamada: 'simple 10', esperado: 18 },
];

// ---------- El intérprete ----------

/** Evalúa el cuerpo de una hoja: `a op b`, o un solo término. Nada más:
 *  se corrige una cuenta, no se programa un lenguaje. */
function evaluar(cuerpo: string, vars: Record<string, number>): number | null {
  const t = cuerpo.trim().split(/\s+/);
  const leer = (x: string): number | null => {
    if (x in vars) return vars[x];
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  };
  if (t.length === 1) return leer(t[0]);
  if (t.length !== 3) return null;
  const a = leer(t[0]);
  const b = leer(t[2]);
  if (a === null || b === null) return null;
  switch (t[1]) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? null : Math.trunc(a / b);
    default: return null;
  }
}

type Paso = { profundidad: number; texto: string; valor: number };

function correr(llamada: string, hojas: Record<string, string>): { valor: number | null; traza: Paso[] } {
  const traza: Paso[] = [];
  const hoja = (nombre: string, args: number[], prof: number): number | null => {
    const vars: Record<string, number> = {};
    (PIEZAS[nombre].params ?? []).forEach((p, i) => (vars[p] = args[i]));
    const v = evaluar(hojas[nombre] ?? '', vars);
    traza.push({ profundidad: prof, texto: `${nombre}(${args.join(', ')})`, valor: v ?? NaN });
    return v;
  };
  const envolver = (nombre: string, arg: string, valor: number | null, prof: number) => {
    traza.push({ profundidad: prof, texto: `${nombre}(${arg.toUpperCase()})`, valor: valor ?? NaN });
    return valor;
  };
  const peso = (nodo: string, prof: number): number | null => {
    const v = PESOS[nodo] ?? null;
    if (v !== null) traza.push({ profundidad: prof, texto: `peso(${nodo.toUpperCase()})`, valor: v });
    return v;
  };
  const prioridad = (nodo: string, prof: number) => {
    const p = peso(nodo, prof + 1);
    return p === null ? null : envolver('prioridad', nodo, hoja('escalar', [p, 3], prof + 1), prof);
  };
  const orden = (nodo: string, prof: number) => {
    const p = prioridad(nodo, prof + 1);
    return p === null ? null : envolver('orden', nodo, hoja('doblar', [p], prof + 1), prof);
  };
  const riesgo = (nodo: string, prof: number) => {
    const o = orden(nodo, prof + 1);
    return o === null ? null : envolver('riesgo', nodo, hoja('margen', [o], prof + 1), prof);
  };

  const [fn, crudo] = llamada.split(' ');
  const arg = (crudo ?? '').toLowerCase();
  switch (fn) {
    case 'prioridad': return { valor: prioridad(arg, 0), traza };
    case 'orden': return { valor: orden(arg, 0), traza };
    case 'riesgo': return { valor: riesgo(arg, 0), traza };
    case 'simple': {
      const m = hoja('margen', [Number(arg)], 1);
      const v = m === null ? null : hoja('doblar', [m], 1);
      traza.push({ profundidad: 0, texto: `simple(${arg})`, valor: v ?? NaN });
      return { valor: v, traza };
    }
    case 'lote': {
      let suma = 0;
      for (const nodo of ['nodo-a', 'nodo-b', 'nodo-c']) {
        const r = riesgo(nodo, 1);
        if (r === null) return { valor: null, traza };
        suma += r;
      }
      traza.push({ profundidad: 0, texto: 'lote()', valor: suma });
      return { valor: suma, traza };
    }
    default: return { valor: null, traza };
  }
}

// ---------- El circuito cerrado del nucleo ----------
//
//  Dos camaras de la sala de maquinas. Lo que NO enseñan es si una pieza
//  esta bien: los numeros que debe dar cada caso los tiene Datos, y una
//  camara que pintara de verde el modulo correcto le quitaria el trabajo
//  al manual. Enseñan lo otro: cual se ha tocado y por donde anda quien
//  escribe, que es justo lo que Terminal no puede ver de si mismo.

const CAMARAS: CamaraDef[] = [
  { n: 1, id: 'nucleo', nombre: 'SALA DEL NUCLEO', sector: 'N-01', que: 'los tres modulos y por donde anda el operario' },
  { n: 2, id: 'banco', nombre: 'BANCO DE PRUEBAS', sector: 'N-02', que: 'los cinco casos corriendo en bucle' },
];

/** Las tres piezas rotas, en el orden en que estan en la sala. */
const MODULOS = Object.keys(HOJAS_ORIGINALES);

/** El centro de la bahia `i`, en columnas. Las bahias miden 7 y van
 *  separadas por 2, empezando en la 3. */
const columnaDe = (pieza: string | null) => {
  const i = pieza ? MODULOS.indexOf(pieza) : -1;
  return i < 0 ? 4 : 3 + i * 9 + 3;
};
const enColumna = (ch: string, col: number) =>
  tira(' '.repeat(Math.max(0, col)) + ch, ANCHO_CAMARA);

function escenaNucleo(tocadas: Set<string>, abierta: string | null, f: number): string[] {
  const bahia = (i: number) => {
    const nombre = MODULOS[i];
    if (!nombre) return '       ';
    const intervenida = tocadas.has(nombre);
    // Sin tocar chisporrotea; intervenida corre seguida. Eso NO dice si
    // esta bien: dice si alguien ha metido la mano.
    const dentro = intervenida ? '=====' : (f % 2 === 0 ? '/\\/\\/' : '\\/\\/\\');
    return `|${dentro}|`;
  };
  const pie = (i: number) => tira(MODULOS[i] ?? '', 7);
  const aguja = (i: number) => (MODULOS[i] === abierta ? '   ^   ' : '       ');
  const fila = (pinta: (i: number) => string) =>
    tira('   ' + [0, 1, 2].map(pinta).join('  '), ANCHO_CAMARA);

  return lienzo([
    '                                    ',
    fila(() => '.-----.'),
    fila(bahia),
    fila(bahia),
    fila(() => "'-----'"),
    fila(pie),
    '                                    ',
    fila(aguja),
    // El operario se planta DEBAJO de la bahia abierta. Dibujarlo siempre
    // en el mismo sitio y poner la flecha aparte era pedirle a Pantalla
    // que cruzara dos cosas que ya estan en la misma imagen.
    enColumna('o', columnaDe(abierta)),
    enColumna('/|\\', columnaDe(abierta) - 1),
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira(abierta
      ? `  el operario esta en ${abierta}.`
      : '  el operario no ha abierto nada.', ANCHO_CAMARA),
  ]);
}

function escenaBanco(fallos: number, f: number): string[] {
  // Cinco casos dando vueltas. La luz que corre es el caso que se esta
  // evaluando: no dice si sale bien, solo que la maquina sigue viva.
  const luz = (i: number) => (i === f % 5 ? '(*)' : '( )');
  return lienzo([
    '        [ BANCO DE PRUEBAS ]        ',
    '                                    ',
    tira('   ' + [0, 1, 2, 3, 4].map(luz).join(' '), ANCHO_CAMARA),
    tira('    C1  C2  C3  C4  C5', ANCHO_CAMARA),
    '                                    ',
    '  .------------------------------.  ',
    tira('  | el nucleo no despliega.      |', ANCHO_CAMARA),
    tira(`  | intentos fallidos: ${String(fallos).padStart(2, '0')}        |`, ANCHO_CAMARA),
    '  \'------------------------------\'  ',
    '                                    ',
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira('  que deben dar: eso lo tiene Datos.', ANCHO_CAMARA),
  ]);
}

function vistaDeCamaras(estado: Record<string, unknown>) {
  const hojas = hojasDe(estado);
  const tocadas = new Set(MODULOS.filter((k) => hojas[k] !== HOJAS_ORIGINALES[k]));
  const abierta = aqui(pilaDe(estado))?.pieza ?? null;
  const fallos = numero(estado, 'fallos');

  return circuitoCerrado(CAMARAS, estado, (cam) => {
    const escena: Escena = cam.id === 'nucleo'
      ? { fotogramas: [0, 1].map((f) => escenaNucleo(tocadas, abierta, f)), ritmo: 380 }
      : { fotogramas: [0, 1, 2, 3, 4].map((f) => escenaBanco(fallos, f)), ritmo: 260 };
    const rotulos: Rotulo[] = [
      { texto: `INTERVENIDOS ${tocadas.size}/${MODULOS.length}`, tono: 'neutro' },
    ];
    if (cam.id === 'nucleo' && abierta) rotulos.push({ texto: `ABIERTA ${abierta.toUpperCase()}`, tono: 'neutro' });
    if (fallos > 0) rotulos.push({ texto: `${fallos} DESPLIEGUE(S) FALLIDO(S)`, tono: 'alerta' });
    return { escena, rotulos, clave: `${cam.n}:${[...tocadas].sort().join(',')}:${abierta ?? '-'}:${fallos}` };
  });
}

// ---------- Estado: dónde está el cursor ----------

type Marco = { pieza: string; linea: number };

const hojasDe = (estado: Record<string, unknown>): Record<string, string> => ({
  ...HOJAS_ORIGINALES,
  ...((estado.hojas as Record<string, string>) ?? {}),
});

const pilaDe = (estado: Record<string, unknown>): Marco[] =>
  Array.isArray(estado.pila) ? (estado.pila as Marco[]) : [];

const aqui = (pila: Marco[]): Marco | null => pila[pila.length - 1] ?? null;

/** Qué se puede hacer desde donde estás. Cambia con cada paso, y ESE es
 *  el hilo que Terminal sigue sin ver una sola línea. */
function movimientos(pila: Marco[]): string[] {
  const m = aqui(pila);
  if (!m) return ['abrir'];
  const pieza = PIEZAS[m.pieza];
  const linea = pieza.lineas[m.linea];
  const ms: string[] = [];
  if (m.linea > 0) ms.push('subir');
  if (m.linea < pieza.lineas.length - 1) ms.push('bajar');
  if (linea.llama) ms.push('entrar');
  if (linea.cuerpo) ms.push('corregir');
  if (pila.length > 1) ms.push('volver');
  ms.push('abrir');
  return ms;
}

const resultados = (hojas: Record<string, string>) =>
  CASOS.map((c) => {
    const { valor } = correr(c.llamada, hojas);
    return { ...c, obtenido: valor, ok: valor === c.esperado };
  });

/** Lo que Pantalla pinta: el árbol y, si hay algo abierto, su código. */
function vistaDeCodigo(estado: Record<string, unknown>) {
  const hojas = hojasDe(estado);
  const pila = pilaDe(estado);
  const m = aqui(pila);

  return {
    raiz: 'nucleo/',
    carpetas: CARPETAS.map((c) => ({
      nombre: c,
      piezas: Object.keys(PIEZAS)
        .filter((p) => PIEZAS[p].carpeta === c)
        .map((p) => ({ nombre: `${p}.fn`, abierta: m?.pieza === p })),
    })),
    abierta: m
      ? {
          ruta: ruta(m.pieza),
          lineas: PIEZAS[m.pieza].lineas.map((_, i) => ({
            n: i + 1,
            texto: pintarLinea(m.pieza, i, hojas),
            cursor: i === m.linea,
          })),
        }
      : null,
    pila: pila.map((f) => f.pieza),
  };
}

function ayuda(): ResultadoComando {
  return {
    bloques: [
      texto(
        [
          'abrir <pieza>      — abrir un archivo y ponerse en su primera linea',
          'subir / bajar      — mover el cursor por las lineas',
          'entrar             — si la linea llama a otra pieza, meterse dentro',
          'volver             — salir de donde entraste',
          'corregir <cuenta>  — cambiar la cuenta de la linea donde ESTAS',
          'probar             — pasar los casos. Gratis',
          'traza <caso>       — con que valores pasa por cada pieza',
          'reiniciar          — devolver todas las piezas a como estaban',
          'desplegar          — meterlo en el nucleo. Esto no es gratis',
          ...AYUDA_CAMARAS,
        ],
        'Comandos disponibles',
      ),
      texto(
        [
          'Tu navegador te dice DONDE estas y que movimientos tienes, nunca QUE',
          'pone ahi. El codigo lo ve Pantalla: que te lo lea.',
          '',
          'Los movimientos cambian segun donde estes. Si en tu linea aparece',
          '`entrar`, es que esa linea llama a otra pieza y puedes meterte dentro.',
          'Si aparece `corregir`, es que esa linea hace una cuenta y se puede tocar.',
          '',
          '`corregir` actua sobre la linea en la que estas, no sobre un nombre:',
          'hay que ANDAR hasta la pieza rota. Una funcion vive en un solo sitio.',
        ],
        'Como se anda por el codigo',
      ),
      texto(
        [
          'Lo que deberia devolver cada caso no esta aqui ni en el codigo: esta',
          'en el manual, en la base de datos. Pantalla ve lo que el codigo HACE;',
          'Datos sabe lo que DEBERIA hacer. La pieza rota solo aparece cruzando',
          'las dos cosas.',
        ],
        'Lo que esta terminal NO sabe',
      ),
    ],
  };
}

export const nucleo: ModuloFase = {
  key: 'fase-4-nucleo',

  proyectar(role: Role, ctx) {
    const hojas = hojasDe(ctx.estado);
    const pila = pilaDe(ctx.estado);
    const m = aqui(pila);

    switch (role) {
      case 'DATOS':
        return {
          titulo: 'Manual del nucleo · lo que deberia hacer',
          nota: 'Tu tienes el manual: que deberia devolver cada caso y cuanto pesa cada '
              + 'nodo. No veras ni una linea de codigo. Pantalla ve el codigo y no sabe si '
              + 'esta bien: la pieza rota solo aparece cruzando las dos cosas.',
          lienzo: { w: 900, h: 480 },
          ...ESQUEMA,
        };

      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          codigo: vistaDeCodigo(ctx.estado),
          camaras: vistaDeCamaras(ctx.estado),
          nota: 'Tu ves la sala del nucleo, el arbol y el codigo de la pieza abierta, con el '
              + 'cursor de tu companero marcado. El no ve ni una linea: leesela. Lo que '
              + 'deberia dar cada caso lo tiene Datos.',
        };

      case 'TERMINAL':
        return {
          camara: numero(ctx.estado, 'camara') || 1,
          pista: 'Escribe `ayuda` y pregunta a Pantalla que aparecio.',
          navegador: {
            ruta: m ? ruta(m.pieza) : null,
            linea: m ? m.linea + 1 : null,
            total: m ? PIEZAS[m.pieza].lineas.length : null,
            pila: pila.map((f) => f.pieza),
            movimientos: movimientos(pila),
          },
          casos: resultados(hojas).filter((r) => r.ok).length,
          total: CASOS.length,
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
    const hojas = hojasDe(ctx.estado);
    const pila = pilaDe(ctx.estado);
    const m = aqui(pila);

    /**
     * Un movimiento deja UNA línea en la Pantalla, no un parte entero.
     *
     * La posición detallada —ruta, línea, pila, movimientos— ya la tiene
     * Terminal en su navegador, y Pantalla la tiene mejor todavía: el
     * archivo abierto y el cursor marcado en el árbol. Volcarla también
     * aquí llenaba la Pantalla de un parte que nadie lee y empujaba
     * hacia abajo lo único que hay que leer en voz alta, que es el
     * código. `estado` sí lo cuenta entero, porque para eso se pide.
     */
    const situar = (nueva: Marco[], linea: string): ResultadoComando => {
      const f = aqui(nueva)!;
      return {
        estado: { ...ctx.estado, pila: nueva },
        bloques: [texto([`${linea}  ·  linea ${f.linea + 1} de ${PIEZAS[f.pieza].lineas.length}`])],
      };
    };
    const sinAbrir = () => ({ bloques: [error('No hay ningun archivo abierto. `abrir <pieza>` primero.')] });

    // El circuito cerrado se atiende antes del switch: es el mismo mando
    // en todas las fases que tienen camaras.
    const mando = mandoDeCamaras(CAMARAS, verbo, arg, ctx.estado);
    if (mando) return mando;

    switch (verbo) {
      case 'ayuda':
      case 'help':
        return ayuda();

      case 'abrir': {
        if (!arg) return { bloques: [error('Falta la pieza. `abrir <pieza>`. Los nombres los ve Pantalla en el arbol.')] };
        const pieza = arg.replace(/\.fn$/, '');
        if (!(pieza in PIEZAS)) {
          return { bloques: [error(`No hay ninguna pieza que se llame «${arg}». Pideselos a Pantalla, que ve el arbol.`)] };
        }
        return situar([{ pieza, linea: 0 }], `Abierto ${pieza}.fn`);
      }

      case 'bajar':
      case 'subir': {
        if (!m) return sinAbrir();
        const paso = verbo === 'bajar' ? 1 : -1;
        const destino = m.linea + paso;
        if (destino < 0 || destino >= PIEZAS[m.pieza].lineas.length) {
          return { bloques: [error(`No se puede ${verbo} mas: ya estas en el ${paso > 0 ? 'final' : 'principio'} del archivo.`)] };
        }
        return situar(
          [...pila.slice(0, -1), { ...m, linea: destino }],
          `${verbo === 'bajar' ? 'Abajo' : 'Arriba'} en ${m.pieza}.fn`,
        );
      }

      case 'entrar': {
        if (!m) return sinAbrir();
        const llama = PIEZAS[m.pieza].lineas[m.linea].llama;
        if (!llama) {
          return {
            bloques: [error('Esta linea no llama a ninguna otra pieza, asi que no hay donde entrar.'),
                      texto(['Pregunta a Pantalla que pone en tu linea: si no hay un nombre con parentesis, no hay llamada.'])],
          };
        }
        // Aquí está la lección: una llamada te lleva DENTRO de otra pieza,
        // y lo que dejas atrás te espera para cuando vuelvas.
        return situar(
          [...pila, { pieza: llama, linea: 0 }],
          `${m.pieza}.fn linea ${m.linea + 1} llama a ${llama}.fn — has entrado`,
        );
      }

      case 'volver': {
        if (!m) return sinAbrir();
        if (pila.length === 1) {
          return { bloques: [error('No has entrado en nada: no hay de donde volver. `abrir` otra pieza si quieres cambiar.')] };
        }
        const nueva = pila.slice(0, -1);
        return situar(nueva, `Has salido de ${m.pieza}.fn y vuelto a ${aqui(nueva)!.pieza}.fn`);
      }

      case 'donde':
      case 'estado': {
        if (!m) {
          return { bloques: [texto(['Nada abierto todavia. `abrir <pieza>` para empezar a andar.'], 'Estado')] };
        }
        const rs = resultados(hojas);
        return {
          bloques: [
            texto(
              [
                `estas en: ${ruta(m.pieza)}`,
                `linea ${m.linea + 1} de ${PIEZAS[m.pieza].lineas.length}`,
                pila.length > 1 ? `pila: ${pila.map((x) => x.pieza).join(' > ')}` : 'pila: (raiz)',
                `movimientos: ${movimientos(pila).join(', ')}`,
              ],
              'Estado',
            ),
            texto([`Casos que salen: ${rs.filter((r) => r.ok).length} de ${rs.length}.`]),
          ],
        };
      }

      case 'probar':
      case 'casos': {
        const rs = resultados(hojas);
        const mal = rs.filter((r) => !r.ok);
        return {
          bloques: [
            tabla('Casos del nucleo', ['caso', 'llamada', 'da'],
              rs.map((r) => [r.id, r.llamada, r.obtenido === null ? '—' : String(r.obtenido)])),
            texto(
              mal.length === 0
                ? ['Preguntad a Datos si esos son los numeros del manual. Si lo son, `desplegar`.']
                : [
                    'Lo que deberia dar cada uno esta en el manual, que tiene Datos.',
                    'Comparadlos: el que coincida exonera a las piezas por las que pasa.',
                  ],
            ),
          ],
        };
      }

      case 'traza': {
        const caso = CASOS.find((c) => c.id === arg.toUpperCase() || normalizar(c.llamada) === arg);
        if (!caso) {
          return { bloques: [error(`«${arg}» no es un caso. Son: ${CASOS.map((c) => c.id).join(', ')}.`)] };
        }
        const { valor, traza } = correr(caso.llamada, hojas);
        return {
          bloques: [
            tabla(
              `Traza de ${caso.id} · ${caso.llamada}`,
              ['paso', 'da'],
              traza.map((p) => [`${'  '.repeat(p.profundidad)}${p.texto}`, String(p.valor)]),
            ),
            texto([`Resultado: ${valor}.`, 'Cada linea es una pieza llamando a otra. La de mas adentro corre primero.']),
          ],
        };
      }

      case 'corregir': {
        if (!m) return sinAbrir();
        const linea = PIEZAS[m.pieza].lineas[m.linea];
        if (!linea.cuerpo) {
          // Ni gruñe ni penaliza: esto es andar, y andar mal es gratis.
          return {
            bloques: [
              error('En esta linea no hay ninguna cuenta que corregir.'),
              texto([
                'Solo se pueden tocar las lineas que HACEN una cuenta. Las que solo',
                'llaman a otra pieza no tienen nada propio que arreglar: hay que',
                '`entrar` y corregirlo donde de verdad vive.',
              ]),
            ],
          };
        }
        if (!arg) return { bloques: [error(`Falta la cuenta nueva. Se escribe con espacios: \`${(PIEZAS[m.pieza].params ?? []).join(' ')}\` y numeros, con + - * /.`)] };

        const prueba = evaluar(arg, Object.fromEntries((PIEZAS[m.pieza].params ?? []).map((p) => [p, 1])));
        if (prueba === null) {
          return {
            bloques: [error(
              `No entiendo «${arg}». Se escribe `
              + `\`${(PIEZAS[m.pieza].params ?? []).join(' ')}\` y numeros, con + - * / y espacios alrededor.`,
            )],
          };
        }

        const nuevas = { ...((ctx.estado.hojas as Record<string, string>) ?? {}), [m.pieza]: arg };
        return {
          estado: { ...ctx.estado, hojas: nuevas },
          bloques: [
            texto([`${ruta(m.pieza)} · linea ${m.linea + 1}`, `ahora devuelve: ${arg}`], 'Linea corregida'),
            texto(['Nada se ha aplicado todavia. `probar` pasa los casos otra vez.']),
          ],
        };
      }

      case 'reiniciar':
      case 'reset': {
        const tocadas = Object.keys((ctx.estado.hojas as Record<string, string>) ?? {});
        // Devuelve las piezas a como estaban y suelta el cursor, pero NO
        // borra los enlaces indebidos ni levanta la cuarentena: si
        // reiniciar limpiara el castigo, seria la salida barata de
        // cualquier error y el castigo dejaria de significar nada.
        return {
          estado: {
            fallos: numero(ctx.estado, 'fallos'),
            cuarentenaHasta: ctx.estado.cuarentenaHasta,
          },
          bloques: [
            texto(
              [
                tocadas.length
                  ? `Las ${tocadas.length} pieza(s) que habiais tocado vuelven a como estaban: ${tocadas.join(', ')}.`
                  : 'No habiais tocado ninguna pieza; el nucleo ya estaba como al principio.',
                'El cursor vuelve a la puerta: no hay ningun archivo abierto.',
              ],
              'Nucleo reiniciado',
            ),
            texto([
              'Los despliegues fallidos NO se borran: el marcador de errores y la',
              'cuarentena siguen donde estaban. Esto reinicia el problema, no el castigo.',
            ]),
          ],
        };
      }

      case 'desplegar':
      case 'aplicar': {
        const rs = resultados(hojas);
        const mal = rs.filter((r) => !r.ok);
        if (mal.length === 0) {
          return {
            resuelto: true,
            estado: { ...ctx.estado, hojas: (ctx.estado.hojas as Record<string, string>) ?? {} },
            bloques: [
              exito('Nucleo corregido', [
                'Tres piezas. Tres cuentas. Y ninguna se podia adivinar.',
                '',
                'Cada una salio de un renglon del contrato, y en cadena: para saber que',
                'hacia escalar hacia falta lo que debia dar prioridad; para doblar, lo que',
                'debia dar orden; para margen, lo que debia dar riesgo. Por eso los casos',
                'se fueron poniendo en verde de uno en uno, y en ese orden.',
                '',
                'Eso es lo que hace una funcion: existe en UN sitio y se usa en muchos. El',
                'fallo se multiplicaba —todo lo que pasaba por ella salia mal— y el arreglo',
                'tambien: una cuenta bien puesta arregla todas las llamadas de golpe.',
                '',
                'Y por eso `corregir` os obligo a andar hasta cada una en vez de teclear su',
                'nombre desde fuera: cada `entrar` era una llamada y cada `volver` un',
                'regreso. La pila que ibais viendo era la pila de llamadas.',
              ]),
            ],
          };
        }
        return rechazo(
          ctx,
          `El nucleo ha rechazado la correccion: ${mal.length} de ${rs.length} casos no dan `
          + 'lo que el manual dice que deberian dar.',
          { hojas: (ctx.estado.hojas as Record<string, string>) ?? {} },
        );
      }

      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto}». Prueba \`ayuda\`.`)] };
    }
  },
};
