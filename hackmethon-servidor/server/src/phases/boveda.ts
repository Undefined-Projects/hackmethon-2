// ============================================================
//  FASE 5 — Bóveda de Credenciales   ·   BASES DE DATOS
//
//  Dos mil cuatrocientos registros y uno solo sirve. Leerlos con los
//  ojos es media noche; preguntarle bien a la bóveda son cuatro
//  condiciones y tres segundos.
//
//  LO QUE ENSEÑA
//    · una consulta es un embudo: cada condición tira registros
//    · `contar` antes de `buscar`: primero cuántos, luego cuáles
//    · lo que buscas no está en una sola tabla — hay que UNIRLAS por la
//      columna que comparten
//    · para preguntar hay que saber qué columnas existen y qué valores
//      admiten: eso es el diccionario de datos, y lo tiene otro
//
//  EL REPARTO
//    PANTALLA  lo que devuelve la bóveda. Nada más: ni qué tablas hay,
//              ni qué columnas, ni qué se está buscando.
//    DATOS     el diccionario de datos y el encargo. No ve ni un
//              registro: tiene el mapa, no el territorio.
//    TERMINAL  pregunta, y no ve nada.
// ============================================================

import type { Role } from '../lib/constants.js';
import type { ContextoComando, ModuloFase, ResultadoComando } from './types.js';
import {
  ANCHO_CAMARA, AYUDA_CAMARAS, circuitoCerrado, lienzo, mandoDeCamaras, numero, tira,
  type CamaraDef, type Escena, type Rotulo,
} from './comun.js';
import {
  cuarentenaActiva, error, exito, normalizar, rechazo, tabla, texto,
} from './comun.js';

// ---------- La bóveda ----------
//
// Se genera con un aleatorio propio y una semilla fija: la misma bóveda
// en todos los equipos y en todas las partidas. Un `Math.random()` aquí
// haría que dos equipos vecinos tuvieran respuestas distintas y que una
// prueba verde hoy fallara mañana.
function generador(semilla: number) {
  let s = semilla;
  return (n: number) => {
    s = (s * 1103515245 + 12345) % 2147483648;
    // Los bits BAJOS de una LCG con modulo potencia de dos casi no varian
    // —`s % 6` recorria dos valores— asi que se descartan los 16 primeros.
    return Math.floor(s / 65536) % n;
  };
}

type Usuario = { id: string; nombre: string; departamento: string; sede: string };
type Credencial = { id: string; usuario_id: string; tipo: string; estado: string; nivel: number; emitida: string };

const DEPARTAMENTOS = ['sistemas', 'finanzas', 'almacen', 'direccion', 'soporte'];
const SEDES = ['torre', 'nave norte', 'remoto'];
const TIPOS = ['operativa', 'operativa', 'operativa', 'temporal', 'temporal', 'maestra'];
const ESTADOS = ['activa', 'activa', 'revocada', 'caducada'];

const { USUARIOS, CREDENCIALES, OBJETIVO } = (() => {
  const az = generador(20260915);
  const usuarios: Usuario[] = [];
  for (let i = 1; i <= 240; i++) {
    usuarios.push({
      id: `US-${String(i).padStart(3, '0')}`,
      nombre: `usuario_${String(i).padStart(3, '0')}`,
      departamento: DEPARTAMENTOS[az(DEPARTAMENTOS.length)],
      sede: SEDES[az(SEDES.length)],
    });
  }

  const credenciales: Credencial[] = [];
  for (let i = 1; i <= 2400; i++) {
    credenciales.push({
      id: `CR-${String(i).padStart(4, '0')}`,
      usuario_id: usuarios[az(usuarios.length)].id,
      tipo: TIPOS[az(TIPOS.length)],
      estado: ESTADOS[az(ESTADOS.length)],
      nivel: 1 + az(5),
      emitida: `202${az(5)}-${String(1 + az(12)).padStart(2, '0')}`,
    });
  }

  // La respuesta tiene que ser ÚNICA, y dejarlo al azar sería confiar en
  // que la semilla se porte bien. Se aplasta a mano todo lo que encaje
  // con el encargo y luego se planta una sola coincidencia.
  const porId = new Map(usuarios.map((u) => [u.id, u]));
  const encaja = (c: Credencial) => {
    const u = porId.get(c.usuario_id)!;
    return c.tipo === 'maestra' && c.estado === 'activa'
        && u.departamento === 'sistemas' && u.sede === 'torre';
  };
  for (const c of credenciales) if (encaja(c)) c.estado = 'revocada';

  const sistemasTorre = usuarios.find((u) => u.departamento === 'sistemas' && u.sede === 'torre')!;
  const objetivo = credenciales[1842];
  objetivo.usuario_id = sistemasTorre.id;
  objetivo.tipo = 'maestra';
  objetivo.estado = 'activa';
  objetivo.nivel = 5;

  return { USUARIOS: usuarios, CREDENCIALES: credenciales, OBJETIVO: objetivo };
})();

