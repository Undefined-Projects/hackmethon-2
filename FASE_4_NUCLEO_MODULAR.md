# 📄 Documento de Diseño · Fase 4: Núcleo Modular

Temas centrales: Funciones, Pila de Llamadas (Call Stack · LIFO) y Colas de Filtrado (Queues · FIFO)

---

## 1. Narrativa y Contexto dentro de la Historia

En las fases anteriores, el robot intentó bloquear la entrada de nuestros virus, pero como no parecían una amenaza directa no los puso en prioridad y logramos infiltrarnos hasta su sistema interno.

Ahora el objetivo es empezar a hacerle daño físico al robot desde adentro:

• No podemos destruir el código a martillazos porque saltarían todas las alarmas; tenemos que engañar a las funciones que controlan el movimiento y mantenimiento del robot para que, aparentando hacer su trabajo normal, entreguen valores que sobrecarguen y rompan sus piezas.
• El obstáculo (Caja Negra): No podemos ver el código fuente de las funciones del robot de entrada. Solo podemos ver cómo están distribuidos sus archivos en carpetas y qué resultados arrojan cuando trabajan.
• La fase se divide en 2 Partes (2 ciclos):
    • **Parte 1 (Infiltración en la Pila):** El robot aún no sospecha. Hacemos ingeniería inversa de sus funciones y las saboteamos para colapsar sus 3 sistemas físicos.
    • **Parte 2 (El Robot se Blinda con Colas):** Al sentir el daño de la Parte 1, el robot bloquea la edición directa de funciones, rota sus umbrales de seguridad y activa un filtro de 3 Colas de Inspección (sacrificando velocidad por seguridad para revisar cada petición paso a paso).

---

## 2. Conceptos Técnicos que Enseña el Reto

1. **Funciones como Cajas Negras y Modularidad:** Deducir qué operación hace una función a partir de sus entradas y salidas, y entender cómo una función grande se construye llamando a funciones más pequeñas.
2. **Pila de Llamadas (Call Stack — LIFO: Último en entrar, primero en salir):**
    • Cuando una función de nivel A (`nucleo/`) se ejecuta, llama a una de nivel B (`medio/`), y esta llama a una de nivel C (`base/`).
    • El flujo baja (A ↘ B ↘ C), pero los resultados se calculan y suben de abajo hacia arriba (C ↗ B ↗ A): primero termina C (la más profunda), su resultado alimenta a B, y el resultado de B alimenta a A.
3. **Colas de Procesamiento (Queues — FIFO: Primero en entrar, primero en salir):**
    • En la Parte 2, los paquetes de datos deben formarse en colas de espera. El 1er paquete en formarse es consumido por el 1er sistema del robot (M1), el 2º paquete por el 2º sistema (M2), y el 3er paquete por el 3er sistema (M3).

---

## 3. Reparto Asimétrico entre los 3 Jugadores

Ningún integrante puede resolver la fase por su cuenta:

### 🔵 Operador de Datos (DATOS)

No ve las carpetas del código, ni las cámaras, ni las respuestas de la consola. Tiene el esquema relacional de tablas (conectadas por `funcion_id` y `tolerancia_id`):

• **En la Parte 1** ve solo 3 tablas (para no spoilear la Parte 2):
    1. `funciones`: Catálogo de las 9 funciones internas (F1 a F9).
    2. `resultados`: Salidas observadas de cada función cuando recibe distintos números (pares e impares).
    3. `tolerancias`: Las 3 características físicas de movimiento y mantenimiento del robot (M1, M2, M3), cuánto aguanta cada una (`aguanta_max`), a qué valor salta el fusible de emergencia (`fusible_corte`) y qué condición pide su hueco vulnerable.
• **Al pasar a la Parte 2**, aparece dinámicamente la 4ª tabla:
    4. `colas_filtro`: Qué características exige cada una de las 3 colas (`COLA-A`, `COLA-B`, `COLA-C`) para dejar pasar un paquete y qué efecto tiene en la Pila.

### 🌸 Operador de Pantalla (PANTALLA)

No sabe cuánto aguanta el robot ni qué reglas piden las colas. Ve tres cosas:

1. **Monitor de Circuito Cerrado (2 cámaras animadas):**
    • `CAM 1 · SALA DEL NUCLEO`: Las 3 torres físicas (NUC-A, MED-B, BAS-C) con un pulso viajando por los conductos y un dron que se mueve hacia el módulo que el equipo está inspeccionando.
    • `CAM 2 · CONDUCTO Y FILTRO`: En la Parte 1 muestra una animación del pulso bajando y subiendo por los 3 pisos de la Pila; en la Parte 2 muestra las 3 cintas transportadoras de las Colas llevando los paquetes hacia el escáner.
