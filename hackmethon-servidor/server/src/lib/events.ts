// ============================================================
//  Contrato de eventos WebSocket (compartido con el cliente).
//  Un único archivo copiado a client/src/shared/ para que un typo
//  en un nombre de evento sea un error de compilación, no un bug
//  silencioso a mitad del evento en vivo.
// ============================================================

import type { Role, EventStatus, TipoAveria } from './constants.js';

// ---------- Salida del sistema (lo que pinta el Operador de Pantalla) ----------

export type BloqueSalida =
  | { tipo: 'texto'; titulo?: string; lineas: string[] }
  | { tipo: 'lista'; titulo?: string; items: { clave: string; valor: string }[] }
  | { tipo: 'tabla'; titulo?: string; columnas: string[]; filas: string[][] }
  | { tipo: 'error'; texto: string }
  | { tipo: 'exito'; titulo: string; lineas: string[] }
  /**
   * El flujo de filtros de la Fase 1, en pseudocódigo: `filtros` son las
   * condiciones tal cual se escribieron, en orden. `marchitos` son los que
   * la muda se llevó: se pintan secándose, una sola vez, en la salida que
   * los tiró.
   */
  | { tipo: 'flujo'; titulo?: string; filtros: string[]; max: number; marchitos?: string[]; pierna?: boolean[] };

export type SalidaComando = {
  id: string;
  comando: string;
  at: number;
  bloques: BloqueSalida[];
  /** `limpiar terminal`: Pantalla borra lo que tenía pintado. No trae
   *  bloques; al repintar, el historial empieza después de la última. */
  limpiar?: true;
};

// ---------- Flujo de tráfico en vivo (lo ve solo PANTALLA) ----------
//
// Una petición NO viaja con veredicto. El servidor manda los hechos
// crudos —quién dice ser, desde dónde y cómo respondió el sistema— y
// quién es legítimo lo deduce el equipo cruzando con el padrón que
// tiene el Operador de Datos. Un campo `sospechosa: true` aquí
// resolvería la fase de un vistazo y sobraría la mitad del juego.

/** Lo que describe el módulo de fase: una petición sin sellar. */
export type PeticionTrafico = {
  metodo: string;   // GET, POST, DELETE...
  ruta: string;
  cuenta: string;
  ip: string;
  codigo: number;   // 200, 401, 403, 404, 500
};

/**
 * Filtro del monitor.
 *
 * Solo acota por lo que VIAJA en la petición: cuenta, origen, ruta,
 * método y código. No hay filtro por departamento, y su ausencia es
 * deliberada: el servidor sí sabe de qué departamento es cada cuenta,
 * así que `trafico departamento finanzas` le enseñaría a Pantalla que
 * j.ortega es de Finanzas sin preguntárselo a Datos, y el eje 3 volvería
 * a resolverse desde un solo puesto. Esa vista se compone a mano —
 * `trafico cuenta j.ortega cuenta c.pineda`— con lo que Datos lee en voz
 * alta, y así el filtro es un motivo para hablar, no un atajo.
 *
 * Entre claves distintas ACOTA (Y lógica); dentro de una clave SUMA (O).
 */
export type FiltroTrafico = {
  cuenta?: string[];
  ip?: string[];
  /** Por prefijo: `/api/exportar` atrapa `/api/exportar/nomina`. */
  ruta?: string[];
  metodo?: string[];
  codigo?: number[];
};

/** Lo que sale al cable, ya sellado por el motor en el momento de emitir. */
export type LineaTrafico = PeticionTrafico & {
  id: string;
  at: number;
  hora: string;     // HH:MM:SS formateada en el servidor: el reloj del
                    // proyector y el del portátil deben decir lo mismo
};

// ---------- Payloads ----------

export type MemberView = {
  id: string;
  displayName: string;
  role: Role;
  connected: boolean;
};

export type LobbyPhaseView = {
  phaseId: string;
  key: string;
  order: number;
  title: string;
  /** La que cierra el evento: en el robot del lobby es la cabeza. */
  esFinal: boolean;
  /** Fuera del recorrido: en el robot es el corazón. */
  esBonus: boolean;
  description: string | null;
  teaser: string | null;
  phaseStatus: string;
  teamStatus: string;
  canEnter: boolean;
  lockReason: 'ADMIN' | 'PREREQUISITE' | 'COMPLETED' | null;
  blockedByPhaseId: string | null;
  blockedByTitle: string | null;
  isFocus: boolean;
  attempts: number;
  elapsedMs: number | null;
  timeToSolveMs: number | null;
  activeMs: number | null;
  blockedMs: number | null;
  solvedAt: Date | string | null;
};

