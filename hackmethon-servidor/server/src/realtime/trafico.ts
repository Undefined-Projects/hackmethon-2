// ============================================================
//  Monitor de tráfico en vivo.
//
//  Un temporizador por equipo que va soltando peticiones a la room
//  PANTALLA. Igual que el motor de comandos, este archivo no sabe NADA
//  del contenido: el guion del ataque lo escribe el módulo de la fase.
//
//  Tres cosas que no son opcionales en un evento en vivo:
//    1. Un flujo por equipo, nunca uno global. Cada equipo ve SU ataque
//       y va a su ritmo; un temporizador compartido delataría a los que
//       van por delante.
//    2. Todo lo que arranca tiene que poder pararse desde fuera: cerrar
//       la fase, reiniciar el juego o resolver deja temporizadores
//       sueltos emitiendo a una sala vacía si no se limpian aquí.
//    3. Tope de duración. Un equipo que abandona la pestaña con el
//       monitor abierto no debe dejar un intervalo vivo el resto de la
//       noche.
// ============================================================

import { randomUUID } from 'node:crypto';
import type { FiltroTrafico, LineaTrafico, PeticionTrafico } from '../lib/events.js';
import { roleRoom } from './rooms.js';
import { getIO } from './server.js';

/** Corte de seguridad: ningún ataque dura más de esto sin intervención. */
const TOPE_MS = 20 * 60_000;

type Flujo = {
  timer: NodeJS.Timeout;
  peticiones: PeticionTrafico[];
  bucle: boolean;
  i: number;
  emitidas: number;
  desde: number;
  filtro: FiltroTrafico | null;
};

const flujos = new Map<string, Flujo>();

/** El evento en pausa congela el ataque; no lo cancela. */
let pausado = false;

/** HH:MM:SS del servidor. La hora la pone quien emite, no quien pinta:
 *  el proyector de la sala y el portátil del jugador tienen que contar
 *  lo mismo aunque uno de los dos vaya con el reloj torcido. */
const hhmmss = (t: number) => new Date(t).toTimeString().slice(0, 8);

export const flujoActivo = (teamId: string) => flujos.has(teamId);

/** El filtro vigente, para repintar la barra de quien acaba de reconectar. */
export const filtroDeFlujo = (teamId: string): FiltroTrafico | null =>
  flujos.get(teamId)?.filtro ?? null;

function avisar(teamId: string, activo: boolean, nota: string, filtro: FiltroTrafico | null = null) {
  getIO().to(roleRoom(teamId, 'PANTALLA')).emit('pantalla:trafico:estado', { activo, nota, filtro });
}

/** ¿Pasa esta petición el filtro? Sin filtro, pasan todas.
 *  Entre claves acota; dentro de una clave suma. */
function coincide(p: PeticionTrafico, f: FiltroTrafico | null): boolean {
  if (!f) return true;
  if (f.cuenta?.length && !f.cuenta.includes(p.cuenta)) return false;
  if (f.ip?.length && !f.ip.includes(p.ip)) return false;
  if (f.metodo?.length && !f.metodo.includes(p.metodo.toLowerCase())) return false;
  if (f.codigo?.length && !f.codigo.includes(p.codigo)) return false;
  // La ruta va por prefijo: `/api/exportar` tiene que atrapar
  // `/api/exportar/nomina`, que es justo la línea que se busca.
  if (f.ruta?.length && !f.ruta.some((r) => p.ruta.toLowerCase().startsWith(r))) return false;
  return true;
}

