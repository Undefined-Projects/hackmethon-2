import puppeteer from 'puppeteer-core';

const APP = process.env.E2E_APP ?? 'http://localhost:5173';
let fallos = 0;
const check = (ok, txt) => { console.log(`  ${ok ? '✔' : '✘'} ${txt}`); if (!ok) fallos++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  protocolTimeout: 20000,
});

async function abrir(code) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  // confirm() dentro de page.evaluate bloquea el renderizador; lo neutralizamos.
  await page.evaluateOnNewDocument(() => { window.confirm = () => true; });
  page.on('pageerror', (e) => console.log('  [error de página]', String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((c) => localStorage.setItem('hm:code', c), code);
  // Contador de audio. Es instrumentacion de la PRUEBA: no toca el
  // codigo de la aplicacion, solo cuenta cuantos nodos de sonido se
  // crean, que es lo unico observable de un sonido desde fuera.
  await page.evaluateOnNewDocument(() => {
    window.__audio = { osc: 0, ruido: 0 };
    const P = window.AudioContext?.prototype;
    if (!P) return;
    const co = P.createOscillator, cb = P.createBufferSource;
    P.createOscillator = function () { window.__audio.osc++; return co.call(this); };
    P.createBufferSource = function () { window.__audio.ruido++; return cb.call(this); };
  });
  await page.goto(APP, { waitUntil: 'networkidle2' });
  return page;
}

const texto = (page, sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);

// Igual que clickTexto, pero esperando a que el botón esté habilitado.
// Mientras una acción del panel está en curso TODOS sus botones se
// deshabilitan; sin esperar, el click se perdía en silencio.
//
// Toda acción del PANEL tiene que pasar por aquí. Con cuatro equipos la
// ventana en la que los botones están apagados era tan corta que el
// click casi siempre llegaba antes; con diez, cada acción tarda más y
// esa carrera empezó a perderse.
const clickTextoCuandoSePueda = async (page, sel, t) => {
  const buscar = (sel, t) =>
    [...document.querySelectorAll(sel)].find((e) =>
      e.textContent.trim().toUpperCase().includes(t.toUpperCase()));
  await page.waitForFunction(
    (sel, t, src) => { const el = new Function('return ' + src)()(sel, t); return el && !el.disabled; },
    { timeout: 10000, polling: 200 }, sel, t, buscar.toString(),
  );
  return page.evaluate(
    (sel, t, src) => { new Function('return ' + src)()(sel, t).click(); return true; },
    sel, t, buscar.toString(),
  );
};

// Pulsa por selector, esperando a que el botón vuelva a estar habilitado.
// Buscar por texto no sirve aquí: mientras la acción está en curso el
// rótulo cambia («MEZCLANDO…») y el buscador dejaría de encontrarlo.
const clickCuandoSePueda = async (page, sel) => {
  await page.waitForFunction(
    (s) => { const b = document.querySelector(s); return b && !b.disabled; },
    { timeout: 10000, polling: 200 },
    sel,
  ).catch(async () => {
    const est = await page.evaluate((s) => {
      const b = document.querySelector(s);
      return b ? { texto: b.textContent.trim(), deshabilitado: b.disabled }
               : { ausente: true, cuerpo: document.body.innerText.slice(0, 200) };
    }, sel);
    console.log(`  [diag] ${sel} nunca se habilitó:`, JSON.stringify(est));
    throw new Error('boton bloqueado');
  });
  return page.evaluate((s) => { document.querySelector(s).click(); return true; }, sel);
};
// Click atómico dentro de la página: buscar y pulsar en la misma pasada.
// Con ElementHandle, React puede reemplazar el nodo entre la búsqueda y el
// click, y puppeteer se queda esperando a un nodo que ya no está en el DOM.
const clickTexto = (page, sel, t) =>
  page.evaluate(
    (sel, t) => {
      // Comparación sin distinguir mayúsculas: la rotulación del tubo
      // va en caja alta y un retoque estético no debe tumbar la prueba.
      const el = [...document.querySelectorAll(sel)].find((e) =>
        e.textContent.trim().toUpperCase().includes(t.toUpperCase()));
      if (!el) return false;
      el.click();
      return true;
    },
    sel, t,
  );

console.log('\n1) Carga y reparto por tipo de snapshot');
const admin = await abrir('ADMIN-2026');
await admin.waitForSelector('.admin', { timeout: 10000 });
check(true, 'ADMIN-2026 → panel de control');

// Reinicio: la prueba se hace autosuficiente en vez de exigir una base
// recién sembrada. Si has estado jugando a mano, esto la deja a cero.
await clickTextoCuandoSePueda(admin, '.fila-botones button', 'Reiniciar');
// Comprobación de verdad: esperamos a ver el reparto canónico en el
// panel. Un `wait` a ciegas dejaba correr la prueba con los roles de
// la corrida anterior y fallaba tres secciones más abajo.
const repartoOk = await admin.waitForFunction(
  () => {
    const roles = [...document.querySelectorAll('.equipo:first-child .miembros li .rol')]
      .map((e) => e.textContent.trim().toUpperCase());
    return roles.join(',') === 'DATOS,TERMINAL,PANTALLA';
  },
  { timeout: 10000, polling: 200 },
).then(() => true).catch(() => false);
check(repartoOk, 'juego reiniciado: reparto de roles canónico');

const jugador = await abrir('ALFA-2');
try {
  await jugador.waitForSelector('.lobby', { timeout: 10000 });
} catch {
  const visible = await jugador.evaluate(() => document.body.innerText.slice(0, 300));
  console.log('\n  El jugador no llegó al lobby. Pantalla actual:\n  ---\n  ' + visible.replace(/\n/g, '\n  ') + '\n  ---');
  console.log('  Comprueba que el servidor y el cliente están levantados.');
  await browser.close();
  process.exit(1);
}
check(true, 'ALFA-2 → lobby de jugador (no el panel)');
check((await jugador.$('.admin')) === null, 'el jugador no recibe nada del panel de admin');

console.log('\n2) El lobby refleja el estado del servidor');
// El numero de fases cambia cada vez que se toca el recorrido: la prueba
// pregunta cuantas hay en vez de llevar el numero escrito.
const totalFases = await jugador.$$eval('.fase', (n) => n.length);
const bloqueadas = await jugador.$$eval('.fase.bloqueada', (n) => n.length);
check(totalFases > 0 && bloqueadas === totalFases, `todas las fases arrancan bloqueadas (${bloqueadas}/${totalFases})`);

console.log('\n3) Apertura de fase sin recargar');
await clickTextoCuandoSePueda(admin, '.acciones button', 'Abrir');
await jugador.waitForSelector('.fase.abierta', { timeout: 6000 });
check(true, 'la Fase 1 se desbloquea sola en la pantalla del jugador');
const sigueBloqueada = await jugador.$$eval('.fase.bloqueada', (n) => n.length);
check(sigueBloqueada === totalFases - 1, `las demas siguen bloqueadas (${sigueBloqueada}/${totalFases - 1})`);
// La siguiente fase tiene que enseñar su gancho y NADA de su contenido:
// lo que se comprueba es que el texto visible sea el teaser sembrado, sea
// cual sea la fase que ocupe ese puesto.
const f2 = await jugador.$$eval('.fase', (n) => ({
  texto: n[1].querySelector('.fase-texto').textContent,
  titulo: n[1].querySelector('.fase-titulo')?.textContent ?? '',
}));
check(f2.texto.includes('tocando puertas que no son suyas'), `la fase bloqueada muestra el teaser (${f2.texto.trim().slice(0, 40)}…)`);
check(!f2.texto.includes('CONDICIONALES'), 'y no su descripcion, que es contenido');

// Acceso libre. Con una sola fase abierta esto no se puede probar: las
// demas estan cerradas por el ADMIN, no por la cadena, y el interruptor no
// las toca —a proposito—. Asi que primero se abre una segunda fase.
{
  check((await admin.$('.interruptor.encendido')) === null, 'el interruptor viene apagado');

  // El boton «Abrir» de una fase ya ACTIVA esta deshabilitado, asi que hay
  // que buscar el primero que se pueda pulsar: clickTexto encontraria el de
  // la Fase 1 y no pasaria nada.
  //
  // Y hay que ESPERAR a que haya alguno. Mientras la apertura anterior
  // sigue en curso el panel apaga TODOS sus botones, asi que no existe
  // ninguno que cumpla `!disabled`, el `?.` se lo traga y no se abre nada.
  // Con cuatro equipos esa ventana era tan corta que casi nunca se
  // notaba; con diez, cada accion del panel dura mas y se perdia.
  const abrirLibre = () => [...document.querySelectorAll('.acciones button')]
    .find((x) => x.textContent.trim() === 'Abrir' && !x.disabled);
  await admin.waitForFunction(
    (src) => !!new Function('return ' + src)()(),
    { timeout: 10000, polling: 150 }, abrirLibre.toString(),
  );
  await admin.evaluate((src) => new Function('return ' + src)()().click(), abrirLibre.toString());
  await admin.waitForFunction(
    () => /2 activa\(s\)/.test(document.querySelector('.panel__stat')?.parentElement?.textContent ?? '')
       || [...document.querySelectorAll('.panel__stat')].some((e) => /2 activa/.test(e.textContent)),
    { timeout: 8000, polling: 200 },
  ).catch(() => {});
  const activas = await admin.$$eval('.panel__stat', (n) => n.map((e) => e.textContent).join(' | '));
  check(/2 activa/.test(activas), `el panel confirma dos fases abiertas (${activas})`);

  const conDosAbiertas = await jugador.$$eval('.fase.bloqueada', (n) => n.length);
  const segundaBloqueada = await jugador.$$eval('.fase', (n) => n[1].className.includes('bloqueada'));
  check(conDosAbiertas === totalFases - 1 && segundaBloqueada,
    'la Fase 2 esta ABIERTA y aun asi bloqueada: la cadena manda');

  await clickTextoCuandoSePueda(admin, '.fila-botones button', 'ACCESO LIBRE');
  await jugador.waitForFunction(
    (n) => document.querySelectorAll('.fase.bloqueada').length === n,
    { timeout: 8000, polling: 200 },
    totalFases - 2,
  ).catch(() => {});
  check((await jugador.$$eval('.fase.bloqueada', (n) => n.length)) === totalFases - 2,
    'con acceso libre la Fase 2 se desbloquea sola, sin recargar');
  check((await admin.$('.interruptor.encendido')) !== null, 'y el interruptor se ve encendido');

  // Lo que NO hace: abrir las que el admin tiene cerradas.
  check((await jugador.$$eval('.fase.bloqueada', (n) => n.length)) === totalFases - 2,
    'las que el admin no ha abierto siguen cerradas');

  await clickTextoCuandoSePueda(admin, '.fila-botones button', 'ACCESO LIBRE');
  await jugador.waitForFunction(
    (n) => document.querySelectorAll('.fase.bloqueada').length === n,
    { timeout: 8000, polling: 200 },
    totalFases - 1,
  ).catch(() => {});
  check((await jugador.$$eval('.fase.bloqueada', (n) => n.length)) === totalFases - 1,
    'y al apagarlo vuelve la cadena, tambien sin recargar');
}

console.log('\n4) Renderizado estricto por rol');
await clickTextoCuandoSePueda(jugador, '.fase-accion button', 'Entrar');
await jugador.waitForSelector('.vista', { timeout: 6000 });
const rol1 = await texto(jugador, '.fase-cabecera .rol');
const clase1 = await jugador.$eval('.vista', (e) => e.className);
check(rol1 === 'Terminal', `ALFA-2 entra como ${rol1}`);
check(clase1.includes('vista-terminal'), 'monta SOLO la vista de Terminal');
check((await jugador.$('.marco-datos')) === null, 'no existe el panel de Datos en el DOM');
check((await jugador.$('.marco-pantalla')) === null, 'no existe el panel de Pantalla en el DOM');

console.log('\n5) Estado local antes de la mezcla');
await jugador.type('.entrada-cmd input', 'nmap -sV 10.0.0.5');
await jugador.keyboard.press('Enter');
await wait(300);
const historial1 = await jugador.$$eval('.linea-cmd', (n) => n.length);
const montaje1 = await texto(jugador, '.huella');
check(historial1 === 1, 'el comando queda en el historial local de la consola');
check(!!montaje1, `identificador de montaje: ${montaje1}`);

console.log('\n6) mezclar_roles → la UI se destruye y se reconstruye');
const roles = [rol1];
const montajes = [montaje1];
for (let i = 0; i < 3; i++) {
  const anterior = roles[roles.length - 1];
  const clicado = await clickCuandoSePueda(admin, '.mezclar-todo');
  // Esperamos a que el rol CAMBIE de verdad. Con una espera fija, un
  // click que cae con el panel ocupado deja la prueba en falso negativo.
  await jugador.waitForFunction(
    (prev) => document.querySelector('.fase-cabecera .rol')?.textContent.trim() !== prev,
    { timeout: 10000, polling: 200 },
    anterior,
  ).catch(async () => {
    const aviso = await admin.evaluate(() => document.querySelector('.aviso')?.textContent ?? 'sin aviso');
    const rolAhora = await texto(jugador, '.fase-cabecera .rol');
    const pantalla = await jugador.evaluate(() => document.body.innerText.slice(0, 120).replace(/\n/g, ' | '));
    console.log(`  [diag] mezcla ${i}: clic=${clicado} aviso="${aviso}" rol=${rolAhora} anterior=${anterior}`);
    console.log(`  [diag] jugador: ${pantalla}`);
    throw new Error('la mezcla no llegó al jugador');
  });
  roles.push(await texto(jugador, '.fase-cabecera .rol'));
  montajes.push(await texto(jugador, '.huella'));
}
check(roles.every((r, i) => i === 0 || r !== roles[i - 1]), `nunca repite rol consecutivo: ${roles.join(' → ')}`);
check(new Set(roles).size === 3, 'recorre los tres puestos');
check(roles[3] === rol1, `tras 3 mezclas vuelve a ${rol1}`);
check(new Set(montajes).size === 4, `4 montajes distintos, uno por cambio (${montajes.join(', ')})`);

console.log('\n7) El estado local NO sobrevive al cambio de rol');
const claseFinal = await jugador.$eval('.vista', (e) => e.className);
check(claseFinal.includes('vista-terminal'), 'vuelve a ser la consola');
const historial2 = await jugador.$$eval('.linea-cmd', (n) => n.length);
check(historial2 === 0, `la consola vuelve vacía: el árbol se destruyó de verdad (${historial2} líneas)`);
check(montajes[3] !== montajes[0], 'el identificador de montaje cambió → hubo desmontaje, no repintado');

console.log('\n8) Pausa en vivo');
await clickTextoCuandoSePueda(admin, '.fila-botones button', 'Pausar');
const avisoPausa = await jugador.waitForFunction(
  () => !!document.querySelector('.banda.pausa'),
  { timeout: 8000, polling: 200 },
).then(() => true).catch(() => false);
check(avisoPausa, 'el jugador ve el aviso de pausa DENTRO de la fase');

await clickTextoCuandoSePueda(admin, '.fila-botones button', 'Reanudar');
const avisoFuera = await jugador.waitForFunction(
  () => !document.querySelector('.banda.pausa'),
  { timeout: 8000, polling: 200 },
).then(() => true).catch(() => false);
check(avisoFuera, 'y desaparece al reanudar');

console.log('\n9) La primera fase, jugada por los tres roles');
{
  // Tras 3 mezclas cada uno vuelve a su puesto inicial:
  // ALFA-1 Datos · ALFA-2 Terminal · ALFA-3 Pantalla.
  const pDatos = await abrir('ALFA-1');
  const pPant = await abrir('ALFA-3');
  await pDatos.waitForSelector('.vista-datos .mapa', { timeout: 8000 });
  await pPant.waitForSelector('.vista-pantalla', { timeout: 8000 });

  // Datos abre en el MAPA del esquema, no en una tabla suelta.
  const nodos = await pDatos.$$eval('.nodo', (n) => n.map((e) => e.dataset.tabla));
  const aristas = await pDatos.$$eval('.mapa-aristas path', (n) => n.length);
  // El numero de tablas y de relaciones sale del esquema de la fase que
  // ocupe el primer puesto: lo que se comprueba es que el mapa las dibuje
  // TODAS y que cada relacion tenga su arista, no un numero concreto.
  check(nodos.length === 3, `el mapa dibuja las 3 tablas (${nodos.join(', ')})`);
  check(aristas === 2, `y las 2 relaciones entre ellas (${aristas})`);
  check((await pDatos.$('.tabla-datos')) === null, 'ninguna tabla se abre sola');

  // Pulsar un nodo abre su contenido.
  await pDatos.evaluate(() => document.querySelector('[data-tabla="credenciales"]').click());
  await pDatos.waitForSelector('.tabla-datos', { timeout: 6000 });
  const registros = await pDatos.$$eval('.tabla-datos tbody tr', (n) => n.length);
  check(registros === 7, `al pulsar «credenciales» se ven sus 7 filas (${registros})`);

  // Y una celda de clave ajena salta a la tabla referenciada.
  await pDatos.evaluate(() => {
    const fila = [...document.querySelectorAll('.tabla-datos tbody tr')]
      .find((tr) => tr.textContent.includes('C6'));
    fila.querySelector('.ref').click();
  });
  await pDatos.waitForFunction(
    () => document.querySelector('.vista-datos header h2')?.textContent.includes('personas'),
    { timeout: 6000, polling: 200 },
  ).catch(() => {});
  const saltada = await pDatos.$eval('.vista-datos header h2', (e) => e.textContent.trim()).catch(() => '');
  const resaltada = await pDatos.$eval('.tabla-datos tr.resaltada', (e) => e.textContent.trim()).catch(() => '');
  check(saltada.includes('personas'), `la clave ajena salta a la tabla referenciada (${saltada})`);
  check(resaltada.includes('t.medina'), `y resalta la fila exacta (${resaltada})`);

  await pDatos.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((e) => e.textContent.includes('MAPA'));
    b?.click();
  });
  await pDatos.waitForSelector('.mapa', { timeout: 6000 });
  check((await pDatos.$('.entrada-cmd')) === null, 'Datos no tiene consola');
  check((await pPant.$('.entrada-cmd')) === null, 'Pantalla no tiene consola');
  check((await pPant.$('.tabla-datos')) === null, 'Pantalla no ve los registros');

  // ---- A partir de aqui se juega EL ENEMIGO ----
  // Es la fase con monitor de trafico, y ya no es la primera del
  // recorrido: hace falta el acceso libre para entrar sin resolver la que
  // tiene delante. Lo que viene detras —el ataque en vivo, los filtros,
  // los aislamientos— no existe en ninguna otra fase.
  await clickTextoCuandoSePueda(admin, '.fila-botones button', 'ACCESO LIBRE');
  await jugador.evaluate(() => {
    [...document.querySelectorAll('button, a')].find((e) => /LOBBY/i.test(e.textContent))?.click();
  });
  await jugador.waitForSelector('.lobby', { timeout: 8000 });

  // El acceso libre llega al jugador en su propio `lobby:update`, y hasta
  // que llega el botón de El Enemigo sigue apagado. Esperar medio segundo
  // bastaba con cuatro equipos; con diez, el servidor recalcula diez
  // lobbies antes de llegar a este y el click caía en un botón muerto,
  // sin error y sin pista.
  const entrarEnemigo = () => {
    const f = [...document.querySelectorAll('.fase')].find((e) => e.innerText.includes('El Enemigo'));
    return [...(f?.querySelectorAll('button') ?? [])]
      .find((x) => x.textContent.toUpperCase().includes('ENTRAR'));
  };
  await jugador.waitForFunction(
    (src) => { const b = new Function('return ' + src)()(); return !!b && !b.disabled; },
    { timeout: 12000, polling: 200 }, entrarEnemigo.toString(),
  );
  await jugador.evaluate((src) => new Function('return ' + src)()().click(), entrarEnemigo.toString());
  await jugador.waitForSelector('.entrada-cmd input', { timeout: 8000 });
  await pPant.waitForSelector('.vista-pantalla', { timeout: 8000 });
  await wait(400);
  const enEnemigo = await jugador.$eval('.fase-cabecera, header', (e) => e.textContent);
  check(/Enemigo/.test(enEnemigo), `el equipo entra a El Enemigo (${enEnemigo.trim().slice(0, 40)})`);

  // El Terminal escribe; la respuesta debe aparecer SOLO en Pantalla.
  await jugador.type('.entrada-cmd input', 'politica');
  await jugador.keyboard.press('Enter');
  // Esperamos por el CONTENIDO, no por `.salida`: Pantalla ya arrastra
  // el historial de comandos anteriores, así que el selector existe
  // desde antes y la comprobación se haría sobre la salida equivocada.
  await pPant.waitForFunction(
    () => document.body.innerText.includes('10.4.0.0/16'),
    { timeout: 8000, polling: 200 },
  ).catch(() => {});
  const enPantalla = await pPant.evaluate(() => document.body.innerText);
  const enTerminal = await jugador.evaluate(() => document.body.innerText);
  const enDatos = await pDatos.evaluate(() => document.body.innerText);
  check(enPantalla.includes('10.4.0.0/16'), 'Pantalla ve la política');
  check(!enTerminal.includes('10.4.0.0/16'), 'Terminal NO ve la respuesta que provocó');
  check(!enDatos.includes('10.4.0.0/16'), 'Datos tampoco la ve');
  check(enTerminal.includes('politica'), 'Terminal ve el eco de su comando y el acuse');

  // El monitor: peticiones que caen SOLAS, y solo en una de las tres pantallas.
  await jugador.type('.entrada-cmd input', 'trafico');
  await jugador.keyboard.press('Enter');
  await pPant.waitForSelector('.monitor .flujo-linea', { timeout: 10000 }).catch(() => {});
  await wait(2200);
  const cayeron = await pPant.$$eval('.flujo-linea', (n) => n.length).catch(() => 0);
  check(cayeron >= 2, `el ataque cae solo, sin pedir nada (${cayeron} peticiones)`);
  check((await jugador.$('.flujo-linea')) === null, 'Terminal no ve el ataque que abrió');
  check((await pDatos.$('.flujo-linea')) === null, 'Datos tampoco lo ve');
  const barra = await pPant.$eval('.monitor-barra', (e) => e.innerText).catch(() => '');
  check(/\d+ PETICIONES/i.test(barra), `el monitor lleva la cuenta (${barra.replace(/\n/g, ' · ')})`);

  await jugador.type('.entrada-cmd input', 'trafico detener');
  await jugador.keyboard.press('Enter');
  await wait(1200);
  const congelado = await pPant.$$eval('.flujo-linea', (n) => n.length).catch(() => 0);
  await wait(1500);
  const despues = await pPant.$$eval('.flujo-linea', (n) => n.length).catch(() => 0);
  check(despues === congelado, `y deja de caer cuando Terminal lo cierra (${congelado} → ${despues})`);

  // Acotar la vista. El monitor quedó cerrado, así que esto lo abre ya
  // filtrado: el equipo no tiene que transcribir sesenta líneas para
  // mirar una máquina.
  await jugador.type('.entrada-cmd input', 'trafico ip 188.42.19.6');
  await jugador.keyboard.press('Enter');
  await pPant.waitForSelector('.monitor-filtro', { timeout: 10000 }).catch(() => {});
  const chapa = await pPant.$eval('.monitor-filtro', (e) => e.innerText).catch(() => '');
  check(/188\.42\.19\.6/.test(chapa), `Pantalla ve el encuadre activo (${chapa})`);
  await wait(2400);
  const acotado = await pPant.$$eval('.flujo-linea .f-ip', (n) => n.map((x) => x.innerText));
  check(acotado.length > 0 && acotado.every((ip) => ip === '188.42.19.6'),
    `solo se pinta lo que encaja (${acotado.length} líneas)`);
  check((await jugador.$('.monitor-filtro')) === null, 'Terminal sigue sin ver nada de todo esto');

  await jugador.type('.entrada-cmd input', 'trafico todo');
  await jugador.keyboard.press('Enter');
  await wait(2400);
  const entero = await pPant.$$eval('.flujo-linea .f-ip', (n) => n.map((x) => x.innerText));
  check(entero.some((ip) => ip !== '188.42.19.6'), 'y `trafico todo` devuelve el ataque entero');
  check((await pPant.$('.monitor-filtro')) === null, 'la chapa del encuadre desaparece con él');

  await jugador.type('.entrada-cmd input', 'trafico detener');
  await jugador.keyboard.press('Enter');
  await wait(600);

  // Acusación en falso.
  await jugador.type('.entrada-cmd input', 'bloquear s.cabral permiso');
  await jugador.keyboard.press('Enter');
  await pPant.waitForFunction(
    () => document.body.innerText.includes('no consta ninguna petición'),
    { timeout: 8000, polling: 200 },
  ).catch(() => {});
  const trasFallo = await pPant.evaluate(() => document.body.innerText);
  check(trasFallo.includes('no consta ninguna petición'), 'Pantalla ve el fallo');
  check((await pPant.$('.bloque-error')) !== null, 'el fallo se pinta como error');
}

