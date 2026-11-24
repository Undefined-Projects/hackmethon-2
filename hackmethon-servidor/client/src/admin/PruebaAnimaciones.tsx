import { useState } from 'react';
import { Marana, type BroteViaje, type Fin, type Mundo, type ViajePantalla } from '../player/fases/Marana';
import type { Accion } from '../player/fases/caminata';

// ============================================================
//  PROBAR ANIMACIONES · Fase 2
//
//  El mismo monitor que ve Pantalla, con viajes inventados: cada botón
//  manda un brote que acaba de una manera. Sirve para revisar los
//  veredictos, la vuelta a la entrada, el paso a la espesura y el final
//  sin tener que jugar la fase. No toca ninguna partida ni el servidor.
// ============================================================

type Celda = [number, number];
type Plano = { celdas: string[]; entrada: Celda; salida: Celda; rumbo: number; espinas: Celda[] };

const SETO: Plano = {
  celdas: [
    '#########',
    '#.#...#S#',
    '#.#.#.#.#',
    '#...#...#',
    '#.###.###',
    '#.#.....#',
    '###.#####',
    '#.....###',
    '#########',
  ],
  entrada: [7, 1], salida: [1, 7], rumbo: 0, espinas: [],
};
/** Una espesura de juguete: cuatro esquinas, un claro y vueltas. Las minas
 *  se ponen solas donde pisa la pared derecha y nunca la izquierda. */
const ESPESURA_CELDAS = [
  '###############',
  '#.#...#.......#',
  '#.#.#.#.#.###.#',
  '#...#.#.#...#.#',
  '#.#.#.#.#.#.#.#',
  '#.#....S#.#...#',
  '#.#.#####.###.#',
  '#.#.....#...#.#',
  '#.#####.###.#.#',
  '#...........#.#',
  '###############',
];
const ESQUINAS: Celda[] = [[1, 1], [1, 13], [9, 1], [9, 13]];
const SALIDA_ESP: Celda = [5, 7];

const ESCALERA: Accion[] = Array.from({ length: 3 }, () => ['gd', 'av', 'av', 'gi', 'av', 'av'] as Accion[]).flat();
const RITMO = { inicio: 900, paso: 320, giro: 240, choque: 1100, fin: 1500 };
const RITMO_ESP = { inicio: 1100, paso: 110, giro: 110, choque: 110, fin: 2200 };
const DF = [-1, 0, 1, 0], DC = [0, 1, 0, -1];
const libre = (p: string[], f: number, c: number) => (p[f]?.[c] ?? '#') !== '#';

/** Anda un programa ya desplegado, como el servidor: se para al chocar,
 *  al pisar una espina o al llegar. Lo que sobra no se ejecuta. Devuelve
 *  lo que ve Pantalla: si no llegó, solo que se desconectó (y el choque es
 *  el paso de la desconexión). */
function andar(p: Plano, acciones: Accion[], agotarEn?: number) {
  let [f, c] = p.entrada;
  let d = p.rumbo;
  const pasos: [Accion, number, number, number][] = [];
  let fin: Fin = 'desconectado';
  for (const a of acciones) {
    if (agotarEn !== undefined && pasos.length >= agotarEn) break;
    if (a === 'gi') { d = (d + 3) % 4; pasos.push([a, f, c, d]); continue; }
    if (a === 'gd') { d = (d + 1) % 4; pasos.push([a, f, c, d]); continue; }
    const nf = f + DF[d], nc = c + DC[d];
    const ch = p.celdas[nf]?.[nc] ?? '#';
    if (ch === '#') { pasos.push(['x', f, c, d]); break; }
    f = nf; c = nc;
    pasos.push(['av', f, c, d]);
    if (p.espinas.some(([ef, ec]) => ef === f && ec === c)) break;
    if (ch === 'S') { fin = 'salida'; break; }
  }
  return { pasos, fin };
}

