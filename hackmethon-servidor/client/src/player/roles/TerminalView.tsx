import { useEffect, useRef, useState } from 'react';
import type { PhaseWorkspace } from '../../shared/events';
import { useSession } from '../../session/SessionContext';
import { call } from '../../lib/socket';
import { sonar } from '../../lib/sonido';
import { useMountId } from './mount';

type Payload = {
  pista: string;
  cuarentenaHasta: number | null;
  navegador?: Navegador | null;
  casos?: number;
  total?: number;
  tablero?: Tablero | null;
};

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

type Eco = { texto: string; estado: 'enviando' | 'entregado' | 'rechazado'; motivo?: string };

const MOTIVOS: Record<string, string> = {
  NO_ERES_TERMINAL: 'Ya no eres el Operador de Terminal.',
  SIN_FASE_ACTIVA: 'La fase ya no está en curso.',
  FASE_CERRADA: 'El administrador cerró la fase.',
  EVENTO_EN_PAUSA: 'Evento en pausa.',
  COMANDO_VACIO: 'Escribe algo.',
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

  const [ecos, setEcos] = useState<Eco[]>([]);
  const [texto, setTexto] = useState('');
  const [historial, setHistorial] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
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
    setEcos((h) => [...h, { texto: cmd, estado: 'enviando' }]);
    setHistorial((h) => [...h, cmd]);
    setCursor(-1);
    setTexto('');

    // Se envía a ciegas: el acuse dice que LLEGÓ, no qué contestó el
    // sistema. Por eso aquí solo suena la salida y, si acaso, el rechazo:
    // el veredicto lo canta la Pantalla, que es quien lo ve.
    sonar('enviar');
    const r = await call<{ aceptado: boolean }>(socket, 'terminal:command', { texto: cmd });
    if (!r.ok) sonar('error');
    setEcos((h) =>
      h.map((eco, i) =>
        i === indice
          ? r.ok
            ? { ...eco, estado: 'entregado' }
            : { ...eco, estado: 'rechazado', motivo: MOTIVOS[r.error ?? ''] ?? r.error }
          : eco,
      ),
    );
  }

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
    <section className="vista vista-terminal">
      <header>
        <h2>Consola</h2>
        <span className="rol rol-TERMINAL">Operador de Terminal</span>
      </header>

      {averia?.tipo === 'TERMINAL' && (
        <div className="banda err fija">TECLADO INESTABLE</div>
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
          <div key={i} className={`linea-cmd ${eco.estado}`}>
            <span className="prompt">&gt;</span> {eco.texto}
            <span className="marca">
              {eco.estado === 'enviando' ? '…' : eco.estado === 'entregado' ? '✓' : `✕ ${eco.motivo ?? ''}`}
            </span>
          </div>
        ))}
        <div ref={finRef} />
      </div>

      <form onSubmit={enviar} className="entrada-cmd">
        <span className="prompt">&gt;</span>
        <input
          ref={inputRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { sonar('tecla'); teclas(e); }}
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
