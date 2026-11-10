/* Correo de confirmación para quien se registra (Paso 1 del documento
   FORMULARIO_REGISTRO_HACKMETHON_2026.md). Lo manda api/registro.js con
   Resend, sin bloquear la respuesta: si falla, el registro ya quedó.

   HTML con tablas y estilos en línea (lo único que respetan Gmail y
   Outlook) y una versión en texto plano. Sin CURP, código postal ni fecha
   de nacimiento: un correo pasa por muchos servidores.

   Los datos del evento son los mismos de sitio/config.js; si cambian
   allá, hay que cambiarlos aquí. */

import QR from "qrcode";

export const EVENTO = {
  fecha:    "Sábado 28 de noviembre de 2026",
  horario:  "16:00 a 22:00",
  sede:     "Auditorio MENLO · Tec de Monterrey, Campus Chihuahua",
  mapa:     "https://www.google.com/maps/search/?api=1&query=28.674654589507416,-106.08023320217369",
  portada:  "https://undefinedclub.org/hackmethon/",
  imagen:   "https://undefinedclub.org/hackmethon/corazon-180.png",
  // Blanco sobre transparente: va sobre el fondo oscuro del correo.
  undefined: "https://undefinedclub.org/hackmethon/undefined-projects.png",
  club:     "https://undefinedclub.org/",
  contacto: "contacto@undefinedclub.org",
  carta:    "https://undefinedclub.org/hackmethon/carta-permiso.pdf",
  whatsapp: "https://chat.whatsapp.com/HN3tOtNVt4pI1UIykelnR1?s=cl&p=a&iam=2",
};

const C = {
  fondo: "#0a070c", panel: "#140d17", borde: "#3a1f36",
  phos: "#fa39ba", hi: "#ffd3ee", suave: "#ddb0cd", tenue: "#b0559b",
  verde: "#3ddc97",
};
const MONO = "'Courier New',Courier,monospace";
// Fondos de mejora progresiva: Apple Mail, Gmail web y la mayoría los
// pintan; donde no, queda el color liso de bgcolor.
const FONDO  = "radial-gradient(ellipse at 50% 0%,rgba(163,33,152,.35),rgba(10,7,12,0) 60%),radial-gradient(ellipse at 50% 100%,rgba(61,220,151,.10),rgba(10,7,12,0) 55%)";
const RAYADO = "repeating-linear-gradient(0deg,rgba(250,57,186,.045) 0,rgba(250,57,186,.045) 1px,rgba(0,0,0,0) 1px,rgba(0,0,0,0) 3px)";

/* La paleta del logo de equipo: la misma de LOGO.paleta en sitio/config.js
   (índice 0 = vacío). */
const PALETA = [null, "#fa39ba", "#ffd3ee", "#b0559b", "#a32198", "#4f86ee", "#21498e", "#3ddc97"];
const LADO = 16;

/* Una cuadrícula de pixeles como tabla HTML: Gmail no muestra imágenes en
   data: y así no hay que subir nada a ningún lado (y se ve aunque el
   programa de correo bloquee las imágenes). Los pixeles seguidos del mismo
   color se juntan en una celda (colspan), y las celdas van sin estilos
   repetidos, para no pasar de los 102 KB en que Gmail corta los correos.
   `colorEn(x, y)` da el color del pixel o null para el fondo. */
function pixeles(ancho, alto, colorEn, px, fondo, estilo = ""){
  const filas = [];
  for (let y = 0; y < alto; y++){
    let celdas = "";
    for (let x = 0; x < ancho;){
      const color = colorEn(x, y) || fondo;
      let n = 1;
      while (x + n < ancho && (colorEn(x + n, y) || fondo) === color) n++;
      // Sin color (fondo null) la celda es transparente y deja ver el rayado.
      celdas += `<td${n > 1 ? ` colspan="${n}"` : ""}${color ? ` bgcolor="${color}"` : ""} height="${px}"></td>`;
      x += n;
    }
    filas.push(`<tr style="height:${px}px;font-size:0;line-height:0">${celdas}</tr>`);
  }
  // Fila guía con una celda por columna: sin ella los colspan no cuadran.
  const guia = `<tr style="font-size:0;line-height:0">${`<td width="${px}"></td>`.repeat(ancho)}</tr>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${fondo ? ` bgcolor="${fondo}"` : ""} style="border-collapse:collapse;table-layout:fixed;width:${ancho * px}px;${estilo}">${guia}${filas.join("")}</table>`;
}

