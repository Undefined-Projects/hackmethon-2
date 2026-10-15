// ============================================================
//  FASE 1 — Control de Acceso   ·   CONDICIONALES
//
//  El portero del servidor hace preguntas y decide. Evalúa sus reglas EN
//  ORDEN, se queda con la primera que encaja y, si no encaja ninguna,
//  deniega. Hay que colar a uno de los nuestros sin que cambie el
//  veredicto de nadie más: eso es lo que significa «sin que se dé
//  cuenta».
//
//  LO QUE ENSEÑA
//    · una condición es una pregunta con respuesta sí/no
//    · el ORDEN decide: una regla detrás de otra que ya decidió no corre
//    · `y` / `o` no son lo mismo, y se nota en quién pasa
//    · una condición demasiado ancha deja pasar a quien no querías
//    · probar es gratis, desplegar no
//
//  EL REPARTO
//    PANTALLA  el reglamento del portero y el resultado de cada prueba:
//              quién pasa, quién no y QUÉ REGLA lo decidió. No sabe ni
//              el nivel ni el turno ni la acreditación de nadie.
//    DATOS     el padrón: quién es cada quien y qué encargo tiene el
//              equipo. No ve ni una regla ni un veredicto.
//    TERMINAL  escribe reglas, y no ve nada.
//
//  Sin Datos no se puede escribir una condición que distinga a nuestro
//  infiltrado de los otros dos con la acreditación caducada. Sin
//  Pantalla no se sabe si la regla colocada ahí hace lo que se esperaba.
// ============================================================

import type { Role } from '../lib/constants.js';
import type { ContextoComando, ModuloFase, ResultadoComando } from './types.js';
import {
  AYUDA_CAMARAS, circuitoCerrado, cuarentenaActiva, error, exito, lienzo, lista, listaDe,
  mandoDeCamaras, normalizar, numero, rechazo, tabla, texto, tira,
  type CamaraDef, type Escena, type Rotulo,
} from './comun.js';

// ---------- La mitad del Operador de Datos ----------
const ESQUEMA = {
  tablas: [
    {
      id: 'personas',
      nombre: 'personas',
      x: 40, y: 30, w: 320,
      descripcion: 'Quien figura en el padron',
      clave: 'id',
      columnas: ['id', 'usuario', 'nivel', 'departamento'],
      filas: [
        ['P1', 'r.solis', '4', 'direccion'],
        ['P2', 'n.vega', '3', 'sistemas'],
        ['P3', 'p.arriaga', '2', 'mantenimiento'],
        ['P4', 'l.bermudez', '1', 'almacen'],
        ['P5', 'e.quiroz', '5', 'direccion'],
        ['P6', 't.medina', '1', 'almacen'],
        ['P7', 'g.pastor', '2', 'mantenimiento'],
      ],
    },
    {
      // Aquí está lo que distingue a los tres con la acreditación
      // caducada. Sin esta tabla, cualquier regla que los separe es un
      // disparo a ciegas.
      id: 'credenciales',
      nombre: 'credenciales',
      x: 640, y: 30, w: 320,
      descripcion: 'Acreditacion y turno de cada quien',
      clave: 'id',
      columnas: ['id', 'persona_id', 'acreditacion', 'turno'],
      filas: [
        ['C1', 'P1', 'vigente', 'dia'],
        ['C2', 'P2', 'vigente', 'noche'],
        ['C3', 'P3', 'vigente', 'noche'],
        ['C4', 'P4', 'vigente', 'dia'],
        ['C5', 'P5', 'caducada', 'dia'],
        ['C6', 'P6', 'caducada', 'noche'],
        ['C7', 'P7', 'caducada', 'dia'],
      ],
    },
    {
      // El encargo apunta a un id, no a un nombre: hay que saltar a
      // `personas` para saber de quién hablamos. Ese salto es la primera
      // frase que alguien tiene que decir en voz alta.
      id: 'encargo',
      nombre: 'encargo',
      x: 40, y: 300, w: 460,
      descripcion: 'Lo que el equipo tiene que conseguir',
      clave: 'id',
      columnas: ['id', 'persona_id', 'instruccion'],
      filas: [
        ['E1', 'P6', 'Tiene que PASAR. Nadie mas puede cambiar de veredicto.'],
      ],
    },
  ],
  relaciones: [
    { desde: 'credenciales', campo: 'persona_id', hasta: 'personas' },
    { desde: 'encargo', campo: 'persona_id', hasta: 'personas' },
  ],
} as const;

