// ============================================================
//  Las luces, desde el lado del evento.
//
//  Dos cosas viven aquí:
//
//  1. El AUTOMATISMO. Una tabla de reglas «cuando pase esto, manda este
//     código por estos pines», y el disparador que las cumple. Es lo
//     único que no podía estar en la carpeta `Luces/`: allí no se sabe
//     qué es una fase ni un equipo.
//
//  2. El MANDO A DISTANCIA del panel: los mismos botones y diagnósticos
//     que ya tenía la interfaz de Luces, pero pasando por aquí para que
//     el panel no tenga que alcanzar al servidor de Python —que vive en
//     127.0.0.1 y no es visible desde el navegador de nadie cuando el
//     front lo sirve Vercel.
//
//  Regla de oro de todo el archivo: UNA LUZ NUNCA PARA EL JUEGO. Si el
//  servidor de Luces está caído, el Arduino desenchufado o la onda
//  tarda tres segundos, el evento sigue exactamente igual. Todo lo que
//  dispara una regla va sin esperar y con el error tragado.
// ============================================================

import { prisma } from '../lib/prisma.js';
import {
  EVENTOS_LUZ, LucesCaida, luces,
  type BotonLuz, type EventoLuz,
} from '../lib/luces.js';
import type { LineaLuz, PanelLucesView } from '../lib/events.js';
import { ADMIN_ROOM } from './rooms.js';
import { getIO } from './server.js';

// ---------- bitácora ----------
//
// Lo que ha hecho el automatismo, para verlo en el panel. En memoria y
// con tope: es para mirar durante el evento, no un registro histórico.

const TOPE_BITACORA = 40;
const bitacora: LineaLuz[] = [];

function apuntar(linea: Omit<LineaLuz, 'at'>): void {
  bitacora.unshift({ at: Date.now(), ...linea });
  if (bitacora.length > TOPE_BITACORA) bitacora.length = TOPE_BITACORA;
  // El panel se entera solo: es la única forma de ver si una regla
  // saltó de verdad sin estar mirando la tira de LEDs.
  try {
    getIO().to(ADMIN_ROOM).emit('luces:bitacora', bitacora[0]);
  } catch { /* el io puede no estar listo al arrancar */ }
}

export const bitacoraLuces = (): LineaLuz[] => [...bitacora];

// ---------- la cola ----------
//
// El puerto serie es uno y las ondas duran lo que duran. Si diez
// equipos resuelven a la vez, diez peticiones simultáneas se pelean y
// la última espera por todas. Se emiten de una en una, y si la cola se
// desborda se descartan las nuevas: más vale perder una luz que dejar
// el aparato emitiendo cosas de hace un minuto.

const TOPE_COLA = 12;
let cola: Promise<unknown> = Promise.resolve();
let enCola = 0;

function encolar(nombre: string, evento: string, fn: () => Promise<void>): void {
  if (enCola >= TOPE_COLA) {
    apuntar({ evento, boton: nombre, pines: [], ok: false, detalle: 'cola llena: luz descartada' });
    return;
  }
  enCola++;
  cola = cola
    .then(fn)
    .catch(() => { /* ya se apuntó dentro */ })
    .finally(() => { enCola--; });
}

// ---------- el disparador ----------

/**
 * Algo pasó en el evento. Si hay reglas para eso, se emiten sus luces.
 *
 * NO devuelve promesa a propósito: quien lo llama —abrir una fase,
 * resolverla, atacar— no tiene que esperar a una tira de LEDs, y sobre
 * todo no puede fallar porque ella falle.
 */
export function dispararLuces(evento: EventoLuz, ctx: { teamId?: string | null } = {}): void {
  void (async () => {
    const reglas = await prisma.luzRegla.findMany({
      where: {
        evento,
        activa: true,
        // Una regla sin equipo vale para todos; una con equipo, solo
        // para el suyo.
        OR: [{ teamId: null }, { teamId: ctx.teamId ?? '∅' }],
      },
      orderBy: { creadaAt: 'asc' },
    });
    if (reglas.length === 0) return;

    for (const regla of reglas) {
      const pines = JSON.parse(regla.pinesJson) as number[];
      encolar(regla.botonNombre, evento, async () => {
        try {
          // Con pines propios va la onda cruda —hay que leer el botón
          // para sacarla—; sin ellos basta con pedir el botón y que
          // Luces decida por dónde.
          if (pines.length > 0) {
            const { botones } = await luces.botones();
            const boton = botones.find((b) => b.id === regla.botonId);
            if (!boton) throw new LucesCaida('ese botón ya no existe en Luces');
            await luces.enviarCrudo({
              pulsos: boton.pulsos, freq: boton.freq,
              repeticiones: boton.repeticiones, gap_ms: boton.gap_ms, pines,
            });
          } else {
            await luces.enviarBoton(regla.botonId);
          }
          apuntar({ evento, boton: regla.botonNombre, pines, ok: true, detalle: 'emitido' });
        } catch (e) {
          apuntar({
            evento, boton: regla.botonNombre, pines, ok: false,
            detalle: e instanceof Error ? e.message : 'error',
          });
        }
      });
    }
  })().catch(() => { /* ni un fallo de base de datos puede tumbar el juego */ });
}

