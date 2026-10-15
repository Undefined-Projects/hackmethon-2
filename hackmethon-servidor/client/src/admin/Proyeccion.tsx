import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AdminSnapshot, FinalView, MinijuegoTablero } from '../shared/events';
import { useSession } from '../session/SessionContext';
import { ESCENAS, EscenaEspera, EscenaGenerica } from './escenas';
import { EscenaFinal } from './EscenaFinal';
import { EscenaMinijuego } from './EscenasMinijuego';
import { CATALOGO } from '../lib/minijuegos';
import { despertar, sonar, zumbido } from '../lib/sonido';
import { useSonido } from '../lib/useSonido';
import { useDestruccion } from '../lib/destruccion';
import { DestruccionRobot } from './DestruccionRobot';

// ============================================================
//  La proyección de sala.
//
//  Una pantalla sola: la escena de la fase que el panel tenga
//  DESTACADA, a sangre y sin nada que leer de cerca. Se abre en su
//  propia ventana (`#proyeccion`), se arrastra al proyector y ahí se
//  queda toda la tarde.
//
//  No pide nada al servidor, igual que la carrera: el panel ya recibe
//  `focusPhaseId` en cada `event:update`, y con eso basta. Un canal
//  propio para esto sería una segunda verdad que mantener en sincronía
//  con la primera, y en algún momento las dos dirían cosas distintas.
//
//  Destacar una fase y ABRIRLA son cosas distintas a propósito: se
//  puede poner la fase 4 en la pared mientras la sala sigue peleando
//  con la 3, para presentarla antes de abrirla. La pared cuenta lo que
//  el que gobierna el evento quiere contar, no lo que hay abierto.
// ============================================================

/** Lo que dura el cruce entre una escena y la siguiente. Va aquí y no
 *  solo en el CSS porque la capa saliente hay que desmontarla a mano
 *  cuando termina: si se queda puesta, ocho cambios de fase son ocho
 *  escenas animándose a la vez detrás de la buena. */
const TRANSICION = 900;

type Capa = {
  /** Identidad de la escena. Cambiarla es lo que dispara el cruce. */
  id: string;
  /** `null` = no hay fase destacada. */
  clave: string | null;
  titulo: string;
  teaser: string | null;
  orden: number | null;
  /** La final tiene escena propia: el cohete, que sí lee el estado. */
  esFinal: boolean;
  /** Un recreo en curso: la escena es el ranking en vivo de ese juego. */
  esMinijuego?: boolean;
};

const ESPERA: Capa = {
  id: 'espera', clave: null, titulo: 'En espera', teaser: null, orden: null, esFinal: false,
};

/** Lo que dura un ensayo del desenlace antes de caerse solo. Es una
 *  demostración para la sala, no un estado del juego: quedarse clavado
 *  en «lanzamiento abortado» con la partida en marcha sería peor que no
 *  poder ensayarlo. */
const ENSAYO_MS = 22_000;

/** El título del seed ya dice «Fase 3 — …», y el rótulo pinta el número
 *  aparte y en grande. Repetirlo sería leerlo dos veces. */
const sinPrefijo = (t: string) => t.replace(/^\s*fase\s+\d+\s*[—–-]\s*/i, '');

function Escena({
  capa, nota, final, ensayo, stampedAt, paused, clockOffset, tablero,
}: {
  capa: Capa;
  nota?: string;
  final: FinalView | null;
  tablero: MinijuegoTablero | null;
  ensayo: 'VICTORIA' | 'DERROTA' | null;
  stampedAt: number;
  paused: boolean;
  clockOffset: number;
}) {
  if (capa.esMinijuego) {
    // La capa que sale cuando se termina el recreo ya no tiene tablero:
    // se funde en la espera en vez de quedarse con un ranking vacío.
    return tablero ? <EscenaMinijuego tablero={tablero} clockOffset={clockOffset} /> : <EscenaEspera nota={nota} />;
  }
  if (capa.esFinal && final) {
    return (
      <EscenaFinal
        final={final} ensayo={ensayo}
        stampedAt={stampedAt} paused={paused} clockOffset={clockOffset}
      />
    );
  }
  if (capa.clave === null) return <EscenaEspera nota={nota} />;
  const Pintar = ESCENAS[capa.clave] ?? EscenaGenerica;
  return <Pintar />;
}

/** Los mandos se esconden cuando nadie toca nada. En un proyector, un
 *  botón y un puntero de ratón en la esquina se quedan ahí toda la
 *  tarde, y se ven desde la última fila. */
function useMandos(ms: number): boolean {
  const [visibles, setVisibles] = useState(true);
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const despertar = () => {
      setVisibles(true);
      clearTimeout(id);
      id = setTimeout(() => setVisibles(false), ms);
    };
    despertar();
    window.addEventListener('mousemove', despertar);
    window.addEventListener('keydown', despertar);
    return () => {
      clearTimeout(id);
      window.removeEventListener('mousemove', despertar);
      window.removeEventListener('keydown', despertar);
    };
  }, [ms]);
  return visibles;
}

