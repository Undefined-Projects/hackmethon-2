// ============================================================
//  Acciones del panel de administración.
//
//  Todas siguen el mismo patrón: (1) mutar la base de datos dentro de
//  una transacción, (2) recalcular, (3) emitir. Nunca al revés: si
//  emites antes de persistir, un cliente que reconecte medio segundo
//  después recibe un estado que contradice lo que acaba de ver.
// ============================================================

import { olvidarAlertas } from './vigilancia.js';
import { prisma } from '../lib/prisma.js';
import { registrarAveria } from '../lib/averias.js';
import { shuffleTeamRoles } from '../lib/shuffle.js';
import { buildAdminSnapshot } from '../lib/snapshot.js';
import { ROLES, type Role, type EventStatus } from '../lib/constants.js';
import { PARTES_ROBOT, type ParteRobot } from '../lib/events.js';
import { ADMIN_ROOM, roleRoom, teamRoom, userRoom } from './rooms.js';
import { broadcastPresence, getIO, pushLobby, pushSnapshotToUser } from './server.js';
import { detenerTodos, pausarFlujos, reanudarFlujos } from './trafico.js';
import { dispararLuces, olvidarDerrota } from './luces.js';
import { olvidarMarcas } from './minijuegos.js';
import { escribirPlano } from '../lib/plano.js';
import { capasConConsejo, consejoPara } from '../lib/consejos.js';
import { ENFRIAMIENTO_MAX_S, ENFRIAMIENTO_MIN_S } from '../lib/timing.js';

const EVENT_ID = 'singleton';

/** Reenvía el panel a todos los admins conectados. */
export async function pushAdminState(adminId?: string) {
  const io = getIO();
  const sockets = await io.in(ADMIN_ROOM).fetchSockets();
  const ids = new Set(sockets.map((s) => s.data.userId));
  if (adminId) ids.add(adminId);
  for (const id of ids) {
    const snap = await buildAdminSnapshot(id);
    if (snap) io.to(userRoom(id)).emit('session:snapshot', snap);
  }
}

/** Empuja el lobby recalculado a todos los equipos. */
async function pushLobbyToAll() {
  const teams = await prisma.team.findMany({ select: { id: true } });
  await Promise.all(teams.map((t) => pushLobby(t.id)));
}

async function broadcastEvent() {
  const e = await prisma.eventState.findUniqueOrThrow({ where: { id: EVENT_ID } });
  getIO().emit('event:update', {
    status: e.status as EventStatus,
    focusPhaseId: e.focusPhaseId,
    paused: e.pausedAt !== null,
    libreAcceso: e.libreAcceso,
  });
}

// ============================================================
//  La espera entre ataques. Se aplica en caliente, también a quien ya
//  estaba esperando: el reloj de su botón se recalcula con el valor
//  nuevo, así que se les reenvía el snapshot a todos.
// ============================================================
export async function ajustarEnfriamientoAtaque(segundos: number, adminId: string) {
  const n = Math.round(Number(segundos));
  if (!Number.isFinite(n) || n < ENFRIAMIENTO_MIN_S || n > ENFRIAMIENTO_MAX_S) {
    throw new Error('ENFRIAMIENTO_FUERA_DE_RANGO');
  }
  const enfriamientoAtaqueMs = n * 1000;
  await prisma.eventState.update({ where: { id: EVENT_ID }, data: { enfriamientoAtaqueMs } });
  await prisma.eventLog.create({
    data: { type: 'ATAQUE_ENFRIAMIENTO', message: `Espera entre ataques: ${n} s`, userId: adminId },
  });
  await pushAdminState(adminId);
  const conectados = await prisma.user.findMany({ where: { connected: true, isAdmin: false }, select: { id: true } });
  await Promise.all(conectados.map((u) => pushSnapshotToUser(u.id)));
  return { enfriamientoAtaqueMs };
}

// ============================================================
//  El plano del auditorio. Se guarda entero y se reenvía a todos los
//  paneles: la ventana del proyector se repinta sola al guardar.
// ============================================================
export async function guardarPlano(plano: unknown, adminId: string) {
  const guardadoAt = await escribirPlano(plano);
  const mesas = Array.isArray((plano as { elementos?: unknown[] })?.elementos)
    ? (plano as { elementos: { tipo?: string }[] }).elementos.filter((e) => e.tipo === 'mesa').length
    : 0;
  await prisma.eventLog.create({
    data: { type: 'PLANO', message: `Plano guardado (${mesas} mesas)`, userId: adminId },
  });
  await pushAdminState(adminId);
  // Y a los jugadores conectados: el mapa de ataque es este mismo plano,
  // y una mesa movida tiene que verse sin esperar al siguiente repintado.
  const conectados = await prisma.user.findMany({ where: { connected: true, isAdmin: false }, select: { id: true } });
  await Promise.all(conectados.map((u) => pushSnapshotToUser(u.id)));
  return { guardadoAt };
}

