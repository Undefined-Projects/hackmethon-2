// ============================================================
//  FASE 5 — La Memoria del Robot   ·   BASES DE DATOS (SQL)
//
//  Ya estáis dentro de su sistema, pero no dentro de ÉL. Para llegar a
//  su conciencia hace falta la llave con la que lo construyeron, y el
//  robot la partió en tres y la escondió entre dos mil cuatrocientos
//  documentos. Después, para destruirlo, hay que vaciar esa memoria
//  entera... y él tiene copias.
//
//  DOS PARTES, MISMA TERMINAL (SQL)
//    PARTE 1 · «Encontrar las tres llaves»
//      Embudo de filtros sobre una memoria desordenada, con señuelos que
//      imitan las llaves (nombres, etiquetas, formatos casi iguales). Hay
//      que unir tablas, desconfiar del diccionario (dos datos están
//      mal), guardar la consulta como VISTA y probarla.
//    PARTE 2 · «Borrar la memoria»
//      Las mismas dos mil cuatrocientas filas, ahora con respaldos y
//      TRIGGERS que las restauran. Hay que encontrar esas reglas y quitar
//      las que tocan, sin tocar las que el robot necesita.
//
//  EL REPARTO
//    PANTALLA  lo que devuelve la memoria y las cámaras. Nada más.
//    DATOS     el diccionario (con dos errores), el encargo y el formato
//              de una llave. No ve ni un registro.
//    TERMINAL  escribe SQL, y no ve nada.
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
  type BD, type Fila, type Sentencia, type TriggerDef, type Valor,
} from './sqlmini.js';

// ---------- Aleatorio con semilla fija ----------
//
// La misma memoria en todos los equipos y en todas las partidas: con
// `Math.random()` dos equipos vecinos tendrían respuestas distintas y una
// prueba verde hoy fallaría mañana.
function generador(semilla: number) {
  let s = semilla;
  return (n: number) => {
    s = (s * 1103515245 + 12345) % 2147483648;
    // Los bits BAJOS de una LCG con módulo potencia de dos casi no varían:
    // se descartan los 16 primeros.
    return Math.floor(s / 65536) % n;
  };
}
const nn = (n: number, w: number) => String(n).padStart(w, '0');

// ============================================================
//  PARTE 1 · la memoria desordenada
// ============================================================

const N_FRAG = 1800;
const SISTEMAS = ['nucleo', 'red', 'energia', 'sensores', 'memoria'];

/** Las tres consultas que resuelven cada llave. Solo existen en el
 *  servidor: las usa la construcción del mundo (para garantizar que cada
 *  llave es ÚNICA) y las pruebas. */
export const SOLUCIONES = [
  "SELECT f.* FROM fragmentos f JOIN modulos m ON f.modulo_id = m.id JOIN propietarios p ON f.propietario_id = p.id "
  + "WHERE f.codigo LIKE 'LLV-____-K7' AND f.tamano = 64 AND f.estado = 'activo' "
  + "AND p.tipo = 'subsistema' AND m.sistema = 'nucleo'",
  "SELECT f.* FROM fragmentos f JOIN modulos m ON f.modulo_id = m.id JOIN etiquetas e ON f.etiqueta_id = e.id "
  + "WHERE f.codigo LIKE 'LLV-____-K7' AND f.tamano = 64 AND f.nivel = 9 "
  + "AND e.categoria = 'seguridad' AND m.enlace = 'externo'",
  "SELECT f.* FROM fragmentos f JOIN fragmentos r ON f.referencia_id = r.id JOIN etiquetas e ON r.etiqueta_id = e.id "
  + "WHERE f.codigo LIKE 'LLV-____-K7' AND f.tamano = 64 AND f.estado = 'archivado' "
  + "AND e.nombre = 'llave_maestra'",
];

type Spec = {
  codigo: string; tamano: number; estado: string; propietario_id: string;
  modulo_id: string; etiqueta_id: string; nivel: number; referencia_id: string | null;
};

