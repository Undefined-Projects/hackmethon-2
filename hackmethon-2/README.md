# HACK(ME)THON 2.0 · The Anatomy of a Machine

> *"El instinto es solo un algoritmo sin documentar"*

Portada del evento y registro de participantes. Misma arquitectura que la primera
edición: la portada es HTML, CSS y JavaScript puros, y el registro son tres
funciones serverless sobre Postgres en Vercel.

**Sábado 28 de noviembre de 2026, 16:00 a 22:00 · Auditorio MENLO, Tec de
Monterrey Campus Chihuahua.**

## Qué cambió respecto a la 1ª edición

La terminal IBM 3277 de fósforo magenta se queda — paleta, rayado,
paneles, teclas PF y línea 24 —, pero ahora está conectada a un paciente:

- **Trama**: una máquina viva infecta la red con un gusano polimórfico y no se
  puede desconectar por su *dead man's switch*. Hay que operarla en vivo.
- **Monitor de signos vitales** en la portada: ECG en barrido dibujado en
  `<canvas>`, frecuencia cardiaca, mutación y nodos infectados.
- **BYPASS, el minijuego** (`sitio/bypass.js`), entre el texto de portada
  y el monitor. Estilo Flappy Bird: el jugador es un pulso que escapó del
  corazón y vuela entre válvulas de circuito y enredadera, dejando un trazo
  de ECG. Espacio, clic o toque para latir. Desde los 8 puntos el gusano
  muta algunas válvulas y se mueven. **El chiwuacornio** (la mascota de la
  organización: un chihuahua café claro sentado, con camisa blanca de la
  Chihuahua Tech Week y cuerno de unicornio de colores; pixel art de 36×55,
  la mitad de la altura del juego, en `CHIWUA_1` de `bypass.js`, sacado de
  `chihuacornio.jpeg`; está animado: respira, parpadea, mueve las orejas,
  le brilla el cuerno, abre la boca al cargar, retrocede al escupir, frunce
  las cejas en la furia y brinca de gusto con ojos felices cuando el pulso
  se para; las poses salen de `poseChiwua()`) vive en el borde derecho: sube y baja siguiendo al pulso a
  medias y le escupe virus apuntados; antes de cada disparo se le encienden
  el cuerno y la boca (0.45 s de aviso). En el motor se sigue llamando `gusano`. Las válvulas se
  tragan los virus, así que sirven de escudo. Dispara más seguido y más
  rápido conforme suben los puntos. **Cada 10 válvulas se enfurece**: se pone
  rojo y tiembla, la pantalla late en rojo, deja de salir tubería y escupe
  tres muros de virus con un solo hueco cada uno (el primero centrado en el
  pulso). Los tiempos y tamaños están en la constante `FURIA` de
  `bypass.js`. **Cada 20 válvulas el mundo se voltea**: la pantalla gira
  sobre el eje vertical, de izquierda a derecha (el gusano queda a la
  izquierda y las válvulas llegan desde ahí; la gravedad no cambia);
  a los 40 regresa, y así. Es un espejo del dibujo, no física: el motor no cambia y el servidor no se
  entera. Se ajusta con `GIRO` en `bypass.js`. El récord se guarda en el navegador
  (`localStorage`, clave `hmt2-bypass`). Se pausa solo fuera de pantalla.
  Las raíces del corazón ahora se enchufan en este cuadro.
- **La cuenta regresiva va en latidos** (a 72 lpm), con el DD:HH:MM:SS al lado.
- **Easter egg**: si el monitor está a la vista y nadie mueve nada, el paciente
  entra en bradicardia (20 s) y luego en paro (35 s): el tubo se tiñe de rojo y
  se arma el *switch* con cuenta de 10. Cualquier movimiento lo revive.
  Los umbrales son `BRADI`, `PARO` y `MECHA` en `script.js`.
- **Paneles renombrados**: Historia clínica · Protocolo de disección (6
  sistemas) · Equipo quirúrgico (Patólogo, Cirujano, Anestesiólogo) ·
  Quirófano · Protocolo operatorio · Consentimiento informado · Contraindicaciones.
- **Colores nuevos**: `--sangre` (`#ff3355`), reservado para la alarma de
  paro, y `--clorofila` (`#3ddc97`, con `-hi` y `-dim`), reservado para lo
  vegetal: hojas, tallos y raíces. Ninguno de los dos va en texto ni botones.
- **El jardín** (`sitio/jardin.js`): la máquina no se construyó, creció. Un
  solo generador hace pistas de circuito (giros de 45°) que se ramifican como
  plantas, con hojas, vías de soldadura, chips y flores. Con él se siembran:
  - el **corazón del espécimen** en la portada: pixel art generado con la
    curva del corazón, tramado Bayer, una ventana de disección con circuito,
    vasos que son cables y una flor que brota de la vena. Late con el ECG y le
    cuelgan raíces que se enchufan al monitor, por donde baja un pulso de luz;
  - **enredaderas** en los bordes de cada panel, que crecen con el scroll y son
    más tupidas mientras más abajo esté el panel;
  - una **enredadera en el título**: guías que cuelgan de la base de algunas
    letras, brotes encima y una flor sobre el (ME). Nace de las celdas █ de
    cada bloque y se mueve con su glitch; brota sola al cargar;
  - **micelio** entre panel y panel, por donde viaja el gusano;
  - una **textura de nervaduras** casi invisible en el fondo.
  Con el paciente en paro todo se marchita a rojo; al revivirlo, rebrota.
  Usa azar con semilla: la página siempre crece igual.