/* Lienzo para dibujar pixel art: get/set y a tabla. */
function lienzo(ancho, alto){
  const g = Array.from({ length: alto }, () => Array(ancho).fill(null));
  return {
    set(x, y, c){ if (x >= 0 && y >= 0 && x < ancho && y < alto) g[y][x] = c; },
    // Un sprite de texto: cada carácter es una llave de `colores` ("." vacío).
    sello(x0, y0, filas, colores){
      filas.forEach((f, y) => [...f].forEach((ch, x) => { if (colores[ch]) this.set(x0 + x, y0 + y, colores[ch]); }));
    },
    tabla(px, fondo, estilo){ return pixeles(ancho, alto, (x, y) => g[y][x], px, fondo, estilo); },
  };
}

/* El logo del equipo: 256 caracteres, uno por pixel. */
function logoHtml(logo, px = 7){
  if (!/^[0-7]{256}$/.test(logo || "")) return "";
  return pixeles(LADO, LADO, (x, y) => PALETA[Number(logo[y * LADO + x])], px, C.panel,
                 `border:1px solid ${C.borde}`);
}

/* El QR del folio para el check-in. Módulos casi negros sobre rosa muy
   claro (el contraste que piden los lectores), los tres ojos en violeta y
   un corazón en el centro. El corazón tapa módulos: por eso va con
   corrección de errores H (recupera hasta 30 %). Para «HMT-NNNN» sigue
   saliendo un QR de 21 × 21. Lleva solo el folio, que es lo que se busca
   en el panel. Con margen de 4 módulos: sin él muchos lectores no leen. */
const QR_TINTA = "#1a0b1f", QR_PAPEL = "#fff0f8", QR_OJO = "#a32198";
const MARGEN_QR = 4;
const CORAZON = [".mm.mm.", "mhmmmmm", "mmmmmmm", ".mmmmm.", "..mmm..", "...m..."];
function qrHtml(texto, px = 7){
  const m = QR.create(texto, { errorCorrectionLevel: "H" }).modules;
  const n = m.size, lado = n + 2 * MARGEN_QR, L = lienzo(lado, lado);
  const ojo = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++){
    if (!m.get(y, x)) continue;
    // El anillo de cada ojo en violeta; el centro 3 × 3, en tinta.
    const enOjo = ojo(x, y), cx = x < 7 ? 3 : n - 4, cy = y < 7 ? 3 : n - 4;
    const centro = Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1;
    L.set(x + MARGEN_QR, y + MARGEN_QR, enOjo && !centro ? QR_OJO : QR_TINTA);
  }
  // Hueco de papel de 9 × 8 en el centro y el corazón adentro.
  const c = Math.floor(lado / 2);
  for (let y = c - 4; y <= c + 3; y++) for (let x = c - 4; x <= c + 4; x++) L.set(x, y, QR_PAPEL);
  L.sello(c - 3, c - 3, CORAZON, { m: C.phos, h: C.hi });
  return L.tabla(px, QR_PAPEL);
}

/* Tira de ECG en barrido, como el monitor de la portada: trazo viejo
   tenue, el barrido brillante con su punta, y el hueco que va borrando. */
function ecgHtml(ancho = 76, px = 4){
  const alto = 13, base = 8, L = lienzo(ancho, alto);
  const LATIDO = [0, 0, -1, -2, -1, 0, 0, 1, -4, -8, -3, 4, 2, 0, 0, -1, -2, -2, -1, 0];
  const y = x => {
    const i = (x - 6) % 38;
    return base + (i >= 0 && i < LATIDO.length ? LATIDO[i] : 0);
  };
  const punta = 52, hueco = 6;
  for (let x = 0; x < ancho; x++){
    if (x > punta && x <= punta + hueco) continue;
    const color = x === punta ? C.hi : x > punta - 26 && x < punta ? C.phos : C.tenue;
    const y0 = y(x), y1 = x + 1 < ancho ? y(x + 1) : y0;
    for (let k = Math.min(y0, y1); k <= Math.max(y0, y1); k++) L.set(x, k, color);
  }
  return L.tabla(px, null);
}

/* Una pista de circuito que creció como enredadera: giros de 45°, vías
   de soldadura, hojas y una flor (sitio/jardin.js en chiquito). */