2. **Árbol de Archivos y Visor de Documentos `.fn`:**
    • Ve las 3 carpetas (`nucleo/`, `medio/`, `base/`) con 3 documentos `.fn` en cada una (de ahí el equipo infiere la arquitectura sin que nadie se la explique).
    • Al abrir un documento `.fn`, sus líneas aparecen ocultas con `[ ??? ]` hasta que el equipo descubre y arma esa función.
3. **Salidas de la Consola:** Todo lo que TERMINAL ejecuta (incluyendo la lista de comandos de ayuda) se imprime aquí, por lo que PANTALLA tiene que dictarle a TERMINAL qué comandos existen.

### ⌨️ Operador de Terminal (TERMINAL)

• Está completamente a ciegas: solo tiene la línea de comandos y el aviso *"Escribe ayuda y pregunta a Pantalla qué apareció"*.

---

## 4. Las 9 Funciones y las 3 Características del Robot

El robot tiene 3 sistemas físicos (M1, M2, M3). Cada sistema es una cadena de 3 funciones (A → B → C):

| Sistema Físico | Nivel A (`nucleo/`) | Nivel B (`medio/`) | Nivel C (`base/` — no llama a otra) |
| :--- | :--- | :--- | :--- |
| **M1 · Tracción motriz** (entrada fija n = 5) | `reactor(x)`:<br>• si x es par → x + 25<br>• si x es impar → x * 2 | `presion(x)`:<br>• si x es par → x + 5<br>• si x es impar → x + 5 | `carga(n)`:<br>• devuelve n * 2 |
| **M2 · Presión hidráulica** (entrada fija n = 6) | `escudo(x)`:<br>• si x es par → x + 10<br>• si x es impar → x + 6 | `valvula(x)`:<br>• si x es par → x - 3<br>• si x es impar → x + 5 | `pulso(n)`:<br>• devuelve n * 3 |
| **M3 · Enfriamiento de marcha** (entrada fija n = 5) | `latido(x)`:<br>• si x es par → x - 2<br>• si x es impar → x - 4 | `flujo(x)`:<br>• si x es par → x * 2<br>• si x es impar → x * 3 | `freno(n)`:<br>• devuelve n - 2 |

---

## 5. Condición de Victoria y Sistema Anti-Azar ("El Hueco y el Fusible")

Para que ningún equipo pueda pasar poniendo números al azar o números gigantes sin mapear las funciones, cada característica (M1, M2, M3) tiene tres defensas simultáneas:

1. **Límite inferior (`aguanta_max`):** Es la cantidad que el robot sí aguanta. Si el resultado final queda en o por debajo de este número, al robot no le pasa nada.
2. **Límite superior (`fusible_corte`):** Si alguien mete un número gigante al azar (ej. `* 99`), el resultado rebasa el `fusible_corte`, quema el fusible de emergencia y manda al equipo a cuarentena (20 s → 45 s → 90 s).
3. **El Seguro de Paridad ("El Hueco"):**
    • En operación normal, las funciones del robot están diseñadas para encerrarse solas en una paridad segura:
        • **En M1 (`reactor`):** para cualquier número n, `carga(n) = 2n` siempre sale PAR → `presion` (+ 5) siempre lo vuelve IMPAR → y `reactor` en su rama impar (* 2) siempre devuelve un PAR. Pero el seguro del robot bloquea todos los números pares arriba de `aguanta_max`. El único hueco es lograr que `reactor` devuelva un IMPAR, lo cual solo es posible invirtiendo la paridad desde abajo para que a `reactor` le llegue un PAR y entre a su rama oculta (`x + 25 = IMPAR`).
        • **En M2 (`escudo`):** normalmente `pulso(6) = 18` (PAR) → `valvula` (- 3) da 15 (IMPAR) → `escudo` (+ 6) da 21 (IMPAR). Pero el hueco de M2 exige un resultado PAR entre `aguanta_max` y `fusible_corte`, obligando a meter un IMPAR desde pulso para que `valvula` tome su rama impar (+ 5 = PAR) y `escudo` tome su rama par (+ 10 = PAR).
        • **En M3 (`latido`):** normalmente `freno(5) = 3` (IMPAR) da 5 (IMPAR, muy por debajo de lo que aguanta). El hueco exige subirlo a la ventana entre `aguanta_max` y `fusible_corte` conservando la paridad IMPAR (si por error meten un par, `flujo` y `latido` cambian a su rama par y el seguro lo bloquea).

