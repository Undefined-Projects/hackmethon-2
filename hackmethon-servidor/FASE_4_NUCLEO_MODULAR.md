# 📄 Documento de Diseño y Especificación Técnica · Fase 4: Núcleo Modular

**Temas centrales:** Funciones Dependientes, Pila de Llamadas (*Call Stack · LIFO*) y Malas Prácticas de Validación en Código Modular.

---

## 1. Narrativa y Contexto dentro de la Historia

En las fases anteriores logramos atravesar el control de acceso, filtrar las conexiones sospechosas y cruzar el muro perimetral hasta infiltrarnos en el sistema interno del robot.

Ahora el objetivo es **provocar un daño físico real colapsando los 3 subsistemas internos del robot** (Tracción motriz, Presión hidráulica y Enfriamiento de marcha):

- **No podemos destruir las funciones principales a martillazos:** Las 3 funciones maestras que viven en `nucleo/` (`reactor`, `escudo`, `latido`) tienen su **firma sellada por el monitor central** y no permiten edición directa.
- **No podemos meter un número gigante a lo loco:** Cada subsistema físico tiene un límite que el robot resiste (`aguanta_max`) y un **fusible de corte de emergencia (`fusible_corte`)**. Si el resultado final es demasiado bajo, el robot aguanta sin sufrir daño; si metemos un número exagerado (ej. `n * 2000000`), el resultado rebasa el `fusible_corte`, quema el fusible, dispara la alarma y manda al equipo a cuarentena.
- **El obstáculo inicial (Código Compilado `[ ??? ]`):** Al entrar al núcleo, el código interno de los archivos `.fn` está oculto tras `[ ??? ]`. Primero debemos hacer pruebas (`sondear`) y cruzarlas con las tablas de Datos para reconstruir (`armar`) cada función. Al armar una función, se descompila y muestra en Pantalla su código real línea por línea.
- **La vulnerabilidad (Malas Prácticas al Programar Funciones Dependientes):** Las funciones maestras de `nucleo/` dependen de funciones intermedias en `medio/`, que a su vez dependen de funciones en `base/`. Quienes programaron al robot pusieron comprobaciones de seguridad en algunas funciones, pero cometieron **tres malas prácticas clásicas de programación** en otras, dejando huecos donde una función confía a ciegas en su dependencia y **no comprueba lo que esta le devuelve**.

---

## 2. Conceptos Técnicos que Enseña el Reto

1. **Funciones Dependientes y Modularidad:**
   - Entender cómo un programa se divide en piezas que se llaman entre sí (`nucleo/ -> medio/ -> base/`).
   - Comprender que el resultado de una función maestra depende directamente de los valores que calculan y retornan sus funciones auxiliares.
2. **Pila de Llamadas (*Call Stack — LIFO: Último en entrar, primero en salir*):**
   - Cuando se ejecuta una función de Nivel A (`nucleo/`), esta pausa su ejecución y llama a una de Nivel B (`medio/`), que a su vez llama a una de Nivel C (`base/`).
   - El flujo de llamadas baja (`A ↘ B ↘ C`), pero los resultados se resuelven desde el fondo y suben de regreso (`C ↗ B ↗ A`): primero termina `C`, su retorno alimenta a `B`, y el retorno de `B` alimenta a `A`.
3. **Malas Prácticas de Programación en la Validación de Funciones:**
   - **Confianza ciega en el nivel intermedio:** Validar el fondo de la pila (`B` comprueba a `C`), pero olvidar validar el nivel intermedio (`A` no comprueba a `B`).
   - **Validación prematura antes de apilar:** Validar el parámetro de entrada `n` al inicio de una función **antes** de llamar a una función hija, y olvidar validar el valor `x` que esa función hija devuelve al regresar de la pila.
   - **Acoplamiento a una dependencia compartida sin tope:** Intentar validar el resultado de `B` comparándolo contra `C(n) * 3` (llamando de nuevo a la misma dependencia `C`), sin que ni `A`, ni `B`, ni `C` comprueben el límite máximo de `C`. Si `C` devuelve un valor alterado, ambos lados de la comparación cambian por igual y la validación queda burlada.

