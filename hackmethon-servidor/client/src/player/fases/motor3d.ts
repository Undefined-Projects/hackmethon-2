// ============================================================
//  EL MOTOR 3D · compartido por La Maraña y El Reflejo
//
//  Un raycaster de pasillos en canvas 2D, sin WebGL ni librerías: se
//  dibuja en un búfer de 320 × 200 píxeles y el navegador solo lo escala.
//  Funciona igual en Chrome, Firefox, Safari y Edge, también en equipos
//  modestos (ver `e2e/_rendimiento.mjs`).
//
//  Las coordenadas son las del plano: `x` es la columna y `y` la fila, en
//  casillas; el ángulo, en grados, con 0 hacia arriba (norte).
// ============================================================

export const W = 320;
export const H = 200;
export const FOV = 0.66;

export type Pose = { x: number; y: number; ang: number };
export const hash = (a: number, b: number) => (((a * 73856093) ^ (b * 19349663)) >>> 0);

export type Celda = (f: number, c: number) => string;
export type Sprite = { x: number; y: number; rgb: [number, number, number]; alto: number; ancho: number; base: number };

/** El muro: hoja y placa de circuito en el mismo bloque, como en el 2D. */
function texturaMuro(h: number, tx: number, ty: number): [number, number, number] {
  let r = 20, g = 78, b = 56;
  const borde = Math.min(tx, 1 - tx, ty, 1 - ty);
  if (borde < 0.035) return [r * 0.4, g * 0.4, b * 0.4];
  const v = 0.82 + 0.18 * Math.sin(ty * Math.PI);
  r *= v; g *= v; b *= v;
  // la pista de circuito
  if (h % 3 === 0) {
    const t0 = 0.28 + ((h >> 3) % 5) * 0.09;
    const x0 = 0.12 + ((h >> 5) % 4) * 0.05;
    if ((Math.abs(ty - t0) < 0.02 && tx > x0 && tx < 0.72) || (Math.abs(tx - 0.72) < 0.02 && ty > t0 - 0.2 && ty < t0 + 0.01)) {
      return [79 * 0.9, 134 * 0.9, 238 * 0.9];
    }
  }
  // el chip incrustado
  if (h % 5 === 1 && tx > 0.38 && tx < 0.62 && ty > 0.5 && ty < 0.74) {
    const canto = Math.min(tx - 0.38, 0.62 - tx, ty - 0.5, 0.74 - ty) < 0.025;
    return canto ? [61, 220, 151] : [8, 18, 24];
  }
  // las hojas
  for (let k = 0; k < 3; k++) {
    const hx = 0.15 + (((h >> (k * 4)) % 70) / 100);
    const hy = 0.12 + (((h >> (k * 4 + 2)) % 76) / 100);
    const d = Math.abs(tx - hx) * 1.6 + Math.abs(ty - hy);
    if (d < 0.07) return d < 0.035 ? [180, 245, 212] : [61, 220, 151];
  }
  return [r, g, b];
}

