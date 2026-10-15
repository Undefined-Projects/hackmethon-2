import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { LobbyPhaseView, ParteRobot } from '../shared/events';
import { azar, crece, preparar, type Planta } from '../lib/jardin';
import { PARTES, ROTULO, estadoDe, type EstadoParte, type ParteClave } from '../lib/anatomia';
import { DecoAtras, DetalleParte, Munon, Vegetacion } from './AnatomiaDeco';
import { formatMs } from '../lib/format';
import { sonar } from '../lib/sonido';

/**
 * LA LÁMINA ANATÓMICA DEL LOBBY.
 *
 * The Anatomy of a Machine, literal: el recorrido es un robot de pie,
 * mitad estatua orgánica (el lado izquierdo, piel de mármol con vetas)
 * y mitad máquina (el derecho, placas y pistas de circuito). Cada fase
 * es una parte de su cuerpo y se sube del suelo a la cabeza: piernas,
 * brazos, torso y, al final, la cabeza. La bonus es el corazón, que se
 * ve a través de una placa abierta del pecho.
 *
 * Superar una fase DESTRUYE su parte: tiembla, echa chispas, se
 * desprende y cae al suelo (el torso, que no puede caerse, se agrieta).
 * Sin una pierna el robot se ladea; sin las dos, se desploma. La
 * vegetación sigue creciendo sobre los restos. Las partes caídas se
 * siguen pudiendo tocar: su ficha sigue ahí.
 *
 * La caída se ve UNA vez por equipo y navegador: la primera vez que el
 * lobby se monta después de superar la fase (lo normal es volver de la
 * pantalla de victoria). Lo ya visto se guarda en localStorage, y una
 * recarga no repite el derrumbe. El panel puede ensayarla (`ensayo`):
 * cae, espera y el robot se recompone, sin tocar ningún dato.
 */

/** Lo que dura la caída entera; la animación del CSS dura lo mismo. */
const CAIDA_MS = 1700;
const ATERRIZA_MS = 1250;
/** Entre caída y caída, cuando hay varias pendientes (o en el ensayo completo). */
const ENTRE_MS = 1500;
/** Lo que el ensayo deja el robot roto antes de recomponerlo. */
const ENSAYO_ESPERA_MS = 3200;
/** Lo que se hunde el robot desplomado; el CSS usa el mismo valor. */
const HUNDIDO = 318;
const ORDEN_ENSAYO: ParteRobot[] = ['pierna-izq', 'pierna-der', 'brazo-izq', 'brazo-der', 'torso', 'corazon', 'cabeza'];

type Modo = 'pie' | 'cayendo' | 'caida';

const leerVistas = (clave: string): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(clave) ?? '[]') as string[]); } catch { return new Set(); }
};

