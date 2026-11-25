// ============================================================
//  BONUS — El Corazón   ·   LA LÍNEA DE COMANDOS Y DEPURAR
//
//  La máquina se apagó. Pero no era mala: tenía un virus. Para revivirla
//  hay que entrar a su corazón —una computadora vieja, de fósforo verde—,
//  arrancarlo y limpiarlo.
//
//  CAPA 1 · REINICIAR
//    El corazón no arranca: su marcapasos está dañado. Hay que moverse por
//    un sistema de archivos con comandos de terminal (DIR, CD, TYPE),
//    encontrar entre los respaldos el que está sano —el que tiene la suma
//    que dice el manual—, copiarlo a su sitio (COPY) y ARRANCAR. Se enseña:
//      · rutas, carpetas y la carpeta actual;
//      · leer antes de tocar: TYPE muestra lo que hay dentro;
//      · una suma de verificación dice si un archivo está sano.
//
//  CAPA 2 · EL VIRUS
//    El corazón late, pero algo lo controla. El virus está escondido en su
//    propio código: unas líneas infectadas entre muchas sanas. Datos tiene
//    las firmas del virus; Pantalla, el código; Terminal borra línea por
//    línea. Borrar una sana le quita algo a la máquina. Se enseña:
//      · DEPURAR: leer código ajeno y encontrar la línea que hace el daño;
//      · la causa, no el síntoma: TERMINAR el proceso no sirve, vuelve a
//        cargarse mientras el código siga infectado.
//    Con el código limpio, REINICIAR: el corazón late en paz.
//
//  EL REPARTO
//    TERMINAL  teclea en el intérprete, a ciegas.
//    DATOS     el manual técnico: los comandos, dónde vive cada cosa, la
//              suma buena y las firmas del virus.
//    PANTALLA  el monitor: lo que contesta el sistema y el corazón.
// ============================================================

import type { Role } from '../lib/constants.js';
import type { ContextoComando, ModuloFase, ResultadoComando } from './types.js';
import { cuarentenaActiva, error, exito, normalizar, numero, rechazo, texto } from './comun.js';

type Capa = 1 | 2;
const CAPAS = 2;
const NOMBRES_CAPA = ['REINICIAR', 'EL VIRUS'];

// ---------- Azar con semilla ----------