function tick(teamId: string) {
  const f = flujos.get(teamId);
  if (!f) return;

  // Pausa del evento: el intervalo sigue vivo pero no emite. Reanudar
  // no tiene entonces que reconstruir nada.
  if (pausado) return;

  if (Date.now() - f.desde > TOPE_MS) {
    return detenerFlujo(teamId, 'Monitor cerrado por inactividad.');
  }

  // Con filtro, el reloj avanza hasta encontrar una línea que lo cumpla
  // en vez de emitir solo cuando toca en el orden natural. Si no, acotar
  // por una cuenta que aparece tres veces en sesenta dejaría el monitor
  // mudo medio minuto y parecería averiado. El grifo sigue corriendo
  // igual por debajo; lo que cambia es qué se pinta.
  let elegida: PeticionTrafico | null = null;
  for (let pasos = 0; pasos < f.peticiones.length; pasos++) {
    if (f.i >= f.peticiones.length) {
      if (!f.bucle) return detenerFlujo(teamId, 'Fin de la captura.');
      f.i = 0;
    }
    const p = f.peticiones[f.i];
    f.i++;
    if (coincide(p, f.filtro)) {
      elegida = p;
      break;
    }
  }
  // Un filtro que no deja pasar nada no es un error ni apaga la captura:
  // el equipo acotó por algo que no está, y eso también es información.
  if (!elegida) return;

  const at = Date.now();
  const linea: LineaTrafico = {
    ...elegida,
    id: randomUUID(),
    at,
    hora: hhmmss(at),
  };
  f.emitidas++;
  getIO().to(roleRoom(teamId, 'PANTALLA')).emit('pantalla:trafico', linea);
}

/** Arranca (o reemplaza) el monitor de un equipo. */
export function iniciarFlujo(
  teamId: string,
  cfg: {
    intervaloMs: number;
    peticiones: PeticionTrafico[];
    bucle?: boolean;
    filtro?: FiltroTrafico | null;
  },
) {
  detener(teamId); // reiniciar es empezar de cero, no acumular dos relojes
  if (cfg.peticiones.length === 0) return;

  const intervaloMs = Math.max(120, cfg.intervaloMs);
  flujos.set(teamId, {
    timer: setInterval(() => tick(teamId), intervaloMs),
    peticiones: cfg.peticiones,
    bucle: cfg.bucle ?? false,
    i: 0,
    emitidas: 0,
    desde: Date.now(),
    filtro: cfg.filtro ?? null,
  });
  avisar(teamId, true, cfg.filtro ? 'Captura en curso · acotada.' : 'Captura en curso.', cfg.filtro ?? null);
  tick(teamId); // la primera línea, sin esperar al primer intervalo
}

function detener(teamId: string): boolean {
  const f = flujos.get(teamId);
  if (!f) return false;
  clearInterval(f.timer);
  flujos.delete(teamId);
  return true;
}

/**
 * Reencuadra el flujo en curso. Devuelve false si no hay ninguno: el
 * módulo decide entonces si abre uno ya acotado.
 *
 * No reinicia el guion a propósito. Filtrar es cambiar de lente, no
 * empezar otra captura: si al acotar volviera a caer el ataque desde el
 * principio, el equipo perdería el hilo de lo que estaba siguiendo.
 */
export function filtrarFlujo(teamId: string, filtro: FiltroTrafico | null): boolean {
  const f = flujos.get(teamId);
  if (!f) return false;
  f.filtro = filtro;
  avisar(teamId, true, filtro ? 'Captura en curso · acotada.' : 'Captura en curso · sin filtro.', filtro);
  return true;
}

/** Para el monitor de un equipo y se lo dice a su Pantalla. */
export function detenerFlujo(teamId: string, nota = 'Captura detenida.') {
  if (!detener(teamId)) return false;
  avisar(teamId, false, nota);
  return true;
}

/** Para todos. Lo usan cerrar_fase y reiniciar_juego. */
export function detenerTodos(nota = 'Captura detenida.') {
  for (const teamId of [...flujos.keys()]) detenerFlujo(teamId, nota);
}

/** El evento entra en pausa: el ataque se congela donde estaba. */
export function pausarFlujos() {
  if (pausado) return;
  pausado = true;
  for (const [teamId, f] of flujos) avisar(teamId, true, 'Evento en pausa · captura congelada.', f.filtro);
}

export function reanudarFlujos() {
  if (!pausado) return;
  pausado = false;
  for (const [teamId, f] of flujos) avisar(teamId, true, 'Captura reanudada.', f.filtro);
}