console.log('\n9 bis) Ensayo de la victoria desde el panel');
{
  const paginas = await browser.pages();
  const jugadores = [];
  for (const pg of paginas) {
    if (await pg.$('.espacio-fase')) jugadores.push(pg);
  }
  check(jugadores.length === 3, `los tres puestos están dentro de la fase (${jugadores.length})`);

  await clickTextoCuandoSePueda(admin, '.acciones-reparto button', 'ENSAYAR');
  for (const pg of jugadores) await pg.waitForSelector('.celebracion', { timeout: 10000 }).catch(() => {});

  const vistas = [];
  for (const pg of jugadores) {
    if (await pg.$('.celebracion')) vistas.push(await pg.$eval('.celebracion', (e) => e.innerText));
  }
  check(vistas.length === 3, `la victoria sale en los tres a la vez (${vistas.length})`);
  check(vistas.every((t) => /FASE COMPLETADA/i.test(t)), 'con el rótulo de fase completada');
  check(vistas.every((t) => /ENSAYO DEL PANEL/i.test(t)), 'y marcada como ensayo, que no es una victoria');

  // «En toda la pantalla» es literal: tiene que cubrir el tubo entero.
  const cubre = await jugadores[0].$eval('.celebracion', (e) => {
    const r = e.getBoundingClientRect();
    return r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2;
  });
  check(cubre, 'y ocupa la pantalla completa, no una tarjeta centrada');

  // Lo que no puede pasar: que cerrar un ENSAYO eche al equipo de la
  // fase que está jugando. La victoria real sí devuelve al lobby.
  for (const pg of jugadores) await clickTexto(pg, '.celebracion button', 'Cerrar');
  await wait(600);
  const siguenDentro = [];
  for (const pg of jugadores) if (await pg.$('.espacio-fase')) siguenDentro.push(pg);
  check(siguenDentro.length === 3, `cerrar el ensayo no saca a nadie de la fase (${siguenDentro.length}/3)`);
  check((await jugador.$('.entrada-cmd input')) !== null, 'y Terminal conserva su consola');
}