/** Contenido de la fase ya proyectado para un rol concreto. */
export type PhaseWorkspace = {
  phaseId: string;
  key: string;
  title: string;
  role: Role;
  payload: unknown; // distinto para DATOS / TERMINAL / PANTALLA
};

/**
 * El menú de ataques, tal como lo pinta el jugador.
 *
 * El enfriamiento y el último objetivo son del EQUIPO, no de la
 * persona: los tres puestos comparten un ataque cada minuto. Es la
 * misma regla que gobierna el resto del juego —nadie resuelve una fase
 * solo— aplicada a lo único que aquí se le puede hacer a un rival.
 */
/** La primera vez que alguien supera una fase. */
export type PrimeraVez = {
  /** El id de la fila de la bitácora: el mismo en todas las pantallas. */
  id: string;
  phaseId: string; order: number; esFinal: boolean; esBonus: boolean;
  teamId: string; teamName: string;
  /** Versión del logo del equipo (ver `PlayerSnapshot.team.logoAt`). */
  logoAt: number | null;
  /** Las fases que ya tenían primer ganador antes de esta: lo que ya
   *  está roto en el robot cuando empieza la animación. */
  previas: string[];
};

/** Un ataque reciente: lo que dibuja una línea de mesa a mesa en el
 *  mapa. Los ataques son públicos a propósito: ver quién va a por quién
 *  es lo que hace que la sala se vigile. */
export type AtaqueReciente = {
  id: string;
  /** Equipo que atacó y equipo atacado. */
  de: string; a: string;
  /** Cuándo (ms del servidor). */
  at: number;
  /** Súper ataque: se pinta distinto, porque atraviesa escudos. */
  super?: boolean;
  /** Rebotó en un escudo. También es público: la sala ve el golpe y
   *  ve que no entró. */
  bloqueado?: boolean;
};

/** Un ingreso o gasto de tickets. Solo a la room del equipo: el saldo
 *  es privado. */
export type MovimientoTickets = {
  /** Lo que queda después del movimiento. */
  saldo: number;
  /** Positivo si entra, negativo si sale. */
  delta: number;
  /** «Fase 2 · 1.er lugar», «Escudo», «Ajuste del panel»… */
  motivo: string;
};

export type AtaqueView = {
  /** ms que faltan para poder atacar, sellados al emitir. 0 = ya. */
  esperaMs: number;
  /** A quién NO se puede atacar ahora: fue el último. */
  ultimoObjetivoId: string | null;
  /** Los demás equipos, para el desplegable. `intensidad` es el
   *  multiplicador que tendría AHORA un ataque normal contra él, según
   *  la distancia en fases: se calcula en el servidor para que el número
   *  que se enseña sea el que se aplica. */
  objetivos: { id: string; name: string; logoAt: number | null; intensidad: number }[];
  /** ms de escudo que le quedan al equipo. 0 = sin escudo. */
  escudoMs: number;
  /** ms que faltan para poder lanzar otro súper ataque. 0 = ya. */
  superEsperaMs: number;
  /** El plano del auditorio: el ataque se elige sobre el mapa. */
  plano: Plano;
  /** Los ataques del último minuto, de todos contra todos. */
  recientes: AtaqueReciente[];
};

export type PlayerSnapshot = {
  kind: 'PLAYER';
  serverTime: number; // sincronía de reloj: el cliente calcula su offset
  me: { id: string; displayName: string; role: Role; teamId: string };
  team: {
    id: string; name: string; score: number; members: MemberView[];
    /** El saldo de tickets. Solo lo ven el equipo y el panel. */
    tickets: number;
    /** Fecha del logo en ms, o `null` si no tiene. NO son los bytes: el
     *  logo se pide aparte por HTTP y esto es solo su versión, para que
     *  el navegador no se quede enseñando el anterior. */
    logoAt: number | null;
  };
  event: { status: EventStatus; focusPhaseId: string | null; paused: boolean; libreAcceso: boolean };
  lobby: LobbyPhaseView[];
  workspace: PhaseWorkspace | null; // null = está en el lobby
  ataque: AtaqueView;
  /** El minijuego en curso, si el panel lanzó uno. */
  minijuego: MinijuegoView | null;
  /** Sus marcas personales en los minijuegos (la ficha del lobby). */
  misMarcas: MarcaMinijuego[];
  /** La avería que sufre ahora, con lo que le queda: al recargar la
   *  página se retoma donde estaba, no desaparece. */
  averia: { tipo: TipoAveria; restanteMs: number; de?: string } | null;
  /** El mejor de toda la sala en cada minijuego de la sala de espera. */
  recordsSala: RecordSala[];
};

