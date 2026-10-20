import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState,
} from 'react';
import type { ReactNode } from 'react';
import { createSocket, call, type AppSocket } from '../lib/socket';
import { sonar } from '../lib/sonido';
import type { Role, TipoAveria } from '../shared/constants';
import type {
  AdminSnapshot, LobbyPhaseView, MarcaMinijuego, MovimientoTickets, RecordSala, MemberView, MinijuegoTablero, MinijuegoView, ParteRobot, PhaseWorkspace, PlayerSnapshot, Snapshot,
} from '../shared/events';

// ============================================================
//  Estado global del jugador.
//
//  Regla que gobierna todo este archivo: el front NO deduce estado.
//  No decide su rol, no decide si una fase está abierta, no calcula si
//  puede entrar. Solo guarda lo último que dijo el servidor y lo pinta.
//  Cualquier cálculo propio acabaría contradiciendo al servidor tras
//  una reconexión o una mezcla de roles, que es justo cuando más se ve.
// ============================================================

type ConnState = 'connecting' | 'online' | 'offline';

/**
 * Los rechazos que NO se arreglan esperando.
 *
 * Son los que manda el portero del servidor cuando la credencial no
 * vale. Reintentar con ella es gastar batería y hacer parpadear el
 * estado para siempre: lo que hace falta es parar y que la persona
 * teclee otro código.
 */
const CREDENCIAL_RECHAZADA = new Set(['NO_CODE', 'INVALID_CODE', 'NO_TEAM']);

type State = {
  snapshot: Snapshot | null;
  conn: ConnState;
  error: string | null;
  /** Marca de tiempo local del último dato de reloj recibido. */
  stampedAt: number;
  /** Desfase entre el reloj del servidor y el del navegador. */
  clockOffset: number;
  /** El servidor rechazó la credencial: no es un problema de red y no
   *  se va a arreglar solo. La única salida es teclear otro código. */
  credencialRechazada: boolean;
  /** Aviso efímero de cambio de rol (lo consume la cortinilla). */
  roleFlash: { from: Role | null; to: Role } | null;
  /** Avería en curso, provocada desde el panel. Efímera: no se persiste
   *  ni toca el juego, solo molesta durante unos segundos. */
  averia: { tipo: TipoAveria; hasta: number; de?: string } | null;
  /** Fase recién resuelta, para la pantalla de celebración.
   *  `ensayo` marca los disparos del panel: nada se ha guardado. */
  resuelta: {
    title: string; timeToSolveMs: number | null; attempts: number; ensayo?: boolean;
    tickets?: { ganados: number; lugar: number };
  } | null;
  /** Aviso efímero del juego: tickets que entran o salen, un ataque que
   *  rebotó en el escudo. `id` distingue dos avisos iguales seguidos. */
  aviso: { id: number; tipo: 'tickets' | 'gasto' | 'escudo'; texto: string } | null;
  /** Ensayo de la destrucción del robot, lanzado desde el panel. Lo pinta
   *  el lobby; no cambia nada de la partida. */
  ensayoAnatomia: { parte: ParteRobot | 'todo'; id: string; at: number } | null;
};

type Action =
  | { t: 'conn'; v: ConnState }
  | { t: 'error'; v: string | null }
  | { t: 'rechazada'; v: string }
  | { t: 'snapshot'; v: Snapshot }
  | { t: 'lobby'; v: { lobby: LobbyPhaseView[]; serverTime: number } }
  | { t: 'presence'; v: { teamId: string; members: MemberView[] } }
  | { t: 'workspace'; v: PhaseWorkspace | null }
  | { t: 'event'; v: { status: string; focusPhaseId: string | null; paused: boolean } }
  | { t: 'role'; v: { role: Role; previousRole: Role | null } }
  | { t: 'roleFlashDone' }
  | {
      t: 'solved';
      v: {
        title: string; timeToSolveMs: number | null; attempts: number; ensayo?: boolean;
        tickets?: { ganados: number; lugar: number };
      };
    }
  | { t: 'solvedDone' }
  | { t: 'averia'; v: { tipo: TipoAveria; duracionMs: number; de?: string } }
  | { t: 'averiaFin' }
  | { t: 'tickets'; v: MovimientoTickets }
  | { t: 'aviso'; v: { tipo: 'tickets' | 'gasto' | 'escudo'; texto: string } }
  | { t: 'avisoFin'; id: number }
  | { t: 'minijuego'; v: MinijuegoView | null }
  | { t: 'tablero'; v: MinijuegoTablero | null }
  | { t: 'anatomia'; v: { parte: ParteRobot | 'todo'; id: string } }
  | { t: 'marcas'; v: MarcaMinijuego[] }
  | { t: 'records'; v: RecordSala[] };

