// ============================================================
//  FASE 2 — El Rastro
//
//  La Fase 2 aisló las cuentas. Eso era el síntoma. Esta fase pregunta
//  por dónde entró, y la respuesta desmiente lo que todo el mundo va a
//  suponer: la dirección de fuera que cerró la Fase 2 no es la entrada,
//  es la SALIDA. Lo primero que se comprometió estaba dentro.
//
//  El hilo es una llave SSH que no figura a nombre de nadie. Aparece en
//  cuatro saltos seguidos y el equipo tiene que reconstruirlos.
//
//  Frío, sin reloj: la Fase 2 era presión en vivo y la Fase 3 se llama
//  «antes del exfiltrado». Esta es la que se resuelve leyendo despacio,
//  y por eso no abre ningún flujo.
//
//  EL REPARTO, que es la fase entera:
//
//    PANTALLA  la bitácora de sesiones —horas, direcciones IP, huellas y
//              si la conexión entró o fue rechazada— y la política de
//              segmentación. No sabe qué máquina es cada dirección ni de
//              quién es ninguna llave.
//
//    DATOS     el inventario: qué equipo es cada IP, en qué segmento
//              está y para qué sirve; y a nombre de quién está cada
//              llave. No ve ni una sesión.
//
//  Ningún salto se puede afirmar desde un solo puesto: la evidencia de
//  que la conexión ocurrió está en la bitácora, y los NOMBRES con los
//  que se declara —que es lo que pide `enlazar`— solo están en el
//  inventario. Igual que en la Fase 2, el vocabulario de la respuesta
//  vive al otro lado de la mesa.
// ============================================================

import type { Role } from '../lib/constants.js';
import type { ContextoComando, ModuloFase, ResultadoComando } from './types.js';
import { normalizar } from './types.js';
// Esta fase conserva sus propios ayudantes de bloque. Del comun solo toma
// el circuito cerrado, que es de todas las que tienen camaras.
import {
  ANCHO_CAMARA, AYUDA_CAMARAS, circuitoCerrado, lienzo, mandoDeCamaras, numero, tira,
  type CamaraDef, type Escena, type Rotulo,
} from './comun.js';

// ---------- La mitad del Operador de Datos ----------
//
// Tres tablas, tres preguntas distintas: qué es cada dirección, para qué
// sirve ese equipo, y de quién es cada llave. Ninguna sobra.
const ESQUEMA = {
  tablas: [
    {
      // La traducción IP → equipo. Sin esto, la bitácora es una lista de
      // números y nadie puede nombrar un salto.
      id: 'equipos',
      nombre: 'equipos',
      x: 40, y: 30, w: 330,
      descripcion: 'Inventario de máquinas',
      clave: 'id',
      columnas: ['id', 'host', 'ip', 'segmento', 'estado'],
      filas: [
        ['H1', 'WEB-01', '10.4.9.2', 'dmz', 'en servicio'],
        ['H2', 'CONTA-03', '10.4.5.12', 'administracion', 'en servicio'],
        ['H3', 'BACKUP-01', '10.4.7.4', 'servicios', 'en servicio'],
        ['H4', 'SALTO-02', '10.4.7.9', 'servicios', 'en servicio'],
        ['H5', 'NOMINA-02', '10.4.5.30', 'administracion', 'en servicio'],
        // La entrada. Sigue encendido y sigue enchufado, pero para el
        // inventario dejó de existir hace dos años.
        ['H6', 'PRUEBAS-07', '10.4.6.21', 'laboratorio', 'RETIRADO 2024'],
        ['H7', 'INFRA-01', '10.4.2.18', 'puestos', 'en servicio'],
        ['H8', 'CUMPL-01', '10.4.2.27', 'puestos', 'en servicio'],
      ],
    },
    {
      // Para qué sirve cada equipo y de qué departamento es. Resuelve las
      // dos preguntas que la política deja abiertas: cuál es el bastión y
      // quién tiene turno de noche.
      id: 'servicios',
      nombre: 'servicios',
      x: 660, y: 30, w: 300,
      descripcion: 'Función de cada máquina',
      clave: 'id',
      columnas: ['id', 'equipo_id', 'funcion', 'departamento'],
      filas: [
        ['S1', 'H1', 'web publico', 'Infraestructura'],
        ['S2', 'H2', 'puesto de trabajo', 'Finanzas'],
        ['S3', 'H3', 'respaldos', 'Infraestructura'],
        ['S4', 'H4', 'BASTION', 'Infraestructura'],
        ['S5', 'H5', 'servidor de nominas', 'Finanzas'],
        ['S6', 'H6', 'banco de pruebas', '— sin asignar —'],
        ['S7', 'H7', 'puesto de trabajo', 'Infraestructura'],
        ['S8', 'H8', 'puesto de trabajo', 'Cumplimiento'],
      ],
    },
    {
      // El hilo. Dos llaves sin dueño, y solo una de las dos llegó a
      // entrar en algún sitio: averiguar cuál es el trabajo.
      id: 'llaves',
      nombre: 'llaves',
      x: 40, y: 300, w: 470,
      descripcion: 'Llaves autorizadas en el parque',
      clave: 'id',
      columnas: ['id', 'huella', 'dueno'],
      filas: [
        ['K1', 'SHA256:c41b7e', 'm.rivas · Infraestructura'],
        ['K2', 'SHA256:1f6c30', 'copia-nocturna · servicio automatico'],
        ['K3', 'SHA256:7c04f9', '— SIN DUENO —'],
        ['K4', 'SHA256:9f2ae1', '— SIN DUENO —'],
        ['K5', 'SHA256:4b91cc', 'd.salas · baja en 2024'],
      ],
    },
  ],
  relaciones: [
    { desde: 'servicios', campo: 'equipo_id', hasta: 'equipos' },
  ],
} as const;

