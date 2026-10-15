// Prueba de humo de la Fase 2 — El Rastro. Requiere el server levantado.
import { io, type Socket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

const URL = process.env.SMOKE_URL ?? 'http://localhost:4000';
const prisma = new PrismaClient();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
const check = (ok: boolean, txt: string) => { console.log(`  ${ok ? '✔' : '✘'} ${txt}`); if (!ok) fallos++; };

function connect(code: string) {
  const s: Socket = io(URL, { auth: { code }, transports: ['websocket'] });
  const buzon: Record<string, any[]> = {};
  s.onAny((ev, data) => (buzon[ev] ??= []).push(data));
  const fresh = (ev: string, ms = 4000) =>
    new Promise<any>((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), ms); s.once(ev, (d: any) => { clearTimeout(t); res(d); }); });
  const send = (ev: string, p: any) =>
    new Promise<any>((r) => {
      const t = setTimeout(() => r({ ok: false, error: `TIMEOUT:${ev}` }), 8000);
      s.emit(ev as any, p, (res: any) => { clearTimeout(t); r(res); });
    });
  return { s, buzon, fresh, snap: () => fresh('session:snapshot'), send };
}

// --- Estado limpio ---
await prisma.teamPhaseProgress.updateMany({ data: { status: 'PENDING', attempts: 0, stateJson: '{}', unlockedAt: null, availableAt: null, enteredAt: null, firstMoveAt: null, solvedAt: null, pausedMs: 0, timeToSolveMs: null, activeMs: null } });
await prisma.phase.updateMany({ data: { status: 'LOCKED', openedAt: null, closedAt: null } });
await prisma.commandLog.deleteMany({});
await prisma.eventState.update({ where: { id: 'singleton' }, data: { status: 'LOBBY', pausedAt: null, totalPausedMs: 0, shuffleCount: 0, startedAt: null, focusPhaseId: null } });
for (const t of await prisma.team.findMany({ include: { members: { orderBy: { displayName: 'asc' } } } })) {
  const roles = ['DATOS', 'TERMINAL', 'PANTALLA'];
  await Promise.all(t.members.map((m, i) => prisma.user.update({ where: { id: m.id }, data: { role: roles[i], previousRole: null } })));
}

// La Fase 2 solo es accesible si la anterior está resuelta por el equipo
// o cerrada por el admin (`buildLobbyView`). Aquí interesa la Fase 2, así
// que damos la 1 por cerrada y entramos directamente a lo que se prueba.
{
  // Para llegar a la 7 hay que dar por cerradas las seis anteriores.
  await prisma.phase.updateMany({
    where: { order: { lt: 7 } },
    data: { status: 'COMPLETED', openedAt: new Date(), closedAt: new Date() },
  });
}

const admin = connect('ADMIN-2026');
const datos = connect('ALFA-1'), term = connect('ALFA-2'), pant = connect('ALFA-3');
const [sa] = await Promise.all([admin.snap(), datos.snap(), term.snap(), pant.snap()]);
// El Rastro ya no es la fase 2 del recorrido: se busca por clave, que es
// lo unico que no cambia al recolocar una fase.
const f2 = sa.phases.find((p: any) => p.key === 'fase-7-rastro');

console.log('\n0) La fase está registrada en el motor');
{
  const { fasesImplementadas, moduloDeFase } = await import('../src/phases/index.js');
  check(fasesImplementadas().length === 7, `siete modulos registrados (${fasesImplementadas().length})`);
  check(moduloDeFase('fase-7-rastro') !== null, 'y la clave coincide con la sembrada en el seed');
}

await admin.send('admin:phase:open', { phaseId: f2.id });
await wait(300);