/** Un cuadro: el techo, el piso de casillas, los muros y las luces. */
export function pintar(
  px: Uint32Array, zbuf: Float32Array, celda: Celda, pose: Pose,
  { niebla, ambiente, sprites, salto }: { niebla: number; ambiente: number; sprites: Sprite[]; salto: number },
) {
  const a = (pose.ang * Math.PI) / 180;
  const dx = Math.sin(a), dy = -Math.cos(a);
  const plx = Math.cos(a) * FOV, ply = Math.sin(a) * FOV;
  const horizonte = H / 2 + salto;
  const luz = (d: number) => Math.max(ambiente, Math.pow(Math.max(0, 1 - d / niebla), 1.25));
  const pon = (i: number, r: number, g: number, b: number) => {
    px[i] = (255 << 24) | (Math.min(255, b | 0) << 16) | (Math.min(255, g | 0) << 8) | Math.min(255, r | 0);
  };

  // Techo: la bóveda de la pierna, oscura, más clara hacia el horizonte.
  for (let y = 0; y < Math.min(H, Math.ceil(horizonte)); y++) {
    const t = y / Math.max(1, horizonte);
    const r = 6 + 18 * t * t, g = 4 + 8 * t * t, b = 10 + 24 * t * t;
    for (let x = 0; x < W; x++) pon(y * W + x, r, g, b);
  }

  // Piso: casillas con su borde, para poder contarlas.
  const rx0 = dx - plx, ry0 = dy - ply, rx1 = dx + plx, ry1 = dy + ply;
  for (let y = Math.max(0, Math.floor(horizonte) + 1); y < H; y++) {
    const dist = (0.5 * H) / (y - horizonte);
    const sx = (dist * (rx1 - rx0)) / W, sy = (dist * (ry1 - ry0)) / W;
    let fx = pose.x + dist * rx0, fy = pose.y + dist * ry0;
    const l = luz(dist);
    for (let x = 0; x < W; x++, fx += sx, fy += sy) {
      const c = Math.floor(fx), f = Math.floor(fy);
      const ch = celda(f, c);
      const i = y * W + x;
      if (ch === '?' || ch === '#') { pon(i, 0, 0, 0); continue; }
      const tx = fx - c, ty = fy - f;
      let r = 11, g = 15, b = 19;
      const borde = Math.min(tx, 1 - tx, ty, 1 - ty);
      if (borde < 0.03) { r = 30; g = 112; b = 78; }
      const cx = tx - 0.5, cy = ty - 0.5, rc = Math.sqrt(cx * cx + cy * cy);
      if (rc < 0.035) { r = 60; g = 82; b = 72; }
      if (ch === 'S') { const k = Math.max(0, 1 - rc / 0.55); r += 170 * k; g += 230 * k; b += 195 * k; }
      if (ch === 'E' && rc > 0.27 && rc < 0.33) { r = 61; g = 220; b = 151; }
      pon(i, r * l, g * l, b * l);
    }
  }

  // Muros: un rayo por columna (DDA).
  for (let x = 0; x < W; x++) {
    const cam = (2 * x) / W - 1;
    const rx = dx + plx * cam, ry = dy + ply * cam;
    let mx = Math.floor(pose.x), my = Math.floor(pose.y);
    const ddx = Math.abs(1 / (rx || 1e-9)), ddy = Math.abs(1 / (ry || 1e-9));
    const stx = rx < 0 ? -1 : 1, sty = ry < 0 ? -1 : 1;
    let sdx = rx < 0 ? (pose.x - mx) * ddx : (mx + 1 - pose.x) * ddx;
    let sdy = ry < 0 ? (pose.y - my) * ddy : (my + 1 - pose.y) * ddy;
    let lado = 0, ch = '.';
    for (let n = 0; n < 80; n++) {
      if (sdx < sdy) { sdx += ddx; mx += stx; lado = 0; } else { sdy += ddy; my += sty; lado = 1; }
      ch = celda(my, mx);
      if (ch === '#' || ch === '?') break;
    }
    const perp = Math.max(0.0001, lado === 0 ? sdx - ddx : sdy - ddy);
    zbuf[x] = perp;
    const alto = H / perp;
    const top = horizonte - alto / 2;
    const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H, Math.ceil(top + alto));
    let wx = lado === 0 ? pose.y + perp * ry : pose.x + perp * rx;
    wx -= Math.floor(wx);
    if ((lado === 0 && rx > 0) || (lado === 1 && ry < 0)) wx = 1 - wx;
    const l = luz(perp) * (lado === 1 ? 0.78 : 1);
    const h = hash(my, mx);
    for (let y = y0; y < y1; y++) {
      const i = y * W + x;
      if (ch === '?') { pon(i, 0, 0, 0); continue; }
      const [r, g, b] = texturaMuro(h, wx, (y - top) / alto);
      pon(i, r * l, g * l, b * l);
    }
  }

  // Luces: la salida (una columna de luz) y los otros brotes. Se suman.
  for (const s of sprites) {
    const sx = s.x - pose.x, sy = s.y - pose.y;
    const inv = 1 / (plx * dy - dx * ply);
    const tx = inv * (dy * sx - dx * sy);
    const tz = inv * (-ply * sx + plx * sy);
    if (tz <= 0.15) continue;
    const cx = (W / 2) * (1 + tx / tz);
    const ancho = (H / tz) * s.ancho, alto = (H / tz) * s.alto;
    const suelo = horizonte + (H / tz) / 2;
    const yTop = suelo - alto - (H / tz) * s.base;
    const l = luz(tz) * 0.9 + 0.1;
    for (let x = Math.max(0, Math.floor(cx - ancho)); x < Math.min(W, Math.ceil(cx + ancho)); x++) {
      if (tz >= zbuf[x]) continue;
      const kx = 1 - Math.abs(x - cx) / ancho;
      if (kx <= 0) continue;
      for (let y = Math.max(0, Math.floor(yTop)); y < Math.min(H, Math.ceil(yTop + alto)); y++) {
        const ky = Math.sin(((y - yTop) / alto) * Math.PI);
        const k = kx * kx * ky * l * 0.85;
        const i = y * W + x, v = px[i];
        pon(i, (v & 255) + s.rgb[0] * k, ((v >> 8) & 255) + s.rgb[1] * k, ((v >> 16) & 255) + s.rgb[2] * k);
      }
    }
  }
}

