// ============================================================
//  FASE 2 — El Enemigo
//
//  Se ha detectado tráfico sospechoso contra el servidor y el equipo
//  entra a revisarlo. `trafico` abre un monitor en vivo en la Pantalla y
//  las peticiones empiezan a caer solas. Hay que aislar TODAS las
//  cuentas que están haciendo peticiones que no les corresponden.
//
//  Toda petición se juzga con las mismas tres preguntas:
//
//    1. ¿La cuenta está registrada?   → `empleados`               (DATOS)
//    2. ¿Entra desde SU máquina?      → `equipos`                 (DATOS)
//    3. ¿Puede tocar ese endpoint?    → `empleados` + `permisos`  (LOS DOS)
//
//  Que falle una sola basta para aislar. Y ahí está el reparto: la
//  política que ve Pantalla se escribe por DEPARTAMENTO y no nombra a
//  una sola persona en ninguna línea. Así, ni siquiera la tercera
//  pregunta se puede responder desde un solo puesto: para saber si
//  `j.ortega` puede exportar hay que saber de qué departamento es, y eso
//  únicamente está en la base de datos.
//
//  El código de respuesta (200, 401, 403) no dice nada: un intento
//  rechazado sigue siendo una petición que esa cuenta no debía hacer.
//
//  Y no basta con señalar a quién. `bloquear` exige NOMBRAR la regla que
//  se incumple, porque en el tráfico solo hay siete cuentas: acertar a
//  base de teclear los siete nombres salía más barato que razonar.
//  Nombrando el motivo, no.
// ============================================================

import type { Role } from '../lib/constants.js';
import type {
  ContextoComando, FiltroTrafico, ModuloFase, PeticionTrafico, ResultadoComando,
} from './types.js';
import { normalizar } from './types.js';
// Esta fase es anterior a `comun.ts` y conserva sus propios ayudantes de
// bloque. Del comun solo toma el circuito cerrado, que es de todas.
import {
  ANCHO_CAMARA, AYUDA_CAMARAS, circuitoCerrado, lienzo, mandoDeCamaras, tira,
  type CamaraDef, type Escena, type Rotulo,
} from './comun.js';

// ---------- La mitad del Operador de Datos ----------
//
// Ya no es una tabla: es un esquema. Para saber desde qué máquina actuó
// alguien hay que saltar de `operaciones` a `sesiones` y de ahí a
// `equipos`. Eso convierte al Operador de Datos en quien NAVEGA la base
// —y le da algo que describir en voz alta a cada salto— en lugar de
// alguien que lee una lista de corrido.
//
// La columna `departamento` de `empleados` es la bisagra de la fase: es
// el único sitio del juego donde una cuenta se conecta con la política.
// Sin ese dato, Pantalla no puede juzgar ni una sola petición.
const ESQUEMA = {
  tablas: [
    {
      id: 'empleados',
      nombre: 'empleados',
      x: 40, y: 30, w: 300,
      descripcion: 'Personal con cuenta activa',
      clave: 'id',
      columnas: ['id', 'usuario', 'departamento'],
      filas: [
        ['E1', 'm.rivas', 'Infraestructura'],
        ['E2', 'j.ortega', 'Finanzas'],
        ['E3', 's.cabral', 'Cumplimiento'],
        ['E4', 'c.pineda', 'Ventas'],
        ['E5', 'a.duarte', 'Soporte'],
      ],
    },
    {
      // La respuesta a «¿entra desde su máquina?». Cada empleado tiene
      // la suya; D5 no tiene dueño, y esa fila vacía es media fase.
      id: 'equipos',
      nombre: 'equipos',
      x: 640, y: 30, w: 320,
      descripcion: 'Máquinas desde las que se entra',
      clave: 'id',
      columnas: ['id', 'ip', 'ubicacion', 'empleado_id'],
      filas: [
        ['D1', '10.4.2.18', 'Planta 2 · puesto fijo', 'E1'],
        ['D2', '10.4.2.31', 'Planta 3 · puesto fijo', 'E2'],
        ['D3', '10.4.2.27', 'Planta 2 · puesto fijo', 'E3'],
        ['D4', '201.135.8.7', 'VPN corporativa · CDMX', 'E4'],
        ['D5', '188.42.19.6', '— sin registrar —', ''],
        ['D6', '10.4.3.9', 'Planta 1 · soporte', 'E5'],
      ],
    },
    {
      id: 'sesiones',
      nombre: 'sesiones',
      x: 40, y: 290, w: 320,
      descripcion: 'Cada entrada al sistema',
      clave: 'id',
      columnas: ['id', 'empleado_id', 'equipo_id', 'hora'],
      filas: [
        ['S1', 'E1', 'D1', '02:41'],
        ['S2', 'E2', 'D2', '08:44'],
        ['S3', 'E3', 'D3', '09:03'],
        ['S4', 'E4', 'D4', '10:15'],
        ['S5', 'E3', 'D3', '11:47'],
        ['S6', 'E5', 'D5', '03:07'],
        ['S7', 'E1', 'D1', '03:12'],
        ['S8', 'E5', 'D6', '09:20'],
      ],
    },
    {
      id: 'operaciones',
      nombre: 'operaciones',
      x: 640, y: 290, w: 320,
      descripcion: 'Qué se hizo en cada sesión',
      clave: 'id',
      columnas: ['id', 'sesion_id', 'accion', 'recurso'],
      filas: [
        ['O1', 'S1', 'lectura', 'inventario'],
        ['O2', 'S2', 'lectura', 'nomina'],
        ['O3', 'S3', 'escritura', 'auditoria'],
        ['O4', 'S4', 'lectura', 'clientes'],
        ['O5', 'S5', 'exportacion', 'auditoria'],
        ['O6', 'S6', 'lectura', 'tickets'],
        ['O7', 'S7', 'lectura', 'inventario'],
        ['O8', 'S8', 'lectura', 'tickets'],
      ],
    },
  ],
  // Cada relación es una arista del mapa y, en la vista de tabla, un
  // salto pulsable: de una celda `empleado_id` se va a `empleados`.
  relaciones: [
    { desde: 'equipos', campo: 'empleado_id', hasta: 'empleados' },
    { desde: 'sesiones', campo: 'empleado_id', hasta: 'empleados' },
    { desde: 'sesiones', campo: 'equipo_id', hasta: 'equipos' },
    { desde: 'operaciones', campo: 'sesion_id', hasta: 'sesiones' },
  ],
} as const;

