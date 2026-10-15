// Prueba de humo del Paso 3. Requiere el server levantado.
import { io, type Socket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';
import { shuffleTeamRoles } from '../src/lib/shuffle.js';
import type { Role } from '../src/lib/constants.js';

const URL = process.env.SMOKE_URL ?? 'http://localhost:4000';
const prisma = new PrismaClient();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
const check = (ok: boolean, txt: string) => { console.log(`  ${ok ? '✔' : '✘'} ${txt}`); if (!ok) fallos++; };

function connect(code: string) {
  const s: Socket = io(URL, { auth: { code }, transports: ['websocket'] });
  // Buzon de todo lo recibido, igual que en smoke-fase1. Hace falta para
  // comprobar lo que NO llega: que una averia no le caiga a quien no era.
  const buzon: Record<string, any[]> = {};
  s.onAny((ev, data) => (buzon[ev] ??= []).push(data));
  const fresh = (ev: string, ms = 4000) =>
    new Promise<any>((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), ms); s.once(ev, (d: any) => { clearTimeout(t); res(d); }); });
  const snap = () => fresh('session:snapshot');
  // Con tiempo límite: un ack que no llega debe salir como fallo con
  // nombre, no como una prueba colgada sin explicación.
  const send = (ev: string, p: any) =>
    new Promise<any>((r) => {
      const t = setTimeout(() => r({ ok: false, error: `TIMEOUT:${ev}` }), 8000);
      s.emit(ev as any, p, (res: any) => { clearTimeout(t); r(res); });
    });
  return { s, buzon, fresh, snap, send };
}

// Estado limpio
await prisma.teamPhaseProgress.updateMany({ data: { status: 'PENDING', attempts: 0, unlockedAt: null, availableAt: null, enteredAt: null, firstMoveAt: null, solvedAt: null, pausedMs: 0, timeToSolveMs: null, activeMs: null } });
await prisma.phase.updateMany({ data: { status: 'LOCKED', openedAt: null, closedAt: null } });
// `libreAcceso` tambien: la seccion 8 lo enciende, y si una corrida se
// cae antes de apagarlo la siguiente arranca con el evento en un estado
// que ella misma da por imposible y falla sin explicar por que.
await prisma.eventState.update({ where: { id: 'singleton' }, data: { status: 'LOBBY', pausedAt: null, totalPausedMs: 0, shuffleCount: 0, startedAt: null, focusPhaseId: null, libreAcceso: false } });

console.log('\n0) Algoritmo de mezcla (10 000 corridas en frío)');
{
  let fijos = 0, evitaAnterior = 0;
  const roles: Role[] = ['DATOS', 'TERMINAL', 'PANTALLA'];
  const dist = new Map<string, number>();
  for (let i = 0; i < 10_000; i++) {
    const m = roles.map((r, idx) => ({ userId: `u${idx}`, role: r, previousRole: null }));
    const plan = shuffleTeamRoles(m)!;
    if (plan.some((p) => p.from === p.to)) fijos++;
    dist.set(plan.map((p) => p.to).join(''), (dist.get(plan.map((p) => p.to).join('')) ?? 0) + 1);
  }
  check(fijos === 0, `nadie repite su rol en 10 000 mezclas (${fijos} fallos)`);
  check(dist.size === 2, `usa los 2 desarreglos posibles de 3 elementos (${dist.size})`);
  const [a, b] = [...dist.values()];
  check(Math.abs(a - b) < 400, `reparto equilibrado entre ambos (${a} vs ${b})`);
  for (let i = 0; i < 200; i++) {
    const m: any = [
      { userId: 'a', role: 'TERMINAL', previousRole: 'DATOS' },
      { userId: 'b', role: 'PANTALLA', previousRole: 'TERMINAL' },
      { userId: 'c', role: 'DATOS', previousRole: 'PANTALLA' },
    ];
    const plan = shuffleTeamRoles(m)!;
    if (plan.every((p, i2) => p.to !== m[i2].previousRole)) evitaAnterior++;
  }
  check(evitaAnterior === 200, `evita también el penúltimo rol cuando puede (${evitaAnterior}/200)`);
  check(shuffleTeamRoles([{ userId: 'solo', role: 'DATOS', previousRole: null }]) === null, 'equipo de 1 → null en vez de reventar');
}

const admin = connect('ADMIN-2026');
const datos = connect('ALFA-1'), term = connect('ALFA-2'), pant = connect('ALFA-3');
const [sa, sd] = await Promise.all([admin.snap(), datos.snap(), term.snap(), pant.snap()]);

console.log('\n1) Guardia de autorización');
const intruso = await datos.send('admin:phase:open', { phaseId: sa.phases[0].id });
check(intruso.ok === false && intruso.error === 'NOT_ALLOWED', `un jugador NO puede abrir fases (${intruso.error})`);
check((await prisma.phase.findFirstOrThrow({ where: { order: 1 } })).status === 'LOCKED', 'la fase sigue bloqueada');

