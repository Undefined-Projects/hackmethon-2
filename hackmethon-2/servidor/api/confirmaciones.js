/* /api/confirmaciones — el correo de confirmación desde el panel.
   Protegido con ADMIN_TOKEN.
     GET                    a quién ya le llegó y a quién no
     GET ?vista=ID          el correo tal como le llegaría a esa persona
                            ({ asunto, para, html }), para revisarlo
     POST { ids: [1, 2] }   se lo manda a esas personas (solo si no lo
                            tienen, salvo { forzar: true })
   Sirve para quienes se registraron antes de que existiera el correo
   (10-nov-2026) y para reintentar si Resend falló al registrar.
   Va con la API de lotes de Resend: hasta 100 correos en una petición. */

import { prepara, sql, folio, EQUIPO_MAX } from "../lib/db.js";
import { cors } from "../lib/cors.js";
import { revisaToken } from "../lib/auth.js";
import { edadDe } from "../lib/curp.js";
import { paraResend } from "../lib/confirmacion.js";

const LOTE = 100;   // lo más que acepta /emails/batch

async function inscritos(q, ids){
  const filas = await q`
    select i.id, i.nombre, i.apellidos, i.correo, i.curp, i.tutor,
           i.equipo_modo, i.equipo, i.equipo_key, i.confirmacion, i.creado,
           e.nombre as equipo_nombre, e.logo,
           (select count(*)::int from inscripciones x
             where x.equipo_key = i.equipo_key) as integrantes
    from inscripciones i
    left join equipos e on e.equipo_key = i.equipo_key
    where ${ids ?? null}::bigint[] is null or i.id = any(${ids ?? null}::bigint[])
    order by i.id`;
  return filas.map(f => {
    const edad = edadDe(f.curp);
    // Si el panel ya acomodó a alguien que pidió equipo, ahora tiene uno.
    const modo = f.equipo_modo === "asignar" && f.equipo_key ? "unirse" : f.equipo_modo;
    return {
      id: f.id, folio: folio(f.id), nombre: f.nombre, apellidos: f.apellidos, correo: f.correo,
      edad: f.tutor && edad >= 18 ? 17 : edad,   // menor al registrarse = menor
      equipoModo: modo, equipo: f.equipo_nombre || f.equipo || "", logo: f.logo || "",
      integrantes: f.equipo_key ? f.integrantes : 0, equipoMax: EQUIPO_MAX,
      confirmacion: f.confirmacion, creado: f.creado,
    };
  });
}

export default async function handler(req, res){
  if (cors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET" && req.method !== "POST"){
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ mensaje: "MÉTODO NO PERMITIDO." });
  }
  const mal = revisaToken(req);
  if (mal) return res.status(mal.code).json({ mensaje: mal.mensaje });

  try {
    await prepara();
    const q = sql();

    if (req.method === "GET"){
      const vista = Number(new URL(req.url, "http://x").searchParams.get("vista"));
      if (vista){
        const [r] = await inscritos(q, [vista]);
        if (!r) return res.status(404).json({ mensaje: "NO EXISTE ESE REGISTRO." });
        const c = paraResend(r);
        return res.status(200).json({ asunto: c.subject, para: r.correo, html: c.html, enviado: r.confirmacion });
      }
      const todos = await inscritos(q);
      return res.status(200).json({
        enviados:   todos.filter(r => r.confirmacion).length,
        pendientes: todos.filter(r => !r.confirmacion).length,
        lista: todos.map(r => ({
          id: r.id, folio: r.folio, nombre: `${r.nombre} ${r.apellidos}`, correo: r.correo,
          equipo: r.equipo, modo: r.equipoModo, menor: r.edad < 18, confirmacion: r.confirmacion,
        })),
      });
    }

    const c = req.body || {};
    const ids = Array.isArray(c.ids) ? [...new Set(c.ids.map(Number).filter(n => Number.isInteger(n) && n > 0))] : [];
    if (!ids.length) return res.status(400).json({ mensaje: "NO HAY A QUIÉN MANDARLE." });
    if (ids.length > LOTE) return res.status(400).json({ mensaje: `DE ${LOTE} EN ${LOTE} COMO MÁXIMO.` });

    const llave = process.env.RESEND_API_KEY, remitente = process.env.CORREO_REMITENTE;
    if (!llave || !remitente) return res.status(500).json({ mensaje: "FALTA CONFIGURAR RESEND EN EL SERVIDOR." });

    const destino = (await inscritos(q, ids)).filter(r => c.forzar === true || !r.confirmacion);
    if (!destino.length) return res.status(200).json({ ok: true, enviados: 0, mensaje: "YA LES HABÍA LLEGADO A TODOS." });

    const resp = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { authorization: `Bearer ${llave}`, "content-type": "application/json" },
      body: JSON.stringify(destino.map(r => ({ from: remitente, ...paraResend(r) }))),
      signal: AbortSignal.timeout(25000),
    });
    if (!resp.ok){
      const detalle = await resp.text();
      console.error("confirmaciones: Resend respondió", resp.status, detalle);
      return res.status(502).json({ mensaje: `RESEND NO LOS ACEPTÓ (${resp.status}). NO SE MANDÓ NINGUNO.` });
    }

    const enviados = destino.map(r => r.id);
    await q`update inscripciones set confirmacion = now() where id = any(${enviados})`;
    return res.status(200).json({ ok: true, enviados: enviados.length, folios: destino.map(r => r.folio) });

  } catch (e) {
    console.error("confirmaciones:", e);
    return res.status(500).json({ mensaje: "NO SE PUDO. INTENTA DE NUEVO." });
  }
}
