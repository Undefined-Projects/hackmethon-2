/* Convierte promo.html en video, cuadro por cuadro.

     cd promo && npm install          (una vez: instala puppeteer-core)
     node render.mjs                  → hackmethon-promo.mp4  (1080 × 1920, 30 fps, con sonido)

   Usa el Chromium del sistema (CHROMIUM=/ruta para otro) y ffmpeg.
   Sirve la raíz del proyecto por HTTP porque promo.html lee el sprite de
   sitio/bypass.js y el logo de sitio/: desde file:// el navegador no deja. */

import http from "node:http";
import { readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const FPS = 30;
const salida = path.join(AQUI, "hackmethon-promo.mp4");

const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".css": "text/css" };
const servidor = http.createServer(async (req, res) => {
  const ruta = path.join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!ruta.startsWith(RAIZ)) return res.writeHead(403).end();
  try {
    const datos = await readFile(ruta);
    res.writeHead(200, { "content-type": TIPOS[path.extname(ruta)] || "application/octet-stream" }).end(datos);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => servidor.listen(0, "127.0.0.1", r));
const puerto = servidor.address().port;

const navegador = await puppeteer.launch({
  executablePath: process.env.CHROMIUM || "/usr/bin/chromium",
  args: ["--no-sandbox", "--hide-scrollbars"],
});
try {
  const pagina = await navegador.newPage();
  pagina.on("pageerror", e => console.error("promo.html:", e.message));
  await pagina.goto(`http://127.0.0.1:${puerto}/promo/promo.html?video=1`);
  const { W, H, DURACION } = await pagina.evaluate(() => window.listo);
  const total = Math.round(DURACION * FPS);
  console.log(`${W}×${H}, ${total} cuadros`);

  // la pista de sonido sale de la misma animación (ver pista() en promo.html)
  const wav = path.join(os.tmpdir(), `hackmethon-promo-${process.pid}.wav`);
  await writeFile(wav, Buffer.from(await pagina.evaluate(() => pistaWav()), "base64"));

  const ffmpeg = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    "-i", wav,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-shortest",
    "-movflags", "+faststart", salida,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const fin = new Promise((ok, mal) => ffmpeg.on("close", c => c ? mal(new Error("ffmpeg salió con " + c)) : ok()));

  for (let i = 0; i < total; i++){
    const png = await pagina.evaluate(t => { render(t); return document.getElementById("cv").toDataURL("image/png"); }, i / FPS);
    const buf = Buffer.from(png.split(",")[1], "base64");
    if (!ffmpeg.stdin.write(buf)) await new Promise(r => ffmpeg.stdin.once("drain", r));
    if (i % FPS === 0) process.stdout.write(`\r${Math.round(i / total * 100)}%`);
  }
  ffmpeg.stdin.end();
  await fin;
  await rm(wav, { force: true });
  console.log(`\r100% → ${path.relative(process.cwd(), salida)}`);
} finally {
  await navegador.close();
  servidor.close();
}