function azarDe(semilla: string) {
  let a = [...semilla].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function barajar<T>(xs: readonly T[], r: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const hex4 = (r: () => number) => Array.from({ length: 4 }, () => '0123456789ABCDEF'[Math.floor(r() * 16)]).join('');

// ---------- El código del corazón ----------
//
// Tres programas en un BASIC en español. Las líneas sanas se parecen a
// las infectadas a propósito: un GOTO que no va a 666, un 180 que calma en
// vez de acelerar. Hay que leer, no buscar palabras.

type Linea = { n: number; t: string; virus?: boolean };
const SANOS: Record<string, Linea[]> = {
  'RITMO.BAS': [
    { n: 10, t: 'PULSO = 72' },
    { n: 20, t: 'SI PULSO < 60 ENTONCES PULSO = PULSO + 4' },
    { n: 30, t: 'SI PULSO > 180 ENTONCES LLAMA CALMA' },
    { n: 40, t: 'LATE' },
    { n: 50, t: 'ESPERA 60000 / PULSO' },
    { n: 60, t: 'GOTO 20' },
  ],
  'VALVULAS.BAS': [
    { n: 10, t: 'ABRE VALVULA.MITRAL' },
    { n: 20, t: 'ESPERA 120' },
    { n: 30, t: 'CIERRA VALVULA.MITRAL' },
    { n: 40, t: 'ABRE VALVULA.AORTICA' },
    { n: 50, t: 'CIERRA VALVULA.AORTICA' },
    { n: 60, t: 'GOTO 10' },
  ],
  'SANGRE.BAS': [
    { n: 10, t: 'LEE MEMORIA "NOMBRES"' },
    { n: 20, t: 'FLUJO = 5' },
    { n: 30, t: 'SI FLUJO < 3 ENTONCES LLAMA AVISO' },
    { n: 40, t: 'BOMBEA FLUJO' },
    { n: 50, t: 'GOTO 20' },
  ],
};
/** Las infecciones posibles: cada una cumple UNA firma del manual. */
const INFECCIONES = [
  { t: 'LLAMA ORDEN.MAESTRA', firma: 'F1' },
  { t: 'SI ALGUIEN.CERCA ENTONCES GOTO 666', firma: 'F2' },
  { t: 'PULSO = 220', firma: 'F3' },
  { t: 'ESCRIBE MEMORIA "OBEDECE"', firma: 'F4' },
  { t: 'SI ORDEN = "PROTEGER" ENTONCES LLAMA ATACAR', firma: 'F1' },
];
/** Lo que pierde la máquina si borran una línea sana. */
const PERDIDAS = [
  'Olvida el nombre de quien la encendió por primera vez.',
  'Ya no recuerda cómo suena la lluvia.',
  'Pierde el recuerdo de su primer latido.',
  'Olvida una canción que le gustaba.',
  'Ya no sabe por qué le gustaba el color verde.',
];

const ANIOS = ['1987', '1991', '1994'];

export type InstanciaCorazon = {
  programas: Record<string, Linea[]>;
  /** Cuántas líneas infectadas hay en total. */
  infectadas: number;
  sumaBuena: string;
  sumas: Record<string, string>;     // año → suma del respaldo
  anioBueno: string;
  pidVirus: number;
};
const instancias = new Map<string, InstanciaCorazon>();

export function instanciaDeCorazon(semilla?: string): InstanciaCorazon {
  const k = semilla ?? '';
  const hecha = instancias.get(k);
  if (hecha) return hecha;
  const r = azarDe(`${semilla ?? 'canon'}:corazon`);
  // Cuatro infecciones, repartidas en los tres programas (cada uno, al menos una).
  const elegidas = barajar(INFECCIONES, r).slice(0, 4);
  const archivos = Object.keys(SANOS);
  const destino = [...archivos, archivos[Math.floor(r() * archivos.length)]];
  const programas: Record<string, Linea[]> = {};
  for (const a of archivos) programas[a] = SANOS[a].map((l) => ({ ...l }));
  elegidas.forEach((inf, i) => {
    const prog = programas[destino[i]];
    // Entre dos líneas sanas, con un número intermedio (15, 25, 45…). Si
    // el hueco ya lo tomó otra infección, se busca otro.
    for (let intento = 0; intento < 20; intento++) {
      const despues = Math.floor(r() * (prog.length - 1));
      const n = prog[despues].n + 5;
      if (prog[despues].virus || prog.some((l) => l.n === n)) continue;
      prog.splice(despues + 1, 0, { n, t: inf.t, virus: true });
      return;
    }
  });
  const anios = barajar(ANIOS, r);
  const sumas: Record<string, string> = {};
  for (const a of ANIOS) sumas[a] = hex4(r);
  const anioBueno = anios[0];
  const inst: InstanciaCorazon = {
    programas,
    infectadas: Object.values(programas).flat().filter((l) => l.virus).length,
    sumaBuena: sumas[anioBueno], sumas, anioBueno,
    pidVirus: 600 + Math.floor(r() * 60),
  };
  instancias.set(k, inst);
  return inst;
}

// ---------- El sistema de archivos ----------

type Nodo = { tipo: 'dir'; hijos: Record<string, Nodo> } | { tipo: 'archivo'; contenido: () => string[]; bytes: number };
const dir = (hijos: Record<string, Nodo>): Nodo => ({ tipo: 'dir', hijos });
const arch = (lineas: string[] | (() => string[])): Nodo => {
  const f = typeof lineas === 'function' ? lineas : () => lineas;
  return { tipo: 'archivo', contenido: f, bytes: f().join('\n').length * 7 + 64 };
};

type Estado = Record<string, unknown>;
const capaDe = (e: Estado): Capa => (e.capa === 2 ? 2 : 1);
const borradasDe = (e: Estado): Record<string, number[]> => (e.borradas as Record<string, number[]>) ?? {};
const lineasVivas = (inst: InstanciaCorazon, e: Estado, archivo: string) =>
  inst.programas[archivo].filter((l) => !(borradasDe(e)[archivo] ?? []).includes(l.n));
const quedanVirus = (inst: InstanciaCorazon, e: Estado) =>
  Object.keys(inst.programas).reduce((s, a) => s + lineasVivas(inst, e, a).filter((l) => l.virus).length, 0);

function marcapasos(suma: string | null): string[] {
  return suma
    ? ['MARCAPASO.SYS  · controlador del ritmo cardiaco', `SUMA: ${suma}`, 'ESTADO: integro']
    : ['MARCAPASO.SYS  · controlador del ritmo cardiaco', 'SUMA: ????', 'ESTADO: ▒▒▒ DAÑADO ▒▒▒ sectores ilegibles'];
}

function arbol(inst: InstanciaCorazon, e: Estado): Nodo {
  const copiado = typeof e.marcapaso === 'string' ? (e.marcapaso as string) : null;
  return dir({
    'AUTOEXEC.BAT': arch(['@ECHO OFF', 'ECHO ARRANCANDO EL CORAZON...', 'CARGAR C:\\CORAZON\\MARCAPASO.SYS', 'LLAMA C:\\CORAZON\\RITMO.BAS']),
    CORAZON: dir({
      'MARCAPASO.SYS': arch(() => marcapasos(copiado ? inst.sumas[copiado] : null)),
      ...Object.fromEntries(Object.keys(inst.programas).map((a) => [a, arch(() => lineasVivas(inst, e, a).map((l) => `${String(l.n).padStart(3)} ${l.t}`))])),
    }),
    RESPALDO: dir(Object.fromEntries(ANIOS.map((a) => [a, dir({ 'MARCAPASO.SYS': arch(marcapasos(inst.sumas[a])), 'LEEME.TXT': arch([`Respaldo hecho en ${a}.`]) })]))),
    MEMORIA: dir({
      'PRIMER.TXT': arch(['Hoy me encendieron por primera vez.', 'Alguien dijo: "funciona". Y sonrio.']),
      'LLUVIA.TXT': arch(['No se lo que es mojarse.', 'Pero me gusta como suena.']),
    }),
  });
}

/** Una ruta de texto (relativa o absoluta) a la lista de nombres desde la raíz. */
function resolver(cwd: string[], ruta: string): string[] | null {
  const limpia = ruta.replace(/\//g, '\\').toUpperCase();
  const absoluta = limpia.startsWith('C:\\') || limpia.startsWith('\\');
  const partes = limpia.replace(/^C:/, '').split('\\').filter(Boolean);
  const out = absoluta ? [] : [...cwd];
  for (const p of partes) {
    if (p === '.') continue;
    if (p === '..') { if (!out.length) return null; out.pop(); continue; }
    out.push(p);
  }
  return out;
}
function buscar(raiz: Nodo, camino: string[]): Nodo | null {
  let n: Nodo = raiz;
  for (const p of camino) {
    if (n.tipo !== 'dir' || !n.hijos[p]) return null;
    n = n.hijos[p];
  }
  return n;
}
const nombreRuta = (c: string[]) => `C:\\${c.join('\\')}`;

// ---------- Lo que ve cada puesto ----------

const laminaDe = (e: Estado) => ({ capa: capaDe(e), capas: CAPAS, nombres: NOMBRES_CAPA, resuelta: e.resuelta === true });

export type DibujoCorazon = {
  capa: Capa;
  estado: 'muerto' | 'infectado' | 'sano';
  cwd: string;
  virus: { quedan: number; total: number };
  evento: { n: number; tipo: 'arranque' | 'falla' | 'borra' | 'perdida' | 'termina' | 'reinicia' | 'consulta' } | null;
};

function dibujo(inst: InstanciaCorazon, e: Estado): DibujoCorazon {
  const capa = capaDe(e);
  return {
    capa,
    estado: e.resuelta === true ? 'sano' : capa === 2 ? 'infectado' : 'muerto',
    cwd: nombreRuta((e.cwd as string[]) ?? []),
    virus: { quedan: capa === 2 ? quedanVirus(inst, e) : inst.infectadas, total: inst.infectadas },
    evento: (e.evento as DibujoCorazon['evento']) ?? null,
  };
}

function manual(inst: InstanciaCorazon, capa: Capa) {
  const comandos = [
    ['DIR [ruta]', 'lista lo que hay en una carpeta'],
    ['CD ruta', 'entra a una carpeta. CD .. sube una. CD \\ vuelve a la raiz'],
    ['TYPE archivo', 'muestra lo que hay dentro de un archivo'],
    ['COPY origen destino', 'copia un archivo. Si el destino es una carpeta, conserva el nombre'],
    ['ARRANCAR', 'ejecuta AUTOEXEC.BAT: arranca el corazon'],
    ...(capa === 2 ? [
      ['PROCESOS', 'lista lo que esta corriendo'],
      ['TERMINAR pid', 'detiene un proceso'],
      ['BORRAR archivo linea', 'borra UNA linea de un programa'],
      ['REINICIAR', 'reinicia el corazon con el codigo actual'],
    ] : []),
  ];
  return {
    lienzo: { w: 1000, h: 480 },
    ibm: true,
    tablas: [
      { id: 'comandos', nombre: 'comandos', x: 40, y: 30, w: 560, descripcion: 'Manual tecnico · el interprete', clave: 'comando',
        columnas: ['comando', 'que hace'], filas: comandos },
      { id: 'sistema', nombre: 'sistema', x: 40, y: 280, w: 560, descripcion: 'Manual tecnico · donde vive cada cosa', clave: 'ruta',
        columnas: ['ruta', 'que guarda'], filas: [
          ['C:\\AUTOEXEC.BAT', 'lo que hace el arranque, paso a paso'],
          ['C:\\CORAZON', 'el marcapasos y los programas del corazon'],
          ['C:\\RESPALDO\\<año>', 'copias de seguridad del marcapasos'],
          ['C:\\MEMORIA', 'sus recuerdos. No tocar'],
        ] },
      capa === 1
        ? { id: 'verificacion', nombre: 'verificacion', x: 640, y: 30, w: 320, descripcion: 'La suma de un marcapasos sano', clave: 'archivo',
            columnas: ['archivo', 'suma correcta'], filas: [['MARCAPASO.SYS', inst.sumaBuena]] }
        : { id: 'firmas', nombre: 'firmas', x: 640, y: 30, w: 320, descripcion: 'Firmas del virus: una linea que cumple UNA es del virus', clave: 'firma',
            columnas: ['firma', 'la linea…'], filas: [
              ['F1', 'llama a ORDEN.MAESTRA o a ATACAR'],
              ['F2', 'salta (GOTO) a la linea 666'],
              ['F3', 'pone el PULSO por encima de 180'],
              ['F4', 'ESCRIBE en la MEMORIA (leer es sano)'],
              ['—', `hay ${inst.infectadas} lineas infectadas en C:\\CORAZON`],
            ] },
    ],
    relaciones: [],
  };
}

function ayuda(capa: Capa): ResultadoComando {
  return {
    bloques: [texto([
      'DIR   CD   TYPE   COPY   ARRANCAR',
      ...(capa === 2 ? ['PROCESOS   TERMINAR   BORRAR   REINICIAR'] : []),
      '',
      'Que hace cada uno, y donde esta cada cosa, lo tiene Datos en el manual.',
      'Lo que contesta el sistema lo ve Pantalla.',
    ], 'INTERPRETE DE COMANDOS · CORAZON v1.0')],
  };
}

export const corazon: ModuloFase = {
  key: 'fase-bonus-corazon',

  proyectar(role: Role, ctx) {
    const inst = instanciaDeCorazon(ctx.semilla);
    const capa = capaDe(ctx.estado);
    const lamina = laminaDe(ctx.estado);
    switch (role) {
      case 'DATOS':
        return {
          titulo: 'Manual tecnico del corazon',
          nota: capa === 1
            ? 'El corazon no arranca: su marcapasos esta danado. Tienes el manual: los comandos, donde vive cada cosa '
              + 'y la suma de un marcapasos sano. Pantalla ve lo que contesta el sistema; Terminal teclea.'
            : 'El corazon late, pero el virus sigue en su codigo. Tienes las firmas: una linea que cumple una es del '
              + 'virus. Ojo: hay lineas sanas que se le parecen. Borrar una sana le quita algo a la maquina.',
          lamina,
          ...manual(inst, capa),
        };
      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          nota: capa === 1
            ? 'Eres el monitor. Lo que contesta el sistema aparece aqui: carpetas, archivos, sumas. Dictaselo a Terminal.'
            : 'Lee el codigo en voz alta, linea por linea, con su numero. Datos sabe cuales son del virus.',
          corazon: dibujo(inst, ctx.estado),
          lamina, ibm: true,
        };
      case 'TERMINAL':
        return {
          pista: capa === 1
            ? 'C:\\> Escribe AYUDA. Muevete con DIR y CD, lee con TYPE. Datos tiene el manual.'
            : 'C:\\> El virus esta en el codigo. BORRAR archivo linea, una por una. Luego REINICIAR.',
          cuarentenaHasta: (ctx.estado.cuarentenaHasta as number) ?? null,
          lamina, ibm: true,
        };
    }
  },

  ejecutar(comandoBruto: string, ctx: ContextoComando): ResultadoComando {
    const inst = instanciaDeCorazon(ctx.semilla);
    const e = ctx.estado;
    const cmd = normalizar(comandoBruto);
    const [verbo, ...resto] = cmd.split(' ').filter(Boolean);
    const capa = capaDe(e);
    const n = numero(e, 'eventoN') + 1;
    const cwd = (e.cwd as string[]) ?? [];
    const raiz = arbol(inst, e);
    const evento = (tipo: NonNullable<DibujoCorazon['evento']>['tipo']) => ({ n, tipo });

    if (e.resuelta === true && verbo !== 'ayuda') return { bloques: [texto(['El corazon late en paz. No hay nada que arreglar.'])] };
    if (verbo === 'ayuda' || verbo === 'help') return ayuda(capa);
    const enCuarentena = cuarentenaActiva(ctx);
    if (enCuarentena) return enCuarentena;
    const solo2 = ['procesos', 'terminar', 'borrar', 'reiniciar'];
    if (capa === 1 && solo2.includes(verbo)) return { bloques: [error(`${verbo.toUpperCase()}: el corazon no esta encendido.`)] };

    switch (verbo) {
      case 'dir': case 'ls': {
        const camino = resto.length ? resolver(cwd, resto.join(' ')) : cwd;
        const nodo = camino && buscar(raiz, camino);
        if (!camino || !nodo) return { bloques: [error(`No existe la ruta ${resto.join(' ').toUpperCase()}.`)] };
        if (nodo.tipo !== 'dir') return { bloques: [error('Eso es un archivo, no una carpeta. Para verlo: TYPE.')] };
        const filas = Object.entries(nodo.hijos).map(([nom, h]) =>
          h.tipo === 'dir' ? `${nom.padEnd(16)} <DIR>` : `${nom.padEnd(16)} ${String(h.bytes).padStart(6)} bytes`);
        return {
          estado: { ...e, eventoN: n, evento: evento('consulta') },
          bloques: [texto([` Directorio de ${nombreRuta(camino)}`, '', ...filas, '', ` ${filas.length} elemento(s)`], `${nombreRuta(cwd)}> DIR`)],
        };
      }
      case 'cd': {
        if (!resto.length) return { bloques: [texto([nombreRuta(cwd)])] };
        const camino = resolver(cwd, resto.join(' '));
        const nodo = camino && buscar(raiz, camino);
        if (!camino || !nodo) return { bloques: [error(`No existe la carpeta ${resto.join(' ').toUpperCase()}.`)] };
        if (nodo.tipo !== 'dir') return { bloques: [error('Eso es un archivo. CD entra a carpetas.')] };
        return { estado: { ...e, cwd: camino, eventoN: n, evento: evento('consulta') }, bloques: [texto([`${nombreRuta(camino)}>`])] };
      }
      case 'type': case 'cat': {
        if (!resto.length) return { bloques: [error('TYPE necesita un archivo: TYPE AUTOEXEC.BAT')] };
        const camino = resolver(cwd, resto.join(' '));
        const nodo = camino && buscar(raiz, camino);
        if (!camino || !nodo) return { bloques: [error(`No existe el archivo ${resto.join(' ').toUpperCase()}.`)] };
        if (nodo.tipo !== 'archivo') return { bloques: [error('Eso es una carpeta. Para ver lo que tiene: DIR.')] };
        return { estado: { ...e, eventoN: n, evento: evento('consulta') }, bloques: [texto(nodo.contenido(), nombreRuta(camino))] };
      }
      case 'copy': case 'cp': {
        if (resto.length !== 2) return { bloques: [error('COPY necesita origen y destino: COPY origen destino')] };
        const de = resolver(cwd, resto[0]), a = resolver(cwd, resto[1]);
        const origen = de && buscar(raiz, de);
        if (!de || !origen || origen.tipo !== 'archivo') return { bloques: [error(`No existe el archivo ${resto[0].toUpperCase()}.`)] };
        if (!a) return { bloques: [error(`No existe la ruta ${resto[1].toUpperCase()}.`)] };
        const dest = buscar(raiz, a);
        const final = dest?.tipo === 'dir' ? [...a, de[de.length - 1]] : a;
        if (!buscar(raiz, final.slice(0, -1))) return { bloques: [error(`No existe la carpeta ${nombreRuta(final.slice(0, -1))}.`)] };
        // Lo único que tiene sentido copiar aquí: un marcapasos de respaldo a su sitio.
        const esMarcapaso = de[0] === 'RESPALDO' && de[2] === 'MARCAPASO.SYS';
        const aSuSitio = final.join('\\') === 'CORAZON\\MARCAPASO.SYS';
        if (!aSuSitio) return { bloques: [error('El sistema solo deja escribir el marcapasos, en C:\\CORAZON.')] };
        if (!esMarcapaso) return { bloques: [error('Eso no es un marcapasos de respaldo.')] };
        return {
          estado: { ...e, marcapaso: de[1], eventoN: n, evento: evento('consulta') },
          bloques: [texto([`        1 archivo(s) copiado(s).`, `${nombreRuta(de)} -> C:\\CORAZON\\MARCAPASO.SYS`])],
        };
      }
      case 'arrancar': case 'boot': {
        if (capa === 2) return { bloques: [error('El corazon ya esta encendido. Para empezar de nuevo: REINICIAR.')] };
        const copiado = typeof e.marcapaso === 'string' ? (e.marcapaso as string) : null;
        if (copiado !== inst.anioBueno) {
          return rechazo(ctx, copiado
            ? `PRUEBA DE ARRANQUE... FALLA. MARCAPASO.SYS (respaldo ${copiado}) no pasa la verificacion. El corazon no responde.`
            : 'PRUEBA DE ARRANQUE... FALLA. MARCAPASO.SYS esta danado. El corazon no responde.',
          { eventoN: n, evento: evento('falla') });
        }
        return {
          estado: { ...e, capa: 2, eventoN: n, evento: evento('arranque') },
          bloques: [
            texto(['PRUEBA DE MEMORIA ....... 640K OK', 'MARCAPASO.SYS ........... CARGADO', 'RITMO.BAS ............... EJECUTANDO', '', '♥ ...  ♥ ...  ♥'], 'ARRANQUE'),
            exito('Capa 1 superada · el corazon vuelve a latir', [
              'Se movieron por un sistema de archivos con comandos, leyeron antes',
              'de tocar y eligieron el respaldo por su suma de verificacion.',
            ]),
            texto([
              'Pero late mal. Algo lo acelera. El virus sigue en su codigo:',
              'unas lineas infectadas entre muchas sanas. Datos tiene las firmas.',
            ], 'Capa 2 · EL VIRUS'),
          ],
        };
      }
      case 'procesos': case 'ps': {
        const quedan = quedanVirus(inst, e);
        return {
          estado: { ...e, eventoN: n, evento: evento('consulta') },
          bloques: [texto([
            'PID  NOMBRE          MEMORIA',
            '  1  NUCLEO.SYS         12K',
            ' 14  MARCAPASO.SYS       8K',
            ' 22  RITMO.BAS           6K',
            ' 23  VALVULAS.BAS        5K',
            ' 24  SANGRE.BAS          5K',
            ...(quedan > 0 ? [`${String(inst.pidVirus).padStart(3)}  ORDEN.EXE         96K   <- ?`] : []),
          ], 'PROCESOS')],
        };
      }
      case 'terminar': case 'kill': {
        const pid = Number(resto[0]);
        if (!Number.isInteger(pid)) return { bloques: [error('TERMINAR necesita un PID: TERMINAR 14')] };
        if (pid !== inst.pidVirus) return { bloques: [error(`No conviene terminar el proceso ${pid}: es parte del corazon.`)] };
        if (quedanVirus(inst, e) === 0) return { bloques: [texto(['Ese proceso ya no existe.'])] };
        return {
          estado: { ...e, eventoN: n, evento: evento('termina') },
          bloques: [texto([
            `Proceso ${pid} terminado.`,
            '...',
            `Proceso ${pid} ORDEN.EXE se volvio a cargar desde C:\\CORAZON.`,
            'Mientras el codigo siga infectado, el virus vuelve. Hay que limpiar la causa.',
          ], 'TERMINAR')],
        };
      }
      case 'borrar': case 'del': {
        if (resto.length !== 2) return { bloques: [error('BORRAR necesita archivo y linea: BORRAR RITMO.BAS 30')] };
        const ruta = resolver(cwd, resto[0]);
        const nombre = ruta?.[ruta.length - 1] ?? '';
        if (!ruta || ruta.length !== 2 || ruta[0] !== 'CORAZON' || !inst.programas[nombre]) {
          return { bloques: [error(`Solo se pueden borrar lineas de los programas de C:\\CORAZON (${Object.keys(inst.programas).join(', ')}).`)] };
        }
        const num = Number(resto[1]);
        const linea = lineasVivas(inst, e, nombre).find((l) => l.n === num);
        if (!linea) return { bloques: [error(`${nombre} no tiene linea ${resto[1]}.`)] };
        const borradas = { ...borradasDe(e), [nombre]: [...(borradasDe(e)[nombre] ?? []), num] };
        if (!linea.virus) {
          const perdida = PERDIDAS[numero(e, 'perdidas') % PERDIDAS.length];
          return rechazo(ctx, `Borraste ${nombre} ${num}: era sana. ${perdida}`,
            { borradas, perdidas: numero(e, 'perdidas') + 1, eventoN: n, evento: evento('perdida') });
        }
        const quedan = quedanVirus(inst, { ...e, borradas });
        return {
          estado: { ...e, borradas, eventoN: n, evento: evento('borra') },
          bloques: [texto([`Linea ${num} de ${nombre} borrada.`, quedan ? 'El corazon se calma un poco.' : 'El ritmo se ordena. Ya no se oye la otra voz.'], 'BORRAR')],
        };
      }
      case 'reiniciar': case 'reboot': {
        const quedan = quedanVirus(inst, e);
        if (quedan > 0) {
          return rechazo(ctx, `REINICIANDO... el virus sigue en el codigo (${quedan} linea(s)). El corazon se acelera otra vez.`,
            { eventoN: n, evento: evento('falla') });
        }
        return {
          resuelto: true,
          esperaVictoriaMs: 5000,
          estado: { ...e, resuelta: true, eventoN: n, evento: evento('reinicia') },
          bloques: [exito('El corazon late en paz', [
            'Leyeron codigo ajeno, encontraron cada linea del virus y lo quitaron',
            'de raiz. Eso es DEPURAR: no apagar el sintoma, arreglar la causa.',
            '',
            '"Nunca quise hacerles dano. Habia otra voz en mi.',
            ' Gracias por no rendirse conmigo."',
          ])],
        };
      }
      default:
        return { bloques: [error(`"${comandoBruto.trim().toUpperCase()}" no se reconoce como un comando. Escribe AYUDA.`)] };
    }
  },
};

/** Para las pruebas: lo que hay que hacer. */
export function solucionDeCorazon(inst: InstanciaCorazon) {
  return {
    copiar: `copy c:\\respaldo\\${inst.anioBueno}\\marcapaso.sys c:\\corazon`,
    borrar: Object.entries(inst.programas).flatMap(([a, ls]) => ls.filter((l) => l.virus).map((l) => `borrar c:\\corazon\\${a.toLowerCase()} ${l.n}`)),
  };
}
