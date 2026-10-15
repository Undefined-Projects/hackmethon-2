import { useMemo } from 'react';
import { azar, crece, preparar, type Planta, type Semilla } from '../lib/jardin';
import type { ParteClave } from '../lib/anatomia';

/**
 * La decoración permanente del robot del lobby: circuitos expuestos en
 * el lado máquina y vegetación que lo va reclamando.
 *
 * Dos capas. La de ATRÁS (raíces por el pedestal, jardín en las esquinas
 * de la lámina) va debajo del cuerpo; la de ENFRENTE (enredaderas que
 * trepan las piernas, cables que cuelgan, placas al descubierto) va
 * encima, pero sin recibir clics: las partes siguen siendo tocables a
 * través de ella.
 *
 * La vegetación crece con el progreso del equipo (`avance`, 0-1): arranca
 * escasa y termina frondosa. Es la misma idea que las partes resueltas,
 * pero en todo el cuerpo: la planta se va adueñando de la máquina.
 */

export type Tono = 'vida' | 'raiz' | 'circuito';

/** Una planta del jardín, en SVG. `hasta` (0-1) corta el crecimiento. */
export function Vegetacion({ p, tono = 'vida', hasta = 1 }: { p: Planta; tono?: Tono; hasta?: number }) {
  const D = (p.dmax ?? 1) * hasta;
  const k = (d: number) => d / Math.max(1, p.dmax ?? 1);
  return (
    <g className={`vida vida--${tono}`}>
      {p.tallos.filter((t) => t.d0 < D).map((t, i) => (
        <polyline
          key={`t${i}`} pathLength={1}
          className={`vida__tallo vida__tallo--${Math.min(t.prof, 3)}`}
          points={t.pts.map((q) => q.join(',')).join(' ')}
          style={{ animationDelay: `${k(t.d0) * 0.9}s` }}
        />
      ))}
      {p.chips.filter((c) => c.d < D).map((c, i) => (
        <rect
          key={`c${i}`} className="vida__chip" x={c.x - 4} y={c.y - 2.5} width="8" height="5"
          transform={`rotate(${c.dir * 45} ${c.x} ${c.y})`}
          style={{ animationDelay: `${0.3 + k(c.d) * 0.9}s` }}
        />
      ))}
      {p.hojas.filter((h) => h.d < D).map((h, i) => (
        <polygon
          key={`h${i}`} className={`vida__hoja vida__hoja--${i % 3}`}
          points={(h.poly ?? []).map(([a, b]) => `${h.x + a},${h.y + b}`).join(' ')}
          style={{ animationDelay: `${0.3 + k(h.d) * 0.9}s` }}
        />
      ))}
      {p.flores.filter((f) => f.d < D).map((f, i) => (
        <g key={`f${i}`} className="vida__flor" style={{ animationDelay: `${0.8 + k(f.d) * 0.6}s` }}>
          {[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy], j) => (
            <rect key={j} x={f.x + dx * f.tam - f.tam / 2} y={f.y + dy * f.tam - f.tam / 2} width={f.tam} height={f.tam} className="vida__petalo" />
          ))}
          <rect x={f.x - f.tam / 2} y={f.y - f.tam / 2} width={f.tam} height={f.tam} className="vida__centro" />
        </g>
      ))}
    </g>
  );
}

type Siembra = { tono: Tono; o: Omit<Semilla, 'rnd' | 'paso' | 'largo' | 'giro' | 'rama' | 'prof'> & Partial<Semilla> };

const BASE = { paso: [6, 11] as [number, number], largo: [4, 8] as [number, number], giro: 0.35, rama: 0.45, prof: 3 };

