// Prueba de humo de las fases 2 a 6 (el recorrido de programación).
//
// Se prueban contra el módulo, no contra el socket: el cableado —permisos,
// reparto por rol, sellado de tiempos— ya lo cubren smoke.ts y
// smoke-fase1.ts, y repetirlo aquí cinco veces sería pagar treinta
// segundos de reloj por no aprender nada nuevo.
import { acceso, instanciaDeAcceso } from '../src/phases/acceso.js';
import { muro } from '../src/phases/muro.js';
import { nucleo } from '../src/phases/nucleo.js';
import { boveda, instanciaDeBoveda, solucionDeBoveda } from '../src/phases/boveda.js';
import { instanciaDeMente, mente } from '../src/phases/mente.js';
import { rastro } from '../src/phases/rastro.js';
import type { ModuloFase } from '../src/phases/types.js';

let fallos = 0;
const check = (ok: boolean, txt: string) => { console.log(`  ${ok ? '✔' : '✘'} ${txt}`); if (!ok) fallos++; };

const AHORA = Date.now();
const corredor = (m: ModuloFase) =>
  (texto: string, estado: Record<string, unknown> = {}): any =>
    m.ejecutar(texto, { estado, intentos: 0, ahora: AHORA, traficoActivo: false });

/** Encadena comandos arrastrando el estado, como haría un equipo. */
function sesion(m: ModuloFase, comandos: string[]) {
  let estado: Record<string, unknown> = {};
  let ultimo: any = null;
  for (const c of comandos) {
    ultimo = m.ejecutar(c, { estado, intentos: 0, ahora: AHORA, traficoActivo: false });
    if (ultimo.estado) estado = ultimo.estado;
  }
  return { estado, ultimo };
}

const dice = (r: any) => JSON.stringify(r).toLowerCase();