/**
 * El plano de la sala: el auditorio con sus mesas, y en cada mesa el
 * equipo que se sienta en ella.
 *
 * Todo en METROS y con el origen arriba a la izquierda: así el editor
 * puede encajar la sala real con una cinta métrica, y la vista del
 * proyector la escala a lo que mida la pantalla. Cada elemento se
 * describe por su CENTRO, su tamaño y su giro, que es lo que hace que
 * girar una mesa no la desplace.
 */
export const TIPOS_PLANO = ['mesa', 'escenario', 'pantalla', 'puerta', 'pared', 'zona', 'columna', 'texto'] as const;
export type TipoPlano = (typeof TIPOS_PLANO)[number];

export type ElementoPlano = {
  id: string;
  tipo: TipoPlano;
  /** Centro, en metros. */
  x: number; y: number;
  /** Ancho y fondo, en metros. */
  w: number; h: number;
  /** Giro en grados, en el sentido de las agujas del reloj. */
  rot: number;
  /** Solo las mesas: si es redonda en vez de rectangular. */
  redonda?: boolean;
  /** Solo las mesas: quién se sienta. Null = libre. */
  teamId?: string | null;
  /** El rótulo: el número de mesa, el nombre de la zona, el texto… */
  etiqueta?: string;
};

export type Plano = {
  nombre: string;
  /** El rectángulo de la sala, en metros. */
  ancho: number; alto: number;
  elementos: ElementoPlano[];
  /** Cuándo se guardó por última vez (ms), o null si nunca. */
  guardadoAt: number | null;
};

export type AdminSnapshot = {
  kind: 'ADMIN';
  serverTime: number;
  me: { id: string; displayName: string };
  event: {
    status: EventStatus; focusPhaseId: string | null; paused: boolean;
    shuffleCount: number; libreAcceso: boolean;
    /** Espera entre ataques de un mismo equipo, en ms. */
    enfriamientoAtaqueMs: number;
  };
  /** La final del recorrido, si hay una fase marcada como tal. */
  final: FinalView | null;
  /** El plano del auditorio, con las mesas de cada equipo. */
  plano: Plano;
  /** Los ataques del último minuto, para las líneas del mapa. */
  ataques: AtaqueReciente[];
  minijuego: MinijuegoTablero | null;
  phases: {
    id: string; key: string; order: number; title: string;
    /** La que cierra el evento: la del cohete y la cuenta atrás. */
    esFinal: boolean;
    /** Fuera del recorrido: no cuenta para la meta de la carrera. */
    esBonus: boolean;
    /** Solo la final lo trae: lo que la sala tiene para resolverla. */
    limiteMs: number | null;
    /** Frase de cartel. Viaja al panel porque la proyeccion de sala la
     *  rotula bajo la escena, y escribirla otra vez en el cliente seria
     *  tener el mismo texto en dos sitios que nadie sincroniza. */
    teaser: string | null;
    status: string; openedAt: Date | string | null; closedAt: Date | string | null;
  }[];
  teams: {
    id: string; name: string; score: number;
    /** Saldo de tickets. Viaja en el snapshot del panel, pero la
     *  proyección de sala NO lo pinta: es privado de cada equipo. */
    tickets: number;
    /** ms de escudo que le quedan, sellados al emitir. */
    escudoMs: number;
    /** Versión del logo en ms (ver `PlayerSnapshot.team.logoAt`). */
    logoAt: number | null;
    /** Señales para que la organización se acerque a la mesa: intentos
     *  de pegar en la consola, comandos más rápidos de lo que se teclea y
     *  fases resueltas en muy poco tiempo. Solo las ve el panel. */
    alertas: { pegados: number; rafagas: number; rapidas: string[] };
    members: MemberView[];
    progress: {
      phaseId: string; status: string; timeToSolveMs: number | null; attempts: number;
      /** Cronómetro vivo de la fase sin resolver, sellado al emitir. El
       *  cliente le suma lo que ha pasado desde entonces, igual que el
       *  lobby: así la carrera avanza entre empujón y empujón. */
      elapsedMs: number | null;
    }[];
  }[];
};

