// ============================================================
//  Tickets: el dinero de cada equipo.
//
//  Entran por dos sitios —superar una fase y las rondas de minijuego
//  del panel— y salen por dos —el escudo y el súper ataque—. Los precios
//  y premios viven en constants.ts, compartidos con el cliente.
//
//  El saldo es PRIVADO: el movimiento se emite solo a la room del equipo
//  y al panel. Ni los rivales ni la proyección de sala lo ven.
//
//  Todo movimiento queda en la bitácora con su motivo y el saldo
//  resultante: si a media tarde un equipo dice «nos faltan tickets», la
//  respuesta está en una consulta, no en la memoria de nadie.
// ============================================================

import { prisma } from '../lib/prisma.js';
import type { MovimientoTickets } from '../lib/events.js';
import { teamRoom } from './rooms.js';
import { getIO } from './server.js';
import { pushAdminState } from './admin.js';

async function anotar(teamId: string, delta: number, motivo: string, saldo: number) {
  await prisma.eventLog.create({
    data: {
      type: 'TICKETS',
      message: `${delta > 0 ? '+' : ''}${delta} tickets · ${motivo}`,
      teamId,
      dataJson: JSON.stringify({ delta, motivo, saldo }),
    },
  });
  const m: MovimientoTickets = { saldo, delta, motivo };
  getIO().to(teamRoom(teamId)).emit('tickets:movimiento', m);
}

/**
 * Suma (o resta, con `delta` negativo) tickets a un equipo. Nunca deja
 * el saldo por debajo de cero: un ajuste del panel que se pase se queda
 * en cero en vez de dejar al equipo debiendo.
 */
export async function sumarTickets(teamId: string, delta: number, motivo: string, avisarPanel = true) {
  const n = Math.trunc(delta);
  if (!Number.isFinite(n) || n === 0) throw new Error('TICKETS_INVALIDOS');
  const saldo = await prisma.$transaction(async (tx) => {
    const t = await tx.team.findUniqueOrThrow({ where: { id: teamId }, select: { tickets: true } });
    const nuevo = Math.max(0, t.tickets + n);
    await tx.team.update({ where: { id: teamId }, data: { tickets: nuevo } });
    return { antes: t.tickets, nuevo };
  });
  const real = saldo.nuevo - saldo.antes;
  if (real !== 0) await anotar(teamId, real, motivo, saldo.nuevo);
  if (avisarPanel) await pushAdminState();
  return saldo.nuevo;
}

/**
 * Cobra un precio, o falla con SIN_TICKETS. El descuento es UNA sola
 * sentencia condicionada al saldo: los tres puestos tienen el mismo
 * botón, y con «leer, comprobar, escribir» dos pulsaciones simultáneas
 * pagarían una sola vez dos compras.
 */
export async function cobrarTickets(teamId: string, precio: number, motivo: string) {
  const r = await prisma.team.updateMany({
    where: { id: teamId, tickets: { gte: precio } },
    data: { tickets: { decrement: precio } },
  });
  if (r.count === 0) throw new Error('SIN_TICKETS');
  const { tickets } = await prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { tickets: true } });
  await anotar(teamId, -precio, motivo, tickets);
  return tickets;
}

/** Devuelve lo cobrado cuando la compra falla DESPUÉS de cobrar. */
export async function reembolsarTickets(teamId: string, precio: number, motivo: string) {
  await prisma.team.update({ where: { id: teamId }, data: { tickets: { increment: precio } } });
  const { tickets } = await prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { tickets: true } });
  await anotar(teamId, precio, motivo, tickets);
}

/** Ajuste a mano desde el panel. */
export async function ajustarTickets(teamId: string, delta: number, adminId: string) {
  const n = Math.trunc(Number(delta));
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 1000) throw new Error('TICKETS_INVALIDOS');
  const equipo = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
  if (!equipo) throw new Error('EQUIPO_DESCONOCIDO');
  const saldo = await sumarTickets(teamId, n, 'Ajuste del panel', false);
  await prisma.eventLog.create({
    data: {
      type: 'TICKETS_AJUSTE',
      message: `Tickets de ${equipo.name}: ${n > 0 ? '+' : ''}${n} (saldo ${saldo})`,
      userId: adminId, teamId,
    },
  });
  await pushAdminState(adminId);
  return { saldo };
}

/**
 * Cuántas fases del recorrido lleva superadas cada equipo. Es la «fase en
 * la que está» para la intensidad de los ataques: se cuentan las
 * RESUELTAS y no la abierta, porque con el acceso libre encendido un
 * equipo puede estar dentro de la sexta sin haber pasado la tercera. El
 * bonus no cuenta: está fuera del recorrido.
 */
export async function fasesSuperadas(): Promise<Map<string, number>> {
  const filas = await prisma.teamPhaseProgress.groupBy({
    by: ['teamId'],
    where: { status: 'SOLVED', phase: { esBonus: false } },
    _count: { _all: true },
  });
  return new Map(filas.map((f) => [f.teamId, f._count._all]));
}