// ============================================================
console.log('\n1) El Reflejo · CONDICIONALES (embudo de filtros)');
{
  const corre = corredor(acceso);
  const ANTICUERPOS1 = ['liquen', 'esqueje', 'resina', 'corteza'];
  // Los resultados ya no salen en Pantalla: se leen de la ultima corrida
  // guardada en las tablas de Datos, como lo haria el equipo.
  const verDatos = (estado: Record<string, unknown>) =>
    acceso.proyectar('DATOS', { estado, salidas: [], traficoActivo: false, filtroTrafico: null }) as any;
  const tablaDe = (d: any, id: string) => d.tablas.find((t: any) => t.id === id);
  const ultima = (estado: Record<string, unknown>) => {
    const d = verDatos(estado);
    const corrida = tablaDe(d, 'corridas').filas[0];
    const nombreDe = (id: string) => tablaDe(d, 'programas').filas.find((f: string[]) => f[0] === id)[1];
    return {
      corrida,
      filtros: tablaDe(d, 'corrida_filtros').filas.filter((f: string[]) => f[1] === corrida[0]),
      filas: tablaDe(d, 'resultados').filas.filter((f: string[]) => f[1] === corrida[0])
        .map((f: string[]) => ({ nombre: nombreDe(f[2]), veredicto: f[3], filtro: f[4] })),
    };
  };
  const cae = (b: any, n: string) => b.filas.find((f: any) => f.nombre === n).veredicto === 'CAE';

  // Pantalla no puede saber nada de NINGUN programa: si supiera la firma
  // de corteza, escribiria el filtro sin hablar con Datos.
  const publico = ['ayuda', 'probar', 'estado'].map((c) => dice(corre(c).bloques)).join(' ');
  for (const dato of ['ausente', 'caducada', 'interno', 'binario', 'script', 'servicio']) {
    check(!publico.includes(dato), `ni la ayuda ni la simulacion filtran «${dato}»`);
  }
  check(!/espora nuestra|anticuerpo\./.test(publico), 'ni dicen que es cada programa: eso es del encargo');

  // El flujo arranca con la defensa de la pierna, que frena a las esporas.
  const flujo0 = corre('flujo').bloques[0];
  check(flujo0.filtros.length === 1 && flujo0.pierna[0] === true, 'el flujo arranca con una defensa de la pierna');
  const probado = corre('probar');
  check(probado.fallo !== true && probado.estado.corridaN === 1, '`probar` guarda la corrida R1 y no penaliza');
  check(!dice(probado.bloques).includes('brote') && !dice(probado.bloques).includes('pasan'),
    'y Pantalla no recibe ni nombres ni recuentos: solo que se guardo');
  const prueba = ultima(probado.estado);
  check(prueba.corrida[0] === 'R1' && prueba.corrida[2] === '7' && prueba.corrida[3] === '3',
    `la tabla corridas guarda el recuento (pasan ${prueba.corrida[2]}, caen ${prueba.corrida[3]})`);
  check(['brote', 'raiz', 'polen'].every((n) => cae(prueba, n)), 'la defensa deja fuera a las tres esporas');
  check(ANTICUERPOS1.every((n) => !cae(prueba, n)), 'y deja entrar a los cuatro anticuerpos');
  check(prueba.filtros.length === 1 && prueba.filtros[0][4] === 'pierna', 'corrida_filtros guarda el flujo y marca la defensa');
  check(prueba.filas.find((f: any) => f.nombre === 'brote').filtro === '1', 'resultados dice en que filtro cae cada uno');

  // Las trampas: condiciones demasiado anchas (sin la defensa delante).
  const ancha = (c: string) => ultima(sesion(acceso, ['quitar 1', `filtrar si ${c}`, 'probar']).estado);
  check(prueba.filas.length === 10, `la rotula se juega con diez programas (${prueba.filas.length})`);
  check(cae(ancha('firma != valida'), 'polen'), '«firma != valida» tira a polen, que es espora');
  check(dice(probado.bloques).includes('defensa de la pierna') && dice(probado.bloques).includes('quitar'),
    'al probar con la defensa puesta, se recuerda que es de la pierna y que se puede quitar');
  check(!dice(sesion(acceso, ['quitar 1', 'probar']).ultimo.bloques).includes('defensa de la pierna'),
    '  y sin ella, ya no se dice');
  check(cae(ancha('origen = externo'), 'brote'), '«origen = externo» tira a brote, que es espora');
  check(cae(ancha('permisos >= 4'), 'savia'), '«permisos >= 4» tira a savia, que es rutina');
  check(!cae(ancha('firma = ausente'), 'corteza'), 'y la firma sola no basta: corteza la tiene valida');
  const conY = ancha('origen = externo y permisos >= 3');
  const conO = ancha('origen = externo o permisos >= 3');
  check(cae(conY, 'corteza') && !cae(conY, 'brote'), '`y` estrecha: externo y potente');
  check(cae(conO, 'brote') && cae(conO, 'clorofila'), '`o` ensancha y se lleva de mas');

  // Desplegar mal cuesta; probar no.
  check(corre('desplegar').fallo === true, 'desplegar con la defensa intacta penaliza');
  check(sesion(acceso, ['probar', 'probar', 'probar']).ultimo.fallo !== true, 'probar es gratis, siempre');

  // El tope cuenta las defensas: nombrar a los cuatro no cabe.
  const tope = sesion(acceso, ['quitar 1', ...ANTICUERPOS1.map((n) => `filtrar si nombre = ${n}`)]);
  check(dice(tope.ultimo).includes('no admite mas de 3'), 'nombrar a los cuatro uno a uno no cabe en 3 filtros');
  // El camino amable: un solo rasgo por filtro, y nombrar a los que quedan.
  const simple = sesion(acceso, ['quitar 1', 'filtrar si firma = ausente', 'filtrar si nombre = esqueje',
    'filtrar si nombre = corteza', 'desplegar']);
  check(simple.estado.capa === 2, 'se cruza con un solo rasgo por filtro: firma = ausente y dos nombres');

  // La capa 1: quitar la defensa y dejar fuera a los anticuerpos.
  const CAPA1 = ['quitar 1', 'filtrar si permisos >= 3 y firma != valida', 'filtrar si origen = externo y permisos >= 3'];
  const bien = sesion(acceso, [...CAPA1, 'probar', 'desplegar']);
  check(bien.ultimo.resuelto !== true && bien.estado.capa === 2,
    'quitando la defensa y con dos filtros cae la capa 1, pero la fase sigue: empieza la muda');
  check(sesion(acceso, [CAPA1[1], CAPA1[2], 'desplegar']).ultimo.fallo === true,
    'sin quitar la defensa no basta: las esporas siguen fuera');
  const conNombre = sesion(acceso, ['quitar 1', 'filtrar si permisos >= 3 y firma != valida', 'filtrar si nombre = corteza', 'desplegar']);
  check(conNombre.estado.capa === 2, 'en la capa 1 se vale nombrar a alguno');

  // ---- Capa 2 · LA MUDA ----
  const f2 = conNombre.estado.filtros as any[];
  check(f2.length === 2 && f2[0].pierna === true && dice(conNombre.ultimo).includes('marchitos'),
    'la muda seca el filtro que nombraba a alguien y la pierna levanta otra defensa');
  check((bien.estado.filtros as any[]).length === 3, 'los que describian rasgos sobreviven, detras de la defensa nueva');
  check(dice(sesion(acceso, ['quitar 1', 'filtrar si permisos >= 3 y firma != valida', 'filtrar si nombre = corteza',
    'desplegar', 'filtrar si nombre = tallo']).ultimo).includes('ya no reconoce nombres'),
    'tras la muda `nombre` no vale, y se explica por que');
  const prueba2 = ultima(sesion(acceso, [...CAPA1, 'probar', 'desplegar', 'probar']).estado);
  check(prueba2.filas.length === 16, `tras la muda llegan seis programas mas: la muda sigue con dieciseis (${prueba2.filas.length})`);
  check(cae(prueba2, 'polen') && cae(prueba2, 'nectar'), 'la defensa nueva vuelve a frenar a dos esporas');
  check(cae(prueba2, 'micelio'), 'y el filtro ancho de la capa 1 tira a micelio, que es espora');
  check(!cae(prueba2, 'savia') && !cae(prueba2, 'tallo'), 'mientras savia y tallo, que ahora son anticuerpos, entran');
  check(prueba2.filtros.map((f: string[]) => f[4]).join() === 'pierna,equipo,equipo', 'la corrida distingue las defensas de la pierna');
  check(prueba2.corrida[0] === 'R2', 'las corridas siguen numerandose tras la muda');

  const capa2 = (extra: string[]) => sesion(acceso, [...CAPA1, 'desplegar', ...extra]);
  const arreglo = capa2(['quitar 1', 'quitar 2',
    'filtrar si origen = externo y permisos >= 3 y tipo = binario',
    'filtrar si tipo = driver y permisos < 3',
    'filtrar si tipo = servicio y permisos >= 4', 'desplegar']);
  check(arreglo.ultimo.resuelto === true, 'quitando la defensa nueva y afinando los filtros, la pierna cae');
  check((arreglo.ultimo.esperaVictoriaMs ?? 0) > 2000, 'y la cortinilla espera a que la membrana se rinda');
  check(capa2(['desplegar']).ultimo.fallo === true, 'desplegar en la muda sin tocar nada penaliza');
  check(cae(ultima(capa2(['quitar 1', 'filtrar si tipo = driver', 'probar']).estado), 'xilema'),
    '«tipo = driver» tira tambien a xilema, que es rutina');

  // Datos ve el flujo dibujado, el registro, el encargo y las corridas.
  const d0 = verDatos({});
  check(d0.flujo.filtros.length === 1 && d0.flujo.pierna[0] === true && d0.flujo.max === 3,
    'Datos ve el flujo con la defensa de la pierna marcada');
  check(tablaDe(d0, 'corridas').filas.length === 0, 'y sin ningun `probar`, las corridas estan vacias');
  let muchas = {} as Record<string, unknown>;
  for (let i = 0; i < 12; i++) muchas = acceso.ejecutar('probar', { estado: muchas, intentos: 0, ahora: AHORA, traficoActivo: false }).estado!;
  check(tablaDe(verDatos(muchas), 'corridas').filas.length === 10 && tablaDe(verDatos(muchas), 'corridas').filas[0][0] === 'R12',
    'se guardan las 10 ultimas corridas, la mas reciente arriba');
  check(tablaDe(d0, 'encargo').filas.filter((f: string[]) => f[2].includes('ESPORA')).length === 3, 'el encargo nombra a las tres esporas, por id');
  // Nadie lo tiene todo: Datos no sabe ni el origen ni la firma.
  check(!tablaDe(d0, 'programas').columnas.includes('origen') && !tablaDe(d0, 'firmas'),
    'Datos no tiene ni el origen ni las firmas: estan repartidos');
  check(!dice(d0.tablas).includes('caducada') && !dice(d0.tablas).includes('externo'),
    '  ni se cuelan en ninguna tabla');
  const sinAcotar = corre('firmas');
  check(dice(sinAcotar).includes('acota'), '`firmas` a secas no las suelta todas');
  const porTipo = corre('firmas tipo binario');
  check(dice(porTipo).includes('corteza') && dice(porTipo).includes('valida') && !dice(porTipo).includes('riego'),
    '`firmas tipo binario` da la firma de los binarios, y solo de ellos');
  check(dice(corre('firmas corteza')).includes('valida') && dice(corre('firmas p9')).includes('corteza'),
    'y se puede preguntar por nombre o por id');
  check(dice(corre('firmas tipo dragon')).includes('pregunta a datos'), 'un tipo que no existe se explica');
  const d2 = verDatos(conNombre.estado);
  check(d2.tablas[0].filas.length === 16 && d2.tablas[0].nuevas.join() === 'P4,P11,P13,P14,P15,P16',
    'tras la muda Datos recibe a los seis nuevos, marcados');
  check(tablaDe(d2, 'encargo').filas.some((f: string[]) => f[1] === 'P3' && f[2].includes('ANTICUERPO')),
    'y el encargo nuevo: savia se ha vuelto anticuerpo');
  check(d2.flujo.marchitos.join() === 'nombre = corteza', 'y ve el filtro que se seco');
  check(d2.lamina.capa === 2 && d2.lamina.capas === 2, 'la lamina sabe en que capa va');

  // El parser enseña, no gruñe.
  check(dice(corre('filtrar si tipo = script y permisos >= 2 o firma = ausente')).includes('no mezcles'),
    'mezclar `y` con `o` se explica en vez de rechazarse a secas');
  check(dice(corre('filtrar si origen > b')).includes('solo valen'), 'ordenar texto con > se explica');
  check(dice(corre('insertar 1 si firma = ausente entonces permitir')).includes('solo descartan'),
    'la sintaxis vieja de permitir se explica: en el embudo solo se descarta');
  check(!corre('quitar 9').fallo, 'quitar un filtro que no existe no penaliza');

  // ---- El circuito cerrado de la membrana ----
  const proy2 = (rol: any, estado: Record<string, unknown> = {}) =>
    acceso.proyectar(rol, { estado, intentos: 0, ahora: AHORA, traficoActivo: false, salidas: [] } as any) as any;

  const cam = proy2('PANTALLA').camaras;
  check(!!cam && cam.lista.length === 2 && cam.activa === 1, 'Pantalla ve la membrana por dos camaras');
  check(!dice(proy2('TERMINAL')).includes('ganglio') && !dice(proy2('TERMINAL')).includes('fotogramas'),
    'y la consola NO ve ninguna imagen: la cambia a ciegas');
  check(!dice(proy2('DATOS')).includes('ganglio'), 'Datos tampoco: el circuito es de Pantalla');

  const imagen = dice(proy2('PANTALLA').camaras);
  check(imagen.includes('corteza') && imagen.includes('pasa'), 'se ve que pasa, con su nombre');
  check(proy2('PANTALLA').camaras.vista.rotulos.length === 0, 'y sin numeros: ni cuantos pasan ni cuantos caen');
  check(imagen.includes('externo') && imagen.includes('viene de'), 'la camara SI dice de donde viene cada uno: es lo suyo');
  for (const dato of ['caducada', 'ausente', 'binario', 'driver', 'espora', 'anticuerpo']) {
    check(!imagen.includes(dato), `la camara no filtra «${dato}»: eso es del registro`);
  }

  const antes = proy2('PANTALLA').camaras.vista;
  const escrito = proy2('PANTALLA', sesion(acceso, CAPA1).estado).camaras.vista;
  check(antes.clave === escrito.clave, 'escribir filtros no cambia la camara: se ven al probar');
  const despues = proy2('PANTALLA', sesion(acceso, [...CAPA1, 'probar']).estado).camaras.vista;
  check(antes.clave !== despues.clave, 'con `probar` la fila cruza con los filtros nuevos');
  const otra = proy2('PANTALLA', sesion(acceso, [...CAPA1, 'probar', 'probar']).estado).camaras.vista;
  check(otra.clave !== despues.clave && otra.dibujo.corrida === despues.dibujo.corrida + 1,
    'y cada `probar` la vuelve a soltar, aunque los filtros no cambien');
  check(despues.fotogramas.some((f: string[]) => f.join('\n').includes('corteza') && f.join('\n').includes('ALTO')),
    'y se ve a corteza rebotar contra la membrana');
  check(despues.dibujo.tipo === 'membrana' && despues.dibujo.cola.length === 10, 'el dibujo trae la fila entera (diez en la rotula)');

  check(corre('camara 2').estado?.camara === 2, '`camara 2` cambia la camara');
  check(corre('camara interior').estado?.camara === 2, 'tambien vale por nombre');
  check(corre('camara siguiente', { camara: 2 }).estado?.camara === 1, '`siguiente` da la vuelta');
}