console.log('\n10) Resolución y celebración');
{
  const pPant = (await browser.pages()).at(-1);
  // Levantamos la cuarentena esperando; son 20 s por diseño.
  await wait(20500);

  // Cuatro culpables, uno por cada forma de incumplir. La fase no se
  // cierra hasta la última: comprobamos que las tres primeras NO la
  // cierran, que es donde estaría el fallo si el conteo se rompiera.
  for (const [cuenta, motivo] of [
    ['svc.backup', 'no-registrada'],
    ['k.moreno', 'no-registrada'],
    ['a.duarte', 'maquina'],
  ]) {
    await jugador.type('.entrada-cmd input', `bloquear ${cuenta} ${motivo}`);
    await jugador.keyboard.press('Enter');
    await wait(900);
  }
  check((await jugador.$('.celebracion')) === null, 'con tres de cuatro la fase sigue abierta');
  const parcial = await pPant.evaluate(() => document.body.innerText);
  check(/3 de 4/i.test(parcial), 'Pantalla lleva la cuenta de los aislamientos');

  await jugador.type('.entrada-cmd input', 'bloquear j.ortega permiso');
  await jugador.keyboard.press('Enter');
  await jugador.waitForSelector('.celebracion', { timeout: 10000 });
  const celebra = await jugador.$eval('.celebracion', (e) => e.innerText);
  check(/\d\d:\d\d/.test(celebra), `Terminal ve su tiempo (${celebra.split('\n').join(' · ')})`);
  check((await pPant.$('.celebracion')) !== null, 'Pantalla también ve la celebración');

  // La victoria la ven los TRES, y volver al lobby es un acto de equipo:
  // el que pulsa se lleva a los otros dos. Si no, quien no pulsó se queda
  // mirando la pantalla de victoria por encima de un lobby que ya tiene
  // debajo y no puede tocar.
  const puestos = [];
  for (const pg of await browser.pages()) {
    if (await pg.$('.jugador')) puestos.push(pg);
  }
  check(puestos.length === 3, `los tres puestos siguen conectados (${puestos.length})`);
  const conVictoria = [];
  for (const pg of puestos) if (await pg.$('.celebracion')) conVictoria.push(pg);
  check(conVictoria.length === 3, `los tres ven la victoria (${conVictoria.length})`);

  await clickTexto(jugador, '.celebracion button', 'Volver');
  await jugador.waitForSelector('.lobby', { timeout: 8000 });

  for (const pg of puestos) {
    await pg.waitForFunction(() => document.querySelector('.celebracion') === null,
      { timeout: 8000, polling: 150 }).catch(() => {});
  }
  const quedan = [];
  for (const pg of puestos) if (await pg.$('.celebracion')) quedan.push(pg);
  check(quedan.length === 0, `uno pulsa y a los tres se les baja el telon (${quedan.length} pendientes)`);
  const enLobby = [];
  for (const pg of puestos) if (await pg.$('.lobby')) enLobby.push(pg);
  check(enLobby.length === 3, `y los tres acaban en el lobby (${enLobby.length}/3)`);

  const lobby = await jugador.evaluate(() => document.body.innerText);
  check(lobby.includes('Resuelta en'), 'el lobby muestra la fase resuelta con su tiempo');
}

