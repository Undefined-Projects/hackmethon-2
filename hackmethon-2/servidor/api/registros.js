/* /api/registros — el listado del panel y el borrado de inscripciones.
   Todo protegido con ADMIN_TOKEN: son nombres, CURP, teléfonos y correos
   de estudiantes.

     GET                → lista completa (una fila por persona)
     DELETE ?id=7       → borra esa inscripción
     DELETE ?equipo=3   → borra ese equipo, solo si ya no tiene a nadie
     POST { accion: "mover", id: 7, equipo: 3 }
                        → pasa esa inscripción al equipo 3 (equipo: null
                          la regresa a «PARA ASIGNAR»)
     POST { accion: "clave", equipo: 3 }
                        → le pone al equipo 3 una contraseña nueva al azar
                          y la devuelve UNA vez: en la base solo queda el
                          hash, así que después nadie la puede volver a ver */

import { prepara, sql, leeCupo, leeProximamente, quedan, folio, EQUIPO_MIN, EQUIPO_MAX } from "../lib/db.js";
import { cors } from "../lib/cors.js";
import { revisaToken } from "../lib/auth.js";
import { cifraClave } from "../lib/clave.js";
import { randomInt } from "node:crypto";

export default async function handler(req, res){
  if (cors(req, res)) return;   // respuesta previa del navegador
  res.setHeader("Cache-Control", "no-store");

  if (!["GET", "DELETE", "POST"].includes(req.method)){
    res.setHeader("Allow", "GET, DELETE, POST");
    return res.status(405).json({ mensaje: "MÉTODO NO PERMITIDO." });
  }

  const mal = revisaToken(req);
  if (mal) return res.status(mal.code).json({ mensaje: mal.mensaje });

  try {
    await prepara();
    const q = sql();

    if (req.method === "POST"){
      const c = req.body || {};
      if (c.accion === "mover") return await mover(q, res, c);
      if (c.accion === "clave") return await nuevaClave(q, res, c);
      return res.status(400).json({ mensaje: "ACCIÓN DESCONOCIDA." });
    }

    if (req.method === "DELETE" && new URL(req.url, "http://x").searchParams.has("equipo")){
      const id = Number(new URL(req.url, "http://x").searchParams.get("equipo"));
      if (!Number.isInteger(id) || id < 1)
        return res.status(400).json({ mensaje: "FALTA EL ID DEL EQUIPO." });
      // Con gente adentro no: primero se borran o se mueven sus inscripciones.
      const [fila] = await q`
        delete from equipos e where e.id = ${id}
          and not exists (select 1 from inscripciones i where i.equipo_key = e.equipo_key)
        returning nombre`;
      if (!fila)
        return res.status(409).json({ mensaje: "ESE EQUIPO YA NO EXISTE O TODAVÍA TIENE INTEGRANTES." });
      return res.status(200).json({ ok: true, borrado: fila.nombre });
    }

    if (req.method === "DELETE"){
      const id = Number(new URL(req.url, "http://x").searchParams.get("id"));
      if (!Number.isInteger(id) || id < 1)
        return res.status(400).json({ mensaje: "FALTA EL ID DE LA INSCRIPCIÓN." });

      const [fila] = await q`delete from inscripciones where id = ${id} returning id, nombre, apellidos`;
      if (!fila)
        return res.status(404).json({ mensaje: "ESA INSCRIPCIÓN YA NO EXISTE." });

      const [{ total }] = await q`select count(*)::int as total from inscripciones`;
      const cupo = await leeCupo();
      return res.status(200).json({
        ok: true, borrado: folio(fila.id), nombre: `${fila.nombre} ${fila.apellidos}`,
        cupo, registrados: total, quedan: quedan(cupo, total),
      });
    }

    // la fecha como texto: así no se corre un día por la zona horaria
    const filas = await q`
      select id, nombre, apellidos, correo, telefono, curp, genero, nacimiento::text as nacimiento,
             cp, estudia, institucion, carrera, periodo, semestre, organizacion_tipo, organizacion,
             equipo_modo, equipo, equipo_key,
             privacidad, responsiva, tutor, creado
      from inscripciones order by id asc`;
    const equipos = await q`select id, nombre, equipo_key, logo, creado from equipos order by nombre`;
    const cupo = await leeCupo();

    return res.status(200).json({
      cupo,
      registrados: filas.length,
      quedan: quedan(cupo, filas.length),
      proximamente: await leeProximamente(),
      equipo: { min: EQUIPO_MIN, max: EQUIPO_MAX },
      registros: filas.map(f => ({ ...f, folio: folio(f.id) })),
      equipos: equipos.map(e => ({ ...e, id: Number(e.id) })),
    });

  } catch (e) {
    console.error("registros:", e);
    return res.status(500).json({ mensaje: "NO SE PUDO LEER LA BASE DE DATOS." });
  }
}

