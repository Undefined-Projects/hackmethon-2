// Prueba de humo del Paso 5. Requiere el server levantado.
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
  // Con tiempo límite: un ack que no llega debe salir como fallo con
  // nombre, no como una prueba colgada sin explicación.
  const send = (ev: string, p: any) =>
    new Promise<any>((r) => {
      const t = setTimeout(() => r({ ok: false, error: `TIMEOUT:${ev}` }), 8000);
      s.emit(ev as any, p, (res: any) => { clearTimeout(t); r(res); });
    });
  return { s, buzon, fresh, snap: () => fresh('session:snapshot'), send };
}

// --- Estado limpio + El Enemigo abierto ---
//
// Con acceso libre: esta bateria prueba El Enemigo suelto, y desde que ya
// no es la primera del recorrido, la cadena le exigiria resolver antes la
// que tiene delante. Eso es cosa de `smoke:admin`, no de aqui.
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
// Por CLAVE y no por posicion. Esta bateria prueba El Enemigo, y el sitio
// que ocupa en el recorrido puede cambiar —de hecho ha cambiado— sin que
// eso tenga nada que ver con lo que aqui se comprueba.
const f1 = sa.phases.find((f: any) => f.key === 'fase-2-enemigo');
if (!f1) throw new Error('no esta sembrada la fase `fase-2-enemigo`');
const idxEnemigo = sa.phases.findIndex((f: any) => f.key === 'fase-2-enemigo');

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
const tablas = wd.payload?.tablas ?? [];
check(tablas.length === 4, `Datos recibe el esquema completo (${tablas.length} tablas)`);
check((wd.payload?.relaciones ?? []).length === 4, 'con sus 4 relaciones');
check(
  tablas.reduce((a: number, t: any) => a + t.filas.length, 0) === 27,
  'y todas las filas de las cuatro tablas',
);
check(wt.payload?.pista !== undefined && wt.payload.tablas === undefined, 'Terminal NO recibe el esquema');
check(JSON.stringify(wt.payload).includes('10.4.2.18') === false, 'ninguna IP viaja al socket de Terminal');
check(Array.isArray(wp.payload?.salidas) && wp.payload.salidas.length === 0, 'Pantalla arranca con historial vacío');
check(JSON.stringify(wp.payload).includes('a.duarte') === false, 'Pantalla no recibe los registros ni la solución');
check(JSON.stringify(wp.payload).includes('188.42.19.6') === false, 'ni la IP del intruso');

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
  check(JSON.stringify(r).includes('politica') === false, 'el acuse NO contiene la respuesta');
  check(salida.comando === 'ayuda' && salida.bloques.length > 0, 'Pantalla recibe la salida completa');
  await wait(400);
  check((datos.buzon['pantalla:output'] ?? []).length === 0, 'Datos no recibió nada');
  check((term.buzon['pantalla:output'] ?? []).length === 0, 'Terminal no recibió nada');
}

console.log('\n6) Comandos del reto');
{
  const pedir = async (texto: string) => {
    const p = pant.fresh('pantalla:output');
    await term.send('terminal:command', { texto });
    return p;
  };
  const pol = await pedir('politica');
  check(JSON.stringify(pol).includes('10.4.0.0/16'), 'politica → rango corporativo');
  const who = await pedir('whois 188.42.19.6');
  check(JSON.stringify(who).includes('fuera de la red'), 'whois detecta la IP externa');
  const perfil = await pedir('perfil soporte');
  check(JSON.stringify(perfil).includes('/api/tickets'), 'perfil muestra las autorizaciones del departamento');
  const perfilCuenta = await pedir('perfil a.duarte');
  check(
    JSON.stringify(perfilCuenta).includes('pregunta a Datos'),
    'y con una cuenta devuelve a Datos en vez de responder',
  );
  const mal = await pedir('inventado');
  check(mal.bloques[0].tipo === 'error', 'comando desconocido → error en Pantalla');
  const acentos = await pedir('POLÍTICA');
  check(JSON.stringify(acentos).includes('10.4.0.0/16'), 'tolera mayúsculas y acentos');
}

