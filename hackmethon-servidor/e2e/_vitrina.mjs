// Capturas de una fase en una base de PRUEBA (servidor en :4100). No es
// una prueba: es el visor que se usa al diseñar una fase.
import puppeteer from 'puppeteer-core';
const APP = process.env.APP ?? 'http://localhost:5173';
const API = process.env.API ?? 'http://localhost:4100';
const OUT = process.env.OUT ?? '.';
const codes = (process.env.CODES ?? 'BINARIO-1,BINARIO-4,BINARIO-2').split(',');
const cmds = (process.env.CMDS ?? '').split(';').map((s) => s.trim()).filter(Boolean);
const W = Number(process.env.W ?? 1440), H = Number(process.env.H ?? 900);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const pages = {};
for (const c of codes) {
  const p = await browser.newPage();
  await p.setViewport({ width: W, height: H });
  p.on('pageerror', (e) => console.log(`[${c}] pageerror`, String(e).slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error') console.log(`[${c}] console`, m.text().slice(0, 300)); });
  await p.evaluateOnNewDocument((code, api) => { localStorage.setItem('hm:code', code); localStorage.setItem('hm:api', api); }, c, API);
  await p.goto(`${APP}/?api=${encodeURIComponent(API)}`, { waitUntil: 'networkidle2' });
  pages[c] = p;
}
await wait(1500);
// La animación de entrada tapa la fase: se cierra para fotografiar el juego.
for (const p of Object.values(pages)) await p.evaluate(() => document.querySelector('.intro-saltar')?.click()).catch(() => {});
await wait(300);
const term = Object.values(pages).find(() => true);
for (const c of codes) {
  const rol = await pages[c].evaluate(() => document.querySelector('.fase-cabecera .rol')?.textContent ?? document.body.innerText.slice(0, 80));
  console.log(c, '→', rol);
}
const terminal = Object.entries(pages).find(([, p]) => true);
let tp = null;
for (const [c, p] of Object.entries(pages)) if (await p.$('.vista-terminal')) tp = p;
// Intento de pegar en la consola, para ver el aviso y la alerta del panel.
if (process.env.PEGAR && tp) {
  await tp.focus('.entrada-cmd input');
  await tp.evaluate(() => {
    const dt = new DataTransfer(); dt.setData('text/plain', 'filtrar si algo = pegado');
    document.querySelector('.entrada-cmd input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await wait(300);
}
for (const cmd of cmds) {
  if (cmd.startsWith('wait ')) { await wait(Number(cmd.slice(5))); continue; }
  if (!tp) { console.log('sin terminal'); break; }
  await tp.type('.entrada-cmd input', cmd); await tp.keyboard.press('Enter'); await wait(700);
}
// Las pestañas en segundo plano congelan sus animaciones: la que se va a
// mirar se trae al frente en cuanto se ha terminado de escribir.
if (process.env.FRONT && pages[process.env.FRONT]) await pages[process.env.FRONT].bringToFront();

// Espía: registra los cambios de un atributo durante un rato, para
// verificar secuencias de animación sin depender de capturas lentas.
if (process.env.SPY) {
  const [sel, attr, ms] = process.env.SPY.split('|');
  for (const [c, p] of Object.entries(pages)) {
    if (!(await p.$(sel))) continue;
    const log = await p.evaluate(async (sel, attr, ms) => {
      const out = []; const t0 = performance.now(); let prev = null;
      while (performance.now() - t0 < ms) {
        const v = document.querySelector(sel)?.getAttribute(attr) ?? null;
        if (v !== prev) { out.push(`${Math.round(performance.now() - t0)}ms ${v}`); prev = v; }
        await new Promise((r) => setTimeout(r, 50));
      }
      return out;
    }, sel, attr, Number(ms));
    console.log(`[${c}] ${sel}@${attr}:`, log.join(' → '));
  }
}
if (process.env.CHECK) {
  await wait(Number(process.env.CHECK_MS ?? 600));
  for (const [c, p] of Object.entries(pages)) {
    console.log(`[${c}] CHECK:`, await p.evaluate(process.env.CHECK).catch((e) => String(e)));
  }
}
await wait(Number(process.env.SETTLE ?? 1200));
const shots = (process.env.SHOTS ?? '1').split(',').map(Number);
let t0 = 0;
for (const at of shots) {
  await wait(at - t0); t0 = at;
  for (const [c, p] of Object.entries(pages)) {
    const sel = process.env.ELEM;
    const el = sel ? await p.$(sel).catch(() => null) : null;
    if (el) {
      await el.evaluate((e) => e.scrollIntoView({ block: 'start' }));
      await wait(150);
      await el.screenshot({ path: `${OUT}/${c}-${at}.png` });
    } else {
      await p.screenshot({ path: `${OUT}/${c}-${at}.png`, fullPage: process.env.FULL === '1' });
    }
  }
}
await browser.close();
