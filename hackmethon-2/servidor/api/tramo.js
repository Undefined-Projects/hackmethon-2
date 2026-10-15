/* POST /api/tramo — la semilla del siguiente tramo de BYPASS.

   El azar de la partida va por tramos de 10 válvulas, cada uno con su
   semilla (ver TRAMO en el motor). La del tramo 0 viene en el token; la
   del tramo k solo se da si el jugador demuestra que ya va cerca: manda
   sus latidos y sus pruebas hasta ahora, el servidor vuelve a jugar la
   partida y revisa que
   - el token lo haya firmado él y no haya caducado,
   - la partida cuadre, siga viva y no vaya más rápido que el tiempo real,
   - y ya hayan nacido 10·k − 5 válvulas.
   Así el navegador nunca conoce más que el tramo en curso y el siguiente:
   un bot no puede simular la partida entera ni elegir semillas fáciles.

   Cuerpo: { token, k, pasos, latidos, pruebas }. Responde { k, semilla }.
   Sin base de datos: la firma del token basta. */

import { cors } from "../lib/cors.js";
import { leePartida, revisaJugada, semillasDe, motor, VIGENCIA_MS } from "../lib/bypass.js";

const TOPE_TRAMO = 1000;

export default function handler(req, res){
  if (cors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST"){
    res.setHeader("Allow", "POST");
    return res.status(405).json({ mensaje: "MÉTODO NO PERMITIDO." });
  }
  try {
    const cuerpo = req.body || {};
    const partida = leePartida(cuerpo.token);
    if (!partida || partida.v !== motor.VERSION || Date.now() - partida.t > VIGENCIA_MS)
      return res.status(400).json({ mensaje: "LA PARTIDA NO ES VÁLIDA." });
    const k = Number(cuerpo.k);
    if (!Number.isInteger(k) || k < 1 || k > TOPE_TRAMO)
      return res.status(400).json({ mensaje: "ESE TRAMO NO EXISTE." });

    const j = revisaJugada(partida, cuerpo);
    if (j.error) return res.status(400).json({ mensaje: j.error });
    const { r, pasos } = j;
    if (!r.vivo || r.pasos !== pasos)
      return res.status(400).json({ mensaje: "LA PARTIDA NO CUADRA CON LA SIMULACIÓN." });
    if (r.nacidas < motor.TRAMO.valvulas * k - motor.TRAMO.anticipo)
      return res.status(403).json({ mensaje: "TODAVÍA NO LLEGAS A ESE TRAMO." });

    return res.status(200).json({ k, semilla: semillasDe(partida)(k) });
  } catch (e) {
    console.error("tramo:", e);
    return res.status(500).json({ mensaje: "EL SERVIDOR NO PUDO PREPARAR EL TRAMO." });
  }
}
