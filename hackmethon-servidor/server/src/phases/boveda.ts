// ============================================================
//  FASE 5 — La Memoria del Robot   ·   BASES DE DATOS (Pseudo-SQL)
//
//  Ya estáis dentro de su sistema, pero no dentro de ÉL. Para llegar a
//  su conciencia hace falta la llave con la que lo construyeron, y el
//  robot la partió en tres y la escondió entre dos mil cuatrocientos
//  documentos. Después, para destruirlo, hay que vaciar esa memoria
//  entera... y él tiene copias.
//
//  DOS PARTES, MISMA TERMINAL (Pseudo-SQL natural en español)
//    PARTE 1 · «Encontrar las tres llaves»
//      En Datos están las 4 tablas reales de la memoria (sin tablas de
//      pistas artificiales) y una PANTALLA DE FILTRO EN VIVO (paginada)
//      que muestra los registros y columnas que van quedando tras cada
//      filtro o JOIN (`JUNTO CON` / `DONDE`) que aplica Terminal.
//      Cada equipo tiene su propia semilla: cambian el prefijo, los
//      números, la terminación y el tamaño de la llave.
//    PARTE 2 · «Borrar la memoria»
//      Se conservan las 4 tablas originales (con las mismas filas y
//      llaves de la Parte 1) y se SUMAN las tablas de respaldo y la
//      bitácora (8 tablas en Datos). Además, hay reglas automáticas en
//      `sistema_triggers` (visibles en Pantalla) donde unos triggers
//      protegen a otros triggers en cadena.
//
//  EL REPARTO EQUILIBRADO (33% / 33% / 33%)
//    DATOS     el mapa relacional de las tablas de memoria y el ÚNICO
//              que ve los registros y columnas en la Pantalla de Filtro
//              en Vivo (con paginación).
//    PANTALLA  las cámaras (ARCHIVO / LLAVERO / MEMORIA / RESPALDOS),
//              las pistas de las 3 cerraduras (`estado`), el manual
//              (`consultas`) y, en Parte 2, el catálogo `sistema_triggers`
//              y las alertas de reglas disparadas o bloqueadas.
//    TERMINAL  escribe consultas, filtros, guardados y borrados a ciegas.
// ============================================================

import type { Role } from '../lib/constants.js';
import type { ContextoComando, ModuloFase, ResultadoComando } from './types.js';
import {
  ANCHO_CAMARA, AYUDA_CAMARAS, circuitoCerrado, lienzo, mandoDeCamaras, numero, tira,
  type CamaraDef, type Escena, type Rotulo,
} from './comun.js';
import {
  cuarentenaActiva, error, exito, listaDe, normalizar, rechazo, tabla, texto,
} from './comun.js';
import {
  ErrorSql, aplicarMutacion, analizar, buscarTrigger, clonarBD, ejecutarSelect,
  type BD, type Fila, type Sentencia, type Tabla, type TriggerDef, type Valor,
} from './sqlmini.js';

// ---------- Aleatorio con semilla por equipo ----------

export const SEMILLA_BASE = 20260915;

function generador(semilla: number) {
  let s = Math.abs(Math.trunc(semilla) || SEMILLA_BASE) % 2147483647;
  if (s === 0) s = SEMILLA_BASE;
  return (n: number) => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return Math.floor(s / 65536) % n;
  };
}
const nn = (n: number, w: number) => String(n).padStart(w, '0');

// ============================================================
//  Construcción del mundo (Parte 1 y Parte 2) por semilla
// ============================================================

const N_FRAG = 1800;
const SISTEMAS = ['nucleo', 'red', 'energia', 'sensores', 'memoria'];
const PREFIJOS_LLAVE = ['LLV', 'CLV', 'KRN', 'ACC', 'NUC', 'SIG'];
const SUFIJOS_LLAVE = ['K7', 'X9', 'M4', 'R8', 'Z3', 'V6'];
const TAMANOS_LLAVE = [64, 96, 128, 48, 72, 84];

export const DATOS2 = [
  'fragmentos', 'modulos', 'propietarios', 'etiquetas',
  'respaldo_fragmentos', 'respaldo_modulos', 'respaldo_propietarios', 'bitacora',
];

type Spec = {
  codigo: string; tamano: number; estado: string; propietario_id: string;
  modulo_id: string; etiqueta_id: string; nivel: number; referencia_id: string | null;
};

export type MundoFase5 = {
  semilla: number;
  prefijo: string;
  sufijo: string;
  tamanoLlave: number;
  patronFormato: string;
  soluciones: [string, string, string];
  bd1: BD;
  claves: [string, string, string];
  idMolde: string;
  bd2Base: BD;
  total2: number;
};

export function solucionesPara(prefijo: string, sufijo: string, tamano: number): [string, string, string] {
  const pat = `${prefijo}-####-${sufijo}`;
  return [
    `MOSTRAR TODO DE fragmentos JUNTO CON modulos, propietarios `
    + `DONDE codigo TIENE FORMATO ${pat} Y tamano ES ${tamano} Y estado ES activo `
    + `Y tipo ES conciencia Y sistema ES nucleo`,
    `MOSTRAR TODO DE fragmentos JUNTO CON modulos, etiquetas `
    + `DONDE codigo TIENE FORMATO ${pat} Y tamano ES ${tamano} Y nivel ES 9 `
    + `Y categoria ES seguridad Y enlace ES externo`,
    `MOSTRAR TODO DE fragmentos JUNTO CON referencia, etiquetas `
    + `DONDE codigo TIENE FORMATO ${pat} Y tamano ES ${tamano} Y estado ES archivado `
    + `Y etiquetas.nombre ES llave_maestra`,
  ];
}

function elegirRasgosSemilla(semilla: number) {
  if (semilla === SEMILLA_BASE) {
    return { prefijo: 'LLV', sufijo: 'K7', tamanoLlave: 64 };
  }
  const az = generador(semilla ^ 0x5f3759df);
  return {
    prefijo: PREFIJOS_LLAVE[az(PREFIJOS_LLAVE.length)],
    sufijo: SUFIJOS_LLAVE[az(SUFIJOS_LLAVE.length)],
    tamanoLlave: TAMANOS_LLAVE[az(TAMANOS_LLAVE.length)],
  };
}

export const contarFilas = (db: BD) =>
  DATOS2.reduce((n, t) => n + (db.tablas.get(t)?.filas.length ?? 0), 0);