/**
 * La final, tal como la pinta la proyección de sala.
 *
 * Se calcula ENTERA en el servidor y no se guarda en ninguna parte: sale
 * de cuándo se abrió la fase, de su límite y de si alguien la resolvió.
 * Un estado guardado aparte habría que mantenerlo en sincronía con esos
 * tres hechos, y acabaría contradiciéndolos justo en el peor momento.
 */
export type FinalView = {
  phaseId: string;
  title: string;
  limiteMs: number;
  /** ESPERA = aún sin abrir · CUENTA = corriendo · luego el desenlace. */
  estado: 'ESPERA' | 'CUENTA' | 'VICTORIA' | 'DERROTA';
  /** Sellado al emitir; el cliente le resta lo transcurrido desde
   *  entonces, igual que el lobby. Puede ser negativo: la cuenta ya pasó. */
  restanteMs: number | null;
  /** Quién abortó el lanzamiento, si alguien llegó a tiempo. */
  ganador: string | null;
  /** Instante del desenlace en reloj de SERVIDOR. Sirve para que una
   *  ventana que se abre diez minutos tarde no repita la explosión. */
  desenlaceAt: number | null;
};

// ---------- Las luces de la sala ----------
//
// El actuador vive en la carpeta `Luces/` y es el que guarda las ondas.
// Lo que viaja hasta el panel es lo justo para pintar la pestaña: un
// nombre por botón —las ondas son cientos de números y nadie las mira—,
// las reglas del automatismo y la última bitácora.

/** Una luz que saltó, o que falló al saltar. */
export type LineaLuz = {
  at: number;
  evento: string;
  boton: string;
  pines: number[];
  ok: boolean;
  detalle: string;
};

export type BotonLuzView = {
  id: string;
  nombre: string;
  pines: number[];
  freq: number;
  repeticiones: number;
  gap_ms: number;
  /** Cuántos pulsos tiene la onda. El contenido no viaja. */
  pulsos: number;
};

/** «Cuando pase ESTO, manda ESTE código por ESTOS pines». */
export type ReglaLuzView = {
  id: string;
  evento: string;
  /** null = la dispara cualquier equipo. */
  teamId: string | null;
  equipo: string | null;
  botonId: string;
  botonNombre: string;
  /** Vacío = los pines que diga el propio botón. */
  pines: number[];
  activa: boolean;
};

export type EventoLuzView = { clave: string; rotulo: string; porEquipo: boolean };

export type PanelLucesView = {
  url: string;
  estado: {
    conectado: boolean;
    puerto?: string;
    version?: string;
    motivo?: string;
    puertos?: string[];
  };
  config: { pines: number[]; pines_validos: number[] };
  botones: BotonLuzView[];
  eventos: EventoLuzView[];
  reglas: ReglaLuzView[];
  bitacora: LineaLuz[];
};

// ---------- Minijuegos ----------
//
// El panel lanza uno y les cae encima a todos los jugadores a la vez,
// por encima de lo que estuvieran haciendo (sin sacarlos de su fase).
// Vive en memoria del servidor: es un recreo, no parte de la partida,
// y no toca ni puntos de equipo ni cronómetros.

export const MINIJUEGOS = ['snake', 'plaga', 'sinapsis', 'latido'] as const;
export type MinijuegoClave = (typeof MINIJUEGOS)[number];

export type PuntajeMinijuego = {
  userId: string;
  nombre: string;
  equipo: string;
  /** El mejor intento de la persona en esta ronda. */
  puntos: number;
};

/** Las marcas personales de una persona en un minijuego, entre rondas.
 *  Solo las ve ella: es su desglose, no un ranking. */
export type MarcaMinijuego = {
  clave: MinijuegoClave;
  /** El mejor puntaje de todas las rondas. */
  mejor: number;
  /** Intentos terminados, en todas las rondas. */
  intentos: number;
  /** El último intento. */
  ultimo: number;
  /** Rondas distintas en las que jugó. */
  rondas: number;
  ultimoAt: number;
};

