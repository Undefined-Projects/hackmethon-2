// Prueba de humo de la Fase 4 · La Mano (LISTAS). No necesita servidor.
//
//   npm run smoke:mano
import {
  mano, instanciaDeMano, intercambiosMinimos, planDeIntercambios, planDeFalanges, ordenDeDedo, comoTexto, comoNumero, DEDOS,
} from '../src/phases/mano.js';

let fallos = 0;
const check = (ok: boolean, txt: string) => { console.log(`  ${ok ? '✔' : '✘'} ${txt}`); if (!ok) fallos++; };
const dice = (x: unknown) => JSON.stringify(x);

let reloj = 1_000_000;
function sesion(comandos: string[], semilla?: string, estado0: Record<string, unknown> = {}) {
  let estado: Record<string, unknown> = { ...estado0 };
  let ultimo: any = null;
  for (const c of comandos) {
    reloj += 200_000; // más que cualquier cuarentena
    ultimo = mano.ejecutar(c, { estado, intentos: 0, ahora: reloj, traficoActivo: false, semilla });
    if (ultimo.estado) estado = ultimo.estado;
  }
  return { estado, ultimo };
}
const ver = (rol: any, estado: Record<string, unknown>, semilla?: string) =>
  mano.proyectar(rol, { estado, salidas: [], traficoActivo: false, filtroTrafico: null, semilla }) as any;
const texto = (r: any) => dice(r.bloques);

const solucionCapa1 = (semilla?: string) =>
  planDeFalanges(instanciaDeMano(semilla)).map(([d, i, j]) => `intercambiar ${d} ${i} ${j}`);
const solucionCapa2 = (semilla?: string) => {
  const inst = instanciaDeMano(semilla);
  return planDeIntercambios(inst.inicial, inst.objetivo).map(([i, j]) => `intercambiar ${i} ${j}`);
};

// ============================================================
console.log('\n1) Una versión por mesa');
{
  const semillas = [undefined, ...Array.from({ length: 40 }, (_, i) => `equipo-${i}`)];
  let forma = true, tipos = true, trampas = true, tendones = true, minimo = true;
  for (const s of semillas) {
    const inst = instanciaDeMano(s);
    if (inst.falanges.length !== 5 || inst.falanges.some((f) => f.length !== 3)) forma = false;
    const n = inst.tipos.filter((t) => t === 'numero').length;
    if (n < 2 || n > 3) tipos = false;
    inst.falanges.forEach((f, d) => {
      const bueno = ordenDeDedo(f, inst.tipos[d]);
      const otro = ordenDeDedo(f, inst.tipos[d] === 'numero' ? 'texto' : 'numero');
      const frenteTexto = [0, 1, 2].sort((i, j) => comoTexto(String(f[i].frente), String(f[j].frente)));
      const reversoNum = [0, 1, 2].sort((i, j) => comoNumero(Number(f[i].reverso), Number(f[j].reverso)));
      if ([otro, frenteTexto, reversoNum, [0, 1, 2]].some((o) => dice(o) === dice(bueno))) trampas = false;
    });
    if (inst.tendones.length !== 12 || new Set(inst.tendones.map((t) => t.tension)).size !== 12) tendones = false;
    if (inst.minimo < 8 || inst.minimo > 10 || inst.presupuesto !== inst.minimo + 2
      || intercambiosMinimos(inst.inicial, inst.objetivo) !== inst.minimo) minimo = false;
  }
  check(forma, 'la mano es una lista de 5 listas de 3, en las 41 mesas');
  check(tipos, 'dos o tres dedos de cada tipo (numero y texto)');
  check(trampas, 'en cada dedo, la cara equivocada o la comparación equivocada dan otro orden (y no llega ordenado)');
  check(tendones, 'doce tendones con tensiones distintas');
  check(minimo, 'el revoltijo pide entre 8 y 10 intercambios, y el presupuesto es el mínimo + 2');
  check(dice(instanciaDeMano('equipo-1')) !== dice(instanciaDeMano('equipo-2')), 'cada mesa tiene su mano y sus tendones');
  check(dice(instanciaDeMano('equipo-1')) === dice(instanciaDeMano('equipo-1')), 'y es siempre la misma para la misma mesa');
  const ajena = sesion([...solucionCapa1('equipo-1'), 'apretar'], 'equipo-2');
  check(ajena.ultimo.fallo === true, 'la solución de otra mesa no sirve');
}

