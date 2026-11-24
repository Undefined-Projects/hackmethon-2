# Fase 5 — La Memoria del Robot (SQL)

> Ya vulneramos su sistema, pero estamos dentro de lo que **él creó**, no dentro de **él**.
> Para llegar a su conciencia hace falta la llave con la que lo construyeron. El robot la partió en
> tres y la escondió en su memoria. Después, para destruirlo, hay que vaciar esa memoria… y tiene copias.

Código: [`boveda.ts`](hackmethon-servidor/server/src/phases/boveda.ts) (fase) y
[`sqlmini.ts`](hackmethon-servidor/server/src/phases/sqlmini.ts) (mini-motor SQL propio). Clave: `fase-5-boveda`.

## Misma terminal, dos partes

La Terminal habla **SQL real acotado** en las dos partes. La Parte 2 añade `DELETE` y los comandos de triggers.

| | Parte 1 · Encontrar las tres llaves | Parte 2 · Borrar la memoria |
|---|---|---|
| **Datos** | 4 tablas, columnas (con **2 errores**), encargo y formato de llave | Mapa nuevo: respaldos, bitácora, catálogo de triggers |
| **Pantalla** | Resultados + cámaras `ARCHIVO` (embudo) y `LLAVERO` (3 ranuras) | Resultados + cámaras `MEMORIA` (filas que quedan) y `RESPALDOS` (lo que se restaura solo) |
| **Terminal** | `SELECT`, `CREATE VIEW`, `DROP VIEW`, `vistas`, `probar` | `SELECT`, `DELETE`, `DROP TRIGGER`, `DISABLE TRIGGER`, `reiniciar` |
| **Victoria** | Las 3 llaves confirmadas con `probar` → pasa a la Parte 2 | **Ninguna fila** en ninguna de las 8 tablas de datos |

Cada parte tiene **2400 entradas** (1800+120+180+300 en la Parte 1; 1300+100+120+120+450+100+120+90 en la Parte 2).

## Parte 1 — la maraña

**Tablas:** `fragmentos` (1800: `id, codigo, modulo_id, propietario_id, etiqueta_id, referencia_id, estado, nivel, tamano`),
`modulos` (120), `propietarios` (180), `etiquetas` (300).

**Las tres llaves** son una sola fila cada una y **todas** cumplen el formato (`codigo LIKE 'LLV-____-K7'` y `tamano = 64`).
Cada una se distingue por rasgos que viven en **otras** tablas, así que hay que unir:

| Llave | Rasgos | Une con |
|---|---|---|
| 1 | `estado = activo` · propietario es un **subsistema** · módulo del sistema `nucleo` | `modulos`, `propietarios` |
| 2 | `nivel` **más alto de toda la memoria** · etiqueta de categoría `seguridad` · módulo con enlace `externo` | `modulos`, `etiquetas` |
| 3 | `estado = archivado` · **apunta** (`referencia_id`) a un fragmento con etiqueta `llave_maestra` | `fragmentos` (auto-JOIN), `etiquetas` |

**Señuelos** (≈ 40 + 45 de relleno que imita): cada uno es la llave con **un único rasgo cambiado**:
prefijo `LLU`, sufijo `K9`, tres cifras, `k7` en minúscula, tamaño 63/65, estado distinto, propietario `robot`,
nivel 8 ó 5, etiquetas con nombre parecido (`llave-maestra`, `llave_maestro`, `Llave_maestra`…), referencias a esas etiquetas, etc.
La construcción **ejecuta las consultas de solución** y descarta cualquier intruso: cada llave es única por construcción,
no por suerte de la semilla.

**«No sabemos si lo que descubrimos está bien»:** el diccionario de Datos tiene una columna `confianza` y **dos errores**
que solo se descubren preguntando:

1. `propietarios.tipo` figura como `robot · humano`, pero también existe **`subsistema`** (y la llave 1 es de uno).
2. `fragmentos.nivel` figura como `1 a 5`, pero llega a **9** (y la llave 2 es nivel 9).

`SELECT tipo, COUNT(*) FROM propietarios GROUP BY tipo` y `SELECT nivel … ORDER BY nivel DESC LIMIT 5` los destapan.

**Guardar y probar:** `CREATE VIEW miLlave AS SELECT …` y `probar miLlave`.

- 0 ó 2+ filas → «todavía no», **sin penalización** (es una ayuda, no un arma).
- Exactamente una fila que **no** es llave (un señuelo) → **cuarentena creciente** (20 s → 45 s → 90 s). Mismo mensaje para cualquier fallo.
- Una llave ya confirmada → no penaliza ni suma. La tercera confirmación **no termina la fase**: pasa a la Parte 2.

## Parte 2 — borrar lo que se restaura solo

**Tablas de datos (8):** `fragmentos` 1300, `modulos` 100, `propietarios` 120, `etiquetas` 120,
`respaldo_fragmentos` 450 *(copia parcial)*, `respaldo_modulos` 100, `respaldo_propietarios` 120, `bitacora` 90.
Más el catálogo `sistema_triggers` (10 reglas, solo lectura, **no cuenta**).

**Triggers** (el estado de cada uno se lee en `sistema_triggers.accion` / `.activo`):

| Trigger | Qué hace | ¿Hay que quitarlo? |
|---|---|---|
| `trg_restaurar_frag` | al borrar `fragmentos`, repone lo que tenga copia | uno de los dos del ping-pong |
| `trg_replicar_respaldo` | al borrar `respaldo_fragmentos`, repone lo que siga en `fragmentos` | …el otro |
| `trg_restaurar_mod` / `trg_restaurar_prop` | idem con módulos / propietarios | o vaciar antes el respaldo |
| `trg_latido` | al borrar `bitacora`, añade una fila a `bitacora` | **obligatorio**: si no, nunca queda vacía |
| `trg_auditoria_etq` | al borrar `etiquetas`, añade una fila a `bitacora` | solo importa el orden |
| `trg_restaurar_frag_v0` | copia antigua, **desactivada** | no hace nada |
| `trg_sello_fecha`, `trg_validar_nivel`, `trg_cuenta_prop` | **funcionamiento normal** del robot | **no tocar**: penaliza |

Lo interesante es que **el orden importa**: borrar `fragmentos` repone 450 desde el respaldo; borrar el respaldo repone 450 desde `fragmentos`.
Hay varias soluciones válidas (quitar triggers, o vaciar primero la copia que no tiene regla propia). Quitar un trigger «inocuo»
es acusar en falso: cuarentena, como en el resto de fases.

**Implementación:** el estado guarda el **log de sentencias aceptadas** y se **reconstruye** cada vez (determinista y pequeño:
nada de serializar 2400 filas). `reiniciar` vacía el log.

## Qué enseña
- Una consulta es un **embudo**; `COUNT(*)` antes de pedir filas.
- `JOIN` (incluido el auto-JOIN) y que un dato puede no estar en la tabla que miras.
- **Desconfiar del diccionario**: verificar con `GROUP BY` / `ORDER BY` en vez de creerse la documentación.
- Guardar una consulta como **vista** y reutilizarla.
- Los **triggers** hacen cosas que no se ven en la consulta, y borrar no siempre borra.