console.log('\n1) Proyección asimétrica al entrar');
const wsAll = Promise.all([datos.fresh('workspace:update'), term.fresh('workspace:update'), pant.fresh('workspace:update')]);
await datos.send('phase:enter', { phaseId: f2.id });
const [wd, wt, wp] = await wsAll;
{
  const tablas = wd.payload?.tablas ?? [];
  check(tablas.length === 3, `Datos recibe el inventario completo (${tablas.length} tablas)`);
  check(tablas.map((t: any) => t.id).join(',') === 'equipos,servicios,llaves', 'equipos · servicios · llaves');
  check((wd.payload?.relaciones ?? []).length === 1, 'con su relación servicios → equipos');

  check(wt.payload?.tablas === undefined && wt.payload?.pista !== undefined, 'Terminal no recibe el inventario');
  check(JSON.stringify(wt.payload).includes('10.4') === false, 'ni una sola dirección llega a Terminal');

  check(Array.isArray(wp.payload?.salidas) && wp.payload.salidas.length === 0, 'Pantalla arranca con historial vacío');
  // Lo que NO puede llevar la proyección de Pantalla: la fase entera
  // depende de que no sepa traducir una dirección ni una llave.
  const enPantalla = JSON.stringify(wp.payload);
  check(!/PRUEBAS-07|BACKUP-01|SALTO-02/i.test(enPantalla), 'Pantalla no recibe ningún nombre de máquina');
  check(!enPantalla.includes('9f2ae1') && !enPantalla.includes('m.rivas'), 'ni la llave del rastro ni sus dueños');
}

console.log('\n2) La invariante: esta terminal no traduce nada');
{
  const { rastro: fase2 } = await import('../src/phases/rastro.js');
  const ahora = Date.now();
  const corre = (texto: string, estado: Record<string, unknown> = {}): any =>
    fase2.ejecutar(texto, { estado, intentos: 0, ahora, traficoActivo: false });

  const MAQUINAS = ['web-01', 'conta-03', 'backup-01', 'salto-02', 'nomina-02', 'pruebas-07', 'infra-01', 'cumpl-01'];
  const DUENOS = ['m.rivas', 'copia-nocturna', 'd.salas'];

  // Todo lo que esta terminal puede decir sin que el equipo le haya
  // dictado un nombre. Si algo de aquí nombra una máquina, Pantalla
  // traduce la bitácora sola y el Operador de Datos deja de hacer falta.
  const publico = [
    'ayuda', 'bitacora', 'segmentos', 'equipos', 'llaves', 'estado',
    'huella', 'huella 9f2a', 'huella 7c04', 'enlazar', 'enlazar 10.4.6.21 10.4.5.12',
  ].map((c) => JSON.stringify(corre(c))).join(' ').toLowerCase();

  const filtradas = MAQUINAS.filter((m) => publico.includes(m));
  check(filtradas.length === 0, `ningún comando nombra una máquina (${filtradas.join(', ') || 'ninguna'})`);
  const dueños = DUENOS.filter((d) => publico.includes(d));
  check(dueños.length === 0, `ni el dueño de una llave (${dueños.join(', ') || 'ninguno'})`);
  check(publico.includes('inventario'), 'y cuando le preguntan, manda a la base de datos');

  // Y la simétrica: preguntar por una huella tiene que responder igual
  // exista o no en el parque, o `huella` iría confirmando qué llaves hay.
  const real = JSON.stringify(corre('huella 4b91')).replaceAll('4b91', 'X');
  const falsa = JSON.stringify(corre('huella abc9')).replaceAll('abc9', 'X');
  check(real === falsa, '`huella` no distingue una llave real que no aparece de una inventada');
}