console.log('\n7) Monitor de tráfico en vivo');
{
  // 7a — el grifo se abre y solo cae en Pantalla.
  const aviso = pant.fresh('pantalla:trafico:estado');
  const salida = pant.fresh('pantalla:output');
  const r = await term.send('terminal:command', { texto: 'trafico' });
  const est = await aviso;
  const sal = await salida;
  check(r.ok === true, 'Terminal recibe acuse del comando');
  check(JSON.stringify(r).includes('188.42.19.6') === false, 'el acuse no le filtra ni una petición');
  check(est.activo === true, 'Pantalla recibe el aviso de captura abierta');
  check(JSON.stringify(sal).includes('Monitor de tráfico abierto'), 'y la cabecera del monitor');

  await wait(2600);
  const caidas = pant.buzon['pantalla:trafico'] ?? [];
  check(caidas.length >= 3, `caen peticiones solas sin pedir nada (${caidas.length} en 2,6 s)`);
  check((term.buzon['pantalla:trafico'] ?? []).length === 0, 'Terminal no ve el ataque que abrió');
  check((datos.buzon['pantalla:trafico'] ?? []).length === 0, 'Datos tampoco lo ve');

  const l = caidas[0];
  check(
    ['id', 'at', 'hora', 'metodo', 'ruta', 'cuenta', 'ip', 'codigo'].every((k) => l[k] !== undefined),
    'cada línea llega sellada y completa',
  );
  check(/^\d\d:\d\d:\d\d$/.test(l.hora), `la hora la pone el servidor (${l.hora})`);
  check(
    caidas.every((x: any) => x.sospechosa === undefined && x.intruso === undefined),
    'ninguna línea viene marcada como sospechosa: eso lo deduce el equipo',
  );
  check(new Set(caidas.map((x: any) => x.id)).size === caidas.length, 'sin identificadores repetidos');

  // 7b — la pausa del evento congela el ataque.
  await admin.send('admin:event:status', { status: 'PAUSED' });
  await wait(200);
  const antesPausa = (pant.buzon['pantalla:trafico'] ?? []).length;
  await wait(1600);
  check((pant.buzon['pantalla:trafico'] ?? []).length === antesPausa, 'en pausa no cae ni una petición más');
  await admin.send('admin:event:status', { status: 'RUNNING' });
  await wait(1200);
  check((pant.buzon['pantalla:trafico'] ?? []).length > antesPausa, 'al reanudar vuelve a caer');

  // 7c — y se cierra cuando Terminal lo pide.
  const fin = pant.fresh('pantalla:trafico:estado');
  await term.send('terminal:command', { texto: 'trafico detener' });
  check((await fin).activo === false, 'Pantalla recibe el aviso de captura cerrada');
  const trasCerrar = (pant.buzon['pantalla:trafico'] ?? []).length;
  await wait(1600);
  check((pant.buzon['pantalla:trafico'] ?? []).length === trasCerrar, 'y deja de caer de verdad');

  // 7c bis — acotar en vivo. El monitor quedó cerrado arriba, así que
  // esto abre uno ya filtrado, que es el otro camino del comando.
  const avisoFiltro = pant.fresh('pantalla:trafico:estado');
  await term.send('terminal:command', { texto: 'trafico ip 188.42.19.6' });
  const estF = await avisoFiltro;
  check(estF.activo === true && estF.filtro?.ip?.[0] === '188.42.19.6',
    'Pantalla recibe el encuadre, no solo «captura en curso»');

  const desde = (pant.buzon['pantalla:trafico'] ?? []).length;
  await wait(2600);
  const acotadas = (pant.buzon['pantalla:trafico'] ?? []).slice(desde);
  // Lo que se comprueba aquí es el salto hacia delante del motor: esa IP
  // aparece 3 veces en 62 líneas, así que emitiendo «solo cuando toca»
  // caería una cada 19 s y el monitor parecería averiado.
  check(acotadas.length >= 2, `filtrar no hunde el ritmo (${acotadas.length} en 2,6 s)`);
  check(acotadas.every((x: any) => x.ip === '188.42.19.6'), 'y todo lo que cae encaja con el filtro');
  // Esa máquina la usan a.duarte y las dos cuentas que no existen —está
  // en IPS_HOSTILES—, así que el filtro devuelve la mezcla. Comprobar que
  // a.duarte asoma en un muestreo de dos o tres líneas sería una moneda al
  // aire; que su rastro está en el guion ya lo fija la seccion 7 bis.
  const DUENOS_DE_D5 = ['a.duarte', 'svc.backup', 'k.moreno'];
  check(acotadas.every((x: any) => DUENOS_DE_D5.includes(x.cuenta)),
    'y solo de las cuentas que usan esa maquina');

  const avisoTodo = pant.fresh('pantalla:trafico:estado');
  await term.send('terminal:command', { texto: 'trafico todo' });
  check((await avisoTodo).filtro === null, '`trafico todo` retira el encuadre');
  const desde2 = (pant.buzon['pantalla:trafico'] ?? []).length;
  await wait(2200);
  const abiertas = (pant.buzon['pantalla:trafico'] ?? []).slice(desde2);
  check(abiertas.some((x: any) => x.ip !== '188.42.19.6'), 'y vuelve a caer el ataque entero');

  // Un filtro que no casa con nada calla, pero no cierra la captura:
  // acotar por algo que no está también es información.
  await term.send('terminal:command', { texto: 'trafico cuenta nadie.existe' });
  const desde3 = (pant.buzon['pantalla:trafico'] ?? []).length;
  await wait(1800);
  check((pant.buzon['pantalla:trafico'] ?? []).length === desde3, 'un filtro sin coincidencias calla');
  const sigueViva = pant.fresh('pantalla:trafico:estado');
  await term.send('terminal:command', { texto: 'trafico todo' });
  check((await sigueViva).activo === true, 'pero la captura seguía viva por debajo');
  await term.send('terminal:command', { texto: 'trafico detener' });
  await wait(200);

  // 7d — reabierto: las secciones siguientes comprueban que sobrevive a
  // una reconexión y que resolver lo apaga.
  await term.send('terminal:command', { texto: 'trafico' });
  await wait(300);
}