console.log('\n1b) El Reflejo · una version por equipo');
{
  const A = instanciaDeAcceso('equipo-a'), B = instanciaDeAcceso('equipo-b'), C = instanciaDeAcceso();
  const nombres = (i: any) => i.registro.map((p: any) => p.nombre).join();
  check(nombres(A) !== nombres(B) && nombres(A) !== nombres(C), 'cada equipo ve otros nombres y otro orden');
  check(instanciaDeAcceso('equipo-a') === A, 'y la misma semilla da siempre la misma version');
  check(C.registro[0].nombre === 'riego' && C.registro[0].id === 'P1', 'sin semilla, la version canonica');

  // La solucion canonica, traducida a la piel de cada mesa, tiene que
  // seguir resolviendo: misma fase, otras palabras.
  const traductor = (inst: any) => {
    const voz: Record<string, Record<string, string>> = { origen: {}, tipo: {}, firma: {} };
    const perm: Record<string, number> = {};
    for (const p of inst.registro) {
      const c = C.registro.find((q: any) => q.clave === p.clave)!;
      for (const k of ['origen', 'tipo', 'firma']) voz[k][(c as any)[k]] = (p as any)[k];
      perm[c.permisos] = p.permisos;
    }
    const invierte = perm[1] > perm[5];
    const gira: Record<string, string> = { '>=': '<=', '<=': '>=', '>': '<', '<': '>', '=': '=', '!=': '!=' };
    return (filtro: string) => filtro.replace(/(origen|tipo|firma|permisos) (!=|>=|<=|=|>|<) (\S+)/g, (_m, campo, op, valor) =>
      campo === 'permisos'
        ? `permisos ${invierte ? gira[op] : op} ${perm[Number(valor)] ?? (invierte ? 6 - Number(valor) + perm[5] - 1 : Number(valor) + perm[1] - 1)}`
        : `${campo} ${op} ${voz[campo][valor]}`);
  };
  for (const semilla of ['equipo-a', 'equipo-b', 'cmv6cbe7800ablxsha71r29tu']) {
    const t = traductor(instanciaDeAcceso(semilla));
    const jugar = (cmds: string[]) => {
      let estado: Record<string, unknown> = {};
      let ultimo: any = null;
      for (const c of cmds) {
        ultimo = acceso.ejecutar(c, { estado, intentos: 0, ahora: AHORA, traficoActivo: false, semilla });
        if (ultimo.estado) estado = ultimo.estado;
      }
      return ultimo;
    };
    const fin = jugar(['quitar 1', t('filtrar si permisos >= 3 y firma != valida'), t('filtrar si origen = externo y permisos >= 3'),
      'desplegar', 'quitar 1', 'quitar 2',
      t('filtrar si origen = externo y permisos >= 3 y tipo = binario'),
      t('filtrar si tipo = driver y permisos < 3'),
      t('filtrar si tipo = servicio y permisos >= 4'), 'desplegar']);
    check(fin.resuelto === true, `la solucion traducida resuelve la version de «${semilla.slice(0, 10)}»`);
    const sinTraducir = jugar(['quitar 1', 'filtrar si permisos >= 3 y firma != valida', 'filtrar si origen = externo y permisos >= 3', 'desplegar']);
    check(sinTraducir.fallo === true || sinTraducir.estado?.capa !== 2, '  y la solucion de otra mesa, copiada tal cual, no sirve');
  }
}

