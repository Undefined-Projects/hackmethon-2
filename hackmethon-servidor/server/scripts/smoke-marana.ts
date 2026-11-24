// Prueba de humo de la Fase 1 · La Maraña (el semillero y el seto) y del
// bonus · La Espesura. No necesita servidor: habla directamente con los
// módulos.
//
//   npm run smoke:fase2
import {
  marana, espesura, setoDeMarana, semilleroDeMarana, espesuraDeMarana, casillaDe, seguidorDePared,
} from '../src/phases/marana.js';
import type { ModuloFase } from '../src/phases/types.js';

let fallos = 0;
const check = (ok: boolean, txt: string) => { console.log(`  ${ok ? '✔' : '✘'} ${txt}`); if (!ok) fallos++; };
const dice = (x: unknown) => JSON.stringify(x);

let reloj = 1_000_000;
/** Una sesión de consola: cada comando avanza el reloj lo bastante para que
 *  el brote anterior haya llegado, salvo que se pida lo contrario. */
function sesion(comandos: string[], semilla?: string,
  { prisa = false, estado0 = {}, mod = marana }: { prisa?: boolean; estado0?: Record<string, unknown>; mod?: ModuloFase } = {}) {
  let estado: Record<string, unknown> = { ...estado0 };
  let ultimo: any = null;
  const salidas: any[] = [];
  for (const c of comandos) {
    reloj += prisa ? 10 : 120_000;
    ultimo = mod.ejecutar(c, { estado, intentos: 0, ahora: reloj, traficoActivo: false, semilla });
    salidas.push(ultimo);
    if (ultimo.estado) estado = ultimo.estado;
  }
  return { estado, ultimo, salidas };
}
/** Cómo acabó el brote (o el brote `b`) del último lanzamiento. */
const finDe = (estado: Record<string, unknown>, b = 0) => (estado.ultimo as any).brotes[b].fin;
const ver = (rol: any, estado: Record<string, unknown>, semilla?: string, mod: ModuloFase = marana) =>
  mod.proyectar(rol, { estado, salidas: [], traficoActivo: false, filtroTrafico: null, semilla }) as any;

/** La Maraña ya en su segunda capa. */
const SETO = { capa: 2 };
const SEMILLERO = (der: string, izq: string) =>
  ['avanzar', 'avanzar', 'avanzar', `girar ${der}`, 'avanzar', 'avanzar', 'avanzar', `girar ${izq}`, 'avanzar'];
const ESCALERA = (primero: 'gira' | 'avanza', izq: string, der: string) => primero === 'gira'
  ? ['repetir 3 veces', `girar ${izq}`, 'avanzar', 'avanzar', 'avanzar', `girar ${der}`, 'avanzar', 'avanzar', 'avanzar', 'fin']
  : ['repetir 3 veces', 'avanzar', 'avanzar', 'avanzar', `girar ${izq}`, 'avanzar', 'avanzar', 'avanzar', `girar ${der}`, 'fin'];
const L = (izq: string) => ['repetir 9 veces', 'avanzar', 'fin', `girar ${izq}`, 'repetir 9 veces', 'avanzar', 'fin'];

