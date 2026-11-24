// Visor de la capa 2 de La Maraña (la espesura con cuatro brotes) en una
// base de PRUEBA (servidor en :4100). No es una prueba: escribe un
// programa, lanza y fotografía Pantalla y Datos mientras los brotes andan.
//
//   PARED=derecha OUT=/tmp/x SHOTS=3000,15000,45000 node _espesura.mjs
import puppeteer from 'puppeteer-core';
const APP = process.env.APP ?? 'http://localhost:5173';
const API = process.env.API ?? 'http://localhost:4100';
const OUT = process.env.OUT ?? '.';
const [TERM, DATOS, PANT] = (process.env.CODES ?? 'BINARIO-4,BINARIO-1,BINARIO-2').split(',');
const PARED = process.env.PARED ?? 'izquierda';
const OTRA = PARED === 'izquierda' ? 'derecha' : 'izquierda';
const PROGRAMA = process.env.PROGRAMA
  ? process.env.PROGRAMA.split(';')
  : ['repetir 99 veces', 'repetir 99 veces', `si ${PARED} libre`, `girar ${PARED}`, 'sino',
     'repetir mientras frente bloqueado', `girar ${OTRA}`, 'fin', 'fin', 'avanzar', 'fin', 'fin'];
const SHOTS = (process.env.SHOTS ?? '3000,15000,45000').split(',').map(Number);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const abrir = async (code) => {
  const p = await browser.newPage();
  await p.setViewport({ width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 1000) });
  p.on('pageerror', (e) => console.log(`[${code}] pageerror`, String(e).slice(0, 300)));
  await p.evaluateOnNewDocument((c, api) => { localStorage.setItem('hm:code', c); localStorage.setItem('hm:api', api); }, code, API);
  await p.goto(`${APP}/?api=${encodeURIComponent(API)}`, { waitUntil: 'networkidle2' });
  return p;
};
const paginas = { [TERM]: await abrir(TERM), [DATOS]: await abrir(DATOS), [PANT]: await abrir(PANT) };
await wait(1500);
if (process.env.INTRO) {
  await paginas[PANT].waitForSelector('.intro-saltar', { timeout: 6000 }).catch(() => {});
  await wait(Number(process.env.INTRO));
  await paginas[PANT].screenshot({ path: `${OUT}/intro-${PANT}.png` });
}
// Las introducciones tapan el juego y salen con un poco de retraso: se
// cierran hasta que no quede ninguna.
for (let k = 0; k < 12; k++) {
  let quedan = 0;
  for (const p of Object.values(paginas)) {
    quedan += await p.evaluate(() => {
      const b = document.querySelector('.intro-saltar');
      b?.click();
      return b ? 1 : 0;
    }).catch(() => 0);
  }
  if (!quedan && k > 3) break;
  await wait(500);
}
const term = paginas[TERM];
const datos = paginas[DATOS];
/** Abre una tabla en el puesto de Datos, como haría un jugador. */
const abrirTabla = async (id) => {
  await datos.evaluate(() => [...document.querySelectorAll('button')].find((b) => /MAPA/.test(b.textContent ?? ''))?.click());
  await wait(300);
  // Un clic directo: `page.click` espera un cuadro de animación, y una
  // pestaña de fondo no lo pinta nunca.
  await datos.evaluate((t) => document.querySelector(`[data-tabla="${t}"]`)?.click(), id);
  await wait(500);
};
// Los identificadores vigentes los dicta Datos: se leen de `enlaces`.
await abrirTabla('enlaces');
const vigentes = await datos.evaluate(() => [...document.querySelectorAll('.tabla-datos tbody tr')]
  .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim() ?? ''))
  .filter((f) => f[3] === 'vigente').sort((a, b) => Number(a[1]) - Number(b[1])).map((f) => f[2]));
console.log('vigentes en enlaces:', vigentes.join(' '));
for (const l of ['borrar todo', ...PROGRAMA, `conectar ${vigentes.join(' ')}`, 'lanzar']) {
  await term.type('.entrada-cmd input', l);
  await term.keyboard.press('Enter');
  await wait(250);
}
await datos.evaluate(() => [...document.querySelectorAll('button')].find((b) => /MAPA/.test(b.textContent ?? ''))?.click());
const t0 = Date.now();
for (const at of SHOTS) {
  await wait(Math.max(0, at - (Date.now() - t0)));
  for (const [c, p] of [[PANT, paginas[PANT]], [DATOS, paginas[DATOS]]]) {
    await p.screenshot({ path: `${OUT}/${c}-${at}.png`, fullPage: c === DATOS });
  }
}
if (process.env.TABLA) {
  await abrirTabla(process.env.TABLA);
  await datos.screenshot({ path: `${OUT}/tabla-${process.env.TABLA}.png`, fullPage: true });
}
console.log('terminal:', (await term.evaluate(() => document.querySelector('.salida, .consola, main')?.innerText ?? '')).split('\n').slice(-8).join(' | '));
if (process.env.CHECK) {
  for (const [c, p] of Object.entries(paginas)) console.log(`[${c}]`, await p.evaluate(process.env.CHECK).catch((e) => String(e)));
}
await browser.close();
