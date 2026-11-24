# Fase 5 — La Memoria del Robot (Pseudo-SQL en Español)

> Ya vulneramos su sistema, pero estamos dentro de lo que **él creó**, no dentro de **él**.
> Para llegar a su conciencia hace falta la llave con la que lo construyeron. El robot la partió en
> tres y la escondió en su memoria. Después, para destruirlo, hay que vaciar esa memoria… y tiene copias.

Código: [`boveda.ts`](hackmethon-servidor/server/src/phases/boveda.ts) (fase),
[`sqlmini.ts`](hackmethon-servidor/server/src/phases/sqlmini.ts) (mini-motor tolerante de Pseudo-SQL en español) y
[`DatosView.tsx`](hackmethon-servidor/client/src/player/roles/DatosView.tsx) (mapa relacional + pantalla de filtro en vivo).
Clave: `fase-5-boveda`.

## Misma terminal, dos partes

La Terminal usa **Pseudo-SQL natural en español** (con palabras clave en MAYÚSCULAS, sin asteriscos crípticos ni necesidad de comillas en palabras sueltas, y tolerante con las palabras de unión).

| | Parte 1 · Encontrar las tres llaves | Parte 2 · Borrar la memoria |
|---|---|---|
| **Datos** | Mapa con las **4 tablas reales** (`fragmentos`, `modulos`, `propietarios`, `etiquetas`, sin tablas artificiales de pistas) + **Pantalla de Filtro en Vivo** que muestra las filas y columnas que quedan de la tabla o del `JOIN` | Mapa con las **9 tablas reales** (principales, `respaldo_*`, `bitacora` y `sistema_triggers`) + **Pantalla de Filtro en Vivo** que refleja cómo bajan o se restauran las filas |
| **Pantalla** | Cámaras `ARCHIVO` (embudo) y `LLAVERO` (3 ranuras) + salidas y diagnósticos de la consola | Cámaras `MEMORIA` (filas restantes) y `RESPALDOS` (alertas de restauración automática) + avisos de triggers disparados |
| **Terminal** | `MOSTRAR TODO DE`, `CONTAR`, `MOSTRAR DISTINTOS`, `GUARDAR` (3 formas), `PROBAR`, `consultas` | `MOSTRAR TODO DE`, `CONTAR`, `BORRAR TODO DE` / `VACIAR`, `APAGAR REGLA` / `BORRAR REGLA`, `reiniciar` |
| **Victoria** | Las 3 llaves confirmadas con `PROBAR` → pasa a la Parte 2 | **Ninguna fila** en ninguna de las 8 tablas de datos |

Cada parte tiene **2400 entradas** (1800+120+180+300 en la Parte 1; 1300+100+120+120+450+100+120+90 en la Parte 2).

---

## Cómo funciona la Pantalla de Filtro en Vivo en `DATOS`

En lugar de mostrar tablas de pistas separadas o devolver solo un número cuando hay muchos resultados:
1. **`DATOS` tiene únicamente las tablas reales del sistema** conectadas por sus flechas de relación (`modulo_id → modulos`, `propietario_id → propietarios`, `etiqueta_id → etiquetas`).
2. Debajo del mapa relacional, `DATOS` tiene la **`PANTALLA DE FILTRO EN VIVO`**:
   - Al iniciar, muestra los registros y las 9 columnas de `fragmentos`.
   - Cada vez que `TERMINAL` ejecuta una consulta con `JUNTO CON` o `DONDE` (ej. `MOSTRAR TODO DE fragmentos JUNTO CON modulos, propietarios DONDE ...`), la pantalla de `DATOS` se actualiza en tiempo real con **los registros que quedaron de la tabla o del `JOIN`**, incluyendo todas las columnas de `fragmentos` más las columnas unidas (`modulos.nombre`, `modulos.sistema`, `modulos.enlace`, `propietarios.nombre`, `propietarios.tipo`, `etiquetas.nombre`, `etiquetas.categoria`).
   - Así, el Operador de Datos analiza los registros que van quedando, detecta los señuelos por sus valores y guía a `TERMINAL` para afinar el filtro hasta aislar cada una de las 3 llaves.

---

## Sintaxis del Pseudo-SQL en Español (`consultas`)

Al escribir `ayuda`, la terminal muestra los comandos básicos y destaca el comando **`consultas`**, que despliega un manual amplio dividido en 4 bloques:

### 1. Consultas (cómo pedir y cruzar datos)
- **`MOSTRAR TODO DE <tabla> [JUNTO CON ...] [DONDE ...]`**
  Aplica el filtro o la unión (`JOIN`) y muestra los registros y columnas que quedaron en la Pantalla de Filtro en Vivo de `DATOS`. También se pueden pedir columnas específicas: `MOSTRAR id, codigo, nivel DE fragmentos`.
- **`CONTAR <tabla> [JUNTO CON ...] [DONDE ...]`**
  Cuenta cuántas filas cumplen la condición.
- **`MOSTRAR DISTINTOS <columna> DE <tabla>`**
  Muestra todos los valores diferentes que existen realmente en esa columna.
- **`... JUNTO CON <otra_tabla> [, <otra_tabla_2>]`** (también acepta `UNIR CON`)
  Une tablas relacionadas automáticamente para ver sus columnas juntas en `DATOS` y filtrar por ellas. Si un fragmento apunta a otro (`referencia_id`), se puede unir con `referencia`.
- **`... ORDENADO POR <columna> DESCENDENTE [LIMITE <n>]`**
  Ordena de mayor a menor (`DESCENDENTE`) o de menor a mayor (`ASCENDENTE`) y limita cuántas filas se muestran.

### 2. Filtros después de `DONDE` (cómo comparar valores)
- **`columna ES valor`** / **`columna NO ES valor`**
- **`columna MAYOR QUE n`** / **`columna MENOR QUE n`** (también `MAYOR O IGUAL A`, `MENOR O IGUAL A`)
- **`columna TIENE FORMATO LLV-####-K7`** (`#` exige un número del 0 al 9 y `?` cualquier carácter; respeta mayúsculas y minúsculas)
- **`columna EMPIEZA CON texto`** / **`columna TERMINA CON texto`** / **`columna CONTIENE texto`**
- **`columna ESTA VACIO`** / **`columna NO ESTA VACIO`**

### 3. Operaciones lógicas
- **`Y`** — Exige que se cumplan todas las condiciones a la vez.
- **`O`** — Acepta registros que cumplan cualquiera de las condiciones.
- **`NO`** — Invierte un filtro (`NO ES`, `NO CONTIENE`, `NO TIENE FORMATO`, `NO ESTA VACIO`).

### 4. Las 3 formas de `GUARDAR` y `PROBAR` (Parte 1)
1. **Forma 1 (Guardar tu última consulta):**
   ```text
   MOSTRAR TODO DE fragmentos JUNTO CON modulos, propietarios DONDE ...
   GUARDAR llave1
   PROBAR llave1
   ```
2. **Forma 2 (Guardar escribiendo la consulta con un solo verbo):**
   ```text
   GUARDAR llave1 DE fragmentos JUNTO CON modulos, propietarios DONDE ...
   PROBAR llave1
   ```
3. **Forma 3 (Guardar el código o ID que `DATOS` ve en su pantalla):**
   ```text
   GUARDAR LLV-4829-K7
   PROBAR LLV-4829-K7
   ```
