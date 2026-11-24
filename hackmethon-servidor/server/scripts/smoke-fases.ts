// Prueba de humo de las fases 2 a 6 (el recorrido de programación).
//
// Se prueban contra el módulo, no contra el socket: el cableado —permisos,
// reparto por rol, sellado de tiempos— ya lo cubren smoke.ts y
// smoke-fase1.ts, y repetirlo aquí cinco veces sería pagar treinta
// segundos de reloj por no aprender nada nuevo.
import { acceso } from '../src/phases/acceso.js';
import { muro } from '../src/phases/muro.js';
import { nucleo } from '../src/phases/nucleo.js';
import { boveda } from '../src/phases/boveda.js';
import { puente } from '../src/phases/puente.js';
import { rastro } from '../src/phases/rastro.js';
import { enemigo } from '../src/phases/enemigo.js';
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
console.log('\n1) Control de Acceso · CONDICIONALES');
{
  const corre = corredor(acceso);

  // La mitad de Pantalla no puede saber nada de NADIE: si supiera el
  // turno de t.medina, escribiria la regla sin hablar con Datos.
  const publico = ['ayuda', 'reglas', 'probar', 'estado'].map((c) => dice(corre(c))).join(' ');
  const NOMBRES = ['r.solis', 'n.vega', 'p.arriaga', 'l.bermudez', 'e.quiroz', 't.medina', 'g.pastor'];
  check(!/ayuda|reglas/.test('') && NOMBRES.every((n) => !dice(corre('ayuda')).includes(n)),
    'la ayuda no nombra a nadie del padron');
  check(!dice(corre('reglas')).match(/t\.medina/), 'el reglamento tampoco');
  check(!publico.includes('noche') && !publico.includes('almacen'),
    'y en ningun sitio se filtra el turno ni el departamento de nadie');

  // `probar` sí lista a todo el mundo —es lo que el portero hace a la
  // vista— pero solo con su veredicto, nunca con sus datos.
  const prueba = corre('probar').bloques[0];
  check(prueba.columnas.join(',') === 'usuario,veredicto,decidido por,objetivo',
    'la simulacion enseña veredictos, no atributos');
  const base = Object.fromEntries(prueba.filas.map((f: string[]) => [f[0], f[1]]));
  check(base['e.quiroz'] === 'DENEGADO',
    'e.quiroz es nivel 5 y NO entra: la regla 1 decide antes de que la 2 mire el nivel');
  check(base['t.medina'] === 'DENEGADO' && prueba.filas.find((f: string[]) => f[0] === 't.medina')[3] === 'NO',
    'y el infiltrado es el unico que no cuadra con el objetivo');

  // LA leccion: una regla detras de la que ya decidio no corre nunca.
  const alFinal = sesion(acceso, ['insertar 4 si turno = noche entonces permitir', 'probar']);
  check(dice(alFinal.ultimo).includes('fuera de sitio'), 'una regla puesta al final no cambia nada');

  // Y una condicion demasiado ancha se lleva por delante a quien no debia.
  const ancha = sesion(acceso, ['insertar 1 si nivel = 1 entonces permitir', 'probar']);
  const anchaTabla = ancha.ultimo.bloques[0];
  check(anchaTabla.filas.find((f: string[]) => f[0] === 'l.bermudez')[1] === 'PERMITIDO',
    'una condicion demasiado ancha cuela tambien a l.bermudez');
  check(dice(ancha.ultimo).includes('l.bermudez'), 'y la simulacion lo canta antes de desplegar');

  // Desplegar mal cuesta; probar no.
  const malDesplegado = sesion(acceso, ['insertar 1 si nivel = 1 entonces permitir', 'desplegar']);
  check(malDesplegado.ultimo.fallo === true, 'desplegar con veredictos alterados penaliza');
  check(sesion(acceso, ['probar', 'probar', 'probar']).ultimo.fallo !== true, 'probar es gratis, siempre');

  // La solucion. No es la unica, y eso es correcto: se juzga el
  // comportamiento del reglamento, no como se escribio.
  const bien = sesion(acceso, ['insertar 1 si turno = noche entonces permitir', 'probar', 'desplegar']);
  check(bien.ultimo.resuelto === true, 'la regla correcta, en la posicion correcta, abre la puerta');
  const otra = sesion(acceso, ['insertar 1 si usuario = t.medina entonces permitir', 'desplegar']);
  check(otra.ultimo.resuelto === true, 'y cualquier otra que produzca los mismos veredictos, tambien');

  // El parser enseña, no gruñe.
  check(dice(corre('insertar 1 si turno = noche y nivel >= 2 o sede = torre entonces permitir')).includes('no mezcles'),
    'mezclar `y` con `o` se explica en vez de rechazarse a secas');
  check(dice(corre('insertar 1 si departamento > b entonces permitir')).includes('solo valen'),
    'ordenar texto con > se explica');
  check(!corre('insertar 9 si turno = noche entonces permitir').fallo, 'una posicion imposible no penaliza');

  // ---- El circuito cerrado de la puerta ----
  const proy2 = (rol: any, estado: Record<string, unknown> = {}) =>
    acceso.proyectar(rol, { estado, intentos: 0, ahora: AHORA, traficoActivo: false, salidas: [] } as any) as any;

  const cam = proy2('PANTALLA').camaras;
  check(!!cam, 'Pantalla ve la puerta por circuito cerrado');
  check(cam.lista.length === 2 && cam.activa === 1, `dos camaras y arranca en la puerta (${cam.lista.length})`);
  check(!dice(proy2('TERMINAL')).includes('garita') && !dice(proy2('TERMINAL')).includes('fotogramas'),
    'y la consola NO ve ninguna imagen: la cambia a ciegas');
  check(!dice(proy2('DATOS')).includes('garita'), 'Datos tampoco: el circuito es de Pantalla');

  const altos2 = new Set<number>();
  for (const n of [1, 2]) for (const f of proy2('PANTALLA', { camara: n }).camaras.vista.fotogramas) altos2.add(f.length);
  check(altos2.size === 1, `todos los fotogramas miden lo mismo (${[...altos2].join('/')} lineas)`);

  // Lo que la camara enseña es el EFECTO. La CAUSA —que regla decidio— es
  // de `probar`, y es la leccion de la fase: si la camara la cantara, la
  // simulacion se quedaria sin trabajo.
  const imagen = dice(proy2('PANTALLA').camaras);
  check(imagen.includes('t.medina') && imagen.includes('alto'),
    'se ve a quien el portero no deja pasar, con su nombre');
  check(!imagen.includes('regla 1') && !imagen.includes('decidido'),
    'pero NO que regla lo decidio: eso sigue siendo de `probar`');
  // Y nada del padron: si la camara cantara el turno, la regla se
  // escribiria sin hablar con Datos y la fase se cae.
  for (const dato of ['caducada', 'vigente', 'noche', 'almacen', 'direccion', 'mantenimiento']) {
    check(!imagen.includes(dato), `la camara no filtra «${dato}»: eso es del padron`);
  }

  // La imagen sigue al reglamento: es lo que la hace util.
  const antes = proy2('PANTALLA').camaras.vista;
  check(dice(antes.rotulos).includes('fuera de sitio'), 'de partida avisa de que algo no encaja');
  const conRegla = sesion(acceso, ['insertar 1 si turno = noche entonces permitir']).estado;
  const despues = proy2('PANTALLA', conRegla).camaras.vista;
  check(dice(despues.rotulos).includes('todo en orden'), 'y con la regla buena puesta, la puerta lo dice');
  check(antes.clave !== despues.clave, 'la firma de la imagen cambia con el reglamento');
  const pasaMedina = despues.fotogramas.some(
    (f: string[]) => f.join('\n').includes('t.medina') && f.join('\n').includes('PASA'),
  );
  check(pasaMedina, 'y se ve al infiltrado cruzando la barrera');
  const rechazado = antes.fotogramas.some(
    (f: string[]) => f.join('\n').includes('t.medina') && f.join('\n').includes('ALTO'),
  );
  check(rechazado, 'mientras que antes se le veia rebotar');

  check(corre('camara 2').estado?.camara === 2, '`camara 2` cambia la camara');
  check(corre('camara vestibulo').estado?.camara === 2, 'tambien vale por nombre');
  check(corre('camara siguiente', { camara: 2 }).estado?.camara === 1, '`siguiente` da la vuelta');
  check(corre('camara 7').estado === undefined && dice(corre('camara 7')).includes('no hay ninguna camara'),
    'una camara que no existe se explica y no toca el estado');
  check(corre('camara 1').fallo !== true, 'mirar no penaliza');
  check(dice(corre('camaras')).includes('sector'), '`camaras` las lista con su sector');
  check(proy2('PANTALLA', { camara: 2 }).camaras.vista.nombre.includes('VESTIBULO'),
    'la segunda enseña el otro lado de la barrera');
  // El reloj del reto es de la Fase 6. Aqui no hay ninguno, y el rotulo
  // no puede enseñar un hueco de una mecanica que esta fase no tiene.
  check(cam.ventana === undefined, 'y el monitor no enseña reloj de reto: aqui no hay');
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

console.log('\n4) Nucleo Modular · FUNCIONES Y PILA DE LLAMADAS');
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

  const datos: any = nucleo.proyectar('DATOS', vacio);
  check(datos.tablas.length === 3, 'Datos recibe las 3 tablas (funciones, resultados, tolerancias)');
  check(!JSON.stringify(datos).includes('nucleo/') && !JSON.stringify(datos).includes('medio/'),
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

  // 3. Malas prácticas de programación y validaciones en funciones dependientes:
  // En M1: `presion` SÍ comprueba lo que devuelve `carga` (x <= 12). Sabotear `carga` para subir M1 es bloqueado:
  const bloqueoM1 = sesion(nucleo, [
    'armar carga n * 2',
    'enganar carga n * 5', // carga(5) = 25 > 12 -> bloqueado por presion
    'probar',
  ]);
  check(dice(bloqueoM1.ultimo).includes('presion rechazo el retorno de carga'),
    'M1: sabotear `carga` por encima de 12 es bloqueado por la comprobacion de `presion`');

  // En M2: `escudo` SÍ comprueba que `valvula` no altere su fórmula. Sabotear `valvula` es bloqueado:
  const bloqueoM2 = sesion(nucleo, [
    'armar valvula llama pulso luego x - 3',
    'enganar valvula x + 15', // alteración detectada por escudo
    'probar',
  ]);
  check(dice(bloqueoM2.ultimo).includes('escudo detecto alteracion en valvula'),
    'M2: sabotear `valvula` es bloqueado por la comprobacion de integridad de `escudo`');

  // En M3: `latido` comprueba `flujo(n) == freno(n) * 3`. Sabotear `flujo` rompe la igualdad y es bloqueado:
  const bloqueoM3 = sesion(nucleo, [
    'armar flujo llama freno luego x * 3',
    'enganar flujo x + 20', // 23 != freno(5)*3 (9) -> bloqueado por latido
    'probar',
  ]);
  check(dice(bloqueoM3.ultimo).includes('latido detecto desfase entre flujo'),
    'M3: sabotear `flujo` es bloqueado por `latido` al comparar contra `freno(n) * 3`');

  // 4. Límite superior (fusible_corte): poner números gigantes en las dependencias vulnerables quema el fusible
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

  // 5. Victoria explotando la mala práctica de cada cadena:
  //   - M1: engañar `presion` (`reactor` no comprueba el retorno de `presion`) -> presion(5)=22 -> reactor(5)=44 (40 < 44 < 54)
  //   - M2: engañar `pulso` (`valvula` validó n<=10 antes y no comprueba el retorno de `pulso`) -> pulso(6)=33 -> valvula(6)=30 -> escudo(6)=36 (30 < 36 < 44)
  //   - M3: engañar `freno` (dependencia compartida sin tope máximo en `flujo` ni `latido`) -> freno(5)=9 -> flujo(5)=27 (cuadra con 9*3) -> latido(5)=23 (20 < 23 < 34)
  const winFase4 = sesion(nucleo, [
    'armar presion llama carga luego x + 5',
    'armar pulso n * 3',
    'armar freno n - 2',
    'enganar presion x + 12',
    'enganar pulso n + 27',
    'enganar freno n + 4',
    'ejecutar',
  ]);
  check(winFase4.ultimo.resuelto === true,
    'explotar las 3 dependencias sin comprobacion (presion, pulso y freno) dentro de rango resuelve la fase');

  // 6. Semilla dinámica por equipo
  const datosEquipoA = JSON.stringify(nucleo.proyectar('DATOS', ctx({ semilla: 1 })));
  const datosEquipoB = JSON.stringify(nucleo.proyectar('DATOS', ctx({ semilla: 5 })));
  check(datosEquipoA !== datosEquipoB,
    'dos equipos con distinta semilla reciben ventanas distintas en la tabla tolerancias');

  // 7. Reiniciar conserva lo armado y limpia los sabotajes
  const rReset = sesion(nucleo, ['armar pulso n * 3', 'enganar pulso n * 5', 'reiniciar']);
  check(Object.keys(rReset.estado.enganos as any).length === 0, 'reiniciar limpia los sabotajes activos');
  check((rReset.estado.armadas as any)?.pulso === true, 'pero conserva las piezas armadas');
}

console.log('\n5) Boveda de Credenciales · BASES DE DATOS');
{
  const corre = corredor(boveda);
  check(!dice(corre('ayuda')).includes('cr-1843'), 'la ayuda no lleva la respuesta dentro');
  check(!dice(corre('ayuda')).includes('sistemas'), 'ni el encargo, que es cosa de Datos');

  const todo = dice(corre('contar en credenciales'));
  check(todo.includes('2400'), 'la boveda tiene 2400 credenciales');

  // El embudo: cada condicion tira registros.
  const n = (q: string) => Number(dice(corre(q)).match(/(\d+) registros/)![1]);
  const c1 = n('contar en credenciales donde tipo = maestra');
  const c2 = n('contar en credenciales donde tipo = maestra y estado = activa');
  const c3 = n('contar en credenciales unir usuarios donde tipo = maestra y estado = activa y departamento = sistemas');
  const c4 = n('contar en credenciales unir usuarios donde tipo = maestra y estado = activa y departamento = sistemas y sede = torre');
  check(c1 < 2400 && c2 < c1 && c3 < c2, `el embudo estrecha (2400 → ${c1} → ${c2} → ${c3} → ${c4})`);
  check(c4 === 1, 'y las cuatro condiciones dejan exactamente una');

  // El error mas instructivo: la columna existe, pero en la otra tabla.
  const sinUnir = corre('buscar en credenciales donde departamento = sistemas');
  check(!sinUnir.fallo && dice(sinUnir).includes('unir'),
    'filtrar por una columna de la otra tabla explica que hay que unirlas');

  const muchos = corre('buscar en credenciales donde tipo = maestra');
  check(dice(muchos).includes('demasiados'), 'pedir demasiadas filas manda a estrechar, no vuelca la boveda');

  const una = corre('buscar en credenciales unir usuarios donde tipo = maestra y estado = activa y departamento = sistemas y sede = torre');
  const fila = una.bloques[0].filas[0];
  check(una.bloques[0].filas.length === 1, 'la consulta completa devuelve una sola fila');

  check(corre('extraer CR-0001').fallo === true, 'extraer la credencial equivocada penaliza');
  check(corre(`extraer ${fila[0]}`).resuelto === true, `y la del encargo (${fila[0]}) resuelve la fase`);
  check(dice(corre('buscar en credenciales donde color = azul')).includes('no es ninguna columna'),
    'una columna inventada se explica');
}

// ============================================================
console.log('\n6) Puente de Lanzamiento · APIS');
{
  const corre = corredor(puente);
  const TOK = 'cabecera autorizacion=tk-4f19-sistemas';
  const a = dice(corre('ayuda'));
  check(!a.includes('tk-4f19') && !a.includes('op-7741') && !a.includes('k7qx'),
    'la ayuda no lleva ni el token, ni la operacion, ni el reto');
  check(!a.includes('/v2/operacion'), 'ni las rutas: la documentacion la tiene Datos');
  // Que HAY varias y que solo una lleva carga si lo dice: es la regla del
  // juego. CUAL, no: eso es lo que hay que ir a mirar.
  check(!a.includes('b-07') && !a.includes('a-12') && !a.includes('c-03'),
    'ni cual de las rampas lleva carga: eso solo se ve mirando');

  // Cada numero dice una cosa distinta, y ninguno de estos hace dano.
  const codigo = (q: string, e: Record<string, unknown> = {}) => corre(q, e).bloques[0].titulo.split(' ')[0];
  check(codigo('enviar GET /v2/nada') === '404', '404 cuando la ruta no existe');
  check(codigo('enviar GET /v2/operacion/estado') === '401', '401 cuando no dices quien eres');
  check(codigo('enviar GET /v2/operacion/estado cabecera autorizacion=otro') === '403', '403 cuando el token no vale');
  check(codigo(`enviar GET /v2/operacion/cancelar ${TOK}`) === '405', '405 cuando la ruta no escucha ese metodo');
  check(codigo(`enviar POST /v2/operacion/cancelar ${TOK}`) === '422', '422 cuando falta algo en el cuerpo');
  for (const q of ['enviar GET /v2/nada', 'enviar GET /v2/operacion/estado', `enviar POST /v2/operacion/cancelar ${TOK}`]) {
    check(corre(q).fallo !== true, `y ${q.split(' ')[2]} no penaliza: ningun 4xx llega a la capa de lanzamiento`);
  }

  // ---- Tres operaciones y el puente no sabe cual lleva ojiva ----
  const get = corre(`enviar GET /v2/operacion/estado ${TOK}`);
  const textoGet = dice(get);
  check(textoGet.includes('op-7112') && textoGet.includes('op-7741') && textoGet.includes('op-7903'),
    'el GET lista las TRES operaciones en curso');
  check((textoGet.match(/armada/g) ?? []).length === 3,
    'y las da las tres por armadas: su inventario esta viejo');
  check(textoGet.includes('a-12') && textoGet.includes('b-07') && textoGet.includes('c-03'),
    'cada una con su sector, que es lo unico que las ata a las camaras');
  check(!textoGet.includes('ojiva') && !textoGet.includes('maqueta') && !textoGet.includes('vacia'),
    'por el puente NO se puede saber cual lleva carga');
  check(get.estado?.reto === 'k7qx' && get.estado?.retoHasta === AHORA + 90_000,
    'el GET abre una ventana de 90 s con su reto');

  // ---- La ventana ----
  const conReto = get.estado as Record<string, unknown>;
  const cancelar = (op: string, reto: string, extra: Record<string, unknown> = {}) =>
    corre(`enviar POST /v2/operacion/cancelar ${TOK} cuerpo operacion=${op} confirmacion=${reto}`,
      { ...conReto, ...extra });
  check(codigo(`enviar POST /v2/operacion/cancelar ${TOK} cuerpo operacion=op-7741 confirmacion=k7qx`) === '428',
    '428 si se intenta cancelar sin haber preguntado nunca');
  check(cancelar('op-7741', 'k7qx', { retoHasta: AHORA - 1 }).bloques[0].titulo.split(' ')[0] === '410',
    '410 cuando el reto ya ha caducado');
  const caducado = cancelar('op-7741', 'k7qx', { retoHasta: AHORA - 1 });
  check(caducado.fallo !== true, 'caducar no penaliza: cuesta tiempo, no intentos');
  check(caducado.estado?.reto === null, 'pero cierra la ventana: hay que volver a pedirlo');
  check(cancelar('op-7741', 'zzzz').bloques[0].titulo.split(' ')[0] === '409', '409 cuando el reto no cuadra');
  check(cancelar('op-0000', 'k7qx').bloques[0].titulo.split(' ')[0] === '404', '404 cuando la operacion no existe');

  // Un segundo GET da un reto DISTINTO: no se puede memorizar.
  const get2 = corre(`enviar GET /v2/operacion/estado ${TOK}`, get.estado);
  check(get2.estado?.reto === 'm3vd' && get2.estado?.reto !== get.estado?.reto,
    `cada consulta trae un reto nuevo (${get.estado?.reto} → ${get2.estado?.reto})`);

  // ---- Cancelar la que no era ----
  for (const [op, como] of [['op-7112', 'una rampa vacia'], ['op-7903', 'una maqueta']] as const) {
    const fallida = cancelar(op, 'k7qx');
    check(fallida.fallo === true, `cancelar ${como} cuenta como intento`);
    check(fallida.resuelto !== true, `y NO resuelve la fase (${op})`);
    check(fallida.estado?.reto === null, 'y quema el reto: a preguntar otra vez');
  }

  // El mensaje equivocado. Esta documentado en mayusculas y aun asi se envia.
  const mal = corre(`enviar POST /v2/operacion/programar ${TOK}`);
  check(mal.fallo === true && mal.estado.adelantos === 1, 'la ruta equivocada adelanta el lanzamiento y penaliza');
  check(dice(mal).includes('6 minutos'), 'y la cuenta atras se acorta de verdad');

  const bien = cancelar('op-7741', 'k7qx');
  check(bien.resuelto === true, 'la operacion con ojiva, con su reto y en plazo, cancela el lanzamiento');

  check(dice(corre('enviar MANDAR /v2/operacion/estado')).includes('no es un metodo'), 'un metodo inventado se explica');
  check(dice(corre(`enviar POST /v2/operacion/cancelar autorizacion=x`)).includes('ni en la cabecera ni en el cuerpo'),
    'y un par suelto sin decir donde va, tambien');

  // ---- El circuito cerrado ----
  // La consola cambia las camaras y NO las ve; Pantalla las ve y no las
  // cambia. Si alguna de las dos mitades se saltara eso, la fase se
  // resolveria desde un solo puesto.
  const proy = (rol: any, estado: Record<string, unknown> = {}) =>
    puente.proyectar(rol, { estado, intentos: 0, ahora: AHORA, traficoActivo: false, salidas: [] } as any) as any;

  const pant = proy('PANTALLA');
  check(!!pant.camaras, 'Pantalla recibe el circuito cerrado');
  check(pant.camaras.lista.length === 6 && pant.camaras.activa === 1,
    `seis camaras y arranca en la 1 (${pant.camaras.lista.length})`);
  check(pant.camaras.vista.fotogramas.length > 0, 'con imagen, no solo con el rotulo');
  const todosLosAltos = new Set<number>();
  for (const n of [1, 2, 3, 4, 5, 6]) {
    for (const adelantos of [0, 1, 2, 3]) {
      for (const f of proy('PANTALLA', { camara: n, adelantos }).camaras.vista.fotogramas) todosLosAltos.add(f.length);
    }
    for (const f of proy('PANTALLA', { camara: n, cancelada: true }).camaras.vista.fotogramas) todosLosAltos.add(f.length);
  }
  for (const f of proy('PANTALLA', { camara: 2, cancelada: true }).camaras.vista.detonacion) todosLosAltos.add(f.length);
  check(todosLosAltos.size === 1, `todos los fotogramas miden lo mismo (${[...todosLosAltos].join('/')} lineas)`);
  check(!dice(proy('TERMINAL')).includes('fotogramas') && !dice(proy('TERMINAL')).includes('rampa'),
    'y la consola NO ve ninguna imagen');
  check(!dice(proy('DATOS')).includes('cam-') && !dice(proy('DATOS')).includes('ojiva armada'),
    'Datos tampoco: el circuito es de Pantalla');

  // ---- Las camaras son OBLIGATORIAS ----
  // Sin ellas no hay forma de saber cual de las tres cancelar: el puente
  // da las tres por armadas y la documentacion no nombra ninguna.
  const rampas = [1, 2, 3].map((n) => proy('PANTALLA', { camara: n }).camaras.vista);
  const conOjiva = rampas.filter((r) => dice(r.rotulos).includes('ojiva armada'));
  check(conOjiva.length === 1, `solo UNA rampa se ve cargada (${conOjiva.length} de 3)`);
  check(conOjiva[0].sector === 'B-07', `y es la del sector ${conOjiva[0].sector}`);
  check(dice(rampas.find((r) => r.sector === 'A-12')!.rotulos).includes('rampa vacia'),
    'la de A-12 se ve vacia');
  check(dice(rampas.find((r) => r.sector === 'C-03')!.rotulos).includes('maqueta'),
    'y la de C-03 se ve que es una maqueta');
  check(dice(rampas.find((r) => r.sector === 'C-03')!.fotogramas).includes('maq'),
    'lo pone en el propio cascaron, no solo en el rotulo');
  const sectoresEnDatos = dice(proy('DATOS'));
  check(!sectoresEnDatos.includes('b-07'), 'la documentacion de Datos no dice cual es el sector bueno');

  const todasLasCamaras = [1, 2, 3, 4, 5, 6]
    .map((n) => dice(proy('PANTALLA', { camara: n, peticiones: 3, rechazadas: 2, adelantos: 1 }).camaras))
    .join(' ');
  check(!todasLasCamaras.includes('tk-4f19') && !todasLasCamaras.includes('k7qx'),
    'ninguna camara enseña el token ni el reto');
  check(!todasLasCamaras.includes('/v2/'), 'ni una sola ruta: la documentacion sigue siendo de Datos');
  check(!todasLasCamaras.includes('op-7741'),
    'ni el identificador de la operacion: la camara da el SECTOR, la lista da el id');

  const cambio = corre('camara 5');
  check(cambio.estado?.camara === 5, '`camara 5` cambia la camara');
  check(proy('PANTALLA', cambio.estado).camaras.vista.nombre.includes('ENLACE'),
    'y a Pantalla le llega ya la nueva');
  check(corre('camara enlace').estado?.camara === 5, 'tambien vale por nombre');
  check(corre('camara siguiente', { camara: 6 }).estado?.camara === 1, '`siguiente` da la vuelta');
  check(corre('camara 12').estado === undefined && dice(corre('camara 12')).includes('no hay ninguna camara'),
    'una camara que no existe se explica y no toca el estado');
  check(corre('camara b-07').estado?.camara === 2, 'y se puede pedir por sector, que es como se habla');
  check(corre('camara centro').estado?.camara === 2, 'o por nombre');
  check(dice(corre('camaras')).includes('sector'), '`camaras` las lista con su sector');
  check(corre('camara 2').fallo !== true, 'mirar no penaliza');

  // Las camaras reaccionan: es lo que las hace algo mas que un adorno.
  const trasError = corre('enviar GET /v2/operacion/estado');
  check(trasError.estado?.peticiones === 1 && trasError.estado?.rechazadas === 1,
    'cada peticion queda contada en la sala de control');
  const silo = proy('PANTALLA', { camara: 2, adelantos: 1 }).camaras.vista;
  check(dice(silo.rotulos).includes('cuenta acortada'), 'el silo avisa de que la cuenta se ha acortado');
  check(silo.ruido > 0, 'y la señal se ensucia');

  // ---- La cuenta atras se ve, y la detonacion tambien ----
  const tension = (adelantos: number) => proy('PANTALLA', { camara: 2, adelantos }).camaras.vista.tension;
  check(tension(0) === 0 && tension(1) === 1 && tension(2) === 2 && tension(3) === 3,
    `la tension sube con cada adelanto (${[0, 1, 2, 3].map(tension).join(' → ')})`);
  check(proy('PANTALLA', { camara: 1, adelantos: 3 }).camaras.vista.tension === 0,
    'y una rampa vacia no enciende motores por mucho que corra el reloj');
  const calma = proy('PANTALLA', { camara: 2 }).camaras.vista;
  const ardiendo = proy('PANTALLA', { camara: 2, adelantos: 3 }).camaras.vista;
  check(calma.fotogramas.length > 1, 'en calma la imagen ya se mueve (venteo)');
  check(ardiendo.ritmo < calma.ritmo, `y a punto de lanzar va mas rapido (${ardiendo.ritmo} < ${calma.ritmo} ms)`);
  check(dice(ardiendo.fotogramas).includes('vvvv') || dice(ardiendo.fotogramas).includes('wwww'),
    'con la tobera encendida');
  check(dice(ardiendo.rotulos).includes('ignicion'), 'y el rotulo lo dice');
  check(calma.detonacion === null, 'mientras esta armada no hay detonacion que reproducir');
  check(calma.clave !== ardiendo.clave, 'la firma de la imagen cambia con la tension');

  // El reloj del reto viaja para las seis camaras, no para una.
  check(proy('PANTALLA', { camara: 4, ...(get.estado as any) }).camaras.ventana?.hasta === AHORA + 90_000,
    'el reloj del reto se ve desde cualquier camara');
  check(proy('PANTALLA', {}).camaras.ventana?.hasta === null,
    'y sin reto abierto el hueco sigue ahi, vacio: esta fase SI tiene reloj');

  check(bien.estado?.camara === 2, 'al cancelar, la camara salta sola a la rampa buena');
  check((bien.esperaVictoriaMs ?? 0) > 2000,
    `la cortinilla de victoria espera a que arda (${bien.esperaVictoriaMs} ms)`);
  const ruina = proy('PANTALLA', bien.estado).camaras.vista;
  check(ruina.detonacion !== null && ruina.detonacion.length >= 5,
    `la detonacion viene en ${ruina.detonacion?.length} fotogramas`);
  check(dice(ruina.detonacion).includes('####') && dice(ruina.detonacion).includes('~~~'),
    'con bola de fuego y humo');
  check(!dice(ruina.fotogramas).includes('7741'), 'y en reposo ya no queda ojiva en la rampa');
  check(proy('PANTALLA', { ...(bien.estado as any), camara: 1 }).camaras.vista.detonacion === null,
    'las otras rampas no revientan: alli no habia nada');
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
    ['Fase 1 · Control de Acceso', acceso, 2, ['caducada', 'vigente', 'noche', 'almacen']],
    ['Fase 2 · El Enemigo', enemigo, 2, ['svc.backup', 'k.moreno', 'a.duarte', 'j.ortega', 'm.rivas']],
    ['Fase 4 · Nucleo Modular', nucleo, 2, ['v * f', 'n * 2', 'n - 1', '12', '24']],
    ['Fase 5 · Boveda', boveda, 2, ['cr-1843', 'maestra', 'torre']],
    ['Fase 6 · Puente', puente, 6, ['tk-4f19', 'k7qx', '/v2/']],
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