console.log('\n7 bis) El guion del ataque, comprobado en el módulo');
{
  // Por el cable caen tres o cuatro peticiones por segundo: esperar a
  // que asomen los seis ejemplares finos costaría medio minuto de
  // prueba. El guion es una lista, así que se comprueba entero.
  const { enemigo: fase1 } = await import('../src/phases/enemigo.js');
  const r: any = fase1.ejecutar('trafico', { estado: {}, intentos: 0, ahora: Date.now(), traficoActivo: false });
  const p = r.flujo?.peticiones ?? [];
  check(r.flujo?.accion === 'iniciar' && r.flujo?.bucle === true, 'el guion arranca en bucle');
  check(p.length > 50, `es una avalancha, no cuatro líneas (${p.length})`);

  const CULPABLES = ['svc.backup', 'k.moreno', 'a.duarte', 'j.ortega'];
  const LIMPIAS: Record<string, { ip: string; rutas: string[] }> = {
    'm.rivas':  { ip: '10.4.2.18',   rutas: ['/api/inventario'] },
    's.cabral': { ip: '10.4.2.27',   rutas: ['/api/auditoria', '/api/exportar/auditoria'] },
    'c.pineda': { ip: '201.135.8.7', rutas: ['/api/clientes'] },
  };

  const cuentas = [...new Set(p.map((x: any) => x.cuenta))] as string[];
  check(
    cuentas.every((c) => CULPABLES.includes(c) || LIMPIAS[c]),
    `no hay relleno: toda cuenta del tráfico es limpia o culpable (${cuentas.length} cuentas)`,
  );

  // La invariante que hace GANABLE la fase: quien no está en la lista de
  // culpables no puede haber hecho nada que la incumpla, o el equipo
  // nunca podría terminar sin comerse una cuarentena injusta.
  const sucias = p.filter((x: any) => {
    const limpia = LIMPIAS[x.cuenta];
    return limpia && (x.ip !== limpia.ip || !limpia.rutas.includes(x.ruta));
  });
  check(sucias.length === 0, `ninguna cuenta limpia hace una petición inválida (${sucias.length})`);

  // Y los tres ejes tienen que estar presentes, o falta una respuesta.
  check(
    p.some((x: any) => x.cuenta === 'svc.backup') && p.some((x: any) => x.cuenta === 'k.moreno'),
    'eje 1 · las dos cuentas no registradas aparecen',
  );
  check(
    p.filter((x: any) => x.cuenta === 'a.duarte' && x.ip === '188.42.19.6').length === 3,
    'eje 2 · a.duarte entra desde la máquina sin dueño',
  );
  check(
    p.some((x: any) => x.cuenta === 'a.duarte' && x.ip === '10.4.3.9'),
    'y también trabaja desde la suya: la cuenta no delata, la petición sí',
  );
  check(
    p.filter((x: any) => x.cuenta === 'j.ortega' && x.ruta.startsWith('/api/exportar')).length === 2,
    'eje 3 · j.ortega exporta lo que no le toca',
  );
  check(
    p.some((x: any) => x.cuenta === 'j.ortega' && x.ruta === '/api/nomina'),
    'y también lee su nómina, que sí le toca',
  );
  check(
    new Set(p.filter((x: any) => x.cuenta === 'svc.backup' || x.cuenta === 'k.moreno')
             .map((x: any) => x.codigo)).size > 1,
    'los códigos varían: el 200 no es la pista, el criterio son las tres comprobaciones',
  );

  // El motivo de a.duarte tiene que ser la MÁQUINA y solo la máquina: si
  // alguna de sus líneas desde 188.42.19.6 tocase una ruta que no es de
  // Soporte, «permiso» también sería cierto y el motivo dejaría de
  // distinguir. Esto se rompe en silencio al retocar el guion.
  check(
    p.filter((x: any) => x.cuenta === 'a.duarte' && x.ip === '188.42.19.6')
     .every((x: any) => x.ruta === '/api/tickets'),
    'eje 2 · a.duarte solo hace lo suyo desde la máquina ajena: el motivo es inequívoco',
  );
  // Y el simétrico: j.ortega incumple por la ruta, nunca por el origen.
  check(
    p.filter((x: any) => x.cuenta === 'j.ortega').every((x: any) => x.ip === '10.4.2.31'),
    'eje 3 · j.ortega no se mueve de su puesto: su único fallo es el endpoint',
  );

  // El ruido bajó del 55% para que las seis líneas finas tengan aire.
  const ruido = p.filter((x: any) => x.cuenta === 'svc.backup' || x.cuenta === 'k.moreno').length;
  check(ruido / p.length < 0.5, `el ruido no ahoga el guion (${Math.round((ruido / p.length) * 100)}%)`);

  // Y las posiciones son al azar: dos vueltas no repiten el mismo compás.
  const donde = (guion: any[]) =>
    guion.map((x: any, i: number) => (x.ip === '188.42.19.6' ? i : -1)).filter((i) => i >= 0).join(',');
  const otro: any = fase1.ejecutar('trafico', { estado: {}, intentos: 0, ahora: Date.now(), traficoActivo: false });
  check(donde(p) !== donde(otro.flujo.peticiones), 'la siembra cambia de sitio en cada lanzamiento');
}