const USUARIO_POR_ID = new Map(USUARIOS.map((u) => [u.id, u]));

// ---------- La mitad del Operador de Datos ----------
//
// El diccionario, no los registros. Dos mil cuatrocientas filas en esta
// pantalla se podrían leer con el dedo, y entonces la fase no enseñaría
// a consultar: enseñaría a tener paciencia.
const ESQUEMA = {
  tablas: [
    {
      id: 'tablas',
      nombre: 'tablas',
      x: 40, y: 30, w: 440,
      descripcion: 'Que hay dentro de la boveda',
      clave: 'id',
      columnas: ['id', 'tabla', 'registros', 'se une con'],
      filas: [
        ['T1', 'credenciales', '2400', 'usuarios, por usuario_id'],
        ['T2', 'usuarios', '240', 'credenciales, por id'],
      ],
    },
    {
      id: 'columnas',
      nombre: 'columnas',
      x: 40, y: 250, w: 620,
      descripcion: 'Que se puede preguntar, y con que valores',
      clave: 'id',
      columnas: ['id', 'tabla', 'columna', 'valores que admite'],
      filas: [
        ['K1', 'credenciales', 'id', 'CR-0001 ... CR-2400'],
        ['K2', 'credenciales', 'usuario_id', 'US-001 ... US-240'],
        ['K3', 'credenciales', 'tipo', 'operativa · temporal · maestra'],
        ['K4', 'credenciales', 'estado', 'activa · revocada · caducada'],
        ['K5', 'credenciales', 'nivel', '1 a 5'],
        ['K6', 'credenciales', 'emitida', '2020-01 ... 2024-12'],
        ['K7', 'usuarios', 'departamento', 'sistemas · finanzas · almacen · direccion · soporte'],
        ['K8', 'usuarios', 'sede', 'torre · nave norte · remoto'],
      ],
    },
    {
      id: 'encargo',
      nombre: 'encargo',
      x: 700, y: 30, w: 260,
      descripcion: 'La credencial que hace falta',
      clave: 'id',
      columnas: ['id', 'requisito'],
      filas: [
        ['R1', 'tipo: maestra'],
        ['R2', 'estado: activa'],
        ['R3', 'del departamento de sistemas'],
        ['R4', 'con sede en la torre'],
        ['R5', 'las cuatro a la vez. Solo hay una.'],
      ],
    },
  ],
  relaciones: [],
} as const;

const TOPE_FILAS = 10;
const COLUMNAS_CRED = ['id', 'usuario_id', 'tipo', 'estado', 'nivel', 'emitida'];
const COLUMNAS_USR = ['departamento', 'sede', 'nombre'];

type Fila = Credencial & Partial<Usuario>;

const unidas = (): Fila[] =>
  CREDENCIALES.map((c) => {
    const u = USUARIO_POR_ID.get(c.usuario_id)!;
    return { ...c, departamento: u.departamento, sede: u.sede, nombre: u.nombre };
  });