---

## 3. Reparto Asimétrico entre los 3 Jugadores

Ningún jugador puede resolver la fase por sí solo:

### 🔵 Operador de Datos (`DATOS`)
No ve las carpetas (`nucleo/`, `medio/`, `base/`), no ve el código fuente desbloqueado ni sabe qué función comprueba a cuál. Tiene un esquema relacional con **3 tablas** conectadas por `funcion_id`:

1. **`funciones`**: Catálogo de las 9 funciones del robot (`F1` a `F9`) y qué rol cumple cada una en el sistema.
2. **`resultados`**: Qué devuelve cada función en operación normal para distintas entradas de prueba y qué valor recibe de abajo (permite deducir sin adivinanzas qué operación hace cada pieza para poder armarla).
3. **`tolerancias`**: Los 3 subsistemas físicos del robot (`M1`, `M2`, `M3`), qué función maestra los controla (`F7`, `F8`, `F9`), su entrada fija de ciclo (`5`, `6`, `5`), su valor normal, cuánto aguanta el robot sin romperse (**`aguanta_max`**) y a qué valor salta la alarma del fusible (**`fusible_corte`**).

### 🌸 Operador de Pantalla (`PANTALLA`)
No tiene las tablas de `resultados` ni sabe cuánto valen `aguanta_max` o `fusible_corte`. Ve tres superficies:

1. **Monitor de Circuito Cerrado (2 cámaras animadas 15×36):**
   - `CAM 1 · SALA DEL NUCLEO`: Las 3 torres físicas (`NUC-A`, `MED-B`, `BAS-C`), el pulso viajando por los conductos, el dron posicionado sobre la carpeta abierta y el contador de piezas armadas.
   - `CAM 2 · PILA DE EJECUCION`: Animación en vivo de cómo las llamadas bajan apilándose (`[v] APILANDO LLAMADAS...`) y suben retornando valores (`[^] RETORNANDO VALORES...`), recordando que *"el fondo se resuelve primero"*.
2. **Árbol de Carpetas y Visor de Código `.fn`:**
   - Ve las 3 carpetas (`nucleo/`, `medio/`, `base/`) y qué archivos `.fn` viven dentro de cada una.
   - Mientras una pieza **no está armada**, sus líneas internas y comprobaciones aparecen ocultas con `[ ??? ]`.
   - **En cuanto el equipo arma esa pieza (`armar`)**, el archivo muestra su código completo: a qué función llama, qué operación realiza y **qué comprobación de seguridad tiene (o qué comprobación olvidó hacer el programador)**.
3. **Salidas de la Consola:** Todo lo que `TERMINAL` ejecuta (`ayuda`, `sondear`, `armar`, `enganar`, `probar`, `ejecutar`) se imprime aquí.

### ⌨️ Operador de Terminal (`TERMINAL`)
Está completamente a ciegas: solo ve la consola donde escribe los comandos. Debe pedirle a **Pantalla** que le lea la ayuda, el árbol de archivos, el código desbloqueado y las tablas de simulación, y apoyarse en **Datos** para conocer las operaciones de referencia y las ventanas entre `aguanta_max` y `fusible_corte`.

---

## 4. Arquitectura de las 9 Funciones y sus 3 Malas Prácticas

El robot cuenta con 3 subsistemas físicos (`M1`, `M2`, `M3`). Cada subsistema es una cadena de 3 niveles (`nucleo/ -> medio/ -> base/`):

### Subsistema M1 · Tracción motriz (`reactor -> presion -> carga` · entrada de ciclo `n = 5`)
- **`carga.fn` (`base/`):**
  ```text
  recibe n
  devuelve n * 2
  ```
  *(Con `n = 5`, devuelve `10`).*
- **`presion.fn` (`medio/`):**
  ```text
  recibe n
  x = carga(n)
  si x > 12 -> bloquear ("retorno de carga supera tope 12")
  devuelve x + 5
  ```
  *(Con `x = 10`, comprueba `10 <= 12` OK y devuelve `15`).*
