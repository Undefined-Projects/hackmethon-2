// ============================================================
//  Señales para el panel: cosas que no suelen pasar jugando a mano.
//
//  No bloquea nada ni castiga a nadie. Cuenta tres señales por equipo y
//  se las enseña al panel, para que alguien de la organización se acerque
//  a esa mesa a ver qué pasa:
//
//    · PEGADOS  intentos de pegar texto en la consola, que no lo admite.
//    · RÁFAGAS  comandos largos que llegan más deprisa de lo que nadie
//               teclea desde el anterior.
//    · RÁPIDAS  fases resueltas en mucho menos tiempo del normal.
//
//  Vive en memoria, como los minijuegos: si el servidor se reinicia, las
//  cuentas vuelven a cero. Es un aviso para mirar, no un expediente.
// ============================================================

/** Un comando de al menos este largo cuenta para las ráfagas: los cortos
 *  (`probar`, `quitar 2`) se teclean deprisa de verdad. */
const MIN_LARGO = 24;
/** Caracteres por segundo, contando desde el comando anterior. Quien
 *  teclea rápido anda por 6-8; a 14 hay que haberlo traído escrito. */
const MAX_CPS = 14;
/** Una fase resuelta en menos de esto, de tiempo activo, se señala. */
const RAPIDA_MS = 5 * 60_000;

export type Alertas = { pegados: number; rafagas: number; rapidas: string[] };

const porEquipo = new Map<string, Alertas & { ultimoComandoAt: number }>();

function de(teamId: string) {
  let a = porEquipo.get(teamId);
  if (!a) {
    a = { pegados: 0, rafagas: 0, rapidas: [], ultimoComandoAt: 0 };
    porEquipo.set(teamId, a);
  }
  return a;
}

export function registrarPegado(teamId: string): void {
  de(teamId).pegados++;
}

/** Devuelve true si este comando ha sumado una ráfaga. */
export function registrarComando(teamId: string, texto: string, ahora: number): boolean {
  const a = de(teamId);
  const dt = ahora - a.ultimoComandoAt;
  a.ultimoComandoAt = ahora;
  if (texto.length < MIN_LARGO || dt <= 0) return false;
  if (texto.length / (dt / 1000) <= MAX_CPS) return false;
  a.rafagas++;
  return true;
}

/** Devuelve true si la fase se ha resuelto sospechosamente rápido. */
export function registrarResuelta(teamId: string, fase: string, activoMs: number | null | undefined): boolean {
  if (activoMs == null || activoMs >= RAPIDA_MS) return false;
  de(teamId).rapidas.push(fase);
  return true;
}

export function alertasDe(teamId: string): Alertas {
  const a = porEquipo.get(teamId);
  return a ? { pegados: a.pegados, rafagas: a.rafagas, rapidas: [...a.rapidas] } : { pegados: 0, rafagas: 0, rapidas: [] };
}

/** Al reiniciar el juego, todo vuelve a cero. */
export function olvidarAlertas(): void {
  porEquipo.clear();
}
