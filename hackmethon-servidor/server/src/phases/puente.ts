// ============================================================
//  FASE 6 — Puente de Lanzamiento   ·   APIS
//
//  La última capa habla con el exterior, y solo entiende mensajes bien
//  formados. Mándale el correcto y el ataque se cancela. Mándale el
//  equivocado —y hay uno que lo está de una forma muy concreta— y el
//  lanzamiento se adelanta.
//
//  LO QUE ENSEÑA
//    · una petición tiene cuatro partes y las cuatro importan: método,
//      ruta, cabeceras y cuerpo
//    · el código de respuesta te dice QUÉ has hecho mal — 401 no es 404
//      ni 405 ni 422, y cada uno se arregla de una forma distinta
//    · muchas APIs son una conversación, no un disparo: hay que preguntar
//      antes de poder pedir
//    · la documentación no es un adorno; aquí, no leerla adelanta el
//      lanzamiento
//
//  EL REPARTO
//    PANTALLA  lo que contesta el puente: códigos y cuerpos de respuesta.
//              Ni la documentación ni el token.
//    DATOS     la documentación de la API y el token. No ve ni una
//              respuesta.
//    TERMINAL  envía, y no ve nada.
// ============================================================

import type { Role } from '../lib/constants.js';
import type { ContextoComando, ModuloFase, ResultadoComando } from './types.js';
import {
  ANCHO_CAMARA, AYUDA_CAMARAS, circuitoCerrado, cuarentenaActiva, error, exito, lienzo, lista,
  mandoDeCamaras, normalizar, numero, rechazo, texto, tira,
  type CamaraDef, type Escena, type Rotulo,
} from './comun.js';

const TOKEN = 'tk-4f19-sistemas';

/**
 * TRES operaciones armadas, y el puente cree que las tres llevan ojiva.
 *
 * No la lleva ninguna menos una: dos rampas estan vacias y en la tercera
 * hay una maqueta de instruccion. El inventario del puente esta viejo, y
 * eso no se puede saber preguntandole a el —contestaria lo mismo de las
 * tres—. Se sabe MIRANDO. Para eso estan las camaras.
 *
 * Lo unico que une una operacion con lo que se ve por la camara es el
 * SECTOR: la lista del GET lo trae, y el rotulo de la camara tambien.
 */
const OPERACIONES = [
  { id: 'op-7112', sector: 'A-12', carga: 'vacia' as const },
  { id: 'op-7741', sector: 'B-07', carga: 'ojiva' as const },
  { id: 'op-7903', sector: 'C-03', carga: 'maqueta' as const },
];

/**
 * Los retos que va devolviendo el GET. Uno detras de otro, en orden: hace
 * falta que sean imposibles de adivinar para el equipo y perfectamente
 * predecibles para las pruebas, y una lista fija cumple las dos cosas.
 */
const RETOS = ['k7qx', 'm3vd', 'p9fs', 't2bn', 'w5hc', 'j4rk', 'z8lm', 'c6yd',
               'q1nt', 'v7xb', 'h2ws', 'r5gp'];
const retoNumero = (n: number) => RETOS[n % RETOS.length];

/**
 * Lo que dura un reto. Es el reloj de la fase: la respuesta del GET no
 * es una llave, es un turno. Noventa segundos dan para dictar el comando
 * entero con calma y no dan para irse a discutir; y caducar NO penaliza
 * —cuesta tiempo, que es lo que se esta cobrando aqui, no intentos—.
 */
const VENTANA_MS = 90_000;

const MINUTOS_INICIALES = 9;

/** Ritmo de la detonacion y cuanto se deja el humo en pantalla antes de
 *  levantar la cortinilla de victoria. Sale de aqui y no del cliente
 *  porque de aqui sale tambien el numero de fotogramas. */
const RITMO_DETONACION = 340;
const COLA_DETONACION = 1400;

// ---------- La mitad del Operador de Datos: la documentación ----------
const ESQUEMA = {
  tablas: [
    {
      id: 'endpoints',
      nombre: 'endpoints',
      x: 40, y: 30, w: 520,
      descripcion: 'Que entiende el puente',
      clave: 'id',
      columnas: ['id', 'metodo', 'ruta', 'para que sirve'],
      filas: [
        ['E1', 'GET', '/v2/operacion/estado', 'listar las operaciones en curso'],
        ['E2', 'POST', '/v2/operacion/cancelar', 'cancelar el lanzamiento'],
        ['E3', 'POST', '/v2/operacion/programar', 'ADELANTAR el lanzamiento. No tocar.'],
      ],
    },
    {
      id: 'requisitos',
      nombre: 'requisitos',
      x: 40, y: 260, w: 560,
      descripcion: 'Que hay que mandarle a cada uno',
      clave: 'id',
      columnas: ['id', 'endpoint_id', 'donde', 'requisito'],
      filas: [
        ['Q1', 'E1', 'cabecera', 'autorizacion = <token>'],
        ['Q2', 'E2', 'cabecera', 'autorizacion = <token>'],
        ['Q3', 'E2', 'cuerpo', 'operacion = <id de LA QUE LLEVA OJIVA>'],
        ['Q4', 'E2', 'cuerpo', 'confirmacion = <el reto que devuelve E1>'],
      ],
    },
    {
      id: 'avisos',
      nombre: 'avisos',
      x: 40, y: 470, w: 560,
      descripcion: 'Notas de la auditoria del puente',
      clave: 'id',
      columnas: ['id', 'sobre', 'nota'],
      filas: [
        ['N1', 'E1', 'El inventario da TODAS las operaciones por armadas. Esta viejo.'],
        ['N2', 'E1', 'Solo una lleva ojiva de verdad. Por el puente no se distingue.'],
        ['N3', 'E1', 'Cada operacion trae su SECTOR. El sector se ve en el recinto.'],
        ['N4', 'E1', 'El reto caduca a los 90 s. Pasado eso hay que volver a pedirlo.'],
        ['N5', 'E2', 'Cancelar una rampa vacia cuenta como intento y quema el reto.'],
      ],
    },
    {
      id: 'secretos',
      nombre: 'secretos',
      x: 660, y: 30, w: 300,
      descripcion: 'Lo que se saco de la boveda',
      clave: 'id',
      columnas: ['id', 'clave', 'valor'],
      filas: [
        ['S1', 'token de autorizacion', 'TK-4F19-SISTEMAS'],
      ],
    },
  ],
  relaciones: [
    { desde: 'requisitos', campo: 'endpoint_id', hasta: 'endpoints' },
    { desde: 'avisos', campo: 'sobre', hasta: 'endpoints' },
  ],
} as const;

