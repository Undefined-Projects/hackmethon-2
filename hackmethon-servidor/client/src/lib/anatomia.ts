import type { LobbyPhaseView, ParteRobot } from '../shared/events';

/**
 * Los datos de la lámina anatómica del lobby: qué parte del cuerpo es
 * cada fase, su silueta, dónde va su rótulo y de dónde le brota la
 * vegetación al resolverla. El dibujo está en player/Anatomia.tsx.
 */

export type ParteClave = ParteRobot;

/**
 * Cómo se destruye una parte al superar su fase: desde su centro cae al
 * suelo (`destino`), girando `giro` grados y a escala `esc`. El torso no
 * se cae (sin `caida`): se agrieta. `munon` es donde estaba unida: ahí
 * quedan los cables arrancados.
 */
export type Caida = { centro: [number, number]; destino: [number, number]; giro: number; esc: number };

export type Parte = {
  clave: ParteClave;
  nombre: string;
  /** Para el rótulo de la lámina, que tiene poco sitio. */
  corto: string;
  d: string;
  /** Donde toca la línea de cota. */
  ancla: [number, number];
  lado: 'izq' | 'der';
  /** Altura del rótulo. */
  yRotulo: number;
  caida: Caida | null;
  munon: [number, number];
  /** De dónde brota la vegetación al resolverla, y hacia dónde tira. */
  brote: { x: number; y: number; dir: number; sesgo: number; caja: [number, number, number, number]; max: number };
};

export const PARTES: Record<ParteClave, Parte> = {
  'pierna-izq': {
    clave: 'pierna-izq', nombre: 'PIERNA IZQUIERDA', corto: 'PIERNA IZQ.', lado: 'izq', yRotulo: 610, ancla: [236, 640],
    caida: { centro: [256, 597], destino: [124, 850], giro: -90, esc: 0.8 }, munon: [256, 434],
    d: 'M232 434 L278 434 L276 500 L272 556 L277 572 L272 590 L268 700 L276 742 L282 760 L230 760 L238 742 L240 700 L236 590 L231 572 L236 556 L230 500 Z',
    brote: { x: 252, y: 756, dir: 6, sesgo: 6, caja: [230, 432, 280, 762], max: 34 },
  },
  'pierna-der': {
    clave: 'pierna-der', nombre: 'PIERNA DERECHA', corto: 'PIERNA DER.', lado: 'der', yRotulo: 610, ancla: [324, 640],
    caida: { centro: [304, 597], destino: [436, 850], giro: 90, esc: 0.8 }, munon: [304, 434],
    d: 'M 328 434 L 282 434 L 284 500 L 288 556 L 283 572 L 288 590 L 292 700 L 284 742 L 278 760 L 330 760 L 322 742 L 320 700 L 324 590 L 329 572 L 324 556 L 330 500 Z',
    brote: { x: 308, y: 756, dir: 6, sesgo: 6, caja: [280, 432, 330, 762], max: 34 },
  },
  'brazo-izq': {
    clave: 'brazo-izq', nombre: 'BRAZO IZQUIERDO', corto: 'BRAZO IZQ.', lado: 'izq', yRotulo: 400, ancla: [152, 340],
    caida: { centro: [161, 347], destino: [150, 806], giro: -96, esc: 0.72 }, munon: [196, 200],
    d: 'M206 190 L180 194 L160 214 L154 262 L148 300 L152 318 L144 330 L136 384 L130 430 L122 442 L116 470 L122 494 L140 504 L156 496 L162 470 L156 446 L160 432 L168 384 L176 336 L172 318 L182 296 L196 240 Z',
    brote: { x: 132, y: 496, dir: 6, sesgo: 7, caja: [112, 188, 210, 506], max: 40 },
  },
  'brazo-der': {
    clave: 'brazo-der', nombre: 'BRAZO DERECHO', corto: 'BRAZO DER.', lado: 'der', yRotulo: 400, ancla: [408, 340],
    caida: { centro: [399, 347], destino: [410, 806], giro: 96, esc: 0.72 }, munon: [364, 200],
    d: 'M 354 190 L 380 194 L 400 214 L 406 262 L 412 300 L 408 318 L 416 330 L 424 384 L 430 430 L 438 442 L 444 470 L 438 494 L 420 504 L 404 496 L 398 470 L 404 446 L 400 432 L 392 384 L 384 336 L 388 318 L 378 296 L 364 240 Z',
    brote: { x: 428, y: 496, dir: 6, sesgo: 5, caja: [350, 188, 448, 506], max: 40 },
  },
  torso: {
    clave: 'torso', nombre: 'TORSO', corto: 'TORSO', lado: 'izq', yRotulo: 240, ancla: [226, 300],
    caida: null, munon: [280, 310],
    d: 'M206 188 L354 188 L376 210 L374 246 L356 330 L342 380 L336 432 L224 432 L218 380 L204 330 L186 246 L184 210 Z',
    brote: { x: 240, y: 428, dir: 6, sesgo: 7, caja: [186, 186, 374, 434], max: 60 },
  },
  cabeza: {
    clave: 'cabeza', nombre: 'CABEZA', corto: 'CABEZA', lado: 'der', yRotulo: 70, ancla: [326, 84],
    caida: { centro: [280, 107], destino: [280, 812], giro: 104, esc: 0.72 }, munon: [280, 190],
    d: 'M246 44 L280 24 L314 44 L330 82 L326 122 L306 152 L280 162 L254 152 L234 122 L230 82 Z M268 158 H292 V190 H268 Z',
    brote: { x: 256, y: 150, dir: 6, sesgo: 7, caja: [228, 20, 332, 166], max: 46 },
  },
  corazon: {
    clave: 'corazon', nombre: 'CORAZÓN', corto: 'CORAZÓN', lado: 'der', yRotulo: 200, ancla: [322, 252],
    caida: { centro: [304, 260], destino: [338, 852], giro: 28, esc: 1 }, munon: [304, 260],
    d: 'M304 280 L286 262 C277 253 283 238 295 240 C300 241 303 245 304 249 C305 245 308 241 313 240 C325 238 331 253 322 262 Z',
    brote: { x: 304, y: 276, dir: 6, sesgo: 6, caja: [282, 236, 328, 282], max: 14 },
  },
};