console.log('\n11) La carrera');
{
  // ALFA acaba de resolver la Fase 1, asi que la carrera tiene que
  // enseñarlo YA: es la prueba de que pinta datos vivos y no una foto.
  const equiposEnPanel = await admin.$$eval('.equipos .equipo', (n) => n.length);
  const bonus = await admin.$$eval('.marca-bonus', (n) => n.length);
  const barrerasEsperadas = totalFases - bonus;
  await clickTexto(admin, '.estado-evento button', 'CARRERA');
  await admin.waitForSelector('.carrera', { timeout: 8000 });

  // Contra los equipos que haya, no contra un número escrito aquí: el
  // seed pasó de cuatro a diez y esto no tiene por qué enterarse.
  const equipos = equiposEnPanel;
  const calles = await admin.$$eval('.calle', (n) => n.length);
  // Hasta ocho, una calle por equipo. Con más no caben en un proyector:
  // cinco calles de cabeza de carrera y TODOS en el pelotón.
  if (equipos <= 8) {
    check(calles === equipos && calles > 0, `una calle por equipo (${calles} de ${equipos})`);
  } else {
    check(calles === 5, `con ${equipos} equipos, cinco calles de cabeza de carrera (${calles})`);
    const fichas = await admin.$$eval('.pel-ficha', (n) => n.length);
    check(fichas === equipos, `y el pelotón tiene a todos (${fichas} de ${equipos})`);
    // ALFA resolvió la Fase 1: su ficha está en la segunda columna.
    const colAlfa = await admin.$$eval('.peloton-col', (cols) =>
      cols.findIndex((c) => [...c.querySelectorAll('.pel-ficha-txt')].some((e) => e.textContent.trim() === 'ALFA')));
    check(colAlfa === 1, `ALFA va en la columna de la barrera siguiente (${colAlfa})`);
  }

  // Un poste por BARRERA, y el bonus no lo es: va detrás de la meta.
  const postes = await admin.$$eval('.calle:first-child .poste', (n) => n.length);
  check(postes === barrerasEsperadas,
    `un poste por barrera, sin contar el bonus (${postes} de ${totalFases} fases)`);
  const cabecera = await texto(admin, '.carrera-cab');
  check(/bonus/i.test(cabecera), `y la cabecera dice que hay bonus (${cabecera.replace(/\s+/g, ' ')})`);

  // La posicion se lee del propio estilo: `--x` es 0..1 sobre el recorrido.
  const avances = await admin.$$eval('.caballo', (n) =>
    n.map((e) => ({
      x: Number(e.style.getPropertyValue('--x')),
      calle: e.closest('.calle').querySelector('.calle-nombre').innerText.split('\n')[0].trim(),
    })));
  const alfa = avances.find((a) => a.calle === 'ALFA');
  const otro = avances.find((a) => a.calle === 'CHARLIE');
  check(alfa.x > 0, `ALFA ha salido de la salida tras resolver (${alfa.x.toFixed(3)})`);
  check(otro.x === 0, 'y quien no ha resuelto sigue en la salida');
  check(alfa.x > otro.x, 'el que va por delante esta mas a la derecha, que es la carrera entera');

  const lider = await admin.$eval('.banderin', (e) => e.closest('.calle').querySelector('.calle-nombre').innerText.split('\n')[0].trim());
  check(lider === 'ALFA', `el banderin de lider va a quien mas lleva (${lider})`);

  const marca = await admin.$eval('.calle-marca', (e) => e.innerText);
  check(marca.length > 0, `cada calle dice en que fase va (${marca.replace(/\n/g, ' · ')})`);

  // El balanceo. Va en el SVG, no en `.caballo`: si alguien lo mueve al
  // contenedor, la animacion pisaria el transform que lo centra sobre la
  // pista y el caballo se descolocaria en cada fotograma.
  const anim = await admin.$eval('.tordo', (e) => {
    const s = getComputedStyle(e);
    return { nombre: s.animationName, dur: s.animationDuration };
  });
  check(anim.nombre !== 'none', `el caballo se balancea (${anim.nombre} · ${anim.dur})`);
  check((await admin.$eval('.cola', (e) => getComputedStyle(e).animationName)) !== 'none',
    'y la cola va suelta');

  // Lo que recorre DE VERDAD la punta de la oreja, que es lo que ve quien
  // mira desde el fondo de la sala, y en proporcion al propio caballo:
  // mide entre 28 y 58 px segun el ancho, asi que un umbral en pixeles
  // diria cosas distintas en cada sala.
  //
  // Hay suelo y techo. El techo estaba desde el principio: que no acabe
  // en un dibujo animado. El suelo se anadio despues, porque el balanceo
  // nacio tan corto —un 2 % de la altura— que no se veia proyectado, y
  // sin suelo nada impide volver a dejarlo asi.
  const meneo = await admin.evaluate(async () => {
    const svg = document.querySelector('.tordo');
    const c = svg.getBoundingClientRect();
    // La oreja, en px del elemento y respecto al pivote (50% 92%, los cascos).
    const rel = new DOMPoint(c.width * (52 / 62) - c.width * 0.5,
                             c.height * (4 / 48) - c.height * 0.92);
    const poses = new Set();
    let max = 0;
    for (let i = 0; i < 44; i++) {          // 44 × 60 ms = 2,6 s: un ciclo entero
      const m = new DOMMatrix(getComputedStyle(svg).transform);
      const q = m.transformPoint(rel);
      max = Math.max(max, Math.hypot(q.x - rel.x, q.y - rel.y));
      poses.add(`${m.a.toFixed(3)}|${m.f.toFixed(2)}`);
      await new Promise((r) => setTimeout(r, 60));
    }
    return { pct: (max / c.height) * 100, poses: poses.size, alto: Math.round(c.height) };
  });
  check(meneo.poses > 3, `se mueve de verdad (${meneo.poses} poses distintas)`);
  check(meneo.pct > 8,
    `y se ve desde el fondo: la cabeza recorre el ${meneo.pct.toFixed(0)}% del caballo (${meneo.alto}px de alto)`);
  check(meneo.pct < 28, 'sin pasarse: sigue siendo una chapa en un carril');

  // Un proyector es justo donde alguien se marea.
  await admin.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const quieto = await admin.$eval('.tordo', (e) => getComputedStyle(e).animationName);
  const colaQuieta = await admin.$eval('.cola', (e) => getComputedStyle(e).animationName);
  check(quieto === 'none' && colaQuieta === 'none', 'y con prefers-reduced-motion se para todo');
  await admin.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  // Y se vuelve al panel: es una vista, no una salida sin retorno.
  await clickTexto(admin, '.volver-panel', 'PANEL');
  await admin.waitForSelector('.barra', { timeout: 8000 });
  check((await admin.$('.carrera')) === null, 'y se vuelve al panel de control');
}