- **Láminas de espécimen** (SVG en `index.html`) para los 6 sistemas, mitad
  planta y mitad circuito: neurona/árbol, mimosa/interruptor,
  semilla/oscilador, hoja/circuito impreso, anillos/disco, raíces/red.
- **Registro por persona** (desde el 12 de octubre de 2026), según
  `FORMULARIO_REGISTRO_HACKMETHON_2026.md`: cada quien se inscribe y, sobre
  el equipo, elige una de tres: unirse a uno de la lista (con su contraseña),
  crear uno (nombre, contraseña y logo dibujado en un editor de 16 × 16) o
  pedir que lo acomoden. Ver *Cómo funciona el registro*, abajo.
- **La agenda va en tiempos relativos** (`H+0:40`…), así que no hay que
  reescribirla si cambia la hora de inicio.
- **Responsiva**: casilla obligatoria; el servidor la exige.

### Cupo

En la 2.0 **no hay límite**: sin `CUPO_EQUIPOS`, el servidor nunca cierra el
registro por cupo. Desde el registro por persona, el cupo cuenta **personas**
(la variable conserva su nombre). Si algún día hace falta un tope, se pone
desde el panel (CUPO DE PERSONAS; **0 = sin límite**) y aplica al momento;
con tope, la portada muestra "· quedan N" y el registro se cierra al
llenarse. El texto que se ve en la portada es `cupo` en `config.js`.

### BYPASS en el teléfono (pantalla completa)

El botón **▸ PANTALLA COMPLETA** (en la cabecera del juego, y uno grande
en la pantalla de inicio cuando el dispositivo es táctil) pone el juego en
pantalla completa y pide la orientación horizontal. Se late tocando
cualquier parte de la pantalla; **✕ SALIR** regresa a la página.

- **Carga de verdad**, no decorado ("PREPARANDO QUIRÓFANO"): espera a que
  la rotación se acomode, precalcula los personajes, despierta el audio,
  pide la semilla de la partida al servidor y mide 30 cuadros de la
  escena. Si el teléfono no llega a ~45 cuadros por segundo, entra en
  **modo ligero** (sin partículas ni brillo del rastro).
- **Mientras se juega así, la página se pausa**: el monitor ECG, el jardín,
  las capas del CRT y el glitch.
- **iPhone**: Safari no deja pantalla completa ni bloquear la orientación
  fuera de videos, así que el juego ocupa toda la ventana y, si el teléfono
  está vertical, se gira solo 90° (y avisa "GIRA TU TELÉFONO").
- Al morir con una partida oficial aparece **REGISTRAR EN LA TABLA**, que
  sale de la pantalla completa y lleva al formulario.

Los personajes ahora se dibujan precalculados (un `drawImage` por
personaje en vez de ~120 rectángulos para el gusano), en el escritorio
también.

### Sonido

Efectos sintetizados con Web Audio en `sitio/sonido.js`, estilo consola de
8 bits: no hay archivos de audio. Nada suena hasta el primer clic o tecla
(lo exige el navegador). El interruptor está en la cabecera de BYPASS
("SONIDO: SÍ/NO", o la tecla **M** en el juego) y se recuerda.

| Dónde | Suena |
|---|---|
| BYPASS | latido al saltar, válvula cruzada, zumbido cuando el gusano carga, disparo, virus absorbido, sirena de furia, muros, choque o infección con pitido plano, récord, partida registrada |
| Monitor | solo en el easter egg: aviso en bradicardia, pitido plano en el paro y doble pitido al revivir |

El catálogo completo está en `SFX` dentro de `sonido.js`; el volumen
general es `master.gain.value`.

### Las pruebas del monitor y la calma del volteo (desde el motor versión 5)

- **Calma del volteo:** cada 20 válvulas, además de voltearse
  el lado, el motor despeja la pantalla (válvulas por venir y virus) y da
  **3 s sin obstáculos**. En esas válvulas no hay furia.
- **Las pruebas del monitor:** **varias por partida, en momentos al azar.**
  Desde la válvula 6 el juego pregunta al servidor, válvula por válvula
  (`GET /api/desafio`), si toca una. El servidor decide en qué válvulas,
  qué retos y sus parámetros con HMACs de su llave y el id de la partida:
  para el navegador es azar puro (no depende de la semilla) y se entera de
  cada una hasta llegar ahí. La primera cae entre la válvula 6 y la 12, y
  cada siguiente de 8 a 15 válvulas después (nunca en una múltiplo de 10).
