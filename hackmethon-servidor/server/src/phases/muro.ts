// ============================================================
//  FASE 3 — Muro de Repetición   ·   CICLOS
//
//  Un laberinto de 17 x 11 con dos barreras y cuatro rocas. Se gana
//  llegando a la salida.
//
//  EL REPARTO
//    PANTALLA  el plano y donde esta el corredor. El plano enseña muros y
//              pasillos, pero NO lo que hay dentro de un pasillo: una
//              roca y un hueco libre se ven igual hasta que alguien mira.
//    TERMINAL  la consola y un tablero con su casilla y su rumbo. No ve
//              el plano.
//    DATOS     la tabla de durezas y las reglas. Ni el plano ni las
//              barreras.
//
//  LO QUE ENSEÑA
//    · un ciclo contado, dos veces: para ANDAR el pasillo
//      (`repetir 8 veces mover derecha`) y para tumbar una barrera
//    · que un ciclo se para cuando ya no puede seguir, y cuantas vueltas
//      llego a dar es informacion
//    · ciclos ANIDADOS: hay barreras que no ceden a golpes seguidos
//    · que mirar antes de andar sale mas barato que chocarse
//
//  Las rocas son el motivo de que `mirar` exista. Estan colocadas donde
//  DUELEN: sin ellas la salida esta a 22 pasos y con ellas a 46, asi que
//  ninguna es decorado. El smoke lo comprueba, porque una roca que no
//  obliga a rodear es una roca que el equipo nunca sabra que estuvo ahi.
// ============================================================

import type { Role } from '../lib/constants.js';
import type { ContextoComando, ModuloFase, ResultadoComando } from './types.js';
import {
  cuarentenaActiva, error, exito, lista, normalizar, numero, rechazo, tabla, texto,
} from './comun.js';

// ---------- El laberinto ----------
//
// Literal y no generado: un generador daria un laberinto distinto a cada
// equipo y ninguno revisable. Este salio de un backtracker con semilla
// fija, se comprobo y se pego aqui.
//
//   #  muro     ·  pasillo     R  roca     I  entrada     S  salida
//   1 2         barreras
export const PLANO = [
  '#################',
  '#IR1··#··2······#',
  '#·#·#·#·#·#·#·#·#',
  '#···#·····#··3#·#',
  '#··##########··R#',
  '#·R···········#·#',
  '#·###·#··######·#',
  '#·#·#···R·4···#·#',
  '#·#·#·#·##·##·#·#',
  '#···#·······#·5S#',
  '#################',
];
const FILAS = PLANO.length;
const COLS = PLANO[0].length;
const ENTRADA: [number, number] = [1, 1];

const dentro = (f: number, c: number) => f >= 0 && f < FILAS && c >= 0 && c < COLS;
const casilla = (f: number, c: number) => (dentro(f, c) ? PLANO[f][c] : '#');
const esMuro = (f: number, c: number) => casilla(f, c) === '#';
const esRoca = (f: number, c: number) => casilla(f, c) === 'R';
const esSalida = (f: number, c: number) => casilla(f, c) === 'S';
const barreraEn = (f: number, c: number): number | null => {
  const ch = casilla(f, c);
  return /[0-9]/.test(ch) ? Number(ch) : null;
};

const RUMBOS: Record<string, [number, number]> = {
  arriba: [-1, 0], abajo: [1, 0], izquierda: [0, -1], derecha: [0, 1],
};

// ---------- Las barreras ----------

type Barrera = { numero: number; material: string; grosor: number; tandas?: number };

// Las cinco estan en CUELLOS DE BOTELLA: cada una, por si sola, corta el
// paso a la salida. No hay forma de rodear ninguna, y eso esta comprobado
// en el smoke — una barrera que se puede esquivar no es una barrera que
// haya que destruir.
export const BARRERAS: Barrera[] = [
  { numero: 1, material: 'chapa', grosor: 4 },                 // 120, seguidos
  { numero: 2, material: 'acero', grosor: 7 },                 // 420, seguidos
  { numero: 3, material: 'hormigon', grosor: 6, tandas: 4 },   // 360 en 4 x 90
  { numero: 4, material: 'chapa', grosor: 8 },                 // 240, seguidos
  { numero: 5, material: 'blindaje', grosor: 5, tandas: 3 },   // 450 en 3 x 150
];

export const DUREZA: Record<string, number> = {
  chapa: 30, acero: 60, hormigon: 60, blindaje: 90, plomo: 120,
};

