// La solución de la Fase 4 · La Mano para UN equipo, en su propia versión.
//
//   npm run solucion:mano -- BINARIO
//
// Cada mesa tiene otra mano, otro contrato y otro revoltijo de tendones.
// Es para la organización, cuando un equipo se atasca y hay que darle una
// pista justa.
import { PrismaClient } from '@prisma/client';
import { DEDOS, instanciaDeMano, ordenDeDedo, planDeFalanges, planDeIntercambios } from '../src/phases/mano.js';

const prisma = new PrismaClient();
const nombre = process.argv[2];
if (!nombre) { console.log('Uso: npm run solucion:mano -- <NOMBRE DEL EQUIPO>'); process.exit(1); }
const equipo = await prisma.team.findFirst({ where: { name: nombre } });
if (!equipo) { console.log(`No hay ningún equipo «${nombre}».`); process.exit(1); }
const inst = instanciaDeMano(process.env.FASES_CANONICAS ? undefined : equipo.id);

console.log(`\nFASE 4 · LA MANO · ${equipo.name}\n`);
console.log('CAPA 1 · LAS FALANGES   (frente / reverso, de la base a la punta)');
inst.falanges.forEach((f, d) => {
  const meta = ordenDeDedo(f, inst.tipos[d]).map((i) => f[i]);
  console.log(`  ${d} ${DEDOS[d].padEnd(8)} ${inst.tipos[d].padEnd(7)} llega: ${f.map((x) => `${x.frente}/"${x.reverso}"`).join('  ').padEnd(34)}`
    + ` queda: ${meta.map((x) => `${x.frente}/"${x.reverso}"`).join('  ')}`);
});
console.log('  Intercambios:');
for (const [d, i, j] of planDeFalanges(inst)) console.log(`    > intercambiar ${d} ${i} ${j}`);
console.log('    > apretar\n');
console.log('CAPA 2 · LOS TENDONES');
console.log(`  Tendones: ${inst.tendones.map((t) => `${t.letra}(${DEDOS[t.dedo]} ${t.tension})`).join('  ')}`);
console.log(`  Llegan:   ${inst.inicial.join(' ')}`);
console.log(`  Deben:    ${inst.objetivo.join(' ')}`);
console.log(`  Mínimo ${inst.minimo} intercambios · presupuesto ${inst.presupuesto}. Plan por selección:`);
for (const [i, j] of planDeIntercambios(inst.inicial, inst.objetivo)) console.log(`    > intercambiar ${i} ${j}`);
console.log('    > soltar\n');
await prisma.$disconnect();