console.log('\n7 ter) La mitad de Pantalla no nombra a nadie · el motivo es obligatorio');
{
  const { enemigo: fase1 } = await import('../src/phases/enemigo.js');
  const ahora = Date.now();
  const corre = (texto: string, estado: Record<string, unknown> = {}, traficoActivo = false): any =>
    fase1.ejecutar(texto, { estado, intentos: 0, ahora, traficoActivo });

  const CUENTAS = ['m.rivas', 'j.ortega', 's.cabral', 'c.pineda', 'a.duarte', 'svc.backup', 'k.moreno'];

  // LA invariante de la fase: si algún comando de esta terminal nombrase
  // una cuenta, Pantalla podría juzgar sola y el Operador de Datos
  // sobraría en la mitad del reto.
  const publico = ['permisos', 'politica', 'usuarios', 'ayuda',
                   'perfil infraestructura', 'perfil finanzas', 'perfil cumplimiento',
                   'perfil ventas', 'perfil soporte']
    .map((c) => JSON.stringify(corre(c))).join(' ');
  const filtradas = CUENTAS.filter((c) => publico.includes(c));
  check(filtradas.length === 0, `la política jamás nombra una cuenta (${filtradas.join(', ') || 'ninguna'})`);
  check(
    JSON.stringify(corre('usuarios')).includes('empleados'),
    '`usuarios` ya no lista el padrón: manda a la base de datos',
  );

  // Y la simétrica: preguntar por una cuenta tiene que dar lo mismo
  // exista o no, o `perfil` volvería a confirmar solo quién existe.
  const real = JSON.stringify(corre('perfil j.ortega')).replaceAll('j.ortega', 'X');
  const falsa = JSON.stringify(corre('perfil svc.backup')).replaceAll('svc.backup', 'X');
  check(real === falsa, '`perfil` no distingue una cuenta real de una inventada');

  // El motivo. Que falte no es fallo: es prisa, y se pregunta.
  const sinMotivo = corre('bloquear svc.backup');
  check(!sinMotivo.fallo && JSON.stringify(sinMotivo).includes('Falta el motivo'),
    'bloquear sin motivo pregunta, no penaliza');
  const motivoRaro = corre('bloquear svc.backup azul');
  check(!motivoRaro.fallo && motivoRaro.bloques[0].tipo === 'error',
    'un motivo inventado tampoco cuesta una cuarentena');

  // El corazón del cambio: cuenta culpable + eje equivocado tiene que
  // ser INDISTINGUIBLE de cuenta limpia. Si se notara la diferencia,
  // barrer los siete nombres seguiría ganando, solo que en dos pasadas.
  const ejeMalo = JSON.stringify(corre('bloquear j.ortega maquina')).replaceAll('j.ortega', 'X');
  const limpia = JSON.stringify(corre('bloquear m.rivas maquina')).replaceAll('m.rivas', 'X');
  check(ejeMalo === limpia, 'culpable con motivo equivocado = cuenta limpia, salida idéntica');
  check(corre('bloquear j.ortega maquina').fallo === true, 'y las dos cuestan un intento');

  const acierto = corre('bloquear j.ortega permiso');
  check(acierto.bloques[0].tipo === 'exito' && acierto.estado.bloqueadas.length === 1,
    'con el motivo correcto, acierto');

  // Un motivo cierto pero menos profundo cuenta igual y explica el orden:
  // castigar a quien razonó bien sería castigar el vocabulario.
  const secundario = corre('bloquear svc.backup permiso');
  check(secundario.bloques[0].tipo === 'exito'
        && JSON.stringify(secundario).includes('esa cuenta no existe'),
    'motivo cierto pero secundario: cuenta, y enseña cuál era el primero');

  // Cuarentena creciente: es lo que mata la fuerza bruta.
  const castigo = (fallos: number) =>
    corre('bloquear m.rivas maquina', { fallos }).estado.cuarentenaHasta - ahora;
  check(castigo(0) === 20_000 && castigo(1) === 45_000 && castigo(2) === 90_000,
    `la cuarentena crece (${castigo(0)} → ${castigo(1)} → ${castigo(2)} ms)`);
  check(castigo(9) === 90_000, 'y se estanca en 90 s, no crece sin fin');

  // Sinónimos: bajo presión nadie teclea el término exacto.
  for (const alias of ['maquina', 'máquina', 'equipo', 'ip', 'origen']) {
    check(corre(`bloquear a.duarte ${alias}`).bloques[0].tipo === 'exito', `«${alias}» vale como motivo`);
  }

  const typo = corre('bloquear j.orteg permiso');
  check(!typo.fallo && typo.bloques[0].tipo === 'error', 'un typo sigue saliendo gratis');
}

