import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer, useSession } from '../session/SessionContext';
import { formatMs, roleLabel } from '../lib/format';
import { Lobby } from './Lobby';
import { RoleGate } from './RoleGate';
import { RotuloInestable } from './RotuloInestable';
import { MenuAtaque } from './MenuAtaque';
import { AnuncioPrimera } from './AnuncioPrimera';
import { JUEGOS } from './minijuegos/juegos';
import { SalaEspera } from './SalaEspera';
import { SuperAtaque } from './SuperAtaque';
import { CaraRobot } from './RobotAtaque';
import { LaminaFase } from './LaminaFase';
import { LetreroRobot } from './LetreroRobot';
import { BarraMaquina, nivelDeMiedo, type Animo } from './RostroMaquina';
import { Deterioro } from './Deterioro';
import { Habitacion } from './Habitacion';
import { INTROS, IntroFase, introDeCapa, introVista, marcarIntroVista } from './fases/IntroFase';

export function PlayerApp() {
  const player = usePlayer();
  const { conn, roleFlash, resuelta, averia, aviso, consejo, volverAlLobby, cerrarCelebracion, cerrarConsejo, socket } = useSession();
  // El desplegable solo existe con la partida en marcha. En el lobby de
  // antes de empezar no hay a quién atacar, y con el evento terminado
  // tampoco: dejarlo puesto invitaría a seguir dando guerra.
  const enJuego = player.event.status === 'RUNNING' || player.event.status === 'PAUSED';

  // La introducción de la fase: sola la primera vez que esta persona
  // entra en ella, y cuando la pida con «cómo se juega».
  const faseKey = player.workspace?.key ?? null;
  const [intro, setIntro] = useState<string | null>(null);
  useEffect(() => {
    if (faseKey && INTROS[faseKey] && !introVista(player.me.id, faseKey)) setIntro(faseKey);
  }, [faseKey, player.me.id]);

  // La de una capa nueva: sale sola al llegar a ella. Espera lo que el
  // servidor diga que le falta a Pantalla para enseñar cómo cedió la
  // anterior (el brote que llega y la pierna que apaga la luz). Si otra
  // está abierta, espera a que se cierre.
  const lamina = (player.workspace?.payload as { lamina?: { capa?: number; cedeEnMs?: number } } | null)?.lamina;
  const capa = lamina?.capa ?? null;
  const deCapa = faseKey && capa ? introDeCapa(faseKey, capa) : null;
  const pendienteCapa = !!deCapa && !!INTROS[deCapa] && !introVista(player.me.id, deCapa);
  const esperaCapa = useRef(0);
  esperaCapa.current = lamina?.cedeEnMs ?? 0;
  useEffect(() => {
    if (!pendienteCapa) return;
    const t = setTimeout(() => setIntro((abierta) => abierta ?? deCapa), esperaCapa.current);
    return () => clearTimeout(t);
  }, [deCapa, pendienteCapa]);

  // La máquina: su miedo es el de la fase en la que está el equipo, y cada
  // capa que cruzan (o la fase que resuelven) le arranca un respingo.
  const miedo = nivelDeMiedo(faseKey, player.lobby);
  const [reaccion, setReaccion] = useState(0);
  // El easter egg: la habitación oscura, en primera persona.
  const [habitacion, setHabitacion] = useState(false);
  const salirHabitacion = useCallback(() => setHabitacion(false), []);
  const animo = (player.workspace?.payload as { animo?: Animo } | null)?.animo ?? null;
  // El bonus del corazón cambia el estilo entero: una IBM de fósforo verde.
  const ibm = faseKey === 'fase-bonus-corazon';
  useEffect(() => {
    document.body.classList.toggle('modo-ibm', ibm);
    return () => document.body.classList.remove('modo-ibm');
  }, [ibm]);
  const capaVista = useRef<{ fase: string | null; capa: number | null }>({ fase: faseKey, capa });
  useEffect(() => {
    const antes = capaVista.current;
    capaVista.current = { fase: faseKey, capa };
    if (antes.fase === faseKey && antes.capa !== null && capa !== null && capa > antes.capa) setReaccion((r) => r + 1);
  }, [faseKey, capa]);
  useEffect(() => { if (resuelta) setReaccion((r) => r + 1); }, [resuelta]);

  const cerrarIntro = () => {
    if (intro) marcarIntroVista(player.me.id, intro);
    setIntro(pendienteCapa && intro !== deCapa ? deCapa : null);
  };

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
      {averia?.de && averia.tipo !== 'SUPER' && (
        <div className="banda ataque-recibido fija">
          <CaraRobot className="banda-cara" risa={false} />
          &gt;&lt;! ATAQUE DE {averia.de}
        </div>
      )}

      {/* Tickets que entran o salen, y ataques que rebotan en el escudo.
          Efímero y arriba, sin tapar nada: es una noticia, no una pared. */}
      {aviso && (
        <div key={aviso.id} className={`banda fija aviso-juego aviso-juego--${aviso.tipo}`} role="status">
          {aviso.texto}
        </div>
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

          {resuelta.tickets && (
            <p className="celebracion__tickets">
              +{resuelta.tickets.ganados} TICKETS · {resuelta.tickets.lugar}.º EN SUPERARLA
            </p>
          )}

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
            {INTROS[player.workspace.key] && (
              <button className="sutil como-se-juega" onClick={() => setIntro(player.workspace!.key)}>[?] CÓMO SE JUEGA</button>
            )}
            <span className={`rol rol-${player.me.role}`}>{roleLabel[player.me.role]}</span>
          </header>

          {/* Qué lámina es y por qué capa va: la ven los tres puestos. */}
          <LaminaFase workspace={player.workspace} lobby={player.lobby} />

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

      {/* La máquina, abajo y al centro: cada vez más asustada. Fuera de la
          fase, como el menú de ataque: dentro, «fija» se anclaría al final
          del contenido y no a la pantalla. */}
      {/* Mientras te atacan, la máquina se ríe de ti. */}
      {player.workspace && <BarraMaquina nivel={miedo} reaccion={reaccion} riendo={!!averia && averia.hasta > Date.now()}
        animo={animo} alSecreto={() => setHabitacion(true)} />}

      {habitacion && <Habitacion nivel={miedo} alSalir={salirHabitacion} />}

      {/* La página se rompe con la máquina: más cuanto más adentro. */}
      {player.workspace && <Deterioro nivel={miedo} furia={animo?.furia ?? 0} apagada={!!animo?.apagada} />}

      {/* Superó todo lo abierto y la siguiente aún no abre: minijuegos
          mientras espera. El recreo del panel, si lo hay, manda. */}
      <SalaEspera recreoDelPanel={!!player.minijuego} />

      {/* El primer equipo en superar una fase: lo ve toda la sala. */}
      <AnuncioPrimera />

      {intro && <IntroFase fase={intro} onCerrar={cerrarIntro} />}

      {/* El consejo que manda el admin: en una esquina, sin tapar el juego. */}
      {consejo && <LetreroRobot consejo={consejo} onCerrar={cerrarConsejo} />}

      {/* Encima de TODO, también del minijuego: inmoviliza al equipo. */}
      <SuperAtaque />
    </div>
  );
}
