/* POST /api/registro — inscripción de UNA persona (Paso 1 del documento
   FORMULARIO_REGISTRO_HACKMETHON_2026.md).
   Cada quien se registra por su cuenta y, sobre el equipo, una de tres:
   se une a uno ya creado (con su contraseña), crea uno (nombre, logo de
   16 × 16 y contraseña) o pide que lo acomoden en uno desde el panel. Guarda en Postgres y, si
   hay llave de Resend, manda el aviso por correo.
   La validación de aquí es un espejo de la del navegador: el cliente valida
   para dar buenos mensajes, el servidor valida porque el cliente es
   modificable por quien sea. */

import { prepara, sql, leeCupo, leeProximamente, quedan, folio, EQUIPO_MAX, logoValido, plano } from "../lib/db.js";
import { cors } from "../lib/cors.js";
import { cifraClave, claveCorrecta } from "../lib/clave.js";
import { limpiaCurp, curpValida, nacimiento, edadDe, limpiaTelefono } from "../lib/curp.js";

const TOPE = { nombre: 60, apellidos: 80, correo: 120, institucion: 80, carrera: 80, equipo: 32 };
const EDAD = { min: 12, max: 99, mayor: 18 };
const GENEROS = ["hombre", "mujer", "otro", "prefiero_no_decir"];
const INSTITUCIONES = ["UTCH", "Tec de Monterrey", "Politécnico (UPCH)", "UACH", "UTCH Sur", "ULSA"];
const EQUIPO_MODOS = ["unirse", "crear", "asignar"];
const CLAVE = { min: 4, max: 64 };   // contraseña del equipo
// cuántos periodos puede llevar cada forma de contar, y cómo se llama
const PERIODO_MAX = { semestre: 12, cuatrimestre: 15, tetramestre: 15, anio: 5 };
const PERIODO_NOMBRE = { semestre: "SEMESTRE", cuatrimestre: "CUATRIMESTRE", tetramestre: "TETRAMESTRE", anio: "AÑO" };