/** Las fases del recorrido suben del suelo a la cabeza. */
const RECORRIDO: ParteClave[] = ['pierna-izq', 'pierna-der', 'brazo-izq', 'brazo-der', 'torso'];

type FaseConParte = { id: string; order: number; esFinal: boolean; esBonus: boolean };

/** Qué parte del cuerpo es cada fase, por id. Las que no caben en el
 *  cuerpo (más de cinco regulares) quedan fuera, y el lobby las lista
 *  aparte. Lo usan el lobby y la proyección: el mismo reparto en los dos. */
export function partesDeFases(fases: FaseConParte[]): Map<string, ParteClave> {
  const m = new Map<string, ParteClave>();
  const orden = [...fases].sort((a, b) => a.order - b.order);
  const final = orden.find((f) => f.esFinal);
  const bonus = orden.find((f) => f.esBonus);
  if (final) m.set(final.id, 'cabeza');
  if (bonus) m.set(bonus.id, 'corazon');
  orden.filter((f) => f !== final && f !== bonus).forEach((f, i) => {
    if (i < RECORRIDO.length) m.set(f.id, RECORRIDO[i]);
  });
  return m;
}

export const asignarPartes = (lobby: LobbyPhaseView[]) =>
  partesDeFases(lobby.map((f) => ({ id: f.phaseId, order: f.order, esFinal: f.esFinal, esBonus: f.esBonus })));

/** Las siete partes en el orden en que se destrozan: el de sus fases, y
 *  detrás las que no tienen fase, en el orden del cuerpo. */
export function ordenDeDestruccion(fases: FaseConParte[]): ParteClave[] {
  const m = partesDeFases(fases);
  const conFase = [...fases].sort((a, b) => a.order - b.order).map((f) => m.get(f.id)).filter((c): c is ParteClave => !!c);
  const resto = [...RECORRIDO, 'cabeza', 'corazon'].filter((c) => !conFase.includes(c as ParteClave)) as ParteClave[];
  return [...conFase, ...resto];
}

export const nombreParte = (c: ParteClave) => PARTES[c].nombre;

export type EstadoParte = 'bloqueada' | 'disponible' | 'curso' | 'resuelta' | 'perdida';
export function estadoDe(f: LobbyPhaseView): EstadoParte {
  if (f.teamStatus === 'SOLVED') return 'resuelta';
  if (f.teamStatus === 'FAILED') return 'perdida';
  if (f.canEnter) return f.isFocus || f.teamStatus === 'IN_PROGRESS' ? 'curso' : 'disponible';
  return 'bloqueada';
}

export const ROTULO: Record<EstadoParte, string> = {
  bloqueada: 'BLOQUEADA', disponible: 'DISPONIBLE', curso: 'EN CURSO', resuelta: 'DESTRUIDA', perdida: 'PERDIDA',
};