type Filtro = { campo: string; op: string; valor: string };

function aplicar(filas: Fila[], filtros: Filtro[]): Fila[] {
  return filas.filter((f) =>
    filtros.every((ft) => {
      const v = (f as Record<string, unknown>)[ft.campo];
      if (v === undefined) return false;
      if (ft.campo === 'nivel') {
        const a = Number(v);
        const b = Number(ft.valor);
        switch (ft.op) {
          case '=': return a === b;
          case '!=': return a !== b;
          case '>': return a > b;
          case '<': return a < b;
          case '>=': return a >= b;
          case '<=': return a <= b;
        }
      }
      const s = String(v);
      return ft.op === '!=' ? s !== ft.valor : s === ft.valor;
    }),
  );
}

// ---------- El circuito cerrado de la boveda ----------
//
//  Dos camaras. Lo que cuentan es el EMBUDO: cuantos cajones siguen
//  encendidos despues de la ultima consulta. Cual es el bueno no sale por
//  ninguna parte —eso es la fase— pero ver caer dos mil cuatrocientos a
//  veintiuno de una condicion a otra es lo que convierte una consulta en
//  algo que se entiende.

const CAMARAS: CamaraDef[] = [
  { n: 1, id: 'boveda', nombre: 'BOVEDA', sector: 'B-01', que: 'los cajones que siguen encendidos' },
  { n: 2, id: 'brazo', nombre: 'BRAZO EXTRACTOR', sector: 'B-02', que: 'el brazo que saca la credencial' },
];

/** El total, para saber cuanto se ha estrechado. */
const TOTAL_CAJONES = CREDENCIALES.length;

function escenaBoveda(quedan: number, f: number): string[] {
  // Veinte cajones para representar el total: es una barra, no un
  // inventario. La escala es LOGARITMICA porque el embudo de esta fase va
  // de 2400 a 1, y en lineal los tres ultimos pasos —162, 21, 1— pintaban
  // todos un cajon y no se veia nada de lo interesante.
  const encendidos = quedan <= 0
    ? 0
    : Math.max(1, Math.ceil((20 * Math.log(quedan + 1)) / Math.log(TOTAL_CAJONES + 1)));
  const cajon = (i: number) =>
    i < encendidos ? ((i + f) % 4 === 0 ? '[#]' : '[=]') : '[ ]';
  const decena = (desde: number) =>
    tira('   ' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => cajon(desde + i)).join(''), ANCHO_CAMARA);
  return lienzo([
    '  __________________________________',
    '                                    ',
    decena(0),
    decena(10),
    '                                    ',
    tira(`   ${quedan} de ${TOTAL_CAJONES} siguen encendidos`, ANCHO_CAMARA),
    '                                    ',
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira(quedan === 1
      ? '  uno solo. ya se puede sacar.'
      : quedan === 0
        ? '  ningun cajon encaja. afloja algo.'
        : '  siguen siendo demasiados.', ANCHO_CAMARA),
  ]);
}

function escenaBrazo(quedan: number, f: number): string[] {
  const listo = quedan === 1;
  // El brazo baja solo cuando queda uno: hasta entonces no tiene a que ir.
  // El cable se dibuja hasta la garra, no un trozo suelto y la garra mas
  // abajo: un brazo partido por la mitad se lee como un fallo de imagen.
  const alto = listo ? 3 + (f % 2) : 1;
  const POZO = 5;
  const lineas = [
    '        [ BRAZO  EXTRACTOR ]        ',
    '                                    ',
    '   ==============|=============     ',
  ];
  for (let i = 0; i < POZO; i++) {
    lineas.push(tira(i < alto - 1 ? '                |' : i === alto - 1 ? `                ${listo ? '[v]' : '[ ]'}` : '', ANCHO_CAMARA));
  }
  lineas.push('                                    ');
  lineas.push('  ==================================');
  lineas.push('  ::::::::::::::::::::::::::::::::::');
  lineas.push('                                    ');
  lineas.push(tira(listo
    ? '  el brazo esta sobre el cajon.'
    : '  el brazo espera. hay mas de uno.', ANCHO_CAMARA));
  return lienzo(lineas);
}

