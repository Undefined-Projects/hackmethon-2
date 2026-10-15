// ============================================================
//  Servidor de tiempo real.
//
//  Autenticación ligera: el código personal viaja en el handshake, no
//  en un evento posterior. Un socket sin credencial válida se rechaza
//  ANTES de existir, así nunca hay una conexión anónima capaz de
//  escuchar en una room.
// ============================================================

import { Server, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { prisma } from '../lib/prisma.js';
import { corsOrigin } from '../lib/cors.js';
import { buildLobbyFor, buildSnapshotFor, projectPhaseForRole } from '../lib/snapshot.js';
import type {
  ClientToServerEvents, MemberView, ServerToClientEvents, SocketData,
} from '../lib/events.js';
import type { Role } from '../lib/constants.js';
import { ADMIN_ROOM, roleRoom, teamRoom, userRoom } from './rooms.js';
import { addSocket, removeSocket, scheduleOffline } from './presence.js';
import {
  activarFase, ajustarLimiteFinal, cambiarAccesoLibre, cambiarEstadoEvento, cerrarFase,
  destacarFase, ensayarCelebracion, ensayarFinal, guardarLogoEquipo, mezclarRoles,
  provocarAveria, reiniciarJuego, renombrarEquipo, ensayarAnatomia,
  guardarPlano, ajustarEnfriamientoAtaque, ensayarDestruccion, asignarRol,
} from './admin.js';
import { ErrorComando, procesarComando } from './commands.js';
import { atacarEquipo } from './ataques.js';
import {
  alternarRegla, borrarRegla, botonDeLuces, crearRegla, enviarALaPlaca,
  guardarPines, panelDeLuces, probarRegla, pruebaDeLaPlaca,
} from './luces.js';
import { detenerFlujo } from './trafico.js';
import { lanzarMinijuego, registrarPuntaje } from './minijuegos.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

let io: IO;
export const getIO = (): IO => io;

export function attachRealtime(httpServer: HttpServer): IO {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin(), credentials: true },
    // Margen amplio: en una sala con wifi saturado, cortar a los 20s
    // provoca falsas caídas justo cuando más se nota.
    pingTimeout: 25_000,
    pingInterval: 10_000,
    // Por aquí viaja el logo de un equipo. El tope de serie es 1 MB, y
    // pasarse no da un error: cierra el socket. El panel solo vería
    // «sin conexión» justo al subir un PNG grande, que es el peor sitio
    // posible para dejar un misterio.
    maxHttpBufferSize: 2e6,
  });

  // ---------- Autenticación ----------
  io.use(async (socket, next) => {
    const code = String(socket.handshake.auth?.code ?? '').trim().toUpperCase();
    if (!code) return next(new Error('NO_CODE'));

    const user = await prisma.user.findUnique({ where: { accessCode: code } });
    if (!user) return next(new Error('INVALID_CODE'));
    if (!user.isAdmin && !user.teamId) return next(new Error('NO_TEAM'));

    socket.data = {
      userId: user.id,
      teamId: user.teamId,
      role: user.role as Role,
      isAdmin: user.isAdmin,
      displayName: user.displayName,
    };
    next();
  });

  io.on('connection', (socket) => onConnection(socket));
  return io;
}

