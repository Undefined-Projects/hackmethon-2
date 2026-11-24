// ============================================================
//  FASE 1 — La Maraña   ·   SECUENCIAS Y CICLOS
//  Lámina I · la pierna izquierda
//  BONUS  — La Espesura ·   CICLOS QUE DECIDEN   (el corazón)
//
//  Un homenaje a Karel the Robot (Richard E. Pattis, 1981): una flecha en
//  una cuadrícula que solo sabe avanzar y girar, y con la que
//  generaciones aprendieron qué es un programa. Aquí la flecha es un
//  BROTE, y la cuadrícula, la pierna de la máquina.
//
//  «Para entrar en la máquina hay que cruzar su pierna izquierda, y con
//   los años se volvió una maraña.»
//
//  El equipo manda un BROTE —su programa— a cruzarla. Terminal le
//  escribe el camino instrucción a instrucción:
//
//      repetir 3 veces
//          girar izquierda
//          avanzar
//          ...
//      fin
//
//  y lo LANZA. El brote arranca siempre en la entrada; si se estrella
//  contra una pared o pisa una espina, se desconecta y hay que mandar
//  otro desde el principio.
//
//  LA MARAÑA · dos capas, unos 25 minutos. Es la PRIMERA fase: la juega
//  gente que nunca ha programado.
//    1 · EL SEMILLERO Un laberinto chiquito, sin espinas ni límite que
//                     apriete: avanzar, girar y lanzar. Sirve para que los
//                     tres puestos aprendan a hablarse, y para descubrir
//                     que izquierda y derecha son las del brote.
//    2 · EL SETO      Un laberinto fijo, que Pantalla ve entero. El brote
//                     no carga más de 10 líneas y el camino bueno pide 24
//                     pasos: no cabe sin un `repetir`. Y hay ESPINAS que no
//                     se ven: el plano las pinta como camino. Las tiene Datos.
//
//  LA ESPESURA · el bonus, de dificultad media, para quien le sobre tiempo.
//    Un laberinto del doble de lado, a oscuras, con CUATRO brotes que nacen
//    en las cuatro esquinas y buscan el mismo claro, en el centro. Llevan
//    el MISMO programa: como salen de sitios distintos, no hay camino que
//    dictar y el brote tiene que DECIDIR, con sensores (`frente libre`…),
//    ciclos que no saben cuántas vueltas darán y condiciones dentro. El
//    camino más corto de cada brote pasa por una MINA, que ni el plano ni
//    los sensores notan: las tiene Datos. Lo que alumbran los brotes se
//    queda encendido para Pantalla, y se cruza cuando los cuatro llegan en
//    el mismo lanzamiento.
//
//  LO QUE ENSEÑA
//    · un programa es una lista de pasos que se cumplen en orden, al pie
//      de la letra (el semillero)
//    · un ciclo es repetir sin reescribir: 24 pasos caben en 10 líneas
//    · lo que va dentro del ciclo es lo que se repite, y el orden importa
//    · (bonus) cuando no sabes cuántas vueltas hacen falta, repites
//      MIENTRAS algo sea cierto, y decides dentro con un `si`; un programa
//      que decide sirve igual desde cualquier punto de partida
//
//  EL REPARTO
//    PANTALLA  el laberinto y los brotes caminando. En el semillero y el
//              seto lo ve entero; en la espesura, lo que han ido alumbrando.
//    DATOS     el programa dibujado —con la línea que se está ejecutando y
//              la vuelta de cada ciclo—, el manual, las espinas del seto,
//              las minas y cómo creció la espesura, y la bitácora.
//    TERMINAL  escribe el programa y lo lanza. No ve el laberinto ni el
//              programa: cuántas líneas lleva y cuántos bloques tiene
//              abiertos, nada más.
//
//  Los dos módulos (`marana` y `espesura`) comparten este motor: lo único
//  que cambia es qué capas tiene cada uno.
// ============================================================

import type { Role } from '../lib/constants.js';
import type { ContextoComando, ModuloFase, ResultadoComando } from './types.js';
import { error, exito, normalizar, numero, texto } from './comun.js';

/** Qué es una capa, sea de la fase que sea. */
type Tipo = 'semillero' | 'seto' | 'espesura';
/** El número de capa DENTRO de su fase, desde 1. */
type Capa = number;

const NOMBRE_TIPO: Record<Tipo, string> = { semillero: 'EL SEMILLERO', seto: 'EL SETO', espesura: 'LA ESPESURA' };
/** Lo que el brote ya entiende en cada tipo de capa, de menos a más. */
const NIVEL: Record<Tipo, number> = { semillero: 0, seto: 1, espesura: 2 };

/** Las capas de cada fase. */
type Config = {
  key: string;
  tipos: Tipo[];
  /** Cómo se llama en la cámara de Pantalla. */
  titulo: string;
  /** Lo que sale cuando la fase se cruza: en Pantalla, en grande. */
  final: { t: string; sub: string };
};

/** Cuántas líneas carga el brote. En el semillero, de sobra: el camino son
 *  nueve acciones y no hace falta ningún ciclo. En el seto el camino bueno
 *  son 24 pasos: escrito a mano no cabe, con un ciclo sí. En la espesura,
 *  un seguidor de pared con dos ciclos anidados ocupa 12: algo de aire. */
const MAX_LINEAS: Record<Tipo, number> = { semillero: 12, seto: 10, espesura: 14 };
const MAX_VECES = 99;
/** Lo que aguanta un brote antes de agotarse: pasos y giros. La espesura
 *  promete que el camino bueno de cada brote cabe en `ESP_MAX_ACCIONES`. */
const MAX_ACCIONES = 400;
/** Instrucciones evaluadas, contando las vueltas en vacío de un ciclo. Es
 *  lo que corta `repetir mientras frente libre` sin nada dentro. */
const MAX_EVALUACIONES = 6000;
/** Filas de la bitácora: en la espesura cada lanzamiento deja cuatro. */
const MAX_VIAJES = 24;

/** El ritmo de la caminata. Lo usan el servidor —para saber cuándo puede
 *  salir el siguiente brote— y los clientes, para andarlo: así Pantalla y
 *  Datos van al mismo paso sin hablarse. */
export const RITMO = { inicio: 900, paso: 520, giro: 400, choque: 1100, fin: 1500 };
/** En la espesura andan cuatro a la vez y muy lejos: van a compás, una
 *  acción por golpe de reloj, todas igual de largas. Lo bastante despacio
 *  para que Datos siga la línea de cada uno en el programa. */
export const RITMO_ESPESURA = { inicio: 1100, paso: 200, giro: 200, choque: 200, fin: 2200 };
type Ritmo = typeof RITMO;
/** Lo que tarda en germinar el siguiente brote cuando el anterior acaba.
 *  Igual pase lo que pase: si fuera más largo tras un choque, la consola
 *  sabría que chocó sin que nadie se lo dijera. */
const GERMINA_MS = 2500;
/** El paso de una capa a la siguiente, encima de la caminata. */
const TRANSICION_MS = 6500;

// ---------- Rumbos ----------
// 0 norte · 1 este · 2 sur · 3 oeste. Girar a la izquierda resta uno.
type Rumbo = 0 | 1 | 2 | 3;
const DF = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];
const izquierdaDe = (d: Rumbo) => ((d + 3) % 4) as Rumbo;
const derechaDe = (d: Rumbo) => ((d + 1) % 4) as Rumbo;

// ============================================================
//  EL SEMILLERO · la capa de calentamiento de La Maraña
//
//  Lo más sencillo que se puede pedir: nueve acciones, dos giros —uno a
//  cada lado— y nada escondido. No enseña ciclos; enseña el juego: quién
//  ve qué, cómo se dicta, cómo se escribe, que `lanzar` es cuando de
//  verdad pasa algo y que izquierda y derecha son LAS DEL BROTE. Se
//  gira y se refleja por mesa, como el seto.
//
//    #  pared   ·  camino   E  entrada (mirando al este)   S  salida
// ============================================================

const SEMILLERO = [
  '#######',
  '#E...##',
  '####.##',
  '####.##',
  '####.S#',
  '#######',
  '#######',
];

// ============================================================
//  EL SETO · capa 2 de La Maraña
//
//  Literal y no generado: se revisa a ojo y el smoke comprueba lo que
//  promete. Tres caminos, todos con forma de ciclo:
//    · la L de abajo y la derecha: la obvia, 9 + 9. Tiene una espina.
//    · la escalera que arranca hacia delante (A): avanzar 3, girar, ×3.
//    · la escalera que arranca girando (B): girar, avanzar 3, girar, ×3.
//  Una de las dos escaleras tiene espinas y la otra no; cuál, depende de
//  la mesa. Sin la tabla de espinas es una moneda al aire. Son tres en
//  total, pocas a propósito: es la primera fase y Datos aprende a cruzar
//  su tabla con el plano, no a hacer inventario.
//
//    #  pared   ·  camino   E  entrada (mirando al este)   S  salida
//    a  espina si la escalera mala es la A    b  si es la B
//    c  espina siempre (la L)
// ============================================================

const SETO = [
  '############',
  '##.####.b.S#',
  '##...##.##.#',
  '####.##.##.#',
  '#..#.......#',
  '#.##.##.##.#',
  '#.##.##a##c#',
  '#.......##.#',
  '#b##.###.#.#',
  '#.##a#.#.#.#',
  '#E.........#',
  '############',
];
const RUMBO_ENTRADA: Rumbo = 1;

// ============================================================
//  Una versión por equipo
//
//  Cada mesa juega el MISMO seto con otra piel: girado o reflejado (las
//  ocho simetrías del cuadrado) y con la escalera mala en un sitio o en
//  otro. Al reflejarlo, izquierda y derecha se cambian: el programa de
//  una mesa no sirve en la de al lado. Todo sale de la semilla —el id del
//  equipo—; sin semilla, la canónica (sin girar, la escalera A con espinas).
// ============================================================

type Celda = '#' | '.' | 'E' | 'S' | '*';
type Rejilla = Celda[][];

type Seto = {
  rejilla: Rejilla;
  entrada: [number, number];
  salida: [number, number];
  rumbo: Rumbo;
  /** Las espinas, en el orden en que las lista Datos. */
  espinas: [number, number][];
  /** La escalera mala, para las pruebas y la guía. */
  mala: 'A' | 'B';
  sim: number;
};

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

/** Las ocho simetrías de un cuadrado de lado n: dónde cae (f, c). Las
 *  cuatro primeras giran; las cuatro últimas, además, reflejan. */