function construirMundoPorSemilla(semilla: number): MundoFase5 {
  const az = generador(semilla);
  const { prefijo, sufijo, tamanoLlave } = elegirRasgosSemilla(semilla);
  const patronFormato = `${prefijo}-####-${sufijo}`;
  const soluciones = solucionesPara(prefijo, sufijo, tamanoLlave);

  const pick = <T>(a: T[]): T => a[az(a.length)];
  const mezclar = <T>(a: T[]): T[] => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = az(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // --- modulos (120)
  const modulos: Fila[] = [];
  for (let i = 1; i <= 120; i++) {
    let sistema = SISTEMAS[az(5)];
    let enlace = az(5) === 0 ? 'externo' : 'interno';
    if (i === 1) { sistema = 'nucleo'; enlace = 'interno'; }
    if (i === 2) { sistema = 'nucleo'; enlace = 'externo'; }
    if (i === 3) { sistema = 'red'; enlace = 'externo'; }
    if (i === 4) { sistema = 'energia'; enlace = 'interno'; }
    modulos.push({ id: `M-${nn(i, 3)}`, nombre: `mod_${sistema}_${nn(i, 3)}`, sistema, enlace });
  }

  // --- propietarios (180): roles realistas de sistema/empresa
  const DEPTOS_EMP = ['finanzas', 'soporte', 'redes', 'almacen', 'operaciones', 'recursos'];
  const tipos = mezclar([
    ...Array<string>(12).fill('admin'),
    ...Array<string>(45).fill('conciencia'),
    ...Array<string>(123).fill('usuario'),
  ]);
  const propietarios: Fila[] = tipos.map((tipo, i) => {
    const depto = DEPTOS_EMP[i % DEPTOS_EMP.length];
    return {
      id: `P-${nn(i + 1, 3)}`,
      nombre: tipo === 'conciencia'
        ? `ia_nucleo_${nn(i + 1, 3)}`
        : tipo === 'admin'
          ? `admin_${depto}_${nn(i + 1, 3)}`
          : `usr_${depto}_${nn(i + 1, 3)}`,
      tipo,
    };
  });

  // --- etiquetas (300). Las seis primeras son las que se parecen entre sí.
  const BASES = ['acceso', 'respaldo', 'diagnostico', 'telemetria', 'energia', 'red', 'sensor', 'registro', 'calibracion', 'arranque'];
  const CATS = ['seguridad', 'operacion', 'historial'];
  const ESPECIALES: [string, string][] = [
    ['llave_maestra', 'seguridad'],
    ['llave-maestra', 'operacion'],
    ['llave_maestra_v0', 'historial'],
    ['llave_maestro', 'seguridad'],
    ['llaves_maestras', 'operacion'],
    ['Llave_maestra', 'historial'],
  ];
  const etiquetas: Fila[] = [];
  for (let i = 1; i <= 300; i++) {
    const [nombre, categoria] = i <= 6 ? ESPECIALES[i - 1] : [`${pick(BASES)}_${nn(i, 3)}`, pick(CATS)];
    etiquetas.push({ id: `E-${nn(i, 3)}`, nombre, categoria });
  }

  const modNucleo = modulos.filter((m) => m.sistema === 'nucleo');
  const modOtroExt = modulos.filter((m) => m.sistema !== 'nucleo' && m.enlace === 'externo');
  const modOtroInt = modulos.filter((m) => m.sistema !== 'nucleo' && m.enlace === 'interno');
  const modInterno = modulos.filter((m) => m.enlace === 'interno');
  const propSub = propietarios.filter((p) => p.tipo === 'conciencia');
  const propRobot = propietarios.filter((p) => p.tipo === 'admin');
  const propHum = propietarios.filter((p) => p.tipo === 'usuario');
  const etq = etiquetas.slice(6);
  const etqSeg = etq.filter((e) => e.categoria === 'seguridad');
  const etqOp = etq.filter((e) => e.categoria === 'operacion');
  const etqHist = etq.filter((e) => e.categoria === 'historial');

  // --- fragmentos (1800): el ruido de fondo
  const PREF_RUIDO = ['DAT', 'LOG', 'CFG', 'TMP', 'SYS', 'MEM'];
  const LET = 'ABCDEFGHIJ';
  const ESTADOS = ['activo', 'activo', 'activo', 'activo', 'activo', 'activo', 'archivado', 'archivado', 'corrupto', 'corrupto'];
  const frags: Fila[] = [];
  for (let i = 1; i <= N_FRAG; i++) {
    frags.push({
      id: `F-${nn(i, 4)}`,
      codigo: `${pick(PREF_RUIDO)}-${nn(az(10000), 4)}-${LET[az(10)]}${az(10)}`,
      modulo_id: pick(modulos).id,
      propietario_id: pick(propietarios).id,
      etiqueta_id: etq[az(etq.length)].id,
      referencia_id: null,
      estado: ESTADOS[az(10)],
      nivel: 1 + az(8),
      tamano: 8 + az(500),
    });
  }

  // Reservados: el fragmento molde (`llave_maestra`) y sus señuelos van
  // después de la fila 600 para que nunca aparezcan en las primeras páginas
  // sin haber aplicado ningún filtro.
  const iMaestra = 688;
  const iSimil = [740, 841, 942, 1043, 1144];
  frags[iMaestra].etiqueta_id = 'E-001';
  frags[iMaestra].codigo = `${prefijo}-0000-${sufijo}`;
  frags[iMaestra].tamano = tamanoLlave;
  frags[iMaestra].estado = 'corrupto';
  iSimil.forEach((idx, k) => { frags[idx].etiqueta_id = `E-${nn(k + 2, 3)}`; });

  const reservados = new Set([iMaestra, ...iSimil]);
  const idsReservados = new Set([...reservados].map((i) => frags[i].id as string));
  for (const f of frags) {
    if (az(2) === 0) {
      const objetivo = frags[az(N_FRAG)].id as string;
      f.referencia_id = idsReservados.has(objetivo) ? null : objetivo;
    }
  }

  // Todas las llaves y señuelos se plantan a partir de la fila 350 (fuera de
  // las primeras páginas de la tabla cruda).
  const libres = mezclar(
    Array.from({ length: N_FRAG }, (_, i) => i).filter((i) => i >= 350 && !reservados.has(i)),
  );
  const usados = new Set<string>([`${prefijo}-0000-${sufijo}`]);
  const codigoLlave = () => {
    for (;;) {
      const c = `${prefijo}-${nn(1000 + az(9000), 4)}-${sufijo}`;
      if (!usados.has(c)) { usados.add(c); return c; }
    }
  };
  const plantar = (s: Spec): string => {
    const idx = libres.pop()!;
    Object.assign(frags[idx], s);
    return frags[idx].id as string;
  };

  // Las tres llaves.
  const specA: Spec = {
    codigo: codigoLlave(), tamano: tamanoLlave, estado: 'activo',
    propietario_id: propSub[0].id as string, modulo_id: modNucleo[0].id as string,
    etiqueta_id: etqOp[0].id as string, nivel: 4, referencia_id: null,
  };
  const specB: Spec = {
    codigo: codigoLlave(), tamano: tamanoLlave, estado: 'activo',
    propietario_id: propHum[0].id as string, modulo_id: modOtroExt[0].id as string,
    etiqueta_id: etqSeg[0].id as string, nivel: 9, referencia_id: null,
  };
  const specC: Spec = {
    codigo: codigoLlave(), tamano: tamanoLlave, estado: 'archivado',
    propietario_id: propHum[1].id as string, modulo_id: modOtroInt[0].id as string,
    etiqueta_id: etqOp[1].id as string, nivel: 3, referencia_id: frags[iMaestra].id as string,
  };
  const claves: [string, string, string] = [plantar(specA), plantar(specB), plantar(specC)];

  // Prefijo y sufijo trampa derivados de los reales de este equipo
  const prefijoFalso = prefijo.slice(0, 2) + (prefijo[2] === 'U' ? 'V' : 'U');
  const sufijoFalso = sufijo[0] + (sufijo[1] === '9' ? '1' : '9');
  const sufijoMinusc = sufijo.toLowerCase();

  const variantesFormato = (base: Spec): Partial<Spec>[] => {
    const m = new RegExp(`${prefijo}-(\\d{4})-${sufijo}`).exec(base.codigo);
    const d = m ? m[1] : '1234';
    return [
      { codigo: `${prefijoFalso}-${d}-${sufijo}` },
      { codigo: `${prefijo}-${d}-${sufijoFalso}` },
      { codigo: `${prefijo}-${d.slice(1)}-${sufijo}` },
      { codigo: `${prefijo}-${d}-${sufijoMinusc}` },
      { tamano: tamanoLlave - 1 },
      { tamano: tamanoLlave + 1 },
    ];
  };

  const cambios: Partial<Spec>[][] = [
    [
      ...variantesFormato(specA),
      { estado: 'archivado' }, { estado: 'corrupto' },
      { propietario_id: propRobot[0].id as string }, { propietario_id: propHum[2].id as string },
      { modulo_id: modulos.find((m) => m.sistema === 'red')!.id as string },
      { modulo_id: modulos.find((m) => m.sistema === 'energia')!.id as string },
    ],
    [
      ...variantesFormato(specB),
      { nivel: 8 }, { nivel: 5 },
      { etiqueta_id: etqOp[2].id as string }, { etiqueta_id: etqHist[0].id as string },
      { modulo_id: modInterno[0].id as string }, { modulo_id: modInterno[1].id as string },
    ],
    [
      ...variantesFormato(specC),
      { estado: 'activo' }, { estado: 'corrupto' },
      ...iSimil.map((i) => ({ referencia_id: frags[i].id as string })),
      { referencia_id: null }, { referencia_id: frags[300].id as string },
    ],
  ];
  [specA, specB, specC].forEach((base, k) => {
    for (const c of cambios[k]) {
      plantar({ ...base, codigo: c.codigo ? c.codigo : codigoLlave(), ...c });
    }
  });

  // Relleno que imita: formatos casi llave con atributos al azar.
  for (let k = 0; k < 45; k++) {
    const d = nn(1000 + az(9000), 4);
    const cod = [
      `${prefijo}-${d}-${sufijo}`,
      `${prefijo}-${d}-${sufijo}`,
      `${prefijoFalso}-${d}-${sufijo}`,
      `${prefijo}-${d}-${sufijoFalso}`,
      `${prefijo[0]}1${prefijo[2]}-${d}-${sufijo}`,
    ][az(5)];
    const idx = libres.pop()!;
    frags[idx].codigo = cod;
    if (az(2) === 0) frags[idx].tamano = tamanoLlave;
  }

  const colF = ['id', 'codigo', 'modulo_id', 'propietario_id', 'etiqueta_id', 'referencia_id', 'estado', 'nivel', 'tamano'];
  const colM = ['id', 'nombre', 'sistema', 'enlace'];
  const colP = ['id', 'nombre', 'tipo'];
  const colE = ['id', 'nombre', 'categoria'];

  const bd1: BD = {
    tablas: new Map([
      ['fragmentos', { nombre: 'fragmentos', columnas: colF, filas: frags }],
      ['modulos', { nombre: 'modulos', columnas: colM, filas: modulos }],
      ['propietarios', { nombre: 'propietarios', columnas: colP, filas: propietarios }],
      ['etiquetas', { nombre: 'etiquetas', columnas: colE, filas: etiquetas }],
    ]),
    triggers: [],
    catalogoTriggers: false,
    seqBitacora: 0,
  };

  // Garantizar que cada llave sea ÚNICA ejecutando sus 3 consultas de solución.
  for (let k = 0; k < 3; k++) {
    const s = analizar(soluciones[k]);
    if (s.tipo !== 'select') throw new Error('solucion no es SELECT');
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      const r = ejecutarSelect(s.sel, bd1);
      const intrusos = r.base.filter((f) => f && f.id !== claves[k]);
      if (intrusos.length === 0) break;
      for (const f of intrusos) f!.tamano = tamanoLlave - 1;
    }
  }

  // ============================================================
  //  PARTE 2 · CONSERVA las 4 tablas originales (con las mismas
  //  filas y llaves de la Parte 1) y SUMA las 4 tablas nuevas
  //  (respaldo_fragmentos, respaldo_modulos, respaldo_propietarios,
  //  bitacora) + la cadena de triggers protectores.
  // ============================================================

  const orden = Array.from({ length: frags.length }, (_, i) => i);
  for (let i = orden.length - 1; i > 0; i--) {
    const j = az(i + 1);
    [orden[i], orden[j]] = [orden[j], orden[i]];
  }
  // Nos aseguramos de que las 3 llaves también estén incluidas en las 450 copias de respaldo_fragmentos
  const indicesClaves = claves.map((id) => frags.findIndex((f) => f.id === id)).filter((i) => i >= 0);
  const setCopiados = new Set<number>(indicesClaves);
  for (const idx of orden) {
    if (setCopiados.size >= 450) break;
    setCopiados.add(idx);
  }
  const copiados = [...setCopiados].sort((a, b) => a - b).map((i) => ({ ...frags[i] }));

  const bitacora: Fila[] = Array.from({ length: 90 }, (_, i) => ({
    id: `B-${nn(i + 1, 4)}`,
    evento: pick(['arranque', 'copia', 'sincronia', 'latido']),
    detalle: `ciclo ${i + 1}`,
  }));

  const mk = (nombre: string, columnas: string[], filas: Fila[]) => [nombre, { nombre, columnas, filas }] as const;

  // Cadena de triggers:
  //   trg_vigia_maestro (TR-09)
  //     ├── protege a trg_escudo_respaldos (TR-08) y a trg_latido (TR-05)
  //   trg_escudo_respaldos (TR-08)
  //     └── protege a trg_restaurar_frag, trg_replicar_respaldo, trg_restaurar_mod, trg_restaurar_prop
  const triggers: TriggerDef[] = [
    { id: 'TR-01', nombre: 'trg_restaurar_frag', tabla: 'fragmentos', evento: 'DELETE', activo: true,
      efecto: { tipo: 'reponer', desde: 'respaldo_fragmentos' },
      accion: 'al borrar de fragmentos, vuelve a insertar las filas que tengan copia en respaldo_fragmentos (protegida por trg_escudo_respaldos)' },
    { id: 'TR-02', nombre: 'trg_replicar_respaldo', tabla: 'respaldo_fragmentos', evento: 'DELETE', activo: true,
      efecto: { tipo: 'reponer', desde: 'fragmentos' },
      accion: 'al borrar de respaldo_fragmentos, vuelve a copiar las filas que sigan en fragmentos (protegida por trg_escudo_respaldos)' },
    { id: 'TR-03', nombre: 'trg_restaurar_mod', tabla: 'modulos', evento: 'DELETE', activo: true,
      efecto: { tipo: 'reponer', desde: 'respaldo_modulos' },
      accion: 'al borrar de modulos, vuelve a insertar las filas desde respaldo_modulos (protegida por trg_escudo_respaldos)' },
    { id: 'TR-04', nombre: 'trg_restaurar_prop', tabla: 'propietarios', evento: 'DELETE', activo: true,
      efecto: { tipo: 'reponer', desde: 'respaldo_propietarios' },
      accion: 'al borrar de propietarios, vuelve a insertar las filas desde respaldo_propietarios (protegida por trg_escudo_respaldos)' },
    { id: 'TR-05', nombre: 'trg_latido', tabla: 'bitacora', evento: 'DELETE', activo: true,
      efecto: { tipo: 'registrar', detalle: 'latido' },
      accion: 'al borrar de bitacora, anade una fila nueva a bitacora (protegida por trg_vigia_maestro)' },
    { id: 'TR-06', nombre: 'trg_auditoria_etq', tabla: 'etiquetas', evento: 'DELETE', activo: true,
      efecto: { tipo: 'registrar', detalle: 'auditoria' },
      accion: 'al borrar de etiquetas, anade una fila de auditoria a bitacora' },
    { id: 'TR-07', nombre: 'trg_restaurar_frag_v0', tabla: 'fragmentos', evento: 'DELETE', activo: false,
      efecto: { tipo: 'reponer', desde: 'respaldo_fragmentos' },
      accion: 'version antigua de trg_restaurar_frag (desactivada)' },
    { id: 'TR-08', nombre: 'trg_escudo_respaldos', tabla: 'sistema_triggers', evento: 'TRIGGER', activo: true,
      efecto: {
        tipo: 'protector',
        protegeA: ['trg_restaurar_frag', 'trg_replicar_respaldo', 'trg_restaurar_mod', 'trg_restaurar_prop'],
      },
      accion: 'CUSTODIO: impide apagar o borrar trg_restaurar_frag, trg_replicar_respaldo, trg_restaurar_mod y trg_restaurar_prop (protegida por trg_vigia_maestro)' },
    { id: 'TR-09', nombre: 'trg_vigia_maestro', tabla: 'sistema_triggers', evento: 'TRIGGER', activo: true,
      efecto: {
        tipo: 'protector',
        protegeA: ['trg_escudo_respaldos', 'trg_latido'],
      },
      accion: 'VIGIA RAIZ: impide apagar o borrar trg_escudo_respaldos y trg_latido (sin protector superior)' },
    { id: 'TR-10', nombre: 'trg_sello_fecha', tabla: 'fragmentos', evento: 'INSERT', activo: true,
      efecto: { tipo: 'inocuo' },
      accion: 'al insertar en fragmentos, rellena la fecha de creacion (funcionamiento normal)' },
    { id: 'TR-11', nombre: 'trg_validar_nivel', tabla: 'modulos', evento: 'UPDATE', activo: true,
      efecto: { tipo: 'inocuo' },
      accion: 'al actualizar modulos, comprueba que el sistema sea valido (funcionamiento normal)' },
    { id: 'TR-12', nombre: 'trg_cuenta_prop', tabla: 'propietarios', evento: 'INSERT', activo: true,
      efecto: { tipo: 'inocuo' },
      accion: 'al insertar en propietarios, actualiza el contador interno de altas (funcionamiento normal)' },
  ];

  const bd2Base: BD = {
    tablas: new Map([
      mk('fragmentos', colF, frags.map((f) => ({ ...f }))),
      mk('modulos', colM, modulos.map((m) => ({ ...m }))),
      mk('propietarios', colP, propietarios.map((p) => ({ ...p }))),
      mk('etiquetas', colE, etiquetas.map((e) => ({ ...e }))),
      mk('respaldo_fragmentos', colF, copiados),
      mk('respaldo_modulos', colM, modulos.map((m) => ({ ...m }))),
      mk('respaldo_propietarios', colP, propietarios.map((p) => ({ ...p }))),
      mk('bitacora', ['id', 'evento', 'detalle'], bitacora),
    ]),
    triggers,
    catalogoTriggers: true,
    seqBitacora: bitacora.length,
  };

  return {
    semilla,
    prefijo,
    sufijo,
    tamanoLlave,
    patronFormato,
    soluciones,
    bd1,
    claves,
    idMolde: frags[iMaestra].id as string,
    bd2Base,
    total2: contarFilas(bd2Base),
  };
}