// ============================================================
//  activar_fase
// ============================================================
export async function activarFase(phaseId: string, adminId: string) {
  const phase = await prisma.phase.findUniqueOrThrow({ where: { id: phaseId } });
  if (phase.status === 'ACTIVE') throw new Error('FASE_YA_ACTIVA');

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.phase.update({
      where: { id: phaseId },
      data: { status: 'ACTIVE', openedAt: phase.openedAt ?? now, closedAt: null },
    });

    // Arranca el reloj OFICIAL de todos los equipos en el MISMO instante.
    // Solo de quien aún no lo tenía: reabrir una fase no reinicia relojes
    // ya sellados ni regala tiempo a quien ya la jugó.
    await tx.teamPhaseProgress.updateMany({
      where: { phaseId, unlockedAt: null },
      data: { unlockedAt: phase.openedAt ?? now },
    });

    // Abrir la primera fase arranca el evento si seguía en el lobby.
    const ev = await tx.eventState.findUniqueOrThrow({ where: { id: EVENT_ID } });
    if (ev.status === 'LOBBY') {
      await tx.eventState.update({
        where: { id: EVENT_ID },
        data: { status: 'RUNNING', startedAt: ev.startedAt ?? now },
      });
    }

    await tx.eventLog.create({
      data: { type: 'PHASE_OPEN', message: `Fase abierta: ${phase.title}`, userId: adminId,
              dataJson: JSON.stringify({ phaseId, at: now }) },
    });
  });

  await pushLobbyToAll();
  await broadcastEvent();
  await pushAdminState(adminId);

  // Las luces. Van al final y sin `await`: una tira de LEDs no puede
  // retrasar —ni tumbar— la apertura de una fase.
  dispararLuces('FASE_ABIERTA');
  if (phase.esFinal) {
    olvidarDerrota();      // la final vuelve a poder perderse
    dispararLuces('FINAL_ARRANCA');
  }
  return { phaseId, openedAt: phase.openedAt ?? now };
}

// ============================================================
//  cerrar_fase
// ============================================================
export async function cerrarFase(phaseId: string, adminId: string) {
  const phase = await prisma.phase.findUniqueOrThrow({ where: { id: phaseId } });
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.phase.update({
      where: { id: phaseId },
      data: { status: 'COMPLETED', closedAt: now },
    });

    // Quien no la resolvió a tiempo queda FAILED: sin tiempo registrado,
    // pero la cadena se libera (ver nota en buildLobbyView) para que
    // pueda seguir jugando las fases siguientes.
    await tx.teamPhaseProgress.updateMany({
      where: { phaseId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      data: { status: 'FAILED' },
    });

    await tx.eventLog.create({
      data: { type: 'PHASE_CLOSE', message: `Fase cerrada: ${phase.title}`, userId: adminId,
              dataJson: JSON.stringify({ phaseId, at: now }) },
    });
  });

  // Los equipos que estuvieran dentro vuelven al lobby en el acto, y con
  // ellos se apaga cualquier monitor de tráfico que siguiera abierto.
  detenerTodos('Fase cerrada por el administrador.');
  getIO().emit('workspace:update', null);
  await pushLobbyToAll();
  await pushAdminState(adminId);
  dispararLuces('FASE_CERRADA');
  return { phaseId, closedAt: now };
}

// ============================================================
//  mezclar_roles
// ============================================================
/**
 * Lleva a la práctica un cambio de roles ya guardado: cada socket cambia
 * de room y recibe su snapshot proyectado para el rol nuevo. Sin esto la
 * base de datos diría un rol y las rooms otro, y el jugador seguiría
 * recibiendo los envíos dirigidos de su rol viejo.
 */
async function moverRoles(teamId: string, moves: { userId: string; from: Role; to: Role }[]) {
  const io = getIO();
  for (const mv of moves) {
    const room = userRoom(mv.userId); // alcanza TODAS sus pestañas
    io.in(room).socketsLeave(roleRoom(teamId, mv.from));
    io.in(room).socketsJoin(roleRoom(teamId, mv.to));
    io.to(room).emit('role:changed', { role: mv.to, previousRole: mv.from });
    // Snapshot completo detrás del aviso: el front no reconstruye nada
    // por su cuenta, lo recibe ya proyectado para el rol nuevo.
    await pushSnapshotToUser(mv.userId);
  }
  await broadcastPresence(teamId);
  await pushLobby(teamId);
}

/**
 * Asignar un rol a mano desde el panel: para cuando falta alguien o el
 * equipo pide cambiar. La regla de la TERMINAL se mantiene siempre:
 * - dar la TERMINAL a alguien se la QUITA a quien la tenía, que pasa al
 *   puesto que deja libre el nuevo (un intercambio);
 * - a quien tiene la TERMINAL no se le puede poner otro rol sin dársela
 *   a otro: el equipo se quedaría sin nadie que teclee.
 */
export async function asignarRol(userId: string, rol: Role, adminId: string) {
  if (!ROLES.includes(rol)) throw new Error('ROL_DESCONOCIDO');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { team: { include: { members: true } } } });
  if (user.isAdmin || !user.team) throw new Error('NO_TEAM');
  const antes = user.role as Role;
  if (antes === rol) return { moves: [] };
  if (antes === 'TERMINAL') throw new Error('SIN_TERMINAL');

  const moves: { userId: string; from: Role; to: Role }[] = [{ userId, from: antes, to: rol }];
  if (rol === 'TERMINAL') {
    for (const otro of user.team.members.filter((m) => m.id !== userId && m.role === 'TERMINAL')) {
      moves.push({ userId: otro.id, from: 'TERMINAL', to: antes });
    }
  }
  await prisma.$transaction(moves.map((mv) => prisma.user.update({
    where: { id: mv.userId },
    data: { role: mv.to, previousRole: mv.from, ...(mv.to === 'TERMINAL' ? { vecesTerminal: { increment: 1 } } : {}) },
  })));
  await moverRoles(user.team.id, moves);
  await prisma.eventLog.create({
    data: {
      type: 'ROLE_SET', userId: adminId, teamId: user.team.id,
      message: `${user.displayName} pasa a ${rol}${moves.length > 1 ? ' (intercambio con la terminal)' : ''}`,
      dataJson: JSON.stringify({ moves }),
    },
  });
  await pushAdminState(adminId);
  return { moves };
}

