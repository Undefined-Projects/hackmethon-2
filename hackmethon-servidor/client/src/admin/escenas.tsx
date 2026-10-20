import { useMemo, useRef } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { useTicker } from '../lib/useTicker';
import { azar as azarJardin, crece, preparar, type Semilla } from '../lib/jardin';
import { Vegetacion, type Tono } from '../player/AnatomiaDeco';
import { JardinEscena } from './JardinEscena';
import { Membrana, type Cuidador } from '../player/fases/Membrana';

// ============================================================
//  Las escenas del proyector.
//
//  Una por fase, y NINGUNA lee datos del juego. Es deliberado: lo que
//  se proyecta en la sala lo ve todo el mundo a la vez —los cuatro
//  equipos y el público— y una escena que dijera por dónde va alguien
//  sería un chivatazo servido en pared de seis metros. Aquí solo se
//  cuenta DE QUÉ VA la fase destacada, en bucle y sin texto que leer.
//
//  Por eso tampoco piden nada al servidor: se alimentan de un reloj
//  local. Una pestaña que se queda sin conexión sigue proyectando la
//  escena en vez de congelarse, que es justo lo que hace falta mientras
//  alguien corre a mirar el router.
// ============================================================

/** Milisegundos desde que la escena entró en pantalla. */
function useReloj(ms: number): number {
  useTicker(ms);
  const inicio = useRef(0);
  if (!inicio.current) inicio.current = Date.now();
  return Date.now() - inicio.current;
}

