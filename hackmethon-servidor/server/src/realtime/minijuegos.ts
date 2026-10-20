// ============================================================
//  Minijuegos.
//
//  El panel lanza uno y a todos los jugadores se les pone encima, a
//  la vez. No toca cronómetros ni fases. Los puntos de cada intento
//  solo sirven para ordenar la ronda: lo que se gana son TICKETS, y se
//  reparten al cerrarla —al terminarla o al lanzar otra— según el
//  puesto de cada EQUIPO, que es el de su mejor jugador. Así un equipo
//  de cinco no cobra más que uno de tres por tener más manos.
//
//  La ronda vive en memoria: si el servidor se reinicia, el recreo se
//  acaba sin repartir, y eso es justo lo que tiene que pasar. Los
//  tickets ya cobrados sí están en SQLite.
//
//  La sala de espera NO da tickets: está siempre abierta y el puntaje
//  lo manda el navegador, así que sería una máquina de imprimirlos.
// ============================================================

import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import {
  MINIJUEGOS, type MarcaMinijuego, type MinijuegoClave, type MinijuegoTablero, type MinijuegoView,
  type PuntajeMinijuego, type RecordSala,
} from '../lib/events.js';
import { getIO } from './server.js';
import { ADMIN_ROOM, userRoom } from './rooms.js';
import { TICKETS_MINIJUEGO, TICKETS_MINIJUEGO_PARTICIPAR } from '../lib/constants.js';
import { sumarTickets } from './tickets.js';
import { pushAdminState } from './admin.js';

/** Ningún juego honesto llega aquí (LATIDO perfecto ronda los 4 500).
 *  Esto solo frena al que manda un número inventado desde la consola. */
const TOPE_PUNTOS = 10000;

/** El nombre corto de cada juego, para el motivo de los tickets. */
const NOMBRES: Record<MinijuegoClave, string> = {
  snake: 'ENREDADERA', plaga: 'PLAGA', sinapsis: 'SINAPSIS', latido: 'LATIDO',
};

let activo: { clave: MinijuegoClave; ronda: string; desde: number } | null = null;
let puntajes = new Map<string, PuntajeMinijuego & { teamId: string | null }>();

/**
 * Las marcas personales, ENTRE rondas: el desglose que cada quien ve en
 * su lobby. A diferencia de `puntajes` (el ranking de la ronda en curso),
 * esto no se borra al relanzar un juego. Vive en memoria como el resto
 * del recreo; si el servidor se reinicia, se pierde.
 */
const marcas = new Map<string, Map<MinijuegoClave, MarcaMinijuego & { _rondas: Set<string> }>>();

/** Las marcas de una persona, sin lo interno, en el orden del catálogo. */
export function marcasDe(userId: string): MarcaMinijuego[] {
  const m = marcas.get(userId);
  if (!m) return [];
  return MINIJUEGOS.flatMap((c) => {
    const x = m.get(c);
    if (!x) return [];
    const { _rondas, ...marca } = x;
    return [{ ...marca, rondas: _rondas.size }];
  });
}

/**
 * El récord de la sala en cada juego de la SALA DE ESPERA: lo que juega
 * un equipo que ya superó todo lo abierto mientras el panel abre la
 * siguiente fase. Una ronda siempre abierta por juego (`libre:<clave>`),
 * aparte del recreo que lanza el panel.
 */
const recordsLibres = new Map<MinijuegoClave, RecordSala>();
export const recordsSala = (): RecordSala[] => MINIJUEGOS.flatMap((c) => recordsLibres.get(c) ?? []);

/** Al reiniciar el juego desde el panel, las marcas y los récords vuelven a cero. */
export function olvidarMarcas() { marcas.clear(); recordsLibres.clear(); }

function anotarMarca(userId: string, clave: MinijuegoClave, ronda: string, puntos: number) {
  let m = marcas.get(userId);
  if (!m) { m = new Map(); marcas.set(userId, m); }
  const previa = m.get(clave);
  const _rondas = previa?._rondas ?? new Set<string>();
  _rondas.add(ronda);
  m.set(clave, {
    clave,
    mejor: Math.max(previa?.mejor ?? 0, puntos),
    intentos: (previa?.intentos ?? 0) + 1,
    ultimo: puntos,
    rondas: _rondas.size,
    ultimoAt: Date.now(),
    _rondas,
  });
  getIO().to(userRoom(userId)).emit('minijuego:mis-marcas', marcasDe(userId));
}

/** Para los jugadores: qué se juega, sin el ranking. */
export const vistaMinijuego = (): MinijuegoView | null => (activo ? { ...activo } : null);

/** Para el panel y la proyección: con el tablero. */
export function tableroMinijuego(): MinijuegoTablero | null {
  if (!activo) return null;
  const todos = [...puntajes.values()]
    .sort((a, b) => b.puntos - a.puntos)
    .map(({ teamId: _t, ...p }) => p);
  return { ...activo, ranking: todos.slice(0, 10), participantes: todos.length };
}

/** El tablero solo a los admins. Un puntaje nuevo no le dice nada a
 *  ningún jugador, así que ni siquiera viaja hasta ellos. */