function vistaDeCamaras(estado: Record<string, unknown>) {
  // -1 = todavia no se ha preguntado nada. La boveda arranca entera.
  const bruto = estado.quedan;
  const quedan = typeof bruto === 'number' ? bruto : TOTAL_CAJONES;
  const consultas = numero(estado, 'consultas');

  return circuitoCerrado(CAMARAS, estado, (cam) => {
    const escena: Escena = cam.id === 'boveda'
      ? { fotogramas: [0, 1, 2, 3].map((f) => escenaBoveda(quedan, f)), ritmo: 340 }
      : { fotogramas: [0, 1].map((f) => escenaBrazo(quedan, f)), ritmo: 520 };
    const rotulos: Rotulo[] = [
      { texto: `QUEDAN ${quedan}`, tono: quedan === 1 ? 'ok' : 'neutro' },
      { texto: `DE ${TOTAL_CAJONES}`, tono: 'neutro' },
    ];
    if (consultas > 0) rotulos.push({ texto: `${consultas} CONSULTA(S)`, tono: 'neutro' });
    if (quedan === 1) rotulos.push({ texto: 'LISTO PARA EXTRAER', tono: 'ok' });
    return { escena, rotulos, clave: `${cam.n}:${quedan}:${consultas}` };
  });
}

function ayuda(): ResultadoComando {
  return {
    bloques: [
      texto(
        [
          'contar en <tabla> [donde ...]        — cuantos hay, sin traerlos',
          'buscar en <tabla> [unir <otra>] [donde ...] [limitar <n>]',
          'extraer <id>                         — sacar UNA credencial. Esto no es gratis',
          'estado                               — como va',
          ...AYUDA_CAMARAS,
        ],
        'Comandos disponibles',
      ),
      texto(
        [
          'Las condiciones van despues de `donde`, separadas por `y`:',
          '',
          '  contar en credenciales',
          '  contar en credenciales donde tipo = maestra',
          '  buscar en credenciales donde tipo = maestra y estado = activa',
          '',
          'Si lo que buscas esta en otra tabla, hay que UNIRLAS. Al unir, las',
          'columnas de la otra tabla se pueden usar como si fueran de esta:',
          '',
          '  buscar en credenciales unir usuarios donde departamento = almacen',
          '',
          'Operadores: =  !=  y, para numeros, tambien >  <  >=  <=',
        ],
        'Como se pregunta',
      ),
      texto(
        [
          `Esta terminal no sabe que tablas hay, ni que columnas, ni que valores`,
          'admiten, ni que credencial hace falta. Todo eso esta en el diccionario',
          'de datos, en la base de datos. Pregunta a Datos antes de preguntar aqui.',
          '',
          `La boveda devuelve como mucho ${TOPE_FILAS} filas: si salen mas, no las ensena.`,
          'Eso no es una limitacion, es el ejercicio: hay que estrechar la pregunta.',
        ],
        'Lo que esta terminal NO sabe',
      ),
    ],
  };
}