/** Las acciones de quien no suelta la pared de un lado, hasta el claro. */
function pegadoA(celdas: string[], entrada: Celda, rumbo: number, mano: 'i' | 'd'): Accion[] {
  let [f, c] = entrada, d = rumbo;
  const out: Accion[] = [];
  const lado = (x: number) => (mano === 'i' ? (x + 3) % 4 : (x + 1) % 4);
  const otro = (x: number) => (mano === 'i' ? (x + 1) % 4 : (x + 3) % 4);
  while (out.length < 300 && celdas[f][c] !== 'S') {
    if (libre(celdas, f + DF[lado(d)], c + DC[lado(d)])) { d = lado(d); out.push(mano === 'i' ? 'gi' : 'gd'); }
    else while (!libre(celdas, f + DF[d], c + DC[d])) { d = otro(d); out.push(mano === 'i' ? 'gd' : 'gi'); }
    f += DF[d]; c += DC[d]; out.push('av');
  }
  return out;
}

const rumboLibre = ([f, c]: Celda) => [0, 1, 2, 3].find((d) => libre(ESPESURA_CELDAS, f + DF[d], c + DC[d]))!;
const BROTES_ESP = ESQUINAS.map((e) => ({ entrada: e, rumbo: rumboLibre(e) }));
/** Minas: casillas que pisa la pared derecha y nunca la izquierda. */
const MINAS: Celda[] = (() => {
  const pisa = (mano: 'i' | 'd') => {
    const vistas = new Set<string>();
    for (const b of BROTES_ESP) {
      let [f, c] = b.entrada, d = b.rumbo;
      for (const a of pegadoA(ESPESURA_CELDAS, b.entrada, b.rumbo, mano)) {
        if (a === 'gi') d = (d + 3) % 4; else if (a === 'gd') d = (d + 1) % 4;
        else { f += DF[d]; c += DC[d]; vistas.add(`${f},${c}`); }
      }
    }
    return vistas;
  };
  const buena = pisa('i');
  return [...pisa('d')].filter((k) => !buena.has(k) && k !== `${SALIDA_ESP}`)
    .map((k) => k.split(',').map(Number) as Celda)
    .filter(([f, c]) => f % 2 === 1 && c % 2 === 1).slice(0, 3);
})();

/** Lo que alumbran los brotes: lo nuevo de cada golpe de reloj. */
function luzDe(celdas: string[], brotes: BroteViaje[]) {
  const visto = new Set<string>();
  const alumbrar = (f: number, c: number, sale: [number, number, string][]) => {
    for (let df = -1; df <= 1; df++) {
      for (let dc = -1; dc <= 1; dc++) {
        const ff = f + df, cc = c + dc, k = `${ff},${cc}`;
        if (!celdas[ff]?.[cc] || visto.has(k)) continue;
        visto.add(k);
        sale.push([ff, cc, celdas[ff][cc]]);
      }
    }
  };
  const luz0: [number, number, string][] = [];
  brotes.forEach((b) => alumbrar(b.entrada[0], b.entrada[1], luz0));
  const largo = Math.max(...brotes.map((b) => b.pasos.length));
  const luz = Array.from({ length: largo }, (_, k) => {
    const sale: [number, number, string][] = [];
    brotes.forEach((b) => {
      const p = b.pasos[k];
      if (!p) return;
      alumbrar(p[1], p[2], sale);
    });
    return sale;
  });
  return { luz0, luz };
}

const mundoSeto = (p: Plano): Mundo => ({
  capa: 1, filas: p.celdas.length, cols: p.celdas[0].length,
  celdas: p.celdas.map((r) => r.replace(/\*/g, '.')),
  salida: p.salida, brotes: [{ entrada: p.entrada, rumbo: p.rumbo }],
});
const mundoEspesura: Mundo = {
  capa: 2, filas: ESPESURA_CELDAS.length, cols: ESPESURA_CELDAS[0].length, celdas: null,
  salida: SALIDA_ESP, brotes: BROTES_ESP, conocidas: [],
};

type Caso = {
  id: string; nombre: string; que: string;
  /** La capa en la que queda el equipo DESPUÉS del viaje. */
  capa: 1 | 2; resuelta?: boolean;
  viaje: (n: number) => ViajePantalla;
};