- **`reactor.fn` (`nucleo/` · Firma sellada):**
  ```text
  recibe n
  [firma sellada en nucleo · no editable]
  x = presion(n)
  // mala practica: confia en presion(n) y no comprueba su retorno
  devuelve x * 2
  ```
  *(Con `x = 15`, devuelve `30`).*
- **Diagnóstico y Solución de M1:**
  - Si el equipo intenta sabotear `carga` (ej. `enganar carga n * 5` $\to 25$), la comprobación `si x > 12 -> bloquear` dentro de `presion` **lo detecta y lo bloquea** (y si `carga` devuelve $\le 12$, `reactor` da como máximo $(12 + 5) \times 2 = 34$, que no supera `aguanta_max = 40`).
  - **La mala práctica:** `reactor` confía en que `presion` ya filtró todo y **no comprueba lo que devuelve `presion`**.
  - **Pieza que se debe engañar:** **`presion`** (ej. `enganar presion x + 12`, haciendo que `presion(5)` devuelva `22` y `reactor(5)` devuelva `44`, superando `aguanta_max = 40` sin tocar `fusible_corte = 54`).

---

### Subsistema M2 · Presión hidráulica (`escudo -> valvula -> pulso` · entrada de ciclo `n = 6`)
- **`pulso.fn` (`base/`):**
  ```text
  recibe n
  // sin comprobacion de tope al salir hacia valvula
  devuelve n * 3
  ```
  *(Con `n = 6`, devuelve `18`).*
- **`valvula.fn` (`medio/`):**
  ```text
  recibe n
  si n > 10 -> bloquear ("entrada n supera tope 10")
  x = pulso(n)
  // mala practica: valido n antes, pero no comprueba x al volver de pulso
  devuelve x - 3
  ```
  *(Comprueba `6 <= 10` antes de llamar a `pulso`, recibe `x = 18` sin comprobarlo y devuelve `15`).*
- **`escudo.fn` (`nucleo/` · Firma sellada):**
  ```text
  recibe n
  [firma sellada en nucleo · no editable]
  x = valvula(n)
  si valvula fue alterada (x != pulso(n) - 3) -> bloquear
  devuelve x + 6
  ```
  *(Verifica que `valvula` haya respetado su fórmula `pulso(n) - 3`, y con `x = 15` devuelve `21`).*
- **Diagnóstico y Solución de M2:**
  - Si el equipo intenta sabotear `valvula` (ej. `enganar valvula x + 15`), la comprobación de integridad dentro de `escudo` (`x != pulso(n) - 3`) **lo detecta y lo bloquea**.
  - **La mala práctica:** `valvula` comprueba el parámetro `n <= 10` **antes** de bajar por la pila a llamar a `pulso(n)`, y cuando `pulso(n)` termina y devuelve `x`, **`valvula` no comprueba el retorno `x`**. Como `valvula` le resta 3 limpiamente al valor que le mande `pulso`, `escudo` ve que `x == pulso(n) - 3` se cumple y no sospecha nada.
  - **Pieza que se debe engañar:** **`pulso`** (ej. `enganar pulso n + 27` o `n * 5`, haciendo que `pulso(6)` devuelva `33`, `valvula(6)` devuelva `30` y `escudo(6)` devuelva `36`, entre `aguanta_max = 30` y `fusible_corte = 44`).

---

### Subsistema M3 · Enfriamiento de marcha (`latido -> flujo -> freno` · entrada de ciclo `n = 5`)
- **`freno.fn` (`base/`):**
  ```text
  recibe n
  si n < 0 -> bloquear ("entrada negativa")
  // mala practica: comprueba negativo pero no tiene tope maximo
  devuelve n - 2
  ```
  *(Con `n = 5`, devuelve `3`).*
- **`flujo.fn` (`medio/`):**
  ```text
  recibe n
  x = freno(n)
  // mala practica: confia en freno(n) sin comprobar tope maximo
  devuelve x * 3
  ```
  *(Con `x = 3`, devuelve `9`).*
