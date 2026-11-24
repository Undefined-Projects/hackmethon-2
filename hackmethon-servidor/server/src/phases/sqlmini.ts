// ============================================================
//  Mini-motor de consultas de la Fase 5 (Pseudo-SQL en español
//  natural + compatibilidad con SQL clásico).
//
//  Entiende tanto el enunciado natural en español (Versión B):
//    CONTAR fragmentos DONDE estado ES activo
//    MOSTRAR TODO DE fragmentos JUNTO CON modulos, propietarios
//      DONDE codigo TIENE FORMATO LLV-####-K7 Y tamano ES 64
//        Y estado ES activo Y tipo ES subsistema Y sistema ES nucleo
//    MOSTRAR DISTINTOS tipo DE propietarios
//    MOSTRAR nivel DE fragmentos ORDENADO POR nivel DESCENDENTE LIMITE 5
//    BORRAR TODO DE fragmentos   /   VACIAR fragmentos
//    APAGAR REGLA trg_latido     /   BORRAR REGLA trg_restaurar_frag
//
//  como variantes tolerantes (con o sin palabras de unión DE, EN, CON,
//  A, QUE, POR) y SQL clásico (SELECT, JOIN, WHERE, GROUP BY, etc.).
//
//  Los nombres de tablas, columnas y palabras clave no distinguen
//  mayúsculas; los VALORES comparados sí: la fase se apoya en que 'K7'
//  y 'k7' son cosas distintas.
// ============================================================

export type Valor = string | number | null;
export type Fila = Record<string, Valor>;
export type Tabla = { nombre: string; columnas: string[]; filas: Fila[] };

// ---------- Triggers / Reglas ----------

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

// ---------- Normalización ligera de acentos en identificadores ----------

function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ---------- Tokens ----------
//
// Guardamos tanto `v` (en minúsculas y sin acentos, para comparar palabras
// clave y columnas) como `raw` (con sus mayúsculas originales, para que un
// valor sin comillas como `LLV-####-K7` o `Llave_maestra` conserve sus
// mayúsculas exactas).

type Tok = {
  t: 'str' | 'num' | 'id' | 'sym' | 'fin';
  v: string;
  raw: string;
  pos: number;
};

const SIMBOLOS2 = ['<=', '>=', '<>', '!='];
const SIMBOLOS1 = '=<>(),*.;:';

function tokenizar(sql: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      const q = c;
      let j = i + 1;
      let s = '';
      for (;;) {
        if (j >= sql.length) throw new ErrorSql('Falta cerrar una comilla en un texto.');
        if (sql[j] === q) {
          if (sql[j + 1] === q) { s += q; j += 2; continue; }
          break;
        }
        s += sql[j];
        j++;
      }
      out.push({ t: 'str', v: s, raw: s, pos: i });
      i = j + 1;
      continue;
    }
    // Palabras o patrones sin comillas: letras, números, _, -, #, %, ?
    // (Si empieza por dígito y es solo número, es 'num'; si tiene letras o guiones como 2024-01, es 'id').
    if (/[0-9]/.test(c)) {
      const mTok = /^[0-9]+(?:\.[0-9]+)?(?![A-Za-z_#?-])/.exec(sql.slice(i));
      if (mTok) {
        out.push({ t: 'num', v: mTok[0], raw: mTok[0], pos: i });
        i += mTok[0].length;
        continue;
      }
    }
    if (/[A-Za-z0-9_\u00C0-\u024F#%?-]/.test(c)) {
      const m = /^[A-Za-z0-9_\u00C0-\u024F#%?-]+/.exec(sql.slice(i))!;
      const raw = m[0];
      const v = sinAcentos(raw).toLowerCase();
      out.push({ t: 'id', v, raw, pos: i });
      i += raw.length;
      continue;
    }
    const dos = sql.slice(i, i + 2);
    if (SIMBOLOS2.includes(dos)) { out.push({ t: 'sym', v: dos, raw: dos, pos: i }); i += 2; continue; }
    if (SIMBOLOS1.includes(c)) { out.push({ t: 'sym', v: c, raw: c, pos: i }); i++; continue; }
    throw new ErrorSql(`Caracter no valido en la consulta: «${c}».`);
  }
  out.push({ t: 'fin', v: '', raw: '', pos: sql.length });
  return out;
}

// ---------- AST ----------

export type RefCol = { tabla?: string; col: string };
export type Operando = { t: 'col'; tabla?: string; col: string } | { t: 'lit'; v: Valor };

export type Expr =
  | { k: 'cmp'; izq: Operando; op: string; der: Operando }
  | { k: 'like'; izq: Operando; patron: Operando; neg: boolean; modo: 'sql' | 'formato' | 'empieza' | 'termina' | 'contiene' }
  | { k: 'in'; izq: Operando; lista: Operando[]; neg: boolean }
  | { k: 'null'; izq: Operando; neg: boolean }
  | { k: 'and' | 'or'; a: Expr; b: Expr }
  | { k: 'not'; e: Expr };

type ItemSel =
  | { tipo: 'estrella'; tabla?: string }
  | { tipo: 'col'; ref: RefCol; alias?: string }
  | { tipo: 'count'; alias?: string };

export type Union = {
  tipo: 'inner' | 'left';
  tabla: string;
  alias: string;
  /** null cuando el jugador usa `JUNTO CON modulos` y deja que el motor
   *  resuelva la relación automáticamente. */
  on: Expr | null;
};

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
  // Español
  'mostrar', 'traer', 'seleccionar', 'ver', 'buscar',
  'todo', 'todos', 'todas', 'contar', 'distinto', 'distintos', 'distintas', 'unicos', 'diferentes',
  'de', 'en', 'desde', 'tabla',
  'junto', 'con', 'unir', 'unido', 'unida', 'uniendo',
  'donde', 'cuando', 'si', 'que',
  'y', 'o', 'no',
  'es', 'son', 'igual', 'distinto', 'diferente', 'mayor', 'menor',
  'empieza', 'comienza', 'termina', 'acaba', 'contiene', 'incluye',
  'tiene', 'formato', 'parece', 'como',
  'esta', 'estan', 'vacio', 'vacia', 'nulo', 'nula',
  'agrupar', 'agrupado', 'agrupada', 'por',
  'ordenar', 'ordenado', 'ordenada', 'descendente', 'ascendente',
  'limite', 'limitar', 'primeros', 'primeras',
  'guardar', 'crear', 'vista', 'borrar', 'vaciar', 'eliminar', 'quitar', 'apagar', 'desactivar',
  'regla', 'trigger',
  // Inglés (SQL clásico)
  'select', 'from', 'where', 'join', 'inner', 'left', 'outer', 'on', 'group', 'by', 'order',
  'limit', 'and', 'or', 'not', 'like', 'in', 'is', 'null', 'as', 'distinct', 'count', 'desc',
  'asc', 'create', 'view', 'drop', 'delete', 'disable',
]);

