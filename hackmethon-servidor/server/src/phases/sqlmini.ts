// ============================================================
//  Mini-motor SQL de la Fase 5.
//
//  No ejecuta SQL de verdad: entiende un subconjunto cerrado, sobre
//  tablas que viven en memoria, y nada más. Eso es una decisión de
//  seguridad —un equipo escribiendo en una terminal no debe poder
//  tocar nada que no sea la bóveda de juguete— y también de diseño: lo
//  que el motor NO entiende se convierte en un error que se explica.
//
//  LO QUE ENTIENDE
//    SELECT [DISTINCT] cols FROM t [alias]
//      [INNER|LEFT JOIN t2 [alias] ON a.x = b.y] ...
//      [WHERE ...] [GROUP BY ...] [ORDER BY ... [DESC]] [LIMIT n]
//    · cols: *, alias.*, columna, tabla.columna, COUNT(*), AS nombre
//    · WHERE: = != <> < > <= >=, LIKE (% y _), IN (...), IS [NOT] NULL,
//             AND / OR / NOT y paréntesis
//    CREATE VIEW nombre AS SELECT ...   ·   DROP VIEW nombre
//    DELETE FROM t [WHERE ...]          (con triggers)
//    DROP TRIGGER nombre   ·   DISABLE TRIGGER nombre
//
//  Los identificadores no distinguen mayúsculas; los TEXTOS sí: la
//  fase se apoya en que 'K7' y 'k7' son cosas distintas.
// ============================================================

export type Valor = string | number | null;
export type Fila = Record<string, Valor>;
export type Tabla = { nombre: string; columnas: string[]; filas: Fila[] };

// ---------- Triggers ----------

export type EfectoTrigger =
  /** Al borrar, vuelve a insertar las filas borradas que existan en `desde`. */
  | { tipo: 'reponer'; desde: string }
  /** Al borrar, añade una fila a `bitacora`. */
  | { tipo: 'registrar'; detalle: string }
  /** No toca datos: es parte del funcionamiento normal del robot. */
  | { tipo: 'inocuo' };

export type TriggerDef = {
  id: string;
  nombre: string;
  tabla: string;
  evento: 'INSERT' | 'UPDATE' | 'DELETE';
  efecto: EfectoTrigger;
  /** Lo que se lee en el catálogo `sistema_triggers`. */
  accion: string;
  activo: boolean;
};

export type BD = {
  tablas: Map<string, Tabla>;
  triggers: TriggerDef[];
  /** ¿Existe la tabla de catálogo `sistema_triggers`? */
  catalogoTriggers: boolean;
  seqBitacora: number;
};

export function clonarBD(base: BD): BD {
  const tablas = new Map<string, Tabla>();
  for (const [k, t] of base.tablas) {
    tablas.set(k, { nombre: t.nombre, columnas: t.columnas, filas: t.filas.map((f) => ({ ...f })) });
  }
  return {
    tablas,
    triggers: base.triggers.map((t) => ({ ...t })),
    catalogoTriggers: base.catalogoTriggers,
    seqBitacora: base.seqBitacora,
  };
}

export class ErrorSql extends Error {
  pistas: string[];
  constructor(mensaje: string, pistas: string[] = []) {
    super(mensaje);
    this.pistas = pistas;
  }
}

// ---------- Tokens ----------

type Tok = { t: 'str' | 'num' | 'id' | 'sym' | 'fin'; v: string; pos: number };

const SIMBOLOS2 = ['<=', '>=', '<>', '!='];
const SIMBOLOS1 = '=<>(),*.;';