const cacheMundos = new Map<number, MundoFase5>();

export function mundoDeSemilla(semilla?: number): MundoFase5 {
  const s = typeof semilla === 'number' && Number.isFinite(semilla) && semilla > 0
    ? Math.trunc(semilla)
    : SEMILLA_BASE;
  let m = cacheMundos.get(s);
  if (!m) {
    m = construirMundoPorSemilla(s);
    cacheMundos.set(s, m);
  }
  return m;
}

export function mundoDeEstado(estado: Record<string, unknown>): MundoFase5 {
  return mundoDeSemilla(numero(estado, 'semilla') || SEMILLA_BASE);
}

const MUNDO_POR_DEFECTO = mundoDeSemilla(SEMILLA_BASE);
export const SOLUCIONES = MUNDO_POR_DEFECTO.soluciones;
const LLAVES = MUNDO_POR_DEFECTO.claves;
const TOTAL2 = MUNDO_POR_DEFECTO.total2;

export function reconstruir(log: string[], semilla?: number): BD {
  const mundo = mundoDeSemilla(semilla);
  const db = clonarBD(mundo.bd2Base);
  for (const s of log) {
    try { aplicarMutacion(analizar(s), db); } catch { /* el log solo guarda lo que ya funcionó */ }
  }
  return db;
}

/** Para las pruebas: el mundo entero, sin pasar por el socket. */
export const bovedaPrueba = {
  MUNDO1: { bd: MUNDO_POR_DEFECTO.bd1, claves: MUNDO_POR_DEFECTO.claves },
  LLAVES,
  TOTAL2,
  DATOS2,
  BASE2: MUNDO_POR_DEFECTO.bd2Base,
  reconstruir,
  contarFilas,
  mundoDeSemilla,
};

// ============================================================
//  La vista del Operador de Datos:
//  1) El mapa con las TABLAS REALES y sus relaciones (`soloEstructura: true`
//     para que el mapa muestre columnas, llaves foráneas y conteo de filas,
//     y todas las filas se consulten en equipo con Terminal).
//  2) La PANTALLA DE FILTRO EN VIVO (`resultadoFiltro`) con TODAS las filas
//     resultantes del filtro o JOIN, paginadas de 100 en 100 en el cliente.
// ============================================================

function serializarTablaMapa(t: Tabla, x: number, y: number, w: number, descripcion: string) {
  return {
    id: t.nombre,
    nombre: t.nombre,
    x,
    y,
    w,
    descripcion,
    clave: 'id',
    columnas: t.columnas,
    totalFilas: t.filas.length,
    soloEstructura: true,
    filas: [],
  };
}