function construirMundo1() {
  const az = generador(20260915);
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

  // --- propietarios (180)
  const tipos = mezclar([
    ...Array<string>(12).fill('robot'),
    ...Array<string>(45).fill('subsistema'),
    ...Array<string>(123).fill('humano'),
  ]);
  const propietarios: Fila[] = tipos.map((tipo, i) => ({
    id: `P-${nn(i + 1, 3)}`, nombre: `prop_${nn(i + 1, 3)}`, tipo,
  }));

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
  const propSub = propietarios.filter((p) => p.tipo === 'subsistema');
  const propRobot = propietarios.filter((p) => p.tipo === 'robot');
  const propHum = propietarios.filter((p) => p.tipo === 'humano');
  const etq = etiquetas.slice(6);
  const etqSeg = etq.filter((e) => e.categoria === 'seguridad');
  const etqOp = etq.filter((e) => e.categoria === 'operacion');
  const etqHist = etq.filter((e) => e.categoria === 'historial');

  // --- fragmentos (1800): el ruido de fondo
  const PREF = ['DAT', 'LOG', 'CFG', 'TMP', 'SYS', 'MEM'];
  const LET = 'ABCDEFGHIJ';
  const ESTADOS = ['activo', 'activo', 'activo', 'activo', 'activo', 'activo', 'archivado', 'archivado', 'corrupto', 'corrupto'];
  const frags: Fila[] = [];
  for (let i = 1; i <= N_FRAG; i++) {
    frags.push({
      id: `F-${nn(i, 4)}`,
      codigo: `${pick(PREF)}-${nn(az(10000), 4)}-${LET[az(10)]}${az(10)}`,
      modulo_id: pick(modulos).id,
      propietario_id: pick(propietarios).id,
      etiqueta_id: etq[az(etq.length)].id,
      referencia_id: null,
      estado: ESTADOS[az(10)],
      nivel: 1 + az(8),
      tamano: 8 + az(500),
    });
  }

  // Reservados: el fragmento que lleva la etiqueta buena y los que llevan
  // las parecidas. Nadie al azar puede apuntar a ellos.
  const iMaestra = 88;
  const iSimil = [140, 141, 142, 143, 144];
  frags[iMaestra].etiqueta_id = 'E-001';
  iSimil.forEach((idx, k) => { frags[idx].etiqueta_id = `E-${nn(k + 2, 3)}`; });
  const reservados = new Set([iMaestra, ...iSimil]);
  const idsReservados = new Set([...reservados].map((i) => frags[i].id as string));
  for (const f of frags) {
    if (az(2) === 0) {
      const objetivo = frags[az(N_FRAG)].id as string;
      f.referencia_id = idsReservados.has(objetivo) ? null : objetivo;
    }
  }

  const libres = mezclar(Array.from({ length: N_FRAG }, (_, i) => i).filter((i) => !reservados.has(i)));
  const usados = new Set<string>();
  const codigoLlave = () => {
    for (;;) {
      const c = `LLV-${nn(1000 + az(9000), 4)}-K7`;
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
    codigo: codigoLlave(), tamano: 64, estado: 'activo',
    propietario_id: propSub[0].id as string, modulo_id: modNucleo[0].id as string,
    etiqueta_id: etqOp[0].id as string, nivel: 4, referencia_id: null,
  };
  const specB: Spec = {
    codigo: codigoLlave(), tamano: 64, estado: 'activo',
    propietario_id: propHum[0].id as string, modulo_id: modOtroExt[0].id as string,
    etiqueta_id: etqSeg[0].id as string, nivel: 9, referencia_id: null,
  };
  const specC: Spec = {
    codigo: codigoLlave(), tamano: 64, estado: 'archivado',
    propietario_id: propHum[1].id as string, modulo_id: modOtroInt[0].id as string,
    etiqueta_id: etqOp[1].id as string, nivel: 3, referencia_id: frags[iMaestra].id as string,
  };
  const claves = [plantar(specA), plantar(specB), plantar(specC)];

  // Los señuelos: cada uno es la llave con UN solo rasgo cambiado.
  const variantesFormato = (base: Spec): Partial<Spec>[] => {
    const d = (base.codigo.match(/LLV-(\d{4})-K7/) ?? [])[1] ?? '0000';
    return [
      { codigo: `LLU-${d}-K7` },
      { codigo: `LLV-${d}-K9` },
      { codigo: `LLV-${d.slice(1)}-K7` },
      { codigo: `LLV-${d}-k7` },
      { tamano: 63 },
      { tamano: 65 },
    ];
  };
  const cambios: Partial<Spec>[][] = [
    // A: activa · subsistema · núcleo
    [
      ...variantesFormato(specA),
      { estado: 'archivado' }, { estado: 'corrupto' },
      { propietario_id: propRobot[0].id as string }, { propietario_id: propHum[2].id as string },
      { modulo_id: modulos.find((m) => m.sistema === 'red')!.id as string },
      { modulo_id: modulos.find((m) => m.sistema === 'energia')!.id as string },
    ],
    // B: nivel máximo · seguridad · externo
    [
      ...variantesFormato(specB),
      { nivel: 8 }, { nivel: 5 },
      { etiqueta_id: etqOp[2].id as string }, { etiqueta_id: etqHist[0].id as string },
      { modulo_id: modInterno[0].id as string }, { modulo_id: modInterno[1].id as string },
    ],
    // C: archivada · referencia a la maestra
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
    const cod = [`LLV-${d}-K7`, `LLV-${d}-K7`, `LLU-${d}-K7`, `LLV-${d}-K1`, `L1V-${d}-K7`][az(5)];
    const idx = libres.pop()!;
    frags[idx].codigo = cod;
    if (az(2) === 0) frags[idx].tamano = 64;
  }

  const bd: BD = {
    tablas: new Map([
      ['fragmentos', { nombre: 'fragmentos', columnas: ['id', 'codigo', 'modulo_id', 'propietario_id', 'etiqueta_id', 'referencia_id', 'estado', 'nivel', 'tamano'], filas: frags }],
      ['modulos', { nombre: 'modulos', columnas: ['id', 'nombre', 'sistema', 'enlace'], filas: modulos }],
      ['propietarios', { nombre: 'propietarios', columnas: ['id', 'nombre', 'tipo'], filas: propietarios }],
      ['etiquetas', { nombre: 'etiquetas', columnas: ['id', 'nombre', 'categoria'], filas: etiquetas }],
    ]),
    triggers: [],
    catalogoTriggers: false,
    seqBitacora: 0,
  };

  // Que cada llave sea ÚNICA no se deja a la suerte de la semilla: se
  // ejecuta su consulta y todo lo que cuele se descarta (tamano 63 rompe
  // el formato de las tres).
  for (let k = 0; k < 3; k++) {
    const s = analizar(SOLUCIONES[k]);
    if (s.tipo !== 'select') throw new Error('solucion no es SELECT');
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      const r = ejecutarSelect(s.sel, bd);
      const intrusos = r.base.filter((f) => f && f.id !== claves[k]);
      if (intrusos.length === 0) break;
      for (const f of intrusos) f!.tamano = 63;
    }
  }

  return { bd, claves };
}

const MUNDO1 = construirMundo1();
const LLAVES = MUNDO1.claves;

// ============================================================
//  PARTE 2 · la memoria con respaldos y triggers
// ============================================================

const DATOS2 = ['fragmentos', 'modulos', 'propietarios', 'etiquetas',
  'respaldo_fragmentos', 'respaldo_modulos', 'respaldo_propietarios', 'bitacora'];