// ---------- La mitad del Operador de Pantalla: el circuito cerrado ----------
//
//  Cuatro camaras del recinto enemigo. Quien las cambia es el Operador de
//  Terminal, que no las ve; quien las ve es Pantalla, que no puede
//  cambiarlas. Es la misma asimetria de siempre llevada a la imagen: para
//  mirar a un sitio hay que pedirlo en voz alta.
//
//  Las camaras NO dicen que hay que enviar —eso sigue estando solo en la
//  documentacion de Datos—. Lo que dan es lo otro: que esta pasando ahi
//  fuera y que ha provocado cada peticion. Una API sin consecuencias
//  visibles es un ejercicio; con ellas es un puente de lanzamiento.

//  Tres de las seis son rampas, una por operacion, y el SECTOR del rotulo
//  es lo unico que las ata a la lista que devuelve el GET. Cancelar sin
//  haber mirado es tirar una moneda a tres caras.

const CAMARAS: CamaraDef[] = [
  // Con nombre y no con numero: `RAMPA 9` chocaba con `camara 9`, y en una
  // sala a gritos el numero de la camara y el de la rampa se confunden
  // solos. Ademas asi se pide como se dice: «ponme la del sector B-07».
  { n: 1, id: 'silo', nombre: 'RAMPA NORTE', sector: 'A-12', que: 'la rampa del sector A-12' },
  { n: 2, id: 'silo', nombre: 'RAMPA CENTRO', sector: 'B-07', que: 'la rampa del sector B-07' },
  { n: 3, id: 'silo', nombre: 'RAMPA SUR', sector: 'C-03', que: 'la rampa del sector C-03' },
  { n: 4, id: 'sala', nombre: 'SALA DE CONTROL', sector: 'D-01', que: 'los puestos enemigos' },
  { n: 5, id: 'enlace', nombre: 'TORRE DE ENLACE', sector: 'E-01', que: 'la antena por la que entra el puente' },
  { n: 6, id: 'patio', nombre: 'PATIO EXTERIOR', sector: 'F-09', que: 'el acceso rodado' },
];

/** Que hay en la rampa de esa camara. Las que no son rampa, nada. */
const cargaDe = (sector: string) => OPERACIONES.find((o) => o.sector === sector)?.carga ?? null;

/** La camara de la rampa que lleva ojiva. Es a donde salta el monitor
 *  cuando la operacion se cancela: el final hay que verlo. */
const camaraDelSilo = () =>
  CAMARAS.find((c) => c.id === 'silo' && cargaDe(c.sector) === 'ojiva')!.n;



type Plano = {
  armada: boolean;
  minutos: number;
  adelantos: number;
  peticiones: number;
  rechazadas: number;
};

type Carga = 'ojiva' | 'vacia' | 'maqueta';

/** 0 en calma · 3 a punto de lanzar. Sale de la cuenta atras, que es lo
 *  unico que la mueve: cada peticion equivocada se come tres minutos. */
const tensionDe = (minutos: number) => (minutos >= 9 ? 0 : minutos >= 6 ? 1 : minutos >= 3 ? 2 : 3);

/** El reloj de la rampa. Se pinta aqui y no en el cliente porque los
 *  minutos son estado de la fase, no adorno de la imagen. */
const reloj = (minutos: number) => `T-${String(Math.max(0, minutos)).padStart(2, '0')}:00`;



// ---------- El silo, que es el que actua ----------
//
//  Las cuatro escenas se montan por PARTES sobre el mismo lienzo para que
//  los fotogramas encajen: si cada uno se escribiera entero a mano, un
//  espacio de mas y el cohete da un salto lateral en cada cuadro.

const CIELO = [
  '   .      .     *       .      .    ',
  '     .   *    .      .       .      ',
  '  .     .       .        *     .    ',
];

/** El cuerpo del misil, de la ojiva a la tobera. Siempre las mismas
 *  columnas: es lo que mantiene quieto el cohete mientras arde debajo. */
const MISIL = [
  '                /\\                  ',
  '               /  \\                 ',
  '              | OP |                ',
  '              |7741|                ',
  '      |####|  |    |  |####|        ',
  '      |####|  |    |  |####|        ',
  '      |####|  |    |  |####|        ',
  '      |####|  |    |  |####|        ',
  '      |####|  |/\\/\\|  |####|        ',
];

const SUELO = [
  '  ==================================',
  '  ::::::::::::::::::::::::::::::::::',
];

/** Lo que sale por debajo. En calma es venteo; a partir de la mitad de la
 *  cuenta atras es fuego, y es la unica forma de ver desde la sala que
 *  esto se ha puesto feo sin leer un numero. */
