// ============================================================
//  Prueba del destino de la API.
//
//  Guarda la pieza de la que depende jugar por internet: cuando el
//  front vive en Vercel y la API detrás de un túnel, ya NO comparten
//  host, así que deducirlo del navegador deja de servir. Si esta
//  resolución se rompe, el síntoma es una sala entera clavada en
//  «enlazando» sin un solo error en pantalla — la avería más cara que
//  existe en un evento en vivo.
//
//  Requiere el backend en :4000 y el build de producción servido en
//  :4173 (cd client && npm run build && npm run preview), COMPILADO SIN
//  `VITE_API_URL`: lo que se prueba aquí es la resolución en runtime.
// ============================================================

import puppeteer from 'puppeteer-core';

const APP = 'http://localhost:4173';
const API = 'http://localhost:4000';
let fallos = 0;
const check = (ok, txt) => { console.log(`  ${ok ? '✔' : '✘'} ${txt}`); if (!ok) fallos++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'], protocolTimeout: 20000,
});

const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(m.text()));
await page.evaluateOnNewDocument(() => localStorage.setItem('hm:code', 'ALFA-1'));

console.log('\n1) Sin VITE_API_URL ni override: cae al host de la página');
await page.goto(APP, { waitUntil: 'networkidle2' });
await wait(1500);
const deducida = logs.find((l) => l.includes('API →'));
// El contrato de red local: hostname de la pagina + VITE_API_PORT.
check(/http:\/\/localhost:4000$/.test((deducida ?? '').split('\u2192 ')[1] ?? ''),
  `hostname de la pagina + puerto de la API (${deducida})`);
const guardado0 = await page.evaluate(() => localStorage.getItem('hm:api'));
check(guardado0 === null, `sin override guardado de partida (${guardado0})`);

console.log('\n2) Con ?api=… : conecta y recuerda');
logs.length = 0;
await page.goto(`${APP}/?api=${API}`, { waitUntil: 'networkidle2' });
await wait(2500);
const conApi = logs.find((l) => l.includes('API →'));
check(/4000/.test(conApi ?? ''), `usa la URL del parámetro (${conApi})`);
const url1 = page.url();
check(!url1.includes('api='), `y limpia la barra de direcciones (${url1})`);
const guardado = await page.evaluate(() => localStorage.getItem('hm:api'));
check(guardado === API, `lo recuerda en localStorage (${guardado})`);
const estado1 = await page.$eval('.oia__cell', (e) => e.textContent.trim()).catch(() => '?');
check(estado1 === 'EN LÍNEA', `y la sesión entra de verdad (${estado1})`);

console.log('\n3) Recarga limpia: sigue conectado sin repetir el parámetro');
logs.length = 0;
await page.goto(APP, { waitUntil: 'networkidle2' });
await wait(2500);
const recordada = logs.find((l) => l.includes('API →'));
check(/4000/.test(recordada ?? ''), `recuerda el destino (${recordada})`);
const estado2 = await page.$eval('.oia__cell', (e) => e.textContent.trim()).catch(() => '?');
check(estado2 === 'EN LÍNEA', `sigue en línea (${estado2})`);

console.log('\n4) ?api=reset : lo olvida');
await page.goto(`${APP}/?api=reset`, { waitUntil: 'networkidle2' });
await wait(1200);
const tras = await page.evaluate(() => localStorage.getItem('hm:api'));
check(tras === null, `localStorage limpio (${tras})`);

console.log('\n5) Sin protocolo se asume https');
await page.goto(`${APP}/?api=api.ejemplo.org`, { waitUntil: 'networkidle2' });
await wait(800);
const norm = await page.evaluate(() => localStorage.getItem('hm:api'));
check(norm === 'https://api.ejemplo.org', `normaliza a https (${norm})`);

console.log('\n6) Barra final de sobra se recorta');
await page.goto(`${APP}/?api=${API}/`, { waitUntil: 'networkidle2' });
await wait(800);
const sinBarra = await page.evaluate(() => localStorage.getItem('hm:api'));
check(sinBarra === API, `sin barra final (${sinBarra})`);

await browser.close();
console.log(fallos ? `\n❌ ${fallos} fallo(s)` : '\n✅ Override de API OK');
process.exit(fallos ? 1 : 0);
