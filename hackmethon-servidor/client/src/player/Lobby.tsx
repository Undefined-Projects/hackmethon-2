import { useMemo, useState } from 'react';
import { usePlayer, useSession } from '../session/SessionContext';
import { useTicker } from '../lib/useTicker';
import { formatMs, roleLabel } from '../lib/format';
import { urlLogo } from '../lib/logo';
import type { LobbyPhaseView } from '../shared/events';
import { Enredadera } from './Enredadera';
import { Anatomia } from './Anatomia';
import { FichaMinijuegos } from './FichaMinijuegos';
import { JardinLobby } from './JardinLobby';
import { asignarPartes, estadoDe, nombreParte } from '../lib/anatomia';
import { sonar } from '../lib/sonido';

/** El título del seed ya dice «Fase 3 — …»; la ficha lo pinta aparte. */
const sinPrefijo = (t: string) => t.replace(/^\s*fase\s+\d+\s*[—–-]\s*/i, '');

/** Los paneles que abraza el jardín del lobby. */
const SELECTORES_JARDIN = ['.lamina__figura', '.ficha'];

const MOTIVO: Record<string, string> = {
  ADMIN: 'Aún no habilitada',
  PREREQUISITE: 'Completa la fase anterior',
  COMPLETED: 'Ya completada',
};

