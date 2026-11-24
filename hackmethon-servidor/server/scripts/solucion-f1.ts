// La solución de la Fase 1 para UN equipo, en su propia versión.
//
//   npm run solucion:f1 -- BINARIO
//
// Cada equipo juega la Fase 1 con otra piel (otros nombres, otras palabras
// y otra escala de permisos), así que la solución de la guía no sirve tal
// cual: esto la traduce a la versión de esa mesa. Es para la organización,
// cuando un equipo se atasca y hace falta darle una pista justa.
import { PrismaClient } from '@prisma/client';
import { instanciaDeAcceso } from '../src/phases/acceso.js';

const prisma = new PrismaClient();
const nombre = process.argv[2];
if (!nombre) {
  console.log('Uso: npm run solucion:f1 -- <NOMBRE DEL EQUIPO>');
  process.exit(1);
}
const equipo = await prisma.team.findFirst({ where: { name: nombre } });
if (!equipo) {
  console.log(`No hay ningún equipo «${nombre}».`);
  process.exit(1);
}

const canon = instanciaDeAcceso();
const suya = instanciaDeAcceso(equipo.id);

// La traducción sale de comparar las dos versiones programa a programa.
const voz: Record<string, Record<string, string>> = { origen: {}, tipo: {}, firma: {} };
const perm: Record<number, number> = {};
for (const p of suya.registro) {
  const c = canon.registro.find((q) => q.clave === p.clave)!;
  voz.origen[c.origen] = p.origen; voz.tipo[c.tipo] = p.tipo; voz.firma[c.firma] = p.firma;
  perm[c.permisos] = p.permisos;
}
const invierte = perm[1] > perm[5];
const gira: Record<string, string> = { '>=': '<=', '<=': '>=', '>': '<', '<': '>', '=': '=', '!=': '!=' };
const t = (f: string) => f.replace(/(origen|tipo|firma|permisos) (!=|>=|<=|=|>|<) (\S+)/g, (_m, campo, op, valor) =>
  campo === 'permisos'
    ? `permisos ${invierte ? gira[op] : op} ${perm[Number(valor)]}`
    : `${campo} ${op} ${voz[campo][valor]}`);
const quien = (clave: string) => suya.registro.find((p) => p.clave === clave)!;

console.log(`\nFase 1 · El Reflejo — versión de ${equipo.name}\n`);
console.log('Programas (id · nombre · tipo · origen · permisos · firma):');
for (const p of suya.registro) {
  console.log(`  ${p.capa === 2 ? '+' : ' '} ${p.id.padEnd(4)} ${p.nombre.padEnd(10)} ${p.tipo.padEnd(12)} ${p.origen.padEnd(8)} ${String(p.permisos).padEnd(2)} ${p.firma}`);
}
console.log('  (+ = llega con la muda)\n');
console.log(`Esporas capa 1: ${['brote', 'raiz', 'polen'].map((c) => quien(c).nombre).join(', ')}`);
console.log(`Anticuerpos capa 1: ${['liquen', 'esqueje', 'resina', 'corteza'].map((c) => quien(c).nombre).join(', ')}`);
console.log(`En la muda: espora ${quien('micelio').nombre} y ${quien('nectar').nombre}; anticuerpos ${quien('tallo').nombre} y ${quien('humus').nombre}; `
  + `${quien('savia').nombre} se vuelve anticuerpo; ${quien('xilema').nombre} es rutina.\n`);
console.log('CAPA 1 · el camino amable (un rasgo por filtro, y nombrar a los que quedan)');
for (const c of ['quitar 1', 'filtrar si firma = ausente', `filtrar si nombre = ${quien('esqueje').nombre}`,
  `filtrar si nombre = ${quien('corteza').nombre}`, 'probar', 'desplegar']) {
  console.log(`  > ${t(c)}`);
}
console.log('CAPA 1 · el camino con `y` (dos filtros, y sobreviven a la muda)');
for (const c of ['quitar 1', 'filtrar si permisos >= 3 y firma != valida', 'filtrar si origen = externo y permisos >= 3', 'probar', 'desplegar']) {
  console.log(`  > ${t(c)}`);
}
console.log('CAPA 2 (el flujo queda: defensa nueva, filtro 1, filtro 2)');
for (const c of ['quitar 1', 'quitar 2', 'filtrar si origen = externo y permisos >= 3 y tipo = binario',
  'filtrar si tipo = driver y permisos < 3', 'filtrar si tipo = servicio y permisos >= 4', 'probar', 'desplegar']) {
  console.log(`  > ${t(c)}`);
}
console.log('');
await prisma.$disconnect();