console.log('\n12) La proyección de sala');
{
  // Se abre en SU PROPIA ventana: la gracia es arrastrar esta al
  // proyector y seguir gobernando el evento en la otra.
  const pared = await abrir('ADMIN-2026');
  await pared.waitForSelector('.admin', { timeout: 8000 });
  await pared.evaluate(() => { window.location.hash = 'proyeccion'; });
  await pared.waitForSelector('.proyeccion', { timeout: 8000 });
  check(true, 'se abre desde el hash, sin tocar el panel');

  // Un F5 en mitad del evento no puede devolverla al panel de control.
  await pared.reload({ waitUntil: 'networkidle2' });
  await pared.waitForSelector('.proyeccion', { timeout: 8000 });
  check(true, 'y sobrevive a una recarga');

  // Sin fase destacada: carta de espera y NINGÚN rótulo debajo
  // repitiendo lo que la escena ya pone en letras de un palmo.
  check((await pared.$('.esc-espera')) !== null, 'sin fase destacada pinta la carta de espera');
  check((await pared.$('.proy-rotulo')) === null, 'y ahí no hay rótulo que repita «en espera»');

  // Destacar una fase desde el PANEL, que es el otro puesto.
  const destacar = (n) => admin.evaluate((n) => {
    const sec = [...document.querySelectorAll('.panel')]
      .find((s) => s.querySelector('.panel__name')?.textContent.includes('BARRERAS'));
    const fila = [...sec.querySelectorAll('tbody tr')][n];
    const botones = [...fila.querySelectorAll('.acciones button')];
    botones[botones.length - 1].click();
    return fila.querySelector('td:nth-child(2)').textContent;
  }, n);

  await destacar(2); // Fase 3 — Muro de Repetición

  // El cruce: durante la transición conviven las dos escenas. Es lo que
  // la hace suave, y lo que hay que vigilar es que la vieja SE VAYA.
  await pared.waitForFunction(() => document.querySelectorAll('.escenario .capa').length === 2,
    { timeout: 4000, polling: 50 });
  check(true, 'al cambiar de fase las dos escenas se cruzan');

  await pared.waitForFunction(() => document.querySelectorAll('.escenario .capa').length === 1,
    { timeout: 4000, polling: 100 });
  check(true, 'y la que sale se desmonta al terminar el cruce');

  check((await pared.$('.esc-muro')) !== null, 'la escena es la de la fase destacada');
  const rotulo = await texto(pared, '.proy-rotulo');
  check(rotulo.includes('F3'), `el rótulo lleva el número de fase (${rotulo.slice(0, 24)}…)`);
  check(rotulo.includes('golpes'), 'y la frase de cartel que viene del seed');
  check(!rotulo.includes('Fase 3 —'), 'sin repetir «Fase 3 —», que ya lo dice el número');

  // La escena no puede derramarse sobre el rótulo: es lo único que se
  // lee de cerca, y una cifra encima lo tapa entero.
  const derrame = await pared.evaluate(() => {
    const esc = document.querySelector('.escenario');
    const caja = esc.getBoundingClientRect();
    return [...esc.querySelectorAll('.esc > *')]
      .filter((el) => { const r = el.getBoundingClientRect();
        return r.bottom > caja.bottom + 1 || r.top < caja.top - 1; })
      .map((el) => el.className);
  });
  check(derrame.length === 0, `la escena cabe en el escenario (${derrame.join(', ') || 'sin desbordes'})`);

  // Un proyector es justo donde alguien se marea.
  await pared.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const quietas = await pared.evaluate(() =>
    [...document.querySelectorAll('.capa, .mur-ariete, .proy-rotulo')]
      .map((e) => getComputedStyle(e).animationName));
  check(quietas.every((n) => n === 'none'), `con prefers-reduced-motion se para todo (${quietas.join(', ')})`);
  await pared.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  // Y se vuelve al panel: es una vista, no una salida sin retorno.
  await clickTexto(pared, '.volver-panel', 'PANEL');
  await pared.waitForSelector('.barra', { timeout: 8000 });
  check((await pared.$('.proyeccion')) === null, 'se vuelve al panel de control');
  check(!(await pared.evaluate(() => window.location.hash)), 'y el hash se queda limpio');

  await destacar(2); // se deja el evento como estaba
}

console.log('\n13) Nombre y logo del equipo, desde el panel');
{
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');

  // Los archivos se escriben al vuelo: así la prueba no arrastra un
  // binario, y el PNG es un PNG de verdad —con su cabecera— que es lo
  // único que el servidor mira para decidir si lo acepta.
  const carpeta = mkdtempSync(join(tmpdir(), 'hm-logo-'));
  const escudo = join(carpeta, 'escudo.png');
  writeFileSync(escudo, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ));
  const trampa = join(carpeta, 'trampa.png');
  writeFileSync(trampa, 'esto no es un png, aunque se llame .png\n');

  const tarjeta = (n) => `.equipos .equipo:nth-child(${n})`;
  const nombreDe = (n) => admin.$eval(`${tarjeta(n)} .identidad-nombre input`, (e) => e.value);
  const aviso = () => texto(admin, '.aviso');
  const subir = async (n, archivo) => {
    const input = await admin.$(`${tarjeta(n)} .escudo-archivo`);
    await input.uploadFile(archivo);
    await wait(900);
  };
  // Se escribe DENTRO de la página. Con varias pestañas abiertas la que
  // no está delante se ralentiza y el clic de puppeteer se cuelga; es el
  // mismo motivo por el que aquí se pulsa siempre desde `evaluate`.
  const renombrar = async (n, valor) => {
    await admin.evaluate((sel, val) => {
      const el = document.querySelector(sel);
      // El setter nativo más un evento `input`: asignar `.value` a secas
      // no se lo cuenta a React y el campo vuelve solo al valor anterior.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.closest('form').requestSubmit();
    }, `${tarjeta(n)} .identidad-nombre input`, valor);
    await wait(900);
  };

  check(await nombreDe(1) === 'ALFA', `el primer equipo es ${await nombreDe(1)}`);

  // --- el logo ---
  await subir(1, escudo);
  const src = await admin.$eval(`${tarjeta(1)} .escudo img`, (e) => e.src).catch(() => null);
  check(!!src && src.includes('/api/equipos/') && src.includes('?v='),
    'el escudo del panel apunta al logo con su versión');
  check(await admin.$eval(`${tarjeta(1)} .escudo img`, (e) => e.naturalWidth) > 0,
    'y el navegador lo descarga y lo pinta de verdad');

  const v1 = new URL(src).searchParams.get('v');
  await subir(1, escudo);
  const v2 = new URL(await admin.$eval(`${tarjeta(1)} .escudo img`, (e) => e.src)).searchParams.get('v');
  check(v1 !== v2, `volver a subirlo cambia la URL, que se cachea para siempre (${v1} → ${v2})`);

  await subir(2, trampa);
  check((await aviso() ?? '').includes('no es un PNG'),
    `un .png que no lo es se rechaza («${await aviso()}»)`);
  check((await admin.$(`${tarjeta(2)} .escudo img`)) === null, 'y ese equipo se queda sin logo');

  // --- el nombre ---
  await renombrar(1, '  Los   Tigres  ');
  check(await nombreDe(1) === 'Los Tigres', `el equipo pasa a llamarse ${await nombreDe(1)}`);
  // Las tarjetas van por antigüedad, no por nombre: si se reordenaran,
  // lo siguiente que tocara el admin sería el equipo de al lado.
  check(await nombreDe(2) === 'BRAVO', 'y la tarjeta no salta de sitio: la segunda sigue siendo BRAVO');
  check(await admin.$eval(`${tarjeta(1)} .miembros .nombre`, (e) => e.textContent.trim()) === 'Jugador 1',
    'el nombre de la gente sigue limpio bajo el equipo nuevo');

  check(await texto(jugador, '.lobby-cabecera h1') === 'Los Tigres',
    'y el jugador ve el nombre nuevo sin recargar');
  // Que el código de acceso no se toca lo comprueba `smoke:admin` contra
  // la base de datos. Lo que se mira aquí es la consecuencia visible: a
  // quien está jugando no se le cae la sesión por renombrar su equipo.
  check(await jugador.$('.lobby') !== null && await texto(jugador, '.oia') !== null,
    'y a nadie se le cae la sesión por el cambio de nombre');
  check(await jugador.$eval('.escudo-lobby', (e) => e.naturalWidth).catch(() => 0) > 0,
    'y su logo en el lobby');

  await renombrar(3, 'los tigres');
  check((await aviso() ?? '').includes('Ya hay otro equipo'),
    'un nombre repetido se rechaza aunque cambie de mayúsculas');
  check(await nombreDe(3) === 'CHARLIE', `y el campo vuelve a lo que había (${await nombreDe(3)})`);

  await renombrar(3, '   ');
  check(await nombreDe(3) === 'CHARLIE', 'un nombre en blanco repone el que había, sin enviarse');

  // --- quitar ---
  await admin.evaluate((s2) => document.querySelector(s2).click(), `${tarjeta(1)} .quitar-logo`);
  await wait(800);
  check((await admin.$(`${tarjeta(1)} .escudo img`)) === null, 'se puede quitar el logo');

  // Se deja el evento como estaba.
  await renombrar(1, 'ALFA');
  check(await nombreDe(1) === 'ALFA', 'y se puede volver a dejar como estaba');
}

