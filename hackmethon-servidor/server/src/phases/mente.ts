// ============================================================
//  FASE 6 — El Asalto a la Mente   ·   APIS   ·   LA FINAL
//
//  Ya cayeron las piernas, los brazos y el torso. Solo queda la mente: el
//  lugar donde la máquina procesa todo. Sus partes se hablan por una API
//  interna, y el equipo la usa para destruirlas. Es una pelea de jefe: la
//  máquina se defiende, se desespera y contraataca.
//
//  CAPA 1 · LAS DEFENSAS
//    Cinco facultades orbitan el núcleo (visión, lenguaje, memoria,
//    cálculo, miedo). Para destruirlas hay que hablar bien:
//      · una petición tiene MÉTODO, RUTA, CABECERAS y CUERPO;
//      · primero se pide acceso (POST /mente/sesion) y la respuesta trae
//        un TOKEN que va en la cabecera de todo lo demás — y caduca;
//      · el CÓDIGO de respuesta dice qué salió mal: 401 no dijiste quién
//        eres, 403 tu token no vale, 404 eso no existe, 405 método
//        equivocado, 422 falta algo en el cuerpo, 429 vas demasiado rápido.
//    Cada facultad destruida se la quita a la máquina: sin lenguaje, sus
//    frases salen revueltas.
//
//  CAPA 2 · EL ÚLTIMO PENSAMIENTO
//    Queda la VOLUNTAD, con cien de vida y un escudo. Apagarla es una
//    CONVERSACIÓN, no un disparo: pedir el reto (GET), bajar el escudo
//    con él (PATCH) y golpear (DELETE) antes de que vuelva a subir. A los
//    75, 50 y 25 de vida la mente se desespera: sube el escudo, invalida
//    el token y CONTRAATACA con averías a los puestos del equipo, cada vez
//    a más. Si le hacen spam, también.
//
//  EL REPARTO
//    TERMINAL  envía las peticiones, a ciegas.
//    DATOS     la documentación de la API y la clave de acceso.
//    PANTALLA  la mente en 3D —cómo se destruye todo— y los cuerpos de las
//              respuestas: tokens, ids, retos.
// ============================================================

import type { Role } from '../lib/constants.js';
import type { ContextoComando, ModuloFase, ResultadoComando } from './types.js';
import { error, exito, normalizar, numero, texto } from './comun.js';

type Capa = 1 | 2;
const CAPAS = 2;
const NOMBRES_CAPA = ['LAS DEFENSAS', 'EL ULTIMO PENSAMIENTO'];