function construirMundo2(): BD {
  const az = generador(20261105);
  const pick = <T>(a: T[]): T => a[az(a.length)];

  const modulos: Fila[] = Array.from({ length: 100 }, (_, i) => ({
    id: `M-${nn(i + 1, 3)}`, nombre: `mod_${nn(i + 1, 3)}`, sistema: pick(SISTEMAS),
  }));
  const propietarios: Fila[] = Array.from({ length: 120 }, (_, i) => ({
    id: `P-${nn(i + 1, 3)}`, nombre: `prop_${nn(i + 1, 3)}`, tipo: pick(['humano', 'humano', 'subsistema', 'robot']),
  }));
  const etiquetas: Fila[] = Array.from({ length: 120 }, (_, i) => ({
    id: `E-${nn(i + 1, 3)}`, nombre: `etq_${nn(i + 1, 3)}`, categoria: pick(['seguridad', 'operacion', 'historial']),
  }));
  const frags: Fila[] = Array.from({ length: 1300 }, (_, i) => ({
    id: `F-${nn(i + 1, 4)}`,
    codigo: `${pick(['DAT', 'LOG', 'CFG', 'TMP'])}-${nn(az(10000), 4)}-${'ABCDEFGHIJ'[az(10)]}${az(10)}`,
    modulo_id: pick(modulos).id,
    propietario_id: pick(propietarios).id,
    estado: pick(['activo', 'archivado', 'corrupto']),
  }));

  // El respaldo de fragmentos es PARCIAL (450 de 1300): el robot no lo
  // copia todo, y eso es lo que impide resolverlo borrando "las copias"
  // a ciegas.
  const orden = Array.from({ length: frags.length }, (_, i) => i);
  for (let i = orden.length - 1; i > 0; i--) {
    const j = az(i + 1);
    [orden[i], orden[j]] = [orden[j], orden[i]];
  }
  const copiados = orden.slice(0, 450).sort((a, b) => a - b).map((i) => ({ ...frags[i] }));

  const bitacora: Fila[] = Array.from({ length: 90 }, (_, i) => ({
    id: `B-${nn(i + 1, 4)}`, evento: pick(['arranque', 'copia', 'sincronia', 'latido']), detalle: `ciclo ${i + 1}`,
  }));

  const mk = (nombre: string, columnas: string[], filas: Fila[]) => [nombre, { nombre, columnas, filas }] as const;
  const colF = ['id', 'codigo', 'modulo_id', 'propietario_id', 'estado'];
  const colM = ['id', 'nombre', 'sistema'];
  const colP = ['id', 'nombre', 'tipo'];

  const triggers: TriggerDef[] = [
    { id: 'TR-01', nombre: 'trg_restaurar_frag', tabla: 'fragmentos', evento: 'DELETE', activo: true,
      efecto: { tipo: 'reponer', desde: 'respaldo_fragmentos' },
      accion: 'al borrar de fragmentos, vuelve a insertar las filas que tengan copia en respaldo_fragmentos' },
    { id: 'TR-02', nombre: 'trg_replicar_respaldo', tabla: 'respaldo_fragmentos', evento: 'DELETE', activo: true,
      efecto: { tipo: 'reponer', desde: 'fragmentos' },
      accion: 'al borrar de respaldo_fragmentos, vuelve a copiar las filas que sigan existiendo en fragmentos' },
    { id: 'TR-03', nombre: 'trg_restaurar_mod', tabla: 'modulos', evento: 'DELETE', activo: true,
      efecto: { tipo: 'reponer', desde: 'respaldo_modulos' },
      accion: 'al borrar de modulos, vuelve a insertar las filas que tengan copia en respaldo_modulos' },
    { id: 'TR-04', nombre: 'trg_restaurar_prop', tabla: 'propietarios', evento: 'DELETE', activo: true,
      efecto: { tipo: 'reponer', desde: 'respaldo_propietarios' },
      accion: 'al borrar de propietarios, vuelve a insertar las filas que tengan copia en respaldo_propietarios' },
    { id: 'TR-05', nombre: 'trg_latido', tabla: 'bitacora', evento: 'DELETE', activo: true,
      efecto: { tipo: 'registrar', detalle: 'latido' },
      accion: 'al borrar de bitacora, anade una fila nueva a bitacora (el latido del robot)' },
    { id: 'TR-06', nombre: 'trg_auditoria_etq', tabla: 'etiquetas', evento: 'DELETE', activo: true,
      efecto: { tipo: 'registrar', detalle: 'auditoria' },
      accion: 'al borrar de etiquetas, anade una fila a bitacora' },
    { id: 'TR-07', nombre: 'trg_restaurar_frag_v0', tabla: 'fragmentos', evento: 'DELETE', activo: false,
      efecto: { tipo: 'reponer', desde: 'respaldo_fragmentos' },
      accion: 'version antigua de trg_restaurar_frag (desactivada)' },
    { id: 'TR-08', nombre: 'trg_sello_fecha', tabla: 'fragmentos', evento: 'INSERT', activo: true,
      efecto: { tipo: 'inocuo' },
      accion: 'al insertar en fragmentos, rellena la fecha de creacion' },
    { id: 'TR-09', nombre: 'trg_validar_nivel', tabla: 'modulos', evento: 'UPDATE', activo: true,
      efecto: { tipo: 'inocuo' },
      accion: 'al actualizar modulos, comprueba que el sistema sea uno de los cinco validos' },
    { id: 'TR-10', nombre: 'trg_cuenta_prop', tabla: 'propietarios', evento: 'INSERT', activo: true,
      efecto: { tipo: 'inocuo' },
      accion: 'al insertar en propietarios, actualiza el contador interno de altas' },
  ];

  return {
    tablas: new Map([
      mk('fragmentos', colF, frags),
      mk('modulos', colM, modulos),
      mk('propietarios', colP, propietarios),
      mk('etiquetas', ['id', 'nombre', 'categoria'], etiquetas),
      mk('respaldo_fragmentos', colF, copiados),
      mk('respaldo_modulos', colM, modulos.map((m) => ({ ...m }))),
      mk('respaldo_propietarios', colP, propietarios.map((p) => ({ ...p }))),
      mk('bitacora', ['id', 'evento', 'detalle'], bitacora),
    ]),
    triggers,
    catalogoTriggers: true,
    seqBitacora: bitacora.length,
  };
}