/** Generador reproducible: el mismo dibujo en los dos proyectores. */
function azar(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const vars = (o: Record<string, string | number>) => o as CSSProperties;

// ============================================================
//  Fase 1 · El Reflejo — CONDICIONALES
//  La membrana de la rodilla, la misma que ve Pantalla, pero con una
//  fila de programas inventada y sin nombres: en la pared se cuenta de qué va la
//  fase, nunca por dónde va nadie. Uno de cada tres rebota: alternar
//  sí/no se lee como un metrónomo y deja de mirarse.
// ============================================================

const COLA_SALA: Cuidador[] = [true, true, false, true, false, true, true, false].map((pasa, i) => ({
  nombre: `programa-${i + 1}`, pasa,
}));

function EscenaAcceso() {
  return (
    <div className="esc esc-acceso">
      <div className="acc-membrana">
        <Membrana cola={COLA_SALA} etiquetas={false} conSonido={false} sala />
      </div>
      <pre className="esc-codigo">
        {'para cada programa que llega:\n    si firma = ausente  → descartar\n    si origen = externo y permisos >= 4  → descartar\n    dejar pasar'}
      </pre>
    </div>
  );
}

// ============================================================
//  Fase 2 · El Enemigo — el tráfico cayendo
// ============================================================

const RUTAS = [
  '/api/nomina', '/api/exportar', '/api/usuarios', '/api/backup',
  '/api/claves', '/api/informes', '/api/exportar/nomina', '/api/sesion',
];
const CUENTAS = ['m.rivas', 'j.ortega', 'c.pineda', 'a.soto', 'r.mendez', 'l.tapia', 's.varela'];
const METODOS = ['GET', 'GET', 'POST', 'DELETE', 'PUT'];
const CODIGOS = [200, 200, 200, 401, 403, 404, 401, 500];

function EscenaEnemigo() {
  // Se calcula una vez: una cinta que se rebaraja en cada repintado
  // parpadea y marea. Lo que se mueve es la cinta, no su contenido.
  const lineas = useMemo(() => {
    const r = azar(7);
    const BASE = 11 * 3600 + 42 * 60 + 8;
    // Los huecos entre peticiones primero, y el reloj sale de sumarlos:
    // un contador que se va reasignando dentro del `map` depende del
    // orden en que React decida evaluarlo.
    const huecos = Array.from({ length: 26 }, () => 1 + Math.floor(r() * 3));
    return huecos.map((_, i) => {
      const seg = BASE + huecos.slice(0, i + 1).reduce((a, b) => a + b, 0);
      const hh = String(Math.floor(seg / 3600) % 24).padStart(2, '0');
      const mm = String(Math.floor(seg / 60) % 60).padStart(2, '0');
      const ss = String(seg % 60).padStart(2, '0');
      return {
        id: i,
        hora: `${hh}:${mm}:${ss}`,
        metodo: METODOS[Math.floor(r() * METODOS.length)],
        ruta: RUTAS[Math.floor(r() * RUTAS.length)],
        cuenta: CUENTAS[Math.floor(r() * CUENTAS.length)],
        codigo: CODIGOS[Math.floor(r() * CODIGOS.length)],
      };
    });
  }, []);

  return (
    <div className="esc esc-enemigo">
      <div className="atq-caja">
        {/* La lista va DUPLICADA y la cinta sube justo media altura: al
            llegar al final el fotograma es idéntico al del principio, y
            el bucle no tiene costura. */}
        <div className="atq-cinta">
          {[0, 1].map((vuelta) =>
            lineas.map((l) => (
              <div key={`${vuelta}-${l.id}`} className={`atq-linea c${Math.floor(l.codigo / 100)}xx`}>
                <span className="atq-hora">{l.hora}</span>
                <span className="atq-metodo">{l.metodo}</span>
                <span className="atq-ruta">{l.ruta}</span>
                <span className="atq-cuenta">{l.cuenta}</span>
                <span className="atq-codigo">{l.codigo}</span>
              </div>
            )),
          )}
        </div>
        <span className="atq-barrido" aria-hidden="true" />
      </div>
    </div>
  );
}

// ============================================================
//  Fase 3 · Muro de Repetición — CICLOS
//  La cifra es la fase entera: 1 590 golpes, y a mano no da tiempo.
// ============================================================

const GOLPES = 1590;
const CICLO_MURO = 14_000;
const MURO_FILAS = 4;
const MURO_COLS = 14;

function EscenaMuro() {
  const t = useReloj(80);
  const p = (t % CICLO_MURO) / CICLO_MURO;
  // El muro cae al 85 % del ciclo y el resto es pausa: sin ella la cifra
  // final se ve un fotograma y desde el fondo de la sala no se lee.
  const avance = Math.min(1, p / 0.85);
  const golpes = Math.round(avance * GOLPES);
  const caido = avance >= 1;

  const total = MURO_FILAS * MURO_COLS;
  const rotos = Math.floor(avance * total);

  return (
    <div className="esc esc-muro">
      <div className={`mur-escena ${caido ? 'caido' : ''}`}>
        {/* El ariete avanza con la brecha: se queda pegado a la cara del
            muro que aún queda en pie, no al sitio donde empezó. */}
        <span className="mur-ariete" style={vars({ '--avance': avance })} aria-hidden="true">
          <span className="mur-tronco" />
          <span className="mur-punta" />
        </span>

        <div className="mur-pared" style={vars({ '--cols': MURO_COLS })} aria-hidden="true">
          {Array.from({ length: total }, (_, i) => {
            // Se derriba por columnas, desde el lado del ariete: un muro
            // que se deshace por dentro no lo tira nadie.
            const col = i % MURO_COLS;
            const fila = Math.floor(i / MURO_COLS);
            const orden = col * MURO_FILAS + fila;
            return <span key={i} className={`mur-bloque ${orden < rotos ? 'roto' : ''}`} />;
          })}
        </div>
      </div>

      <p className="mur-cuenta">
        <strong className="mur-cifra">{golpes.toLocaleString('es-MX')}</strong>
        <span className="mur-etq">{caido ? 'el muro cayó' : 'golpes'}</span>
      </p>

      <pre className="esc-codigo">{'repetir 1590 veces:\n    golpear(muro)'}</pre>
    </div>
  );
}

// ============================================================
//  Fase 4 · Núcleo Modular — FUNCIONES
//  Una pieza rota corta la cadena entera; arreglarla una vez la arregla
//  para todas las llamadas. Eso es lo que hace el bucle de la escena.
// ============================================================

const PIEZAS = [
  { n: 'entrada', x: 24, y: 62, nivel: 0 },
  { n: 'validar', x: 82, y: 22, nivel: 1 },
  { n: 'formato', x: 82, y: 102, nivel: 1 },
  { n: 'clave', x: 146, y: 62, nivel: 2 },
  { n: 'salida', x: 208, y: 62, nivel: 3 },
];
const CABLES: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]];
const ROTA = 2; // `formato`: la pieza que parte la cadena
const PASO_NUCLEO = 900;