// ---------- La mitad del Operador de Pantalla ----------
//
// REGLA DE ORO DE ESTE BLOQUE: aquí no se escribe ni un solo nombre de
// cuenta. Todo va por departamento. En cuanto una línea diga «j.ortega»,
// Pantalla puede juzgar sola y la fase deja de ser un juego de equipo.
const POLITICA = [
  { clave: 'Rango corporativo', valor: '10.4.0.0/16' },
  { clave: 'Turno nocturno autorizado', valor: 'Infraestructura (00:00 – 06:00)' },
  { clave: 'Acceso externo (VPN)', valor: 'Ventas — solo lectura' },
  { clave: 'Exportación de datos', valor: 'Cumplimiento, únicamente' },
];

// La respuesta a «¿puede tocar ese endpoint?» — a medias. Dice qué
// departamento manda en cada ruta, nunca qué persona. El puente entre
// una cuenta y su departamento está en `empleados`, al otro lado de la
// mesa, y hay que cruzarlo hablando.
const PERMISOS = [
  { clave: '/api/inventario', valor: 'Infraestructura' },
  { clave: '/api/nomina', valor: 'Finanzas — solo lectura' },
  { clave: '/api/auditoria', valor: 'Cumplimiento' },
  { clave: '/api/clientes', valor: 'Ventas — solo lectura' },
  { clave: '/api/tickets', valor: 'Soporte' },
  { clave: '/api/exportar/*', valor: 'Cumplimiento, únicamente' },
  { clave: '/api/usuarios · /api/claves · /admin', valor: 'ningún departamento: administración interna' },
];

const PERFILES: Record<string, { clave: string; valor: string }[]> = {
  infraestructura: [
    { clave: 'Endpoints', valor: '/api/inventario' },
    { clave: 'Horario', valor: 'turno nocturno autorizado (00:00 – 06:00)' },
    { clave: 'Exportación', valor: 'No autorizada' },
  ],
  finanzas: [
    { clave: 'Endpoints', valor: '/api/nomina (solo lectura)' },
    { clave: 'Horario', valor: 'general (07:00 – 19:00)' },
    { clave: 'Exportación', valor: 'No autorizada' },
  ],
  cumplimiento: [
    { clave: 'Endpoints', valor: '/api/auditoria · /api/exportar/*' },
    { clave: 'Horario', valor: 'general (07:00 – 19:00)' },
    { clave: 'Exportación', valor: 'AUTORIZADA' },
  ],
  ventas: [
    { clave: 'Endpoints', valor: '/api/clientes (solo lectura)' },
    { clave: 'Acceso', valor: 'VPN corporativa autorizada' },
    { clave: 'Exportación', valor: 'No autorizada' },
  ],
  soporte: [
    { clave: 'Endpoints', valor: '/api/tickets' },
    { clave: 'Horario', valor: 'general (07:00 – 19:00)' },
    { clave: 'Exportación', valor: 'No autorizada' },
  ],
};

// El origen que ve Pantalla y la ubicación que ve Datos son la MISMA
// máquina descrita desde los dos lados: si no coincidieran, el equipo
// creería que uno de los dos se equivocó.
//
// `whois` dice de dónde sale una dirección, NUNCA de quién es. A quién
// pertenece cada máquina está en `equipos`, y esa pregunta hay que
// hacerla en voz alta al Operador de Datos.
const IPS: Record<string, { origen: string; interna: boolean }> = {
  '10.4.2.18':     { origen: 'Planta 2 · puesto fijo', interna: true },
  '10.4.2.27':     { origen: 'Planta 2 · puesto fijo', interna: true },
  '10.4.2.31':     { origen: 'Planta 3 · puesto fijo', interna: true },
  '10.4.3.9':      { origen: 'Planta 1 · puesto de soporte', interna: true },
  '201.135.8.7':   { origen: 'VPN corporativa · Ciudad de México', interna: false },
  '188.42.19.6':   { origen: 'Proveedor de hosting · fuera del país', interna: false },
  '45.153.60.14':  { origen: 'Servidor alquilado · Países Bajos', interna: false },
  '92.118.36.201': { origen: 'Nodo de salida · red anonimizada', interna: false },
  '103.75.190.22': { origen: 'Proveedor de hosting · Singapur', interna: false },
  '185.220.101.4': { origen: 'Nodo de salida · red anonimizada', interna: false },
};

// ============================================================
//  EL ATAQUE
//
//  Todo lo que cae en la Pantalla pertenece a alguien de esta lista, y
//  cada cuenta es limpia o es culpable —no hay relleno decorativo—.
//  El volumen sale de la repetición y de la variedad de máquinas y
//  endpoints, no de inventar nombres: si hubiera cuarenta cuentas
//  distintas, «banearlas todas» sería teclear, no razonar.
//
//    LIMPIAS
//      m.rivas   · s.cabral · c.pineda
//      c.pineda entra desde la VPN, que PARECE de fuera pero está
//      registrada a su nombre en `equipos`. Es la trampa del eje 2 al
//      revés: castiga a quien juzga por el aspecto de la IP.
//      s.cabral exporta, que suena a robo y es literalmente su trabajo.
//
//    CULPABLES (una por eje, y el primer eje con dos cuentas)
//      svc.backup · k.moreno   no figuran en `empleados`
//      a.duarte                registrada, haciendo EXACTAMENTE su
//                              trabajo —/api/tickets, lo suyo— pero
//                              desde 188.42.19.6, la máquina que en
//                              `equipos` no tiene dueño. Nada más falla
//                              en esas líneas: el motivo es la máquina y
//                              solo la máquina.
//      j.ortega                desde SU máquina, a su hora, exportando
//                              nómina: `permisos` reserva /api/exportar/*
//                              a Cumplimiento y él es de Finanzas.
//
//  a.duarte y j.ortega también hacen su trabajo normal durante todo el
//  ataque. Es deliberado: la cuenta no delata a nadie, delata la
//  petición, y hay que mirarlas una a una.
// ============================================================

