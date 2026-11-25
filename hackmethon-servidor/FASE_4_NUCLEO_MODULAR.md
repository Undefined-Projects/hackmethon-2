# 📄 Documento de Diseño y Especificación Técnica · Fase 4: Núcleo Modular

**Temas centrales:** Funciones Dependientes, Modularidad y Malas Prácticas de Programación (Falta de Comprobación de Retornos y Dependencias Compartidas).

---

## 1. Narrativa y Contexto dentro de la Historia

En las fases anteriores logramos atravesar el control de acceso, filtrar las conexiones sospechosas y cruzar el muro perimetral hasta infiltrarnos en el sistema interno del robot.

Ahora el objetivo es **provocar un daño físico real colapsando los 3 subsistemas internos del robot** (Tracción motriz, Presión hidráulica y Enfriamiento de marcha):

- **Las 3 funciones maestras están selladas:** Las funciones que viven en `nucleo/` (`reactor`, `escudo`, `latido`) tienen su **firma sellada por el monitor central** y no permiten edición directa.
- **Doble límite físico (`aguanta_max` y `fusible_corte`):** Cada subsistema tiene un límite que el robot resiste (`aguanta_max`) y un **fusible de corte de emergencia (`fusible_corte`)**. Si el resultado final queda en o por debajo de `aguanta_max`, el robot aguanta sin sufrir daño; si metemos un número gigante al azar (ej. `n * 2000000`), el resultado rebasa el `fusible_corte`, quema el fusible, dispara la alarma y manda al equipo a cuarentena.
- **El código empieza compilado (`[ ??? ]`):** Al inicio, el interior de cada archivo `.fn` está oculto tras `[ ??? ]`. El equipo usa `sondear` y cruza con las tablas de Datos para reconstruir (`armar`) cada función. Al armar una pieza, se revela en Pantalla su código real línea por línea.
- **La Fase se divide en 2 Partes usando exactamente los mismos comandos (`abrir`, `sondear`, `armar`, `enganar`, `probar`, `ejecutar`):**
  - **Parte 1 (Cadenas Independientes y Retornos sin Comprobar):** Las 3 cadenas (`M1`, `M2`, `M3`) funcionan por separado. En cada cadena hay una validación activa que bloquea sabotajes descuidados y una **mala práctica de programación** donde una función confía a ciegas en su dependencia y no comprueba lo que esta le devuelve.
  - **Parte 2 (El Parche de Emergencia y la Dependencia Compartida · "El Pequeño Plus"):** Al superar la Parte 1, el robot rota sus tolerancias y aplica un **Parche de Emergencia mal programado** (aparece la 4ª tabla `parche_emergencia` en Datos): tapa los 3 huecos usados en la Parte 1, pero al hacerlo desactiva las comprobaciones opuestas **y acopla la función `carga` (de M1) dentro de `flujo` (de M3)**. Así, el sabotaje que el equipo hace en `carga` para romper M1 altera también a M3, obligándolos a compensar el efecto colateral.

---

## 2. Conceptos Técnicos que Enseña el Reto

1. **Funciones Dependientes y Modularidad:**
   - Cómo un sistema se divide en módulos que se llaman entre sí (`nucleo/ -> medio/ -> base/`), y cómo el resultado de una función superior depende de los valores que calculan y retornan sus funciones auxiliares.
2. **Malas Prácticas al Validar Funciones Dependientes:**
   - **Confianza ciega en el nivel intermedio:** Validar la función base (`B` comprueba a `C`), pero olvidar validar el nivel intermedio (`A` no comprueba a `B`).
   - **Validación prematura:** Validar el parámetro de entrada `n` al inicio de una función **antes** de llamar a la función hija, y olvidar validar el valor `x` que esa función hija devuelve.
   - **Validación redundante sobre la misma dependencia:** Intentar validar el resultado de `B` comparándolo contra `C(n) * 3` (llamando de nuevo a la misma dependencia `C`), sin que ni `A`, ni `B`, ni `C` comprueben el tope máximo de `C`.