/** Lo que ve un jugador: qué se juega y en qué ronda. El ranking NO
 *  viaja a los jugadores: se canta en la proyección de sala, y en cada
 *  portátil solo está el puntaje propio. */
/** El récord de la sala en un minijuego jugado en la sala de espera. */
export type RecordSala = { clave: MinijuegoClave; puntos: number; nombre: string; equipo: string };

/** La ronda de la sala de espera de un juego: siempre abierta, una por
 *  juego. La juega el equipo que ya superó lo abierto mientras espera
 *  la siguiente fase; no tiene nada que ver con el recreo del panel. */
export const rondaLibre = (clave: MinijuegoClave) => `libre:${clave}`;

export type MinijuegoView = {
  clave: MinijuegoClave;
  /** Identifica la ronda: un puntaje de una ronda anterior se descarta. */
  ronda: string;
  desde: number;
};

/** Lo que ven el panel y la proyección: lo mismo, más el tablero. */
export type MinijuegoTablero = MinijuegoView & {
  /** Los 10 mejores, ya ordenados. */
  ranking: PuntajeMinijuego[];
  /** Cuántas personas han terminado al menos un intento. */
  participantes: number;
};

// ---------- El robot del lobby ----------
//
// Cada fase es una parte del cuerpo del robot, y al superarla esa parte
// se destruye. El panel puede ENSAYAR la destrucción en los lobbies sin
// tocar ningún dato: es una animación, nada más.

export const PARTES_ROBOT = ['pierna-izq', 'pierna-der', 'brazo-izq', 'brazo-der', 'torso', 'cabeza', 'corazon'] as const;
export type ParteRobot = (typeof PARTES_ROBOT)[number];

export type Snapshot = PlayerSnapshot | AdminSnapshot;

export type SocketErrorCode =
  | 'NO_CODE'
  | 'INVALID_CODE'
  | 'NO_TEAM'
  | 'NOT_ALLOWED'
  | 'PHASE_LOCKED'
  | 'INTERNAL';

// ---------- Eventos ----------