function EscenaNucleo() {
  const t = useReloj(120);
  const paso = Math.floor((t % (PASO_NUCLEO * 8)) / PASO_NUCLEO); // 0..7
  const reparada = paso >= 4;
  // Sin reparar la señal no pasa del nivel 1: ahí está la pieza rota.
  const alcance = reparada ? Math.min(3, paso - 4) : Math.min(1, paso);

  const vivo = (i: number) => PIEZAS[i].nivel <= alcance;
  const rota = !reparada && alcance >= 1;

  return (
    <div className="esc esc-nucleo">
      <svg className="nuc-mapa" viewBox="0 0 232 124" role="img" aria-label="piezas del núcleo">
        {CABLES.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            className={`nuc-cable ${vivo(a) && vivo(b) && !(rota && (a === ROTA || b === ROTA)) ? 'vivo' : ''}`}
            x1={PIEZAS[a].x} y1={PIEZAS[a].y} x2={PIEZAS[b].x} y2={PIEZAS[b].y}
          />
        ))}
        {PIEZAS.map((pz, i) => (
          <g
            key={pz.n}
            className={`nuc-pieza ${vivo(i) ? 'viva' : ''} ${i === ROTA && rota ? 'rota' : ''}`}
          >
            <rect x={pz.x - 20} y={pz.y - 11} width="40" height="22" rx="2" />
            <text x={pz.x} y={pz.y + 3.6} textAnchor="middle">{pz.n}</text>
          </g>
        ))}
      </svg>

      <p className={`nuc-parte ${rota ? 'mal' : reparada && alcance >= 3 ? 'bien' : ''}`}>
        {rota
          ? 'formato() falla · nada llega a la salida'
          : paso === 4
            ? 'formato() arreglada · una sola vez'
            : alcance >= 3
              ? 'todas las llamadas pasan'
              : 'siguiendo la cadena…'}
      </p>
    </div>
  );
}

// ============================================================
//  Fase 5 · Bóveda de Credenciales — BASES DE DATOS
//  Preguntar bien es más rápido que mirar. La rejilla se apaga a la
//  velocidad a la que la consulta se estrecha.
// ============================================================

const BOV_COLS = 30;
const BOV_FILAS = 12;
const BOV_CELDAS = BOV_COLS * BOV_FILAS;
const REGISTROS = 2400;
const CICLO_BOVEDA = 11_000;
const CLAUSULAS = [
  'SELECT * FROM credenciales',
  "  WHERE departamento = 'finanzas'",
  '    AND caducada = false',
  "    AND ultimo_acceso > '02:00'",
];

