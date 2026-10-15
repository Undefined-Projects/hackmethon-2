import { useEffect, useState } from 'react';
import type { FinalView } from '../shared/events';
import type { AppSocket } from '../lib/socket';
import { call } from '../lib/socket';
import { useSession } from '../session/SessionContext';
import { useTicker } from '../lib/useTicker';

// ============================================================
//  El mando de la final.
//
//  Dos cosas y ninguna más: cuánto tiempo tiene la sala para abortar el
//  lanzamiento, y los dos ensayos del desenlace para verlos en la pared
//  antes de que pasen de verdad.
//
//  Los ensayos NO tocan el juego. No sellan tiempos, no resuelven nada
//  y no sacan a nadie de su fase: pintan un cohete en la proyección
//  durante veinte segundos y se apagan solos.
// ============================================================

const ERRORES: Record<string, string> = {
  SIN_FINAL: 'Ninguna fase está marcada como final en el seed',
  LIMITE_FUERA_DE_RANGO: 'Entre 1 y 180 minutos',
  NOT_ALLOWED: 'Esa acción es solo del panel',
  TIMEOUT: 'El servidor no respondió',
};

const reloj = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function PanelFinal({
  final, socket, bloqueado, paused, onAviso,
}: {
  final: FinalView;
  socket: AppSocket;
  bloqueado: boolean;
  paused: boolean;
  onAviso: (a: { tipo: 'ok' | 'err'; texto: string }) => void;
}) {
  const { stampedAt } = useSession();
  useTicker(500); // el reloj de la sala corre también aquí

  const minutosActuales = Math.round(final.limiteMs / 60_000);
  const [borrador, setBorrador] = useState(String(minutosActuales));
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setBorrador(String(minutosActuales)); }, [minutosActuales]);

  // Solo se extrapola con la cuenta en marcha: con la fase sin abrir el
  // reloj tiene que quedarse quieto en el límite configurado.
  const corriendo = final.estado === 'CUENTA' && !paused;
  const restante = final.restanteMs === null
    ? null
    : corriendo ? final.restanteMs - (Date.now() - stampedAt) : final.restanteMs;

  const fallo = (r: { error?: string }) =>
    onAviso({ tipo: 'err', texto: ERRORES[r.error ?? ''] ?? r.error ?? 'Error' });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const minutos = Number(borrador);
    if (!Number.isFinite(minutos) || minutos === minutosActuales) {
      setBorrador(String(minutosActuales));
      return;
    }
    setOcupado(true);
    const r = await call(socket, 'admin:final:limite', { minutos });
    setOcupado(false);
    if (r.ok) onAviso({ tipo: 'ok', texto: `La final dura ${Math.round(minutos)} min` });
    else { setBorrador(String(minutosActuales)); fallo(r); }
  }

  async function ensayar(resultado: 'VICTORIA' | 'DERROTA' | null) {
    setOcupado(true);
    const r = await call(socket, 'admin:final:ensayo', { resultado });
    setOcupado(false);
    if (!r.ok) return fallo(r);
    onAviso({
      tipo: 'ok',
      texto: resultado === null
        ? 'Ensayo detenido'
        : `Ensayo en la proyección: ${resultado === 'VICTORIA' ? 'lanzamiento abortado' : 'lanzamiento efectuado'}`,
    });
  }

  const quieto = bloqueado || ocupado;
  const estado =
    final.estado === 'ESPERA' ? 'sin abrir'
    : final.estado === 'CUENTA' ? (paused ? 'en pausa' : 'en marcha')
    : final.estado === 'VICTORIA' ? `abortado por ${final.ganador ?? '—'}`
    : 'lanzamiento efectuado';

  return (
    <section className="panel">
      <div className="panel__bar">
        <span className="panel__name">LA FINAL</span>
        <span className="panel__stat">{final.title}</span>
      </div>
      <div className="panel__body">
        <div className="final-mando">
          <form className="final-limite" onSubmit={guardar}>
            <label htmlFor="final-min">Tiempo para abortar</label>
            <input
              id="final-min"
              type="number"
              min={1}
              max={180}
              value={borrador}
              disabled={quieto}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setBorrador(String(minutosActuales)); }}
            />
            <span className="final-unidad">min</span>
            {Number(borrador) !== minutosActuales && (
              <button type="submit" className="primaria" disabled={quieto}>
                {ocupado ? '…' : 'GUARDAR'}
              </button>
            )}
          </form>

          <p className={`final-estado ${final.estado.toLowerCase()}`}>
            <strong>{restante !== null ? `T-${reloj(restante)}` : '—'}</strong>
            <span>{estado}</span>
          </p>
        </div>

        {/* La cuenta atrás no penaliza a nadie: llegar a cero pinta el
            despegue en la pared y ya. Decirlo aquí evita la pregunta. */}
        <p className="nota-final">
          Empieza cuando abres la fase y se detiene con el evento en pausa. Llegar a cero
          no cierra la fase ni marca a nadie: lo único que pasa es que el cohete despega
          en la proyección.
        </p>

        <div className="fila-botones">
          <button
            className="ensayar-todo"
            disabled={quieto}
            onClick={() => ensayar('VICTORIA')}
          >
            [OK] ENSAYAR VICTORIA
          </button>
          <button
            className="peligro"
            disabled={quieto}
            onClick={() => ensayar('DERROTA')}
          >
            &gt;&gt; ENSAYAR DERROTA
          </button>
          <button className="sutil" disabled={quieto} onClick={() => ensayar(null)}>
            PARAR ENSAYO
          </button>
        </div>
      </div>
    </section>
  );
}