console.log('\n14) Averías de la proyección y la final');
{
  const pared2 = await abrir('ADMIN-2026');
  await pared2.waitForSelector('.admin', { timeout: 8000 });
  await pared2.evaluate(() => { window.location.hash = 'proyeccion'; });
  await pared2.waitForSelector('.proyeccion', { timeout: 8000 });

  const destacar = async (n) => {
    await admin.evaluate((n) => {
      const sec = [...document.querySelectorAll('.panel')]
        .find((s) => s.querySelector('.panel__name')?.textContent.includes('BARRERAS'));
      const b = [...[...sec.querySelectorAll('tbody tr')][n].querySelectorAll('.acciones button')];
      b[b.length - 1].click();
    }, n);
    await wait(850);
  };
  const averias = () => pared2.evaluate(() => {
    const g = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    return {
      nivel: Number(getComputedStyle(document.querySelector('.proyeccion')).getPropertyValue('--glitch')),
      ruido: Number(g('.proy-averia', 'opacity')),
      corte: Math.round(parseFloat(g('.proy-corte', 'height'))),
      ciclo: parseFloat(g('.escenario', 'animationDuration')),
    };
  });

  // Cuántas fases son recorrido y cuántas bonus. Se vuelve a contar
  // aquí: lo de la sección 11 vive en su propio bloque.
  const bonus2 = await admin.$$eval('.marca-bonus', (n) => n.length);
  const barreras2 = totalFases - bonus2;

  // Una medida por fase, soltando el destacado detrás para no dejar el
  // evento apuntando a ninguna.
  const escala = [];
  for (let i = 0; i < totalFases; i++) {
    await destacar(i);
    escala.push(await averias());
    await destacar(i);
  }
  console.log('   ' + escala.map((e, i) => `F${i + 1}=${e.nivel.toFixed(2)}`).join(' · '));

  check(escala[0].nivel === 0 && escala[0].ruido === 0,
    'la primera fase se proyecta limpia: ni ruido ni desliz');
  const recorrido = escala.slice(0, barreras2);
  check(recorrido.every((e, i) => i === 0 || e.nivel > recorrido[i - 1].nivel),
    'y la avería sube fase a fase hasta la final');
  check(recorrido.every((e, i) => i === 0 || e.ciclo < recorrido[i - 1].ciclo),
    'no solo más fuerte: también más a menudo');
  check(recorrido[recorrido.length - 1].nivel === 1 && escala[totalFases - 1].nivel === 1,
    'la final llega al tope y el bonus se queda ahí, sin pasarlo');

  // ---- La final ----
  const iFinal = await admin.$$eval('.panel tbody tr', (filas) =>
    filas.findIndex((f) => f.querySelector('.marca-final')));
  check(iFinal >= 0, `el panel marca cuál es la final (fila ${iFinal + 1})`);

  await destacar(iFinal);
  check((await pared2.$('.esc-final.espera')) !== null,
    'antes de abrirla, el cohete espera en la rampa');
  const relojQuieto = await texto(pared2, '.final-reloj');
  check(/^T-\d\d:\d\d$/.test(relojQuieto), `con el límite configurado a la vista (${relojQuieto})`);

  await admin.evaluate((n) => {
    const sec = [...document.querySelectorAll('.panel')]
      .find((s) => s.querySelector('.panel__name')?.textContent.includes('BARRERAS'));
    const fila = [...sec.querySelectorAll('tbody tr')][n];
    [...fila.querySelectorAll('.acciones button')]
      .find((b) => b.textContent.trim() === 'Abrir' && !b.disabled)?.click();
  }, iFinal);
  await pared2.waitForSelector('.esc-final.cuenta', { timeout: 8000 });
  const t1 = await texto(pared2, '.final-reloj');
  await wait(2300);
  const t2 = await texto(pared2, '.final-reloj');
  check(t1 !== t2, `al abrirla arranca la cuenta atrás y corre sola (${t1} → ${t2})`);

  // ---- Los dos ensayos ----
  // Igual que en el panel: mientras una acción está en curso todos los
  // botones de la sección se deshabilitan, así que hay que esperar a
  // que el de verdad vuelva a estar pulsable.
  const pulsarFinal = async (txt) => {
    await admin.waitForFunction((t) => {
      const sec = [...document.querySelectorAll('.panel')]
        .find((s) => s.querySelector('.panel__name')?.textContent.includes('LA FINAL'));
      const b = [...(sec?.querySelectorAll('button') ?? [])].find((x) => x.textContent.includes(t));
      return !!b && !b.disabled;
    }, { timeout: 12000, polling: 150 }, txt);
    await admin.evaluate((t) => {
      const sec = [...document.querySelectorAll('.panel')]
        .find((s) => s.querySelector('.panel__name')?.textContent.includes('LA FINAL'));
      [...sec.querySelectorAll('button')].find((b) => b.textContent.includes(t)).click();
    }, txt);
  };

  // Se destaca OTRA fase: un ensayo tiene que traerse la pared, o no
  // sirve para verlo antes de que pase.
  await destacar(iFinal);
  await destacar(0);
  await pulsarFinal('ENSAYAR VICTORIA');
  await pared2.waitForSelector('.esc-final.victoria', { timeout: 8000 });
  check(true, 'ensayar victoria trae la proyección a la final aunque haya otra destacada');
  check((await pared2.$('.esc-final.ensayo')) !== null,
    'y se marca como ENSAYO, para no confundirlo con lo que pasó de verdad');
  const lemaVict = await texto(pared2, '.final-lema');
  check(/abortado/i.test(lemaVict), `el cohete revienta en tierra (${lemaVict})`);

  await pulsarFinal('ENSAYAR DERROTA');
  await pared2.waitForSelector('.esc-final.derrota', { timeout: 8000 });
  await wait(3800);
  const subida = await pared2.$eval('.final-cohete', (e) => new DOMMatrix(getComputedStyle(e).transform).f);
  const llama = await pared2.$eval('.final-llama', (e) => parseFloat(getComputedStyle(e).height));
  check(subida < -100 && llama > 20,
    `ensayar derrota lo lanza: sube ${Math.round(-subida)}px con ${Math.round(llama)}px de llama`);

  await pulsarFinal('PARAR ENSAYO');
  await wait(1300);
  check((await pared2.$('.esc-final')) === null, 'parar el ensayo devuelve la pared a lo destacado');

  // ---- El límite ----
  await admin.evaluate(() => {
    const el = document.querySelector('#final-min');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '12');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.closest('form').requestSubmit();
  });
  await wait(1000);
  check(await admin.$eval('#final-min', (e) => e.value) === '12',
    'el tiempo de la final se pone desde el panel');
  await destacar(iFinal);
  const conNuevo = await texto(pared2, '.final-reloj');
  check(/^T-1[12]:/.test(conNuevo), `y la pared lo recoge sin recargar (${conNuevo})`);

  await pared2.close();
}

