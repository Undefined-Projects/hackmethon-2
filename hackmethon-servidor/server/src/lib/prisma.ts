import { PrismaClient } from '@prisma/client';

// Singleton: con `tsx watch` el módulo se recarga y sin esto
// se abrirían decenas de conexiones al archivo SQLite.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