console.log('\n7 quater) Filtros del monitor');
{
  const { enemigo: fase1 } = await import('../src/phases/enemigo.js');
  const ahora = Date.now();
  const corre = (texto: string, traficoActivo = false): any =>
    fase1.ejecutar(texto, { estado: {}, intentos: 0, ahora, traficoActivo });

  // Sin monitor abierto, acotar lo ABRE ya acotado. Con monitor abierto,
  // lo reencuadra sin reiniciar el guion: filtrar no es empezar de cero.
  const abre = corre('trafico ip 188.42.19.6', false);
  check(abre.flujo.accion === 'iniciar' && abre.flujo.filtro.ip[0] === '188.42.19.6',
    'sin monitor abierto, `trafico <filtro>` lo abre ya acotado');
  const reencuadra = corre('trafico ip 188.42.19.6', true);
  check(reencuadra.flujo.accion === 'filtrar' && !reencuadra.flujo.peticiones,
    'con monitor abierto, reencuadra sin regenerar el guion');
  check(corre('trafico todo', true).flujo.filtro === null, '`trafico todo` retira el filtro');
  check(corre('trafico todo', false).bloques[0].tipo === 'error',
    'y sin monitor abierto avisa en vez de fingir');
  check(corre('trafico detener', true).flujo.accion === 'detener', '`trafico detener` sigue cerrando');

  // Repetir clave SUMA, mezclar claves ACOTA.
  const suma = corre('trafico cuenta j.ortega cuenta s.cabral').flujo.filtro;
  check(suma.cuenta.length === 2, 'repetir una clave suma valores');
  const acota = corre('trafico cuenta j.ortega ruta /api/exportar').flujo.filtro;
  check(acota.cuenta.length === 1 && acota.ruta.length === 1, 'mezclar claves acota');
  check(corre('trafico codigo 403').flujo.filtro.codigo[0] === 403, 'el código llega como número');

  // LA invariante del filtro: por departamento, jamás. El servidor sabe
  // el mapa cuenta→departamento, así que dejar acotar por él le enseñaría
  // a Pantalla de quién es cada cuenta sin pasar por Datos.
  const depto = corre('trafico departamento finanzas');
  check(!depto.flujo, 'acotar por departamento no toca el monitor');
  const dicho = JSON.stringify(depto);
  check(!dicho.includes('j.ortega') && dicho.includes('empleados'),
    'y explica dónde se pregunta en vez de responderlo');

  check(corre('trafico color rosa').bloques[0].tipo === 'error', 'una clave inventada se rechaza');
  check(corre('trafico cuenta').bloques[0].tipo === 'error', 'y una clave sin valor también');
  check(corre('trafico codigo abc').bloques[0].tipo === 'error', 'un código que no es número se rechaza');

  // El filtro es una lente, no un guion distinto: lo que cae por debajo
  // sigue siendo el ataque entero, con sus cuatro culpables.
  const cuentas = new Set(abre.flujo.peticiones.map((x: any) => x.cuenta));
  check(cuentas.has('svc.backup') && cuentas.has('j.ortega'),
    'el guion que se abre acotado sigue siendo el ataque completo');
}