async function onConnection(socket: AppSocket) {
  const { userId, teamId, role, isAdmin, displayName } = socket.data;

  // ---------- Rooms ----------
  // user:  todas las pestañas de la persona (destino de cambios de rol)
  // team:  todo el equipo (lobby, fases, presencia)
  // role:  destino de los envíos dirigidos (Paso 5)
  socket.join(userRoom(userId));
  if (isAdmin) socket.join(ADMIN_ROOM);
  if (teamId) {
    socket.join(teamRoom(teamId));
    socket.join(roleRoom(teamId, role));
  }

  // ============================================================
  //  Los manejadores se registran ANTES de cualquier await.
  //
  //  Socket.io no encola los eventos que llegan sin manejador: los
  //  descarta en silencio. Si registráramos después de consultar la base
  //  de datos, un cliente que actúa nada más recibir su snapshot —o
  //  simplemente alguien rápido con el ratón— vería su evento
  //  desaparecer sin error ni acuse. Es una carrera que solo se
  //  manifiesta con la sala llena, que es justo cuando no puedes
  //  depurarla. Todos leen su estado de la base de datos, así que
  //  registrarlos ya es seguro aunque el alta aún no haya terminado.
  // ============================================================

  socket.on('session:resync', async (_p, ack) => {
    ack(await buildSnapshotFor(userId, isAdmin));
  });

  socket.on('phase:enter', async ({ phaseId }, ack) => {
    if (!teamId) return ack({ ok: false, error: 'NO_TEAM' });
    try {
      await enterPhase(teamId, phaseId, userId);
      ack({ ok: true });
    } catch (e) {
      console.error('[phase:enter]', e);
      ack({ ok: false, error: e instanceof Error ? e.message : 'INTERNAL' });
    }
  });

  // Comando del Operador de Terminal. El acuse confirma la ENTREGA;
  // la respuesta del sistema viaja solo a la room PANTALLA.
  socket.on('terminal:command', async ({ texto }, ack) => {
    if (!teamId) return ack({ ok: false, error: 'NO_TEAM' });
    try {
      // El rol se lee de la BD, no de socket.data: una mezcla de roles
      // pudo cambiarlo después de abrirse esta conexión.
      const actual = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const data = await procesarComando(
        { userId, teamId, role: actual.role as Role },
        texto,
      );
      ack({ ok: true, data });
    } catch (e) {
      ack({
        ok: false,
        error: e instanceof ErrorComando ? e.message : 'INTERNAL',
      });
    }
  });

  // Ataque a otro equipo. Lo puede lanzar cualquiera de los tres
  // puestos: el enfriamiento y el «no repetir» son del equipo, y se
  // comprueban en el servidor, no en el desplegable.
  socket.on('player:ataque', async ({ teamId: objetivo }, ack) => {
    if (!teamId) return ack({ ok: false, error: 'NO_TEAM' });
    try {
      ack({ ok: true, data: await atacarEquipo(userId, objetivo) });
    } catch (e) {
      ack({ ok: false, error: e instanceof Error ? e.message : 'INTERNAL' });
    }
  });

  // Fin de un intento del minijuego. Lo manda el propio jugador; el
  // servidor solo guarda el mejor y rechaza rondas viejas.
  socket.on('minijuego:puntaje', async ({ ronda, puntos }, ack) => {
    if (!teamId) return ack({ ok: false, error: 'NO_TEAM' });
    try {
      ack({ ok: true, data: await registrarPuntaje(userId, ronda, puntos) });
    } catch (e) {
      ack({ ok: false, error: e instanceof Error ? e.message : 'INTERNAL' });
    }
  });

  socket.on('phase:leave', async (_p, ack) => {
    if (!teamId) return ack({ ok: false });
    // Salir NO detiene el cronómetro: el reloj oficial corre desde que el
    // admin abrió la fase. Volver al lobby es solo navegación.
    await prisma.teamPhaseProgress.updateMany({
      where: { teamId, status: 'IN_PROGRESS' },
      data: { status: 'PENDING' },
    });
    // Nadie mirando la Pantalla, nadie a quien mandarle el ataque.
    detenerFlujo(teamId, 'El equipo salió de la fase.');
    io.to(teamRoom(teamId)).emit('workspace:update', null);
    await pushLobby(teamId);
    ack({ ok: true });
  });

  // ---------- Panel de administración ----------
  // El guardia va en el servidor, no en el front: un jugador con la
  // consola del navegador abierta puede emitir cualquier evento.
  const soloAdmin =
    <P>(fn: (p: P) => Promise<unknown>) =>
    async (p: P, ack: (r: { ok: boolean; error?: string; data?: any }) => void) => {
      if (!isAdmin) return ack({ ok: false, error: 'NOT_ALLOWED' });
      try {
        ack({ ok: true, data: await fn(p) });
      } catch (e) {
        ack({ ok: false, error: e instanceof Error ? e.message : 'INTERNAL' });
      }
    };

  socket.on('admin:phase:open', soloAdmin(({ phaseId }) => activarFase(phaseId, userId)));
  socket.on('admin:phase:close', soloAdmin(({ phaseId }) => cerrarFase(phaseId, userId)));
  socket.on('admin:phase:focus', soloAdmin(({ phaseId }) => destacarFase(phaseId, userId)));
  socket.on('admin:event:status', soloAdmin(({ status }) => cambiarEstadoEvento(status, userId)));
  socket.on('admin:jugador:rol', soloAdmin(({ userId: u, rol }) => asignarRol(u, rol, userId)));
  socket.on('admin:roles:shuffle', soloAdmin(({ teamIds }) => mezclarRoles(userId, teamIds)));
  // --- Luces ---
  socket.on('admin:luces:panel', soloAdmin(() => panelDeLuces()));
  socket.on('admin:luces:enviar', soloAdmin((p) => enviarALaPlaca(p)));
  socket.on('admin:luces:prueba', soloAdmin((p) => pruebaDeLaPlaca(p)));
  socket.on('admin:luces:config', soloAdmin(({ pines }) => guardarPines(pines)));
  socket.on('admin:luces:boton', soloAdmin((p) => botonDeLuces(p)));
  socket.on('admin:luces:regla', soloAdmin(async (p) => {
    if (p.op === 'crear') return crearRegla(p);
    if (!p.id) throw new Error('FALTA_ID');
    if (p.op === 'borrar') return borrarRegla(p.id);
    if (p.op === 'alternar') return alternarRegla(p.id);
    if (p.op === 'probar') return probarRegla(p.id);
    throw new Error('OPERACION_DESCONOCIDA');
  }));

  socket.on('admin:final:limite', soloAdmin(({ minutos }) => ajustarLimiteFinal(minutos, userId)));
  socket.on('admin:final:ensayo', soloAdmin(({ resultado }) => ensayarFinal(resultado, userId)));
  socket.on('admin:equipo:nombre', soloAdmin(({ teamId, nombre }) => renombrarEquipo(teamId, nombre, userId)));
  socket.on('admin:destruccion:ensayo', soloAdmin(({ parte, todos }) => ensayarDestruccion(parte, todos)));
  socket.on('admin:ataque:enfriamiento', soloAdmin(({ segundos }) => ajustarEnfriamientoAtaque(segundos, userId)));
  socket.on('admin:plano:guardar', soloAdmin(({ plano }) => guardarPlano(plano, userId)));
  socket.on('admin:equipo:logo', soloAdmin(({ teamId, datos }) => guardarLogoEquipo(teamId, datos, userId)));
  socket.on('admin:event:reset', soloAdmin(() => reiniciarJuego(userId)));
  socket.on('admin:phase:celebrar', soloAdmin(({ teamIds }) => ensayarCelebracion(userId, teamIds)));
  socket.on('admin:event:acceso', soloAdmin(({ libre }) => cambiarAccesoLibre(Boolean(libre), userId)));
  socket.on('admin:anatomia:ensayo', soloAdmin(({ parte, teamIds }) => ensayarAnatomia(parte, userId, teamIds)));
  socket.on('admin:minijuego', soloAdmin(({ clave }) => lanzarMinijuego(clave, userId)));
  socket.on('admin:jugador:averia', soloAdmin(({ userId: a }) => provocarAveria(a, userId)));

  // ---------- Desconexión ----------
  socket.on('disconnect', async (reason) => {
    const remaining = removeSocket(userId, socket.id);
    if (remaining > 0) return; // le quedan otras pestañas abiertas

    // Margen de gracia: una recarga no debe anunciarse como caída.
    scheduleOffline(userId, async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { connected: false, socketId: null, lastSeenAt: new Date() },
      });
      if (teamId) {
        await broadcastPresence(teamId);
        await prisma.eventLog.create({
          data: {
            type: 'DISCONNECT',
            message: `${displayName} se desconectó (${reason})`,
            teamId, userId,
          },
        });
      }
    });
  });

  // ---------- Alta (ya con todos los manejadores puestos) ----------
  const { firstConnection } = addSocket(userId, socket.id);
  await prisma.user.update({
    where: { id: userId },
    data: { connected: true, socketId: socket.id, lastSeenAt: new Date() },
  });

  // El snapshot se reconstruye desde la BD: da igual si es la primera
  // conexión o la quinta reconexión, el estado devuelto es el exacto.
  const snapshot = await buildSnapshotFor(userId, isAdmin);
  if (!snapshot) {
    socket.emit('session:error', { code: 'INTERNAL', message: 'No se pudo construir el estado' });
    return socket.disconnect(true);
  }
  socket.emit('session:snapshot', snapshot);

  if (teamId) {
    // La presencia se difunde SIEMPRE, no solo en la primera conexion.
    // Atada a `firstConnection`, bastaba con que quedara un socket
    // rezagado —una pestaña recien cerrada, un F5 dentro del margen de
    // gracia— para que el panel no se enterara nunca de que esa persona
    // habia vuelto: la base de datos decia conectado y el panel seguia
    // pintandolo caido, con sus botones apagados.
    await broadcastPresence(teamId);

    // La bitacora si: una linea por pestaña abierta seria ruido.
    if (firstConnection) {
      await prisma.eventLog.create({
        data: { type: 'JOIN', message: `${displayName} conectó`, teamId, userId },
      });
    }
  }
}

