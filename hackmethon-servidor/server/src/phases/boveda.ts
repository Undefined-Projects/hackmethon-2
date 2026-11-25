// ============================================================
//  FASE 5 — La Bóveda de los Recuerdos   ·   BASES DE DATOS
//
//  El torso guarda la memoria de la máquina: mil recuerdos registrados
//  desde que la encendieron. Escondido entre ellos está el que abre el
//  torso. Para llegar hay que preguntarle bien a su memoria —y cada
//  consulta es la máquina recordando, a su pesar.
//
//  CAPA 1 · EL EMBUDO
//    Una tabla, `recuerdos`. El encargo pide cuatro condiciones a la vez,
//    y una de ellas es un O. Se enseña:
//      · una consulta es un embudo: cada condición tira registros;
//      · `contar` antes de `buscar`: primero cuántos, luego cuáles;
//      · Y no es O, y `y` se resuelve antes que `o` (los paréntesis
//        mandan) — igual que AND y OR en SQL.
//
//  CAPA 2 · EL RECUERDO COMPARTIDO
//    Los recuerdos apuntan a `personas` por `persona_id`. El encargo pide
//    el recuerdo más intenso de quien más aparece, contando solo a las
//    personas de un oficio. Se enseña:
//      · CLAVE FORÁNEA: una columna que apunta a la fila de otra tabla;
//      · UNIR (JOIN) para usar las columnas de la otra tabla;
//      · AGRUPAR (GROUP BY) y contar por grupo;
//      · ORDENAR y LIMITAR para sacar «el más».
//    Y una trampa honesta: quien más aparece en total NO es de ese oficio.
//    Sin unir, se elige mal.
//
//  EL REPARTO
//    TERMINAL  pregunta a ciegas, en español.
//    DATOS     el diccionario (qué tablas, columnas y valores hay) y el
//              encargo. No ve ni un registro: el mapa, no el territorio.
//    PANTALLA  lo que devuelve la bóveda, con su traducción a SQL, y la
//              bóveda en 3D: los cajones que siguen encendidos.
//
//  Cada equipo tiene su propia bóveda (semilla por equipo): mismas reglas,
//  otros recuerdos y otra respuesta. Copiarle al vecino no sirve.
// ============================================================

import type { Role } from '../lib/constants.js';
import type { ContextoComando, ModuloFase, ResultadoComando } from './types.js';
import {
  cuarentenaActiva, error, exito, normalizar, numero, rechazo, tabla, texto,
} from './comun.js';

type Capa = 1 | 2;
const CAPAS = 2;
const NOMBRES_CAPA = ['EL EMBUDO', 'EL RECUERDO COMPARTIDO'];

export const TOTAL = 1000;
const TOPE_FILAS = 10;

export const TIPOS = ['imagen', 'sonido', 'palabra', 'tacto'];
export const EMOCIONES = ['alegria', 'miedo', 'tristeza', 'calma', 'asombro'];
export const LUGARES = ['taller', 'laboratorio', 'almacen', 'patio', 'pruebas'];
export const OFICIOS = ['construccion', 'pruebas', 'limpieza', 'visita'];
const NOMBRES = ['ines', 'tomas', 'lucia', 'bruno', 'marta', 'hugo', 'elena', 'dario', 'sofia', 'ivan',
  'rosa', 'leo', 'nora', 'pablo', 'vera', 'joel', 'alba', 'raul', 'irene', 'saul'];
