// ============================================================
//  La plantilla del evento: 30 equipos con nombre y logo inventados.
//
//  npm run db:equipos
//
//  Son PROVISIONALES: están para que el panel, la carrera, el mapa y la
//  proyección se vean con el aforo de verdad mientras llegan los equipos
//  reales, que se cambian después desde el panel (nombre y logo).
//
//  - Los equipos que ya haya se RENOMBRAN en orden (conservan su id y su
//    progreso); los que falten hasta 30 se crean, con su progreso por fase.
//  - Cada equipo tiene CINCO jugadores: una TERMINAL, dos DATOS y dos
//    PANTALLA (ver src/lib/shuffle.ts). Los equipos que lleguen con menos
//    gente simplemente no usan los últimos códigos.
//  - Cada equipo lleva un logo de 16 × 16 en pixel art, sacado de su
//    nombre: el mismo nombre da siempre el mismo logo.
//  - Los códigos de acceso salen del nombre (MICELIO-1 … MICELIO-5), para
//    imprimirlos. OJO: los de los equipos renombrados CAMBIAN.
//  - Se puede volver a lanzar: lo que ya está como debe, se queda.
//
//  El seed (`npm run db:seed`) NO se toca: sigue sembrando los diez
//  equipos de prueba (ALFA, BRAVO…) de los que dependen los smokes y el
//  e2e. Por eso las pruebas van sobre una base reseteada, no sobre esta.
// ============================================================

import 'dotenv/config';
import { deflateSync } from 'node:zlib';
import { io } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';
import type { Role } from '../src/lib/constants.js';

/** Los cinco puestos, en el orden de los códigos. Los tres primeros son
 *  los del seed (jugador 1 DATOS, 2 TERMINAL, 3 PANTALLA); el 4 y el 5
 *  duplican DATOS y PANTALLA. Nunca hay dos TERMINAL. */
const PUESTOS: Role[] = ['DATOS', 'TERMINAL', 'PANTALLA', 'DATOS', 'PANTALLA'];

const prisma = new PrismaClient();

/** Nombres cortos a propósito: la carrera, el pelotón y las mesas del
 *  mapa tienen poco sitio. Máquina, planta y desierto de Chihuahua. */
const NOMBRES = [
  'MICELIO', 'SINAPSIS', 'VOLTIO', 'HELECHO', 'NEURONA', 'CHISPA',
  'MUSGO', 'CORTEZA', 'SILICIO', 'ESPORA', 'DIODO', 'RAÍZ',
  'TALLO', 'PIXEL', 'POLEN', 'CIRCUITO', 'LIQUEN', 'OHMIO',
  'SAVIA', 'TRANSISTOR', 'CLOROFILA', 'BINARIO', 'NOPAL', 'COBRE',
  'YUCA', 'KERNEL', 'BIZNAGA', 'FUSIBLE', 'ÁMBAR', 'OCOTILLO',
];

/** El código de acceso: el nombre sin acentos ni espacios. */
const codigo = (nombre: string) =>
  nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

// ── el logo: un sprite simétrico de 16 × 16 ────────────────────────
// El mismo dibujo que los equipos de ejemplo de la carrera de prueba
// (client/src/lib/logoInventado.ts): media cara sorteada y reflejada,
// más relleno hacia el centro, dos ojos y un contorno oscuro.

const LADO = 16;
type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const PARES: [RGB, RGB][] = [
  ['#fa39ba', '#ffd3ee'], ['#3ddc97', '#b4f5d4'], ['#4f86ee', '#fa39ba'], ['#d946ef', '#b4f5d4'],
  ['#a32198', '#ffd3ee'], ['#3ddc97', '#d946ef'], ['#ffd3ee', '#4f86ee'], ['#4f86ee', '#3ddc97'],
].map(([a, b]) => [hex(a), hex(b)]);
const CONTORNO = hex('#0a070c');

function azar(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const semillaDe = (s: string) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);

function logoDe(nombre: string): Buffer {
  const r = azar(semillaDe(nombre));
  const [cuerpo, detalle] = PARES[Math.floor(r() * PARES.length)];
  const m: number[][] = Array.from({ length: LADO }, () => Array(LADO).fill(0));
  for (let y = 1; y < LADO - 1; y++) {
    for (let x = 1; x < LADO / 2; x++) {
      const p = 0.18 + 0.42 * (x / (LADO / 2)) + 0.2 * (1 - Math.abs(y - LADO / 2) / (LADO / 2));
      if (r() < p) m[y][x] = m[y][LADO - 1 - x] = r() < 0.22 ? 2 : 1;
    }
  }
  const oy = 4 + Math.floor(r() * 4), ox = 4 + Math.floor(r() * 3);
  m[oy][ox] = m[oy][LADO - 1 - ox] = 0;
  m[oy - 1][ox] = m[oy - 1][LADO - 1 - ox] = 1;

  // RGBA, fila a fila, cada una con su byte de filtro (0 = ninguno).
  const crudo = Buffer.alloc(LADO * (1 + LADO * 4));
  for (let y = 0; y < LADO; y++) {
    const fila = y * (1 + LADO * 4);
    for (let x = 0; x < LADO; x++) {
      const v = m[y][x];
      const toca = !v && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m[y + dy]?.[x + dx]);
      const color = v === 2 ? detalle : v === 1 ? cuerpo : toca ? CONTORNO : null;
      const o = fila + 1 + x * 4;
      if (color) { crudo[o] = color[0]; crudo[o + 1] = color[1]; crudo[o + 2] = color[2]; crudo[o + 3] = 255; }
    }
  }
  return png(LADO, LADO, crudo);
}