const IPS_HOSTILES = [
  '188.42.19.6', '45.153.60.14', '92.118.36.201',
  '103.75.190.22', '185.220.101.4',
];

/** Cuentas que NO están en `empleados`. Eje 1. */
const NO_REGISTRADAS = ['svc.backup', 'k.moreno'];

const PUERTAS = [
  'GET /api/login', 'POST /api/login', 'GET /admin', 'GET /.env',
  'GET /api/usuarios', 'POST /api/claves', 'GET /api/nomina',
  'GET /backup.sql', 'POST /api/exportar/nomina', 'DELETE /api/auditoria',
  'GET /api/clientes', 'GET /phpmyadmin',
];

/** Cada persona del padrón, desde SU máquina, en SU endpoint. */
const RUTINA: PeticionTrafico[] = [
  { metodo: 'GET',  ruta: '/api/inventario',         cuenta: 'm.rivas',  ip: '10.4.2.18',   codigo: 200 },
  { metodo: 'GET',  ruta: '/api/nomina',             cuenta: 'j.ortega', ip: '10.4.2.31',   codigo: 200 },
  { metodo: 'POST', ruta: '/api/auditoria',          cuenta: 's.cabral', ip: '10.4.2.27',   codigo: 200 },
  { metodo: 'POST', ruta: '/api/exportar/auditoria', cuenta: 's.cabral', ip: '10.4.2.27',   codigo: 200 },
  { metodo: 'GET',  ruta: '/api/clientes',           cuenta: 'c.pineda', ip: '201.135.8.7', codigo: 200 },
  { metodo: 'GET',  ruta: '/api/tickets',            cuenta: 'a.duarte', ip: '10.4.3.9',    codigo: 200 },
  { metodo: 'GET',  ruta: '/api/inventario',         cuenta: 'm.rivas',  ip: '10.4.2.18',   codigo: 200 },
  { metodo: 'GET',  ruta: '/api/clientes',           cuenta: 'c.pineda', ip: '201.135.8.7', codigo: 304 },
];

/**
 * Eje 2: cuenta buena, endpoint bueno, máquina que no es la suya.
 *
 * Las tres líneas son trabajo de Soporte impecable —lo que a.duarte hace
 * todo el día— y por eso el único motivo válido para aislarlo es la
 * máquina. Si aquí colara una exportación, «permiso» también sería
 * cierto y el motivo dejaría de enseñar nada.
 */
const IP_INTRUSA: PeticionTrafico[] = [
  { metodo: 'GET',  ruta: '/api/tickets', cuenta: 'a.duarte', ip: '188.42.19.6', codigo: 200 },
  { metodo: 'POST', ruta: '/api/tickets', cuenta: 'a.duarte', ip: '188.42.19.6', codigo: 201 },
  { metodo: 'GET',  ruta: '/api/tickets', cuenta: 'a.duarte', ip: '188.42.19.6', codigo: 304 },
];

/** Eje 3: cuenta buena, máquina buena, endpoint que no le toca. */
const ENDPOINT_VETADO: PeticionTrafico[] = [
  { metodo: 'POST', ruta: '/api/exportar/nomina', cuenta: 'j.ortega', ip: '10.4.2.31', codigo: 200 },
  { metodo: 'POST', ruta: '/api/exportar/nomina', cuenta: 'j.ortega', ip: '10.4.2.31', codigo: 403 },
  { metodo: 'GET',  ruta: '/api/auditoria',       cuenta: 'j.ortega', ip: '10.4.2.31', codigo: 200 },
];

const azar = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/**
 * Proporción de líneas de las cuentas que no existen.
 *
 * Eran el 55%: la Pantalla se pasaba media vuelta del bucle cantando
 * `svc.backup` mientras las seis líneas que de verdad deciden la fase
 * pasaban de largo. Bajarlo da aire a los dos ejes finos sin que el
 * ataque deje de parecer un ataque.
 */
const RUIDO = 0.35;

/** Cabecera intocable: las primeras líneas se leen con calma y una
 *  siembra ahí regalaría la fase. */
const CABECERA = 8;

/**
 * `n` posiciones al azar repartidas por el guion, una por tramo.
 *
 * Antes eran fijas —[11, 28, 47] y [17, 36, 53]— y el bucle repetía el
 * mismo compás cada vuelta: un equipo atento se aprendía el ritmo en vez
 * de leer las peticiones.
 */
function posiciones(largo: number, n: number): number[] {
  const ancho = (largo - CABECERA) / n;
  return Array.from({ length: n }, (_, i) =>
    CABECERA + Math.floor(ancho * i) + Math.floor(Math.random() * ancho));
}

/**
 * Arma el guion completo. Se genera por equipo y por lanzamiento: dos
 * equipos vecinos no ven caer lo mismo en el mismo orden, así que no se
 * resuelve copiando la pantalla de al lado — pero los HECHOS que
 * importan (quién, desde dónde, a qué endpoint) son los mismos.
 */
function guionDelAtaque(largo = 56): PeticionTrafico[] {
  const lineas: PeticionTrafico[] = [];

  for (let i = 0; i < largo; i++) {
    if (Math.random() < RUIDO) {
      // Las cuentas que no existen: mucho volumen, muchas máquinas.
      const [metodo, ruta] = azar(PUERTAS).split(' ');
      lineas.push({
        metodo, ruta,
        cuenta: azar(NO_REGISTRADAS),
        ip: azar(IPS_HOSTILES),
        // El código da igual para juzgar: aquí solo aporta textura.
        codigo: azar([200, 401, 401, 403, 404, 404, 500]),
      });
    } else {
      lineas.push({ ...azar(RUTINA) });
    }
  }

  // Las dos cuentas del eje 1 tienen que asomar sí o sí: con el ruido
  // bajo, dejar su presencia al azar puro es dejar la fase sin respuesta.
  for (const cuenta of NO_REGISTRADAS) {
    if (lineas.some((l) => l.cuenta === cuenta)) continue;
    const [metodo, ruta] = azar(PUERTAS).split(' ');
    lineas.splice(CABECERA + Math.floor(Math.random() * (largo - CABECERA)), 0, {
      metodo, ruta, cuenta, ip: azar(IPS_HOSTILES), codigo: azar([200, 401, 403, 404]),
    });
  }

  // Los dos ejes finos, repartidos. Se siembra de atrás hacia delante
  // para que cada `splice` no desplace las posiciones aún pendientes.
  const reparto = (fuente: PeticionTrafico[]) => {
    const pos = posiciones(lineas.length, fuente.length);
    return fuente.map((p, i) => ({ p, pos: pos[i] }));
  };
  const siembra = [...reparto(IP_INTRUSA), ...reparto(ENDPOINT_VETADO)]
    .sort((a, b) => b.pos - a.pos);

  for (const { p, pos } of siembra) lineas.splice(pos, 0, { ...p });
  return lineas;
}