function construirResultadoFiltro(estado: Record<string, unknown>, db: BD, parte: 1 | 2) {
  const sqlGuardado = typeof estado.consultaFiltro === 'string' && estado.consultaFiltro.trim()
    ? estado.consultaFiltro.trim()
    : 'MOSTRAR TODO DE fragmentos';

  try {
    const s = analizar(sqlGuardado);
    if (s.tipo !== 'select' || s.sel.from.tabla === 'sistema_triggers') {
      throw new Error('no es tabla de datos');
    }
    const r = ejecutarSelect(s.sel, db);
    const tablasUnidas = [s.sel.from.tabla, ...s.sel.joins.map((j) => j.tabla)];
    return {
      titulo: tablasUnidas.length > 1
        ? `Resultado del JOIN (${tablasUnidas.join(' + ')})`
        : `Registros de ${s.sel.from.tabla}`,
      consulta: sqlGuardado,
      tablasUnidas,
      total: r.total,
      columnas: r.columnas,
      filas: r.filas.map((fila) => fila.map((v) => (v === null ? '' : String(v)))),
      nota: parte === 1
        ? 'Cada vez que Terminal ejecuta una consulta con JUNTO CON o DONDE, esta tabla muestra todos los registros y columnas que quedaron (con paginacion).'
        : 'Muestra los registros que siguen vivos en la tabla consultada o lo que restauraron las reglas automaticas.',
    };
  } catch {
    const t = db.tablas.get('fragmentos')!;
    return {
      titulo: 'Registros de fragmentos',
      consulta: 'MOSTRAR TODO DE fragmentos',
      tablasUnidas: ['fragmentos'],
      total: t.filas.length,
      columnas: t.columnas,
      filas: t.filas.map((f) => t.columnas.map((c) => (f[c] === null || f[c] === undefined ? '' : String(f[c])))),
    };
  }
}

function proyectarDatosParte1(estado: Record<string, unknown>) {
  const mundo = mundoDeEstado(estado);
  const db = mundo.bd1;
  return {
    titulo: 'Memoria del robot · esquema relacional y pantalla de filtro',
    nota: 'Tu tienes el mapa de las 4 tablas reales de la memoria (que columnas tienen y como se unen) '
        + 'y abajo eres el UNICO que ve la PANTALLA DE FILTRO EN VIVO con los registros y columnas que '
        + 'quedan tras cada filtro o JOIN de Terminal. Pantalla tiene las pistas de las 3 cerraduras.',
    lienzo: { w: 1000, h: 460 },
    tablas: [
      serializarTablaMapa(db.tablas.get('fragmentos')!, 40, 35, 340,
        'Archivos y llaves en la memoria'),
      serializarTablaMapa(db.tablas.get('modulos')!, 620, 20, 340,
        'Modulos del sistema y su tipo de enlace'),
      serializarTablaMapa(db.tablas.get('propietarios')!, 620, 175, 340,
        'Cuentas y procesos propietarios'),
      serializarTablaMapa(db.tablas.get('etiquetas')!, 620, 320, 340,
        'Etiquetas y categorias de clasificacion'),
    ],
    relaciones: [
      { desde: 'fragmentos', campo: 'modulo_id', hasta: 'modulos' },
      { desde: 'fragmentos', campo: 'propietario_id', hasta: 'propietarios' },
      { desde: 'fragmentos', campo: 'etiqueta_id', hasta: 'etiquetas' },
    ],
    resultadoFiltro: construirResultadoFiltro(estado, db, 1),
  };
}

function proyectarDatosParte2(estado: Record<string, unknown>) {
  const mundo = mundoDeEstado(estado);
  const db = reconstruir(listaDe(estado, 'log'), mundo.semilla);

  return {
    titulo: 'Memoria del robot · las 4 tablas originales + 4 tablas de respaldo y bitacora',
    nota: 'Se conservan las 4 tablas originales con sus registros y llaves, y se han sumado las '
        + '4 tablas de respaldo y bitacora. Hay que dejar las 8 tablas en 0 filas. '
        + 'Pantalla es quien puede ver el catalogo de reglas automaticas (`sistema_triggers`) cuando Terminal lo consulte.',
    lienzo: { w: 1000, h: 540 },
    tablas: [
      serializarTablaMapa(db.tablas.get('fragmentos')!, 30, 20, 290, 'Archivos originales (con las 3 llaves)'),
      serializarTablaMapa(db.tablas.get('modulos')!, 30, 210, 290, 'Modulos originales'),
      serializarTablaMapa(db.tablas.get('propietarios')!, 30, 370, 290, 'Propietarios originales'),

      serializarTablaMapa(db.tablas.get('respaldo_fragmentos')!, 355, 20, 295, 'Copia parcial de fragmentos'),
      serializarTablaMapa(db.tablas.get('respaldo_modulos')!, 355, 210, 295, 'Copia completa de modulos'),
      serializarTablaMapa(db.tablas.get('respaldo_propietarios')!, 355, 370, 295, 'Copia completa de propietarios'),

      serializarTablaMapa(db.tablas.get('etiquetas')!, 685, 20, 285, 'Etiquetas originales (sin tabla de copia)'),
      serializarTablaMapa(db.tablas.get('bitacora')!, 685, 210, 285, 'Registro de actividad y latido'),
    ],
    relaciones: [
      { desde: 'fragmentos', campo: 'modulo_id', hasta: 'modulos' },
      { desde: 'fragmentos', campo: 'propietario_id', hasta: 'propietarios' },
      { desde: 'fragmentos', campo: 'etiqueta_id', hasta: 'etiquetas' },
      { desde: 'respaldo_fragmentos', campo: 'id', hasta: 'fragmentos' },
      { desde: 'respaldo_modulos', campo: 'id', hasta: 'modulos' },
      { desde: 'respaldo_propietarios', campo: 'id', hasta: 'propietarios' },
    ],
    resultadoFiltro: construirResultadoFiltro(estado, db, 2),
  };
}

// ============================================================
//  Cámaras
// ============================================================

const CAMARAS_1: CamaraDef[] = [
  { n: 1, id: 'archivo', nombre: 'ARCHIVO', sector: 'B-01', que: 'cuantas filas quedaron en la pantalla de Datos tras el filtro' },
  { n: 2, id: 'llavero', nombre: 'LLAVERO', sector: 'B-02', que: 'las 3 cerraduras de la conciencia y cuantas llaves van confirmadas' },
];
const CAMARAS_2: CamaraDef[] = [
  { n: 1, id: 'memoria', nombre: 'MEMORIA', sector: 'B-01', que: 'cuantas filas le quedan a la memoria' },
  { n: 2, id: 'respaldos', nombre: 'RESPALDOS', sector: 'B-02', que: 'lo que se restaura solo' },
];

const parteDe = (estado: Record<string, unknown>): 1 | 2 => (numero(estado, 'parte') === 2 ? 2 : 1);

function escenaBarra(quedan: number, total: number, f: number, pie: string, titulo: string): string[] {
  const enc = quedan <= 0
    ? 0
    : Math.max(1, Math.ceil((20 * Math.log(quedan + 1)) / Math.log(total + 1)));
  const cajon = (i: number) => (i < enc ? ((i + f) % 4 === 0 ? '[#]' : '[=]') : '[ ]');
  const decena = (d: number) =>
    tira('   ' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => cajon(d + i)).join(''), ANCHO_CAMARA);
  return lienzo([
    tira(`        [ ${titulo} ]`, ANCHO_CAMARA),
    '                                    ',
    decena(0),
    decena(10),
    '                                    ',
    tira(`   ${quedan} de ${total}`, ANCHO_CAMARA),
    '                                    ',
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira(pie, ANCHO_CAMARA),
  ]);
}

function escenaLlavero(n: number, f: number): string[] {
  const ranura = (i: number) => (i < n ? (f % 2 === 0 ? '[K]' : '[k]') : '[ ]');
  return lienzo([
    tira('          [ LLAVERO ]', ANCHO_CAMARA),
    '                                    ',
    tira(`      ${ranura(0)}     ${ranura(1)}     ${ranura(2)}`, ANCHO_CAMARA),
    tira('       1       2       3', ANCHO_CAMARA),
    '                                    ',
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
    '                                    ',
    tira(n === 3 ? '  las tres llaves estan.' : `  ${n} de 3. Faltan ${3 - n}.`, ANCHO_CAMARA),
  ]);
}

function escenaRespaldos(repuestas: number, alerta: boolean, f: number): string[] {
  const flujo = ['>>>>', '>>> ', '>>  ', '>   '][f % 4];
  const linea = (a: string, b: string) => tira(`   ${a} ${alerta ? flujo : '----'} ${b}`, ANCHO_CAMARA);
  return lienzo([
    tira('         [ RESPALDOS ]', ANCHO_CAMARA),
    '                                    ',
    linea('[principal]', '[copia]    '),
    linea('[principal]', '[copia]    '),
    linea('[principal]', '[copia]    '),
    '                                    ',
    tira(alerta ? '  [!] algo se esta restaurando' : '  quieto.', ANCHO_CAMARA),
    tira(`  ${repuestas} fila(s) repuestas hasta ahora`, ANCHO_CAMARA),
    '  ==================================',
    '  ::::::::::::::::::::::::::::::::::',
  ]);
}

