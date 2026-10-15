/* Conexión a Neon y esquema. Lo comparten las funciones de /api. */

import { neon } from "@neondatabase/serverless";

let conexion = null;

export function sql(){
  if (!conexion){
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta DATABASE_URL");
    conexion = neon(url);
  }
  return conexion;
}

/* Cuántas personas caben cuando nadie lo ha cambiado desde el panel.
   0 = SIN LÍMITE, que es lo de la 2.0: sin CUPO_EQUIPOS no hay tope.
   (La variable conserva su nombre de la 1ª edición, cuando se contaban
   equipos; desde el registro por persona cuenta personas.) */
const cupoEnv = Number(process.env.CUPO_EQUIPOS);
export const CUPO_POR_DEFECTO = Number.isInteger(cupoEnv) && cupoEnv > 0 ? cupoEnv : 0;

/* Los equipos son de 3 a 5 personas. Cada quien se inscribe por su cuenta;
   quien pone el nombre de un equipo que ya tiene EQUIPO_MAX inscritos es
   rechazado. Los incompletos se consolidan después desde el panel. */
export const EQUIPO_MIN = 3, EQUIPO_MAX = 5;

/* El logo de cada equipo: 16 × 16 pixeles, uno por carácter, de izquierda a
   derecha y de arriba abajo. Cada carácter es un color de la paleta de
   sitio/config.js (LOGO.paleta); 0 = vacío. */
export const LOGO_LADO = 16, LOGO_COLORES = 8;
const LOGO_OK = new RegExp(`^[0-${LOGO_COLORES - 1}]{${LOGO_LADO * LOGO_LADO}}$`);
export const logoValido = logo => LOGO_OK.test(logo) && /[^0]/.test(logo);

/* Para juntar los nombres de equipo: sin acentos, mayúsculas ni espacios de más. */
export const plano = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/* Lugares que quedan, o null si no hay límite. */
export const quedan = (cupo, total) => cupo > 0 ? Math.max(cupo - total, 0) : null;

/* Crea la tabla si no existe. Se llama en cada invocación pero solo hace
   trabajo la primera vez de cada instancia: `create table if not exists`
   es barato y así no hay migraciones que correr a mano. */
