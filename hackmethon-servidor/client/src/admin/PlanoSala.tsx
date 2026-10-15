import { useMemo } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode, Ref } from 'react';
import { azar, crece, preparar, type Semilla } from '../lib/jardin';
import { Vegetacion, type Tono } from '../player/AnatomiaDeco';
import type { ElementoPlano, Plano } from '../shared/events';
import type { EquipoPlano } from '../lib/plano';

/**
 * El dibujo del plano del auditorio, en SVG y en metros.
 *
 * Lo comparten la ventana del proyector (MapaSala) y el editor
 * (EditorMapa): el editor le añade la selección y los tiradores, pero la
 * sala se pinta con el mismo código en los dos sitios, así que lo que
 * se ve al editar es lo que se verá en la pared.
 *
 * El viewBox va en metros, así que todo escala solo con la pantalla:
 * una mesa de 1,8 m es 1,8 unidades aquí y en el proyector de cuatro
 * metros. Los textos también van en metros por lo mismo.
 */

/** Medio metro de aire alrededor de la sala, para los rótulos del canto. */
const MARGEN = 0.6;

type Props = {
  plano: Pick<Plano, 'ancho' | 'alto' | 'elementos'>;
  equipos: Map<string, EquipoPlano>;
  /** El proyector colorea las mesas por estado; el editor no. */
  conEstado?: boolean;
  /** Solo el editor. */
  editor?: {
    seleccion: Set<string>;
    marco: { x0: number; y0: number; x1: number; y1: number } | null;
    alPulsar: (e: ReactPointerEvent, id: string | null, modo: 'mover' | 'tamano' | 'girar') => void;
  };
  svgRef?: Ref<SVGSVGElement>;
  className?: string;
  /** Mesas que se pueden pulsar (el mapa de ataque) y la clase extra de
   *  cada una: la propia, la elegida, la que no se puede repetir… */
  mesas?: { alElegir: (el: ElementoPlano) => void; clase: (el: ElementoPlano) => string };
  /** Lo que va por encima de todo: las líneas de los ataques. */
  encima?: ReactNode;
  /** Hierba y circuitos trepando por las paredes de la sala. */
  maleza?: boolean;
};