const laBarrera = (n: number) => BARRERAS.find((b) => b.numero === n)!;
const golpesDe = (b: Barrera) => b.grosor * DUREZA[b.material];
const placaDe = (b: Barrera) =>
  `${b.material.toUpperCase()} · grosor ${b.grosor}` + (b.tandas ? ` · ${b.tandas} tandas` : '');

// ---------- La mitad del Operador de Datos ----------
const ESQUEMA = {
  tablas: [
    {
      id: 'durezas',
      nombre: 'durezas',
      x: 40, y: 30, w: 400,
      descripcion: 'Golpes que aguanta cada material POR UNIDAD de grosor',
      clave: 'id',
      columnas: ['id', 'material', 'golpes por unidad'],
      filas: [
        ['M1', 'chapa', '30'], ['M2', 'acero', '60'], ['M3', 'hormigon', '60'],
        ['M4', 'blindaje', '90'], ['M5', 'plomo', '120'],
      ],
    },
    {
      id: 'reglas',
      nombre: 'reglas',
      x: 520, y: 30, w: 460,
      descripcion: 'Como se comporta el laberinto',
      clave: 'id',
      columnas: ['id', 'regla'],
      filas: [
        ['G1', 'Golpes = grosor x golpes por unidad.'],
        ['G2', 'El hormigon y el blindaje no ceden a golpes seguidos: hay que darles en TANDAS iguales.'],
        ['G3', 'Cuantas tandas lleva cada barrera va escrito en su placa.'],
        ['G4', 'Pasarse de golpes dispara la alarma.'],
        ['G5', 'Una barrera que aguanta se recompone: los golpes no se acumulan.'],
        ['G6', 'Hay pasillos taponados por roca. La roca no se rompe: se rodea.'],
        ['G7', 'Una roca solo se ve mirando desde la casilla de al lado.'],
      ],
    },
  ],
  relaciones: [],
} as const;

// ---------- Estado ----------

/**
 * `hacia` es lo que permite animar un golpe ACERTADO.
 *
 * Al romperse, la barrera pasa a ser pasillo en el mismo estado que
 * viaja, asi que la pantalla ya no encuentra ninguna barrera al lado a la
 * que embestir y el acierto —justo el golpe que hay que celebrar— se
 * quedaba sin animacion. Diciendo hacia donde fue, la embestida no
 * depende de algo que acaba de dejar de existir.
 */
type Intento = {
  n: number; golpes: number; tandas: number | null; resultado: string;
  hacia: string; barrera: number;
};

const posDe = (e: Record<string, unknown>): [number, number] =>
  Array.isArray(e.pos) ? (e.pos as [number, number]) : ENTRADA;
const rotasDe = (e: Record<string, unknown>): number[] =>
  Array.isArray(e.rotas) ? (e.rotas as number[]) : [];
/** Casillas que alguien ya ha mirado o contra las que se ha chocado. */
const vistasDe = (e: Record<string, unknown>): string[] =>
  Array.isArray(e.vistas) ? (e.vistas as string[]) : [];
const paseoDe = (e: Record<string, unknown>): [number, number][] =>
  Array.isArray(e.paseo) ? (e.paseo as [number, number][]) : [];
const ultimoDe = (e: Record<string, unknown>): Intento | null => (e.ultimo as Intento) ?? null;

const clave = (f: number, c: number) => `${f},${c}`;

/** Lo que se ve al entrar en una casilla. Un pasillo con roca y uno libre
 *  se pintan IGUAL hasta que se mira: esa es toda la niebla que hay, y es
 *  la que obliga a `mirar` antes de lanzarse. */
function vistaLaberinto(estado: Record<string, unknown>) {
  const [pf, pc] = posDe(estado);
  const rotas = rotasDe(estado);
  const vistas = vistasDe(estado);

  return {
    rejilla: PLANO.map((fila, f) =>
      [...fila].map((ch, c) => {
        const descubierta = vistas.includes(clave(f, c));
        const n = barreraEn(f, c);
        const tipo =
          ch === '#' ? 'muro'
          : ch === 'I' ? 'entrada'
          : ch === 'S' ? 'salida'
          : ch === 'R' ? (descubierta ? 'roca' : 'camino')
          : n !== null ? (rotas.includes(n) ? 'camino' : descubierta ? 'barrera' : 'camino')
          : 'camino';
        return {
          tipo,
          barrera: tipo === 'barrera' ? n : null,
          placa: tipo === 'barrera' && n !== null ? placaDe(laBarrera(n)) : null,
        };
      }),
    ),
    pos: [pf, pc] as [number, number],
    paseo: paseoDe(estado),
    choque: (estado.choque as {
      desde: [number, number]; hacia: string; contra: string; n: number;
    } | undefined) ?? null,
    ultimo: ultimoDe(estado),
    rotas,
    fuera: esSalida(pf, pc),
  };
}