4. **Semilla aleatoria por equipo y rotación por ciclo:**
    • Cada equipo recibe una semilla distinta al entrar a la fase, por lo que las ventanas (`aguanta_max`, `fusible_corte`) de su tabla `tolerancias` son distintas a las del equipo de la mesa de al lado (imposible copiarse los números entre equipos).
    • Además, al superar la Parte 1 y pasar a la Parte 2, el ciclo rota a nuevas ventanas, obligándolos a recalcular con los nuevos valores.

---

## 6. Flujo de Juego: Parte 1 vs. Parte 2

### Parte 1 · Sabotaje en la Pila (LIFO)

• Al inicio, las funciones de `nucleo/` (A) y `medio/` (B) son difíciles de deducir porque dependen de lo que pasa abajo; en cambio, las de `base/` (C: `carga`, `pulso`, `freno`) son directas.
• El equipo usa `sondear <pieza> <numero>` y la tabla `resultados` de DATOS para descubrir las fórmulas, las registra con `armar` (requisito obligatorio antes de poder sabotear una pieza), las altera con `enganar` para invertir/ajustar la paridad y lanza `ejecutar`.
• Cuando las 3 características (M1, M2, M3) entran al mismo tiempo por su hueco, se completa la Parte 1 y salta la alarma del robot.

### Parte 2 · El Blindaje por Colas (FIFO) y las 3 Estrategias

El robot bloquea `enganar`, aparece la 4ª tabla `colas_filtro` en DATOS, y ahora toda petición debe encolarse con `encolar <etiqueta> <valor> [firma]`.
El robot desencola 3 paquetes en orden FIFO (1º → M1, 2º → M2, 3º → M3) y ofrece una inversión estratégica de dificultad:

| Cola | Hacia dónde va | Qué tan difícil es pasar el filtro de la Cola | Qué exige conocer de la Pila |
| :--- | :--- | :--- | :--- |
| **COLA-C (SEN)** | Directo a `base/` (C) (la función más fácil y que ya armaron en Parte 1) | 🔴 **MÁXIMA EXIGENCIA (4 reglas):** Etiqueta SEN, múltiplo de 3, número IMPAR y firma = valor + 7. | Solo exige tener armada la función de `base/` (C). |
| **COLA-B (CTL)** | Entra en `medio/` (B) (baja a C y al subir a B suma su valor) | 🟡 **EXIGENCIA MEDIA (2 reglas):** Etiqueta CTL, múltiplo de 5, entre -50 y 50. | Exige haber armado `base/` (C) y `medio/` (B). |
| **COLA-A (NUC)** | Entra en `nucleo/` (A) (baja A→B→C y al volver a A suma su valor) | 🟢 **EXIGENCIA BAJA (1 regla):** Etiqueta NUC, cualquier número entero entre -100 y 100. | Exige haber investigado y armado toda la cadena (C, B y A). |

Así, cada equipo puede decidir su estrategia:

• Irse directo por COLA-C lidiando con el filtro matemático más estricto (múltiplos de 3 impares con firma que al subir por B y A caigan en el hueco).
• Entrar por COLA-B armando hasta el nivel medio y cuidando qué múltiplos de 5 son pares o impares.
• Mapear las 9 funciones completas para entrar por la puerta ancha de COLA-A y sumar el ajuste directo en el nivel maestro.
• O combinar las tres colas (ej. 1er paquete por COLA-C, 2º por COLA-B, 3º por COLA-A).

---

## 7. Resumen de Comandos de TERMINAL

• **En ambas partes (gratis):**
    • `ayuda` — imprime los comandos en PANTALLA.
    • `abrir <pieza>` — abre el documento `.fn` en PANTALLA.
    • `sondear <pieza> <numero>` — ejecuta una prueba y muestra en PANTALLA cuánto dio y qué rama (par o impar) tomó cada piso de la Pila.
    • `armar <pieza> <operacion>` — confirma la estructura de una función de `base/`.
    • `armar <pieza> llama <hija> luego <operacion>` — confirma una función de `medio/` o `nucleo/`.
    • `estado` — muestra el avance actual.
    • `reiniciar` — limpia sabotajes o vacía colas conservando las piezas ya armadas.
• **Exclusivos de Parte 1:**
    • `enganar <pieza> <operacion>` — sabotea una función previamente armada.
    • `ejecutar` — prueba las 3 características contra el robot (penaliza con cuarentena si falla).
• **Exclusivos de Parte 2:**
    • `colas` — muestra los 3 turnos FIFO (1º → M1, 2º → M2, 3º → M3) y qué paquetes están formados.
    • `encolar <NUC|CTL|SEN> <valor> [firma]` — pasa un paquete por el filtro de la cola correspondiente.
    • `vaciar` — limpia las colas para reordenar el FIFO.
    • `disparar` — desencola en orden FIFO y ejecuta el ataque final sobre las 3 características (penaliza con cuarentena si falla).