const enSeto = (acciones: Accion[], espinas: Celda[] = [], agotarEn?: number) => (n: number): ViajePantalla => {
  const p = { ...SETO, espinas };
  const r = andar(p, acciones, agotarEn);
  return { n, capa: 1, brotes: [{ entrada: p.entrada, rumbo: p.rumbo, ...r }], ritmo: RITMO, mundo: mundoSeto(p) };
};
/** Los cuatro con el mismo programa: pegados a la pared de un lado. */
const enEspesura = (mano: 'i' | 'd') => (n: number): ViajePantalla => {
  const brotes: BroteViaje[] = BROTES_ESP.map((b) => {
    const p: Plano = { celdas: ESPESURA_CELDAS, entrada: b.entrada, rumbo: b.rumbo, salida: SALIDA_ESP, espinas: MINAS };
    return { entrada: b.entrada, rumbo: b.rumbo, ...andar(p, pegadoA(ESPESURA_CELDAS, b.entrada, b.rumbo, mano)) };
  });
  const sinMinas = ESPESURA_CELDAS;
  return { n, capa: 2, brotes, ritmo: RITMO_ESP, mundo: mundoEspesura, ...luzDe(sinMinas, brotes) };
};

const CASOS: Caso[] = [
  { id: 'llega', nombre: 'Llega', que: 'cruza el seto (sin cambiar de capa)', capa: 1, viaje: enSeto(ESCALERA) },
  { id: 'choca', nombre: 'Choca', que: 'se estrella contra una pared: para Pantalla, se desconecta', capa: 1, viaje: enSeto(['gd', 'av', 'av', 'av', 'av', 'av']) },
  { id: 'espina', nombre: 'Espina', que: 'pisa una espina escondida: para Pantalla, se desconecta', capa: 1, viaje: enSeto(ESCALERA, [[5, 5]]) },
  { id: 'quieto', nombre: 'Se queda quieto', que: 'se le acaban las instrucciones a medio camino', capa: 1, viaje: enSeto(['gd', 'av', 'av', 'gi', 'av']) },
  { id: 'agotado', nombre: 'Se agota', que: 'da vueltas sin llegar hasta gastarse', capa: 1, viaje: enSeto(Array<Accion>(40).fill('gd'), [], 14) },
  { id: 'cede', nombre: 'Cruza el seto → capa 2', que: 'el seto cede y la pierna apaga la luz', capa: 2, viaje: enSeto(ESCALERA) },
  { id: 'minas', nombre: 'Cuatro · pared mala', que: 'en la espesura, siguiendo la pared derecha: alguno pisa una mina y se desconecta', capa: 2, viaje: enEspesura('d') },
  { id: 'cruzada', nombre: 'Cuatro · pared buena', que: 'los cuatro llegan al claro: la fase se resuelve', capa: 2, resuelta: true, viaje: enEspesura('i') },
];

export function PruebaAnimaciones() {
  const [sonido, setSonido] = useState(true);
  const [prueba, setPrueba] = useState<{ caso: Caso; viaje: ViajePantalla } | null>(null);
  const [n, setN] = useState(0);

  const lanzar = (caso: Caso) => {
    const k = n + 1;
    setN(k);
    setPrueba({ caso, viaje: caso.viaje(k) });
  };
  const caso = prueba?.caso;
  const mundo = caso?.capa === 2 ? mundoEspesura : mundoSeto(SETO);

  return (
    <section className="panel">
      <div className="panel__bar">
        <span className="panel__name">PROBAR ANIMACIONES · FASE 2</span>
      </div>
      <div className="panel__body prueba-anim">
          <p className="ayuda">
            El monitor de Pantalla con brotes de prueba en un seto inventado. Cada botón lanza uno
            que acaba de una manera. Solo se ve en esta pantalla: no toca ninguna partida.
          </p>
          <div className="prueba-anim__botones">
            {CASOS.map((c) => (
              <button key={c.id} type="button" className={caso?.id === c.id ? 'activo' : ''}
                      onClick={() => lanzar(c)} title={c.que}>
                &gt; {c.nombre}
              </button>
            ))}
            <button type="button" className="sutil" onClick={() => setPrueba(null)}>REINICIAR</button>
            <label className="prueba-anim__sonido">
              <input type="checkbox" checked={sonido} onChange={(e) => setSonido(e.target.checked)} /> sonido
            </label>
          </div>
          {caso && <p className="prueba-anim__que">{caso.nombre}: {caso.que}.</p>}
          <div className="camaras marana-monitor prueba-anim__monitor">
            <Marana key={n} mundo={mundo} viaje={prueba?.viaje ?? null}
                    capa={caso?.capa ?? 1} resuelta={caso?.resuelta ?? false}
                    conSonido={sonido} recordar={false} />
          </div>
      </div>
    </section>
  );
}