function tokenizar(sql: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'") {
      let j = i + 1;
      let s = '';
      for (;;) {
        if (j >= sql.length) throw new ErrorSql('Falta cerrar una comilla simple en un texto.');
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { s += "'"; j += 2; continue; }
          break;
        }
        s += sql[j];
        j++;
      }
      out.push({ t: 'str', v: s, pos: i });
      i = j + 1;
      continue;
    }
    if (c === '"') throw new ErrorSql("Los textos van entre comillas simples ('asi'), no dobles.");
    if (/[0-9]/.test(c)) {
      const m = /^\d+(\.\d+)?/.exec(sql.slice(i))!;
      out.push({ t: 'num', v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i))!;
      out.push({ t: 'id', v: m[0].toLowerCase(), pos: i });
      i += m[0].length;
      continue;
    }
    const dos = sql.slice(i, i + 2);
    if (SIMBOLOS2.includes(dos)) { out.push({ t: 'sym', v: dos, pos: i }); i += 2; continue; }
    if (SIMBOLOS1.includes(c)) { out.push({ t: 'sym', v: c, pos: i }); i++; continue; }
    throw new ErrorSql(`Caracter no valido en la consulta: «${c}».`);
  }
  out.push({ t: 'fin', v: '', pos: sql.length });
  return out;
}

// ---------- AST ----------

export type RefCol = { tabla?: string; col: string };
export type Operando = { t: 'col'; tabla?: string; col: string } | { t: 'lit'; v: Valor };

export type Expr =
  | { k: 'cmp'; izq: Operando; op: string; der: Operando }
  | { k: 'like'; izq: Operando; patron: Operando; neg: boolean }
  | { k: 'in'; izq: Operando; lista: Operando[]; neg: boolean }
  | { k: 'null'; izq: Operando; neg: boolean }
  | { k: 'and' | 'or'; a: Expr; b: Expr }
  | { k: 'not'; e: Expr };

type ItemSel =
  | { tipo: 'estrella'; tabla?: string }
  | { tipo: 'col'; ref: RefCol; alias?: string }
  | { tipo: 'count'; alias?: string };

type Union = { tipo: 'inner' | 'left'; tabla: string; alias: string; on: Expr };
type Orden = { count: boolean; ref?: RefCol; desc: boolean };

export type Select = {
  distinct: boolean;
  cols: ItemSel[];
  from: { tabla: string; alias: string };
  joins: Union[];
  donde: Expr | null;
  groupBy: RefCol[];
  orderBy: Orden[];
  limite?: number;
};

export type Sentencia =
  | { tipo: 'select'; sel: Select }
  | { tipo: 'crear_vista'; nombre: string; sel: Select; sql: string }
  | { tipo: 'borrar_vista'; nombre: string }
  | { tipo: 'delete'; tabla: string; donde: Expr | null }
  | { tipo: 'drop_trigger'; nombre: string }
  | { tipo: 'disable_trigger'; nombre: string };

const RESERVADAS = new Set([
  'select', 'from', 'where', 'join', 'inner', 'left', 'outer', 'on', 'group', 'by', 'order',
  'limit', 'and', 'or', 'not', 'like', 'in', 'is', 'null', 'as', 'distinct', 'count', 'desc',
  'asc', 'create', 'view', 'drop', 'delete', 'trigger', 'disable',
]);

// ---------- Analizador ----------

class Parser {
  i = 0;
  toks: Tok[];
  sql: string;
  constructor(toks: Tok[], sql: string) { this.toks = toks; this.sql = sql; }

  peek(n = 0): Tok { return this.toks[Math.min(this.i + n, this.toks.length - 1)]; }
  next(): Tok { const t = this.peek(); if (this.i < this.toks.length - 1) this.i++; return t; }
  esKw(k: string, n = 0): boolean { const t = this.peek(n); return t.t === 'id' && t.v === k; }
  kw(k: string): boolean { if (this.esKw(k)) { this.next(); return true; } return false; }
  esSim(s: string, n = 0): boolean { const t = this.peek(n); return t.t === 'sym' && t.v === s; }
  sim(s: string): boolean { if (this.esSim(s)) { this.next(); return true; } return false; }