const limpia = (v, max) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const CORREO_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const mal = (res, mensaje) => res.status(400).json({ mensaje });
// Nombres y apellidos: solo letras (con acentos), espacios, apóstrofo,
// punto y guion, y al menos dos letras. «1», «--» o «x» no son un nombre.
const NOMBRE_OK = /^[\p{L}\p{M}' .-]+$/u;
const letras = s => (s.match(/\p{L}/gu) || []).length;
const nombreOk = s => NOMBRE_OK.test(s) && letras(s) >= 2;
// México no tiene códigos postales que empiecen con 00
const CP_OK = /^(?!00)\d{5}$/;

export default async function handler(req, res){
  if (cors(req, res)) return;   // respuesta previa del navegador
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST"){
    res.setHeader("Allow", "POST");
    return res.status(405).json({ mensaje: "MÉTODO NO PERMITIDO." });
  }

  try {
    const c = req.body || {};

    // Campo trampa: está oculto para las personas, así que si viene lleno
    // fue un bot. Se responde 400 sin decirle por qué.
    if (limpia(c.empresa, 40)) return mal(res, "REGISTRO RECHAZADO.");

    const p = {
      nombre:      limpia(c.nombre, TOPE.nombre),
      apellidos:   limpia(c.apellidos, TOPE.apellidos),
      correo:      limpia(c.correo, TOPE.correo).toLowerCase(),
      telefono:    limpiaTelefono(c.telefono),
      curp:        limpiaCurp(c.curp).slice(0, 18),
      genero:      String(c.genero ?? ""),
      nacimiento:  String(c.nacimiento ?? ""),
      cp:          String(c.cp ?? "").replace(/\s+/g, ""),
      estudia:     c.estudia,
      institucion: limpia(c.institucion, TOPE.institucion),
      carrera:     limpia(c.carrera, TOPE.carrera),
      periodo:     String(c.periodo ?? ""),
      semestre:    Number(c.semestre),
      equipoModo:  String(c.equipoModo ?? ""),
      equipo:      limpia(c.equipo, TOPE.equipo),
      equipoId:    Number(c.equipoId),
      equipoClave: String(c.equipoClave ?? "").slice(0, CLAVE.max),
      logo:        String(c.logo ?? ""),
    };

    if (!p.nombre)    return mal(res, "FALTA TU NOMBRE.");
    if (!nombreOk(p.nombre)) return mal(res, "TU NOMBRE SOLO PUEDE LLEVAR LETRAS.");
    if (!p.apellidos) return mal(res, "FALTAN TUS APELLIDOS.");
    if (!nombreOk(p.apellidos)) return mal(res, "TUS APELLIDOS SOLO PUEDEN LLEVAR LETRAS.");
    if (!CORREO_OK.test(p.correo)) return mal(res, "EL CORREO NO ES VÁLIDO.");
    if (!p.telefono)  return mal(res, "EL TELÉFONO NO ES VÁLIDO: SON 10 DÍGITOS.");
    if (!curpValida(p.curp)) return mal(res, "LA CURP NO ES VÁLIDA.");
    if (!GENEROS.includes(p.genero)) return mal(res, "ELIGE UNA OPCIÓN DE GÉNERO.");

    // La fecha de nacimiento tiene que ser la misma que trae la CURP.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.nacimiento)) return mal(res, "FALTA LA FECHA DE NACIMIENTO.");
    if (nacimiento(p.curp).toISOString().slice(0, 10) !== p.nacimiento)
      return mal(res, "LA FECHA DE NACIMIENTO NO COINCIDE CON LA CURP.");
    const edad = edadDe(p.curp);
    if (edad < EDAD.min || edad > EDAD.max)
      return mal(res, `LA EDAD DEBE IR DE ${EDAD.min} A ${EDAD.max} AÑOS.`);

    if (!/^\d{5}$/.test(p.cp)) return mal(res, "EL CÓDIGO POSTAL DEBE TENER 5 DÍGITOS.");
    if (!CP_OK.test(p.cp)) return mal(res, "ESE CÓDIGO POSTAL NO EXISTE.");

    // Escuela: solo si estudia. Si no, esos campos ni se guardan.
    if (typeof p.estudia !== "boolean") return mal(res, "DINOS SI ESTUDIAS ACTUALMENTE.");
    if (p.estudia){
      if (!p.institucion) return mal(res, "FALTA TU UNIVERSIDAD O INSTITUCIÓN.");
      if (letras(p.institucion) < 3) return mal(res, "ESCRIBE EL NOMBRE DE TU ESCUELA.");
      if (!p.carrera)     return mal(res, "FALTA TU CARRERA.");
      if (letras(p.carrera) < 3) return mal(res, "ESCRIBE EL NOMBRE DE TU CARRERA.");
      if (!(p.periodo in PERIODO_MAX)) return mal(res, "DI SI CUENTAS EN SEMESTRES, CUATRIMESTRES, TETRAMESTRES O AÑOS.");
      if (!Number.isInteger(p.semestre) || p.semestre < 1 || p.semestre > PERIODO_MAX[p.periodo])
        return mal(res, `EL ${PERIODO_NOMBRE[p.periodo]} VA DE 1 A ${PERIODO_MAX[p.periodo]}.`);
    } else {
      p.institucion = p.carrera = p.periodo = ""; p.semestre = null;
    }

    if (!EQUIPO_MODOS.includes(p.equipoModo)) return mal(res, "DINOS SI YA TIENES EQUIPO.");
    if (p.equipoModo === "unirse"){
      if (!Number.isInteger(p.equipoId) || p.equipoId < 1) return mal(res, "ELIGE TU EQUIPO DE LA LISTA.");
      if (!p.equipoClave) return mal(res, "FALTA LA CONTRASEÑA DE TU EQUIPO.");
    } else if (p.equipoModo === "crear"){
      if (p.equipo.length < 2) return mal(res, "FALTA EL NOMBRE DE TU EQUIPO.");
      if (!/[\p{L}\d]/u.test(p.equipo)) return mal(res, "EL NOMBRE DEL EQUIPO NECESITA LETRAS O NÚMEROS.");
      if (!logoValido(p.logo)) return mal(res, "DIBUJA EL LOGO DE TU EQUIPO.");
      if (p.equipoClave.length < CLAVE.min)
        return mal(res, `LA CONTRASEÑA DEL EQUIPO DEBE TENER AL MENOS ${CLAVE.min} CARACTERES.`);
    }
    if (p.equipoModo !== "crear") p.equipo = "";

    if (c.privacidad !== true)
      return mal(res, "PARA REGISTRARTE HAY QUE ACEPTAR EL AVISO DE PRIVACIDAD.");
    if (c.responsiva !== true) return mal(res, "FALTA ACEPTAR LA RESPONSIVA.");
    // Menores de edad: hace falta la autorización de su madre, padre o tutor.
    const menor = edad < EDAD.mayor;
    if (menor && c.tutor !== true)
      return mal(res, "ERES MENOR DE EDAD: FALTA CONFIRMAR LA AUTORIZACIÓN DE TU TUTOR.");

    await prepara();
    const q = sql();

    // En modo "próximamente" la portada ni enseña el formulario, pero el
    // servidor también lo cierra: el cliente es modificable.
    if (await leeProximamente())
      return res.status(409).json({ mensaje: "EL REGISTRO TODAVÍA NO ABRE.", lleno: true });

    const [{ total }] = await q`select count(*)::int as total from inscripciones`;
    const cupo = await leeCupo();
    if (cupo > 0 && total >= cupo)                 // 0 = sin límite
      return res.status(409).json({ mensaje: `CUPO LLENO: LOS ${cupo} LUGARES YA ESTÁN OCUPADOS.`, lleno: true });

    // Primero si ya estaba registrado: así quien manda dos veces lo sabe,
    // aunque su equipo ya esté lleno (con él adentro).
    const [ya] = await q`select curp = ${p.curp} as curp from inscripciones
                         where curp = ${p.curp} or correo = ${p.correo} limit 1`;
    if (ya) return res.status(409).json({ mensaje: ya.curp ? "ESA CURP YA ESTÁ REGISTRADA." : "ESE CORREO YA ESTÁ REGISTRADO." });

    // Unirse: el equipo tiene que existir, la contraseña ser la suya y
    // quedar lugar. Crear: el nombre no puede estar tomado (tampoco por
    // un equipo escrito a mano antes de que hubiera logos).
    let equipoKey = null, creado = false;
    if (p.equipoModo === "unirse"){
      const [eq] = await q`
        select e.nombre, e.equipo_key, e.clave,
               (select count(*)::int from inscripciones i where i.equipo_key = e.equipo_key) as n
        from equipos e where e.id = ${p.equipoId}`;
      if (!eq) return res.status(409).json({ mensaje: "ESE EQUIPO YA NO EXISTE. ACTUALIZA LA LISTA." });
      if (!claveCorrecta(p.equipoClave, eq.clave))
        return res.status(409).json({ mensaje: `LA CONTRASEÑA DE «${eq.nombre.toUpperCase()}» NO ES CORRECTA.` });
      if (eq.n >= EQUIPO_MAX)
        return res.status(409).json({ mensaje: `EL EQUIPO «${eq.nombre.toUpperCase()}» YA TIENE ${EQUIPO_MAX} INTEGRANTES.` });
      p.equipo = eq.nombre;
      equipoKey = eq.equipo_key;
    } else if (p.equipoModo === "crear"){
      equipoKey = plano(p.equipo);
      const tomado = `YA HAY UN EQUIPO LLAMADO «${p.equipo.toUpperCase()}». SI ES EL TUYO, ELIGE «YA TENGO EQUIPO».`;
      const [viejo] = await q`select 1 from inscripciones where equipo_key = ${equipoKey} limit 1`;
      if (viejo) return res.status(409).json({ mensaje: tomado });
      try {
        await q`insert into equipos (nombre, equipo_key, logo, clave)
                values (${p.equipo}, ${equipoKey}, ${p.logo}, ${cifraClave(p.equipoClave)})`;
        creado = true;
      } catch (e) {
        if (/duplicate key|unique constraint/i.test(String(e?.message)))
          return res.status(409).json({ mensaje: tomado });
        throw e;
      }
    }

    let fila;
    try {
      [fila] = await q`
        insert into inscripciones
          (nombre, apellidos, correo, telefono, curp, genero, nacimiento, cp,
           estudia, institucion, carrera, periodo, semestre,
           equipo_modo, equipo, equipo_key, privacidad, responsiva, tutor)
        values
          (${p.nombre}, ${p.apellidos}, ${p.correo}, ${p.telefono}, ${p.curp}, ${p.genero},
           ${p.nacimiento}, ${p.cp}, ${p.estudia}, ${p.institucion || null}, ${p.carrera || null},
           ${p.periodo || null}, ${p.semestre}, ${p.equipoModo}, ${p.equipo || null}, ${equipoKey},
           now(), now(), ${menor})
        returning id, creado`;
    } catch (e) {
      // El equipo recién creado no se queda huérfano en la lista.
      if (creado) await q`delete from equipos where equipo_key = ${equipoKey}`.catch(() => {});
      // Los índices únicos de correo y CURP son la defensa real contra
      // dobles envíos: dos peticiones simultáneas no pueden colarse las dos.
      const m = String(e?.message);
      if (/inscripciones_curp/i.test(m)) return res.status(409).json({ mensaje: "ESA CURP YA ESTÁ REGISTRADA." });
      if (/duplicate key|unique constraint/i.test(m))
        return res.status(409).json({ mensaje: "ESE CORREO YA ESTÁ REGISTRADO." });
      throw e;
    }

    const clave = folio(fila.id);
    // El correo no debe hacer fallar el registro: ya quedó guardado.
    avisa({ folio: clave, edad, ...p }).catch(e =>
      console.error("No se pudo mandar el aviso por correo:", e?.message));

    return res.status(201).json({ ok: true, folio: clave, quedan: quedan(cupo, total + 1) });

  } catch (e) {
    console.error("registro:", e);
    return res.status(500).json({ mensaje: "EL SERVIDOR NO PUDO GUARDAR EL REGISTRO. INTENTA DE NUEVO." });
  }
}