console.log('\n2) activar_fase');
const lobbyProm = datos.fresh('lobby:update');
const r1 = await admin.send('admin:phase:open', { phaseId: sa.phases[0].id });
check(r1.ok, 'ack ok');
const lob = await lobbyProm;
check(lob.lobby[0].canEnter === true, 'el jugador recibe lobby:update sin recargar');
const ev1 = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
check(ev1.status === 'RUNNING', 'abrir la primera fase arranca el evento (RUNNING)');
const unlocked = await prisma.teamPhaseProgress.findMany({ where: { phaseId: sa.phases[0].id } });
check(unlocked.every((p) => p.unlockedAt !== null), `reloj oficial armado en los ${unlocked.length} equipos`);
const t0s = new Set(unlocked.map((p) => p.unlockedAt!.getTime()));
check(t0s.size === 1, 'todos los equipos con el MISMO t0');

console.log('\n3) mezclar_roles en caliente');
await datos.send('phase:enter', { phaseId: sa.phases[0].id });
await wait(200);
const antes = await prisma.user.findMany({ where: { team: { name: 'ALFA' } }, orderBy: { displayName: 'asc' } });
const roleChanged = datos.fresh('role:changed');
const snapNuevo = datos.snap();
const r2 = await admin.send('admin:roles:shuffle', {});
const sembrados = await prisma.team.count();
check(r2.ok && r2.data.equipos === sembrados, `mezcla en ${r2.data?.equipos} equipos de ${sembrados}, ${r2.data?.cambios} cambios`);
const rc = await roleChanged;
const sn = await snapNuevo;
const despues = await prisma.user.findMany({ where: { team: { name: 'ALFA' } }, orderBy: { displayName: 'asc' } });
check(antes.every((u, i) => u.role !== despues[i].role), 'nadie conserva su rol en BD');
check(new Set(despues.map((u) => u.role)).size === 3, 'siguen existiendo los 3 roles en el equipo');
check(despues.every((u, i) => u.previousRole === antes[i].role), 'previousRole guardado');
check(rc.role === sn.me.role, `role:changed y snapshot coinciden (${rc.role})`);
check(sn.workspace?.role === sn.me.role, 'el workspace llega ya proyectado al rol NUEVO');
check(sn.workspace?.phaseId === sa.phases[0].id, 'la mezcla no expulsa al equipo de la fase');

console.log('\n4) Migración de rooms (envío dirigido tras la mezcla)');
{
  // La prueba real: tras la mezcla, un envío dirigido por rol debe llegar
  // a quien AHORA ostenta ese rol, no a quien lo tenía antes.
  const porNombre: Record<string, any> = {
    'ALFA · Jugador 1': datos, 'ALFA · Jugador 2': term, 'ALFA · Jugador 3': pant,
  };
  const esperas = despues.map((u) => ({
    nombre: u.displayName,
    rolEnBD: u.role,
    promesa: porNombre[u.displayName].fresh('workspace:update', 3000).catch(() => null),
  }));

  await datos.send('phase:enter', { phaseId: sa.phases[0].id });
  const recibidos = await Promise.all(esperas.map((e) => e.promesa));

  esperas.forEach((e, i) => {
    const w = recibidos[i];
    check(w?.role === e.rolEnBD, `${e.nombre}: recibe la proyección de ${e.rolEnBD} (llegó ${w?.role ?? 'nada'})`);
  });
}

console.log('\n5) Pausa: el reloj se detiene');
await admin.send('admin:event:status', { status: 'PAUSED' });
await wait(1200);
await admin.send('admin:event:status', { status: 'RUNNING' });
const pausado = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { phaseId: sa.phases[0].id, team: { name: 'ALFA' } } });
check(pausado.pausedMs >= 1000, `pausa descontada del reloj (${pausado.pausedMs}ms)`);
const ev2 = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
check(ev2.pausedAt === null && ev2.totalPausedMs >= 1000, `evento reanudado (total pausado ${ev2.totalPausedMs}ms)`);

console.log('\n6) cerrar_fase libera la cadena');
const lobbyProm2 = datos.fresh('lobby:update');
const r3 = await admin.send('admin:phase:close', { phaseId: sa.phases[0].id });
check(r3.ok, 'ack ok');
const lob2 = await lobbyProm2;
check(lob2.lobby[0].lockReason === 'ADMIN' && lob2.lobby[0].canEnter === false, 'la fase cerrada ya no es accesible');
const prog = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { phaseId: sa.phases[0].id, team: { name: 'ALFA' } } });
check(prog.status === 'FAILED', 'equipo que no resolvió → FAILED (sin tiempo registrado)');
await admin.send('admin:phase:open', { phaseId: sa.phases[1].id });
await wait(300);
const lob3 = await prisma.teamPhaseProgress.findMany({ where: { team: { name: 'ALFA' } }, include: { phase: true } });
const { buildLobbyView } = await import('../src/lib/timing.js');
const evF = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
const vista = buildLobbyView(lob3, evF);
check(vista[1].canEnter === true, 'la Fase 2 SÍ es accesible pese a no haber resuelto la 1 (fase cerrada)');