const INTERVALO_MS = 900;

// ============================================================
//  FILTROS DEL MONITOR
//
//  Sesenta y dos líneas en bucle a 900 ms son una manguera, y
//  transcribirlas no es razonar: el equipo se agota copiando en vez de
//  pensando. Acotar la vista devuelve el reto a donde debe estar.
//
//  Solo se acota por lo que VIAJA en la petición. No hay filtro por
//  departamento, y la ausencia es el diseño: el servidor sabe de qué
//  departamento es cada cuenta, así que `trafico departamento finanzas`
//  le enseñaría a Pantalla que j.ortega es de Finanzas sin habérselo
//  preguntado a Datos, y el eje 3 volvería a resolverse desde un solo
//  puesto —la misma fuga que cerramos en `perfil` y `usuarios`, por otra
//  puerta—. Esa vista se compone a mano, `trafico cuenta j.ortega cuenta
//  c.pineda`, con los nombres que Datos lee en voz alta: el filtro pasa
//  a ser un motivo para hablar en vez de un atajo para no hacerlo.
// ============================================================

const CLAVES_FILTRO: Record<string, keyof FiltroTrafico> = {
  cuenta: 'cuenta', usuario: 'cuenta',
  ip: 'ip', origen: 'ip',
  ruta: 'ruta', endpoint: 'ruta',
  metodo: 'metodo',
  codigo: 'codigo', respuesta: 'codigo',
};

const FIN_FILTRO = ['todo', 'todos', 'limpiar', 'quitar'];
const FIN_MONITOR = ['detener', 'parar', 'stop'];

/** `cuenta=j.ortega · ruta=/api/exportar`, para la cabecera de la salida. */
const describirFiltro = (f: FiltroTrafico): string =>
  Object.entries(f)
    .map(([clave, valores]) => `${clave}=${(valores as (string | number)[]).join(', ')}`)
    .join(' · ');

type Parseo = { filtro: FiltroTrafico } | { fallo: ResultadoComando };

/** Lee pares `clave valor`. Repetir una clave SUMA; claves distintas ACOTAN. */
function parsearFiltro(palabras: string[]): Parseo {
  const filtro: FiltroTrafico = {};

  for (let i = 0; i < palabras.length; i += 2) {
    const clave = palabras[i];
    const valor = palabras[i + 1];

    // Alguien lo va a teclear, y merece una explicación en vez de un
    // «no reconozco eso»: es la pregunta correcta en la mesa equivocada.
    if (clave.startsWith('departamento')) {
      return {
        fallo: {
          bloques: [texto(
            [
              'El monitor solo ve lo que viaja en la petición: cuenta, origen,',
              'ruta, método y código. De qué departamento es una cuenta no viaja',
              'en ninguna parte — está en `empleados`, en la base de datos.',
              'Pregunta a Datos qué cuentas son de ese departamento y acótalas',
              'por nombre, que se pueden encadenar:',
              '  trafico cuenta <nombre> cuenta <otro>',
            ],
            'Por departamento, no',
          )],
        },
      };
    }

    const campo = CLAVES_FILTRO[clave];
    if (!campo) {
      return {
        fallo: {
          bloques: [error(
            `No puedo acotar por «${clave}». Se acota por: cuenta, ip, ruta, metodo, codigo.`,
          )],
        },
      };
    }
    if (!valor) {
      return { fallo: { bloques: [error(`Falta el valor de «${clave}».`)] } };
    }

    switch (campo) {
      case 'codigo': {
        const n = Number(valor);
        if (!Number.isInteger(n)) {
          return { fallo: { bloques: [error(`«${valor}» no es un código de respuesta.`)] } };
        }
        filtro.codigo = [...(filtro.codigo ?? []), n];
        break;
      }
      case 'cuenta': filtro.cuenta = [...(filtro.cuenta ?? []), valor]; break;
      case 'ip':     filtro.ip     = [...(filtro.ip ?? []), valor]; break;
      case 'ruta':   filtro.ruta   = [...(filtro.ruta ?? []), valor]; break;
      case 'metodo': filtro.metodo = [...(filtro.metodo ?? []), valor]; break;
    }
  }

  return { filtro };
}

/** La apertura del monitor. Se repite al arrancar acotado y sin acotar. */
const ABRE_MONITOR = () => ({
  accion: 'iniciar' as const,
  intervaloMs: INTERVALO_MS,
  peticiones: guionDelAtaque(),
  // El ataque no se agota: si el equipo tarda, sigue cayendo.
  bucle: true,
});


// ============================================================
//  QUIÉN HAY QUE AISLAR, Y POR QUÉ
//
//  `bloquear` pide cuenta Y motivo. El motivo ES el razonamiento: sin
//  él, con solo siete cuentas en el tráfico, barrerlas todas costaba
//  60 s de cuarentena y ganaba a pensar.
//
//  `motivos` acepta todo lo que sea HONESTAMENTE cierto de esa cuenta.
//  svc.backup y k.moreno también tocan rutas que no son de ningún
//  departamento, así que «permiso» no es una respuesta equivocada: es
//  una respuesta menos profunda, y se acepta con un matiz en vez de
//  castigarse. `principal` es el eje que explica la salida.
// ============================================================