/** La barrera en pie pegada al corredor. Si solo hay una, no hace falta
 *  decir hacia dónde se golpea. */
function barreraAlLado(estado: Record<string, unknown>, rumbo?: string) {
  const [f, c] = posDe(estado);
  const rotas = rotasDe(estado);
  const lados = Object.entries(RUMBOS)
    .map(([nombre, [df, dc]]) => ({ nombre, f: f + df, c: c + dc }))
    .map((x) => ({ ...x, n: barreraEn(x.f, x.c) }))
    .filter((x) => x.n !== null && !rotas.includes(x.n));
  if (rumbo) return lados.find((x) => x.nombre === rumbo) ?? null;
  return lados.length === 1 ? lados[0] : null;
}

function ayuda(): ResultadoComando {
  return {
    bloques: [
      texto(
        [
          'mover <arriba|abajo|izquierda|derecha>   — una casilla',
          'repetir <n> veces mover <direccion>      — n casillas seguidas',
          'mirar                                    — que hay en las cuatro casillas de al lado',
          'golpear                                  — UN golpe a la barrera de al lado',
          'repetir <n> veces golpear',
          'repetir <n> tandas de <m> golpes',
          'donde                                    — en que casilla estas',
        ],
        'Comandos disponibles',
      ),
      texto(
        [
          'El plano enseña los muros, pero NO lo que hay dentro de un pasillo.',
          'Hay pasillos taponados por roca, y una roca se ve igual que un hueco',
          'libre hasta que alguien mira.',
          '',
          'ESTRELLARSE REINICIA EL LABERINTO: contra un muro, contra una roca o',
          'contra una barrera en pie. Se vuelve a la entrada y las barreras se',
          'levantan otra vez. Lo unico que se conserva es el plano ya descubierto.',
          '',
          '`mirar` dice cuantas casillas libres hay en cada direccion. Ese numero es',
          'exactamente el del ciclo. Mirad antes de CADA tramo.',
        ],
        'Lo que el plano no dice, y lo que cuesta',
      ),
      texto(
        [
          'Un ciclo contado sirve para las dos cosas que se hacen aqui:',
          '',
          '  repetir 8 veces mover derecha      — ocho casillas de una tacada',
          '  repetir 120 veces golpear          — ciento veinte golpes',
          '',
          'Y un ciclo dentro de otro son tandas: el de dentro cuenta los golpes de',
          'cada tanda, el de fuera cuenta las tandas.',
          '',
          '  repetir 4 tandas de 90 golpes      — 360 golpes, en 4 grupos de 90',
          '',
          'Un ciclo de mover con una vuelta de mas os estrella. Por eso se mira',
          'primero: `mirar` os da el numero y el ciclo lo usa.',
        ],
        'Como se escribe un ciclo',
      ),
      texto(
        [
          'Esta terminal no ve el plano. Lo ve Pantalla, y lo que aguanta cada',
          'material lo tiene Datos: el numero de golpes sale de juntar las dos cosas.',
          'Se gana llegando a la salida.',
        ],
        'Lo que esta terminal NO sabe',
      ),
    ],
  };
}

