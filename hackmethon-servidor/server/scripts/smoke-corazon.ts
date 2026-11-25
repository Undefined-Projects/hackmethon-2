// Prueba de humo del bonus El Corazón: las dos capas, en dos equipos.
import { corazon, instanciaDeCorazon, solucionDeCorazon } from '../src/phases/corazon.js';

let fallos = 0;
const check = (ok: boolean, t: string) => { console.log(`  ${ok ? '✔' : '✘'} ${t}`); if (!ok) fallos++; };
const dice = (r: any) => JSON.stringify(r).toLowerCase();

for (const semilla of ['equipo-1', 'equipo-2']) {
  console.log(`\n[${semilla}]`);
  const inst = instanciaDeCorazon(semilla);
  const sol = solucionDeCorazon(inst);
  let estado: Record<string, unknown> = {};
  let reloj = 1_000_000;
  const paso = (q: string) => {
    reloj += 1000;
    const r = corazon.ejecutar(q, { estado, intentos: 0, ahora: reloj, traficoActivo: false, semilla });
    if (r.estado) estado = r.estado;
    return r;
  };
  const sinCuarentena = () => { estado = { ...estado, cuarentenaHasta: 0 }; };

  check(dice(paso('dir')).includes('respaldo'), 'DIR en la raíz muestra las carpetas');
  check(dice(paso('type autoexec.bat')).includes('marcapaso.sys'), 'TYPE lee el arranque');
  paso('cd corazon');
  check((estado.cwd as string[]).join('\\') === 'CORAZON', 'CD entra a una carpeta');
  check(dice(paso('type marcapaso.sys')).includes('dañado'), 'el marcapasos de su sitio está dañado');
  paso('cd ..');
  check(dice(paso(`type respaldo\\${inst.anioBueno}\\marcapaso.sys`)).includes(inst.sumaBuena.toLowerCase()), 'el respaldo bueno tiene la suma del manual');
  check(paso('arrancar').fallo === true, 'arrancar con el marcapasos dañado falla (cuarentena)');
  sinCuarentena();
  const malo = ['1987', '1991', '1994'].find((a) => a !== inst.anioBueno)!;
  paso(`copy c:\\respaldo\\${malo}\\marcapaso.sys c:\\corazon`);
  check(paso('arrancar').fallo === true, 'con el respaldo equivocado tampoco arranca');
  sinCuarentena();
  check(paso('borrar c:\\corazon\\ritmo.bas 10').bloques[0].tipo === 'error', 'en la capa 1 no se puede borrar');
  paso(sol.copiar);
  check(paso('arrancar').estado?.capa === 2, 'con el respaldo bueno arranca y abre la capa 2');
  // Capa 2
  check(dice(paso('procesos')).includes('orden.exe'), 'PROCESOS muestra al intruso');
  check(dice(paso(`terminar ${inst.pidVirus}`)).includes('volvio a cargar'), 'terminarlo no sirve: vuelve');
  const sana = inst.programas['RITMO.BAS'].find((l) => !l.virus)!;
  check(paso(`borrar c:\\corazon\\ritmo.bas ${sana.n}`).fallo === true, 'borrar una línea sana cuesta (y le quita algo)');
  sinCuarentena();
  check(paso('reiniciar').fallo === true, 'reiniciar con el virus dentro falla');
  sinCuarentena();
  check(inst.infectadas >= 4, `hay ${inst.infectadas} líneas infectadas`);
  for (const b of sol.borrar) check(paso(b).fallo !== true, `  ${b}`);
  const fin = paso('reiniciar');
  check(fin.resuelto === true, 'con el código limpio, el corazón late en paz');
  check(!dice(corazon.ejecutar('ayuda', { estado: {}, intentos: 0, ahora: 0, traficoActivo: false, semilla })).includes(inst.sumaBuena.toLowerCase()),
    'la ayuda no trae la suma');
}
const a = instanciaDeCorazon('equipo-1'), b = instanciaDeCorazon('equipo-2');
check(a.sumaBuena !== b.sumaBuena || a.anioBueno !== b.anioBueno, 'cada equipo tiene su propio corazón');
console.log(fallos ? `\n❌ ${fallos} fallos` : '\n✅ El Corazón OK');
process.exit(fallos ? 1 : 0);