console.log('\n7) Ensayo de la pantalla de victoria');
{
  const alfa = await prisma.team.findFirstOrThrow({ where: { name: 'ALFA' } });

  // Llega a los TRES puestos. La fase se gana en equipo, así que el
  // momento tiene que ser común: si solo lo viera quien teclea, los
  // otros dos se enterarían de su propia victoria por el vecino.
  const esperan = Promise.all([
    datos.fresh('phase:solved'),
    term.fresh('phase:solved'),
    pant.fresh('phase:solved'),
  ]);
  const antesProg = await prisma.teamPhaseProgress.findMany({
    where: { teamId: alfa.id }, orderBy: { phaseId: 'asc' },
  });

  const rc = await admin.send('admin:phase:celebrar', { teamIds: [alfa.id] });
  check(rc.ok === true, 'ack ok');
  const vistas = await esperan;
  check(vistas.every((v: any) => v.ensayo === true), 'los tres puestos la reciben, marcada como ensayo');
  check(
    typeof vistas[0].timeToSolveMs === 'number' && vistas[0].timeToSolveMs > 0,
    `con un tiempo de muestra (${vistas[0].timeToSolveMs}ms)`,
  );
  check(typeof vistas[0].title === 'string' && vistas[0].title.length > 0,
    `y el rótulo de la fase (${vistas[0].title})`);

  // Y no toca NADA: es un ensayo, no una victoria. Si sellara tiempos o
  // marcara SOLVED, probar la pantalla el día del evento falsearía el
  // ranking de quien la estuviera jugando.
  const huella = (ps: any[]) =>
    JSON.stringify(ps.map((p) => [p.status, p.solvedAt, p.timeToSolveMs, p.attempts]));
  const despuesProg = await prisma.teamPhaseProgress.findMany({
    where: { teamId: alfa.id }, orderBy: { phaseId: 'asc' },
  });
  check(huella(antesProg) === huella(despuesProg), 'el progreso en base de datos queda intacto');

  const bitacora = await prisma.eventLog.findFirst({
    where: { type: 'CELEBRACION_ENSAYO' }, orderBy: { createdAt: 'desc' },
  });
  check(bitacora !== null, 'pero queda en la bitácora: alguien verá esa pantalla en la sala');

  // Sin equipos, va a todos.
  const todos = await admin.send('admin:phase:celebrar', {});
  check(todos.ok === true && (todos.data?.equipos ?? 0) > 1,
    `sin equipos va a todos (${todos.data?.equipos})`);
}

console.log('\n8) Acceso libre a las fases abiertas');
{
  const { buildLobbyView } = await import('../src/lib/timing.js');
  const alfa = await prisma.team.findFirstOrThrow({ where: { name: 'ALFA' } });
  const fases = await prisma.phase.findMany({ orderBy: { order: 'asc' } });

  // Escenario limpio: la 1 CERRADA por el admin (LOCKED), la 2 y la 3
  // abiertas, y el equipo sin resolver nada.
  await prisma.phase.updateMany({ data: { status: 'LOCKED' } });
  await prisma.phase.updateMany({
    where: { id: { in: [fases[1].id, fases[2].id] } },
    data: { status: 'ACTIVE', openedAt: new Date(), closedAt: null },
  });
  await prisma.teamPhaseProgress.updateMany({
    where: { teamId: alfa.id },
    data: { status: 'PENDING', solvedAt: null, availableAt: null },
  });

  const vista = async () => {
    const rows = await prisma.teamPhaseProgress.findMany({ where: { teamId: alfa.id }, include: { phase: true } });
    const ev = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
    return buildLobbyView(rows, ev);
  };

  const apagado = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
  check(apagado.libreAcceso === false, 'viene apagado de serie');

  const conCadena = await vista();
  check(conCadena[1].canEnter === false && conCadena[1].lockReason === 'PREREQUISITE',
    'con la cadena, la fase 2 esta bloqueada por la anterior');

  // Encenderlo tiene que repintar los lobbies solos: si el equipo tuviera
  // que recargar para ver la fase abierta, la opcion no sirve en sala.
  const lobbyProm = datos.fresh('lobby:update');
  const evProm = datos.fresh('event:update');
  const r = await admin.send('admin:event:acceso', { libre: true });
  check(r.ok === true, 'ack ok');
  const lob = await lobbyProm;
  check(lob.lobby[1].canEnter === true, 'el equipo ve la fase 2 accesible sin recargar');
  check((await evProm).libreAcceso === true, 'y el estado del evento viaja a todo el mundo');

  const libre = await vista();
  check(libre[1].canEnter === true && libre[1].lockReason === null, 'la fase 2 se abre');
  check(libre[2].canEnter === true, 'y la 3 tambien, sin haber tocado la 2');

  // Y AHORA lo que NO debe hacer. Esto libera el prerrequisito, no el control.
  check(libre[0].canEnter === false && libre[0].lockReason === 'ADMIN',
    'una fase que el admin no ha abierto sigue cerrada');

  await prisma.teamPhaseProgress.updateMany({
    where: { teamId: alfa.id, phaseId: fases[1].id },
    data: { status: 'SOLVED', solvedAt: new Date() },
  });
  const trasResolver = await vista();
  check(trasResolver[1].canEnter === false && trasResolver[1].lockReason === 'COMPLETED',
    'y una fase ya resuelta sigue sin poder rejugarse');

  // Entrar de verdad, no solo verlo accesible.
  const entrada = await datos.send('phase:enter', { phaseId: fases[2].id });
  check(entrada.ok === true, 'el equipo entra de verdad a una fase que no le tocaba');
  await datos.send('phase:leave', undefined);

  // Apagarlo devuelve la cadena.
  await prisma.teamPhaseProgress.updateMany({
    where: { teamId: alfa.id, phaseId: fases[1].id },
    data: { status: 'PENDING', solvedAt: null },
  });
  const lobbyProm2 = datos.fresh('lobby:update');
  await admin.send('admin:event:acceso', { libre: false });
  check((await lobbyProm2).lobby[1].canEnter === false, 'apagarlo vuelve a bloquear, tambien sin recargar');

  const log = await prisma.eventLog.findFirst({ where: { type: 'ACCESO_LIBRE' }, orderBy: { createdAt: 'desc' } });
  check(log !== null, 'y cada cambio queda en la bitacora');

  // Reiniciar tiene que devolverlo a su sitio: encendido de una partida a
  // la siguiente es el ajuste que se queda olvidado y luego nadie entiende
  // por que las fases se abren solas.
  await admin.send('admin:event:acceso', { libre: true });
  await admin.send('admin:event:reset', {});
  await wait(300);
  const trasReiniciar = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
  check(trasReiniciar.libreAcceso === false, 'y reiniciar el juego lo vuelve a apagar');
}