/**
 * Cambiar a una persona de equipo desde el panel: alguien que se sentó en
 * la mesa equivocada, un equipo que se quedó corto, dos que se fusionan.
 *
 * La regla de la TERMINAL se cuida en los DOS equipos:
 * - en el que deja, si se llevaba la terminal, la hereda quien esté
 *   conectado y menos veces la haya tenido;
 * - en el que llega, solo la toma si allí no la tiene nadie; si no,
 *   conserva su puesto, o va al que menos gente tenga si era la terminal.
 *
 * Sus manejadores de socket llevan el equipo con el que se conectó, así
 * que no basta con cambiarle las rooms: se le pide al cliente que se
 * reconecte, y entra limpio en el equipo nuevo.
 */
export async function moverDeEquipo(userId: string, teamId: string, adminId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { team: true } });
  if (user.isAdmin || !user.team) throw new Error('NO_TEAM');
  const antes = user.role as Role;
  if (user.teamId === teamId) return { equipo: user.team.name, rol: antes };

  const destino = await prisma.team.findUnique({ where: { id: teamId }, include: { members: true } });
  if (!destino) throw new Error('EQUIPO_DESCONOCIDO');
  const origen = user.team;

  const llegan = destino.members.filter((m) => !m.isAdmin);
  let rol: Role;
  if (!llegan.some((m) => m.role === 'TERMINAL')) rol = 'TERMINAL';
  else if (antes !== 'TERMINAL') rol = antes;
  else {
    const cuenta = (r: Role) => llegan.filter((m) => m.role === r).length;
    rol = cuenta('DATOS') <= cuenta('PANTALLA') ? 'DATOS' : 'PANTALLA';
  }

  const quedan = await prisma.user.findMany({ where: { teamId: origen.id, isAdmin: false, NOT: { id: userId } } });
  const heredero = antes === 'TERMINAL' && !quedan.some((m) => m.role === 'TERMINAL')
    ? [...quedan].sort((a, b) => Number(b.connected) - Number(a.connected) || a.vecesTerminal - b.vecesTerminal)[0] ?? null
    : null;

  // El nombre lleva delante el del equipo («ALFA · Jugador 2»): se cambia
  // el prefijo para que el panel no lo enseñe con el equipo de antes.
  const prefijo = `${origen.name} · `;
  const displayName = user.displayName.startsWith(prefijo)
    ? `${destino.name} · ${user.displayName.slice(prefijo.length)}`
    : user.displayName;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        teamId: destino.id, role: rol, previousRole: antes, displayName,
        ...(rol === 'TERMINAL' && antes !== 'TERMINAL' ? { vecesTerminal: { increment: 1 } } : {}),
      },
    });
    if (heredero) {
      await tx.user.update({
        where: { id: heredero.id },
        data: { role: 'TERMINAL', previousRole: heredero.role, vecesTerminal: { increment: 1 } },
      });
    }
    await tx.eventLog.create({
      data: {
        type: 'TEAM_MOVE', userId: adminId, teamId: destino.id,
        message: `${user.displayName} pasa de ${origen.name} a ${destino.name} como ${rol}`
          + (heredero ? ` (${heredero.displayName} toma la terminal de ${origen.name})` : ''),
        dataJson: JSON.stringify({ userId, de: origen.id, a: destino.id, rol, heredero: heredero?.id ?? null }),
      },
    });
  });

  // Fuera de las rooms del equipo viejo YA, para que no le llegue nada
  // de él mientras su navegador se reconecta.
  const io = getIO();
  const room = userRoom(userId);
  io.in(room).socketsLeave([teamRoom(origen.id), ...ROLES.map((r) => roleRoom(origen.id, r))]);
  io.to(room).emit('session:reconectar', { motivo: `Ahora estás en ${destino.name}` });

  if (heredero) await moverRoles(origen.id, [{ userId: heredero.id, from: heredero.role as Role, to: 'TERMINAL' }]);
  else await broadcastPresence(origen.id);
  await broadcastPresence(destino.id);
  await pushLobby(origen.id);
  await pushAdminState(adminId);
  return { equipo: destino.name, rol };
}

