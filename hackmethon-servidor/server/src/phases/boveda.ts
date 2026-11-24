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
//      Embudo de filtros sobre una memoria desordenada, con señuelos que
//      imitan las llaves (nombres, etiquetas, formatos casi iguales). Hay
//      que unir tablas, desconfiar del diccionario (dos datos están
//      mal), guardar lo encontrado (de cualquiera de las 3 formas) y probarlo.
//    PARTE 2 · «Borrar la memoria»
//      Las mismas dos mil cuatrocientas filas, ahora con respaldos y
//      REGLAS (triggers) que las restauran. Hay que encontrar esas reglas
//      y apagar las que restauran, sin tocar las que el robot necesita.
//
//  EL REPARTO
//    PANTALLA  lo que devuelve la memoria y las cámaras. Nada más.
//    DATOS     el diccionario (con dos errores), el encargo y el formato
//              de una llave. No ve ni un registro.
//    TERMINAL  escribe consultas, y no ve nada.
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

/** Las tres consultas en Pseudo-SQL español que resuelven cada llave.
 *  Las usa la construcción del mundo (para garantizar que cada llave es
 *  ÚNICA) y las pruebas. */
export const SOLUCIONES = [
  'MOSTRAR TODO DE fragmentos JUNTO CON modulos, propietarios '
  + 'DONDE codigo TIENE FORMATO LLV-####-K7 Y tamano ES 64 Y estado ES activo '
  + 'Y tipo ES subsistema Y sistema ES nucleo',
  'MOSTRAR TODO DE fragmentos JUNTO CON modulos, etiquetas '
  + 'DONDE codigo TIENE FORMATO LLV-####-K7 Y tamano ES 64 Y nivel ES 9 '
  + 'Y categoria ES seguridad Y enlace ES externo',
  'MOSTRAR TODO DE fragmentos JUNTO CON referencia, etiquetas '
  + 'DONDE codigo TIENE FORMATO LLV-####-K7 Y tamano ES 64 Y estado ES archivado '
  + 'Y etiquetas.nombre ES llave_maestra',
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
        columnas: ['id', 'tabla', 'registros', 'se une con (JUNTO CON)', 'confianza'],
        filas: [
          ['T1', 'fragmentos', String(N_FRAG), 'modulos (modulo_id) · propietarios (propietario_id) · etiquetas (etiqueta_id) · referencia (referencia_id)', 'media'],
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
          ['R5', 'Cada llave es UNA sola fila. Si una consulta devuelve mas, algo sobra. Guardala con GUARDAR y compruebala con PROBAR.'],
        ],
      },
      {
        id: 'formato_llave', nombre: 'formato_llave', x: 520, y: 250, w: 440,
        descripcion: 'Como es el codigo de una llave', clave: 'id',
        columnas: ['id', 'rasgo'],
        filas: [
          ['L1', 'codigo: LLV, un guion, cuatro cifras, un guion y K7. Patron: LLV-####-K7'],
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
          ['Q3', 'Y tiene reglas automaticas (triggers): se disparan solas al borrar y vuelven a llenar tablas'],
          ['Q4', 'Una regla se puede apagar (APAGAR REGLA <nombre>) o borrar (BORRAR REGLA <nombre>)'],
          ['Q5', 'Cuidado: no todas las reglas restauran memoria. Quitar una que el robot necesita para funcionar le avisa, y el robot reacciona'],
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
//  Ayuda y Manual detallado de Consultas (`consultas`)
// ============================================================

const TOPE_FILAS = 12;
const MAX_VISTAS = 8;

function ayuda(parte: 1 | 2): ResultadoComando {
  const pie = texto(
    [
      '>>> ESCRIBE `consultas` PARA ABRIR EL MANUAL COMPLETO <<<',
      'En `consultas` tienes explicada cada consulta, cada filtro y cada',
      'operacion logica con ejemplos listos para usar.',
      '',
      'Esta terminal no sabe que tablas hay, ni que columnas, ni que valores',
      'admiten, ni que se esta buscando. Todo eso lo tiene Datos (y cuidado:',
      'no todo lo que dice el diccionario es 100% seguro).',
      `La memoria ensena como maximo ${TOPE_FILAS} filas por consulta.`,
    ],
    'Manual detallado y reglas',
  );

  if (parte === 1) {
    return {
      bloques: [
        texto(
          [
            'consultas                               — VER MANUAL de consultas, filtros y logica',
            'CONTAR <tabla> [DONDE ...]              — cuantas filas cumplen, sin traerlas',
            'MOSTRAR TODO DE <tabla> [DONDE ...]     — ver las filas que cumplen (max. 12)',
            'MOSTRAR DISTINTOS <col> DE <tabla>      — ver que valores existen de verdad',
            'GUARDAR <nombre | codigo | consulta>    — guardar una llave candidata (3 formas)',
            'PROBAR <nombre | codigo>                — comprobar si lo guardado es una llave',
            'guardados                               — ver lo que llevas guardado',
            'estado                                  — cuantas llaves llevas (de 3)',
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
          'MOSTRAR TODO DE <tabla> [DONDE ...]     — consultar tablas o `sistema_triggers`',
          'CONTAR <tabla> [DONDE ...]              — cuantas filas quedan en una tabla',
          'BORRAR TODO DE <tabla> (o VACIAR <t>)   — vaciar todas las filas de una tabla',
          'BORRAR DE <tabla> DONDE ...             — borrar solo las filas que cumplan',
          'APAGAR REGLA <nombre>                   — desactivar una regla automatica (trigger)',
          'BORRAR REGLA <nombre>                   — eliminar una regla automatica (trigger)',
          'reiniciar                               — devolver la memoria a sus 2400 filas',
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
      '1) CONTAR <tabla> [JUNTO CON ...] [DONDE ...]',
      '   Dice cuantas filas cumplen la condicion sin mostrarlas. Usalo primero para',
      '   saber si tu filtro deja demasiadas filas o si ya aislaste una sola.',
      '   Ejemplo: CONTAR fragmentos DONDE estado ES activo',
      '',
      '2) MOSTRAR TODO DE <tabla> [JUNTO CON ...] [DONDE ...]',
      '   Trae todas las columnas de las filas que cumplan (si son 12 o menos).',
      '   Tambien puedes pedir columnas sueltas: MOSTRAR id, codigo, nivel DE fragmentos',
      '',
      '3) MOSTRAR DISTINTOS <columna> DE <tabla>',
      '   Muestra todos los valores diferentes que existen realmente en esa columna.',
      '   Ideal para comprobar si el diccionario de Datos se dejo algun valor fuera.',
      '   Ejemplo: MOSTRAR DISTINTOS tipo DE propietarios',
      '',
      '4) ... JUNTO CON <otra_tabla> [, <otra_tabla_2>]',
      '   Une tablas relacionadas para poder filtrar por columnas que estan en otra tabla.',
      '   Si un fragmento apunta a otro (referencia_id), puedes unir con `referencia`.',
      '   Ejemplo: MOSTRAR TODO DE fragmentos JUNTO CON modulos, propietarios DONDE ...',
      '   Ejemplo: MOSTRAR TODO DE fragmentos JUNTO CON referencia, etiquetas DONDE ...',
      '',
      '5) ... ORDENADO POR <columna> DESCENDENTE [LIMITE <n>]',
      '   Ordena los resultados de mayor a menor (DESCENDENTE) o menor a mayor (ASCENDENTE)',
      '   y con LIMITE corta cuantas filas quieres ver.',
      '   Ejemplo: MOSTRAR nivel DE fragmentos ORDENADO POR nivel DESCENDENTE LIMITE 5',
    ],
    '1. Consultas (como pedir y cruzar datos)',
  );

  const bloqueFiltros = texto(
    [
      'Van despues de la palabra DONDE. No hace falta poner comillas en palabras sueltas:',
      '',
      '· ES / NO ES             Compara si una columna es igual o distinta a un valor.',
      '                         Ej: estado ES activo   |   estado NO ES corrupto',
      '',
      '· MAYOR QUE / MENOR QUE  Compara numeros (tambien MAYOR O IGUAL A, MENOR O IGUAL A).',
      '                         Ej: tamano ES 64   |   nivel MAYOR QUE 5',
      '',
      '· TIENE FORMATO <patron> Comprueba la forma exacta de un codigo:',
      '                         `#` representa un numero (0-9) y `?` cualquier caracter.',
      '                         Respeta mayusculas y minusculas.',
      '                         Ej: codigo TIENE FORMATO LLV-####-K7',
      '',
      '· EMPIEZA CON /          Busca textos por su inicio, su final o su contenido.',
      '  TERMINA CON / CONTIENE Ej: codigo EMPIEZA CON LLV   |   nombre CONTIENE maestra',
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
      '· Y    Exige que se cumplan TODAS las condiciones a la vez (estrecha el embudo).',
      '       Ej: DONDE estado ES activo Y tamano ES 64 Y sistema ES nucleo',
      '',
      '· O    Acepta filas que cumplan CUALQUIERA de las condiciones.',
      '       Ej: DONDE estado ES activo O estado ES archivado',
      '',
      '· NO   Invierte un filtro para descartar lo que no quieres.',
      '       Ej: DONDE estado NO ES corrupto   |   DONDE codigo NO TIENE FORMATO LLV-####-K7',
    ],
    '3. Operaciones logicas (Y, O, NO)',
  );

  const bloqueAccion = parte === 1
    ? texto(
      [
        'Cuando encuentres una llave (1 sola fila), puedes guardarla de 3 formas:',
        '',
        '· Forma 1 (Guardar tu ultima consulta):',
        '  Primero lanzas tu `MOSTRAR TODO DE fragmentos ...` y cuando veas 1 fila:',
        '  GUARDAR llave1',
        '',
        '· Forma 2 (Guardar escribiendo la consulta directa):',
        '  GUARDAR llave1 DE fragmentos JUNTO CON modulos DONDE ...',
        '',
        '· Forma 3 (Guardar el codigo o ID que salio en Pantalla):',
        '  GUARDAR LLV-4829-K7    (o `GUARDAR llave1 LLV-4829-K7`, o el id `F-0173`)',
        '',
        'Y para verificar si de verdad es una de las 3 llaves del robot:',
        '  PROBAR llave1          (o `PROBAR LLV-4829-K7`)',
        '  Nota: Probar un senuelo equivocado activa la cuarentena de seguridad.',
      ],
      '4. Como Guardar y Probar las llaves (Parte 1)',
    )
    : texto(
      [
        'En la Parte 2 hay que dejar las 8 tablas de datos con 0 filas:',
        '',
        '· Consultar las reglas automaticas del robot:',
        '  MOSTRAR TODO DE sistema_triggers',
        '',
        '· Desactivar o borrar una regla que restaura memoria:',
        '  APAGAR REGLA <nombre>     (o `BORRAR REGLA <nombre>`)',
        '  Cuidado: no apagues reglas que no restauran memoria (las de INSERT o UPDATE).',
        '',
        '· Vaciar una tabla entera o borrar con filtro:',
        '  BORRAR TODO DE <tabla>    (o `VACIAR <tabla>`)',
        '  BORRAR DE <tabla> DONDE estado ES corrupto',
      ],
      '4. Como Apagar Reglas y Borrar la Memoria (Parte 2)',
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
          pista: 'Escribe `ayuda` o `consultas` y pregunta a Pantalla que aparecio.',
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
        if (arg === 'consultas' || arg === 'filtros' || arg === 'sql' || arg === 'manual') {
          return manualConsultas(parte);
        }
        return ayuda(parte);

      case 'consultas':
      case 'filtros':
      case 'manual':
        return manualConsultas(parte);

      case 'estado':
        return estadoActual(ctx, parte);

      case 'vistas':
      case 'guardados':
      case 'guardadas':
        return parte === 1 ? listarVistas(ctx) : sinVistas();

      case 'guardar':
        return parte === 1 ? ejecutarGuardar(bruto, ctx) : sinVistas();

      case 'probar':
        return parte === 1 ? probar(bruto.slice(verbo.length).trim(), ctx) : sinVistas();

      case 'reiniciar':
        if (parte !== 2) return { bloques: [error('No hay nada que reiniciar todavia.')] };
        return {
          estado: { ...ctx.estado, log: [], restan: TOTAL2, repuestas: 0, ultimaRepuestas: 0 },
          bloques: [texto([`La memoria vuelve a tener ${TOTAL2} filas y las reglas que tenia.`], 'Reinicio')],
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
        return comandoSql(bruto, ctx, parte);

      case 'extraer':
        return {
          bloques: [
            error('Usa `GUARDAR` y luego `PROBAR` para validar cada una de las 3 llaves.'),
            texto(['Escribe `consultas` para ver las 3 formas de guardar y probar.']),
          ],
        };

      default:
        return { bloques: [error(`Comando no reconocido: «${comandoBruto}». Prueba \`ayuda\` o \`consultas\`.`)] };
    }
  },
};

function sinVistas(): ResultadoComando {
  return { bloques: [error('En esta parte ya no hay que guardar ni probar llaves: el objetivo es vaciar la memoria. Mira el encargo con Datos.')] };
}

function estadoActual(ctx: ContextoComando, parte: 1 | 2): ResultadoComando {
  if (parte === 1) {
    const n = listaDe(ctx.estado, 'confirmadas').length;
    const v = Object.keys((ctx.estado.vistas as Record<string, string>) ?? {}).length;
    return {
      bloques: [texto(
        [`Llaves confirmadas: ${n} de 3.`, `Candidatas guardadas: ${v}.`, 'Que se busca lo dice el encargo: lo tiene Datos.'],
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
    return {
      bloques: [texto([
        'No hay ninguna llave candidata guardada todavia.',
        'Puedes guardar de 3 formas:',
        '  1) `GUARDAR llave1` (guarda tu ultima consulta)',
        '  2) `GUARDAR llave1 DE fragmentos DONDE ...`',
        '  3) `GUARDAR <codigo_o_id>` (ej. `GUARDAR LLV-0000-K7`)',
      ], 'Guardados')],
    };
  }
  return { bloques: [texto(nombres.map((n) => `${n}  =  ${vistas[n]}`), 'Guardados')] };
}

/**
 * Busca si un token corresponde directamente al `id` (ej. `F-0173`) o al
 * `codigo` (ej. `LLV-4829-K7`) de un fragmento de la memoria.
 */
function buscarFragmentoPorCodigoOId(token: string): Fila | null {
  const limpio = token.trim().replace(/^['"]|['"]$/g, '');
  if (!limpio) return null;
  const upper = limpio.toUpperCase();
  const frags = MUNDO1.bd.tablas.get('fragmentos')!.filas;
  // 1) Coincidencia exacta de código (respetando mayúsculas, ej. K7 vs k7) o de ID (F-0173)
  const exacto = frags.find((f) => String(f.id).toUpperCase() === upper || String(f.codigo) === limpio);
  if (exacto) return exacto;
  // 2) Si escribió el código en minúsculas pero solo hay uno o quiere probarlo
  return frags.find((f) => String(f.codigo).toUpperCase() === upper) ?? null;
}

/**
 * Implementa las 3 formas de `GUARDAR`:
 *   1) `GUARDAR <nombre>` -> guarda `ctx.estado.ultimaConsulta`
 *   2) `GUARDAR <nombre> DE <tabla> ...` o `GUARDAR [EN] <nombre> [COMO] MOSTRAR ...`
 *   3) `GUARDAR <codigo_o_id>` o `GUARDAR <nombre> <codigo_o_id>`
 */
function ejecutarGuardar(bruto: string, ctx: ContextoComando): ResultadoComando {
  const cuerpo = bruto.replace(/^\s*guardar\s+/i, '').trim();
  if (!cuerpo) {
    return {
      bloques: [
        error('Falta indicar que quieres guardar.'),
        texto([
          'Formas de usar GUARDAR:',
          '  1) `GUARDAR llave1` (guarda la ultima consulta que hiciste)',
          '  2) `GUARDAR llave1 DE fragmentos DONDE ...`',
          '  3) `GUARDAR <codigo_o_id>` (ej. `GUARDAR F-0173` o `GUARDAR LLV-0000-K7`)',
        ]),
      ],
    };
  }

  // Quitamos conectores iniciales opcionales: `EN`, `COMO`, `VISTA`
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
    if (MUNDO1.bd.tablas.has(nombre)) {
      return { bloques: [error(`«${nombre}» ya es el nombre de una tabla: elige otro (ej. \`llave1\`).`)] };
    }
    if (!(nombre in vistas) && Object.keys(vistas).length >= MAX_VISTAS) {
      return { bloques: [error(`Ya hay ${MAX_VISTAS} guardados. Borra alguno con \`BORRAR VISTA <nombre>\`.`)] };
    }
    let r;
    try {
      const s = analizar(sqlGuardar);
      if (s.tipo !== 'select') return { bloques: [error('Solo se pueden guardar consultas.')] };
      r = ejecutarSelect(s.sel, MUNDO1.bd);
    } catch (e) {
      return fallaSql(e);
    }
    vistas[nombre] = sqlGuardar;
    return {
      estado: { ...ctx.estado, vistas, ultimoGuardado: nombre },
      bloques: [texto([
        `Guardado como «${nombre}». Devuelve ${r.total} fila(s) ahora mismo.`,
        r.total === 1
          ? `Escribe \`PROBAR ${nombre}\` para comprobar si es una de las 3 llaves.`
          : `Cuando devuelva 1 sola fila, podras comprobarla con \`PROBAR ${nombre}\`.`,
      ], 'Guardado')],
    };
  };

  // --- Caso A: Solo 1 palabra (`GUARDAR llave1` o `GUARDAR LLV-4829-K7` o `GUARDAR F-0173`)
  if (!resto) {
    const frag = buscarFragmentoPorCodigoOId(primeroRaw);
    if (frag) {
      // Forma 3 directa: `GUARDAR LLV-4829-K7` o `GUARDAR F-0173`
      const sqlFrag = `MOSTRAR TODO DE fragmentos DONDE id ES '${frag.id}'`;
      return guardarConsultaEn(primeroNorm, sqlFrag);
    }
    // Forma 1: `GUARDAR llave1` -> usa la última consulta ejecutada
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

  // --- Caso B: Hay más palabras detrás del nombre
  const restoSinComo = resto.replace(/^(?:como|as|es|=)\s+/i, '').trim();
  const primeraPalabraResto = normalizar(restoSinComo.split(/\s+/)[0]);

  // Subcaso B1: `GUARDAR llave1 MOSTRAR TODO DE ...` / `GUARDAR llave1 SELECT ...`
  if (['mostrar', 'traer', 'seleccionar', 'ver', 'buscar', 'select', 'contar'].includes(primeraPalabraResto)) {
    return guardarConsultaEn(primeroNorm, restoSinComo);
  }

  // Subcaso B2 (Forma 2 limpia): `GUARDAR llave1 DE fragmentos [JUNTO CON ...] [DONDE ...]`
  if (['de', 'en', 'desde', 'from', 'fragmentos'].includes(primeraPalabraResto)) {
    const sqlCompleto = primeraPalabraResto === 'fragmentos'
      ? `MOSTRAR TODO DE ${restoSinComo}`
      : `MOSTRAR TODO ${restoSinComo}`;
    return guardarConsultaEn(primeroNorm, sqlCompleto);
  }

  // Subcaso B3 (Forma 3 con nombre): `GUARDAR llave1 LLV-4829-K7` o `GUARDAR llave1 F-0173`
  if (restoSinComo.split(/\s+/).length === 1) {
    const frag = buscarFragmentoPorCodigoOId(restoSinComo);
    if (frag) {
      return guardarConsultaEn(primeroNorm, `MOSTRAR TODO DE fragmentos DONDE id ES '${frag.id}'`);
    }
  }

  // Si empieza por `DONDE`, asumimos `fragmentos`
  if (['donde', 'where', 'junto', 'unir'].includes(primeraPalabraResto)) {
    return guardarConsultaEn(primeroNorm, `MOSTRAR TODO DE fragmentos ${restoSinComo}`);
  }

  return guardarConsultaEn(primeroNorm, `MOSTRAR TODO ${restoSinComo}`);
}

function probar(argBruto: string, ctx: ContextoComando): ResultadoComando {
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

  // Si no está en `vistas` por ese nombre, comprobamos si escribieron directamente el código o ID (`PROBAR LLV-4829-K7`)
  if (!sql) {
    const frag = buscarFragmentoPorCodigoOId(objetivoRaw);
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
    r = ejecutarSelect(s.sel, MUNDO1.bd);
  } catch (e) {
    return fallaSql(e);
  }

  // Probar no es otra forma de buscar: sin una sola fila no hay nada que
  // comprobar y no se cobra. Lo que cuesta es afirmar una fila que no es.
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
  const idx = LLAVES.indexOf(fila.id as string);

  if (idx === -1) {
    // Mismo rechazo para un señuelo y para un fragmento cualquiera: decir
    // cuál de las dos cosas falla sería ir resolviendo a base de probar.
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
        '1. El diccionario de Datos ha cambiado: hay tablas de respaldo y un catalogo de reglas (`sistema_triggers`).',
        '2. Misma terminal, ahora con `BORRAR TODO DE <tabla>` (o `VACIAR`) y `APAGAR REGLA <nombre>`.',
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
          ? {
            quedan: r.total,
            consultas: numero(ctx.estado, 'consultas') + 1,
            // Si la consulta no es solo un CONTAR, la recordamos para que `GUARDAR llave1` funcione sin repetirla
            ...(r.agregada ? {} : { ultimaConsulta: bruto }),
          }
          : {};
        const estado = { ...ctx.estado, ...embudo };

        if (r.total === 0) {
          return { estado, bloques: [texto(['Ningun registro cumple todas esas condiciones a la vez.',
            'O sobra una condicion, o alguna lleva un valor que esa columna no admite.'], '0 filas')] };
        }
        const limite = s.sel.limite !== undefined ? Math.min(s.sel.limite, TOPE_FILAS) : undefined;
        if (limite === undefined && r.total > TOPE_FILAS) {
          return { estado, bloques: [texto([
            `${r.total} filas cumplen la consulta. La memoria solo ensena ${TOPE_FILAS} a la vez.`,
            'Anade otra condicion despues de DONDE para estrechar, o usa CONTAR para ver cuantas quedan.',
          ], 'Demasiadas filas')] };
        }
        const filas = r.filas.slice(0, limite ?? TOPE_FILAS);
        return {
          estado,
          bloques: [
            tabla(`${r.total} fila(s)${filas.length < r.total ? ` · se ensenan ${filas.length}` : ''}`,
              r.columnas, filas.map((f) => f.map(fmt))),
            ...(r.total === 1 && !r.agregada && parte === 1
              ? [texto(['Una sola fila. Si es la llave que buscais: `GUARDAR llave1` y luego `PROBAR llave1`.'])]
              : []),
          ],
        };
      }

      case 'crear_vista': {
        if (parte !== 1) return sinVistas();
        if (!/^[a-z_][a-z0-9_]{0,30}$/.test(s.nombre)) {
          return { bloques: [error('El nombre tiene que ser una sola palabra (letras, numeros y _).')] };
        }
        if (MUNDO1.bd.tablas.has(s.nombre)) {
          return { bloques: [error(`«${s.nombre}» ya es una tabla: elige otro nombre.`)] };
        }
        const vistas = { ...((ctx.estado.vistas as Record<string, string>) ?? {}) };
        if (!(s.nombre in vistas) && Object.keys(vistas).length >= MAX_VISTAS) {
          return { bloques: [error(`Ya hay ${MAX_VISTAS} guardados. Quita alguno con BORRAR VISTA.`)] };
        }
        const r = ejecutarSelect(s.sel, MUNDO1.bd);
        vistas[s.nombre] = s.sql;
        return {
          estado: { ...ctx.estado, vistas, ultimoGuardado: s.nombre },
          bloques: [texto([
            `Guardado como «${s.nombre}». Devuelve ${r.total} fila(s) ahora mismo.`,
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
      return { bloques: [error(`No existe ninguna regla o trigger llamada «${s.nombre}».`),
        texto(['El catalogo esta en `sistema_triggers`. Usa: `MOSTRAR TODO DE sistema_triggers`.'])] };
    }
    // Un trigger que no restaura nada es de funcionamiento: tocarlo es
    // acusar en falso, y cuesta como en el resto de fases.
    if (tr.efecto.tipo === 'inocuo') {
      return rechazo(ctx,
        `«${tr.nombre}» no restaura nada: el robot la necesita para funcionar y nota que la tocas.`);
    }
    if (s.tipo === 'disable_trigger' && !tr.activo) {
      return { bloques: [texto([`«${tr.nombre}» ya estaba desactivada.`])] };
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
        s.tipo === 'delete' ? 'Borrado' : 'Regla',
      ),
    ],
  };
}