function simetria(sim: number, n: number, f: number, c: number): [number, number] {
  const m = n - 1;
  switch (sim) {
    case 0: return [f, c];
    case 1: return [c, m - f];          // 90° a la derecha
    case 2: return [m - f, m - c];      // 180°
    case 3: return [m - c, f];          // 90° a la izquierda
    case 4: return [f, m - c];          // espejo izquierda-derecha
    case 5: return [m - f, c];          // espejo arriba-abajo
    case 6: return [c, f];              // por la diagonal
    default: return [m - c, m - f];     // por la otra diagonal
  }
}
/** El rumbo, por la misma simetría: se mueve un paso y se mira hacia dónde
 *  quedó. Sin tabla aparte que pueda desincronizarse del plano. */
function rumboTras(sim: number, n: number, d: Rumbo): Rumbo {
  const [f0, c0] = simetria(sim, n, 5, 5);
  const [f1, c1] = simetria(sim, n, 5 + DF[d], 5 + DC[d]);
  const df = f1 - f0, dc = c1 - c0;
  return (df === -1 ? 0 : dc === 1 ? 1 : df === 1 ? 2 : 3) as Rumbo;
}

const setos = new Map<string, Seto>();

/** El semillero y el seto se hacen igual: un literal, girado o reflejado
 *  por mesa. El semillero no tiene espinas. */
function setoDe(semilla?: string, tipo: 'semillero' | 'seto' = 'seto'): Seto {
  const clave = `${tipo}:${semilla ?? ''}`;
  const hecho = setos.get(clave);
  if (hecho) return hecho;

  const r = semilla ? azarDe(tipo === 'seto' ? `${semilla}:seto` : `${semilla}:${tipo}`) : null;
  const sim = r ? Math.floor(r() * 8) : 0;
  const mala: 'A' | 'B' = r ? (r() < 0.5 ? 'A' : 'B') : 'A';
  const plano = tipo === 'seto' ? SETO : SEMILLERO;
  const n = plano.length;
  const rejilla: Rejilla = Array.from({ length: n }, () => Array<Celda>(n).fill('#'));
  let entrada: [number, number] = [0, 0];
  let salida: [number, number] = [0, 0];
  const espinas: [number, number][] = [];

  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      const ch = plano[f][c];
      const [f2, c2] = simetria(sim, n, f, c);
      let celda: Celda;
      if (ch === '#') celda = '#';
      else if (ch === 'E') { celda = 'E'; entrada = [f2, c2]; }
      else if (ch === 'S') { celda = 'S'; salida = [f2, c2]; }
      else if (ch === 'c' || (ch === 'a' && mala === 'A') || (ch === 'b' && mala === 'B')) {
        celda = '*'; espinas.push([f2, c2]);
      } else celda = '.';
      rejilla[f2][c2] = celda;
    }
  }
  // Datos las lee de arriba abajo y de izquierda a derecha, en el orden
  // del plano de ESTA mesa: el orden del literal delataría la simetría.
  espinas.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const seto: Seto = { rejilla, entrada, salida, rumbo: rumboTras(sim, n, RUMBO_ENTRADA), espinas, mala, sim };
  setos.set(clave, seto);
  return seto;
}

/** Solo para las pruebas y la guía: el seto (o el semillero) de una mesa. */
export const setoDeMarana = (semilla?: string) => setoDe(semilla);
export const semilleroDeMarana = (semilla?: string) => setoDe(semilla, 'semillero');

/** La columna en letras, como en una hoja de cálculo: A…Z, AA, AB… La
 *  espesura tiene 31 columnas: no caben en el abecedario. */
export const columnaDe = (c: number): string =>
  (c >= 26 ? columnaDe(Math.floor(c / 26) - 1) : '') + String.fromCharCode(65 + (c % 26));
/** «D7»: columna en letra y fila en número, como en el plano de Pantalla. */
export const casillaDe = ([f, c]: [number, number]) => `${columnaDe(c)}${f + 1}`;

// ============================================================
//  LA ESPESURA · la fase bonus
//
//  Un laberinto del doble de lado que el de antes (23 × 31), uno por
//  mesa y fijo: no cambia entre lanzamientos, así que lo que alumbran los
//  brotes se va quedando encendido. Cuatro brotes nacen en las cuatro
//  esquinas, cada uno mirando hacia donde hay camino, y buscan el mismo
//  claro, en el centro. Llevan el MISMO programa.
//
//  Lo que se promete —y Datos tiene en `crecimiento`— es lo que permite
//  escribir UN programa que lleve a los cuatro:
//    · la espesura tiene vueltas: hay más de un camino al claro;
//    · el camino más corto de CADA brote pasa por una mina;
//    · un brote que no suelta nunca la pared de uno de los dos lados llega
//      al claro sin pisar ninguna, desde las cuatro esquinas. Con la del
//      otro lado, alguno pisa una. Qué lado es depende de la mesa.
//  Todo se comprueba al crecer, andando el programa canónico con el mismo
//  intérprete que anda los del equipo (`caminar`).
// ============================================================

const ESP_MF = 11; // macro filas
const ESP_MC = 15; // macro columnas
const ESP_FILAS = ESP_MF * 2 + 1; // 23
const ESP_COLS = ESP_MC * 2 + 1; // 31
/** Cuántas paredes interiores se caen para que haya vueltas. */
const ESP_VUELTAS = 0.1;
/** El seguidor de pared bueno llega en esto o menos: con el ritmo de la
 *  espesura, menos de 40 s de caminata. */
const ESP_MAX_ACCIONES = 340;
const ESP_MIN_MINAS = 3;

type BroteEsp = { entrada: [number, number]; rumbo: Rumbo };
type Espesura = {
  rejilla: Rejilla;
  salida: [number, number];
  brotes: BroteEsp[];
  /** En el orden en que las lista Datos: de arriba abajo, de izquierda a derecha. */
  minas: [number, number][];
  /** La pared que lleva a los cuatro sin pisar una mina. Para las pruebas. */
  mano: 'izquierda' | 'derecha';
};

/** El seguidor de pared de manual: 12 líneas. Lo usan el generador, para
 *  comprobar lo que promete, y las pruebas, para jugar la capa. */
export const seguidorDePared = (lado: 'izquierda' | 'derecha'): string[] => {
  const otro = lado === 'izquierda' ? 'derecha' : 'izquierda';
  return [
    'repetir 99 veces', 'repetir 99 veces',
    `si ${lado} libre`, `girar ${lado}`,
    'sino', 'repetir mientras frente bloqueado', `girar ${otro}`, 'fin',
    'fin', 'avanzar', 'fin', 'fin',
  ];
};

const claveDe = (f: number, c: number) => f * ESP_COLS + c;

/** Distancias desde una casilla, sin pisar las prohibidas. */
function distancias(rejilla: Rejilla, desde: [number, number], prohibidas?: Set<number>): Map<number, number> {
  const dist = new Map([[claveDe(...desde), 0]]);
  const cola: [number, number][] = [desde];
  for (let k = 0; k < cola.length; k++) {
    const [f, c] = cola[k];
    const d0 = dist.get(claveDe(f, c))!;
    for (let d = 0; d < 4; d++) {
      const nf = f + DF[d], nc = c + DC[d], nk = claveDe(nf, nc);
      if (rejilla[nf]?.[nc] === undefined || rejilla[nf][nc] === '#' || dist.has(nk) || prohibidas?.has(nk)) continue;
      dist.set(nk, d0 + 1);
      cola.push([nf, nc]);
    }
  }
  return dist;
}

const espesuras = new Map<string, Espesura>();

