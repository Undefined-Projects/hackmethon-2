// Prueba de humo de la Fase 1 · La Maraña contra el servidor: el motor
// (roles, a quién llega cada salida, reconexión, mezcla, cierre) jugando
// el laberinto de verdad. Requiere el server levantado con base sembrada.
//
//   SMOKE_URL=http://localhost:4200 npm run smoke:fase2:servidor
import { io, type Socket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';
import { setoDeMarana } from '../src/phases/marana.js';

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
  // Con tiempo límite: un ack que no llega debe salir como fallo con
  // nombre, no como una prueba colgada sin explicación.
  const send = (ev: string, p: any) =>
    new Promise<any>((r) => {
      const t = setTimeout(() => r({ ok: false, error: `TIMEOUT:${ev}` }), 8000);
      s.emit(ev as any, p, (res: any) => { clearTimeout(t); r(res); });
    });
  return { s, buzon, fresh, snap: () => fresh('session:snapshot'), send };
}

// --- Estado limpio + La Maraña abierta ---
//
// Con acceso libre: esta bateria prueba La Maraña suelta, y como no es la
// primera del recorrido, la cadena le exigiria resolver antes la que tiene
// delante. Eso es cosa de `smoke:admin`, no de aqui.
await prisma.teamPhaseProgress.updateMany({ data: { status: 'PENDING', attempts: 0, stateJson: '{}', unlockedAt: null, availableAt: null, enteredAt: null, firstMoveAt: null, solvedAt: null, pausedMs: 0, timeToSolveMs: null, activeMs: null } });
await prisma.phase.updateMany({ data: { status: 'LOCKED', openedAt: null, closedAt: null } });
await prisma.commandLog.deleteMany({});
await prisma.eventState.update({ where: { id: 'singleton' }, data: { status: 'LOBBY', pausedAt: null, totalPausedMs: 0, shuffleCount: 0, startedAt: null, focusPhaseId: null, libreAcceso: true } });
for (const t of await prisma.team.findMany({ include: { members: { orderBy: { displayName: 'asc' } } } })) {
  const roles = ['DATOS', 'TERMINAL', 'PANTALLA'];
  await Promise.all(t.members.map((m, i) => prisma.user.update({ where: { id: m.id }, data: { role: roles[i], previousRole: null } })));
}

const admin = connect('ADMIN-2026');
const datos = connect('ALFA-1'), term = connect('ALFA-2'), pant = connect('ALFA-3');
const [sa, sd] = await Promise.all([admin.snap(), datos.snap(), term.snap(), pant.snap()]);
// Por CLAVE y no por posicion: el sitio que ocupa en el recorrido puede
// cambiar sin que eso tenga nada que ver con lo que aqui se comprueba.
const f1 = sa.phases.find((f: any) => f.key === 'fase-2-enemigo');
if (!f1) throw new Error('no esta sembrada la fase `fase-2-enemigo`');
const idxFase = sa.phases.findIndex((f: any) => f.key === 'fase-2-enemigo');


/** La escalera que cruza el seto de ESTA mesa: de las cuatro posibles,
 *  la que no pisa espinas. Se calcula con el módulo, como haría la guía. */
const ESCALERA = (primero: 'gira' | 'avanza', izq: string, der: string) => primero === 'gira'
  ? ['repetir 3 veces', `girar ${izq}`, 'avanzar', 'avanzar', 'avanzar', `girar ${der}`, 'avanzar', 'avanzar', 'avanzar', 'fin']
  : ['repetir 3 veces', 'avanzar', 'avanzar', 'avanzar', `girar ${izq}`, 'avanzar', 'avanzar', 'avanzar', `girar ${der}`, 'fin'];
const alfa = await prisma.team.findFirstOrThrow({ where: { name: 'ALFA' } });
const semilla = process.env.FASES_CANONICAS ? undefined : alfa.id;
const { marana } = await import('../src/phases/marana.js');
/** Juega un programa contra el módulo, desde un estado, y dice en qué capa queda. */
const jugar = (prog: string[], estado0: Record<string, unknown>) => {
  let estado: Record<string, unknown> = { ...estado0 };
  for (const c of [...prog, 'lanzar']) {
    const r = marana.ejecutar(c, { estado, intentos: 0, ahora: Date.now(), traficoActivo: false, semilla });
    if (r.estado) estado = r.estado;
  }
  return estado;
};
/** El semillero de ALFA: de los dos programas espejo, el que llega. */
const SEMILLERO = [['derecha', 'izquierda'], ['izquierda', 'derecha']]
  .map(([d, i]) => ['avanzar', 'avanzar', 'avanzar', `girar ${d}`, 'avanzar', 'avanzar', 'avanzar', `girar ${i}`, 'avanzar'])
  .find((prog) => jugar(prog, {}).capa === 2)!;
