// Capturas para la guía de solución de la Fase 1. Juega la fase entera con
// el equipo BINARIO contra el servidor de PRUEBA (:4100, prueba.db) y guarda
// una captura por paso. No es una prueba: es el fotógrafo de la guía.
//
//   OUT=/ruta/de/salida node _guia-f1.mjs
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const APP = process.env.APP ?? 'http://localhost:5173';
const API = process.env.API ?? 'http://localhost:4100';
const OUT = process.env.OUT ?? '.';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function abrir(code) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1.5 });
  await p.evaluateOnNewDocument((c, api) => { localStorage.setItem('hm:code', c); localStorage.setItem('hm:api', api); }, code, API);
  await p.goto(`${APP}/?api=${encodeURIComponent(API)}`, { waitUntil: 'networkidle2' });
  return p;
}

const lobby = await abrir('BIZNAGA-1');
const datos = await abrir('BINARIO-1');
const term = await abrir('BINARIO-4');
const pant = await abrir('BINARIO-2');
await wait(1500);

async function cmd(t, espera = 900) {
  await term.type('.entrada-cmd input', t, { delay: 4 });
  await term.keyboard.press('Enter');
  await wait(espera);
}

/** Captura de la ventana, con `sel` subido arriba del todo (o abajo). */
async function ventana(p, nombre, sel, bloque = 'start') {
  if (sel) await p.evaluate((s, b) => document.querySelector(s)?.scrollIntoView({ block: b }), sel, bloque);
  await wait(350);
  await p.screenshot({ path: `${OUT}/${nombre}.png` });
  console.log('·', nombre);
}

/** Recorte de un elemento: se captura la ventana entera y se apunta dónde
 *  quedó el elemento; el recorte lo hace luego ImageMagick. Recortar aquí
 *  con `clip` fallaba: la página se desplaza dentro de #root, no el
 *  documento, y las medidas no casaban con la captura. */
async function recorte(p, nombre, sel, margen = 8) {
  await p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel);
  await wait(500);
  const r = await p.evaluate((s) => {
    const b = document.querySelector(s)?.getBoundingClientRect();
    return b ? { x: b.x, y: b.y, w: b.width, h: Math.min(b.height, window.innerHeight - Math.max(0, b.y)) } : null;
  }, sel);
  if (!r) { console.log('  (no está)', sel); return; }
  await p.screenshot({ path: `${OUT}/${nombre}.full.png` });
  const k = 1.5; // deviceScaleFactor
  const x = Math.max(0, Math.round((r.x - margen) * k)), y = Math.max(0, Math.round((r.y - margen) * k));
  const w = Math.round((r.w + margen * 2) * k), h = Math.round((r.h + margen * 2) * k);
  writeFileSync(`${OUT}/${nombre}.recorte`, `${w}x${h}+${x}+${y}`);
  console.log('·', nombre);
}

const pulsar = (p, sel) => p.evaluate((s) => document.querySelector(s)?.click(), sel);
const alMapa = (p) => p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('MAPA'))?.click());
async function abrirTabla(tabla, filtro = '') {
  await alMapa(datos); await wait(300);
  await pulsar(datos, `[data-tabla="${tabla}"]`); await wait(400);
  if (filtro) { await datos.type('.filtro', filtro); await wait(300); }
}
async function esperar(p, sel, ms = 9000) {
  await p.waitForSelector(sel, { timeout: ms }).catch(() => console.log('  (no apareció)', sel));
}

// ---- antes de empezar ----
await ventana(lobby, '01-lobby');
await ventana(datos, '02-datos-portada');
await recorte(datos, '03-datos-flujo-inicial', '.flujo-datos');
await recorte(datos, '04-datos-registro', '.mapa');
await abrirTabla('programas');
await ventana(datos, '05-datos-programas', '.detalle-barra');
await abrirTabla('encargo');
await ventana(datos, '06-datos-encargo', '.detalle-barra');
await esperar(pant, '.m-origen');
await recorte(pant, '07-pantalla-camara', '.camaras');

// ---- capa 1 ----
await cmd('ayuda');
await cmd('firmas tipo macro');
await cmd('firmas tipo ejecutable');
await ventana(pant, '08-pantalla-firmas', '.marco-pantalla .salida:last-child', 'end');
await cmd('quitar 1');
await cmd('filtrar si permisos <= 3 y firma != verde');
await cmd('filtrar si origen = aire y permisos <= 3');
await alMapa(datos); await wait(400);
await recorte(datos, '09-datos-flujo-capa1', '.flujo-datos');
await cmd('probar');
await abrirTabla('corridas');
await ventana(datos, '10-datos-corridas', '.detalle-barra');
await abrirTabla('resultados', 'R1-');
await ventana(datos, '11-datos-resultados-r1', '.detalle-barra');
await ventana(term, '12-terminal-capa1');

// ---- la muda ----
await cmd('desplegar', 700);
await recorte(pant, '13-pantalla-muda', '.camaras');
await wait(4200);
await ventana(pant, '14-pantalla-capa2', '.franja-lamina');
await alMapa(datos); await wait(400);
await recorte(datos, '15-datos-flujo-muda', '.flujo-datos');
await abrirTabla('encargo');
await ventana(datos, '16-datos-encargo-muda', '.detalle-barra');

// ---- capa 2 ----
await cmd('firmas tipo enlace');
await cmd('quitar 1');
await cmd('quitar 2');
await cmd('filtrar si origen = aire y permisos <= 3 y tipo = ejecutable');
await cmd('filtrar si tipo = enlace y permisos > 3');
await cmd('filtrar si tipo = proceso y permisos <= 2');
await alMapa(datos); await wait(400);
await recorte(datos, '17-datos-flujo-capa2', '.flujo-datos');
await cmd('probar');
await abrirTabla('resultados', 'R2-');
await ventana(datos, '18-datos-resultados-r2', '.detalle-barra');
await ventana(term, '19-terminal-capa2');

// ---- el final ----
await cmd('desplegar', 1600);
await recorte(pant, '20-pantalla-rendida', '.camaras');
await wait(4000);
await ventana(pant, '21-victoria');

await browser.close();