// ============================================================
console.log('\n3) Muro de Repeticion · CICLOS');
{
  const corre = corredor(muro);
  const ctx = (estado: Record<string, unknown> = {}) =>
    ({ estado, salidas: [], traficoActivo: false, filtroTrafico: null }) as any;
  const lab = (estado: Record<string, unknown> = {}) =>
    (muro.proyectar('PANTALLA', ctx(estado)) as any).laberinto;

  // El plano se IMPORTA. Retranscribirlo a mano ya me colo una barrera en
  // la columna equivocada una vez, y se pudo rodear.
  const { PLANO, BARRERAS, DUREZA } = await import('../src/phases/muro.js');
  const F = PLANO.length, C = PLANO[0].length;
  const SALIDA = `${F - 2},${C - 2}`;

  /** Pasos hasta la salida, o null si no hay. LA DISTANCIA, no cuantas
   *  casillas se alcanzan: sin rocas se alcanzan MAS casillas, asi que
   *  contarlas media justo lo contrario de lo que hay que medir. */
  const pasosHastaLaSalida = (rotas: Set<string>, rocas = true) => {
    const d = new Map([['1,1', 0]]); const q: [number, number][] = [[1, 1]];
    while (q.length) { const [r, c] = q.shift()!;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
        const [nr, nc] = [r + dr, c + dc];
        if (nr < 0 || nr >= F || nc < 0 || nc >= C || d.has(`${nr},${nc}`)) continue;
        const ch = PLANO[nr][nc];
        if (ch === '#') continue;
        if (ch === 'R' && rocas) continue;
        if (/[0-9]/.test(ch) && !rotas.has(ch)) continue;
        d.set(`${nr},${nc}`, d.get(`${r},${c}`)! + 1); q.push([nr, nc]); } }
    return d.get(SALIDA) ?? null;
  };
  const alcanza = pasosHastaLaSalida;
  const todas = new Set(BARRERAS.map((b: any) => String(b.numero)));

  check(F === 11 && C === 17, `el laberinto es de ${C}x${F} = ${C * F} casillas`);
  check(BARRERAS.length === 5, `con ${BARRERAS.length} barreras`);
  check(alcanza(todas) !== null, 'hay salida rodeando las rocas y rompiendolas todas');
  check(alcanza(new Set()) === null, 'y no la hay sin romper ninguna');

  // LA invariante de las barreras: cada una, POR SI SOLA, corta el paso.
  // Una que se pueda rodear no es una barrera que haya que destruir.
  const rodeables = BARRERAS.filter((b: any) =>
    alcanza(new Set([...todas].filter((n) => n !== String(b.numero)))) !== null);
  check(rodeables.length === 0,
    `las ${BARRERAS.length} son obligatorias${rodeables.length ? ` (se pueden rodear: ${rodeables.map((b: any) => b.numero)})` : ''}`);

  // Y las rocas tienen que obligar a rodear, o son decorado.
  const conRocas = pasosHastaLaSalida(todas), sinRocas = pasosHastaLaSalida(todas, false);
  check(conRocas! > sinRocas!,
    `las rocas alargan el camino de verdad (${sinRocas} pasos sin ellas, ${conRocas} con ellas)`);

  // ---- La niebla ----
  const tipos = (estado: Record<string, unknown> = {}) =>
    lab(estado).rejilla.flat().map((c: any) => c.tipo);
  check(!tipos().includes('roca'), 'al empezar no se ve NINGUNA roca');
  check(!tipos().includes('barrera'), 'ni ninguna barrera');
  check(!JSON.stringify(lab()).toLowerCase().includes('chapa'), 'ni se cuela la placa de ninguna');

  const mirado = sesion(muro, ['mirar']);
  check(dice(mirado.ultimo).includes('roca'), 'mirar desde la entrada encuentra la roca de al lado');
  check(tipos(mirado.estado).filter((t: string) => t === 'roca').length === 1, 'y solo esa');

  // `mirar` mide el PASILLO ENTERO, no la casilla de al lado. Ese numero es
  // el del ciclo, y sin el, con el reinicio por choque, nadie se atreveria
  // a escribir un `repetir` de mas de uno.
  const vista = (mirado.ultimo as any).bloques[0].filas as string[][];
  const libresAbajo = Number(vista.find((f) => f[0] === 'abajo')![1].split(' ')[0]);
  check(libresAbajo === 8, `mirar cuenta las casillas libres de cada pasillo (abajo: ${libresAbajo})`);
  check(vista.find((f) => f[0] === 'abajo')![2] === 'muro', 'y dice que hay al final');
  check(vista.find((f) => f[0] === 'derecha')![1].startsWith('0'), 'con la roca pegada, cero libres');

  // ---- Andar: el ciclo justo llega, uno mas te estrella ----
  const justo = sesion(muro, ['mirar', `repetir ${libresAbajo} veces mover abajo`]);
  check(JSON.stringify(justo.estado.pos) === '[9,1]', 'el ciclo con el numero que dijo mirar llega justo al final');
  check(!justo.ultimo.fallo, 'y no pasa nada');

  // ESTRELLARSE REINICIA. Es lo que hace obligatorio mirar.
  const choque = sesion(muro, ['mover derecha']);
  check(dice(choque.ultimo).includes('reinicio'), 'chocarse con una roca reinicia el laberinto');
  check(JSON.stringify(choque.estado.pos) === '[1,1]', 'y devuelve a la entrada');
  check(choque.estado.reinicios === 1, 'contando el reinicio');
  check(dice(sesion(muro, ['mover arriba']).ultimo).includes('reinicio'), 'contra un muro, igual');

  // El choque viaja con su sitio y su direccion. Sin eso, la pantalla solo
  // veria al corredor aparecer en la entrada sin saber por que, y no habria
  // forma de enseñar el golpe: cuando llega el estado, el servidor ya lo ha
  // devuelto a la salida.
  const ch = (choque.estado.choque as any);
  check(JSON.stringify(ch.desde) === '[1,1]', 'el choque dice DONDE fue');
  check(ch.hacia === 'derecha', 'y hacia donde');
  check(ch.contra.includes('ROCA'), 'y contra que');
  check(ch.n === 1, 'con un numero que sube en cada choque');
  const dosChoques = sesion(muro, ['mover derecha', 'mover derecha']);
  check((dosChoques.estado.choque as any).n === 2,
    'dos choques iguales seguidos se distinguen: si no, el segundo no se animaria');
  check(sesion(muro, ['mover derecha', 'mover abajo']).estado.choque === null,
    'y un movimiento bueno lo borra, para que la pantalla no lo repita');

  // Lo que SI se conserva: el plano. Sin eso el castigo dejaria de enseñar
  // para pasar a impedir.
  check((choque.estado.vistas as string[]).length > 0, 'pero el plano descubierto se conserva');
  const largo = sesion(muro, ['mirar', `repetir ${libresAbajo + 1} veces mover abajo`]);
  check(JSON.stringify(largo.estado.pos) === '[1,1]', 'un ciclo con una vuelta de mas tambien reinicia');
  check((largo.estado.vistas as string[]).length >= (mirado.estado.vistas as string[]).length,
    'y tampoco se pierde lo mirado');

  // Y reinicia de verdad: las barreras vuelven a estar en pie.
  const conBarrera = ['repetir 2 veces mover abajo', 'repetir 2 veces mover derecha', 'mover arriba', 'mirar'];
  const trasRomper = sesion(muro, [...conBarrera, 'repetir 120 veces golpear']);
  check((trasRomper.estado.rotas as number[]).length === 1, 'con una barrera rota...');
  const trasChocar = sesion(muro, [...conBarrera, 'repetir 120 veces golpear', 'mover izquierda']);
  check(((trasChocar.estado.rotas as number[]) ?? []).length === 0, '...un choque las levanta otra vez');

  check(dice(corre('mover ariba')).includes('no es una direccion'), 'una direccion mal escrita se explica');
  check(!corre('mover ariba').estado, 'y no mueve ni reinicia nada');

  const pas = justo.estado.paseo as number[][];
  check(pas.every((c: number[], i: number) =>
    i === 0 || Math.abs(c[0] - pas[i-1][0]) + Math.abs(c[1] - pas[i-1][1]) === 1),
    'el paseo que viaja a Pantalla es casilla a casilla, sin saltos');

  // ---- Golpear ----
  check(dice(corre('golpear')).includes('ninguna barrera al lado'), 'sin barrera al lado no se golpea');
  // Hasta la barrera 1, en (1,3): se llega a (2,3) y queda arriba.
  const junto = ['repetir 2 veces mover abajo', 'repetir 2 veces mover derecha', 'mover arriba', 'mirar'];
  const enSitio = sesion(muro, junto);
  check(JSON.stringify(enSitio.estado.pos) === '[2,3]', 'se llega a la casilla de al lado de la barrera 1');
  check(dice(enSitio.ultimo).includes('chapa'), 'y mirar desde ahi lee su placa');

  const b1 = BARRERAS[0] as any;
  const justos = b1.grosor * DUREZA[b1.material];
  check(sesion(muro, [...junto, `repetir ${justos + 1} veces golpear`]).ultimo.fallo === true, 'pasarse dispara la alarma');
  check(!sesion(muro, [...junto, `repetir ${justos - 20} veces golpear`]).ultimo.fallo, 'quedarse corto no penaliza');
  const rota1 = sesion(muro, [...junto, `repetir ${justos} veces golpear`]);
  check((rota1.estado.rotas as number[]).includes(1), `${b1.material} ${b1.grosor} x ${DUREZA[b1.material]} = ${justos} la tumba`);
  // Y el intento viaja con su direccion: sin eso, el acierto se queda sin animacion.
  check((rota1.estado.ultimo as any).hacia === 'arriba' && (rota1.estado.ultimo as any).barrera === 1,
    'el intento dice hacia donde fue el golpe y a que barrera');

  // ---- La partida entera ----
  {
    const DIR: [string, number, number][] = [['arriba',-1,0],['abajo',1,0],['izquierda',0,-1],['derecha',0,1]];
    const hacia = (desde: [number, number]) => {
      const prev = new Map<string, string>(); const d = new Map([[desde.join(), 0]]);
      const q: [number, number][] = [desde];
      while (q.length) { const [r, c] = q.shift()!;
        for (const [, dr, dc] of DIR) { const [nr, nc] = [r + dr, c + dc];
          const ch = PLANO[nr]?.[nc]; if (!ch || ch === '#' || ch === 'R' || d.has(`${nr},${nc}`)) continue;
          d.set(`${nr},${nc}`, d.get(`${r},${c}`)! + 1); prev.set(`${nr},${nc}`, `${r},${c}`); q.push([nr, nc]); } }
      if (!d.has(SALIDA)) return null;
      const out: [number, number][] = []; let cur = SALIDA;
      while (cur !== desde.join()) { out.push(cur.split(',').map(Number) as [number, number]); cur = prev.get(cur)!; }
      return out.reverse();
    };
    const orden = (n: number) => {
      const b = BARRERAS.find((x: any) => x.numero === n) as any;
      const g = b.grosor * DUREZA[b.material];
      return b.tandas ? `repetir ${b.tandas} tandas de ${g / b.tandas} golpes` : `repetir ${g} veces golpear`;
    };
    let est: Record<string, unknown> = {}; let ult: any = null; let n = 0;
    for (let i = 0; i < 160; i++) {
      const pos = (est.pos as [number, number]) ?? [1, 1];
      const r = hacia(pos); if (!r?.length) break;
      const [nf, nc] = r[0];
      const dir = DIR.find(([, dr, dc]) => pos[0] + dr === nf && pos[1] + dc === nc)![0];
      const ch = PLANO[nf][nc];
      const manda = (c: string) => { n++; ult = muro.ejecutar(c, { estado: est, intentos: 0, ahora: AHORA, traficoActivo: false }) as any; if (ult.estado) est = ult.estado; };
      if (/[0-9]/.test(ch) && !(((est.rotas as number[]) ?? []).includes(Number(ch)))) { manda('mirar'); manda(orden(Number(ch))); continue; }
      manda(`mover ${dir}`);
      if (ult.resuelto) break;
    }
    check(ult?.resuelto === true, `la fase se gana llegando a la salida (${n} comandos)`);
    check(((est.rotas as number[]) ?? []).length === BARRERAS.length, 'habiendo derribado las cinco barreras');
    check(!(ult?.fallo), 'sin comerse una alarma por el camino');
    check(((est.reinicios as number) ?? 0) === 0, 'y sin estrellarse ni una vez');
  }

  // ---- El reparto ----
  const datos = JSON.stringify(muro.proyectar('DATOS', ctx()));
  check(datos.includes('chapa') && datos.includes('30'), 'Datos tiene la dureza por unidad');
  check(!BARRERAS.some((b: any) => datos.includes(`grosor ${b.grosor}`)), 'pero no el grosor de ninguna barrera');
  const term = JSON.stringify(muro.proyectar('TERMINAL', ctx(enSitio.estado)));
  check(!term.toLowerCase().includes('chapa'), 'Terminal no ve la placa ni despues de mirarla');
  check(!dice(corre('ayuda')).includes('chapa'), 'y la ayuda no lleva materiales dentro');
}