// ============================================================
//  Emisores reutilizables (los usará el Paso 3)
// ============================================================

/** Presencia del equipo → al propio equipo y al panel del admin. */
export async function broadcastPresence(teamId: string) {
  const members = (await prisma.user.findMany({
    where: { teamId },
    orderBy: { displayName: 'asc' },
    select: { id: true, displayName: true, role: true, connected: true },
  })) as MemberView[];

  io.to(teamRoom(teamId)).emit('presence:update', { teamId, members });
  io.to(ADMIN_ROOM).emit('presence:update', { teamId, members });
}

/** Reenvía el lobby recalculado a todo un equipo. */
export async function pushLobby(teamId: string) {
  const lobby = await buildLobbyFor(teamId);
  io.to(teamRoom(teamId)).emit('lobby:update', { lobby, serverTime: Date.now() });
}

/** Reenvía a cada miembro el snapshot que le corresponde por su rol. */
export async function pushSnapshotToUser(userId: string, isAdmin = false) {
  const snap = await buildSnapshotFor(userId, isAdmin);
  if (snap) io.to(userRoom(userId)).emit('session:snapshot', snap);
}

/**
 * Entrar en una fase es un acto de EQUIPO, no individual: si el Operador
 * de Datos abre la Fase 1, los tres entran. De lo contrario los roles
 * quedarían en pantallas distintas y el juego cooperativo se rompe.
 */