/** El camino más corto en un plano, pisando espinas o sin pisarlas. */
const corto = (g: string[][], desde: [number, number], hasta: [number, number], pisa: boolean) => {
  const dist = new Map<string, number>([[`${desde}`, 0]]);
  const cola: [number, number][] = [desde];
  for (let k = 0; k < cola.length; k++) {
    const [f, c] = cola[k];
    for (const [df, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const ff = f + df, cc = c + dc, ch = g[ff]?.[cc];
      if (!ch || ch === '#' || (ch === '*' && !pisa) || dist.has(`${ff},${cc}`)) continue;
      dist.set(`${ff},${cc}`, dist.get(`${f},${c}`)! + 1);
      cola.push([ff, cc]);
    }
  }
  return dist.get(`${hasta}`) ?? Infinity;
};

// ============================================================
console.log('\n1) El semillero · la capa de calentamiento');
{
  const s = semilleroDeMarana();
  check(s.rejilla.length === 7 && s.rejilla.every((f) => f.length === 7), 'es chiquito: 7 × 7');
  check(s.espinas.length === 0, 'no tiene espinas');
  check(corto(s.rejilla, s.entrada, s.salida, false) === 7, 'la salida está a 7 casillas, con dos giros');

  const bien = sesion([...SEMILLERO('derecha', 'izquierda'), 'lanzar']);
  check(bien.estado.capa === 2 && bien.ultimo.resuelto !== true, 'nueve instrucciones sin ciclo lo cruzan → capa 2, el seto');
  check(dice(bien.estado.programa) === '[]', '  y el seto empieza con el programa vacío');
  check(bien.ultimo.bloques.some((b: any) => b.tipo === 'exito'), '  la consola lo celebra');
  const alReves = sesion([...SEMILLERO('izquierda', 'derecha'), 'lanzar']);
  check(finDe(alReves.estado) === 'choque' && alReves.estado.capa !== 2,
    'con izquierda y derecha cambiadas se estrella: son las del brote');

  check(sesion(['si frente libre']).ultimo.bloques[0].tipo === 'error', 'en el semillero no hay `si`');
  const lleno = sesion(Array.from({ length: 13 }, () => 'avanzar'));
  check((lleno.estado.programa as string[]).length === 12 && lleno.ultimo.bloques[0].tipo === 'error',
    'caben 12 líneas: de sobra para nueve');

  const d = ver('DATOS', {});
  check(d.tablas.map((t: any) => t.id).join() === 'manual,viajes,brote', `Datos: manual, viajes y bitácora (${d.tablas.map((t: any) => t.id).join()})`);
  const manual = dice(d.tablas[0].filas);
  check(!manual.includes('repetir') && manual.includes('girar izquierda') && manual.includes('las del brote'),
    '  el manual solo trae avanzar y girar, y aclara que izquierda y derecha son las del brote');
  const p = ver('PANTALLA', {}).marana;
  check(p.mundo.tipo === 'semillero' && p.titulo === 'LA MARAÑA' && p.mundo.celdas.length === 7, 'Pantalla ve el semillero entero');
  const t = ver('TERMINAL', {});
  check(t.brote.max === 12 && t.brote.varios === false && t.brote.nombreCapa === 'el semillero', 'Terminal: el cupo y el nombre de la capa');
  check(t.lamina.capa === 1 && t.lamina.capas === 2 && t.lamina.nombres.join() === 'EL SEMILLERO,EL SETO', 'la lámina: dos capas');

  // Una versión por mesa: girado o reflejado, de los dos programas posibles cruza uno.
  const semillas = Array.from({ length: 48 }, (_, i) => `equipo-${i}`);
  let unaSola = true;
  for (const sem of semillas) {
    const llegan = [['derecha', 'izquierda'], ['izquierda', 'derecha']]
      .map(([a, b]) => sesion([...SEMILLERO(a, b), 'lanzar'], sem).estado.capa === 2);
    if (llegan.filter(Boolean).length !== 1) unaSola = false;
  }
  check(unaSola, 'en las 48 mesas cruza uno de los dos programas espejo, y solo uno');
}

// ============================================================
console.log('\n2) El seto');
{
  const s = setoDeMarana();
  const n = s.rejilla.length;
  check(s.rejilla.every((f) => f.length === n), `es cuadrado (${n}x${n})`);
  check(s.espinas.length === 3, `tiene 3 espinas (${s.espinas.length})`);
  check(corto(s.rejilla, s.entrada, s.salida, false) === 18, `el camino seguro son 18 casillas (${corto(s.rejilla, s.entrada, s.salida, false)})`);
  check(corto(s.rejilla, s.entrada, s.salida, true) === 18, 'y no hay atajo pisando espinas: la L también son 18');

  const bien = sesion([...ESCALERA('gira', 'izquierda', 'derecha'), 'lanzar'], undefined, { estado0: SETO });
  check(bien.ultimo.resuelto === true && bien.estado.resuelta === true, 'la escalera que arranca girando cruza el seto en 10 líneas → fase cruzada');
  check(bien.ultimo.esperaVictoriaMs >= 3000, `  la cortinilla espera a que llegue (${bien.ultimo.esperaVictoriaMs} ms)`);
  check(sesion(['lanzar'], undefined, { estado0: bien.estado }).ultimo.bloques[0].lineas[0].includes('ya no responde'),
    '  y cruzada, la pierna ya no responde');
  const a = sesion([...ESCALERA('avanza', 'izquierda', 'derecha'), 'lanzar'], undefined, { estado0: SETO });
  check(a.estado.resuelta !== true && finDe(a.estado) === 'espina', 'la otra escalera pisa una espina');
  check(a.ultimo.fallo === true, '  y cuenta como intento');
  const l = sesion([...L('izquierda'), 'lanzar'], undefined, { estado0: SETO });
  check(finDe(l.estado) === 'espina', 'la L obvia también pisa una espina');
  const v = (a.estado.viajes as any[])[0];
  check(v.espina >= 1 && /^[A-L]\d+$/.test(v.casilla), `la bitácora dice dónde (${v.casilla}) y qué espina (X${v.espina})`);
  check(!dice(ver('PANTALLA', a.estado).marana.mundo).includes('espinas'),
    '  y Pantalla no se queda con la espina: dónde están lo dice Datos');

  const largo = sesion([
    'avanzar', 'avanzar', 'avanzar', 'girar izquierda', 'avanzar', 'avanzar', 'avanzar', 'girar derecha',
    'avanzar', 'avanzar', 'avanzar',
  ], undefined, { estado0: SETO });
  check(largo.ultimo.bloques[0].tipo === 'error' && (largo.estado.programa as string[]).length === 10,
    'sin ciclo no cabe: la línea 11 se rechaza');
  check(sesion(['si frente libre'], undefined, { estado0: SETO }).ultimo.bloques[0].tipo === 'error', 'en el seto no hay `si`: es del bonus');
  check(sesion(['repetir mientras frente libre'], undefined, { estado0: SETO }).ultimo.bloques[0].tipo === 'error', '  ni `repetir mientras`');
  const choca = sesion(['girar derecha', 'avanzar', 'lanzar'], undefined, { estado0: SETO });
  check(finDe(choca.estado) === 'choque' && !!(choca.estado.ultimo as any).brotes[0].contra,
    'avanzar contra una pared: se estrella, y se sabe contra qué');
  check(finDe(sesion(['avanzar', 'lanzar'], undefined, { estado0: SETO }).estado) === 'quieto', 'quedarse sin instrucciones: quieto');
  check(finDe(sesion(['repetir 99 veces', 'repetir 99 veces', 'girar izquierda', 'fin', 'fin', 'lanzar'], undefined, { estado0: SETO }).estado) === 'agotado',
    'girar sin parar: se agota');

  // Una versión por mesa.
  const semillas = Array.from({ length: 48 }, (_, i) => `equipo-${i}`);
  const sims = new Set<number>(), malas = new Set<string>();
  let todasBien = true, unaSola = true;
  for (const sem of semillas) {
    const sm = setoDeMarana(sem);
    sims.add(sm.sim); malas.add(sm.mala);
    // De las cuatro escaleras posibles (arranca girando o avanzando, con
    // izquierda y derecha en su sitio o cambiadas), cruza UNA.
    const llegan = (['gira', 'avanza'] as const).flatMap((pr) =>
      [['izquierda', 'derecha'], ['derecha', 'izquierda']].map(([i, d]) =>
        finDe(sesion([...ESCALERA(pr, i, d), 'lanzar'], sem, { estado0: SETO }).estado) === 'salida'));
    if (llegan.filter(Boolean).length !== 1) unaSola = false;
    if (!llegan.some(Boolean)) todasBien = false;
  }
  check(todasBien, 'en las 48 mesas hay una escalera de 10 líneas que cruza');
  check(unaSola, '  y solo UNA de las cuatro posibles: copiar la de otra mesa no sirve');
  check(sims.size === 8 && malas.size === 2, `salen las 8 simetrías y las dos escaleras malas (${sims.size}, ${malas.size})`);
  const otras = semillas.filter((sem) => sesion([...ESCALERA('gira', 'izquierda', 'derecha'), 'lanzar'], sem, { estado0: SETO }).estado.resuelta).length;
  check(otras < semillas.length / 2, `el programa canónico solo vale en ${otras} de 48 mesas`);
  const e1 = ver('DATOS', SETO, 'equipo-1').tablas.find((t: any) => t.id === 'espinas').filas;
  const e2 = ver('DATOS', SETO, 'equipo-2').tablas.find((t: any) => t.id === 'espinas').filas;
  check(dice(e1) !== dice(e2), 'y cada mesa tiene sus espinas en sus casillas');
}

// ============================================================
console.log('\n3) El programa: escribir, corregir y cerrar bloques');
{
  const p = sesion(['agregar repetir 3', 'avanza', 'Girar Izquierda', 'fin', 'insertar 2 girar derecha', 'cambiar 3 avanzar', 'borrar 1'], undefined, { estado0: SETO });
  check(dice(p.estado.programa) === dice(['girar derecha', 'avanzar', 'girar izquierda', 'fin']),
    `se guarda normalizado y en orden (${dice(p.estado.programa)})`);
  check(sesion(['repetir 3 veces', 'avanzar', 'lanzar'], undefined, { estado0: SETO }).ultimo.bloques[0].texto.includes('falta un `fin`'),
    'un `repetir` sin cerrar no sale, y lo dice');
  check(sesion(['avanzar', 'fin', 'lanzar']).ultimo.bloques[0].texto.includes('línea 2'),
    'un `fin` de más: dice qué línea sobra');
  check(sesion(['lanzar']).ultimo.bloques[0].tipo === 'error', 'un programa vacío no sale');
  const prisa = sesion(['avanzar', 'lanzar', 'lanzar'], undefined, { prisa: true });
  check(prisa.ultimo.bloques[0].texto.includes('germina'), 'mientras el brote anda, no sale otro');
  const escrito = sesion(['repetir 2 veces', 'avanzar', 'fin'], undefined, { estado0: SETO }).ultimo.bloques;
  check(escrito.every((b: any) => b.tipo === 'texto'), 'escribir solo confirma la línea: el programa no sale');
  check(sesion(['programa']).ultimo.bloques[0].texto.includes('no reconocido'), 'ya no hay comando `programa`');
  check(sesion(['conectar KT-47R']).ultimo.bloques[0].tipo === 'error', 'ya no hay `conectar`: los brotes escuchan siempre');
  const sale = sesion(['avanzar', 'lanzar']);
  check(sale.estado.viajeN === 1, '  y el programa sale tal cual, sin encabezado');
  check(sesion(['borrar todo']).estado.programa !== undefined, '`borrar todo` lo deja vacío');
  check(sesion(['flujo']).ultimo.bloques[0].texto.includes('no reconocido'), 'lo que no es nada se dice');
}

// ============================================================
console.log('\n4) La espesura · el bonus');
{
  const MIENTRAS = ['repetir 40 veces', 'repetir mientras frente libre', 'avanzar', 'fin',
    'si izquierda libre', 'girar izquierda', 'sino', 'girar derecha', 'fin', 'fin'];
  const lanzarEn = (prog: string[], semilla?: string, estado0: Record<string, unknown> = {}) =>
    sesion(['borrar todo', ...prog, 'lanzar'], semilla, { estado0, mod: espesura });
  const fines = (estado: Record<string, unknown>) => (estado.ultimo as any).brotes.map((b: any) => b.fin);

  // La espesura promete cosas; se comprueban en 40 mesas y en la canónica.
  const semillas = [undefined, ...Array.from({ length: 40 }, (_, i) => `equipo-${i}`)];
  let tamano = true, cuatro = true, minas = true, cortoConMina = true, buena = true, mala = true, rapida = true;
  let peorMs = 0;
  const manos = new Set<string>();
  for (const sem of semillas) {
    const e = espesuraDeMarana(sem);
    const g = e.rejilla;
    manos.add(e.mano);
    if (g.length < 22 || g[0].length < 30) tamano = false;
    const sitios = new Set(e.brotes.map((b) => `${b.entrada}`));
    if (e.brotes.length !== 4 || sitios.size !== 4 || g[e.salida[0]][e.salida[1]] !== 'S') cuatro = false;
    if (e.minas.length < 3 || !e.minas.every(([f, c]) => g[f][c] === '*')) minas = false;
    for (const b of e.brotes) {
      if (!(corto(g, b.entrada, e.salida, true) < corto(g, b.entrada, e.salida, false))) cortoConMina = false;
    }
    const bien = lanzarEn(seguidorDePared(e.mano), sem);
    if (bien.ultimo.resuelto !== true) buena = false;
    peorMs = Math.max(peorMs, (bien.estado.ultimo as any).duracion);
    if (bien.ultimo.esperaVictoriaMs > 90_000) rapida = false;
    const mal = lanzarEn(seguidorDePared(e.mano === 'izquierda' ? 'derecha' : 'izquierda'), sem);
    if (mal.ultimo.resuelto === true || !fines(mal.estado).includes('mina')) mala = false;
  }
  check(tamano, 'la espesura mide 23 × 31');
  check(cuatro, '  con cuatro brotes en cuatro sitios distintos y un solo claro');
  check(minas, '  y al menos tres minas');
  check(cortoConMina, 'el camino más corto de CADA brote pasa por una mina, en las 41 mesas');
  check(buena, 'seguir la pared buena lleva a los cuatro al claro en un lanzamiento (12 líneas)');
  check(mala, '  y con la otra pared, alguno pisa una mina');
  check(manos.size === 2, '  qué pared es la buena depende de la mesa');
  check(rapida, `  un lanzamiento dura como mucho ${(peorMs / 1000).toFixed(1)} s`);

  const e = espesuraDeMarana('equipo-7');
  const avanza = lanzarEn(MIENTRAS, 'equipo-7');
  check(avanza.ultimo.resuelto !== true, '«avanza mientras puedas y gira hacia el lado libre» no basta');
  const dos = lanzarEn(seguidorDePared(e.mano === 'izquierda' ? 'derecha' : 'izquierda'), 'equipo-7');
  const filas = (dos.estado.viajes as any[]);
  check(filas.length === 4 && filas.every((v) => v.b >= 1 && v.b <= 4), 'la bitácora apunta a los cuatro brotes');
  const pisa = filas.find((v) => v.fin === 'mina');
  check(!!pisa && casillaDe(e.minas[pisa.espina - 1]) === pisa.casilla, `  y qué mina pisó cada uno (${pisa?.casilla}, X${pisa?.espina})`);
  check(dos.ultimo.fallo === true && dos.estado.resuelta !== true, '  si no llegan los cuatro, no se cruza');

  // Fija: dos lanzamientos, la misma espesura. Lo alumbrado se acumula.
  const uno = lanzarEn(['repetir 3 veces', 'avanzar', 'fin'], 'equipo-7');
  const otro = sesion(['borrar todo', 'repetir 3 veces', 'girar derecha', 'avanzar', 'fin', 'lanzar'], 'equipo-7', { estado0: uno.estado, mod: espesura });
  const luz1 = (uno.estado.luz as number[]).length, luz2 = (otro.estado.luz as number[]).length;
  check(luz1 > 0 && luz2 > luz1, `lo alumbrado se acumula entre lanzamientos (${luz1} → ${luz2} casillas)`);
  check(dice(espesuraDeMarana('equipo-7').rejilla) === dice(e.rejilla), 'reproducible: la misma semilla, la misma espesura');
  check(dice(espesuraDeMarana('equipo-8').rejilla) !== dice(e.rejilla), '  y cada mesa, la suya');

  const gana = lanzarEn(seguidorDePared(e.mano), 'equipo-7');
  check(gana.ultimo.resuelto === true && gana.estado.resuelta === true, 'los cuatro en el claro resuelven el bonus');
  check(sesion(['lanzar'], 'equipo-7', { estado0: gana.estado, mod: espesura }).ultimo.bloques[0].lineas[0].includes('ya están en el claro'),
    '  y luego ya no hay nada que lanzar');
  const largo = sesion(Array.from({ length: 15 }, () => 'avanzar'), 'equipo-7', { mod: espesura });
  check((largo.estado.programa as string[]).length === 14, 'en la espesura caben 14 líneas');
  check(sesion(['si frente libre'], undefined, { mod: espesura }).ultimo.bloques[0].tipo === 'texto', 'y el brote ya entiende `si`');

  // Lo que ve cada puesto.
  const pe = ver('PANTALLA', uno.estado, 'equipo-7', espesura).marana;
  check(pe.mundo.celdas === null && pe.viaje.mundo.celdas === null && pe.titulo === 'LA ESPESURA', 'Pantalla: ningún plano viaja');
  const luz = [pe.viaje.luz0, ...pe.viaje.luz].flat();
  check(pe.viaje.brotes.length === 4 && pe.mundo.brotes.length === 4, '  salen cuatro brotes, y ve los cuatro semilleros');
  check(!dice(pe).includes('"*"'), '  las minas viajan como camino');
  check(pe.mundo.conocidas.length === luz.length, `  lo alumbrado se queda encendido (${pe.mundo.conocidas.length})`);
  const dd = ver('DATOS', uno.estado, 'equipo-7', espesura);
  check(dd.tablas.map((t: any) => t.id).join() === 'manual,crecimiento,minas,viajes,brote_1,brote_2,brote_3,brote_4',
    `Datos: manual, crecimiento, minas, viajes y una bitácora por brote`);
  check(dd.tablas.find((x: any) => x.id === 'manual').nuevas.length >= 3, '  y el manual trae lo nuevo marcado');
  const t = ver('TERMINAL', uno.estado, 'equipo-7', espesura);
  check(t.brote.varios === true && t.lamina.capas === 1, 'Terminal sabe que salen cuatro; el bonus tiene una sola capa');
}

// ============================================================
console.log('\n5) Lo que ve cada puesto en el seto');
{
  const s = setoDeMarana();
  const base = sesion(['repetir 3 veces', 'girar izquierda', 'avanzar', 'fin', 'lanzar'], undefined, { estado0: SETO }).estado;
  const p = ver('PANTALLA', base), d = ver('DATOS', base), t = ver('TERMINAL', base);
  check(!dice(p.marana.mundo.celdas).includes('*'), 'el plano de Pantalla no tiene espinas');
  check(!dice(p).includes('repetir') && !dice(p).includes('"l":'), '  ni el programa, ni qué línea va');
  const pasosD = d.programa.viaje.brotes[0].pasos;
  check(!dice(d).includes('"celdas"') && !dice(d.programa.viaje).includes('"f":'), 'Datos no ve el laberinto ni por dónde va el brote');
  check(pasosD.every((x: any) => typeof x.l === 'number'), '  pero sí qué línea da cada paso');
  check(pasosD.some((x: any) => x.v.length === 1 && x.v[0][0] === 0 && x.v[0][1] === 2), '  y en qué vuelta va el ciclo');
  check(!dice(t).includes('girar izquierda') && !dice(t).includes('celdas') && !dice(t).includes(casillaDe(s.espinas[0])),
    'Terminal no ve ni el programa, ni el seto, ni las espinas');
  check(t.brote.lineas === 4 && t.brote.abiertos === 0 && t.brote.max === 10, '  solo cuántas líneas lleva y cuántos bloques abiertos');
  const espinasDatos = d.tablas.find((x: any) => x.id === 'espinas').filas.map((f: string[]) => f[1]);
  check(dice(espinasDatos) === dice(s.espinas.map(casillaDe)), `Datos tiene las espinas (${espinasDatos.join(' ')})`);
  check(d.tablas.find((x: any) => x.id === 'manual').nuevas.length === 2, '  y el manual marca `repetir` y `fin` como nuevos');
  for (const rol of ['DATOS', 'PANTALLA', 'TERMINAL']) {
    const v = ver(rol, base);
    check(v.lamina?.capa === 2 && v.lamina?.capas === 2, `${rol} lleva la lámina en la capa 2`);
  }
  // El brote que cruzó el semillero se sigue viendo llegar.
  const transicion = ver('PANTALLA', sesion([...SEMILLERO('derecha', 'izquierda'), 'lanzar']).estado).marana;
  check(transicion.capa === 2 && transicion.viaje.capa === 1 && transicion.viaje.mundo.tipo === 'semillero'
    && transicion.mundo.tipo === 'seto', 'tras cruzar el semillero, el último viaje trae SU plano para verlo llegar');
  check(ver('DATOS', sesion([...SEMILLERO('derecha', 'izquierda'), 'lanzar']).estado).tablas.find((x: any) => x.id === 'brote').filas.length === 0,
    '  y la bitácora del seto empieza vacía');
}

// ============================================================
console.log('\n6) La bitácora, y lo que NO ve Pantalla');
{
  const pincha = sesion([...ESCALERA('avanza', 'izquierda', 'derecha'), 'lanzar'], undefined, { estado0: SETO });
  const d = ver('DATOS', pincha.estado);
  const bit = d.tablas.find((t: any) => t.id === 'brote');
  const pasos = (pincha.estado.ultimo as any).brotes[0].pasos.length;
  check(bit && bit.filas.length === pasos, `la tabla \`brote\` tiene un renglón por paso (${bit?.filas.length})`);
  check(bit.columnas.join() === 'id,lanzamiento,paso,linea,instruccion,vuelta,resultado', '  con la línea, la instrucción, la vuelta y el resultado');
  check(/piso la espina X\d/.test(bit.filas[bit.filas.length - 1][6]) && bit.filas[bit.filas.length - 1][6].includes('se desconecto'),
    `  y el último dice qué le pasó («${bit.filas[bit.filas.length - 1][6]}»)`);
  check(bit.filas.some((f: string[]) => /^linea 1: vuelta \d/.test(f[5])), `  la vuelta de cada ciclo, en palabras («${bit.filas[0][5]}»)`);
  const p = ver('PANTALLA', pincha.estado).marana.viaje;
  check(p.brotes[0].fin === 'desconectado' && !('contra' in p.brotes[0]), 'Pantalla solo sabe que se desconectó');
  check(!/espina|mina|contra|"ch"/.test(dice(ver('PANTALLA', pincha.estado).marana.viaje)), '  ni espina, ni mina, ni contra qué chocó en su cámara');
  const choca = sesion(['girar derecha', 'avanzar', 'lanzar'], undefined, { estado0: SETO });
  const pc = ver('PANTALLA', choca.estado).marana.viaje.brotes[0];
  check(pc.fin === 'desconectado' && pc.pasos[pc.pasos.length - 1][0] === 'x', '  un choque es, para Pantalla, el paso en que se desconecta');
  const bc = ver('DATOS', choca.estado).tablas.find((t: any) => t.id === 'brote').filas;
  check(bc[bc.length - 1][6].startsWith('choco contra una pared'), '  y en la bitácora dice que chocó');
  const quieto = ver('DATOS', sesion(['avanzar', 'lanzar']).estado).tablas.find((t: any) => t.id === 'brote').filas;
  check(quieto.length === 2 && quieto[1][6].startsWith('se quedo quieto'), '  quedarse sin programa también queda escrito');
}

console.log(fallos === 0 ? '\n✅ La Maraña y La Espesura OK\n' : `\n❌ ${fallos} fallos\n`);
process.exit(fallos === 0 ? 0 : 1);