// ---------- La mitad del Operador de Pantalla ----------
//
// REGLA DE ORO, la misma que en la Fase 2: aquí no se escribe ni un
// nombre de equipo ni un dueño de llave. Todo va por SEGMENTO y por
// FUNCIÓN. En cuanto una línea diga «SALTO-02», Pantalla puede traducir
// la bitácora sola y el Operador de Datos sobra.
const POLITICA = [
  { clave: 'invitados', valor: 'Solo Internet. Ningun equipo de invitados alcanza la red interna.' },
  { clave: 'laboratorio', valor: 'Aislado. No debe iniciar conexiones hacia ningun otro segmento.' },
  { clave: 'dmz', valor: 'No inicia conexiones hacia dentro.' },
  { clave: 'puestos', valor: 'Llega a servicios UNICAMENTE a traves del bastion.' },
  { clave: 'administracion', valor: 'Llega a servicios UNICAMENTE a traves del bastion.' },
  { clave: 'servicios', valor: 'Puede llegar a administracion y a puestos (mantenimiento).' },
  { clave: 'Turno nocturno', valor: 'Infraestructura, 00:00 - 06:00.' },
];

// ============================================================
//  LA BITÁCORA
//
//  Trece líneas, una noche. Origen y destino son DIRECCIONES: esta
//  bitácora no sabe nombres, y esa ignorancia es el reparto.
//
//  Lo que hay dentro, y por qué:
//
//    · 01:52 y 01:58 — la dirección de fuera llamando al servidor
//      público, con otra llave sin dueño, y RECHAZADA las dos veces. Es
//      el sospechoso que todo el mundo va a señalar primero. No entró.
//      Ahí vive el «no entró por donde crees».
//
//    · 02:03 — la entrada de verdad: un portátil que no está en el
//      inventario, desde la wifi de invitados, contra el banco de
//      pruebas que nadie recuerda, y por CONTRASEÑA, no por llave. No se
//      puede enlazar —el origen no tiene nombre— y no hace falta: es el
//      remate que se cuenta al resolver.
//
//    · 02:38 — LA TRAMPA. La huella correcta, el salto que apetece dar
//      (directo a nóminas)… y RECHAZADO. Quien enlace por huella sin
//      leer la última columna se come una cuarentena.
//
//    · m.rivas y la copia nocturna trabajan durante toda la noche, con
//      llave registrada y respetando el bastión. La actividad nocturna
//      no delata a nadie por sí sola: la política la autoriza.
// ============================================================