console.log('\n8 bis) La presencia se difunde en TODA conexion');
{
  // Atada a la primera conexion, bastaba con que quedara un socket
  // rezagado —una pestaña recien cerrada, un F5 dentro del margen de
  // gracia— para que el panel no se enterara de que esa persona habia
  // vuelto: seguia pintandola caida y con sus botones apagados.
  const nueva = connect('ALFA-1');
  const aviso = admin.fresh('presence:update');
  await nueva.snap();
  const p1 = await aviso;
  check(p1.members.some((m: any) => m.connected), 'al conectarse alguien, el panel se entera');

  // Y una SEGUNDA pestaña de la misma persona tambien avisa: es la que
  // antes se perdia.
  const otraPestana = connect('ALFA-1');
  const aviso2 = admin.fresh('presence:update');
  await otraPestana.snap();
  await aviso2;
  check(true, 'y con una segunda pestaña suya, tambien');

  nueva.s.close(); otraPestana.s.close();
  await wait(300);
}

console.log('\n9) Averias provocadas desde el panel');
{
  const gente = await prisma.user.findMany({ where: { team: { name: 'ALFA' } }, orderBy: { displayName: 'asc' } });
  // Por ORDEN y no por nombre: los clientes son personas, no roles, y
  // `gente` viene ordenada igual que se conectaron.
  const clientes = [datos, term, pant];

  // Cada puesto recibe LA SUYA, y solo la suya.
  for (const [i, persona] of gente.entries()) {
    const cli = clientes[i];
    const suya = cli.fresh('player:averia');
    const otros = clientes.filter((_, j) => j !== i);
    const antes = otros.map((c: any) => (c.buzon['player:averia'] ?? []).length);

    const r = await admin.send('admin:jugador:averia', { userId: persona.id });
    const av = await suya;
    check(r.ok === true && r.data?.tipo === persona.role,
      `${persona.role}: la averia sale del rol que tiene AHORA (${av.tipo})`);
    check(av.duracionMs > 0, `y dura ${av.duracionMs / 1000} s`);
    await wait(150);
    check(otros.every((c: any, i: number) => (c.buzon['player:averia'] ?? []).length === antes[i]),
      'y no le llega a nadie mas del equipo');
  }

  // Una averia es ruido, no una penalizacion: si tocara el juego, el
  // equipo no sabria por cual de las dos cosas va perdiendo.
  const huella = async () => JSON.stringify(
    (await prisma.teamPhaseProgress.findMany({ where: { team: { name: 'ALFA' } }, orderBy: { phaseId: 'asc' } }))
      .map((x) => [x.status, x.attempts, x.stateJson, x.solvedAt]));
  const antesDeTodo = await huella();
  await admin.send('admin:jugador:averia', { userId: gente[0].id });
  await wait(200);
  check(await huella() === antesDeTodo, 'una averia no toca el progreso ni los intentos');

  check((await admin.send('admin:jugador:averia', { userId: sa.me.id })).ok === false,
    'y al propio admin no se le puede averiar nada');

  const log = await prisma.eventLog.findFirst({ where: { type: 'AVERIA' }, orderBy: { createdAt: 'desc' } });
  check(log !== null, 'cada averia queda en la bitacora');

  // El tipo se lee del rol EN EL MOMENTO, no del que tuviera al pintarse
  // el panel: entre que el admin mira la lista y pulsa, una mezcla pudo
  // cambiar quien es quien.
  const antesDelBaile = gente[0].role;
  await admin.send('admin:roles:shuffle', { teamIds: [sd.me.teamId] });
  await wait(600);
  const rTras = await admin.send('admin:jugador:averia', { userId: gente[0].id });
  const ahora = await prisma.user.findUniqueOrThrow({ where: { id: gente[0].id } });
  check(rTras.data?.tipo === ahora.role && ahora.role !== antesDelBaile,
    `tras mezclar roles, la averia sigue al rol nuevo (${antesDelBaile} → ${ahora.role})`);

  // El panel no pregunta si esa persona esta conectada antes de disparar:
  // la presencia que tiene pintada puede estar vieja, y un boton apagado a
  // destiempo se lee como panel roto. La señal sale siempre; si no hay nadie
  // escuchando en su canal, se pierde y ya.
  const bitacoraAntes = await prisma.eventLog.count({ where: { type: 'AVERIA' } });
  const fantasma = await prisma.user.findFirstOrThrow({
    where: { isAdmin: false, team: { name: 'BRAVO' } },
  });
  const rFantasma = await admin.send('admin:jugador:averia', { userId: fantasma.id });
  check(rFantasma.ok === true, 'averiar a quien no esta conectado no falla: la señal se pierde');
  check(rFantasma.data?.tipo === fantasma.role, 'y el panel recibe igual de que rol era');
  check(await prisma.eventLog.count({ where: { type: 'AVERIA' } }) === bitacoraAntes + 1,
    'y queda en la bitacora aunque nadie la haya sufrido');
}

