// ============================================================
//  Las luces de la sala.
//
//  Hay un Arduino con emisores infrarrojos apuntando a las tiras de LED
//  y al reflector, y un servidor propio en Python —la carpeta `Luces/`—
//  que guarda las ondas capturadas del mando y las emite. Ese servidor
//  se queda como está y aquí NO se reimplementa: las ondas son trabajo
//  manual de una tarde con un mando en la mano, tienen sus respaldos, y
//  el puerto serie es un recurso único que allí ya está bajo candado.
//
//  Lo que se hace desde aquí es lo que solo este lado puede hacer:
//  saber QUÉ acaba de pasar en el evento y de qué equipo, y traducirlo
//  a «manda este código por este pin».
//
//  El reparto de responsabilidades, entonces:
//
//    este servidor  ->  qué pasó y qué luz le toca   (las reglas)
//    Luces/         ->  cómo se emite una onda        (el actuador)
//    Arduino        ->  la luz                        (el músculo)
// ============================================================

/** Dónde escucha el servidor de Luces. Local por defecto: el Arduino
 *  está enchufado a esta misma máquina. */
export const LUCES_URL = (process.env.LUCES_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');

/**
 * Las acciones del evento a las que se puede colgar una luz.
 *
 * `porEquipo` marca las que llevan equipo, y por tanto las que se
 * pueden acotar a uno: «cuando ALFA pase una fase» es distinto de
 * «cuando alguien pase una fase».
 */
export const EVENTOS_LUZ = [
  { clave: 'EVENTO_ARRANCA', rotulo: 'Arranca el evento', porEquipo: false },
  { clave: 'EVENTO_PAUSA', rotulo: 'Se pausa el evento', porEquipo: false },
  { clave: 'EVENTO_REANUDA', rotulo: 'Se reanuda el evento', porEquipo: false },
  { clave: 'EVENTO_FINALIZA', rotulo: 'Se termina el evento', porEquipo: false },

  { clave: 'FASE_ABIERTA', rotulo: 'El admin abre una fase', porEquipo: false },
  { clave: 'FASE_CERRADA', rotulo: 'El admin cierra una fase', porEquipo: false },
  { clave: 'FASE_DESTACADA', rotulo: 'El admin destaca una fase', porEquipo: false },

  { clave: 'FASE_RESUELTA', rotulo: 'Un equipo pasa una fase', porEquipo: true },
  { clave: 'EQUIPO_META', rotulo: 'Un equipo llega a la meta', porEquipo: true },

  { clave: 'FINAL_ARRANCA', rotulo: 'Arranca la cuenta atrás de la final', porEquipo: false },
  { clave: 'FINAL_VICTORIA', rotulo: 'Se aborta el lanzamiento', porEquipo: true },
  { clave: 'FINAL_DERROTA', rotulo: 'El cohete despega: se acabó el tiempo', porEquipo: false },

  { clave: 'ROLES_MEZCLADOS', rotulo: 'Se mezclan los roles', porEquipo: false },
  { clave: 'AVERIA', rotulo: 'Avería provocada desde el panel', porEquipo: true },
  { clave: 'ATAQUE', rotulo: 'Un equipo ataca a otro', porEquipo: true },
  { clave: 'SUPER_ATAQUE', rotulo: 'Un equipo lanza un súper ataque', porEquipo: true },
  { clave: 'ESCUDO', rotulo: 'Un equipo activa su escudo', porEquipo: true },
] as const;

export type EventoLuz = (typeof EVENTOS_LUZ)[number]['clave'];

export const esEventoLuz = (v: unknown): v is EventoLuz =>
  EVENTOS_LUZ.some((e) => e.clave === v);

// ---------- el cliente del servidor de Luces ----------

export class LucesCaida extends Error {}

/**
 * Una llamada al servidor de Luces, con tiempo límite.
 *
 * El tope importa más de lo que parece: `CAPTURE` se queda esperando a
 * que alguien apunte un mando, y `SEND` tarda lo que dure la onda. Sin
 * un límite explícito, una petición colgada se lleva por delante el
 * manejador del socket que la lanzó.
 */
async function pedir<T>(
  ruta: string,
  opciones: { metodo?: string; cuerpo?: unknown; topeMs?: number } = {},
): Promise<T> {
  const { metodo = 'GET', cuerpo, topeMs = 8_000 } = opciones;
  const corte = AbortSignal.timeout(topeMs);

  let respuesta: Response;
  try {
    respuesta = await fetch(`${LUCES_URL}${ruta}`, {
      method: metodo,
      signal: corte,
      headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch (e) {
    // Lo más probable en un evento: nadie arrancó el servidor de Luces.
    // Decirlo así ahorra buscar el fallo en el sitio equivocado.
    const motivo = e instanceof Error && e.name === 'TimeoutError'
      ? `no contestó en ${topeMs} ms`
      : 'no se pudo conectar';
    throw new LucesCaida(
      `El servidor de Luces ${motivo} (${LUCES_URL}). Arráncalo con: cd Luces/servidor && python3 servidor.py`,
    );
  }

  const texto = await respuesta.text();
  let datos: unknown;
  try { datos = texto ? JSON.parse(texto) : {}; } catch { datos = {}; }

  if (!respuesta.ok) {
    const error = (datos as { error?: string }).error ?? `HTTP ${respuesta.status}`;
    throw new LucesCaida(error);
  }
  return datos as T;
}

export type EstadoLuces = {
  conectado: boolean;
  puerto?: string;
  version?: string;
  motivo?: string;
  puertos?: string[];
};

export type BotonLuz = {
  id: string;
  nombre: string;
  pulsos: number[];
  pines: number[];
  freq: number;
  repeticiones: number;
  gap_ms: number;
};

export type ConfigLuces = { pines: number[]; pines_validos: number[] };

export const luces = {
  estado: () => pedir<EstadoLuces>('/api/estado', { topeMs: 6_000 }),
  config: () => pedir<ConfigLuces>('/api/config'),
  guardarConfig: (pines: number[]) =>
    pedir<ConfigLuces>('/api/config', { metodo: 'PUT', cuerpo: { pines } }),

  botones: () => pedir<{ botones: BotonLuz[] }>('/api/botones'),
  crearBoton: (datos: unknown) =>
    pedir<BotonLuz>('/api/botones', { metodo: 'POST', cuerpo: datos }),
  editarBoton: (id: string, datos: unknown) =>
    pedir<BotonLuz>(`/api/botones/${encodeURIComponent(id)}`, { metodo: 'PATCH', cuerpo: datos }),
  borrarBoton: (id: string) =>
    pedir<{ borrado: BotonLuz }>(`/api/botones/${encodeURIComponent(id)}`, { metodo: 'DELETE' }),

  // Emitir puede tardar: la onda dura lo que dura, por sus repeticiones.
  enviarBoton: (id: string) =>
    pedir<Record<string, unknown>>(`/api/botones/${encodeURIComponent(id)}/enviar`, {
      metodo: 'POST', topeMs: 20_000,
    }),
  enviarCrudo: (cuerpo: unknown) =>
    pedir<Record<string, unknown>>('/api/enviar', { metodo: 'POST', cuerpo, topeMs: 20_000 }),

  probarPines: (pines: number[]) =>
    pedir<Record<string, unknown>>('/api/pines/probar', { metodo: 'POST', cuerpo: { pines }, topeMs: 15_000 }),
  identificar: (pines: number[], ms: number) =>
    pedir<Record<string, unknown>>('/api/pines/identificar', {
      metodo: 'POST', cuerpo: { pines, ms }, topeMs: ms + 10_000,
    }),
  // Aprender del mando: se queda esperando a que alguien apunte y pulse.
  capturar: (timeoutMs: number) =>
    pedir<{ pulsos: number[]; total: number }>('/api/capturar', {
      metodo: 'POST', cuerpo: { timeout_ms: timeoutMs }, topeMs: timeoutMs + 10_000,
    }),
  nivel: () => pedir<Record<string, number>>('/api/nivel'),
};