// ---------- Los datos con los que decide el portero ----------
//
// El portero conoce estos atributos, pero nunca los enseña: solo dice a
// quién deja pasar. Que Pantalla vea el veredicto y no el motivo es
// justo lo que obliga a preguntarle a Datos.
type Persona = {
  usuario: string;
  nivel: number;
  departamento: string;
  acreditacion: string;
  turno: string;
};

const PADRON: Persona[] = [
  { usuario: 'r.solis', nivel: 4, departamento: 'direccion', acreditacion: 'vigente', turno: 'dia' },
  { usuario: 'n.vega', nivel: 3, departamento: 'sistemas', acreditacion: 'vigente', turno: 'noche' },
  { usuario: 'p.arriaga', nivel: 2, departamento: 'mantenimiento', acreditacion: 'vigente', turno: 'noche' },
  { usuario: 'l.bermudez', nivel: 1, departamento: 'almacen', acreditacion: 'vigente', turno: 'dia' },
  { usuario: 'e.quiroz', nivel: 5, departamento: 'direccion', acreditacion: 'caducada', turno: 'dia' },
  { usuario: 't.medina', nivel: 1, departamento: 'almacen', acreditacion: 'caducada', turno: 'noche' },
  { usuario: 'g.pastor', nivel: 2, departamento: 'mantenimiento', acreditacion: 'caducada', turno: 'dia' },
];

/** A quien hay que colar. Su identidad solo consta en la tabla `encargo`. */
const INFILTRADO = 't.medina';

// ---------- Reglas ----------

type Op = '=' | '!=' | '>' | '<' | '>=' | '<=';
type Condicion = { campo: keyof Persona; op: Op; valor: string };
type Regla = { cond: Condicion[]; junta: 'y' | 'o'; accion: 'permitir' | 'denegar' };

const CAMPOS: (keyof Persona)[] = ['usuario', 'nivel', 'departamento', 'acreditacion', 'turno'];
const OPS: Op[] = ['=', '!=', '>=', '<=', '>', '<'];

/**
 * El reglamento tal y como lo dejó el portero.
 *
 * Fíjate en el orden: la regla 1 deniega por acreditación caducada ANTES
 * de que la 2 pueda mirar el nivel. Por eso e.quiroz, que es nivel 5, no
 * entra. Ese detalle es la fase entera.
 */
const BASE: Regla[] = [
  { cond: [{ campo: 'acreditacion', op: '=', valor: 'caducada' }], junta: 'y', accion: 'denegar' },
  { cond: [{ campo: 'nivel', op: '>=', valor: '3' }], junta: 'y', accion: 'permitir' },
  { cond: [{ campo: 'departamento', op: '=', valor: 'mantenimiento' }], junta: 'y', accion: 'permitir' },
];

const MAX_REGLAS = 8;

