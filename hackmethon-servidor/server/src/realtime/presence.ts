// ============================================================
//  Registro de presencia en memoria.
//
//  Por qué no basta con User.socketId en la base de datos:
//  una persona puede tener dos pestañas abiertas. Si al cerrar una
//  marcamos `connected = false`, el panel del admin dirá "desconectado"
//  con el jugador perfectamente operativo. Contamos sockets por usuario
//  y solo lo damos por caído cuando el conjunto queda vacío.
//
//  Es estado efímero a propósito: la verdad del juego vive en SQLite.
//  Si el servidor reinicia, este mapa se reconstruye solo con las
//  reconexiones automáticas de Socket.io.
// ============================================================

const sockets = new Map<string, Set<string>>();
const graceTimers = new Map<string, NodeJS.Timeout>();

/** Margen antes de anunciar una desconexión: un F5 tarda ~1s.
 *  Sin esto, cada recarga de página parpadea como caída ante el equipo. */
export const GRACE_MS = 8_000;

export function addSocket(userId: string, socketId: string): { firstConnection: boolean } {
  const set = sockets.get(userId) ?? new Set<string>();
  const firstConnection = set.size === 0;
  set.add(socketId);
  sockets.set(userId, set);

  // Volvió antes de que expirara el margen: cancelamos el anuncio de caída.
  const timer = graceTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    graceTimers.delete(userId);
  }
  return { firstConnection };
}

/** Devuelve cuántos sockets le quedan al usuario tras cerrar este. */
export function removeSocket(userId: string, socketId: string): number {
  const set = sockets.get(userId);
  if (!set) return 0;
  set.delete(socketId);
  if (set.size === 0) sockets.delete(userId);
  return set.size;
}

export function isOnline(userId: string): boolean {
  return (sockets.get(userId)?.size ?? 0) > 0;
}

/** Programa la confirmación de caída tras el margen de gracia. */
export function scheduleOffline(userId: string, fn: () => void, ms = GRACE_MS): void {
  clearTimeout(graceTimers.get(userId));
  graceTimers.set(
    userId,
    setTimeout(() => {
      graceTimers.delete(userId);
      if (!isOnline(userId)) fn();
    }, ms),
  );
}

export const onlineCount = () => sockets.size;