export const boveda: ModuloFase = {
  key: 'fase-5-boveda',

  proyectar(role: Role, ctx) {
    switch (role) {
      case 'DATOS':
        return {
          titulo: 'Boveda · diccionario de datos',
          nota: 'Tu tienes el mapa: que tablas hay, que columnas tiene cada una, que valores '
              + 'admiten y que credencial hace falta. Los registros no los ve nadie de golpe: '
              + 'se le preguntan a la boveda, y quien ve las respuestas es Pantalla.',
          lienzo: { w: 1000, h: 470 },
          ...ESQUEMA,
        };

      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          camaras: vistaDeCamaras(ctx.estado),
          nota: 'Tu ves la boveda por circuito cerrado y lo que contesta. Que se puede '
              + 'preguntar y que se busca lo tiene Datos. Quien escribe no ve nada: cantaselo.',
        };

      case 'TERMINAL':
        return {
          camara: numero(ctx.estado, 'camara') || 1,
          pista: 'Escribe `ayuda` y pregunta a Pantalla que aparecio.',
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

    // El circuito cerrado se atiende antes del switch: es el mismo mando
    // en todas las fases que tienen camaras.
    const mando = mandoDeCamaras(CAMARAS, verbo, arg, ctx.estado);
    if (mando) return mando;

    switch (verbo) {
      case 'ayuda':
      case 'help':
        return ayuda();

      case 'contar':
      case 'buscar': {
        const q = parsearConsulta(arg);
        if ('fallo' in q) return q.fallo;

        const base = q.unir ? unidas() : (CREDENCIALES as Fila[]);
        const filas = aplicar(base, q.filtros);

        // El embudo se persiste para que la boveda lo ENSEÑE: sin esto la
        // camara seria un dibujo fijo, y lo unico interesante que pasa en
        // esta fase es justo como se estrecha.
        const embudo = { quedan: filas.length, consultas: numero(ctx.estado, 'consultas') + 1 };

        if (verbo === 'contar') {
          return {
            estado: { ...ctx.estado, ...embudo },
            bloques: [
              texto(
                [
                  `${filas.length} registros de ${base.length}.`,
                  q.filtros.length === 0
                    ? 'Sin condiciones, la boveda devuelve todo. Cada condicion tira registros.'
                    : `Condiciones aplicadas: ${q.filtros.map((f) => `${f.campo} ${f.op} ${f.valor}`).join(' y ')}.`,
                ],
                'Recuento',
              ),
            ],
          };
        }

        if (filas.length === 0) {
          return {
            estado: { ...ctx.estado, ...embudo },
            bloques: [texto(
              ['Ningun registro cumple todas esas condiciones a la vez.',
               'O sobra una condicion, o alguna lleva un valor que esa columna no admite.'],
              'Sin resultados',
            )],
          };
        }
        if (filas.length > (q.limite ?? TOPE_FILAS)) {
          return {
            estado: { ...ctx.estado, ...embudo },
            bloques: [texto(
              [
                `${filas.length} registros. La boveda solo ensena ${q.limite ?? TOPE_FILAS}.`,
                'Anade otra condicion: cada una tira registros. `contar` te dice cuantos',
                'quedarian antes de pedirlos.',
              ],
              'Demasiados resultados',
            )],
          };
        }

        const cols = q.unir ? [...COLUMNAS_CRED, ...COLUMNAS_USR] : COLUMNAS_CRED;
        return {
          estado: { ...ctx.estado, ...embudo },
          bloques: [
            tabla(
              `${filas.length} resultado(s)`,
              cols,
              filas.map((f) => cols.map((c) => String((f as Record<string, unknown>)[c] ?? '—'))),
            ),
            texto([filas.length === 1 ? 'Uno solo. `extraer <id>` lo saca.' : 'Sigue estrechando.']),
          ],
        };
      }

      case 'extraer': {
        if (!arg) return { bloques: [error('Falta el identificador. `extraer <id>`.')] };
        if (arg.toUpperCase() === OBJETIVO.id) {
          return {
            resuelto: true,
            bloques: [
              exito(`Credencial ${OBJETIVO.id} extraida`, [
                'Maestra, activa, sistemas, torre. La unica de dos mil cuatrocientas.',
                '',
                'No la encontrasteis mirando: la encontrasteis preguntando. Cada condicion',
                'que anadisteis tiro registros, y cuando hizo falta un dato que no estaba',
                'en la tabla, unisteis las dos por la columna que compartian.',
                '',
                'Eso es todo lo que hace una consulta. Leerlas una a una habria sido',
                'exactamente el mismo trabajo, repartido en cinco horas.',
              ]),
            ],
          };
        }
        // Mismo rechazo para un id que no existe y para uno que existe
        // pero no cumple: decir cuál de las dos cosas falla sería ir
        // resolviendo el filtro a base de extraer.
        return rechazo(
          ctx,
          `«${arg}» no es la credencial del encargo. La boveda registra el intento.`,
        );
      }

      case 'estado':
        return {
          bloques: [texto(
            [
              `La boveda guarda ${CREDENCIALES.length} credenciales de ${USUARIOS.length} personas.`,
              'Hace falta una sola. El encargo dice cual: lo tiene Datos.',
            ],
            'Estado',
          )],
        };

      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto}». Prueba \`ayuda\`.`)] };
    }
  },
};