- **Cada prueba encadena 2 o 3 retos distintos** (la primera, 2), cada uno
  con **1.5 s para leer** la instrucción. Mientras dura **no hay
  obstáculos** y el reto es de control:
  - **franja** — la franja sube y baja; hay que acumular 4 s dentro (en 10 s);
  - **ritmo** — 6 golpes al cerrarse el anillo; a la mitad **cambia el
    compás** (0.53–0.67 s entre golpes, ± 0.2 s; se puede latir de más);
  - **marcas** — tocar 4 alturas en orden, alternando arriba y abajo (11 s);
  - **verde** — latir cada vez que el pulso se pone verde (5 veces) y
    **nunca cuando se pone rojo** (2 señales trampa). Para que dé tiempo de
    reaccionar: durante este reto la **gravedad va a la mitad** (y el latido
    es √½ más suave, así que cada latido sube lo mismo pero todo va 1.4×
    más lento); un **anillo rojo se cierra 0.6 s antes** de cada rojo; y
    **en rojo el pulso flota** (sin gravedad), así que el rojo solo pide no
    latir. Simulando a una persona que reacciona en 0.2–0.3 s, pasa del
    4–15 % (versión 4) al 91–99 %.
  Cada reto (y cada combinación) lo resuelve un bot de prueba que juega
  con el mismo motor, así que todos son posibles.
- **Regla de la tabla:** entran solo las partidas que llegaron al menos a
  la primera prueba y **superaron todas las que les salieron**. Fallar un
  reto, latir en rojo o morir a media prueba deja la partida fuera. Si
  alguien muere justo al cruzar la válvula de una prueba, antes de que
  pueda salir, esa no se le pide. Al registrar, el servidor vuelve a jugar
  la partida con cada prueba inyectada en el paso en que apareció.
- **Repeticiones:** cada partida registrada guarda semilla, latidos y la
  aparición de cada prueba. En el panel, **VER ▸** la reproduce en la
  portada. Solo se pueden reproducir las partidas jugadas con la versión
  actual del motor (6).
- **Lo que no se puede evitar:** el navegador tiene que recibir cada reto
  para dibujarlo, así que un bot hecho a la medida de este juego puede
  leerlo y resolverlo. Las pruebas encarecen mucho hacer ese bot; la
  validación final son las repeticiones de los 8 primeros y la dinámica en
  la sede.
- Subir el motor de versión invalida las semillas de la anterior; los
  puntajes ya registrados se quedan.

### Semillas por tramo (motor versión 6)

Antes la partida entera salía de una sola semilla que el navegador recibía
al empezar. Con ella y el motor (que es público), un bot simulaba en local
el futuro completo: elegía semillas fáciles, calculaba la partida perfecta
y solo esperaba el tiempo real para mandarla.

- **El azar va por tramos de 10 válvulas** (contadas al *nacer*, no al
  cruzarlas), cada uno con su semilla. Al nacer la válvula 10·k el motor
  reinicia el azar con la semilla del tramo k. Se ajusta con `TRAMO` en
  `bypass-motor.js`.
- **El token solo trae la del tramo 0.** Las demás son HMACs de la llave
  del servidor y el id de la partida, independientes entre sí: adivinar una
  por lo que se ve en pantalla no dice nada de la siguiente.
- **`POST /api/tramo`** da la del tramo k a cambio de los latidos y las
  pruebas hasta ese paso. El servidor vuelve a jugar y solo la da si la
  partida cuadra, sigue viva, no va más rápido que el tiempo real y ya
  nacieron 10·k − 5 válvulas. El navegador la pide justo ahí, con unos
  4.5 s o más de margen. Nunca conoce más que el tramo en curso y el
  siguiente.
