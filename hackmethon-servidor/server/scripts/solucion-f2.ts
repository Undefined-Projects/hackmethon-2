// La solución de la Fase 1 · La Maraña y del bonus · La Espesura para UN
// equipo, en su propia versión.
//
//   npm run solucion:f2 -- BINARIO
//
// El semillero y el seto de cada mesa están girados o reflejados, y la
// escalera con espinas cambia de sitio: la solución de la guía no sirve tal
// cual. Esto imprime el semillero y el seto de esa mesa con su programa, y
// la espesura de esa mesa con sus minas y el programa que lleva a los
// cuatro brotes al claro.
// Es para la organización, cuando un equipo se atasca y hay que darle una
// pista justa.
import { PrismaClient } from '@prisma/client';
import { casillaDe, columnaDe, espesuraDeMarana, marana, seguidorDePared, semilleroDeMarana, setoDeMarana } from '../src/phases/marana.js';

const prisma = new PrismaClient();
const nombre = process.argv[2];
if (!nombre) {
  console.log('Uso: npm run solucion:f2 -- <NOMBRE DEL EQUIPO>');
  process.exit(1);
}
const equipo = await prisma.team.findFirst({ where: { name: nombre } });
if (!equipo) {
  console.log(`No hay ningún equipo «${nombre}».`);
  process.exit(1);
}
const semilla = process.env.FASES_CANONICAS ? undefined : equipo.id;
const seto = setoDeMarana(semilla);

const ESCALERA = (primero: 'gira' | 'avanza', izq: string, der: string) => primero === 'gira'
  ? ['repetir 3 veces', `girar ${izq}`, 'avanzar', 'avanzar', 'avanzar', `girar ${der}`, 'avanzar', 'avanzar', 'avanzar', 'fin']
  : ['repetir 3 veces', 'avanzar', 'avanzar', 'avanzar', `girar ${izq}`, 'avanzar', 'avanzar', 'avanzar', `girar ${der}`, 'fin'];
/** Juega un programa desde un estado y devuelve cómo queda. */
const jugar = (prog: string[], estado0: Record<string, unknown>) => {
  let estado: Record<string, unknown> = { ...estado0 };
  for (const c of [...prog, 'lanzar']) {
    const r = marana.ejecutar(c, { estado, intentos: 0, ahora: Date.now(), traficoActivo: false, semilla });
    if (r.estado) estado = r.estado;
  }
  return estado;
};
const buena = (['gira', 'avanza'] as const)
  .flatMap((p) => [['izquierda', 'derecha'], ['derecha', 'izquierda']].map(([i, d]) => ESCALERA(p, i, d)))
  .find((prog) => jugar(prog, { capa: 2 }).resuelta === true)!;
const semillero = semilleroDeMarana(semilla);
const caminoSemillero = [['derecha', 'izquierda'], ['izquierda', 'derecha']]
  .map(([d, i]) => ['avanzar', 'avanzar', 'avanzar', `girar ${d}`, 'avanzar', 'avanzar', 'avanzar', `girar ${i}`, 'avanzar'])
  .find((prog) => jugar(prog, {}).capa === 2)!;

const RUMBOS = ['arriba (norte)', 'derecha (este)', 'abajo (sur)', 'izquierda (oeste)'];
const plano = (rejilla: string[][]) => {
  console.log('     ' + Array.from({ length: rejilla.length }, (_, c) => String.fromCharCode(65 + c)).join(' '));
  rejilla.forEach((fila, f) => console.log(`  ${String(f + 1).padStart(2)} ` + fila.map((ch) => (ch === '*' ? 'X' : ch)).join(' ')));
};
console.log(`\nFASE 1 · LA MARAÑA · ${equipo.name}\n`);
console.log('CAPA 1 · EL SEMILLERO   (# seto · . camino · E entrada · S salida)\n');
plano(semillero.rejilla);
console.log(`\nEl brote nace en ${casillaDe(semillero.entrada)} mirando hacia ${RUMBOS[semillero.rumbo]}.`);
console.log('El programa que lo cruza (sin ciclos):\n');
caminoSemillero.forEach((l, i) => console.log(`  ${String(i + 1).padStart(2)}  ${l}`));

const n = seto.rejilla.length;
console.log('\nCAPA 2 · EL SETO   (# seto · . camino · X espina · E entrada · S salida)\n');
console.log('     ' + Array.from({ length: n }, (_, c) => String.fromCharCode(65 + c)).join(' '));
seto.rejilla.forEach((fila, f) => {
  console.log(`  ${String(f + 1).padStart(2)} ` + fila.map((ch) => (ch === '*' ? 'X' : ch)).join(' '));
});
console.log(`\nEl brote nace en ${casillaDe(seto.entrada)} mirando hacia ${RUMBOS[seto.rumbo]}.`);
console.log(`Espinas: ${seto.espinas.map((e, i) => `X${i + 1} ${casillaDe(e)}`).join(' · ')}`);
console.log('\nLa escalera que cruza (10 líneas):\n');
buena.forEach((l, i) => console.log(`  ${String(i + 1).padStart(2)}  ${l === 'fin' || l.startsWith('repetir') ? '' : '    '}${l}`));

const esp = espesuraDeMarana(semilla);
const cols = esp.rejilla[0].length;
console.log('\nBONUS · LA ESPESURA   (# seto · . camino · X mina · 1-4 brotes · S claro)\n');
console.log('     ' + Array.from({ length: cols }, (_, c) => columnaDe(c).padEnd(3)).join(''));
esp.rejilla.forEach((fila, f) => {
  const brote = (c: number) => esp.brotes.findIndex((b) => b.entrada[0] === f && b.entrada[1] === c);
  console.log(`  ${String(f + 1).padStart(2)} ` + fila.map((ch, c) => (brote(c) >= 0 ? String(brote(c) + 1) : ch === '*' ? 'X' : ch).padEnd(3)).join(''));
});
esp.brotes.forEach((b, i) => console.log(`Brote ${i + 1}: nace en ${casillaDe(b.entrada)} mirando hacia ${RUMBOS[b.rumbo]}.`));
console.log(`Minas: ${esp.minas.map((m, i) => `X${i + 1} ${casillaDe(m)}`).join(' · ')}`);
console.log(`\nLos cuatro llegan sin pisar una mina siguiendo la pared ${esp.mano.toUpperCase()} (12 líneas):\n`);
const programa = seguidorDePared(esp.mano);
const sangria = [0, 1, 2, 3, 2, 3, 4, 3, 2, 2, 1, 0];
programa.forEach((l, i) => console.log(`  ${String(i + 1).padStart(2)}  ${'    '.repeat(sangria[i])}${l}`));
console.log('\nPistas, de menos a más:');
console.log('  1. Los cuatro llevan el mismo programa desde sitios distintos: no hay camino que dictar.');
console.log('  2. Lean `crecimiento`: quien no suelta nunca la pared de un lado acaba en el claro.');
console.log('  3. Pegarse a una pared: si ese lado está libre, gira hacia él; si no, gira al otro hasta');
console.log('     tener el frente libre; avanza. Todo, muchas veces (dos `repetir 99` anidados).');
console.log(`  4. Con las minas de Datos y lo que ha alumbrado Pantalla: la pared buena es la ${esp.mano}.\n`);
await prisma.$disconnect();