export function Proyeccion({ snapshot, onVolver }: { snapshot: AdminSnapshot; onVolver: () => void }) {
  const { event, phases, final } = snapshot;
  const { socket, stampedAt, clockOffset } = useSession();

  // Ensayo del desenlace, disparado desde el panel. Llega por el socket
  // porque el panel y la proyección son DOS VENTANAS distintas: el botón
  // se pulsa en una y lo que tiene que pasar, pasa en la otra.
  const [ensayo, setEnsayo] = useState<'VICTORIA' | 'DERROTA' | null>(null);
  useEffect(() => {
    if (!socket) return;
    const alEnsayar = (p: { resultado: 'VICTORIA' | 'DERROTA' | null }) => setEnsayo(p.resultado);
    socket.on('final:ensayo', alEnsayar);
    return () => { socket.off('final:ensayo', alEnsayar); };
  }, [socket]);
  useEffect(() => {
    if (!ensayo) return;
    const t = setTimeout(() => setEnsayo(null), ENSAYO_MS);
    return () => clearTimeout(t);
  }, [ensayo]);

  // ── La destrucción del robot ──────────────────────────────────
  // Cuando un equipo es el PRIMERO en superar una fase, el servidor lo
  // anuncia a todas las pantallas y aquí se destroza su parte del robot,
  // con el cartel de quien lo hizo al final. Los ensayos del panel llegan
  // por el mismo sitio; el botón de esta ventana ensaya sin servidor.
  const fasesConParte = phases.map((p) => ({ id: p.id, order: p.order, esFinal: p.esFinal, esBonus: p.esBonus }));
  const destruccion = useDestruccion(socket, fasesConParte);
  const equiposEnsayo = snapshot.teams.map((t) => ({ id: t.id, name: t.name, logoAt: t.logoAt }));

  const faseFinal = phases.find((p) => p.esFinal) ?? null;
  // Un ensayo manda sobre lo destacado: se pulsa el botón para VERLO en
  // la pared, y no serviría de nada si la pared siguiera en otra fase.
  const destacada = (ensayo && faseFinal) ? faseFinal
    : phases.find((p) => p.id === event.focusPhaseId) ?? null;

  // Un recreo manda sobre todo lo demás: si el panel lanzó uno, la
  // pared es su ranking hasta que lo termine. Cada ronda es otra capa,
  // así que relanzarlo también cruza.
  const mini = snapshot.minijuego;
  const actual: Capa = mini
    ? {
        id: `mini-${mini.ronda}`,
        clave: `mini:${mini.clave}`,
        titulo: CATALOGO.find((c) => c.clave === mini.clave)?.nombre ?? mini.clave,
        teaser: CATALOGO.find((c) => c.clave === mini.clave)?.nota ?? null,
        orden: null,
        esFinal: false,
        esMinijuego: true,
      }
    : destacada
    ? {
        id: destacada.id,
        clave: destacada.key,
        titulo: destacada.title,
        teaser: destacada.teaser,
        orden: destacada.order,
        esFinal: destacada.esFinal,
      }
    : ESPERA;

  // Cuanto más avanzada la fase, más se descompone la imagen. Es el
  // termómetro del evento sin un solo número: en la primera casi no se
  // nota y en la final la pared tiembla.
  //
  // La escala va sobre el RECORRIDO, sin contar el bonus: el bonus va
  // detrás de la final, así que se queda en el tope en vez de estirar
  // la escala y dejar la final a medio camino.
  const tope = Math.max(1, ...phases.filter((p) => !p.esBonus).map((p) => p.order));
  const glitch = destacada && !mini
    ? Math.min(1, Math.max(0, (destacada.order - 1) / Math.max(1, tope - 1)))
    : 0;

  // La escena que se va. Vive fuera del render para que el cambio de
  // fase no la haga aparecer y desaparecer en el mismo fotograma.
  const [saliente, setSaliente] = useState<Capa | null>(null);
  const previa = useRef<Capa>(actual);

  useEffect(() => {
    if (previa.current.id === actual.id) return;
    setSaliente(previa.current);
    previa.current = actual;
    sonar('canal');
    const t = setTimeout(() => setSaliente(null), TRANSICION);
    return () => clearTimeout(t);
    // Solo la identidad: `actual` es un objeto nuevo en cada repintado y
    // observarlo entero dispararía el cruce mil veces por minuto.
  }, [actual.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // El botón de salir de la aplicación estorba en una pared de seis
  // metros. Va en <body> y no aquí porque quien lo pinta es App, por
  // encima de este árbol.
  useEffect(() => {
    document.body.classList.add('proyectando');
    return () => document.body.classList.remove('proyectando');
  }, []);

  const mandos = useMandos(2600);
  const { bloqueado } = useSonido();
  const escenario = useRef<HTMLDivElement>(null);

  // El ronroneo del tubo, solo aquí: es la pared de la sala, no el
  // portátil de nadie. Sube con la avería de la fase, así que el
  // aparato suena peor según avanza el evento.
  useEffect(() => {
    zumbido(glitch);
    return () => zumbido(null);
  }, [glitch]);

  // La estática se clava a la animación de verdad en vez de a un
  // temporizador propio: se le pregunta al navegador por dónde va el
  // ciclo del CSS y se suena en los dos instantes exactos en que la
  // imagen se rompe. Con un `setInterval` la deriva llegaba a medio
  // segundo, y un chasquido con la imagen limpia se nota.
  useEffect(() => {
    if (glitch <= 0) return;
    const el = escenario.current;
    if (!el?.getAnimations) return;
    let previa = 0;
    let id = 0;
    const mirar = () => {
      id = requestAnimationFrame(mirar);
      const anim = el.getAnimations()[0];
      const dur = Number(anim?.effect?.getTiming().duration ?? 0);
      if (!anim || !dur || anim.currentTime == null) return;
      const fase = (Number(anim.currentTime) % dur) / dur;
      // 0,87 = el salto; 0,93 = el desliz. Los mismos dos del CSS.
      for (const marca of [0.87, 0.93]) {
        if (previa < marca && fase >= marca) sonar('estatica', glitch);
      }
      previa = fase;
    };
    id = requestAnimationFrame(mirar);
    return () => cancelAnimationFrame(id);
  }, [glitch]);
  const nota = event.status === 'FINISHED' ? 'EVENTO TERMINADO' : 'EN ESPERA';

  const pantallaCompleta = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  return (
    <div
      className={`proyeccion ${mandos ? '' : 'a-oscuras'}`}
      style={{ '--glitch': glitch.toFixed(3) } as CSSProperties}
    >
      <div className="proy-mandos">
        <button className="volver-panel" onClick={onVolver}>&lt;&lt; PANEL</button>
        <button className="volver-panel" onClick={pantallaCompleta}>[ ] PANTALLA COMPLETA</button>
        {/* La proyección se arrastra al segundo monitor y nadie la
            vuelve a tocar, así que es justo la ventana donde el
            navegador deja el audio bloqueado para siempre. Decirlo, y
            que el propio botón sirva de gesto para desbloquearlo. */}
        {bloqueado && (
          <button className="volver-panel activar-sonido" onClick={() => despertar()}>
            [!] ACTIVAR SONIDO
          </button>
        )}
        <button className="volver-panel" onClick={() => destruccion.ensayar('todo', equiposEnsayo)} disabled={destruccion.cola !== null}
          title="Ensaya en esta pared la destrucción del robot, parte por parte y en orden. No toca la partida.">
          ▸ PROBAR DESTRUCCIÓN
        </button>
      </div>

      {destruccion.cola && (
        <DestruccionRobot
          key={destruccion.cola[0].id} cola={destruccion.cola} rotas={destruccion.base} onFin={destruccion.terminar}
        />
      )}

      <div className="escenario" ref={escenario}>
        {/* Las dos capas conviven durante el cruce. La saliente se pinta
            primero para que la entrante quede encima. */}
        {saliente && (
          <div key={`sale-${saliente.id}`} className="capa sale">
            <Escena
              capa={saliente} nota={nota} final={final} ensayo={ensayo}
              stampedAt={stampedAt} paused={event.paused} clockOffset={clockOffset}
              tablero={mini}
            />
          </div>
        )}
        <div key={`entra-${actual.id}`} className="capa entra">
          <Escena
            capa={actual} nota={nota} final={final} ensayo={ensayo}
            stampedAt={stampedAt} paused={event.paused} clockOffset={clockOffset}
            tablero={mini}
          />
        </div>

        {/* Las averías del tubo. Van DENTRO del escenario y detrás de las
            capas: así caen sobre la escena y nunca sobre el rótulo, que
            es lo único que alguien lee de cerca. Su intensidad la manda
            `--glitch`, que sube con el número de fase. */}
        <span className="proy-averia" aria-hidden="true" />
        <span className="proy-corte" aria-hidden="true" />
      </div>

      {/* Sin fase destacada no hay rótulo: la escena de espera ya lo dice
          todo, y una banda que repita «en espera» debajo sobra. */}
      {actual.clave !== null && !actual.esMinijuego && (
        <footer key={`rot-${actual.id}`} className="proy-rotulo">
          {actual.orden !== null && <span className="proy-n">F{actual.orden}</span>}
          <div className="proy-texto">
            <h1>{sinPrefijo(actual.titulo)}</h1>
            {actual.teaser && <p className="proy-teaser">{actual.teaser}</p>}
          </div>
          {event.paused && <span className="chip err">EN PAUSA</span>}
        </footer>
      )}
    </div>
  );
}
