// ============================================================
//  Origen permitido para HTTP y WebSocket.
//
//  En una sala real el cliente no vive en `localhost`: cada portátil
//  abre el juego por la IP del servidor, así que el origen cambia con
//  la máquina que mira. Fijar una sola URL sería condenar el evento a
//  que solo juegue quien esté sentado delante del servidor.
// ============================================================

/**
 * Lee `CLIENT_ORIGIN` y lo traduce a lo que esperan `cors` y `socket.io`.
 *
 * - sin definir, o `*`  → `true`: se refleja el origen que venga. Es lo
 *   que queremos en una red local, y —a diferencia de `'*'`— sigue
 *   siendo compatible con `credentials: true`.
 * - una o varias URLs separadas por comas → lista blanca estricta.
 */
export function corsOrigin(): true | string[] {
  const raw = (process.env.CLIENT_ORIGIN ?? '').trim();
  if (!raw || raw === '*') return true;
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}