// ============================================================
console.log('\n2) Capa 1 · las falanges');
{
  const inst = instanciaDeMano();
  check(texto(sesion(['intercambiar 5 0 1']).ultimo).includes('del 0 al 4'), 'no hay dedo 5: se explica que se cuenta desde cero');
  check(texto(sesion(['intercambiar 0 0 3']).ultimo).includes('del 0 al 2'), '  ni falange 3');
  check(texto(sesion(['probar']).ultimo).includes('0 de 5'), 'al llegar, ningún dedo está ordenado');
  // Ordenar todos por el frente, como número, sin mirar el tipo.
  const todoNumero = inst.falanges.flatMap((f, d) => {
    const meta = ordenDeDedo(f, 'numero'), a = [0, 1, 2], plan: string[] = [];
    for (let i = 0; i < 3; i++) { if (a[i] === meta[i]) continue; const j = a.indexOf(meta[i]); [a[i], a[j]] = [a[j], a[i]]; plan.push(`intercambiar ${d} ${i} ${j}`); }
    return plan;
  });
  const sinTipo = sesion([...todoNumero, 'probar']);
  const deNumero = inst.tipos.filter((t) => t === 'numero').length;
  check(texto(sinTipo.ultimo).includes(`${deNumero} de 5`), `ordenar todo como número solo arregla los dedos de tipo numero (${deNumero})`);
  check(sesion([...todoNumero, 'apretar']).ultimo.fallo === true, '  y apretar así cuesta una cuarentena');
  const bien = sesion([...solucionCapa1(), 'probar']);
  check(texto(bien.ultimo).includes('5 de 5'), 'ordenando cada dedo según su tipo, los cinco quedan');
  const pasa = sesion([...solucionCapa1(), 'apretar']);
  check(pasa.estado.capa === 2 && pasa.ultimo.resuelto !== true, 'apretar bien pasa a la capa 2, la fase sigue');
  check(texto(pasa.ultimo).includes('TIPOS DE DATOS'), '  y le pone nombre: tipos de datos');
  const re = sesion([...solucionCapa1(), 'reiniciar', 'probar']);
  check(texto(re.ultimo).includes('0 de 5'), '`reiniciar` deja la mano como llegó');
  // Las cámaras: el frente y el reverso.
  check(ver('PANTALLA', {}).mano.cara === 'frente', 'Pantalla arranca viendo el frente');
  const atras = sesion(['camara 2']);
  check(ver('PANTALLA', atras.estado).mano.cara === 'reverso', '`camara 2` le pone el reverso');
  check(ver('PANTALLA', sesion(['camara 2', 'camara 1']).estado).mano.cara === 'frente', '  y `camara 1`, otra vez el frente');
}

// ============================================================
console.log('\n3) Capa 2 · los tendones');
{
  const inst = instanciaDeMano();
  const C2 = { capa: 2 };
  const plan = solucionCapa2();
  check(plan.length === inst.minimo, `el plan por selección usa el mínimo (${plan.length})`);
  const bien = sesion([...plan, 'soltar'], undefined, C2);
  check(bien.ultimo.resuelto === true && bien.estado.resuelta === true, 'ordenados por dedo y tensión, la mano se suelta');
  check(bien.ultimo.esperaVictoriaMs >= 2000, '  y la cortinilla espera a verlo');
  check(sesion(['soltar'], undefined, C2).ultimo.fallo === true, 'soltar desordenado cuesta una cuarentena');
  // Ordenar solo por tensión no basta: hace falta el dedo primero.
  const porTension = [...inst.tendones].sort((a, b) => a.tension - b.tension).map((t) => t.letra);
  check(dice(porTension) !== dice(inst.objetivo), 'ordenar solo por tensión no da el orden bueno');
  // El presupuesto se acaba.
  const derrochar = Array.from({ length: inst.presupuesto }, () => 'intercambiar 0 1');
  const sinMas = sesion([...derrochar, 'intercambiar 2 3'], undefined, C2);
  check(texto(sinMas.ultimo).includes('No quedan intercambios'), `al pasar de ${inst.presupuesto} intercambios, no deja más`);
  const otraVez = sesion([...derrochar, 'reiniciar', ...plan, 'soltar'], undefined, C2);
  check(otraVez.ultimo.resuelto === true, '`reiniciar` recupera el presupuesto y se puede volver a intentar');
  check(texto(sesion(['intercambiar 3 12'], undefined, C2).ultimo).includes('del 0 al 11'), 'los tendones van del 0 al 11');
}

// ============================================================
console.log('\n4) Lo que ve cada puesto');
{
  const inst = instanciaDeMano();
  const p1 = ver('PANTALLA', {}), d1 = ver('DATOS', {}), t1 = ver('TERMINAL', {});
  check(dice(p1.mano.falanges) === dice(inst.falanges), 'Pantalla ve las falanges con sus dos datos');
  check(!dice(p1).includes('"numero"') && !dice(p1).includes('"texto"'), '  pero no el tipo de ningún dedo');
  const tiposD = d1.tablas.find((t: any) => t.id === 'dedos');
  check(tiposD.filas.length === 5 && DEDOS.includes(tiposD.filas[0][1]) && ['numero', 'texto'].includes(tiposD.filas[0][2]),
    'Datos tiene el tipo de cada dedo, por nombre');
  check(!dice(d1).includes(`"${inst.falanges[0][0].reverso}"`), '  y no ve la mano');
  check(!dice(t1).includes(`"${inst.falanges[0][0].reverso}"`) && !dice(t1).includes('"numero"'), 'Terminal no ve ni la mano ni los tipos');
  const C2 = { capa: 2 };
  const p2 = ver('PANTALLA', C2), d2 = ver('DATOS', C2);
  check(dice(p2.mano.orden) === dice(inst.inicial), 'en la capa 2 Pantalla ve el orden de los tendones');
  check(!inst.tendones.some((t) => dice(p2).includes(`"${t.tension}"`)) && !dice(p2).includes('tension'), '  pero no sus tensiones');
  check(d2.tablas.find((t: any) => t.id === 'tendones').filas.length === 12, 'Datos tiene dedo y tensión de los doce');
  check(!dice(d2).includes(dice(inst.inicial)), '  y no el orden en que están');
  for (const rol of ['DATOS', 'PANTALLA', 'TERMINAL']) {
    check(ver(rol, C2).lamina.capa === 2 && ver(rol, C2).lamina.capas === 2, `${rol} lleva la lámina`);
  }
}

console.log(fallos === 0 ? '\n✅ La Mano OK\n' : `\n❌ ${fallos} fallos\n`);
process.exit(fallos === 0 ? 0 : 1);