function espesuraDe(semilla?: string): Espesura {
  const clave = semilla ?? '';
  const hecha = espesuras.get(clave);
  if (hecha) return hecha;

  const r = azarDe(`${semilla ?? 'canon'}:espesura`);
  const mano: Espesura['mano'] = semilla ? (r() < 0.5 ? 'izquierda' : 'derecha') : 'izquierda';
  const otra = mano === 'izquierda' ? 'derecha' : 'izquierda';
  const programa = (lado: Espesura['mano']) => {
    const a = armar(seguidorDePared(lado).map(leerGuardada));
    if ('fallo' in a) throw new Error(a.fallo);
    return a.arbol;
  };
  const bueno = programa(mano), malo = programa(otra);
  const enGrid = (mf: number, mc: number): [number, number] => [mf * 2 + 1, mc * 2 + 1];
  const salida = enGrid((ESP_MF - 1) / 2, (ESP_MC - 1) / 2);
  const esquinas = [enGrid(0, 0), enGrid(0, ESP_MC - 1), enGrid(ESP_MF - 1, 0), enGrid(ESP_MF - 1, ESP_MC - 1)];
  const esEsquina = (k: number) => esquinas.some(([f, c]) => claveDe(f, c) === k);

  for (let intento = 0; intento < 800; intento++) {
    // 1. Un laberinto perfecto: un recorrido en profundidad al azar.
    const rejilla: Rejilla = Array.from({ length: ESP_FILAS }, () => Array<Celda>(ESP_COLS).fill('#'));
    const visto = new Set<string>(['0,0']);
    const pila: [number, number][] = [[0, 0]];
    rejilla[1][1] = '.';
    while (pila.length) {
      const [mf, mc] = pila[pila.length - 1];
      const vecinos = ([0, 1, 2, 3] as Rumbo[])
        .map((d) => [mf + DF[d], mc + DC[d]] as [number, number])
        .filter(([a, b]) => a >= 0 && a < ESP_MF && b >= 0 && b < ESP_MC && !visto.has(`${a},${b}`));
      if (!vecinos.length) { pila.pop(); continue; }
      const sig = vecinos[Math.floor(r() * vecinos.length)];
      visto.add(`${sig[0]},${sig[1]}`);
      const [fa, ca] = enGrid(mf, mc), [fb, cb] = enGrid(...sig);
      rejilla[fb][cb] = '.';
      rejilla[(fa + fb) / 2][(ca + cb) / 2] = '.';
      pila.push(sig);
    }
    // 2. Las vueltas: se caen algunas paredes entre dos casillas.
    for (let f = 1; f < ESP_FILAS - 1; f++) {
      for (let c = 1; c < ESP_COLS - 1; c++) {
        if (rejilla[f][c] === '#' && f % 2 !== c % 2 && r() < ESP_VUELTAS) rejilla[f][c] = '.';
      }
    }
    rejilla[salida[0]][salida[1]] = 'S';
    const brotes: BroteEsp[] = esquinas.map(([f, c]) => {
      const libres = ([0, 1, 2, 3] as Rumbo[]).filter((d) => rejilla[f + DF[d]][c + DC[d]] !== '#');
      return { entrada: [f, c], rumbo: libres[Math.floor(r() * libres.length)] };
    });

    // 3. La pared buena lleva a los cuatro, y pronto.
    const buenos = brotes.map((b) => caminar(bueno, rejilla, b.entrada, b.rumbo));
    if (buenos.some((w) => w.fin !== 'salida' || w.pasos.length > ESP_MAX_ACCIONES)) continue;
    const pisadas = new Set<number>(brotes.map((b) => claveDe(...b.entrada)));
    buenos.forEach((w) => w.pasos.forEach((p) => pisadas.add(claveDe(p.f, p.c))));
    const porLaOtra = new Set<number>();
    brotes.forEach((b) => caminar(malo, rejilla, b.entrada, b.rumbo).pasos
      .forEach((p) => porLaOtra.add(claveDe(p.f, p.c))));

    // 4. Las minas: en el camino más corto de cada brote —en TODOS los más
    //    cortos, si hay empate—, nunca donde pisa la pared buena. Mejor
    //    donde pisaría la otra: así equivocarse de pared se paga.
    const minas = new Set<number>();
    const meta = claveDe(...salida);
    let bien = true;
    for (const b of brotes) {
      const corto = distancias(rejilla, b.entrada).get(meta)!;
      while (bien) {
        const ida = distancias(rejilla, b.entrada, minas);
        const ahora = ida.get(meta);
        if (ahora === undefined) { bien = false; break; }
        if (ahora > corto) break;
        const vuelta = distancias(rejilla, salida, minas);
        // Solo casillas de verdad (no los huecos entre dos): se leen mejor.
        const candidatas = [...ida.keys()].filter((k) =>
          ida.get(k)! + (vuelta.get(k) ?? Infinity) === ahora
          && k !== meta && !esEsquina(k) && !pisadas.has(k)
          && Math.floor(k / ESP_COLS) % 2 === 1 && (k % ESP_COLS) % 2 === 1);
        if (!candidatas.length) { bien = false; break; }
        const trampa = candidatas.filter((k) => porLaOtra.has(k));
        const de = trampa.length ? trampa : candidatas;
        minas.add(de[Math.floor(r() * de.length)]);
      }
      if (!bien) break;
    }
    if (!bien || minas.size < ESP_MIN_MINAS) continue;
    for (const k of minas) rejilla[Math.floor(k / ESP_COLS)][k % ESP_COLS] = '*';

    // 5. Con la otra pared, alguno pisa una mina (o no llega).
    if (brotes.every((b) => caminar(malo, rejilla, b.entrada, b.rumbo).fin === 'salida')) {
      for (const k of minas) rejilla[Math.floor(k / ESP_COLS)][k % ESP_COLS] = '.';
      continue;
    }

    const lista = [...minas].sort((a, b) => a - b).map((k) => [Math.floor(k / ESP_COLS), k % ESP_COLS] as [number, number]);
    const esp: Espesura = { rejilla, salida, brotes, minas: lista, mano };
    espesuras.set(clave, esp);
    return esp;
  }
  // No pasa: con 800 intentos siempre sale una (se prueba en el smoke con
  // decenas de mesas). Pero si pasara, que se note.
  throw new Error('La espesura no ha podido crecer');
}

/** Solo para las pruebas y la guía: la espesura de una mesa. */
export const espesuraDeMarana = (semilla?: string) => espesuraDe(semilla);

// ============================================================
//  EL PROGRAMA
//
//  Una lista de líneas. Cada línea es una instrucción ya normalizada
//  (`girar izquierda`, `repetir 3 veces`…): lo que se escribe raro se
//  guarda bien escrito, y así Datos lee siempre lo mismo.
// ============================================================

type Sensor = { lado: 'frente' | 'izquierda' | 'derecha'; libre: boolean };
type Instr =
  | { k: 'avanzar' }
  | { k: 'girar'; lado: 'izquierda' | 'derecha' }
  | { k: 'repetir'; veces: number }
  | { k: 'mientras'; s: Sensor }
  | { k: 'si'; s: Sensor }
  | { k: 'sino' }
  | { k: 'fin' };

const LADOS: Record<string, Sensor['lado']> = {
  frente: 'frente', adelante: 'frente', enfrente: 'frente',
  izquierda: 'izquierda', izq: 'izquierda', derecha: 'derecha', der: 'derecha',
};

function leerSensor(palabras: string[]): Sensor | null {
  // `frente libre`, `izquierda bloqueada`, `frente esta libre`, `no frente libre`.
  let ws = palabras.filter((w) => w !== 'esta' && w !== 'el' && w !== 'la' && w !== 'hay');
  let niega = false;
  if (ws[0] === 'no') { niega = true; ws = ws.slice(1); }
  if (ws.length !== 2) return null;
  const lado = LADOS[ws[0]];
  if (!lado) return null;
  const libre = ws[1] === 'libre' ? true : /^(bloquead[oa]|cerrad[oa]|pared|ocupad[oa])$/.test(ws[1]) ? false : null;
  if (libre === null) return null;
  return { lado, libre: niega ? !libre : libre };
}

const pintarSensor = (s: Sensor) => `${s.lado} ${s.libre ? 'libre' : s.lado === 'frente' ? 'bloqueado' : 'bloqueada'}`;

export function pintarInstr(i: Instr): string {
  switch (i.k) {
    case 'avanzar': return 'avanzar';
    case 'girar': return `girar ${i.lado}`;
    case 'repetir': return `repetir ${i.veces} ${i.veces === 1 ? 'vez' : 'veces'}`;
    case 'mientras': return `repetir mientras ${pintarSensor(i.s)}`;
    case 'si': return `si ${pintarSensor(i.s)}`;
    case 'sino': return 'sino';
    case 'fin': return 'fin';
  }
}

type Lectura = { instr: Instr } | { fallo: string };

/** Lee UNA instrucción. Los mensajes enseñan a escribirla. */
function leerInstr(textoBruto: string, tipo: Tipo): Lectura {
  const ws = normalizar(textoBruto).split(' ').filter(Boolean);
  const [p, ...resto] = ws;
  const decide = tipo === 'espesura';
  const soloEspesura = (que: string): Lectura => ({
    fallo: `Aquí el brote todavía no sabe ${que}: solo avanzar, girar${tipo === 'semillero' ? '' : ' y repetir N veces'}.`,
  });

  if (['avanzar', 'avanza', 'adelante', 'mover', 'caminar', 'camina'].includes(p) && resto.length === 0) {
    return { instr: { k: 'avanzar' } };
  }
  if (p === 'girar' || p === 'gira' || p === 'voltear' || p === 'voltea') {
    const lado = LADOS[resto.join(' ')];
    if (resto.length !== 1 || !lado || lado === 'frente') {
      return { fallo: 'Se gira a un lado: `girar izquierda` o `girar derecha`.' };
    }
    return { instr: { k: 'girar', lado } };
  }
  if (p === 'repetir' || p === 'repite') {
    if (resto[0] === 'mientras') {
      if (!decide) return soloEspesura('repetir mientras algo sea cierto');
      const s = leerSensor(resto.slice(1));
      if (!s) return { fallo: 'Tras `repetir mientras` va un sensor: `frente libre`, `izquierda bloqueada`…' };
      return { instr: { k: 'mientras', s } };
    }
    const n = Number(resto[0]);
    const cola = resto.slice(1).join(' ');
    if (!Number.isInteger(n) || !['', 'veces', 'vez'].includes(cola)) {
      return { fallo: 'Un ciclo se escribe `repetir 4 veces` —con un número entero— y se cierra con `fin`.' };
    }
    if (n < 1 || n > MAX_VECES) return { fallo: `Un ciclo da entre 1 y ${MAX_VECES} vueltas.` };
    return { instr: { k: 'repetir', veces: n } };
  }
  if (p === 'mientras') {
    if (!decide) return soloEspesura('repetir mientras algo sea cierto');
    const s = leerSensor(resto);
    if (!s) return { fallo: 'Tras `mientras` va un sensor: `frente libre`, `izquierda bloqueada`…' };
    return { instr: { k: 'mientras', s } };
  }
  if ((p === 'sino' && resto.length === 0) || (p === 'si' && resto.length === 1 && resto[0] === 'no')
    || (p === 'si' && resto[0] === 'no' && resto[1] === 'entonces')) {
    if (!decide) return soloEspesura('decidir con `si`');
    return { instr: { k: 'sino' } };
  }
  if (p === 'si') {
    if (!decide) return soloEspesura('decidir con `si`');
    const s = leerSensor(resto.filter((w) => w !== 'entonces'));
    if (!s) return { fallo: 'Tras `si` va un sensor: `frente libre`, `derecha bloqueada`…' };
    return { instr: { k: 'si', s } };
  }
  if (p === 'fin' || p === 'end' || p === 'terminar') return { instr: { k: 'fin' } };
  return { fallo: `«${textoBruto.trim()}» no es una instrucción del brote. \`ayuda\` las tiene todas.` };
}

const leerGuardada = (linea: string): Instr => {
  const l = leerInstr(linea, 'espesura');
  return 'instr' in l ? l.instr : { k: 'fin' };
};

/** Sangría de cada línea, aunque el programa esté a medias. */
function sangrias(lineas: Instr[]): number[] {
  let nivel = 0;
  return lineas.map((i) => {
    if (i.k === 'fin') { nivel = Math.max(0, nivel - 1); return nivel; }
    if (i.k === 'sino') return Math.max(0, nivel - 1);
    const n = nivel;
    if (i.k === 'repetir' || i.k === 'mientras' || i.k === 'si') nivel++;
    return n;
  });
}
function abiertos(lineas: Instr[]): number {
  let nivel = 0;
  for (const i of lineas) {
    if (i.k === 'repetir' || i.k === 'mientras' || i.k === 'si') nivel++;
    else if (i.k === 'fin') nivel = Math.max(0, nivel - 1);
  }
  return nivel;
}

// ---------- El árbol ----------

type Nodo =
  | { k: 'avanzar'; l: number }
  | { k: 'girar'; l: number; lado: 'izquierda' | 'derecha' }
  | { k: 'repetir'; l: number; veces: number; cuerpo: Nodo[] }
  | { k: 'mientras'; l: number; s: Sensor; cuerpo: Nodo[] }
  | { k: 'si'; l: number; s: Sensor; si: Nodo[]; sino: Nodo[] | null };