  esperaKw(k: string, contexto = '') {
    if (!this.kw(k)) throw this.inesperado(`Falta «${k.toUpperCase()}»${contexto}.`);
  }
  esperaSim(s: string, contexto = '') {
    if (!this.sim(s)) throw this.inesperado(`Falta «${s}»${contexto}.`);
  }
  inesperado(msg: string): ErrorSql {
    const t = this.peek();
    const visto = t.t === 'fin' ? '(el final de la consulta)' : `«${t.t === 'str' ? `'${t.v}'` : t.v}»`;
    return new ErrorSql(`${msg} Aqui hay ${visto}.`);
  }
  ident(que: string): string {
    const t = this.peek();
    if (t.t !== 'id' || RESERVADAS.has(t.v)) throw this.inesperado(`Se esperaba ${que}.`);
    this.next();
    return t.v;
  }
  aliasOpcional(): string | undefined {
    if (this.kw('as')) return this.ident('un alias');
    const t = this.peek();
    if (t.t === 'id' && !RESERVADAS.has(t.v)) { this.next(); return t.v; }
    return undefined;
  }

  ref(): RefCol {
    const a = this.ident('una columna');
    if (this.sim('.')) return { tabla: a, col: this.ident('el nombre de la columna') };
    return { col: a };
  }

  operando(): Operando {
    const t = this.peek();
    if (t.t === 'str') { this.next(); return { t: 'lit', v: t.v }; }
    if (t.t === 'num') { this.next(); return { t: 'lit', v: Number(t.v) }; }
    if (this.esKw('null')) { this.next(); return { t: 'lit', v: null }; }
    const r = this.ref();
    return { t: 'col', tabla: r.tabla, col: r.col };
  }

  or(): Expr {
    let a = this.and();
    while (this.kw('or')) a = { k: 'or', a, b: this.and() };
    return a;
  }
  and(): Expr {
    let a = this.not();
    while (this.kw('and')) a = { k: 'and', a, b: this.not() };
    return a;
  }
  not(): Expr {
    if (this.kw('not')) return { k: 'not', e: this.not() };
    return this.pred();
  }
  pred(): Expr {
    if (this.sim('(')) {
      const e = this.or();
      this.esperaSim(')', ' para cerrar el parentesis');
      return e;
    }
    const izq = this.operando();
    if (this.kw('is')) {
      const neg = this.kw('not');
      this.esperaKw('null', ' tras IS');
      return { k: 'null', izq, neg };
    }
    const neg = this.kw('not');
    if (this.kw('like')) return { k: 'like', izq, patron: this.operando(), neg };
    if (this.kw('in')) {
      this.esperaSim('(', ' tras IN');
      const lista: Operando[] = [this.operando()];
      while (this.sim(',')) lista.push(this.operando());
      this.esperaSim(')', ' para cerrar IN');
      return { k: 'in', izq, lista, neg };
    }
    if (neg) throw this.inesperado('Tras NOT va LIKE o IN.');
    const t = this.peek();
    if (t.t === 'sym' && ['=', '!=', '<>', '<', '>', '<=', '>='].includes(t.v)) {
      this.next();
      return { k: 'cmp', izq, op: t.v === '<>' ? '!=' : t.v, der: this.operando() };
    }
    throw this.inesperado('Cada condicion es columna operador valor (=, !=, <, >, LIKE, IN, IS NULL).');
  }