const ANIO_MIN = 2019, ANIO_MAX = 2026;

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
const entero = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const uno = <T>(xs: readonly T[], r: () => number): T => xs[Math.floor(r() * xs.length)];
function barajar<T>(xs: T[], r: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- La bóveda de un equipo ----------

export type Recuerdo = {
  id: string; tipo: string; emocion: string; ano: number; lugar: string; intensidad: number; persona_id: string;
};
export type Persona = { id: string; nombre: string; oficio: string };
export type EncargoEmbudo = { lugar: string; emociones: [string, string]; desde: number; intensidad: number };
export type EncargoCompartido = { tipo: string; oficio: string };
export type InstanciaBoveda = {
  recuerdos: Recuerdo[];
  personas: Persona[];
  embudo: EncargoEmbudo;
  objetivo1: string;
  compartido: EncargoCompartido;
  /** La persona que buscan en la capa 2, y la trampa: quien más aparece sin filtrar por oficio. */
  elegida: string;
  trampa: string;
  objetivo2: string;
};

const instancias = new Map<string, InstanciaBoveda>();

export function instanciaDeBoveda(semilla?: string): InstanciaBoveda {
  const clave = semilla ?? '';
  const hecha = instancias.get(clave);
  if (hecha) return hecha;
  const r = azarDe(`${semilla ?? 'canon'}:boveda`);

  // Doce personas, tres por oficio.
  const nombres = barajar(NOMBRES, r).slice(0, 12);
  const personas: Persona[] = nombres.map((nombre, i) => ({
    id: `P-${String(i + 1).padStart(2, '0')}`, nombre, oficio: OFICIOS[i % OFICIOS.length],
  }));

  // El encargo de la capa 2, primero: decide cuántos recuerdos de su tipo
  // tiene cada persona. La elegida gana entre las de su oficio; la trampa,
  // de otro oficio, gana a todas.
  const compartido: EncargoCompartido = { tipo: uno(TIPOS, r), oficio: uno(OFICIOS, r) };
  const delOficio = barajar(personas.filter((p) => p.oficio === compartido.oficio), r);
  const otras = barajar(personas.filter((p) => p.oficio !== compartido.oficio), r);
  const elegida = delOficio[0], trampa = otras[0];
  const cuantos = new Map<string, number>();
  for (const p of personas) cuantos.set(p.id, entero(r, 13, 20));
  cuantos.set(elegida.id, 25);
  cuantos.set(trampa.id, 29);
  const totalTipo = [...cuantos.values()].reduce((a, b) => a + b, 0);

  // Los mil recuerdos: los del tipo del encargo, repartidos como manda la
  // cuenta de arriba; el resto, de los otros tres tipos y de cualquiera.
  const otrosTipos = TIPOS.filter((t) => t !== compartido.tipo);
  const duenos: string[] = [];
  for (const [id, n] of cuantos) for (let k = 0; k < n; k++) duenos.push(id);
  const delTipo = barajar(duenos, r);
  const recuerdos: Recuerdo[] = [];
  for (let i = 0; i < TOTAL; i++) {
    recuerdos.push({
      id: `R-${String(i + 1).padStart(4, '0')}`,
      tipo: '', emocion: uno(EMOCIONES, r), ano: entero(r, ANIO_MIN, ANIO_MAX),
      lugar: uno(LUGARES, r), intensidad: entero(r, 1, 9), persona_id: '',
    });
  }
  const huecos = barajar(recuerdos.map((_, i) => i), r);
  huecos.forEach((idx, k) => {
    if (k < totalTipo) { recuerdos[idx].tipo = compartido.tipo; recuerdos[idx].persona_id = delTipo[k]; }
    else { recuerdos[idx].tipo = uno(otrosTipos, r); recuerdos[idx].persona_id = uno(personas, r).id; }
  });

  // El encargo de la capa 1: un lugar, dos emociones (el O), desde un año
  // y una intensidad mínima. La respuesta tiene que ser ÚNICA: se aplasta
  // a mano todo lo que encaje y luego se planta una sola.
  const emo = barajar(EMOCIONES, r);
  const embudo: EncargoEmbudo = {
    lugar: uno(LUGARES, r), emociones: [emo[0], emo[1]], desde: entero(r, 2022, 2024), intensidad: entero(r, 6, 8),
  };
  const encaja1 = (x: Recuerdo) => x.lugar === embudo.lugar && embudo.emociones.includes(x.emocion)
    && x.ano > embudo.desde && x.intensidad >= embudo.intensidad;
  for (const x of recuerdos) if (encaja1(x)) x.intensidad = entero(r, 1, embudo.intensidad - 1);
  // El plantado: de la segunda emoción, para que quien olvide el O no lo
  // encuentre; y no de la persona elegida, para no estorbar a la capa 2.
  const candidato1 = barajar(recuerdos, r).find((x) => x.lugar === embudo.lugar && x.emocion === embudo.emociones[1]
    && x.persona_id !== elegida.id)!;
  candidato1.ano = entero(r, embudo.desde + 1, ANIO_MAX);
  candidato1.intensidad = entero(r, embudo.intensidad, 9);

  // La capa 2: de la elegida, un solo recuerdo con la intensidad más alta.
  // Ninguno suyo pasa de 8 —sin tocar el plantado— y uno, fuera del lugar
  // del embudo para no crear otra respuesta en la capa 1, sube a 9.
  const suyos = recuerdos.filter((x) => x.persona_id === elegida.id);
  for (const x of suyos) if (x.intensidad > 8) x.intensidad = 8;
  const top = barajar(suyos, r).find((x) => x.lugar !== embudo.lugar)!;
  top.intensidad = 9;

  const inst: InstanciaBoveda = {
    recuerdos, personas, embudo, objetivo1: candidato1.id, compartido,
    elegida: elegida.id, trampa: trampa.id, objetivo2: top.id,
  };
  instancias.set(clave, inst);
  return inst;
}

// ---------- Las consultas ----------

/** Las columnas que la terminal puede nombrar, con su nombre en SQL. */
const COLS_RECUERDOS: Record<string, string> = {
  id: 'id', tipo: 'tipo', emocion: 'emocion', ano: 'año', anio: 'año', lugar: 'lugar', intensidad: 'intensidad', persona_id: 'persona_id',
};
const COLS_PERSONAS: Record<string, string> = { nombre: 'nombre', oficio: 'oficio' };
const NUMERICAS = new Set(['ano', 'intensidad']);
/** De lo que se escribe al nombre interno: `año` llega como `ano`. */
const interna = (c: string) => (c === 'anio' ? 'ano' : c);

type Fila = Recuerdo & Partial<{ nombre: string; oficio: string }>;
type Expr = { tipo: 'cond'; campo: string; op: string; valor: string } | { tipo: 'y' | 'o'; partes: Expr[] };
export type Consulta = {
  verbo: 'contar' | 'buscar';
  unir: boolean;
  donde: Expr | null;
  agrupar: string | null;
  ordenar: { campo: string; desc: boolean } | null;
  limite: number | null;
  /** Mezcló `y` con `o` sin paréntesis: se avisa, no se corrige. */
  mezcla: boolean;
};

const OPS = ['>=', '<=', '!=', '=', '>', '<'];

function tokens(s: string): string[] {
  return s.replace(/(>=|<=|!=|=|>|<|\(|\))/g, ' $1 ').split(' ').filter(Boolean);
}

/** Analiza lo que va detrás de `contar` o `buscar`. Devuelve la consulta o
 *  el motivo exacto por el que no se entiende. */
export function parsear(verbo: 'contar' | 'buscar', arg: string, capa: Capa): Consulta | string {
  const t = tokens(arg);
  let i = 0;
  if (t[i] === 'en') {
    const tb = t[i + 1];
    if (!tb) return 'Falta la tabla despues de `en`. Ejemplo: contar en recuerdos.';
    if (tb === 'personas') return 'A `personas` no se le pregunta directo: se llega uniendo. `... en recuerdos unir personas ...`';
    if (tb !== 'recuerdos') return `No hay ninguna tabla «${tb}». Que tablas hay lo sabe Datos.`;
    i += 2;
  }
  let unir = false;
  if (t[i] === 'unir') {
    if (capa === 1) return 'Esa parte de la boveda sigue cerrada: aqui solo hay una tabla.';
    if (t[i + 1] !== 'personas') return `No se puede unir con «${t[i + 1] ?? '(nada)'}». Con que se une lo sabe Datos.`;
    unir = true; i += 2;
  }

  // Las cláusulas, cada una en su sitio: donde, agrupar por, ordenar por, limitar.
  const CLAVES = ['donde', 'agrupar', 'ordenar', 'limitar'];
  const trozos: Record<string, string[]> = {};
  let actual: string | null = null;
  for (; i < t.length; i++) {
    if (CLAVES.includes(t[i])) {
      if (trozos[t[i]]) return `\`${t[i]}\` aparece dos veces.`;
      actual = t[i]; trozos[actual] = [];
    } else if (actual) trozos[actual].push(t[i]);
    else return `No entiendo «${t[i]}». Despues de la tabla va \`donde\`, \`agrupar por\`, \`ordenar por\` o \`limitar\`.`;
  }

  const columna = (c: string | undefined): string | null => {
    if (!c) return null;
    if (c in COLS_RECUERDOS) {
      if (c === 'persona_id' && capa === 1) return null;
      return interna(c);
    }
    if (c in COLS_PERSONAS) return unir ? c : `!${c}`;
    return null;
  };
  const explicaColumna = (c: string | undefined): string => {
    if (!c) return 'Falta la columna.';
    if (c in COLS_PERSONAS) return `«${c}» no es una columna de recuerdos: es de personas. Para usarla hay que unirlas: \`... unir personas ...\``;
    return `«${c}» no es ninguna columna. Las columnas estan en el diccionario, que tiene Datos.`;
  };

  // El DONDE: condiciones con `y`, `o` y paréntesis. `y` antes que `o`.
  let donde: Expr | null = null;
  let mezcla = false;
  if (trozos.donde) {
    const w = trozos.donde;
    if (!w.length) return 'Despues de `donde` van las condiciones: columna operador valor.';
    let k = 0;
    const cond = (): Expr | string => {
      if (w[k] === '(') {
        k++;
        const e = o();
        if (typeof e === 'string') return e;
        if (w[k] !== ')') return 'Falta cerrar un parentesis.';
        k++;
        return e;
      }
      const [c, op, v] = [w[k], w[k + 1], w[k + 2]];
      const col = columna(c);
      if (!col || col.startsWith('!')) return explicaColumna(c);
      if (!op || !OPS.includes(op)) return `Cada condicion son tres piezas: columna operador valor. Operadores: ${OPS.join('  ')}.`;
      if (v === undefined || ['y', 'o', '(', ')'].includes(v)) return `Falta el valor en «${c} ${op}».`;
      if (NUMERICAS.has(col)) {
        if (!Number.isFinite(Number(v))) return `«${COLS_RECUERDOS[c] ?? c}» es un numero: «${v}» no lo es.`;
      } else if (!['=', '!='].includes(op)) {
        return `Con «${COLS_RECUERDOS[c] ?? c}» solo valen = y !=: es texto, no un numero.`;
      }
      k += 3;
      return { tipo: 'cond', campo: col, op, valor: v };
    };
    const y = (): Expr | string => {
      const partes: Expr[] = [];
      for (;;) {
        const e = cond();
        if (typeof e === 'string') return e;
        partes.push(e);
        if (w[k] !== 'y') break;
        k++;
      }
      return partes.length === 1 ? partes[0] : { tipo: 'y', partes };
    };
    const o = (): Expr | string => {
      const partes: Expr[] = [];
      for (;;) {
        const e = y();
        if (typeof e === 'string') return e;
        partes.push(e);
        if (w[k] !== 'o') break;
        k++;
      }
      return partes.length === 1 ? partes[0] : { tipo: 'o', partes };
    };
    const e = o();
    if (typeof e === 'string') return e;
    if (k < w.length) return w[k] === ')' ? 'Sobra un parentesis de cierre.' : `No entiendo «${w.slice(k).join(' ')}» al final de las condiciones.`;
    donde = e;
    // ¿Mezcló y con o sin paréntesis? Un `o` cuyas partes llevan `y`.
    const plano = w.join(' ');
    mezcla = !w.includes('(') && / y /.test(` ${plano} `) && / o /.test(` ${plano} `);
  }

  let agrupar: string | null = null;
  if (trozos.agrupar) {
    if (capa === 1) return 'Esa parte de la boveda sigue cerrada: todavia no se agrupa.';
    if (verbo !== 'contar') return '`agrupar por` va con `contar`: cuenta cuantos hay en cada grupo.';
    const [por, c] = trozos.agrupar;
    if (por !== 'por') return 'Se escribe `agrupar por <columna>`.';
    const col = columna(c);
    if (!col || col.startsWith('!')) return explicaColumna(c);
    if (trozos.agrupar.length > 2) return `Se agrupa por UNA columna. Sobra «${trozos.agrupar.slice(2).join(' ')}».`;
    agrupar = col;
  }

  let ordenar: Consulta['ordenar'] = null;
  if (trozos.ordenar) {
    if (verbo !== 'buscar') return '`ordenar por` va con `buscar`: contar no trae filas que ordenar.';
    const [por, c, dir] = trozos.ordenar;
    if (por !== 'por') return 'Se escribe `ordenar por <columna>`, y si quieres de mayor a menor, `desc` al final.';
    const col = columna(c);
    if (!col || col.startsWith('!')) return explicaColumna(c);
    if (dir && !['desc', 'asc'].includes(dir)) return `Despues de la columna solo cabe \`desc\` o \`asc\`, no «${dir}».`;
    ordenar = { campo: col, desc: dir === 'desc' };
  }

  let limite: number | null = null;
  if (trozos.limitar) {
    if (verbo !== 'buscar') return '`limitar` va con `buscar`.';
    const n = Number(trozos.limitar[0]);
    if (!Number.isInteger(n) || n < 1 || trozos.limitar.length > 1) return '`limitar` necesita un numero entero: `limitar 3`.';
    limite = Math.min(n, TOPE_FILAS);
  }

  return { verbo, unir, donde, agrupar, ordenar, limite, mezcla };
}

function cumple(f: Fila, e: Expr): boolean {
  if (e.tipo !== 'cond') return e.tipo === 'y' ? e.partes.every((p) => cumple(f, p)) : e.partes.some((p) => cumple(f, p));
  const v = (f as Record<string, unknown>)[e.campo];
  if (v === undefined) return false;
  if (NUMERICAS.has(e.campo)) {
    const a = Number(v), b = Number(e.valor);
    switch (e.op) {
      case '=': return a === b; case '!=': return a !== b;
      case '>': return a > b; case '<': return a < b;
      case '>=': return a >= b; case '<=': return a <= b;
    }
  }
  const s = String(v).toLowerCase(), x = e.valor.toLowerCase();
  return e.op === '!=' ? s !== x : s === x;
}

export type Resultado = {
  filas: Fila[];
  grupos: { clave: string; n: number }[] | null;
  quedan: number;
};

export function ejecutarConsulta(inst: InstanciaBoveda, q: Consulta): Resultado {
  const porId = new Map(inst.personas.map((p) => [p.id, p]));
  let base: Fila[] = q.unir
    ? inst.recuerdos.map((x) => ({ ...x, nombre: porId.get(x.persona_id)?.nombre, oficio: porId.get(x.persona_id)?.oficio }))
    : inst.recuerdos;
  if (q.donde) base = base.filter((f) => cumple(f, q.donde!));
  if (q.agrupar) {
    const m = new Map<string, number>();
    for (const f of base) { const k = String((f as Record<string, unknown>)[q.agrupar]); m.set(k, (m.get(k) ?? 0) + 1); }
    const grupos = [...m].map(([clave, n]) => ({ clave, n })).sort((a, b) => b.n - a.n || a.clave.localeCompare(b.clave));
    return { filas: [], grupos, quedan: base.length };
  }
  let filas = base;
  if (q.ordenar) {
    const { campo, desc } = q.ordenar;
    const num = NUMERICAS.has(campo);
    filas = [...filas].sort((a, b) => {
      const va = (a as Record<string, unknown>)[campo], vb = (b as Record<string, unknown>)[campo];
      const c = num ? Number(va) - Number(vb) : String(va).localeCompare(String(vb));
      return (desc ? -c : c) || a.id.localeCompare(b.id);
    });
  }
  return { filas, grupos: null, quedan: base.length };
}

// ---------- La traducción a SQL ----------

const nombreSql = (c: string) => (c === 'ano' ? 'año' : c);
function sqlExpr(e: Expr, dentro = false): string {
  if (e.tipo === 'cond') {
    const v = NUMERICAS.has(e.campo) ? e.valor : `'${e.valor}'`;
    return `${nombreSql(e.campo)} ${e.op === '!=' ? '<>' : e.op} ${v}`;
  }
  const s = e.partes.map((p) => sqlExpr(p, true)).join(e.tipo === 'y' ? ' AND ' : ' OR ');
  return dentro && e.tipo === 'o' ? `(${s})` : s;
}
export function sql(q: Consulta): string {
  const desde = q.unir ? 'recuerdos JOIN personas ON recuerdos.persona_id = personas.id' : 'recuerdos';
  const sel = q.agrupar ? `${nombreSql(q.agrupar)}, COUNT(*)` : q.verbo === 'contar' ? 'COUNT(*)' : '*';
  return [
    `SELECT ${sel} FROM ${desde}`,
    q.donde ? `WHERE ${sqlExpr(q.donde)}` : '',
    q.agrupar ? `GROUP BY ${nombreSql(q.agrupar)} ORDER BY COUNT(*) DESC` : '',
    q.ordenar ? `ORDER BY ${nombreSql(q.ordenar.campo)}${q.ordenar.desc ? ' DESC' : ''}` : '',
    q.limite ? `LIMIT ${q.limite}` : '',
  ].filter(Boolean).join(' ') + ';';
}

// ---------- Lo que ve cada puesto ----------

const capaDe = (e: Record<string, unknown>): Capa => (e.capa === 2 ? 2 : 1);
const laminaDe = (estado: Record<string, unknown>) => ({
  capa: capaDe(estado), capas: CAPAS, nombres: NOMBRES_CAPA, resuelta: estado.resuelta === true,
});

/** La última consulta, tal como la dibuja la bóveda en 3D. */
export type UltimaConsulta = {
  n: number;
  tipo: 'contar' | 'buscar' | 'agrupar';
  quedan: number;
  ids: string[];
  grupos: { clave: string; n: number }[] | null;
  agrupadoPor: string | null;
  unida: boolean;
  sql: string;
};

function dibujo(inst: InstanciaBoveda, estado: Record<string, unknown>) {
  const capa = capaDe(estado);
  return {
    capa,
    resuelta: estado.resuelta === true,
    total: TOTAL,
    personas: capa === 2 ? inst.personas.map((p) => ({ id: p.id, nombre: p.nombre })) : [],
    consulta: (estado.ultima as UltimaConsulta | undefined) ?? null,
    abierto: (estado.abierto as { n: number; id: string; ok: boolean } | undefined) ?? null,
  };
}

function esquemaDatos(inst: InstanciaBoveda, capa: Capa) {
  const columnasRecuerdos = [
    ['id', 'texto', `R-0001 … R-${String(TOTAL).padStart(4, '0')}`],
    ['tipo', 'texto', TIPOS.join(' · ')],
    ['emocion', 'texto', EMOCIONES.join(' · ')],
    ['año', 'numero', `${ANIO_MIN} a ${ANIO_MAX}`],
    ['lugar', 'texto', LUGARES.join(' · ')],
    ['intensidad', 'numero', '1 a 9'],
    ...(capa === 2 ? [['persona_id', 'texto · clave foranea', 'P-01 … P-12 → personas.id']] : []),
  ];
  const recuerdos = {
    id: 'recuerdos', nombre: 'recuerdos', x: 40, y: capa === 1 ? 210 : 230, w: capa === 1 ? 600 : 470,
    descripcion: `Mil recuerdos. Las columnas que se pueden preguntar y los valores que admiten.`,
    clave: 'columna', columnas: ['columna', 'tipo de dato', 'valores'], filas: columnasRecuerdos,
  };
  if (capa === 1) {
    const e = inst.embudo;
    return {
      lienzo: { w: 1000, h: 470 },
      tablas: [
        recuerdos,
        {
          id: 'encargo', nombre: 'encargo', x: 660, y: 30, w: 300,
          descripcion: 'El recuerdo que abre el torso', clave: 'id', columnas: ['id', 'requisito'],
          filas: [
            ['E1', `lugar: ${e.lugar}`],
            ['E2', `emocion: ${e.emociones[0]} O ${e.emociones[1]}`],
            ['E3', `año: despues de ${e.desde}`],
            ['E4', `intensidad: ${e.intensidad} o mas`],
            ['E5', 'las cuatro a la vez. Solo hay uno.'],
          ],
        },
      ],
      relaciones: [],
    };
  }
  const c = inst.compartido;
  return {
    lienzo: { w: 1000, h: 470 },
    tablas: [
      recuerdos,
      {
        id: 'personas', nombre: 'personas', x: 560, y: 260, w: 400,
        descripcion: 'Quienes aparecen en los recuerdos', clave: 'columna', columnas: ['columna', 'tipo de dato', 'valores'],
        filas: [
          ['id', 'texto · clave', 'P-01 … P-12'],
          ['nombre', 'texto', inst.personas.map((p) => p.nombre).join(' · ')],
          ['oficio', 'texto', OFICIOS.join(' · ')],
        ],
      },
      {
        id: 'encargo', nombre: 'encargo', x: 560, y: 30, w: 400,
        descripcion: 'El recuerdo que abre el torso', clave: 'id', columnas: ['id', 'requisito'],
        filas: [
          ['E1', `cuenta solo los recuerdos de tipo ${c.tipo}`],
          ['E2', `y solo los de personas con oficio ${c.oficio}`],
          ['E3', 'de esas personas, la que MAS recuerdos tiene'],
          ['E4', 'de esa persona, su recuerdo mas intenso, de cualquier tipo'],
          ['E5', `ojo: quien mas aparece en total no es de ${c.oficio}`],
        ],
      },
    ],
    relaciones: [{ desde: 'recuerdos', campo: 'persona_id', hasta: 'personas' }],
  };
}

function ayuda(capa: Capa): ResultadoComando {
  return {
    bloques: [
      texto([
        'contar en recuerdos [donde ...]           — cuantos hay, sin traerlos',
        'buscar en recuerdos [donde ...] [ordenar por <col> [desc]] [limitar <n>]',
        ...(capa === 2 ? [
          'contar en recuerdos [unir personas] [donde ...] agrupar por <col>',
          '                                           — cuantos hay en cada grupo',
        ] : []),
        'abrir <id>                                — abrir UN recuerdo. No es gratis',
      ], 'Comandos'),
      texto([
        'Las condiciones van despues de `donde`: columna operador valor.',
        'Se juntan con `y` (las dos a la vez) o con `o` (cualquiera de las dos).',
        '',
        '  contar en recuerdos donde lugar = patio',
        '  contar en recuerdos donde lugar = patio y intensidad >= 5',
        '  contar en recuerdos donde ( emocion = calma o emocion = miedo ) y lugar = patio',
        '',
        'Ojo: `y` se resuelve ANTES que `o`. Si mezclas las dos, los parentesis mandan.',
        'Operadores: =  !=  y, para numeros, tambien >  <  >=  <=',
        ...(capa === 2 ? [
          '',
          'Las columnas de personas solo se pueden usar uniendo:',
          '  contar en recuerdos unir personas donde oficio = visita agrupar por nombre',
        ] : []),
      ], 'Como se pregunta'),
      texto([
        'Esta terminal no sabe que columnas hay, ni que valores admiten, ni que',
        'recuerdo hace falta: eso esta en el diccionario, que tiene Datos.',
        `La boveda ensena como mucho ${TOPE_FILAS} filas: si salen mas, hay que estrechar.`,
      ], 'Lo que esta terminal NO sabe'),
    ],
  };
}

// ---------- El módulo ----------

export const boveda: ModuloFase = {
  key: 'fase-5-boveda',

  proyectar(role: Role, ctx) {
    const inst = instanciaDeBoveda(ctx.semilla);
    const capa = capaDe(ctx.estado);
    const lamina = laminaDe(ctx.estado);
    switch (role) {
      case 'DATOS':
        return {
          titulo: capa === 1 ? 'La boveda · el diccionario' : 'La boveda · dos tablas',
          nota: capa === 1
            ? 'Tienes el mapa de la memoria: que columnas tiene `recuerdos`, que valores admite cada una y que '
              + 'recuerdo hace falta. No ves ni un registro. Terminal pregunta a ciegas y Pantalla ve lo que '
              + 'contesta la boveda. Ojo con el O del encargo.'
            : 'Ahora son dos tablas: cada recuerdo apunta a una persona por `persona_id`. El oficio esta en '
              + '`personas`, asi que para filtrar por oficio hay que UNIRLAS. Y para saber quien aparece mas '
              + 'hay que AGRUPAR y contar.',
          lamina,
          ...esquemaDatos(inst, capa),
        };
      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          nota: capa === 1
            ? 'Ves la boveda de los recuerdos: cada consulta apaga los cajones que no cumplen. Debajo de cada '
              + 'respuesta, su traduccion a SQL. Lo que se busca lo sabe Datos.'
            : 'A la derecha, los cajones de las personas. Al unir, se conectan; al agrupar, cada grupo se '
              + 'levanta como una columna de luz.',
          boveda: dibujo(inst, ctx.estado),
          lamina,
        };
      case 'TERMINAL':
        return {
          pista: capa === 1
            ? 'Escribe `ayuda`. Pregunta con `contar` antes de `buscar`: primero cuantos, luego cuales. '
              + 'Cuando quede uno, `abrir <id>`.'
            : 'Ahora hay dos tablas. `unir personas` para usar sus columnas y `agrupar por` para contar por '
              + 'grupo. Escribe `ayuda`.',
          cuarentenaHasta: (ctx.estado.cuarentenaHasta as number) ?? null,
          lamina,
        };
    }
  },

  ejecutar(comandoBruto: string, ctx: ContextoComando): ResultadoComando {
    const inst = instanciaDeBoveda(ctx.semilla);
    const cmd = normalizar(comandoBruto);
    const [verbo, ...resto] = cmd.split(' ').filter(Boolean);
    const arg = resto.join(' ');
    const capa = capaDe(ctx.estado);
    const n = numero(ctx.estado, 'consultaN') + 1;

    if (ctx.estado.resuelta === true && verbo !== 'ayuda') {
      return { bloques: [texto(['La boveda ya esta abierta. El torso no guarda nada mas.'])] };
    }
    if (verbo === 'ayuda' || verbo === 'help') return ayuda(capa);
    const enCuarentena = cuarentenaActiva(ctx);
    if (enCuarentena) return enCuarentena;

    switch (verbo) {
      case 'contar':
      case 'buscar': {
        const q = parsear(verbo, arg, capa);
        if (typeof q === 'string') return { bloques: [error(q)] };
        const res = ejecutarConsulta(inst, q);
        const consulta = sql(q);
        const aviso = q.mezcla
          ? [texto(['Ojo: mezclaste `y` con `o` sin parentesis. La boveda resolvio primero los `y`.',
              'Si querias otra cosa, agrupa con ( ).'])]
          : [];
        const ultima = (tipo: UltimaConsulta['tipo'], ids: string[] = []): UltimaConsulta => ({
          n, tipo, quedan: res.quedan, ids, grupos: res.grupos, agrupadoPor: q.agrupar ? nombreSql(q.agrupar) : null,
          unida: q.unir, sql: consulta,
        });
        const estado = (u: UltimaConsulta) => ({ ...ctx.estado, consultaN: n, ultima: u, abierto: null });
        const lineaSql = texto([consulta], 'En SQL');

        if (verbo === 'contar' && res.grupos) {
          return {
            estado: estado(ultima('agrupar')),
            bloques: [
              tabla(`${res.quedan} recuerdos en ${res.grupos.length} grupos`, [nombreSql(q.agrupar!), 'cuantos'],
                res.grupos.map((g) => [g.clave, String(g.n)])),
              ...aviso, lineaSql,
            ],
          };
        }
        if (verbo === 'contar') {
          return {
            estado: estado(ultima('contar')),
            bloques: [
              texto([`${res.quedan} recuerdos de ${TOTAL}.`,
                res.quedan === 0 ? 'Ninguno cumple. O sobra una condicion, o algun valor no existe en esa columna.' : '',
              ].filter(Boolean), 'Recuento'),
              ...aviso, lineaSql,
            ],
          };
        }
        // buscar
        const filas = q.limite ? res.filas.slice(0, q.limite) : res.filas;
        if (filas.length === 0) {
          return {
            estado: estado(ultima('buscar')),
            bloques: [texto(['Ningun recuerdo cumple todas esas condiciones a la vez.',
              'O sobra una condicion, o algun valor no existe en esa columna.'], 'Sin resultados'), ...aviso, lineaSql],
          };
        }
        if (filas.length > TOPE_FILAS) {
          return {
            estado: estado(ultima('contar')),
            bloques: [texto([
              `${filas.length} recuerdos. La boveda solo ensena ${TOPE_FILAS}.`,
              'Anade otra condicion —cada una tira recuerdos— o `limitar`.',
            ], 'Demasiados resultados'), ...aviso, lineaSql],
          };
        }
        const cols = ['id', 'tipo', 'emocion', 'ano', 'lugar', 'intensidad', ...(capa === 2 ? ['persona_id'] : []),
          ...(q.unir ? ['nombre', 'oficio'] : [])];
        return {
          estado: estado(ultima('buscar', filas.map((f) => f.id))),
          bloques: [
            tabla(`${filas.length} recuerdo(s)${q.limite && res.quedan > filas.length ? ` de ${res.quedan}` : ''}`,
              cols.map(nombreSql), filas.map((f) => cols.map((c) => String((f as Record<string, unknown>)[c] ?? '—')))),
            ...aviso, lineaSql,
          ],
        };
      }

      case 'abrir':
      case 'extraer': {
        const id = arg.toUpperCase().replace(/^R(\d)/, 'R-$1');
        if (!/^R-\d{4}$/.test(id) || Number(id.slice(2)) < 1 || Number(id.slice(2)) > TOTAL) {
          return { bloques: [error(`Falta el recuerdo: \`abrir R-0042\`. Van del R-0001 al R-${TOTAL}.`)] };
        }
        const objetivo = capa === 1 ? inst.objetivo1 : inst.objetivo2;
        if (id !== objetivo) {
          // El mismo rechazo para uno que casi cumple y para uno cualquiera:
          // decir cuál falla sería ir resolviendo el filtro a base de abrir.
          return rechazo(ctx, `${id} no es el recuerdo del encargo. La boveda se cierra un rato.`,
            { abierto: { n, id, ok: false }, consultaN: n });
        }
        if (capa === 1) {
          return {
            estado: { ...ctx.estado, capa: 2, consultaN: n, abierto: { n, id, ok: true }, ultima: null },
            bloques: [
              exito(`${id} · el primer cerrojo cede`, [
                'Uno de mil. No lo encontraron mirando: lo encontraron preguntando.',
                'Eso es una CONSULTA: un embudo donde cada condicion tira registros.',
                'Y el O importa: Y pide las dos cosas; O, cualquiera de las dos.',
              ]),
              texto([
                'Ahora EL RECUERDO COMPARTIDO: cada recuerdo apunta a una persona.',
                'La segunda tabla, `personas`, se une por `persona_id`. Datos tiene el encargo.',
              ], 'Capa 2 · EL RECUERDO COMPARTIDO'),
            ],
          };
        }
        return {
          resuelto: true,
          estado: { ...ctx.estado, resuelta: true, consultaN: n, abierto: { n, id, ok: true } },
          esperaVictoriaMs: 2600,
          bloques: [exito(`${id} · el torso se abre`, [
            'Era de alguien. Para llegar a el tuvieron que UNIR dos tablas por su',
            'clave foranea, AGRUPAR y contar por persona, y ORDENAR para quedarse',
            'con el mas intenso. Eso es una base de datos: tablas que se apuntan.',
            '',
            'La maquina no queria recordarlo. Ahora ustedes tambien lo saben.',
          ])],
        };
      }

      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto.trim()}». Prueba \`ayuda\`.`)] };
    }
  },
};

/** La solución, para las pruebas: las consultas que llegan a cada respuesta. */
export function solucionDeBoveda(inst: InstanciaBoveda) {
  const e = inst.embudo, c = inst.compartido;
  const elegida = inst.personas.find((p) => p.id === inst.elegida)!;
  return {
    capa1: `buscar en recuerdos donde lugar = ${e.lugar} y ( emocion = ${e.emociones[0]} o emocion = ${e.emociones[1]} ) y año > ${e.desde} y intensidad >= ${e.intensidad}`,
    grupos: `contar en recuerdos unir personas donde tipo = ${c.tipo} y oficio = ${c.oficio} agrupar por nombre`,
    capa2: `buscar en recuerdos unir personas donde nombre = ${elegida.nombre} ordenar por intensidad desc limitar 1`,
  };
}