const BASE2 = construirMundo2();
const contarFilas = (db: BD) => DATOS2.reduce((n, t) => n + (db.tablas.get(t)?.filas.length ?? 0), 0);
const TOTAL2 = contarFilas(BASE2);

function reconstruir(log: string[]): BD {
  const db = clonarBD(BASE2);
  for (const s of log) {
    try { aplicarMutacion(analizar(s), db); } catch { /* el log solo guarda lo que ya funcionó */ }
  }
  return db;
}

/** Para las pruebas: el mundo entero, sin pasar por el socket. */
export const bovedaPrueba = { MUNDO1, LLAVES, TOTAL2, DATOS2, BASE2, reconstruir, contarFilas };

// ============================================================
//  Diccionario de datos (lo que ve Datos)
// ============================================================

function esquema1() {
  return {
    titulo: 'Memoria del robot · diccionario de datos',
    nota: 'Tu tienes el mapa de la memoria: que tablas hay, como se unen, que valores admite cada columna '
        + 'y que llaves hacen falta. Es lo que sabemos DESCIFRADO del codigo del robot, no una verdad '
        + 'garantizada: la columna «confianza» dice cuanto nos fiamos. Los registros no los ve nadie de golpe: '
        + 'se le preguntan a la memoria, y quien ve las respuestas es Pantalla.',
    lienzo: { w: 1000, h: 470 },
    tablas: [
      {
        id: 'tablas', nombre: 'tablas', x: 40, y: 30, w: 440,
        descripcion: 'Que hay en la memoria y como se une', clave: 'id',
        columnas: ['id', 'tabla', 'registros', 'se une con', 'confianza'],
        filas: [
          ['T1', 'fragmentos', String(N_FRAG), 'modulos (modulo_id) · propietarios (propietario_id) · etiquetas (etiqueta_id) · fragmentos (referencia_id)', 'media'],
          ['T2', 'modulos', '120', 'fragmentos, por id', 'alta'],
          ['T3', 'propietarios', '180', 'fragmentos, por id', 'alta'],
          ['T4', 'etiquetas', '300', 'fragmentos, por id', 'alta'],
        ],
      },
      {
        id: 'columnas', nombre: 'columnas', x: 40, y: 250, w: 440,
        descripcion: 'Que se puede preguntar y con que valores', clave: 'id',
        columnas: ['id', 'tabla', 'columna', 'valores que admite', 'confianza'],
        filas: [
          ['K1', 'fragmentos', 'id', 'F-0001 ... F-1800', 'alta'],
          ['K2', 'fragmentos', 'codigo', 'texto. El de una llave sigue `formato_llave`', 'alta'],
          ['K3', 'fragmentos', 'modulo_id', 'M-001 ... M-120', 'alta'],
          ['K4', 'fragmentos', 'propietario_id', 'P-001 ... P-180', 'alta'],
          ['K5', 'fragmentos', 'etiqueta_id', 'E-001 ... E-300', 'alta'],
          ['K6', 'fragmentos', 'referencia_id', 'otro fragmento (F-...), o vacio (NULL)', 'media'],
          ['K7', 'fragmentos', 'estado', 'activo · archivado · corrupto', 'alta'],
          ['K8', 'fragmentos', 'nivel', '1 a 5', 'media'],
          ['K9', 'fragmentos', 'tamano', 'numero entero, en KB', 'media'],
          ['K10', 'modulos', 'sistema', 'nucleo · red · energia · sensores · memoria', 'alta'],
          ['K11', 'modulos', 'enlace', 'interno · externo', 'alta'],
          ['K12', 'propietarios', 'tipo', 'robot · humano', 'media'],
          ['K13', 'etiquetas', 'nombre', 'texto libre', 'alta'],
          ['K14', 'etiquetas', 'categoria', 'seguridad · operacion · historial', 'alta'],
        ],
      },
      {
        id: 'encargo', nombre: 'encargo', x: 520, y: 30, w: 440,
        descripcion: 'Las tres llaves que hacen falta', clave: 'id',
        columnas: ['id', 'requisito'],
        filas: [
          ['R1', 'LLAVE 1 · estado: activo · su propietario es un subsistema del robot (ni una persona, ni el robot entero) · su modulo es del sistema nucleo'],
          ['R2', 'LLAVE 2 · su nivel es el MAS ALTO que exista en toda la memoria · su etiqueta es de la categoria seguridad · su modulo tiene enlace externo'],
          ['R3', 'LLAVE 3 · estado: archivado · apunta (referencia_id) a otro fragmento cuya etiqueta se llama llave_maestra'],
          ['R4', 'Las tres cumplen ademas el formato de llave (ver `formato_llave`)'],
          ['R5', 'Cada llave es UNA sola fila. Si una consulta devuelve mas, algo sobra. Guardala como vista y probala.'],
        ],
      },
      {
        id: 'formato_llave', nombre: 'formato_llave', x: 520, y: 250, w: 440,
        descripcion: 'Como es el codigo de una llave', clave: 'id',
        columnas: ['id', 'rasgo'],
        filas: [
          ['L1', 'codigo: LLV, un guion, cuatro cifras, un guion y K7. Ejemplo de forma: LLV-0000-K7'],
          ['L2', 'tamano: exactamente 64'],
          ['L3', 'Se escribe asi, tal cual: las mayusculas importan'],
          ['L4', 'Hay copias casi iguales. Un solo rasgo distinto basta para que no sea una llave'],
        ],
      },
    ],
    relaciones: [],
  };
}