console.log('\n4) Nucleo Modular · FUNCIONES DEPENDIENTES');
{
  const corre = corredor(nucleo);
  const ctx = (estado: Record<string, unknown> = {}) =>
    ({ estado, salidas: [], traficoActivo: false, filtroTrafico: null }) as any;

  // 1. Asimetría de roles
  const vacio = ctx();
  const term = JSON.stringify(nucleo.proyectar('TERMINAL', vacio));
  check(!term.includes('resultados') && !term.includes('carpetas'),
    'Terminal no recibe tablas ni arbol de codigo');
  check(!term.includes('sondear') && !term.includes('armar') && !term.includes('enganar'),
    'ni la lista de comandos: los comandos se los tiene que cantar Pantalla tras `ayuda`');

  const pant: any = nucleo.proyectar('PANTALLA', vacio);
  check(pant.codigo.carpetas.length === 3, 'Pantalla ve las 3 carpetas (nucleo, medio, base)');
  check(pant.codigo.abierta === null, 'al inicio no hay ningun documento abierto');
  const pantAbierta: any = nucleo.proyectar('PANTALLA', ctx(sesion(nucleo, ['abrir reactor']).estado));
  check(pantAbierta.codigo.abierta.lineas.some((l: any) => l.texto.includes('[ ??? ]')),
    'y al abrir una pieza sin armar muestra [ ??? ] (sin revelar codigo ni comprobaciones)');

  const datosP1: any = nucleo.proyectar('DATOS', vacio);
  check(datosP1.tablas.length === 3, 'en Parte 1 Datos recibe solo 3 tablas (funciones, resultados, tolerancias)');
  check(!JSON.stringify(datosP1).includes('parche_emergencia'),
    'y la 4a tabla (parche_emergencia) NO aparece en Parte 1');
  check(!JSON.stringify(datosP1).includes('nucleo/') && !JSON.stringify(datosP1).includes('medio/'),
    'y Datos no sabe en que carpeta vive cada funcion ni que comprobaciones tiene el codigo');

  const ayudaTxt = dice(corre('ayuda')).toLowerCase();
  const nombresReales = ['carga', 'pulso', 'freno', 'presion', 'valvula', 'flujo', 'reactor', 'escudo', 'latido'];
  check(nombresReales.every((n) => !ayudaTxt.includes(n)),
    'la ayuda no filtra el nombre de ninguna de las funciones');

  // 2. Sondeo y armado (Descompilación del código y sus comprobaciones)
  const sCarga = dice(corre('sondear carga 5'));
  check(sCarga.includes('10') && sCarga.includes('1 nivel'),
    'sondear carga 5 devuelve 10 y profundidad 1 nivel (base)');
  const sReactor = dice(corre('sondear reactor 5'));
  check(sReactor.includes('30') && sReactor.includes('3 niveles'),
    'sondear reactor 5 devuelve 30 y profundidad 3 niveles (nucleo -> medio -> base)');

  // No se puede engañar a ciegas ni modificar funciones maestras de nucleo/
  check(dice(corre('enganar carga n * 3')).includes('primero descubre'),
    'enganar carga n * 3 falla si carga aun no ha sido armada');
  check(dice(corre('enganar reactor x + 10')).includes('firma sellada'),
    'las funciones maestras de nucleo/ tienen la firma sellada y no se pueden editar');

  // Armar requiere coincidencia con el comportamiento real y revela las comprobaciones en Pantalla
  check(dice(corre('armar carga n + 99')).includes('no coincide'),
    'armar carga n + 99 falla sin penalizar si no coincide con el robot');
  const armaPresion = sesion(nucleo, ['armar presion llama carga luego x + 5']);
  check((armaPresion.estado.armadas as any)?.presion === true,
    'armar presion llama carga luego x + 5 confirma y descompila presion.fn');
  const pantPresion: any = nucleo.proyectar('PANTALLA', ctx(armaPresion.estado));
  check(JSON.stringify(pantPresion.codigo.abierta.lineas).includes('tope 12'),
    'al armar presion, Pantalla ve en el codigo la comprobacion `si x > 12 -> bloquear`');

  // 3. Parte 1 · Malas prácticas y validaciones en cadenas independientes:
  const bloqueoM1 = sesion(nucleo, [
    'armar carga n * 2',
    'enganar carga n * 5', // carga(5) = 25 > 12 -> bloqueado por presion
    'probar',
  ]);
  check(dice(bloqueoM1.ultimo).includes('presion rechazo el retorno de carga'),
    'Parte 1 (M1): sabotear `carga` por encima de 12 es bloqueado por la comprobacion de `presion`');

  const bloqueoM2 = sesion(nucleo, [
    'armar valvula llama pulso luego x - 3',
    'enganar valvula x + 15', // alteración detectada por escudo
    'probar',
  ]);
  check(dice(bloqueoM2.ultimo).includes('escudo detecto alteracion en valvula'),
    'Parte 1 (M2): sabotear `valvula` es bloqueado por la comprobacion de integridad de `escudo`');

  const bloqueoM3 = sesion(nucleo, [
    'armar flujo llama freno luego x * 3',
    'enganar flujo x + 20', // 23 != freno(5)*3 (9) -> bloqueado por latido
    'probar',
  ]);
  check(dice(bloqueoM3.ultimo).includes('latido detecto desfase entre flujo'),
    'Parte 1 (M3): sabotear `flujo` es bloqueado por `latido` al comparar contra `freno(n) * 3`');

  // Límite superior (fusible_corte): poner números gigantes quema el fusible
  const quemaFusible = sesion(nucleo, [
    'armar presion llama carga luego x + 5',
    'armar pulso n * 3',
    'armar freno n - 2',
    'enganar presion x * 20',
    'enganar pulso n * 20',
    'enganar freno n * 20',
    'ejecutar',
  ]);
  check(quemaFusible.ultimo.fallo === true && dice(quemaFusible.ultimo).includes('fusible quemado'),
    'sobrepasar fusible_corte quema el fusible de emergencia y penaliza');

  // Superar la Parte 1 saboteando presion, pulso y freno pasa a la Parte 2:
  const cmdsParte1 = [
    'armar presion llama carga luego x + 5',
    'armar pulso n * 3',
    'armar freno n - 2',
    'enganar presion x + 12',
    'enganar pulso n + 27',
    'enganar freno n + 4',
    'ejecutar',
  ];
  const pasoParte2 = sesion(nucleo, cmdsParte1);
  check(pasoParte2.estado.parte === 2 && pasoParte2.ultimo.resuelto !== true,
    'explotar las 3 dependencias sin comprobacion (presion, pulso y freno) supera la Parte 1 y activa la Parte 2');

  // 4. Parte 2 · El Parche de Emergencia y la Dependencia Compartida (`carga` acoplada a M1 y M3):
  const enParte2 = pasoParte2.estado;
  const datosP2: any = nucleo.proyectar('DATOS', ctx(enParte2));
  check(datosP2.tablas.length === 4 && JSON.stringify(datosP2).includes('parche_emergencia'),
    'al pasar a la Parte 2 aparece la 4a tabla (parche_emergencia) en Datos');

  // En Parte 2 los huecos de la Parte 1 (`presion`, `pulso`, `freno`) ahora son bloqueados por el parche:
  const bloqueoP2 = sesion(nucleo, [
    ...cmdsParte1,
    'enganar presion x + 12',
    'enganar pulso n + 27',
    'enganar freno n + 4',
    'probar',
  ]);
  const txtBloqueoP2 = dice(bloqueoP2.ultimo);
  check(
    txtBloqueoP2.includes('reactor detecto alteracion en presion') &&
    txtBloqueoP2.includes('valvula rechazo el retorno de pulso') &&
    txtBloqueoP2.includes('flujo rechazo el retorno de freno'),
    'en Parte 2 el parche bloquea los 3 huecos viejos (presion, pulso > 20 y freno > 5)',
  );

  // En Parte 2, al subir `carga` para romper M1 (ej. `carga(5) = 20`), `flujo` en M3 suma `freno(5) + carga(5) = 23`
  // y si no se compensa `flujo`, M3 se dispara a `23 * 3 - 4 = 65` (quemando el fusible de M3 >= 34):
  const efectoDominó = sesion(nucleo, [
    ...cmdsParte1,
    'armar carga n * 2',
    'armar valvula llama pulso luego x - 3',
    'enganar carga n * 4',      // M1: carga=20 -> presion=25 -> reactor=50 (40<50<54 OK), pero M3: x=3+20=23 -> flujo=69 -> latido=65 (FUSIBLE!)
    'enganar valvula x + 12',   // M2: pulso=18 -> valvula=30 -> escudo=36 (30<36<44 OK)
    'ejecutar',
  ]);
  check(efectoDominó.ultimo.fallo === true && dice(efectoDominó.ultimo).includes('65 >= 34'),
    'Parte 2 (Dependencia compartida): subir `carga` en M1 infla tambien a M3 y quema el fusible de M3 si no se ajusta `flujo`');

  // Victoria en Parte 2: usando los mismos comandos (`enganar`) sobre `carga`, `valvula` y compensando `flujo`:
  const winParte2 = sesion(nucleo, [
    ...cmdsParte1,
    'armar carga n * 2',
    'armar valvula llama pulso luego x - 3',
    'armar flujo llama freno luego x * 3',
    'enganar carga n * 4',      // M1: carga(5)=20 -> presion(5)=25 -> reactor(5)=50 (40 < 50 < 54)
    'enganar valvula x + 12',   // M2: pulso(6)=18 -> valvula(6)=30 -> escudo(6)=36 (30 < 36 < 44)
    'enganar flujo x + 4',      // M3: recibe x = freno(5)+carga(5) = 3+20 = 23 -> flujo(5)=27 -> latido(5)=23 (20 < 23 < 34)
    'ejecutar',
  ]);
  check(winParte2.ultimo.resuelto === true,
    'Parte 2: sabotear `carga`, `valvula` y compensar el acoplamiento en `flujo` colapsa los 3 subsistemas y gana la fase');

  // 5. Semilla dinámica por equipo y rotación al pasar a Parte 2
  const datosEquipoA = JSON.stringify(nucleo.proyectar('DATOS', ctx({ semilla: 1 })));
  const datosEquipoB = JSON.stringify(nucleo.proyectar('DATOS', ctx({ semilla: 5 })));
  check(datosEquipoA !== datosEquipoB,
    'dos equipos con distinta semilla reciben ventanas distintas en la tabla tolerancias');
  const pasoConSemilla = nucleo.ejecutar('ejecutar', {
    estado: {
      semilla: 1,
      armadas: { presion: true, pulso: true, freno: true },
      // Para semilla=1 (d1=1: 52..66, d2=0: 30..44, d3=0: 20..34)
      enganos: { presion: 'x + 18', pulso: 'n + 27', freno: 'n + 4' },
    },
    intentos: 0, ahora: AHORA, traficoActivo: false,
  }) as any;
  check(pasoConSemilla.estado?.parte === 2 && pasoConSemilla.estado?.semilla !== 1,
    'al pasar a la Parte 2 la semilla rota a nuevas ventanas de tolerancia');

  // 6. Reiniciar conserva lo armado y limpia los sabotajes
  const rReset = sesion(nucleo, ['armar pulso n * 3', 'enganar pulso n * 5', 'reiniciar']);
  check(Object.keys(rReset.estado.enganos as any).length === 0, 'reiniciar limpia los sabotajes activos');
  check((rReset.estado.armadas as any)?.pulso === true, 'pero conserva las piezas armadas');
}