export const muro: ModuloFase = {
  key: 'fase-3-muro',

  proyectar(role: Role, ctx) {
    const [f, c] = posDe(ctx.estado);
    const rotas = rotasDe(ctx.estado);
    const alLado = barreraAlLado(ctx.estado);

    switch (role) {
      case 'DATOS':
        return {
          titulo: 'Manual del laberinto · durezas y reglas',
          nota: 'Tu tienes lo que aguanta cada material y las reglas del sitio. No veras el '
              + 'plano ni ninguna barrera: el material y el grosor de cada una los lee Pantalla '
              + 'cuando tu companero mira. El numero de golpes sale de juntar las dos cosas.',
          lienzo: { w: 1020, h: 300 },
          ...ESQUEMA,
        };

      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          laberinto: vistaLaberinto(ctx.estado),
          nota: 'Tu ves el plano y donde esta tu companero. El plano enseña los muros, pero no '
              + 'lo que TAPONA un pasillo: las rocas y las barreras solo aparecen cuando el mira '
              + 'desde al lado. El no ve nada de esto: cantaselo.',
        };

      case 'TERMINAL':
        return {
          pista: 'Escribe `ayuda` y pregunta a Pantalla que aparecio.',
          tablero: {
            fila: f, columna: c,
            rotas: rotas.length,
            total: BARRERAS.length,
            reinicios: numero(ctx.estado, 'reinicios'),
            // Que hay una barrera al lado si lo sabe: se la acaba de
            // encontrar. QUE barrera es, y que pone en su placa, no.
            barreraAlLado: alLado ? alLado.nombre : null,
            enSalida: esSalida(f, c),
            ultimo: ultimoDe(ctx.estado),
          },
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

    switch (verbo) {
      case 'ayuda':
      case 'help':
        return ayuda();

      case 'donde':
      case 'estado': {
        const [f, c] = posDe(ctx.estado);
        const alLado = barreraAlLado(ctx.estado);
        return {
          bloques: [lista('Estado', [
            { clave: 'Casilla', valor: `fila ${f}, columna ${c}` },
            { clave: 'Barreras derribadas', valor: `${rotasDe(ctx.estado).length} de ${BARRERAS.length}` },
            { clave: 'Al lado', valor: alLado ? `una barrera, a tu ${alLado.nombre}` : 'nada que golpear' },
            { clave: 'Reinicios', valor: String(numero(ctx.estado, 'reinicios')) },
          ])],
        };
      }

      case 'mirar':
      case 'examinar': {
        const [f, c] = posDe(ctx.estado);
        const rotas = rotasDe(ctx.estado);
        const nuevas = new Set(vistasDe(ctx.estado));
        const filas: string[][] = [];

        // Se mira HASTA EL FONDO de cada pasillo, no una casilla. Ese
        // numero es el que hace falta: `mirar` dice cuantas casillas hay
        // libres y el ciclo las anda de una tacada. Si solo enseñara la
        // casilla de al lado, con el reinicio por choque nadie se
        // atreveria a escribir un `repetir` y se perderia la mitad de lo
        // que la fase enseña.
        for (const [nombre, [df, dc]] of Object.entries(RUMBOS)) {
          let libres = 0;
          let nf = f + df, nc = c + dc;
          let fin = '';
          for (;;) {
            nuevas.add(clave(nf, nc));
            const n = barreraEn(nf, nc);
            if (esMuro(nf, nc)) { fin = 'muro'; break; }
            if (esRoca(nf, nc)) { fin = 'ROCA — no se rompe, se rodea'; break; }
            if (n !== null && !rotas.includes(n)) { fin = `BARRERA — ${placaDe(laBarrera(n))}`; break; }
            libres++;
            if (esSalida(nf, nc)) { fin = 'LA SALIDA'; break; }
            nf += df; nc += dc;
          }
          filas.push([nombre, `${libres} libre(s)`, fin]);
        }

        return {
          estado: { ...ctx.estado, vistas: [...nuevas] },
          bloques: [
            tabla(`Desde la casilla ${f},${c}`, ['hacia', 'cuantas', 'y luego'], filas),
            texto([
              'Esos numeros son los del ciclo: si dice 8 libres, `repetir 8 veces mover`',
              'llega justo al final. Uno mas y te estrellas.',
            ]),
          ],
        };
      }

      case 'mover': {
        const rumbo = RUMBOS[arg];
        if (!rumbo) {
          return {
            bloques: [error(`«${arg || '(nada)'}» no es una direccion. Son: arriba, abajo, izquierda, derecha.`)],
          };
        }
        return andar(ctx, arg, 1);
      }

      case 'repetir':
      case 'ciclo': {
        const p = arg.split(' ').filter(Boolean);
        const n = Number(p[0]);
        if (!Number.isInteger(n) || n <= 0) {
          return {
            bloques: [
              error(`«${p[0] ?? '(nada)'}» no es un numero de repeticiones.`),
              texto(['  repetir <n> veces mover <direccion>', '  repetir <n> veces golpear', '  repetir <n> tandas de <m> golpes']),
            ],
          };
        }

        // repetir n veces mover <dir>
        if ((p[1] === 'veces' || p[1] === 'vez') && p[2] === 'mover') {
          const rumbo = p[3];
          if (!RUMBOS[rumbo]) {
            return { bloques: [error(`«${rumbo || '(nada)'}» no es una direccion. Son: arriba, abajo, izquierda, derecha.`)] };
          }
          return andar(ctx, rumbo, n);
        }
        if (p[1] === 'veces' || p[1] === 'vez') {
          if (p[2] && p[2] !== 'golpear' && p[2] !== 'golpes') {
            return { bloques: [error(`No se que es «${p[2]}». Se puede repetir `+'`mover <direccion>` o `golpear`.')] };
          }
          return golpear(ctx, n, null);
        }
        if (p[1] === 'tandas' || p[1] === 'tanda') {
          if (p[2] !== 'de') return { bloques: [error('Falta el `de`: `repetir <n> tandas de <m> golpes`.')] };
          const m = Number(p[3]);
          if (!Number.isInteger(m) || m <= 0) {
            return { bloques: [error(`«${p[3] ?? '(nada)'}» no es un numero de golpes por tanda.`)] };
          }
          return golpear(ctx, n * m, n);
        }
        return {
          bloques: [
            error(`No entiendo «${arg}».`),
            texto([
              '  repetir <n> veces mover <direccion>',
              '  repetir <n> veces golpear',
              '  repetir <n> tandas de <m> golpes',
            ]),
          ],
        };
      }

      case 'golpear':
        return golpear(ctx, 1, null);

      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto}». Prueba \`ayuda\`.`)] };
    }
  },
};