3. **Efecto Colateral por Dependencia Compartida (Acoplamiento en Parte 2):**
   - Cuando dos subsistemas distintos (`M1` y `M3`) dependen de la misma función base (`carga`) sin aislar sus contextos, modificar esa función base para alterar `M1` impacta de rebote a `M3` (pudiendo quemar el fusible de `M3` si no se compensa en la función intermedia `flujo`).

---

## 3. Reparto Asimétrico entre los 3 Jugadores

Ningún jugador puede resolver la fase por sí solo:

### 🔵 Operador de Datos (`DATOS`)
No ve las carpetas (`nucleo/`, `medio/`, `base/`), ni el código fuente, ni qué función comprueba a cuál en Parte 1:
- **En la Parte 1** ve **3 tablas** conectadas por `funcion_id`:
  1. **`funciones`**: Catálogo de las 9 funciones (`F1` a `F9`) y su rol en el robot.
  2. **`resultados`**: Qué devuelve cada función en operación original para distintas entradas de prueba y qué valor recibe de su dependencia.
  3. **`tolerancias`**: Los 3 subsistemas físicos (`M1`, `M2`, `M3`), su entrada fija de ciclo (`5`, `6`, `5`), su valor normal, cuánto aguanta el robot (**`aguanta_max`**) y dónde salta el fusible (**`fusible_corte`**).
- **Al pasar a la Parte 2**, aparece dinámicamente la **4ª tabla**:
  4. **`parche_emergencia`**: Qué comprobaciones tapó el robot tras el ataque de la Parte 1, qué comprobaciones desactivó por error y cómo acopló `carga` (de M1) dentro de `flujo` (de M3).

### 🌸 Operador de Pantalla (`PANTALLA`)
No tiene la tabla `resultados` ni sabe cuánto valen `aguanta_max` o `fusible_corte`. Ve:
1. **Monitor de Circuito Cerrado (2 cámaras animadas 15×36):**
   - `CAM 1 · SALA DEL NUCLEO`: Las 3 torres físicas (`NUC-A`, `MED-B`, `BAS-C`), el pulso viajando por los conductos y el dron sobre el módulo abierto.
   - `CAM 2 · DEPENDENCIAS`: Muestra el flujo entre los 3 niveles (`NUCLEO`, `MEDIO`, `BASE`) y advierte en la Parte 2 cuando la base de M1 queda acoplada a M3.
2. **Árbol de Carpetas y Visor de Código `.fn`:**
   - Ve qué archivos viven en `nucleo/`, `medio/` y `base/`.
   - Mientras una pieza no está armada, su interior aparece oculto con `[ ??? ]`.
   - **Al armar una pieza (`armar`)**, se revela su código completo en Pantalla (y al pasar a la Parte 2, el código armado muestra las líneas modificadas por `[PARCHE P2]`).
3. **Salidas de la Consola:** Todo lo que `TERMINAL` ejecuta se imprime aquí.

### ⌨️ Operador de Terminal (`TERMINAL`)
Escribe a ciegas en la consola y controla las cámaras del circuito cerrado.

---

## 4. Arquitectura de las 9 Funciones: Parte 1 vs. Parte 2

### 🔹 PARTE 1 · Cadenas Independientes