// ---------- el vigía de la final ----------
//
// `FINAL_DERROTA` es el único evento que no lo provoca nadie: pasa
// cuando un reloj llega a cero. La proyección lo deduce sola en el
// navegador, pero una luz la enciende el servidor, así que aquí hace
// falta alguien mirando.
//
// Se mira cada dos segundos y SOLO mientras la final está abierta y sin
// resolver. Un temporizador de treinta minutos habría que rehacerlo
// cada vez que el admin cambia el límite o pausa el evento; preguntar
// se lleva las dos cosas gratis.

const CADA_MS = 2_000;
let vigia: ReturnType<typeof setInterval> | null = null;
let derrotaAvisada: string | null = null;

async function mirarLaFinal(): Promise<void> {
  const fase = await prisma.phase.findFirst({ where: { esFinal: true } });
  if (!fase?.limiteMs || !fase.openedAt || fase.status !== 'ACTIVE') return;
  if (derrotaAvisada === fase.id) return;

  const [event, progresos] = await Promise.all([
    prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } }),
    prisma.teamPhaseProgress.findMany({
      where: { phaseId: fase.id },
      select: { pausedMs: true, solvedAt: true },
    }),
  ]);
  // Si alguien llegó, no hay derrota que anunciar.
  if (progresos.some((p) => p.solvedAt)) { derrotaAvisada = fase.id; return; }

  const { finalRestanteMs } = await import('../lib/timing.js');
  const restante = finalRestanteMs(fase, progresos, event);
  if (restante !== null && restante <= 0) {
    derrotaAvisada = fase.id;
    dispararLuces('FINAL_DERROTA');
  }
}

export function arrancarVigiaFinal(): void {
  if (vigia) return;
  vigia = setInterval(() => { void mirarLaFinal().catch(() => {}); }, CADA_MS);
  // No mantiene el proceso vivo por sí solo: es un adorno, no un trabajo.
  vigia.unref?.();
}

/** Al reabrir o reiniciar, la final vuelve a poder perderse. */
export function olvidarDerrota(): void {
  derrotaAvisada = null;
}

// ---------- lo que pide el panel ----------

export async function panelDeLuces(): Promise<PanelLucesView> {
  // El estado de la placa se pide aparte y sin reventar: que el
  // servidor de Luces esté caído no puede impedir ver y editar las
  // reglas, que viven en ESTA base de datos.
  const [estado, config, botones] = await Promise.all([
    luces.estado().catch((e) => ({ conectado: false, motivo: String(e.message ?? e) })),
    luces.config().catch(() => ({ pines: [], pines_validos: [] })),
    luces.botones().then((r) => r.botones).catch(() => [] as BotonLuz[]),
  ]);

  const reglas = await prisma.luzRegla.findMany({
    orderBy: { creadaAt: 'asc' },
    include: { team: { select: { name: true } } },
  });

  return {
    url: (await import('../lib/luces.js')).LUCES_URL,
    estado,
    config,
    // Las ondas no viajan: son cientos de números por botón y el panel
    // solo necesita el nombre para pintar una fila y un id para pulsar.
    botones: botones.map((b) => ({
      id: b.id, nombre: b.nombre, pines: b.pines,
      freq: b.freq, repeticiones: b.repeticiones, gap_ms: b.gap_ms,
      pulsos: b.pulsos?.length ?? 0,
    })),
    eventos: EVENTOS_LUZ.map((e) => ({ ...e })),
    reglas: reglas.map((r) => ({
      id: r.id, evento: r.evento, teamId: r.teamId, equipo: r.team?.name ?? null,
      botonId: r.botonId, botonNombre: r.botonNombre,
      pines: JSON.parse(r.pinesJson) as number[], activa: r.activa,
    })),
    bitacora: bitacoraLuces(),
  };
}


// ---------- las reglas ----------

/** Los pines que el firmware acepta. Se vuelven a validar aquí porque
 *  una regla se guarda en ESTA base de datos y puede crearse cuando el
 *  servidor de Luces no está para opinar. */
const PINES_VALIDOS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

function limpiarPines(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const fuera = v.map(Number).filter((n) => !PINES_VALIDOS.includes(n));
  if (fuera.length > 0) throw new Error(`PIN_INVALIDO:${fuera[0]}`);
  return [...new Set(v.map(Number))].sort((a, b) => a - b);
}