type Entrada = {
  hora: string;
  origen: string;
  destino: string;
  /** Vacía = sesión por contraseña, no por llave. */
  huella: string;
  ok: boolean;
};

const BITACORA: Entrada[] = [
  { hora: '01:52', origen: '188.42.19.6', destino: '10.4.9.2', huella: 'SHA256:7c04f9', ok: false },
  { hora: '01:58', origen: '188.42.19.6', destino: '10.4.9.2', huella: 'SHA256:7c04f9', ok: false },
  { hora: '02:00', origen: '10.4.7.4', destino: '10.4.5.12', huella: 'SHA256:1f6c30', ok: true },
  { hora: '02:03', origen: '10.4.8.77', destino: '10.4.6.21', huella: '', ok: true },
  { hora: '02:14', origen: '10.4.6.21', destino: '10.4.5.12', huella: 'SHA256:9f2ae1', ok: true },
  { hora: '02:29', origen: '10.4.2.18', destino: '10.4.7.9', huella: 'SHA256:c41b7e', ok: true },
  { hora: '02:31', origen: '10.4.7.9', destino: '10.4.7.4', huella: 'SHA256:c41b7e', ok: true },
  { hora: '02:38', origen: '10.4.5.12', destino: '10.4.5.30', huella: 'SHA256:9f2ae1', ok: false },
  { hora: '02:44', origen: '10.4.5.12', destino: '10.4.7.4', huella: 'SHA256:9f2ae1', ok: true },
  { hora: '02:51', origen: '10.4.7.4', destino: '10.4.7.9', huella: 'SHA256:9f2ae1', ok: true },
  { hora: '03:00', origen: '10.4.7.4', destino: '10.4.2.27', huella: 'SHA256:1f6c30', ok: true },
  { hora: '03:02', origen: '10.4.7.9', destino: '10.4.5.30', huella: 'SHA256:9f2ae1', ok: true },
  { hora: '03:19', origen: '10.4.5.30', destino: '188.42.19.6', huella: 'SHA256:9f2ae1', ok: true },
];

// ============================================================
//  LA CADENA
//
//  Cuatro saltos. Se pueden confirmar en cualquier orden: obligar a
//  seguirlos en secuencia castigaría al equipo que empieza por el final,
//  que es justo por donde llega quien viene de la Fase 2.
// ============================================================

type Salto = { desde: string; hasta: string; hora: string; porque: string };

const CADENA: Salto[] = [
  {
    desde: 'pruebas-07', hasta: 'conta-03', hora: '02:14',
    porque: 'Un banco de pruebas retirado del inventario alcanzando un puesto de '
          + 'administracion. El laboratorio esta aislado por politica: ese salto no deberia existir.',
  },
  {
    desde: 'conta-03', hasta: 'backup-01', hora: '02:44',
    porque: 'Administracion llegando a servicios sin pasar por el bastion. Aqui es '
          + 'donde se llevaron las credenciales de svc.backup que aislasteis en la Fase 2.',
  },
  {
    desde: 'backup-01', hasta: 'salto-02', hora: '02:51',
    porque: 'Con las credenciales del servidor de respaldos, el bastion se abre solo.',
  },
  {
    desde: 'salto-02', hasta: 'nomina-02', hora: '03:02',
    porque: 'Del bastion a nominas es un salto que la politica PERMITE. Ninguna regla '
          + 'lo detiene: aqui solo lo delata la llave.',
  },
];
const TOTAL_SALTOS = CADENA.length;

// ---------- El circuito cerrado del centro de datos ----------
//
//  Dos camaras de la noche del ataque. Lo que ensenan es el rastro YA
//  reconstruido: cada salto confirmado enciende el cable entre dos
//  maquinas. No adelantan ninguno —cual va despues de cual es la fase—
//  sino que dan cuerpo a lo que el equipo ya ha demostrado.

const CAMARAS: CamaraDef[] = [
  { n: 1, id: 'pasillo', nombre: 'PASILLO DE RACKS', sector: 'R-01', que: 'las maquinas y los saltos ya confirmados' },
  { n: 2, id: 'consola', nombre: 'CONSOLA DE GUARDIA', sector: 'R-02', que: 'el reloj de la noche y el marcador' },
];