// Palabras que empiezan una cláusula posterior a la tabla o a una condición
const FIN_CLAUSULA = new Set([
  'junto', 'unir', 'unido', 'unida', 'uniendo', 'join', 'inner', 'left',
  'donde', 'where',
  'agrupar', 'agrupado', 'agrupada', 'group',
  'ordenar', 'ordenado', 'ordenada', 'order',
  'limite', 'limitar', 'primeros', 'primeras', 'limit',
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
  esAlguno(ks: string[], n = 0): boolean { const t = this.peek(n); return t.t === 'id' && ks.includes(t.v); }
  kw(...ks: string[]): boolean { if (this.esAlguno(ks)) { this.next(); return true; } return false; }
  esSim(s: string, n = 0): boolean { const t = this.peek(n); return t.t === 'sym' && t.v === s; }
  sim(s: string): boolean { if (this.esSim(s)) { this.next(); return true; } return false; }

  /** Consume palabras puente opcionales (`DE`, `EN`, `CON`, `A`, `LA`, `EL`, `LAS`, `LOS`). */
  puente(...ks: string[]) {
    while (this.esAlguno(ks)) this.next();
  }

  esperaSim(s: string, contexto = '') {
    if (!this.sim(s)) throw this.inesperado(`Falta «${s}»${contexto}.`);
  }
  inesperado(msg: string, pistas: string[] = []): ErrorSql {
    const t = this.peek();
    const visto = t.t === 'fin' ? '(el final del comando)' : `«${t.t === 'str' ? `'${t.raw}'` : t.raw}»`;
    return new ErrorSql(`${msg} Aqui hay ${visto}.`, pistas);
  }

  ident(que: string, permitirReservada = false): string {
    const t = this.peek();
    if (t.t !== 'id' || (!permitirReservada && RESERVADAS.has(t.v))) {
      throw this.inesperado(`Se esperaba ${que}.`);
    }
    this.next();
    return t.v;
  }

  aliasOpcional(): string | undefined {
    if (this.kw('as', 'como')) return this.ident('un alias');
    const t = this.peek();
    if (t.t === 'id' && !RESERVADAS.has(t.v) && !FIN_CLAUSULA.has(t.v)) {
      this.next();
      return t.v;
    }
    return undefined;
  }

  ref(): RefCol {
    const a = this.ident('una columna');
    if (this.sim('.')) return { tabla: a, col: this.ident('el nombre de la columna', true) };
    return { col: a };
  }

  /** Lee un operando en el lado IZQUIERDO de una condición (normalmente una columna). */
  operandoIzq(): Operando {
    const t = this.peek();
    if (t.t === 'str') { this.next(); return { t: 'lit', v: t.raw }; }
    if (t.t === 'num') { this.next(); return { t: 'lit', v: Number(t.v) }; }
    if (this.esAlguno(['null', 'nulo', 'nula', 'vacio', 'vacia'])) {
      this.next();
      return { t: 'lit', v: null };
    }
    // Permitimos columnas que coincidan con palabras comunes (como 'estado', 'tipo', 'nombre')
    const a = this.ident('el nombre de una columna', true);
    if (this.sim('.')) return { t: 'col', tabla: a, col: this.ident('el nombre de la columna', true) };
    return { t: 'col', col: a };
  }

  /**
   * Lee un operando en el lado DERECHO de una condición.
   * Si es `tabla.columna`, lo trata como columna (para `ON a.id = b.id`);
   * si es una palabra suelta sin comillas (`activo`, `subsistema`, `LLV-####-K7`),
   * la trata como valor literal conservando sus mayúsculas (`t.raw`).
   */
  operandoDer(): Operando {
    const t = this.peek();
    if (t.t === 'str') { this.next(); return { t: 'lit', v: t.raw }; }
    if (t.t === 'num') { this.next(); return { t: 'lit', v: Number(t.v) }; }
    if (this.esAlguno(['null', 'nulo', 'nula', 'vacio', 'vacia'])) {
      this.next();
      return { t: 'lit', v: null };
    }
    if (t.t === 'id') {
      if (this.esSim('.', 1)) {
        const tabla = this.next().v;
        this.next(); // '.'
        const col = this.ident('el nombre de la columna', true);
        return { t: 'col', tabla, col };
      }
      this.next();
      // Si es puramente numérico, lo guardamos como número
      if (/^-?\d+(\.\d+)?$/.test(t.raw)) return { t: 'lit', v: Number(t.raw) };
      return { t: 'lit', v: t.raw };
    }
    throw this.inesperado('Falta el valor con el que comparar.');
  }

  or(): Expr {
    let a = this.and();
    while (this.kw('or', 'o')) a = { k: 'or', a, b: this.and() };
    return a;
  }
  and(): Expr {
    let a = this.not();
    while (this.kw('and', 'y')) a = { k: 'and', a, b: this.not() };
    return a;
  }
  not(): Expr {
    if (this.kw('not') || (this.esKw('no') && !this.esOperadorNo())) {
      if (this.esKw('no')) this.next();
      return { k: 'not', e: this.not() };
    }
    return this.pred();
  }

  /** ¿El `NO` actual forma parte de `NO ES`, `NO CONTIENE`, etc.? (Eso va detrás de la columna, no delante). */
  esOperadorNo(): boolean {
    return false;
  }

  pred(): Expr {
    if (this.sim('(')) {
      const e = this.or();
      this.esperaSim(')', ' para cerrar el parentesis');
      return e;
    }
    const izq = this.operandoIzq();

    // `NO ...` detrás de la columna: `estado NO ES activo`, `codigo NO EMPIEZA CON TMP`, `referencia_id NO ESTA VACIO`
    const negPrefijo = this.kw('not', 'no');

    // `ESTA VACIO` / `ES NULO` / `IS [NOT] NULL`
    if (this.kw('is', 'esta', 'estan')) {
      const neg2 = this.kw('not', 'no');
      const neg = negPrefijo !== neg2;
      if (!this.kw('null', 'nulo', 'nula', 'vacio', 'vacia')) {
        throw this.inesperado('Tras ESTA (o IS) va VACIO o NULO.');
      }
      return { k: 'null', izq, neg };
    }
    if (this.esAlguno(['vacio', 'vacia', 'nulo', 'nula', 'null'])) {
      this.next();
      return { k: 'null', izq, neg: negPrefijo };
    }

    // `ES` / `SON` -> puede ser `ES NULO/VACIO`, `ES MAYOR QUE`, `ES IGUAL A`, `ES DISTINTO DE` o `ES <valor>`
    if (this.kw('es', 'son')) {
      const neg2 = this.kw('not', 'no');
      const neg = negPrefijo !== neg2;
      if (this.kw('null', 'nulo', 'nula', 'vacio', 'vacia')) {
        return { k: 'null', izq, neg };
      }
      if (this.kw('distinto', 'diferente')) {
        this.puente('de', 'a', 'que');
        return { k: 'cmp', izq, op: neg ? '=' : '!=', der: this.operandoDer() };
      }
      if (this.kw('mayor', 'menor')) {
        const esMayor = this.toks[this.i - 1].v === 'mayor';
        const oIgual = this.kw('o') && this.kw('igual');
        this.puente('que', 'a', 'de');
        const opBase = esMayor ? (oIgual ? '>=' : '>') : (oIgual ? '<=' : '<');
        const e: Expr = { k: 'cmp', izq, op: opBase, der: this.operandoDer() };
        return neg ? { k: 'not', e } : e;
      }
      this.kw('igual');
      this.puente('a', 'que');
      return { k: 'cmp', izq, op: neg ? '!=' : '=', der: this.operandoDer() };
    }

    // `IGUAL [A] <valor>`
    if (this.kw('igual')) {
      this.puente('a', 'que');
      return { k: 'cmp', izq, op: negPrefijo ? '!=' : '=', der: this.operandoDer() };
    }

    // `DISTINTO [DE] <valor>` / `DIFERENTE [DE] <valor>`
    if (this.kw('distinto', 'diferente')) {
      this.puente('de', 'a', 'que');
      return { k: 'cmp', izq, op: negPrefijo ? '=' : '!=', der: this.operandoDer() };
    }

    // `MAYOR [O IGUAL] [QUE|A] <n>` / `MENOR [O IGUAL] [QUE|A] <n>`
    if (this.kw('mayor', 'menor')) {
      const esMayor = this.toks[this.i - 1].v === 'mayor';
      const oIgual = this.kw('o') && this.kw('igual');
      this.puente('que', 'a', 'de');
      const opBase = esMayor ? (oIgual ? '>=' : '>') : (oIgual ? '<=' : '<');
      const e: Expr = { k: 'cmp', izq, op: opBase, der: this.operandoDer() };
      return negPrefijo ? { k: 'not', e } : e;
    }

    // `EMPIEZA [CON|POR] <texto>`
    if (this.kw('empieza', 'comienza')) {
      this.puente('con', 'por');
      return { k: 'like', izq, patron: this.operandoDer(), neg: negPrefijo, modo: 'empieza' };
    }

    // `TERMINA [CON|EN] <texto>`
    if (this.kw('termina', 'acaba')) {
      this.puente('con', 'en', 'por');
      return { k: 'like', izq, patron: this.operandoDer(), neg: negPrefijo, modo: 'termina' };
    }

    // `CONTIENE <texto>` / `INCLUYE <texto>`
    if (this.kw('contiene', 'incluye')) {
      return { k: 'like', izq, patron: this.operandoDer(), neg: negPrefijo, modo: 'contiene' };
    }

    // `TIENE FORMATO <patron>` / `FORMATO <patron>` / `PARECE <patron>`
    if (this.kw('tiene')) {
      if (!this.kw('formato', 'estructura', 'forma')) {
        throw this.inesperado('Tras TIENE va FORMATO (ej. codigo TIENE FORMATO LLV-####-K7).');
      }
      return { k: 'like', izq, patron: this.operandoDer(), neg: negPrefijo, modo: 'formato' };
    }
    if (this.kw('formato', 'parece')) {
      this.puente('a', 'como');
      return { k: 'like', izq, patron: this.operandoDer(), neg: negPrefijo, modo: 'formato' };
    }

    // `COMO` / `LIKE` (acepta tanto comodines SQL % y _ como # y ?)
    if (this.kw('like', 'como')) {
      return { k: 'like', izq, patron: this.operandoDer(), neg: negPrefijo, modo: 'formato' };
    }

    // `EN (a, b, c)` / `IN (a, b, c)`
    if (this.kw('in', 'en')) {
      this.esperaSim('(', ' tras EN / IN');
      const lista: Operando[] = [this.operandoDer()];
      while (this.sim(',')) lista.push(this.operandoDer());
      this.esperaSim(')', ' para cerrar la lista');
      return { k: 'in', izq, lista, neg: negPrefijo };
    }

    if (negPrefijo) {
      throw this.inesperado('Tras NO va ES, CONTIENE, EMPIEZA CON, TERMINA CON, TIENE FORMATO o ESTA VACIO.');
    }

    const t = this.peek();
    if (t.t === 'sym' && ['=', '!=', '<>', '<', '>', '<=', '>='].includes(t.v)) {
      this.next();
      return { k: 'cmp', izq, op: t.v === '<>' ? '!=' : t.v, der: this.operandoDer() };
    }

    throw this.inesperado(
      'Falta la comparacion despues de la columna (ej. ES, NO ES, MAYOR QUE, EMPIEZA CON, TIENE FORMATO).',
      ['Escribe `consultas` para ver todos los filtros explicados con ejemplos.'],
    );
  }

  /**
   * Analiza una consulta que empieza por:
   * - `MOSTRAR` / `TRAER` / `SELECCIONAR` / `VER` / `BUSCAR` / `SELECT`
   * - `CONTAR` (atajo directo para `SELECT COUNT(*) FROM ...`)
   */
  select(): Select {
    const empiezaContar = this.kw('contar');
    let distinct = false;
    const cols: ItemSel[] = [];

    if (empiezaContar) {
      // `CONTAR [TODO] [DE|EN] <tabla> ...`
      this.kw('todo', 'todos', 'todas', 'filas', 'registros');
      this.sim('*');
      if (this.sim('(')) { this.sim('*'); this.esperaSim(')'); }
      cols.push({ tipo: 'count', alias: 'total' });
      this.puente('de', 'en', 'desde', 'from', 'la', 'tabla');
    } else {
      if (!this.kw('select', 'seleccionar', 'mostrar', 'traer', 'ver', 'buscar')) {
        throw this.inesperado('Una consulta empieza por MOSTRAR, TRAER, SELECCIONAR o CONTAR.');
      }
      distinct = this.kw('distinct', 'distinto', 'distintos', 'distintas', 'unicos', 'diferentes');

      // Si escriben directamente `MOSTRAR DE fragmentos ...`, asumimos `TODO`
      if (this.esAlguno(['de', 'en', 'desde', 'from'])) {
        cols.push({ tipo: 'estrella' });
      } else {
        do {
          if (this.sim('*') || this.kw('todo', 'todos', 'todas')) {
            cols.push({ tipo: 'estrella' });
          } else if (this.esAlguno(['count', 'contar'])) {
            this.next();
            if (this.sim('(')) {
              this.sim('*');
              this.kw('todo', 'todos');
              this.esperaSim(')');
            }
            cols.push({ tipo: 'count', alias: this.aliasOpcional() ?? 'total' });
          } else if (this.peek().t === 'id' && this.esSim('.', 1) && (this.esSim('*', 2) || this.esAlguno(['todo', 'todos'], 2))) {
            const tabla = this.ident('una tabla');
            this.next(); this.next();
            cols.push({ tipo: 'estrella', tabla });
          } else {
            const ref = this.ref();
            cols.push({ tipo: 'col', ref, alias: this.aliasOpcional() });
          }
        } while (this.sim(','));
      }

      this.puente('de', 'en', 'desde', 'from', 'la', 'tabla');
    }

    const tabla = this.ident('el nombre de una tabla');
    const alias = this.aliasOpcional() ?? tabla;

    // Uniones:
    // - `JUNTO [CON] t1 [, t2] [Y t3]`
    // - `UNIR [CON] t1 [, t2]` / `UNIDO [CON|A] t1`
    // - `[INNER|LEFT] JOIN t1 [alias] [ON ...]`
    const joins: Union[] = [];
    for (;;) {
      let tipo: 'inner' | 'left' = 'inner';
      let hayUnion = false;

      if (this.kw('junto')) {
        this.puente('con', 'a');
        hayUnion = true;
      } else if (this.kw('unir', 'unido', 'unida', 'uniendo')) {
        this.puente('con', 'a');
        hayUnion = true;
      } else if (this.kw('inner')) {
        this.kw('join', 'unir');
        hayUnion = true;
      } else if (this.kw('left')) {
        this.kw('outer');
        this.kw('join', 'unir');
        tipo = 'left';
        hayUnion = true;
      } else if (this.kw('join')) {
        hayUnion = true;
      }

      if (!hayUnion) break;

      // Puede venir una lista de tablas tras `JUNTO CON modulos, propietarios` o `JUNTO CON modulos Y propietarios`
      for (;;) {
        this.puente('con', 'a', 'tabla');
        const t2 = this.ident('la tabla que se quiere unir');
        const a2 = this.aliasOpcional() ?? t2;
        let on: Expr | null = null;
        if (this.kw('on', 'en', 'por') && !FIN_CLAUSULA.has(this.peek().v)) {
          on = this.or();
        }
        joins.push({ tipo, tabla: t2, alias: a2, on });

        if (this.sim(',')) continue;
        // `JUNTO CON modulos Y propietarios` (solo si tras `Y` no viene una condición ni otra cláusula)
        if (this.esKw('y') && !FIN_CLAUSULA.has(this.peek(1).v)) {
          this.next();
          continue;
        }
        break;
      }
    }

    // `DONDE` / `WHERE` / `CUANDO`
    let donde: Expr | null = null;
    if (this.kw('where', 'donde', 'cuando')) {
      this.puente('que');
      donde = this.or();
    }

    // `AGRUPADO POR` / `AGRUPAR POR` / `GROUP BY`
    const groupBy: RefCol[] = [];
    if (this.kw('group', 'agrupar', 'agrupado', 'agrupada')) {
      this.puente('by', 'por');
      do groupBy.push(this.ref()); while (this.sim(','));
    }

    // `ORDENADO POR` / `ORDENAR POR` / `ORDER BY`
    const orderBy: Orden[] = [];
    if (this.kw('order', 'ordenar', 'ordenado', 'ordenada')) {
      this.puente('by', 'por');
      do {
        let o: Orden;
        if (this.esAlguno(['count', 'contar'])) {
          this.next();
          if (this.sim('(')) { this.sim('*'); this.esperaSim(')'); }
          o = { count: true, desc: false };
        } else {
          o = { count: false, ref: this.ref(), desc: false };
        }
        // `DESC` / `DESCENDENTE` / `[DE] MAYOR A MENOR`
        this.puente('de');
        if (this.kw('desc', 'descendente', 'descendiente')) {
          o.desc = true;
        } else if (this.kw('asc', 'ascendente', 'ascendiente')) {
          o.desc = false;
        } else if (this.kw('mayor')) {
          this.puente('a', 'que');
          this.kw('menor');
          o.desc = true;
        } else if (this.kw('menor')) {
          this.puente('a', 'que');
          this.kw('mayor');
          o.desc = false;
        }
        orderBy.push(o);
      } while (this.sim(','));
    }

    // `LIMITE n` / `LIMITAR [A] n` / `PRIMEROS n`
    let limite: number | undefined;
    if (this.kw('limit', 'limite', 'limitar', 'primeros', 'primeras')) {
      this.puente('a');
      const t = this.next();
      if (t.t !== 'num' || !Number.isInteger(Number(t.v)) || Number(t.v) < 1) {
        throw new ErrorSql('LIMITE necesita un numero entero mayor que cero (ej. LIMITE 5).');
      }
      limite = Number(t.v);
    }

    return { distinct, cols, from: { tabla, alias }, joins, donde, groupBy, orderBy, limite };
  }

  fin() {
    this.sim(';');
    if (this.peek().t !== 'fin') throw this.inesperado('No entiendo lo que sigue en el comando.');
  }
}

export function analizar(sql: string): Sentencia {
  const p = new Parser(tokenizar(sql), sql);
  const primero = p.peek();
  if (primero.t !== 'id') {
    throw p.inesperado('Un comando empieza por MOSTRAR, CONTAR, GUARDAR, PROBAR, BORRAR o APAGAR.');
  }

  switch (primero.v) {
    case 'select':
    case 'seleccionar':
    case 'mostrar':
    case 'traer':
    case 'ver':
    case 'buscar':
    case 'contar': {
      const sel = p.select();
      p.fin();
      return { tipo: 'select', sel };
    }

    case 'create': {
      p.next();
      if (!p.kw('view', 'vista')) throw p.inesperado('Tras CREATE va VIEW.');
      const nombre = p.ident('el nombre de la vista');
      p.puente('as', 'como');
      const inicio = p.peek().pos;
      const sel = p.select();
      p.fin();
      return { tipo: 'crear_vista', nombre, sel, sql: sql.slice(inicio).trim().replace(/;+\s*$/, '') };
    }

    case 'drop': {
      p.next();
      if (p.kw('view', 'vista')) {
        const nombre = p.ident('el nombre de la vista', true);
        p.fin();
        return { tipo: 'borrar_vista', nombre };
      }
      if (p.kw('trigger', 'regla')) {
        const nombre = p.ident('el nombre de la regla o trigger', true);
        p.fin();
        return { tipo: 'drop_trigger', nombre };
      }
      throw p.inesperado('Tras DROP va VIEW o TRIGGER.');
    }

    case 'disable':
    case 'desactivar':
    case 'apagar': {
      p.next();
      p.puente('la', 'el', 'regla', 'trigger');
      const nombre = p.ident('el nombre de la regla o trigger', true);
      p.fin();
      return { tipo: 'disable_trigger', nombre };
    }

    case 'eliminar':
    case 'quitar': {
      p.next();
      if (p.kw('vista', 'view', 'guardado')) {
        const nombre = p.ident('el nombre guardado', true);
        p.fin();
        return { tipo: 'borrar_vista', nombre };
      }
      p.puente('la', 'el', 'regla', 'trigger');
      const nombre = p.ident('el nombre de la regla o trigger', true);
      p.fin();
      return { tipo: 'drop_trigger', nombre };
    }

    case 'vaciar': {
      p.next();
      p.puente('todo', 'toda', 'de', 'la', 'tabla');
      const tabla = p.ident('el nombre de una tabla');
      const donde = p.kw('where', 'donde', 'cuando') ? p.or() : null;
      p.fin();
      return { tipo: 'delete', tabla, donde };
    }

    case 'delete':
    case 'borrar': {
      p.next();
      if (p.kw('vista', 'view', 'guardado')) {
        const nombre = p.ident('el nombre guardado', true);
        p.fin();
        return { tipo: 'borrar_vista', nombre };
      }
      if (p.kw('trigger', 'regla')) {
        const nombre = p.ident('el nombre de la regla o trigger', true);
        p.fin();
        return { tipo: 'drop_trigger', nombre };
      }
      p.puente('todo', 'todos', 'todas', 'filas', 'registros', 'from', 'de', 'en', 'la', 'tabla');
      this_asterisco(p);
      p.puente('from', 'de', 'en', 'la', 'tabla');
      const tabla = p.ident('el nombre de una tabla');
      const donde = p.kw('where', 'donde', 'cuando') ? p.or() : null;
      p.fin();
      return { tipo: 'delete', tabla, donde };
    }

    default:
      throw new ErrorSql(`«${primero.raw}» no se entiende como consulta.`, [
        'Usa MOSTRAR, CONTAR, GUARDAR, PROBAR, BORRAR o APAGAR REGLA.',
        'Escribe `consultas` para ver todos los ejemplos.',
      ]);
  }
}

function this_asterisco(p: Parser) {
  p.sim('*');
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
  // `referencia` es un alias natural de `fragmentos` para cuando un fragmento
  // apunta a otro fragmento mediante `referencia_id`.
  if (nombre === 'referencia' || nombre === 'referencias') {
    const f = db.tablas.get('fragmentos');
    if (f) return f;
  }
  const t = db.tablas.get(nombre);
  if (!t) {
    throw new ErrorSql(`La tabla «${nombre}» no existe en la memoria.`, [
      'Que tablas hay, y con que columnas, es cosa del diccionario de datos: lo tiene Datos.',
    ]);
  }
  return t;
}

/**
 * Si el jugador escribió `JUNTO CON modulos` sin `ON`, deduce la relación
 * entre las tablas que ya están en la consulta y la nueva.
 */
function deducirUnion(aliases: Map<string, Tabla>, nuevoAlias: string, nuevaTabla: Tabla): Expr {
  // Caso especial: `fragmentos JUNTO CON referencia` (o segundo `fragmentos`)
  if (nuevaTabla.nombre === 'fragmentos') {
    for (const [al, t] of aliases.entries()) {
      if (al !== nuevoAlias && t.nombre === 'fragmentos' && t.columnas.includes('referencia_id')) {
        return {
          k: 'cmp',
          izq: { t: 'col', tabla: al, col: 'referencia_id' },
          op: '=',
          der: { t: 'col', tabla: nuevoAlias, col: 'id' },
        };
      }
    }
  }

  // Mapa de llave foránea conocido: modulos -> modulo_id, propietarios -> propietario_id, etiquetas -> etiqueta_id
  const fkPorTabla: Record<string, string> = {
    modulos: 'modulo_id',
    propietarios: 'propietario_id',
    etiquetas: 'etiqueta_id',
  };
  const fk = fkPorTabla[nuevaTabla.nombre];
  if (fk) {
    // Recorremos los aliases en orden INVERSO: si acaban de unir `referencia`
    // y luego unen `etiquetas`, une `etiquetas` con `referencia.etiqueta_id`.
    const entradas = [...aliases.entries()].filter(([al]) => al !== nuevoAlias).reverse();
    for (const [al, t] of entradas) {
      if (t.columnas.includes(fk)) {
        return {
          k: 'cmp',
          izq: { t: 'col', tabla: al, col: fk },
          op: '=',
          der: { t: 'col', tabla: nuevoAlias, col: 'id' },
        };
      }
    }
  }

  // Caso inverso: empezaron en `modulos` y unen `fragmentos`
  const entradas = [...aliases.entries()].filter(([al]) => al !== nuevoAlias);
  for (const [al, t] of entradas) {
    const fkInv = fkPorTabla[t.nombre];
    if (fkInv && nuevaTabla.columnas.includes(fkInv)) {
      return {
        k: 'cmp',
        izq: { t: 'col', tabla: nuevoAlias, col: fkInv },
        op: '=',
        der: { t: 'col', tabla: al, col: 'id' },
      };
    }
  }

  throw new ErrorSql(`No se como unir «${nuevaTabla.nombre}» automaticamente con las tablas de la consulta.`);
}

function crearResolver(aliases: Map<string, Tabla>, aliasPrincipal: string): Res {
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
        'Si esa columna pertenece a otra tabla, unela con `JUNTO CON <tabla>`. Las columnas las tiene Datos.',
      ]);
    }
    if (hits.length === 1) return { alias: hits[0][0], col: r.col };

    // Si hay varias tablas con la misma columna (por ejemplo `id` o `nombre` o `estado`
    // al usar `JUNTO CON`), aplicamos una regla natural para no frustrar al jugador:
    // - Si es `nombre` y solo una de las tablas NO es `fragmentos` o es la última unida (como `etiquetas`),
    //   y `fragmentos` ni siquiera tiene `nombre`, ya habría 1 hit. Si unieron `modulos` y `etiquetas`...
    // - Si la tabla principal (`FROM`) tiene esa columna (como `estado`, `tamano`, `codigo`, `nivel`),
    //   preferimos la tabla principal cuando el jugador no especificó prefijo.
    const enPrincipal = hits.find(([a]) => a === aliasPrincipal);
    if (enPrincipal && r.col !== 'nombre') {
      return { alias: enPrincipal[0], col: r.col };
    }
    throw new ErrorSql(`«${r.col}» esta en varias tablas a la vez (${hits.map(([a]) => a).join(' y ')}).`, [
      `Escribe tabla.${r.col} (por ejemplo ${hits[0][0]}.${r.col}) para indicar a cual te refieres.`,
    ]);
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
function regexDePatron(patron: string, modo: 'sql' | 'formato' | 'empieza' | 'termina' | 'contiene'): RegExp {
  const key = `${modo}:${patron}`;
  let r = cacheRegex.get(key);
  if (!r) {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let cuerpo: string;
    if (modo === 'empieza') {
      cuerpo = '^' + esc(patron);
    } else if (modo === 'termina') {
      cuerpo = esc(patron) + '$';
    } else if (modo === 'contiene') {
      cuerpo = esc(patron);
    } else {
      // 'formato' y 'sql':
      //   # -> un dígito [0-9]
      //   _ o ? -> un carácter cualquiera .
      //   % o * -> cualquier secuencia .*
      let s = '';
      for (const ch of patron) {
        if (ch === '#') s += '[0-9]';
        else if (ch === '_' || ch === '?') s += '.';
        else if (ch === '%' || ch === '*') s += '.*';
        else s += esc(ch);
      }
      cuerpo = '^' + s + '$';
    }
    r = new RegExp(cuerpo, 's');
    cacheRegex.set(key, r);
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
        return regexDePatron(String(pat), e.modo).test(String(v)) !== e.neg;
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
  const anadir = (tabla: string, aliasPref: string): string => {
    const t = obtenerTabla(db, tabla);
    let alias = aliasPref;
    // Si unen `fragmentos` consigo misma sin poner alias (o ponen `referencia`),
    // le damos un alias automático para que no choque.
    if (aliases.has(alias)) {
      if (tabla === 'fragmentos' && !aliases.has('referencia')) {
        alias = 'referencia';
      } else {
        throw new ErrorSql(`La tabla o alias «${alias}» esta repetida en la consulta.`, [
          'Si unes fragmentos consigo misma para seguir referencia_id, usa `JUNTO CON referencia`.',
        ]);
      }
    }
    aliases.set(alias, t);
    return alias;
  };

  const alFrom = anadir(sel.from.tabla, sel.from.alias);
  let ctxs: Contexto[] = aliases.get(alFrom)!.filas.map((f) => ({ [alFrom]: f }));

  for (const j of sel.joins) {
    const aliasJ = anadir(j.tabla, j.alias);
    const tj = aliases.get(aliasJ)!;
    const on = j.on ?? deducirUnion(aliases, aliasJ, tj);
    const res = crearResolver(aliases, alFrom);

    // Camino rápido por índice hash
    let colDer: string | null = null;
    let izq: { alias: string; col: string } | null = null;
    if (on.k === 'cmp' && on.op === '=' && on.izq.t === 'col' && on.der.t === 'col') {
      const a = res(on.izq);
      const b = res(on.der);
      if (a.alias === aliasJ && b.alias !== aliasJ) { colDer = a.col; izq = b; }
      else if (b.alias === aliasJ && a.alias !== aliasJ) { colDer = b.col; izq = a; }
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
        if (hits && hits.length) for (const h of hits) nuevos.push({ ...c, [aliasJ]: h });
        else if (j.tipo === 'left') nuevos.push({ ...c, [aliasJ]: null });
      }
    } else {
      const f = compilarExpr(on, res);
      for (const c of ctxs) {
        let hubo = false;
        for (const fila of tj.filas) {
          const cc = { ...c, [aliasJ]: fila };
          if (f(cc)) { nuevos.push(cc); hubo = true; }
        }
        if (!hubo && j.tipo === 'left') nuevos.push({ ...c, [aliasJ]: null });
      }
    }
    if (nuevos.length > TOPE_UNION) {
      throw new ErrorSql('La union produce demasiadas filas.');
    }
    ctxs = nuevos;
  }

  const res = crearResolver(aliases, alFrom);
  if (sel.donde) ctxs = ctxs.filter(compilarExpr(sel.donde, res));

  const multi = aliases.size > 1;
  type Salida = { nombre: string; leer: (c: Contexto) => Valor; esCount: boolean; clave?: string; ref?: RefCol };
  const salidas: Salida[] = [];
  const tieneCount = sel.cols.some((c) => c.tipo === 'count');
  const tieneCols = sel.cols.some((c) => c.tipo === 'col');

  // Si el jugador escribe `MOSTRAR tipo, CONTAR DE propietarios` sin `AGRUPADO POR`,
  // agrupamos automáticamente por las columnas pedidas.
  const groupByEfectivo: RefCol[] = [...sel.groupBy];
  if (tieneCount && tieneCols && groupByEfectivo.length === 0) {
    for (const it of sel.cols) {
      if (it.tipo === 'col') groupByEfectivo.push(it.ref);
    }
  }
  const agregada = tieneCount || groupByEfectivo.length > 0;

  for (const it of sel.cols) {
    if (it.tipo === 'estrella') {
      if (agregada) throw new ErrorSql('No se puede usar TODO (*) junto con CONTAR o AGRUPADO POR.');
      const als = it.tabla ? [it.tabla] : [...aliases.keys()];
      for (const a of als) {
        const t = aliases.get(a);
        if (!t) throw new ErrorSql(`«${a}» no es ninguna tabla ni alias de esta consulta.`);
        for (const col of t.columnas) {
          salidas.push({
            nombre: multi && a !== alFrom ? `${a}.${col}` : col,
            leer: (c) => c[a]?.[col] ?? null,
            esCount: false,
          });
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
        ref: it.ref,
      });
    }
  }

  let filasOut: { out: Valor[]; ctx: Contexto }[];
  const clavesGrupo = groupByEfectivo.map((g) => { const r = res(g); return `${r.alias}.${r.col}`; });
  if (agregada) {
    for (const s of salidas) {
      if (!s.esCount && !clavesGrupo.includes(s.clave!)) {
        throw new ErrorSql(`«${s.nombre}» tiene que estar en AGRUPADO POR, o ir con CONTAR.`);
      }
    }
    const lect = groupByEfectivo.map((g) => {
      const r = res(g);
      return (c: Contexto) => c[r.alias]?.[r.col] ?? null;
    });
    const grupos = new Map<string, { ctx: Contexto; n: number }>();
    for (const c of ctxs) {
      const k = JSON.stringify(lect.map((l) => l(c)));
      const g = grupos.get(k);
      if (g) g.n++; else grupos.set(k, { ctx: c, n: 1 });
    }
    if (groupByEfectivo.length === 0 && grupos.size === 0) grupos.set('', { ctx: {}, n: 0 });
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
        if (i < 0) throw new ErrorSql('Para ordenar por CONTAR, incluye CONTAR en las columnas mostradas.');
        return { leer: (r: { out: Valor[]; ctx: Contexto }) => r.out[i], desc: o.desc };
      }
      const ref = o.ref!;
      if (!ref.tabla) {
        const i = salidas.findIndex((s) => s.nombre === ref.col);
        if (i >= 0) return { leer: (r: { out: Valor[]; ctx: Contexto }) => r.out[i], desc: o.desc };
      }
      const rr = res(ref);
      if (agregada && !clavesGrupo.includes(`${rr.alias}.${rr.col}`)) {
        throw new ErrorSql(`No se puede ordenar por «${ref.col}»: no esta en las columnas agrupadas.`);
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
  const limpio = sinAcentos(nombre).toLowerCase();
  return db.triggers.find((t) => t.nombre === limpio || t.id.toLowerCase() === limpio);
}

export function aplicarMutacion(s: Sentencia, db: BD): ResultadoMutacion {
  switch (s.tipo) {
    case 'delete': {
      if (s.tabla === 'sistema_triggers') {
        throw new ErrorSql('sistema_triggers es de solo lectura: es el catalogo de reglas, no se borra con BORRAR DE.', [
          'Una regla se apaga con `APAGAR REGLA <nombre>` o se quita con `BORRAR REGLA <nombre>`.',
        ]);
      }
      const t = obtenerTabla(db, s.tabla);
      const aliases = new Map<string, Tabla>([[s.tabla, t]]);
      const f = s.donde ? compilarExpr(s.donde, crearResolver(aliases, s.tabla)) : null;
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
      if (!tr) throw new ErrorSql(`No existe ninguna regla o trigger llamada «${s.nombre}».`);
      db.triggers = db.triggers.filter((x) => x !== tr);
      return { borradas: 0, eventos: [], texto: `Regla ${tr.nombre} eliminada.` };
    }
    case 'disable_trigger': {
      const tr = buscarTrigger(db, s.nombre);
      if (!tr) throw new ErrorSql(`No existe ninguna regla o trigger llamada «${s.nombre}».`);
      tr.activo = false;
      return { borradas: 0, eventos: [], texto: `Regla ${tr.nombre} desactivada.` };
    }
    default:
      throw new ErrorSql('Eso no modifica la base de datos.');
  }
}