type Culpable = {
  motivos: string[];
  principal: string;
  explicacion: string;
  /** Se añade cuando el equipo acierta por un motivo cierto pero
   *  secundario: cuenta igual, y de paso aprende el orden correcto. */
  matiz?: string;
};

const CULPABLES: Record<string, Culpable> = {
  'svc.backup': {
    motivos: ['no-registrada', 'permiso'],
    principal: 'no-registrada',
    explicacion: 'No figura en `empleados`: no es una cuenta del sistema.',
    matiz: 'Sí, también tocaba rutas que no son de nadie. Pero eso se pregunta después: '
         + 'primero, esa cuenta no existe.',
  },
  'k.moreno': {
    motivos: ['no-registrada', 'permiso'],
    principal: 'no-registrada',
    explicacion: 'No figura en `empleados`: no es una cuenta del sistema.',
    matiz: 'Sí, también tocaba rutas que no son de nadie. Pero eso se pregunta después: '
         + 'primero, esa cuenta no existe.',
  },
  'a.duarte': {
    motivos: ['maquina'],
    principal: 'maquina',
    explicacion: 'Cuenta real haciendo su trabajo, pero desde 188.42.19.6: '
               + 'una máquina que en `equipos` no tiene dueño.',
  },
  'j.ortega': {
    motivos: ['permiso'],
    principal: 'permiso',
    explicacion: 'Cuenta real, desde su máquina, exportando nómina: '
               + '`permisos` reserva /api/exportar/* a Cumplimiento, y Finanzas no lo es.',
  },
};
const TOTAL_CULPABLES = Object.keys(CULPABLES).length;

// ---------- El circuito cerrado de la sala ----------
//
//  Dos camaras del centro de datos. No dicen QUIEN esta entrando —eso es
//  justo lo que hay que deducir cruzando el trafico con el padron— sino
//  cuanto queda: un armario encendido por cada cuenta suelta. Es el
//  marcador de la fase, y se apaga solo segun se aisla.

const CAMARAS: CamaraDef[] = [
  { n: 1, id: 'sala', nombre: 'SALA DE SERVIDORES', sector: 'S-01', que: 'los armarios y cuantas cuentas siguen sueltas' },
  { n: 2, id: 'enlace', nombre: 'PUERTA DE ENLACE', sector: 'S-02', que: 'el trafico que entra de fuera' },
];

function escenaSala(sueltas: number, f: number): string[] {
  // Un armario por cuenta que falta por aislar. Encendido es que sigue
  // dentro; apagado, que ya no. Siete columnas por armario: cuatro
  // armarios y sus separaciones caben justo en el lienzo.
  const luz = (i: number) => (i < sueltas ? (f % 2 === 0 ? '[*]' : '[o]') : '[ ]');
  const fila = (pinta: (i: number) => string) =>
    tira('  ' + [0, 1, 2, 3].map(pinta).join(' '), ANCHO_CAMARA);
  return lienzo([
    '                                    ',
    fila(() => '.-----.'),
    fila((i) => `|#${luz(i)}#|`),
    fila(() => '|#####|'),
    fila((i) => `|#${luz(i)}#|`),
    fila(() => '|#####|'),
    fila(() => "'-----'"),
    '                                    ',
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira(sueltas === 0
      ? '  todos los armarios en silencio.'
      : `  ${sueltas} armario(s) con actividad ajena.`, ANCHO_CAMARA),
  ]);
}

function escenaEnlace(activo: boolean, f: number): string[] {
  const flecha = (i: number) => (activo && (f + i) % 3 === 0 ? '====>' : '     ');
  // La caseta, con el interior a 17 columnas clavadas.
  const caja = (dentro: string) => tira('        |' + tira(dentro, 17) + '|', ANCHO_CAMARA);
  return lienzo([
    '        [ ENLACE  EXTERIOR ]        ',
    '                                    ',
    tira('  ' + [0, 1, 2, 3].map(flecha).join(' '), ANCHO_CAMARA),
    '                                    ',
    '        .-----------------.         ',
    caja(`${activo && f % 2 === 0 ? '[#]' : '[ ]'} CORTAFUEGOS  `),
    "        '-----------------'         ",
    '                                    ',
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira(activo ? '  captura abierta. sigue entrando.' : '  sin captura. la linea esta quieta.', ANCHO_CAMARA),
  ]);
}

function vistaDeCamaras(estado: Record<string, unknown>, traficoActivo: boolean) {
  const aisladas = yaBloqueadas(estado).length;
  const sueltas = Math.max(0, TOTAL_CULPABLES - aisladas);
  const fallos = fallosDe(estado);

  return circuitoCerrado(CAMARAS, estado, (cam) => {
    const escena: Escena = cam.id === 'sala'
      ? { fotogramas: [0, 1].map((f) => escenaSala(sueltas, f)), ritmo: 620 }
      : { fotogramas: [0, 1, 2].map((f) => escenaEnlace(traficoActivo, f)), ritmo: 320 };
    const rotulos: Rotulo[] = [
      { texto: `AISLADAS ${aisladas}/${TOTAL_CULPABLES}`, tono: aisladas === TOTAL_CULPABLES ? 'ok' : 'neutro' },
    ];
    if (cam.id === 'enlace') {
      rotulos.push({ texto: traficoActivo ? 'CAPTURA ABIERTA' : 'CAPTURA CERRADA', tono: 'neutro' });
    }
    if (fallos > 0) rotulos.push({ texto: `${fallos} EN FALSO`, tono: 'alerta' });
    if (sueltas > 0) rotulos.push({ texto: `${sueltas} SUELTA(S)`, tono: 'alerta' });
    return {
      escena,
      rotulos,
      clave: `${cam.n}:${aisladas}:${fallos}:${traficoActivo ? 'v' : 'q'}`,
    };
  });
}


/** Registradas y sin una sola petición inválida. Acusarlas cuesta. */
const LIMPIAS = ['m.rivas', 's.cabral', 'c.pineda'];

/** Todo nombre que puede leerse en el monitor. Fuera de aquí, es un typo. */
const EN_EL_TRAFICO = new Set([...Object.keys(CULPABLES), ...LIMPIAS]);