export function Anatomia({
  lobby, partes, seleccion, onElegir, transcurrido, teamId, ensayo,
}: {
  lobby: LobbyPhaseView[];
  partes: Map<string, ParteClave>;
  seleccion: string | null;
  onElegir: (phaseId: string) => void;
  transcurrido: (f: LobbyPhaseView) => number | null;
  teamId: string;
  ensayo: { parte: ParteRobot | 'todo'; id: string; at: number } | null;
}) {
  // La vegetación de cada parte destruida, sembrada una vez.
  const plantas = useMemo(() => {
    const out = new Map<ParteClave, Planta>();
    (Object.keys(PARTES) as ParteClave[]).forEach((c, i) => {
      const b = PARTES[c].brote;
      out.set(c, preparar(crece({
        x: b.x, y: b.y, dir: b.dir, sesgo: b.sesgo, tiron: 0.4, rnd: azar(900 + i * 131),
        caja: b.caja, paso: [6, 11], largo: [4, 8], giro: 0.35, rama: 0.45, prof: 3,
        hoja: 0.6, tamHoja: 8, flor: 0.3, tamFlor: 3, max: b.max,
      })));
    });
    return out;
  }, []);

  // Las siete partes, con su fase (si tienen) y su estado.
  const porParte = new Map<ParteClave, LobbyPhaseView>();
  for (const f of lobby) { const c = partes.get(f.phaseId); if (c) porParte.set(c, f); }
  const todas = (Object.keys(PARTES) as ParteClave[]).map((c) => {
    const f = porParte.get(c) ?? null;
    return { c, f, parte: PARTES[c], estado: (f ? estadoDe(f) : 'bloqueada') as EstadoParte };
  });

  /* ── qué está de pie, qué cae y qué ya está en el suelo ─────── */
  const claveVistas = `hm:caidas:${teamId}`;
  const [vistas, setVistas] = useState<Set<string>>(() => leerVistas(claveVistas));
  const [cayendo, setCayendo] = useState<Set<ParteClave>>(new Set());
  const [temporales, setTemporales] = useState<Set<ParteClave>>(new Set());
  const [volviendo, setVolviendo] = useState(false);
  const encoladas = useRef<Set<ParteClave>>(new Set());
  const relojes = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Al desmontar se cancela todo y se vacía la cola: si no, un remontaje
  // (el modo estricto de React lo hace siempre en desarrollo) encontraría
  // las partes «encoladas» con sus relojes ya cancelados, y no caerían.
  useEffect(() => () => {
    relojes.current.forEach(clearTimeout);
    relojes.current = [];
    encoladas.current.clear();
  }, []);
  const luego = (ms: number, fn: () => void) => { relojes.current.push(setTimeout(fn, ms)); };

  const realCaida = (x: (typeof todas)[number]) => x.estado === 'resuelta' && !!x.f && vistas.has(x.f.phaseId);
  const modo = (x: (typeof todas)[number]): Modo =>
    cayendo.has(x.c) ? 'cayendo' : realCaida(x) || temporales.has(x.c) ? 'caida' : 'pie';

  /** Una parte empieza a caer; al aterrizar, `alFinal`. */
  const derriba = (c: ParteClave, alFinal: () => void) => {
    setCayendo((s) => new Set(s).add(c));
    sonar('averia');
    luego(ATERRIZA_MS, () => sonar(c === 'torso' ? 'estallido' : 'golpe'));
    luego(CAIDA_MS, () => {
      setCayendo((s) => { const n = new Set(s); n.delete(c); return n; });
      alFinal();
    });
  };

  // Las fases superadas cuya destrucción este navegador aún no vio: una
  // tras otra, poco después de llegar al lobby.
  const pendientes = todas.filter((x) => x.estado === 'resuelta' && x.f && !vistas.has(x.f.phaseId));
  const firmaPendientes = pendientes.map((x) => x.c).join(',');
  useEffect(() => {
    pendientes.filter((x) => !encoladas.current.has(x.c)).forEach((x, i) => {
      encoladas.current.add(x.c);
      luego(500 + i * ENTRE_MS, () => derriba(x.c, () => {
        encoladas.current.delete(x.c);
        setVistas((v) => {
          const n = new Set(v).add(x.f!.phaseId);
          try { localStorage.setItem(claveVistas, JSON.stringify([...n])); } catch { /* sin almacenamiento: se verá otra vez */ }
          return n;
        });
      }));
    });
  }, [firmaPendientes]); // eslint-disable-line react-hooks/exhaustive-deps

  // El ensayo del panel: cae lo pedido (salvo lo que ya está en el suelo
  // de verdad), espera y el robot se recompone.
  useEffect(() => {
    // Solo un ensayo recién llegado: el último se queda guardado en la
    // sesión, y sin esto volver al lobby desde una fase lo repetiría.
    if (!ensayo || Date.now() - ensayo.at > 10_000) return;
    const lista = (ensayo.parte === 'todo' ? ORDEN_ENSAYO : [ensayo.parte])
      .filter((c) => { const x = todas.find((t) => t.c === c)!; return !realCaida(x) && !cayendo.has(c); });
    lista.forEach((c, i) => luego(i * ENTRE_MS, () => derriba(c, () => setTemporales((s) => new Set(s).add(c)))));
    luego((lista.length - 1) * ENTRE_MS + CAIDA_MS + ENSAYO_ESPERA_MS, () => {
      setTemporales(new Set());
      setVolviendo(true);
      sonar('cortinilla');
      luego(700, () => setVolviendo(false));
    });
  }, [ensayo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── la postura: sin piernas, el robot no se tiene en pie ───── */
  const caidaFirme = (c: ParteClave) => { const x = todas.find((t) => t.c === c)!; return modo(x) === 'caida'; };
  const sinIzq = caidaFirme('pierna-izq'), sinDer = caidaFirme('pierna-der');
  const postura = sinIzq && sinDer ? 'desplomado' : sinIzq ? 'cojea-izq' : sinDer ? 'cojea-der' : 'firme';

  const avance = todas.filter((x) => x.f).length
    ? todas.filter((x) => x.estado === 'resuelta').length / todas.filter((x) => x.f).length : 0;

  const tecla = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onElegir(id); }
  };

  const pintaParte = (x: (typeof todas)[number]) => {
    const { c, f, parte, estado } = x;
    const m = modo(x);
    const cae = parte.caida;
    // El torso no se cae: se rompe en su sitio.
    const rota = c === 'torso' && m !== 'pie';
    // `--y0`: de dónde arranca la caída. Si el robot ya está desplomado,
    // la parte cae desde donde quedó hundida, no desde su sitio original.
    const estilo = cae ? {
      '--tx': `${cae.destino[0] - cae.centro[0]}px`, '--ty': `${cae.destino[1] - cae.centro[1]}px`,
      '--rot': `${cae.giro}deg`, '--esc': cae.esc, '--y0': `${postura === 'desplomado' ? HUNDIDO : 0}px`,
    } as CSSProperties : undefined;
    const interactiva = !!f;
    return (
      <g
        key={c}
        className={[
          'parte', `parte--${f ? estado : 'neutra'}`, `parte--${c}`,
          m === 'cayendo' ? (cae ? 'parte--cae' : 'parte--rompe') : '',
          m === 'caida' && cae ? 'parte--caida' : '',
          rota ? 'parte--rota' : '',
          volviendo ? 'parte--vuelve' : '',
          f && seleccion === f.phaseId ? 'sel' : '',
        ].join(' ')}
        style={estilo}
        role={interactiva ? 'button' : undefined}
        tabIndex={interactiva ? 0 : undefined}
        aria-pressed={interactiva ? seleccion === f.phaseId : undefined}
        aria-label={f ? `Fase ${f.order}, ${parte.nombre.toLowerCase()}: ${f.title}. ${ROTULO[estado].toLowerCase()}` : undefined}
        onClick={f ? () => onElegir(f.phaseId) : undefined}
        onKeyDown={f ? (e) => tecla(e, f.phaseId) : undefined}
      >
        <path d={parte.d} className="parte__base" />
        {/* Mitad estatua, mitad máquina: la misma silueta, dos pieles. */}
        <path d={parte.d} className="parte__piel parte__piel--marmol" clipPath="url(#an-organica)" />
        <path d={parte.d} className="parte__piel parte__piel--circuito" clipPath="url(#an-maquina)" />
        {/* Sobre los restos crece la vegetación. */}
        {estado === 'resuelta' && (
          <g clipPath={`url(#an-clip-${c})`}>
            <Vegetacion p={plantas.get(c)!} />
          </g>
        )}
        <path d={parte.d} className="parte__borde" />
        <DetalleParte clave={c} avance={avance} rota={rota} />
      </g>
    );
  };

  const dePie = todas.filter((x) => x.c === 'torso' || modo(x) === 'pie');
  const enSuelo = todas.filter((x) => x.c !== 'torso' && modo(x) !== 'pie');
  const caidasYa = todas.filter((x) => x.c !== 'torso' && modo(x) !== 'pie');

  return (
    <svg
      className={`anatomia ${cayendo.size ? 'anatomia--sacude' : ''}`}
      viewBox="-34 0 628 884" role="group" aria-label="El robot: cada parte del cuerpo es una fase"
    >
      <defs>
        {/* Vetas del mármol, para la mitad orgánica. */}
        <pattern id="an-marmol" width="46" height="46" patternUnits="userSpaceOnUse">
          <path d="M0 34 C10 22 18 30 26 20 S40 8 46 12" className="an-veta" />
          <path d="M6 0 C10 8 4 14 12 22" className="an-veta an-veta--fina" />
        </pattern>
        {/* Pistas de circuito, para la mitad máquina. */}
        <pattern id="an-circuito" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M0 12 H8 L12 8 H24 M12 8 V0 M18 8 V16 L22 20 H24" className="an-pista" />
          <rect x="6" y="10" width="3" height="3" className="an-via" />
          <rect x="16" y="14" width="4" height="4" className="an-via" />
        </pattern>
        <clipPath id="an-organica"><rect x="0" y="0" width="280" height="884" /></clipPath>
        <clipPath id="an-maquina"><rect x="280" y="0" width="280" height="884" /></clipPath>
        {todas.map(({ c, parte }) => (
          <clipPath key={c} id={`an-clip-${c}`}><path d={parte.d} /></clipPath>
        ))}
      </defs>

      <DecoAtras avance={avance} />
      {/* El pedestal y, debajo, el suelo donde caen los pedazos. */}
      <rect x="196" y="762" width="168" height="6" className="an-pedestal" />
      <rect x="216" y="770" width="128" height="4" className="an-pedestal an-pedestal--b" />
      <path d="M-30 878 H590" className="an-suelo" />

      {/* Las líneas de cota y los rótulos. Si la parte se cayó, la cota la
          sigue hasta el suelo: la ficha sigue ahí aunque la pieza no. */}
      {todas.filter((x) => x.f).map((x) => {
        const { f, parte, estado } = x;
        const caida = modo(x) === 'caida' && parte.caida;
        // La cota sigue a la parte: al suelo si se cayó, y hacia abajo si
        // sigue en pie pero el robot se desplomó.
        const [ax, ay0] = caida ? parte.caida!.destino : parte.ancla;
        const ay = !caida && postura === 'desplomado' ? ay0 + HUNDIDO : ay0;
        const izq = parte.lado === 'izq';
        const lx = izq ? 118 : 442;
        const codo = izq ? Math.min(ax - 14, 178) : Math.max(ax + 14, 382);
        const t = estado === 'resuelta' ? transcurrido(f!) : null;
        return (
          <g
            key={`r-${f!.phaseId}`}
            className={`an-rotulo an-rotulo--${estado} ${seleccion === f!.phaseId ? 'sel' : ''}`}
            onClick={() => onElegir(f!.phaseId)}
          >
            <polyline points={`${lx},${parte.yRotulo} ${codo},${parte.yRotulo} ${ax},${ay}`} className="an-cota" />
            <rect x={ax - 3} y={ay - 3} width="6" height="6" className="an-cota__punto" />
            <text x={izq ? lx - 6 : lx + 6} y={parte.yRotulo - 4} textAnchor={izq ? 'end' : 'start'} className="an-rotulo__n">
              <tspan className="an-rotulo__f">F{f!.order}</tspan> {parte.corto}
            </text>
            <text x={izq ? lx - 6 : lx + 6} y={parte.yRotulo + 14} textAnchor={izq ? 'end' : 'start'} className="an-rotulo__e">
              {ROTULO[estado]}{t !== null ? ` · ${formatMs(t)}` : ''}
            </text>
          </g>
        );
      })}

      {/* Lo que sigue en pie, con su postura: firme, cojo o desplomado. */}
      <g className={`an-pie an-pie--${postura}`}>
        {dePie.filter((x) => x.c !== 'corazon').map(pintaParte)}
        <path d="M282 232 H330 V288 H282 Z" className="an-placa" aria-hidden="true" />
        {dePie.filter((x) => x.c === 'corazon').map(pintaParte)}
        {/* Los muñones de lo que se cayó. */}
        {caidasYa.map(({ c, parte }) => (
          <Munon key={`m-${c}`} x={parte.munon[0]} y={parte.munon[1]} cuello={c === 'cabeza'} />
        ))}
      </g>

      {/* Lo que cae y lo que ya está en el suelo. */}
      <g className="an-escombro">
        {enSuelo.map(pintaParte)}
      </g>

      {/* Chispas al desprenderse y polvo al aterrizar. */}
      {[...cayendo].map((c) => {
        const p = PARTES[c];
        const [mx, my] = p.munon;
        const [dx, dy] = p.caida ? p.caida.destino : p.munon;
        return (
          <g key={`fx-${c}`} className="an-fx" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              return (
                <rect
                  key={`c${i}`} x={mx - 2} y={my - 2} width="4" height="4" className="an-fx__chispa"
                  style={{ '--vx': `${Math.cos(a) * (30 + (i % 3) * 18)}px`, '--vy': `${Math.sin(a) * (30 + (i % 4) * 14) - 20}px`, animationDelay: `${(i % 4) * 0.05}s` } as CSSProperties}
                />
              );
            })}
            {p.caida && Array.from({ length: 10 }, (_, i) => (
              <rect
                key={`p${i}`} x={dx - 3} y={dy - 3} width="7" height="5" className="an-fx__polvo"
                style={{ '--vx': `${(i - 4.5) * 14}px`, '--vy': `${-8 - (i % 3) * 8}px` } as CSSProperties}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
