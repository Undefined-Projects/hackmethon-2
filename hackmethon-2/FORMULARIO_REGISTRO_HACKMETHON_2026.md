# Registro de participantes · HackMeThon 2.0 (ENCES 2026)
## Qué datos pedimos, en qué paso, y cómo salen al reporte de beneficiarios

Fecha: 2026-10-06 · Dueño: José Parra · Plataforma: Suma Impacto (experiencia + formularios) · FinCore: A1.33.2.5, A1.33.5.1, A1.33.5.10, A1.33.8.1

**Regla:** los datos personales (CURP, teléfono, código postal) viven **sólo en Suma Impacto** bajo aviso de privacidad y responsiva. Nunca en hojas sueltas
(en 2023 hubo CURP y teléfonos en Excel). Al reporte ENCES salen **agregados** (tabla de beneficiarios) y, si lo exige el convenio, la lista nominal se entrega
en el formato oficial de INADET/CENALTEC directamente desde la exportación de Suma Impacto.

---

## Paso 1 · Inscripción (2 minutos, obligatorio para reservar lugar)

| # | Campo | Tipo | Obligatorio | Validación / notas |
|---|---|---|---|---|
| 1 | Nombre(s) | texto | sí | — |
| 2 | Apellidos | texto | sí | — |
| 3 | Correo | email | sí | único; se usa para check-in y avisos |
| 4 | Teléfono (WhatsApp) | tel | sí | 10 dígitos; para el grupo del evento |
| 5 | **CURP** | texto | sí | 18 caracteres, formato oficial; se valida con regex; **requerido para el reporte de beneficiarios ENCES** |
| 6 | Género | opción | sí | Hombre · Mujer · Otro · Prefiero no decir → el reporte usa Hombre / Mujer / Otro (la cuarta opción se cuenta en «Otro») |
| 7 | Fecha de nacimiento | fecha | sí | para rangos de edad del reporte; coherente con la CURP |
| 8 | **Código postal** | texto | sí | 5 dígitos; para ubicar de dónde vienen (colonia/municipio) |
| 9 | ¿Estudias actualmente? | sí/no | sí | si **no**, se ocultan 10–12 y no se registran |
| 10 | Universidad / institución | lista + «Otra» | sólo si 9 = sí | UTCH · Tec de Monterrey · Politécnico (UPCH) · UACH · UTCH Sur · ULSA · otra (texto) |
| 11 | Carrera | texto / lista | sólo si 9 = sí | texto libre con sugerencias |
| 12 | Semestre o año que cursas | número | sólo si 9 = sí | 1–12 semestres (o año 1–5) |
| 13 | Equipo | opción | sí | Ya tengo equipo · No tengo equipo, agrégame a uno · Crear un equipo |
| 14 | Equipo de la lista + contraseña | lista + texto | sólo si 13 = ya tengo | 3–5 integrantes; los llenos no se eligen |
| 14b | Nombre, contraseña y logo 16 × 16 | texto + editor | sólo si 13 = crear | nombre único; quien lo crea pasa la contraseña al resto |
| 15 | Aviso de privacidad | checkbox | sí | texto aprobado; enlace al aviso completo |
| 16 | **Responsiva** | checkbox + firma | sí | reglas del evento, conducta, uso de infraestructura sólo en el entorno del CTF, grabación de imagen y voz |

Al enviar: correo de confirmación con QR de check-in, fecha/sede, enlace al Paso 2 y a las reglas del CTF.

## Paso 2 · Completa tu información (opcional, antes del 14-nov; da puntos de bonus o garantiza playera)

| # | Campo | Tipo | Notas |
|---|---|---|---|
| 1 | Talla de playera | opción | XS–XXL; cierre de pedido al Municipio 6-nov |
| 2 | Nivel en ciberseguridad | opción | Nunca · Básico · Intermedio · Avanzado → para balancear equipos y calibrar retos |
| 3 | Lenguajes / herramientas | multi | Python · JS · C · Linux · Wireshark · Burp · otro |
| 4 | ¿Has participado en un hackatón o CTF? | sí/no + cuál | — |
| 5 | Restricciones alimentarias | texto | pizza vegetariana, alergias |
| 6 | ¿Necesitas algún apoyo de accesibilidad? | texto | — |
| 7 | ¿Cómo te enteraste? | opción | universidad · redes · amigo · ENCES · otro → mide canales de convocatoria |
| 8 | Redes (LinkedIn / GitHub) | url | opcional; para seguimiento a 3 y 6 meses |
| 9 | Consentimiento para seguimiento post-evento | checkbox | encuesta y seguimiento a 3/6 meses |

## Día del evento · Check-in (Suma Impacto)

- Escaneo de QR o búsqueda por correo → marca **asistió** con hora.
- Verifica responsiva firmada; si falta, se firma en papel y se registra.
- Entrega de playera por talla (Paso 2) y gafete opcional.
- Equipo final asignado/confirmado en el sistema (sirve al marcador del CTF).

---

## Cómo sale al reporte ENCES (formato de la tabla de beneficiarios)

Mismo formato que las actividades previas del proyecto (Demo days, World Cup):

| Nombre de Actividad | Hombre (D) | Mujer (D) | Otro (D) | Total Beneficiarios Directos | Hombre (I) | Mujer (I) | Otro (I) | Total Beneficiarios Indirectos |
|---|---|---|---|---|---|---|---|---|
| HackMeThon 2.0 · 21-nov-2026 | [n] | [n] | [n] | [n] | [n] | [n] | [n] | [n] |

**Definiciones que usaremos (dejarlas fijas antes del evento):**

- **Beneficiario directo** = persona con **check-in** el 21-nov (asistió). Género del Paso 1.
- **Beneficiario indirecto** = inscritos que **no** asistieron + asistentes registrados a las charlas pre-evento en universidades (lista por charla, con género) + [si ENCES lo acepta] mentores, validadores y staff externo. Género del registro correspondiente.
- Nada se cuenta dos veces: una persona es directa o indirecta, no ambas.

**Cortes adicionales que podemos reportar sin esfuerzo (salen del Paso 1):**

| Corte | Fuente |
|---|---|
| Por universidad e institución (y «no estudia») | campo 9–10 |
| Por carrera y semestre/año | campos 11–12 |
| Por municipio / zona (código postal) | campo 8 |
| Por rango de edad | fecha de nacimiento / CURP |
| Canal de convocatoria | Paso 2, campo 7 |

**Exportaciones desde Suma Impacto después del evento:**

1. Tabla agregada de beneficiarios (arriba) → informe, sección 10 y Anexo A.
2. Lista nominal para INADET/CENALTEC (sólo si el convenio la exige, en su formato: nombre, CURP, género, institución) → entrega directa al reporte ENCES, **no** al informe público.
3. Lista de asistencia sin datos sensibles (nombre, institución, equipo, check-in) → Anexo A del informe.

---

## Pendientes para dejarlo listo (FinCore)

- A1.33.2.5 · configurar la experiencia y los dos formularios en Suma Impacto con la lógica condicional (campos 10–12 sólo si estudia); aviso de privacidad y responsiva aprobados.
- A1.33.5.1 · abrir registro ~20-oct con el QR del flyer apuntando al Paso 1.
- A1.33.5.10 · responsiva: texto final (conducta, entorno controlado, grabación).
- A1.33.8.1 · check-in el 21-nov y cierre de pedido de playeras el 6-nov con las tallas del Paso 2.
- Confirmar con ENCES/Andrés qué formato nominal exige el convenio para beneficiarios (si pide CURP, ya la tenemos).