/** Las cinco maquinas de la cadena, en el orden en que se saltaron. */
const MAQUINAS = [CADENA[0].desde, ...CADENA.map((x) => x.hasta)];

function escenaPasillo(hechos: number, f: number): string[] {
  // Un rack por maquina. El cable entre dos se enciende cuando ese salto
  // esta confirmado; el que sigue parpadea, para que se vea por donde va.
  const rack = (i: number) => (i <= hechos ? '[#]' : '[ ]');
  const cable = (i: number) => {
    if (i < hechos) return '===';
    if (i === hechos) return f % 2 === 0 ? '-  ' : ' - ';
    return '   ';
  };
  const linea = [0, 1, 2, 3, 4].map((i) => rack(i) + (i < 4 ? cable(i) : '')).join('');
  return lienzo([
    '                                    ',
    '  __________________________________',
    '                                    ',
    tira('  ' + [0, 1, 2, 3, 4].map(() => '.-.   ').join(''), ANCHO_CAMARA),
    tira('  ' + linea, ANCHO_CAMARA),
    tira('  ' + [0, 1, 2, 3, 4].map(() => "'-'   ").join(''), ANCHO_CAMARA),
    '                                    ',
    tira('  ' + [0, 1, 2, 3, 4].map((i) => tira(String(i + 1), 6)).join(''), ANCHO_CAMARA),
    '                                    ',
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira(hechos === 0
      ? '  ningun salto confirmado todavia.'
      : `  ${hechos} tramo(s) del rastro encendido(s).`, ANCHO_CAMARA),
  ]);
}

function escenaConsola(hechos: number, fallos: number, f: number): string[] {
  // Sin reloj atado al progreso: encadenar una hora a cada salto iria
  // ordenando la cadena por debajo, y ese orden es justo lo que el equipo
  // tiene que sacar de la bitacora. El marcador, si: es su propio trabajo.
  const caja = (dentro: string) => tira('   |' + tira(dentro, 28) + '|', ANCHO_CAMARA);
  return lienzo([
    '   .----------------------------.   ',
    caja(`  GUARDIA ${f % 2 === 0 ? '[o]' : '[ ]'}   TURNO NOCHE`),
    caja(''),
    caja(`  saltos confirmados   ${String(hechos).padStart(2, '0')}/${String(TOTAL_SALTOS).padStart(2, '0')}`),
    caja(`  enlaces en falso     ${String(fallos).padStart(2, '0')}`),
    caja(''),
    "   '----------------------------'   ",
    '                                    ',
    '            o                       ',
    '           /|\\                      ',
    '           / \\                      ',
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira('  el turno de noche, sin enterarse.', ANCHO_CAMARA),
  ]);
}

function vistaDeCamaras(estado: Record<string, unknown>) {
  const hechos = Array.isArray(estado.saltos) ? (estado.saltos as string[]).length : 0;
  const fallos = numero(estado, 'fallos');

  return circuitoCerrado(CAMARAS, estado, (cam) => {
    const escena: Escena = cam.id === 'pasillo'
      ? { fotogramas: [0, 1].map((f) => escenaPasillo(hechos, f)), ritmo: 460 }
      : { fotogramas: [0, 1].map((f) => escenaConsola(hechos, fallos, f)), ritmo: 900 };
    const rotulos: Rotulo[] = [
      { texto: `RASTRO ${hechos}/${TOTAL_SALTOS}`, tono: hechos === TOTAL_SALTOS ? 'ok' : 'neutro' },
    ];
    if (fallos > 0) rotulos.push({ texto: `${fallos} EN FALSO`, tono: 'alerta' });
    return { escena, rotulos, clave: `${cam.n}:${hechos}:${fallos}` };
  });
}

/** Los nombres que existen en el inventario. Fuera de aquí, es un typo. */
const HOSTS = new Set([
  'web-01', 'conta-03', 'backup-01', 'salto-02',
  'nomina-02', 'pruebas-07', 'infra-01', 'cumpl-01',
]);

/**
 * Cuarentena creciente, igual que en la Fase 2. Con ocho equipos hay 56
 * pares ordenados y solo cuatro son ciertos: plana, el barrido saldría a
 * cuenta; creciendo, no. El primer error sigue siendo barato.
 */