| Subsistema | Nivel A (`nucleo/` · Sellado) | Nivel B (`medio/`) | Nivel C (`base/`) | Qué te bloquea y cuál es la Pieza Vulnerable en Parte 1 |
| :--- | :--- | :--- | :--- | :--- |
| **M1 · Tracción motriz**<br>*(entrada `n = 5`, normal = `30`)* | **`reactor(n)`**<br>Llama a `x = presion(n)`<br>Devuelve `x * 2`<br>❌ **No comprueba a `presion`** | **`presion(n)`**<br>Llama a `x = carga(n)`<br>✅ **Comprueba `si x > 12 -> bloquear`**<br>Devuelve `x + 5` | **`carga(n)`**<br>Devuelve `n * 2` | Si saboteas `carga`, `presion` lo bloquea al pasar de 12.<br>Como **`reactor` no comprueba el retorno de `presion`**, se debe engañar a **`presion`**. |
| **M2 · Presión hidráulica**<br>*(entrada `n = 6`, normal = `21`)* | **`escudo(n)`**<br>Llama a `x = valvula(n)`<br>✅ **Vigila que `valvula` no sea alterada (`x == pulso(n) - 3`)**<br>Devuelve `x + 6` | **`valvula(n)`**<br>✅ Comprueba `n <= 10` **antes**<br>Llama a `x = pulso(n)`<br>❌ **No comprueba `x` al volver**<br>Devuelve `x - 3` | **`pulso(n)`**<br>Devuelve `n * 3` | Si saboteas `valvula`, `escudo` detecta la alteración.<br>Como **`valvula` validó antes de llamar y no comprueba el retorno de `pulso`**, se debe engañar a **`pulso`**. |
| **M3 · Enfriamiento**<br>*(entrada `n = 5`, normal = `5`)* | **`latido(n)`**<br>Llama a `x = flujo(n)`<br>⚠️ **Comprueba `x == freno(n) * 3`**<br>Devuelve `x - 4` | **`flujo(n)`**<br>Llama a `x = freno(n)`<br>❌ **Sin tope máximo**<br>Devuelve `x * 3` | **`freno(n)`**<br>Comprueba `n >= 0`, pero ❌ **sin tope máximo**<br>Devuelve `n - 2` | Si saboteas `flujo`, no cuadra con `freno(n) * 3`.<br>Como **tanto `flujo` como `latido` llaman a `freno(n)` sin tope máximo**, se debe engañar a **`freno`**. |

---

### 🔸 PARTE 2 · El Parche de Emergencia y la Dependencia Compartida (El Pequeño Plus)

Al colapsar los 3 subsistemas en la Parte 1, el robot limpia los sabotajes activos, rota las ventanas de `tolerancias` y aplica un parche de emergencia mal hecho:

| Subsistema | Qué tapó el Parche en Parte 2 | Qué Mala Práctica abrió el Parche en Parte 2 | Pieza Vulnerable en Parte 2 |
| :--- | :--- | :--- | :--- |
| **M1 · Tracción motriz**<br>*(entrada `n = 5`)* | `reactor` ahora **sí vigila** que `presion` no altere su fórmula (`x == carga(n) + 5`). | Al editar `presion.fn`, los programadores **borraron por error el tope `si x > 12` sobre `carga`**. | **`carga`** (`base/`) |
| **M2 · Presión hidráulica**<br>*(entrada `n = 6`)* | `valvula` ahora **sí bloquea** si el retorno de `pulso(n)` supera `20`. | Al reescribir `escudo.fn`, **quitaron la comprobación sobre `valvula`**. | **`valvula`** (`medio/`) |
| **M3 · Enfriamiento**<br>*(entrada `n = 5`)* | `flujo` ahora **sí bloquea** si el retorno de `freno(n)` supera `5`. | 1. **Acoplamiento:** `flujo(n)` ahora suma **`x = freno(n) + carga(n)`** (depende también de `carga` de M1).<br>2. `latido` **quitó su comprobación sobre `flujo`**. | **`flujo`** (`medio/`), compensando el valor que ya viene inflado desde **`carga`**! |

#### ¿Por qué el acoplamiento de `carga` entre M1 y M3 es el "Pequeño Plus" de la Parte 2?
1. En la Parte 2, para romper **M1**, el equipo tiene que subir **`carga`** (por ejemplo, `enganar carga n * 4`, haciendo que `carga(5) = 20`, `presion(5) = 25` y `reactor(5) = 50`).
2. Pero como en la Parte 2 `flujo(5)` (en **M3**) calcula `x = freno(5) + carga(5)`, ese `carga(5) = 20` se mete también en M3 (`x = 3 + 20 = 23`).
3. Si el equipo no toca `flujo`, `flujo(5)` multiplica `23 * 3 = 69` y `latido(5)` da `65`, **¡quemando el fusible de M3 por culpa del cambio en M1!**
4. Al correr `probar`, el equipo ve el efecto colateral y usa `enganar flujo <operacion>` (ej. `enganar flujo x + 4`) para bajar/ajustar la salida de `flujo` (`23 + 4 = 27` $\to$ `latido = 23`) y hacer que M1, M2 y M3 colapsen dentro de sus ventanas al mismo tiempo.