/** Debajo del cuerpo: raíces por el pedestal y el jardín de las esquinas. */
const ATRAS: Siembra[] = [
  { tono: 'raiz', o: { x: 250, y: 760, dir: 4, sesgo: 4, tiron: 0.4, caja: [-30, 748, 282, 790], hoja: 0.05, flor: 0, chip: 0.22, max: 60 } },
  { tono: 'raiz', o: { x: 310, y: 760, dir: 0, sesgo: 0, tiron: 0.4, caja: [278, 748, 590, 790], hoja: 0.05, flor: 0, chip: 0.22, max: 60 } },
  // Las esquinas de la lámina, lejos de los rótulos.
  { tono: 'vida', o: { x: -30, y: 2, dir: 1, sesgo: 2, tiron: 0.3, caja: [-34, 0, 112, 190], hoja: 0.5, tamHoja: 8, flor: 0.25, tamFlor: 3, max: 45 } },
  { tono: 'circuito', o: { x: 590, y: 2, dir: 3, sesgo: 2, tiron: 0.3, caja: [500, 0, 594, 50], hoja: 0, flor: 0, chip: 0.3, max: 24 } },
  { tono: 'vida', o: { x: -30, y: 788, dir: 7, sesgo: 6, tiron: 0.3, caja: [-34, 650, 150, 790], hoja: 0.55, tamHoja: 8, flor: 0.25, tamFlor: 3, max: 45 } },
  { tono: 'raiz', o: { x: 590, y: 788, dir: 5, sesgo: 6, tiron: 0.3, caja: [430, 650, 594, 790], hoja: 0.15, flor: 0.1, chip: 0.2, max: 45 } },
];

/** Encima de cada parte: lo que trepa y lo que brota. Va con su parte,
 *  así que si la parte se cae, su vegetación se cae con ella. */
const ENFRENTE: (Siembra & { parte: ParteClave })[] = [
  // Trepadoras desde el suelo: una por la pierna de estatua y otra por la
  // de máquina, que es la naturaleza reclamándola.
  { parte: 'pierna-izq', tono: 'vida', o: { x: 224, y: 760, dir: 6, sesgo: 6, tiron: 0.45, caja: [212, 470, 266, 762], hoja: 0.65, tamHoja: 9, flor: 0.25, tamFlor: 3, max: 48 } },
  { parte: 'pierna-der', tono: 'vida', o: { x: 336, y: 760, dir: 6, sesgo: 6, tiron: 0.45, caja: [296, 520, 348, 762], hoja: 0.6, tamHoja: 8, flor: 0.2, tamFlor: 3, max: 42 } },
  // La que cuelga del hombro por el brazo de estatua.
  { parte: 'brazo-izq', tono: 'vida', o: { x: 190, y: 196, dir: 2, sesgo: 2, tiron: 0.4, caja: [108, 194, 200, 470], hoja: 0.7, tamHoja: 9, flor: 0.3, tamFlor: 3, max: 51 } },
  // Y la que sube desde la mano blindada por el brazo de máquina.
  { parte: 'brazo-der', tono: 'vida', o: { x: 428, y: 500, dir: 6, sesgo: 6, tiron: 0.4, caja: [390, 300, 452, 506], hoja: 0.65, tamHoja: 8, flor: 0.3, tamFlor: 3, max: 36 } },
  // Brotes por las grietas de la cabeza y musgo en el costado.
  { parte: 'cabeza', tono: 'vida', o: { x: 244, y: 74, dir: 6, sesgo: 7, tiron: 0.4, caja: [226, 8, 274, 80], hoja: 0.6, tamHoja: 7, flor: 0.5, tamFlor: 2.6, max: 15 } },
  { parte: 'torso', tono: 'vida', o: { x: 212, y: 344, dir: 7, sesgo: 6, tiron: 0.4, caja: [200, 286, 252, 350], hoja: 0.7, tamHoja: 7, flor: 0.3, tamFlor: 2.6, max: 18 } },
];

