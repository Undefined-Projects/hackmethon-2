# 📄 Documento de Diseño · Fase 4: Núcleo Modular

**Temas centrales:** Funciones Dependientes, Pila de Llamadas (*Call Stack · LIFO*) y Malas Prácticas de Validación en Código Modular.

---

## 1. Narrativa y Contexto dentro de la Historia

En las fases anteriores, nuestros virus lograron atravesar el control de acceso, ocultarse en el tráfico y superar el muro perimetral hasta infiltrarse en el sistema interno del robot.

Ahora el objetivo es **colapsar físicamente los 3 subsistemas principales del robot desde adentro** (Tracción motriz, Presión hidráulica y Enfriamiento de marcha):

- **Las funciones maestras están selladas:** No podemos editar directamente las funciones de `nucleo/` (`reactor`, `escudo`, `latido`) porque el monitor central vigila su firma.
- **El código empieza oculto (`[ ??? ]`):** Al entrar al núcleo, solo vemos cómo están organizados los archivos `.fn` en tres carpetas (`nucleo/`, `medio/`, `base/`). Debemos hacer pruebas (`sondear`) y cruzarlas con las tablas de Datos para reconstruir (`armar`) cada función y descompilar su código fuente.
- **El punto débil (Malas prácticas al programar funciones dependientes):** Las funciones maestras de `nucleo/` dependen de funciones en `medio/`, que a su vez dependen de `base/`. Quienes programaron el robot pusieron comprobaciones de seguridad en algunas funciones, pero cometieron **malas prácticas de programación** en otras (olvidaron validar el retorno de una dependencia, validaron antes de tiempo en la pila, o acoplaron la verificación a la misma dependencia sin tope máximo).

---

## 2. Conceptos Técnicos que Enseña el Reto

1. **Funciones Dependientes y Modularidad:** Cómo un sistema complejo se divide en funciones pequeñas que se llaman unas a otras (`nucleo/ -> medio/ -> base/`), y cómo el comportamiento de una función superior depende de lo que le devuelven sus funciones auxiliares.
2. **Pila de Llamadas (*Call Stack — LIFO: Último en entrar, primero en salir*):**
   - Cuando se invoca una función de `nucleo/` (Nivel A), esta apila una llamada a `medio/` (Nivel B), que a su vez apila una llamada a `base/` (Nivel C).
   - El fondo (`base/`) se resuelve primero y su valor sube de regreso por la pila hacia `medio/` y finalmente hacia `nucleo/`.
3. **Malas Prácticas al Validar Dependencias:**
   - Una función nunca debe confiar a ciegas en el valor que le devuelve otra sin comprobar sus límites.
   - Validar los datos **antes** de llamar a una función hija no protege contra lo que esa función hija devuelva al desapilarse.
   - Validar una función comparándola contra otra que depende de la misma pieza base sin validar el tope de la base crea una falsa sensación de seguridad.

---

## 3. Reparto Asimétrico entre los 3 Jugadores

Ningún integrante puede resolver la fase por su cuenta:

### 🔵 Operador de Datos (`DATOS`)
No ve las carpetas, ni el código fuente, ni qué comprobaciones internas hace cada función. Tiene 3 tablas relacionales conectadas por `funcion_id`:
1. **`funciones`**: Catálogo de las 9 funciones internas (`F1` a `F9`) y su rol en el robot.
2. **`resultados`**: Qué devuelve cada función en operación normal para distintas entradas de prueba (lo que permite deducir la operación de cada pieza para poder armarla).
3. **`tolerancias`**: Los 3 subsistemas físicos del robot (`M1`, `M2`, `M3`), su entrada de ciclo, cuánto aguanta cada uno sin romperse (`aguanta_max`) y a qué valor salta el fusible de emergencia (`fusible_corte`).

### 🌸 Operador de Pantalla (`PANTALLA`)
No sabe cuánto aguanta cada subsistema (`aguanta_max`) ni dónde salta el fusible (`fusible_corte`), ni tiene la tabla de resultados de referencia. Ve tres cosas:
1. **Monitor de Circuito Cerrado (2 cámaras animadas):**
   - `CAM 1 · SALA DEL NUCLEO`: Las 3 torres (`NUC-A`, `MED-B`, `BAS-C`), el pulso viajando entre niveles y el dron posicionado sobre el módulo abierto.
   - `CAM 2 · PILA DE EJECUCION`: Animación del flujo LIFO apilando llamadas hacia el fondo y retornando valores hacia arriba.
2. **Árbol de Archivos y Visor de Código `.fn`:**
   - Ve qué archivos viven en `nucleo/`, `medio/` y `base/`.
   - Mientras una función no está armada, su interior aparece oculto con `[ ??? ]`.
   - **En cuanto el equipo arma una función (`armar`)**, se revela su código completo en Pantalla, mostrando **qué comprobaciones de seguridad tiene y dónde está la mala práctica (qué retorno no se comprueba)**.
3. **Salidas de la Consola:** Todo lo que `TERMINAL` ejecuta aparece aquí.

### ⌨️ Operador de Terminal (`TERMINAL`)
Está completamente a ciegas: solo tiene la línea de comandos y debe coordinarse con Pantalla y Datos para sondear, armar, engañar, probar y ejecutar.

---