function escape(tension: number, f: number): string[] {
  if (tension <= 0) {
    return [f % 2 === 0
      ? '      |####|          |####|        '
      : '      |####|   ~      |####|        '];
  }
  if (tension === 1) {
    return [f % 2 === 0
      ? '      |####|  ~    ~  |####|        '
      : '      |####|   ~  ~   |####|        '];
  }
  if (tension === 2) {
    return f % 2 === 0
      ? ['      |####|  \\::::/  |####|        ',
         '      |####| ~(####)~ |####|        ']
      : ['      |####|  \;;;;/  |####|        ',
         '      |####| =(@@@@)= |####|        '];
  }
  return f % 2 === 0
    ? ['      |####|  \\VVVV/  |####|        ',
       '      |####| ((####)) |####|        ',
       '      |####|~~~~~~~~~~|####|        ']
    : ['      |####|  \\WWWW/  |####|        ',
       '      |####| ))@@@@(( |####|        ',
       '      |####|==========|####|        '];
}

/** Una rampa sin nada: el andamio cerrado sobre el hormigon y una baliza
 *  parpadeando. Se distingue de la cargada de un vistazo, que es justo lo
 *  que tiene que pasar desde el fondo de una sala. */
function escenaVacia(f: number): string[] {
  return lienzo([
    CIELO[f % CIELO.length],
    '                                    ',
    '                                    ',
    '      |####|          |####|        ',
    '      |####|          |####|        ',
    '      |####|          |####|        ',
    `      |####|    ${f % 2 === 0 ? '.' : ' '}     |####|        `,
    '      |####|          |####|        ',
    '      |####|__________|####|        ',
    '      |#######################|     ',
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
  ]);
}

/** Una maqueta de instruccion: la silueta esta, pero es un cascaron. Se
 *  ve por dentro y lo lleva escrito. Es la trampa para quien mire deprisa. */
function escenaMaqueta(f: number): string[] {
  return lienzo([
    CIELO[f % CIELO.length],
    '                /\\                  ',
    '               /  \\                 ',
    '              :    :                ',
    '              :    :                ',
    '      |####|  :    :  |####|        ',
    '      |####|  :    :  |####|        ',
    '      |####|  :    :  |####|        ',
    '      |####|  :____:  |####|        ',
    '      |####| MAQUETA  |####|        ',
    `      |####|   ${f % 2 === 0 ? '.' : ' '}      |####|        `,
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
  ]);
}

function escenaSilo(st: Plano): Escena {
  if (!st.armada) {
    // Despues de la detonacion: la rampa vacia, el andamio torcido y dos
    // columnas de humo que se van. No vuelve a haber nada que lanzar.
    return {
      ritmo: 520,
      fotogramas: [0, 1, 2].map((f) => lienzo([
        CIELO[f],
        '                                    ',
        `        ${f === 0 ? '~' : f === 1 ? ' ~' : '  ~'}              ${f === 0 ? ' ~' : f === 1 ? '~' : ' ~'}       `,
        '       ~                  ~         ',
        '      |####\\          /####|        ',
        '      |#### |        | ####|        ',
        '      |####  |      |  ####|        ',
        '      |####   |    |   ####|        ',
        '      |####    |  |    ####|        ',
        '      |####     \\/     ####|        ',
        '  ============ xxxx ===============',
        '  ::::::::::::::::::::::::::::::::::',
      ])),
    };
  }

  const tension = tensionDe(st.minutos);
  const ritmo = tension >= 3 ? 170 : tension === 2 ? 240 : 420;
  const fotogramas = [0, 1].map((f) => lienzo([
    CIELO[f % CIELO.length],
    ...MISIL,
    ...escape(tension, f),
    ...SUELO,
  ]));
  return { fotogramas, ritmo };
}

/** La detonacion. Se reproduce UNA vez y termina en la rampa vacia.
 *
 *  Va aqui y no en el cliente por la misma razon que el resto del dibujo:
 *  si la mitad de la camara viviera en cada lado, encajar el ultimo
 *  fotograma con la imagen en reposo seria cuestion de suerte. */