function vistaDeCamaras(estado: Record<string, unknown>) {
  const parte = parteDe(estado);
  const mundo = mundoDeEstado(estado);

  if (parte === 1) {
    const bruto = estado.quedan;
    const quedan = typeof bruto === 'number' ? Math.min(bruto, N_FRAG) : N_FRAG;
    const consultas = numero(estado, 'consultas');
    const confirmadas = listaDe(estado, 'confirmadas').length;
    return circuitoCerrado(CAMARAS_1, estado, (cam) => {
      const escena: Escena = cam.id === 'archivo'
        ? {
          fotogramas: [0, 1, 2, 3].map((f) => escenaBarra(quedan, N_FRAG, f,
            quedan === 1 ? '  uno solo.' : quedan === 0 ? '  ninguna encaja. afloja algo.' : '  siguen siendo demasiadas.', 'ARCHIVO')),
          ritmo: 340,
        }
        : { fotogramas: [0, 1].map((f) => escenaLlavero(confirmadas, f)), ritmo: 520 };
      const rotulos: Rotulo[] = cam.id === 'archivo'
        ? [
          { texto: `ULTIMA CONSULTA · ${quedan} FILA(S)`, tono: quedan === 1 ? 'ok' : 'neutro' },
          ...(consultas > 0 ? [{ texto: `${consultas} CONSULTA(S)`, tono: 'neutro' } as Rotulo] : []),
        ]
        : [{ texto: `LLAVES ${confirmadas}/3`, tono: confirmadas === 3 ? 'ok' : 'neutro' }];
      return { escena, rotulos, clave: `${cam.n}:${quedan}:${consultas}:${confirmadas}` };
    });
  }

  const restan = typeof estado.restan === 'number' ? (estado.restan as number) : mundo.total2;
  const repuestas = numero(estado, 'repuestas');
  const ultima = numero(estado, 'ultimaRepuestas');
  return circuitoCerrado(CAMARAS_2, estado, (cam) => {
    const escena: Escena = cam.id === 'memoria'
      ? {
        fotogramas: [0, 1, 2, 3].map((f) => escenaBarra(restan, mundo.total2, f,
          restan === 0 ? '  vacia.' : '  aun queda memoria.', 'MEMORIA')),
        ritmo: 340,
      }
      : { fotogramas: [0, 1, 2, 3].map((f) => escenaRespaldos(repuestas, ultima > 0, f)), ritmo: 260 };
    const rotulos: Rotulo[] = cam.id === 'memoria'
      ? [{ texto: `QUEDAN ${restan}`, tono: restan === 0 ? 'ok' : 'alerta' }]
      : [{ texto: ultima > 0 ? 'RESTAURANDO' : 'SIN RESTAURAR', tono: ultima > 0 ? 'alerta' : 'neutro' }];
    return { escena, rotulos, clave: `${cam.n}:${restan}:${repuestas}:${ultima}` };
  });
}

// ============================================================
//  Ayuda y Manual detallado de Consultas (`consultas`)
// ============================================================

const MAX_VISTAS = 8;

function ayuda(parte: 1 | 2): ResultadoComando {
  const pie = texto(
    [
      '>>> ESCRIBE `consultas` PARA ABRIR EL MANUAL COMPLETO <<<',
      'En `consultas` tienes explicada cada consulta, cada filtro y cada',
      'operacion logica con ejemplos listos para usar.',
      '',
      '>>> ESCRIBE `estado` PARA VER LAS PISTAS DE LAS 3 LLAVES <<<',
      'Cuando ejecutas `MOSTRAR TODO DE ...`, los registros y columnas que quedan',
      'aparecen EXCLUSIVAMENTE en la Pantalla de Filtro en Vivo de Datos.',
    ],
    'Manual detallado y reparto entre estaciones',
  );

  if (parte === 1) {
    return {
      bloques: [
        texto(
          [
            'consultas                               — VER MANUAL de consultas, filtros y logica',
            'estado                                  — VER PISTAS de las 3 cerraduras y el avance',
            'MOSTRAR TODO DE <tabla> [DONDE ...]     — filtra o une tablas y lo proyecta en Datos',
            'CONTAR <tabla> [DONDE ...]              — cuantas filas cumplen la condicion',
            'MOSTRAR DISTINTOS <col> DE <tabla>      — ver que valores existen de verdad',
            'GUARDAR <nombre | codigo | consulta>    — guardar una llave candidata (3 formas)',
            'PROBAR <nombre | codigo>                — comprobar si lo guardado es una llave',
            'guardados                               — ver lo que llevas guardado',
            ...AYUDA_CAMARAS,
          ],
          'Comandos disponibles (Parte 1 · Buscar las 3 llaves)',
        ),
        pie,
      ],
    };
  }
  return {
    bloques: [
      texto(
        [
          'consultas                               — VER MANUAL de consultas, filtros y borrado',
          'MOSTRAR TODO DE sistema_triggers        — ver en Pantalla las 12 reglas automaticas',
          'MOSTRAR TODO DE <tabla> [DONDE ...]     — proyectar una tabla en la pantalla de Datos',
          'CONTAR <tabla> [DONDE ...]              — cuantas filas quedan en una tabla',
          'APAGAR REGLA <nombre>                   — desactivar una regla automatica (trigger)',
          'BORRAR REGLA <nombre>                   — eliminar una regla automatica (trigger)',
          'BORRAR TODO DE <tabla> (o VACIAR <t>)   — vaciar todas las filas de una tabla',
          'BORRAR DE <tabla> DONDE ...             — borrar solo las filas que cumplan',
          'reiniciar                               — devolver la memoria a su estado inicial',
          'estado                                  — cuantas filas quedan por borrar',
          ...AYUDA_CAMARAS,
        ],
        'Comandos disponibles (Parte 2 · Borrar la memoria)',
      ),
      pie,
    ],
  };
}

function manualConsultas(parte: 1 | 2): ResultadoComando {
  const bloqueConsultas = texto(
    [
      '1) MOSTRAR TODO DE <tabla> [JUNTO CON ...] [DONDE ...]',
      '   Aplica el filtro o la union (JOIN) y envia todos los registros y columnas',
      '   que quedaron a la PANTALLA DE FILTRO EN VIVO del Operador de Datos.',
      '   Tambien puedes pedir columnas sueltas: MOSTRAR id, codigo, nivel DE fragmentos',
      '',
      '2) CONTAR <tabla> [JUNTO CON ...] [DONDE ...]',
      '   Dice cuantas filas cumplen la condicion.',
      '   Ejemplo: CONTAR fragmentos DONDE estado ES activo',
      '',
      '3) MOSTRAR DISTINTOS <columna> DE <tabla>',
      '   Muestra todos los valores diferentes que existen realmente en esa columna.',
      '   Ejemplo: MOSTRAR DISTINTOS tipo DE propietarios',
      '',
      '4) ... JUNTO CON <otra_tabla> [, <otra_tabla_2>]',
      '   Une tablas relacionadas para ver sus columnas juntas en la pantalla de Datos',
      '   y poder filtrar por ellas. Si un fragmento apunta a otro (referencia_id),',
      '   puedes unir con `referencia`.',
      '   Ejemplo: MOSTRAR TODO DE fragmentos JUNTO CON modulos, propietarios DONDE ...',
      '   Ejemplo: MOSTRAR TODO DE fragmentos JUNTO CON referencia, etiquetas DONDE ...',
      '',
      '5) ... ORDENADO POR <columna> DESCENDENTE [LIMITE <n>]',
      '   Ordena los resultados de mayor a menor (DESCENDENTE) o menor a mayor (ASCENDENTE)',
      '   y con LIMITE corta cuantas filas quieres ver.',
      '   Ejemplo: MOSTRAR nivel DE fragmentos ORDENADO POR nivel DESCENDENTE LIMITE 5',
    ],
    '1. Consultas (como filtrar y unir tablas en Datos)',
  );

  const bloqueFiltros = texto(
    [
      'Van despues de la palabra DONDE. No hace falta poner comillas en palabras sueltas:',
      '',
      '· ES / NO ES             Compara si una columna es igual o distinta a un valor.',
      '                         Ej: estado ES activo   |   estado NO ES corrupto',
      '',
      '· MAYOR QUE / MENOR QUE  Compara numeros (tambien MAYOR O IGUAL A, MENOR O IGUAL A).',
      '                         Ej: nivel MAYOR QUE 5',
      '',
      '· TIENE FORMATO <patron> Comprueba la forma exacta de un codigo:',
      '                         `#` representa un numero (0-9) y `?` cualquier caracter.',
      '                         Respeta mayusculas y minusculas.',
      '                         Ej: codigo TIENE FORMATO <PREFIJO>-####-<SUFIJO>',
      '',
      '· EMPIEZA CON /          Busca textos por su inicio, su final o su contenido.',
      '  TERMINA CON / CONTIENE Ej: nombre CONTIENE maestra',
      '',
      '· ESTA VACIO /           Filtra si un dato no apunta a nada (NULL) o si tiene valor.',
      '  NO ESTA VACIO          Ej: referencia_id NO ESTA VACIO',
    ],
    '2. Filtros despues de DONDE (como comparar)',
  );

  const bloqueLogica = texto(
    [
      'Sirven para encadenar varios filtros dentro del mismo DONDE:',
      '',
      '· Y    Exige que se cumplan TODAS las condiciones a la vez (estrecha la tabla).',
      '       Ej: DONDE estado ES activo Y sistema ES nucleo',
      '',
      '· O    Acepta filas que cumplan CUALQUIERA de las condiciones.',
      '       Ej: DONDE estado ES activo O estado ES archivado',
      '',
      '· NO   Invierte un filtro para descartar lo que no quieres.',
      '       Ej: DONDE estado NO ES corrupto',
    ],
    '3. Operaciones logicas (Y, O, NO)',
  );

  const bloqueAccion = parte === 1
    ? texto(
      [
        'Cuando en la pantalla de Datos hayais aislado una llave (1 sola fila),',
        'podeis guardarla de cualquiera de estas 3 formas:',
        '',
        '· Forma 1 (Guardar tu ultima consulta):',
        '  Despues de lanzar tu `MOSTRAR TODO DE fragmentos ...`:',
        '  GUARDAR llave1',
        '',
        '· Forma 2 (Guardar escribiendo la consulta directa):',
        '  GUARDAR llave1 DE fragmentos JUNTO CON modulos DONDE ...',
        '',
        '· Forma 3 (Guardar el codigo o ID que Datos lee en su pantalla):',
        '  GUARDAR <codigo_o_id>   (ej. `GUARDAR F-0412`)',
        '',
        'Y para verificar si de verdad abre una cerradura del robot:',
        '  PROBAR llave1          (o `PROBAR <codigo_o_id>`)',
        '  Nota: Probar un senuelo equivocado activa la cuarentena de seguridad.',
      ],
      '4. Como Guardar y Probar las llaves (Parte 1)',
    )
    : texto(
      [
        'En la Parte 2 hay que dejar las 8 tablas de datos con 0 filas:',
        '',
        '· Consultar las reglas automaticas del robot (se ven en Pantalla):',
        '  MOSTRAR TODO DE sistema_triggers',
        '',
        '· Cadena de proteccion entre reglas:',
        '  Algunas reglas custodian a otras e impiden apagarlas directamente.',
        '  Leed la columna `accion` en `sistema_triggers` para ver que regla vigila',
        '  a cual y apagad primero al vigia superior.',
        '',
        '· Desactivar o borrar una regla:',
        '  APAGAR REGLA <nombre>     (o `BORRAR REGLA <nombre>`)',
        '  Cuidado: no toqueis las reglas inocuas de INSERT o UPDATE.',
        '',
        '· Vaciar una tabla entera:',
        '  BORRAR TODO DE <tabla>    (o `VACIAR <tabla>`)',
      ],
      '4. Cadena de Reglas y Borrado de Memoria (Parte 2)',
    );

  return {
    bloques: [bloqueConsultas, bloqueFiltros, bloqueLogica, bloqueAccion],
  };
}