/* Cambiar a alguien de equipo. El cupo se revisa en la misma sentencia
   que mueve, no en una consulta aparte antes.
   Quien pidió equipo al registrarse conserva su equipo_modo «asignar»:
   así se sabe que lo acomodó el panel (confirmaciones.js lo lee igual). */
async function mover(q, res, c){
  const id = Number(c.id);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ mensaje: "FALTA EL ID DE LA INSCRIPCIÓN." });

  if (c.equipo === null){
    const [fila] = await q`
      update inscripciones set equipo_key = null, equipo = null, equipo_modo = 'asignar'
      where id = ${id} returning id`;
    if (!fila) return res.status(404).json({ mensaje: "ESA INSCRIPCIÓN YA NO EXISTE." });
    return res.status(200).json({ ok: true, equipo: null });
  }

  const equipo = Number(c.equipo);
  if (!Number.isInteger(equipo) || equipo < 1)
    return res.status(400).json({ mensaje: "FALTA EL EQUIPO DE DESTINO." });
  const [eq] = await q`select nombre, equipo_key from equipos where id = ${equipo}`;
  if (!eq) return res.status(404).json({ mensaje: "ESE EQUIPO YA NO EXISTE." });

  const [fila] = await q`
    update inscripciones set equipo_key = ${eq.equipo_key}, equipo = ${eq.nombre}
    where id = ${id}
      and (equipo_key is distinct from ${eq.equipo_key})
      and (select count(*) from inscripciones where equipo_key = ${eq.equipo_key}) < ${EQUIPO_MAX}
    returning id`;
  if (!fila){
    const [ya] = await q`select equipo_key from inscripciones where id = ${id}`;
    if (!ya) return res.status(404).json({ mensaje: "ESA INSCRIPCIÓN YA NO EXISTE." });
    if (ya.equipo_key === eq.equipo_key)
      return res.status(200).json({ ok: true, equipo: eq.nombre });
    return res.status(409).json({ mensaje: `«${eq.nombre.toUpperCase()}» YA TIENE ${EQUIPO_MAX} INTEGRANTES.` });
  }
  return res.status(200).json({ ok: true, equipo: eq.nombre, equipo_key: eq.equipo_key });
}

/* Contraseña nueva para un equipo: ocho letras y números sin los que se
   confunden al dictarlos o al leerlos (0/o, 1/l/i). En minúsculas, porque
   el registro la compara tal cual y en el teléfono es lo que sale solo. */
const LETRAS = "abcdefghjkmnpqrstuvwxyz23456789";
async function nuevaClave(q, res, c){
  const equipo = Number(c.equipo);
  if (!Number.isInteger(equipo) || equipo < 1)
    return res.status(400).json({ mensaje: "FALTA EL ID DEL EQUIPO." });
  const clave = Array.from({ length: 8 }, () => LETRAS[randomInt(LETRAS.length)]).join("");
  const [fila] = await q`update equipos set clave = ${cifraClave(clave)} where id = ${equipo} returning nombre`;
  if (!fila) return res.status(404).json({ mensaje: "ESE EQUIPO YA NO EXISTE." });
  return res.status(200).json({ ok: true, equipo: fila.nombre, clave });
}