console.log('\n10) Identidad del equipo: nombre y logo');
{
  const equipo = await prisma.team.findFirstOrThrow({ where: { name: 'CHARLIE' } });

  // --- el nombre ---
  const rVacio = await admin.send('admin:equipo:nombre', { teamId: equipo.id, nombre: '   ' });
  check(rVacio.ok === false && rVacio.error === 'NOMBRE_VACIO', `un nombre en blanco se rechaza (${rVacio.error})`);

  const rLargo = await admin.send('admin:equipo:nombre', { teamId: equipo.id, nombre: 'x'.repeat(25) });
  check(rLargo.ok === false && rLargo.error === 'NOMBRE_LARGO', `y uno de 25 caracteres tambien (${rLargo.error})`);

  const rRepe = await admin.send('admin:equipo:nombre', { teamId: equipo.id, nombre: 'bravo' });
  check(rRepe.ok === false && rRepe.error === 'NOMBRE_REPETIDO',
    'un nombre que ya existe se rechaza aunque cambie de mayusculas');

  const rOk = await admin.send('admin:equipo:nombre', { teamId: equipo.id, nombre: '  Los   Tigres  ' });
  check(rOk.ok && rOk.data.nombre === 'Los Tigres', `se limpia el sobrante de espacios (${rOk.data?.nombre})`);

  const tras = await prisma.team.findUniqueOrThrow({ where: { id: equipo.id } });
  check(tras.name === 'Los Tigres' && tras.joinCode === 'Los Tigres', 'el nombre y el codigo corto van juntos');

  const gente = await prisma.user.findMany({ where: { teamId: equipo.id }, orderBy: { accessCode: 'asc' } });
  check(gente.every((g) => g.displayName.startsWith('Los Tigres \u00b7 ')),
    `el nombre de la gente sigue al del equipo (${gente[0].displayName})`);
  check(gente.every((g) => /^CHARLIE-\d$/.test(g.accessCode)),
    `pero su CODIGO DE ACCESO no se toca: esta impreso y repartido (${gente[0].accessCode})`);

  // --- el logo ---
  // Un PNG de 1x1 de verdad, para que el husmeo de cabecera tenga algo
  // que husmear. Lo que se comprueba es que el tipo sale de los BYTES.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

  const rNoImagen = await admin.send('admin:equipo:logo', {
    teamId: equipo.id, datos: Buffer.from('no soy un png, aunque me llame .png'),
  });
  check(rNoImagen.ok === false && rNoImagen.error === 'NO_ES_IMAGEN',
    `un archivo que no es imagen se rechaza por sus bytes, no por su nombre (${rNoImagen.error})`);

  const rEnorme = await admin.send('admin:equipo:logo', {
    teamId: equipo.id, datos: Buffer.concat([png, Buffer.alloc(600 * 1024)]),
  });
  check(rEnorme.ok === false && rEnorme.error === 'DEMASIADO_GRANDE', `y uno de 600 kB tambien (${rEnorme.error})`);

  const sinLogoAun = await prisma.team.findUniqueOrThrow({ where: { id: equipo.id } });
  check(sinLogoAun.logo === null, 'ningun rechazo ha dejado nada guardado');

  const rLogo = await admin.send('admin:equipo:logo', { teamId: equipo.id, datos: png });
  check(rLogo.ok && rLogo.data.mime === 'image/png', `un PNG entra y se guarda como ${rLogo.data?.mime}`);
  const conLogo = await prisma.team.findUniqueOrThrow({ where: { id: equipo.id } });
  check(conLogo.logo?.length === png.length && conLogo.logoAt !== null,
    `con sus ${conLogo.logo?.length} bytes intactos y su fecha, que hace de version`);

  // La version tiene que CAMBIAR al cambiar el logo: es lo unico que
  // saca al navegador de la cache, que guarda la imagen para siempre.
  await wait(1100);
  const rOtro = await admin.send('admin:equipo:logo', { teamId: equipo.id, datos: png });
  check(rOtro.ok && rOtro.data.logoAt !== rLogo.data.logoAt,
    `volver a subir cambia la version (${rLogo.data?.logoAt} \u2192 ${rOtro.data?.logoAt})`);

  // El snapshot lleva la version, NO los bytes: diez logos en cada
  // repintado y a cada cliente serian varios megas por nada.
  const snapAdmin: any = await admin.send('session:resync', {});
  const fila = (snapAdmin.teams ?? snapAdmin.data?.teams ?? []).find((t: any) => t.id === equipo.id);
  check(fila?.logoAt === rOtro.data.logoAt, 'el snapshot del panel lleva esa misma version');
  check(!('logo' in (fila ?? {})), 'y NO lleva los bytes del logo');

  const rQuita = await admin.send('admin:equipo:logo', { teamId: equipo.id, datos: null });
  const limpio = await prisma.team.findUniqueOrThrow({ where: { id: equipo.id } });
  check(rQuita.ok && limpio.logo === null && limpio.logoAt === null, 'se puede quitar el logo');

  // Y nada de esto lo puede hacer un jugador.
  const rIntruso = await datos.send('admin:equipo:nombre', { teamId: equipo.id, nombre: 'PIRATA' });
  const rIntruso2 = await datos.send('admin:equipo:logo', { teamId: equipo.id, datos: png });
  check(rIntruso.error === 'NOT_ALLOWED' && rIntruso2.error === 'NOT_ALLOWED',
    'un jugador no puede renombrar ni poner logos');

  // Se deja como estaba: las siguientes corridas esperan CHARLIE.
  await admin.send('admin:equipo:nombre', { teamId: equipo.id, nombre: 'CHARLIE' });
  check((await prisma.team.findUniqueOrThrow({ where: { id: equipo.id } })).name === 'CHARLIE',
    'y se puede volver a dejar como estaba');
}

