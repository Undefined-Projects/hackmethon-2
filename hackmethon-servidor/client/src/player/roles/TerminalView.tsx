import { useEffect, useRef, useState } from 'react';
import type { PhaseWorkspace } from '../../shared/events';
import { useSession } from '../../session/SessionContext';
import { CaraRobot, useSalida } from '../RobotAtaque';
import { JardinEscena } from '../../admin/JardinEscena';
import { call } from '../../lib/socket';
import { sonar } from '../../lib/sonido';
import { useMountId } from './mount';
import { Nervio3D } from './Nervio3D';
import { ANTICOPIA } from './anticopia';

type Payload = {
  pista: string;
  cuarentenaHasta: number | null;
  navegador?: Navegador | null;
  casos?: number;
  total?: number;
  tablero?: Tablero | null;
  brote?: Brote | null;
};

/** El brote de La Maraña (y del bonus), visto desde la consola: cuántas líneas lleva y
 *  si ya puede salir otro. Ni una palabra del programa ni del laberinto:
 *  el programa lo ve Datos y el laberinto, Pantalla. */
type Brote = {
  capa: number;
  /** «el semillero», «el seto», «la espesura». */
  nombreCapa: string;
  /** En la espesura salen cuatro a la vez. */
  varios: boolean;
  lineas: number;
  max: number;
  abiertos: number;
  viajes: number;
  /** Cuándo germina el siguiente. `null` o pasado: ya puede salir. */
  listoEn: number | null;
};

/** El panel del brote, con su cuenta atrás propia: el servidor manda el
 *  instante y aquí se resta, sin un pulso de red por segundo. */
function PanelBrote({ brote }: { brote: Brote }) {
  const [ahora, setAhora] = useState(() => Date.now());
  const espera = brote.listoEn ? Math.max(0, Math.ceil((brote.listoEn - ahora) / 1000)) : 0;
  useEffect(() => {
    if (!brote.listoEn || brote.listoEn <= Date.now()) return;
    const id = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(id);
  }, [brote.listoEn]);
  return (
    <div className="navegador panel-brote">
      <p className="nav-ruta">el brote · capa {brote.capa} · {brote.nombreCapa}</p>
      <div className="pbr-cupo" aria-label={`${brote.lineas} de ${brote.max} líneas`}>
        {Array.from({ length: brote.max }, (_, i) => <i key={i} className={i < brote.lineas ? 'llena' : ''} />)}
      </div>
      <p className="nav-linea">
        líneas <strong>{brote.lineas}</strong> de {brote.max}
        {brote.abiertos > 0 && (
          <span className="nav-aviso">{brote.abiertos} bloque{brote.abiertos === 1 ? '' : 's'} sin cerrar · falta{brote.abiertos === 1 ? '' : 'n'} {brote.abiertos} `fin`</span>
        )}
      </p>
      <p className={`nav-marcador${espera ? ' esperando' : ' listo'}`}>
        {espera
          ? (brote.varios
              ? <>cuatro brotes en la espesura · los siguientes germinan en <strong>{espera} s</strong></>
              : <>brote en el laberinto · el siguiente germina en <strong>{espera} s</strong></>)
          : <>listo para <strong>lanzar</strong></>}
        {' · '}{brote.varios ? 'lanzamientos' : 'brotes lanzados'}: <strong>{brote.viajes}</strong>
      </p>
    </div>
  );
}

/** El tablero de la Fase 3: ante qué barrera estás y cómo fue el último
 *  intento. El material y el grosor van en la placa, y la placa la lee
 *  Pantalla: aquí solo hay un número de barrera. */
type Tablero = {
  fila: number;
  columna: number;
  rotas: number;
  total: number;
  reinicios: number;
  /** Hacia donde tiene una barrera pegada, si la ha encontrado. QUE pone
   *  en su placa no: eso lo lee Pantalla. */
  barreraAlLado: string | null;
  enSalida: boolean;
  ultimo: { golpes: number; tandas: number | null; resultado: string } | null;
};


/** Dónde está el cursor y qué se puede hacer desde ahí. Nunca QUÉ pone
 *  en esa línea: el código lo ve Pantalla, y pedírselo en voz alta es la
 *  fase. */
type Navegador = {
  ruta: string | null;
  linea: number | null;
  total: number | null;
  pila: string[];
  movimientos: string[];
};

type Eco = { id: number; texto: string; estado: 'enviando' | 'entregado' | 'rechazado'; motivo?: string };

const MOTIVOS: Record<string, string> = {
  NO_ERES_TERMINAL: 'Ya no eres el Operador de Terminal.',
  SIN_FASE_ACTIVA: 'La fase ya no está en curso.',
  FASE_CERRADA: 'El administrador cerró la fase.',
  EVENTO_EN_PAUSA: 'Evento en pausa.',
  COMANDO_VACIO: 'Escribe algo.',
  NO_EJECUTADO: 'El sistema no lo pudo ejecutar.',
  SIN_CONEXION: 'Sin conexión con el servidor.',
};