export async function mezclarRoles(adminId: string, teamIds?: string[]) {
  const teams = await prisma.team.findMany({
    where: teamIds?.length ? { id: { in: teamIds } } : undefined,
    include: { members: { orderBy: { displayName: 'asc' } } },
  });

  const cambios: { teamId: string; teamName: string; moves: { userId: string; from: Role; to: Role }[] }[] = [];
  const omitidos: string[] = [];

  for (const team of teams) {
    // Se mezcla entre quienes ESTÁN: un equipo de cinco códigos al que
    // llegaron tres no puede quedarse con la TERMINAL en alguien ausente.
    // Con menos de dos conectados, entre todos, como siempre.
    const miembros = team.members.filter((m) => !m.isAdmin);
    const conectados = miembros.filter((m) => m.connected);
    const participan = conectados.length >= 2 ? conectados : miembros;
    const plan = shuffleTeamRoles(
      participan.map((m) => ({
        userId: m.id,
        role: m.role as Role,
        previousRole: (m.previousRole as Role | null) ?? null,
        vecesTerminal: m.vecesTerminal,
      })),
    );
    if (!plan) { omitidos.push(team.name); continue; }

    // Quien se queda fuera de la mezcla conserva su rol… salvo que fuera
    // la TERMINAL: la terminal ya es de alguien presente, y una segunda
    // rompería la regla. Pasa al puesto que menos gente tenga.
    const fuera = miembros.filter((m) => !participan.includes(m) && m.role === 'TERMINAL');
    for (const m of fuera) {
      const cuenta = (r: Role) => [...plan.map((p) => p.to), ...miembros.filter((x) => !participan.includes(x)).map((x) => x.role)]
        .filter((x) => x === r).length;
      plan.push({ userId: m.id, from: 'TERMINAL', to: cuenta('DATOS') <= cuenta('PANTALLA') ? 'DATOS' : 'PANTALLA' });
    }

    const moves = plan.filter((mv) => mv.from !== mv.to);
    await prisma.$transaction(
      moves.map((mv) =>
        prisma.user.update({
          where: { id: mv.userId },
          data: {
            role: mv.to, previousRole: mv.from,
            ...(mv.to === 'TERMINAL' ? { vecesTerminal: { increment: 1 } } : {}),
          },
        }),
      ),
    );
    cambios.push({ teamId: team.id, teamName: team.name, moves });
  }

  for (const { teamId, moves } of cambios) await moverRoles(teamId, moves);

  const total = cambios.reduce((a, c) => a + c.moves.length, 0);
  await prisma.eventState.update({
    where: { id: EVENT_ID },
    data: { shuffleCount: { increment: 1 }, lastShuffleAt: new Date() },
  });
  await prisma.eventLog.create({
    data: {
      type: 'ROLE_SHUFFLE',
      message: `Mezcla de roles en ${cambios.length} equipo(s), ${total} cambios`,
      userId: adminId,
      dataJson: JSON.stringify({ cambios, omitidos }),
    },
  });

  await pushAdminState(adminId);
  dispararLuces('ROLES_MEZCLADOS');
  return { equipos: cambios.length, cambios: total, omitidos };
}

// ============================================================
//  Estado del evento (con contabilidad de pausas)
// ============================================================
export async function cambiarEstadoEvento(status: EventStatus, adminId: string) {
  const ev = await prisma.eventState.findUniqueOrThrow({ where: { id: EVENT_ID } });
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (status === 'PAUSED' && !ev.pausedAt) {
      await tx.eventState.update({ where: { id: EVENT_ID }, data: { status, pausedAt: now } });
    } else if (status !== 'PAUSED' && ev.pausedAt) {
      // Al reanudar, el tiempo pausado se descuenta del reloj de cada
      // fase aún en juego. Un incidente tuyo no debe salir del marcador.
      const delta = Math.max(0, now.getTime() - ev.pausedAt.getTime());
      await tx.teamPhaseProgress.updateMany({
        where: { solvedAt: null, unlockedAt: { not: null } },
        data: { pausedMs: { increment: delta } },
      });
      await tx.eventState.update({
        where: { id: EVENT_ID },
        data: { status, pausedAt: null, totalPausedMs: { increment: delta } },
      });
    } else {
      await tx.eventState.update({ where: { id: EVENT_ID }, data: { status } });
    }

    await tx.eventLog.create({
      data: { type: 'EVENT_STATUS', message: `Evento → ${status}`, userId: adminId },
    });
  });

  // El ataque se congela con el evento: si al reanudar hubieran seguido
  // llegando peticiones, la pausa no habría sido tal para Pantalla.
  if (status === 'PAUSED') pausarFlujos();
  else reanudarFlujos();

  await broadcastEvent();
  await pushLobbyToAll();
  await pushAdminState(adminId);

  dispararLuces(
    status === 'PAUSED' ? 'EVENTO_PAUSA'
      : status === 'FINISHED' ? 'EVENTO_FINALIZA'
      : ev.status === 'PAUSED' ? 'EVENTO_REANUDA'
      : 'EVENTO_ARRANCA',
  );
}

export async function destacarFase(phaseId: string | null, adminId: string) {
  await prisma.eventState.update({ where: { id: EVENT_ID }, data: { focusPhaseId: phaseId } });
  await broadcastEvent();
  await pushLobbyToAll();
  await pushAdminState(adminId);
  if (phaseId) dispararLuces('FASE_DESTACADA');
}

// ============================================================
//  La final
//
//  La fase que cierra el evento tiene un reloj propio, y ese reloj se
//  proyecta en la pared encima de un cohete. Aquí solo se ajusta cuánto
//  dura y se ensaya el desenlace: la cuenta atrás NO se guarda en
//  ninguna parte, se deduce de cuándo se abrió la fase.
//
//  Y llegar a cero no cambia el juego. Nadie queda FAILED ni se cierra
//  nada: es un telón, no una penalización. Si la sala necesita más
//  tiempo, el admin sube el límite y la cuenta sigue desde donde iba.
// ============================================================

const LIMITE_MIN_MINUTOS = 1;
const LIMITE_MAX_MINUTOS = 180;

