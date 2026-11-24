// Fotografía cada escena de la introducción de la fase en curso.
//   OUT=dir CODE=BINARIO-2 ESPERAS=6000,9000,... node e2e/_intro.mjs
import puppeteer from 'puppeteer-core';
const APP = process.env.APP ?? 'http://localhost:5173';
const API = process.env.API ?? 'http://localhost:4100';
const OUT = process.env.OUT ?? '.';
const code = process.env.CODE ?? 'BINARIO-2';
const esperas = (process.env.ESPERAS ?? '6000').split(',').map(Number);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const p = await browser.newPage();
await p.setViewport({ width: 1280, height: 860 });
p.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
await p.evaluateOnNewDocument((code, api) => {
  localStorage.setItem('hm:code', code); localStorage.setItem('hm:api', api);
  for (const k of Object.keys(localStorage)) if (k.startsWith('hm:intro:')) localStorage.removeItem(k);
}, code, API);
await p.goto(`${APP}/?api=${encodeURIComponent(API)}`, { waitUntil: 'networkidle2' });
await p.waitForSelector('.intro', { timeout: 15000 });
for (let k = 0; k < esperas.length; k++) {
  await p.evaluate((k) => document.querySelectorAll('.intro-pasos button')[k]?.click(), k);
  await p.evaluate(() => { const b = [...document.querySelectorAll('.intro-pie button')].find((x) => x.textContent.includes('PAUSA')); });
  await wait(esperas[k]);
  await p.screenshot({ path: `${OUT}/intro-${k + 1}.png` });
}
await browser.close();