/** Arma el árbol o dice, con el número de línea, qué está mal cerrado. */
function armar(lineas: Instr[]): { arbol: Nodo[] } | { fallo: string } {
  type Marco = { nodo: Extract<Nodo, { cuerpo: Nodo[] }> | Extract<Nodo, { k: 'si' }> | null; destino: Nodo[] };
  const raiz: Nodo[] = [];
  const pila: Marco[] = [{ nodo: null, destino: raiz }];
  for (let l = 0; l < lineas.length; l++) {
    const i = lineas[l];
    const marco = pila[pila.length - 1];
    switch (i.k) {
      case 'avanzar': marco.destino.push({ k: 'avanzar', l }); break;
      case 'girar': marco.destino.push({ k: 'girar', l, lado: i.lado }); break;
      case 'repetir': {
        const n: Nodo = { k: 'repetir', l, veces: i.veces, cuerpo: [] };
        marco.destino.push(n); pila.push({ nodo: n, destino: n.cuerpo }); break;
      }
      case 'mientras': {
        const n: Nodo = { k: 'mientras', l, s: i.s, cuerpo: [] };
        marco.destino.push(n); pila.push({ nodo: n, destino: n.cuerpo }); break;
      }
      case 'si': {
        const n: Nodo = { k: 'si', l, s: i.s, si: [], sino: null };
        marco.destino.push(n); pila.push({ nodo: n, destino: n.si }); break;
      }
      case 'sino': {
        const n = marco.nodo;
        if (!n || n.k !== 'si') return { fallo: `La línea ${l + 1} dice \`sino\`, pero no hay ningún \`si\` abierto que lo tenga.` };
        if (n.sino) return { fallo: `La línea ${l + 1} es un segundo \`sino\` para el mismo \`si\`.` };
        n.sino = []; marco.destino = n.sino; break;
      }
      case 'fin':
        if (pila.length === 1) return { fallo: `La línea ${l + 1} cierra un bloque que nadie abrió: sobra ese \`fin\`.` };
        pila.pop(); break;
    }
  }
  if (pila.length > 1) {
    const faltan = pila.length - 1;
    return { fallo: `Al programa le ${faltan === 1 ? 'falta un `fin`' : `faltan ${faltan} \`fin\``}: cada \`repetir\` y cada \`si\` se cierra con el suyo.` };
  }
  return { arbol: raiz };
}

// ---------- La caminata ----------

type Accion = 'av' | 'gi' | 'gd' | 'ch';
/** Un paso de la caminata: la acción, la línea que la dio y, para Datos,
 *  la vuelta en la que iba cada ciclo abierto. La posición es DESPUÉS del
 *  paso (en un choque, donde se quedó). */
type Paso = { a: Accion; l: number; f: number; c: number; d: Rumbo; v: [number, number][] };
type Fin = 'salida' | 'choque' | 'espina' | 'mina' | 'quieto' | 'agotado';
type Caminata = {
  pasos: Paso[];
  fin: Fin;
  /** Contra qué se estrelló, si chocó. */
  contra: [number, number] | null;
  avances: number;
  giros: number;
};

function caminar(arbol: Nodo[], rejilla: Rejilla, entrada: [number, number], rumbo: Rumbo): Caminata {
  let f = entrada[0], c = entrada[1], d = rumbo;
  const pasos: Paso[] = [];
  const vueltas: [number, number][] = [];
  let evals = 0, avances = 0, giros = 0;
  let fin: Fin | null = null;
  let contra: [number, number] | null = null;

  const celda = (ff: number, cc: number): Celda =>
    ff < 0 || ff >= rejilla.length || cc < 0 || cc >= rejilla[0].length ? '#' : rejilla[ff][cc];
  const libre = (s: Sensor) => {
    const dd = s.lado === 'frente' ? d : s.lado === 'izquierda' ? izquierdaDe(d) : derechaDe(d);
    // Las espinas no se notan desde fuera: para el sensor, es camino.
    const hay = celda(f + DF[dd], c + DC[dd]) !== '#';
    return hay === s.libre;
  };
  const anotar = (a: Accion, l: number) => pasos.push({ a, l, f, c, d, v: vueltas.map((x) => [x[0], x[1]]) });

  const correr = (nodos: Nodo[]): void => {
    for (const n of nodos) {
      if (fin) return;
      if (++evals > MAX_EVALUACIONES || pasos.length >= MAX_ACCIONES) { fin = 'agotado'; return; }
      switch (n.k) {
        case 'avanzar': {
          const nf = f + DF[d], nc = c + DC[d];
          const ch = celda(nf, nc);
          if (ch === '#') { contra = [nf, nc]; anotar('ch', n.l); fin = 'choque'; return; }
          f = nf; c = nc; avances++;
          anotar('av', n.l);
          if (ch === '*') { fin = 'espina'; return; }
          if (ch === 'S') { fin = 'salida'; return; }
          break;
        }
        case 'girar':
          d = n.lado === 'izquierda' ? izquierdaDe(d) : derechaDe(d); giros++;
          anotar(n.lado === 'izquierda' ? 'gi' : 'gd', n.l);
          break;
        case 'repetir':
          for (let k = 1; k <= n.veces && !fin; k++) {
            vueltas.push([n.l, k]); correr(n.cuerpo); vueltas.pop();
          }
          break;
        case 'mientras': {
          let k = 0;
          while (!fin && libre(n.s)) {
            if (++evals > MAX_EVALUACIONES) { fin = 'agotado'; return; }
            vueltas.push([n.l, ++k]); correr(n.cuerpo); vueltas.pop();
          }
          break;
        }
        case 'si':
          correr(libre(n.s) ? n.si : n.sino ?? []);
          break;
      }
    }
  };
  correr(arbol);
  return { pasos, fin: fin ?? 'quieto', contra, avances, giros };
}

const ritmoDe = (tipo: Tipo): Ritmo => (tipo === 'espesura' ? RITMO_ESPESURA : RITMO);

/** Cuánto dura un lanzamiento en pantalla: lo que anda el brote que más
 *  anda (en la espesura van a compás) y, si alguno se pincha, la espina. */
function duracionDe(brotes: { pasos: Paso[]; fin: Fin }[], ritmo: Ritmo): number {
  let t = 0;
  for (const b of brotes) {
    let u = 0;
    for (const p of b.pasos) u += p.a === 'av' ? ritmo.paso : p.a === 'ch' ? ritmo.choque : ritmo.giro;
    t = Math.max(t, u);
  }
  const pincha = brotes.some((b) => b.fin === 'espina' || b.fin === 'mina');
  return ritmo.inicio + t + ritmo.fin + (pincha ? RITMO.choque : 0);
}

// ============================================================
//  EL ESTADO
// ============================================================

/** Una fila de la bitácora de Datos: un brote de un lanzamiento. */
type Viaje = {
  n: number; capa: Capa; tipo: Tipo; lineas: number;
  /** Qué brote de la espesura, del 1 al 4. En las otras capas sale uno: el 1. */
  b: number;
  avances: number; giros: number;
  fin: Fin; casilla: string;
  /** La espina (seto) o la mina (espesura) que lo mató, por su número. */
  espina: number | null;
};
/** Un brote del último lanzamiento, entero, para andarlo en las pantallas. */
type BroteUltimo = {
  entrada: [number, number]; rumbo: Rumbo;
  pasos: Paso[]; fin: Fin; contra: [number, number] | null;
  /** La espina o la mina que pisó, por su número en la tabla de Datos. */
  pincho?: number | null;
};
type Ultimo = {
  n: number; capa: Capa; tipo: Tipo;
  brotes: BroteUltimo[];
  duracion: number;
  /** El programa con el que salieron: si Terminal lo edita mientras los
   *  brotes andan, Datos tiene que seguir viendo las líneas de ESTE. */
  programa: string[];
  /** Espesura: cuántas casillas había alumbradas antes de este lanzamiento.
   *  Pantalla lo ve andar sobre lo que se conocía entonces. */
  luzPrevia?: number;
};

const capaDe = (e: Record<string, unknown>, cfg: Config): Capa =>
  Math.min(Math.max(1, typeof e.capa === 'number' ? e.capa : 1), cfg.tipos.length);
const tipoDe = (e: Record<string, unknown>, cfg: Config): Tipo => cfg.tipos[capaDe(e, cfg) - 1];
const programaDe = (e: Record<string, unknown>): string[] =>
  (Array.isArray(e.programa) ? (e.programa as string[]) : []);
const viajesDe = (e: Record<string, unknown>): Viaje[] =>
  (Array.isArray(e.viajes) ? (e.viajes as Viaje[]).filter((v) => v.tipo) : []);
/** Las casillas de la espesura que ya se alumbraron, en el orden en que se
 *  encendieron (`f * columnas + c`). */
const luzDe = (e: Record<string, unknown>): number[] => (Array.isArray(e.luz) ? (e.luz as number[]) : []);

/** El último lanzamiento. Uno guardado antes de que las capas tuvieran
 *  tipo ya no se puede rehacer: se olvida. */
function ultimoDe(e: Record<string, unknown>): Ultimo | null {
  const u = e.ultimo as Partial<Ultimo> | undefined;
  return u && Array.isArray(u.brotes) && u.tipo ? (u as Ultimo) : null;
}

const varios = (tipo: Tipo) => tipo === 'espesura';
const brotesDe = (tipo: Tipo) => (varios(tipo) ? 4 : 1);

const TERMINO: Record<Fin, string> = {
  salida: 'llego a la salida',
  choque: 'choco contra una pared',
  espina: 'piso una espina',
  mina: 'piso una mina',
  quieto: 'se quedo quieto',
  agotado: 'se agoto',
};

/** Lo que se le dice a Pantalla de cada capa cuando llega a ella. */
const LEMA: Record<Tipo, string> = {
  semillero: 'avanzar, girar y lanzar · así se mueve el brote',
  seto: 'el camino ya no cabe escrito a mano · busquen lo que se repite',
  espesura: 'a oscuras · salen cuatro brotes con el mismo programa',
};

// ============================================================
//  Lo que ve cada puesto
// ============================================================

const laminaDe = (estado: Record<string, unknown>, cfg: Config) => ({
  capa: capaDe(estado, cfg),
  capas: cfg.tipos.length,
  nombres: cfg.tipos.map((t) => NOMBRE_TIPO[t]),
  resuelta: estado.resuelta === true,
  cedeEnMs: cedeEnMs(estado, cfg),
});

/** Cuánto falta para que Pantalla termine de enseñar cómo cedió la capa
 *  anterior: el brote tarda en llegar, y luego viene la transición. La
 *  capa nueva ya está puesta desde que se lanzó; su animación espera a
 *  esto para no tapar al brote. Relativo, porque el reloj del servidor y
 *  el de cada navegador no tienen por qué coincidir. */