console.log('\n8) Acusación en falso: intento + cuarentena');
{
  const p = pant.fresh('pantalla:output');
  await term.send('terminal:command', { texto: 'bloquear m.rivas permiso' });
  const salida = await p;
  check(salida.bloques[0].tipo === 'error', 'Pantalla ve el fallo');
  const pr = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { phaseId: f1.id, team: { name: 'ALFA' } } });
  check(pr.attempts === 1, `intento contabilizado (${pr.attempts})`);
  check(pr.status === 'IN_PROGRESS', 'la fase sigue sin resolver');

  const p2 = pant.fresh('pantalla:output');
  await term.send('terminal:command', { texto: 'politica' });
  const s2 = await p2;
  check(JSON.stringify(s2).includes('cuarentena'), 'siguiente comando bloqueado por cuarentena');
  // Levantamos la cuarentena para no esperar 20 s.
  await prisma.teamPhaseProgress.update({ where: { id: pr.id }, data: { stateJson: '{}' } });
}

console.log('\n9) Reconexión del Operador de Pantalla');
{
  const antes = (await prisma.commandLog.count({ where: { team: { name: 'ALFA' } } }));
  pant.s.close();
  await wait(400);
  const pant2 = connect('ALFA-3');
  const s = await pant2.snap();
  check(s.workspace?.role === 'PANTALLA', 'vuelve dentro de la fase como Pantalla');
  check(s.workspace?.payload?.traficoActivo === true, 'y sabe que la captura sigue viva');
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
  const r = await clientes[nuevoTerminal.displayName].send('terminal:command', { texto: 'permisos' });
  const salida = await p;
  check(r.ok === true, 'el NUEVO Terminal sí puede escribir');
  check(JSON.stringify(salida).includes('Cumplimiento'), 'la salida llega a la NUEVA Pantalla');
}