const buena = (['gira', 'avanza'] as const).flatMap((p) => [['izquierda', 'derecha'], ['derecha', 'izquierda']]
  .map(([i, d]) => ESCALERA(p, i, d)))
  .find((prog) => jugar(prog, { capa: 2 }).resuelta === true)!;
check(!!SEMILLERO, 'hay un programa de nueve líneas que cruza el semillero de ALFA');
check(!!buena, `hay una escalera que cruza el seto de ALFA (${setoDeMarana(semilla).mala === 'A' ? 'la mala es la A' : 'la mala es la B'})`);
/** El brote anterior tarda en andar: la prueba no espera, lo adelanta. */
const sinEspera = async () => {
  const pr = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { phaseId: f1.id, team: { name: 'ALFA' } } });
  const e = JSON.parse(pr.stateJson || '{}');
  await prisma.teamPhaseProgress.update({ where: { id: pr.id }, data: { stateJson: JSON.stringify({ ...e, listoEn: 0 }) } });
};

console.log('\n1) Sin fase activa no se procesan comandos');
{
  const r = await term.send('terminal:command', { texto: 'ayuda' });
  check(r.ok === false && r.error === 'SIN_FASE_ACTIVA', `rechazado (${r.error})`);
}

await admin.send('admin:phase:open', { phaseId: f1.id });
await wait(300);

console.log('\n2) Fase abierta pero equipo aún en el lobby');
{
  const r = await term.send('terminal:command', { texto: 'ayuda' });
  check(r.ok === false && r.error === 'SIN_FASE_ACTIVA', `sigue rechazado hasta entrar (${r.error})`);
}

console.log('\n3) Proyección asimétrica al entrar');
const wsAll = Promise.all([datos.fresh('workspace:update'), term.fresh('workspace:update'), pant.fresh('workspace:update')]);
await datos.send('phase:enter', { phaseId: f1.id });
const [wd, wt, wp] = await wsAll;
const ids = (wd.payload?.tablas ?? []).map((t: any) => t.id).join(',');
check(ids === 'manual,viajes,brote', `Datos recibe manual, viajes y la bitácora del brote (${ids})`);
check(!!wd.payload?.programa && wd.payload.programa.max === 12, 'y el programa del brote, vacío, de 12 líneas');
check(wt.payload?.brote?.max === 12 && wt.payload.tablas === undefined, 'Terminal recibe su panel, sin el esquema');
check(!JSON.stringify(wt.payload).includes('celdas'), 'ni el semillero');
check(Array.isArray(wp.payload?.salidas) && wp.payload.salidas.length === 0, 'Pantalla arranca con historial vacío');
check(Array.isArray(wp.payload?.marana?.mundo?.celdas) && wp.payload.marana.mundo.tipo === 'semillero', 'Pantalla recibe el semillero');

console.log('\n4) Solo el Operador de Terminal puede escribir');
{
  const r1 = await datos.send('terminal:command', { texto: 'ayuda' });
  const r2 = await pant.send('terminal:command', { texto: 'ayuda' });
  check(r1.error === 'NO_ERES_TERMINAL' && r2.error === 'NO_ERES_TERMINAL', 'Datos y Pantalla rechazados en el servidor');
  check((await prisma.commandLog.count()) === 0, 'no se registró ningún comando de quien no puede');
}

console.log('\n5) La respuesta va SOLO a Pantalla');
{
  const enPantalla = pant.fresh('pantalla:output');
  const r = await term.send('terminal:command', { texto: 'ayuda' });
  const salida = await enPantalla;
  check(r.ok === true && r.data?.aceptado === true, 'Terminal recibe acuse de ENTREGA');
  check(JSON.stringify(r).includes('repetir') === false, 'el acuse NO contiene la respuesta');
  check(salida.comando === 'ayuda' && salida.bloques.length > 0, 'Pantalla recibe la salida completa');
  await wait(400);
  check((datos.buzon['pantalla:output'] ?? []).length === 0, 'Datos no recibió nada');
  check((term.buzon['pantalla:output'] ?? []).length === 0, 'Terminal no recibió nada');
}

console.log('\n6) Escribir el programa');
{
  const pedir = async (texto: string) => {
    const p = pant.fresh('pantalla:output');
    await term.send('terminal:command', { texto });
    return p;
  };
  const enDatos = datos.fresh('workspace:update');
  const a = await pedir('repetir 2 veces');
  check(a.bloques.every((b: any) => b.tipo === 'texto'), 'agregar no enseña el programa: solo Datos lo ve');
  const ws = await enDatos;
  check(ws.payload.programa.lineas[0] === 'repetir 2 veces' && ws.payload.programa.abiertos === 1,
    'y Datos lo ve al instante, con su bloque abierto');
  const mal = await pedir('saltar');
  check(mal.bloques[0].tipo === 'error', 'lo que el brote no entiende → error en Pantalla');
  const si = await pedir('si frente libre');
  check(si.bloques[0].tipo === 'error', 'en el semillero no hay `si`');
  const acentos = await pedir('GIRAR IZQUIERDA');
  check(JSON.stringify(acentos).includes('girar izquierda'), 'tolera mayúsculas');
  await pedir('borrar todo');
}

