// Copia el contrato (constants + events) del servidor al cliente.
// Sin esto, servidor y front derivan y los bugs aparecen en producción,
// que aquí significa: a mitad del evento, con 40 personas mirando.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dest = resolve(here, '../../client/src/shared');
mkdirSync(dest, { recursive: true });

const AVISO = `// ⚠️ GENERADO — no editar aquí.\n// Fuente: server/src/lib/%s · regenerar con \`npm run sync:shared\` en /server\n\n`;

for (const file of ['constants.ts', 'events.ts']) {
  const src = readFileSync(resolve(here, '../src/lib', file), 'utf8')
    // El bundler del cliente no resuelve las extensiones .js de ESM/Node.
    .replace(/from '\.\/(\w[\w-]*)\.js'/g, "from './$1'");
  writeFileSync(resolve(dest, file), AVISO.replace('%s', file) + src);
  console.log(`→ client/src/shared/${file}`);
}