function detonacionSilo(): string[][] {
  const cabeza = CIELO[0];
  const base = SUELO;
  return ([
    // 1. algo cede dentro
    [cabeza, ...MISIL.slice(0, 4),
     '      |####|  |!!!!|  |####|        ',
     '      |####|  |    |  |####|        ',
     '      |####|  |    |  |####|        ',
     '      |####|  |    |  |####|        ',
     '      |####|  |/\\/\\|  |####|        ',
     '      |####|          |####|        ', ...base],
    // 2. la ojiva se abre
    [cabeza,
     '               \\||/                 ',
     '               /||\\                 ',
     '              |*OP*|                ',
     '              |7741|                ',
     '      |####|  |####|  |####|        ',
     '      |####|  |####|  |####|        ',
     '      |####|  |    |  |####|        ',
     '      |####|  |    |  |####|        ',
     '      |####|  |/\\/\\|  |####|        ',
     '      |####|  ((##))  |####|        ', ...base],
    // 3. el fogonazo
    ['             \\   |   /              ',
     '              \\ \\|/ /               ',
     '            -- ##### --             ',
     '              / /|\\ \\               ',
     '      |####| /  ###  \\ |####|       ',
     '      |####|  #######  |####|       ',
     '      |####| ######### |####|       ',
     '      |####|  #######  |####|       ',
     '      |####|   #####   |####|       ',
     '      |####|  (#####)  |####|       ', ...base],
    // 4. la bola entera
    ['       \\  \\   |   /  /              ',
     '     -- ################# --        ',
     '      ######################        ',
     '     ########################       ',
     '    |##########################|    ',
     '    |##########################|    ',
     '    |##########################|    ',
     '     ########################       ',
     '      ######################        ',
     '       ####################         ',
     '  ============ #### ===============',
     '  ::::::::::::::::::::::::::::::::::'],
    // 5. se abre y empieza a caer
    ['      @@@@@@@@@@@@@@@@@@@@@@        ',
     '     @@@@@@@@@@@@@@@@@@@@@@@@       ',
     '    @@@@@@@@@@@@@@@@@@@@@@@@@@      ',
     '     @@@@@@@@@@@@@@@@@@@@@@@@       ',
     '      @@@@@@@@@@@@@@@@@@@@@@        ',
     '       @@@@@@@@@@@@@@@@@@@@         ',
     '        @@@@@@@@@@@@@@@@@@          ',
     '      |####|@@@@@@@@|####|          ',
     '      |####|@@@@@@@@|####|          ',
     '      |####  @@@@@@  ####|          ',
     '  ============ @@@@ ===============',
     '  ::::::::::::::::::::::::::::::::::'],
    // 6. humo
    ['        ~~~~~~~~~~~~~~~~~~          ',
     '       ~~~~~~~~~~~~~~~~~~~~         ',
     '      ~~~~~~~~~~~~~~~~~~~~~~        ',
     '       ~~~~~~~~~~~~~~~~~~~~         ',
     '      |####\\ ~~~~~~~~ /####|        ',
     '      |#### |~~~~~~~~| ####|        ',
     '      |####  |~~~~~~|  ####|        ',
     '      |####   |~~~~|   ####|        ',
     '      |####    |~~|    ####|        ',
     '      |####     \\/     ####|        ',
     '  ============ xxxx ===============',
     '  ::::::::::::::::::::::::::::::::::'],
  ] as string[][]).map(lienzo);
}

// ---------- Las otras tres ----------

function escenaSala(st: Plano): Escena {
  const luces = (f: number) => (f % 2 === 0 ? '[##]   [::]   [##]' : '[::]   [##]   [::]');
  const alerta = tensionDe(st.minutos) >= 2 && st.armada;
  return {
    ritmo: 480,
    fotogramas: [0, 1].map((f) => lienzo([
      '   ______________________________   ',
      `  |  ${luces(f)}  [=====] |  `,
      '  |                              |  ',
      '  |    ___     ___     ___       |  ',
      `  |   |${f % 2 === 0 ? 'o o' : 'O O'}|   |${f % 2 === 0 ? 'O O' : 'o o'}|   |${f % 2 === 0 ? 'o o' : 'O O'}|      |  `,
      alerta
        ? '  |   \\| |/   \\| |/   \\| |/      |  '
        : '  |   /| |\\   /| |\\   /| |\\      |  ',
      '  |  [=====] [=====] [=====]     |  ',
      '  |______________________________|  ',
      '                                    ',
      tira(`  aceptadas ${String(st.peticiones - st.rechazadas).padStart(2, '0')}  ·  rechazadas ${String(st.rechazadas).padStart(2, '0')}`, ANCHO_CAMARA),
      tira(alerta ? '  TODOS DE PIE. CUENTAN ATRAS.' : '', ANCHO_CAMARA),
    ])),
  };
}

function escenaEnlace(st: Plano): Escena {
  const vivo = st.peticiones > 0;
  const onda = (f: number) => {
    if (!vivo) return '                                    ';
    const anillos = ['   ) ', '  )) ', ' ))) '][f % 3];
    return `        ${anillos}        ${anillos.split('').reverse().join('')}     `;
  };
  return {
    ritmo: 300,
    fotogramas: [0, 1, 2].map((f) => lienzo([
      onda(f),
      '          \\    |    /               ',
      `           \\  (${vivo && f % 2 === 0 ? '*' : 'o'})  /                `,
      '            \\_____/                 ',
      '               |                    ',
      '              /|\\                   ',
      '             / | \\                  ',
      '            /  |  \\                 ',
      '           /   |   \\                ',
      '      ____/____|____\\____           ',
      '      ::::::::::::::::::::          ',
      '                                    ',
      tira(`  peticiones recibidas: ${st.peticiones}`, ANCHO_CAMARA),
    ])),
  };
}

function escenaPatio(st: Plano): Escena {
  return {
    ritmo: 520,
    fotogramas: [0, 1].map((f) => lienzo([
      `   ${f % 2 === 0 ? '*' : '+'}                           ${f % 2 === 0 ? '+' : '*'}   `,
      '   |     ____        ____      |    ',
      '   |    /|__|\\      /|__|\\     |    ',
      st.armada
        ? '   |   [_o__o_]    [_o__o_]    |    '
        : `   |  [_o__o_]${f % 2 === 0 ? '  ' : '   '}[_o__o_]${f % 2 === 0 ? '   ' : '  '}  |    `,
      '   +-|-|-|-|-|-|-|-|-|-|-|-|-|-+    ',
      '   :::::::::::::::::::::::::::::    ',
      '                                    ',
      tira(st.armada
        ? '  dos camiones cargando. nadie se va'
        : '  los camiones se retiran del recinto', ANCHO_CAMARA),
    ])),
  };
}

/** Los rotulos que van SOBRE la imagen. Son el estado en crudo: lo que
 *  Pantalla tiene que cantar para que la consola sepa donde esta. */