console.log('\n11) La final: cuenta atras y desenlace');
{
  const fase = await prisma.phase.findFirstOrThrow({ where: { esFinal: true } });
  const bonus = await prisma.phase.findFirst({ where: { esBonus: true } });
  check(!!bonus && bonus.order > fase.order, `el bonus va detras de la final (F${bonus?.order} tras F${fase.order})`);

  // --- el limite ---
  const rCorto = await admin.send('admin:final:limite', { minutos: 0 });
  const rLargo = await admin.send('admin:final:limite', { minutos: 999 });
  check(rCorto.error === 'LIMITE_FUERA_DE_RANGO' && rLargo.error === 'LIMITE_FUERA_DE_RANGO',
    'el limite se rechaza fuera de 1..180 minutos');

  const rLim = await admin.send('admin:final:limite', { minutos: 12 });
  check(rLim.ok && rLim.data.limiteMs === 12 * 60_000, `se guarda en ms (${rLim.data?.limiteMs})`);

  // --- sin abrir: en espera, con el reloj quieto en el limite ---
  const sinAbrir: any = await admin.send('session:resync', {});
  const f0 = sinAbrir.final ?? sinAbrir.data?.final;
  check(f0?.estado === 'ESPERA' && f0.restanteMs === 12 * 60_000,
    `sin abrir la fase el cohete espera (${f0?.estado}, ${f0?.restanteMs}ms)`);

  // --- abierta: la cuenta corre ---
  await admin.send('admin:phase:open', { phaseId: fase.id });
  await wait(1200);
  const enMarcha: any = await admin.send('session:resync', {});
  const f1 = enMarcha.final ?? enMarcha.data?.final;
  check(f1?.estado === 'CUENTA', `al abrirla arranca la cuenta (${f1?.estado})`);
  check(f1.restanteMs < 12 * 60_000 && f1.restanteMs > 11 * 60_000,
    `y va bajando (${Math.round(f1.restanteMs / 1000)}s de 720)`);

  // --- en pausa el reloj se detiene ---
  await admin.send('admin:event:status', { status: 'PAUSED' });
  const enPausa: any = await admin.send('session:resync', {});
  const antes = (enPausa.final ?? enPausa.data?.final).restanteMs;
  await wait(1500);
  const sigue: any = await admin.send('session:resync', {});
  const despues = (sigue.final ?? sigue.data?.final).restanteMs;
  check(Math.abs(despues - antes) < 250, `en pausa la cuenta no corre (${antes} → ${despues})`);
  await admin.send('admin:event:status', { status: 'RUNNING' });

  // --- se acaba el tiempo: DERROTA, y sin tocar a nadie ---
  await prisma.phase.update({
    where: { id: fase.id },
    data: { openedAt: new Date(Date.now() - 20 * 60_000) },
  });
  const tarde: any = await admin.send('session:resync', {});
  const f2 = tarde.final ?? tarde.data?.final;
  check(f2?.estado === 'DERROTA', `pasado el tiempo, el cohete despega (${f2?.estado})`);
  check(typeof f2.desenlaceAt === 'number' && f2.desenlaceAt < Date.now(),
    'con el instante en que se acabo, para no repetir la animacion mas tarde');
  const intactos = await prisma.teamPhaseProgress.count({
    where: { phaseId: fase.id, status: 'FAILED' },
  });
  check(intactos === 0, 'llegar a cero NO marca a nadie: es un telon, no una penalizacion');
  check((await prisma.phase.findUniqueOrThrow({ where: { id: fase.id } })).status === 'ACTIVE',
    'y la fase sigue abierta: si la sala necesita mas tiempo, se sube el limite');

  // --- alguien la resuelve: VICTORIA, con nombre ---
  const equipo = await prisma.team.findFirstOrThrow({ where: { name: 'BRAVO' } });
  await prisma.teamPhaseProgress.updateMany({
    where: { phaseId: fase.id, teamId: equipo.id },
    data: { status: 'SOLVED', solvedAt: new Date() },
  });
  const ganada: any = await admin.send('session:resync', {});
  const f3 = ganada.final ?? ganada.data?.final;
  check(f3?.estado === 'VICTORIA' && f3.ganador === 'BRAVO',
    `si alguien llega, el lanzamiento se aborta (${f3?.estado} · ${f3?.ganador})`);

  // --- los ensayos ---
  const rEnsayo = await admin.send('admin:final:ensayo', { resultado: 'VICTORIA' });
  check(rEnsayo.ok && rEnsayo.data.resultado === 'VICTORIA', 'el ensayo de victoria se acepta');
  check((admin.buzon['final:ensayo'] ?? []).some((e: any) => e.resultado === 'VICTORIA'),
    'y llega por el socket, que es como cruza de la ventana del panel a la de la pared');
  const rBasura = await admin.send('admin:final:ensayo', { resultado: 'LO-QUE-SEA' });
  check(rBasura.ok && rBasura.data.resultado === null, 'un desenlace inventado se queda en nada');
  const rJugador = await datos.send('admin:final:ensayo', { resultado: 'DERROTA' });
  check(rJugador.error === 'NOT_ALLOWED', 'y un jugador no puede lanzar ensayos');

  // Se deja como estaba.
  await admin.send('admin:final:ensayo', { resultado: null });
  await admin.send('admin:final:limite', { minutos: 30 });
  await prisma.teamPhaseProgress.updateMany({
    where: { phaseId: fase.id },
    data: { status: 'PENDING', solvedAt: null },
  });
  await prisma.phase.update({ where: { id: fase.id }, data: { status: 'LOCKED', openedAt: null } });
  check((await prisma.phase.findUniqueOrThrow({ where: { id: fase.id } })).limiteMs === 30 * 60_000,
    'y el limite vuelve a los 30 minutos de serie');
}