function enredaderaHtml(ancho = 76, px = 4){
  const alto = 11, L = lienzo(ancho, alto);
  const PISTA = "#23805a", HOJA = C.verde, HOJA_HI = "#b4f5d4";
  // [x, y] de cada vértice; entre vértices, recto o a 45°.
  const ruta = [[0, 8], [14, 8], [18, 4], [30, 4], [34, 8], [50, 8], [53, 5], [64, 5], [67, 8], [75, 8]];
  for (let i = 0; i + 1 < ruta.length; i++){
    let [x, y] = ruta[i]; const [x1, y1] = ruta[i + 1];
    while (x <= x1){
      L.set(x, y, PISTA);
      if (y !== y1 && x !== x1) y += Math.sign(y1 - y);
      x++;
    }
  }
  const via = (x, y) => L.sello(x - 1, y - 1, ["vvv", "v.v", "vvv"], { v: HOJA });
  [[14, 8], [34, 8], [64, 5]].forEach(([x, y]) => via(x, y));
  const hojaDer = ["..hl", ".hl.", "s..."], hojaIzq = ["lh..", ".lh.", "...s"];
  const col = { h: HOJA_HI, l: HOJA, s: PISTA };
  L.sello(6, 5, hojaDer, col);  L.sello(22, 1, hojaIzq, col); L.sello(26, 1, hojaDer, col);
  L.sello(42, 5, hojaIzq, col); L.sello(56, 2, hojaDer, col); L.sello(70, 5, hojaIzq, col);
  // La flor, con su tallo hasta la pista.
  L.sello(45, 0, [".f.", "fcf", ".f.", ".s.", ".s.", ".s.", ".s."], { f: C.phos, c: C.hi, s: PISTA });
  // Raíces que cuelgan de la pista.
  L.sello(9, 9, ["s.", ".s"], { s: PISTA }); L.sello(58, 9, [".s", "s."], { s: PISTA });
  return L.tabla(px, null);
}