const isPlayer = (s: Snapshot | null): s is PlayerSnapshot => s?.kind === 'PLAYER';

function reducer(st: State, a: Action): State {
  switch (a.t) {
    case 'conn':
      return { ...st, conn: a.v };

    case 'error':
      return { ...st, error: a.v };

    case 'rechazada':
      return { ...st, error: a.v, credencialRechazada: true, conn: 'offline' };

    case 'snapshot': {
      // La avería en curso viene del servidor con lo que le queda: al
      // recargar la página se retoma donde estaba. Si la de aquí acaba
      // más tarde, manda la de aquí: un snapshot no acorta una avería.
      const enCurso = isPlayer(a.v) && a.v.averia && a.v.averia.restanteMs > 0 ? a.v.averia : null;
      const hasta = enCurso ? Date.now() + enCurso.restanteMs : 0;
      const averia = enCurso && !(st.averia && st.averia.tipo === enCurso.tipo && st.averia.hasta >= hasta)
        ? { tipo: enCurso.tipo, hasta, de: enCurso.de }
        : st.averia;
      // Reemplazo total, nunca fusión parcial. El snapshot ES el estado.
      return {
        ...st,
        snapshot: a.v,
        stampedAt: Date.now(),
        clockOffset: a.v.serverTime - Date.now(),
        error: null,
        averia,
      };
    }

    case 'lobby':
      if (!isPlayer(st.snapshot)) return st;
      return {
        ...st,
        snapshot: { ...st.snapshot, lobby: a.v.lobby },
        stampedAt: Date.now(),
        clockOffset: a.v.serverTime - Date.now(),
      };

    case 'presence': {
      if (!st.snapshot) return st;
      if (isPlayer(st.snapshot)) {
        if (st.snapshot.team.id !== a.v.teamId) return st;
        return { ...st, snapshot: { ...st.snapshot, team: { ...st.snapshot.team, members: a.v.members } } };
      }
      const admin = st.snapshot as AdminSnapshot;
      return {
        ...st,
        snapshot: {
          ...admin,
          teams: admin.teams.map((t) => (t.id === a.v.teamId ? { ...t, members: a.v.members } : t)),
        },
      };
    }

    case 'workspace':
      if (!isPlayer(st.snapshot)) return st;
      // Salir de la fase es un acto de EQUIPO: el servidor manda este
      // `workspace:update` a los tres a la vez, no solo a quien pulsó.
      // Si la celebración no se bajara aquí, los otros dos se quedarían
      // mirando la pantalla de victoria por encima de un lobby que ya
      // tienen debajo y no pueden tocar.
      return {
        ...st,
        snapshot: { ...st.snapshot, workspace: a.v },
        resuelta: a.v === null ? null : st.resuelta,
      };

    case 'event':
      if (!st.snapshot) return st;
      return {
        ...st,
        snapshot: { ...st.snapshot, event: { ...st.snapshot.event, ...a.v } } as Snapshot,
      };

    case 'role':
      // Solo levanta la cortinilla. El rol real llega en el snapshot que
      // el servidor envía justo detrás; no lo escribimos aquí a mano.
      return { ...st, roleFlash: { from: a.v.previousRole, to: a.v.role } };

    case 'roleFlashDone':
      return { ...st, roleFlash: null };

    case 'solved':
      return { ...st, resuelta: a.v };

    case 'solvedDone':
      return { ...st, resuelta: null };

    case 'averia':
      // Un súper ataque en curso no lo pisa un ataque normal: quien está
      // inmovilizado no tiene puesto que averiar. El servidor ya no lo
      // manda, pero un aviso que se cruce en el cable no debe liberarle.
      if (st.averia?.tipo === 'SUPER' && st.averia.hasta > Date.now() && a.v.tipo !== 'SUPER') return st;
      return { ...st, averia: { tipo: a.v.tipo, hasta: Date.now() + a.v.duracionMs, de: a.v.de } };

    case 'tickets':
      if (!isPlayer(st.snapshot)) return st;
      return { ...st, snapshot: { ...st.snapshot, team: { ...st.snapshot.team, tickets: a.v.saldo } } };

    case 'aviso':
      return { ...st, aviso: { ...a.v, id: (st.aviso?.id ?? 0) + 1 } };

    case 'avisoFin':
      return st.aviso?.id === a.id ? { ...st, aviso: null } : st;

    case 'averiaFin':
      return { ...st, averia: null };

    // El jugador recibe el minijuego sin ranking; el panel, con él.
    case 'minijuego':
      if (!isPlayer(st.snapshot)) return st;
      return { ...st, snapshot: { ...st.snapshot, minijuego: a.v } };

    case 'marcas':
      if (!isPlayer(st.snapshot)) return st;
      return { ...st, snapshot: { ...st.snapshot, misMarcas: a.v } };

    case 'records':
      if (!isPlayer(st.snapshot)) return st;
      return { ...st, snapshot: { ...st.snapshot, recordsSala: a.v } };

    case 'anatomia':
      // `at` en reloj local: el lobby solo reproduce ensayos recién llegados.
      return { ...st, ensayoAnatomia: { ...a.v, at: Date.now() } };

    case 'tablero':
      if (st.snapshot?.kind !== 'ADMIN') return st;
      return { ...st, snapshot: { ...st.snapshot, minijuego: a.v } };

    default:
      return st;
  }
}

