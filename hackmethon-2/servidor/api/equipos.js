/* GET /api/equipos — los equipos registrados, para que quien ya tiene
   equipo elija el suyo en el formulario. Público a propósito: solo lleva
   nombre, logo y cuántos van; ni la contraseña ni quiénes son. */

import { prepara, sql, EQUIPO_MAX } from "../lib/db.js";
import { cors } from "../lib/cors.js";

export default async function handler(req, res){
  if (cors(req, res)) return;   // respuesta previa del navegador
  // Corto: quien acaba de crear su equipo le pasa el aviso al resto y
  // tienen que verlo casi enseguida.
  res.setHeader("Cache-Control", "public, max-age=5");

  if (req.method !== "GET"){
    res.setHeader("Allow", "GET");
    return res.status(405).json({ mensaje: "MÉTODO NO PERMITIDO." });
  }

  try {
    await prepara();
    const filas = await sql()`
      select e.id, e.nombre, e.logo, count(i.id)::int as integrantes
      from equipos e left join inscripciones i on i.equipo_key = e.equipo_key
      group by e.id
      order by e.nombre`;
    return res.status(200).json({ max: EQUIPO_MAX, equipos: filas.map(f => ({ ...f, id: Number(f.id) })) });
  } catch (e) {
    console.error("equipos:", e);
    return res.status(500).json({ mensaje: "NO SE PUDIERON LEER LOS EQUIPOS." });
  }
}
