import { PrismaClient } from '@prisma/client';
import { ROLES } from '../src/lib/constants.js';

const prisma = new PrismaClient();

// Diez equipos, con el alfabeto de la OTAN. Son nombres PROVISIONALES:
// el panel permite renombrarlos, y lo normal es que el día del evento
// cada uno acabe llamándose como quiera su equipo.
const TEAMS = [
  'ALFA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO',
  'FOXTROT', 'GOLF', 'HOTEL', 'INDIA', 'JULIETT',
];

const PHASES = [
  // El Reflejo (antes Control de Acceso) abre el recorrido y El Enemigo va detrás. Es el
  // orden que pide la curva: la primera fase enseña una idea sola —una
  // condición decide— y la segunda pide cruzarla con datos de otra
  // estación. Al revés, la sala empezaba por la fase con más piezas.
  {
    key: 'fase-1-acceso',
    order: 1,
    title: 'Fase 1 — El Reflejo',
    description: 'CONDICIONALES · Reescribir el sistema inmune de la pierna para que pasen '
               + 'nuestras esporas y se marchite. Dos capas: la rótula y la muda.',
    teaser: 'La pierna decide qué la toca antes de pensarlo.',
  },
  {
    key: 'fase-2-enemigo',
    order: 2,
    title: 'Fase 2 — El Enemigo',
    description: 'Aislar todas las cuentas con peticiones inválidas durante el ataque.',
    teaser: 'Alguien está tocando puertas que no son suyas.',
  },
  {
    key: 'fase-3-muro',
    order: 3,
    title: 'Fase 3 — Muro de Repetición',
    description: 'CICLOS · Enseñarle a la máquina a hacer lo mismo muchas veces, sin cansarse.',
    teaser: 'Mil quinientos noventa golpes. A mano no da tiempo.',
  },
  {
    key: 'fase-4-nucleo',
    order: 4,
    title: 'Fase 4 — Núcleo Modular',
    description: 'FUNCIONES · Encontrar la pieza rota, arreglarla una vez y que sirva en todas.',
    teaser: 'El código del enemigo está partido en piezas que se llaman entre sí.',
  },
  {
    key: 'fase-5-boveda',
    order: 5,
    title: 'Fase 5 — Bóveda de Credenciales',
    description: 'BASES DE DATOS · Preguntarle bien a una base de datos es más rápido que '
               + 'buscar con los ojos.',
    teaser: 'Miles de registros y uno solo sirve.',
  },
  // La FINAL. Cierra el evento y es la única con reloj propio: la sala
  // tiene un rato contado para abortar el lanzamiento, y ese rato se ve
  // en la pared encima de un cohete. Media hora de serie; el admin la
  // cambia desde el panel.
  {
    key: 'fase-6-puente',
    order: 6,
    title: 'Fase 6 — Puente de Lanzamiento',
    description: 'APIS · Mandarle el mensaje correcto y el ataque se cancela. El equivocado lo adelanta.',
    teaser: 'La última capa habla con el exterior.',
    esFinal: true,
    limiteMs: 30 * 60_000,
  },
  // BONUS. Un reto forense completo y probado que no entra en el
  // recorrido de programación: va detrás de la final, no cuenta para la
  // meta y se abre solo si sobra tiempo.
  {
    key: 'fase-7-rastro',
    order: 7,
    title: 'Fase 7 — El Rastro (bonus)',
    description: 'Seguir el movimiento lateral del atacante hasta la máquina por la que entró.',
    teaser: 'No entró por donde crees.',
    esBonus: true,
  },
];

async function main() {
  // Estado global (fila única e idempotente).
  await prisma.eventState.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', status: 'LOBBY' },
  });

  // `order` es unico, asi que recolocar una fase choca con la que ocupa su
  // hueco. Se vacian los huecos con numeros negativos —que nadie usa— antes
  // de repartirlos otra vez. Sin esto, cambiar el recorrido revienta el seed.
  const vigentes = PHASES.map((p) => p.key);
  await prisma.phase.deleteMany({ where: { key: { notIn: vigentes } } });
  for (const [i, fila] of (await prisma.phase.findMany({ orderBy: { order: 'asc' } })).entries()) {
    await prisma.phase.update({ where: { id: fila.id }, data: { order: -(i + 1) } });
  }

  for (const p of PHASES) {
    // El recorrido lo define el seed, así que `esFinal`, `esBonus` y el
    // límite se aplican también a una base ya sembrada. Ojo: volver a
    // sembrar devuelve la cuenta atrás a su valor de serie, aunque el
    // admin la hubiera cambiado desde el panel.
    await prisma.phase.upsert({
      where: { key: p.key },
      update: {
        title: p.title, description: p.description, teaser: p.teaser, order: p.order,
        esFinal: p.esFinal ?? false, esBonus: p.esBonus ?? false, limiteMs: p.limiteMs ?? null,
      },
      create: { ...p, status: 'LOCKED' },
    });
  }

  // Admin sin equipo.
  await prisma.user.upsert({
    where: { accessCode: process.env.ADMIN_CODE ?? 'ADMIN-2026' },
    update: {},
    create: {
      displayName: 'Administrador',
      accessCode: process.env.ADMIN_CODE ?? 'ADMIN-2026',
      isAdmin: true,
      role: 'PANTALLA',
    },
  });

  for (const name of TEAMS) {
    const team = await prisma.team.upsert({
      where: { name },
      update: {},
      create: { name, joinCode: name },
    });

    // 3 integrantes, uno por rol. El índice fija el rol inicial.
    for (let i = 0; i < ROLES.length; i++) {
      const accessCode = `${name}-${i + 1}`;
      await prisma.user.upsert({
        where: { accessCode },
        update: { teamId: team.id },
        create: {
          displayName: `${name} · Jugador ${i + 1}`,
          accessCode,
          role: ROLES[i],
          teamId: team.id,
        },
      });
    }

    // Progreso PENDING para cada fase.
    const phases = await prisma.phase.findMany();
    for (const phase of phases) {
      await prisma.teamPhaseProgress.upsert({
        where: { teamId_phaseId: { teamId: team.id, phaseId: phase.id } },
        update: {},
        create: { teamId: team.id, phaseId: phase.id },
      });
    }
  }

  const [teams, users, phases] = await Promise.all([
    prisma.team.count(),
    prisma.user.count(),
    prisma.phase.count(),
  ]);
  console.log(`Seed listo → ${teams} equipos, ${users} usuarios, ${phases} fases.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