type Ctx = State & {
  socket: AppSocket | null;
  /** El código con el que se entró. La pantalla de rechazo lo enseña:
   *  una letra de más se ve antes leyéndola que recordándola. */
  codigo: string;
  entrarFase: (phaseId: string) => Promise<{ ok: boolean; error?: string }>;
  volverAlLobby: () => Promise<void>;
  cerrarSesion: () => void;
  cerrarCelebracion: () => void;
  /** Pide el snapshot entero otra vez. Para lo que cambia por lo que
   *  hacen OTROS sin que nadie nos avise —la intensidad de un ataque
   *  depende de las fases de cada rival—, justo antes de mirarlo. */
  refrescar: () => void;
};

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({
  code, onLogout, children,
}: { code: string; onLogout: () => void; children: ReactNode }) {
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [st, dispatch] = useReducer(reducer, {
    snapshot: null, conn: 'connecting', error: null, credencialRechazada: false,
    stampedAt: Date.now(), clockOffset: 0, roleFlash: null, resuelta: null, averia: null,
    ensayoAnatomia: null, aviso: null,
  });

  useEffect(() => {
    const s = createSocket(code);
    setSocket(s);

    s.on('connect', () => dispatch({ t: 'conn', v: 'online' }));
    s.on('disconnect', () => dispatch({ t: 'conn', v: 'offline' }));
    s.on('connect_error', (e) => {
      if (CREDENCIAL_RECHAZADA.has(e.message)) {
        // Se para la reconexión: con esta credencial el servidor va a
        // decir no siempre, y un «reintentando» eterno hace creer que
        // el problema es la red cuando es el código.
        s.disconnect();
        sonar('error');
        dispatch({ t: 'rechazada', v: e.message });
        return;
      }
      dispatch({ t: 'error', v: e.message });
      dispatch({ t: 'conn', v: 'offline' });
    });

    // Los sonidos se disparan AQUÍ, donde llegan los hechos, y no en el
    // reducer: un reducer que hace ruido deja de ser una función pura y
    // empieza a sonar dos veces en modo estricto.
    //
    // El estado de pausa se compara contra el anterior porque
    // `event:update` se emite por muchos motivos: sin esto, encender el
    // acceso libre haría sonar la pausa.
    let pausadoAntes: boolean | null = null;
    // Igual con el minijuego: suena al arrancar o cambiar de ronda, no
    // cada vez que alguien de la sala mejora su puntaje.
    let rondaAntes: string | null = null;

    s.on('session:snapshot', (v) => {
      pausadoAntes = v.event.paused;
      rondaAntes = v.minijuego?.ronda ?? null;
      dispatch({ t: 'snapshot', v });
    });
    s.on('lobby:update', (v) => dispatch({ t: 'lobby', v }));
    s.on('presence:update', (v) => dispatch({ t: 'presence', v }));
    // Entrar y salir de una fase es un acto de equipo, y este evento les
    // llega a los tres a la vez: el sonido también.
    s.on('workspace:update', (v) => { sonar(v === null ? 'salir' : 'entrar'); dispatch({ t: 'workspace', v }); });
    s.on('event:update', (v) => {
      if (pausadoAntes !== null && v.paused !== pausadoAntes) sonar(v.paused ? 'pausa' : 'reanudar');
      pausadoAntes = v.paused;
      dispatch({ t: 'event', v });
    });
    s.on('role:changed', (v) => { sonar('cortinilla'); dispatch({ t: 'role', v }); });
    s.on('phase:solved', (v) => {
      sonar('victoria');
      return dispatch({
        t: 'solved',
        v: {
          title: v.title,
          timeToSolveMs: v.timeToSolveMs,
          attempts: v.attempts,
          ensayo: v.ensayo,
          tickets: v.tickets,
        },
      });
    });
    s.on('minijuego:update', (v) => {
      const ronda = v?.ronda ?? null;
      if (ronda !== rondaAntes) sonar(ronda ? 'entrar' : 'salir');
      rondaAntes = ronda;
      dispatch({ t: 'minijuego', v });
    });
    // Solo llega a los admins. Sin sonido: cambia con cada intento de
    // cada persona de la sala.
    s.on('minijuego:tablero', (v) => dispatch({ t: 'tablero', v }));
    s.on('anatomia:ensayo', (v) => dispatch({ t: 'anatomia', v }));
    s.on('minijuego:mis-marcas', (v) => dispatch({ t: 'marcas', v }));
    s.on('minijuego:records', (v) => dispatch({ t: 'records', v }));
    s.on('player:averia', (v) => { sonar('averia'); dispatch({ t: 'averia', v }); });
    s.on('tickets:movimiento', (v) => {
      dispatch({ t: 'tickets', v });
      // Lo que se gasta ya lo cuenta el botón que lo gastó; aquí suena y
      // se anuncia lo que ENTRA, que es lo que nadie esperaba.
      if (v.delta > 0) {
        sonar('ok');
        dispatch({ t: 'aviso', v: { tipo: 'tickets', texto: `+${v.delta} TICKETS · ${v.motivo}` } });
      } else {
        dispatch({ t: 'aviso', v: { tipo: 'gasto', texto: `${v.delta} TICKETS · ${v.motivo}` } });
      }
    });
    s.on('ataque:bloqueado', ({ de }) => {
      sonar('ok');
      dispatch({ t: 'aviso', v: { tipo: 'escudo', texto: `ESCUDO · REBOTÓ EL ATAQUE DE ${de}` } });
    });
    // El mismo rechazo puede llegar con el socket ya abierto: el
    // servidor construye el snapshot y descubre que no hay por dónde.
    s.on('session:error', (e) => {
      if (CREDENCIAL_RECHAZADA.has(e.code)) {
        s.disconnect();
        sonar('error');
        return dispatch({ t: 'rechazada', v: e.code });
      }
      dispatch({ t: 'error', v: e.message });
    });

    return () => { s.removeAllListeners(); s.close(); setSocket(null); };
  }, [code]);

  // La averia se apaga sola. Vive aqui y no en la vista que la sufre
  // porque una mezcla de roles desmonta esa vista entera, y una averia a
  // medias que se queda encendida para siempre seria peor que la averia.
  useEffect(() => {
    if (!st.averia) return;
    const t = setTimeout(() => dispatch({ t: 'averiaFin' }), Math.max(0, st.averia.hasta - Date.now()));
    return () => clearTimeout(t);
  }, [st.averia]);

  // El aviso efímero se va solo a los cinco segundos.
  useEffect(() => {
    if (!st.aviso) return;
    const id = st.aviso.id;
    const t = setTimeout(() => dispatch({ t: 'avisoFin', id }), 5000);
    return () => clearTimeout(t);
  }, [st.aviso]);

  // La cortinilla de cambio de rol se apaga sola. Va aquí y no en el
  // componente que la pinta para que sobreviva a su desmontaje —que es
  // exactamente lo que ocurre: al cambiar el rol, el árbol se destruye.
  useEffect(() => {
    if (!st.roleFlash) return;
    const t = setTimeout(() => dispatch({ t: 'roleFlashDone' }), 2200);
    return () => clearTimeout(t);
  }, [st.roleFlash]);

  // El fallo de sincronía va en <body> y no en un componente: sacude el
  // tubo entero —panel, lobby, cortinilla— y ninguna de esas capas
  // debería tener que enterarse de que hubo una mezcla de roles.
  useEffect(() => {
    if (!st.roleFlash) return;
    document.body.classList.add('fallo');
    const t = setTimeout(() => document.body.classList.remove('fallo'), 1200);
    return () => {
      clearTimeout(t);
      document.body.classList.remove('fallo');
    };
  }, [st.roleFlash]);

  const entrarFase = useCallback(
    async (phaseId: string) => {
      if (!socket) return { ok: false, error: 'SIN_CONEXION' };
      return call(socket, 'phase:enter', { phaseId });
    },
    [socket],
  );

  const volverAlLobby = useCallback(async () => {
    if (socket) await call(socket, 'phase:leave', undefined);
  }, [socket]);

  // Cerrar una victoria real devuelve al lobby, que es donde sigue la
  // partida. Cerrar un ENSAYO solo baja el telón: si además hiciera
  // `phase:leave`, un ensayo lanzado a mitad de partida echaría al
  // equipo entero de la fase que está jugando.
  const cerrarCelebracion = useCallback(async () => {
    const eraEnsayo = st.resuelta?.ensayo === true;
    dispatch({ t: 'solvedDone' });
    if (!eraEnsayo) await volverAlLobby();
  }, [st.resuelta, volverAlLobby]);

  const refrescar = useCallback(() => {
    socket?.emit('session:resync', null, (v) => { if (v) dispatch({ t: 'snapshot', v }); });
  }, [socket]);

  const value = useMemo<Ctx>(
    () => ({
      ...st, socket, codigo: code,
      entrarFase, volverAlLobby, cerrarSesion: onLogout, cerrarCelebracion, refrescar,
    }),
    [st, socket, code, entrarFase, volverAlLobby, onLogout, cerrarCelebracion, refrescar],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('useSession fuera de <SessionProvider>');
  return c;
}

/** Snapshot de jugador ya estrechado. Lanza si se usa en la rama de admin. */
export function usePlayer(): PlayerSnapshot {
  const { snapshot } = useSession();
  if (!isPlayer(snapshot)) throw new Error('usePlayer requiere un snapshot de jugador');
  return snapshot;
}
