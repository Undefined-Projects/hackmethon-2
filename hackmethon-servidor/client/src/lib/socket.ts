import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/events';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// ============================================================
//  ¿Dónde vive el backend?
//
//  Hay dos escenarios y no se parecen en nada:
//
//  - RED LOCAL: el cliente y la API viven en la misma máquina, y cada
//    portátil entra por la IP del servidor. Se deduce del host por el
//    que se abrió la página (`10.0.0.7:5173` → `10.0.0.7:4000`), así el
//    mismo build sirve para toda la sala sin codificar una IP que
//    cambia en cada local.
//
//  - INTERNET: la página la sirve Vercel y la API vive detrás de un
//    túnel. Aquí deducir el host es justo lo que NO hay que hacer:
//    daría `mi-app.vercel.app:4000`, que no existe, y el cliente se
//    quedaría eternamente en «enlazando» sin decir por qué.
//
//  De ahí la cadena de prioridades de abajo. Lo importante es que el
//  destino se puede cambiar SIN RECOMPILAR: un túnel gratuito estrena
//  URL en cada arranque, y reconstruir el front en mitad de un evento
//  para perseguir esa URL no es un plan.
// ============================================================

const API_PORT = import.meta.env.VITE_API_PORT ?? '4000';
const PARAM = 'api';
const LS_KEY = 'hm:api';

/** Sin protocolo asumimos `https` (un túnel nunca es texto plano), y
 *  fuera la barra final: `https://x.com/` + `/socket.io` da doble barra. */
function normalizar(url: string): string {
  const limpia = url.trim().replace(/\/+$/, '');
  if (!limpia) return '';
  return /^https?:\/\//i.test(limpia) ? limpia : `https://${limpia}`;
}

function leerGuardada(): string {
  // En modo privado o con las cookies bloqueadas, `localStorage` lanza
  // en lugar de devolver null. Un fallo aquí no puede tumbar el arranque.
  try {
    return normalizar(localStorage.getItem(LS_KEY) ?? '');
  } catch {
    return '';
  }
}

/**
 * Atiende `?api=...` en la URL: guarda el destino y lo borra de la barra
 * de direcciones. Así se reparte un único enlace a la sala
 * (`https://mi-app.vercel.app/?api=https://algo.trycloudflare.com`) y a
 * partir de ahí cada navegador ya sabe con quién hablar.
 *
 * `?api=reset` olvida lo guardado y vuelve a lo que diga el build.
 */
function atenderParametro(): void {
  const crudo = new URLSearchParams(window.location.search).get(PARAM);
  if (crudo === null) return;

  const valor = crudo.trim();
  try {
    if (!valor || valor.toLowerCase() === 'reset') localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, normalizar(valor));
  } catch {
    // Sin almacenamiento el override vale solo para esta carga: se
    // pierde al recargar, pero la sesión en curso funciona.
  }

  // El enlace queda limpio: lo que se copie y se pase de mano en mano
  // no arrastra un destino que mañana estará caducado.
  const limpia = new URL(window.location.href);
  limpia.searchParams.delete(PARAM);
  window.history.replaceState(null, '', limpia.toString());
}

function resolverAPI(): string {
  atenderParametro();

  // 1. Override en vivo (?api=... recordado): gana a todo, porque es la
  //    palanca de emergencia cuando el túnel estrena URL a media partida.
  const guardada = leerGuardada();
  if (guardada) return guardada;

  // 2. Lo que se fijó al compilar (`VITE_API_URL` en Vercel).
  const configurada = normalizar(import.meta.env.VITE_API_URL ?? '');
  if (configurada) return configurada;

  // 3. Red local: mismo host, puerto de la API.
  return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
}

export const API_URL = resolverAPI();

// Dejar el destino a la vista ahorra la pregunta «¿por qué no conecta?»:
// con la consola abierta se ve al instante si apunta a donde debe.
console.info(`[HackMeThon] API → ${API_URL}`);

export const createSocket = (code: string): AppSocket =>
  io(API_URL, {
    auth: { code },
    // WebSocket primero, `polling` como red de seguridad. Por wifi de la
    // sala el WebSocket entra siempre, pero en una red corporativa o de
    // campus que lo filtra, sin esta segunda opción no hay juego: el
    // servidor es un único proceso, así que el polling no tiene el
    // problema de sesiones pegajosas que tendría detrás de un balanceador.
    transports: ['websocket', 'polling'],
    // Reconexión agresiva: en un evento en vivo, cinco segundos de
    // pantalla muerta son cinco segundos de gente levantando la mano.
    reconnection: true,
    reconnectionDelay: 400,
    reconnectionDelayMax: 2500,
  });

export type AckResult<T = unknown> = { ok: boolean; error?: string; data?: T };

/** Emite un evento con acuse de recibo, en forma de promesa. */
export function call<T = unknown>(
  socket: AppSocket,
  event: string,
  payload: unknown,
): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, error: 'TIMEOUT' }), 6000);
    (socket as unknown as {
      emit: (e: string, p: unknown, cb: (r: AckResult<T>) => void) => void;
    }).emit(event, payload, (r) => {
      clearTimeout(t);
      resolve(r);
    });
  });
}