console.log('\n8) Un brote que se estrella: intento, y hay que esperar al siguiente');
{
  // Media vuelta y adelante: detrás de la entrada siempre hay borde, en
  // cualquier versión del semillero.
  for (const c of ['girar derecha', 'girar derecha', 'avanzar']) await term.send('terminal:command', { texto: c });
  const enPantalla = pant.fresh('workspace:update');
  const p = pant.fresh('pantalla:output');
  await term.send('terminal:command', { texto: 'lanzar' });
  const salida = await p;
  check(JSON.stringify(salida).includes('en camino'), 'Pantalla ve salir al brote');
  check(!JSON.stringify(salida).includes('choc'), 'el texto no canta cómo acaba: eso se ve');
  const ws = await enPantalla;
  check(ws.payload.marana.viaje?.brotes[0].fin === 'desconectado', 'y su cámara trae el viaje entero, sin decir más que «se desconectó»');
  const pr = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { phaseId: f1.id, team: { name: 'ALFA' } } });
  check(pr.attempts === 1, `intento contabilizado (${pr.attempts})`);
  check(pr.status === 'IN_PROGRESS', 'la fase sigue sin resolver');
  const p2 = pant.fresh('pantalla:output');
  await term.send('terminal:command', { texto: 'lanzar' });
  check(JSON.stringify(await p2).includes('germina'), 'otro brote no sale mientras el anterior anda');
  await sinEspera();
  await term.send('terminal:command', { texto: 'borrar todo' });
}

console.log('\n9) Reconexión del Operador de Pantalla');
{
  const antes = (await prisma.commandLog.count({ where: { team: { name: 'ALFA' } } }));
  pant.s.close();
  await wait(400);
  const pant2 = connect('ALFA-3');
  const s = await pant2.snap();
  check(s.workspace?.role === 'PANTALLA', 'vuelve dentro de la fase como Pantalla');
  check(s.workspace?.payload?.marana?.viaje?.n === 1, 'y con el último brote para volver a verlo');
  check(s.workspace?.payload?.salidas?.length === antes, `recupera el historial completo (${s.workspace?.payload?.salidas?.length}/${antes})`);
  pant2.s.close();
}
const pant3 = connect('ALFA-3');
await pant3.snap();

console.log('\n10) Mezcla de roles a mitad de fase');
{
  await admin.send('admin:roles:shuffle', { teamIds: [sd.me.teamId] });
  await wait(800);
  const miembros = await prisma.user.findMany({ where: { team: { name: 'ALFA' } }, orderBy: { displayName: 'asc' } });
  const nuevoTerminal = miembros.find((m) => m.role === 'TERMINAL')!;
  const nuevaPantalla = miembros.find((m) => m.role === 'PANTALLA')!;
  const clientes: Record<string, any> = { 'ALFA · Jugador 1': datos, 'ALFA · Jugador 2': term, 'ALFA · Jugador 3': pant3 };

  const viejo = await term.send('terminal:command', { texto: 'ayuda' });
  const esTerminalAun = nuevoTerminal.displayName === 'ALFA · Jugador 2';
  check(esTerminalAun ? viejo.ok : viejo.error === 'NO_ERES_TERMINAL',
    esTerminalAun ? 'sigue siendo Terminal' : 'el ex-Terminal ya no puede escribir');

  const p = clientes[nuevaPantalla.displayName].fresh('pantalla:output');
  const r = await clientes[nuevoTerminal.displayName].send('terminal:command', { texto: 'estado' });
  const salida = await p;
  check(r.ok === true, 'el NUEVO Terminal sí puede escribir');
  check(JSON.stringify(salida).includes('EL SEMILLERO'), 'la salida llega a la NUEVA Pantalla');
}

