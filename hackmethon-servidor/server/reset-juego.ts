import { prisma } from './src/lib/prisma.js';
await prisma.teamPhaseProgress.updateMany({ data: { status: 'PENDING', attempts: 0, stateJson: '{}', unlockedAt: null, availableAt: null, enteredAt: null, firstMoveAt: null, solvedAt: null, pausedMs: 0, timeToSolveMs: null, activeMs: null } });
await prisma.phase.updateMany({ data: { status: 'LOCKED', openedAt: null, closedAt: null } });
await prisma.commandLog.deleteMany({});
await prisma.team.updateMany({ data: { ultimoAtaqueAt: null, ultimoObjetivoId: null, ultimoAtaquePausaMs: 0, tickets: 0, escudoAt: null, escudoPausaMs: 0, ultimoSuperAt: null, ultimoSuperPausaMs: 0 } });
await prisma.eventState.update({ where: { id: 'singleton' }, data: { status: 'LOBBY', pausedAt: null, totalPausedMs: 0, shuffleCount: 0, startedAt: null, focusPhaseId: null, libreAcceso: false } });
for (const t of await prisma.team.findMany({ include: { members: { orderBy: { displayName: 'asc' } } } })) {
  const roles = ['DATOS', 'TERMINAL', 'PANTALLA'];
  await Promise.all(t.members.map((m, i) => prisma.user.update({ where: { id: m.id }, data: { role: roles[i], previousRole: null, connected: false, socketId: null } })));
}
console.log('limpio');
await prisma.$disconnect();