function EscenaBoveda() {
  const t = useReloj(120);

  // Qué celda se apaga en qué puesto. Barajado una vez: la bóveda se
  // vacía a manchas, no por renglones, que es como se lee «se descarta»
  // y no «se está borrando la pantalla».
  const puesto = useMemo(() => {
    const r = azar(19);
    const a = Array.from({ length: BOV_CELDAS }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    const pos = new Array<number>(BOV_CELDAS);
    a.forEach((celda, n) => { pos[celda] = n; });
    return pos;
  }, []);

  const p = Math.min(1, (t % CICLO_BOVEDA) / (CICLO_BOVEDA * 0.78));
  // Caída logarítmica. En lineal, de 2400 a 1 son ocho segundos sin que
  // pase nada y luego todo de golpe: no se lee como una búsqueda.
  const vivos = Math.max(1, Math.round(REGISTROS * Math.pow(1 / REGISTROS, p)));
  const encendidas = Math.max(1, Math.round((vivos / REGISTROS) * BOV_CELDAS));
  const hallada = vivos === 1;
  const hasta = Math.min(CLAUSULAS.length, 1 + Math.floor(p * CLAUSULAS.length));

  return (
    <div className="esc esc-boveda">
      <div className="bov-rejilla" style={vars({ '--cols': BOV_COLS })} aria-hidden="true">
        {Array.from({ length: BOV_CELDAS }, (_, i) => {
          const viva = puesto[i] < encendidas;
          return (
            <span
              key={i}
              className={`bov-celda ${viva ? 'viva' : ''} ${viva && hallada ? 'hallada' : ''}`}
            />
          );
        })}
      </div>

      <pre className="esc-codigo bov-consulta">
        {CLAUSULAS.slice(0, hasta).join('\n')}
      </pre>

      <p className="bov-cuenta">
        <strong className={`bov-cifra ${hallada ? 'sola' : ''}`}>
          {vivos.toLocaleString('es-MX')}
        </strong>
        <span className="mur-etq">{hallada ? 'credencial hallada' : 'registros encajan'}</span>
      </p>
    </div>
  );
}

// ============================================================
//  Fase 6 · Puente de Lanzamiento — APIS
//  El mensaje correcto cancela el ataque; el equivocado lo adelanta.
//  Los dos se ven salir de la misma consola.
// ============================================================

const CICLO_PUENTE = 5200;

function EscenaPuente() {
  const t = useReloj(120);
  const turno = Math.floor(t / CICLO_PUENTE);
  const fase = t % CICLO_PUENTE;
  const bueno = turno % 2 === 0;
  const llegado = fase > 2200;

  return (
    <div className="esc esc-puente">
      <div className="pte-vano">
        <span className="pte-consola" aria-hidden="true">
          <span className="pte-caja" />
          <em>consola</em>
        </span>

        <span className="pte-cable" aria-hidden="true" />

        <span
          key={turno}
          className={`pte-mensaje ${llegado ? (bueno ? 'entregado' : 'vuelve') : ''}`}
        >
          {bueno ? 'POST /cancelar' : 'POST /lanzar'}
        </span>

        <span className={`pte-torre ${llegado ? (bueno ? 'ok' : 'mal') : ''}`} aria-hidden="true">
          <span className="pte-mastil" />
          <span className="pte-luz" />
          <em>enlace</em>
        </span>
      </div>

      <p className={`pte-respuesta ${!llegado ? 'duda' : bueno ? 'si' : 'no'}`}>
        {!llegado ? 'enviando…' : bueno ? '202 · ATAQUE CANCELADO' : '400 · LANZAMIENTO ADELANTADO'}
      </p>
    </div>
  );
}

// ============================================================
//  Fase 7 · El Rastro — no entró por donde crees
//  El rastro se enciende HACIA ATRÁS, desde donde se le encontró hasta
//  la máquina por la que entró. Ese es el camino que hay que recorrer.
// ============================================================

const MAQUINAS = ['PORTATIL-04', 'IMPRESORA', 'NAS-01', 'SERVIDOR-WEB', 'BASE DE DATOS'];
const PASO_RASTRO = 1500;

function EscenaRastro() {
  const t = useReloj(150);
  const paso = Math.floor((t % (PASO_RASTRO * 6)) / PASO_RASTRO); // 0..5
  const ultima = MAQUINAS.length - 1;
  const enRastro = (i: number) => i >= ultima - paso;
  const origen = paso >= ultima;

  return (
    <div className="esc esc-rastro">
      <ul className="ras-cadena">
        {MAQUINAS.map((m, i) => (
          <li key={m} className="ras-nodo">
            {i > 0 && (
              <span
                className={`ras-salto ${enRastro(i) && enRastro(i - 1) ? 'vivo' : ''}`}
                aria-hidden="true"
              />
            )}
            <span
              className={`ras-caja ${enRastro(i) ? 'vivo' : ''} ${i === 0 && origen ? 'origen' : ''}`}
            >
              {m}
            </span>
            {i === 0 && origen && <em className="ras-etq">por aquí entró</em>}
            {i === ultima && <em className="ras-etq ras-etq-fin">aquí lo encontraste</em>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
//  Comodines
// ============================================================

/** Fase sin escena propia. Una fase nueva en el seed no deja el
 *  proyector en negro: pinta una carta de ajuste con su rótulo. */
export function EscenaGenerica() {
  return (
    <div className="esc esc-generica">
      <div className="gen-barras" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} style={vars({ '--i': i })} />
        ))}
      </div>
      <p className="esc-lema">fase en curso</p>
    </div>
  );
}

/** Sin fase destacada. Lo que hay que ver es que el aparato está vivo,
 *  no un hueco: el cursor parpadeando lo dice sin decir nada. */
/**
 * La espera: la marca del evento, y la maleza reclamándola. Detrás, la
 * misma pared viva de los recreos —raíces de circuito que cuelgan, con
 * sus pulsos de luz, enredaderas en las esquinas y buses en los
 * costados—, que deja libre el centro para que el título se lea desde la
 * última fila. Y el propio cartel, cogido por la planta: un bus de
 * circuito corre bajo el título y dos enredaderas le trepan por los lados.
 */
export function EscenaEspera({ nota }: { nota?: string }) {
  return (
    <div className="esc esc-espera">
      <JardinEscena variante="espera" latido={0} />
      <div className="esp-cartel">
        <MarcaViva />
        <h1 className="esp-marca">HACK(ME)THON 2.0</h1>
      </div>
      <p className="esp-linea">
        {nota ?? 'EN ESPERA'}<span className="esp-cursor" aria-hidden="true">_</span>
      </p>
    </div>
  );
}

/** La planta del cartel, en el mismo SVG que el título ocupa: un bus
 *  de circuito bajo las letras y dos trepadoras por los lados. Brota al
 *  aparecer la escena (las piezas llevan su propio retraso). */
function MarcaViva() {
  const plantas = useMemo(() => {
    const r = azarJardin(2026);
    const base = { rnd: r, paso: [9, 16] as [number, number], largo: [5, 9] as [number, number], giro: 0.3, rama: 0.45, prof: 3, tiron: 0.5 };
    const sembrar: { tono: Tono; o: Partial<Semilla> }[] = [
      // El bus de circuito, del centro hacia los dos lados, bajo las letras.
      { tono: 'circuito', o: { x: 500, y: 240, dir: 4, sesgo: 4, caja: [40, 222, 520, 268], hoja: 0, flor: 0, chip: 0.32, max: 90, largo: [8, 14] } },
      { tono: 'circuito', o: { x: 500, y: 240, dir: 0, sesgo: 0, caja: [480, 222, 960, 268], hoja: 0, flor: 0, chip: 0.32, max: 90, largo: [8, 14] } },
      // Las trepadoras: suben pegadas a los lados del título y se asoman
      // por encima de las primeras y las últimas letras.
      { tono: 'vida', o: { x: 30, y: 296, dir: 6, sesgo: 6, caja: [0, 0, 190, 298], hoja: 0.75, tamHoja: 16, flor: 0.4, tamFlor: 5, max: 90 } },
      { tono: 'vida', o: { x: 970, y: 296, dir: 6, sesgo: 6, caja: [810, 0, 1000, 298], hoja: 0.75, tamHoja: 16, flor: 0.4, tamFlor: 5, max: 90 } },
      // Hierba al pie del cartel, a lo largo de toda la base.
      { tono: 'vida', o: { x: 200, y: 298, dir: 0, sesgo: 7, caja: [120, 262, 880, 300], hoja: 0.8, tamHoja: 11, flor: 0.3, tamFlor: 3.5, max: 60 } },
      // Y raíces que cuelgan del canto de arriba, finas.
      { tono: 'raiz', o: { x: 180, y: 4, dir: 2, sesgo: 2, caja: [100, 0, 320, 80], hoja: 0.2, flor: 0.15, chip: 0.15, max: 30 } },
      { tono: 'raiz', o: { x: 820, y: 4, dir: 2, sesgo: 2, caja: [680, 0, 900, 80], hoja: 0.2, flor: 0.15, chip: 0.15, max: 30 } },
    ];
    return sembrar.map(({ tono, o }) => ({ tono, p: preparar(crece({ ...base, ...o } as Semilla)) }));
  }, []);
  return (
    <svg className="esp-viva" viewBox="0 0 1000 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {plantas.map(({ p, tono }, k) => <Vegetacion key={k} p={p} tono={tono} />)}
    </svg>
  );
}

/** El reparto, por `key` de fase. La clave viene del seed, así que
 *  renombrar una fase allí y no aquí cae en la carta de ajuste —visible
 *  en la pared— en vez de romper la pantalla entera. */
export const ESCENAS: Record<string, () => ReactElement> = {
  'fase-1-acceso': EscenaAcceso,
  'fase-2-enemigo': EscenaEnemigo,
  'fase-3-muro': EscenaMuro,
  'fase-4-nucleo': EscenaNucleo,
  'fase-5-boveda': EscenaBoveda,
  'fase-6-puente': EscenaPuente,
  'fase-7-rastro': EscenaRastro,
};
