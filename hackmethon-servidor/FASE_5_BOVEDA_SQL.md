# Fase 5 — La Memoria del Robot (Pseudo-SQL en Español)

> Ya vulneramos su sistema, pero estamos dentro de lo que **él creó**, no dentro de **él**.
> Para llegar a su conciencia hace falta la llave con la que lo construyeron. El robot la partió en
> tres y la escondió en su memoria. Después, para destruirlo, hay que vaciar esa memoria… y tiene copias.

Código: [`boveda.ts`](hackmethon-servidor/server/src/phases/boveda.ts) (fase) y
[`sqlmini.ts`](hackmethon-servidor/server/src/phases/sqlmini.ts) (mini-motor tolerante de Pseudo-SQL en español). Clave: `fase-5-boveda`.

## Misma terminal, dos partes

La Terminal usa **Pseudo-SQL natural en español** (con palabras clave en MAYÚSCULAS, sin asteriscos crípticos ni necesidad de comillas en palabras sueltas, y tolerante con las palabras de unión).

| | Parte 1 · Encontrar las tres llaves | Parte 2 · Borrar la memoria |
|---|---|---|
| **Datos** | 4 tablas, columnas (con **2 errores**), encargo y formato de llave | Mapa nuevo: respaldos, bitácora, catálogo de reglas (`sistema_triggers`) |
| **Pantalla** | Resultados + cámaras `ARCHIVO` (embudo) y `LLAVERO` (3 ranuras) | Resultados + cámaras `MEMORIA` (filas que quedan) y `RESPALDOS` (lo que se restaura solo) |
| **Terminal** | `CONTAR`, `MOSTRAR TODO`, `MOSTRAR DISTINTOS`, `GUARDAR` (3 formas), `PROBAR`, `consultas` | `MOSTRAR TODO`, `CONTAR`, `BORRAR TODO DE` / `VACIAR`, `APAGAR REGLA` / `BORRAR REGLA`, `reiniciar` |
| **Victoria** | Las 3 llaves confirmadas con `PROBAR` → pasa a la Parte 2 | **Ninguna fila** en ninguna de las 8 tablas de datos |

Cada parte tiene **2400 entradas** (1800+120+180+300 en la Parte 1; 1300+100+120+120+450+100+120+90 en la Parte 2).

---

## Sintaxis del Pseudo-SQL en Español (`consultas`)

Al escribir `ayuda`, la terminal muestra los comandos básicos y destaca el comando **`consultas`**, que despliega un manual amplio dividido en 4 bloques:

### 1. Consultas (cómo pedir y cruzar datos)
- **`CONTAR <tabla> [JUNTO CON ...] [DONDE ...]`**
  Cuenta cuántas filas cumplen la condición sin traerlas.
  - Ejemplo: `CONTAR fragmentos DONDE estado ES activo`
- **`MOSTRAR TODO DE <tabla> [JUNTO CON ...] [DONDE ...]`**
  Trae todas las columnas de las filas que cumplan (máximo 12 filas en pantalla). También se pueden pedir columnas específicas: `MOSTRAR id, codigo, nivel DE fragmentos`.
- **`MOSTRAR DISTINTOS <columna> DE <tabla>`**
  Muestra todos los valores diferentes que existen realmente en esa columna (ideal para verificar si el diccionario de Datos omitió algún valor).
  - Ejemplo: `MOSTRAR DISTINTOS tipo DE propietarios`
- **`... JUNTO CON <otra_tabla> [, <otra_tabla_2>]`** (también acepta `UNIR CON`)
  Une tablas relacionadas automáticamente sin obligar al jugador a escribir llaves foráneas (`ON a.id = b.id`). Si un fragmento apunta a otro (`referencia_id`), se puede unir con `referencia`.
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
   Después de lanzar `MOSTRAR TODO DE fragmentos ...` y ver que devuelve 1 fila:
   ```text
   GUARDAR llave1
   PROBAR llave1
   ```
2. **Forma 2 (Guardar escribiendo la consulta con un solo verbo):**
   ```text
   GUARDAR llave1 DE fragmentos JUNTO CON modulos, propietarios DONDE ...
   PROBAR llave1
   ```
3. **Forma 3 (Guardar el código o ID que salió en Pantalla):**
   ```text
   GUARDAR LLV-4829-K7
   PROBAR LLV-4829-K7
   ```

---

## Parte 1 — Las 3 llaves y los señuelos

Las 3 consultas de solución en Pseudo-SQL son:
```text
-- Llave 1:
MOSTRAR TODO DE fragmentos JUNTO CON modulos, propietarios DONDE codigo TIENE FORMATO LLV-####-K7 Y tamano ES 64 Y estado ES activo Y tipo ES subsistema Y sistema ES nucleo

-- Llave 2:
MOSTRAR TODO DE fragmentos JUNTO CON modulos, etiquetas DONDE codigo TIENE FORMATO LLV-####-K7 Y tamano ES 64 Y nivel ES 9 Y categoria ES seguridad Y enlace ES externo

-- Llave 3:
MOSTRAR TODO DE fragmentos JUNTO CON referencia, etiquetas DONDE codigo TIENE FORMATO LLV-####-K7 Y tamano ES 64 Y estado ES archivado Y etiquetas.nombre ES llave_maestra
```

**«No sabemos si lo que descubrimos está bien»:** el diccionario de Datos tiene una columna `confianza` y **dos errores** que se descubren consultando:
1. `propietarios.tipo` figura como `robot · humano`, pero `MOSTRAR DISTINTOS tipo DE propietarios` revela **`subsistema`**.
2. `fragmentos.nivel` figura como `1 a 5`, pero `MOSTRAR nivel DE fragmentos ORDENADO POR nivel DESCENDENTE LIMITE 5` revela que llega a **9**.

---

## Parte 2 — Borrar lo que se restaura solo

- **`MOSTRAR TODO DE sistema_triggers`** — Muestra las 10 reglas automáticas del robot.
- **`APAGAR REGLA <nombre>`** o **`BORRAR REGLA <nombre>`** — Desactiva o elimina un trigger que restaura memoria. Tocar una regla inocua de funcionamiento del robot (`INSERT`/`UPDATE`) activa la cuarentena.
- **`BORRAR TODO DE <tabla>`** o **`VACIAR <tabla>`** — Vacía una tabla. Cuando las 8 tablas de datos quedan en **0 filas**, se gana la fase.