// ── un PNG mínimo, sin dependencias ─────────────────────────────────
const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = TABLA_CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function trozo(tipo: string, datos: Buffer) {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}
function png(ancho: number, alto: number, rgbaConFiltro: Buffer) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits por canal, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr), trozo('IDAT', deflateSync(rgbaConFiltro)), trozo('IEND', Buffer.alloc(0)),
  ]);
}

// ── la plantilla ────────────────────────────────────────────────────
const existentes = await prisma.team.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { members: true } });
const fases = await prisma.phase.findMany({ select: { id: true } });
const ahora = new Date();
let renombrados = 0, creados = 0;

// Primero se apartan los nombres y códigos viejos: un equipo renombrado
// podría querer el nombre que todavía tiene otro, y ambos son únicos.
await prisma.$transaction(async (tx) => {
  for (const t of existentes.slice(0, NOMBRES.length)) {
    await tx.team.update({ where: { id: t.id }, data: { name: `__tmp_${t.id}`, joinCode: `__tmp_${t.id}` } });
    for (const u of t.members) await tx.user.update({ where: { id: u.id }, data: { accessCode: `__tmp_${u.id}` } });
  }
});

for (let i = 0; i < NOMBRES.length; i++) {
  const nombre = NOMBRES[i];
  const cod = codigo(nombre);
  const logo = new Uint8Array(logoDe(nombre));
  const previo = existentes[i];

  const team = previo
    ? await prisma.team.update({ where: { id: previo.id }, data: { name: nombre, joinCode: nombre, logo, logoMime: 'image/png', logoAt: ahora } })
    : await prisma.team.create({ data: { name: nombre, joinCode: nombre, logo, logoMime: 'image/png', logoAt: ahora } });
  previo ? renombrados++ : creados++;

  // Cinco puestos. Los que ya había conservan su rol actual (la mezcla
  // de roles pudo cambiarlo); los nuevos entran con el suyo de serie.
  const miembros = previo?.members.filter((u) => !u.isAdmin).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) ?? [];
  for (let k = 0; k < PUESTOS.length; k++) {
    const accessCode = `${cod}-${k + 1}`;
    const displayName = `${nombre} · Jugador ${k + 1}`;
    const u = miembros[k];
    if (u) await prisma.user.update({ where: { id: u.id }, data: { accessCode, displayName } });
    else await prisma.user.create({ data: { accessCode, displayName, role: PUESTOS[k], teamId: team.id } });
  }

  for (const f of fases) {
    await prisma.teamPhaseProgress.upsert({
      where: { teamId_phaseId: { teamId: team.id, phaseId: f.id } },
      update: {},
      create: { teamId: team.id, phaseId: f.id },
    });
  }
}

await prisma.eventLog.create({
  data: { type: 'EQUIPOS_EVENTO', message: `Plantilla del evento: ${renombrados} renombrados, ${creados} creados` },
});
console.log(`Plantilla lista → ${renombrados} equipos renombrados, ${creados} creados (${NOMBRES.length} en total).`);

// Que el panel abierto lo vea ya: guardar la espera entre ataques con el
// mismo valor reenvía el estado a todos los paneles y jugadores. Si el
// servidor no está en marcha no pasa nada: lo verán al conectar.
const ev = await prisma.eventState.findUnique({ where: { id: 'singleton' } });
await new Promise<void>((listo) => {
  const s = io(process.env.SMOKE_URL ?? 'http://localhost:4000', {
    auth: { code: process.env.ADMIN_CODE ?? 'ADMIN-2026' }, transports: ['websocket'], reconnection: false, timeout: 3000,
  });
  const fin = () => { s.close(); listo(); };
  s.on('connect_error', fin);
  s.once('session:snapshot', () => {
    s.emit('admin:ataque:enfriamiento', { segundos: (ev?.enfriamientoAtaqueMs ?? 60000) / 1000 }, fin);
  });
  setTimeout(fin, 5000);
});
await prisma.eventLog.deleteMany({ where: { type: 'ATAQUE_ENFRIAMIENTO', createdAt: { gte: ahora } } });
await prisma.$disconnect();
