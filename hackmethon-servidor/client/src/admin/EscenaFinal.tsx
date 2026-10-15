import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { FinalView } from '../shared/events';
import { useTicker } from '../lib/useTicker';
import { sonar } from '../lib/sonido';

// ============================================================
//  La final: el cohete.
//
//  Es la única escena de la proyección que SÍ lee el estado del juego,
//  y por eso vive aparte de las demás. Las otras cuentan de qué va su
//  fase en bucle; esta cuenta lo que está pasando ahora mismo: cuánto
//  queda para el lanzamiento y si alguien llegó a abortarlo.
//
//  El desenlace no se guarda en ninguna parte. Sale de tres hechos
//  —cuándo se abrió la fase, cuánto dura y si alguien la resolvió— así
//  que una ventana que se abre a mitad muestra lo correcto sin que
//  nadie tenga que reenviarle nada.
// ============================================================

/** Lo que dura la animación del desenlace. Pasado ese rato, una ventana
 *  que se abre tarde ve el resultado quieto en vez de repetirlo. */
const ANIMACION_MS = 25_000;

type Desenlace = 'VICTORIA' | 'DERROTA';
type Estado = 'ESPERA' | 'CUENTA' | Desenlace;

const vars = (o: Record<string, string | number>) => o as CSSProperties;

const reloj = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Silueta plana, como el caballo de la carrera: a diez metros un
 *  dibujo con detalle es una mancha y un recorte se lee. */
function Cohete() {
  return (
    <svg className="cohete" viewBox="0 0 52 132" role="img" aria-label="cohete">
      {/* fuselaje, de la punta a la tobera y de una pieza */}
      <path d="M26 0 C35 18 40 40 40 64 L40 100 L12 100 L12 64 C12 40 17 18 26 0 Z" />
      {/* aletas */}
      <path d="M12 72 L2 104 L2 114 L12 102 Z" />
      <path d="M40 72 L50 104 L50 114 L40 102 Z" />
      {/* tobera */}
      <path d="M15 100 L37 100 L33 116 L19 116 Z" />
      {/* ventanilla y franjas: lo único que le da escala */}
      <circle className="cohete-ojo" cx="26" cy="46" r="6.5" />
      <rect className="cohete-franja" x="12" y="76" width="28" height="4" />
      <rect className="cohete-franja" x="12" y="86" width="28" height="4" />
    </svg>
  );
}