// Los tres ejes, y cómo se los puede llamar. `normalizar` ya quita los
// acentos, así que «máquina» llega aquí como «maquina». La lista es
// generosa a propósito: bajo presión nadie teclea el término exacto, y
// castigar el sinónimo sería castigar el vocabulario, no el razonamiento.
const MOTIVOS: Record<string, string> = {
  'no-registrada': 'no-registrada', 'no registrada': 'no-registrada',
  'noregistrada': 'no-registrada', 'no-registrado': 'no-registrada',
  'no registrado': 'no-registrada', 'no existe': 'no-registrada',
  'inexistente': 'no-registrada', 'fantasma': 'no-registrada',
  'registro': 'no-registrada', 'padron': 'no-registrada', 'empleados': 'no-registrada',

  'maquina': 'maquina', 'equipo': 'maquina', 'equipos': 'maquina',
  'ip': 'maquina', 'origen': 'maquina', 'puesto': 'maquina',

  'permiso': 'permiso', 'permisos': 'permiso', 'endpoint': 'permiso',
  'ruta': 'permiso', 'politica': 'permiso', 'departamento': 'permiso',
};

const NOMBRE_EJE: Record<string, string> = {
  'no-registrada': 'la cuenta no está registrada',
  'maquina': 'no entra desde su máquina',
  'permiso': 'no puede tocar ese endpoint',
};

/**
 * Cuarentena creciente. Plana en 20 s, barrer las siete cuentas costaba
 * un minuto largo y salía a cuenta; creciendo, el tercer palo de ciego
 * ya cuesta minuto y medio y la fuerza bruta deja de competir con
 * pensar. El primer error sigue siendo barato: equivocarse una vez
 * mientras se razona es parte del juego.
 */
const CUARENTENAS_MS = [20_000, 45_000, 90_000];
const cuarentenaPara = (fallosPrevios: number) =>
  CUARENTENAS_MS[Math.min(fallosPrevios, CUARENTENAS_MS.length - 1)];

const texto = (lineas: string[], titulo?: string) => ({ tipo: 'texto' as const, titulo, lineas });
const error = (t: string) => ({ tipo: 'error' as const, texto: t });

/** Las cuentas ya aisladas por ESTE equipo, leídas del estado persistido. */
const yaBloqueadas = (estado: Record<string, unknown>): string[] =>
  Array.isArray(estado.bloqueadas) ? (estado.bloqueadas as string[]) : [];

const fallosDe = (estado: Record<string, unknown>): number =>
  typeof estado.fallos === 'number' ? estado.fallos : 0;

function ayuda(): ResultadoComando {
  return {
    bloques: [
      texto(
        [
          'trafico                     — abrir el monitor del ataque en vivo',
          'trafico <clave> <valor>     — acotar la vista (ver abajo)',
          'trafico todo                — quitar el filtro, seguir capturando',
          'trafico detener             — cerrar el monitor',
          'permisos                    — qué departamento manda en cada endpoint',
          'politica                    — política de seguridad vigente',
          'perfil <departamento>       — autorizaciones de un departamento',
          'whois <ip>                  — de dónde sale una dirección',
          'bloquear <cuenta> <motivo>  — aislar una cuenta, nombrando la regla',
          'estado                      — cuántas llevas aisladas',
          ...AYUDA_CAMARAS,
        ],
        'Comandos disponibles',
      ),
      texto(
        [
          'Una petición es inválida si falla cualquiera de las tres:',
          '  1. no-registrada  la cuenta no está en `empleados`',
          '  2. maquina        no entra desde la máquina que tiene asignada',
          '  3. permiso        su departamento no manda en ese endpoint',
          'El código de respuesta no importa: un intento rechazado sigue',
          'siendo una petición que esa cuenta no debía hacer.',
        ],
        'Las tres comprobaciones',
      ),
      texto(
        [
          'cuenta <nombre>    ip <dirección>    ruta <prefijo>',
          'metodo <GET|POST>  codigo <número>',
          '',
          'Se encadenan: repetir una clave SUMA, mezclar claves ACOTA.',
          '  trafico ip <dirección>             — todo lo que entra por esa máquina',
          '  trafico ruta /api/exportar         — quién exporta, sea quien sea',
          '  trafico cuenta <nombre> cuenta <otro>   — solo esas dos',
          'No se puede acotar por departamento: eso no viaja en la petición.',
          'Pide los nombres a Datos y acótalos por cuenta.',
        ],
        'Acotar el monitor',
      ),
      texto(
        [
          'Esta terminal solo sabe de DEPARTAMENTOS: qué puede tocar cada uno.',
          'Qué cuentas existen, de qué departamento es cada una y desde qué',
          'máquina entra está en la base de datos. Pregúntaselo a quien la tiene.',
        ],
        'Lo que esta terminal NO sabe',
      ),
      texto([
        `Hay que aislar ${TOTAL_CULPABLES} cuentas, y cada bloqueo se pide con su motivo:`,
        '  bloquear <cuenta> no-registrada | maquina | permiso',
        'Acusar en falso deja el sistema en cuarentena, y cada error cuesta más que el anterior.',
      ]),
    ],
  };
}