export const FACULTADES = ['VISION', 'LENGUAJE', 'MEMORIA', 'CALCULO', 'MIEDO'] as const;
const BLINDAJES = [0, 0, 2, 3, 5];
const VIDA = 100;
const UMBRALES = [75, 50, 25];
const FUERZA_MAX = 25;
const TOKEN_MS = 150_000;
const RETO_MS = 45_000;
const ESCUDO_MS = 25_000;
/** El límite de ritmo: más de 4 peticiones en 8 s y la mente cierra 6 s. */
const RAFAGA = 4, RAFAGA_MS = 8_000, ESPERA_MS = 6_000;

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
const hex = (r: () => number, n: number) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('');
function barajar<T>(xs: readonly T[], r: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export type Proceso = { id: string; nombre: string; blindaje: number };
export type InstanciaMente = { clave: string; procesos: Proceso[]; semilla: string };
const instancias = new Map<string, InstanciaMente>();

export function instanciaDeMente(semilla?: string): InstanciaMente {
  const k = semilla ?? '';
  const hecha = instancias.get(k);
  if (hecha) return hecha;
  const r = azarDe(`${semilla ?? 'canon'}:mente`);
  const palabras = ['sinapsis', 'axon', 'cortex', 'neurona', 'dendrita', 'impulso'];
  const clave = `${palabras[Math.floor(r() * palabras.length)]}-${10 + Math.floor(r() * 90)}`;
  const blindajes = barajar(BLINDAJES, r);
  const procesos = FACULTADES.map((nombre, i) => ({ id: `p-${hex(r, 3)}`, nombre, blindaje: blindajes[i] }));
  const inst = { clave, procesos, semilla: semilla ?? 'canon' };
  instancias.set(k, inst);
  return inst;
}

/** El token de una sesión: depende del equipo y de cuántas veces la mente
 *  lo ha invalidado. Adivinarlo no sirve; pedirlo, sí. */
export const tokenDe = (inst: InstanciaMente, version: number) => {
  const r = azarDe(`${inst.semilla}:token:${version}`);
  return `tk-${hex(r, 6)}`;
};
/** El reto del núcleo: cambia cada 45 s. */
export const retoDe = (inst: InstanciaMente, ahora: number) => {
  const r = azarDe(`${inst.semilla}:reto:${Math.floor(ahora / RETO_MS)}`);
  return hex(r, 4);
};

// ---------- El estado ----------

type Estado = Record<string, unknown>;
const capaDe = (e: Estado): Capa => (e.capa === 2 ? 2 : 1);
const muertos = (e: Estado): string[] => (Array.isArray(e.muertos) ? (e.muertos as string[]) : []);
const vidaDe = (e: Estado) => (typeof e.vida === 'number' ? (e.vida as number) : VIDA);

/** Lo último que pasó, tal como lo dibuja la mente en 3D. */
export type EventoMente = {
  n: number;
  tipo: 'sesion' | 'consulta' | 'impacto' | 'rebote' | 'escudo' | 'golpe' | 'contraataque' | 'caida' | 'muerte' | 'limite';
  codigo: number;
  objetivo?: string;
  dano?: number;
};

// ---------- Lo que ve cada puesto ----------

const laminaDe = (e: Estado) => ({ capa: capaDe(e), capas: CAPAS, nombres: NOMBRES_CAPA, resuelta: e.resuelta === true });

/** El ánimo de la máquina, para su rostro y sus frases en los tres puestos. */
function animoDe(e: Estado) {
  const vida = vidaDe(e);
  return {
    perdidas: muertos(e),
    vida: capaDe(e) === 2 ? vida : null,
    max: VIDA,
    apagada: e.resuelta === true,
    /** 0 a 3: cuántos umbrales ha cruzado. Más alto, más desesperada. */
    furia: capaDe(e) === 2 ? UMBRALES.filter((u) => vida <= u).length : 0,
  };
}

function dibujo(inst: InstanciaMente, e: Estado, ahora: number) {
  const capa = capaDe(e);
  const vivos = new Set(inst.procesos.map((p) => p.nombre).filter((n) => !muertos(e).includes(n)));
  return {
    capa,
    resuelta: e.resuelta === true,
    procesos: inst.procesos.map((p) => ({ nombre: p.nombre, vivo: vivos.has(p.nombre), blindaje: p.blindaje })),
    nucleo: {
      vida: vidaDe(e), max: VIDA,
      escudo: capa === 1 || !(typeof e.escudoHasta === 'number' && (e.escudoHasta as number) > ahora),
      escudoHasta: typeof e.escudoHasta === 'number' ? (e.escudoHasta as number) : null,
      furia: animoDe(e).furia,
    },
    evento: (e.evento as EventoMente | undefined) ?? null,
    limiteHasta: typeof e.limiteHasta === 'number' ? (e.limiteHasta as number) : null,
  };
}

function esquemaDatos(inst: InstanciaMente, capa: Capa) {
  const endpoints = [
    ['E1', 'POST', '/mente/sesion', 'pedir acceso. Devuelve un token'],
    ['E2', 'GET', '/mente/procesos', 'listar las facultades vivas, con su id'],
    ['E3', 'DELETE', '/mente/procesos/<id>', 'destruir una facultad'],
    ...(capa === 2 ? [
      ['E4', 'GET', '/mente/nucleo', 'vida y escudo de la voluntad'],
      ['E5', 'GET', '/mente/nucleo/reto', 'el reto vigente. Cambia cada 45 s'],
      ['E6', 'PATCH', '/mente/nucleo', 'bajar el escudo 25 s'],
      ['E7', 'DELETE', '/mente/nucleo', 'golpear la voluntad'],
    ] : []),
  ];
  const requisitos = [
    ['R1', 'E1', 'cuerpo', 'clave=<la clave de acceso>'],
    ['R2', 'E2 en adelante', 'cabecera', 'token=<el que devolvio E1>. Caduca a los 150 s'],
    ['R3', 'E3', 'cuerpo', `fuerza=<n>, si la facultad tiene blindaje: n igual o mayor. Maximo ${FUERZA_MAX}`],
    ...(capa === 2 ? [
      ['R4', 'E6', 'cuerpo', 'escudo=abajo y reto=<el reto vigente>'],
      ['R5', 'E7', 'cuerpo', `fuerza=<n>, de 1 a ${FUERZA_MAX}. Le quita n de vida`],
      ['R6', 'E7', 'aviso', 'a los 75, 50 y 25 de vida sube el escudo, invalida el token y contraataca'],
    ] : []),
  ];
  return {
    lienzo: { w: 1000, h: 500 },
    tablas: [
      {
        id: 'endpoints', nombre: 'endpoints', x: 40, y: 30, w: 560,
        descripcion: 'Lo que entiende la mente', clave: 'id', columnas: ['id', 'metodo', 'ruta', 'para que sirve'], filas: endpoints,
      },
      {
        id: 'requisitos', nombre: 'requisitos', x: 40, y: 280, w: 600,
        descripcion: 'Que hay que mandarle a cada uno', clave: 'id', columnas: ['id', 'endpoint', 'donde', 'requisito'], filas: requisitos,
      },
      {
        id: 'codigos', nombre: 'codigos', x: 660, y: 200, w: 300,
        descripcion: 'Lo que significa cada respuesta', clave: 'codigo', columnas: ['codigo', 'significa'],
        filas: [
          ['200', 'hecho'],
          ['400', 'el reto no es el vigente'],
          ['401', 'no dijiste quien eres (o la clave no es)'],
          ['403', 'tu token no vale: caduco o la mente lo invalido'],
          ['404', 'esa ruta o ese id no existen'],
          ['405', 'la ruta existe, pero no con ese metodo'],
          ['422', 'falta algo en el cuerpo, o no alcanza'],
          ['423', 'el escudo esta arriba'],
          ['429', 'demasiado rapido: espera'],
        ],
      },
      {
        id: 'acceso', nombre: 'acceso', x: 660, y: 30, w: 300,
        descripcion: 'Lo que se saco de la boveda', clave: 'id', columnas: ['id', 'dato', 'valor'],
        filas: [['A1', 'clave de acceso', inst.clave]],
      },
    ],
    relaciones: [
      { desde: 'requisitos', campo: 'endpoint', hasta: 'endpoints' },
    ],
  };
}

function ayuda(): ResultadoComando {
  return {
    bloques: [
      texto([
        'enviar <METODO> <ruta> [cabecera k=v ...] [cuerpo k=v ...]',
        '',
        '  enviar GET /mente/algo cabecera token=XXX',
        '  enviar POST /mente/algo cuerpo campo=valor',
        '  enviar DELETE /mente/algo/123 cabecera token=XXX cuerpo fuerza=3',
      ], 'Como se le habla a la mente'),
      texto([
        'Metodos: GET pregunta · POST pide · PATCH cambia algo · DELETE destruye.',
        'La CABECERA dice quien eres; el CUERPO, que quieres.',
        'Que rutas hay, que pide cada una y que significa cada codigo lo tiene Datos.',
        'Lo que responde la mente lo ve Pantalla.',
      ], 'Lo que esta terminal NO sabe'),
    ],
  };
}

// ---------- El analizador de `enviar` ----------

type Peticion = { metodo: string; ruta: string; cabeceras: Record<string, string>; cuerpo: Record<string, string> };

export function parsearPeticion(palabras: string[]): Peticion | string {
  const metodo = (palabras[0] ?? '').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(metodo)) {
    return `«${palabras[0] ?? '(nada)'}» no es un metodo. Son GET, POST, PUT, PATCH y DELETE.`;
  }
  const ruta = palabras[1];
  if (!ruta || !ruta.startsWith('/')) return 'Falta la ruta, y las rutas empiezan por `/`. Que rutas hay lo tiene Datos.';
  const cabeceras: Record<string, string> = {};
  const cuerpo: Record<string, string> = {};
  let donde: 'cabecera' | 'cuerpo' | null = null;
  for (const w of palabras.slice(2)) {
    if (w === 'cabecera' || w === 'cabeceras') { donde = 'cabecera'; continue; }
    if (w === 'cuerpo') { donde = 'cuerpo'; continue; }
    if (!w.includes('=')) return `No se donde meter «${w}». Despues de la ruta van pares clave=valor, tras \`cabecera\` o \`cuerpo\`.`;
    if (!donde) return `«${w}» no esta ni en la cabecera ni en el cuerpo. Pon \`cabecera\` o \`cuerpo\` delante.`;
    const i = w.indexOf('=');
    (donde === 'cabecera' ? cabeceras : cuerpo)[w.slice(0, i)] = w.slice(i + 1);
  }
  return { metodo, ruta: ruta.replace(/\/+$/, '') || '/', cabeceras, cuerpo };
}