// ============================================================
//  El módulo
// ============================================================

function fallaSql(e: unknown): ResultadoComando {
  if (e instanceof ErrorSql) {
    return { bloques: [error(e.message), ...(e.pistas.length ? [texto(e.pistas)] : [])] };
  }
  throw e;
}

const fmt = (v: Valor) => (v === null ? 'NULL' : String(v));

export const boveda: ModuloFase = {
  key: 'fase-5-boveda',

  proyectar(role: Role, ctx) {
    const parte = parteDe(ctx.estado);
    switch (role) {
      case 'DATOS':
        return parte === 1 ? proyectarDatosParte1(ctx.estado) : proyectarDatosParte2(ctx.estado);

      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          camaras: vistaDeCamaras(ctx.estado),
          nota: parte === 1
            ? 'Tu ves las camaras ARCHIVO y LLAVERO, el manual (`consultas`) y las pistas de las 3 '
              + 'cerraduras (`estado`). Cuando Terminal aplica un filtro con `MOSTRAR TODO DE ...`, '
              + 'los registros resultantes solo los ve Datos en su Pantalla de Filtro en Vivo.'
            : 'Tu eres el unico que ve el catalogo de reglas (`MOSTRAR TODO DE sistema_triggers`) '
              + 'y las alertas de que regla bloqueo o restauro filas. Datos ve en su mapa cuantas '
              + 'filas quedan en las 8 tablas.',
        };

      case 'TERMINAL':
        return {
          camara: numero(ctx.estado, 'camara') || 1,
          pista: 'Escribe `ayuda`, `estado` o `consultas`. Tus filtros con `MOSTRAR TODO DE ...` actualizan la pantalla de Datos.',
          cuarentenaHasta: (ctx.estado.cuarentenaHasta as number) ?? null,
        };
    }
  },

  ejecutar(comandoBruto: string, ctx: ContextoComando): ResultadoComando {
    const enCuarentena = cuarentenaActiva(ctx);
    if (enCuarentena) return enCuarentena;

    const bruto = comandoBruto.trim().replace(/;+\s*$/, '');
    const cmd = normalizar(bruto);
    const [verbo, ...resto] = cmd.split(' ');
    const arg = resto.join(' ');
    const parte = parteDe(ctx.estado);
    const mundo = mundoDeEstado(ctx.estado);

    const mando = mandoDeCamaras(parte === 1 ? CAMARAS_1 : CAMARAS_2, verbo, arg, ctx.estado);
    if (mando) return mando;

    switch (verbo) {
      case 'ayuda':
      case 'help':
        if (arg === 'consultas' || arg === 'filtros' || arg === 'sql' || arg === 'manual') {
          return manualConsultas(parte);
        }
        return ayuda(parte);

      case 'consultas':
      case 'filtros':
      case 'manual':
        return manualConsultas(parte);

      case 'estado':
        return estadoActual(ctx, parte, mundo);

      case 'vistas':
      case 'guardados':
      case 'guardadas':
        return parte === 1 ? listarVistas(ctx) : sinVistas();

      case 'guardar':
        return parte === 1 ? ejecutarGuardar(bruto, ctx, mundo) : sinVistas();

      case 'probar':
        return parte === 1 ? probar(bruto.slice(verbo.length).trim(), ctx, mundo) : sinVistas();

      case 'reiniciar':
        if (parte !== 2) return { bloques: [error('No hay nada que reiniciar todavia.')] };
        return {
          estado: { ...ctx.estado, log: [], restan: mundo.total2, repuestas: 0, ultimaRepuestas: 0 },
          bloques: [texto([`La memoria vuelve a tener ${mundo.total2} filas y las reglas que tenia.`], 'Reinicio')],
        };

      case 'mostrar':
      case 'traer':
      case 'seleccionar':
      case 'ver':
      case 'buscar':
      case 'contar':
      case 'select':
      case 'create':
      case 'drop':
      case 'delete':
      case 'borrar':
      case 'vaciar':
      case 'eliminar':
      case 'quitar':
      case 'apagar':
      case 'desactivar':
      case 'disable':
        return comandoSql(bruto, ctx, parte, mundo);

      case 'extraer':
        return {
          bloques: [
            error('Usa `GUARDAR` y luego `PROBAR` para validar cada una de las 3 llaves.'),
            texto(['Escribe `consultas` para ver las 3 formas de guardar y probar.']),
          ],
        };

      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto}». Prueba \`ayuda\`, \`estado\` o \`consultas\`.`)] };
    }
  },
};

function sinVistas(): ResultadoComando {
  return { bloques: [error('En esta parte ya no hay que guardar ni probar llaves: el objetivo es vaciar la memoria.')] };
}

function estadoActual(ctx: ContextoComando, parte: 1 | 2, mundo: MundoFase5): ResultadoComando {
  if (parte === 1) {
    const n = listaDe(ctx.estado, 'confirmadas').length;
    const v = Object.keys((ctx.estado.vistas as Record<string, string>) ?? {}).length;
    return {
      bloques: [
        texto(
          [
            `Llaves confirmadas en el llavero: ${n} de 3.`,
            `Candidatas guardadas: ${v}.`,
          ],
          'Estado del Llavero',
        ),
        texto(
          [
            'Del fragmento de codigo que logramos descifrar antes de entrar, sabemos',
            'con que esta relacionada cada una de las 3 partes de la llave:',
            '',
            '· LLAVE 1 (Vinculo de Conciencia Interna):',
            '  Sigue encendida (`activo`). No pertenece a ningun `usuario` ni `admin` de',
            '  la empresa: su propietario es del tipo oculto que creo el propio robot,',
            '  y su modulo pertenece al sistema principal (`nucleo`).',
            '',
            '· LLAVE 2 (Vinculo de Seguridad Externa):',
            '  Clasificada bajo una etiqueta de categoria `seguridad`, conectada a un',
            '  modulo con enlace `externo`, y con el `nivel` mas alto que exista en toda',
            '  la memoria (comprueba hasta que numero llega `nivel` realmente).',
            '',
            '· LLAVE 3 (Vinculo Archivado a la Llave Maestra):',
            '  Esta en estado `archivado` y apunta (`referencia_id`) al fragmento que',
            '  lleva la etiqueta exacta `llave_maestra` (cuidado con las etiquetas trampa).',
            '',
            '· Como deducir el formato y tamano exacto de las llaves de este robot:',
            '  Busca primero en Datos el fragmento raiz que lleva la etiqueta `llave_maestra`:',
            '  ese registro conserva el molde exacto (prefijo, 4 numeros, terminacion y tamano)',
            '  que deben cumplir las 3 llaves para distinguirlas de los senuelos.',
          ],
          'Lo que desciframos del codigo (Las 3 relaciones)',
        ),
      ],
    };
  }
  const restan = typeof ctx.estado.restan === 'number' ? (ctx.estado.restan as number) : mundo.total2;
  return {
    bloques: [texto(
      [
        `A la memoria le quedan ${restan} filas de ${mundo.total2}.`,
        'Datos ve en su mapa cuantas filas quedan en cada una de las 8 tablas (las 4 originales + 4 nuevas).',
        'Usa `MOSTRAR TODO DE sistema_triggers` para ver en Pantalla la cadena de reglas que las protege.',
      ],
      'Estado',
    )],
  };
}

function listarVistas(ctx: ContextoComando): ResultadoComando {
  const vistas = (ctx.estado.vistas as Record<string, string>) ?? {};
  const nombres = Object.keys(vistas);
  if (nombres.length === 0) {
    return {
      bloques: [texto([
        'No hay ninguna llave candidata guardada todavia.',
        'Puedes guardar de 3 formas:',
        '  1) `GUARDAR llave1` (guarda tu ultima consulta)',
        '  2) `GUARDAR llave1 DE fragmentos DONDE ...`',
        '  3) `GUARDAR <codigo_o_id>` (el codigo o ID que Datos ve en su pantalla)',
      ], 'Guardados')],
    };
  }
  return { bloques: [texto(nombres.map((n) => `${n}  =  ${vistas[n]}`), 'Guardados')] };
}