console.log('\n15) El sonido');
{
  const audio = (pg) => pg.evaluate(() => ({ ...window.__audio }));

  check((await admin.$('.oia__son')) !== null,
    'hay interruptor de sonido en el renglón de estado, en todas las pantallas');

  // Una ventana recién abierta y sin tocar: el navegador no deja sonar
  // nada, y eso hay que DECIRLO. Es el caso de la proyección, que se
  // arrastra al segundo monitor y nadie vuelve a pulsarla.
  const muro = await abrir('ADMIN-2026');
  await muro.waitForSelector('.admin', { timeout: 8000 });
  await muro.evaluate(() => { window.location.hash = 'proyeccion'; });
  await muro.waitForSelector('.proyeccion', { timeout: 8000 });

  const avisoAntes = await muro.evaluate(() =>
    [...document.querySelectorAll('.proy-mandos button')].some((b) => /ACTIVAR SONIDO/.test(b.textContent)));
  // Si el navegador deja sonar de entrada o no es cosa suya: depende de
  // cuánto se haya usado ya ese origen. Lo que tiene que cumplirse
  // siempre es la CORRESPONDENCIA: hay aviso exactamente cuando no ha
  // sonado nada. Un aviso encendido con el sonido funcionando, o un
  // silencio sin explicación, son las dos formas de mentir aquí.
  const calladoAntes = (await audio(muro)).osc === 0;
  check(avisoAntes === calladoAntes,
    `el aviso de audio bloqueado dice la verdad (aviso=${avisoAntes}, callado=${calladoAntes})`);

  await muro.mouse.click(500, 400);   // cualquier gesto sirve
  await wait(800);
  check((await audio(muro)).osc > 0, 'un gesto lo desbloquea y arranca el zumbido de la sala');
  check(!(await muro.evaluate(() =>
    [...document.querySelectorAll('.proy-mandos button')].some((b) => /ACTIVAR SONIDO/.test(b.textContent)))),
    'y el aviso desaparece');

  const destacarN = async (n) => {
    await admin.evaluate((n) => {
      const sec = [...document.querySelectorAll('.panel')]
        .find((s) => s.querySelector('.panel__name')?.textContent.includes('BARRERAS'));
      const b = [...[...sec.querySelectorAll('tbody tr')][n].querySelectorAll('.acciones button')];
      b[b.length - 1].click();
    }, n);
    await wait(900);
  };

  const antesCanal = await audio(muro);
  await destacarN(0);
  check((await audio(muro)).ruido > antesCanal.ruido, 'cambiar de fase suena a cambio de canal');

  // La avería no solo se VE subir con la fase: también se oye.
  const a1 = await audio(muro); await wait(4000); const b1 = await audio(muro);
  await destacarN(0);
  await destacarN(totalFases - 2);   // la final
  const a2 = await audio(muro); await wait(4000); const b2 = await audio(muro);
  const enPrimera = b1.ruido - a1.ruido, enFinal = b2.ruido - a2.ruido;
  check(enPrimera === 0, `en la primera fase el tubo no cruje (${enPrimera} ráfagas en 4 s)`);
  check(enFinal > enPrimera, `y en la final sí, mucho (${enFinal} ráfagas en 4 s)`);

  // Y se puede callar, pantalla por pantalla.
  await admin.mouse.click(400, 300);
  await wait(400);
  const pulsarPanel = () => admin.evaluate(() => {
    const sec = [...document.querySelectorAll('.panel')]
      .find((s) => s.querySelector('.panel__name')?.textContent.includes('LA FINAL'));
    [...sec.querySelectorAll('button')].find((b) => b.textContent.includes('PARAR ENSAYO'))?.click();
  });
  const c1 = await audio(admin); await pulsarPanel(); await wait(600); const c2 = await audio(admin);
  check(c2.osc > c1.osc, 'pulsar en el panel suena');

  await admin.evaluate(() => document.querySelector('.oia__son').click());
  await wait(300);
  check(await admin.evaluate(() => localStorage.getItem('hm:sonido')) === '0',
    'el interruptor se recuerda en esa pantalla');
  const c3 = await audio(admin); await pulsarPanel(); await wait(600); const c4 = await audio(admin);
  check(c4.osc === c3.osc, 'y en silencio no se crea ni un sonido');

  await admin.evaluate(() => document.querySelector('.oia__son').click());
  await muro.close();
}