function rotulos(id: string, carga: Carga | null, st: Plano): Rotulo[] {
  const r: Rotulo[] = [];
  const tension = tensionDe(st.minutos);
  if (id === 'silo' && carga === 'vacia') {
    r.push({ texto: 'RAMPA VACIA', tono: 'neutro' });
    r.push({ texto: 'SIN CARGA', tono: 'neutro' });
  }
  if (id === 'silo' && carga === 'maqueta') {
    r.push({ texto: 'MAQUETA DE INSTRUCCION', tono: 'neutro' });
    r.push({ texto: 'CASCARON VACIO', tono: 'neutro' });
  }
  if (id === 'silo' && carga === 'ojiva') {
    r.push({ texto: reloj(st.minutos), tono: st.adelantos > 0 ? 'alerta' : 'neutro' });
    r.push({ texto: st.armada ? 'OJIVA ARMADA' : 'OJIVA DESTRUIDA', tono: st.armada ? 'alerta' : 'ok' });
    if (st.armada && tension >= 2) {
      r.push({ texto: tension >= 3 ? 'IGNICION EN CURSO' : 'MOTOR ENCENDIDO', tono: 'alerta' });
    }
    if (st.adelantos > 0 && st.armada) r.push({ texto: `CUENTA ACORTADA x${st.adelantos}`, tono: 'alerta' });
  }
  if (id === 'sala') {
    r.push({ texto: `${st.peticiones} PETICIONES`, tono: 'neutro' });
    if (st.rechazadas > 0) r.push({ texto: `${st.rechazadas} RECHAZADAS`, tono: 'neutro' });
  }
  if (id === 'enlace') {
    r.push({ texto: st.peticiones > 0 ? 'ENLACE ACTIVO' : 'ENLACE EN ESPERA', tono: 'neutro' });
  }
  if (id === 'patio') {
    r.push({ texto: st.armada ? 'SIN NOVEDAD' : 'RECINTO EVACUANDO', tono: st.armada ? 'neutro' : 'ok' });
  }
  return r;
}

function escenaDe(id: string, carga: Carga | null, st: Plano): Escena {
  if (id === 'silo') {
    if (carga === 'ojiva') return escenaSilo(st);
    if (carga === 'maqueta') return { ritmo: 700, fotogramas: [0, 1].map(escenaMaqueta) };
    return { ritmo: 700, fotogramas: [0, 1].map(escenaVacia) };
  }
  if (id === 'sala') return escenaSala(st);
  if (id === 'enlace') return escenaEnlace(st);
  return escenaPatio(st);
}

function vistaDeCamaras(estado: Record<string, unknown>) {
  const adelantos = numero(estado, 'adelantos');
  const st: Plano = {
    armada: estado.cancelada !== true,
    minutos: MINUTOS_INICIALES - adelantos * 3,
    adelantos,
    peticiones: numero(estado, 'peticiones'),
    rechazadas: numero(estado, 'rechazadas'),
  };

  return circuitoCerrado(
    CAMARAS,
    estado,
    (cam) => {
      const carga = cam.id === 'silo' ? cargaDe(cam.sector) : null;
      // La tension y la detonacion son SOLO de la rampa que lleva ojiva:
      // en las otras dos no hay nada que encender ni que reventar.
      const esLaBuena = carga === 'ojiva';
      const tension = esLaBuena && st.armada ? tensionDe(st.minutos) : 0;
      return {
        escena: escenaDe(cam.id, carga, st),
        rotulos: rotulos(cam.id, carga, st),
        clave: `${cam.n}:${carga ?? '-'}:${tension}:${st.armada ? 'a' : 'x'}:${st.peticiones}`,
        extra: {
          detonacion: esLaBuena && !st.armada ? detonacionSilo() : null,
          ritmoDetonacion: RITMO_DETONACION,
          // `armada` gobierna la detonacion en el cliente, y solo la rampa
          // buena tiene algo que detonar: las otras estan siempre en paz.
          armada: esLaBuena ? st.armada : true,
          tension,
          // Cada adelanto ensucia la señal: el recinto esta reaccionando.
          ruido: Math.min(3, st.adelantos),
        },
      };
    },
    // Siempre viaja, aunque no haya reto abierto (`hasta: null`): el hueco
    // del rotulo tiene que estar ahi para que Pantalla sepa que ESTA fase
    // tiene reloj y ahora mismo no corre.
    {
      hasta: typeof estado.reto === 'string' && numero(estado, 'retoHasta') > 0
        ? numero(estado, 'retoHasta')
        : null,
    },
  );
}

type Peticion = {
  metodo: string;
  ruta: string;
  cabeceras: Record<string, string>;
  cuerpo: Record<string, string>;
};

type Respuesta = {
  codigo: number;
  motivo: string;
  cuerpo: string[];
  /** true → esto ha llegado a la capa de lanzamiento y ha hecho daño. */
  adelanta?: boolean;
  gana?: boolean;
  /** Se ha cancelado una rampa sin ojiva: cuenta como intento. */
  vacia?: boolean;
  /** El GET abre una ventana nueva con este reto. */
  retoNuevo?: string;
  /** Esta respuesta cierra la ventana: hay que volver a preguntar. */
  quemaReto?: boolean;
};

const RUTAS = ['/v2/operacion/estado', '/v2/operacion/cancelar', '/v2/operacion/programar'];

/**
 * El puente. Cada rama devuelve el código que le corresponde de verdad,
 * porque el código ES la pista: si todo lo malo contestara 400, la fase
 * enseñaría a probar a ciegas en vez de a leer la respuesta.
 */
/** Lo que el puente necesita saber del estado para contestar. */
type Contexto = { reto: string | null; retoHasta: number; retos: number; ahora: number };