function esquema2() {
  return {
    titulo: 'Memoria del robot · borrado y respaldos',
    nota: 'Tenemos las tres llaves. Ahora hay que vaciar su memoria entera, pero el robot guarda copias '
        + 'y tiene reglas automaticas (triggers) que se disparan al borrar. Este es el mapa nuevo. '
        + 'El catalogo `sistema_triggers` es de solo lectura: lo que dice es lo que hace cada regla.',
    lienzo: { w: 1000, h: 470 },
    tablas: [
      {
        id: 'tablas', nombre: 'tablas', x: 40, y: 30, w: 440,
        descripcion: 'Que hay en la memoria ahora', clave: 'id',
        columnas: ['id', 'tabla', 'registros', 'nota'],
        filas: [
          ['T1', 'fragmentos', '1300', 'los archivos de la memoria'],
          ['T2', 'modulos', '100', ''],
          ['T3', 'propietarios', '120', ''],
          ['T4', 'etiquetas', '120', ''],
          ['T5', 'respaldo_fragmentos', '450', 'copia PARCIAL de fragmentos (mismo id)'],
          ['T6', 'respaldo_modulos', '100', 'copia completa de modulos'],
          ['T7', 'respaldo_propietarios', '120', 'copia completa de propietarios'],
          ['T8', 'bitacora', '90', 'lo que el sistema anota'],
          ['T9', 'sistema_triggers', '10', 'catalogo de reglas automaticas (solo lectura, no cuenta)'],
        ],
      },
      {
        id: 'columnas', nombre: 'columnas', x: 40, y: 250, w: 440,
        descripcion: 'Que se puede preguntar', clave: 'id',
        columnas: ['id', 'tabla', 'columna', 'valores que admite'],
        filas: [
          ['K1', 'fragmentos', 'id · codigo · modulo_id · propietario_id · estado', 'estado: activo · archivado · corrupto'],
          ['K2', 'modulos', 'id · nombre · sistema', 'sistema: nucleo · red · energia · sensores · memoria'],
          ['K3', 'propietarios', 'id · nombre · tipo', 'tipo: robot · humano · subsistema'],
          ['K4', 'etiquetas', 'id · nombre · categoria', 'categoria: seguridad · operacion · historial'],
          ['K5', 'respaldo_*', 'las mismas columnas que la tabla que copian', ''],
          ['K6', 'bitacora', 'id · evento · detalle', ''],
          ['K7', 'sistema_triggers', 'id · nombre · tabla · evento · accion · activo', 'evento: INSERT · UPDATE · DELETE · activo: 1 o 0'],
        ],
      },
      {
        id: 'encargo', nombre: 'encargo', x: 520, y: 30, w: 440,
        descripcion: 'Que hay que conseguir', clave: 'id',
        columnas: ['id', 'requisito'],
        filas: [
          ['Q1', 'Objetivo: que NINGUNA de las 8 primeras tablas tenga ni una sola fila (sistema_triggers no cuenta)'],
          ['Q2', 'El robot guarda copias de su memoria en las tablas respaldo_*'],
          ['Q3', 'Y tiene triggers: reglas que se disparan solas al borrar y vuelven a llenar tablas'],
          ['Q4', 'Un trigger se puede eliminar (DROP TRIGGER) o desactivar (DISABLE TRIGGER)'],
          ['Q5', 'Cuidado: no todos los triggers restauran memoria. Quitar uno que el robot necesita para funcionar le avisa, y el robot reacciona'],
        ],
      },
      {
        id: 'respaldos', nombre: 'respaldos', x: 520, y: 250, w: 440,
        descripcion: 'Que copia que', clave: 'id',
        columnas: ['id', 'copia', 'de', 'cobertura'],
        filas: [
          ['C1', 'respaldo_fragmentos', 'fragmentos', '450 de 1300'],
          ['C2', 'respaldo_modulos', 'modulos', '100 de 100'],
          ['C3', 'respaldo_propietarios', 'propietarios', '120 de 120'],
          ['C4', '(ninguna)', 'etiquetas', 'sin respaldo'],
        ],
      },
    ],
    relaciones: [],
  };
}

// ============================================================
//  Cámaras
// ============================================================

const CAMARAS_1: CamaraDef[] = [
  { n: 1, id: 'archivo', nombre: 'ARCHIVO', sector: 'B-01', que: 'cuantas filas devolvio la ultima consulta' },
  { n: 2, id: 'llavero', nombre: 'LLAVERO', sector: 'B-02', que: 'las llaves que ya estan confirmadas' },
];
const CAMARAS_2: CamaraDef[] = [
  { n: 1, id: 'memoria', nombre: 'MEMORIA', sector: 'B-01', que: 'cuantas filas le quedan a la memoria' },
  { n: 2, id: 'respaldos', nombre: 'RESPALDOS', sector: 'B-02', que: 'lo que se restaura solo' },
];

const parteDe = (estado: Record<string, unknown>): 1 | 2 => (numero(estado, 'parte') === 2 ? 2 : 1);