function usePlantas(lista: Siembra[], semilla: number) {
  // Las semillas no cambian: misma planta en cada repintado y en cada equipo.
  return useMemo(() => lista.map((s, i) => ({
    tono: s.tono,
    p: preparar(crece({ ...BASE, ...s.o, rnd: azar(semilla + i * 977) } as Semilla)),
  })), [lista, semilla]);
}

export function DecoAtras({ avance }: { avance: number }) {
  const plantas = usePlantas(ATRAS, 4100);
  return (
    <g className="an-deco an-deco--atras" aria-hidden="true">
      {plantas.map(({ p, tono }, i) => <Vegetacion key={i} p={p} tono={tono} hasta={0.55 + 0.45 * avance} />)}
    </g>
  );
}

/** Los cables que cuelgan: [origen, control, punta]. */
const CABLES: { d: string; punta: [number, number]; tono: string; retraso: number }[] = [
  { d: 'M384 206 C412 214 420 252 436 286', punta: [436, 286], tono: 'azul', retraso: 0 },
  { d: 'M386 210 C420 226 446 268 454 318', punta: [454, 318], tono: 'phos', retraso: 0.4 },
  { d: 'M382 214 C404 236 412 290 426 334', punta: [426, 334], tono: 'violeta', retraso: 0.8 },
  { d: 'M388 204 C432 210 470 236 478 272', punta: [478, 272], tono: 'verde', retraso: 1.2 },
  { d: 'M358 318 C386 332 398 362 404 392', punta: [404, 392], tono: 'phos', retraso: 0.6 },
  { d: 'M356 330 C380 352 384 392 390 424', punta: [390, 424], tono: 'azul', retraso: 1 },
];

/** Las placas al descubierto: [x, y, ancho, alto] y la parte que las lleva. */
const PLACAS: { parte: ParteClave; r: [number, number, number, number] }[] = [
  { parte: 'pierna-der', r: [288, 462, 30, 58] },   // muslo
  { parte: 'brazo-der', r: [392, 392, 18, 36] },    // antebrazo
  { parte: 'cabeza', r: [300, 98, 22, 22] },        // sien
];

function Placa({ r: [x, y, w, h], i }: { r: [number, number, number, number]; i: number }) {
  return (
    <g className="an-pcb">
      <rect x={x} y={y} width={w} height={h} className="an-pcb__fondo" />
      {/* Pistas: van y vienen en escalera, como en una tarjeta de verdad. */}
      {Array.from({ length: Math.max(2, Math.floor(h / 10)) }, (_, k) => {
        const yy = y + 5 + k * 10;
        return <path key={k} d={`M${x + 2} ${yy} H${x + w * 0.45} L${x + w * 0.6} ${yy + 4} H${x + w - 2}`} className="an-pcb__pista" />;
      })}
      {Array.from({ length: Math.max(1, Math.floor((w * h) / 380)) }, (_, k) => (
        <rect key={`c${k}`} x={x + 3 + ((k * 11) % Math.max(1, w - 10))} y={y + 3 + ((k * 17) % Math.max(1, h - 10))} width="7" height="5" className="an-pcb__chip" />
      ))}
      <rect x={x + w - 5} y={y + 3} width="3" height="3" className="an-led" style={{ animationDelay: `${i * 0.7}s` }} />
      <rect x={x + 2} y={y + h - 5} width="3" height="3" className="an-led an-led--verde" style={{ animationDelay: `${0.3 + i * 0.5}s` }} />
      <rect x={x} y={y} width={w} height={h} className="an-pcb__borde" />
    </g>
  );
}

const Remaches = ({ en }: { en: [number, number][] }) => (
  <>{en.map(([x, y]) => <rect key={`r${x}-${y}`} x={x - 2} y={y - 2} width="4" height="4" className="an-remache" />)}</>
);

/** Los trazos fijos de cada parte: lo estatua (líneas de anatomía, rizos)
 *  y lo máquina (placas, juntas, cables). */