/* Las esquinas de visor alrededor del QR. */
function visor(contenido, color = C.phos, t = 3, l = 18){
  const esq = (bordes) => `<td width="${l}" height="${l}" style="width:${l}px;height:${l}px;font-size:0;line-height:0;${bordes}"></td>`;
  const b = `${t}px solid ${color}`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
    <tr>${esq(`border-top:${b};border-left:${b}`)}<td></td>${esq(`border-top:${b};border-right:${b}`)}</tr>
    <tr><td></td><td style="padding:2px">${contenido}</td><td></td></tr>
    <tr>${esq(`border-bottom:${b};border-left:${b}`)}<td></td>${esq(`border-bottom:${b};border-right:${b}`)}</tr>
  </table>`;
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

/* Todo lo que cambia según el caso: si creó equipo, se unió a uno o
   pidió que lo acomoden, y si es menor de edad. */
function caso(r){
  const menor = r.edad < 18;
  const max = r.equipoMax || 5, n = r.integrantes || 0;
  const faltan = Math.max(max - n, 0);
  const lugares = k => `${k} ${k === 1 ? "lugar" : "lugares"}`;
  const menores = menor
    ? " Si en tu equipo hay más menores de edad, cada quien necesita su propia carta de permiso."
    : "";

  if (r.equipoModo === "crear") return {
    menor,
    asunto: `Estás dentro: «${r.equipo}» ya existe · ${r.folio}`,
    intro:  `Tu registro quedó listo y tu equipo «${r.equipo}» ya está dado de alta. Por ahora solo estás tú: faltan los demás.`,
    previa: `Tu equipo «${r.equipo}» ya existe. Pásales la contraseña a los demás.`,
    eq: {
      titulo: `Creaste el equipo «${r.equipo}»`,
      cuenta: `1 de ${max} integrantes · quedan ${lugares(max - 1)}`,
      clave:  r.equipoClave,
      texto:  `Pásale a tu equipo el nombre y esta contraseña: con eso se unen desde el registro, en «Ya tengo equipo». No la compartas fuera del equipo: quien la tenga puede entrar.${menores}`,
    },
  };

  if (r.equipoModo === "unirse") return {
    menor,
    asunto: `Estás dentro: ya operas con «${r.equipo}» · ${r.folio}`,
    intro:  `Tu registro quedó listo y ya eres parte de «${r.equipo}».`,
    previa: `Ya eres parte de «${r.equipo}». Te esperamos el ${EVENTO.fecha}.`,
    eq: {
      titulo: `Te uniste a «${r.equipo}»`,
      cuenta: n ? `${n} de ${max} integrantes${faltan ? ` · quedan ${lugares(faltan)}` : " · equipo completo"}` : "",
      texto:  faltan
        ? `Si alguien más va con ustedes, que se registre y elija «${r.equipo}» con la misma contraseña.${menores}`
        : `Con tu registro el equipo quedó completo: nadie más puede unirse.${menores}`,
    },
  };

  return {
    menor,
    asunto: `Estás dentro: te vamos a asignar equipo · ${r.folio}`,
    intro:  "Tu registro quedó listo. Todavía no tienes equipo, y está bien: te vamos a acomodar con otras personas que también vienen solas.",
    previa: "Tu registro quedó listo. Nosotros te acomodamos en un equipo.",
    eq: {
      titulo: "Te vamos a acomodar en un equipo",
      cuenta: "",
      texto:  "Antes del evento te avisamos con quién vas a operar, por este correo o por el grupo de WhatsApp. Si mientras tanto armas equipo con alguien, escríbenos y te cambiamos.",
    },
  };
}

/* Para la madre, el padre o el tutor de quien es menor de edad. */
const TUTOR = {
  titulo: "PARA TU MADRE, PADRE O TUTOR",
  carta:  "Para entrar necesitas traer una carta de permiso firmada por tu madre, padre o tutor. Sin ella no podemos dejarte pasar.",
  texto:  `Reenvíales este correo. Descarguen el formato, imprímanlo, llénenlo y fírmenlo: ahí van su nombre, su firma y un teléfono para localizarlos durante el evento. El evento es gratuito, es el ${EVENTO.fecha.toLowerCase()} de ${EVENTO.horario} en el ${EVENTO.sede}, y termina a las 22:00: planeen con tiempo cómo regresas a casa. Cualquier duda, que nos escriban a ${EVENTO.contacto}.`,
};

export function confirmacion(r){
  const { menor, asunto, intro, previa, eq } = caso(r);
  const logo = r.equipoModo === "asignar" ? "" : logoHtml(r.logo);

  const texto = [
    `HACK(ME)THON 2.0 · THE ANATOMY OF A MACHINE`,
    "=".repeat(44),
    "",
    `Hola, ${r.nombre}:`,
    "",
    `${intro} La máquina ya sabe que vienes.`,
    "",
    `FOLIO ........ ${r.folio}`,
    `FECHA ........ ${EVENTO.fecha}`,
    `HORARIO ...... ${EVENTO.horario}`,
    `SEDE ......... ${EVENTO.sede}`,
    `MAPA ......... ${EVENTO.mapa}`,
    `COSTO ........ Gratuito`,
    "",
    `EQUIPO: ${eq.titulo}`,
    ...(eq.cuenta ? [eq.cuenta] : []),
    ...(eq.clave ? [`CONTRASEÑA DEL EQUIPO: ${eq.clave}`] : []),
    eq.texto,
    "",
    "GRUPO DE WHATSAPP",
    "Ahí van los avisos del evento. Únete aquí:",
    EVENTO.whatsapp,
    "",
    "QUÉ TRAER",
    "Una laptop que se pueda conectar al wifi del Tec, y su cargador. También te recomendamos llevar un termo para el agua.",
    ...(menor ? ["Y, como eres menor de edad, la carta de permiso firmada por tu tutor."] : []),
    ...(menor ? ["", TUTOR.titulo, TUTOR.carta, TUTOR.texto, `Descarga el formato aquí: ${EVENTO.carta}`] : []),
    "",
    `Guarda este correo: el día del evento enseña tu QR (o tu folio) en la entrada.`,
    `Dudas: responde a este correo o escribe a ${EVENTO.contacto}.`,
    "",
    EVENTO.portada,
  ].join("\n");

  const fila = (k, v) => `
        <tr>
          <td style="padding:6px 0;color:${C.tenue};font-family:${MONO};font-size:13px;letter-spacing:1px;white-space:nowrap;vertical-align:top;width:90px">${k}</td>
          <td style="padding:6px 0;color:${C.hi};font-family:${MONO};font-size:14px;vertical-align:top">${v}</td>
        </tr>`;

  const bloque = (titulo, cuerpo, color = C.phos) => `
    <tr><td style="padding:0 28px 22px">
      <div style="color:${color};font-family:${MONO};font-size:12px;letter-spacing:2px;margin-bottom:6px">▸ ${titulo}</div>
      <div style="color:${C.suave};font-family:${MONO};font-size:14px;line-height:1.6">${cuerpo}</div>
    </td></tr>`;

  const html = `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><title>${esc(asunto)}</title></head>
<body style="margin:0;padding:0;background:${C.fondo}" bgcolor="${C.fondo}">
<div style="display:none;max-height:0;overflow:hidden">${esc(previa)} Folio ${esc(r.folio)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.fondo}" style="background-color:${C.fondo};background-image:${FONDO}">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.panel}" style="max-width:560px;background-color:${C.panel};background-image:${RAYADO};border:1px solid ${C.tenue};box-shadow:0 0 0 4px ${C.fondo},0 0 0 5px ${C.borde},0 0 40px rgba(250,57,186,.25)">
    <tr><td bgcolor="${C.phos}" style="background:${C.phos};padding:5px 14px;color:${C.fondo};font-family:${MONO};font-size:11px;font-weight:bold;letter-spacing:2px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="color:${C.fondo};font-family:${MONO};font-size:11px;font-weight:bold;letter-spacing:2px">■ EXPEDIENTE ${esc(r.folio)}</td>
        <td align="right" style="color:${C.fondo};font-family:${MONO};font-size:11px;font-weight:bold;letter-spacing:2px">ADMITIDO ●</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:28px 28px 8px" align="center">
      <img src="${EVENTO.imagen}" width="90" height="90" alt="" style="display:block;border:0;image-rendering:pixelated">
    </td></tr>
    <tr><td align="center" style="padding:8px 28px 4px;color:${C.phos};font-family:${MONO};font-size:24px;font-weight:bold;letter-spacing:2px">HACK(ME)THON 2.0</td></tr>
    <tr><td align="center" style="padding:0 28px 24px;color:${C.tenue};font-family:${MONO};font-size:12px;letter-spacing:3px">THE ANATOMY OF A MACHINE</td></tr>
    <tr><td align="center" style="padding:0 28px 22px">${ecgHtml()}</td></tr>
    <tr><td style="padding:0 28px 18px;color:${C.suave};font-family:${MONO};font-size:15px;line-height:1.6">
      Hola, <span style="color:${C.hi}">${esc(r.nombre)}</span>:<br>
      ${esc(intro)} La máquina ya sabe que vienes.
    </td></tr>
    <tr><td style="padding:0 28px 26px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.fondo}" style="background:${C.fondo};border:1px solid ${C.phos}">
        <tr><td align="center" style="padding:16px 14px 6px">
          <div style="color:${C.tenue};font-family:${MONO};font-size:11px;letter-spacing:3px">FOLIO DE ADMISIÓN</div>
          <div style="color:${C.hi};font-family:${MONO};font-size:30px;font-weight:bold;letter-spacing:4px;padding-top:4px">${esc(r.folio)}</div>
        </td></tr>
        <tr><td align="center" style="padding:10px 14px 8px">
          ${visor(qrHtml(r.folio))}
        </td></tr>
        <tr><td align="center" style="padding:6px 14px 16px">
          <div style="color:${C.phos};font-family:${MONO};font-size:12px;letter-spacing:2px">◢ ESCANEAR EN LA ENTRADA ◣</div>
          <div style="color:${C.suave};font-family:${MONO};font-size:12px;line-height:1.5;padding-top:6px">Enséñalo el día del evento para hacer tu check-in.</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:0 28px 22px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${fila("FECHA", esc(EVENTO.fecha))}
        ${fila("HORARIO", esc(EVENTO.horario))}
        ${fila("SEDE", `${esc(EVENTO.sede)}<br><a href="${EVENTO.mapa}" style="color:${C.phos};font-size:13px">Abrir en mapas ↗</a>`)}
        ${fila("COSTO", "Gratuito")}
      </table>
    </td></tr>
    <tr><td style="padding:0 28px 22px">
      <div style="color:${C.phos};font-family:${MONO};font-size:12px;letter-spacing:2px;margin-bottom:10px">▸ EQUIPO</div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        ${logo ? `<td width="${LADO * 7 + 2}" style="padding-right:16px;vertical-align:top">${logo}</td>` : ""}
        <td style="vertical-align:top">
          <div style="color:${C.hi};font-family:${MONO};font-size:15px;font-weight:bold;margin-bottom:6px">${esc(eq.titulo)}</div>
          ${eq.cuenta ? `<div style="color:${C.verde};font-family:${MONO};font-size:12px;letter-spacing:1px;margin-bottom:8px">${esc(eq.cuenta.toUpperCase())}</div>` : ""}
          ${eq.clave ? `<div style="margin-bottom:8px;font-family:${MONO};font-size:13px;color:${C.tenue}">CONTRASEÑA: <span style="color:${C.hi};background:${C.fondo};border:1px solid ${C.borde};padding:2px 8px;font-size:15px;letter-spacing:1px">${esc(eq.clave)}</span></div>` : ""}
          <div style="color:${C.suave};font-family:${MONO};font-size:14px;line-height:1.6">${esc(eq.texto)}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:0 28px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.fondo}" style="background:${C.fondo};border:1px solid ${C.verde}">
        <tr><td style="padding:16px 18px">
          <div style="color:${C.verde};font-family:${MONO};font-size:12px;letter-spacing:2px;margin-bottom:6px">▸ GRUPO DE WHATSAPP</div>
          <div style="color:${C.suave};font-family:${MONO};font-size:14px;line-height:1.6;margin-bottom:14px">Ahí van los avisos del evento: cambios, horarios y lo que haga falta el día. Únete para no perderte nada.</div>
          <a href="${EVENTO.whatsapp}" style="display:inline-block;padding:12px 20px;background:${C.verde};color:${C.fondo};font-family:${MONO};font-size:14px;font-weight:bold;letter-spacing:2px;text-decoration:none">UNIRME AL GRUPO ▸</a>
        </td></tr>
      </table>
    </td></tr>
    ${bloque("QUÉ TRAER", "Una laptop que se pueda conectar al wifi del Tec, y su cargador. También te recomendamos llevar un termo para el agua." + (menor ? `<br><span style="color:${C.hi}">Y, como eres menor de edad, <b>la carta de permiso firmada por tu tutor</b>.</span>` : ""), C.verde)}
    ${menor ? `<tr><td style="padding:0 28px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed ${C.phos}">
        <tr><td style="padding:14px 18px">
          <div style="color:${C.phos};font-family:${MONO};font-size:12px;letter-spacing:2px;margin-bottom:6px">▸ ${TUTOR.titulo}</div>
          <div style="color:${C.hi};font-family:${MONO};font-size:14px;line-height:1.6;font-weight:bold;margin-bottom:8px">${esc(TUTOR.carta)}</div>
          <div style="color:${C.suave};font-family:${MONO};font-size:14px;line-height:1.6;margin-bottom:14px">${esc(TUTOR.texto)}</div>
          <a href="${EVENTO.carta}" style="display:inline-block;padding:12px 20px;background:${C.phos};color:${C.fondo};font-family:${MONO};font-size:14px;font-weight:bold;letter-spacing:2px;text-decoration:none">DESCARGAR LA CARTA ▸</a>
        </td></tr>
      </table>
    </td></tr>` : ""}
    <tr><td align="center" style="padding:0 28px 20px">${enredaderaHtml()}</td></tr>
    <tr><td align="center" style="padding:4px 28px 28px">
      <a href="${EVENTO.portada}" style="display:inline-block;padding:12px 22px;border:1px solid ${C.phos};color:${C.phos};font-family:${MONO};font-size:14px;letter-spacing:2px;text-decoration:none">VER LA PORTADA ▸</a>
    </td></tr>
    <tr><td style="padding:16px 28px 24px;border-top:1px solid ${C.borde};color:${C.tenue};font-family:${MONO};font-size:12px;line-height:1.6">
      Guarda este correo: el día del evento enseña tu QR (o tu folio) en la entrada.<br>
      ¿Dudas? Responde a este correo o escribe a
      <a href="mailto:${EVENTO.contacto}" style="color:${C.phos}">${EVENTO.contacto}</a>.<br>
      Startup Chihuahua · Undefined
    </td></tr>
    <tr><td align="center" bgcolor="${C.panel}" style="padding:4px 28px 28px;background:${C.panel}">
      <a href="${EVENTO.club}" style="text-decoration:none"><img src="${EVENTO.undefined}" width="200" height="34" alt="undefined_projects" style="display:block;border:0;width:200px;height:34px;color:${C.suave};font-family:${MONO};font-size:13px"></a>
    </td></tr>
    <tr><td style="padding:6px 14px;border-top:1px solid ${C.borde};color:${C.tenue};font-family:${MONO};font-size:11px;letter-spacing:1px">
      <a href="${EVENTO.portada}" style="color:${C.tenue};text-decoration:none">PF1 PORTADA</a> &nbsp;
      <a href="${EVENTO.mapa}" style="color:${C.tenue};text-decoration:none">PF3 MAPA</a> &nbsp;
      <a href="mailto:${EVENTO.contacto}" style="color:${C.tenue};text-decoration:none">PF12 CONTACTO</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;

  return { asunto, html, texto };
}
