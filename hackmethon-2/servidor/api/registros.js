/* /api/registros — el listado del panel y el borrado de inscripciones.
   Todo protegido con ADMIN_TOKEN: son nombres, CURP, teléfonos y correos
   de estudiantes.

     GET                → lista completa (una fila por persona)
     DELETE ?id=7       → borra esa inscripción
     DELETE ?equipo=3   → borra ese equipo, solo si ya no tiene a nadie */

import { prepara, sql, leeCupo, leeProximamente, quedan, folio, EQUIPO_MIN, EQUIPO_MAX } from "../lib/db.js";
import { cors } from "../lib/cors.js";
import { revisaToken } from "../lib/auth.js";

export default async function handler(req, res){
  if (cors(req, res)) return;   // respuesta previa del navegador
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET" && req.method !== "DELETE"){
    res.setHeader("Allow", "GET, DELETE");
    return res.status(405).json({ mensaje: "MÉTODO NO PERMITIDO." });
  }

  const mal = revisaToken(req);
  if (mal) return res.status(mal.code).json({ mensaje: mal.mensaje });

  try {
    await prepara();
    const q = sql();

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
             cp, estudia, institucion, carrera, periodo, semestre, equipo_modo, equipo, equipo_key,
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