function Trazos({ clave, rota }: { clave: ParteClave; rota: boolean }) {
  switch (clave) {
    case 'cabeza':
      return (
        <>
          <path d="M280 24 V160" className="an-costura" />
          <path d="M244 92 L262 88 L266 96 L248 98 Z" className="an-ojo an-ojo--organico" />
          <rect x="294" y="88" width="20" height="8" className="an-ojo an-ojo--led" />
          <path d="M262 132 H298" className="an-boca" />
          <path d="M238 66 a7 7 0 1 1 12 6 M252 48 a7 7 0 1 1 12 6 M234 86 a7 7 0 1 1 12 6 M262 36 a6 6 0 1 1 11 5" className="an-rizo" />
          <path d="M248 60 C258 80 252 110 264 130" className="an-veta-cuerpo" />
          <path d="M244 114 L258 120" className="an-anatomia" />
          <path d="M296 56 H318 L326 64 M300 140 H316 L322 132" className="an-placas" />
          <path d="M294 120 H318 L326 112 M314 92 H326 L332 86" className="an-cable" />
        </>
      );
    case 'torso':
      return (
        <>
          <path d="M280 188 V432" className="an-costura" />
          <path d="M262 200 C248 240 266 280 244 320 M222 250 C236 270 230 300 246 330" className="an-veta-cuerpo" />
          <path d="M212 200 C234 210 256 208 278 200 M210 236 C226 266 258 270 278 250 M248 300 H276 M250 330 H276 M252 362 H276 M242 396 C254 404 266 404 278 398" className="an-anatomia" />
          <path d="M284 210 H352 M284 246 H366 M284 300 H354 M284 340 H346 M290 384 H334" className="an-placas" />
          <path d="M296 192 V214 L316 234 H340 M340 210 L356 236 M300 300 H330 L344 286 M290 336 V362 L310 382 H324" className="an-cable" />
          <path d="M296 192 V214 L316 234 H340 M300 300 H330 L344 286 M290 336 V362 L310 382 H324" className="an-cable an-cable--pulso" />
          <Remaches en={[[352, 210], [366, 246], [354, 300], [346, 340], [334, 384]]} />
          {/* Destruido: grietas, placas saltadas y humo. */}
          {rota && (
            <g className="an-rotura">
              <path d="M238 206 L256 248 L244 290 L266 332 L250 376 L262 420" className="an-grieta" />
              <path d="M334 214 L316 258 L338 300 L320 348 L332 392" className="an-grieta" />
              <path d="M256 248 L232 262 M266 332 L292 340 M316 258 L296 270" className="an-grieta an-grieta--fina" />
              <path d="M300 212 H332 V236 H300 Z M206 300 L226 296 L230 318 L212 324 Z" className="an-hueco" />
              {[[262, 300], [318, 250], [244, 380], [330, 350], [282, 220]].map(([x, y], i) => (
                <rect key={i} x={x} y={y} width="6" height="6" className="an-humo" style={{ animationDelay: `${i * 0.55}s` }} />
              ))}
            </g>
          )}
        </>
      );
    case 'brazo-izq':
      return <path d="M152 314 C160 322 170 322 176 314 M126 488 L136 496 L150 494" className="an-anatomia" />;
    case 'brazo-der':
      return (
        <>
          <path d="M382 304 H410 V330 H382 Z M384 194 L376 212 L404 226 L406 206 Z" className="an-junta" />
          <path d="M410 488 V502 M418 488 V504 M426 486 V500 M434 482 V494" className="an-dedos" />
          <Remaches en={[[386, 308], [406, 308]]} />
        </>
      );
    case 'pierna-izq':
      return <path d="M238 566 C250 576 262 576 274 566" className="an-anatomia" />;
    case 'pierna-der':
      return (
        <>
          <path d="M286 558 H326 V588 H286 Z" className="an-junta" />
          <path d="M284 500 H322 M286 680 H318" className="an-placas" />
          <Remaches en={[[322, 500], [318, 680], [290, 566], [322, 566]]} />
        </>
      );
    default:
      return null;
  }
}

