# Fase 5 — La Memoria del Robot (Pseudo-SQL en Español)

> Ya vulneramos su sistema, pero estamos dentro de lo que **él creó**, no dentro de **él**.
> Para llegar a su conciencia hace falta la llave con la que lo construyeron. El robot la partió en
> tres y la escondió en su memoria. Después, para destruirlo, hay que vaciar esa memoria… y tiene copias.

Código: [`boveda.ts`](hackmethon-servidor/server/src/phases/boveda.ts) (fase),
[`sqlmini.ts`](hackmethon-servidor/server/src/phases/sqlmini.ts) (mini-motor tolerante de Pseudo-SQL en español) y
[`DatosView.tsx`](hackmethon-servidor/client/src/player/roles/DatosView.tsx) (mapa relacional + pantalla de filtro en vivo con paginación).
Clave: `fase-5-boveda`.

---

## Reparto equilibrado (33% / 33% / 33%) en ambas partes

| Rol | Parte 1 · Encontrar las tres llaves | Parte 2 · Borrar la memoria |
|---|---|---|
| **`DATOS`** | Tiene el **mapa de las 4 tablas reales** (`fragmentos`, `modulos`, `propietarios`, `etiquetas`, sin tablas artificiales de pistas) y es el **ÚNICO** que ve los registros y columnas en la **Pantalla de Filtro en Vivo** (con paginación de 100 en 100). | Conserva en su mapa las **4 tablas originales** (con sus registros y llaves) + **4 tablas nuevas** (`respaldo_fragmentos`, `respaldo_modulos`, `respaldo_propietarios`, `bitacora`) y ve en vivo cuántas filas quedan en cada una. |
| **`PANTALLA`** | Tiene las **cámaras** (`ARCHIVO` y `LLAVERO`), el **manual completo** (`consultas`), las **pistas de las 3 cerraduras** (`estado`) y el veredicto de `PROBAR`. No ve los registros ni los códigos de `fragmentos`. | Es el **ÚNICO** que ve el catálogo de reglas automáticas (`MOSTRAR TODO DE sistema_triggers`), las alertas de qué trigger bloqueó o restauró filas y la cámara `RESPALDOS`. |
| **`TERMINAL`** | Escribe a ciegas las consultas (`MOSTRAR TODO DE`, `CONTAR`, `MOSTRAR DISTINTOS`, `JUNTO CON`, `DONDE`), guarda (`GUARDAR` en cualquiera de sus 3 formas) y valida (`PROBAR`). | Cruza la cadena de protección de reglas que lee `PANTALLA` con el estado de las 8 tablas que lee `DATOS` para ejecutar `APAGAR REGLA` y `VACIAR` en el orden correcto. |

---

## Semilla dinámica por equipo (`semilla`)

- Cada equipo puede tener su propia semilla (`mundoDeSemilla(semilla)`), lo que cambia:
  - El **prefijo** del código de la llave (`LLV`, `CLV`, `KRN`, `ACC`, `NUC`, `SIG`).
  - Los **4 dígitos** y la **terminación** (`K7`, `X9`, `M4`, `R8`, `Z3`, `V6`).
  - El **tamaño** exacto de la llave (`64`, `96`, `128`, `48`, `72`, `84`).
  - Los IDs y posiciones de las 3 llaves.
- Ni el fragmento molde (`llave_maestra`) ni las 3 llaves caen nunca en las primeras 350 filas de `fragmentos`, de modo que no aparecen en las primeras páginas sin filtrar.

---

## Parte 1 — Pistas y deducción de las 3 llaves

1. **El molde del código y tamaño (`llave_maestra`):**
   - Al consultar qué fragmento tiene la etiqueta `llave_maestra` (`E-001`, categoría `seguridad`), el equipo descubre el registro molde (`<PREFIJO>-0000-<SUFIJO>` y su `tamano`), con el que descartan la basura (`DAT-`, `LOG-`, `CFG-`, `TMP-`) y los señuelos.
2. **Llave 1 (Vínculo de Conciencia Interna):**
   - `estado ES activo`, su propietario no es `usuario` ni `admin` sino el tercer tipo oculto del sistema (`tipo ES conciencia`, descubierto con `MOSTRAR DISTINTOS tipo DE propietarios`), y su módulo pertenece al sistema `nucleo`.
3. **Llave 2 (Vínculo de Seguridad Externa de Máximo Nivel):**
   - Etiqueta de `categoria ES seguridad`, módulo con `enlace ES externo`, y el `nivel` más alto de toda la memoria (`nivel ES 9`, descubierto con `MOSTRAR nivel DE fragmentos ORDENADO POR nivel DESCENDENTE LIMITE 5`).
4. **Llave 3 (Vínculo Archivado a la Llave Maestra):**
   - `estado ES archivado` y su `referencia_id` apunta al fragmento que lleva la etiqueta exacta `llave_maestra` (descartando las etiquetas trampa `llave-maestra`, `llave_maestro`, `llave_maestra_v0`, `Llave_maestra`).

---

## Parte 2 — Las 8 tablas y la cadena de triggers que se protegen entre sí

En la Parte 2 **se conservan las 4 tablas originales** (con las mismas 2400 filas de la Parte 1) y **se suman 4 tablas nuevas** (`respaldo_fragmentos` con 450 copias, `respaldo_modulos` con 120, `respaldo_propietarios` con 180 y `bitacora` con 90 = **3240 filas en total** distribuidas en 8 tablas).

Además, en `sistema_triggers` (12 reglas, consultable desde `PANTALLA`) existe una **cadena de protección entre triggers**:
1. **`trg_vigia_maestro` (`TR-09`, Vigía Raíz):**
   - No está protegido por nadie, pero custodia a **`trg_escudo_respaldos`** y a **`trg_latido`**. Si intentan apagar cualquiera de esos dos antes de apagar a `trg_vigia_maestro`, la orden es bloqueada.
2. **`trg_escudo_respaldos` (`TR-08`, Custodio Intermedio):**
   - Está protegido por `trg_vigia_maestro` y custodia a las 4 reglas que restauran copias (**`trg_restaurar_frag`**, **`trg_replicar_respaldo`**, **`trg_restaurar_mod`**, **`trg_restaurar_prop`**).
3. **Reglas de restauración y bitácora:**
   - `trg_restaurar_frag`, `trg_replicar_respaldo`, `trg_restaurar_mod`, `trg_restaurar_prop`, `trg_latido`, `trg_auditoria_etq`.
4. **Reglas inocuas de funcionamiento (`INSERT` / `UPDATE`):**
   - `trg_sello_fecha`, `trg_validar_nivel`, `trg_cuenta_prop` (no deben apagarse; tocarlas activa la cuarentena).

**Orden de desactivación para ganar la Parte 2:**
1. `APAGAR REGLA trg_vigia_maestro`
2. `APAGAR REGLA trg_escudo_respaldos` y `APAGAR REGLA trg_latido`
3. Apagar las reglas de restauración (`trg_restaurar_frag`, `trg_auditoria_etq`, etc.) y vaciar las 8 tablas con `VACIAR <tabla>` (o `BORRAR TODO DE <tabla>`).