- **Si no llega a tiempo**, el juego se detiene ("SINCRONIZANDO EL
  PULSO…") en el paso exacto en que haría falta, sin romper la partida.
  Si el servidor la niega, o no contesta en 8 s (`ESPERA_TRAMO` en
  `bypass.js`), la partida sigue con azar local y ya no cuenta para la
  tabla.
- Las partidas sin servidor usan semillas de tramo locales
  (`semillasLocales` en el motor).
- **Lo que esto no evita:** un bot que juegue en vivo leyendo la pantalla.
  Para dibujar las válvulas el navegador tiene que conocerlas. La regla
  de validar en la sede sigue siendo la última palabra.
- Cuesta una petición cada ~10 válvulas. Cada una vuelve a simular la
  partida desde el principio: unos milisegundos por minuto de juego.

### Modo "próximamente"

**Viene activado de fábrica**: mientras nadie lo toque desde el panel, la
portada arranca en "próximamente". Se apaga (y se vuelve a prender) desde el
panel (`admin.html` → MODO PRÓXIMAMENTE) sin redesplegar: la portada lo nota
en unos 15 segundos. Si el servidor no contesta, se usa el último modo que
vio ese navegador, y si nunca vio ninguno, `proximamente` de `config.js`
(también `true`).

- **Se ve:** la primera pantalla completa (título, monitor, minijuego con su
  tabla, fecha y cupo). Al bajar, la historia clínica se asoma recortada y
  se desvanece, y le sigue el aviso **PRÓXIMAMENTE** con un botón para jugar
  BYPASS y otro para escribir.
- **No se ve:** el resto de los paneles. El menú cambia a "BYPASS ▸" y el
  botón de registro sale apagado ("REGISTRO · PRÓXIMAMENTE").
- **El registro queda cerrado en el servidor**, no solo escondido: `POST
  /api/registro` responde "EL REGISTRO TODAVÍA NO ABRE".
- El modo vive en la tabla `ajustes` (clave `proximamente`) y lo devuelve
  `GET /api/cupo`. Para que no haya parpadeo, el navegador recuerda el
  último modo y lo aplica antes de pintar; si el servidor no contesta en
  3 s, se queda con ese.

Ojo: es un telón, no una caja fuerte. El HTML completo sigue en GitHub
Pages y quien abra el código fuente puede leerlo. No pongas ahí nada que
todavía no deba saberse.

### El torneo de BYPASS (leaderboard con premio)

La tabla de pulsos está debajo del minijuego, **de 5 en 5 y paginada**, con
alias y puntos, la fecha de cierre y el texto del premio (`premio` en
`sitio/config.js`). **Los 8 primeros al cierre pasan a una dinámica el día
del evento** por un premio adicional: en la tabla van en verde, con una raya
debajo del 8.º, y en el panel salen marcados como FINALISTA. El tamaño de
página y el número de finalistas son `POR_PAGINA` y `FINALISTAS` en
`servidor/lib/bypass.js` (si cambias los finalistas, cambia también el texto
de `premio`). Al registrar una partida, la tabla salta a la página donde
quedó.
Al morir en una partida oficial aparece un formulario para registrarla con
un **alias público** y un **correo privado** (para avisar al ganador). Cada
correo tiene una sola fila con su mejor puntaje; en empate gana quien lo
logró primero.

**Alias y contraseña (estilo when2meet).** El alias es único: si ya lo
usa otro correo se rechaza ("Pulso Fino" y "PULSO  FINO" cuentan como el
mismo), y los de la organización (ADMIN, STARTUP, UNDEFINED, HACKMETHON…)
están reservados. La primera vez que alguien registra con su correo elige
una contraseña; después la necesita para volver a registrar con ese correo.
Se guarda cifrada (scrypt con sal). Un error de alias o de contraseña no
gasta la partida: se corrige y se reintenta. Si alguien la olvida, en el
panel está **BORRAR CONTRASEÑA** y la próxima vez elige otra.

**Por qué se puede confiar en el puntaje.** El navegador no manda un número:
manda el token de su partida y en qué momento latió. El servidor vuelve
a jugar la partida con el mismo motor y cuenta los puntos él. Además revisa
que la semilla la haya firmado él (HMAC), que no se haya registrado antes,
que no tenga más de 6 horas y que no se haya jugado más rápido que el tiempo
real. Inventar un puntaje, editar la partida o reusar una vieja no pasa.

Lo que el servidor **no** puede saber es quién jugó: un bot paciente que
juegue en tiempo real sí podría. Por eso la regla del premio es que el
ganador valide su partida jugando en la sede. Desde el panel se puede quitar
a alguien de la tabla.

**Piezas:**

| Dónde | Qué |
|---|---|
| `sitio/bypass-motor.js` | La física, determinista (ver su cabecera). **La única copia que se edita.** |
| `servidor/lib/bypass-motor.cjs` | Copia del motor para el servidor. La pone `python3 build.py`. |
| `sitio/bypass.js` | Dibujo, controles, formulario y tabla. |
| `GET /api/partida` | Da una partida firmada con la semilla del tramo 0. Sin base de datos. |
| `POST /api/tramo` | Da la semilla del siguiente tramo si la partida llegó. Sin base de datos. |
| `GET /api/desafio` | ¿Toca una prueba del monitor en esta válvula? Sin base de datos. |
| `POST /api/puntaje` | Revisa, vuelve a jugar y registra. |
| `GET /api/puntajes?pagina=N` | Una página pública de 5. Con token (`?completo=1`): todo, con correos. `DELETE ?correo=` quita. |
| `admin.html` → PANEL 09 | La tabla completa, con correos, CSV y QUITAR. |

**Para activarlo en Vercel** (además de lo que ya pide el registro):

| Variable | Obligatoria | Valor |
|---|---|---|
| `TORNEO_CIERRE` | no | Fecha ISO con zona, p. ej. `2026-11-23T18:00:00-06:00`. Sin ella el torneo no cierra. |
| `BYPASS_SECRETO` | no | Llave para firmar partidas. Si falta se deriva de `ADMIN_TOKEN`. |

Las tablas `bypass_partidas` y `bypass_puntajes` se crean solas.

⚠ **Si cambias la física** (gravedad, velocidades, la furia…): edita solo
`sitio/bypass-motor.js`, sube `VERSION` dentro de él, corre
`python3 build.py` y **despliega los dos lados**. Si la portada y el
servidor tienen motores distintos, el servidor rechaza todas las partidas
("NO CUADRA CON LA SIMULACIÓN").

Se probó que el motor da exactamente la misma partida en Node, Chromium y
Firefox (20 partidas largas, idénticas bit a bit).

### Rendimiento

Medido con Chromium (sin aceleración gráfica, así que una laptop real va
mejor): la página pasó de **~6 FPS** a **60 FPS** quieta y en scroll, de
7 351 a ~900 elementos, y el bloqueo de carga de ~770 ms a ~240 ms.

- **Sin curvatura.** El filtro SVG que abombaba la pantalla
  (`feDisplacementMap`) se recalculaba en cada cuadro sobre la página
  entera; él solo costaba ×7. Se quitó junto con `tubo.js`, las esquinas
  redondeadas del vidrio y el viñeteo elíptico: la pantalla es plana.
- **Sin modos de fusión** en las capas fijas (`mix-blend-mode`), y el
  barrido del CRT se anima con `transform` en vez de `top`.
- **Enredaderas y micelio en `<canvas>`** (dos por panel, uno por hueco) en
  vez de ~6 400 elementos SVG. El título y las raíces del corazón siguen en
  SVG porque son pocos.
- **Lo que no se ve no trabaja**: el ECG se duerme fuera de pantalla, el
  pulso del micelio solo corre en el que está a la vista, y el corazón no
  late si no se ve. El bucle de animación del jardín se apaga solo cuando
  no hay nada que mover.
- **Se siembra una vez**, cuando llegan las tipografías, y solo se vuelve a
  sembrar si cambian las medidas.
- El brillo del ECG ya no usa `shadowBlur`: es un trazo doble por cuadro.

Si se agregan efectos, la regla es la misma: nada de filtros ni mezclas
sobre capas grandes, animar solo `transform` y `opacity`, y pausar lo que
no está en pantalla.

### Pendiente

- [x] Fecha, hora, duración y sede en `sitio/config.js`: sábado 28 de
      noviembre de 2026, 16:00 a 22:00, Auditorio MENLO del Tec de Monterrey
      Campus Chihuahua (coordenadas y mapa, los de la 1ª edición).
- [x] Agenda de las 6 horas: 30 min de ingreso, seis incisiones de 40 min
      con un descanso de 20 a la mitad, 20 min de bono, 40 de final de BYPASS
      y 10 de premiación (`H+0:00` … `H+5:50`).
- [ ] Deploy nuevo del servidor (proyecto y base de datos aparte, para no
      mezclar equipos con la 1ª edición) y su URL en `api`. Mientras esté
      vacío, el registro cae al correo.
- [ ] Confirmar que los 6 temas (lógica, condicionales, ciclos, funciones, BD,
      APIs) siguen siendo los de esta edición.
- [ ] Torneo de BYPASS: fecha de cierre (`TORNEO_CIERRE`) y en qué consiste
      el premio (`premio` en `config.js`).
- [ ] Imagen para redes: `<meta property="og:image">` en `sitio/index.html`.
- [ ] Definir la fórmula de la bonificación por rapidez.
- [ ] Registro: texto final de la responsiva (el actual es borrador).
- [ ] Registro: el documento de registro dice que la lista nominal (nombre,
      CURP, género, institución) puede entregarse a INADET/CENALTEC si el
      convenio lo exige, pero el aviso de privacidad promete que **no se
      comparte con nadie**. Hay que resolverlo antes de abrir el registro.
- [ ] Registro: correo de confirmación con QR de check-in y el Paso 2.

---

## Cómo está repartido

`undefinedclub.org` vive en **GitHub Pages**, y GitHub Pages no puede hacer de
proxy hacia Vercel. Por eso el proyecto va partido en dos:

```
sitio/            → al repo de GitHub Pages, dentro de una carpeta hackmethon/
  config.js       ⚠ EL ÚNICO ARCHIVO QUE SE EDITA: datos del evento y URL de la API
  index.html      la portada
  styles.css      todos los estilos
  script.js       registro, cuenta regresiva, monitor
  admin.html      panel de inscritos (agrupados por equipo) y del torneo

servidor/         → esto es el proyecto de Vercel
  api/            registro.js · registros.js · equipos.js · cupo.js · ajustes.js
  lib/            db.js (Neon) · cors.js · auth.js · clave.js
  package.json · vercel.json · .env.example

build.py          empaqueta la portada en un archivo suelto (opcional)
```

La portada queda en `undefinedclub.org/hackmethon` y llama por CORS a las
funciones en Vercel. **Los dos lados tienen que conocerse**: la portada necesita
la URL de Vercel, y Vercel necesita saber que undefinedclub.org puede llamarle.
Los pasos 3 y 5 de abajo son justo eso; si falta uno, el navegador bloquea el
registro.

---

## Desplegar

### 1. Sube `servidor/` a Vercel

Arrastra **la carpeta `servidor/`** (no la carpeta de arriba) al dashboard de
Vercel. O desde la terminal:

```sh
cd servidor
npx vercel
```

No configures nada: Vercel detecta `api/` como funciones. **No subas
`node_modules/`.** Apunta la URL que te dé, algo como
`https://hackmethon.vercel.app`.

### 2. Conecta la base de datos

En el proyecto → **Storage** → **Create Database** → **Neon (Postgres)**.
Al conectarla, Vercel inyecta `DATABASE_URL` solo. **No hay migraciones que
correr**: la tabla se crea sola en el primer registro.

### 3. Pon las variables de entorno

Settings → **Environment Variables**:

| Variable | Obligatoria | Valor |
|---|---|---|
| `DATABASE_URL` | sí | La inyecta Neon al conectarla |
| `ADMIN_TOKEN` | sí | La contraseña del panel. Invéntate una larga |
| `ORIGENES_PERMITIDOS` | **sí** | `https://undefinedclub.org,https://www.undefinedclub.org` |
| `CUPO_EQUIPOS` | no | Cupo **inicial**, en personas. Después se cambia desde el panel |
| `RESEND_API_KEY` | no | Para el correo de aviso |
| `CORREO_REGISTROS` | no | A dónde llega el aviso |
| `CORREO_REMITENTE` | no | Desde dónde sale |

`ORIGENES_PERMITIDOS` es lo que autoriza a undefinedclub.org a llamar a la API.
**Sin esa variable el navegador bloquea todos los registros.**

⚠ **Pégalo sin comillas.** En el panel de Vercel el valor se guarda tal cual, así
que unas comillas se vuelven parte del texto y ya no coincide con nada. Espacios
tras la coma, barra final y mayúsculas sí se toleran.

Para comprobar que quedó bien, sin abrir el navegador:

```sh
curl -sI -H "Origin: https://undefinedclub.org" \
  https://TU-DEPLOY.vercel.app/api/cupo | grep -i "access-control\|x-cors"
```

- `access-control-allow-origin: https://undefinedclub.org` → correcto.
- `x-cors: sin-configurar` → la variable no llegó a la función. Revisa que esté
  marcada para **Production** y **vuelve a desplegar**: las variables solo
  entran en despliegues nuevos.
- `x-cors: origen-no-listado; N configurados` → la variable sí llegó, pero el
  dominio no está en la lista. Casi siempre son las comillas.

Genera un `ADMIN_TOKEN` decente con:

```sh
openssl rand -base64 32
```

Vuelve a desplegar: las variables solo entran en despliegues nuevos.

### 4. Correo de aviso (opcional)

1. Cuenta en [resend.com](https://resend.com) — gratis, 3 000 correos al mes.
2. Verifica el dominio `undefinedclub.org` (te da unos registros DNS que agregar
   en Namecheap).
3. Copia la API key a `RESEND_API_KEY`.
4. `CORREO_REGISTROS` = `contacto@undefinedclub.org`
5. `CORREO_REMITENTE` = `HACK(ME)THON <registro@undefinedclub.org>`

**Si no configuras esto, el registro se guarda igual** y solo no se manda
correo. Nada se rompe.

### 5. Dile a la portada dónde está la API

Abre `sitio/config.js` y pega la URL del paso 1 en la llave `api`, **sin barra
final**. Ese archivo lo cargan tanto la portada como el panel, así que con
cambiarlo una vez sirve para las dos:

```js
api: "https://hackmethon.vercel.app",
```

Si se te olvida, la portada busca la API en su propio dominio, no la encuentra
y cae al correo de respaldo; el panel da 404. Lo avisa en la consola.

### 6. Sube `sitio/` a GitHub Pages

En el repo que sirve undefinedclub.org (`undefined-projects.github.io`), copia
el contenido de `sitio/` dentro de una carpeta llamada `hackmethon`:

```
undefined-projects.github.io/
  index.html                ← el sitio del club, no se toca
  hackmethon/
    config.js
    index.html
    styles.css
    script.js
    admin.html
```

Haz push. En un par de minutos queda en **undefinedclub.org/hackmethon**.

Si el repo usa Jekyll y algo no aparece, agrega un archivo vacío llamado
`.nojekyll` en la raíz del repo.

### 7. Esconde el panel de los buscadores

En el `robots.txt` del repo de Pages (en la raíz, no dentro de `hackmethon/`),
agrega:

```
Disallow: /hackmethon/admin.html
```

`admin.html` ya lleva `noindex` en su HTML, esto es el cinturón además de los
tirantes.

---

## Comprobar que quedó bien

1. Abre `undefinedclub.org/hackmethon`. Junto al CUPO debe decir
   **· quedan 10**. Si no aparece, la portada no está hablando con la API:
   revisa el paso 5 y la consola del navegador.
2. Regístrate de prueba. Debe responder con un folio (`HMT-001`), no
   abrir tu correo. **Si abre el correo, la API no respondió**: revisa
   `ORIGENES_PERMITIDOS`.
3. Entra a `undefinedclub.org/hackmethon/admin.html` con tu `ADMIN_TOKEN` y
   confirma que ahí está tu inscripción de prueba.
4. Bórrala desde el mismo panel con **BORRAR INSCRIPCIÓN**.

---

## El panel de participantes

`undefinedclub.org/hackmethon/admin.html`

Pide el `ADMIN_TOKEN` una vez y lo guarda en la pestaña (`sessionStorage`), así
que al cerrarla se olvida. Desde ahí puedes:

- **Ver a cada inscrito, agrupado por equipo.** Cada equipo sale con su logo
  y dice cuántos lleva de 5 y si ya llegó a 3. Después van los equipos que se
  quedaron sin nadie (con **BORRAR EQUIPO**, para que dejen de salir en la
  portada), quienes tienen equipo sin nombre (solo registros de antes del
  12-oct-2026) y al final quienes piden que se les asigne uno. De cada
  persona: folio, edad, género, CURP, fecha de nacimiento, código postal,
  escuela, carrera y semestre o año, teléfono y correo; con menores, que el
  tutor autorizó. Arriba, el resumen: inscritos, equipos, sin nombre, por
  asignar, por género (H / M / Otro, con «prefiero no decir» dentro de Otro)
  y menores.
- **Cambiar el cupo.** El número se guarda en la base de datos y aplica de
  inmediato, sin redesplegar. Si lo bajas por debajo de los ya inscritos, el
  registro queda cerrado — el panel te lo avisa. La variable `CUPO_EQUIPOS`
  solo sirve como valor inicial, antes de tocarlo por primera vez.
- **Borrar una inscripción.** Pide confirmación nombrando a la persona y se
  cancela sola a los 8 segundos si no respondes. **No se puede deshacer**: no
  hay papelera. Si borras por error, esa persona tiene que registrarse otra vez.
- **Descargar el CSV** de todo, con BOM para que Excel abra bien los acentos.
  Una fila por persona. Las celdas que empiezan con `= + - @` llevan un
  apóstrofo para que Excel no las ejecute como fórmula. **El CSV trae CURPs:
  no lo subas a ningún lado ni lo mandes por chat.**

La página lleva `noindex` y está bloqueada en `robots.txt`, pero **la contraseña
es lo único que la protege**: no la compartas por WhatsApp. Borrar y cambiar el
cupo exigen el token igual que el listado.

## Qué editar

Todo lo configurable vive en **`sitio/config.js`** y en ningún otro lado. Lo
cargan la portada y el panel, así que un cambio sirve para ambos:

```js
const EVENTO = {
  inicio:      "2026-09-21T18:00:00-06:00",  // dispara la cuenta regresiva
  fecha:       "Lunes 21 de septiembre, 2026",
  duracion:    "4 horas · 18:00 a 22:00",
  sede:        "Auditorio MENLO · Parque Orión",
  cupo:        "120 lugares",
  costo:       "Gratuito · sin costo alguno",
  coordenadas: "28.674655, -106.080233",
  mapa:        "https://www.google.com/maps/search/?api=1&query=28.6746546,-106.0802332",
  registros:   "contacto@undefinedclub.org",
  contacto:    "mailto:contacto@undefinedclub.org",
  registro:    "#",
  api:         "https://hackmethon-servidor.vercel.app",  // tu deploy
};
```

Ojo: el **cupo real** lo manda `CUPO_EQUIPOS` en el servidor, no este texto.
Si cambias uno cambia el otro.

Chihuahua capital es UTC−6 todo el año desde que México quitó el horario de
verano en 2022. Ciudad Juárez y los municipios fronterizos sí cambian: ahí sería
`-07:00` en invierno.

### La agenda

El panel 05 va en tiempos relativos al inicio (`H+0:00` … `H+5:50`), escritos
a mano en `index.html`. Si cambia la duración o el número de fases, hay que
reajustarlos ahí; si solo cambia la hora de inicio, no.

---

## Cómo funciona el registro

Es el **Paso 1** de `FORMULARIO_REGISTRO_HACKMETHON_2026.md`: **una persona por
registro**, en dos minutos. Se pide:

| Campo | Regla |
|---|---|
| Nombre(s) y apellidos | obligatorios, por separado |
| Correo | válido y **único**: nadie se registra dos veces con el mismo |
| Teléfono (WhatsApp) | 10 dígitos; se aceptan espacios, guiones y `+52` |
| CURP | formato oficial (fecha real, sexo H/M/X, entidad), dígito verificador de RENAPO y **única** |
| Género | Hombre · Mujer · Otro · Prefiero no decir |
| Fecha de nacimiento | **la misma que trae la CURP** (con una CURP válida se llena sola); edad de 12 a 99 |
| Código postal | 5 dígitos |
| ¿Estudias actualmente? | sí / no. Si no, los tres siguientes ni se muestran ni se guardan |
| Universidad / institución | Las públicas de la ciudad (UACH, UTCH, UTCH Sur, UTCH BIS, UPCH, Tecnológicos de Chihuahua I y II y las dos Normales), Tec de Monterrey, ULSA u Otra; «¿Cuál?» solo se activa con Otra |
| Carrera | texto libre con sugerencias |
| Semestre, cuatrimestre, tetramestre o año | semestres del 1 al 12, cuatrimestres o tetramestres del 1 al 15, años del 1 al 5 |
| Equipo | Ya tengo equipo · No tengo equipo, agrégame a uno · Crear un equipo |
| Ya tengo equipo | elige su equipo de la lista (logo, nombre y cuántos van; los llenos no se pueden elegir) y escribe la contraseña del equipo |
| Crear un equipo | nombre (único, sin importar mayúsculas, acentos ni espacios), contraseña de 4 caracteres o más y logo de 16 × 16 pixeles con 7 colores |
| Aviso de privacidad | casilla obligatoria |
| Responsiva | casilla obligatoria |

- **Equipos de 3 a 5.** Quien crea el equipo cuenta como integrante y les
  pasa la contraseña a los demás. El servidor no deja que un equipo pase de
  5 inscritos (`EQUIPO_MAX` en `servidor/lib/db.js`); los incompletos y
  quienes no tienen equipo se acomodan después desde el panel.
- **Los equipos** viven en la tabla `equipos` (nombre, logo y contraseña
  cifrada con scrypt, igual que las de BYPASS: `servidor/lib/clave.js`).
  `GET /api/equipos` es público y da solo nombre, logo y cuántos van. El logo
  son 256 caracteres, uno por pixel, cada uno un índice de `LOGO.paleta` en
  `config.js` (0 = vacío). Si el registro de quien creó el equipo falla, el
  equipo se borra con él.
- **Menores de 18**: aparece una casilla más, la autorización de su madre,
  padre o tutor, que el servidor exige.
- **Aviso de privacidad** (`sitio/privacidad.html`): resumen en el formulario
  y la versión completa aparte. Insiste en que los datos **no se comparten con
  terceros**. Responsable, domicilio y correo para derechos ARCO se editan en
  `EVENTO.privacidad` de `config.js`. **Que lo revise alguien con conocimiento
  legal antes de abrir el registro.**
- **Responsiva**: el texto está en `index.html` (panel 06) y es un borrador:
  reglas, conducta, uso de la infraestructura solo en el entorno del evento y
  grabación de imagen y voz. **Falta el texto final aprobado.**
- La lógica de la CURP vive en `servidor/lib/curp.js` y está copiada en
  `script.js` para avisar antes de enviar.

1. El navegador valida y hace `POST /api/registro`.
2. El servidor **vuelve a validar todo** — el cliente es modificable por
   cualquiera —, revisa que el correo y la CURP no estén ya registrados, el
   cupo, que la contraseña del equipo sea la suya y que no esté lleno (o, al
   crearlo, que el nombre no esté tomado).
3. Guarda en Postgres, en la tabla `inscripciones` (la tabla `registros`, de
   cuando se registraba por equipo, se queda como estaba). Los índices únicos
   sobre el correo y la CURP son la defensa real contra dobles envíos.
   También guarda cuándo se aceptaron el aviso y la responsiva.
4. Manda el correo de aviso a la organización sin bloquear la respuesta. Si
   Resend falla, el registro ya quedó guardado.
5. Devuelve un folio (`HMT-004`) y cuántos lugares quedan.

**Si la API no responde**, el formulario abre el correo del visitante con la
ficha ya escrita (sin CURP, código postal ni fecha de nacimiento: un correo
pasa por muchos servidores; se piden al confirmar). El correo de aviso a la
organización tampoco los lleva. Es el último recurso para que nadie se quede
sin registrarse si el servidor se cae en plena promoción — no el camino normal.

Contra bots hay un campo trampa oculto (`empresa`): está fuera de pantalla y
fuera del orden de tabulación, así que si viene lleno fue un robot y se rechaza.

**Todavía no está** (viene en el documento): el correo de confirmación a quien
se registra, con QR de check-in, y el **Paso 2** (talla de playera, nivel,
lenguajes, experiencia, alimentación, accesibilidad, cómo se enteró, redes y
consentimiento de seguimiento).

---

## Probar en local

La portada sola, sin registro:

```sh
python3 -m http.server 8000 --directory sitio
```

Con las funciones necesitas el CLI de Vercel y un `.env.local` dentro de
`servidor/` (copia `servidor/.env.example`):

```sh
cd servidor && npx vercel dev
```

Para probar la portada contra ese servidor local, pon
`api: "http://localhost:3000"` en `sitio/config.js` y agrega
`http://localhost:8000` a `ORIGENES_PERMITIDOS`. Acuérdate de dejarlo como
estaba antes de publicar.

---

## Notas de diseño

Terminal IBM 3277 con fósforo magenta. La época encaja: el System/360 y el
IBM 2260 son de 1964, el 3270 de 1971. La paleta rosa y morada no es pintura,
es el color del tubo — un CRT de fósforo magenta en vez del verde o el ámbar
de siempre.

Tema oscuro único y deliberado: la página *es* una pantalla encendida, así que
no cambia con el tema claro/oscuro del visitante.

- **Paleta**: los mismos rosas y morados leídos como *intensidades de fósforo*.
  `#ff5fb0` normal, `#ffd9ee` intensificado, `#a86ab8` campo protegido,
  `#a855f7` y `#d946ef` como segundo color de campo, sobre `#0d0410`. Todo son
  variables CSS en `:root`.
- **Rejilla de caracteres**: marco de 80 columnas, medidas en `ch`, y cero
  `border-radius` en toda la hoja. Un terminal no tiene esquinas redondeadas.
- **Tipografía**: `IBM Plex Mono` —la propia de IBM— para todo el cromo, y
  `IBM Plex Sans` solo para los párrafos largos, porque leer texto corrido en
  monoespaciada cansa.
- **Paneles**: cada sección tiene su barra en vídeo inverso y su leyenda de
  teclas de función. Las teclas funcionan: `PF7` y `PF8` navegan de verdad.
- **Línea 24**: la barra fija de abajo es el *Operator Information Area* del
  3270. `X SYSTEM` parpadea al cargar y el indicador de posición sigue el
  scroll como si fuera el cursor.
- **El banner** está dibujado con caracteres `█` en una tipografía de bloques
  hecha a mano. En pantalla angosta los tres bloques se apilan.
- **Glitch**: leve a propósito. Cuatro animaciones con periodos distintos
  (11s / 9.7s / 8.5s / 7.3s) para que nunca coincidan. La intensidad está
  detrás de una sola variable: `--glitch: 1` en `:root`. Ponla en `0` para
  apagarlo.
- Todo respeta `prefers-reduced-motion`.

### Contraste

Los pares de texto/fondo están por encima de 5:1 (AA para texto normal):
fósforo `#ff5fb0` sobre vidrio ≈ 6.9:1, texto corrido `#e2b9d4` ≈ 11:1, campo
protegido `#a86ab8` ≈ 5:1. Si cambias la paleta, vuelve a comprobarlos.

---

## Sobre `build.py` y la vista previa

`python3 build.py` empaqueta la portada en `dist/hackmethon.html`, un archivo
único con el CSS y el JS incrustados. Sirve para mandar la portada por link sin
desplegar nada.

**En esa versión el formulario no encuentra `/api` y cae al correo.** El sitio
real es el de Vercel. Lo mismo aplica a la vista previa publicada como Artifact
de Claude: su CSP bloquea las peticiones a servidores externos, así que ahí el
registro tampoco puede llegar a la base de datos.