console.log('\n12) Ataques entre equipos');
{
  const bravo = connect('BRAVO-1');
  await bravo.snap();
  const alfa = await prisma.team.findFirstOrThrow({ where: { name: 'ALFA' } });
  const equipoB = await prisma.team.findFirstOrThrow({ where: { name: 'BRAVO' } });
  const equipoC = await prisma.team.findFirstOrThrow({ where: { name: 'CHARLIE' } });

  const limpiar = () => prisma.team.update({
    where: { id: alfa.id },
    data: { ultimoAtaqueAt: null, ultimoObjetivoId: null, ultimoAtaquePausaMs: 0 },
  });
  await limpiar();

  // --- solo con la partida en marcha ---
  await admin.send('admin:event:status', { status: 'PAUSED' });
  const enPausa = await datos.send('player:ataque', { teamId: equipoB.id });
  check(enPausa.error === 'EVENTO_NO_EN_JUEGO', `en pausa no se ataca (${enPausa.error})`);
  await admin.send('admin:event:status', { status: 'RUNNING' });

  // --- a uno mismo no, y a un desconocido tampoco ---
  const aMi = await datos.send('player:ataque', { teamId: alfa.id });
  const aNadie = await datos.send('player:ataque', { teamId: 'no-existe' });
  check(aMi.error === 'A_TI_NO', 'a tu propio equipo no');
  check(aNadie.error === 'EQUIPO_DESCONOCIDO', 'y a un equipo que no existe tampoco');

  // --- el ataque de verdad ---
  bravo.buzon['player:averia'] = [];
  const r1 = await datos.send('player:ataque', { teamId: equipoB.id });
  check(r1.ok && r1.data.objetivo === 'BRAVO', `ALFA ataca a ${r1.data?.objetivo}`);
  check(r1.data.esperaMs === 60_000, `y el enfriamiento son 60 s (${r1.data?.esperaMs}ms)`);
  await wait(400);
  const recibida = (bravo.buzon['player:averia'] ?? [])[0];
  check(recibida?.de === 'ALFA', `al atacado le llega la averia CON remite (de: ${recibida?.de})`);
  check(recibida?.tipo === 'DATOS' && recibida.duracionMs === 12_000,
    `y es la de SU puesto, no una generica (${recibida?.tipo}, ${recibida?.duracionMs}ms)`);

  const sellado = await prisma.team.findUniqueOrThrow({ where: { id: alfa.id } });
  check(sellado.ultimoObjetivoId === equipoB.id && sellado.ultimoAtaqueAt !== null,
    'el equipo atacante queda sellado con la hora y el objetivo');

  // --- el enfriamiento es del EQUIPO, no de la persona ---
  const otroPuesto = await term.send('player:ataque', { teamId: equipoC.id });
  check(otroPuesto.error === 'ENFRIANDO',
    `otro puesto del mismo equipo tampoco puede: el minuto es del equipo (${otroPuesto.error})`);

  // --- y en pausa no corre ---
  const leo = async () => {
    const s: any = await datos.send('session:resync', {});
    return (s.ataque ?? s.data?.ataque).esperaMs as number;
  };
  await admin.send('admin:event:status', { status: 'PAUSED' });
  const antes = await leo();
  await wait(1500);
  const despues = await leo();
  check(Math.abs(antes - despues) < 250, `en pausa el enfriamiento no corre (${antes} → ${despues})`);
  await admin.send('admin:event:status', { status: 'RUNNING' });

  // --- pasado el minuto: al mismo NO, a otro SÍ ---
  await prisma.team.update({
    where: { id: alfa.id },
    data: { ultimoAtaqueAt: new Date(Date.now() - 90_000) },
  });
  const repetido = await datos.send('player:ataque', { teamId: equipoB.id });
  check(repetido.error === 'OBJETIVO_REPETIDO',
    `con el enfriamiento pasado, al mismo equipo NO (${repetido.error})`);
  const otro = await datos.send('player:ataque', { teamId: equipoC.id });
  check(otro.ok && otro.data.objetivo === 'CHARLIE', 'pero a otro sí');
  const tras = await prisma.team.findUniqueOrThrow({ where: { id: alfa.id } });
  check(tras.ultimoObjetivoId === equipoC.id, 'y el veto se mueve al nuevo objetivo');

  // --- el snapshot del jugador lleva el menu ---
  const s: any = await datos.send('session:resync', {});
  const menu = s.ataque ?? s.data?.ataque;
  const sembrados = await prisma.team.count();
  check(menu.objetivos.length === sembrados - 1,
    `el menu lista a los demas equipos y no al propio (${menu.objetivos.length} de ${sembrados})`);
  check(!menu.objetivos.some((o: any) => o.id === alfa.id), 'sin el propio equipo dentro');
  check(menu.ultimoObjetivoId === equipoC.id, 'y dice a quien no se puede repetir');

  // --- un admin no juega a esto ---
  const rAdmin = await admin.send('player:ataque', { teamId: equipoB.id });
  check(rAdmin.ok === false, `el admin no ataca a nadie (${rAdmin.error})`);

  // Reiniciar el juego tiene que llevarse por delante esto también.
  await datos.send('player:ataque', { teamId: equipoB.id }).catch(() => {});
  await prisma.team.update({
    where: { id: alfa.id },
    data: { ultimoAtaqueAt: new Date(), ultimoObjetivoId: equipoB.id },
  });
  await admin.send('admin:event:reset', {});
  const trasReinicio = await prisma.team.findUniqueOrThrow({ where: { id: alfa.id } });
  check(trasReinicio.ultimoAtaqueAt === null && trasReinicio.ultimoObjetivoId === null,
    'reiniciar el juego borra enfriamientos y vetos: se empieza de cero');

  await limpiar();
  bravo.s.close();
}

for (const c of [admin, datos, term, pant]) c.s.close();
await prisma.$disconnect();
console.log(fallos === 0 ? '\n✅ Paso 3 (servidor) OK\n' : `\n❌ ${fallos} fallos\n`);
process.exit(fallos === 0 ? 0 : 1);
