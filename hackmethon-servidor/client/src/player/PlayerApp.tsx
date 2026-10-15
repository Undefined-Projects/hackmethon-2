import { usePlayer, useSession } from '../session/SessionContext';
import { formatMs, roleLabel } from '../lib/format';
import { Lobby } from './Lobby';
import { RoleGate } from './RoleGate';
import { RotuloInestable } from './RotuloInestable';
import { MenuAtaque } from './MenuAtaque';
import { AnuncioPrimera } from './AnuncioPrimera';
import { JUEGOS } from './minijuegos/juegos';
import { SalaEspera } from './SalaEspera';

export function PlayerApp() {
  const player = usePlayer();
  const { conn, roleFlash, resuelta, averia, volverAlLobby, cerrarCelebracion, socket } = useSession();
  // El desplegable solo existe con la partida en marcha. En el lobby de
  // antes de empezar no hay a quién atacar, y con el evento terminado
  // tampoco: dejarlo puesto invitaría a seguir dando guerra.
  const enJuego = player.event.status === 'RUNNING' || player.event.status === 'PAUSED';

  return (
    <div className="jugador">
      {/* El aviso de pausa va aquí y no en el lobby: dentro de una fase
          también hay que decirlo, o el equipo teclea contra un servidor
          que rechaza todo sin explicar nada. */}
      {player.event.paused && (
        <div className="banda pausa fija">EVENTO EN PAUSA · cronómetros detenidos</div>
      )}

      {/* Quién te lo ha hecho. Sin remite es una avería del sistema; con
          él, un rival, y saberlo es media gracia —la otra media es
          devolvérselo—. */}
      {averia?.de && (
        <div className="banda ataque-recibido fija">&gt;&lt;! ATAQUE DE {averia.de}</div>
      )}

      {conn !== 'online' && (
        <div className="banda err fija">
          {conn === 'connecting' ? 'Conectando…' : 'Sin conexión · reintentando'}
        </div>
      )}

      {/* Cortinilla de cambio de rol: en un evento en vivo, cambiar la
          pantalla en silencio desorienta. Dos segundos de aviso bastan. */}
      {roleFlash && (
        <div className="cortinilla">
          <p>FALLO DE SINCRONÍA · REASIGNANDO PUESTO</p>
          <strong className={`rol rol-${roleFlash.to}`}>
            <RotuloInestable texto={roleLabel[roleFlash.to].toUpperCase()} />
          </strong>
          <span className="cortinilla__ruido">
            {roleFlash.from ? `PUESTO ANTERIOR: ${roleLabel[roleFlash.from].toUpperCase()}` : 'PUESTO ASIGNADO'}
          </span>
        </div>
      )}

      {/* Victoria. Ocupa el tubo entero y les llega a los tres a la vez:
          la fase se gana en equipo y el momento tiene que ser común, no
          un aviso que cada uno descubre en su esquina. El tiempo va en
          el momento, no después en una tabla. */}
      {resuelta && (
        <div className="cortinilla celebracion" role="status" aria-live="polite">
          <p className="celebracion__sello">BARRERA SUPERADA</p>
          <strong className="celebracion__titular">FASE COMPLETADA</strong>
          <span className="celebracion__fase">{resuelta.title}</span>

          <span className="tiempo-final">{formatMs(resuelta.timeToSolveMs)}</span>
          <p className="celebracion__pie">
            TIEMPO OFICIAL · {resuelta.attempts} INTENTO(S) FALLIDO(S)
          </p>

          <button onClick={cerrarCelebracion}>
            {resuelta.ensayo ? 'Cerrar el ensayo' : 'Volver al lobby'}
          </button>

          {/* Un ensayo se ve exactamente igual que una victoria —para eso
              es un ensayo—, pero no puede confundirse con una en la sala. */}
          {resuelta.ensayo && (
            <small className="celebracion__ensayo">
              ENSAYO DEL PANEL · no se ha guardado ningún tiempo
            </small>
          )}
        </div>
      )}

      {player.workspace === null ? (
        <Lobby />
      ) : (
        <div className="espacio-fase">
          <header className="fase-cabecera">
            <button className="sutil" onClick={volverAlLobby}>&lt;&lt; LOBBY</button>
            <span className="titulo-fase">{player.workspace.title}</span>
            <span className={`rol rol-${player.me.role}`}>{roleLabel[player.me.role]}</span>
          </header>

          {/* ÚNICO punto de la aplicación que decide qué ve cada rol. */}
          <RoleGate role={player.me.role} workspace={player.workspace} />
        </div>
      )}

      {/* El minijuego que lanzó el panel. Va ENCIMA de todo, sin
          desmontar el lobby ni la fase de debajo: al terminarlo, cada
          quien sigue exactamente donde estaba. `key` por ronda: relanzarlo
          empieza de cero, sin arrastrar el intento anterior. */}
      {player.minijuego && (() => {
        const Juego = JUEGOS[player.minijuego.clave];
        return Juego ? <Juego key={player.minijuego.ronda} minijuego={player.minijuego} socket={socket} /> : null;
      })()}

      {/* Fuera del flujo, como el botón de salir: tiene que estar a la
          vista en el lobby y dentro de cualquier fase, sin empujar nada. */}
      {enJuego && <MenuAtaque />}

      {/* Superó todo lo abierto y la siguiente aún no abre: minijuegos
          mientras espera. El recreo del panel, si lo hay, manda. */}
      <SalaEspera recreoDelPanel={!!player.minijuego} />

      {/* El primer equipo en superar una fase: lo ve toda la sala. */}
      <AnuncioPrimera />
    </div>
  );
}