  select(): Select {
    this.esperaKw('select');
    const distinct = this.kw('distinct');
    const cols: ItemSel[] = [];
    do {
      if (this.sim('*')) {
        cols.push({ tipo: 'estrella' });
      } else if (this.esKw('count')) {
        this.next();
        this.esperaSim('(', ' tras COUNT');
        this.esperaSim('*', ': solo se entiende COUNT(*)');
        this.esperaSim(')');
        cols.push({ tipo: 'count', alias: this.aliasOpcional() });
      } else if (this.peek().t === 'id' && this.esSim('.', 1) && this.esSim('*', 2)) {
        const tabla = this.ident('una tabla');
        this.next(); this.next();
        cols.push({ tipo: 'estrella', tabla });
      } else {
        const ref = this.ref();
        cols.push({ tipo: 'col', ref, alias: this.aliasOpcional() });
      }
    } while (this.sim(','));

    this.esperaKw('from', ' tras la lista de columnas');
    const tabla = this.ident('el nombre de una tabla');
    const alias = this.aliasOpcional() ?? tabla;

    const joins: Union[] = [];
    for (;;) {
      let tipo: 'inner' | 'left' | null = null;
      if (this.kw('inner')) tipo = 'inner';
      else if (this.kw('left')) { tipo = 'left'; this.kw('outer'); }
      if (tipo === null && !this.esKw('join')) break;
      this.esperaKw('join');
      const t2 = this.ident('la tabla que se une');
      const a2 = this.aliasOpcional() ?? t2;
      this.esperaKw('on', ' tras la tabla del JOIN');
      joins.push({ tipo: tipo ?? 'inner', tabla: t2, alias: a2, on: this.or() });
    }

    const donde = this.kw('where') ? this.or() : null;

    const groupBy: RefCol[] = [];
    if (this.kw('group')) {
      this.esperaKw('by', ' tras GROUP');
      do groupBy.push(this.ref()); while (this.sim(','));
    }

    const orderBy: Orden[] = [];
    if (this.kw('order')) {
      this.esperaKw('by', ' tras ORDER');
      do {
        let o: Orden;
        if (this.esKw('count')) {
          this.next();
          this.esperaSim('('); this.esperaSim('*'); this.esperaSim(')');
          o = { count: true, desc: false };
        } else {
          o = { count: false, ref: this.ref(), desc: false };
        }
        if (this.kw('desc')) o.desc = true;
        else this.kw('asc');
        orderBy.push(o);
      } while (this.sim(','));
    }

    let limite: number | undefined;
    if (this.kw('limit')) {
      const t = this.next();
      if (t.t !== 'num' || !Number.isInteger(Number(t.v)) || Number(t.v) < 1) {
        throw new ErrorSql('LIMIT necesita un numero entero mayor que cero.');
      }
      limite = Number(t.v);
    }
    return { distinct, cols, from: { tabla, alias }, joins, donde, groupBy, orderBy, limite };
  }

  fin() {
    this.sim(';');
    if (this.peek().t !== 'fin') throw this.inesperado('No entiendo lo que sigue.');
  }
}

export function analizar(sql: string): Sentencia {
  const p = new Parser(tokenizar(sql), sql);
  const primero = p.peek();
  if (primero.t !== 'id') throw p.inesperado('Una sentencia empieza por SELECT, CREATE VIEW, DELETE...');

  switch (primero.v) {
    case 'select': {
      const sel = p.select();
      p.fin();
      return { tipo: 'select', sel };
    }
    case 'create': {
      p.next();
      p.esperaKw('view', ': solo se puede crear una VIEW');
      const nombre = p.ident('el nombre de la vista');
      p.esperaKw('as', ' tras el nombre de la vista');
      const inicio = p.peek().pos;
      const sel = p.select();
      p.fin();
      return { tipo: 'crear_vista', nombre, sel, sql: sql.slice(inicio).trim().replace(/;+\s*$/, '') };
    }
    case 'drop': {
      p.next();
      if (p.kw('view')) {
        const nombre = p.ident('el nombre de la vista');
        p.fin();
        return { tipo: 'borrar_vista', nombre };
      }
      if (p.kw('trigger')) {
        const nombre = p.ident('el nombre del trigger');
        p.fin();
        return { tipo: 'drop_trigger', nombre };
      }
      throw p.inesperado('Tras DROP va VIEW o TRIGGER.');
    }
    case 'disable': {
      p.next();
      p.esperaKw('trigger', ': solo se pueden desactivar triggers');
      const nombre = p.ident('el nombre del trigger');
      p.fin();
      return { tipo: 'disable_trigger', nombre };
    }
    case 'delete': {
      p.next();
      p.esperaKw('from', ' tras DELETE');
      const tabla = p.ident('el nombre de una tabla');
      const donde = p.kw('where') ? p.or() : null;
      p.fin();
      return { tipo: 'delete', tabla, donde };
    }
    default:
      throw new ErrorSql(`«${primero.v.toUpperCase()}» no se entiende aqui.`, [
        'Se entiende: SELECT, CREATE VIEW, DROP VIEW, DELETE FROM, DROP TRIGGER, DISABLE TRIGGER.',
      ]);
  }
}

// ---------- Ejecución ----------

type Contexto = Record<string, Fila | null>;
type Res = (r: RefCol) => { alias: string; col: string };

