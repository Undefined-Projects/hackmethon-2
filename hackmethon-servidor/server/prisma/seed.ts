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

// El recorrido del evento: seis fases, una por parte del cuerpo de la
// máquina —piernas, brazos, torso y cabeza—, y el corazón como bonus. Las
// dos primeras son para cualquiera (La Maraña, una flecha como Karel; El
// Reflejo, condicionales); desde la tercera empieza el filtro. Muro de
// Repetición y El Rastro siguen en el código, pero fuera del recorrido:
// este seed las borra de la base.
const PHASES = [
  {
    key: 'fase-2-enemigo',
    order: 1,
    title: 'Fase 1 — La Maraña',
    description: 'SECUENCIAS Y CICLOS · Guiar un brote por la maraña de la pierna izquierda. '
               + 'Dos capas: el semillero, para calentar, y el seto, donde el camino no cabe sin un ciclo.',
    teaser: 'Para entrar en la máquina hay que cruzar su pierna, y con los años se volvió una maraña.',
  },
  {
    key: 'fase-1-acceso',
    order: 2,
    title: 'Fase 2 — El Reflejo',
    description: 'CONDICIONALES · Reescribir el sistema inmune de la pierna para que pasen '
               + 'nuestras esporas y se marchite. Dos capas: la rótula y la muda.',
    teaser: 'La pierna decide qué la toca antes de pensarlo.',
  },
  {
    key: 'fase-4-nucleo',
    order: 3,
    title: 'Fase 3 — Núcleo Modular',
    description: 'FUNCIONES · Funciones que dependen de otras, y lo que pasa cuando no comprueban lo que reciben.',
    teaser: 'El brazo izquierdo se protege: cada pieza confía en la de abajo.',
  },
  {
    key: 'fase-mano-listas',
    order: 4,
    title: 'Fase 4 — La Mano',
    description: 'LISTAS · La mano guarda todo en listas. Dos capas: las falanges, una lista de listas, '
               + 'y los tendones, que hay que ordenar con dos criterios y pocos movimientos.',
    teaser: 'Con esta mano les ofrezco lo que quieran.',
  },
  {
    key: 'fase-5-boveda',
    order: 5,
    title: 'Fase 5 — La Bóveda de los Recuerdos',
    description: 'BASES DE DATOS · El torso guarda mil recuerdos. Dos capas: el embudo, una consulta '
               + 'con condiciones, y el recuerdo compartido, dos tablas que hay que unir y agrupar.',
    teaser: 'No me hagan recordar.',
  },
  // La FINAL. Cierra el evento y es la única con reloj propio: la sala
  // tiene un rato contado para abortar el lanzamiento, y ese rato se ve
  // en la pared encima de un cohete. Media hora de serie; el admin la
  // cambia desde el panel.
  {
    key: 'fase-6-puente',
    order: 6,
    title: 'Fase 6 — El Asalto a la Mente',
    description: 'APIS · La final. Dentro de la mente, a peticiones: destruir sus facultades y apagar su '
               + 'voluntad mientras contraataca.',
    teaser: 'Por favor, todavía no.',
    esFinal: true,
    limiteMs: 30 * 60_000,
  },
  // BONUS. La segunda mitad de la vieja Maraña: un seguidor de pared a
  // oscuras, con cuatro brotes. Dificultad media: para los equipos que
  // terminan antes, no cuenta para la meta y se abre solo si sobra tiempo.
  {
    key: 'fase-bonus-espesura',
    order: 7,
    title: 'Bonus — La Espesura',
    description: 'CICLOS QUE DECIDEN · Un mismo programa tiene que llevar a cuatro brotes al claro, '
               + 'a oscuras y desde cuatro esquinas.',
    teaser: 'El corazón está en el centro, y alrededor creció la espesura.',
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