function responder(p: Peticion, c: Contexto): Respuesta {
  if (!RUTAS.includes(p.ruta)) {
    return { codigo: 404, motivo: 'no encontrado', cuerpo: [`La ruta «${p.ruta}» no existe en este puente.`] };
  }

  // La autorización se comprueba ANTES que el método: un puente que te
  // dijera «método no permitido» sin credenciales estaría contando lo
  // que tiene detrás a cualquiera que llame.
  const auth = p.cabeceras['autorizacion'];
  if (!auth) {
    return { codigo: 401, motivo: 'no autorizado', cuerpo: ['Falta la cabecera `autorizacion`.'] };
  }
  if (auth !== TOKEN) {
    return { codigo: 403, motivo: 'prohibido', cuerpo: ['Ese token no vale aqui.'] };
  }

  const metodoDe: Record<string, string> = {
    '/v2/operacion/estado': 'GET',
    '/v2/operacion/cancelar': 'POST',
    '/v2/operacion/programar': 'POST',
  };
  if (p.metodo !== metodoDe[p.ruta]) {
    return {
      codigo: 405,
      motivo: 'metodo no permitido',
      cuerpo: [`Esa ruta no escucha ${p.metodo}. Escucha ${metodoDe[p.ruta]}.`],
    };
  }

  if (p.ruta === '/v2/operacion/estado') {
    // El inventario da las tres por armadas porque el inventario esta
    // viejo. El puente no miente a proposito: no lo sabe. Por eso hay
    // camaras.
    const reto = retoNumero(c.retos);
    return {
      codigo: 200,
      motivo: 'ok',
      retoNuevo: reto,
      cuerpo: [
        `operaciones_en_curso: ${OPERACIONES.length}`,
        ...OPERACIONES.map((o) => `  ${o.id.toUpperCase()}   sector ${o.sector}   estado: armada`),
        `faltan_minutos: ${MINUTOS_INICIALES}`,
        '',
        `reto: ${reto.toUpperCase()}`,
        `caduca_en_segundos: ${VENTANA_MS / 1000}`,
        'nota: el reto vale para UNA cancelacion y solo durante ese rato.',
      ],
    };
  }

  if (p.ruta === '/v2/operacion/programar') {
    // El mensaje equivocado. Está documentado en mayúsculas y aun así
    // alguien lo enviará: es exactamente lo que pasa con las APIs reales.
    return {
      codigo: 200,
      motivo: 'ok',
      adelanta: true,
      cuerpo: ['programada: true', 'La cuenta atras se ha acortado.'],
    };
  }

  // ---- cancelar ----
  const falta = ['operacion', 'confirmacion'].filter((x) => !p.cuerpo[x]);
  if (falta.length) {
    return {
      codigo: 422,
      motivo: 'faltan campos',
      cuerpo: [`El cuerpo necesita: ${falta.join(', ')}.`],
    };
  }

  const op = OPERACIONES.find((o) => o.id === p.cuerpo['operacion']);
  if (!op) {
    return { codigo: 404, motivo: 'operacion no encontrada', cuerpo: ['No hay ninguna operacion con ese identificador.'] };
  }

  // El reto se comprueba antes que la carga: si no, un equipo podria ir
  // probando operaciones con un reto caducado y averiguar cual es la
  // buena sin pagar el tiempo.
  if (!c.reto) {
    return {
      codigo: 428,
      motivo: 'falta la consulta previa',
      cuerpo: ['No hay ningun reto abierto. Hay que pedirlo antes de cancelar.'],
    };
  }
  if (c.ahora > c.retoHasta) {
    return {
      codigo: 410,
      motivo: 'reto caducado',
      cuerpo: [
        'Ese reto ya no vale: la ventana se cerro.',
        'Pidelo otra vez y manda la cancelacion sin pararte.',
      ],
      quemaReto: true,
    };
  }
  if (p.cuerpo['confirmacion'] !== c.reto) {
    return { codigo: 409, motivo: 'conflicto', cuerpo: ['El reto no coincide. Pidelo otra vez y devuelvelo tal cual.'] };
  }

  // Reto bueno y dentro de plazo. Ahora se ve si han mirado.
  if (op.carga !== 'ojiva') {
    return {
      codigo: 200,
      motivo: 'ok',
      vacia: true,
      quemaReto: true,
      cuerpo: [
        `cancelada: ${op.id.toUpperCase()}`,
        op.carga === 'vacia'
          ? `Esa rampa ya estaba vacia. El sector ${op.sector} no tenia nada que lanzar.`
          : `En el sector ${op.sector} solo habia una maqueta de instruccion.`,
      ],
    };
  }

  return {
    codigo: 200,
    motivo: 'ok',
    gana: true,
    quemaReto: true,
    cuerpo: ['cancelada: true', `La ojiva del sector ${op.sector} ha quedado desarmada.`],
  };
}