/**
 * Andar.
 *
 * Chocarse REINICIA la fase: vuelta a la entrada y las barreras otra vez
 * en pie. Es duro a proposito — es lo que convierte `mirar` en
 * obligatorio antes de cada tramo en vez de en una comodidad.
 *
 * Lo que NO se pierde es el plano: lo que ya se habia descubierto sigue
 * descubierto. Sin eso, un equipo podria dar vueltas toda la tarde sin
 * llegar nunca, y el castigo dejaria de enseñar para pasar a impedir.
 * Se pierde el avance; se conserva lo aprendido.
 */
function andar(ctx: ContextoComando, rumbo: string, veces: number): ResultadoComando {
  const [df, dc] = RUMBOS[rumbo];
  let [f, c] = posDe(ctx.estado);
  const rotas = rotasDe(ctx.estado);
  const vistas = new Set(vistasDe(ctx.estado));
  const paseo: [number, number][] = [[f, c]];
  let dados = 0;

  for (let i = 0; i < veces; i++) {
    const [nf, nc] = [f + df, c + dc];
    const n = barreraEn(nf, nc);
    const contra =
      esMuro(nf, nc) ? 'un muro'
      : esRoca(nf, nc) ? 'una ROCA'
      : n !== null && !rotas.includes(n) ? 'una BARRERA en pie'
      : null;

    if (contra) {
      vistas.add(clave(nf, nc));
      const reinicios = numero(ctx.estado, 'reinicios') + 1;
      return {
        // El plano sobrevive; lo demas, no.
        estado: {
          vistas: [...vistas],
          reinicios,
          fallos: numero(ctx.estado, 'fallos'),
          cuarentenaHasta: ctx.estado.cuarentenaHasta,
          pos: ENTRADA,
          paseo: [ENTRADA],
          // Donde y contra que se estrello. La posicion ya es la entrada
          // —el reinicio es inmediato en el servidor— asi que sin esto la
          // pantalla no tendria como enseñar el golpe: solo veria al
          // corredor aparecer de vuelta en la salida sin saber por que.
          // `n` sube con cada choque, para que dos iguales seguidos no se
          // confundan con uno solo.
          choque: { desde: [f, c], hacia: rumbo, contra, n: reinicios },
        },
        bloques: [
          error(
            `Te has estrellado contra ${contra} yendo hacia ${rumbo}`
            + `${dados ? `, en la casilla ${dados + 1} de ${veces}` : ''}.`,
          ),
          texto(
            [
              'El laberinto se reinicia: vuelves a la entrada y las barreras estan otra vez en pie.',
              'Lo que ya habiais descubierto del plano SIGUE descubierto.',
              '',
              '`mirar` dice cuantas casillas libres hay en cada direccion. Ese numero es el',
              'del ciclo: mirad antes de cada tramo y esto no vuelve a pasar.',
              '',
              `Reinicios: ${reinicios}.`,
            ],
            'REINICIO',
          ),
        ],
      };
    }

    f = nf; c = nc; dados++;
    paseo.push([f, c]);
    if (esSalida(f, c)) break;
  }

  const estado = { ...ctx.estado, pos: [f, c], vistas: [...vistas], paseo, choque: null };

  if (esSalida(f, c)) {
    return {
      resuelto: true,
      estado,
      bloques: [
        exito('Fuera del laberinto', [
          `Ultimo tramo: ${dados} casilla(s) hacia ${rumbo}.`,
          numero(ctx.estado, 'reinicios')
            ? `Reinicios por el camino: ${numero(ctx.estado, 'reinicios')}.`
            : 'Y sin estrellaros ni una vez.',
          '',
          'Un ciclo es la misma frase repetida un numero de veces, y aqui ha servido',
          'para las dos cosas que se hacen en este sitio: andar el pasillo y tumbar',
          'la barrera. Da igual que sean 8 casillas o 450 golpes, se escribe igual',
          'de corto — y esa es la gracia.',
          '',
          'Y el numero no lo sacasteis a ojo: lo sacasteis de mirar. Un ciclo con el',
          'numero equivocado os devolvia a la entrada, asi que mirar antes de andar',
          'no era una comodidad, era la unica forma de avanzar.',
        ]),
      ],
    };
  }

  return {
    estado,
    bloques: [texto([`${dados} casilla(s) hacia ${rumbo}.`], 'Andando')],
  };
}

