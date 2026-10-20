// HTML → PDF con el Chromium del sistema. Para los documentos internos
// (guías de solución, informes): `node _pdf.mjs entrada.html salida.pdf`.
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';

const [entrada, salida] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.goto(pathToFileURL(entrada).href, { waitUntil: 'networkidle0' });
await page.evaluateHandle('document.fonts.ready');
await page.pdf({ path: salida, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log('→', salida);