console.log('\n5) La Boveda de los Recuerdos · BASES DE DATOS');
{
  const corre = corredor(boveda);
  for (const semilla of ['equipo-1', 'equipo-2']) {
    const inst = instanciaDeBoveda(semilla);
    const sol = solucionDeBoveda(inst);
    let estado: Record<string, unknown> = {};
    const paso = (q: string) => {
      const r = boveda.ejecutar(q, { estado, intentos: 0, ahora: AHORA, traficoActivo: false, semilla });
      if (r.estado) estado = r.estado;
      return r;
    };
    const ayudaTxt = dice(paso('ayuda'));
    check(!ayudaTxt.includes(inst.objetivo1.toLowerCase()) && ayudaTxt === dice(corre('ayuda')),
      `[${semilla}] la ayuda no lleva la respuesta y es la misma para todos: el encargo es de Datos`);
    check(dice(paso('contar en recuerdos')).includes('1000 recuerdos'), '  la boveda guarda mil recuerdos');
    const e = inst.embudo;
    const n = (q: string) => Number(dice(paso(q)).match(/(\d+) recuerdos de/)![1]);
    const c1 = n(`contar en recuerdos donde lugar = ${e.lugar}`);
    const c2 = n(`contar en recuerdos donde lugar = ${e.lugar} y ( emocion = ${e.emociones[0]} o emocion = ${e.emociones[1]} )`);
    const c3 = n(`contar en recuerdos donde lugar = ${e.lugar} y ( emocion = ${e.emociones[0]} o emocion = ${e.emociones[1]} ) y año > ${e.desde}`);
    check(c1 < 1000 && c2 < c1 && c3 < c2, `  el embudo estrecha (1000 → ${c1} → ${c2} → ${c3})`);
    const mezcla = paso(`contar en recuerdos donde lugar = ${e.lugar} y emocion = ${e.emociones[0]} o emocion = ${e.emociones[1]} y año > ${e.desde} y intensidad >= ${e.intensidad}`);
    check(dice(mezcla).includes('parentesis') && Number(dice(mezcla).match(/(\d+) recuerdos de/)![1]) > 1,
      '  mezclar y con o sin parentesis da otra cosa, y la boveda lo avisa');
    check(dice(paso('buscar en recuerdos donde lugar = patio')).includes('demasiados'), '  pedir demasiadas filas manda a estrechar');
    check(paso('contar en recuerdos unir personas').bloques[0].tipo === 'error', '  en la capa 1 no se puede unir todavia');
    const una = paso(sol.capa1);
    check(una.bloques[0].filas?.length === 1 && una.bloques[0].filas[0][0] === inst.objetivo1, '  la consulta del encargo deja exactamente uno');
    check(dice(una).includes('select * from recuerdos where'), '  y Pantalla ve su traduccion a SQL');
    const otro = inst.objetivo1 === 'R-0001' ? 'R-0002' : 'R-0001';
    check(paso(`abrir ${otro}`).fallo === true, '  abrir el recuerdo equivocado pone la boveda en cuarentena');
    estado = { ...estado, cuarentenaHasta: 0 };
    check(paso(`abrir ${inst.objetivo1}`).estado?.capa === 2, '  y el del encargo abre la capa 2');
    // Capa 2
    check(dice(paso('contar en recuerdos donde oficio = visita')).includes('unir'), '  filtrar por una columna de personas explica que hay que unir');
    const trampa = paso(`contar en recuerdos unir personas donde tipo = ${inst.compartido.tipo} agrupar por persona_id`);
    check(trampa.bloques[0].filas[0][0] === inst.trampa, '  sin filtrar por oficio, gana la persona trampa');
    const grupos = paso(sol.grupos);
    const elegida = inst.personas.find((p) => p.id === inst.elegida)!;
    check(grupos.bloques[0].filas[0][0] === elegida.nombre && grupos.bloques[0].filas[0][1] !== grupos.bloques[0].filas[1]?.[1],
      '  agrupando con el oficio, gana la elegida, sin empate');
    const top = paso(sol.capa2);
    check(top.bloques[0].filas[0][0] === inst.objetivo2, '  ordenar y limitar dan su recuerdo mas intenso');
    check(paso(`abrir ${inst.objetivo2}`).resuelto === true, '  y abrirlo resuelve la fase');
  }
  check(instanciaDeBoveda('equipo-1').objetivo1 !== instanciaDeBoveda('equipo-2').objetivo1, 'cada equipo tiene otra respuesta');
  check(dice(corre('volar')).includes('no reconocido'), 'un comando inventado se explica');
}