- **`latido.fn` (`nucleo/` · Firma sellada):**
  ```text
  recibe n
  [firma sellada en nucleo · no editable]
  x = flujo(n)
  si x != freno(n) * 3 -> bloquear ("desfase entre flujo y freno")
  devuelve x - 4
  ```
  *(Comprueba que `flujo(5)` coincida con `freno(5) * 3`, y con `x = 9` devuelve `5`).*
- **Diagnóstico y Solución de M3:**
  - Si el equipo intenta sabotear `flujo` (ej. `enganar flujo x + 20`), `flujo(5)` devuelve `23`, pero `latido` llama a `freno(5) * 3` (que sigue siendo `3 * 3 = 9`), detecta que `23 != 9` y **lo bloquea por desfase**.
  - **La mala práctica:** Para "validar" a `flujo`, `latido` vuelve a llamar a la **misma dependencia `freno(n)`**, y **ni `freno`, ni `flujo`, ni `latido` comprueban un tope máximo para lo que devuelve `freno`**.
  - **Pieza que se debe engañar:** **`freno`** (ej. `enganar freno n + 4` o `n * 2`, haciendo que `freno(5)` devuelva `9`, `flujo(5)` devuelva `9 * 3 = 27`, la comprobación de `latido` compare `27 == 9 * 3` dando **OK**, y `latido(5)` devuelva `27 - 4 = 23`, entre `aguanta_max = 20` y `fusible_corte = 34`).

---

## 5. Sistema Anti-Fuerza Bruta (`aguanta_max`, `fusible_corte` y Semilla por Equipo)

1. **Doble límite (`aguanta_max` y `fusible_corte`):**
   - Si una salida final queda en o por debajo de `aguanta_max`, el subsistema **AGUANTA** y no colapsa.
   - Si alguien intenta hacer trampa metiendo una operación absurda como `n * 20000000000000`, la salida final supera el `fusible_corte`, **QUEMA EL FUSIBLE DE EMERGENCIA**, el ataque falla y el equipo recibe una penalización de **cuarentena progresiva** (`20 s → 45 s → 90 s`).
   - Esto obliga al equipo a **calcular hacia atrás en la Pila**: sabiendo qué operación hace la función maestra de `nucleo/`, deben elegir una operación en la dependencia vulnerable para que el resultado final caiga dentro de la ventana `(aguanta_max, fusible_corte)`.
2. **Semilla aleatoria por equipo:**
   - Al entrar a la fase, cada equipo recibe una semilla distinta que desplaza las ventanas `(aguanta_max, fusible_corte)` de su tabla `tolerancias`. Así, dos equipos en mesas contiguas tienen límites distintos y no pueden copiarse los números.

---

## 6. Referencia Completa de Comandos de `TERMINAL`