export interface ServerToClientEvents {
  'session:snapshot': (s: Snapshot) => void;
  'session:error': (e: { code: SocketErrorCode; message: string }) => void;
  'presence:update': (p: { teamId: string; members: MemberView[] }) => void;
  'lobby:update': (p: { lobby: LobbyPhaseView[]; serverTime: number }) => void;
  'role:changed': (p: { role: Role; previousRole: Role | null }) => void;
  /** El panel cambió a esta persona de equipo. Sus manejadores llevan el
   *  equipo de la conexión, así que el cliente se reconecta para entrar
   *  limpio en el nuevo. */
  'session:reconectar': (p: { motivo: string }) => void;
  'workspace:update': (w: PhaseWorkspace | null) => void;
  'event:update': (p: {
    status: EventStatus; focusPhaseId: string | null; paused: boolean;
    /** true → cualquier fase abierta es accesible sin resolver la anterior. */
    libreAcceso: boolean;
  }) => void;
  /** Respuesta del sistema. Se emite SOLO a la room del rol PANTALLA. */
  'pantalla:output': (s: SalidaComando) => void;
  /** Una petición del ataque en curso. También SOLO a la room PANTALLA.
   *  Va suelta y no se persiste: es un monitor en vivo, no bitácora. */
  'pantalla:trafico': (l: LineaTrafico) => void;
  /** Arranque, parada, filtrado o interrupción del monitor, con su
   *  motivo. `filtro` viaja para que la barra diga qué se está dejando
   *  fuera: sin eso, un filtro que no casa con nada parece una avería. */
  'pantalla:trafico:estado': (p: {
    activo: boolean;
    nota: string;
    filtro?: FiltroTrafico | null;
  }) => void;
  /** Victoria. Va a la room del EQUIPO, no a la de un rol: la pantalla
   *  de fase completada la ven los tres a la vez, que para eso la
   *  ganaron juntos. */
  /** Averia provocada desde el panel. Dura lo que dure y no toca nada del
   *  juego: es ruido en la sala, no una penalizacion. */
  /** `de` lleva el nombre del equipo que lo mandó, si vino de un rival.
   *  Sin remite es del panel: no es lo mismo que te averíe el sistema
   *  que saber quién te lo ha hecho. */
  'player:averia': (p: { tipo: TipoAveria; duracionMs: number; de?: string }) => void;
  /** El letrero del robot: un consejo para el puesto de esa persona, en
   *  la fase y capa en que está su equipo. Lo manda el admin. */
  'player:consejo': (p: ConsejoRobot) => void;
  /** El saldo del equipo cambió. Solo a la room del equipo. */
  'tickets:movimiento': (m: MovimientoTickets) => void;
  /** Un ataque rebotó en el escudo del equipo. Solo a la room del equipo
   *  atacado: saber quién lo intentó es lo que hace que el escudo luzca. */
  'ataque:bloqueado': (p: { de: string }) => void;
  /** Un ataque acaba de salir. A TODOS, jugadores y panel: es lo que
   *  pinta la línea en el mapa de cada uno en el momento. */
  'ataque:lanzado': (a: AtaqueReciente) => void;
  /** Una luz que acaba de saltar. Solo a la room de admins: es para
   *  ver desde el panel si una regla se cumplió de verdad, sin tener
   *  que estar mirando la tira de LEDs. */
  'luces:bitacora': (l: LineaLuz) => void;
  /** Ensayo del desenlace de la final. Va SOLO a la room de admins: lo
   *  que hace es pintar un cohete en la pared, no cambiar la partida. */
  'final:ensayo': (p: { resultado: 'VICTORIA' | 'DERROTA' | null }) => void;
  /** Un equipo acaba de ser el PRIMERO en superar una fase. A todas las
   *  pantallas: cada una reproduce la destrucción de su parte del robot
   *  y termina con el logo y el nombre de ese equipo. */
  'fase:primera': (p: PrimeraVez) => void;
  /** Ensayo de esa misma animación. Con `todos`, a todas las pantallas;
   *  sin él, solo a la proyección. No toca la partida. Lleva los equipos
   *  de verdad para que el cartel final se ensaye con logos reales. */
  'destruccion:ensayo': (p: {
    parte: ParteRobot | 'todo'; id: string; todos: boolean;
    equipos: { id: string; name: string; logoAt: number | null }[];
  }) => void;
  /** Ensayo de la destrucción del robot. `todo` = la secuencia entera.
   *  `id` distingue dos ensayos seguidos de la misma parte. */
  'anatomia:ensayo': (p: { parte: ParteRobot | 'todo'; id: string }) => void;
  /** Sus marcas personales al día, tras cada intento. Solo a su room. */
  'minijuego:mis-marcas': (m: MarcaMinijuego[]) => void;
  /** Alguien batió el récord de la sala en un juego de la sala de espera. */
  'minijuego:records': (r: RecordSala[]) => void;
  /** Arranque o fin del minijuego. A los jugadores, sin ranking. */
  'minijuego:update': (m: MinijuegoView | null) => void;
  /** Arranque, fin o puntaje nuevo, con el tablero. SOLO a la room de
   *  admins: el panel y la proyección de sala. */
  'minijuego:tablero': (m: MinijuegoTablero | null) => void;
  'phase:solved': (p: {
    phaseId: string; title: string;
    timeToSolveMs: number | null; activeMs: number | null; attempts: number;
    /** true → ensayo lanzado desde el panel. Nada se ha guardado, y al
     *  cerrarla el equipo NO sale de la fase en la que estuviera. */
    ensayo?: boolean;
    /** Los tickets que les dio superarla, y en qué puesto llegaron. */
    tickets?: { ganados: number; lugar: number };
  }) => void;
}

/** Lo que lleva el letrero del robot. Sin fase: el equipo está en el lobby. */
export type ConsejoRobot = {
  id: string; fase: string | null; capa: number | null; nombreCapa: string | null;
  rol: Role; texto: string;
};

export type Ack<T = unknown> = (r: { ok: boolean; error?: string; data?: T }) => void;