function buscarFragmentoPorCodigoOId(token: string, mundo: MundoFase5): Fila | null {
  const limpio = token.trim().replace(/^['"]|['"]$/g, '');
  if (!limpio) return null;
  const upper = limpio.toUpperCase();
  const frags = mundo.bd1.tablas.get('fragmentos')!.filas;
  const exacto = frags.find((f) => String(f.id).toUpperCase() === upper || String(f.codigo) === limpio);
  if (exacto) return exacto;
  return frags.find((f) => String(f.codigo).toUpperCase() === upper) ?? null;
}

function ejecutarGuardar(bruto: string, ctx: ContextoComando, mundo: MundoFase5): ResultadoComando {
  const cuerpo = bruto.replace(/^\s*guardar\s+/i, '').trim();
  if (!cuerpo) {
    return {
      bloques: [
        error('Falta indicar que quieres guardar.'),
        texto([
          'Formas de usar GUARDAR:',
          '  1) `GUARDAR llave1` (guarda la ultima consulta que hiciste)',
          '  2) `GUARDAR llave1 DE fragmentos DONDE ...`',
          '  3) `GUARDAR <codigo_o_id>` (ej. `GUARDAR F-0412`)',
        ]),
      ],
    };
  }

  const sinPrefijo = cuerpo.replace(/^(?:(?:en|como|vista)\s+)+/i, '').trim();
  const partes = sinPrefijo.split(/\s+/);
  const primeroRaw = partes[0].replace(/[:=]$/, '');
  const primeroNorm = normalizar(primeroRaw);
  const resto = sinPrefijo.slice(partes[0].length).replace(/^[:=\s]+/, '').trim();

  const vistas = { ...((ctx.estado.vistas as Record<string, string>) ?? {}) };

  const guardarConsultaEn = (nombreRaw: string, sqlGuardar: string): ResultadoComando => {
    const nombre = normalizar(nombreRaw);
    if (!/^[a-z0-9_-]{1,35}$/.test(nombre)) {
      return { bloques: [error('El nombre para guardar debe ser una sola palabra (ej. `llave1`).')] };
    }
    if (mundo.bd1.tablas.has(nombre)) {
      return { bloques: [error(`«${nombre}» ya es el nombre de una tabla: elige otro (ej. \`llave1\`).`)] };
    }
    if (!(nombre in vistas) && Object.keys(vistas).length >= MAX_VISTAS) {
      return { bloques: [error(`Ya hay ${MAX_VISTAS} guardados. Borra alguno con \`BORRAR VISTA <nombre>\`.`)] };
    }
    let r;
    try {
      const s = analizar(sqlGuardar);
      if (s.tipo !== 'select') return { bloques: [error('Solo se pueden guardar consultas.')] };
      r = ejecutarSelect(s.sel, mundo.bd1);
    } catch (e) {
      return fallaSql(e);
    }
    vistas[nombre] = sqlGuardar;
    return {
      estado: {
        ...ctx.estado,
        vistas,
        ultimoGuardado: nombre,
        consultaFiltro: sqlGuardar,
        quedan: r.total,
      },
      bloques: [texto([
        `Guardado como «${nombre}». Devuelve ${r.total} fila(s) ahora mismo (visibles en la pantalla de Datos).`,
        r.total === 1
          ? `Escribe \`PROBAR ${nombre}\` para comprobar si es una de las 3 llaves.`
          : `Cuando devuelva 1 sola fila, podras comprobarla con \`PROBAR ${nombre}\`.`,
      ], 'Guardado')],
    };
  };

  if (!resto) {
    const frag = buscarFragmentoPorCodigoOId(primeroRaw, mundo);
    if (frag) {
      const sqlFrag = `MOSTRAR TODO DE fragmentos DONDE id ES '${frag.id}'`;
      return guardarConsultaEn(primeroNorm, sqlFrag);
    }
    const ultima = typeof ctx.estado.ultimaConsulta === 'string' ? ctx.estado.ultimaConsulta : null;
    if (!ultima) {
      return {
        bloques: [
          error(`No hay ninguna consulta reciente para guardar en «${primeroRaw}», ni existe ningun fragmento con ese codigo o ID.`),
          texto([
            'Primero haz una consulta con `MOSTRAR TODO DE fragmentos ...` y luego escribe `GUARDAR ' + primeroNorm + '`,',
            'o escribe la consulta entera: `GUARDAR ' + primeroNorm + ' DE fragmentos DONDE ...`',
          ]),
        ],
      };
    }
    return guardarConsultaEn(primeroNorm, ultima);
  }

  const restoSinComo = resto.replace(/^(?:como|as|es|=)\s+/i, '').trim();
  const primeraPalabraResto = normalizar(restoSinComo.split(/\s+/)[0]);

  if (['mostrar', 'traer', 'seleccionar', 'ver', 'buscar', 'select', 'contar'].includes(primeraPalabraResto)) {
    return guardarConsultaEn(primeroNorm, restoSinComo);
  }

  if (['de', 'en', 'desde', 'from', 'fragmentos'].includes(primeraPalabraResto)) {
    const sqlCompleto = primeraPalabraResto === 'fragmentos'
      ? `MOSTRAR TODO DE ${restoSinComo}`
      : `MOSTRAR TODO ${restoSinComo}`;
    return guardarConsultaEn(primeroNorm, sqlCompleto);
  }

  if (restoSinComo.split(/\s+/).length === 1) {
    const frag = buscarFragmentoPorCodigoOId(restoSinComo, mundo);
    if (frag) {
      return guardarConsultaEn(primeroNorm, `MOSTRAR TODO DE fragmentos DONDE id ES '${frag.id}'`);
    }
  }

  if (['donde', 'where', 'junto', 'unir'].includes(primeraPalabraResto)) {
    return guardarConsultaEn(primeroNorm, `MOSTRAR TODO DE fragmentos ${restoSinComo}`);
  }

  return guardarConsultaEn(primeroNorm, `MOSTRAR TODO ${restoSinComo}`);
}

function probar(argBruto: string, ctx: ContextoComando, mundo: MundoFase5): ResultadoComando {
  const vistas = (ctx.estado.vistas as Record<string, string>) ?? {};
  const ultimoGuardado = typeof ctx.estado.ultimoGuardado === 'string' ? ctx.estado.ultimoGuardado : '';
  const objetivoRaw = argBruto.trim() || ultimoGuardado;

  if (!objetivoRaw) {
    return {
      bloques: [
        error('Falta indicar que quieres probar. Ejemplo: `PROBAR llave1` o `PROBAR <codigo>`.'),
      ],
    };
  }

  const clave = normalizar(objetivoRaw);
  let sql = vistas[clave];

  if (!sql) {
    const frag = buscarFragmentoPorCodigoOId(objetivoRaw, mundo);
    if (frag) {
      sql = `MOSTRAR TODO DE fragmentos DONDE id ES '${frag.id}'`;
    }
  }

  if (!sql) {
    return {
      bloques: [
        error(`No hay nada guardado como «${objetivoRaw}», ni coincide con ningun codigo o ID de la memoria.`),
        texto(['Usa `GUARDAR` antes de probar, o escribe `guardados` para ver la lista.']),
      ],
    };
  }

  let r;
  try {
    const s = analizar(sql);
    if (s.tipo !== 'select') return { bloques: [error('Lo guardado no es una consulta.')] };
    r = ejecutarSelect(s.sel, mundo.bd1);
  } catch (e) {
    return fallaSql(e);
  }

  if (r.agregada) {
    return { bloques: [error('PROBAR necesita una fila de `fragmentos`, no un recuento.')] };
  }
  if (r.desde !== 'fragmentos') {
    return { bloques: [error('Una llave es un fragmento: la consulta tiene que ser sobre `fragmentos`.')] };
  }
  if (r.total !== 1) {
    return {
      bloques: [texto(
        [`«${objetivoRaw}» devuelve ${r.total} fila(s). PROBAR necesita exactamente UNA.`,
          r.total === 0 ? 'Hay alguna condicion que sobra o un valor que no es.' : 'Quedan candidatas de mas: sigue estrechando con mas filtros.'],
        'Todavia no',
      )],
    };
  }

  const fila = r.base[0]!;
  const confirmadas = listaDe(ctx.estado, 'confirmadas');
  const idx = mundo.claves.indexOf(fila.id as string);

  if (idx === -1) {
    return rechazo(ctx, `«${objetivoRaw}» devuelve un fragmento que no es ninguna de las tres llaves. La memoria registra el intento.`);
  }
  if (confirmadas.includes(fila.id as string)) {
    return { bloques: [texto(['Esa llave ya estaba confirmada. Busca las que faltan.'], 'Repetida')] };
  }

  const nuevas = [...confirmadas, fila.id as string];
  if (nuevas.length < 3) {
    return {
      estado: { ...ctx.estado, confirmadas: nuevas },
      bloques: [exito(`Llave confirmada (${nuevas.length} de 3)`, [
        `«${objetivoRaw}» (${fila.id} · ${fila.codigo}) es una llave autentica.`,
        `Faltan ${3 - nuevas.length}. Sigue filtrando en la pantalla de Datos.`,
      ])],
    };
  }

  // Tercera llave: pasa a la Parte 2 conservando las 4 tablas originales + sumando las 4 nuevas.
  return {
    estado: {
      ...ctx.estado,
      confirmadas: nuevas,
      parte: 2,
      vistas: {},
      log: [],
      consultaFiltro: 'MOSTRAR TODO DE fragmentos',
      restan: mundo.total2,
      repuestas: 0,
      ultimaRepuestas: 0,
      camara: 1,
    },
    bloques: [
      exito('PARTE 1 SUPERADA · Las tres llaves son vuestras', [
        'La llave que lo construyo ya no esta escondida. Pero el robot lo ha notado:',
        '',
        '[!] ALERTA DEL ROBOT: «INTRUSION EN MEMORIA. ACTIVANDO RESPALDOS Y CUSTODIOS DE REGLAS.»',
        '',
        '--- PASO A LA PARTE 2 (BORRAR LA MEMORIA) ---',
        '1. En Datos siguen las 4 tablas originales (con las mismas filas y llaves) y se han',
        '   sumado 4 tablas nuevas (`respaldo_fragmentos`, `respaldo_modulos`, `respaldo_propietarios`, `bitacora`).',
        '2. En Pantalla podeis consultar `MOSTRAR TODO DE sistema_triggers`: vereis que hay reglas',
        '   que protegen a otras reglas en cadena e impiden apagarlas directamente.',
        '3. Descubrid que regla vigila a cual, desactivad la cadena en orden y dejad las 8 tablas en 0 filas.',
      ]),
    ],
  };
}

function comandoSql(bruto: string, ctx: ContextoComando, parte: 1 | 2, mundo: MundoFase5): ResultadoComando {
  let s: Sentencia;
  try { s = analizar(bruto); } catch (e) { return fallaSql(e); }

  try {
    switch (s.tipo) {
      case 'select': {
        const db = parte === 1 ? mundo.bd1 : reconstruir(listaDe(ctx.estado, 'log'), mundo.semilla);
        const r = ejecutarSelect(s.sel, db);
        const esCatalogoTriggers = s.sel.from.tabla === 'sistema_triggers';
        const esResumenCorto = r.agregada || s.sel.distinct || (s.sel.limite !== undefined && s.sel.limite <= 5);

        const embudo = {
          ...(parte === 1 ? { quedan: r.total, consultas: numero(ctx.estado, 'consultas') + 1 } : {}),
          ...(esCatalogoTriggers || r.agregada ? {} : { consultaFiltro: bruto, ultimaConsulta: bruto }),
        };
        const estado = { ...ctx.estado, ...embudo };

        if (r.total === 0) {
          return {
            estado,
            bloques: [texto([
              'Ningun registro cumple todas esas condiciones a la vez.',
              'La Pantalla de Filtro en Vivo de Datos muestra 0 registros. Afloja alguna condicion.',
            ], '0 filas')],
          };
        }

        // 1) Si es `sistema_triggers` (Parte 2) o un resumen corto (`CONTAR`, `MOSTRAR DISTINTOS`,
        //    `ORDENADO POR ... LIMITE 5`), se muestra la tabla en Pantalla: es su trabajo.
        if (esCatalogoTriggers || esResumenCorto) {
          const filas = r.filas.slice(0, 15);
          return {
            estado,
            bloques: [
              tabla(
                esCatalogoTriggers
                  ? `Catalogo de reglas automaticas (${r.total} reglas)`
                  : `${r.total} resultado(s)`,
                r.columnas,
                filas.map((f) => f.map(fmt)),
              ),
            ],
          };
        }

        // 2) Si es una consulta de registros (`MOSTRAR TODO DE ...`), las filas y columnas
        //    van EXCLUSIVAMENTE a la Pantalla de Filtro en Vivo de Datos para que Pantalla
        //    no le robe el trabajo a Datos.
        const tablasUnidas = [s.sel.from.tabla, ...s.sel.joins.map((j) => j.tabla)];
        return {
          estado,
          bloques: [
            texto(
              [
                `Filtro aplicado sobre: ${tablasUnidas.join(' + ')}.`,
                `Quedaron ${r.total} registro(s) con ${r.columnas.length} columna(s) en la Pantalla de Filtro en Vivo de Datos.`,
                r.total === 1 && parte === 1
                  ? 'Datos ya tiene el unico registro aislado en su pantalla: que os dicte su codigo o guardadlo con `GUARDAR llave1`.'
                  : 'Pidele a Datos que revise las filas y columnas que quedaron en su pantalla para afinar el siguiente filtro.',
              ],
              `Filtro proyectado en Datos · ${r.total} fila(s)`,
            ),
          ],
        };
      }

      case 'crear_vista': {
        if (parte !== 1) return sinVistas();
        if (!/^[a-z_][a-z0-9_]{0,30}$/.test(s.nombre)) {
          return { bloques: [error('El nombre tiene que ser una sola palabra (letras, numeros y _).')] };
        }
        if (mundo.bd1.tablas.has(s.nombre)) {
          return { bloques: [error(`«${s.nombre}» ya es una tabla: elige otro nombre.`)] };
        }
        const vistas = { ...((ctx.estado.vistas as Record<string, string>) ?? {}) };
        if (!(s.nombre in vistas) && Object.keys(vistas).length >= MAX_VISTAS) {
          return { bloques: [error(`Ya hay ${MAX_VISTAS} guardados. Quita alguno con BORRAR VISTA.`)] };
        }
        const r = ejecutarSelect(s.sel, mundo.bd1);
        vistas[s.nombre] = s.sql;
        return {
          estado: { ...ctx.estado, vistas, ultimoGuardado: s.nombre, consultaFiltro: s.sql, quedan: r.total },
          bloques: [texto([
            `Guardado como «${s.nombre}». Devuelve ${r.total} fila(s) en la pantalla de Datos.`,
            r.total === 1 ? '`PROBAR ' + s.nombre + '` dice si es una llave.' : 'Cuando devuelva una sola, `PROBAR ' + s.nombre + '`.',
          ], 'Guardado')],
        };
      }

      case 'borrar_vista': {
        if (parte !== 1) return sinVistas();
        const vistas = { ...((ctx.estado.vistas as Record<string, string>) ?? {}) };
        if (!(s.nombre in vistas)) return { bloques: [error(`No hay nada guardado como «${s.nombre}».`)] };
        delete vistas[s.nombre];
        return { estado: { ...ctx.estado, vistas }, bloques: [texto([`Guardado «${s.nombre}» eliminado.`])] };
      }

      case 'delete':
      case 'drop_trigger':
      case 'disable_trigger':
        return parte === 1
          ? { bloques: [error('La memoria es de solo lectura por ahora. Primero, encontrar las 3 llaves.')] }
          : mutar(bruto, s, ctx, mundo);

      default:
        return { bloques: [error('No se entiende esa sentencia.')] };
    }
  } catch (e) {
    return fallaSql(e);
  }
}

function mutar(bruto: string, s: Sentencia, ctx: ContextoComando, mundo: MundoFase5): ResultadoComando {
  const log = listaDe(ctx.estado, 'log');
  const db = reconstruir(log, mundo.semilla);

  if (s.tipo === 'drop_trigger' || s.tipo === 'disable_trigger') {
    const tr = buscarTrigger(db, s.nombre);
    if (!tr) {
      return { bloques: [error(`No existe ninguna regla o trigger llamada «${s.nombre}».`),
        texto(['El catalogo esta en `sistema_triggers`. Usa: `MOSTRAR TODO DE sistema_triggers`.'])] };
    }
    if (tr.efecto.tipo === 'inocuo') {
      return rechazo(ctx,
        `«${tr.nombre}» no restaura ni custodia memoria: el robot la necesita para funcionar y nota que la tocas.`);
    }
    if (s.tipo === 'disable_trigger' && !tr.activo) {
      return { bloques: [texto([`«${tr.nombre}» ya estaba desactivada.`])] };
    }
  }

  const r = aplicarMutacion(s, db);
  const bloqueadaPorCustodio = (s.tipo === 'drop_trigger' || s.tipo === 'disable_trigger') && r.eventos.length > 0;
  const restan = contarFilas(db);
  const repuestas = r.eventos.reduce((n, e) => n + e.repuestas, 0);
  const consultaFiltro = s.tipo === 'delete'
    ? `MOSTRAR TODO DE ${s.tabla}`
    : (typeof ctx.estado.consultaFiltro === 'string' ? ctx.estado.consultaFiltro : 'MOSTRAR TODO DE fragmentos');

  const estado = {
    ...ctx.estado,
    log: (!bloqueadaPorCustodio && (r.borradas > 0 || s.tipo !== 'delete')) ? [...log, bruto] : log,
    restan,
    repuestas: numero(ctx.estado, 'repuestas') + repuestas,
    ultimaRepuestas: repuestas,
    consultaFiltro,
  };

  if (bloqueadaPorCustodio) {
    return {
      estado,
      bloques: [
        error(r.texto),
        texto([
          ...r.eventos.map((e) => `[!] ${e.texto}`),
          'Consulta `MOSTRAR TODO DE sistema_triggers` para ver que regla custodia a cual y apaga primero al custodio superior.',
        ], 'Regla blindada por otro trigger'),
      ],
    };
  }

  if (restan === 0) {
    return {
      estado,
      resuelto: true,
      bloques: [
        texto([r.texto, ...r.eventos.map((e) => `[!] ${e.texto}`)], 'Borrado'),
        exito('MEMORIA VACIA · El robot ya no recuerda nada', [
          'Las 8 tablas han quedado en 0 filas, y ninguna regla va a volver a llenarlas.',
          '',
          'No bastaba con borrar: la memoria tenia copias, las copias tenian reglas que las',
          'devolvian al sitio, y esas reglas estaban blindadas por triggers custodios en cadena.',
          'Habeis desarmado la cadena desde el vigia raiz y vaciado toda su memoria.',
        ]),
      ],
    };
  }

  return {
    estado,
    bloques: [
      texto(
        [
          r.texto,
          ...r.eventos.map((e) => `[!] ${e.texto}`),
          `A la memoria le quedan ${restan} fila(s).`,
        ],
        s.tipo === 'delete' ? 'Borrado' : 'Regla',
      ),
    ],
  };
}