console.log('\n11) Resolución');
{
  const miembros = await prisma.user.findMany({ where: { team: { name: 'ALFA' } }, orderBy: { displayName: 'asc' } });
  const nuevoTerminal = miembros.find((m) => m.role === 'TERMINAL')!;
  const clientes: Record<string, any> = { 'ALFA · Jugador 1': datos, 'ALFA · Jugador 2': term, 'ALFA · Jugador 3': pant3 };
  const cliente = clientes[nuevoTerminal.displayName];

  // Ahora hay cuatro culpables y la fase no se cierra hasta la última.
  const nuevaPantalla0 = miembros.find((m) => m.role === 'PANTALLA')!;
  const cliPant0 = clientes[nuevaPantalla0.displayName];
  const CON_MOTIVO = [
    ['svc.backup', 'no-registrada'],
    ['k.moreno', 'no-registrada'],
    ['a.duarte', 'maquina'],
  ];
  for (const [cuenta, motivo] of CON_MOTIVO) {
    const eco = cliPant0.fresh('pantalla:output');
    await cliente.send('terminal:command', { texto: `bloquear ${cuenta} ${motivo}` });
    const salida = await eco;
    check(salida.bloques[0].tipo === 'exito', `${cuenta} aislada`);
  }
  const pr0 = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { phaseId: f1.id, team: { name: 'ALFA' } } });
  check(pr0.status === 'IN_PROGRESS', 'con tres de cuatro, la fase NO está resuelta');
  check(JSON.parse(pr0.stateJson).bloqueadas.length === 3, 'el progreso de aislamientos se persiste');

  const repe = cliPant0.fresh('pantalla:output');
  await cliente.send('terminal:command', { texto: 'bloquear a.duarte maquina' });
  check(JSON.stringify(await repe).includes('ya estaba aislada'), 'repetir un acierto no suma ni penaliza');

  const resueltoEnTodos = Promise.all([datos.fresh('phase:solved'), term.fresh('phase:solved'), pant3.fresh('phase:solved')]);
  await cliente.send('terminal:command', { texto: 'bloquear j.ortega permiso' });
  const [ev] = await resueltoEnTodos;
  check(ev.phaseId === f1.id, 'phase:solved llega a TODO el equipo, no solo a Pantalla');
  check(typeof ev.timeToSolveMs === 'number' && ev.timeToSolveMs > 0, `tiempo sellado (${ev.timeToSolveMs}ms)`);
  check(ev.attempts === 1, `intentos fallidos registrados (${ev.attempts})`);

  const pr = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { phaseId: f1.id, team: { name: 'ALFA' } } });
  check(pr.status === 'SOLVED' && pr.solvedAt !== null, 'progreso marcado SOLVED en BD');
  check(pr.activeMs !== null && pr.activeMs <= pr.timeToSolveMs!, 'tiempo activo ≤ tiempo oficial');

  const otro = await prisma.teamPhaseProgress.findFirstOrThrow({ where: { phaseId: f1.id, team: { name: 'BRAVO' } } });
  check(otro.status !== 'SOLVED', 'resolver no afecta a los demás equipos');

  // Contener la amenaza para el ataque: dejarlo cayendo bajo la
  // celebración contaría algo que ya no es cierto.
  const nuevaPantalla = miembros.find((m) => m.role === 'PANTALLA')!;
  const cliPant = clientes[nuevaPantalla.displayName];
  const antesDeResolver = (cliPant.buzon['pantalla:trafico'] ?? []).length;
  await wait(1700);
  check((cliPant.buzon['pantalla:trafico'] ?? []).length === antesDeResolver, 'resolver cierra la captura');
}