const EQUIPO_TEXTO = { unirse: "Se unió a", crear: "Creó el equipo", asignar: "No tiene, que lo asignen" };

/* Aviso por correo con la API REST de Resend. Sin SDK: es una sola petición
   y así hay una dependencia menos que mantener al día. */
async function avisa(r){
  const llave     = process.env.RESEND_API_KEY;
  const para      = process.env.CORREO_REGISTROS;
  const remitente = process.env.CORREO_REMITENTE;
  if (!llave || !para || !remitente) return;   // sin configurar: se omite

  // La CURP, el código postal y la fecha de nacimiento no viajan por
  // correo: se consultan en el panel.
  const texto = [
    `REGISTRO HACK(ME)THON 2.0 · ${r.folio}`,
    "=".repeat(40),
    `NOMBRE ......... ${r.nombre} ${r.apellidos}`,
    `CORREO ......... ${r.correo}`,
    `TELÉFONO ....... ${r.telefono}`,
    `EDAD ........... ${r.edad} años${r.edad < 18 ? " (menor: tutor autorizó)" : ""}`,
    `ESTUDIA ........ ${r.estudia ? `${r.institucion} · ${r.carrera} · ${PERIODO_NOMBRE[r.periodo].toLowerCase()} ${r.semestre}` : "No"}`,
    `EQUIPO ......... ${EQUIPO_TEXTO[r.equipoModo]}${r.equipo ? `: ${r.equipo}` : ""}`,
  ].join("\n");

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${llave}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: remitente,
      to: [para],
      reply_to: r.correo,
      subject: `Registro HACK(ME)THON 2.0 · ${r.nombre} ${r.apellidos} (${r.folio})`,
      text: texto,
    }),
  });
  if (!resp.ok) throw new Error(`Resend respondió ${resp.status}: ${await resp.text()}`);
}