| Comando | Qué recibe (Número vs. Operación) | Para qué sirve y Ejemplo |
| :--- | :--- | :--- |
| **`ayuda`** | *(Sin argumentos)* | Imprime en Pantalla la lista de comandos, cómo escribir operaciones y la condición de victoria. |
| **`abrir <pieza>`** | Nombre de la pieza | Abre `<pieza>.fn` en el visor de Pantalla.<br>Ej: `abrir reactor` |
| **`sondear <pieza> <numero>`** | **Un NÚMERO entero** | *(Gratis)* Ejecuta la función con ese número de entrada y muestra en Pantalla la traza LIFO paso a paso.<br>Ej: `sondear reactor 5` |
| **`armar <pieza> <operacion>`** | **Una OPERACIÓN** *(con `n` o `x` y `+ - * /`)* | Reconstruye una función de `base/`. Si coincide con el robot, desbloquea su código en Pantalla y permite sabotearla.<br>Ej: `armar carga n * 2` |
| **`armar <pieza> llama <hija> luego <operacion>`** | Nombre de función hija + **OPERACIÓN** | Reconstruye una función de `medio/` o `nucleo/`. Si coincide, revela en Pantalla todo su código y sus comprobaciones.<br>Ej: `armar presion llama carga luego x + 5` |
| **`enganar <pieza> <operacion>`** | **Una OPERACIÓN** *(o valor de retorno)* | Sabotea una función dependiente (`medio/` o `base/`) previamente armada.<br>Ej: `enganar presion x + 12` |
| **`probar`** | *(Sin argumentos)* | *(Gratis)* Simula los 3 subsistemas (`reactor(5)`, `escudo(6)`, `latido(5)`), mostrando en Pantalla el recorrido de la pila, la salida final y si pasó limpio o fue bloqueado por validación interna. |
| **`ejecutar`** | *(Sin argumentos)* | *(No es gratis)* Lanza el sabotaje real al núcleo. Si los 3 subsistemas pasan las comprobaciones internas y caen entre `aguanta_max` y `fusible_corte`, gana la fase; si no, penaliza con cuarentena. |
| **`reiniciar`** | *(Sin argumentos)* | Borra todos los sabotajes puestos con `enganar`, pero **conserva todas las piezas que ya estaban armadas**. |
| **`estado`** | *(Sin argumentos)* | Muestra cuántas piezas llevan armadas (`X de 9`) y qué sabotajes están activos. |
| **`camaras` / `camara <n>`** | Número o nombre de cámara | Cambia a ciegas entre la cámara 1 (`SALA DEL NUCLEO`) y la cámara 2 (`PILA DE EJECUCION`) que ve Pantalla. |

---

## 7. Recorrido Paso a Paso de una Partida Ideal

1. **Inicio:** `TERMINAL` escribe `ayuda`. `PANTALLA` le lee los comandos y qué archivos `.fn` ve en `nucleo/`, `medio/` y `base/`.
2. **Descompilación (`sondear` + `armar`):**
   - Cruzando la tabla `resultados` de `DATOS` con `sondear`, el equipo arma las funciones:
     - `armar carga n * 2`
     - `armar pulso n * 3`
     - `armar freno n - 2`
     - `armar presion llama carga luego x + 5`
     - `armar valvula llama pulso luego x - 3`
     - `armar flujo llama freno luego x * 3`
     - `armar reactor llama presion luego x * 2`
     - `armar escudo llama valvula luego x + 6`
     - `armar latido llama flujo luego x - 4`
3. **Lectura de malas prácticas en `PANTALLA`:**
   - Al quedar armadas, `PANTALLA` lee el código de cada cadena y descubre quién sí comprueba y quién no comprueba:
     - En **M1**: `presion` comprueba a `carga` (`x <= 12`), pero `reactor` **no comprueba** a `presion` $\to$ hay que atacar **`presion`**.
     - En **M2**: `escudo` vigila la fórmula de `valvula`, pero `valvula` **no comprueba** el retorno `x` de `pulso` $\to$ hay que atacar **`pulso`**.
     - En **M3**: `latido` compara `flujo` contra `freno(n) * 3`, pero ninguno comprueba el tope máximo de **`freno`** $\to$ hay que atacar **`freno`**.
4. **Cálculo con `DATOS` e inyección (`enganar` + `probar`):**
   - `DATOS` revisa su tabla `tolerancias` (ej. para semilla base: M1 entre `40` y `54`, M2 entre `30` y `44`, M3 entre `20` y `34`).
   - `TERMINAL` inyecta los sabotajes:
     - `enganar presion x + 12` *(da `22`, y `reactor` devuelve `22 * 2 = 44`)*
     - `enganar pulso n + 27` *(da `33`, `valvula` devuelve `30` y `escudo` devuelve `36`)*
     - `enganar freno n + 4` *(da `9`, `flujo` devuelve `27`, cuadra con `9 * 3` y `latido` devuelve `23`)*
   - `TERMINAL` corre `probar`. `PANTALLA` confirma que las 3 cadenas dicen `PASO LIMPIO` con salidas `44`, `36` y `23`. `DATOS` confirma que las 3 están dentro de sus ventanas.
5. **Victoria (`ejecutar`):**
   - `TERMINAL` corre `ejecutar`. Los 3 subsistemas colapsan al mismo tiempo y la Fase 4 queda superada.