// ---------- El analizador de consultas ----------

type Consulta = { unir: boolean; filtros: Filtro[]; limite?: number } | { fallo: ResultadoComando };

const CAMPOS_CRED = new Set(COLUMNAS_CRED);
const CAMPOS_USR = new Set(COLUMNAS_USR);
const OPS = ['=', '!=', '>=', '<=', '>', '<'];

function parsearConsulta(arg: string): Consulta {
  const malo = (t: string, extra: string[] = []): Consulta => ({
    fallo: { bloques: [error(t), ...(extra.length ? [texto(extra)] : [])] },
  });

  const p = arg.split(' ').filter(Boolean);
  if (p[0] !== 'en') return malo('Falta `en <tabla>`. Ejemplo: contar en credenciales.');
  if (p[1] !== 'credenciales') {
    return malo(
      `No se puede consultar «${p[1] ?? '(nada)'}» directamente.`,
      ['La consulta arranca siempre en `credenciales`; a `usuarios` se llega uniendo.'],
    );
  }

  let i = 2;
  let unir = false;
  if (p[i] === 'unir') {
    if (p[i + 1] !== 'usuarios') return malo(`No se puede unir con «${p[i + 1] ?? '(nada)'}».`);
    unir = true;
    i += 2;
  }

  let limite: number | undefined;
  const iLimitar = p.indexOf('limitar');
  if (iLimitar !== -1) {
    const n = Number(p[iLimitar + 1]);
    if (!Number.isInteger(n) || n < 1) return malo('`limitar` necesita un numero.');
    limite = Math.min(n, TOPE_FILAS);
    p.length = iLimitar;
  }

  const filtros: Filtro[] = [];
  if (i < p.length) {
    if (p[i] !== 'donde') return malo(`No entiendo «${p[i]}». Tras la tabla va `+ '`donde`, o nada.');
    const trozos: string[][] = [[]];
    for (const w of p.slice(i + 1)) {
      if (w === 'y') trozos.push([]);
      else trozos[trozos.length - 1].push(w);
    }
    for (const t of trozos) {
      if (t.length !== 3) {
        return malo(`Cada condicion son tres piezas: columna operador valor. «${t.join(' ') || '(vacio)'}» no lo es.`);
      }
      const [campo, op, valor] = t;
      if (!OPS.includes(op)) return malo(`«${op}» no es un operador. Son: ${OPS.join('  ')}.`);
      if (CAMPOS_USR.has(campo) && !unir) {
        // El error más instructivo de la fase: la columna existe, pero no
        // en la tabla que se está consultando.
        return malo(
          `«${campo}» no es una columna de credenciales.`,
          ['Esta en la otra tabla. Para usarla hay que unirlas: `buscar en credenciales unir usuarios donde ...`'],
        );
      }
      if (!CAMPOS_CRED.has(campo) && !CAMPOS_USR.has(campo)) {
        return malo(`«${campo}» no es ninguna columna. Las columnas estan en el diccionario, que tiene Datos.`);
      }
      if (campo !== 'nivel' && !['=', '!='].includes(op)) {
        return malo(`Con «${campo}» solo valen = y !=: es texto, no un numero.`);
      }
      filtros.push({ campo, op, valor });
    }
  }

  return { unir, filtros, limite };
}