// ---------- La mente responde ----------

const RAZON: Record<number, string> = {
  200: 'OK', 400: 'BAD REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT FOUND', 405: 'METHOD NOT ALLOWED',
  422: 'UNPROCESSABLE', 423: 'LOCKED', 429: 'TOO MANY REQUESTS',
};
const respuesta = (codigo: number, lineas: string[]) => texto(lineas, `${codigo} ${RAZON[codigo] ?? ''}`.trim());

/** Elige `n` puestos distintos para el contraataque. */
const ROLES: Role[] = ['TERMINAL', 'PANTALLA', 'DATOS'];
function victimas(n: number, k: number): Role[] {
  const r = azarDe(`contra:${k}`);
  return barajar(ROLES, r).slice(0, n);
}

export const mente: ModuloFase = {
  key: 'fase-6-puente',

  proyectar(role: Role, ctx) {
    const inst = instanciaDeMente(ctx.semilla);
    const capa = capaDe(ctx.estado);
    const lamina = laminaDe(ctx.estado);
    const animo = animoDe(ctx.estado);
    switch (role) {
      case 'DATOS':
        return {
          titulo: capa === 1 ? 'La mente · su API' : 'La mente · la voluntad',
          nota: capa === 1
            ? 'Tienes la documentacion de la API de la mente: que rutas hay, que pide cada una y que significa '
              + 'cada codigo. Y la clave de acceso. Terminal envia a ciegas; lo que responde la mente lo ve Pantalla.'
            : 'Queda la voluntad. Apagarla es una conversacion: reto, bajar el escudo con el reto, golpear. Y a los '
              + '75, 50 y 25 de vida la mente invalida el token y contraataca: preparen al equipo.',
          lamina, animo,
          ...esquemaDatos(inst, capa),
        };
      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          nota: capa === 1
            ? 'Estas dentro de la mente. Lo que responde a cada peticion aparece abajo: tokens, ids, codigos. '
              + 'Dictaselos a Terminal. Arriba ves como se destruye todo.'
            : 'La voluntad tiene escudo. Canta el reto en cuanto aparezca: cambia cada 45 s. Y avisa cuando el '
              + 'escudo baje: hay que golpear antes de que vuelva.',
          mente: dibujo(inst, ctx.estado, Date.now()),
          lamina, animo,
        };
      case 'TERMINAL':
        return {
          pista: capa === 1
            ? 'Escribe `ayuda`. Primero pide acceso; con el token, destruye las facultades una por una. Datos tiene las rutas.'
            : 'Reto, escudo abajo, golpe. Rapido: el escudo dura 25 s. Si la mente invalida el token, vuelve a pedir acceso.',
          cuarentenaHasta: null,
          lamina, animo,
        };
    }
  },

  ejecutar(comandoBruto: string, ctx: ContextoComando): ResultadoComando {
    const inst = instanciaDeMente(ctx.semilla);
    const e = ctx.estado;
    const cmd = normalizar(comandoBruto);
    const [verbo, ...resto] = cmd.split(' ').filter(Boolean);
    const capa = capaDe(e);
    const n = numero(e, 'eventoN') + 1;
    const ahora = ctx.ahora;

    if (e.resuelta === true && verbo !== 'ayuda') {
      return { bloques: [texto(['Silencio. La mente ya no responde.'])] };
    }
    if (verbo === 'ayuda' || verbo === 'help') return ayuda();
    if (verbo !== 'enviar') return { bloques: [error(`Comando no reconocido: «${comandoBruto.trim()}». Prueba \`ayuda\`.`)] };

    // `normalizar` pasa todo a minúsculas: el método se vuelve a subir.
    const p = parsearPeticion(resto);
    if (typeof p === 'string') return { bloques: [error(p)] };

    // El ritmo: la mente cierra si la bombardean. Y si insisten, contraataca.
    const rafaga = (Array.isArray(e.rafaga) ? (e.rafaga as number[]) : []).filter((t) => ahora - t < RAFAGA_MS);
    const limiteHasta = typeof e.limiteHasta === 'number' ? (e.limiteHasta as number) : 0;
    if (limiteHasta > ahora) {
      const spam = numero(e, 'spam') + 1;
      const castiga = spam >= 3;
      return {
        estado: { ...e, eventoN: n, spam: castiga ? 0 : spam, evento: { n, tipo: castiga ? 'contraataque' : 'limite', codigo: 429 } },
        ...(castiga ? { contraataque: { roles: ['TERMINAL'] as Role[] } } : {}),
        bloques: [respuesta(429, [
          `Espera ${Math.ceil((limiteHasta - ahora) / 1000)} s.`,
          ...(castiga ? ['La mente se harta de tanto ruido y CONTRAATACA.'] : []),
        ])],
      };
    }
    rafaga.push(ahora);
    if (rafaga.length > RAFAGA) {
      return {
        estado: { ...e, eventoN: n, rafaga: [], limiteHasta: ahora + ESPERA_MS, spam: 0, evento: { n, tipo: 'limite', codigo: 429 } },
        bloques: [respuesta(429, [`Demasiadas peticiones. La mente se cierra ${ESPERA_MS / 1000} s.`])],
      };
    }
    const base = { ...e, eventoN: n, rafaga, spam: 0 };
    const rebote = (codigo: number, lineas: string[], extra: Estado = {}): ResultadoComando => ({
      estado: { ...base, ...extra, evento: { n, tipo: 'rebote', codigo } },
      bloques: [respuesta(codigo, lineas)],
    });

    // Las rutas y sus métodos.
    const RUTAS: Record<string, string[]> = {
      '/mente/sesion': ['POST'],
      '/mente/procesos': ['GET'],
      ...(capa === 2 ? { '/mente/nucleo': ['GET', 'PATCH', 'DELETE'], '/mente/nucleo/reto': ['GET'] } : {}),
    };
    const esProceso = p.ruta.startsWith('/mente/procesos/');
    const metodos = esProceso ? ['DELETE'] : RUTAS[p.ruta];
    if (!metodos) {
      return rebote(404, [`${p.ruta} no existe.`, capa === 1 && p.ruta.startsWith('/mente/nucleo') ? 'Todavia no: la voluntad esta detras de las defensas.' : 'Las rutas las tiene Datos.']);
    }
    if (!metodos.includes(p.metodo)) return rebote(405, [`${p.ruta} no acepta ${p.metodo}. Acepta: ${metodos.join(', ')}.`]);

    // Pedir acceso.
    const version = numero(e, 'tokenVersion');
    if (p.ruta === '/mente/sesion') {
      if (!p.cuerpo.clave) return rebote(422, ['Falta `clave` en el cuerpo.']);
      if (p.cuerpo.clave !== inst.clave) return rebote(401, ['Esa no es la clave de acceso.']);
      const token = tokenDe(inst, version);
      return {
        estado: { ...base, tokenHasta: ahora + TOKEN_MS, evento: { n, tipo: 'sesion', codigo: 200 } },
        bloques: [respuesta(200, [`{ "token": "${token}", "caduca_en": "${TOKEN_MS / 1000} s" }`])],
      };
    }

    // Todo lo demás pide el token.
    const token = p.cabeceras.token;
    if (!token) return rebote(401, ['Falta `token` en la cabecera. ¿Quien eres?']);
    const tokenHasta = typeof e.tokenHasta === 'number' ? (e.tokenHasta as number) : 0;
    if (token !== tokenDe(inst, version) || tokenHasta <= ahora) {
      return rebote(403, [tokenHasta <= ahora && token === tokenDe(inst, version)
        ? 'Ese token caduco. Pide acceso otra vez.'
        : 'Ese token no vale. Quiza la mente lo invalido: pide acceso otra vez.']);
    }

    // ---- Capa 1 ----
    if (p.ruta === '/mente/procesos') {
      const vivos = inst.procesos.filter((x) => !muertos(e).includes(x.nombre));
      return {
        estado: { ...base, evento: { n, tipo: 'consulta', codigo: 200 } },
        bloques: [respuesta(200, [
          '[',
          ...vivos.map((x) => `  { "id": "${x.id}", "facultad": "${x.nombre.toLowerCase()}", "blindaje": ${x.blindaje} },`),
          ']',
        ])],
      };
    }
    if (esProceso) {
      const id = p.ruta.slice('/mente/procesos/'.length);
      const proc = inst.procesos.find((x) => x.id === id);
      if (!proc) return rebote(404, [`No hay ninguna facultad con id «${id}».`]);
      if (muertos(e).includes(proc.nombre)) return rebote(404, [`${proc.nombre.toLowerCase()} ya no existe.`]);
      if (proc.blindaje > 0) {
        const f = Number(p.cuerpo.fuerza);
        if (!p.cuerpo.fuerza) return rebote(422, [`${proc.nombre.toLowerCase()} tiene blindaje ${proc.blindaje}: falta \`fuerza\` en el cuerpo.`]);
        if (!Number.isInteger(f) || f < 1 || f > FUERZA_MAX) return rebote(422, [`\`fuerza\` es un entero de 1 a ${FUERZA_MAX}.`]);
        if (f < proc.blindaje) return rebote(422, [`Fuerza ${f} no alcanza: el blindaje es ${proc.blindaje}.`]);
      }
      const ya = [...muertos(e), proc.nombre];
      const todas = ya.length === FACULTADES.length;
      return {
        estado: {
          ...base, muertos: ya, evento: { n, tipo: 'impacto', codigo: 200, objetivo: proc.nombre },
          ...(todas ? { capa: 2, vida: VIDA, escudoHasta: null } : {}),
        },
        bloques: [
          respuesta(200, [`{ "destruida": "${proc.nombre.toLowerCase()}", "quedan": ${FACULTADES.length - ya.length} }`]),
          ...(todas ? [
            exito('Las defensas caen', [
              'Cinco facultades destruidas con peticiones bien formadas: metodo, ruta,',
              'cabecera y cuerpo. Y cada codigo les dijo que corregir. Eso es una API.',
            ]),
            texto([
              'Queda la VOLUNTAD: cien de vida y un escudo. Apagarla es una conversacion:',
              'pedir el reto, bajar el escudo con el, y golpear antes de que vuelva a subir.',
              'Datos tiene las rutas nuevas. La mente se va a defender.',
            ], 'Capa 2 · EL ULTIMO PENSAMIENTO'),
          ] : []),
        ],
      };
    }

    // ---- Capa 2 · la voluntad ----
    const vida = vidaDe(e);
    const escudoHasta = typeof e.escudoHasta === 'number' ? (e.escudoHasta as number) : 0;
    const escudoAbajo = escudoHasta > ahora;
    if (p.ruta === '/mente/nucleo/reto') {
      return {
        estado: { ...base, evento: { n, tipo: 'consulta', codigo: 200 } },
        bloques: [respuesta(200, [`{ "reto": "${retoDe(inst, ahora)}", "cambia_en": "${Math.ceil((RETO_MS - (ahora % RETO_MS)) / 1000)} s" }`])],
      };
    }
    if (p.ruta === '/mente/nucleo' && p.metodo === 'GET') {
      return {
        estado: { ...base, evento: { n, tipo: 'consulta', codigo: 200 } },
        bloques: [respuesta(200, [`{ "vida": ${vida}, "escudo": "${escudoAbajo ? `abajo, ${Math.ceil((escudoHasta - ahora) / 1000)} s` : 'arriba'}" }`])],
      };
    }
    if (p.ruta === '/mente/nucleo' && p.metodo === 'PATCH') {
      if (p.cuerpo.escudo !== 'abajo') return rebote(422, ['Falta `escudo=abajo` en el cuerpo.']);
      if (!p.cuerpo.reto) return rebote(422, ['Falta `reto` en el cuerpo.']);
      if (p.cuerpo.reto !== retoDe(inst, ahora)) return rebote(400, ['Ese no es el reto vigente. Cambia cada 45 s: pidelo otra vez.']);
      return {
        estado: { ...base, escudoHasta: ahora + ESCUDO_MS, evento: { n, tipo: 'escudo', codigo: 200 } },
        bloques: [respuesta(200, [`{ "escudo": "abajo", "vuelve_en": "${ESCUDO_MS / 1000} s" }`])],
      };
    }
    // DELETE /mente/nucleo
    if (!escudoAbajo) return rebote(423, ['El escudo esta arriba. Bajalo primero.']);
    const f = Number(p.cuerpo.fuerza);
    if (!p.cuerpo.fuerza) return rebote(422, ['Falta `fuerza` en el cuerpo.']);
    if (!Number.isInteger(f) || f < 1 || f > FUERZA_MAX) return rebote(422, [`\`fuerza\` es un entero de 1 a ${FUERZA_MAX}.`]);
    const nueva = Math.max(0, vida - f);
    if (nueva === 0) {
      return {
        resuelto: true,
        esperaVictoriaMs: 6500,
        estado: { ...base, vida: 0, resuelta: true, escudoHasta: null, evento: { n, tipo: 'muerte', codigo: 200, dano: f } },
        bloques: [
          respuesta(200, ['{ "voluntad": 0 }']),
          exito('La mente se apaga', [
            'Ultimo golpe. La voluntad se rompe y el nucleo se queda quieto.',
            '',
            'Para llegar aqui hablaron con la maquina en su idioma: pidieron acceso,',
            'mandaron cada peticion con su metodo, su cabecera y su cuerpo, leyeron',
            'cada codigo, y sostuvieron una conversacion de tres pasos bajo presion.',
            '',
            'Eso es una API. Y esto era una maquina. ¿O no?',
          ]),
        ],
      };
    }
    // ¿Cruzó un umbral? La mente se desespera: escudo arriba, token
    // invalidado y contraataque, a cada umbral más fuerte.
    const cruzados = UMBRALES.filter((u) => vida > u && nueva <= u);
    if (cruzados.length) {
      const furia = UMBRALES.filter((u) => nueva <= u).length;
      return {
        estado: {
          ...base, vida: nueva, escudoHasta: null, tokenVersion: version + 1, tokenHasta: 0,
          evento: { n, tipo: 'contraataque', codigo: 200, dano: f },
        },
        contraataque: { roles: victimas(furia, n) },
        bloques: [
          respuesta(200, [`{ "voluntad": ${nueva} }`]),
          texto([
            furia === 1 ? 'La mente grita. Sube el escudo, invalida tu token y CONTRAATACA.'
              : furia === 2 ? 'La mente se revuelve, desesperada. Escudo arriba, token invalido, y contraataca a dos.'
              : 'La mente ya no piensa: solo se defiende. Contraataca a TODOS.',
          ], '¡CONTRAATAQUE!'),
        ],
      };
    }
    return {
      estado: { ...base, vida: nueva, evento: { n, tipo: 'golpe', codigo: 200, dano: f } },
      bloques: [respuesta(200, [`{ "voluntad": ${nueva} }`])],
    };
  },
};

/** Para las pruebas: lo que hay que mandar. */
export function solucionDeMente(inst: InstanciaMente) {
  return { clave: inst.clave, procesos: inst.procesos };
}