/**
 * Golpear la barrera de al lado. Las tres salidas —pasarse, quedarse
 * corto, justo— son las de siempre: lo que cambia es que ahora la barrera
 * se elige por donde estas, no por donde vas.
 */
function golpear(ctx: ContextoComando, golpes: number, tandas: number | null): ResultadoComando {
  const lado = barreraAlLado(ctx.estado);
  if (!lado || lado.n === null) {
    return {
      bloques: [
        error('No tienes ninguna barrera al lado a la que golpear.'),
        texto(['Hay que ponerse en la casilla de al lado. `mirar` te dice si la tienes pegada.']),
      ],
    };
  }

  const barrera = laBarrera(lado.n);
  const hacenFalta = golpesDe(barrera);
  const n = numero(ctx.estado, 'intentos') + 1;
  const dados = numero(ctx.estado, 'dados') + golpes;
  const marca = (resultado: string) =>
    ({ n, golpes, tandas, resultado, hacia: lado.nombre, barrera: barrera.numero });
  const vistas = [...new Set([...vistasDe(ctx.estado), clave(lado.f, lado.c)])];

  if (golpes > hacenFalta) {
    return rechazo(
      ctx,
      `${golpes} golpes y la barrera ${barrera.numero} aguanta menos: el de mas ha dado `
      + 'contra la pared y ha disparado la alarma.',
      { ultimo: marca('ALARMA'), dados, intentos: n, vistas },
    );
  }

  if (golpes < hacenFalta) {
    return {
      estado: { ...ctx.estado, ultimo: marca('aguanta'), dados, intentos: n, vistas },
      bloques: [
        tabla(`Barrera ${barrera.numero}`, ['golpes', 'forma', 'resultado'],
          [[String(golpes), tandas ? `${tandas} tandas de ${golpes / tandas}` : 'seguidos', 'AGUANTA']]),
        texto(['Se recompone: los golpes no se acumulan. Hay que darle el numero entero de una vez.']),
      ],
    };
  }

  if (barrera.tandas && tandas !== barrera.tandas) {
    return {
      estado: { ...ctx.estado, ultimo: marca('aguanta'), dados, intentos: n, vistas },
      bloques: [
        tabla(`Barrera ${barrera.numero}`, ['golpes', 'forma', 'resultado'],
          [[String(golpes), tandas ? `${tandas} tandas` : 'seguidos', 'AGUANTA']]),
        texto([
          'El numero de golpes es el correcto y aun asi no cae.',
          'Hay materiales que no ceden a golpes SEGUIDOS. Preguntad a Datos por las reglas,',
          'y a Pantalla que mas pone en la placa.',
        ]),
      ],
    };
  }

  const rotas = [...rotasDe(ctx.estado), barrera.numero];
  return {
    estado: { ...ctx.estado, rotas, ultimo: marca('ROTA'), dados, intentos: n, vistas },
    bloques: [{
      tipo: 'exito',
      titulo: `Barrera ${barrera.numero} derribada · ${rotas.length} de ${BARRERAS.length}`,
      lineas: [
        `${golpes} golpes${tandas ? ` en ${tandas} tandas de ${golpes / tandas}` : ' seguidos'}.`,
        `El paso a tu ${lado.nombre} queda libre.`,
      ],
    }],
  };
}