function cedeEnMs(estado: Record<string, unknown>, cfg: Config): number {
  const u = ultimoDe(estado);
  if (!u || u.capa >= capaDe(estado, cfg)) return 0;
  const listoEn = (estado.listoEn as number | undefined) ?? 0;
  return Math.max(0, listoEn - GERMINA_MS - Date.now());
}

/** El programa como lo ve Datos. Solo Datos: ni Terminal ni Pantalla lo ven. */
function programaVisto(estado: Record<string, unknown>, tipo: Tipo) {
  const lineas = programaDe(estado);
  const instr = lineas.map(leerGuardada);
  const arbol = armar(instr);
  return {
    lineas,
    sangria: sangrias(instr),
    max: MAX_LINEAS[tipo],
    usadas: lineas.length,
    abiertos: abiertos(instr),
    aviso: 'fallo' in arbol && lineas.length ? arbol.fallo : null,
  };
}

/** Una casilla de la espesura para Pantalla. Las minas viajan como
 *  camino: dónde están lo dice Datos. */
const casillaVista = (esp: Espesura, k: number): [number, number, string] => {
  const f = Math.floor(k / ESP_COLS), c = k % ESP_COLS;
  const ch = esp.rejilla[f][c];
  return [f, c, ch === '*' ? '.' : ch];
};

/** La luz de un lanzamiento en la espesura: cada brote alumbra lo que
 *  tiene alrededor. Se manda lo NUEVO de cada golpe de reloj —lo de los
 *  cuatro junto—; lo de atrás se queda encendido en el cliente. */
function luzDelLanzamiento(esp: Espesura, brotes: BroteUltimo[], conocidas: Iterable<number>) {
  const visto = new Set<number>(conocidas);
  const nuevas: number[] = [];
  const alumbrar = (f: number, c: number, sale: [number, number, string][]) => {
    for (let df = -1; df <= 1; df++) {
      for (let dc = -1; dc <= 1; dc++) {
        const ff = f + df, cc = c + dc;
        if (ff < 0 || ff >= ESP_FILAS || cc < 0 || cc >= ESP_COLS) continue;
        const k = claveDe(ff, cc);
        if (visto.has(k)) continue;
        visto.add(k); nuevas.push(k);
        sale.push(casillaVista(esp, k));
      }
    }
  };
  const luz0: [number, number, string][] = [];
  brotes.forEach((b) => alumbrar(b.entrada[0], b.entrada[1], luz0));
  const largo = Math.max(0, ...brotes.map((b) => b.pasos.length));
  const luz: [number, number, string][][] = [];
  for (let k = 0; k < largo; k++) {
    const sale: [number, number, string][] = [];
    for (const b of brotes) {
      const p = b.pasos[k];
      if (!p) continue;
      // Un choque no se marca: Pantalla solo sabe que el brote se desconectó.
      alumbrar(p.f, p.c, sale);
    }
    luz.push(sale);
  }
  return { luz0, luz, nuevas };
}

/** El semillero o el seto tal como los ve Pantalla. Las espinas NO viajan:
 *  en el plano son camino, también las que ya mataron a un brote. Pantalla
 *  ve la espina brotar cuando la pisan, y nada más: dónde están lo dice Datos. */
function mundoPlano(tipo: 'semillero' | 'seto', capa: Capa, semilla?: string) {
  const s = setoDe(semilla, tipo);
  return {
    capa, tipo, nombre: NOMBRE_TIPO[tipo].toLowerCase(), lema: LEMA[tipo],
    filas: s.rejilla.length, cols: s.rejilla[0].length,
    celdas: s.rejilla.map((fila) => fila.map((ch) => (ch === '*' ? '.' : ch)).join('')),
    salida: s.salida,
    brotes: [{ entrada: s.entrada, rumbo: s.rumbo }],
  };
}
/** La espesura: el tamaño, los cuatro semilleros, la claridad del claro y
 *  lo que ya se alumbró. Nada más. */
const mundoEspesura = (esp: Espesura, capa: Capa, conocidas: number[]) => ({
  capa, tipo: 'espesura' as Tipo, nombre: NOMBRE_TIPO.espesura.toLowerCase(), lema: LEMA.espesura,
  filas: ESP_FILAS, cols: ESP_COLS,
  celdas: null,
  salida: esp.salida,
  brotes: esp.brotes.map((b) => ({ entrada: b.entrada, rumbo: b.rumbo })),
  conocidas: conocidas.map((k) => casillaVista(esp, k)),
});

const mundoDe = (tipo: Tipo, capa: Capa, estado: Record<string, unknown>, semilla?: string) =>
  (tipo === 'espesura' ? mundoEspesura(espesuraDe(semilla), capa, luzDe(estado)) : mundoPlano(tipo, capa, semilla));

/** El lanzamiento para Pantalla: dónde va cada brote, sin las líneas. En
 *  la espesura, además, lo que alumbran. */
function viajeParaPantalla(u: Ultimo, estado: Record<string, unknown>, semilla?: string) {
  const base = {
    n: u.n, capa: u.capa, ritmo: ritmoDe(u.tipo),
    // Pantalla no sabe qué le pasó a un brote que no llega: solo que se
    // desconectó. Ni contra qué chocó, ni si pisó algo: eso queda en la
    // bitácora de Datos. El choque es un paso más, el de la desconexión.
    brotes: u.brotes.map((b) => ({
      entrada: b.entrada, rumbo: b.rumbo,
      fin: b.fin === 'salida' ? 'salida' as const : 'desconectado' as const,
      pasos: b.pasos.map((p) => [p.a === 'ch' ? 'x' : p.a, p.f, p.c, p.d] as const),
    })),
  };
  // El mundo del lanzamiento va con él: el brote que cruza una capa se
  // sigue viendo llegar aunque la fase ya esté en la siguiente.
  if (u.tipo !== 'espesura') return { ...base, mundo: mundoPlano(u.tipo, u.capa, semilla) };
  const esp = espesuraDe(semilla);
  const previa = luzDe(estado).slice(0, u.luzPrevia ?? 0);
  const { luz0, luz } = luzDelLanzamiento(esp, u.brotes, previa);
  return { ...base, mundo: mundoEspesura(esp, u.capa, previa), luz0, luz };
}

function vistaPantalla(estado: Record<string, unknown>, cfg: Config, semilla?: string) {
  const capa = capaDe(estado, cfg);
  const u = ultimoDe(estado);
  return {
    capa,
    titulo: cfg.titulo,
    final: cfg.final,
    resuelta: estado.resuelta === true,
    mundo: mundoDe(tipoDe(estado, cfg), capa, estado, semilla),
    viaje: u ? viajeParaPantalla(u, estado, semilla) : null,
  };
}

/** El lanzamiento para Datos: qué línea iba cada brote y en qué vuelta,
 *  sin posiciones. */
function viajeParaDatos(u: Ultimo) {
  const programa = u.programa ?? [];
  return {
    n: u.n, capa: u.capa, ritmo: ritmoDe(u.tipo),
    brotes: u.brotes.map((b) => ({ fin: b.fin, pasos: b.pasos.map((p) => ({ a: p.a, l: p.l, v: p.v })) })),
    lineas: programa,
    sangria: sangrias(programa.map(leerGuardada)),
  };
}

/** El manual de Datos. El número es desde qué nivel lo sabe el brote. Sin
 *  acentos, como el resto de las tablas del juego. */
const MANUAL: [string, string, number][] = [
  ['avanzar', 'Una casilla hacia donde apunta la flecha. Si hay pared, se estrella.', 0],
  ['girar izquierda', 'Un cuarto de vuelta hacia SU izquierda, sin moverse de la casilla.', 0],
  ['girar derecha', 'Un cuarto de vuelta hacia SU derecha, sin moverse de la casilla.', 0],
  ['(izquierda y derecha)', 'Son las del brote, no las de la pantalla. Si la flecha apunta hacia abajo, su derecha es la izquierda de la pantalla.', 0],
  ['repetir N veces', 'Repite N veces lo que hay hasta su `fin`. Cuenta como UNA linea.', 1],
  ['fin', 'Cierra el ciclo (o el si) que tenga abierto.', 1],
  ['repetir mientras <sensor>', 'Repite mientras el sensor diga que si. No sabe cuantas vueltas dara.', 2],
  ['si <sensor>', 'Hace lo de dentro solo si el sensor dice que si.', 2],
  ['sino', 'Lo que hace si el sensor dijo que no. Va entre el si y su fin.', 2],
  ['frente libre', 'Sensor: no hay pared delante. Tambien: izquierda/derecha, libre/bloqueada.', 2],
  ['(llegar a la salida)', 'El brote se detiene ahi. Las lineas que le queden ya no se ejecutan.', 0],
];

const CRECIMIENTO: string[] = [
  'La espesura no cambia: es la misma en cada lanzamiento. Lo que alumbran los brotes se le queda encendido a Pantalla.',
  'Salen cuatro brotes a la vez, uno en cada esquina, mirando hacia donde hay camino. Los cuatro llevan el MISMO programa.',
  'Los cuatro buscan el mismo claro: el del centro de la espesura.',
  'La espesura tiene vueltas: hay mas de un camino al claro.',
  'El camino mas corto de cada brote pasa por una mina. Ni el plano ni los sensores la notan: estan en la tabla `minas`.',
  'Un brote que nunca suelta la pared de un mismo lado acaba en el claro. Por una de las dos paredes, los cuatro llegan sin pisar una mina.',
  'La espesura se cruza cuando los cuatro llegan en el mismo lanzamiento.',
  `Un brote aguanta ${MAX_ACCIONES} pasos y giros. Despues se agota.`,
];

const GIRO_TXT: Record<string, string> = { gi: 'giro a la izquierda', gd: 'giro a la derecha' };

/** La bitácora de un brote en su último lanzamiento: un renglón por cada
 *  cosa que hizo, con la línea del programa que se la mandó, en qué vuelta
 *  iba cada ciclo y qué le pasó. Ahí —y no en Pantalla— se ve por qué un
 *  brote se desconectó. */