const CUARENTENAS_MS = [20_000, 45_000, 90_000];
const cuarentenaPara = (fallosPrevios: number) =>
  CUARENTENAS_MS[Math.min(fallosPrevios, CUARENTENAS_MS.length - 1)];

const texto = (lineas: string[], titulo?: string) => ({ tipo: 'texto' as const, titulo, lineas });
const error = (t: string) => ({ tipo: 'error' as const, texto: t });
const tablaBloque = (titulo: string, columnas: string[], filas: string[][]) =>
  ({ tipo: 'tabla' as const, titulo, columnas, filas });

const pintarHuella = (h: string) => h || '— contrasena —';
const pintarFila = (e: Entrada) =>
  [e.hora, e.origen, e.destino, pintarHuella(e.huella), e.ok ? 'OK' : 'RECHAZADO'];

const COLUMNAS = ['hora', 'origen', 'destino', 'huella', 'resultado'];

const confirmados = (estado: Record<string, unknown>): string[] =>
  Array.isArray(estado.saltos) ? (estado.saltos as string[]) : [];

const fallosDe = (estado: Record<string, unknown>): number =>
  typeof estado.fallos === 'number' ? estado.fallos : 0;

const clave = (desde: string, hasta: string) => `${desde}>${hasta}`;

/** `9f2a`, `9f2ae1` y `SHA256:9f2ae1` tienen que valer lo mismo: nadie
 *  teclea una huella entera desde el otro lado de la mesa. */
function coincideHuella(almacenada: string, consulta: string): boolean {
  if (!almacenada) return false;
  const limpia = (s: string) => normalizar(s).replace(/^sha256:/, '').replace(/[^0-9a-f]/g, '');
  const a = limpia(almacenada);
  const q = limpia(consulta);
  return q.length >= 3 && a.startsWith(q);
}

function ayuda(): ResultadoComando {
  return {
    bloques: [
      texto(
        [
          'bitacora                    — todas las sesiones de la noche',
          'huella <huella>             — donde aparece una llave, en orden',
          'segmentos                   — politica de segmentacion vigente',
          'enlazar <origen> <destino>  — confirmar un salto, por NOMBRE de equipo',
          'estado                      — cuantos saltos llevas confirmados',
          ...AYUDA_CAMARAS,
        ],
        'Comandos disponibles',
      ),
      texto(
        [
          'La bitacora habla en DIRECCIONES y esta terminal tambien: aqui no hay',
          'un solo nombre de equipo ni un solo dueno de llave.',
          'Que maquina es cada direccion, en que segmento esta y a nombre de quien',
          'esta cada llave: todo eso vive en el inventario, en la base de datos.',
          '`enlazar` pide NOMBRES, asi que ese salto hay que cruzarlo hablando.',
        ],
        'Lo que esta terminal NO sabe',
      ),
      texto(
        [
          `Hay que reconstruir ${TOTAL_SALTOS} saltos. Se pueden confirmar en cualquier orden.`,
          'Una conexion RECHAZADA no es un salto: es un intento que no ocurrio.',
          'Enlazar un salto que no existe deja el sistema en cuarentena, y cada',
          'error cuesta mas que el anterior.',
        ],
        `Reconstruir la cadena`,
      ),
    ],
  };
}

