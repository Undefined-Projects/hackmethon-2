// ============================================================
//  El plano del auditorio MENLO.
//
//  Una fila única con el plano entero en JSON (ver schema.prisma).
//  Aquí vive lo que el servidor sabe del plano: cómo es uno vacío, qué
//  acepta al guardar y cómo leerlo sin que un JSON roto tumbe el panel.
// ============================================================

import { z } from 'zod';
import { prisma } from './prisma.js';
import { TIPOS_PLANO, type Plano } from './events.js';

const ID = 'singleton';

/** Lo que aguanta el plano. Un auditorio con cuatrocientas piezas ya no
 *  es un auditorio; es alguien pegando sin querer el mismo bloque. */
const MAX_ELEMENTOS = 400;
const MEDIDA = z.number().finite();

const Elemento = z.object({
  id: z.string().min(1).max(40),
  tipo: z.enum(TIPOS_PLANO),
  x: MEDIDA.min(-50).max(550),
  y: MEDIDA.min(-50).max(550),
  w: MEDIDA.min(0.05).max(500),
  h: MEDIDA.min(0.05).max(500),
  rot: MEDIDA.min(-360).max(360),
  redonda: z.boolean().optional(),
  teamId: z.string().max(40).nullable().optional(),
  etiqueta: z.string().max(60).optional(),
});

const PlanoEntrada = z.object({
  nombre: z.string().trim().min(1).max(60),
  ancho: MEDIDA.min(2).max(500),
  alto: MEDIDA.min(2).max(500),
  elementos: z.array(Elemento).max(MAX_ELEMENTOS),
});

/**
 * El de partida: la caja de la sala, el escenario delante con su
 * pantalla y las puertas al fondo. Las mesas no: dónde van es justo lo
 * que hay que mapear, y unas inventadas habría que borrarlas una a una.
 */
export function planoInicial(): Plano {
  return {
    nombre: 'Auditorio MENLO',
    ancho: 30, alto: 20,
    elementos: [
      { id: 'escenario', tipo: 'escenario', x: 15, y: 1.75, w: 12, h: 3.5, rot: 0, etiqueta: 'ESCENARIO' },
      { id: 'pantalla', tipo: 'pantalla', x: 15, y: 0.25, w: 8, h: 0.3, rot: 0, etiqueta: 'PANTALLA' },
      { id: 'puerta-1', tipo: 'puerta', x: 4, y: 19.85, w: 2, h: 0.3, rot: 0, etiqueta: 'ENTRADA' },
      { id: 'puerta-2', tipo: 'puerta', x: 26, y: 19.85, w: 2, h: 0.3, rot: 0, etiqueta: 'ENTRADA' },
    ],
    guardadoAt: null,
  };
}

/** El plano guardado, o el de partida si no hay ninguno o está roto.
 *  Sin caché a propósito: es una fila de SQLite, y una copia en memoria
 *  se quedaría vieja en cuanto alguien tocara la base por fuera (un
 *  `db:reset` con el servidor en marcha, una prueba que restaura). */
export async function leerPlano(): Promise<Plano> {
  const fila = await prisma.plano.findUnique({ where: { id: ID } });
  if (!fila) return planoInicial();
  try {
    const datos = PlanoEntrada.safeParse(JSON.parse(fila.datosJson));
    if (!datos.success) return planoInicial();
    return { ...datos.data, guardadoAt: fila.updatedAt.getTime() };
  } catch {
    return planoInicial();
  }
}

/** Valida y guarda. Lanza `PLANO_INVALIDO` con la primera queja de zod. */
export async function escribirPlano(crudo: unknown): Promise<number> {
  const r = PlanoEntrada.safeParse(crudo);
  if (!r.success) {
    const q = r.error.issues[0];
    throw new Error(`PLANO_INVALIDO: ${q.path.join('.')} ${q.message}`);
  }
  const ids = new Set<string>();
  for (const e of r.data.elementos) {
    if (ids.has(e.id)) throw new Error(`PLANO_INVALIDO: id repetido ${e.id}`);
    ids.add(e.id);
  }
  const datosJson = JSON.stringify(r.data);
  const fila = await prisma.plano.upsert({
    where: { id: ID },
    create: { id: ID, datosJson },
    update: { datosJson },
  });
  return fila.updatedAt.getTime();
}