/**
 * Operador de Terminal: escribe a ciegas.
 *
 * Solo ve el ECO de lo que él teclea y si se entregó. La respuesta del
 * sistema no está oculta aquí: nunca llega a este socket. Los motivos
 * que sí mostramos son de sistema (te quedaste sin rol, la fase cerró),
 * no del juego: eso es cosa de Pantalla, y se pregunta en voz alta.
 */
export function TerminalView({ workspace }: { workspace: PhaseWorkspace }) {
  const mountId = useMountId();
  const { socket, averia } = useSession();
  const payload = workspace.payload as Payload | null;
  const robot = useSalida(averia?.tipo === 'TERMINAL');

  const [ecos, setEcos] = useState<Eco[]>([]);
  const [texto, setTexto] = useState('');
  const [historial, setHistorial] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [sinPegar, setSinPegar] = useState(0);
  // Sube con cada tecla: el nervio echa chispas.
  const [tecleo, setTecleo] = useState(0);
  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Averia de consola: se pone a escribir sola. Los caracteres van al
  // MISMO campo que esta usando el jugador, no a un adorno aparte: la
  // gracia es que tenga que darse cuenta y limpiarlo antes de enviar.
  // No se bloquea el envio: mandar basura no cuesta nada, y descubrirlo
  // asi es parte de la broma.
  useEffect(() => {
    if (averia?.tipo !== 'TERMINAL') return;
    const letras = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const id = setInterval(() => {
      setTexto((t) => (t + letras[Math.floor(Math.random() * letras.length)]).slice(0, 200));
    }, 110);
    return () => clearInterval(id);
  }, [averia?.tipo, averia?.hasta]);
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [ecos]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const cmd = texto.trim();
    if (!cmd || !socket) return;

    const indice = ecos.length;
    setEcos((h) => [...h, { id: indice + 1, texto: cmd, estado: 'enviando' }]);
    setHistorial((h) => [...h, cmd]);
    setCursor(-1);
    setTexto('');

    // Se envía a ciegas: el acuse dice que LLEGÓ, no qué contestó el
    // sistema. Por eso aquí solo suena la salida y, si acaso, el rechazo:
    // el veredicto lo canta la Pantalla, que es quien lo ve.
    sonar('enviar');
    const r = await call<{ aceptado: boolean; valido?: boolean }>(socket, 'terminal:command', { texto: cmd });
    // Rebota lo que el sistema no dejó pasar y lo que el juego no pudo
    // ejecutar (no existe, mal escrito, imposible ahora). Lo que se ejecutó
    // llega aunque haya salido mal: ese resultado es de Pantalla.
    const noEjecutado = r.ok && r.data?.valido === false;
    if (!r.ok || noEjecutado) sonar('error');
    setEcos((h) =>
      h.map((eco, i) =>
        i === indice
          ? r.ok && !noEjecutado
            ? { ...eco, estado: 'entregado' }
            : { ...eco, estado: 'rechazado', motivo: noEjecutado ? MOTIVOS.NO_EJECUTADO : MOTIVOS[r.error ?? ''] ?? r.error }
          : eco,
      ),
    );
  }

  // La consola no admite pegar ni arrastrar texto: aquí se escribe a mano,
  // lo que se ha hablado con el equipo. El intento se avisa en pantalla y
  // se cuenta para el panel; no penaliza nada del juego.
  function noPegar(e: React.ClipboardEvent | React.DragEvent) {
    e.preventDefault();
    sonar('error');
    setSinPegar((n) => n + 1);
    socket?.emit('terminal:pegado');
  }
  useEffect(() => {
    if (!sinPegar) return;
    const t = setTimeout(() => setSinPegar(0), 2600);
    return () => clearTimeout(t);
  }, [sinPegar]);

  // Flechas arriba/abajo por el historial: en una consola a ciegas,
  // reescribir un comando largo desde cero es una penalización tonta.
  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (historial.length === 0) return;
    e.preventDefault();
    const siguiente =
      e.key === 'ArrowUp'
        ? Math.min(cursor + 1, historial.length - 1)
        : Math.max(cursor - 1, -1);
    setCursor(siguiente);
    setTexto(siguiente === -1 ? '' : historial[historial.length - 1 - siguiente]);
  }

  return (
    <section className="vista vista-terminal" {...ANTICOPIA}>
      {/* La máquina viva de fondo: late con cada comando que sale. */}
      <JardinEscena variante="terminal" marco={150} latido={ecos.length} />
      <header>
        <h2>Consola</h2>
        <span className="organo">el nervio</span>
        <span className="rol rol-TERMINAL">Operador de Terminal</span>
      </header>

      {/* El nervio, en 3D: cada comando sale como un impulso hacia el fondo.
          Llega si el juego lo ejecutó; rebota en rojo si no. Lo que el
          juego respondió no pasa por aquí: es de Pantalla. */}
      <Nervio3D impulsos={ecos} tecleo={tecleo}
                cuarentenaHasta={payload?.cuarentenaHasta ?? null} averia={averia?.tipo === 'TERMINAL'} />

      {averia?.tipo === 'TERMINAL' && (
        <div className="banda err fija">EL ROBOT TIENE TU TECLADO</div>
      )}

      {/* Quien escribe es el robot: su cara, muerta de risa, sobre un
          teclado que se le ilumina bajo los dedos, y en el bocadillo lo
          último que te ha metido en la línea de comandos. */}
      {robot && (
        <div className={`robot-teclea ${robot === 'saliendo' ? 'robot-se-va' : ''}`} aria-hidden="true">
          <CaraRobot className="robot-teclea__cara" reiniciando={robot === 'saliendo'} />
          <span className="robot-teclea__bocadillo">
            {robot === 'saliendo' ? 'reiniciando…' : texto.slice(-14) || '…'}
          </span>
          <span className="robot-teclea__teclado">
            {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 37) % 300}ms` }} />)}
          </span>
        </div>
      )}

      <p className="ayuda">
        Escribes a ciegas: la respuesta aparece en la pantalla de tu compañero, no aquí.
        {payload?.pista && <> {payload.pista}</>}
      </p>

      {payload?.tablero && (
        <div className="navegador">
          <p className="nav-ruta">
            casilla {payload.tablero.fila}, {payload.tablero.columna}
          </p>
          <p className="nav-linea">
            barreras <strong>{payload.tablero.rotas}</strong> de {payload.tablero.total}
            {payload.tablero.barreraAlLado && (
              <span className="nav-aviso">barrera a tu {payload.tablero.barreraAlLado}</span>
            )}
            {payload.tablero.reinicios > 0 && (
              <span className="nav-reinicios">
                {payload.tablero.reinicios} reinicio{payload.tablero.reinicios === 1 ? '' : 's'}
              </span>
            )}
          </p>
          <ul className="nav-movimientos">
            {['arriba', 'abajo', 'izquierda', 'derecha'].map((d) => <li key={d}>{d}</li>)}
          </ul>
          <p className="nav-marcador">
            último intento:{' '}
            {payload.tablero.ultimo
              ? `${payload.tablero.ultimo.golpes} golpes${
                  payload.tablero.ultimo.tandas ? ` en ${payload.tablero.ultimo.tandas} tandas` : ' seguidos'
                } — ${payload.tablero.ultimo.resultado}`
              : 'ninguno todavía'}
          </p>
        </div>
      )}

      {payload?.brote && <PanelBrote brote={payload.brote} />}

      {/* El navegador. Dice DONDE estas, no QUE hay ahi: los movimientos
          cambian con cada paso y son el unico hilo que se sigue sin ver
          una sola linea. */}
      {payload?.navegador && (
        <div className="navegador">
          {payload.navegador.ruta ? (
            <>
              <p className="nav-ruta">{payload.navegador.ruta}</p>
              <p className="nav-linea">
                línea <strong>{payload.navegador.linea}</strong> de {payload.navegador.total}
                {payload.navegador.pila.length > 1 && (
                  <span className="nav-pila">{payload.navegador.pila.join(' › ')}</span>
                )}
              </p>
            </>
          ) : (
            <p className="nav-ruta vacia">sin archivo abierto</p>
          )}
          <ul className="nav-movimientos">
            {payload.navegador.movimientos.map((m) => <li key={m}>{m}</li>)}
          </ul>
          {payload.total !== undefined && (
            <p className="nav-marcador">
              casos que salen: <strong>{payload.casos}</strong> de {payload.total}
            </p>
          )}
        </div>
      )}

      <div className="consola">
        {ecos.length === 0 && <div className="pendiente">Sin comandos enviados.</div>}
        {ecos.map((eco, i) => (
          <div key={eco.id ?? i} className={`linea-cmd ${eco.estado}`}>
            <span className="prompt">&gt;</span> {eco.texto}
            <span className="marca">
              {eco.estado === 'enviando' ? '…' : eco.estado === 'entregado' ? '✓' : `✕ ${eco.motivo ?? ''}`}
            </span>
          </div>
        ))}
        <div ref={finRef} />
      </div>

      {sinPegar > 0 && (
        <p key={sinPegar} className="sin-pegar" role="status">
          Aquí no se pega: escríbanlo a mano, como lo platicaron.
        </p>
      )}
      <form onSubmit={enviar} className="entrada-cmd">
        <span className="prompt">&gt;</span>
        <input
          ref={inputRef}
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setTecleo((n) => n + 1); }}
          onKeyDown={(e) => { sonar('tecla'); teclas(e); }}
          onPaste={noPegar}
          onDrop={noPegar}
          placeholder="escribe un comando…"
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
        />
        <button type="submit">Enviar</button>
      </form>

      <footer className="huella">montaje #{mountId}</footer>
    </section>
  );
}