export function Lobby() {
  const player = usePlayer();
  const { entrarFase, stampedAt, ensayoAnatomia } = useSession();
  const [entrando, setEntrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  useTicker(1000); // repinta los cronómetros
  const logo = urlLogo(player.team.id, player.team.logoAt);
  const partes = useMemo(() => asignarPartes(player.lobby), [player.lobby]);

  // Sin elección propia, la ficha muestra lo más útil: la fase que el
  // panel destacó, si no la primera que se puede jugar, si no la primera
  // sin resolver. Así nadie llega a un lobby con la ficha vacía.
  const porDefecto =
    player.lobby.find((f) => f.isFocus && f.canEnter)
    ?? player.lobby.find((f) => f.canEnter)
    ?? player.lobby.find((f) => f.teamStatus !== 'SOLVED')
    ?? player.lobby[0];
  const ficha = player.lobby.find((f) => f.phaseId === elegida) ?? porDefecto;
  const fueraDelCuerpo = player.lobby.filter((f) => !partes.has(f.phaseId));
  const elegir = (id: string) => { sonar('boton'); setElegida(id); };

  // El cronómetro se extrapola desde el último dato del servidor; en
  // pausa se congela. Nunca lo calculamos desde cero en el cliente: el
  // valor bueno es el que manda el servidor, esto solo lo continúa.
  const transcurrido = (f: LobbyPhaseView): number | null => {
    if (f.timeToSolveMs !== null) return f.timeToSolveMs;
    if (f.elapsedMs === null) return null;
    return player.event.paused ? f.elapsedMs : f.elapsedMs + (Date.now() - stampedAt);
  };

  async function entrar(f: LobbyPhaseView) {
    setEntrando(f.phaseId);
    setError(null);
    const r = await entrarFase(f.phaseId);
    setEntrando(null);
    if (!r.ok) setError(MOTIVO[r.error ?? ''] ?? r.error ?? 'No se pudo entrar');
  }

  return (
    <div className="lobby">
      {/* Vegetación y circuitos que abrazan los paneles del lobby. */}
      <JardinLobby selectores={SELECTORES_JARDIN} techo=".equipo-mini" />
      <header className="lobby-cabecera">
        {logo && <img className="escudo-lobby" src={logo} alt="" />}
        <div>
          <h1>{player.team.name}</h1>
          <span className="sub">{player.me.displayName}</span>
        </div>
        <span className={`rol rol-${player.me.role}`}>{roleLabel[player.me.role]}</span>
      </header>

      <ul className="equipo-mini">
        {player.team.members.map((m) => (
          <li key={m.id} className={m.id === player.me.id ? 'yo' : ''}>
            <span className={`punto ${m.connected ? 'on' : 'off'}`} />
            <span className={`rol rol-${m.role}`}>{roleLabel[m.role]}</span>
            <span className="nombre">{m.displayName.replace(`${player.team.name} · `, '')}</span>
          </li>
        ))}
      </ul>

      {error && <div className="banda err">{error}</div>}

      <div className="lamina">
        {/* Las enredaderas de los márgenes, ahora alrededor de la lámina
            entera: florecen en cuanto el equipo injerta su primera parte. */}
        <Enredadera indice={5} florece={player.lobby.some((f) => f.teamStatus === 'SOLVED')} />
        <div className="lamina__figura">
          <p className="lamina__cab">LÁMINA I · ANATOMÍA DE LA MÁQUINA</p>
          <Anatomia
            lobby={player.lobby}
            partes={partes}
            seleccion={ficha?.phaseId ?? null}
            onElegir={elegir}
            transcurrido={transcurrido}
            teamId={player.team.id}
            ensayo={ensayoAnatomia}
          />
        </div>

        {/* La columna de las fichas: la fase elegida y, debajo, el
            desglose personal de los recreos. */}
        <div className="lamina__lado">
          {ficha && (
            <Ficha
              key={ficha.phaseId}
              f={ficha}
              parte={partes.has(ficha.phaseId) ? nombreParte(partes.get(ficha.phaseId)!) : null}
              tiempo={transcurrido(ficha)}
              entrando={entrando}
              onEntrar={() => entrar(ficha)}
            />
          )}
          <FichaMinijuegos marcas={player.misMarcas ?? []} />
        </div>
      </div>

      {/* Si algún día hay más fases de las que caben en el cuerpo, no se
          pierden: van aquí, como apéndice de la lámina. */}
      {fueraDelCuerpo.length > 0 && (
        <ul className="lamina__apendice">
          {fueraDelCuerpo.map((f) => (
            <li key={f.phaseId}>
              <button className={`sutil ${ficha?.phaseId === f.phaseId ? 'activo' : ''}`} onClick={() => elegir(f.phaseId)}>
                F{f.order} · {sinPrefijo(f.title)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** La ficha de la fase elegida, al lado del robot. */
function Ficha({
  f, parte, tiempo, entrando, onEntrar,
}: {
  f: LobbyPhaseView;
  parte: string | null;
  tiempo: number | null;
  entrando: string | null;
  onEntrar: () => void;
}) {
  const estado = estadoDe(f);
  const resuelta = estado === 'resuelta';
  return (
    <section className={`ficha ficha--${estado}`} aria-live="polite">
      <header className="ficha__cab">
        <span className="ficha__n">F{f.order}</span>
        <span className="ficha__parte">{parte ?? 'APÉNDICE'}</span>
        {f.isFocus && <span className="chip mini">en curso</span>}
        {f.esFinal && <span className="chip mini marca-final">FINAL</span>}
        {f.esBonus && <span className="chip mini marca-bonus">BONUS</span>}
      </header>
      <h3 className="ficha__titulo">{sinPrefijo(f.title)}</h3>
      <p className="ficha__texto">{f.description ?? f.teaser ?? 'Información no disponible todavía.'}</p>
      <dl className="ficha__datos">
        <div><dt>ESTADO</dt><dd className={`ficha__estado ficha__estado--${estado}`}>
          {resuelta ? 'DESTRUIDA' : estado === 'perdida' ? 'PERDIDA' : f.canEnter ? 'OPERABLE' : (MOTIVO[f.lockReason ?? ''] ?? 'BLOQUEADA').toUpperCase()}
        </dd></div>
        <div><dt>{resuelta ? 'TIEMPO OFICIAL' : 'CRONÓMETRO'}</dt><dd className={`cronometro ${resuelta ? 'ok' : ''}`}>{formatMs(tiempo)}</dd></div>
        <div><dt>INTENTOS</dt><dd>{f.attempts}</dd></div>
      </dl>
      <button
        className="ficha__entrar primaria"
        disabled={!f.canEnter || entrando !== null}
        onClick={onEntrar}
      >
        {entrando === f.phaseId ? 'Abriendo…' : resuelta ? 'Ya destruida' : f.canEnter ? 'Operar ▸' : 'Bloqueada'}
      </button>
    </section>
  );
}
