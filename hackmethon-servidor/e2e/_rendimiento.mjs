// Cuánto tarda en dibujarse un cuadro de las vistas 3D, en Chromium (con la
// CPU normal y frenada) y en Firefox. Requiere el cliente en marcha (Vite).
//
//   node e2e/_rendimiento.mjs
//
// Lee las funciones `medir…` que exporta cada vista: dibujan cuadros
// sintéticos, sin servidor ni partida.
import puppeteer from 'puppeteer-core';

const APP = process.env.APP ?? 'http://localhost:5173';
const VISTAS = [
  { nombre: 'La Maraña 3D', modulo: '/src/player/fases/Marana3D.tsx', fn: 'medirRendimiento3D' },
  ...(process.env.REFLEJO === '0' ? [] : [{ nombre: 'El Reflejo 3D', modulo: '/src/player/fases/Reflejo3D.tsx', fn: 'medirRendimientoReflejo' }]),
  { nombre: 'Núcleo 3D', modulo: '/src/player/fases/Nucleo3D.tsx', fn: 'medirRendimientoNucleo' },
];
const fmt = (r) => `media ${r.media.toFixed(2)} ms · p95 ${r.p95.toFixed(2)} ms · peor ${r.max.toFixed(2)} ms`;

async function medir(navegador, etiqueta, freno = 1) {
  const p = await navegador.newPage();
  await p.goto(APP, { waitUntil: 'load' });
  if (freno > 1) {
    const cdp = await p.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: freno });
  }
  for (const v of VISTAS) {
    const r = await p.evaluate(async (v) => {
      try {
        const m = await import(v.modulo);
        m[v.fn](20); // calentar
        return m[v.fn](200);
      } catch (e) { return { error: String(e).slice(0, 200) }; }
    }, v);
    console.log(`${etiqueta.padEnd(28)} ${v.nombre.padEnd(16)} ${r.error ? `ERROR ${r.error}` : fmt(r)}`);
  }
  await p.close();
}

const chromium = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
await medir(chromium, 'Chromium');
await medir(chromium, 'Chromium · CPU 6× más lenta', 6);
await chromium.close();

try {
  const firefox = await puppeteer.launch({ browser: 'firefox', executablePath: '/usr/bin/firefox', headless: true });
  await medir(firefox, 'Firefox');
  await firefox.close();
} catch (e) {
  console.log(`Firefox no arrancó: ${String(e).slice(0, 160)}`);
}