/** Barra de 20 cajones en escala LOGARÍTMICA: de 2400 a 1 en lineal, los
 *  últimos pasos pintaban todos un cajón y no se veía nada interesante. */
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

  const restan = typeof estado.restan === 'number' ? (estado.restan as number) : TOTAL2;
  const repuestas = numero(estado, 'repuestas');
  const ultima = numero(estado, 'ultimaRepuestas');
  return circuitoCerrado(CAMARAS_2, estado, (cam) => {
    const escena: Escena = cam.id === 'memoria'
      ? {
        fotogramas: [0, 1, 2, 3].map((f) => escenaBarra(restan, TOTAL2, f,
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
//  Ayuda
// ============================================================

const TOPE_FILAS = 12;
const MAX_VISTAS = 8;

function ayuda(parte: 1 | 2): ResultadoComando {
  const comunes = [
    texto(
      [
        'SELECT [DISTINCT] columnas FROM tabla [alias]',
        '  [JOIN otra [alias] ON a.col = b.col] [LEFT JOIN ...]',
        '  [WHERE condiciones] [GROUP BY col] [ORDER BY col [DESC]] [LIMIT n]',
        '',
        'columnas: *, alias.*, columna, alias.columna, COUNT(*), ... AS nombre',
        'condiciones: =  !=  <  >  <=  >=  LIKE (% y _)  IN (...)  IS NULL',
        '             unidas con AND / OR / NOT y parentesis',
        'Los textos van entre comillas simples y distinguen mayusculas.',
        '',
        '  SELECT COUNT(*) FROM tabla WHERE col = \'valor\'',
        '  SELECT t.*, o.col FROM tabla t JOIN otra o ON t.o_id = o.id',
        '  SELECT col, COUNT(*) FROM tabla GROUP BY col',
      ],
      'Como se pregunta',
    ),
    texto(
      [
        'Esta terminal no sabe que tablas hay, ni que columnas, ni que valores',
        'admiten, ni que se esta buscando. Eso esta en el diccionario de datos,',
        'en la base de datos. Y no te fies del todo de el: puede estar equivocado.',
        '',
        `La memoria devuelve como mucho ${TOPE_FILAS} filas: si salen mas, no las ensena.`,
        'Eso no es una limitacion, es el ejercicio: cuenta primero, estrecha despues.',
      ],
      'Lo que esta terminal NO sabe',
    ),
  ];

  if (parte === 1) {
    return {
      bloques: [
        texto(
          [
            'SELECT ...                              — preguntar a la memoria',
            'CREATE VIEW <nombre> AS SELECT ...      — guardar una consulta como vista',
            'DROP VIEW <nombre>                      — quitar una vista',
            'vistas                                  — las vistas guardadas',
            'probar <vista>                          — comprobar si la vista es una llave',
            'estado                                  — como va',
            ...AYUDA_CAMARAS,
          ],
          'Comandos disponibles',
        ),
        ...comunes,
      ],
    };
  }
  return {
    bloques: [
      texto(
        [
          'SELECT ...                              — preguntar (tambien al catalogo de triggers)',
          'DELETE FROM <tabla> [WHERE ...]         — borrar filas',
          'DROP TRIGGER <nombre>                   — eliminar una regla automatica',
          'DISABLE TRIGGER <nombre>                — apagar una regla sin quitarla',
          'reiniciar                               — volver la memoria a como estaba',
          'estado                                  — como va',
          ...AYUDA_CAMARAS,
        ],
        'Comandos disponibles',
      ),
      ...comunes,
    ],
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
        return parte === 1 ? esquema1() : esquema2();

      case 'PANTALLA':
        return {
          salidas: ctx.salidas,
          camaras: vistaDeCamaras(ctx.estado),
          nota: parte === 1
            ? 'Tu ves la memoria por circuito cerrado y lo que contesta. Que se puede preguntar y que se busca '
              + 'lo tiene Datos. Quien escribe no ve nada: cantaselo.'
            : 'La memoria se esta vaciando. Mira lo que contesta y cuenta lo que se restaura solo: '
              + 'que tablas hay y que quiere el robot lo tiene Datos. Quien escribe no ve nada.',
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

    const bruto = comandoBruto.trim().replace(/;+\s*$/, '');
    const cmd = normalizar(bruto);
    const [verbo, ...resto] = cmd.split(' ');
    const arg = resto.join(' ');
    const parte = parteDe(ctx.estado);

    const mando = mandoDeCamaras(parte === 1 ? CAMARAS_1 : CAMARAS_2, verbo, arg, ctx.estado);
    if (mando) return mando;

    switch (verbo) {
      case 'ayuda':
      case 'help':
        return ayuda(parte);

      case 'estado':
        return estadoActual(ctx, parte);

      case 'vistas':
        return parte === 1 ? listarVistas(ctx) : sinVistas();

      case 'probar':
        return parte === 1 ? probar(arg, ctx) : sinVistas();

      case 'reiniciar':
        if (parte !== 2) return { bloques: [error('No hay nada que reiniciar todavia.')] };
        return {
          estado: { ...ctx.estado, log: [], restan: TOTAL2, repuestas: 0, ultimaRepuestas: 0 },
          bloques: [texto([`La memoria vuelve a tener ${TOTAL2} filas y los triggers que tenia.`], 'Reinicio')],
        };

      case 'select':
      case 'create':
      case 'drop':
      case 'delete':
      case 'disable':
        return comandoSql(bruto, ctx, parte);

      case 'buscar':
      case 'contar':
      case 'extraer':
        return {
          bloques: [
            error(`«${verbo}» ya no existe: la memoria se pregunta en SQL.`),
            texto(['Ejemplo: SELECT COUNT(*) FROM tabla WHERE columna = \'valor\'', '`ayuda` lo explica.']),
          ],
        };

      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto}». Prueba \`ayuda\`.`)] };
    }
  },
};

function sinVistas(): ResultadoComando {
  return { bloques: [error('En esta parte ya no hay vistas ni nada que probar: el objetivo es otro. Mira el encargo con Datos.')] };
}

function estadoActual(ctx: ContextoComando, parte: 1 | 2): ResultadoComando {
  if (parte === 1) {
    const n = listaDe(ctx.estado, 'confirmadas').length;
    const v = Object.keys((ctx.estado.vistas as Record<string, string>) ?? {}).length;
    return {
      bloques: [texto(
        [`Llaves confirmadas: ${n} de 3.`, `Vistas guardadas: ${v}.`, 'Que se busca lo dice el encargo: lo tiene Datos.'],
        'Estado',
      )],
    };
  }
  const restan = typeof ctx.estado.restan === 'number' ? (ctx.estado.restan as number) : TOTAL2;
  return {
    bloques: [texto(
      [`A la memoria le quedan ${restan} filas de ${TOTAL2}.`, 'Que tablas hay y cuales cuentan lo dice el encargo: lo tiene Datos.'],
      'Estado',
    )],
  };
}

function listarVistas(ctx: ContextoComando): ResultadoComando {
  const vistas = (ctx.estado.vistas as Record<string, string>) ?? {};
  const nombres = Object.keys(vistas);
  if (nombres.length === 0) {
    return { bloques: [texto(['No hay ninguna vista guardada.', 'CREATE VIEW <nombre> AS SELECT ...'], 'Vistas')] };
  }
  return { bloques: [texto(nombres.map((n) => `${n}  =  ${vistas[n]}`), 'Vistas')] };
}

function probar(nombre: string, ctx: ContextoComando): ResultadoComando {
  if (!nombre) return { bloques: [error('Falta la vista. `probar <vista>`.')] };
  const vistas = (ctx.estado.vistas as Record<string, string>) ?? {};
  const sql = vistas[nombre];
  if (!sql) return { bloques: [error(`No hay ninguna vista «${nombre}». \`vistas\` las lista.`)] };

  let r;
  try {
    const s = analizar(sql);
    if (s.tipo !== 'select') return { bloques: [error('La vista no es un SELECT.')] };
    r = ejecutarSelect(s.sel, MUNDO1.bd);
  } catch (e) {
    return fallaSql(e);
  }

  // Probar no es otra forma de buscar: sin una sola fila no hay nada que
  // comprobar y no se cobra. Lo que cuesta es afirmar una fila que no es.
  if (r.agregada) {
    return { bloques: [error('Probar necesita filas de fragmentos, no recuentos ni grupos.')] };
  }
  if (r.desde !== 'fragmentos') {
    return { bloques: [error('Una llave es un fragmento: la vista tiene que partir de FROM fragmentos.')] };
  }
  if (r.total !== 1) {
    return {
      bloques: [texto(
        [`«${nombre}» devuelve ${r.total} fila(s). Probar necesita exactamente UNA.`,
          r.total === 0 ? 'Hay alguna condicion que sobra o un valor que no es.' : 'Quedan candidatas de mas: sigue estrechando.'],
        'Todavia no',
      )],
    };
  }

  const fila = r.base[0]!;
  const confirmadas = listaDe(ctx.estado, 'confirmadas');
  const idx = LLAVES.indexOf(fila.id as string);

  if (idx === -1) {
    // Mismo rechazo para un señuelo y para un fragmento cualquiera: decir
    // cuál de las dos cosas falla sería ir resolviendo a base de probar.
    return rechazo(ctx, `«${nombre}» devuelve un fragmento que no es ninguna de las tres llaves. La memoria registra el intento.`);
  }
  if (confirmadas.includes(fila.id as string)) {
    return { bloques: [texto(['Esa llave ya estaba confirmada. Busca otra.'], 'Repetida')] };
  }

  const nuevas = [...confirmadas, fila.id as string];
  if (nuevas.length < 3) {
    return {
      estado: { ...ctx.estado, confirmadas: nuevas },
      bloques: [exito(`Llave confirmada (${nuevas.length} de 3)`, [
        `«${nombre}» devuelve una llave de verdad.`,
        'Faltan las otras. El encargo dice como son: lo tiene Datos.',
      ])],
    };
  }

  // Tercera llave: la fase NO termina, el robot reacciona.
  return {
    estado: {
      ...ctx.estado,
      confirmadas: nuevas,
      parte: 2,
      vistas: {},
      log: [],
      restan: TOTAL2,
      repuestas: 0,
      ultimaRepuestas: 0,
      camara: 1,
    },
    bloques: [
      exito('PARTE 1 SUPERADA · Las tres llaves son vuestras', [
        'La llave que lo construyo ya no esta escondida. Pero el robot lo ha notado:',
        '',
        '[!] ALERTA DEL ROBOT: «INTRUSION EN MEMORIA. ACTIVANDO RESTAURACION AUTOMATICA.»',
        '',
        '--- PASO A LA PARTE 2 (BORRAR LA MEMORIA) ---',
        '1. El diccionario de Datos ha cambiado: hay tablas nuevas y un encargo nuevo.',
        '2. Misma terminal, ahora tambien con DELETE, DROP TRIGGER y DISABLE TRIGGER.',
        '3. Esta vez no se trata de encontrar, sino de dejarlo todo vacio... y que se quede asi.',
      ]),
    ],
  };
}

function comandoSql(bruto: string, ctx: ContextoComando, parte: 1 | 2): ResultadoComando {
  let s: Sentencia;
  try { s = analizar(bruto); } catch (e) { return fallaSql(e); }

  try {
    switch (s.tipo) {
      case 'select': {
        const db = parte === 1 ? MUNDO1.bd : reconstruir(listaDe(ctx.estado, 'log'));
        const r = ejecutarSelect(s.sel, db);
        const embudo = parte === 1
          ? { quedan: r.total, consultas: numero(ctx.estado, 'consultas') + 1 }
          : {};
        const estado = { ...ctx.estado, ...embudo };

        if (r.total === 0) {
          return { estado, bloques: [texto(['Ningun registro cumple todas esas condiciones a la vez.',
            'O sobra una condicion, o alguna lleva un valor que esa columna no admite.'], '0 filas')] };
        }
        const limite = s.sel.limite !== undefined ? Math.min(s.sel.limite, TOPE_FILAS) : undefined;
        if (limite === undefined && r.total > TOPE_FILAS) {
          return { estado, bloques: [texto([
            `${r.total} filas. La memoria solo ensena ${TOPE_FILAS}.`,
            'Anade otra condicion: cada una tira registros. SELECT COUNT(*) te dice cuantos quedarian.',
          ], 'Demasiadas filas')] };
        }
        const filas = r.filas.slice(0, limite ?? TOPE_FILAS);
        return {
          estado,
          bloques: [
            tabla(`${r.total} fila(s)${filas.length < r.total ? ` · se ensenan ${filas.length}` : ''}`,
              r.columnas, filas.map((f) => f.map(fmt))),
            ...(r.total === 1 && !r.agregada && parte === 1
              ? [texto(['Una sola fila. Si es lo que buscais: CREATE VIEW <nombre> AS <esta consulta>, y `probar <nombre>`.'])]
              : []),
          ],
        };
      }

      case 'crear_vista': {
        if (parte !== 1) return sinVistas();
        if (!/^[a-z_][a-z0-9_]{0,30}$/.test(s.nombre)) {
          return { bloques: [error('El nombre de la vista tiene que ser una sola palabra (letras, numeros y _).')] };
        }
        if (MUNDO1.bd.tablas.has(s.nombre)) {
          return { bloques: [error(`«${s.nombre}» ya es una tabla: elige otro nombre.`)] };
        }
        const vistas = { ...((ctx.estado.vistas as Record<string, string>) ?? {}) };
        if (!(s.nombre in vistas) && Object.keys(vistas).length >= MAX_VISTAS) {
          return { bloques: [error(`Ya hay ${MAX_VISTAS} vistas guardadas. Quita alguna con DROP VIEW.`)] };
        }
        const r = ejecutarSelect(s.sel, MUNDO1.bd); // valida columnas y tablas
        vistas[s.nombre] = s.sql;
        return {
          estado: { ...ctx.estado, vistas },
          bloques: [texto([
            `Vista «${s.nombre}» guardada. Devuelve ${r.total} fila(s) ahora mismo.`,
            r.total === 1 ? '`probar ' + s.nombre + '` dice si es una llave.' : 'Cuando devuelva una sola, `probar ' + s.nombre + '`.',
          ], 'Vista')],
        };
      }

      case 'borrar_vista': {
        if (parte !== 1) return sinVistas();
        const vistas = { ...((ctx.estado.vistas as Record<string, string>) ?? {}) };
        if (!(s.nombre in vistas)) return { bloques: [error(`No hay ninguna vista «${s.nombre}».`)] };
        delete vistas[s.nombre];
        return { estado: { ...ctx.estado, vistas }, bloques: [texto([`Vista «${s.nombre}» eliminada.`])] };
      }

      case 'delete':
      case 'drop_trigger':
      case 'disable_trigger':
        return parte === 1
          ? { bloques: [error('La memoria es de solo lectura por ahora. Primero, encontrar las llaves.')] }
          : mutar(bruto, s, ctx);

      default:
        return { bloques: [error('No se entiende esa sentencia.')] };
    }
  } catch (e) {
    return fallaSql(e);
  }
}

function mutar(bruto: string, s: Sentencia, ctx: ContextoComando): ResultadoComando {
  const log = listaDe(ctx.estado, 'log');
  const db = reconstruir(log);

  if (s.tipo === 'drop_trigger' || s.tipo === 'disable_trigger') {
    const tr = buscarTrigger(db, s.nombre);
    if (!tr) {
      return { bloques: [error(`No existe ningun trigger llamado «${s.nombre}».`),
        texto(['El catalogo esta en `sistema_triggers`. SELECT * FROM sistema_triggers.'])] };
    }
    // Un trigger que no restaura nada es de funcionamiento: tocarlo es
    // acusar en falso, y cuesta como en el resto de fases.
    if (tr.efecto.tipo === 'inocuo') {
      return rechazo(ctx,
        `«${tr.nombre}» no restaura nada: el robot lo necesita para funcionar y nota que lo tocas.`);
    }
    if (s.tipo === 'disable_trigger' && !tr.activo) {
      return { bloques: [texto([`«${tr.nombre}» ya estaba desactivado.`])] };
    }
  }

  const r = aplicarMutacion(s, db);
  const restan = contarFilas(db);
  const repuestas = r.eventos.reduce((n, e) => n + e.repuestas, 0);
  const estado = {
    ...ctx.estado,
    log: r.borradas > 0 || s.tipo !== 'delete' ? [...log, bruto] : log,
    restan,
    repuestas: numero(ctx.estado, 'repuestas') + repuestas,
    ultimaRepuestas: repuestas,
  };

  if (restan === 0) {
    return {
      estado,
      resuelto: true,
      bloques: [
        texto([r.texto, ...r.eventos.map((e) => `[!] ${e.texto}`)], 'Borrado'),
        exito('MEMORIA VACIA · El robot ya no recuerda nada', [
          'Ninguna tabla tiene ni una fila, y ninguna regla va a volver a llenarlas.',
          '',
          'No bastaba con borrar: la memoria tenia copias, y las copias tenian reglas que las',
          'devolvian al sitio. Habeis tenido que leer las reglas, distinguir las que restauran',
          'de las que el robot necesita para funcionar, y apagar las primeras antes de vaciar.',
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
        s.tipo === 'delete' ? 'Borrado' : 'Trigger',
      ),
    ],
  };
}