---

## 5. Referencia Completa de Comandos de `TERMINAL`

Se utilizan **exactamente los mismos comandos** en la Parte 1 y en la Parte 2:

| Comando | Qué recibe (Número vs. Operación) | Para qué sirve y Ejemplo |
| :--- | :--- | :--- |
| **`ayuda`** | *(Sin argumentos)* | Imprime en Pantalla los comandos, cómo escribir operaciones y el objetivo de la parte actual. |
| **`abrir <pieza>`** | Nombre de la pieza | Abre `<pieza>.fn` en el visor de Pantalla.<br>Ej: `abrir reactor` |
| **`sondear <pieza> <numero>`** | **Un NÚMERO entero** | *(Gratis)* Ejecuta la función con ese número de entrada y muestra en Pantalla la traza de llamadas.<br>Ej: `sondear reactor 5` |
| **`armar <pieza> <operacion>`** | **Una OPERACIÓN** *(con `n` o `x` y `+ - * /`)* | Reconstruye una función de `base/`. Si coincide con el robot, desbloquea su código en Pantalla y permite sabotearla.<br>Ej: `armar carga n * 2` |
| **`armar <pieza> llama <hija> luego <operacion>`** | Nombre de función hija + **OPERACIÓN** | Reconstruye una función de `medio/` o `nucleo/`. Si coincide, revela en Pantalla todo su código y sus comprobaciones.<br>Ej: `armar presion llama carga luego x + 5` |
| **`enganar <pieza> <operacion>`** | **Una OPERACIÓN** *(o valor de retorno)* | Sabotea una función dependiente (`medio/` o `base/`) previamente armada.<br>Ej: `enganar presion x + 12` |
| **`probar`** | *(Sin argumentos)* | *(Gratis)* Simula los 3 subsistemas (`reactor(5)`, `escudo(6)`, `latido(5)`), mostrando en Pantalla el recorrido, la salida final y si pasó limpio o fue bloqueado por validación interna. |
| **`ejecutar`** | *(Sin argumentos)* | *(No es gratis)* Lanza el ataque real al núcleo. En Parte 1 activa la Parte 2; en Parte 2 resuelve la fase definitivamente. Si falla, aplica cuarentena progresiva (`20 s → 45 s → 90 s`). |
| **`reiniciar`** | *(Sin argumentos)* | Borra los sabotajes activos de la parte actual, pero **conserva todas las piezas que ya estaban armadas**. |
| **`estado`** | *(Sin argumentos)* | Muestra en qué parte van (`Parte 1` o `Parte 2`), cuántas piezas llevan armadas y qué sabotajes están activos. |
| **`camaras` / `camara <n>`** | Número o nombre de cámara | Cambia a ciegas entre la cámara 1 (`SALA DEL NUCLEO`) y la cámara 2 (`DEPENDENCIAS`) que ve Pantalla. |

---

## 6. Ejemplo de Solución Completa (Con Semilla Base)

### Paso 1 · Superar la Parte 1 (Ventanas: M1 `40..54`, M2 `30..44`, M3 `20..34`)
```text
armar presion llama carga luego x + 5
armar pulso n * 3
armar freno n - 2

enganar presion x + 12
enganar pulso n + 27
enganar freno n + 4

probar
ejecutar
```
*(Salidas: M1 = `44`, M2 = `36`, M3 = `23` $\to$ Supera la Parte 1 y activa el Parche de Emergencia de la Parte 2).*