## 4. Las 3 Cadenas de Funciones y sus Malas Prácticas

Cada subsistema del robot es una cadena de 3 funciones (`nucleo/ -> medio/ -> base/`). En cada cadena hay una validación que bloquea sabotajes descuidados y una **mala práctica de programación** que deja una dependencia sin comprobar:

| Subsistema | Nivel A (`nucleo/` · Sellado) | Nivel B (`medio/`) | Nivel C (`base/`) | Mala Práctica y Pieza Vulnerable |
| :--- | :--- | :--- | :--- | :--- |
| **M1 · Tracción motriz**<br>*(entrada fija `n = 5`, normal = `30`)* | **`reactor(n)`**<br>Llama a `x = presion(n)`<br>Devuelve `x * 2`<br>❌ **No comprueba el retorno `x` de `presion`** | **`presion(n)`**<br>Llama a `x = carga(n)`<br>✅ **Comprueba `si x > 12 -> bloquear`**<br>Devuelve `x + 5` | **`carga(n)`**<br>Devuelve `n * 2` | Si saboteas `carga`, `presion` lo bloquea al superar 12.<br>Como **`reactor` no comprueba lo que devuelve `presion`**, se debe engañar a **`presion`**. |
| **M2 · Presión hidráulica**<br>*(entrada fija `n = 6`, normal = `21`)* | **`escudo(n)`**<br>Llama a `x = valvula(n)`<br>✅ **Comprueba que `valvula` no haya alterado su fórmula (`x == pulso(n) - 3`)**<br>Devuelve `x + 6` | **`valvula(n)`**<br>✅ Comprueba `si n > 10` **antes** de llamar a `pulso(n)`<br>Llama a `x = pulso(n)`<br>❌ **No comprueba `x` al regresar de `pulso`**<br>Devuelve `x - 3` | **`pulso(n)`**<br>Devuelve `n * 3` | Si saboteas `valvula`, `escudo` detecta que su fórmula fue alterada.<br>Como **`valvula` validó antes de bajar a la pila y no comprueba el retorno de `pulso`**, se debe engañar a **`pulso`**. |
| **M3 · Enfriamiento de marcha**<br>*(entrada fija `n = 5`, normal = `5`)* | **`latido(n)`**<br>Llama a `x = flujo(n)`<br>⚠️ **Comprueba `si x != freno(n) * 3 -> bloquear`**<br>Devuelve `x - 4` | **`flujo(n)`**<br>Llama a `x = freno(n)`<br>❌ **No comprueba tope máximo de `x`**<br>Devuelve `x * 3` | **`freno(n)`**<br>Comprueba `n >= 0`, pero ❌ **sin tope máximo**<br>Devuelve `n - 2` | Si saboteas `flujo`, `latido` detecta desfase contra `freno(n) * 3`.<br>Pero como **tanto `flujo` como la verificación de `latido` dependen de `freno(n)` sin comprobar su tope máximo**, al engañar a **`freno`** ambos lados cuadran y el sabotaje pasa limpio. |

---

## 5. Comandos de Terminal y Flujo de Resolución

1. **Explorar y Descompilar (`abrir`, `sondear`, `armar`):**
   - `abrir <pieza>`: Muestra el archivo `.fn` en Pantalla (inicialmente con `[ ??? ]`).
   - `sondear <pieza> <numero>`: Ejecuta la función con un número de prueba y muestra en Pantalla la traza LIFO de la Pila.
   - Cruzando la traza con la tabla `resultados` de Datos, el equipo reconstruye las piezas:
     - En `base/`: `armar <pieza> <operacion>` (ej. `armar pulso n * 3`).
     - En `medio/` y `nucleo/`: `armar <pieza> llama <hija> luego <operacion>` (ej. `armar presion llama carga luego x + 5`).
   - Al armar cada pieza, Pantalla ve sus líneas de código reales y descubre qué validaciones tiene y cuál retorno quedó sin comprobar.

2. **Sabotear la Dependencia Vulnerable (`enganar`):**
   - `enganar <pieza> <operacion>`: Modifica la operación de una función dependiente (`medio/` o `base/`) que ya haya sido armada.
   - Si intentan engañar una función de `nucleo/`, el sistema rechaza la edición porque su firma está sellada.

3. **Simular y Verificar con Datos (`probar`):**
   - `probar`: Corre una simulación gratuita de los 3 subsistemas (`reactor(5)`, `escudo(6)`, `latido(5)`).
   - Pantalla ve el recorrido por la pila, si alguna validación interna bloqueó el cambio (`BLOQUEADO`) o si pasó limpio (`PASO LIMPIO`), y el valor numérico de `salida`.
   - Pantalla le canta las 3 salidas a Datos, quien verifica en la tabla `tolerancias` que cada salida supere `aguanta_max` y quede por debajo de `fusible_corte`.

4. **Ejecutar el Ataque (`ejecutar`):**
   - `ejecutar`: Aplica el sabotaje real sobre el núcleo.
   - Si algún subsistema fue bloqueado por validación interna, no superó `aguanta_max` o quemó el `fusible_corte`, se registra un fallo y se activa la cuarentena progresiva.
   - Si los 3 subsistemas caen dentro de su ventana de sobrecarga pasando limpios por la pila, los 3 sistemas colapsan y el equipo supera la Fase 4.