function bitacora(u: Ultimo, b: BroteUltimo): string[][] {
  const pincho = u.tipo === 'espesura' ? 'mina' : 'espina';
  const meta = u.tipo === 'espesura' ? 'al claro' : 'a la salida';
  // «linea 3: vuelta 15»: la vuelta en la que iba el ciclo de la línea 3.
  const vuelta = (p: Paso) => p.v.map(([l, k]) => `linea ${l + 1}: vuelta ${k}`).join(' · ');
  const filas = b.pasos.map((p, k) => {
    let que = p.a === 'av' ? 'avanzo' : p.a === 'ch' ? 'choco contra una pared · se desconecto' : GIRO_TXT[p.a];
    const ultimo = k === b.pasos.length - 1;
    if (ultimo && p.a === 'av' && b.fin === 'salida') que = `avanzo y llego ${meta}`;
    if (ultimo && (b.fin === 'espina' || b.fin === 'mina')) {
      que = `avanzo y piso la ${pincho} X${b.pincho ?? '?'} (${casillaDe([p.f, p.c])}) · se desconecto`;
    }
    if (p.a === 'ch' && b.contra) que = `choco contra una pared · se desconecto en ${casillaDe([p.f, p.c])}`;
    return [`P${k + 1}`, String(u.n), String(k + 1), String(p.l + 1), u.programa[p.l] ?? '', vuelta(p), que];
  });
  if (b.fin === 'quieto' || b.fin === 'agotado') {
    const ult = b.pasos[b.pasos.length - 1];
    const donde = casillaDe(ult ? [ult.f, ult.c] : b.entrada);
    const k = b.pasos.length + 1;
    filas.push([`P${k}`, String(u.n), String(k), '', b.fin === 'quieto' ? '(fin del programa)' : `(${MAX_ACCIONES} pasos y giros)`, '',
      `${b.fin === 'quieto' ? 'se quedo quieto: se le acabo el programa' : 'se agoto sin llegar'} en ${donde} · se desconecto`]);
  }
  return filas;
}

function esquemaDatos(estado: Record<string, unknown>, cfg: Config, semilla?: string) {
  const capa = capaDe(estado, cfg);
  const tipo = tipoDe(estado, cfg);
  const nivel = NIVEL[tipo];
  const viajes = [...viajesDe(estado)].reverse();
  const ultimoN = viajes[0]?.n;
  const u = ultimoDe(estado);
  const manual = MANUAL.filter(([, , nv]) => nv <= nivel)
    .map(([instr, que], i) => [`M${i + 1}`, instr, que]);
  const muchos = varios(tipo);
  const idDe = (v: Viaje) => (muchos ? `V${v.n}-${v.b}` : `V${v.n}`);
  // En la espesura hay mucho más que leer: el lienzo crece hacia abajo.
  const L = tipo === 'semillero'
    ? { manual: [40, 30, 920], viajes: [40, 330, 440] }
    : tipo === 'seto'
      ? { manual: [40, 30, 600], pinchos: [680, 30, 280], viajes: [40, 330, 440] }
      : { manual: [40, 30, 300], crecimiento: [370, 30, 400], pinchos: [800, 30, 160], viajes: [40, 330, 920] };
  const pos = ([x, y, w]: number[]) => ({ x, y, w });
  const tablas: unknown[] = [
    {
      id: 'manual', nombre: 'manual',
      ...pos(L.manual),
      descripcion: 'Lo que el brote sabe hacer',
      clave: 'id',
      columnas: ['id', 'instruccion', 'que_hace'],
      filas: manual,
      // Lo que el brote acaba de aprender en esta capa, resaltado.
      nuevas: nivel > 0 ? manual.filter((m) => MANUAL.find(([i]) => i === m[1])?.[2] === nivel).map((m) => m[0]) : [],
    },
  ];
  if (tipo === 'seto') {
    tablas.push({
      id: 'espinas', nombre: 'espinas',
      ...pos(L.pinchos!),
      descripcion: 'Espinas escondidas en el seto',
      clave: 'id',
      columnas: ['id', 'casilla'],
      filas: setoDe(semilla).espinas.map((e, i) => [`X${i + 1}`, casillaDe(e)]),
      nuevas: viajes.every((v) => v.capa !== capa) ? setoDe(semilla).espinas.map((_, i) => `X${i + 1}`) : [],
    });
  } else if (tipo === 'espesura') {
    tablas.push({
      id: 'crecimiento', nombre: 'crecimiento',
      ...pos(L.crecimiento!),
      descripcion: 'Como crecio la espesura',
      clave: 'id',
      columnas: ['id', 'regla'],
      filas: CRECIMIENTO.map((r, i) => [`C${i + 1}`, r]),
      nuevas: CRECIMIENTO.map((_, i) => `C${i + 1}`),
    }, {
      id: 'minas', nombre: 'minas',
      ...pos(L.pinchos!),
      descripcion: 'Minas escondidas',
      clave: 'id',
      columnas: ['id', 'casilla'],
      filas: espesuraDe(semilla).minas.map((m, i) => [`X${i + 1}`, casillaDe(m)]),
      nuevas: viajes.length === 0 ? espesuraDe(semilla).minas.map((_, i) => `X${i + 1}`) : [],
    });
  }
  const conPincho = tipo !== 'semillero';
  tablas.push({
    id: 'viajes', nombre: 'viajes',
    ...pos(L.viajes),
    descripcion: muchos ? 'Cada brote que se lanzo (V3-2: lanzamiento 3, brote 2)' : 'Cada brote que se lanzo',
    clave: 'id',
    columnas: [
      'id', 'capa', ...(muchos ? ['brote'] : []), 'lineas', 'pasos', 'giros', 'termino', 'casilla',
      ...(conPincho ? [tipo === 'espesura' ? 'mina_id' : 'espina_id'] : []),
    ],
    filas: viajes.map((v) => [
      idDe(v), String(v.capa), ...(muchos ? [String(v.b)] : []),
      String(v.lineas), String(v.avances), String(v.giros), TERMINO[v.fin], v.casilla,
      ...(conPincho ? [v.tipo === tipo && v.espina ? `X${v.espina}` : ''] : []),
    ]),
    nuevas: viajes.filter((v) => v.n === ultimoN).map(idDe),
  });
  // Una tabla por brote con su bitácora del último lanzamiento de ESTA capa.
  const columnasBitacora = ['id', 'lanzamiento', 'paso', 'linea', 'instruccion', 'vuelta', 'resultado'];
  const delaCapa = u && u.capa === capa ? u : null;
  for (let b = 0; b < brotesDe(tipo); b++) {
    const filas = delaCapa?.brotes[b] ? bitacora(delaCapa, delaCapa.brotes[b]) : [];
    tablas.push({
      id: muchos ? `brote_${b + 1}` : 'brote',
      nombre: muchos ? `brote_${b + 1}` : 'brote',
      ...(muchos ? { x: 40 + b * 240, y: 560, w: 220 } : { x: 520, y: 330, w: 440 }),
      descripcion: muchos
        ? `Bitacora del brote ${b + 1} en el ultimo lanzamiento`
        : 'Bitacora del brote: lo que hizo en el ultimo lanzamiento, paso a paso',
      clave: 'id',
      columnas: columnasBitacora,
      filas,
      nuevas: filas.length ? [filas[filas.length - 1][0]] : [],
    });
  }
  return {
    lienzo: { w: 1000, h: muchos ? 860 : 640 },
    tablas,
    relaciones: tipo === 'seto'
      ? [{ desde: 'viajes', campo: 'espina_id', hasta: 'espinas' }]
      : tipo === 'espesura' ? [{ desde: 'viajes', campo: 'mina_id', hasta: 'minas' }] : [],
  };
}

function ayuda(tipo: Tipo, capa: Capa, cfg: Config): ResultadoComando {
  const nivel = NIVEL[tipo];
  return {
    bloques: [
      texto(
        [
          'avanzar  ·  girar izquierda  ·  girar derecha',
          ...(nivel >= 1 ? [
            'repetir 4 veces          — repite lo que hay hasta su `fin`',
            'fin                      — cierra el ciclo',
          ] : []),
          ...(nivel >= 2 ? [
            'repetir mientras <sensor> — repite mientras el sensor diga que sí',
            'si <sensor>  ·  sino     — decide, y se cierra con `fin`',
            'sensores:  frente libre · izquierda libre · derecha bloqueada · …',
          ] : []),
          '',
          'Izquierda y derecha son las DEL BROTE: hacia donde apunta la flecha.',
          'Si baja por la pantalla, su derecha es la izquierda de quien la mira.',
        ],
        'Lo que entiende el brote',
      ),
      texto(
        [
          'avanzar                  — escríbela tal cual: se agrega al final del programa',
          'insertar <n> <instr.>    — la mete delante de la línea n',
          'cambiar <n> <instr.>     — reescribe la línea n',
          'borrar <n>               — quita la línea n   ·   borrar todo',
          `lanzar                   — manda ${varios(tipo) ? 'los cuatro brotes' : 'el brote'} con el programa`,
          'estado                   — capa, líneas y lanzamientos',
        ],
        'Cómo se escribe el programa',
      ),
      nivel === 0
        ? texto(
          [
            '  avanzar',
            '  avanzar',
            '  girar derecha',
            '  avanzar',
            '',
            'Ese es de ejemplo: dos pasos, un giro y otro paso. El camino de verdad lo ve Pantalla.',
            'Cada línea es UNA instrucción, y el brote las cumple en orden, de arriba abajo, al pie',
            'de la letra: no adivina lo que quisieron decir. Eso es un programa.',
          ],
          'Un programa',
        )
        : texto(
          [
            '  repetir 2 veces',
            '      avanzar',
            '      girar derecha',
            '  fin',
            '',
            'Ese es de ejemplo: avanza y gira, dos veces. El camino de verdad lo ve Pantalla.',
            `El brote carga como mucho ${MAX_LINEAS[tipo]} líneas en esta capa. Un \`repetir\` y su \`fin\``,
            'cuentan como dos, pero lo de dentro se repite gratis.',
          ],
          'Un ciclo',
        ),
      texto(
        [
          ...(tipo === 'semillero' ? [
            'El brote nace en la entrada. Si choca con una pared, se desconecta y el siguiente',
            'vuelve a empezar desde la entrada. Qué le pasó queda en su bitácora, la tabla',
            '`brote` de Datos. Pantalla ve el semillero entero: que les dicte el camino.',
          ] : tipo === 'seto' ? [
            'El brote nace en la entrada. Si choca con una pared o pisa una espina, se',
            'desconecta: el siguiente vuelve a empezar desde la entrada. Qué le pasó queda',
            'en su bitácora, la tabla `brote` de Datos.',
            'En EL SETO Pantalla ve el laberinto entero, pero no las espinas: esas las tiene Datos.',
          ] : [
            'En LA ESPESURA salen CUATRO brotes a la vez, uno en cada esquina, con el MISMO',
            'programa, y todos buscan el claro del centro. Como salen de sitios distintos, no',
            'hay camino que dictar: el programa tiene que decidir solo, con sensores.',
            'Hay minas que ni el plano ni los sensores notan: las tiene Datos. Si un brote se',
            'desconecta, qué le pasó queda en su bitácora (`brote_1` … `brote_4`). La espesura',
            'se cruza cuando los cuatro llegan en el mismo lanzamiento.',
          ]),
          ...(cfg.tipos.length > 1
            ? [`Esta fase tiene ${cfg.tipos.length} capas. Ahora están en la ${capa}: ${NOMBRE_TIPO[tipo]}.`]
            : []),
        ],
        'El brote',
      ),
    ],
  };
}

