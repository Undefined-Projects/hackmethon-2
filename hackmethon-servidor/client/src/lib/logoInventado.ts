import { azar } from './jardin';

/**
 * Un logo de 16 × 16 inventado, para los equipos de la carrera de prueba.
 *
 * Es un sprite simétrico, como los de las recreativas: se sortea media
 * cara (8 × 16) y se refleja, y eso basta para que el azar parezca un
 * bicho, una nave o una máscara en vez de ruido. Más relleno hacia el
 * centro que hacia los cantos, para que salga una silueta y no un
 * cuadrado; dos colores de la paleta de la portada y un contorno oscuro
 * que lo despega del fondo.
 *
 * Con semilla: el mismo equipo saca siempre el mismo logo.
 */

const LADO = 16;

/** Los pares [cuerpo, detalle], de las variables de index.css. */
const PARES: [string, string][] = [
  ['--phos', '--phos-hi'], ['--clorofila', '--clorofila-hi'], ['--blue-hi', '--phos'],
  ['--uv', '--clorofila-hi'], ['--violet', '--phos-hi'], ['--clorofila', '--uv'],
  ['--phos-hi', '--blue-hi'], ['--blue-hi', '--clorofila'],
];
const RESPALDO: Record<string, string> = {
  '--phos': '#fa39ba', '--phos-hi': '#ffd3ee', '--clorofila': '#3ddc97', '--clorofila-hi': '#b4f5d4',
  '--blue-hi': '#4f86ee', '--uv': '#d946ef', '--violet': '#a32198',
};

const hechos = new Map<number, string>();

export function logoInventado(semilla: number): string {
  const ya = hechos.get(semilla);
  if (ya) return ya;

  const r = azar(semilla * 2654435761);
  const css = getComputedStyle(document.documentElement);
  const color = (v: string) => css.getPropertyValue(v).trim() || RESPALDO[v];
  const [cuerpo, detalle] = PARES[Math.floor(r() * PARES.length)].map(color);

  // 0 vacío · 1 cuerpo · 2 detalle. Se deja un píxel de margen para el contorno.
  const m: number[][] = Array.from({ length: LADO }, () => Array(LADO).fill(0));
  for (let y = 1; y < LADO - 1; y++) {
    for (let x = 1; x < LADO / 2; x++) {
      const haciaCentro = x / (LADO / 2);                       // 0 canto · 1 centro
      const enAlto = 1 - Math.abs(y - LADO / 2) / (LADO / 2);   // 1 a media altura
      const p = 0.18 + 0.42 * haciaCentro + 0.2 * enAlto;
      if (r() < p) m[y][x] = m[y][LADO - 1 - x] = r() < 0.22 ? 2 : 1;
    }
  }
  // Los ojos: dos huecos simétricos en la mitad de arriba, que es lo que
  // convierte una mancha en una cara.
  const oy = 4 + Math.floor(r() * 4), ox = 4 + Math.floor(r() * 3);
  m[oy][ox] = m[oy][LADO - 1 - ox] = 0;
  m[oy - 1][ox] = m[oy - 1][LADO - 1 - ox] = 1;

  const cv = document.createElement('canvas');
  cv.width = cv.height = LADO;
  const ctx = cv.getContext('2d')!;
  // Primero el contorno: cada hueco que toca algo relleno.
  ctx.fillStyle = color('--screen') || '#0a070c';
  for (let y = 0; y < LADO; y++) for (let x = 0; x < LADO; x++) {
    if (m[y][x]) continue;
    const toca = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m[y + dy]?.[x + dx]);
    if (toca) ctx.fillRect(x, y, 1, 1);
  }
  for (let y = 0; y < LADO; y++) for (let x = 0; x < LADO; x++) {
    if (!m[y][x]) continue;
    ctx.fillStyle = m[y][x] === 2 ? detalle : cuerpo;
    ctx.fillRect(x, y, 1, 1);
  }
  const url = cv.toDataURL('image/png');
  hechos.set(semilla, url);
  return url;
}