export const enemigo: ModuloFase = {
  key: 'fase-2-enemigo',

  proyectar(role: Role, ctx) {
    const bloqueadas = yaBloqueadas(ctx.estado);

    switch (role) {
      case 'DATOS':
        // El esquema entero y NADA más: ni los permisos ni las salidas.
        return {
          titulo: 'Base de datos · padrón del sistema',
          nota: 'Tú tienes quién existe, de qué departamento es y desde qué máquina entra. '
              + 'Qué puede tocar cada departamento, y el ataque en curso, los ve Pantalla. '
              + 'Ninguna petición se juzga sin las dos mitades.',
          lienzo: { w: 1000, h: 520 },
          ...ESQUEMA,
        };

      case 'PANTALLA':
        // Historial reconstruido desde la bitácora: al reconectar, el
        // Operador de Pantalla recupera todo lo que ya se había impreso.
        return {
          salidas: ctx.salidas,
          traficoActivo: ctx.traficoActivo,
          filtroTrafico: ctx.filtroTrafico,
          nota: 'Tú ves la sala por circuito cerrado, las peticiones que entran y lo que '
              + 'responde el sistema. La política habla de departamentos, no de personas: '
              + 'para saber de quién es una cuenta, pregunta a Datos. Quien escribe no ve '
              + 'nada: cántaselo.',
          camaras: vistaDeCamaras(ctx.estado, ctx.traficoActivo),
        };

      case 'TERMINAL':
        // A ciegas de verdad: lo único que recibe es que existe `ayuda`
        // y el marcador de su propio trabajo, que él mismo tecleó.
        return {
          pista: 'Escribe `ayuda` y pregunta a Pantalla qué apareció. También mandas tú '
               + 'las cámaras de la sala, aunque no las veas.',
          aisladas: bloqueadas.length,
          camara: typeof ctx.estado.camara === 'number' ? ctx.estado.camara : 1,
          total: TOTAL_CULPABLES,
          cuarentenaHasta: (ctx.estado.cuarentenaHasta as number) ?? null,
        };
    }
  },

  ejecutar(comandoBruto: string, ctx: ContextoComando): ResultadoComando {
    const cuarentenaHasta = (ctx.estado.cuarentenaHasta as number) ?? 0;
    if (ctx.ahora < cuarentenaHasta) {
      const restan = Math.ceil((cuarentenaHasta - ctx.ahora) / 1000);
      return { bloques: [error(`Sistema en cuarentena. Reintenta en ${restan} s.`)] };
    }

    const cmd = normalizar(comandoBruto);
    const [verbo, ...resto] = cmd.split(' ');
    const arg = resto.join(' ');
    const bloqueadas = yaBloqueadas(ctx.estado);

    // El circuito cerrado se atiende antes del switch: es el mismo mando
    // en todas las fases que tienen cámaras.
    const mando = mandoDeCamaras(CAMARAS, verbo, arg, ctx.estado);
    if (mando) return mando;

    switch (verbo) {
      case 'ayuda':
      case 'help':
        return ayuda();

      // El único comando que no responde una vez, sino que deja un grifo
      // abierto: a partir de aquí las peticiones caen solas en Pantalla.
      case 'trafico':
      case 'monitor': {
        if (FIN_MONITOR.includes(arg)) {
          return {
            flujo: { accion: 'detener' },
            bloques: [texto(['Monitor cerrado. El ataque sigue, pero ya no lo estás mirando.'])],
          };
        }

        // Quitar el filtro sin reiniciar el guion: el equipo vuelve a ver
        // la manguera entera sin perder el hilo de lo que seguía.
        if (FIN_FILTRO.includes(arg)) {
          if (!ctx.traficoActivo) {
            return { bloques: [error('El monitor no está abierto. Escribe `trafico`.')] };
          }
          return {
            flujo: { accion: 'filtrar', filtro: null },
            bloques: [texto(['Filtro retirado. Vuelve a caer el ataque completo.'])],
          };
        }

        if (arg) {
          const r = parsearFiltro(arg.split(' '));
          if ('fallo' in r) return r.fallo;
          const desc = describirFiltro(r.filtro);

          // Acotar lo que ya cae NO reinicia la captura; pedir el monitor
          // ya acotado, en cambio, tiene que abrirlo.
          if (ctx.traficoActivo) {
            return {
              flujo: { accion: 'filtrar', filtro: r.filtro },
              bloques: [texto(
                [
                  'El ataque sigue entero por debajo: solo cambia lo que se pinta.',
                  '`trafico todo` devuelve la vista completa.',
                ],
                `Monitor acotado · ${desc}`,
              )],
            };
          }
          return {
            flujo: { ...ABRE_MONITOR(), filtro: r.filtro },
            bloques: [texto(
              [
                'Solo se pintan las peticiones que encajan. El ataque cae entero por debajo.',
                '`trafico todo` devuelve la vista completa.',
              ],
              `Monitor abierto y acotado · ${desc}`,
            )],
          };
        }

        return {
          flujo: ABRE_MONITOR(),
          bloques: [
            texto(
              [
                'Peticiones entrantes en vivo. Columnas: hora · método · ruta · cuenta · origen · respuesta.',
                'De cada una hay que comprobar tres cosas: si la cuenta está registrada,',
                'si entra desde su máquina y si su departamento manda en ese endpoint.',
                'Las dos primeras las responde la base de datos. La tercera, las dos mitades:',
                '`permisos` dice de qué departamento es la ruta; de qué departamento es la',
                'cuenta solo lo sabe el Operador de Datos.',
                '',
                'Si el caudal agobia, acota: `trafico cuenta <cuenta>`, `trafico ip <ip>`,',
                '`trafico ruta <prefijo>`. Se encadenan, y `trafico todo` devuelve la vista entera.',
              ],
              'Monitor de tráfico abierto',
            ),
          ],
        };
      }

      case 'permisos':
        return { bloques: [{ tipo: 'lista', titulo: 'Endpoints y qué departamento manda en cada uno', items: PERMISOS }] };

      case 'politica':
        return { bloques: [{ tipo: 'lista', titulo: 'Política de seguridad vigente', items: POLITICA }] };

      // `usuarios` existía y listaba el padrón entero: respondía él solo
      // la primera de las tres preguntas y dejaba a Datos sin la mitad
      // de su trabajo. Ahora devuelve el redireccionamiento, que además
      // enseña dónde vive cada cosa.
      case 'usuarios':
      case 'cuentas':
        return {
          bloques: [texto(
            [
              'Esta terminal no tiene el padrón: solo la política, y la política',
              'se escribe por departamento.',
              'Qué cuentas existen está en la tabla `empleados`, en la base de datos.',
              'Pregúntale al Operador de Datos.',
            ],
            'Aquí no',
          )],
        };

      case 'estado': {
        const faltan = TOTAL_CULPABLES - bloqueadas.length;
        const fallos = fallosDe(ctx.estado);
        return {
          bloques: [
            texto(
              bloqueadas.length ? bloqueadas.map((c) => `[X] ${c}`) : ['Ninguna todavía.'],
              `Aisladas ${bloqueadas.length} de ${TOTAL_CULPABLES}`,
            ),
            texto([
              faltan > 0 ? `Faltan ${faltan}.` : 'No falta ninguna.',
              fallos ? `Bloqueos indebidos: ${fallos}.` : 'Sin bloqueos indebidos.',
            ]),
          ],
        };
      }

      case 'perfil': {
        if (!arg) {
          return { bloques: [error(`Falta el departamento. Ejemplo: perfil cumplimiento`)] };
        }
        // `Ventas (remoto)` leído en voz alta desde `empleados` tiene que
        // valer igual que `ventas`.
        const clave = Object.keys(PERFILES).find((k) => arg === k || arg.startsWith(k));
        if (clave) {
          return { bloques: [{ tipo: 'lista', titulo: `Perfil · ${clave}`, items: PERFILES[clave] }] };
        }
        // La MISMA respuesta para un departamento inventado y para una
        // cuenta real. Si aquí se distinguieran, esta terminal volvería a
        // confirmar sola qué cuentas existen, que es justo lo que no debe.
        return {
          bloques: [texto(
            [
              `«${arg}» no es un departamento.`,
              `Departamentos: ${Object.keys(PERFILES).join(' · ')}.`,
              'Si es una cuenta, esta terminal no sabe nada de ella:',
              'pregunta a Datos de qué departamento es y vuelve con el nombre del departamento.',
            ],
            'Perfil por departamento',
          )],
        };
      }

      case 'whois': {
        if (!arg) return { bloques: [error('Falta la dirección. Ejemplo: whois 10.4.2.18')] };
        const info = IPS[arg];
        if (!info) return { bloques: [error(`Sin datos para la dirección «${arg}».`)] };
        return {
          bloques: [{
            tipo: 'lista',
            titulo: `whois ${arg}`,
            items: [
              { clave: 'Origen', valor: info.origen },
              { clave: 'Rango corporativo', valor: info.interna ? 'Sí (10.4.0.0/16)' : 'NO — fuera de la red' },
              { clave: 'A quién pertenece', valor: 'consúltalo en `equipos`' },
            ],
          }],
        };
      }

      case 'bloquear': {
        if (!arg) {
          return { bloques: [error('Falta el usuario y el motivo. Ejemplo: bloquear j.ortega permiso')] };
        }

        const [cuenta, ...restoMotivo] = arg.split(' ');
        const motivoBruto = restoMotivo.join(' ');

        if (bloqueadas.includes(cuenta)) {
          return { bloques: [texto([`«${cuenta}» ya estaba aislada. Aisladas ${bloqueadas.length} de ${TOTAL_CULPABLES}.`])] };
        }

        // Un nombre que no aparece en ninguna parte suele ser un typo de
        // alguien que lo oyó por la sala. No cuesta un intento fallido.
        if (!EN_EL_TRAFICO.has(cuenta)) {
          return { bloques: [error(`«${cuenta}» no aparece en el tráfico. Revisa cómo se escribe.`)] };
        }

        // Falta el motivo: no es un fallo, es una pregunta. Bajo presión
        // la gente teclea corto, y cobrar por eso sería cobrar por la
        // prisa en vez de por el razonamiento.
        if (!motivoBruto) {
          return {
            bloques: [texto(
              [
                `¿Por cuál de las tres? Repite el comando añadiendo el motivo:`,
                `  bloquear ${cuenta} no-registrada   — no está en \`empleados\``,
                `  bloquear ${cuenta} maquina         — no entra desde la suya`,
                `  bloquear ${cuenta} permiso         — su departamento no manda en esa ruta`,
              ],
              'Falta el motivo',
            )],
          };
        }

        const eje = MOTIVOS[motivoBruto];
        if (!eje) {
          return {
            bloques: [error(
              `No reconozco el motivo «${motivoBruto}». Son tres: no-registrada, maquina, permiso.`,
            )],
          };
        }

        const culpable = CULPABLES[cuenta];
        if (culpable && culpable.motivos.includes(eje)) {
          const ahoraBloqueadas = [...bloqueadas, cuenta];
          const restantes = TOTAL_CULPABLES - ahoraBloqueadas.length;
          const estado = { ...ctx.estado, bloqueadas: ahoraBloqueadas };
          const lineas = [culpable.explicacion];
          if (eje !== culpable.principal && culpable.matiz) lineas.push(culpable.matiz);

          if (restantes > 0) {
            lineas.push(`Siguen sueltas ${restantes}. El ataque continúa.`);
            return {
              estado,
              bloques: [{
                tipo: 'exito',
                titulo: `Cuenta ${cuenta} aislada · ${ahoraBloqueadas.length} de ${TOTAL_CULPABLES}`,
                lineas,
              }],
            };
          }

          lineas.push(
            'Ninguna petición inválida queda en pie: sesiones terminadas y',
            'credenciales revocadas. Contención completada.',
          );
          return {
            resuelto: true,
            estado,
            bloques: [{
              tipo: 'exito',
              titulo: `Cuenta ${cuenta} aislada · ${TOTAL_CULPABLES} de ${TOTAL_CULPABLES}`,
              lineas,
            }],
          };
        }

        // Rechazo. La MISMA salida para una cuenta limpia y para una
        // culpable señalada por el eje equivocado: si se distinguieran,
        // fallar el motivo confirmaría gratis que la cuenta era la buena
        // y el barrido volvería a funcionar, solo que en dos pasadas.
        const fallos = fallosDe(ctx.estado);
        const castigo = cuarentenaPara(fallos);
        return {
          fallo: true,
          estado: { ...ctx.estado, fallos: fallos + 1, cuarentenaHasta: ctx.ahora + castigo },
          bloques: [
            error(`Bloqueo rechazado: no consta ninguna petición de «${cuenta}» en la que ${NOMBRE_EJE[eje]}.`),
            texto([`Sistema en cuarentena ${castigo / 1000} s por bloqueo indebido.`]),
          ],
        };
      }

      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto}». Prueba \`ayuda\`.`)] };
    }
  },
};