// ============================================================
//  LO QUE SE LE DICE A CADA PUESTO
// ============================================================

const NOTA_DATOS: Record<Tipo, string> = {
  semillero: 'EL SEMILLERO, para calentar. Arriba, el programa que va escribiendo Terminal, renglón por '
    + 'renglón: cuando el brote sale, se enciende la línea que está cumpliendo. Abajo, el `manual` —lo '
    + 'que el brote sabe hacer: ayuden a Terminal a escribirlo bien— y la bitácora `brote`: si no llega, '
    + 'ahí dice qué le pasó, paso a paso.',
  seto: 'Arriba, el programa que va escribiendo Terminal: cuando un brote sale, verán qué línea está '
    + 'haciendo y en qué vuelta va cada ciclo. Abajo, el manual, las ESPINAS del seto —en el plano de '
    + 'Pantalla se ven como camino: díganle dónde están— y la bitácora `brote`: si se desconecta, ahí '
    + 'dice qué le pasó, paso a paso.',
  espesura: 'LA ESPESURA. Salen cuatro brotes a la vez, uno en cada esquina, con el MISMO programa: '
    + 'arriba verán la línea de cada uno. `crecimiento` dice cómo creció; `minas`, dónde están las '
    + 'minas que nadie más ve, y `brote_1` … `brote_4`, qué hizo cada uno paso a paso y por qué se '
    + 'desconectó.',
};

const NOTA_PANTALLA: Record<Tipo, string> = {
  semillero: 'Ves EL SEMILLERO con los ojos del brote, y entero en el plano de la esquina: la entrada, '
    + 'la salida y la flecha, que apunta hacia donde mira. Díctenle el camino a Terminal paso a paso: '
    + 'cuántas casillas avanzar y hacia qué lado girar. Izquierda y derecha son las del brote: las de '
    + 'la vista grande.',
  seto: 'Ves EL SETO con los ojos del brote, y entero en el plano de la esquina. Díctenle '
    + 'el camino a Terminal, y busquen el tramo que se repite. Ojo: hay espinas que el plano pinta como '
    + 'camino; Datos sabe en qué casillas (columna en letra, fila en número). Si el brote se desconecta, '
    + 'qué le pasó lo tiene Datos en su bitácora.',
  espesura: 'LA ESPESURA: a oscuras, y del doble de grande. Salen cuatro brotes, uno por esquina, hacia el '
    + 'claro del centro. Lo que alumbran se te queda encendido: lanzamiento a lanzamiento irás viendo '
    + 'el laberinto. Si alguno se desconecta, solo verás eso: qué le pasó lo tiene Datos.',
};

const PISTA_TERMINAL: Record<Tipo, string> = {
  semillero: 'Escribe `ayuda`. Tú le escribes el programa al brote, una instrucción por línea '
    + '(`avanzar`, `girar izquierda`, `girar derecha`), y lo mandas con `lanzar`. No ves el laberinto: '
    + 'te lo dicta Pantalla.',
  seto: 'Escribe `ayuda`. Ahora el camino es largo y el brote solo carga 10 líneas: escrito paso a paso '
    + 'no cabe. Lo que se repite va UNA vez dentro de un `repetir N veces` … `fin`. El camino te lo dicta '
    + 'Pantalla, y las espinas las tiene Datos.',
  espesura: 'En la espesura salen cuatro brotes con TU programa, cada uno desde una esquina: no hay camino '
    + 'que dictar. Tiene que decidir solo, con sensores. `ayuda` tiene el resto.',
};

/** Lo que se le dice a la consola al llegar a una capa nueva. */
const AL_LLEGAR: Record<Tipo, string[]> = {
  semillero: [],
  seto: [
    'Ahora EL SETO: el camino es mucho más largo y el brote solo carga 10 líneas.',
    'Escrito paso a paso no cabe: busquen el tramo que se repite y escríbanlo UNA vez',
    'dentro de un `repetir N veces` … `fin`. El ciclo lo repite por ustedes.',
    'Y cuidado: hay espinas que el plano pinta como camino. Datos sabe dónde están.',
    'El programa empieza vacío.',
  ],
  espesura: [
    'La pierna apaga la luz y hace crecer LA ESPESURA: a oscuras y del doble de grande.',
    'Ahora salen CUATRO brotes a la vez, uno en cada esquina, con el mismo programa, y',
    'todos tienen que llegar al claro del centro. No hay camino que dictar: el programa',
    'tiene que decidir solo. El brote ya entiende sensores, `repetir mientras` y `si … sino`.',
    'Datos tiene cómo creció la espesura y dónde están sus minas.',
  ],
};

/** Lo que se celebra al cruzar una capa que no es la última. */
const AL_CRUZAR: Record<Tipo, string[]> = {
  semillero: [
    'El brote llegó a la salida cumpliendo su programa al pie de la letra,',
    'una instrucción tras otra. Eso que escribieron es un PROGRAMA.',
  ],
  seto: ['El brote ha cruzado el seto sin pisar una espina.', 'Las espinas no pudieron con un ciclo bien contado.'],
  espesura: [],
};

// ============================================================
//  EL MÓDULO
// ============================================================

type ConfigCompleta = Config & {
  /** Lo que contesta la consola cuando la fase ya está cruzada. */
  cerrada: string;
  /** El cierre, en la consola. */
  exito: { titulo: string; lineas: string[] };
};

function crearModulo(cfg: ConfigCompleta): ModuloFase {
  return {
    key: cfg.key,

    proyectar(role: Role, ctx) {
      const capa = capaDe(ctx.estado, cfg);
      const tipo = tipoDe(ctx.estado, cfg);
      const lamina = laminaDe(ctx.estado, cfg);
      switch (role) {
        case 'DATOS': {
          const u = ultimoDe(ctx.estado);
          return {
            titulo: `El programa del brote · ${NOMBRE_TIPO[tipo].toLowerCase()}`,
            nota: NOTA_DATOS[tipo],
            lamina,
            programa: {
              ...programaVisto(ctx.estado, tipo),
              capa,
              varios: varios(tipo),
              viaje: u ? viajeParaDatos(u) : null,
            },
            ...esquemaDatos(ctx.estado, cfg, ctx.semilla),
          };
        }

        case 'PANTALLA':
          return {
            salidas: ctx.salidas,
            nota: NOTA_PANTALLA[tipo],
            marana: vistaPantalla(ctx.estado, cfg, ctx.semilla),
            lamina,
          };

        case 'TERMINAL': {
          const p = programaVisto(ctx.estado, tipo);
          return {
            pista: PISTA_TERMINAL[tipo],
            cuarentenaHasta: null,
            brote: {
              capa,
              nombreCapa: NOMBRE_TIPO[tipo].toLowerCase(),
              varios: varios(tipo),
              lineas: p.usadas,
              max: p.max,
              abiertos: p.abiertos,
              viajes: numero(ctx.estado, 'viajeN'),
              listoEn: (ctx.estado.listoEn as number | undefined) ?? null,
            },
            lamina,
          };
        }
      }
    },

    ejecutar(comandoBruto: string, ctx: ContextoComando): ResultadoComando {
      const cmd = normalizar(comandoBruto);
      const [verbo, ...resto] = cmd.split(' ');
      const arg = resto.join(' ');
      const capa = capaDe(ctx.estado, cfg);
      const tipo = tipoDe(ctx.estado, cfg);
      const programa = programaDe(ctx.estado);
      const max = MAX_LINEAS[tipo];

      if (ctx.estado.resuelta === true && !['ayuda', 'help', 'estado'].includes(verbo)) {
        return { bloques: [texto([cfg.cerrada])] };
      }

      /** Guarda el programa nuevo. La salida solo confirma la línea: el
       *  programa entero se ve en Datos y en ningún otro sitio. */
      const guardar = (nuevo: string[], titulo: string, lineas: string[]): ResultadoComando => ({
        estado: { ...ctx.estado, programa: nuevo },
        bloques: [texto(lineas, titulo)],
      });
      const lleno = () => error(`El brote no carga más de ${max} líneas en esta capa. `
        + (NIVEL[tipo] >= 1 ? 'Junten lo que se repite en un `repetir`, o borren alguna.' : 'Borren alguna.'));
      const numeroDeLinea = (s: string, hasta: number): number | null => {
        const n = Number(s);
        return Number.isInteger(n) && n >= 1 && n <= hasta ? n : null;
      };

      switch (verbo) {
        case 'ayuda':
        case 'help':
          return ayuda(tipo, capa, cfg);

        case 'estado': {
          const p = programaVisto(ctx.estado, tipo);
          return {
            bloques: [texto([
              cfg.tipos.length > 1 ? `Capa ${capa} de ${cfg.tipos.length}: ${NOMBRE_TIPO[tipo]}.` : NOMBRE_TIPO[tipo],
              `Programa: ${p.usadas} de ${max} líneas${p.abiertos ? ` · ${p.abiertos} bloque(s) sin cerrar` : ''}.`,
              `${varios(tipo) ? 'Lanzamientos' : 'Brotes lanzados'}: ${numero(ctx.estado, 'viajeN')}.`,
            ], 'Estado')],
          };
        }

        case 'agregar':
        case 'añadir':
        case 'anadir':
        case 'escribir': {
          if (!arg) return { bloques: [error('¿Qué agrego? Por ejemplo: `agregar avanzar`.')] };
          const l = leerInstr(arg, tipo);
          if ('fallo' in l) return { bloques: [error(l.fallo)] };
          if (programa.length >= max) return { bloques: [lleno()] };
          const linea = pintarInstr(l.instr);
          return guardar([...programa, linea], 'Línea agregada', [`${programa.length + 1}.  ${linea}`]);
        }

        case 'insertar': {
          const [nTxt, ...instr] = resto;
          const n = numeroDeLinea(nTxt ?? '', programa.length + 1);
          if (n === null) {
            return { bloques: [error(`Se inserta delante de una línea: \`insertar 2 avanzar\`. Van del 1 al ${programa.length + 1}.`)] };
          }
          const l = leerInstr(instr.join(' '), tipo);
          if ('fallo' in l) return { bloques: [error(l.fallo)] };
          if (programa.length >= max) return { bloques: [lleno()] };
          const linea = pintarInstr(l.instr);
          const nuevo = [...programa.slice(0, n - 1), linea, ...programa.slice(n - 1)];
          return guardar(nuevo, 'Línea insertada', [`${n}.  ${linea}`, 'Las de abajo bajan un número.']);
        }

        case 'cambiar':
        case 'reemplazar':
        case 'editar': {
          const [nTxt, ...instr] = resto;
          const n = numeroDeLinea(nTxt ?? '', programa.length);
          if (n === null) {
            return {
              bloques: [error(programa.length
                ? `Se cambia una línea que exista: \`cambiar 2 girar derecha\`. Van del 1 al ${programa.length}.`
                : 'El programa está vacío: no hay nada que cambiar.')],
            };
          }
          const l = leerInstr(instr.join(' '), tipo);
          if ('fallo' in l) return { bloques: [error(l.fallo)] };
          const linea = pintarInstr(l.instr);
          const nuevo = programa.map((x, i) => (i === n - 1 ? linea : x));
          return guardar(nuevo, 'Línea cambiada', [`${n}.  ${linea}`]);
        }

        case 'borrar':
        case 'quitar':
        case 'eliminar': {
          if (arg === 'todo' || arg === 'todas' || arg === 'programa') {
            return guardar([], 'Programa borrado', ['El brote no lleva ninguna instrucción.']);
          }
          const n = numeroDeLinea(arg, programa.length);
          if (n === null) {
            return {
              bloques: [error(programa.length
                ? `«${arg}» no es un número de línea. Van del 1 al ${programa.length}, o \`borrar todo\`.`
                : 'El programa está vacío: no hay nada que borrar.')],
            };
          }
          const nuevo = programa.filter((_, i) => i !== n - 1);
          return guardar(nuevo, 'Línea borrada', [`Fuera la línea ${n}: ${programa[n - 1]}. Las de abajo suben un número.`]);
        }

        case 'lanzar':
        case 'correr':
        case 'ejecutar':
        case 'enviar':
        case 'probar':
        case 'desplegar':
          return lanzar(ctx, cfg);

        default: {
          // Una instrucción suelta se agrega al final: `avanzar` es más
          // natural que `agregar avanzar`, y nada se mueve hasta `lanzar`.
          const l = leerInstr(cmd, tipo);
          if ('instr' in l) {
            if (programa.length >= max) return { bloques: [lleno()] };
            const linea = pintarInstr(l.instr);
            return guardar([...programa, linea], 'Línea agregada',
              [`${programa.length + 1}.  ${linea}`, 'Nada se mueve todavía: el brote sale con `lanzar`.']);
          }
          const conocida = ['repetir', 'girar', 'si', 'sino', 'mientras', 'fin'].includes(verbo);
          return { bloques: [error(conocida ? l.fallo : `Comando no reconocido: «${comandoBruto.trim()}». Prueba \`ayuda\`.`)] };
        }
      }
    },
  };
}