export function PlanoSala({ plano, equipos, conEstado, editor, svgRef, className, mesas, encima, maleza }: Props) {
  const { ancho, alto } = plano;
  // Primero lo que va al suelo (zonas, escenario), luego lo que va encima:
  // una mesa dibujada antes que su zona quedaría tapada por ella.
  const orden = [...plano.elementos].sort((a, b) => CAPA[a.tipo] - CAPA[b.tipo]);
  return (
    <svg
      ref={svgRef}
      className={`plano ${editor ? 'plano--editor' : ''} ${className ?? ''}`}
      viewBox={`${-MARGEN} ${-MARGEN} ${ancho + 2 * MARGEN} ${alto + 2 * MARGEN}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={editor ? (e) => { if (e.target === e.currentTarget || (e.target as Element).classList.contains('plano-suelo')) editor.alPulsar(e, null, 'mover'); } : undefined}
    >
      <defs>
        <pattern id="plano-metro" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M1 0 H0 V1" className="plano-rejilla" />
        </pattern>
        <pattern id="plano-cinco" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M5 0 H0 V5" className="plano-rejilla plano-rejilla--5" />
        </pattern>
      </defs>
      <rect className="plano-suelo" x={0} y={0} width={ancho} height={alto} />
      <rect className="plano-suelo plano-suelo--rejilla" x={0} y={0} width={ancho} height={alto} fill="url(#plano-metro)" />
      <rect className="plano-suelo plano-suelo--rejilla" x={0} y={0} width={ancho} height={alto} fill="url(#plano-cinco)" />
      <rect className="plano-muro" x={0} y={0} width={ancho} height={alto} />
      {maleza && <Maleza ancho={ancho} alto={alto} />}
      {/* Las vías de las esquinas: la sala es una placa más. */}
      {[[0, 0], [ancho, 0], [0, alto], [ancho, alto]].map(([x, y], i) => (
        <rect key={i} className="plano-via" x={x - 0.18} y={y - 0.18} width={0.36} height={0.36} />
      ))}

      {orden.map((el) => (
        <Pieza
          key={el.id} el={el} equipo={el.teamId ? equipos.get(el.teamId) ?? null : null}
          conEstado={!!conEstado} elegida={!!editor?.seleccion.has(el.id)}
          alPulsar={editor?.alPulsar}
          tiradores={!!editor && editor.seleccion.size === 1 && editor.seleccion.has(el.id)}
          extra={el.tipo === 'mesa' && mesas ? mesas.clase(el) : ''}
          alElegir={el.tipo === 'mesa' && mesas ? () => mesas.alElegir(el) : undefined}
        />
      ))}

      {encima}

      {editor?.marco && (
        <rect
          className="plano-marco"
          x={Math.min(editor.marco.x0, editor.marco.x1)} y={Math.min(editor.marco.y0, editor.marco.y1)}
          width={Math.abs(editor.marco.x1 - editor.marco.x0)} height={Math.abs(editor.marco.y1 - editor.marco.y0)}
        />
      )}
    </svg>
  );
}

const CAPA: Record<ElementoPlano['tipo'], number> = {
  zona: 0, escenario: 1, pared: 2, columna: 2, puerta: 2, pantalla: 3, mesa: 4, texto: 5,
};

/** El hueco de la mesa en el que caben logo y nombre, ya enderezado: una
 *  mesa girada 90° deja un hueco de pie, no tumbado. */
function huecoDerecho(el: ElementoPlano) {
  const a = ((el.rot % 180) + 180) % 180;
  const tumbada = a > 45 && a < 135;
  const k = el.redonda ? 0.68 : 0.88;
  return tumbada ? { w: el.h * k, h: el.w * k } : { w: el.w * k, h: el.h * k };
}

/** Cuánto ocupa un texto en la letra pixel, en «emes». Aproximado, pero
 *  basta para que un nombre largo encoja en vez de salirse de la mesa. */
const anchoTexto = (t: string) => Math.max(1, t.length) * 0.78;
/** El nombre bajo la mesa, en metros de sala: a 1920 px una sala de 30 m
 *  lo deja en unos 14 px, que se lee desde la mitad de la sala. */
const NOMBRE = 0.36;

function Pieza({ el, equipo, conEstado, elegida, tiradores, alPulsar, extra, alElegir }: {
  el: ElementoPlano; equipo: EquipoPlano | null; conEstado: boolean; elegida: boolean; tiradores: boolean;
  extra?: string; alElegir?: () => void;
  alPulsar?: (e: ReactPointerEvent, id: string | null, modo: 'mover' | 'tamano' | 'girar') => void;
}) {
  const { w, h } = el;
  const estado = el.tipo === 'mesa'
    ? (equipo ? (conEstado ? `mesa--${equipo.estado}` : 'mesa--ocupada') : 'mesa--libre')
    : '';
  const forma = el.redonda
    ? <ellipse className="pieza-forma" cx={0} cy={0} rx={w / 2} ry={h / 2} />
    : <rect className="pieza-forma" x={-w / 2} y={-h / 2} width={w} height={h} rx={el.tipo === 'mesa' ? Math.min(w, h) * 0.08 : 0} />;

  return (
    <g
      className={`pieza pieza--${el.tipo} ${estado} ${elegida ? 'elegida' : ''} ${extra ?? ''}`}
      transform={`translate(${el.x} ${el.y}) rotate(${el.rot})`}
      onClick={alElegir}
      onPointerDown={alPulsar ? (e) => { e.stopPropagation(); alPulsar(e, el.id, 'mover'); } : undefined}
    >
      {/* El texto también lleva forma, transparente: es lo que se agarra en el editor. */}
      {forma}
      {el.tipo === 'escenario' && (
        // Tablas del escenario: listones a lo ancho.
        Array.from({ length: Math.max(0, Math.floor(h / 0.5) - 1) }, (_, i) => (
          <path key={i} className="pieza-liston" d={`M${-w / 2} ${-h / 2 + (i + 1) * 0.5} H${w / 2}`} />
        ))
      )}
      <Contenido el={el} equipo={equipo} conEstado={conEstado} />
      {tiradores && alPulsar && (
        <>
          <path className="tirador-tallo" d={`M0 ${-h / 2} V${-h / 2 - 0.55}`} />
          <circle
            className="tirador tirador--giro" cx={0} cy={-h / 2 - 0.6} r={0.2}
            onPointerDown={(e) => { e.stopPropagation(); alPulsar(e, el.id, 'girar'); }}
          />
          <rect
            className="tirador tirador--tamano" x={w / 2 - 0.16} y={h / 2 - 0.16} width={0.32} height={0.32}
            onPointerDown={(e) => { e.stopPropagation(); alPulsar(e, el.id, 'tamano'); }}
          />
        </>
      )}
    </g>
  );
}

/** Lo que va escrito dentro: siempre DERECHO, gire como gire la pieza. */
function Contenido({ el, equipo, conEstado }: { el: ElementoPlano; equipo: EquipoPlano | null; conEstado: boolean }) {
  const enderezar = `rotate(${-el.rot})`;

  if (el.tipo === 'texto') {
    const t = el.etiqueta || 'TEXTO';
    const f = Math.min(el.h, el.w / anchoTexto(t));
    return (
      <g transform={enderezar}>
        <text className="pieza-texto pieza-texto--libre" x={0} y={0} fontSize={f} dominantBaseline="central" textAnchor="middle">{t}</text>
      </g>
    );
  }

  if (el.tipo !== 'mesa') {
    if (!el.etiqueta) return null;
    const { w, h } = huecoDerecho(el);
    const f = Math.min(h * 0.5, 0.6, w / anchoTexto(el.etiqueta));
    // Una puerta o una pantalla son tiras finas: el rótulo va fuera, al lado.
    const fuera = h < 0.45;
    return (
      <g transform={enderezar}>
        <text
          className="pieza-texto" x={0} y={fuera ? -h / 0.88 / 2 - 0.1 : 0}
          fontSize={fuera ? 0.28 : f} dominantBaseline={fuera ? 'auto' : 'central'} textAnchor="middle"
        >{el.etiqueta}</text>
      </g>
    );
  }

  // La mesa: logo y nombre del equipo, o su número si está libre.
  const { w, h } = huecoDerecho(el);
  const marca = conEstado && equipo?.marca;
  // El número a la izquierda del logo y la fase a la derecha, a media
  // altura: el logo va en el centro y las esquinas de arriba chocaban.
  const fLado = Math.min(0.2, h * 0.26, (w - Math.min(w, h) * 0.86) / 2 / anchoTexto('M00'));
  const etiqueta = el.etiqueta ? (
    <text className="pieza-num" x={-w / 2} y={0} fontSize={fLado} dominantBaseline="central">{el.etiqueta}</text>
  ) : null;
  const marcaTxt = marca ? (
    <text className="pieza-marca" x={w / 2} y={0} fontSize={fLado} dominantBaseline="central" textAnchor="end">{marca}</text>
  ) : null;

  if (!equipo) {
    return (
      <g transform={enderezar}>
        <text className="pieza-texto pieza-texto--libre" x={0} y={0} dominantBaseline="central" textAnchor="middle"
          fontSize={Math.min(h * 0.4, 0.42, w / anchoTexto(el.etiqueta || 'LIBRE'))}>
          {el.etiqueta || 'LIBRE'}
        </text>
      </g>
    );
  }

  // El logo, grande y centrado DENTRO de la mesa: es lo que se busca
  // desde lejos. El nombre, DEBAJO y por fuera, a un tamaño fijo: dentro
  // de una mesa de 1,8 m cada nombre tendría que encoger a su manera y
  // los largos no se leerían. Debajo se mide desde la caja de la mesa ya
  // girada, para que una mesa en diagonal no se coma su propio nombre.
  const s = Math.min(w, h) * 0.86;
  const r = (el.rot * Math.PI) / 180;
  const bajo = Math.abs((el.w / 2) * Math.sin(r)) + Math.abs((el.h / 2) * Math.cos(r));
  const fNombre = Math.min(NOMBRE, (Math.max(el.w, el.h) + 1.1) / anchoTexto(equipo.nombre));

  return (
    <g transform={enderezar}>
      {etiqueta}
      {marcaTxt}
      {equipo.logo
        ? <image className="pieza-logo" href={equipo.logo} x={-s / 2} y={-s / 2} width={s} height={s} preserveAspectRatio="xMidYMid meet" />
        : <rect className="pieza-logo-hueco" x={-s / 2} y={-s / 2} width={s} height={s} />}
      <text className="pieza-texto pieza-nombre" x={0} y={bajo + 0.1} fontSize={fNombre} dominantBaseline="hanging" textAnchor="middle">
        {equipo.nombre}
      </text>
    </g>
  );
}

/**
 * La maleza de la sala: hierba y pistas de circuito que nacen en las
 * cuatro esquinas y trepan pegadas a las paredes. Del mismo generador
 * que el lobby y la carrera, en SVG para que escale con el plano.
 *
 * El generador piensa en píxeles (un paso son 6-12), así que se siembra
 * a 20 «píxeles» por metro y se encoge al dibujar. Va por debajo de las
 * piezas y sin recibir clics: adorna, no estorba. Las franjas de arriba
 * se quedan en los tercios de los lados, que en medio está el escenario.
 */
const PX = 20;
const FRANJA = 1.3;

function Maleza({ ancho, alto }: { ancho: number; alto: number }) {
  const plantas = useMemo(() => {
    const W = ancho * PX, H = alto * PX, F = FRANJA * PX;
    const r = azar(5150);
    const base = { rnd: r, paso: [6, 12] as [number, number], largo: [4, 8] as [number, number], giro: 0.3, rama: 0.4, prof: 2, tiron: 0.5 };
    const sembrar: { tono: Tono; o: Partial<Semilla> }[] = [];
    for (const [x, haciaDentro, sesgoX] of [[0, 1, 0], [W, -1, 4]] as const) {
      const xs: [number, number] = haciaDentro > 0 ? [0, F] : [W - F, W];
      const tercio: [number, number] = haciaDentro > 0 ? [0, W * 0.3] : [W * 0.7, W];
      // Por la pared lateral: baja desde arriba (circuito) y sube desde abajo (hierba).
      sembrar.push({ tono: 'circuito', o: { x, y: 0, dir: 2, sesgo: 2, caja: [xs[0], 0, xs[1], H * 0.45], hoja: 0.05, flor: 0, chip: 0.25, max: 34 } });
      sembrar.push({ tono: 'vida', o: { x, y: H, dir: 6, sesgo: 6, caja: [xs[0], H * 0.5, xs[1], H], hoja: 0.6, tamHoja: 9, flor: 0.25, tamFlor: 3, max: 40 } });
      // Por la pared de arriba y la de abajo, hacia el centro.
      sembrar.push({ tono: 'raiz', o: { x, y: 0, dir: sesgoX, sesgo: sesgoX, caja: [tercio[0], 0, tercio[1], F], hoja: 0.2, flor: 0.1, chip: 0.12, max: 30 } });
      sembrar.push({ tono: 'vida', o: { x, y: H, dir: sesgoX, sesgo: sesgoX, caja: [tercio[0], H - F, tercio[1], H], hoja: 0.65, tamHoja: 9, flor: 0.3, tamFlor: 3, max: 36 } });
    }
    return sembrar.map(({ tono, o }) => ({ tono, p: preparar(crece({ ...base, ...o } as Semilla)) }));
  }, [ancho, alto]);

  return (
    <g className="plano-maleza" transform={`scale(${1 / PX})`} aria-hidden="true">
      {plantas.map(({ p, tono }, i) => <Vegetacion key={i} p={p} tono={tono} />)}
    </g>
  );
}