### Paso 2 · Superar la Parte 2 (Con el Parche y la Dependencia Compartida `carga`)
```text
armar carga n * 2
armar valvula llama pulso luego x - 3
armar flujo llama freno luego x * 3

enganar carga n * 4
enganar valvula x + 12
enganar flujo x + 4

probar
ejecutar
```
*(En Parte 2: `carga(5) = 20` hace que M1 dé `50`; en M2 `valvula(6) = 30` hace que M2 dé `36`; y en M3 `flujo(5)` recibe `x = freno(5) + carga(5) = 3 + 20 = 23`, le suma `4` (`27`) y `latido(5)` da `23` $\to$ ¡Colapso total del núcleo y victoria!).*

---

## 7. La Sala del Núcleo en 3D (cámara 1 de Pantalla)

Las dos cámaras ya no se ven en ASCII: Pantalla las ve en 3D, con el mismo motor y estética que La Maraña y El Reflejo (`client/src/player/fases/Nucleo3D.tsx` y `Dependencias3D.tsx`, sobre `motor3d.ts`).

### Cámara 1 · Sala del Núcleo

- **Tres torres** al fondo de la sala, una por subsistema (`M1 · TRACCIÓN`, `M2 · HIDRÁULICA`, `M3 · ENFRIAMIENTO`). Cada torre son **tres bloques apilados**, uno por función: `base/` abajo, `medio/` en medio y `nucleo/` arriba (con candado: está sellado).
- Cada bloque se ve **sellado** (oscuro, `???`), **armado** (circuito verde) o **saboteado** (rosa, con interferencia). Un **dron** marca la pieza abierta con `abrir`.
- **`probar`**: el pulso sube a saltos por las tres torres (base → medio → núcleo, 0,6 s por salto) y junto a cada bloque aparece el valor que devolvió esa función. Si una validación frena el pulso, sale una **barrera roja** en ese bloque. Arriba, la salida final.
- **`ejecutar`**: cada torre enseña su desenlace: **COLAPSA** (sobrecarga, con chispas), **FUSIBLE** (destello y humo) o **AGUANTA**.
- **Parte 2**: un cable rosa une la base de M1 (`carga`) con el medio de M3 (`flujo`): el acoplamiento, y el pulso también viaja por él.

### Cámara 2 · Dependencias

Un corredor donde **la profundidad es la profundidad de la cadena**: tres carriles (M1, M2, M3) y en cada uno tres plataformas, `nucleo/` cerca de la cámara, `medio/` más lejos y `base/` al fondo y más alta (cada nivel en su franja de la pantalla).

- **`probar` / `ejecutar`**: la **llamada** viaja hacia el fondo (azul: el núcleo llama al medio, el medio a la base) y el **retorno** vuelve hacia la cámara (verde), dejando junto a cada plataforma el valor que devolvió. Si una validación frena, el retorno se para ahí con un anillo rojo y `BLOQUEO`.
- **Sin corrida**, un pulso suave baja y sube en bucle para ilustrar la dependencia.
- **Parte 2**: un cable rosa cruza de la base de M1 al medio de M3, y cuando `flujo` llama, el pulso también viaja por él. Los valores se asignan por pieza, así que el paso extra de `carga` en M3 no los descuadra.

**No revela nada nuevo.** Solo enseña lo que la salida de `probar` / `ejecutar`, el árbol y el visor de código ya le dan a Pantalla. Las ventanas (`aguanta_max`, `fusible_corte`) no viajan: siguen siendo de Datos.

**Cómo se alimenta.** Cada `probar` y cada `ejecutar` guardan en el estado la `ultimaCorrida` (`armarCorrida` en `nucleo.ts`), y la cámara 1 la manda como `dibujo` de tipo `nucleo`. La corrida se anima una vez por pestaña: quien recarga la ve ya contada.

**Ligera:** la sala se dibuja una sola vez y cada cuadro solo pega las torres encima (~8 cuadros por segundo, y solo mientras algo se mueve). Mide menos de 1 ms por cuadro, también con la CPU 6× más lenta y en Firefox (`node e2e/_rendimiento.mjs`).