console.log('\n3) El hilo, y los dos callejones sin salida');
{
  const { rastro: fase2 } = await import('../src/phases/rastro.js');
  const ahora = Date.now();
  const corre = (texto: string): any =>
    fase2.ejecutar(texto, { estado: {}, intentos: 0, ahora, traficoActivo: false });

  const rastro = corre('huella 9f2a');
  const filas = rastro.bloques[0].filas;
  // Cuatro saltos de la cadena + la salida de las 03:19 = cinco que
  // entraron; la sexta es el intento rechazado de las 02:38.
  check(filas.length === 6, `la llave sin dueño deja rastro (${filas.length} sesiones)`);
  check(filas.filter((f: string[]) => f[4] === 'OK').length === 5, 'cinco entraron');
  check(filas.filter((f: string[]) => f[4] === 'RECHAZADO').length === 1, 'y una fue rechazada: esa no es un salto');

  // El sospechoso obvio. Aquí vive el «no entró por donde crees»: la
  // dirección de fuera llamó dos veces y las dos se le cerró la puerta.
  const fuera = corre('huella 7c04');
  const ff = fuera.bloques[0].filas;
  check(ff.length === 2 && ff.every((f: string[]) => f[4] === 'RECHAZADO'),
    'la otra llave sin dueño no entró en ningún sitio: solo llamó y la rechazaron');
  check(ff.every((f: string[]) => f[1] === '188.42.19.6'), 'y venía de la dirección que cerró la Fase 1');

  // La tercera pista muere sola.
  check(corre('huella 4b91').bloques[0].tipo === 'texto', 'la llave del empleado de baja no aparece en la noche');

  // La bitácora entera, con la entrada por contraseña dentro.
  const bit = corre('bitacora').bloques[0];
  check(bit.filas.length === 13, `la bitácora son ${bit.filas.length} líneas`);
  check(bit.filas.some((f: string[]) => f[3].includes('contrasena')), 'y una de ellas no usa llave, sino contraseña');
  check(bit.filas.every((f: string[]) => /^\d+\.\d+\.\d+\.\d+$/.test(f[1])), 'todos los orígenes son direcciones, nunca nombres');
}

console.log('\n4) Enlazar: la trampa, los errores gratis y la cuarentena');
{
  const { rastro: fase2 } = await import('../src/phases/rastro.js');
  const ahora = Date.now();
  const corre = (texto: string, estado: Record<string, unknown> = {}): any =>
    fase2.ejecutar(texto, { estado, intentos: 0, ahora, traficoActivo: false });

  check(corre('enlazar pruebas-07 conta-03').bloques[0].tipo === 'exito', 'un salto real se confirma');

  // LA TRAMPA: huella correcta, salto que apetece dar… y la bitácora lo
  // registra RECHAZADO. Quien enlaza por huella sin leer la última
  // columna paga por ello.
  const trampa = corre('enlazar conta-03 nomina-02');
  check(trampa.fallo === true, 'el salto RECHAZADO de la bitácora no cuenta como salto');

  // Y tiene que ser indistinguible de un par inventado, o fallar iría
  // diciendo por dónde se acerca uno.
  const inventado = corre('enlazar web-01 infra-01');
  const norm = (r: any, a: string, b: string) =>
    JSON.stringify(r).replaceAll(a.toUpperCase(), 'X').replaceAll(b.toUpperCase(), 'Y');
  check(
    norm(trampa, 'conta-03', 'nomina-02') === norm(inventado, 'web-01', 'infra-01'),
    'y da exactamente la misma salida que un par que nunca existió',
  );

  // Errores que NO cuestan cuarentena: son prisa o erratas, no razonamiento.
  const typo = corre('enlazar pruebas-7 conta-03');
  check(!typo.fallo && typo.bloques[0].tipo === 'error', 'una errata en el nombre sale gratis');
  const porIp = corre('enlazar 10.4.6.21 10.4.5.12');
  check(!porIp.fallo, 'enlazar por dirección tampoco penaliza');
  check(JSON.stringify(porIp).includes('Datos'), 'y manda a Datos en vez de traducir la IP');
  check(!corre('enlazar pruebas-07').fallo, 'y faltar un extremo tampoco');
  check(!corre('enlazar conta-03 conta-03').fallo, 'ni enlazar una máquina consigo misma');

  const castigo = (fallos: number) =>
    corre('enlazar web-01 infra-01', { fallos }).estado.cuarentenaHasta - ahora;
  check(castigo(0) === 20_000 && castigo(1) === 45_000 && castigo(2) === 90_000,
    `la cuarentena crece (${castigo(0)} → ${castigo(1)} → ${castigo(2)} ms)`);
  check(castigo(9) === 90_000, 'y se estanca en 90 s');
}