function sistemaTriggers(db: BD): Tabla {
  return {
    nombre: 'sistema_triggers',
    columnas: ['id', 'nombre', 'tabla', 'evento', 'accion', 'activo'],
    filas: db.triggers.map((t) => ({
      id: t.id, nombre: t.nombre, tabla: t.tabla, evento: t.evento, accion: t.accion, activo: t.activo ? 1 : 0,
    })),
  };
}

function obtenerTabla(db: BD, nombre: string): Tabla {
  if (nombre === 'sistema_triggers' && db.catalogoTriggers) return sistemaTriggers(db);
  const t = db.tablas.get(nombre);
  if (!t) {
    throw new ErrorSql(`La tabla «${nombre}» no existe en la memoria.`, [
      'Que tablas hay, y con que columnas, es cosa del diccionario de datos: lo tiene Datos.',
    ]);
  }
  return t;
}

function crearResolver(aliases: Map<string, Tabla>): Res {
  return (r) => {
    if (r.tabla) {
      const t = aliases.get(r.tabla);
      if (!t) throw new ErrorSql(`«${r.tabla}» no es ninguna tabla ni alias de esta consulta.`);
      if (!t.columnas.includes(r.col)) {
        throw new ErrorSql(`«${r.col}» no es una columna de ${t.nombre}.`, [
          'Las columnas de cada tabla estan en el diccionario, que tiene Datos.',
        ]);
      }
      return { alias: r.tabla, col: r.col };
    }
    const hits = [...aliases.entries()].filter(([, t]) => t.columnas.includes(r.col));
    if (hits.length === 0) {
      throw new ErrorSql(`«${r.col}» no es ninguna columna de las tablas de esta consulta.`, [
        'Si la columna es de otra tabla, hay que unirla con JOIN. Las columnas las tiene Datos.',
      ]);
    }
    if (hits.length > 1) {
      throw new ErrorSql(`«${r.col}» es ambigua: esta en ${hits.map(([a]) => a).join(' y ')}.`, [
        'Escribe alias.columna (o tabla.columna) para decir de cual hablas.',
      ]);
    }
    return { alias: hits[0][0], col: r.col };
  };
}

function comparar(a: Valor, b: Valor, op: string): boolean {
  if (a === null || b === null) return false;
  let x: string | number = a;
  let y: string | number = b;
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) { x = na; y = nb; } else { x = String(a); y = String(b); }
  }
  switch (op) {
    case '=': return x === y;
    case '!=': return x !== y;
    case '<': return x < y;
    case '>': return x > y;
    case '<=': return x <= y;
    case '>=': return x >= y;
    default: return false;
  }
}

const cacheRegex = new Map<string, RegExp>();
function regexDeLike(patron: string): RegExp {
  let r = cacheRegex.get(patron);
  if (!r) {
    r = new RegExp(
      '^' + patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$',
      's',
    );
    cacheRegex.set(patron, r);
  }
  return r;
}

function compilarOperando(o: Operando, res: Res): (c: Contexto) => Valor {
  if (o.t === 'lit') { const v = o.v; return () => v; }
  const { alias, col } = res(o);
  return (c) => c[alias]?.[col] ?? null;
}

function compilarExpr(e: Expr, res: Res): (c: Contexto) => boolean {
  switch (e.k) {
    case 'and': { const a = compilarExpr(e.a, res); const b = compilarExpr(e.b, res); return (c) => a(c) && b(c); }
    case 'or': { const a = compilarExpr(e.a, res); const b = compilarExpr(e.b, res); return (c) => a(c) || b(c); }
    case 'not': { const x = compilarExpr(e.e, res); return (c) => !x(c); }
    case 'null': { const o = compilarOperando(e.izq, res); return (c) => (o(c) === null) !== e.neg; }
    case 'cmp': {
      const a = compilarOperando(e.izq, res);
      const b = compilarOperando(e.der, res);
      return (c) => comparar(a(c), b(c), e.op);
    }
    case 'like': {
      const o = compilarOperando(e.izq, res);
      const p = compilarOperando(e.patron, res);
      return (c) => {
        const v = o(c);
        const pat = p(c);
        if (v === null || pat === null) return false;
        return regexDeLike(String(pat)).test(String(v)) !== e.neg;
      };
    }
    case 'in': {
      const o = compilarOperando(e.izq, res);
      const lista = e.lista.map((x) => compilarOperando(x, res));
      return (c) => {
        const v = o(c);
        if (v === null) return false;
        return lista.some((f) => comparar(v, f(c), '=')) !== e.neg;
      };
    }
  }
}

