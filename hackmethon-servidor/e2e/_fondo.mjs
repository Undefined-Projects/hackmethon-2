import puppeteer from 'puppeteer-core';
const APP='http://localhost:5173'; const esperar=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({headless:'new',executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const abrir=async(c)=>{const p=await b.newPage();await p.setViewport({width:1400,height:900});
  await p.evaluateOnNewDocument(x=>localStorage.setItem('hm:code',x),c);
  await p.goto(APP,{waitUntil:'networkidle2'});return p;};
const j1=await abrir('ALFA-1'), j2=await abrir('ALFA-2'), j3=await abrir('ALFA-3'), ad=await abrir('ADMIN-2026');
await ad.waitForSelector('.admin',{timeout:10000}); await esperar(800);
const pulsar=(p,s,t)=>p.evaluate((s,t)=>{[...document.querySelectorAll(s)].find(e=>e.textContent.trim().toUpperCase().includes(t))?.click();},s,t.toUpperCase());
await pulsar(ad,'.acciones button','Abrir'); await esperar(900);
await pulsar(j2,'.fase-accion button','Entrar');
await j3.waitForSelector('.vista-pantalla',{timeout:10000}); await esperar(600);
await ad.evaluate(()=>{const li=[...document.querySelectorAll('.miembros li')].find(l=>l.innerText.includes('Pantalla'));li?.querySelector('button.averia')?.click();});
await esperar(1500);
console.log(JSON.stringify(await j3.evaluate(()=>{
  const e = document.querySelector('.aviso-conexion');
  const cs = getComputedStyle(e);
  const anims = e.getAnimations().map(a => ({ nombre: a.animationName, estado: a.playState, t: Math.round(a.currentTime ?? -1) }));
  return { op: cs.opacity, animName: cs.animationName, animDur: cs.animationDuration,
           fill: cs.animationFillMode, delay: cs.animationDelay, estado: cs.animationPlayState,
           anims, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches };
}), null, 1));
await b.close(); process.exit(0);