export interface ClientToServerEvents {
  // --- Panel de administración (rechazados si el socket no es admin) ---
  'admin:phase:open': (p: { phaseId: string }, ack: Ack) => void;
  'admin:phase:close': (p: { phaseId: string }, ack: Ack) => void;
  'admin:phase:focus': (p: { phaseId: string | null }, ack: Ack) => void;
  'admin:event:status': (p: { status: EventStatus }, ack: Ack) => void;
  /** Borra el progreso y devuelve el evento a su estado inicial. */
  'admin:event:reset': (p: unknown, ack: Ack<{ equipos: number }>) => void;
  /** Le provoca una averia a UNA persona, la que le toque por su rol. */
  'admin:jugador:averia': (p: { userId: string }, ack: Ack<{ tipo: Role }>) => void;
  // --- Luces ---
  /** Todo lo que necesita la pestaña de una vez: estado de la placa,
   *  pines, botones guardados, reglas y bitácora. */
  'admin:luces:panel': (p: unknown, ack: Ack<PanelLucesView>) => void;
  /** Emitir a mano: un botón guardado, o una onda cruda sin guardar. */
  'admin:luces:enviar': (
    p: {
      botonId?: string;
      pulsos?: number[] | string;
      pines?: number[];
      freq?: number;
      repeticiones?: number;
      gap_ms?: number;
    },
    ack: Ack,
  ) => void;
  /** Los diagnósticos de la placa, agrupados: todos son «pincha el
   *  aparato y cuenta qué contestó». */
  'admin:luces:prueba': (
    p: { op: 'probar' | 'identificar' | 'nivel' | 'capturar'; pines?: number[]; ms?: number; timeoutMs?: number },
    ack: Ack,
  ) => void;
  /** Los pines de emisión por defecto. */
  'admin:luces:config': (p: { pines: number[] }, ack: Ack) => void;
  /** Alta, edición y baja de botones en el almacén de Luces. */
  'admin:luces:boton': (
    p: { op: 'crear' | 'editar' | 'borrar'; id?: string; datos?: unknown },
    ack: Ack,
  ) => void;
  /** Las reglas del automatismo, que viven en ESTA base de datos. */
  'admin:luces:regla': (
    p: {
      op: 'crear' | 'borrar' | 'alternar' | 'probar';
      id?: string;
      evento?: string;
      teamId?: string | null;
      botonId?: string;
      pines?: number[];
    },
    ack: Ack,
  ) => void;