function ayuda(): ResultadoComando {
  return {
    bloques: [
      texto(
        [
          'enviar <METODO> <ruta> [cabecera k=v ...] [cuerpo k=v ...]',
          'estado                 — cuanto queda',
          ...AYUDA_CAMARAS,
        ],
        'Comandos disponibles',
      ),
      texto(
        [
          'El recinto enemigo tiene seis camaras y Pantalla las esta viendo. Tu las',
          'cambias a ciegas: pide la que quieras y que te cuenten que sale.',
          '',
          'No son un adorno. Hay MAS DE UNA operacion en curso y el puente las da',
          'todas por armadas; cual lleva ojiva de verdad no se puede preguntar, solo',
          'mirar. Lo unico que ata una operacion con lo que se ve es el SECTOR.',
        ],
        'El circuito cerrado',
      ),
      texto(
        [
          'La respuesta de la consulta trae un reto, y ese reto CADUCA. Vale para una',
          'sola cancelacion y solo durante un rato corto: si os pasais, hay que volver',
          'a pedirlo. Mirad las camaras ANTES de pedirlo, no despues.',
        ],
        'El reto tiene prisa',
      ),
      texto(
        [
          'Una peticion tiene cuatro partes, y las cuatro se pueden equivocar:',
          '  METODO   que quieres hacer:  GET pregunta, POST pide que se haga algo',
          '  ruta     a que parte del puente le hablas',
          '  cabecera quien eres. Va aparte del mensaje',
          '  cuerpo   el mensaje en si, en pares clave=valor',
          '',
          '  enviar GET /v2/algo cabecera autorizacion=XXX',
          '  enviar POST /v2/algo cabecera autorizacion=XXX cuerpo campo=valor otro=valor',
        ],
        'Como se manda una peticion',
      ),
      texto(
        [
          'El numero que contesta el puente te dice QUE has hecho mal:',
          '  401  no has dicho quien eres          404  esa ruta no existe',
          '  403  el token no vale                 405  esa ruta no escucha ese metodo',
          '  422  falta algo en el cuerpo          409  lo que mandas no cuadra',
          '  200  ha ido bien',
          '',
          'Ninguno de esos errores hace dano: no llegan a la capa de lanzamiento.',
          'Lo que hace dano es una peticion BIEN hecha a la ruta equivocada.',
        ],
        'Lo que contesta el puente',
      ),
      texto(
        [
          'Esta terminal no tiene la documentacion ni el token. Que rutas existen,',
          'que metodo escucha cada una, que hay que mandarle y con que credencial',
          'esta en la base de datos. Preguntad a Datos ANTES de enviar nada: aqui',
          'hay una ruta que funciona perfectamente y no deberiais tocar.',
        ],
        'Lo que esta terminal NO sabe',
      ),
    ],
  };
}

export const puente: ModuloFase = {
  key: 'fase-6-puente',

  proyectar(role: Role, ctx) {
    const minutos = MINUTOS_INICIALES - numero(ctx.estado, 'adelantos') * 3;
    switch (role) {
      case 'DATOS':
        return {
          titulo: 'Documentacion del puente',
          nota: 'Tu tienes la documentacion y el token. Lo que contesta el puente lo ve '
              + 'Pantalla, y no sabe ni que rutas existen. Leed los requisitos ANTES de que '
              + 'nadie envie nada: hay una ruta documentada que adelanta el lanzamiento. Y '
              + 'leed los avisos: el puente no sabe cual de sus operaciones lleva ojiva.',
          lienzo: { w: 1000, h: 650 },
          ...ESQUEMA,
        };

      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          nota: 'Tu ves lo que contesta el puente y las camaras del recinto. El numero de '
              + 'cada respuesta dice que falta; la documentacion la tiene Datos. Las camaras '
              + 'las cambia la consola, que no las ve: cuentale lo que sale.',
          camaras: vistaDeCamaras(ctx.estado),
        };

      case 'TERMINAL':
        return {
          pista: 'Escribe `ayuda` y pregunta a Pantalla que aparecio. Tambien mandas tu las '
               + 'camaras del recinto, aunque no las veas.',
          minutos,
          camara: numero(ctx.estado, 'camara') || 1,
          cuarentenaHasta: (ctx.estado.cuarentenaHasta as number) ?? null,
        };
    }
  },

  ejecutar(comandoBruto: string, ctx: ContextoComando): ResultadoComando {
    const enCuarentena = cuarentenaActiva(ctx);
    if (enCuarentena) return enCuarentena;

    // Las cabeceras y el cuerpo llevan valores que NO son texto libre del
    // idioma: el token y el reto se comparan en minúsculas, pero el resto
    // del comando se normaliza igual que en las demás fases.
    const cmd = normalizar(comandoBruto);
    const [verbo, ...resto] = cmd.split(' ');
    const adelantos = numero(ctx.estado, 'adelantos');

    // El circuito cerrado se atiende antes del switch: es el mismo mando
    // en todas las fases que tienen camaras.
    const mando = mandoDeCamaras(CAMARAS, verbo, resto.join(' '), ctx.estado);
    if (mando) return mando;

    switch (verbo) {
      case 'ayuda':
      case 'help':
        return ayuda();

      case 'estado':
        return {
          bloques: [lista('Puente de lanzamiento', [
            { clave: 'Minutos para el lanzamiento', valor: String(MINUTOS_INICIALES - adelantos * 3) },
            { clave: 'Peticiones enviadas', valor: String(numero(ctx.estado, 'peticiones')) },
            { clave: 'Peticiones que han hecho dano', valor: String(adelantos) },
            { clave: 'Camara en pantalla', valor: String(numero(ctx.estado, 'camara') || 1) },
            {
              clave: 'Reto abierto',
              valor: typeof ctx.estado.reto === 'string' && numero(ctx.estado, 'retoHasta') > ctx.ahora
                ? `si, ${Math.ceil((numero(ctx.estado, 'retoHasta') - ctx.ahora) / 1000)} s`
                : 'no',
            },
          ])],
        };

      case 'enviar': {
        const p = parsearPeticion(resto);
        if ('fallo' in p) return p.fallo;

        const r = responder(p, {
          reto: typeof ctx.estado.reto === 'string' ? ctx.estado.reto : null,
          retoHasta: numero(ctx.estado, 'retoHasta'),
          retos: numero(ctx.estado, 'retos'),
          ahora: ctx.ahora,
        });
        const cabecera = lista(`${r.codigo} ${r.motivo}`, [
          { clave: 'peticion', valor: `${p.metodo} ${p.ruta}` },
        ]);

        // La ventana: el GET abre una nueva y casi todo lo demas la cierra.
        // Se calcula aqui, junto a la respuesta, para que no haya dos
        // sitios que puedan discrepar sobre si el reto sigue vivo.
        const ventana = r.retoNuevo
          ? { reto: r.retoNuevo, retoHasta: ctx.ahora + VENTANA_MS, retos: numero(ctx.estado, 'retos') + 1 }
          : r.quemaReto
            ? { reto: null, retoHasta: 0, retos: numero(ctx.estado, 'retos') }
            : {};

        // Todo lo que llega al puente deja marca en las camaras: la sala
        // de control lleva la cuenta y el enlace se enciende. Se cuenta
        // aqui y no en el analizador porque una peticion mal escrita no
        // llega a salir de la consola.
        const peticiones = numero(ctx.estado, 'peticiones') + 1;
        const rechazadas = numero(ctx.estado, 'rechazadas') + (r.codigo >= 400 ? 1 : 0);

        if (r.gana) {
          return {
            resuelto: true,
            // La camara salta sola al silo. En cualquier otro momento
            // elegir donde mirar es del equipo, pero aqui ya no queda
            // nada que decidir: es el final, y hay que verlo.
            estado: { ...ctx.estado, ...ventana, peticiones, rechazadas, cancelada: true, camara: camaraDelSilo() },
            // Y la pantalla de victoria espera a que termine de arder.
            esperaVictoriaMs: detonacionSilo().length * RITMO_DETONACION + COLA_DETONACION,
            bloques: [
              cabecera,
              exito('200 · operacion cancelada', [
                ...r.cuerpo,
                'La ojiva se ha detonado en la rampa. Miradlo en la camara 1.',
                '',
                'Cuatro partes: el metodo, la ruta, la cabecera y el cuerpo. Cambiad',
                'una sola y el puente contesta otro numero.',
                '',
                'Y no bastaba con mandar el mensaje: primero habia que PREGUNTAR, porque',
                'el reto lo daba la respuesta anterior. Casi ninguna API se resuelve de',
                'un disparo; casi todas son una conversacion.',
              ]),
            ],
          };
        }

        if (r.adelanta) {
          return rechazo(
            ctx,
            `${r.codigo} ${r.motivo} — y eso era justo lo que no habia que mandar. `
            + `El lanzamiento se ha adelantado: quedan ${MINUTOS_INICIALES - (adelantos + 1) * 3} minutos. `
            + 'Miradlo en la camara del silo.',
            { ...ventana, adelantos: adelantos + 1, peticiones, rechazadas },
          );
        }

        // Un 4xx no es un castigo: es el puente explicando qué falta.
        // Cobrarlo enseñaría a no probar, que es lo contrario de lo que
        // hace falta para entender una API.
        // Cancelar una rampa vacia SI cuenta. No es un error de sintaxis
        // que el puente pueda explicar: es no haber mirado antes de
        // disparar, y ademas quema el reto.
        if (r.vacia) {
          return rechazo(
            ctx,
            `${r.codigo} ${r.motivo} — pero esa no era. ${r.cuerpo[1]} La ventana se ha cerrado: `
            + 'hay que volver a pedir el reto.',
            { ...ventana, peticiones, rechazadas },
          );
        }

        return {
          estado: { ...ctx.estado, ...ventana, peticiones, rechazadas },
          bloques: [
            cabecera,
            texto(r.cuerpo, `Respuesta ${r.codigo}`),
            texto([r.codigo === 410
              ? 'Esto no ha hecho dano, pero ha costado tiempo: el reloj no se para.'
              : 'Esto no ha hecho dano: no ha llegado a la capa de lanzamiento.']),
          ],
        };
      }

      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto}». Prueba \`ayuda\`.`)] };
    }
  },
};