export async function ajustarLimiteFinal(minutos: number, adminId: string) {
  const fase = await prisma.phase.findFirst({ where: { esFinal: true } });
  if (!fase) throw new Error('SIN_FINAL');

  const n = Math.round(Number(minutos));
  if (!Number.isFinite(n) || n < LIMITE_MIN_MINUTOS || n > LIMITE_MAX_MINUTOS) {
    throw new Error('LIMITE_FUERA_DE_RANGO');
  }

  const limiteMs = n * 60_000;
  await prisma.phase.update({ where: { id: fase.id }, data: { limiteMs } });
  await prisma.eventLog.create({
    data: {
      type: 'FINAL_LIMITE',
      message: `Cuenta atras de la final: ${n} min`,
      userId: adminId,
    },
  });
  await pushAdminState(adminId);
  return { limiteMs };
}

/**
 * Ensayo del desenlace. No se persiste y no toca el juego: emite a la
 * room de admins y quien esté proyectando pinta el cohete. Por eso va
 * solo a esa room —los equipos no tienen por qué ver el final antes de
 * que ocurra— y por eso el propio proyector lo deja caer solo cuando
 * termina la animación, en vez de quedarse pegado a un estado falso.
 */
export async function ensayarFinal(
  resultado: 'VICTORIA' | 'DERROTA' | null,
  adminId: string,
) {
  const limpio = resultado === 'VICTORIA' || resultado === 'DERROTA' ? resultado : null;
  getIO().to(ADMIN_ROOM).emit('final:ensayo', { resultado: limpio });
  if (limpio) {
    await prisma.eventLog.create({
      data: { type: 'FINAL_ENSAYO', message: `Ensayo de la final: ${limpio}`, userId: adminId },
    });
  }
  return { resultado: limpio };
}

/**
 * Ensayo de la destrucción del robot. Sin `todos` va solo a la room de
 * admins —la proyección es un panel más, y el panel de control no la
 * pinta—; con `todos`, a todas las pantallas, como un primer ganador de
 * verdad. No guarda nada. Lleva los equipos para que el cartel final se
 * ensaye con sus logos.
 */
export async function ensayarDestruccion(parte: unknown, todos: unknown) {
  const limpia = parte === 'todo' || PARTES_ROBOT.includes(parte as ParteRobot) ? (parte as ParteRobot | 'todo') : null;
  if (!limpia) throw new Error('PARTE_DESCONOCIDA');
  const equipos = await prisma.team.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, logoAt: true },
  });
  const p = {
    parte: limpia, id: `${Date.now()}`, todos: todos === true,
    equipos: equipos.map((e) => ({ id: e.id, name: e.name, logoAt: e.logoAt?.getTime() ?? null })),
  };
  if (p.todos) getIO().emit('destruccion:ensayo', p);
  else getIO().to(ADMIN_ROOM).emit('destruccion:ensayo', p);
  return { parte: limpia };
}

// ============================================================
//  Identidad del equipo: nombre y logo
//
//  Las dos cosas que trae puestas un equipo al llegar y que el día del
//  evento nunca coinciden con lo que hay sembrado. Se cambian desde el
//  panel, en caliente, sin reiniciar nada.
// ============================================================

const NOMBRE_MAX = 24;
const LOGO_MAX = 512 * 1024;

/** Reenvía a todo un equipo su estado: su nombre o su logo cambiaron. */
async function refrescarEquipo(teamId: string) {
  const gente = await prisma.user.findMany({ where: { teamId }, select: { id: true } });
  await Promise.all(gente.map((p) => pushSnapshotToUser(p.id)));
  // La presencia lleva el nombre de cada persona, y ese nombre empieza
  // por el del equipo: sin esto el panel seguiría con los de antes.
  await broadcastPresence(teamId);
}

export async function renombrarEquipo(teamId: string, crudo: string, adminId: string) {
  const nombre = String(crudo ?? '').replace(/\s+/g, ' ').trim();
  if (!nombre) throw new Error('NOMBRE_VACIO');
  if (nombre.length > NOMBRE_MAX) throw new Error('NOMBRE_LARGO');

  const equipo = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
  if (equipo.name === nombre) return { nombre };

  // Prisma sobre SQLite no compara sin distinguir mayúsculas, así que se
  // compara aquí. Dos equipos llamados «Tigres» y «TIGRES» en la misma
  // pista son un problema de sala, aunque la base los acepte.
  const otros = await prisma.team.findMany({
    where: { NOT: { id: teamId } },
    select: { name: true, joinCode: true },
  });
  const plegado = nombre.toLocaleLowerCase();
  const chocan = otros.some(
    (o) => o.name.toLocaleLowerCase() === plegado || o.joinCode.toLocaleLowerCase() === plegado,
  );
  if (chocan) throw new Error('NOMBRE_REPETIDO');

  const anterior = equipo.name;
  const prefijo = `${anterior} \u00b7 `;

  await prisma.$transaction(async (tx) => {
    await tx.team.update({ where: { id: teamId }, data: { name: nombre, joinCode: nombre } });

    // El nombre de cada persona lleva delante el del equipo. Sin esto, el
    // panel seguiría enseñando «ALFA · Jugador 2» bajo un equipo que ya
    // se llama de otra forma. El CÓDIGO DE ACCESO no se toca: está
    // impreso y repartido desde antes de empezar.
    const gente = await tx.user.findMany({ where: { teamId } });
    for (const persona of gente) {
      if (!persona.displayName.startsWith(prefijo)) continue;
      await tx.user.update({
        where: { id: persona.id },
        data: { displayName: `${nombre} \u00b7 ${persona.displayName.slice(prefijo.length)}` },
      });
    }

    await tx.eventLog.create({
      data: {
        type: 'TEAM_RENAME',
        message: `Equipo renombrado: ${anterior} \u2192 ${nombre}`,
        teamId, userId: adminId,
      },
    });
  });

  await refrescarEquipo(teamId);
  await pushAdminState(adminId);
  return { nombre };
}