  /** Minutos que la sala tiene para abortar el lanzamiento. */
  'admin:final:limite': (p: { minutos: number }, ack: Ack<{ limiteMs: number }>) => void;
  /** Ensaya la destrucción de una parte del robot, o de todas en orden:
   *  en la proyección, o con `todos` en todas las pantallas. */
  'admin:destruccion:ensayo': (p: { parte: ParteRobot | 'todo'; todos?: boolean }, ack: Ack<{ parte: ParteRobot | 'todo' }>) => void;
  /** La espera entre ataques de un equipo, en segundos (5 s – 30 min). */
  'admin:ataque:enfriamiento': (p: { segundos: number }, ack: Ack<{ enfriamientoAtaqueMs: number }>) => void;
  /** Ensayo del desenlace de la final, para verlo en la pared antes de
   *  que pase de verdad. No toca el juego: es una proyección, nada más. */
  'admin:final:ensayo': (
    p: { resultado: 'VICTORIA' | 'DERROTA' | null },
    ack: Ack<{ resultado: string | null }>,
  ) => void;
  /** Ensaya en los lobbies la destrucción de una parte del robot (o de
   *  todo). Sin equipos, a todos. No cambia nada de la partida. */
  'admin:anatomia:ensayo': (
    p: { parte: ParteRobot | 'todo'; teamIds?: string[] },
    ack: Ack<{ equipos: number }>,
  ) => void;
  /** Lanza un minijuego a todos los jugadores, o lo termina con `null`. */
  /** Al cerrar una ronda (terminarla o lanzar otra), se reparten sus
   *  tickets: `premiados` dice a cuántos equipos. */
  'admin:minijuego': (p: { clave: MinijuegoClave | null }, ack: Ack<{ ronda: string | null; premiados: number }>) => void;
  /** Suma o resta tickets a mano a un equipo (premios de la sala,
   *  correcciones). Nunca deja el saldo por debajo de cero. */
  'admin:equipo:tickets': (p: { teamId: string; delta: number }, ack: Ack<{ saldo: number }>) => void;
  /** Fin de un intento. Solo cuenta el mejor de cada persona por ronda. */
  'minijuego:puntaje': (p: { ronda: string; puntos: number }, ack: Ack<{ mejor: number }>) => void;
  /** Enciende o apaga el acceso libre a las fases abiertas. */
  'admin:event:acceso': (p: { libre: boolean }, ack: Ack) => void;
  /** El letrero del robot con un consejo. Sin equipos, va a todos. */
  'admin:consejo': (p: { teamIds?: string[] }, ack: Ack<{ equipos: number }>) => void;
  /** Vista previa del letrero en el panel: no se manda a nadie. */
  'admin:consejo:ver': (
    p: { faseKey: string | null; capa: number | null; rol: Role },
    ack: Ack<ConsejoRobot & { capas: number }>,
  ) => void;
  /** Ensayo de la pantalla de victoria. Sin equipos, va a todos. */
  'admin:phase:celebrar': (
    p: { teamIds?: string[] },
    ack: Ack<{ equipos: number }>,
  ) => void;
  /** Renombra un equipo. Los códigos de acceso NO cambian: se reparten
   *  impresos antes de empezar, y cambiarlos a media tarde dejaría fuera
   *  a quien ya tiene el suyo en la mano. */
  /** Cambia a una persona de equipo. Si se lleva la TERMINAL, el equipo
   *  que deja la recibe en otra persona; en el nuevo solo la toma si allí
   *  no la tiene nadie. */
  'admin:jugador:equipo': (
    p: { userId: string; teamId: string },
    ack: Ack<{ equipo: string; rol: Role }>,
  ) => void;
  'admin:equipo:nombre': (
    p: { teamId: string; nombre: string },
    ack: Ack<{ nombre: string }>,
  ) => void;
  /** Sube el logo de un equipo, o lo retira con `datos: null`. Los bytes
   *  viajan por el propio socket: ya está autenticado como admin, y un
   *  endpoint de subida aparte habría que protegerlo por segunda vez. */
  'admin:equipo:logo': (
    p: { teamId: string; datos: ArrayBuffer | null },
    ack: Ack<{ logoAt: number | null; mime: string | null; bytes: number }>,
  ) => void;
  /** Guarda el plano entero. Es un documento pequeño y lo edita una sola
   *  persona: mandarlo completo es más simple y más robusto que parchear
   *  elemento a elemento. */
  'admin:plano:guardar': (
    p: { plano: Omit<Plano, 'guardadoAt'> },
    ack: Ack<{ guardadoAt: number }>,
  ) => void;
  /** Pone un rol a mano. Dar la TERMINAL la intercambia con quien la
   *  tenía; quitársela a quien la tiene sin dársela a otro se rechaza. */
  'admin:jugador:rol': (
    p: { userId: string; rol: Role },
    ack: Ack<{ moves: { userId: string; from: Role; to: Role }[] }>,
  ) => void;
  'admin:roles:shuffle': (
    p: { teamIds?: string[] },
    ack: Ack<{ equipos: number; cambios: number; omitidos: string[] }>,
  ) => void;

  /** Ataque a otro equipo. Lo puede lanzar cualquiera de los tres
   *  puestos; el enfriamiento y el «no repetir objetivo» son del equipo. */
  'player:ataque': (
    p: { teamId: string },
    ack: Ack<{ esperaMs: number; objetivo: string; intensidad: number; bloqueado: boolean }>,
  ) => void;
  /** Compra un escudo para el equipo. Cualquiera de los puestos. */
  'player:escudo': (p: unknown, ack: Ack<{ escudoMs: number; saldo: number }>) => void;
  /** Súper ataque: inmoviliza a todo el equipo rival y atraviesa su
   *  escudo. Tiene su propia espera, aparte de la del ataque normal. */
  'player:super': (p: { teamId: string }, ack: Ack<{ objetivo: string; saldo: number }>) => void;

  'session:resync': (p: unknown, ack: (s: Snapshot | null) => void) => void;
  'phase:enter': (p: { phaseId: string }, ack: (r: { ok: boolean; error?: string }) => void) => void;
  'phase:leave': (p: unknown, ack: (r: { ok: boolean }) => void) => void;
  /** Comando del Operador de Terminal. El acuse NO lleva la respuesta:
   *  solo confirma la entrega. Lo que respondió el sistema va a Pantalla. */
  'terminal:command': (p: { texto: string }, ack: Ack<{ aceptado: boolean; valido?: boolean }>) => void;
  /** La consola no admite pegar: el intento se cuenta para el panel. */
  'terminal:pegado': () => void;
}

/** Datos que el middleware de autenticación cuelga del socket. */
export interface SocketData {
  userId: string;
  teamId: string | null;
  role: Role;
  isAdmin: boolean;
  displayName: string;
}