function cumple(p: Persona, c: Condicion): boolean {
  const izq = p[c.campo];
  // El nivel se compara como número; lo demás, como texto. Comparar «10»
  // con «9» como cadenas daría que 10 es menor, que es el clásico.
  if (c.campo === 'nivel') {
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

const reglaEncaja = (p: Persona, r: Regla): boolean =>
  r.junta === 'o' ? r.cond.some((c) => cumple(p, c)) : r.cond.every((c) => cumple(p, c));

/** Primera regla que encaja manda. Si no encaja ninguna, se deniega. */
function decidir(p: Persona, reglas: Regla[]): { veredicto: 'PERMITIDO' | 'DENEGADO'; regla: number } {
  for (let i = 0; i < reglas.length; i++) {
    if (reglaEncaja(p, reglas[i])) {
      return { veredicto: reglas[i].accion === 'permitir' ? 'PERMITIDO' : 'DENEGADO', regla: i + 1 };
    }
  }
  return { veredicto: 'DENEGADO', regla: 0 };
}

/** Los veredictos de partida, calculados y no escritos a mano: si alguien
 *  retoca BASE, el objetivo se recalcula solo y no se queda mintiendo. */
const VEREDICTO_BASE: Record<string, string> = Object.fromEntries(
  PADRON.map((p) => [p.usuario, decidir(p, BASE).veredicto]),
);

/** Lo que hay que conseguir: el infiltrado pasa, nadie más se mueve. */
const OBJETIVO: Record<string, string> = {
  ...VEREDICTO_BASE,
  [INFILTRADO]: 'PERMITIDO',
};

const pintarRegla = (r: Regla): string => {
  const partes = r.cond.map((c) => `${c.campo} ${c.op} ${c.valor}`);
  return `si ${partes.join(` ${r.junta} `)} entonces ${r.accion.toUpperCase()}`;
};

const reglasDe = (estado: Record<string, unknown>): Regla[] =>
  Array.isArray(estado.reglas) ? (estado.reglas as Regla[]) : BASE.map((r) => ({ ...r }));

/** Quién se desvía del objetivo con un reglamento dado. */
function desviaciones(reglas: Regla[]) {
  return PADRON.map((p) => {
    const d = decidir(p, reglas);
    return { usuario: p.usuario, ...d, esperado: OBJETIVO[p.usuario] };
  }).filter((x) => x.veredicto !== x.esperado);
}

function bloqueDePrueba(reglas: Regla[]) {
  const filas = PADRON.map((p) => {
    const d = decidir(p, reglas);
    const esperado = OBJETIVO[p.usuario];
    return [
      p.usuario,
      d.veredicto,
      d.regla ? `regla ${d.regla}` : 'por defecto',
      d.veredicto === esperado ? 'ok' : 'NO',
    ];
  });
  return tabla('Simulacion del portero', ['usuario', 'veredicto', 'decidido por', 'objetivo'], filas);
}

// ---------- La mitad del Operador de Pantalla: el circuito cerrado ----------
//
//  Dos camaras del control de acceso. La de la puerta es la fase entera
//  hecha imagen: la cola avanza, el portero mira a cada uno y la barrera
//  sube o no sube.
//
//  Lo que la camara enseña es el EFECTO —quien pasa y quien no—, nunca la
//  CAUSA. Que regla decidio cada veredicto sigue estando solo en `probar`,
//  y esa es la leccion de la fase: el orden manda. Una camara que cantara
//  la regla dejaria la simulacion sin trabajo.

const CAMARAS: CamaraDef[] = [
  { n: 1, id: 'puerta', nombre: 'PUERTA NORTE', sector: 'P-01', que: 'la cola, el portero y la barrera' },
  { n: 2, id: 'vestibulo', nombre: 'VESTIBULO', sector: 'P-02', que: 'a quien ha conseguido entrar' },
];

/** Tres lineas con `n` figuras de pie, de tres caracteres cada una. */
function figuras(n: number): [string, string, string] {
  let a = '', b = '', c = '';
  for (let i = 0; i < n; i++) { a += ' o '; b += '/|\\'; c += '/ \\'; }
  return [a, b, c];
}

type Momento = { quien: string; pasa: boolean; cola: number; dentro: number; fase: 'mira' | 'falla' };

/**
 * Un fotograma de la puerta. Las columnas estan fijadas a mano —cola,
 * candidato, barrera, dentro— porque dos fotogramas seguidos tienen que
 * caer exactamente en el mismo sitio o la cola parece dar botes.
 */
function fotogramaPuerta(m: Momento): string[] {
  const [q1, q2, q3] = figuras(Math.min(4, m.cola));
  // Al pasar, el candidato ya no esta delante de la barrera: esta dentro.
  const pasando = m.fase === 'mira' ? false : m.pasa;
  const cand = pasando ? ['   ', '   ', '   '] : [' o ', '/|\\', '/ \\'];
  const [d1, d2, d3] = figuras(Math.min(3, m.dentro + (pasando ? 1 : 0)));
  const brazo = pasando ? '\\\\' : '||';
  const ojos = m.fase === 'mira' ? '[O] [O]' : m.pasa ? '[o] [o]' : '[-] [-]';
  const fila = (a: string, b: string, c: string, d: string) =>
    '  ' + tira(a, 12) + tira(b, 5) + tira(c, 3) + tira(d, 14);

  // La garita, con el interior a 11 columnas clavadas: si una linea se
  // sale, la caseta se ve torcida y parece un fallo de la camara.
  const caseta = (dentro: string) => '     |' + tira(dentro, 11) + '|';

  return lienzo([
    '     .-----------.                  ',
    caseta('  GARITA   '),
    caseta(`  ${ojos}  `),
    caseta('    ---    '),
    "     '-----------'                  ",
    '                                    ',
    fila(q1, cand[0], brazo, d1),
    fila(q2, cand[1], brazo, d2),
    fila(q3, cand[2], brazo, d3),
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira(`  EN LA PUERTA: ${m.quien}`, 36),
    m.fase === 'mira'
      ? '  comprobando...'
      : m.pasa ? '  >> PASA' : '  >> ALTO. No pasa.',
  ]);
}

/** La cola entera, uno detras de otro. Es el bucle de la camara: mientras
 *  nadie toque el reglamento, la puerta repite la misma escena, que es
 *  justo lo que hace una puerta. */
function escenaPuerta(veredictos: { usuario: string; pasa: boolean }[]): Escena {
  const fotogramas: string[][] = [];
  let dentro = 0;
  veredictos.forEach((v, i) => {
    const cola = veredictos.length - i - 1;
    fotogramas.push(fotogramaPuerta({ quien: v.usuario, pasa: v.pasa, cola, dentro, fase: 'mira' }));
    fotogramas.push(fotogramaPuerta({ quien: v.usuario, pasa: v.pasa, cola, dentro, fase: 'falla' }));
    if (v.pasa) dentro++;
  });
  return { fotogramas, ritmo: 780 };
}

function escenaVestibulo(dentro: number, f: number): string[] {
  const [a, b, c] = figuras(Math.min(5, dentro));
  return lienzo([
    '  __________________________________',
    '                                    ',
    tira(`  ${f % 2 === 0 ? '[+]' : '[ ]'}   VESTIBULO INTERIOR`, 36),
    '                                    ',
    '                                    ',
    '  ' + tira(a, 34),
    '  ' + tira(b, 34),
    '  ' + tira(c, 34),
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira(dentro === 0 ? '  no ha entrado nadie.' : `  ${dentro} persona(s) al otro lado.`, 36),
  ]);
}

function rotulosCamara(id: string, dentro: number, fuera: number, desviados: number): Rotulo[] {
  const r: Rotulo[] = [];
  if (id === 'puerta') {
    r.push({ texto: `EN COLA ${dentro + fuera}`, tono: 'neutro' });
    r.push({ texto: `PASAN ${dentro}`, tono: 'neutro' });
    r.push({ texto: `RECHAZA ${fuera}`, tono: 'neutro' });
  } else {
    r.push({ texto: `DENTRO ${dentro}`, tono: 'neutro' });
  }
  // Si encaja con el encargo se dice, porque es lo que hay que conseguir.
  // POR QUE encaja, no: eso sale de `probar`.
  r.push(desviados === 0
    ? { texto: 'TODO EN ORDEN', tono: 'ok' }
    : { texto: `${desviados} FUERA DE SITIO`, tono: 'alerta' });
  return r;
}

function vistaDeCamaras(estado: Record<string, unknown>) {
  const reglas = reglasDe(estado);
  const veredictos = PADRON.map((p) => ({
    usuario: p.usuario,
    pasa: decidir(p, reglas).veredicto === 'PERMITIDO',
  }));
  const dentro = veredictos.filter((v) => v.pasa).length;
  const desviados = desviaciones(reglas).length;

  return circuitoCerrado(CAMARAS, estado, (cam) => ({
    escena: cam.id === 'puerta'
      ? escenaPuerta(veredictos)
      : { fotogramas: [0, 1].map((f) => escenaVestibulo(dentro, f)), ritmo: 900 },
    rotulos: rotulosCamara(cam.id, dentro, veredictos.length - dentro, desviados),
    // Mientras el reglamento no cambie, la imagen es la misma y el bucle
    // no se reinicia: reproyectar no puede devolver la cola al primero.
    clave: veredictos.map((v) => (v.pasa ? '1' : '0')).join(''),
  }));
}

function ayuda(): ResultadoComando {
  return {
    bloques: [
      texto(
        [
          'reglas                       — el reglamento del portero, en orden',
          'insertar <n> si ... entonces permitir|denegar',
          'borrar <n>                   — quitar una regla',
          'probar                       — simulacion. Gratis, y todas las que quieras',
          'desplegar                    — aplicarlo de verdad. Esto no es gratis',
          'estado                       — que falta',
          ...AYUDA_CAMARAS,
        ],
        'Comandos disponibles',
      ),
      texto(
        [
          'Campos:      usuario · nivel · departamento · acreditacion · turno',
          'Operadores:  =  !=  >  <  >=  <=   (los de orden solo valen con nivel)',
          'Se pueden unir condiciones con `y` o con `o`, pero no mezclar las dos.',
          '',
          '  insertar 1 si nivel >= 9 entonces denegar',
          '  insertar 2 si departamento = archivo y turno = tarde entonces permitir',
          '',
          'Esos valores son de ejemplo y no existen. Los de verdad los tiene Datos.',
        ],
        'Como se escribe una regla',
      ),
      texto(
        [
          'Pantalla esta viendo la puerta por circuito cerrado: la cola, el portero y',
          'la barrera. Tu la cambias a ciegas. La camara enseña QUIEN pasa y quien no;',
          'QUE regla lo decidio no sale ahi, sale en `probar`.',
        ],
        'El circuito cerrado',
      ),
      texto(
        [
          'El portero lee sus reglas EN ORDEN y se queda con la PRIMERA que encaja.',
          'Si no encaja ninguna, deniega.',
          'Una regla colocada detras de otra que ya decidio no llega a correr nunca.',
          '',
          'Esta terminal no sabe el nivel, el turno ni la acreditacion de nadie:',
          'eso esta en el padron, en la base de datos. Pregunta a Datos.',
        ],
        'Como decide el portero',
      ),
    ],
  };
}

export const acceso: ModuloFase = {
  key: 'fase-1-acceso',

  proyectar(role: Role, ctx) {
    switch (role) {
      case 'DATOS':
        return {
          titulo: 'Padron · quien es quien en la puerta',
          nota: 'Tu tienes el nivel, el departamento, la acreditacion y el turno de cada '
              + 'persona, y el encargo del equipo. El reglamento del portero y lo que decide '
              + 'los ve Pantalla, y no sabe nada de esta tabla: sin ti no puede distinguir a '
              + 'uno de otro.',
          lienzo: { w: 1000, h: 520 },
          ...ESQUEMA,
        };

      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          nota: 'Tu ves la puerta, el reglamento del portero y a quien deja pasar, pero nunca '
              + 'por que: los datos de cada persona los tiene Datos y que regla decide cada '
              + 'veredicto solo sale en `probar`. Quien escribe no ve nada: cantaselo.',
          camaras: vistaDeCamaras(ctx.estado),
        };

      case 'TERMINAL':
        return {
          pista: 'Escribe `ayuda` y pregunta a Pantalla que aparecio. Tambien mandas tu las '
               + 'camaras de la puerta, aunque no las veas.',
          reglas: reglasDe(ctx.estado).length,
          camara: numero(ctx.estado, 'camara') || 1,
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
    const reglas = reglasDe(ctx.estado);

    // El circuito cerrado se atiende antes del switch: es el mismo mando
    // en todas las fases que tienen camaras, y no tiene nada que ver con
    // lo que cada una hace.
    const mando = mandoDeCamaras(CAMARAS, verbo, arg, ctx.estado);
    if (mando) return mando;

    switch (verbo) {
      case 'ayuda':
      case 'help':
        return ayuda();

      case 'reglas':
      case 'reglamento':
        return {
          bloques: [
            lista(
              'Reglamento del portero · se lee en orden',
              reglas.map((r, i) => ({ clave: `${i + 1}`, valor: pintarRegla(r) })),
            ),
            texto(['Si no encaja ninguna: DENEGAR.']),
          ],
        };

      case 'probar':
      case 'simular': {
        const fuera = desviaciones(reglas);
        return {
          bloques: [
            bloqueDePrueba(reglas),
            texto(
              fuera.length === 0
                ? ['Todo encaja con el objetivo. `desplegar` lo aplica de verdad.']
                : [
                    `${fuera.length} veredicto(s) fuera de sitio: ${fuera.map((f) => f.usuario).join(', ')}.`,
                    'Probar no cuesta nada. Prueba otra vez.',
                  ],
            ),
          ],
        };
      }

      case 'insertar':
      case 'regla': {
        if (reglas.length >= MAX_REGLAS) {
          return { bloques: [error(`El portero no admite mas de ${MAX_REGLAS} reglas. Borra alguna.`)] };
        }
        const r = parsearInsercion(arg, reglas.length);
        if ('fallo' in r) return r.fallo;
        const nuevas = [...reglas];
        nuevas.splice(r.pos, 0, r.regla);
        return {
          estado: { ...ctx.estado, reglas: nuevas },
          bloques: [
            texto([`${r.pos + 1}.  ${pintarRegla(r.regla)}`], 'Regla insertada'),
            texto(['Nada se ha aplicado todavia. `probar` para verla correr.']),
          ],
        };
      }

      case 'borrar':
      case 'quitar': {
        const n = Number(arg);
        if (!Number.isInteger(n) || n < 1 || n > reglas.length) {
          return { bloques: [error(`«${arg}» no es un numero de regla. Hay ${reglas.length}.`)] };
        }
        const nuevas = reglas.filter((_, i) => i !== n - 1);
        return {
          estado: { ...ctx.estado, reglas: nuevas },
          bloques: [texto([`Fuera la regla ${n}. Quedan ${nuevas.length}.`], 'Regla borrada')],
        };
      }

      case 'estado': {
        const fuera = desviaciones(reglas);
        return {
          bloques: [
            texto(
              [
                `Reglas en el reglamento: ${reglas.length}.`,
                fuera.length === 0
                  ? 'La simulacion ya cuadra: falta desplegar.'
                  : `Veredictos fuera de sitio: ${fuera.length}.`,
              ],
              'Estado',
            ),
          ],
        };
      }

      case 'desplegar':
      case 'aplicar': {
        const fuera = desviaciones(reglas);
        if (fuera.length === 0) {
          return {
            resuelto: true,
            estado: { ...ctx.estado, reglas },
            bloques: [
              exito('Reglamento desplegado · el portero no ha notado nada', [
                `${INFILTRADO} ha entrado.`,
                'Los otros seis siguen recibiendo exactamente el mismo veredicto que antes,',
                'asi que no hay nada que auditar y nadie a quien avisar.',
                '',
                'Lo que acabais de hacer tiene nombre: una condicion. El portero no',
                'es listo, solo hace preguntas en un orden y se queda con la primera',
                'respuesta. Quien manda no es la regla mas justa: es la primera.',
              ]),
            ],
          };
        }
        // Mismo rechazo se haya pasado de ancho o se haya quedado corto:
        // decir CUÁL sobra sería resolverle la condición al equipo, que es
        // exactamente lo que tiene que pensar.
        return rechazo(
          ctx,
          `El portero ha detectado ${fuera.length} veredicto(s) que no cuadran con los de ayer `
          + 'y ha revertido el reglamento. Alguien ha mirado.',
          { reglas },
        );
      }

      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto}». Prueba \`ayuda\`.`)] };
    }
  },
};