/**
 * Todo lo que va pegado a una parte: sus trazos, sus placas al
 * descubierto, su vegetación y —el torso— los cables que cuelgan del
 * hombro. Se dibuja DENTRO del grupo de la parte, así que si la parte se
 * cae, se cae con todo; y lo que es del torso se queda colgando del
 * muñón cuando se cae el brazo.
 */
export function DetalleParte({ clave, avance, rota }: { clave: ParteClave; avance: number; rota: boolean }) {
  const plantas = usePlantas(ENFRENTE, 5300);
  return (
    <g className="an-deco an-detalle-parte" aria-hidden="true">
      <Trazos clave={clave} rota={rota} />
      {PLACAS.filter((pl) => pl.parte === clave).map((pl, i) => <Placa key={i} r={pl.r} i={i} />)}
      {clave === 'torso' && CABLES.map((c, i) => (
        // Cada cable se mece desde donde se arrancó: el inicio de su trazo.
        <g
          key={`k${i}`} className="an-colgante"
          style={{ animationDelay: `${c.retraso}s`, transformOrigin: c.d.replace(/^M(\d+) (\d+).*/, '$1px $2px') }}
        >
          <path d={c.d} className={`an-hilo an-hilo--${c.tono}`} />
          <path d={c.d} className="an-hilo an-hilo--chispa" style={{ animationDelay: `${c.retraso * 1.7}s` }} />
          <rect x={c.punta[0] - 3} y={c.punta[1] - 2} width="6" height="7" className={`an-conector an-hilo--${c.tono}`} />
        </g>
      ))}
      {ENFRENTE.map((e, i) => e.parte === clave && (
        <Vegetacion key={i} p={plantas[i].p} tono={plantas[i].tono} hasta={0.35 + 0.65 * avance} />
      ))}
    </g>
  );
}

/** El muñón: donde estaba unida una parte que se cayó. Cables
 *  arrancados que chisporrotean y, del cuello, flores. */
export function Munon({ x, y, cuello }: { x: number; y: number; cuello?: boolean }) {
  return (
    <g className="an-munon" aria-hidden="true">
      <path d={`M${x - 14} ${y - 4} L${x - 6} ${y + 5} L${x} ${y - 2} L${x + 7} ${y + 6} L${x + 14} ${y - 3} Z`} className="an-munon__hueco" />
      <path d={`M${x - 8} ${y + 2} C${x - 12} ${y + 14} ${x - 4} ${y + 18} ${x - 10} ${y + 30}`} className="an-hilo an-hilo--phos" />
      <path d={`M${x + 2} ${y + 3} C${x + 6} ${y + 16} ${x - 2} ${y + 22} ${x + 4} ${y + 34}`} className="an-hilo an-hilo--azul" />
      <path d={`M${x + 9} ${y + 2} C${x + 16} ${y + 10} ${x + 12} ${y + 18} ${x + 18} ${y + 24}`} className="an-hilo an-hilo--violeta" />
      <rect x={x - 12} y={y + 28} width="4" height="4" className="an-chispa" />
      <rect x={x + 16} y={y + 22} width="3" height="3" className="an-chispa" style={{ animationDelay: '.4s' }} />
      {cuello && [[-12, -10], [0, -18], [12, -10]].map(([dx, dy], i) => (
        <g key={i} className="vida__flor" style={{ animationDelay: `${1.6 + i * 0.15}s` }}>
          {[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([a, b], k) => (
            <rect key={k} x={x + dx + a * 5 - 2.5} y={y + dy + b * 5 - 2.5} width="5" height="5" className="vida__petalo" />
          ))}
          <rect x={x + dx - 2.5} y={y + dy - 2.5} width="5" height="5" className="vida__centro" />
        </g>
      ))}
    </g>
  );
}
