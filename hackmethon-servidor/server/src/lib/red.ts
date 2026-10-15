// ============================================================
//  Direcciones por las que se llega al servidor desde la sala.
//
//  Al arrancar, lo primero que alguien pregunta es «¿a qué dirección
//  entro?». Que la respuesta esté en el log, y no en un `ip addr` que
//  hay que recordar a mitad del evento.
// ============================================================

import { networkInterfaces } from 'node:os';

/** IPv4 de las interfaces reales de esta máquina (sin loopback ni link-local). */
export function lanIPs(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((ifaces) => ifaces ?? [])
    .filter((i) => i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
    .map((i) => i.address);
}

/** Las mismas direcciones ya como URL, listas para copiar y pegar. */
export const lanURLs = (port: number): string[] =>
  lanIPs().map((ip) => `http://${ip}:${port}`);