/**
 * El tipo de imagen sale de los BYTES, no de lo que diga el navegador.
 * Un `Content-Type` lo pone quien sube el archivo, y lo que después se
 * devuelve en una etiqueta `<img>` de la sala entera conviene que sea de
 * verdad lo que dice ser.
 */
function tipoDeImagen(b: Buffer): string | null {
  if (b.length > 8 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export async function guardarLogoEquipo(
  teamId: string,
  datos: ArrayBuffer | Buffer | null,
  adminId: string,
) {
  const equipo = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
    select: { id: true, name: true },
  });

  if (datos === null || datos === undefined) {
    await prisma.team.update({
      where: { id: teamId },
      data: { logo: null, logoMime: null, logoAt: null },
    });
    await prisma.eventLog.create({
      data: { type: 'TEAM_LOGO', message: `Logo retirado de ${equipo.name}`, teamId, userId: adminId },
    });
    await refrescarEquipo(teamId);
    await pushAdminState(adminId);
    return { logoAt: null, mime: null, bytes: 0 };
  }

  // Socket.io entrega los binarios como Buffer en Node; el tipo del
  // contrato es ArrayBuffer porque es lo que manda el navegador. Prisma
  // quiere un Uint8Array, y el husmeo de la cabecera quiere un Buffer:
  // los dos miran los mismos bytes, sin copiarlos otra vez.
  const bytes = new Uint8Array(datos as ArrayBuffer);
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length === 0) throw new Error('ARCHIVO_VACIO');
  if (buf.length > LOGO_MAX) throw new Error('DEMASIADO_GRANDE');
  const mime = tipoDeImagen(buf);
  if (!mime) throw new Error('NO_ES_IMAGEN');

  const at = new Date();
  await prisma.team.update({
    where: { id: teamId },
    data: { logo: bytes, logoMime: mime, logoAt: at },
  });
  await prisma.eventLog.create({
    data: {
      type: 'TEAM_LOGO',
      message: `Logo nuevo en ${equipo.name} (${mime}, ${Math.round(buf.length / 1024)} kB)`,
      teamId, userId: adminId,
    },
  });

  await refrescarEquipo(teamId);
  await pushAdminState(adminId);
  return { logoAt: at.getTime(), mime, bytes: buf.length };
}

// ============================================================
//  Reiniciar juego
//
//  Borra el PROGRESO, no los participantes: equipos, personas y códigos
//  de acceso siguen intactos. Pensado para el salto de ensayo a evento
//  real, cuando los relojes ya corrieron y el marcador está sucio.
// ============================================================
export async function reiniciarJuego(adminId: string) {
  const io = getIO();
  detenerTodos('Juego reiniciado.');
  olvidarMarcas();
  olvidarAlertas();

  await prisma.$transaction(async (tx) => {
    await tx.teamPhaseProgress.updateMany({
      data: {
        status: 'PENDING', attempts: 0, stateJson: '{}',
        unlockedAt: null, availableAt: null, enteredAt: null, firstMoveAt: null,
        solvedAt: null, pausedMs: 0, timeToSolveMs: null, activeMs: null,
      },
    });
    await tx.phase.updateMany({ data: { status: 'LOCKED', openedAt: null, closedAt: null } });
    // (las luces también: la final vuelve a poder perderse)
    // También los ataques. Reiniciar es volver al principio, y empezar
    // una partida con media sala en enfriamiento —o con un objetivo
    // vetado de la partida anterior— es justo el resto que nadie ve
    // hasta que alguien pulsa y le dicen que no.
    await tx.team.updateMany({
      data: {
        ultimoAtaqueAt: null, ultimoObjetivoId: null, ultimoAtaquePausaMs: 0,
        // Y los tickets, con sus escudos y súper ataques: el dinero de
        // un ensayo no puede llegar al evento de verdad.
        tickets: 0, escudoAt: null, escudoPausaMs: 0, ultimoSuperAt: null, ultimoSuperPausaMs: 0,
      },
    });
    // Sin esto, al volver a jugar la misma fase el Operador de Pantalla
    // repintaría las salidas de la partida anterior: `salidasDe` las
    // reconstruye desde esta tabla.
    await tx.commandLog.deleteMany({});
    await tx.eventState.update({
      where: { id: EVENT_ID },
      data: {
        status: 'LOBBY', pausedAt: null, totalPausedMs: 0,
        shuffleCount: 0, lastShuffleAt: null, startedAt: null, focusPhaseId: null,
        // Tambien el acceso libre. Reiniciar es volver al principio, y el
        // principio es con la cadena puesta: dejarlo encendido de una
        // partida a la siguiente es justo el tipo de ajuste que se queda
        // olvidado y luego nadie entiende por que las fases se abren solas.
        libreAcceso: false,
      },
    });
    await tx.eventLog.create({
      data: { type: 'GAME_RESET', message: 'Juego reiniciado (progreso borrado)', userId: adminId },
    });
  });

  // Roles de vuelta a su reparto inicial, para que cada evento arranque igual.
  const teams = await prisma.team.findMany({
    include: { members: { orderBy: { displayName: 'asc' } } },
  });
  const ROLES_INICIALES: Role[] = ['DATOS', 'TERMINAL', 'PANTALLA'];

  for (const team of teams) {
    for (const [i, m] of team.members.entries()) {
      const nuevo = ROLES_INICIALES[i % ROLES_INICIALES.length];
      if (m.role !== nuevo) {
        io.in(userRoom(m.id)).socketsLeave(roleRoom(team.id, m.role as Role));
        io.in(userRoom(m.id)).socketsJoin(roleRoom(team.id, nuevo));
      }
      await prisma.user.update({
        where: { id: m.id },
        data: { role: nuevo, previousRole: null },
      });
    }
  }

  // Todo el mundo de vuelta al lobby con su estado recién reconstruido.
  io.emit('workspace:update', null);
  for (const team of teams) {
    for (const m of team.members) await pushSnapshotToUser(m.id);
    await broadcastPresence(team.id);
  }
  await pushLobbyToAll();
  await broadcastEvent();
  await pushAdminState(adminId);

  return { equipos: teams.length };
}