// ---------- El analizador de `enviar` ----------

type Parseo = Peticion | { fallo: ResultadoComando };

function parsearPeticion(palabras: string[]): Parseo {
  const malo = (t: string, extra: string[] = []): Parseo => ({
    fallo: { bloques: [error(t), ...(extra.length ? [texto(extra)] : [])] },
  });

  const metodo = (palabras[0] ?? '').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(metodo)) {
    return malo(
      `«${palabras[0] ?? '(nada)'}» no es un metodo.`,
      ['Los metodos son GET, POST, PUT, DELETE y PATCH. GET pregunta; POST pide que se haga algo.'],
    );
  }
  const ruta = palabras[1];
  if (!ruta || !ruta.startsWith('/')) {
    return malo('Falta la ruta, y las rutas empiezan por `/`. Que rutas hay lo tiene Datos.');
  }

  const cabeceras: Record<string, string> = {};
  const cuerpo: Record<string, string> = {};
  let donde: 'cabecera' | 'cuerpo' | null = null;

  for (const w of palabras.slice(2)) {
    if (w === 'cabecera' || w === 'cabeceras') { donde = 'cabecera'; continue; }
    if (w === 'cuerpo') { donde = 'cuerpo'; continue; }
    if (!w.includes('=')) {
      return malo(
        `No se donde meter «${w}».`,
        ['Todo lo que va despues de la ruta son pares clave=valor, detras de `cabecera` o de `cuerpo`.'],
      );
    }
    if (!donde) {
      return malo(
        `«${w}» no esta ni en la cabecera ni en el cuerpo.`,
        ['Pon `cabecera` o `cuerpo` delante para decir donde va. No son lo mismo: la',
         'cabecera dice quien eres, el cuerpo dice que quieres.'],
      );
    }
    const i = w.indexOf('=');
    const destino = donde === 'cabecera' ? cabeceras : cuerpo;
    destino[w.slice(0, i)] = w.slice(i + 1);
  }

  return { metodo, ruta, cabeceras, cuerpo };
}