// ============================================================
//  LANZAR
// ============================================================

function lanzar(ctx: ContextoComando, cfg: ConfigCompleta): ResultadoComando {
  const capa = capaDe(ctx.estado, cfg);
  const tipo = tipoDe(ctx.estado, cfg);
  const muchos = varios(tipo);
  const lineas = programaDe(ctx.estado);
  const listoEn = (ctx.estado.listoEn as number | undefined) ?? 0;
  if (ctx.ahora < listoEn) {
    const s = Math.ceil((listoEn - ctx.ahora) / 1000);
    return {
      bloques: [error(muchos
        ? `Los brotes anteriores siguen en el laberinto. Los siguientes germinan en ${s} s.`
        : `El brote anterior sigue en el laberinto. El siguiente germina en ${s} s.`)],
    };
  }
  if (lineas.length === 0) {
    return { bloques: [error('El programa está vacío: un brote sin instrucciones no da ni un paso. Agreguen alguna.')] };
  }
  const arbol = armar(lineas.map(leerGuardada));
  if ('fallo' in arbol) return { bloques: [error(`El brote no sale: ${arbol.fallo}`)] };

  const n = numero(ctx.estado, 'viajeN') + 1;
  let rejilla: Rejilla;
  let salidas: BroteEsp[];
  let pinchos: [number, number][];
  const esp = tipo === 'espesura' ? espesuraDe(ctx.semilla) : null;
  if (esp) {
    rejilla = esp.rejilla; salidas = esp.brotes; pinchos = esp.minas;
  } else {
    const s = setoDe(ctx.semilla, tipo as 'semillero' | 'seto');
    rejilla = s.rejilla; salidas = [{ entrada: s.entrada, rumbo: s.rumbo }]; pinchos = s.espinas;
  }

  // Todos con el mismo programa, cada uno desde su semillero.
  const brotes: BroteUltimo[] = [];
  const filas: Viaje[] = [];
  salidas.forEach((b, i) => {
    const cam = caminar(arbol.arbol, rejilla, b.entrada, b.rumbo);
    const fin: Fin = cam.fin === 'espina' && esp ? 'mina' : cam.fin;
    const ultimoPaso = cam.pasos[cam.pasos.length - 1];
    const donde: [number, number] = ultimoPaso ? [ultimoPaso.f, ultimoPaso.c] : b.entrada;
    const pincho = cam.fin === 'espina'
      ? pinchos.findIndex(([f, c]) => f === donde[0] && c === donde[1]) + 1
      : 0;
    brotes.push({ entrada: b.entrada, rumbo: b.rumbo, pasos: cam.pasos, fin, contra: cam.contra, pincho: pincho || null });
    filas.push({
      n, capa, tipo, lineas: lineas.length, b: i + 1, avances: cam.avances, giros: cam.giros,
      fin, casilla: casillaDe(donde), espina: pincho || null,
    });
  });
  const duracion = duracionDe(brotes, ritmoDe(tipo));
  const luzAntes = luzDe(ctx.estado);
  const luz = esp ? [...luzAntes, ...luzDelLanzamiento(esp, brotes, luzAntes).nuevas] : luzAntes;

  const ultimo: Ultimo = {
    n, capa, tipo, brotes, duracion,
    programa: lineas,
    ...(esp ? { luzPrevia: luzAntes.length } : {}),
  };
  const llega = brotes.every((b) => b.fin === 'salida');
  const ultimaCapa = capa >= cfg.tipos.length;
  const estado: Record<string, unknown> = {
    ...ctx.estado,
    viajeN: n,
    viajes: [...viajesDe(ctx.estado), ...filas].slice(-MAX_VIAJES),
    ultimo,
    luz,
    listoEn: ctx.ahora + duracion + GERMINA_MS + (llega && !ultimaCapa ? TRANSICION_MS : 0),
  };

  const salida = texto(
    muchos
      ? [
          `Lanzamiento ${n}: cuatro brotes en camino con ${lineas.length} línea(s), uno desde cada esquina.`,
          'Pantalla los ve andar; lo que hizo cada uno queda en su bitácora de Datos.',
        ]
      : [
          `Brote ${n} en camino: ${lineas.length} línea(s). Pantalla lo ve andar.`,
          'Lo que haga, paso a paso, queda en su bitácora (`brote`) de Datos.',
        ],
    muchos ? `Lanzamiento ${n}` : `Brote ${n}`,
  );

  if (!llega) {
    // No penaliza más que el tiempo: los brotes tardan lo que tardan en
    // andar y en germinar los siguientes. Cuenta como intento para el
    // desempate. Cuántos llegaron no se dice aquí: lo ve Pantalla.
    return { fallo: true, estado, bloques: [salida] };
  }

  if (!ultimaCapa) {
    const sig = cfg.tipos[capa];
    return {
      // Cada capa empieza con el programa vacío: el de la anterior no sirve.
      estado: { ...estado, capa: capa + 1, programa: [] },
      bloques: [
        salida,
        exito(`Capa ${capa} superada · ${NOMBRE_TIPO[tipo].toLowerCase()} cede`, AL_CRUZAR[tipo]),
        texto(AL_LLEGAR[sig], `Capa ${capa + 1} · ${NOMBRE_TIPO[sig]}`),
      ],
    };
  }

  return {
    resuelto: true,
    estado: { ...estado, resuelta: true },
    // La cortinilla espera a que los brotes lleguen: es lo que se ganó.
    esperaVictoriaMs: Math.min(90_000, Math.max(3000, duracion + 800)),
    bloques: [salida, exito(cfg.exito.titulo, cfg.exito.lineas)],
  };
}

// ============================================================
//  LAS DOS FASES
// ============================================================

/** Fase 1 · La Maraña: el semillero y el seto. La clave es la de cuando era
 *  la Fase 2 «El Enemigo»: se conserva para no migrar bases. */
export const marana = crearModulo({
  key: 'fase-2-enemigo',
  tipos: ['semillero', 'seto'],
  titulo: 'LA MARAÑA',
  final: { t: 'LA MARAÑA CRUZADA', sub: 'la pierna izquierda se queda sin trucos' },
  cerrada: 'La pierna izquierda ya no responde. La maraña está cruzada.',
  exito: {
    titulo: 'La maraña cruzada · la pierna izquierda cede',
    lineas: [
      'El brote cruzó el seto sin pisar una espina, con un programa de pocas líneas',
      'que camina muchos pasos.',
      '',
      'Lo que acaban de escribir tiene nombre. Una lista de pasos en orden, que se cumple',
      'al pie de la letra, es un ALGORITMO. Y un `repetir N veces` es un CICLO: escribir',
      'una vez lo que se hace muchas.',
    ],
  },
});

/** Bonus · La Espesura: el seguidor de pared, a oscuras y con cuatro brotes. */
export const espesura = crearModulo({
  key: 'fase-bonus-espesura',
  tipos: ['espesura'],
  titulo: 'LA ESPESURA',
  final: { t: 'LA ESPESURA CRUZADA', sub: 'los cuatro en el claro · el corazón queda al descubierto' },
  cerrada: 'Los cuatro brotes ya están en el claro. La espesura está cruzada.',
  exito: {
    titulo: 'La espesura cruzada · el corazón queda al descubierto',
    lineas: [
      'Los cuatro brotes han llegado al claro con el mismo programa, cada uno desde su',
      'esquina, sin pisar una mina: decidiendo solos a cada paso.',
      '',
      'Lo que acaban de escribir tiene nombre: ciclos que deciden. Un `repetir N veces`',
      'cuando sabes cuántas vueltas hacen falta; un `repetir mientras` cuando no, y un',
      '`si` dentro para decidir en cada vuelta.',
    ],
  },
});