console.log('\n11) Resolución: el semillero y el seto');
{
  const miembros = await prisma.user.findMany({ where: { team: { name: 'ALFA' } }, orderBy: { displayName: 'asc' } });
  const clientes: Record<string, any> = { 'ALFA · Jugador 1': datos, 'ALFA · Jugador 2': term, 'ALFA · Jugador 3': pant3 };
  const cliente = clientes[miembros.find((m) => m.role === 'TERMINAL')!.displayName];
  const cliPant = clientes[miembros.find((m) => m.role === 'PANTALLA')!.displayName];

  for (const l of SEMILLERO) await cliente.send('terminal:command', { texto: l });
  const cede = cliPant.fresh('pantalla:output');
  await cliente.send('terminal:command', { texto: 'lanzar' });
  check(JSON.stringify(await cede).includes('EL SETO'), 'el semillero cruzado: empieza el seto');
  const prE = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { phaseId: f1.id, team: { name: 'ALFA' } } });
  const eE = JSON.parse(prE.stateJson);
  check(prE.status === 'IN_PROGRESS' && eE.capa === 2 && eE.programa.length === 0, 'la fase sigue abierta, en la capa 2, con el programa vacío');

  await sinEspera();
  for (const l of buena) await cliente.send('terminal:command', { texto: l });
  const resueltoEnTodos = Promise.all([datos.fresh('phase:solved', 100000), term.fresh('phase:solved', 100000), pant3.fresh('phase:solved', 100000)]);
  await cliente.send('terminal:command', { texto: 'lanzar' });
  const [ev] = await resueltoEnTodos;
  check(ev.phaseId === f1.id, 'phase:solved llega a TODO el equipo, no solo a Pantalla');
  check(typeof ev.timeToSolveMs === 'number' && ev.timeToSolveMs > 0, `tiempo sellado (${ev.timeToSolveMs}ms)`);
  check(ev.attempts === 1, `intentos fallidos registrados (${ev.attempts})`);

  const pr = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { phaseId: f1.id, team: { name: 'ALFA' } } });
  check(pr.status === 'SOLVED' && pr.solvedAt !== null, 'progreso marcado SOLVED en BD');
  check(pr.activeMs !== null && pr.activeMs <= pr.timeToSolveMs!, 'tiempo activo ≤ tiempo oficial');
  const otro = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { phaseId: f1.id, team: { name: 'BRAVO' } } });
  check(otro.status !== 'SOLVED', 'resolver no afecta a los demás equipos');
}

console.log('\n12) Tras resolver');
{
  const miembros = await prisma.user.findMany({ where: { team: { name: 'ALFA' } }, orderBy: { displayName: 'asc' } });
  const nuevoTerminal = miembros.find((m) => m.role === 'TERMINAL')!;
  const clientes: Record<string, any> = { 'ALFA · Jugador 1': datos, 'ALFA · Jugador 2': term, 'ALFA · Jugador 3': pant3 };
  const r = await clientes[nuevoTerminal.displayName].send('terminal:command', { texto: 'ayuda' });
  check(r.ok === false, `la fase resuelta ya no acepta comandos (${r.error})`);

  const s = await new Promise<any>((res) => { datos.s.emit('session:resync' as any, {}, res); });
  const siguiente = s.lobby[idxFase + 1];
  check(siguiente.canEnter === false && siguiente.lockReason === 'ADMIN',
    'la fase siguiente espera al admin, no al prerrequisito');
  check(s.lobby[idxFase].teamStatus === 'SOLVED', 'el lobby muestra La Maraña resuelta');
  check(s.workspace === null, 'el jugador vuelve al lobby');
}

console.log('\n13) Fase cerrada por el admin');
{
  // Otra fase cualquiera, la que venga DETRAS de La Maraña: la de delante
  // ya esta abierta y abrir dos veces la misma no prueba nada.
  const otra = sa.phases[idxFase + 1];
  const abrir2 = await admin.send('admin:phase:open', { phaseId: otra.id });
  check(abrir2.ok === true, `otra fase abierta (${abrir2.error ?? 'ok'})`);
  await wait(300);
  const b1 = connect('BRAVO-2');
  const bDatos = connect('BRAVO-1');
  await Promise.all([b1.snap(), bDatos.snap()]);
  const entrar = await bDatos.send('phase:enter', { phaseId: f1.id });
  check(entrar.ok === true, `BRAVO entra a La Maraña (${entrar.error ?? 'ok'})`);
  await wait(300);
  const rolB2 = await prisma.user.findFirstOrThrow({ where: { accessCode: 'BRAVO-2' } });
  const antesDeCerrar = await b1.send('terminal:command', { texto: 'ayuda' });
  check(antesDeCerrar.ok === true, `BRAVO juega La Maraña (rol de BRAVO-2: ${rolB2.role}, resultado: ${antesDeCerrar.error ?? 'ok'})`);
  await admin.send('admin:phase:close', { phaseId: f1.id });
  await wait(400);
  const despues = await b1.send('terminal:command', { texto: 'ayuda' });
  check(despues.ok === false, `tras cerrarla, los comandos se rechazan (${despues.error})`);
  b1.s.close(); bDatos.s.close();
}

for (const c of [admin, datos, term, pant3]) c.s.close();
await prisma.$disconnect();
console.log(fallos === 0 ? '\n✅ La Maraña (servidor) OK\n' : `\n❌ ${fallos} fallos\n`);
process.exit(fallos === 0 ? 0 : 1);