export const rastro: ModuloFase = {
  key: 'fase-7-rastro',

  proyectar(role: Role, ctx) {
    const hechos = confirmados(ctx.estado);

    switch (role) {
      case 'DATOS':
        return {
          titulo: 'Inventario · parque de maquinas y llaves',
          nota: 'Tu tienes que maquina es cada direccion, para que sirve y de quien es '
              + 'cada llave. Las sesiones de esa noche las ve Pantalla, y no sabe ni un '
              + 'nombre: sin ti, su bitacora es una lista de numeros.',
          lienzo: { w: 1000, h: 520 },
          ...ESQUEMA,
        };

      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          camaras: vistaDeCamaras(ctx.estado),
          nota: 'Tu tienes el centro de datos por circuito cerrado, la bitacora de la noche '
              + 'y la politica de segmentacion. Habla de direcciones y de segmentos, nunca de '
              + 'nombres: para saber que maquina es cada IP, pregunta a Datos. Quien escribe '
              + 'no ve nada: cantaselo.',
        };

      case 'TERMINAL':
        return {
          camara: numero(ctx.estado, 'camara') || 1,
          pista: 'Escribe `ayuda` y pregunta a Pantalla que aparecio.',
          saltos: hechos.length,
          total: TOTAL_SALTOS,
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

    // El circuito cerrado se atiende antes del switch: es el mismo mando
    // en todas las fases que tienen camaras.
    const mando = mandoDeCamaras(CAMARAS, verbo, arg, ctx.estado);
    if (mando) return mando;
    const hechos = confirmados(ctx.estado);

    switch (verbo) {
      case 'ayuda':
      case 'help':
        return ayuda();

      case 'bitacora':
      case 'sesiones':
        return {
          bloques: [
            tablaBloque('Sesiones · 03:00 h de anoche', COLUMNAS, BITACORA.map(pintarFila)),
            texto([
              'Origen y destino son direcciones. Que maquina es cada una lo tiene Datos.',
              'La ultima columna importa: RECHAZADO significa que esa conexion NO entro.',
            ]),
          ],
        };

      case 'segmentos':
      case 'politica':
        return { bloques: [{ tipo: 'lista', titulo: 'Politica de segmentacion vigente', items: POLITICA }] };

      // El inventario NO se consulta desde aquí. Igual que `usuarios` en la
      // Fase 2, este comando existe solo para mandar al sitio correcto.
      case 'equipos':
      case 'inventario':
      case 'llaves':
        return {
          bloques: [texto(
            [
              'Esta terminal no tiene el inventario: solo la bitacora y la politica.',
              'Que maquina es cada direccion, en que segmento esta y a nombre de quien',
              'esta cada llave estan en la base de datos.',
              'Preguntale al Operador de Datos.',
            ],
            'Aqui no',
          )],
        };

      case 'huella': {
        if (!arg) {
          return {
            bloques: [error(
              'Falta la huella. Las huellas estan en el inventario: pidesela a Datos, '
              + 'con los primeros caracteres basta.',
            )],
          };
        }

        const filas = BITACORA.filter((e) => coincideHuella(e.huella, arg));
        if (filas.length === 0) {
          // Mismo mensaje exista o no la llave: si se distinguieran, esta
          // terminal confirmaria sola que huellas hay en el parque, que es
          // justo lo que solo debe saber Datos.
          return {
            bloques: [texto(
              [`Ninguna sesion de esta noche usa una llave que empiece por «${arg}».`],
              `Huella ${arg}`,
            )],
          };
        }
        const entro = filas.filter((e) => e.ok).length;
        return {
          bloques: [
            tablaBloque(`Huella ${arg} · ${filas.length} sesiones`, COLUMNAS, filas.map(pintarFila)),
            texto([
              `${entro} entraron, ${filas.length - entro} fueron rechazadas.`,
              'Una llave rechazada en todas partes no llego a ningun sitio.',
            ]),
          ],
        };
      }

      case 'estado': {
        const faltan = TOTAL_SALTOS - hechos.length;
        const fallos = fallosDe(ctx.estado);
        // En el orden de la cadena, no en el que los fue encontrando el
        // equipo: lo que se está reconstruyendo es una secuencia.
        const lineas = CADENA
          .filter((s) => hechos.includes(clave(s.desde, s.hasta)))
          .map((s) => `[OK] ${s.hora}  ${s.desde.toUpperCase()} -> ${s.hasta.toUpperCase()}`);

        return {
          bloques: [
            texto(
              lineas.length ? lineas : ['Ninguno todavia.'],
              `Saltos confirmados ${hechos.length} de ${TOTAL_SALTOS}`,
            ),
            texto([
              faltan > 0 ? `Faltan ${faltan}.` : 'La cadena esta completa.',
              fallos ? `Enlaces rechazados: ${fallos}.` : 'Sin enlaces rechazados.',
            ]),
          ],
        };
      }

      case 'enlazar': {
        const partes = arg.split(' ').filter(Boolean);
        if (partes.length < 2) {
          return {
            bloques: [error(
              'Faltan los dos extremos: enlazar <origen> <destino>, por nombre de equipo.',
            )],
          };
        }
        const [desde, hasta] = partes;

        // Una IP en vez de un nombre es el error honesto de quien lee la
        // bitácora sin haber cruzado con Datos. Se le dice dónde mirar,
        // sin traducirle la dirección.
        const pareceIp = (s: string) => /^\d+\.\d+\.\d+\.\d+$/.test(s);
        if (pareceIp(desde) || pareceIp(hasta)) {
          return {
            bloques: [texto(
              [
                '`enlazar` va por NOMBRE de equipo, no por direccion.',
                'Preguntale a Datos que maquina es esa IP en la tabla `equipos`',
                'y vuelve con el nombre.',
              ],
              'Por nombre, no por direccion',
            )],
          };
        }

        // Un nombre que no existe suele ser un typo de algo oído en la
        // sala. No cuesta un enlace fallido.
        for (const n of [desde, hasta]) {
          if (!HOSTS.has(n)) {
            return { bloques: [error(`«${n}» no es ninguna maquina del inventario. Revisa como se escribe.`)] };
          }
        }

        if (desde === hasta) {
          return { bloques: [error('Un salto va de una maquina a OTRA.')] };
        }

        if (hechos.includes(clave(desde, hasta))) {
          return {
            bloques: [texto([
              `Ese salto ya estaba confirmado. Llevas ${hechos.length} de ${TOTAL_SALTOS}.`,
            ])],
          };
        }

        const salto = CADENA.find((s) => s.desde === desde && s.hasta === hasta);
        if (salto) {
          const ahora = [...hechos, clave(desde, hasta)];
          const restantes = TOTAL_SALTOS - ahora.length;
          const estado = { ...ctx.estado, saltos: ahora };
          const cabecera = `${salto.hora} · ${desde.toUpperCase()} -> ${hasta.toUpperCase()}`;

          if (restantes > 0) {
            return {
              estado,
              bloques: [{
                tipo: 'exito',
                titulo: `Salto confirmado · ${ahora.length} de ${TOTAL_SALTOS}`,
                lineas: [cabecera, salto.porque, `Faltan ${restantes}.`],
              }],
            };
          }

          return {
            resuelto: true,
            estado,
            bloques: [{
              tipo: 'exito',
              titulo: `Cadena reconstruida · ${TOTAL_SALTOS} de ${TOTAL_SALTOS}`,
              lineas: [
                cabecera,
                salto.porque,
                '',
                'PRUEBAS-07 -> CONTA-03 -> BACKUP-01 -> SALTO-02 -> NOMINA-02',
                '',
                'Y ahora la parte incomoda. La direccion de fuera que cerrasteis en la',
                'Fase 2 llamo dos veces al servidor publico a las 01:52 y a las 01:58,',
                'y las dos veces se le cerro la puerta. No entro por ahi: a las 03:19',
                'salio por ahi. Era la puerta de salida, no la de entrada.',
                '',
                'La entrada fue a las 02:03, por contrasena y desde la wifi de invitados,',
                'contra PRUEBAS-07: un banco de pruebas que el inventario da de baja en',
                '2024 y que lleva dos anos encendido. Nadie lo apago porque nadie se',
                'acordaba de que existia.',
              ],
            }],
          };
        }

        // Rechazo. La MISMA salida para un par inventado, para un salto
        // que existe con otra llave y para uno que la bitacora registra
        // como RECHAZADO. Si se distinguieran, fallar un enlace iria
        // diciendo por dónde se acerca uno, y la cadena se barreria a
        // ciegas en dos pasadas.
        const fallos = fallosDe(ctx.estado);
        const castigo = cuarentenaPara(fallos);
        return {
          fallo: true,
          estado: { ...ctx.estado, fallos: fallos + 1, cuarentenaHasta: ctx.ahora + castigo },
          bloques: [
            error(
              `No consta ninguna sesion que entrara de ${desde.toUpperCase()} `
              + `a ${hasta.toUpperCase()} con la llave del rastro.`,
            ),
            texto([`Sistema en cuarentena ${castigo / 1000} s por enlace indebido.`]),
          ],
        };
      }

      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto}». Prueba \`ayuda\`.`)] };
    }
  },
};