export type ResultadoSelect = {
  columnas: string[];
  filas: Valor[][];
  /** Filas que cumplen la consulta, antes de aplicar LIMIT. */
  total: number;
  agregada: boolean;
  /** Por cada fila devuelta, la fila de la tabla del FROM (null si agrupada). */
  base: (Fila | null)[];
  desde: string;
};

const TOPE_UNION = 250_000;

const cmpValor = (a: Valor, b: Valor): number => {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : 1;
};

export function ejecutarSelect(sel: Select, db: BD): ResultadoSelect {
  const aliases = new Map<string, Tabla>();
  const anadir = (tabla: string, alias: string) => {
    if (aliases.has(alias)) {
      throw new ErrorSql(`El alias «${alias}» esta repetido.`, [
        'Si unes una tabla consigo misma, ponle a cada copia un alias distinto.',
      ]);
    }
    aliases.set(alias, obtenerTabla(db, tabla));
  };

  anadir(sel.from.tabla, sel.from.alias);
  const alFrom = sel.from.alias;
  let ctxs: Contexto[] = aliases.get(alFrom)!.filas.map((f) => ({ [alFrom]: f }));

  for (const j of sel.joins) {
    anadir(j.tabla, j.alias);
    const res = crearResolver(aliases);
    const tj = aliases.get(j.alias)!;
    const on = j.on;

    // Camino rápido: igualdad entre una columna de la tabla nueva y una de
    // las anteriores. Es el 99 % de los JOIN y evita 2400 x 2400.
    let colDer: string | null = null;
    let izq: { alias: string; col: string } | null = null;
    if (on.k === 'cmp' && on.op === '=' && on.izq.t === 'col' && on.der.t === 'col') {
      const a = res(on.izq);
      const b = res(on.der);
      if (a.alias === j.alias && b.alias !== j.alias) { colDer = a.col; izq = b; }
      else if (b.alias === j.alias && a.alias !== j.alias) { colDer = b.col; izq = a; }
    }

    const nuevos: Contexto[] = [];
    if (colDer !== null && izq !== null) {
      const idx = new Map<string, Fila[]>();
      for (const f of tj.filas) {
        const v = f[colDer];
        if (v === null || v === undefined) continue;
        const k = String(v);
        const l = idx.get(k);
        if (l) l.push(f); else idx.set(k, [f]);
      }
      for (const c of ctxs) {
        const v = c[izq.alias]?.[izq.col] ?? null;
        const hits = v === null ? undefined : idx.get(String(v));
        if (hits && hits.length) for (const h of hits) nuevos.push({ ...c, [j.alias]: h });
        else if (j.tipo === 'left') nuevos.push({ ...c, [j.alias]: null });
      }
    } else {
      const f = compilarExpr(on, res);
      for (const c of ctxs) {
        let hubo = false;
        for (const fila of tj.filas) {
          const cc = { ...c, [j.alias]: fila };
          if (f(cc)) { nuevos.push(cc); hubo = true; }
        }
        if (!hubo && j.tipo === 'left') nuevos.push({ ...c, [j.alias]: null });
      }
    }
    if (nuevos.length > TOPE_UNION) {
      throw new ErrorSql('El JOIN produce demasiadas filas: casi seguro falta la condicion ON correcta.');
    }
    ctxs = nuevos;
  }

  const res = crearResolver(aliases);
  if (sel.donde) ctxs = ctxs.filter(compilarExpr(sel.donde, res));

  const multi = aliases.size > 1;
  type Salida = { nombre: string; leer: (c: Contexto) => Valor; esCount: boolean; clave?: string };
  const salidas: Salida[] = [];
  const agregada = sel.cols.some((c) => c.tipo === 'count') || sel.groupBy.length > 0;

  for (const it of sel.cols) {
    if (it.tipo === 'estrella') {
      if (agregada) throw new ErrorSql('No se puede usar * junto con COUNT(*) o GROUP BY.');
      const als = it.tabla ? [it.tabla] : [...aliases.keys()];
      for (const a of als) {
        const t = aliases.get(a);
        if (!t) throw new ErrorSql(`«${a}» no es ninguna tabla ni alias de esta consulta.`);
        for (const col of t.columnas) {
          salidas.push({ nombre: multi ? `${a}.${col}` : col, leer: (c) => c[a]?.[col] ?? null, esCount: false });
        }
      }
    } else if (it.tipo === 'count') {
      salidas.push({ nombre: it.alias ?? 'count', leer: () => null, esCount: true });
    } else {
      const r = res(it.ref);
      salidas.push({
        nombre: it.alias ?? it.ref.col,
        leer: (c) => c[r.alias]?.[r.col] ?? null,
        esCount: false,
        clave: `${r.alias}.${r.col}`,
      });
    }
  }

  let filasOut: { out: Valor[]; ctx: Contexto }[];
  const clavesGrupo = sel.groupBy.map((g) => { const r = res(g); return `${r.alias}.${r.col}`; });
  if (agregada) {
    for (const s of salidas) {
      if (!s.esCount && !clavesGrupo.includes(s.clave!)) {
        throw new ErrorSql(`«${s.nombre}» tiene que estar en GROUP BY, o ir dentro de COUNT(*).`);
      }
    }
    const lect = sel.groupBy.map((g) => {
      const r = res(g);
      return (c: Contexto) => c[r.alias]?.[r.col] ?? null;
    });
    const grupos = new Map<string, { ctx: Contexto; n: number }>();
    for (const c of ctxs) {
      const k = JSON.stringify(lect.map((l) => l(c)));
      const g = grupos.get(k);
      if (g) g.n++; else grupos.set(k, { ctx: c, n: 1 });
    }
    if (sel.groupBy.length === 0 && grupos.size === 0) grupos.set('', { ctx: {}, n: 0 });
    filasOut = [...grupos.values()].map((g) => ({
      out: salidas.map((s) => (s.esCount ? g.n : s.leer(g.ctx))),
      ctx: g.ctx,
    }));
  } else {
    filasOut = ctxs.map((c) => ({ out: salidas.map((s) => s.leer(c)), ctx: c }));
  }

  if (sel.distinct) {
    const vistos = new Set<string>();
    filasOut = filasOut.filter((r) => {
      const k = JSON.stringify(r.out);
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  }

  if (sel.orderBy.length) {
    const claves = sel.orderBy.map((o) => {
      if (o.count) {
        const i = salidas.findIndex((s) => s.esCount);
        if (i < 0) throw new ErrorSql('ORDER BY COUNT(*) pide que COUNT(*) este en la lista de columnas.');
        return { leer: (r: { out: Valor[]; ctx: Contexto }) => r.out[i], desc: o.desc };
      }
      const ref = o.ref!;
      if (!ref.tabla) {
        const i = salidas.findIndex((s) => s.nombre === ref.col);
        if (i >= 0) return { leer: (r: { out: Valor[]; ctx: Contexto }) => r.out[i], desc: o.desc };
      }
      const rr = res(ref);
      if (agregada && !clavesGrupo.includes(`${rr.alias}.${rr.col}`)) {
        throw new ErrorSql(`No se puede ordenar por «${ref.col}»: no esta en GROUP BY.`);
      }
      return { leer: (r: { out: Valor[]; ctx: Contexto }) => r.ctx[rr.alias]?.[rr.col] ?? null, desc: o.desc };
    });
    filasOut.sort((a, b) => {
      for (const k of claves) {
        const d = cmpValor(k.leer(a), k.leer(b));
        if (d !== 0) return k.desc ? -d : d;
      }
      return 0;
    });
  }

  const total = filasOut.length;
  const cortadas = sel.limite !== undefined ? filasOut.slice(0, sel.limite) : filasOut;
  return {
    columnas: salidas.map((s) => s.nombre),
    filas: cortadas.map((r) => r.out),
    total,
    agregada,
    base: cortadas.map((r) => (agregada ? null : r.ctx[alFrom] ?? null)),
    desde: sel.from.tabla,
  };
}

// ---------- Mutaciones ----------

export type EventoTrigger = { trigger: string; texto: string; repuestas: number };
export type ResultadoMutacion = { borradas: number; eventos: EventoTrigger[]; texto: string };

export function buscarTrigger(db: BD, nombre: string): TriggerDef | undefined {
  return db.triggers.find((t) => t.nombre === nombre.toLowerCase());
}

export function aplicarMutacion(s: Sentencia, db: BD): ResultadoMutacion {
  switch (s.tipo) {
    case 'delete': {
      if (s.tabla === 'sistema_triggers') {
        throw new ErrorSql('sistema_triggers es de solo lectura: es el catalogo, no se borra de ahi.', [
          'Un trigger se quita con DROP TRIGGER <nombre>, o se apaga con DISABLE TRIGGER <nombre>.',
        ]);
      }
      const t = obtenerTabla(db, s.tabla);
      const aliases = new Map<string, Tabla>([[s.tabla, t]]);
      const f = s.donde ? compilarExpr(s.donde, crearResolver(aliases)) : null;
      const quedan: Fila[] = [];
      const fuera: Fila[] = [];
      for (const fila of t.filas) {
        if (!f || f({ [s.tabla]: fila })) fuera.push(fila); else quedan.push(fila);
      }
      t.filas = quedan;
      const eventos: EventoTrigger[] = [];
      if (fuera.length > 0) {
        for (const tr of db.triggers) {
          if (!tr.activo || tr.evento !== 'DELETE' || tr.tabla !== s.tabla) continue;
          if (tr.efecto.tipo === 'reponer') {
            const origen = db.tablas.get(tr.efecto.desde);
            if (!origen) continue;
            const porId = new Map(origen.filas.map((x) => [x.id, x]));
            const presentes = new Set(t.filas.map((x) => x.id));
            const vuelven = fuera.filter((x) => porId.has(x.id) && !presentes.has(x.id));
            for (const x of vuelven) t.filas.push({ ...porId.get(x.id)! });
            if (vuelven.length > 0) {
              eventos.push({
                trigger: tr.nombre,
                repuestas: vuelven.length,
                texto: `${tr.nombre}: repuso ${vuelven.length} fila(s) en ${s.tabla} desde ${tr.efecto.desde}`,
              });
            }
          } else if (tr.efecto.tipo === 'registrar') {
            const b = db.tablas.get('bitacora');
            if (b) {
              db.seqBitacora++;
              b.filas.push({
                id: `B-${String(db.seqBitacora).padStart(4, '0')}`,
                evento: 'borrado',
                detalle: tr.efecto.detalle,
              });
              eventos.push({
                trigger: tr.nombre,
                repuestas: 1,
                texto: `${tr.nombre}: anadio 1 fila a bitacora`,
              });
            }
          }
        }
      }
      return { borradas: fuera.length, eventos, texto: `Borradas ${fuera.length} fila(s) de ${s.tabla}.` };
    }
    case 'drop_trigger': {
      const tr = buscarTrigger(db, s.nombre);
      if (!tr) throw new ErrorSql(`No existe ningun trigger llamado «${s.nombre}».`);
      db.triggers = db.triggers.filter((x) => x !== tr);
      return { borradas: 0, eventos: [], texto: `Trigger ${tr.nombre} eliminado.` };
    }
    case 'disable_trigger': {
      const tr = buscarTrigger(db, s.nombre);
      if (!tr) throw new ErrorSql(`No existe ningun trigger llamado «${s.nombre}».`);
      tr.activo = false;
      return { borradas: 0, eventos: [], texto: `Trigger ${tr.nombre} desactivado.` };
    }
    default:
      throw new ErrorSql('Eso no modifica la base de datos.');
  }
}