export async function crearRegla(p: {
  evento?: string; teamId?: string | null; botonId?: string; pines?: number[];
}) {
  const evento = String(p.evento ?? '');
  if (!EVENTOS_LUZ.some((e) => e.clave === evento)) throw new Error('EVENTO_DESCONOCIDO');
  if (!p.botonId) throw new Error('FALTA_BOTON');
  const pines = limpiarPines(p.pines);

  // El nombre del botón se copia al crear la regla. Hace falta el
  // servidor de Luces para saberlo, y es razonable: nadie elige de una
  // lista que no puede ver.
  const { botones } = await luces.botones();
  const boton = botones.find((b) => b.id === p.botonId);
  if (!boton) throw new Error('BOTON_DESCONOCIDO');

  const teamId = p.teamId ?? null;
  if (teamId) {
    const equipo = await prisma.team.findUnique({ where: { id: teamId } });
    if (!equipo) throw new Error('EQUIPO_DESCONOCIDO');
    if (!EVENTOS_LUZ.find((e) => e.clave === evento)?.porEquipo) {
      throw new Error('ESE_EVENTO_NO_LLEVA_EQUIPO');
    }
  }

  const regla = await prisma.luzRegla.create({
    data: {
      evento, teamId, botonId: boton.id, botonNombre: boton.nombre,
      pinesJson: JSON.stringify(pines),
    },
  });
  return { id: regla.id };
}

export async function borrarRegla(id: string) {
  await prisma.luzRegla.delete({ where: { id } });
  return { borrada: id };
}

export async function alternarRegla(id: string) {
  const r = await prisma.luzRegla.findUniqueOrThrow({ where: { id } });
  const activa = !r.activa;
  await prisma.luzRegla.update({ where: { id }, data: { activa } });
  return { activa };
}

/** Emite la luz de una regla AHORA, sin esperar a que pase su evento. */
export async function probarRegla(id: string) {
  const r = await prisma.luzRegla.findUniqueOrThrow({ where: { id } });
  const pines = JSON.parse(r.pinesJson) as number[];
  if (pines.length > 0) {
    const { botones } = await luces.botones();
    const boton = botones.find((b) => b.id === r.botonId);
    if (!boton) throw new Error('BOTON_DESCONOCIDO');
    await luces.enviarCrudo({
      pulsos: boton.pulsos, freq: boton.freq,
      repeticiones: boton.repeticiones, gap_ms: boton.gap_ms, pines,
    });
  } else {
    await luces.enviarBoton(r.botonId);
  }
  apuntar({
    evento: `${r.evento} (ensayo)`, boton: r.botonNombre, pines,
    ok: true, detalle: 'emitido a mano desde el panel',
  });
  return { boton: r.botonNombre, pines };
}

// ---------- el mando a distancia del panel ----------

export async function enviarALaPlaca(p: {
  botonId?: string; pulsos?: number[] | string; pines?: number[];
  freq?: number; repeticiones?: number; gap_ms?: number;
}) {
  if (p.botonId) {
    const r = await luces.enviarBoton(p.botonId);
    apuntar({
      evento: 'a mano', boton: String(r.boton ?? p.botonId),
      pines: (r.pines as number[]) ?? [], ok: r.ok !== false,
      detalle: String(r.aviso ?? 'emitido desde el panel'),
    });
    return r;
  }
  const r = await luces.enviarCrudo({
    pulsos: p.pulsos, pines: p.pines, freq: p.freq,
    repeticiones: p.repeticiones, gap_ms: p.gap_ms,
  });
  apuntar({
    evento: 'a mano', boton: '(sin guardar)',
    pines: (r.pines as number[]) ?? [], ok: r.ok !== false,
    detalle: String(r.aviso ?? 'onda cruda emitida desde el panel'),
  });
  return r;
}

export async function pruebaDeLaPlaca(p: {
  op: string; pines?: number[]; ms?: number; timeoutMs?: number;
}) {
  switch (p.op) {
    case 'probar':
      return luces.probarPines(limpiarPines(p.pines));
    case 'identificar':
      return luces.identificar(limpiarPines(p.pines), Math.min(3000, Math.max(1, Number(p.ms ?? 1500))));
    case 'nivel':
      return luces.nivel();
    case 'capturar':
      // Aprender del mando: se queda esperando a que alguien apunte.
      return luces.capturar(Math.min(30_000, Math.max(1000, Number(p.timeoutMs ?? 15_000))));
    default:
      throw new Error('PRUEBA_DESCONOCIDA');
  }
}

export async function guardarPines(pines: unknown) {
  return luces.guardarConfig(limpiarPines(pines));
}

export async function botonDeLuces(p: { op: string; id?: string; datos?: unknown }) {
  switch (p.op) {
    case 'crear':
      return luces.crearBoton(p.datos);
    case 'editar':
      if (!p.id) throw new Error('FALTA_ID');
      return luces.editarBoton(p.id, p.datos);
    case 'borrar': {
      if (!p.id) throw new Error('FALTA_ID');
      const r = await luces.borrarBoton(p.id);
      // Las reglas que apuntaban a ese botón se desactivan en vez de
      // borrarse: así se ve que quedaron huérfanas y por qué dejaron de
      // funcionar, en lugar de desaparecer sin dejar rastro.
      await prisma.luzRegla.updateMany({ where: { botonId: p.id }, data: { activa: false } });
      return r;
    }
    default:
      throw new Error('OPERACION_DESCONOCIDA');
  }
}