export async function enterPhase(teamId: string, phaseId: string, userId?: string) {
  const lobby = await buildLobbyFor(teamId);
  const entry = lobby.find((l) => l.phaseId === phaseId);
  if (!entry) throw new Error('PHASE_NOT_FOUND');
  if (!entry.canEnter) throw new Error(entry.lockReason ?? 'PHASE_LOCKED');

  const progress = await prisma.teamPhaseProgress.findUniqueOrThrow({
    where: { teamId_phaseId: { teamId, phaseId } },
    include: { phase: true },
  });

  await prisma.teamPhaseProgress.update({
    where: { id: progress.id },
    data: {
      status: 'IN_PROGRESS',
      // Solo la PRIMERA entrada sella el cronómetro de trabajo real.
      enteredAt: progress.enteredAt ?? new Date(),
    },
  });

  if (userId) {
    await prisma.eventLog.create({
      data: { type: 'PHASE_ENTER', message: `Entró a ${progress.phase.title}`, teamId, userId },
    });
  }

  // Cada rol recibe su propia proyección de la fase.
  const members = await prisma.user.findMany({ where: { teamId } });
  for (const m of members) {
    io.to(roleRoom(teamId, m.role as Role)).emit(
      'workspace:update',
      await projectPhaseForRole(m.role as Role, progress.phase, teamId),
    );
  }
  await pushLobby(teamId);
}