// ============================================================
console.log('\n6) El Asalto a la Mente · APIS · la final');
{
  for (const semilla of ['equipo-1', 'equipo-2']) {
    const inst = instanciaDeMente(semilla);
    let estado: Record<string, unknown> = {};
    let reloj = AHORA;
    const paso = (q: string, dt = 3000) => {
      reloj += dt;
      const r = mente.ejecutar(q, { estado, intentos: 0, ahora: reloj, traficoActivo: false, semilla });
      if (r.estado) estado = r.estado;
      return r;
    };
    const codigo = (r: any) => Number(String(r.bloques[0]?.titulo ?? '').split(' ')[0]);
    check(!dice(paso('ayuda')).includes(inst.clave), `[${semilla}] la ayuda no lleva la clave`);
    check(paso('enviar get /mente/nada').bloques[0].tipo !== 'error' && codigo(paso('enviar get /mente/nada')) === 404, '  404 cuando la ruta no existe, y no rebota: la mente contesto');
    check(codigo(paso('enviar get /mente/sesion')) === 405, '  405 con el metodo equivocado');
    check(codigo(paso('enviar post /mente/sesion')) === 422, '  422 si falta la clave');
    check(codigo(paso('enviar post /mente/sesion cuerpo clave=otra')) === 401, '  401 con la clave equivocada');
    check(codigo(paso('enviar get /mente/procesos')) === 401, '  401 sin token');
    check(codigo(paso('enviar get /mente/procesos cabecera token=tk-000000')) === 403, '  403 con un token que no vale');
    check(paso('enviar volar /x').bloques[0].tipo === 'error', '  un metodo inventado no es una peticion: rebota');
    const ses = paso(`enviar post /mente/sesion cuerpo clave=${inst.clave}`);
    const token = dice(ses).match(/tk-[0-9a-f]{6}/)![0];
    check(codigo(ses) === 200, '  la clave de Datos da un token');
    const lista = dice(paso(`enviar get /mente/procesos cabecera token=${token}`));
    check(inst.procesos.every((x) => lista.includes(x.id)), '  GET /mente/procesos lista las cinco facultades con su id');
    const blindado = inst.procesos.find((x) => x.blindaje > 0)!;
    check(codigo(paso(`enviar delete /mente/procesos/${blindado.id} cabecera token=${token}`)) === 422, '  422 si la facultad tiene blindaje y falta la fuerza');
    check(codigo(paso(`enviar delete /mente/procesos/${blindado.id} cabecera token=${token} cuerpo fuerza=1`)) === 422, '  y si no alcanza');
    // El límite de ritmo.
    const antes = estado;
    for (let k = 0; k < 4; k++) paso(`enviar get /mente/procesos cabecera token=${token}`, 200);
    const lim = paso(`enviar get /mente/procesos cabecera token=${token}`, 200);
    check(codigo(lim) === 429, '  429 si se le bombardea');
    paso('enviar get /mente/procesos', 200);
    paso('enviar get /mente/procesos', 200);
    const harta = mente.ejecutar('enviar get /mente/procesos', { estado, intentos: 0, ahora: reloj + 200, traficoActivo: false, semilla });
    check(!!harta.contraataque, '  y si insisten tres veces durante el cierre, contraataca');
    estado = antes; reloj += 10_000;
    // Las cinco, una por una.
    for (const x of inst.procesos) paso(`enviar delete /mente/procesos/${x.id} cabecera token=${token}${x.blindaje ? ` cuerpo fuerza=${x.blindaje}` : ''}`);
    check(estado.capa === 2, '  cinco facultades destruidas abren la capa 2');
    check((mente.proyectar('PANTALLA', { estado, salidas: [], traficoActivo: false, filtroTrafico: null, semilla }) as any).animo.perdidas.length === 5,
      '  y el animo de la maquina sabe lo que perdio');
    // La voluntad.
    let tok = token;
    check(codigo(paso(`enviar delete /mente/nucleo cabecera token=${tok} cuerpo fuerza=25`)) === 423, '  423 con el escudo arriba');
    const golpear = () => {
      const reto = dice(paso(`enviar get /mente/nucleo/reto cabecera token=${tok}`)).match(/"reto\\?": ?\\?"([0-9a-f]{4})/)![1];
      paso(`enviar patch /mente/nucleo cabecera token=${tok} cuerpo escudo=abajo reto=${reto}`, 1000);
      return paso(`enviar delete /mente/nucleo cabecera token=${tok} cuerpo fuerza=25`, 1000);
    };
    check(codigo(paso(`enviar patch /mente/nucleo cabecera token=${tok} cuerpo escudo=abajo reto=zzzz`)) === 400, '  400 con un reto que no es el vigente');
    const contras: number[] = [];
    let ultimo: any = null;
    for (let k = 0; k < 4; k++) {
      ultimo = golpear();
      if (ultimo.contraataque) {
        contras.push(ultimo.contraataque.roles.length);
        check(codigo(paso(`enviar get /mente/nucleo cabecera token=${tok}`)) === 403, `  tras el contraataque ${contras.length}, el token ya no vale`);
        tok = dice(paso(`enviar post /mente/sesion cuerpo clave=${inst.clave}`)).match(/tk-[0-9a-f]{6}/)![0];
      }
      reloj += 10_000;
    }
    check(contras.join(',') === '1,2,3', `  contraataca a 1, 2 y 3 puestos al cruzar 75, 50 y 25 (${contras.join(',')})`);
    check(ultimo.resuelto === true && estado.resuelta === true, '  el cuarto golpe apaga la mente y gana la final');
  }
  check(instanciaDeMente('equipo-1').clave !== instanciaDeMente('equipo-2').clave
    || instanciaDeMente('equipo-1').procesos[0].id !== instanciaDeMente('equipo-2').procesos[0].id, 'cada equipo tiene su mente');
}

// ============================================================
//  El circuito cerrado, fase por fase.
//
//  Lo que se comprueba aqui no es el dibujo —eso se mira— sino las dos
//  reglas que hacen que una camara sea parte del juego y no un adorno:
//  que SOLO la ve Pantalla, y que no canta nada que sea de otra estacion.
console.log('\n7) Circuito cerrado de todas las fases');
{
  const conCamaras: [string, ModuloFase, number, string[]][] = [
    // fase · modulo · cuantas camaras · lo que NO puede aparecer en la imagen
    ['Fase 1 · El Reflejo', acceso, 2, ['caducada', 'ausente', 'binario', 'anticuerpo']],
    ['Fase 4 · Nucleo Modular', nucleo, 2, ['v * f', 'n * 2', 'n - 1', '12', '24']],
    ['Fase 7 · El Rastro', rastro, 2, ['9f2ae1', 'pruebas-07', 'nomina-02']],
  ];

  for (const [nombre, modulo, cuantas, prohibido] of conCamaras) {
    const ver = (rol: any, estado: Record<string, unknown> = {}) =>
      modulo.proyectar(rol, {
        estado, intentos: 0, ahora: AHORA, traficoActivo: false, filtroTrafico: null, salidas: [],
      } as any) as any;

    const cams = ver('PANTALLA').camaras;
    check(!!cams && cams.lista.length === cuantas,
      `${nombre}: Pantalla recibe ${cams?.lista?.length ?? 0} camaras`);
    check(!dice(ver('TERMINAL')).includes('fotogramas') && !dice(ver('DATOS')).includes('fotogramas'),
      '  y ni la consola ni Datos ven una sola imagen');

    // Mismo lienzo en todas: el cliente pinta las seis fases con el mismo
    // monitor, y un fotograma de otro alto le hace dar un salto a la caja.
    const medidas = new Set<string>();
    let imagen = '';
    for (let k = 1; k <= cuantas; k++) {
      const v = ver('PANTALLA', { camara: k }).camaras.vista;
      imagen += dice(v);
      for (const f of v.fotogramas) medidas.add(`${f.length}x${Math.max(...f.map((l: string) => l.length))}`);
    }
    check(medidas.size === 1 && [...medidas][0] === '15x36',
      `  todos los fotogramas miden 15x36 (${[...medidas].join(', ')})`);

    // Lo que la camara NO puede cantar. Cada fase tiene su lista y son
    // siempre datos de OTRA estacion o la propia respuesta del reto.
    const filtra = prohibido.filter((x) => imagen.includes(x));
    check(filtra.length === 0, `  no filtra nada de otra estacion (${prohibido.length} comprobados)`);

    // El mando es de la consola, y mirar nunca penaliza.
    const corre1 = corredor(modulo);
    check(corre1('camara 2').estado?.camara === 2, '  `camara 2` cambia la camara');
    check(corre1('camara 2').fallo !== true, '  y mirar no penaliza');
    check(dice(corre1('camaras')).includes('sector'), '  `camaras` las lista con su sector');
    check(corre1('camara 99').estado === undefined, '  una que no existe no toca el estado');
    check(dice(corre1('ayuda')).includes('camara'), '  y la ayuda las menciona');
  }

  // La 3 se queda fuera a proposito: ya tiene su propia imagen, el
  // laberinto, y meterle una camara encima seria taparlo.
  const f3 = muro.proyectar('PANTALLA', {
    estado: {}, intentos: 0, ahora: AHORA, traficoActivo: false, filtroTrafico: null, salidas: [],
  } as any) as any;
  check(f3.camaras === undefined && !!f3.laberinto,
    'Fase 3 · Muro: sin camara, porque el laberinto YA es su imagen');
}

console.log(fallos === 0 ? '\n✅ Fases 1-6 OK\n' : `\n❌ ${fallos} fallos\n`);
process.exit(fallos === 0 ? 0 : 1);