console.log('\n12) Tras resolver');
{
  const miembros = await prisma.user.findMany({ where: { team: { name: 'ALFA' } }, orderBy: { displayName: 'asc' } });
  const nuevoTerminal = miembros.find((m) => m.role === 'TERMINAL')!;
  const clientes: Record<string, any> = { 'ALFA · Jugador 1': datos, 'ALFA · Jugador 2': term, 'ALFA · Jugador 3': pant3 };
  const r = await clientes[nuevoTerminal.displayName].send('terminal:command', { texto: 'ayuda' });
  check(r.ok === false, `la fase resuelta ya no acepta comandos (${r.error})`);

  const s = await new Promise<any>((res) => { datos.s.emit('session:resync' as any, {}, res); });
  const siguiente = s.lobby[idxEnemigo + 1];
  check(siguiente.canEnter === false && siguiente.lockReason === 'ADMIN',
    'la fase siguiente espera al admin, no al prerrequisito');
  check(s.lobby[idxEnemigo].teamStatus === 'SOLVED', 'el lobby muestra El Enemigo resuelto');
  check(s.workspace === null, 'el jugador vuelve al lobby');
}

console.log('\n13) Fase cerrada por el admin');
{
  // Otra fase cualquiera, la que venga DETRAS de El Enemigo: la de delante
  // ya esta abierta y abrir dos veces la misma no prueba nada.
  const otra = sa.phases[idxEnemigo + 1];
  const abrir2 = await admin.send('admin:phase:open', { phaseId: otra.id });
  check(abrir2.ok === true, `otra fase abierta (${abrir2.error ?? 'ok'})`);
  await wait(300);
  const b1 = connect('BRAVO-2');
  const bDatos = connect('BRAVO-1');
  await Promise.all([b1.snap(), bDatos.snap()]);
  const entrar = await bDatos.send('phase:enter', { phaseId: f1.id });
  check(entrar.ok === true, `BRAVO entra a El Enemigo (${entrar.error ?? 'ok'})`);
  await wait(300);
  const rolB2 = await prisma.user.findFirstOrThrow({ where: { accessCode: 'BRAVO-2' } });
  const antesDeCerrar = await b1.send('terminal:command', { texto: 'ayuda' });
  check(antesDeCerrar.ok === true, `BRAVO juega El Enemigo (rol de BRAVO-2: ${rolB2.role}, resultado: ${antesDeCerrar.error ?? 'ok'})`);
  await admin.send('admin:phase:close', { phaseId: f1.id });
  await wait(400);
  const despues = await b1.send('terminal:command', { texto: 'ayuda' });
  check(despues.ok === false, `tras cerrarla, los comandos se rechazan (${despues.error})`);
  b1.s.close(); bDatos.s.close();
}

for (const c of [admin, datos, term, pant3]) c.s.close();
await prisma.$disconnect();
console.log(fallos === 0 ? '\n✅ El Enemigo (servidor) OK\n' : `\n❌ ${fallos} fallos\n`);
process.exit(fallos === 0 ? 0 : 1);