console.log('\n5) Reconstrucción de la cadena, de punta a punta');
{
  const SALTOS = [
    ['PRUEBAS-07', 'CONTA-03'],
    ['CONTA-03', 'BACKUP-01'],
    ['BACKUP-01', 'SALTO-02'],
  ];
  for (const [a, b] of SALTOS) {
    const eco = pant.fresh('pantalla:output');
    await term.send('terminal:command', { texto: `enlazar ${a} ${b}` });
    check((await eco).bloques[0].tipo === 'exito', `${a} → ${b} confirmado`);
  }

  const pr0 = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { phaseId: f2.id, team: { name: 'ALFA' } } });
  check(pr0.status === 'IN_PROGRESS', 'con tres de cuatro la fase NO está resuelta');
  check(JSON.parse(pr0.stateJson).saltos.length === 3, 'y el progreso se persiste');

  const repe = pant.fresh('pantalla:output');
  await term.send('terminal:command', { texto: 'enlazar BACKUP-01 SALTO-02' });
  check(JSON.stringify(await repe).includes('ya estaba confirmado'), 'repetir un salto no suma ni penaliza');

  // El orden no importa: quien llega desde la Fase 1 empieza por el final.
  const est = pant.fresh('pantalla:output');
  await term.send('terminal:command', { texto: 'estado' });
  const salidaEstado = await est;
  check(/3 de 4/.test(JSON.stringify(salidaEstado)), 'el marcador va por tres');
  check(/02:14[\s\S]*02:44[\s\S]*02:51/.test(JSON.stringify(salidaEstado)),
    'y los lista en orden cronológico, no en el que se encontraron');

  const resueltoEnTodos = Promise.all([datos.fresh('phase:solved'), term.fresh('phase:solved'), pant.fresh('phase:solved')]);
  const final = pant.fresh('pantalla:output');
  await term.send('terminal:command', { texto: 'enlazar SALTO-02 NOMINA-02' });
  const [ev] = await resueltoEnTodos;
  check(ev.phaseId === f2.id, 'phase:solved llega a TODO el equipo');

  // El giro tiene que contarse, no quedarse en la cabeza del que diseñó.
  const cierre = JSON.stringify(await final);
  check(cierre.includes('PRUEBAS-07 -> CONTA-03 -> BACKUP-01 -> SALTO-02 -> NOMINA-02'), 'la cadena entera se dibuja al cerrar');
  check(/salida, no la de entrada/.test(cierre), 'y se dice que la IP de fuera era la salida, no la entrada');
  check(cierre.includes('02:03'), 'con la hora de la entrada real');

  const pr = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { phaseId: f2.id, team: { name: 'ALFA' } } });
  check(pr.status === 'SOLVED' && pr.solvedAt !== null, 'progreso marcado SOLVED en BD');
  check(typeof pr.timeToSolveMs === 'number' && pr.timeToSolveMs! > 0, `tiempo sellado (${pr.timeToSolveMs}ms)`);
}

console.log('\n6) Tras resolver');
{
  const r = await term.send('terminal:command', { texto: 'bitacora' });
  check(r.ok === false && r.error === 'SIN_FASE_ACTIVA', `la fase resuelta ya no acepta comandos (${r.error})`);
  const otro = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { phaseId: f2.id, team: { name: 'BRAVO' } } });
  check(otro.status !== 'SOLVED', 'resolver no afecta a los demás equipos');
}

for (const c of [admin, datos, term, pant]) c.s.close();
await prisma.$disconnect();
console.log(fallos === 0 ? '\n✅ Fase 7 · El Rastro (servidor) OK\n' : `\n❌ ${fallos} fallos\n`);
process.exit(fallos === 0 ? 0 : 1);