export function EscenaFinal({
  final, ensayo, stampedAt, paused, clockOffset,
}: {
  final: FinalView;
  /** Desenlace forzado desde el panel. Manda sobre el real: es un ensayo. */
  ensayo: Desenlace | null;
  stampedAt: number;
  paused: boolean;
  clockOffset: number;
}) {
  // Cuarto de segundo: el reloj se lee a dos metros y no hace falta más.
  useTicker(250);
  const ahora = Date.now();

  // Mismo truco que el lobby y la carrera: el servidor sella lo que
  // queda al emitir y aquí se le resta lo transcurrido desde entonces.
  //
  // Solo mientras la cuenta CORRE. En pausa se congela, porque el reloj
  // de la sala tampoco corre; y con la fase sin abrir se queda quieto en
  // el límite, que si no bajaba solo y la pared decía «T-29:41» de una
  // cuenta que todavía no ha empezado.
  const corriendo = final.estado === 'CUENTA' && !paused;
  const restante = final.restanteMs === null
    ? null
    : corriendo ? final.restanteMs - (ahora - stampedAt) : final.restanteMs;

  const estado: Estado =
    ensayo
      ? ensayo
      : final.estado === 'VICTORIA' || final.estado === 'DERROTA'
        ? final.estado
        : final.estado === 'ESPERA'
          ? 'ESPERA'
          : restante !== null && restante <= 0
            ? 'DERROTA'   // se deduce aquí sin esperar al siguiente snapshot
            : 'CUENTA';

  // ¿Hay que ANIMAR el desenlace o enseñarlo ya ocurrido? Un ensayo
  // siempre se anima. Lo real, solo si acaba de pasar: abrir la ventana
  // media hora después no puede volver a lanzar el cohete.
  const desenlaceAt = ensayo ? ahora : final.desenlaceAt;
  const frio = estado !== 'ESPERA' && estado !== 'CUENTA'
    && desenlaceAt !== null
    && ahora + clockOffset - desenlaceAt > ANIMACION_MS;

  // Cuanto menos queda, más vibra el cohete. Es el termómetro de la sala
  // sin necesidad de mirar la cifra.
  const tension = restante === null || final.limiteMs === 0
    ? 0
    : Math.min(1, Math.max(0, 1 - restante / final.limiteMs));

  // El sonido de la final. Tres cosas y en este orden de importancia:
  //
  // - El desenlace: el rugido del despegue o el estallido en tierra.
  // - El último MINUTO, tic a tic, y los últimos diez segundos más
  //   agudos. No la media hora entera: un tic por segundo durante
  //   treinta minutos deja de ser tensión y pasa a ser un grifo.
  // - Nada cuando el desenlace ya pasó hace rato (`frio`): una ventana
  //   que se abre tarde no vuelve a lanzar el cohete, y tampoco a oírlo.
  const anterior = useRef<{ estado: Estado; seg: number }>({ estado, seg: -1 });
  useEffect(() => {
    const seg = restante === null ? -1 : Math.max(0, Math.ceil(restante / 1000));
    const previo = anterior.current;
    if (estado !== previo.estado) {
      if (!frio && estado === 'DERROTA') sonar('despegue');
      if (!frio && estado === 'VICTORIA') sonar('estallido');
    } else if (estado === 'CUENTA' && seg !== previo.seg && seg >= 0 && seg <= 60) {
      sonar(seg <= 10 ? 'ticFinal' : 'tic');
    }
    anterior.current = { estado, seg };
  });

  const clase = estado.toLowerCase();

  return (
    <div
      className={`esc esc-final ${clase} ${frio ? 'frio' : ''} ${ensayo ? 'ensayo' : ''}`}
      style={vars({ '--tension': tension.toFixed(3) })}
    >
      <div className="final-rampa">
        <span className="final-torre" aria-hidden="true">
          <span className="torre-mastil" />
          <span className="torre-brazo" />
        </span>

        <span className="final-cohete">
          <Cohete />
          <span className="final-llama" aria-hidden="true" />
        </span>

        <span className="final-humo" aria-hidden="true" />
        <span className="final-suelo" aria-hidden="true" />

        {/* La pira y los pedazos solo existen en la victoria, pero se
            dejan en el árbol siempre: montarlos en el mismo fotograma
            en que arranca su animación se ve como un parpadeo. */}
        <span className="final-pira" aria-hidden="true" />
        {Array.from({ length: 11 }, (_, i) => (
          <span
            key={i}
            className="final-pedazo"
            aria-hidden="true"
            style={vars({
              '--ang': `${-160 + i * 14}deg`,
              '--dist': `${10 + ((i * 37) % 26)}vmin`,
              '--tam': `${3 + ((i * 13) % 5)}px`,
            })}
          />
        ))}
      </div>

      <span className="final-fogonazo" aria-hidden="true" />

      <p className={`final-reloj ${restante !== null && restante < 60_000 ? 'apurado' : ''}`}>
        {estado === 'VICTORIA' ? 'ABORTADO'
          : estado === 'DERROTA' ? 'T-00:00'
          : `T-${reloj(restante ?? final.limiteMs)}`}
      </p>

      <p className="final-lema">
        {estado === 'ESPERA' ? 'en espera de que se abra la fase'
          : estado === 'CUENTA' ? 'lanzamiento en curso · hay que abortarlo'
          : estado === 'VICTORIA'
            ? `lanzamiento abortado${final.ganador && !ensayo ? ` por ${final.ganador}` : ''}`
            : 'lanzamiento efectuado'}
      </p>
    </div>
  );
}