// ============================================================
//  ensayar_celebracion
//
//  La pantalla de victoria es lo único del juego que no se puede ver sin
//  jugar una fase entera, y el día del evento no vale «resolvemos la
//  Fase 1 a mano para comprobar que se ve bien».
//
//  Por eso este ensayo NO toca la base de datos: no sella tiempos, no
//  marca SOLVED, no cierra el monitor de tráfico y no mueve a nadie de
//  donde esté. Viaja marcado con `ensayo: true`, y ese mismo campo es el
//  que impide que cerrarla saque al equipo de la fase en curso.
// ============================================================

/** Tiempo de muestra del ensayo. Un número redondo y reconocible: si
 *  alguien ve 04:12 en el proyector sabrá que no es de nadie. */
const MUESTRA_MS = 4 * 60_000 + 12_000;

export async function ensayarCelebracion(adminId: string, teamIds?: string[]) {
  // La fase abierta es la que el equipo tiene delante; si no hay
  // ninguna, la primera sirve para que el rótulo no salga vacío.
  const fase =
    (await prisma.phase.findFirst({ where: { status: 'ACTIVE' }, orderBy: { order: 'asc' } })) ??
    (await prisma.phase.findFirst({ orderBy: { order: 'asc' } }));
  if (!fase) throw new Error('SIN_FASES');

  const equipos = await prisma.team.findMany({
    where: teamIds?.length ? { id: { in: teamIds } } : undefined,
    select: { id: true, name: true },
  });
  if (equipos.length === 0) throw new Error('SIN_EQUIPOS');

  const io = getIO();
  for (const t of equipos) {
    io.to(teamRoom(t.id)).emit('phase:solved', {
      phaseId: fase.id,
      title: fase.title,
      timeToSolveMs: MUESTRA_MS,
      activeMs: MUESTRA_MS,
      attempts: 1,
      ensayo: true,
    });
  }

  // Queda en la bitácora: si alguien ve la pantalla de victoria en la
  // sala y no entiende por qué, esto lo explica.
  await prisma.eventLog.create({
    data: {
      type: 'CELEBRACION_ENSAYO',
      message: `Ensayo de la pantalla de victoria · ${equipos.map((t) => t.name).join(', ')}`,
      userId: adminId,
      dataJson: JSON.stringify({ teamIds: equipos.map((t) => t.id), phaseId: fase.id }),
    },
  });

  return { equipos: equipos.length };
}

// ============================================================
//  acceso_libre
//
//  Apagado por defecto: la cadena —una fase se abre al resolver la
//  anterior— es el comportamiento normal del evento, y esto es la
//  excepcion. Se enciende a mano para una demo, para una sala que va con
//  retraso, o para probar una fase suelta sin jugarse las cinco previas.
//
//  Libera EL PREREQUISITO Y NADA MAS. Una fase sigue necesitando que el
//  admin la abra, y una que el equipo ya resolvio sigue sin poder
//  rejugarse: esto no es un modo libre, es quitar una cadena.
//
//  Encenderlo o apagarlo no toca ningun reloj ya sellado. Lo que si hace
//  es abrirle la puerta a quien estaba esperando, asi que hay que
//  reconstruir los lobbies: sin eso, los equipos verian la fase bloqueada
//  hasta que algo mas les repintara la pantalla.
// ============================================================
export async function cambiarAccesoLibre(libre: boolean, adminId: string) {
  const antes = await prisma.eventState.findUniqueOrThrow({ where: { id: EVENT_ID } });
  if (antes.libreAcceso === libre) return { libreAcceso: libre };

  await prisma.eventState.update({ where: { id: EVENT_ID }, data: { libreAcceso: libre } });
  await prisma.eventLog.create({
    data: {
      type: 'ACCESO_LIBRE',
      message: libre
        ? 'Acceso libre ACTIVADO: las fases abiertas ya no exigen la anterior'
        : 'Acceso libre desactivado: vuelve la cadena de fases',
      userId: adminId,
      dataJson: JSON.stringify({ libre }),
    },
  });

  await broadcastEvent();
  await pushLobbyToAll();
  await pushAdminState();
  return { libreAcceso: libre };
}