console.log('\n16) El desplegable de ataques');
{
  // El evento tiene que estar EN JUEGO: el menú solo existe durante la
  // partida, que es cuando hay a quién atacar. El botón del estado ya
  // puesto viene DESHABILITADO —es el del estado actual—, así que hay
  // que mirar antes de pulsar o se espera para siempre a que se habilite.
  const enJuegoYa = await admin.evaluate(() =>
    [...document.querySelectorAll('.estado-evento .chip')].some((c) => /RUNNING/.test(c.textContent)));
  if (!enJuegoYa) {
    await clickTextoCuandoSePueda(admin, '.fila-botones button', 'REANUDAR');
    await wait(900);
  }

  const rival = await abrir('BRAVO-1');
  await rival.waitForSelector('.jugador', { timeout: 8000 });
  // Otro puesto del MISMO equipo: el enfriamiento es del equipo, y eso
  // hay que verlo en una pantalla que no sea la que pulsa.
  const companero = await abrir('ALFA-1');
  await companero.waitForSelector('.jugador', { timeout: 8000 });

  check((await jugador.$('.ataque-boton')) !== null, 'el desplegable está en el puesto de quien juega');
  check((await companero.$('.ataque-boton')) !== null, 'y en los otros dos: lo tienen los tres');

  const rotulo = (pg) => pg.$eval('.ataque-boton', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  const arranque = await rotulo(jugador);
  check(/LISTO|\d\d:\d\d/.test(arranque),
    `el tiempo que queda va SIEMPRE en el botón, sin abrir nada (${arranque})`);

  // Por si una sección anterior dejó el enfriamiento a medias.
  await jugador.waitForFunction(
    () => /LISTO/.test(document.querySelector('.ataque-boton')?.textContent ?? ''),
    { timeout: 70000, polling: 500 },
  );

  // Se ataca sobre el mapa del auditorio: con la sala mapeada, el plano
  // del editor; sin mapear, un reparto automático de mesas.
  await jugador.evaluate(() => document.querySelector('.ataque-boton').click());
  await jugador.waitForSelector('.mapa-ataque .plano--ataque', { timeout: 5000 });
  const nombresDe = (pg, sel) => pg.$$eval(sel, (n) => n.map((e) => e.querySelector('.pieza-nombre')?.textContent ?? ''));
  const rivales = await nombresDe(jugador, '.mesa-rival');
  const mia = await nombresDe(jugador, '.mesa-mia');
  check(rivales.length > 0 && !rivales.includes('ALFA'),
    `el mapa enseña las mesas de los demás equipos (${rivales.length}: ${rivales.slice(0, 3).join(', ')}…)`);
  check(mia.length === 1 && mia[0] === 'ALFA', 'y la propia aparte, que no se puede atacar');

  // Dos pasos: pulsar la mesa la marca, y el botón de abajo dispara.
  await jugador.evaluate(() =>
    [...document.querySelectorAll('.mesa-rival')]
      .find((m) => m.querySelector('.pieza-nombre')?.textContent === 'BRAVO')
      .dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await jugador.waitForSelector('.mesa-elegida', { timeout: 3000 });
  check(/BRAVO/.test(await texto(jugador, '.mapa-ataque-fuego')), 'pulsar su mesa lo marca como objetivo');
  await jugador.evaluate(() => document.querySelector('.mapa-ataque-fuego').click());
  await rival.waitForSelector('.ataque-recibido', { timeout: 8000 });
  const banda = await texto(rival, '.ataque-recibido');
  check(/ALFA/.test(banda), `al atacado le llega con remite (${banda})`);

  // El enfriamiento llega por SNAPSHOT, así que aterriza un instante
  // después que la avería en la pantalla del atacado: hay que esperarlo
  // en vez de leerlo en el mismo fotograma.
  await jugador.waitForFunction(
    () => !/LISTO/.test(document.querySelector('.ataque-boton')?.textContent ?? ''),
    { timeout: 8000, polling: 150 },
  ).catch(() => {});
  const trasAtacar = await rotulo(jugador);
  check(/\d\d:\d\d/.test(trasAtacar) && !/LISTO/.test(trasAtacar),
    `el enfriamiento arranca y se ve en el botón (${trasAtacar})`);
  check(/\d\d:\d\d/.test(await rotulo(companero)),
    'y arranca para los TRES puestos, no solo para quien pulsó');

  // El mapa se cierra solo poco después de atacar; se vuelve a abrir.
  await jugador.waitForFunction(() => !document.querySelector('.mapa-ataque'), { timeout: 5000 }).catch(() => {});
  await jugador.evaluate(() => document.querySelector('.ataque-boton').click());
  await jugador.waitForSelector('.mapa-ataque .plano--ataque', { timeout: 5000 });
  const vetadas = await nombresDe(jugador, '.mesa-vetada');
  check(vetadas.length === 1 && vetadas[0] === 'BRAVO', 'el último objetivo queda apagado: no se puede repetir');
  check((await jugador.$$('.linea-ataque--mia')).length >= 1, 'y su ataque se ve como una línea propia en el mapa');
  await jugador.evaluate(() =>
    [...document.querySelectorAll('.mesa-rival:not(.mesa-vetada)')][0]
      .dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await jugador.waitForSelector('.mapa-ataque-fuego', { timeout: 3000 });
  check(await jugador.$eval('.mapa-ataque-fuego', (b) => b.disabled), 'mientras enfría no se puede atacar a nadie');

  // Y el atacado ve la línea que va a por él, en rojo.
  await rival.evaluate(() => document.querySelector('.ataque-boton').click());
  await rival.waitForSelector('.mapa-ataque .plano--ataque', { timeout: 5000 });
  check((await rival.$$('.linea-ataque--contra')).length >= 1, 'el atacado ve en su mapa la línea que va a por él');
  await rival.keyboard.press('Escape');

  const t1 = await rotulo(jugador);
  await wait(2600);
  check(t1 !== (await rotulo(jugador)), 'el reloj del botón baja solo');

  // Se cierra con Escape.
  await jugador.keyboard.press('Escape');
  await wait(250);
  check((await jugador.$('.mapa-ataque')) === null, 'y el mapa se cierra con Escape');

  await rival.close();
  await companero.close();
}

console.log('\n17) Salir para entrar con otro código');
{
  // El caso de verdad no es el código que el servidor rechaza: es el
  // código VÁLIDO que no era el tuyo. Se entra, se ve el nombre de
  // otro en la cabecera y hay que poder salir sin buscar nada.
  const suplantador = await abrir('ALFA-2');
  await suplantador.waitForSelector('.jugador', { timeout: 8000 });

  const salida = await suplantador.$eval('.salir', (e) => ({
    txt: e.textContent.trim(), op: Number(getComputedStyle(e).opacity),
  }));
  check(/OTRO CÓDIGO/i.test(salida.txt), `la salida dice para qué sirve («${salida.txt}»)`);
  check(salida.op >= 0.7, `y se ve sin buscarla (opacidad ${salida.op})`);

  await suplantador.evaluate(() => document.querySelector('.salir').click());
  await wait(400);
  const caja = await texto(suplantador, '.salir-caja');
  check(/entraste como/i.test(caja), 'pide confirmación y dice como quién estás');
  check(/ALFA-2/.test(caja), 'con el código a la vista: es lo que hay que comprobar');
  check(/no borra nada/i.test(caja), 'y que salir no pierde la partida');

  // Un clic sin querer no puede echar a nadie de su fase.
  await suplantador.evaluate(() =>
    [...document.querySelectorAll('.salir-botones button')].find((b) => /NO/.test(b.textContent)).click());
  await wait(300);
  check((await suplantador.$('.salir-caja')) === null && (await suplantador.$('.jugador')) !== null,
    '«NO, SEGUIR» cierra el cartel y deja la partida donde estaba');

  await suplantador.evaluate(() => document.querySelector('.salir').click());
  await wait(250);
  await suplantador.keyboard.press('Escape');
  await wait(250);
  check((await suplantador.$('.salir-caja')) === null, 'y Escape también lo cierra');

  await suplantador.evaluate(() => document.querySelector('.salir').click());
  await wait(250);
  await suplantador.evaluate(() =>
    [...document.querySelectorAll('.salir-botones button')].find((b) => /SÍ/.test(b.textContent)).click());
  await suplantador.waitForSelector('.login input', { timeout: 8000 });
  check(await suplantador.$eval('.login input', (e) => e.value) === 'ALFA-2',
    'vuelve al formulario con el código anterior puesto: una errata no obliga a reescribirlo entero');

  // Y el que sí era.
  await suplantador.evaluate(() => { const i = document.querySelector('.login input'); i.focus(); i.select(); });
  await suplantador.keyboard.type('BRAVO-1');
  await suplantador.keyboard.press('Enter');
  await suplantador.waitForSelector('.jugador', { timeout: 8000 });
  check(/BRAVO/.test(await texto(suplantador, '.lobby-cabecera, .fase-cabecera')),
    'y entra con el suyo a la primera');

  // Un código que NO existe es otra pantalla, y también tiene salida.
  await suplantador.evaluate(() => document.querySelector('.salir').click());
  await wait(250);
  await suplantador.evaluate(() =>
    [...document.querySelectorAll('.salir-botones button')].find((b) => /SÍ/.test(b.textContent)).click());
  await suplantador.waitForSelector('.login input', { timeout: 8000 });
  await suplantador.evaluate(() => { const i = document.querySelector('.login input'); i.focus(); i.select(); });
  await suplantador.keyboard.type('ALFA-9');
  await suplantador.keyboard.press('Enter');
  // `.acceso` existe en los tres estados —enlazando, sin conexión y
  // rechazado—: hay que esperar al RECHAZO, que llega cuando el
  // servidor contesta, no cuando aparece la pantalla.
  await suplantador.waitForFunction(
    () => /no válido/i.test(document.querySelector('.acceso h1')?.textContent ?? ''),
    { timeout: 10000, polling: 150 },
  );
  const rechazo = await texto(suplantador, '.acceso');
  check(!/INVALID_CODE/.test(rechazo), 'un código inexistente ya no enseña el código de error en crudo');
  check(/no está dado de alta/i.test(rechazo), `dice qué pasó, para una persona («${rechazo.slice(0, 60)}…»)`);
  check(/ALFA-9/.test(rechazo), 'y enseña lo que se tecleó, que es donde está la errata');
  check((await suplantador.$('.salir-acceso')) !== null, 'y de ahí también se sale con un botón');

  // Se deja el navegador con una credencial válida: `hm:code` lo
  // comparten todas las pestañas del mismo origen.
  await suplantador.evaluate(() =>
    [...document.querySelectorAll('button')].find((b) => /SALIR Y PROBAR/i.test(b.textContent)).click());
  await suplantador.waitForSelector('.login input', { timeout: 8000 });
  await suplantador.evaluate(() => localStorage.setItem('hm:code', 'ALFA-2'));
  await suplantador.close();
}

console.log('\n18) La pestaña de LUCES');
{
  check((await admin.$('.ir-luces')) !== null, 'hay pestaña de LUCES en la barra del panel');
  await clickTexto(admin, '.estado-evento button', 'LUCES');
  await admin.waitForSelector('.admin-luces', { timeout: 8000 });
  await admin.waitForFunction(
    () => !document.body.innerText.includes('Preguntándole'),
    { timeout: 12000, polling: 200 },
  );
  await wait(500);

  // El catálogo de acciones sale de ESTE servidor, así que está haya o
  // no placa enchufada: es lo que hace que la pestaña sirva para algo
  // aunque el Arduino esté en una caja.
  const acciones = await admin.$$eval('.regla-nueva select', (n) =>
    [...n[0].options].map((o) => o.textContent).slice(1));
  check(acciones.length >= 14, `ofrece ${acciones.length} acciones del evento a las que colgar una luz`);
  check(acciones.some((a) => /pasa una fase/i.test(a)), 'entre ellas «un equipo pasa una fase»');
  check((await admin.$$('.pines .pin')).length >= 9,
    'y los nueve pines que acepta el firmware, como interruptores');

  const conPlaca = await admin.$eval('.estado-evento .chip:last-child', (e) => /lista/.test(e.textContent));
  console.log(`   servidor de Luces: ${conPlaca ? 'en marcha' : 'no está — se comprueba solo lo que no lo necesita'}`);

  if (conPlaca) {
    const botones = await admin.$$eval('.botones-luz li', (n) => n.length);
    check(botones > 0, `lista los ${botones} botones ya guardados en Luces`);

    // Una regla por el pin 3, que en esta placa no tiene emisor: se
    // prueba la cadena entera sin encenderle las luces a nadie.
    await admin.evaluate(() => {
      const sels = document.querySelectorAll('.regla-nueva select');
      const set = (el, v) => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, v);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set(sels[0], 'FASE_ABIERTA');
      set(sels[2], sels[2].options[1].value);
      [...document.querySelectorAll('.regla-nueva .pin')].find((b) => b.textContent.trim() === '3').click();
    });
    await wait(400);
    await admin.evaluate(() =>
      [...document.querySelectorAll('.regla-nueva button')].find((b) => /AÑADIR/.test(b.textContent)).click());
    await admin.waitForSelector('.reglas li', { timeout: 8000 });
    const fila = await texto(admin, '.reglas li');
    check(/pin 3/.test(fila), `la regla se lee como una frase (${fila.replace(/\s+/g, ' ')})`);

    // Ensayarla deja rastro: es la única forma de saber que saltó sin
    // mirar la tira de LEDs.
    await admin.evaluate(() =>
      [...document.querySelectorAll('.reglas li button')].find((b) => /ENSAYAR/.test(b.textContent)).click());
    // Se espera a que aparezca la línea de ESTE ensayo: la bitácora
    // vive en memoria del servidor y puede traer cosas de antes.
    const salio = await admin.waitForFunction(
      () => [...document.querySelectorAll('.bitacora-luz li')]
        .some((l) => /FASE_ABIERTA \(ensayo\)/.test(l.textContent)),
      { timeout: 12000, polling: 250 },
    ).then(() => true).catch(() => false);
    check(salio, 'el ensayo de la regla queda en la bitácora, que es cómo se sabe que saltó');

    // Mientras una acción de la pestaña está en curso TODOS sus botones
    // se deshabilitan, igual que en el panel: hay que esperar a que el
    // interruptor vuelva a estar pulsable o el click se pierde.
    const esperarPulsable = (sel) => admin.waitForFunction(
      (s2) => { const b = document.querySelector(s2); return !!b && !b.disabled; },
      { timeout: 12000, polling: 150 }, sel,
    );

    await esperarPulsable('.interruptor-regla');
    await admin.evaluate(() => document.querySelector('.interruptor-regla').click());
    const apagada = await admin.waitForSelector('.reglas li.apagada', { timeout: 10000 })
      .then(() => true).catch(() => false);
    check(apagada, 'se puede desactivar sin borrarla');

    await esperarPulsable('.reglas li .peligro');
    await admin.evaluate(() =>
      [...document.querySelectorAll('.reglas li button')].find((b) => /BORRAR/.test(b.textContent)).click());
    const sinReglas = await admin.waitForFunction(
      () => document.querySelectorAll('.reglas li').length === 0,
      { timeout: 10000, polling: 250 },
    ).then(() => true).catch(() => false);
    check(sinReglas, 'y borrarla');
  }

  await clickTexto(admin, '.estado-evento .volver-panel', 'PANEL');
  await admin.waitForSelector('.barra .panel__name, .panel', { timeout: 8000 });
  check((await admin.$('.admin-luces')) === null, 'y se vuelve al panel');
}

await browser.close();
console.log(fallos === 0 ? '\n✅ Pasos 4 y 5 OK\n' : `\n❌ ${fallos} fallos\n`);
process.exit(fallos === 0 ? 0 : 1);