let listo = false;
export async function prepara(){
  if (listo) return;
  const q = sql();
  await q`
    create table if not exists registros (
      id          bigserial   primary key,
      equipo      text        not null,
      equipo_key  text        not null unique,
      correo      text        not null unique,
      lider       int         not null,
      integrantes jsonb       not null,
      emblema     text        not null,
      creado      timestamptz not null default now()
    )`;
  // cuándo aceptó el equipo el aviso de privacidad (y, si hay menores,
  // la autorización de su tutor)
  await q`alter table registros add column if not exists privacidad timestamptz`;
  await q`alter table registros add column if not exists tutor boolean`;
  /* Inscripciones por persona (Paso 1 de FORMULARIO_REGISTRO_HACKMETHON_2026.md).
     Reemplazan a `registros` (un renglón por equipo, con su emblema), que se
     queda como estaba por si tuviera algo de antes. */
  await q`
    create table if not exists inscripciones (
      id          bigserial   primary key,
      nombre      text        not null,
      apellidos   text        not null,
      correo      text        not null unique,
      telefono    text        not null,
      curp        text        not null unique,
      genero      text        not null,
      nacimiento  date        not null,
      cp          text        not null,
      estudia     boolean     not null,
      institucion text,
      carrera     text,
      periodo     text,
      semestre    int,
      equipo_modo text        not null,
      equipo      text,
      equipo_key  text,
      privacidad  timestamptz not null,
      responsiva  timestamptz not null,
      tutor       boolean     not null default false,
      creado      timestamptz not null default now()
    )`;
  await q`create index if not exists inscripciones_equipo on inscripciones (equipo_key)`;
  // La responsiva pedía el nombre escrito como firma; desde el 12-oct-2026
  // basta con la casilla. La columna se queda (vacía) donde ya existía.
  await q`alter table inscripciones add column if not exists firma text`;
  await q`alter table inscripciones alter column firma drop not null`;
  /* Equipos (desde el 12-oct-2026): quien crea uno le pone nombre, logo y
     contraseña; los demás lo eligen de la lista y dan la contraseña. Los
     integrantes se cuentan por equipo_key en inscripciones. */
  await q`
    create table if not exists equipos (
      id          bigserial   primary key,
      nombre      text        not null,
      equipo_key  text        not null unique,
      logo        text        not null,
      clave       text        not null,
      creado      timestamptz not null default now()
    )`;
  /* Ajustes que se cambian desde el panel. El cupo vive aquí, no en la
     variable de entorno, porque una variable no se puede cambiar en caliente:
     habría que redesplegar cada vez. */
  await q`
    create table if not exists ajustes (
      clave       text        primary key,
      valor       text        not null,
      actualizado timestamptz not null default now()
    )`;
  /* Cambio de edición, una sola vez. La 2.0 se desplegó sobre el mismo
     servidor y la misma base que la 1ª, así que al primer arranque los
     equipos de la 1ª se copian a registros_1a_edicion, se comprueba que la
     copia tenga las mismas filas, y SOLO ENTONCES se vacía registros. También
     se olvida el cupo que guardó el panel de la 1ª (era un tope de 10; la
     2.0 no tiene límite). La marca 'edicion' = '2' hace que no se repita.
     Si dos instancias arrancan a la vez, la segunda encuentra la copia hecha
     y los conteos ya no cuadran, así que no vacía nada de más. */
  const [marca] = await q`select valor from ajustes where clave = 'edicion'`;
  if (marca?.valor !== "2"){
    const [{ n }] = await q`select count(*)::int as n from registros`;
    if (n > 0){
      await q`create table if not exists registros_1a_edicion as select * from registros`;
      const [{ copia }] = await q`select count(*)::int as copia from registros_1a_edicion`;
      if (copia === n) await q`truncate table registros restart identity`;
      else throw new Error(`La copia de la 1ª edición no cuadra (${copia} de ${n}); no se vació nada.`);
    }
    await q`delete from ajustes where clave = 'cupo'`;
    await q`
      insert into ajustes (clave, valor) values ('edicion', '2')
      on conflict (clave) do update set valor = excluded.valor, actualizado = now()`;
  }

  /* BYPASS, el minijuego. Una fila por partida registrada (el id de la
     partida es único: una semilla firmada solo se puede usar una vez) y
     una fila por correo con su mejor puntaje, que es lo que sale en la
     tabla. En empate gana quien lo logró primero. */
  await q`
    create table if not exists bypass_partidas (
      id          text        primary key,
      correo      text        not null,
      puntos      int         not null,
      pasos       int         not null,
      creado      timestamptz not null default now()
    )`;
  // la repetición de cada partida, para revisarla desde el panel
  await q`alter table bypass_partidas add column if not exists semilla   bigint`;
  await q`alter table bypass_partidas add column if not exists latidos   jsonb`;
  await q`alter table bypass_partidas add column if not exists aparicion int`;
  // desde la versión 4 hay varias pruebas: el paso en que salió cada una
  await q`alter table bypass_partidas add column if not exists apariciones jsonb`;
  // con qué versión del motor se jugó: solo las de la actual se pueden ver
  await q`alter table bypass_partidas add column if not exists version int`;
  await q`
    create table if not exists bypass_puntajes (
      correo      text        primary key,
      alias       text        not null,
      puntos      int         not null,
      partida     text        not null,
      logrado     timestamptz not null default now()
    )`;
  // la contraseña de cada jugador (sal:hash) — ver lib/bypass.js
  await q`alter table bypass_puntajes add column if not exists clave text`;
  // un alias, un dueño. Si ya hubiera alias repetidos de antes, el índice
  // no se puede crear: se sigue sin él y el código revisa igual.
  try { await q`create unique index if not exists bypass_puntajes_alias on bypass_puntajes (alias)`; }
  catch (e) { console.warn("No se creó el índice único de alias:", e?.message); }
  listo = true;
}

/* Cupo vigente: lo que diga la tabla, y si nadie lo ha tocado, la variable
   de entorno. 0 = sin límite. */
export async function leeCupo(){
  const filas = await sql()`select valor from ajustes where clave = 'cupo'`;
  const n = Number(filas[0]?.valor);
  return filas.length && Number.isInteger(n) && n >= 0 ? n : CUPO_POR_DEFECTO;
}

export async function guardaCupo(n){
  await sql()`
    insert into ajustes (clave, valor) values ('cupo', ${String(n)})
    on conflict (clave) do update set valor = excluded.valor, actualizado = now()`;
}

/* Modo "próximamente": la portada solo enseña la primera pantalla (título,
   monitor y minijuego) y el registro no acepta altas. Vive en la
   misma tabla de ajustes que el cupo, así que se cambia en caliente desde el
   panel. Sin fila —nadie lo ha tocado todavía— está ACTIVO: la página
   arranca en "próximamente" y se abre a mano desde el panel. */
export async function leeProximamente(){
  const filas = await sql()`select valor from ajustes where clave = 'proximamente'`;
  return filas.length ? filas[0].valor === "1" : true;
}

export async function guardaProximamente(activo){
  await sql()`
    insert into ajustes (clave, valor) values ('proximamente', ${activo ? "1" : "0"})
    on conflict (clave) do update set valor = excluded.valor, actualizado = now()`;
}

export const folio = id => "HMT-" + String(id).padStart(3, "0");