// ============================================================
//  El analizador de `insertar`
//
//  Devuelve mensajes que enseñan a escribir la regla en vez de un «error
//  de sintaxis»: esta fase va de aprender a escribir condiciones, y un
//  parser hosco enseñaría a rendirse.
// ============================================================

type Insercion = { pos: number; regla: Regla } | { fallo: ResultadoComando };

function parsearInsercion(arg: string, cuantas: number): Insercion {
  const palabras = arg.split(' ').filter(Boolean);
  const malo = (t: string): Insercion => ({ fallo: { bloques: [error(t)] } });

  const n = Number(palabras[0]);
  if (!Number.isInteger(n) || n < 1 || n > cuantas + 1) {
    return malo(`Falta en que posicion va. Hay ${cuantas} reglas, asi que va de 1 a ${cuantas + 1}.`);
  }
  if (palabras[1] !== 'si') return malo('Despues del numero va `si`. Ejemplo: insertar 1 si turno = noche entonces permitir');

  const iEntonces = palabras.indexOf('entonces');
  if (iEntonces === -1) return malo('Falta `entonces`: ... entonces permitir, o ... entonces denegar.');

  const accion = palabras[iEntonces + 1];
  if (accion !== 'permitir' && accion !== 'denegar') {
    return malo('Despues de `entonces` solo va `permitir` o `denegar`.');
  }

  const cuerpo = palabras.slice(2, iEntonces);
  if (cuerpo.length === 0) return malo('No has escrito ninguna condicion entre `si` y `entonces`.');

  const hayY = cuerpo.includes('y');
  const hayO = cuerpo.includes('o');
  if (hayY && hayO) {
    return malo('No mezcles `y` con `o` en la misma regla: no se sabria cual manda. Usa una sola, o parte la regla en dos.');
  }
  const junta: 'y' | 'o' = hayO ? 'o' : 'y';

  const trozos: string[][] = [[]];
  for (const w of cuerpo) {
    if (w === 'y' || w === 'o') trozos.push([]);
    else trozos[trozos.length - 1].push(w);
  }

  const cond: Condicion[] = [];
  for (const t of trozos) {
    if (t.length !== 3) {
      return malo(`Cada condicion son tres piezas: campo operador valor. «${t.join(' ') || '(vacio)'}» no lo es.`);
    }
    const [campo, op, valor] = t;
    if (!CAMPOS.includes(campo as keyof Persona)) {
      return malo(`«${campo}» no es un campo. Son: ${CAMPOS.join(' · ')}.`);
    }
    if (!OPS.includes(op as Op)) {
      return malo(`«${op}» no es un operador. Son: ${OPS.join('  ')}.`);
    }
    if (campo !== 'nivel' && !['=', '!='].includes(op)) {
      return malo(`Con «${campo}» solo valen = y !=. Ordenar texto con ${op} no significa nada.`);
    }
    if (campo === 'nivel' && Number.isNaN(Number(valor))) {
      return malo(`«${valor}» no es un numero, y `+ '`nivel` es un numero.');
    }
    cond.push({ campo: campo as keyof Persona, op: op as Op, valor });
  }

  return { pos: n - 1, regla: { cond, junta, accion } };
}