const difundirTablero = () => getIO().to(ADMIN_ROOM).emit('minijuego:tablero', tableroMinijuego());

export async function lanzarMinijuego(clave: MinijuegoClave | null, adminId: string) {
  if (clave !== null && !MINIJUEGOS.includes(clave)) throw new Error('MINIJUEGO_DESCONOCIDO');

  const antes = activo;
  const cerrados = puntajes;
  activo = clave ? { clave, ronda: randomUUID(), desde: Date.now() } : null;
  puntajes = new Map();
  const premiados = antes ? await repartirTickets(antes.clave, cerrados) : 0;
  getIO().except(ADMIN_ROOM).emit('minijuego:update', vistaMinijuego());
  difundirTablero();

  await prisma.eventLog.create({
    data: clave
      ? { type: 'MINIJUEGO', message: `Minijuego lanzado: ${clave}`, userId: adminId }
      : { type: 'MINIJUEGO', message: `Minijuego terminado${antes ? `: ${antes.clave}` : ''}`, userId: adminId },
  });
  return { ronda: activo?.ronda ?? null, premiados };
}

/**
 * Los tickets de una ronda que se cierra. Solo con el evento en marcha
 * (o en pausa): un recreo de calentamiento antes de empezar no debe
 * llegar a la partida con dinero repartido.
 *
 * Cuenta el mejor de cada equipo y solo intentos con puntos: un intento
 * a cero es alguien que cerró el juego, no alguien que jugó.
 */
async function repartirTickets(
  clave: MinijuegoClave,
  ronda: Map<string, PuntajeMinijuego & { teamId: string | null }>,
): Promise<number> {
  const event = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
  if (event.status !== 'RUNNING' && event.status !== 'PAUSED') return 0;

  const mejorPorEquipo = new Map<string, number>();
  for (const p of ronda.values()) {
    if (!p.teamId || p.puntos <= 0) continue;
    mejorPorEquipo.set(p.teamId, Math.max(mejorPorEquipo.get(p.teamId) ?? 0, p.puntos));
  }
  const orden = [...mejorPorEquipo].sort((a, b) => b[1] - a[1]);
  const nombre = NOMBRES[clave] ?? clave.toUpperCase();
  // Los empates comparten puesto: dos equipos con el mismo puntaje
  // cobran lo mismo, y el siguiente baja tantos puestos como empatados.
  let puesto = 0;
  for (const [i, [teamId, puntos]] of orden.entries()) {
    if (i === 0 || puntos !== orden[i - 1][1]) puesto = i;
    const premio = TICKETS_MINIJUEGO[puesto] ?? TICKETS_MINIJUEGO_PARTICIPAR;
    const motivo = puesto < TICKETS_MINIJUEGO.length ? `${nombre} · ${puesto + 1}.º lugar` : `${nombre} · participación`;
    await sumarTickets(teamId, premio, motivo, false);
  }
  if (orden.length) await pushAdminState();
  return orden.length;
}

export async function registrarPuntaje(userId: string, ronda: string, puntos: number) {
  const libre = /^libre:(.+)$/.exec(String(ronda ?? ''));
  if (libre) return registrarLibre(userId, libre[1] as MinijuegoClave, puntos);
  if (!activo) throw new Error('SIN_MINIJUEGO');
  // Un intento que terminó justo después de relanzar no se cuela en la
  // ronda nueva.
  if (ronda !== activo.ronda) throw new Error('RONDA_VENCIDA');
  if (!Number.isInteger(puntos) || puntos < 0 || puntos > TOPE_PUNTOS) throw new Error('PUNTOS_INVALIDOS');

  // El desglose personal cuenta TODOS los intentos, también los que no
  // mejoran la marca de la ronda.
  anotarMarca(userId, activo.clave, ronda, puntos);

  const previo = puntajes.get(userId);
  if (previo && previo.puntos >= puntos) return { mejor: previo.puntos };

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { displayName: true, teamId: true, team: { select: { name: true } } },
  });
  puntajes.set(userId, {
    userId,
    nombre: user.displayName,
    equipo: user.team?.name ?? '—',
    teamId: user.teamId,
    puntos,
  });
  difundirTablero();
  return { mejor: puntos };
}

/** Un intento en la sala de espera: cuenta para las marcas de la persona
 *  y, si bate el récord de la sala en ese juego, se anuncia a todos. */
async function registrarLibre(userId: string, clave: MinijuegoClave, puntos: number) {
  if (!MINIJUEGOS.includes(clave)) throw new Error('MINIJUEGO_DESCONOCIDO');
  if (!Number.isInteger(puntos) || puntos < 0 || puntos > TOPE_PUNTOS) throw new Error('PUNTOS_INVALIDOS');
  anotarMarca(userId, clave, `libre:${clave}`, puntos);

  const record = recordsLibres.get(clave);
  if (puntos > 0 && (!record || puntos > record.puntos)) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true, team: { select: { name: true } } },
    });
    recordsLibres.set(clave, { clave, puntos, nombre: user.displayName, equipo: user.team?.name ?? '—' });
    getIO().except(ADMIN_ROOM).emit('minijuego:records', recordsSala());
  }
  return { mejor: marcas.get(userId)?.get(clave)?.mejor ?? puntos };
}
