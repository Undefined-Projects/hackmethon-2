/* Contraseñas: la de cada jugador de BYPASS y la de cada equipo. Se guardan
   como "sal:hash" con scrypt, nunca en texto. */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function cifraClave(clave){
  const sal = randomBytes(16).toString("base64url");
  return sal + ":" + scryptSync(String(clave), sal, 32).toString("base64url");
}

export function claveCorrecta(clave, guardada){
  const [sal, hash] = String(guardada || "").split(":");
  if (!sal || !hash) return false;
  const a = scryptSync(String(clave), sal, 32), b = Buffer.from(hash, "base64url");
  return a.length === b.length && timingSafeEqual(a, b);
}