// ============================================================
//  averia
//
//  Ruido en la sala, a peticion del que gobierna el evento: la consola
//  se pone a escribir sola, a la pantalla le llueven avisos de conexion
//  perdida, o la base de datos empieza a temblar.
//
//  NO toca nada del juego. Ni cronometros, ni intentos, ni estado de
//  fase: una averia que penalizara seria un castigo disfrazado de broma,
//  y el equipo no sabria por cual de las dos cosas va perdiendo.
//
//  El tipo sale del rol que la persona tiene AHORA MISMO, leido de la
//  base de datos y no del panel: entre que el admin ve la lista y pulsa,
//  una mezcla de roles pudo cambiar quien es quien.
// ============================================================


export async function provocarAveria(userId: string, adminId: string) {
  const persona = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (persona.isAdmin) throw new Error('NO_AL_ADMIN');

  const tipo = persona.role as Role;
  const averia = registrarAveria(userId, tipo);
  if (!averia) throw new Error('INMOVILIZADO');
  getIO().to(userRoom(userId)).emit('player:averia', averia);

  dispararLuces('AVERIA', { teamId: persona.teamId });

  await prisma.eventLog.create({
    data: {
      type: 'AVERIA',
      message: `Averia de ${tipo} provocada a ${persona.displayName}`,
      userId: adminId,
      teamId: persona.teamId,
      dataJson: JSON.stringify({ a: userId, tipo }),
    },
  });

  return { tipo };
}

// ============================================================
//  Ensayo de la destrucción del robot del lobby
// ============================================================
export async function ensayarAnatomia(parte: ParteRobot | 'todo', adminId: string, teamIds?: string[]) {
  if (parte !== 'todo' && !PARTES_ROBOT.includes(parte)) throw new Error('PARTE_DESCONOCIDA');
  const equipos = await prisma.team.findMany({
    where: teamIds?.length ? { id: { in: teamIds } } : undefined,
    select: { id: true },
  });
  if (equipos.length === 0) throw new Error('SIN_EQUIPOS');
  const id = `${Date.now()}`;
  const io = getIO();
  for (const t of equipos) io.to(teamRoom(t.id)).emit('anatomia:ensayo', { parte, id });
  // A la bitácora: si alguien ve caerse la pierna del robot sin haber
  // ganado nada, esto lo explica.
  await prisma.eventLog.create({
    data: {
      type: 'ANATOMIA_ENSAYO',
      message: `Ensayo de destrucción: ${parte} (${equipos.length} equipo(s))`,
      userId: adminId,
    },
  });
  return { equipos: equipos.length };
}

// ============================================================
//  El letrero del robot: un consejo para cada puesto
//
//  Va a la fase en la que está el equipo —la que tiene empezada y tocó
//  por última vez; si no tiene ninguna, la primera abierta que le falta—
//  y a su capa. Cada persona recibe el de SU puesto. Se recuerda el
//  último de cada quien para no repetírselo si hay otro.
// ============================================================
const ultimoConsejo = new Map<string, string>();

async function faseDelEquipo(teamId: string) {
  const empezada = await prisma.teamPhaseProgress.findFirst({
    where: { teamId, status: 'IN_PROGRESS', phase: { status: 'ACTIVE' } },
    include: { phase: true },
    orderBy: { updatedAt: 'desc' },
  });
  const fila = empezada ?? await prisma.teamPhaseProgress.findFirst({
    where: { teamId, status: { in: ['PENDING', 'IN_PROGRESS'] }, phase: { status: 'ACTIVE' } },
    include: { phase: true },
    orderBy: { phase: { order: 'asc' } },
  });
  if (!fila) return null;
  let estado: Record<string, unknown> = {};
  try { estado = JSON.parse(fila.stateJson || '{}'); } catch { /* estado roto: capa 1 */ }
  return { key: fila.phase.key, title: fila.phase.title, capa: typeof estado.capa === 'number' ? estado.capa : 1 };
}

export async function mandarConsejo(adminId: string, teamIds?: string[]) {
  const equipos = await prisma.team.findMany({
    where: teamIds?.length ? { id: { in: teamIds } } : undefined,
    select: { id: true, name: true, members: { where: { isAdmin: false }, select: { id: true, role: true } } },
  });
  if (equipos.length === 0) throw new Error('SIN_EQUIPOS');

  const io = getIO();
  const id = `${Date.now()}`;
  for (const t of equipos) {
    const fase = await faseDelEquipo(t.id);
    for (const m of t.members) {
      const rol = m.role as Role;
      const c = consejoPara(fase?.key ?? null, fase?.capa ?? null, rol, ultimoConsejo.get(m.id));
      ultimoConsejo.set(m.id, c.texto);
      io.to(userRoom(m.id)).emit('player:consejo', { id, fase: fase?.title ?? null, ...c, rol });
    }
  }

  await prisma.eventLog.create({
    data: {
      type: 'CONSEJO',
      message: `Letrero del robot con consejo · ${equipos.map((t) => t.name).join(', ')}`,
      userId: adminId,
      dataJson: JSON.stringify({ teamIds: equipos.map((t) => t.id) }),
    },
  });
  return { equipos: equipos.length };
}

/** La vista previa del panel: el consejo, sin mandarlo a nadie. */
export async function verConsejo(faseKey: string | null, capa: number | null, rol: Role) {
  if (!ROLES.includes(rol)) throw new Error('ROL_DESCONOCIDO');
  const fase = faseKey ? await prisma.phase.findFirst({ where: { key: faseKey } }) : null;
  return {
    id: `${Date.now()}`,
    fase: fase?.title ?? null,
    ...consejoPara(fase?.key ?? null, capa, rol),
    rol,
    capas: fase ? capasConConsejo(fase.key) : 0,
  };
}
