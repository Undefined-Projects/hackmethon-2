# HackMeThon — Plataforma en tiempo real

## Arranque

```bash
# Terminal 1 — backend (http://localhost:4000)
cd server && npm run dev

# Terminal 2 — frontend (http://localhost:5173)
cd client && npm run dev

# Terminal 3 — solo si hay luces (http://127.0.0.1:8000)
cd server && npm run luces
```

Los dos primeros escuchan en todas las interfaces: para jugar desde otras
máquinas, ver [Jugar en red local](#jugar-en-red-local). El tercero es el
actuador infrarrojo y es **opcional**: sin él todo funciona igual, solo que la
pestaña de luces lo dice. Ver [Las luces de la sala](#las-luces-de-la-sala).

## Jugar en red local

El cliente **deduce el backend del host por el que se abrió la página**: quien
entra por `http://10.0.0.7:5173` habla con `http://10.0.0.7:4000`. No hay
ninguna IP escrita en el código, así que el mismo arranque sirve para el
servidor y para toda la sala.

```bash
# 1. Abre el cortafuegos (una vez por red; pide sudo)
cd server && npm run red          # solo la subred actual
# npm run red -- --todo           # cualquier origen
# npm run red -- --cerrar         # retirar las reglas al terminar

# 2. Arranca los dos procesos como siempre
cd server && npm run dev          # imprime también la URL de red
cd client && npm run dev          # línea "Network:" de Vite
```

Reparte **una sola dirección**, la del frontend: `http://<ip>:5173`. La API no
hace falta darla.

| Si no conecta | Mira esto |
|---|---|
| «No se puede acceder a este sitio» | El cortafuegos. `npm run red` en el servidor. |
| Carga la página pero se queda en «conectando» | El puerto **4000** también tiene que estar abierto, no solo el 5173. |
| Nadie se ve, ni con el cortafuegos abierto | *AP isolation* / «aislamiento de clientes» en el router. Apágalo. |
| Unos sí y otros no | Redes distintas: invitados vs. principal, o 2,4 GHz vs. 5 GHz en SSID separados. |

`CLIENT_ORIGIN="*"` en `server/.env` refleja el origen de quien pide, que es lo
que hace falta cuando cada portátil entra por una URL distinta. Para restringir,
pon ahí una lista separada por comas.

## Jugar por internet (Vercel + túnel)

Para que entre gente de **cualquier red**, sin compartir wifi, el reparto es:

| Pieza | Dónde vive | Por qué ahí |
|---|---|---|
| Cliente (React) | **Vercel** | Es un build estático. Encaja perfecto. |
| API (Express + Socket.io) | **Tu máquina, tras un túnel** | Mantiene WebSockets abiertos, cronómetros vivos y presencia en memoria. Necesita un proceso de verdad. |
| Base de datos | **Tu máquina** (SQLite) | Va con la API. Nada que migrar. |

> **Vercel no puede hospedar el backend, y no es un detalle de configuración.**
> Vercel ejecuta funciones que responden a una petición y mueren. Este servidor
> no es eso: sostiene WebSockets abiertos, temporizadores del ataque
> (`realtime/trafico.ts`) y un mapa de presencia en memoria
> (`realtime/presence.ts`), más un SQLite en disco escribible. En serverless
> no hay nada de eso. El cliente sí, el servidor no.

### 1. Publica el cliente en Vercel (una vez)

```bash
cd client
npx vercel            # primera vez: crea el proyecto y pregunta
npx vercel --prod     # despliegues siguientes
```

Responde **`client`** cuando pregunte el directorio raíz. `client/vercel.json` ya
trae el framework, el build y el *fallback* de SPA.

Con GitHub es igual, pero en **Project Settings → General → Root Directory** hay
que poner `client`; si no, Vercel compila la raíz del repo y no encuentra nada.

### 1 bis. Comprueba la red ANTES del evento

No todas las redes dejan pasar un túnel. Una red institucional o de oficina
puede dejar salir HTTPS normal y aun así cortarlo: el TCP conecta, el handshake
TLS expira, `cloudflared` reintenta en bucle y la URL pública devuelve **530**.
Desde la sala eso se ve como el juego entero caído, sin una pista de por qué.

```bash
cd server && npm run dev        # el diagnóstico necesita el backend vivo
cd server && npm run probar:red
```

Levanta un túnel de verdad y le pide la API por su URL pública, que es la única
comprobación que vale. Responde `✅ ESTA RED SIRVE` o `❌` con el motivo.

Hazlo **en la sede, con la red del evento**, no en casa. Si sale ❌, las salidas
son el hotspot de un móvil o subir el backend a un hosting (que no usa túnel).

> Si sale ❌ diciendo que el túnel registró conexión pero no llegó tráfico,
> suele ser solo el DNS, que tarda en propagarse un nombre recién creado.
> Reintenta con `ESPERA=180 npm run probar:red` antes de descartar la red.

### 2. Abre el túnel (cada vez que juegues)

```bash
cd server && npm run dev                      # terminal 1: la API
cd server && npm run tunel -- TU-APP.vercel.app   # terminal 2: la puerta
```

El script imprime el **único enlace que hay que repartir**:

```
  REPARTE ESTE ENLACE:
  https://TU-APP.vercel.app/?api=https://algo-raro.trycloudflare.com
```

`?api=` le dice al cliente dónde está la API, **se guarda en el navegador y se
borra de la barra de direcciones**. Quien lo abre una vez ya entra por
`https://TU-APP.vercel.app` a secas el resto del evento. `?api=reset` lo olvida.

Eso es lo que evita recompilar: un túnel gratuito estrena URL en cada arranque,
y perseguirla con un redespliegue de Vercel en mitad de una partida no es un plan.

Falta `cloudflared`: `yay -S cloudflared-bin` (el script lo dice y da alternativas).

### 3. Opcional: URL fija con tu dominio

Si el dominio está en Cloudflare, el túnel deja de cambiar de nombre y `?api=`
deja de hacer falta:

```bash
cloudflared tunnel login
cloudflared tunnel create hackmethon
cloudflared tunnel route dns hackmethon api.tu-dominio.org
cloudflared tunnel run --url http://localhost:4000 hackmethon
```

Con eso pones `VITE_API_URL=https://api.tu-dominio.org` en **Vercel → Settings →
Environment Variables**, redespliegas una sola vez, y el enlace del evento es
`https://TU-APP.vercel.app` para siempre.

### Mientras el túnel está abierto

Tu máquina **es** el servidor: si la cierras, la suspendes o pierdes internet, se
cae el juego para todos. La ventana del túnel tiene que quedarse abierta.

| Si no conecta | Mira esto |
|---|---|
| Todos clavados en «ENLAZANDO» | Abre la consola del navegador: la línea `[HackMeThon] API → …` dice a dónde apunta. Si no es la URL del túnel, reparte el enlace con `?api=`. |
| Iba y dejó de ir | El túnel se cerró o cambió de URL. Reabre y reparte el enlace nuevo. |
| Uno solo no entra | Su navegador recuerda una URL vieja. Que abra `…/?api=reset` y luego el enlace bueno. |
| «no hay API en localhost:4000» al abrir el túnel | El backend no está arrancado. `npm run dev` primero. |
| La URL del túnel devuelve **530** | La red bloquea el túnel. `npm run probar:red` lo confirma. Cambia de red o sube el backend a un hosting. |
| El túnel va, pero la URL tarda en responder al principio | DNS: el nombre acaba de crearse. Un minuto y resuelve. |

El cliente intenta **WebSocket y, si la red lo filtra, `polling`**. Sin ese
segundo camino, una red de campus o de oficina que bloquea WebSockets dejaba a
esa persona fuera sin ningún mensaje de error.

`CLIENT_ORIGIN="*"` en `server/.env` refleja el origen de quien pide, así que el
dominio de Vercel ya está permitido sin tocar nada.

## Base de datos

```bash
cd server
npm run db:push    # aplica schema.prisma a SQLite
npm run db:seed    # 10 equipos x 3 jugadores + 4 fases y el bonus
npm run db:reset   # borra y recrea todo
npm run db:studio  # inspector visual
npm run db:equipos # la plantilla del evento: 30 equipos con nombre y logo inventados
```

`db:equipos` deja la base con **30 equipos provisionales** (MICELIO, SINAPSIS,
VOLTIO… con un logo de 16 × 16 cada uno y cinco jugadores) para ver el panel, la
carrera, el mapa y la proyección con el aforo real. Renombra en orden los que ya
haya —conservan su id y su progreso— y crea los que falten; se puede repetir.
Los códigos de acceso salen del nombre (`MICELIO-1` … `MICELIO-5`) y
**cambian** para los equipos renombrados. Los nombres y logos definitivos se
ponen después desde el panel.

### Equipos de 3 a 5 personas

Un equipo tiene siempre **una sola TERMINAL** —quien teclea a ciegas: que sea
una persona es lo que obliga al resto a dictarle— y el resto se reparte entre
DATOS y PANTALLA: con 3, uno de cada; con 4, dos DATOS; con 5, dos DATOS y dos
PANTALLA. La información ya viaja por rol, así que dos personas en PANTALLA ven
lo mismo sin más.

- **Mezclar roles** reparte entre los jugadores **conectados** (si hay al menos
  dos) y le da la TERMINAL a quien menos veces la ha tenido, sin repetir a quien
  la tiene: en un equipo de cinco todos pasan por el teclado. Si la TERMINAL
  estaba en alguien ausente, la deja y pasa al puesto que menos gente tenga.
- **A mano**, desde el selector de rol de cada jugador en el panel. Dar la
  TERMINAL a alguien se la quita a quien la tenía, que pasa al puesto libre (un
  intercambio). A quien tiene la TERMINAL no se le puede cambiar sin dársela a
  otro: el equipo nunca se queda sin nadie que teclee.

`npm run smoke:roles` lo comprueba contra el servidor (12 comprobaciones) con el
equipo más numeroso que haya, y lo deja como estaba.

El seed **no** cambia: sigue sembrando los diez equipos de prueba (ALFA,
BRAVO…), de cuyos nombres y códigos dependen los smokes y el e2e. Por eso las
pruebas se lanzan sobre una base reseteada (`npm run db:reset`), no sobre la
del evento.

## Pruebas

```bash
cd server
npm run dev            # en una terminal
npm run smoke          # en otra: 19 comprobaciones de WebSocket (~10s)
npm run smoke:admin    # 118 comprobaciones del panel de admin (~45s)
npm run smoke:fase2:servidor  # el motor jugando La Maraña contra el servidor (~10s)
npm run smoke:fases    # las fases 1 y 3 a 6 (~2s, sin servidor)
npm run smoke:fase2    # La Maraña (semillero y seto) y el bonus La Espesura (~3s, sin servidor)
npm run smoke:rastro   # El Rastro, fuera del recorrido: solo pasa si se siembra a mano
npm run sync:shared    # copia constants.ts + events.ts al cliente
npm run db:limpiar     # devuelve el juego a su estado inicial (sin borrar equipos):
                       # progreso, tiempos, roles y el estado INTERNO de cada fase
npm run luces          # el actuador infrarrojo (autodetecta el puerto del Arduino)
npm run luces:sin-placa # lo mismo sin placa, para montar reglas y botones
```

End-to-end en navegador (requiere Chromium local). Se reinicia solo, así que
borra el progreso: no lo lances con un evento en curso.

```bash
cd e2e && npm install && npm test   # 178 comprobaciones de UI (~195s)
```

La resolución del destino de la API tiene prueba aparte, porque es de lo que
depende jugar por internet. Necesita el **build de producción** servido en
:4173 y compilado **sin** `VITE_API_URL` —lo que se comprueba es la resolución
en tiempo de ejecución, no la horneada:

```bash
cd client && npm run build && npm run preview   # en una terminal
cd e2e && npm run test:api                      # en otra: 10 comprobaciones (~15s)
```

## Códigos de acceso del seed

- Admin: `ADMIN-2026`
- Jugadores: `ALFA-1`, `ALFA-2`, `ALFA-3`, `BRAVO-1`, … `JULIETT-3`

**Diez equipos de tres**, con el alfabeto de la OTAN: ALFA, BRAVO, CHARLIE,
DELTA, ECHO, FOXTROT, GOLF, HOTEL, INDIA y JULIETT. Son nombres **de relleno**:
el día del evento cada equipo llega con el suyo, y se le pone desde el panel
(ver [Nombre y logo del equipo](#nombre-y-logo-del-equipo)).

El código de acceso **no cambia nunca**, ni al renombrar el equipo. Se imprime y
se reparte antes de empezar, y cambiarlo a media tarde dejaría fuera a quien ya
tiene el suyo en la mano.

### Cuando alguien entra con el código de otro

Pasa, y no es el caso que uno imagina. El código que **no existe** se rechaza y
ya está. El problema es el código **válido que no era el tuyo**: teclear `ALFA-2`
cuando te habían dado `BRAVO-1`. Se entra sin más, y lo que hay delante es la
partida de otro.

Se ve en la cabecera, que lleva el nombre de quien eres. Y se sale con el botón
de abajo a la derecha:

```
                                    [>] SALIR · OTRO CÓDIGO
                     ┌──────────────────────────────────────┐
                     │ ENTRASTE COMO ALFA · JUGADOR 2       │
                     │                            [ALFA-2] │
                     │ Salir no borra nada. Puedes volver a │
                     │ entrar con este mismo código.        │
                     │  [ SÍ, SALIR ]   [ NO, SEGUIR ]      │
                     └──────────────────────────────────────┘
```

Tres decisiones, y las tres salen del mismo sitio: es una esquina que se pulsa
sin querer en un portátil ajeno.

- **Dice para qué sirve.** Antes decía «Salir» a secas, en diez píxeles y al
  45 % de opacidad: quien entraba con el código de otro no la encontraba, y si
  la encontraba no sabía si le iba a borrar la partida.
- **Confirma en dos pasos**, y no con un `confirm()` del navegador. Al hacerla
  visible se hace más fácil pulsarla sin querer, y en mitad de una fase eso son
  treinta segundos de volver a teclear. El cartel aprovecha para decir las dos
  cosas que hacen falta para decidir: **como quién estás** —con el código al
  lado— y que **no se pierde nada**. Y es verdad que no se pierde: el estado
  vive en la base de datos, así que volver a entrar lo recupera entero.
- **Devuelve el código al formulario.** Una errata de una letra no obliga a
  reescribir las otras cinco, y el campo se selecciona al enfocarlo.

Se cierra con `Escape`, con `NO, SEGUIR` y solo, a los ocho segundos.

### Y cuando el código no existe

Esa es la otra pantalla, y también tiene salida. Antes enseñaba `INVALID_CODE`
—el código que el servidor manda para que un cliente decida— a una persona que
acababa de equivocarse en una letra. Eso convierte una errata en una avería: se
queda mirando una palabra en inglés sin saber si es culpa suya, del wifi o del
servidor.

Ahora dice qué pasó, enseña **lo que se tecleó** y distingue tres cosas que no
son la misma:

| | |
|---|---|
| `Código no válido` | la credencial no vale, y esperando no se arregla |
| `Sin conexión` | no se llega al servidor, y se sigue intentando |
| `Enlazando…` | está buscando tu puesto |

Con una credencial rechazada **se corta la reconexión**. Reintentar con un código
que el servidor va a rechazar siempre gasta batería y hace parpadear el estado
para siempre, y sobre todo hace creer que el problema es la red cuando es el
código.

## Fase 1 — El Reflejo · condicionales

> Lámina I · la pierna izquierda. «La pierna decide qué la toca antes de pensarlo.»

La membrana de raíces de la rodilla es el **sistema inmune** de la pierna: un
flujo de filtros en pseudocódigo que decide qué programas entran. El equipo trae
sus **esporas** y tiene que reescribir ese flujo desde dentro para que pasen,
arraiguen y la pierna se marchite hasta quedar fuera de juego.

```
para cada programa que llega:
    si origen = externo y permisos <= 2     → descartar   [defensa de la pierna]
    si permisos >= 3 y firma != valida      → descartar   [vuestro]
    dejar pasar
```

Es un **embudo**: cada filtro descarta lo que cumple su condición. El flujo
**arranca con las defensas de la propia pierna** (en azul), que hoy frenan a las
esporas y también se pueden quitar. Se gana cuando, a la vez, **pasan las
esporas**, **caen los anticuerpos** de la pierna (si entran, encuentran a las
esporas y las secan) y **la rutina sigue pasando**, para que la pierna no se dé
cuenta. El orden no cambia lo que sale al final; lo difícil es escribir
condiciones precisas y atreverse a quitar la defensa que estorba. Dura unos
**25 minutos**, en dos capas.

- **Datos** (la memoria) ve el **flujo dibujado** —un rombo por filtro, las
  defensas en azul, los huecos libres punteados y la membrana al fondo— y el mismo
  flujo en pseudocódigo. Debajo, el registro (`programas`: tipo y permisos), el
  `encargo` —qué es espora, qué es anticuerpo y qué es rutina— y **las corridas**:
  todo lo que da cada `probar`, en tablas para buscar. **No tiene ni el origen ni
  la firma de nadie.**
- **Pantalla** (el ojo) ve la membrana por cámara, **sin números**: cada programa
  llega y pasa o rebota, con su nombre, y **mientras la membrana lo palpa la
  cámara dice de dónde viene** («viene de: …»). Ese dato no está en ninguna tabla:
  hay que mirar la fila pasar y apuntarlo. Las firmas que pida Terminal también le
  llegan a Pantalla.
- **Terminal** (el nervio) reescribe el flujo, y no ve nada.

Comandos: `flujo`, `filtrar si <condición>`, `quitar <n>`, `probar`, `desplegar`,
`estado`, `firmas tipo <tipo>`, `firmas <nombre|id>`, `camaras`, `camara <n|nombre>`.
`firmas` a secas no suelta todas: hay que acotar por un tipo o por un programa, y
ni los tipos ni los nombres los sabe Terminal —los sabe Datos—. Las condiciones son `campo operador
valor`, unidas con `y` o con `o` (sin mezclar). Campos: `nombre`, `tipo`,
`origen`, `permisos` y `firma`.

Los nombres de todos los programas son de jardín (`riego`, `liquen`, `brote`…):
esporas, anticuerpos y rutina por igual, y sin extensión. Si no, la cámara le
cantaría a Pantalla qué es cada uno, y eso es de Datos.

### Las dos capas

| capa | nombre | qué pide | tope |
|---|---|---|---|
| 1 | **La rótula** | 10 programas: 3 esporas que tienen que pasar y 4 anticuerpos que tienen que caer. Se vale nombrar. | 3 filtros, contando las defensas |
| 2 | **La muda** | 16 programas: 5 esporas y 7 anticuerpos. | 5 filtros |

En la capa 1 la defensa de la pierna —«origen = externo y permisos <= 2»— deja
fuera justo a las tres esporas (`brote`, `raiz`, `polen`). Hay que quitarla —al
`probar` con ella puesta, la consola recuerda que es de la pierna y que se puede
quitar— y dejar fuera a los cuatro anticuerpos (`liquen`, `esqueje`, `resina`,
`corteza`). Es la capa **amable**, pensada para quien acaba de empezar: diez
programas, y se vale nombrar, así que hay un camino de **un solo rasgo por filtro**:

```
quitar 1
filtrar si firma = ausente       ← liquen y resina de golpe
filtrar si nombre = esqueje
filtrar si nombre = corteza
```

Quien sepa juntar con `y` lo hace en dos filtros que además sobreviven a la muda:
`permisos >= 3 y firma != valida` y `origen = externo y permisos >= 3`. Nombrar a
los cuatro uno a uno no cabe. Las trampas siguen ahí para enseñar precisión:

- «firma != valida» tira a `polen`, que es espora.
- «origen = externo» tira a las esporas.
- «permisos >= 4» tira a `savia`, que es rutina.
- `corteza` es anticuerpo con la firma válida: la firma sola no basta.

`poda` (rutina) y `humus` (anticuerpo) no juegan la capa 1: llegan con la muda, que
así sigue siendo la misma de siempre, con dieciséis programas.

Al desplegar bien la capa 1, la pierna **muda**:

- **Levanta una defensa nueva** delante de todo —«origen = externo y firma =
  caducada»— que vuelve a frenar a `polen` y a `nectar`.
- **Se secan los filtros que nombraban a algo** y `nombre` deja de valer.
- **Llegan seis programas** (`micelio` y `nectar` son esporas; `tallo` y `humus`
  son anticuerpos; `xilema` y `poda`, rutina) y **`savia` se vuelve anticuerpo**.
- `micelio` es espora, externa y de permisos 3: el filtro «origen = externo y
  permisos >= 3» se la lleva y hay que afinarlo. «tipo = driver» a secas tira
  también a `xilema`.

Solo la capa 2 sella el tiempo oficial: la pierna se marchita, la cortinilla
espera 4,2 s para que se vea rendirse a la membrana, y en el lobby cae la pierna.

**Superar la capa 1 se celebra.** En la cámara de Pantalla la rótula se agrieta y
tiembla, estalla una lluvia de chispas verdes y sale **«CAPA 1 SUPERADA · la
rótula cede»**; luego viene la muda («CAPA 2 · LA MUDA»: las raíces se secan, caen
y vuelven a crecer en azul). Las grietas se quedan en la rótula toda la capa 2. A la
vez, en los tres puestos, la franja de la lámina se cubre con «[OK] CAPA 1 · LA
RÓTULA SUPERADA >> CAPA 2 · LA MUDA». La cámara recuerda en la pestaña qué muda ya
enseñó, así que se ve aunque Pantalla tuviera puesta la cámara del interior en el
momento de desplegar.

### La membrana en primera persona

Pantalla ve la cámara `MEMBRANA` desde dentro de la rodilla
(`client/src/player/fases/Reflejo3D.tsx`): **Pantalla es el reflejo**, plantado
frente a su membrana, y ve llegar a los programas por el pasillo. Al fondo hay dos
puertas, **EXTERIOR** (izquierda, luz rosa) y **CUERPO** (derecha, luz verde): por
cuál sale cada programa *es* su origen, así que el dato que antes era un texto («viene
de…») ahora se ve, y hay que apuntarlo. Al llegar, el zarcillo lo palpa, el impulso
sube por el pilar, el ojo del ganglio decide y las raíces se abren (PASA) o se cierran
con espinas (ALTO). Debajo va **la fila en 2D**, en orden, con el de turno resaltado.
La muda y la rendición se ven en la misma sala. No enseña nada más que la escena 2D:
ni tipo, ni permisos, ni firma, ni en qué filtro cae nadie.

Es **ligera a propósito**: la cámara no se mueve, así que el pasillo se dibuja una
sola vez (con el motor compartido `motor3d.ts`) y cada cuadro solo pega encima el
programa y la membrana; anima a unos 10 cuadros por segundo y solo mientras algo se
mueve, y si un equipo tarda en dibujar baja sola a 4. El reloj es el mismo que el de
la escena 2D (`useReflejo` en `Membrana.tsx`), que sigue en la proyección de sala.
`node e2e/_rendimiento.mjs` mide las dos vistas 3D en Chromium (normal y con la CPU 6×
más lenta) y en Firefox.

### La membrana, en circuito cerrado

*(Sobre el circuito cerrado en general, ver [El circuito cerrado](#el-circuito-cerrado)
más abajo.)*

Dos cámaras: `MEMBRANA` —la fila de programas, los dos pilares, la rótula con el
ganglio y las raíces— e `INTERIOR`, lo que ya entró. La escena es un SVG animado
en el cliente (`client/src/player/fases/Membrana.tsx`): cada programa —una
cápsula de circuito con patillas que anda como un bicho y un brote en la antena—
llega, un zarcillo lo **palpa**, el impulso sube al ganglio y baja a las raíces,
que **se apartan** (`PASA`) o **se cierran con espinas** (`ALTO`). Con muchos en
la fila, se aprietan para caber.

El servidor manda en `vista.dibujo` **lo mismo que ya daban los fotogramas de
texto** —nombre, si pasa y si llegó con la muda— y el cliente pone la animación.
**La cámara enseña el efecto, sin números:** ni cuántos pasan ni en qué filtro
cae cada uno —eso está en las corridas de Datos—, y la imagen no lleva ni tipo,
ni origen, ni firma, ni qué es cada programa. Hay una prueba por cada uno.

### La simulación: corridas en la base de datos

`probar` no le enseña el resultado a nadie: lo **guarda** como una corrida
numerada (`R1`, `R2`…) y a Pantalla solo le dice que se guardó. Cuántos pasan,
quién cae y en qué filtro se **busca** en tres tablas de Datos, con la corrida más
reciente arriba y marcada como nueva:

| tabla | columnas | para qué |
|---|---|---|
| `corridas` | `id`, `filtros`, `pasan`, `caen` | el recuento de cada `probar` |
| `corrida_filtros` | `id`, `corrida_id`, `n`, `condicion`, `de` | el flujo que tenía cada corrida; `de` dice si el filtro era de la pierna o del equipo |
| `resultados` | `id`, `corrida_id`, `programa_id`, `veredicto`, `cae_en_filtro` | qué le pasó a cada programa |

`resultados` apunta a `programas` y a `corridas`, así que se salta de un
resultado a su programa con un clic, y el buscador de cada tabla filtra por
corrida (`R3-`) o por programa. Comparar eso con el `encargo` es el trabajo de
Datos; la cámara de Pantalla sirve para confirmarlo a simple vista. Se guardan
las 10 últimas corridas. `probar` sigue siendo gratis.

## Contra las soluciones copiadas

No se puede impedir que alguien fotografíe una pantalla y se la pase a una IA o a
otra mesa. Se puede hacer que cueste más que pensar en equipo. La Fase 1 lleva
las cuatro medidas y la Fase 2 también (nombres e IPs por mesa); el mecanismo vale
para las demás.

- **Una versión por equipo.** Cada mesa juega la misma fase —las mismas trampas,
  la misma forma de resolverla— con otra piel: otros nombres y otros ids, otro
  orden en la fila, otras palabras para el origen, el tipo y la firma (p. ej.
  `local/remoto`, `sellada/vencida/sin-sello`) y otra escala de permisos,
  desplazada y a veces al revés. Sale del id del equipo (`ctx.semilla`), así que
  es estable aunque se reinicie el servidor. La solución de una mesa, copiada tal
  cual, no sirve en otra; hay una prueba que lo comprueba. Sin semilla, la versión
  canónica, que es la de las pruebas.
- **Nadie lo tiene todo.** Datos no ve ni el origen ni la firma; el origen solo lo
  enseña la cámara de Pantalla, un programa cada vez; la firma solo la consulta
  Terminal, por tipo o por programa. Una captura de una sola pantalla no basta.
- **La consola no admite pegar.** Ni pegar ni arrastrar: se escribe a mano. El
  intento se avisa en la consola y se cuenta (`terminal:pegado`).
- **Señales en el panel** (`server/src/realtime/vigilancia.ts`). Cada equipo
  lleva tres cuentas: intentos de pegar, comandos de 24 caracteres o más que
  llegan a más de 14 caracteres por segundo desde el anterior, y fases resueltas
  en menos de 5 minutos de tiempo activo. Si alguna salta, su tarjeta en el panel
  dice **[!] MIRAR ESTA MESA** con el detalle. No castiga nada: dice dónde mirar.
  Vive en memoria y se borra al reiniciar el juego.

**La solución de una mesa concreta**, para dar pistas justas: desde `server`,
`npm run solucion:f1 -- <EQUIPO>` imprime su versión (programas, quién es espora y
quién anticuerpo) y la solución traducida a sus palabras. La guía ilustrada está en
`Guia-de-solucion-Fase-1-El-Reflejo.pdf`, solo para la organización; sus capturas
las regenera `e2e/_guia-f1.mjs` contra el servidor de prueba, y `e2e/_pdf.mjs` pasa
el HTML a PDF.

## La animación de cada fase

La primera vez que alguien entra en una fase, antes de jugar, ve una animación
corta que cuenta qué hay que hacer (`client/src/player/fases/IntroFase.tsx`). Se
salta, se pausa con la barra espaciadora, se recorre con las flechas y se vuelve a
ver con **[?] CÓMO SE JUEGA**, en la cabecera de la fase. Lo ya visto se recuerda
en el navegador, por persona y fase. No pide nada al servidor ni lleva datos de la
partida: es la misma para todas las mesas.

La de la Fase 1 (`IntroReflejo.tsx`) son seis escenas, poco más de un minuto, en
español de México (ustedes, nunca vosotros): la
pierna y su membrana; quién es quién (esporas, anticuerpos, rutina); el problema
(la defensa de la pierna frena a las esporas); reescribir el flujo; nadie lo tiene
todo; y probar, desplegar y las dos capas.

En el panel, **ANIMACIONES DE LAS FASES** las lista con un botón **VER ANIMACIÓN**
que la reproduce solo en esa pantalla, sin mandarla a nadie ni marcarla como vista.
Añadir la de otra fase es registrar sus escenas en `INTROS`.

## La lámina de cada fase

Encima de los tres puestos, en todas las fases, va una franja
(`client/src/player/LaminaFase.tsx`): el número de lámina, la parte del cuerpo
que es esa fase, su nombre y su concepto, un robot pequeño con la parte encendida
y las ya caídas en verde, y —si la fase va por capas— una ficha por capa. Cada
capa que cae hace avanzar una enredadera por el borde de la franja. Las fases que
mandan `lamina: { capa, capas, nombres, resuelta }` en su proyección enseñan las
capas; las demás, solo la cabecera.

## Fase 1 — La Maraña · secuencias y ciclos

Lámina I, la pierna izquierda. Unos 25 minutos. Es la **primera** fase y la juega
gente que quizá nunca ha programado: para entrar en la máquina hay que cruzar su
pierna izquierda, que con los años se volvió una maraña
(`server/src/phases/marana.ts`, clave `fase-2-enemigo`, que se conserva para no
migrar bases).

**Un homenaje a Karel.** El equipo manda un **brote** —su programa— a cruzarla, y
el brote se dibuja como una **flecha**, como Karel the Robot (Richard E. Pattis,
1981), el robot con el que generaciones aprendieron a programar. Solo importa dónde
está y hacia dónde apunta, porque **izquierda y derecha son las suyas**: es la
primera lección. Terminal le escribe el camino una instrucción por línea y lo lanza:

| comando | qué hace |
|---|---|
| `avanzar` · `girar izquierda` · `girar derecha` | agregan esa línea al final (también `agregar <instrucción>`) |
| `repetir N veces` … `fin` | el ciclo contado (desde el seto) |
| `insertar n …` · `cambiar n …` · `borrar n` · `borrar todo` | editar el programa |
| `estado` · `lanzar` | ver el estado, mandar el brote |

No hay encabezado ni identificadores: el programa sale tal cual con `lanzar`. (Hubo
un `conectar <id>` con identificadores que cambiaban en cada lanzamiento; se quitó
porque en una primera fase era fricción sin nada que aprender.)

**Lo que se ve y lo que queda escrito.** Si un brote no llega, Pantalla solo ve que
**se desconectó**: ni contra qué chocó, ni si pisó una espina o una mina, ni si se
le acabó el programa (al servidor ni siquiera le manda el `contra` ni el tipo de
final). Eso queda en su **bitácora**, una tabla por brote en Datos (`brote` en el
seto; `brote_1` … `brote_4` en la espesura): un renglón por paso del último
lanzamiento con la línea del programa, la instrucción, la vuelta de cada ciclo
(`L3:15`) y lo que le pasó; el último dice por qué se desconectó. Las caminatas van
despacio para que Datos siga la línea: 0.52 s por paso en el seto, 0.2 s por golpe
en la espesura (un lanzamiento llega a ~72 s).

El brote nace siempre en su semillero. Si choca contra una pared o pisa una espina
(o una mina), **se marchita** y el siguiente vuelve a empezar desde ahí. Cada brote que no
llega cuenta como intento (desempate) y el siguiente tarda en germinar lo que tarda
el anterior en andar, más un respiro igual para todos: así la consola no se entera
de cómo acabó por el tiempo de espera.

**Dos capas.**

- **Capa 1 · El semillero** — el calentamiento. Un laberinto de 7 × 7, nueve acciones
  y dos giros (uno a cada lado), sin espinas y con 12 líneas de cupo: no hace falta
  ningún ciclo. Sirve para que los tres puestos aprendan a hablarse y para descubrir,
  chocando, que izquierda y derecha son las del brote. Al cruzarlo, el programa se
  vacía.
- **Capa 2 · El seto** — un laberinto fijo que Pantalla ve entero. El brote carga
  como mucho **10 líneas** y el camino bueno son 24 acciones: no cabe sin un
  `repetir`. Hay tres caminos con forma de ciclo —la L obvia y dos escaleras— y
  **tres espinas** que el plano pinta como camino: una en la L y dos en una de las
  escaleras. Solo la tabla `espinas` de Datos dice dónde están.

**El bonus · La Espesura** (`fase-bonus-espesura`, el corazón) es la segunda mitad de
la Maraña de antes, convertida en fase aparte porque pide un algoritmo de dificultad
media: un laberinto de **23 × 31**, a oscuras, **fijo** para cada mesa. Salen **cuatro
brotes a la vez**, uno en cada esquina, con **el mismo programa**, y todos buscan el
**claro del centro**. El brote entiende sensores (`frente libre`, `izquierda
bloqueada`…), `repetir mientras` y `si … sino`, y carga 14 líneas. El **camino más
corto de cada brote pasa por una mina** que solo la tabla `minas` de Datos conoce;
quien no suelta nunca la pared de un lado acaba en el claro, y por una de las dos
paredes los cuatro llegan sin pisar mina. Se cruza cuando **los cuatro llegan en el
mismo lanzamiento**. Comparte el motor con La Maraña: `crearModulo` recibe qué capas
tiene cada fase.

**La vista en primera persona.** Pantalla ve La Maraña (y el bonus) desde los ojos
del brote (`client/src/player/fases/Marana3D.tsx`): el mismo lanzamiento, con el mismo
reloj que Datos, dibujado por un raycaster de pasillos a 320 × 200 escalado sin
suavizar. Avanza **a saltos, un cuadro por casilla** —cada `avanzar` y cada giro cambian
la imagen de golpe, al ritmo del servidor—, con un contador «paso N de M». Tiene muros de seto y circuito, piso de casillas que se pueden contar, la
salida como columna de luz y el letrero de la instrucción que está cumpliendo
(«AVANZAR», «GIRAR IZQUIERDA»). En la esquina va el **plano 2D** con las coordenadas
—columna en letra, fila en número, las mismas de la tabla de espinas— y la flecha: es
lo que Pantalla usa para dictar. En primera persona «girar izquierda» siempre es la
izquierda de quien mira, que es la lección del semillero. No sabe nada que el 2D no
sepa: las espinas y las minas se ven como camino, en la espesura solo se dibuja lo
alumbrado (y se elige a cuál de los cuatro brotes seguir), y un brote que se
desconecta se queda en estática. La proyección de sala sigue con el plano 2D entero.

**El reparto.** Pantalla ve el laberinto y el brote andando (con coordenadas:
columna en letra, fila en número). Datos ve el **programa vivo** —la línea que
mueve al brote se enciende y cada ciclo cuenta sus vueltas, al mismo paso que
Pantalla; en la espesura cada brote marca su línea con su número y Datos elige a
cuál seguirle las vueltas—, el manual, las espinas (o las minas y `crecimiento`) y
la bitácora `viajes`, con una fila por brote (`V3-2`: lanzamiento 3, brote 2). Terminal escribe a ciegas:
solo ve cuántas líneas lleva, cuántos bloques tiene abiertos y cuándo germina el
siguiente brote.

**Una versión por mesa.** El seto de cada equipo es el mismo girado o reflejado
(las ocho simetrías del cuadrado) y la escalera con espinas cambia de sitio: al
reflejar, izquierda y derecha se cambian y el programa de otra mesa no sirve. La
espesura se genera con la semilla del equipo (reproducible): otro laberinto, otras
minas y otra pared buena. `npm run solucion:f2 -- EQUIPO` imprime el seto de esa
mesa, la escalera buena, la espesura con sus brotes y minas, y el seguidor de pared
que la cruza, para dar pistas justas.

Cliente: `client/src/player/fases/Marana.tsx` (la escena de Pantalla),
`ProgramaBrote.tsx` (el programa de Datos y el bloque `programa`), `caminata.ts` (el
reloj que comparten) e `IntroMarana.tsx` (la intro de entrada, la del seto y la del bonus).

**Pruebas.** `npm run smoke:fase2` (el módulo: el seto en las 48 versiones, la
espesura en 41 mesas —tamaño, cuatro brotes, la mina en cada camino más corto, la
pared buena y la mala—, el reparto) y `smoke:fase2:servidor` contra un servidor con base
sembrada:

```bash
cd server
DATABASE_URL="file:./test.db" npx prisma db push && DATABASE_URL="file:./test.db" npm run db:seed
DATABASE_URL="file:./test.db" PORT=4200 npx tsx src/index.ts &
DATABASE_URL="file:./test.db" SMOKE_URL=http://localhost:4200 npm run smoke:fase2:servidor
```


## El recorrido

Cuatro fases en unas cuatro horas útiles, y un bonus. Cada una enseña una idea de
programación, y la ficción es el envoltorio, no el relleno: lo que se aprende
resolviendo es lo que dice la columna de la derecha.

| # | fase | enseña |
|---|---|---|
| 1 | La Maraña | **secuencias** y **ciclos** contados |
| 2 | El Reflejo | **condicionales** |
| 3 | Núcleo Modular | **funciones** |
| 4 | Puente de Lanzamiento | **APIs** — y es la FINAL: cierra el evento |
| bonus | La Espesura | *ciclos que deciden (seguidor de pared); fuera del recorrido* |

La Maraña abre porque es la más amable para quien nunca ha programado. Muro de
Repetición, Bóveda de Credenciales y El Rastro siguen en el código (y sus secciones,
abajo), pero el seed ya no las siembra: las borra de la base.

Las dos últimas filas no son adorno, y el servidor las conoce: la Fase 4 lleva
`esFinal` y el bonus `esBonus` en el seed. De ahí salen tres cosas: el cohete y la
cuenta atrás de la proyección, que la meta de la carrera esté en la sexta y no
en la séptima, y que el bonus no estire la escala de averías del proyector.

Las seis comparten tres decisiones, y las tres son deliberadas:

- **Ningún puesto puede resolver una fase solo.** Lo que hay que teclear se
  nombra con un vocabulario que solo tiene el Operador de Datos, y lo que hay
  que saber para acertar solo se ve en Pantalla. La Fase 4 lo lleva más lejos:
  ahí Terminal **anda por un código que no ve** y Pantalla se lo lee.
- **Probar es gratis; comprometerse, no.** `probar`, `casos`, `contar` y los
  errores 4xx no cuestan nada: equivocarse mientras se piensa es el trabajo.
  `desplegar`, `extraer` y la petición que llega a la capa de lanzamiento sí
  cuestan, con cuarentena creciente de 20 s, 45 s y 90 s.
- **Los errores explican en vez de gruñir.** «No mezcles `y` con `o`, no se
  sabría cuál manda» enseña; «error de sintaxis» enseña a rendirse.

## Fase 3 — Muro de Repetición · ciclos

> Mil quinientos noventa golpes. A mano no da tiempo.

Un laberinto de **17 × 11** con **cinco barreras** y cuatro rocas. Se gana
llegando a la salida.

| puesto | tiene | no tiene |
|---|---|---|
| **Pantalla** | el plano y dónde está el corredor | qué tapona un pasillo, hasta que alguien mira |
| **Terminal** | la consola y un tablero con su casilla | el plano |
| **Datos** | la tabla de **durezas** y las reglas | el plano y las barreras |

Comandos: `mover <arriba\|abajo\|izquierda\|derecha>`,
`repetir <n> veces mover <dirección>`, `mirar`, `golpear`,
`repetir <n> veces golpear`, `repetir <n> tandas de <m> golpes`, `donde`.

### Estrellarse reinicia el laberinto

Chocar contra un muro, contra una roca o contra una barrera en pie **devuelve a la
entrada y levanta otra vez las cinco barreras**. Es duro a propósito: es lo que
convierte `mirar` en obligatorio antes de cada tramo en vez de en una comodidad.

**Lo único que se conserva es el plano descubierto.** Sin eso, un equipo podría
dar vueltas toda la tarde sin llegar nunca y el castigo dejaría de enseñar para
pasar a impedir. Se pierde el avance; se conserva lo aprendido.

Y **se ve**. El corredor no desaparece de golpe: sale disparado contra lo que no
había mirado, la casilla se enciende, rebota y **entonces** entra la sacudida del
tubo —la misma `body.fallo` que dispara un cambio de rol, porque significa lo
mismo— y aparece en la entrada. Un segundo en total.

Para poder enseñarlo, el choque viaja con **dónde fue, hacia dónde y contra qué**:
cuando el estado llega a la Pantalla el servidor ya ha devuelto al corredor a la
entrada, así que sin ese dato solo se le vería aparecer allí sin saber por qué.
Lleva además un contador, para que dos choques iguales seguidos no se confundan
con uno solo.

### `mirar` y `repetir` son pareja

Aquí estaba el riesgo de diseño: si estrellarse reinicia, un
`repetir 8 veces mover derecha` sería una ruleta rusa y se perdería justo la
lección de ciclos que la fase enseña.

Por eso **`mirar` mide el pasillo entero, no la casilla de al lado**:

```
> mirar
  arriba      0 libre(s)   muro
  abajo       8 libre(s)   muro
  izquierda   0 libre(s)   muro
  derecha     0 libre(s)   ROCA — no se rompe, se rodea

> repetir 8 veces mover abajo      ← el número que acaba de dar
  8 casilla(s) hacia abajo.
```

**Mirar te da el número y el ciclo lo usa.** Una vuelta de más y vuelves a la
entrada. El plano enseña los muros pero no lo que tapona un pasillo: una roca y
un hueco libre se pintan igual hasta que alguien mira. La roca no se rompe, se
rodea; la barrera sí, y es rosa porque se puede hacer algo con ella.

### Las rocas están donde duelen

No son decorado, y eso está **comprobado en el smoke**: sin ellas la salida está
a **22 pasos** y con ellas a **46**. Cada una se colocó buscando la casilla que
más alargaba el camino, y una que no alargara nada sería una roca que el equipo
nunca sabría que estuvo ahí.

El laberinto es un literal, no un generador: salió de un backtracker con semilla
fija, se verificó y se pegó en el módulo. Un generador daría un laberinto
distinto a cada equipo y ninguno revisable.

### Las cinco barreras

Están en **cuellos de botella**: cada una, por sí sola, corta el paso a la salida.
No hay forma de rodear ninguna, y eso está comprobado en el smoke — una barrera
que se puede esquivar no es una barrera que haya que destruir.

| # | placa | golpes | forma |
|---|---|---|---|
| 1 | `CHAPA · grosor 4` | 120 | seguidos |
| 2 | `ACERO · grosor 7` | 420 | seguidos |
| 3 | `HORMIGON · grosor 6 · 4 tandas` | 360 | **4 × 90** |
| 4 | `CHAPA · grosor 8` | 240 | seguidos |
| 5 | `BLINDAJE · grosor 5 · 3 tandas` | 450 | **3 × 150** |

### El ciclo, dos veces

| | |
|---|---|
| `repetir 8 veces mover derecha` | ocho casillas de una tacada |
| `repetir 120 veces golpear` | chapa, grosor 4 × dureza 30 |
| `repetir 4 tandas de 90 golpes` | hormigón, 360 golpes **en 4 grupos** |

Y un ciclo de `mover` **se para donde ya no puede y dice cuántas vueltas llegó a
dar**: un ciclo que se detiene a la tercera de ocho está señalando el obstáculo
sin que nadie lo mire. Eso también es información.

La segunda barrera es el corazón de la fase: `repetir 360 veces golpear` **no** la
tumba y `repetir 4 tandas de 90 golpes` **sí**, y son exactamente los mismos
golpes. Pasarse dispara la alarma; quedarse corto sale gratis y la barrera se
recompone, así que hay que darle el número entero de una vez.

El smoke juega la fase **entera** —busca la ruta, rodea las rocas, rompe las
cinco barreras y llega a la salida en 56 comandos— porque las piezas pueden estar
todas bien y el laberinto no tener salida. Y el plano se **importa** del módulo en
vez de retranscribirse: copiarlo a mano ya coló una barrera en la columna
equivocada, y esa se podía rodear.

### La barrera cae cuando termina la animación

Al romperse, la barrera pasa a ser pasillo en el mismo estado que viaja a
Pantalla. La animación buscaba la barrera *en el plano* para saber hacia dónde
embestir, no la encontraba, y **el golpe acertado —justo el que hay que
celebrar— se quedaba sin animación**. Ahora el intento viaja diciendo hacia dónde
fue, así que la embestida no depende de algo que acaba de dejar de existir: la
casilla se pinta como barrera mientras dura el martilleo y cae en el último
fotograma.

## Fase 4 — Núcleo Modular · funciones

> El código del enemigo está partido en piezas que se llaman entre sí.

**Esta fase reparte distinto que las demás, y es lo que la hace.** Aquí no es «uno
ve y otro escribe»: los dos puestos tienen dos cosas cada uno.

| puesto | tiene | no tiene |
|---|---|---|
| **Pantalla** | el árbol de carpetas y el código de la pieza abierta, con el cursor de su compañero marcado · la salida de los comandos | qué debería dar cada caso |
| **Terminal** | la consola · un **navegador** que le dice dónde está: ruta, línea, pila de llamadas y qué movimientos tiene | **ni una línea de código** |
| **Datos** | el manual: qué debería devolver cada caso, cuánto pesa cada nodo y qué piezas se tocaron | código ni resultados |

Comandos: `abrir <pieza>`, `subir`, `bajar`, `entrar`, `volver`,
`corregir <cuenta>`, `probar`, `traza <caso>`, `reiniciar`, `desplegar`.

### Andar por el código es el grafo de llamadas

`entrar` en una línea que llama a otra pieza te mete **dentro** de esa pieza, y
`volver` te devuelve a la línea desde la que llamaste. La pila que ve Terminal es
la pila de llamadas, recorrida con los pies:

```
abrir prioridad
bajar          linea 2: p = peso(nodo)
bajar          linea 3: devuelve escalar(p, 3)   ← aquí aparece `entrar`
entrar         pila: prioridad > escalar
bajar
corregir v * f
```

Los **movimientos disponibles cambian con cada paso**, y son el único hilo que
Terminal puede seguir sin ver nada: si aparece `entrar`, esa línea llama a otra
pieza; si aparece `corregir`, esa línea hace una cuenta. Cada línea llama como
mucho a una pieza, a propósito: si llamara a dos, `entrar` tendría que preguntar
a cuál y el movimiento dejaría de ser evidente.

Y **`corregir` no toma nombre**: actúa sobre la línea donde estás. Hay que andar
hasta la pieza rota, porque una función vive en un solo sitio y de eso va la fase.

### La escalera

Hay **tres piezas rotas**, y ninguna se adivina: al empezar no sale ni un caso, así
que no hay nada verde de lo que tirar. Lo que resuelve la fase es el contrato que
tiene Datos, leído **en cadena**:

| el contrato dice | y esa pieza es | luego |
|---|---|---|
| `prioridad(NODO-A)` = **12** | `escalar(peso(nodo), 3)`, y NODO-A pesa 4 | `escalar` **multiplica** |
| `orden(NODO-A)` = **24** | `doblar(prioridad(nodo))`, que ya vale 12 | `doblar` **duplica** |
| `riesgo(NODO-A)` = **23** | `margen(orden(nodo))`, que ya vale 24 | `margen` **resta uno** |

Cada peldaño necesita el anterior, y por eso los tres primeros casos son el mismo
nodo a tres profundidades. Los casos **se ponen en verde de uno en uno y en ese
orden**: es la señal de que van bien, y es lo que convierte cinco pistas sueltas
en una escalera.

Una cuenta bien puesta arregla todas las llamadas de esa pieza de golpe — que es
exactamente lo que significa que algo sea una función.

Las piezas que solo llaman a otras no se pueden corregir: no tienen nada propio
que arreglar, y el sistema lo explica en vez de rechazarlo. `lote` figura entre
las piezas tocadas esa noche justo para que alguien lo intente y lo descubra.

### Reiniciar

`reiniciar` devuelve las tres piezas a como estaban y suelta el cursor, para el
equipo que se ha enredado y prefiere empezar limpio.

**Deshace el problema, no el castigo:** los despliegues fallidos siguen contando y
la cuarentena sigue corriendo. Si reiniciar limpiara el marcador, sería la salida
barata de cualquier error y la cuarentena dejaría de significar nada.

## Fase 5 — Bóveda de Credenciales · bases de datos

> Miles de registros y uno solo sirve.

2400 credenciales, 240 personas, y una sola credencial cumple el encargo.

- **Pantalla** ve lo que devuelve la bóveda. Como mucho 10 filas: si salen más,
  no las enseña. Eso no es una limitación, es el ejercicio.
- **Datos** tiene el **diccionario de datos** —qué tablas hay, qué columnas, qué
  valores admiten— y el encargo. No ve ni un registro: tiene el mapa, no el
  territorio.

```
contar en credenciales                                        2400
contar en credenciales donde tipo = maestra                    368
  ... y estado = activa                                        162
  ... unir usuarios ... y departamento = sistemas               21
  ... y sede = torre                                             1
```

Ese embudo es la fase. `contar` antes de `buscar`: primero cuántos, luego cuáles.
Y el error más instructivo de todo el recorrido es `donde departamento = ...`
sin unir: la columna existe, pero **en la otra tabla**, y hay que unirlas por lo
que comparten.

## Fase 6 — Puente de Lanzamiento · APIs

> La última capa habla con el exterior.

Una petición tiene cuatro partes y las cuatro se pueden equivocar: **método,
ruta, cabecera y cuerpo**. El puente contesta con el número que toca, y el número
es la pista:

| | | | |
|---|---|---|---|
| `401` no has dicho quién eres | `403` el token no vale | `404` esa ruta no existe | `405` no escucha ese método |
| `422` falta algo en el cuerpo | `409` lo que mandas no cuadra | `200` ha ido bien | |

**Ninguno de esos errores hace daño**: no llegan a la capa de lanzamiento. Lo que
hace daño es una petición *bien hecha* a la ruta equivocada — y hay una,
documentada en mayúsculas, que adelanta el lanzamiento tres minutos.

Y no se resuelve de un disparo. Dos cosas lo impiden, y las dos son la razón de
que esta sea la fase más difícil del recorrido:

**1 · Hay tres operaciones y el puente no sabe cuál lleva ojiva.** El `GET`
devuelve las tres —`OP-7112`, `OP-7741`, `OP-7903`— y las da **todas por
armadas**: su inventario está viejo. Dos rampas están vacías y en una hay una
maqueta de instrucción. Eso no se puede preguntar: contestaría lo mismo de las
tres. Se ve **mirando**, y lo único que ata una operación con lo que sale por la
cámara es el **sector**. Cancelar la que no era cuenta como intento y quema el
reto: es el precio de disparar sin mirar.

**2 · El reto caduca a los 90 s.** La respuesta del `GET` no es una llave, es un
turno: vale para *una* cancelación y solo durante ese rato. Pasado el plazo, `410`
y a pedirlo otra vez. Caducar **no penaliza** —cuesta tiempo, que es lo que se
cobra aquí, no intentos— pero obliga a tenerlo todo hablado *antes* de preguntar:
mirad las cámaras primero, dictad después. Cada consulta trae un reto distinto,
así que no se puede memorizar.

Códigos nuevos que trae todo esto: `428` si se intenta cancelar sin haber
preguntado nunca, y `410` cuando el reto ya expiró.

**Casi ninguna API es un disparo; casi todas son una conversación** — y esta
además tiene reloj.

### El circuito cerrado

Pantalla tiene, además de las respuestas, **cuatro cámaras del recinto enemigo**:

| | cámara | qué enfoca |
|---|---|---|
| 1 | `RAMPA NORTE` · A-12 | la rampa del sector A-12 |
| 2 | `RAMPA CENTRO` · B-07 | la rampa del sector B-07 |
| 3 | `RAMPA SUR` · C-03 | la rampa del sector C-03 |
| 4 | `SALA DE CONTROL` · D-01 | los puestos enemigos y cuántas órdenes han entrado |
| 5 | `TORRE DE ENLACE` · E-01 | la antena por la que entra el puente |
| 6 | `PATIO EXTERIOR` · F-09 | el acceso rodado |

Las tres rampas se leen de un vistazo y desde el fondo de la sala: una tiene la
ojiva con su tobera venteando, otra el andamio cerrado sobre hormigón (`RAMPA
VACÍA`) y la tercera un cascarón de líneas discontinuas con `MAQUETA` escrito en
el costado. **Sin mirarlas no hay forma de saber cuál cancelar**, y por eso las
cámaras dejaron de ser decorado. Se piden por número, por nombre o **por sector**
—`camara b-07`—, que es como se habla de ellas en la sala. El rótulo del monitor
lleva además el **reloj del reto**, visible desde cualquiera de las seis.

**Quien las cambia no las ve.** Los comandos son de la consola —`camaras`,
`camara <n|nombre>`, `camara siguiente`— y las imágenes salen en Pantalla. Por
eso el selector de las cuatro se dibuja pero **no se puede pulsar**: un selector
pulsable convertiría la fase en un juego de una sola persona. Para mirar a un
sitio hay que pedirlo en voz alta.

Las cámaras no dicen qué hay que enviar —eso sigue estando solo en la
documentación de Datos— pero **reaccionan a todo lo que se envía**: la sala de
control lleva la cuenta de las peticiones y de las rechazadas, el enlace se
enciende con la primera, y cuando alguien manda la petición que no debía, el
silo lo enseña: el reloj salta, aparece `CUENTA ACORTADA` y la señal se ensucia
un grado más por cada adelanto. Al cancelar, la ojiva se ve bajada y el patio
evacuando.

Lo que las cámaras **no** dan es el identificador de la operación: dan el sector.
El `id` está en la lista del `GET` y el sector en el rótulo de la cámara, así que
hace falta cruzar las dos mitades. Ninguna imagen lleva el token ni el reto.

### La cuenta atrás se ve

La imagen no es un dibujo quieto: son **fotogramas**, y el silo cambia de estado
según lo que queda en el reloj. Cada petición equivocada se come tres minutos, y
cada tramo se ve distinto sin leer un número:

| reloj | tensión | qué se ve en CAM-1 |
|---|---|---|
| `T-09` | 0 | ventea despacio, un chorro de vapor de vez en cuando |
| `T-06` | 1 | ventea a los dos lados, más seguido |
| `T-03` | 2 | **motor encendido**: llama bajo la tobera y la cámara empieza a vibrar |
| `T-00` | 3 | **ignición**: llama a todo, humo, y el tubo se lava de luz |

El ritmo del bucle también acelera —420 ms por fotograma en calma, 170 a punto de
lanzar— y a partir de la tensión 2 la propia cámara tiembla. Son dos animaciones
sobre elementos distintos a propósito: el temblor va en la imagen y el ruido de
señal en el dibujo, porque si las dos animaran lo mismo, la última regla ganaría
y perderíamos una.

### La detonación

Cuando entra la petición correcta, **la cámara salta sola al silo** —en cualquier
otro momento elegir dónde mirar es del equipo, pero ahí ya no queda nada que
decidir— y la ojiva se detona en la rampa: seis fotogramas, de la grieta al
fogonazo, la bola de fuego, el humo y la rampa vacía con el andamio torcido. El
golpe de luz va por **índice de fotograma**, no por tiempo, así que la luz y el
dibujo no se pueden desincronizar. Al acabar, el monitor se suelta y vuelve a su
bucle: la ruina humeando.

Y para que se vea, la fase **le pide unos segundos a la cortinilla de victoria**
(`esperaVictoriaMs` en el resultado del comando). El sello es inmediato —el tiempo
oficial no se toca, ni se regalan ni se quitan segundos— pero la pantalla de
FASE COMPLETADA espera 3,4 s. Sin eso, la celebración tapaba el último fotograma
en el mismo milisegundo en que empezaba y el equipo se perdía justo lo que acababa
de conseguir. Los tres puestos esperan lo mismo: Datos y Terminal no ven la
explosión, pero el momento tiene que ser común, y Pantalla lo está narrando.

Bajo `prefers-reduced-motion` se paran el temblor, el parpadeo y el lavado de luz.
**Los fotogramas no se paran**: que el cohete encienda motores y reviente no es
movimiento de adorno, es lo que cuenta la fase, y quien no tolera el movimiento
tiene derecho a enterarse igual.

## Fase 7 — El Rastro · bonus

Un reto forense completo y probado que no entra en el recorrido de programación:
se sigue el rastro de una llave SSH sin dueño por cuatro saltos hasta la máquina
por la que entró el atacante, y el giro es que la dirección de fuera que cerró la
Fase 2 era la puerta de **salida**. Su batería es `smoke:rastro`.

Va marcada `esBonus` en el seed, y eso tiene consecuencias: **no pone poste en la
carrera** —la meta está en la final, que es la sexta— y no cuenta para llegar a
ella. Se abre **si sobra tiempo**, cuando el cohete ya ha despegado o ya ha
reventado en la plataforma. Recolocarla es cambiarle el `order`; sacarla del
bonus es quitarle la marca.

## El circuito cerrado

**Todas las fases menos la 3 le dan a Pantalla cámaras del escenario.** El
monitor es el mismo en todas —rótulo con `REC`, la cámara activa y su sector, la
imagen en caracteres y el selector abajo— y el dibujo es de cada fase:

| fase | cámaras |
|---|---|
| 1 · Control de Acceso | `PUERTA NORTE` · `VESTIBULO` |
| 2 · El Enemigo | `SALA DE SERVIDORES` · `PUERTA DE ENLACE` |
| 3 · Muro de Repetición | **ninguna** — el laberinto ya es su imagen |
| 4 · Núcleo Modular | `SALA DEL NUCLEO` · `BANCO DE PRUEBAS` |
| 5 · Bóveda | `BOVEDA` · `BRAZO EXTRACTOR` |
| 6 · Puente | tres rampas + `SALA DE CONTROL` · `TORRE DE ENLACE` · `PATIO` |
| 7 · El Rastro | `PASILLO DE RACKS` · `CONSOLA DE GUARDIA` |

Tres reglas las gobiernan a todas, y hay pruebas de las tres en cada fase:

- **Quien las cambia no las ve.** `camaras`, `camara <n|nombre|sector>`,
  `camara siguiente` son comandos de la consola, y la imagen sale en Pantalla. El
  selector se dibuja pero **no se pulsa**. Mirar nunca penaliza, en ninguna fase.
- **Enseñan el efecto, nunca la causa.** Cuántas cuentas siguen sueltas, sí; cuál
  es cuál, no. Quién pasa la puerta, sí; qué regla lo decidió, no. Cuántos
  cajones quedan, sí; cuál es el bueno, no. Cada fase tiene una lista de términos
  prohibidos que la prueba busca dentro de la imagen.
- **Mismo lienzo: 15 líneas por 36 columnas, siempre.** El cliente pinta las seis
  con el mismo monitor, y un fotograma de otro alto le hace dar un salto a la
  caja. Se rellena por arriba para que el suelo no se mueva.

Lo que cuentan es el **marcador de la fase, hecho imagen**: un armario encendido
por cada cuenta suelta, la cola avanzando y el brazo del portero que no sube, el
operario plantado delante de la bahía que tiene abierta, los cajones de la bóveda
apagándose en escala logarítmica (de 2400 a 1 en lineal no se veía nada), el
cable que se enciende entre dos máquinas con cada salto confirmado.

El mando y el sobre viven una sola vez, en `phases/comun.ts`
(`circuitoCerrado`, `mandoDeCamaras`, `lienzo`, `tira`): cada fase pone su dibujo
y sus rótulos, nada más.

## Nombre y logo del equipo

Lo que hay sembrado son diez nombres de relleno. El día del evento cada equipo
llega con el suyo y con un PNG, así que las dos cosas se cambian **desde el
panel, en caliente**, sin tocar el seed ni reiniciar nada.

```
┌──────────────────────────────────────────┐
│ [escudo] [x]  Los Tigres      ><   [OK]  │   ← la cabecera de cada equipo
├──────────────────────────────────────────┤
│  ▫ Jugador 1                  DATOS  ><! │
```

- **El escudo es el botón de subir.** Pulsar sobre el hueco del logo para poner
  un logo no hay que explicárselo a nadie. Al lado, `[x]` lo quita: va pegado a
  lo que borra, no al otro extremo de la fila.
- **El nombre se edita donde se lee.** Es un campo que parece un rótulo hasta
  que lo tocas, y el botón `GUARDAR` solo aparece si hay algo que guardar: con
  diez equipos, diez botones encendidos sin nada que hacer son diez sitios donde
  equivocarse. `Enter` guarda, `Esc` deshace.
- Los cambios llegan **a los tres puestos del equipo sin recargar**, y el logo
  aparece en su lobby y en su calle de la carrera.

Qué se acepta y qué no:

| | |
|---|---|
| formatos | PNG, JPG y WEBP |
| tamaño | hasta 512 kB |
| nombre | 1 a 24 caracteres, sin repetir otro equipo |

**El tipo de imagen sale de los BYTES, no del nombre ni del `Content-Type`.** Un
`.png` que por dentro es un archivo de texto se rechaza: lo que se devuelve
después en una etiqueta `<img>` a la sala entera conviene que sea de verdad lo
que dice ser. Y el tamaño se mira **también en el navegador, antes de enviar**,
porque pasarse del tope del socket no da un error: cierra la conexión, y el
panel solo diría «sin conexión» justo al subir un logo.

### Dónde viven los bytes

En la **base de datos**, en la fila del equipo, no en una carpeta del disco. Todo
el evento cabe en un archivo `.db` que se copia a otro portátil media hora antes
de empezar, y una carpeta de imágenes sueltas es justo lo que se queda atrás en
esa copia.

Lo que **no** viajan es dentro del snapshot: diez logos serían varios megas
repetidos en cada repintado y a cada cliente. El snapshot lleva solo `logoAt`, la
fecha del logo, y con ella el cliente compone la URL:

```
GET /api/equipos/<id>/logo?v=1789992899767   →   Cache-Control: immutable
```

Esa fecha en la query es lo que hace que un cambio se vea. La respuesta se cachea
para siempre —es inmutable por definición, porque cambiar el logo cambia la
URL— y sin el parámetro el proyector seguiría enseñando el logo anterior hasta
que alguien recargara a mano.

### Renombrar

Renombrar arrastra tres cosas y deja una quieta:

- el **nombre del equipo** y su `joinCode`, que van juntos;
- el **nombre de cada persona**, que lleva el del equipo delante: sin esto el
  panel seguiría enseñando «ALFA · Jugador 2» bajo un equipo que ya se llama de
  otra forma;
- una línea en la **bitácora**;
- y **no** el código de acceso, por lo dicho arriba.

**Reiniciar el juego no deshace nada de esto.** El reinicio borra el progreso
—tiempos, intentos, fases resueltas— y devuelve los roles a su reparto inicial,
pero el nombre y el logo de un equipo son su identidad, no su marcador: se ponen
una vez al empezar la tarde y ahí se quedan.

Un nombre repetido se rechaza **aunque cambie de mayúsculas**: Prisma sobre
SQLite no compara sin distinguir may/min, así que se compara en el servidor. Dos
equipos llamados «Tigres» y «TIGRES» en la misma pista son un problema de sala
aunque la base de datos los acepte.

Y las tarjetas del panel van **por antigüedad, no por nombre**. Con el orden
alfabético, renombrar un equipo le hacía saltar la tarjeta a otro sitio de la
rejilla y lo siguiente que tocara el admin sería el equipo de al lado. Es la
misma razón por la que las calles de la carrera —que salen de esta misma
lista— no se rebarajan solas.

## La carrera

Vista para el proyector de la sala: una carrera de feria donde cada equipo es un
caballo y su posición en la pista es la fase en la que va. Se abre desde el panel
con `>> CARRERA`, en la barra de arriba, y se vuelve con `<< PANEL`.

```
        salida   1     2     3     4     5     6     7   meta
 ALFA    │       │  ~~~│     │     │     │     │     │
 BRAVO   │   ~~~ │     │     │     │     │     │     │
 CHARLIE │~~~    │     │     │     │     │     │     │
 DELTA   │       │     │     │     │     │     │  ~~~│   [OK] META
```

- Una **calle por equipo**, en orden fijo. No se reordenan —ni al renombrar a
  alguien—: en una carrera la posición se lee en el eje, y una tabla que se
  baraja sola marea a quien la mira desde el fondo de la sala.
- Con el nombre, el **escudo del equipo**. A diez metros un logo se reconoce
  antes que un nombre, y es lo que busca cada equipo al levantar la vista. El
  hueco se reserva aunque no haya logo: si solo lo ocupara quien lo tiene, los
  nombres empezarían cada uno en un sitio.
- Un **poste por fase**, y el de la fase abierta encendido en rosa.
- El caballo avanza **medio paso** al entrar en una fase y el paso entero al
  resolverla: uno parado en el poste no distingue «acaba de llegar» de «lleva
  diez minutos ahí».
- A la derecha, la fase en curso y su **cronómetro vivo**, que corre solo y se
  congela cuando el evento está en pausa.
- El **banderín de líder** va a quien más fases lleva, y a igualdad, a quien
  menos tiempo acumula.

**No pide nada al servidor.** El panel de administración ya recibe todos los
equipos con su progreso y se repinta en cada cambio, así que la carrera es otra
forma de pintar los mismos datos, no otra fuente. Un endpoint propio habría que
mantenerlo en sincronía con el panel, y tarde o temprano los dos contarían cosas
distintas.

Lo normal es abrir **una segunda pestaña** con el mismo código de admin y dejarla
en la carrera para el proyector, mientras en la primera se sigue gobernando el
evento.

El caballo es una silueta plana y angular, como los de hojalata de las casetas de
feria, en `currentColor` para no romper el duotono.

Y se mueve. Los de hojalata son chapas rígidas en un carril: no mueven las
patas, **cabecean**, y pivotan sobre los cascos:

| estado | balanceo | la cabeza recorre |
|---|---|---|
| en la salida o esperando | `trote`, 2,2 s — se mece a dos tiempos | 14 % del caballo |
| dentro de una fase | `galope`, 0,46 s — cabecea de verdad | 20 % |
| en meta | `resuello`, 3,4 s — un fuelle hondo y lento | 12 % |

Tres cosas de esas cifras, que se rompen solas si alguien las toca sin saberlo:

- **Van en porcentaje de la altura del caballo, no en píxeles.** El caballo mide
  entre 28 y 58 px según el ancho de la sala, y un balanceo de «dos píxeles» que
  se aprecia en el portátil desaparece en el proyector, que es donde hay que
  verlo. Antes iban en píxeles y el de la salida se movía un 2 % de su altura:
  técnicamente animado, en la práctica una chapa muerta.
- **Ningún ciclo se queda quieto en ningún tramo.** Un compás con silencio se lee
  mejor de cerca, pero desde el fondo de la sala quien levanta la vista justo en
  el silencio ve un caballo parado y deja de mirar.
- **El giro del `resuello` va en el mismo sentido que la subida.** Con el pivote
  en los cascos, un giro al revés baja la cabeza justo cuando el cuerpo sube y
  las dos cosas se anulan: el caballo respiraba sin que se notara.

Y el orden importa tanto como los números: el que trabaja tiene que menearse más
que el que espera, o la pista deja de contar de un vistazo quién está dentro de
una fase.

La cola va suelta, con su propio ciclo: es el detalle que separa una chapa quieta
de un caballo, y cuesta seis líneas. Cada calle arranca con un **desfase distinto**
—si los cuatro cabecearan a la vez parecerían un engranaje, no un grupo de
caballos—.

Dos cosas que el código deja escritas porque se rompen solas si alguien las
mueve: la animación va en el `<svg>` y **no** en `.caballo`, porque ese contenedor
usa su `transform` para centrarse sobre la pista y una animación encima lo
descolocaría en cada fotograma; y todo —desplazamiento, balanceo y cola— se apaga
con `prefers-reduced-motion`, que un proyector es justo donde alguien se marea.
El e2e vigila las dos.

Y vigila el balanceo por arriba **y por abajo**: mide lo que recorre de verdad la
punta de la oreja y exige que pase del 8 % de la altura del caballo sin llegar al
28 %. El techo estaba desde el principio —que no acabe en un dibujo animado—; el
suelo se añadió después, porque el balanceo nació tan corto que no se veía
proyectado y sin suelo nada impedía volver a dejarlo así.

La pista tiene **un poste por barrera**, y el bonus no lo es: la meta está en la
final. Un equipo que además se lleve el bonus lo enseña con un `+B` junto a su
marca de meta, y quien lo esté jugando sigue contando como «trabajando» aunque
ya haya pasado la línea.

Y se reparte sola entre las calles que haya. El componente le pasa al CSS
cuántos equipos son, y el alto de calle —y con él el del caballo, que nunca
puede ser más alto que su carril— sale de dividir el tubo entre ellos. Con
cuatro equipos es la calle de siempre; con diez, la que cabe. La cuenta la hace
el navegador, que es quien sabe cuánto mide la pantalla, y no una tabla de casos
aquí.

## La proyección de sala

La otra vista para el proyector, y la que mira el público. Enseña **la escena de
la fase que el panel tenga destacada**, a sangre, con un rótulo abajo. Se abre
con `>> PROYECCIÓN` en la barra del panel, o directamente en `…/#proyeccion`.

```
        ┌───────────────────────────────────────────────┐
        │                                               │
        │        [ la escena de la fase destacada ]     │
        │                                               │
        ├───────────────────────────────────────────────┤
        │  F3  MURO DE REPETICIÓN                       │
        │      Mil quinientos noventa golpes. A mano…   │
        └───────────────────────────────────────────────┘
```

Vive en el **hash** y no en un estado suelto porque eso es lo que permite
abrirla en **su propia ventana**, arrastrarla al segundo monitor y dejarla ahí
toda la tarde mientras en la primera se sigue gobernando el evento. Un F5 a
mitad de evento la devuelve a la proyección, no al panel. No es una ruta de
verdad y no abre ninguna puerta: quien no traiga un código de admin no llega
escribiendo la URL, porque el reparto lo sigue decidiendo el `kind` del
snapshot, en el servidor.

Los mandos —volver al panel, pantalla completa— y el puntero del ratón **se
esconden solos** a los dos segundos y medio. Un cursor de flecha proyectado en
una pared de seis metros se ve desde la última fila.

**Destacar una fase y abrirla son cosas distintas, a propósito.** Se puede poner
la Fase 4 en la pared mientras la sala sigue peleando con la 3, para
presentarla antes de abrirla. La pared cuenta lo que quiere contar quien
gobierna el evento, no lo que hay abierto.

### Las escenas

| fase | qué se ve |
|---|---|
| 1 · Control de Acceso | el portero: uno llega, la condición decide y la barra sube o no sube |
| 2 · El Enemigo | el tráfico cayendo en cinta continua, los 4xx en azul |
| 3 · Muro de Repetición | el ariete golpeando y la cifra subiendo hasta 1 590 |
| 4 · Núcleo Modular | la cadena de piezas: `formato()` la corta, se arregla una vez y pasa entera |
| 5 · Bóveda | 2 400 registros apagándose hasta que queda uno, con la consulta estrechándose |
| 6 · Puente **(la final)** | el cohete en la rampa y la cuenta atrás — ver [La final](#la-final-el-cohete) |
| 7 · El Rastro *(bonus)* | el rastro encendiéndose **hacia atrás** hasta la máquina por la que entró |
| — sin destacar | carta de espera con la marca y el cursor parpadeando |

**Ninguna lee datos del juego, y es deliberado** —salvo la final, que es justo
lo contrario y por eso vive aparte—. Esto lo ven los diez equipos
y el público a la vez: una escena que dijera por dónde va alguien sería un
chivatazo servido en pared de seis metros. Cuentan **de qué va** la fase, en
bucle y sin nada que leer de cerca. Por lo mismo tampoco piden nada al
servidor: se alimentan de un reloj local, así que una ventana que se queda sin
conexión sigue proyectando en vez de congelarse, que es justo lo que hace falta
mientras alguien corre a mirar el router.

El reparto va **por la `key` de la fase**, la del seed. Una fase nueva —o
renombrada allí y no aquí— cae en una **carta de ajuste** con su rótulo, visible
en la pared, en vez de dejar el proyector en negro.

### Las averías suben con la fase

El tubo se descompone **más cuanto más avanzada** está la fase destacada. En la
primera se proyecta limpio; en la final, la pared tiembla. Es el termómetro del
evento sin un solo número, y lo lee cualquiera desde el fondo de la sala.

Lo gobierna una sola variable, `--glitch`, que va de 0 a 1 según el número de
fase, y que manda **tres cosas a la vez**:

| | fase 1 | fase 3 | final |
|---|---|---|---|
| `--glitch` | 0 | 0,4 | 1 |
| ruido encima | nada | 0,22 | 0,55 |
| alto del corte | 4 px | 14 px | 30 px |
| cada cuánto se rompe | 4,4 s | 3,1 s | 1,1 s |

Las roturas son dos y ninguna dura más de dos fotogramas: un **salto** vertical
—el cuadro que no engancha— y un **desliz** horizontal con los dos cañones
desalineados. El resto del ciclo no pasa nada, que es lo que separa un monitor
averiado de un adorno en bucle.

Tres decisiones que el código deja escritas:

- **En `--glitch: 0` las tres valen cero.** La fase 1 no es un caso especial que
  haya que apagar: es el extremo de una escala.
- **El bonus se queda en el tope** en vez de estirar la escala. Va detrás de la
  final, y si contara, la final se quedaría a medio camino de su propio máximo.
- **Las averías caen sobre la escena, nunca sobre el rótulo.** Van dentro del
  escenario y no del contenedor: el rótulo es lo único que alguien lee de cerca.
  El desliz va en el escenario y no en las capas, además, porque esas ya usan su
  `transform` para el cruce y dos animaciones sobre la misma propiedad no se
  suman: gana la última.

### El cruce

Al cambiar de fase destacada las dos escenas **conviven 0,9 s**: la que entra se
funde desde un destello de brillo y la que sale se va desenfocando. Es un tubo
cambiando de canal, no un corte seco, que delataría que detrás hay alguien
pulsando un botón.

La capa saliente **se desmonta** cuando termina el cruce, y eso es lo que vigila
el e2e: sin ese temporizador, ocho cambios de fase serían ocho escenas
animándose a la vez detrás de la buena, y el proyector acabaría a pedales.

El rótulo de abajo se renueva con su propia entrada en vez de cambiar el texto
en el sitio: leer el nombre nuevo sobre la escena vieja confunde más que ayuda.
Su frase sale del **`teaser` del seed**, que viaja al panel dentro del snapshot;
escribirla otra vez en el cliente sería tener el mismo texto en dos sitios que
nadie sincroniza.

Todo —el cruce, los bucles y el rótulo— **se apaga con `prefers-reduced-motion`**,
y aquí no basta con quitar el movimiento: el movimiento ES el contenido, así que
lo que se apaga es el bucle y lo que queda es el fotograma que se entiende solo.
El cruce se vuelve un corte limpio. El e2e lo comprueba, y comprueba también que
**ninguna escena se derrame sobre el rótulo** —lo único que se lee de cerca— en
1280×720, 1366×768, 1600×900 y 1920×1080.

## La final: el cohete

La Fase 6 cierra el evento, y es la única con **reloj propio**. Cuando el admin
la abre arranca una cuenta atrás —media hora de serie— y la proyección deja de
contar de qué va la fase para contar lo que está pasando: un cohete en la rampa
y el tiempo que queda para abortar el lanzamiento.

```
           │  ╱▔╲
           ├──┤  │        T-12:34
           │  │HM│   LANZAMIENTO EN CURSO · HAY QUE ABORTARLO
           │  ╱__╲
        ═══╧══════════════
```

Dos desenlaces, y son opuestos a lo que dice el instinto:

| | qué se ve | qué significa |
|---|---|---|
| **alguien lo resuelve** | el cohete se vence y **revienta en la plataforma** | el ataque se canceló · ganan |
| **se acaba el tiempo** | el cohete **despega y se va** | el ataque salió · pierden |

Es la ficción de la fase llevada a la pared: la Fase 6 va de mandarle a la capa
de lanzamiento el mensaje que **cancela** el ataque, así que el cohete en tierra
es la victoria y el cohete en el cielo, la derrota.

**Basta con que un equipo llegue.** El cohete no despega dos veces, y la pantalla
dice quién lo abortó.

### El reloj

No se guarda en ninguna parte. Sale de tres hechos —cuándo se abrió la fase,
cuánto dura y si alguien la resolvió— y por eso una ventana que se abre a mitad
enseña lo correcto sin que nadie tenga que reenviarle nada. Un estado guardado
aparte habría que mantenerlo en sincronía con esos tres hechos, y acabaría
contradiciéndolos justo en el peor momento.

- **Se detiene con el evento en pausa**, como el reloj de todas las fases. Un
  incidente en la sala no le come el tiempo a nadie.
- **Llegar a cero no cambia el juego.** Nadie queda FAILED, la fase no se cierra
  y nadie sale de donde esté: es un telón, no una penalización. Si la sala
  necesita más aire, se sube el límite y la cuenta sigue desde donde iba.
- El servidor manda **cuánto queda sellado al emitir**, y el cliente le resta lo
  transcurrido. Igual que el lobby y que la carrera.
- Una ventana que se abre **media hora después** del desenlace no repite la
  animación: enseña cómo quedó la cosa. Por eso viaja también el instante exacto
  en que ocurrió.

### Desde el panel

El panel tiene su propia sección, **LA FINAL**, con tres mandos:

| | |
|---|---|
| **Tiempo para abortar** | de 1 a 180 minutos. Se aplica en caliente, también con la cuenta ya corriendo |
| **`[OK] ENSAYAR VICTORIA`** | pinta la explosión en la pared |
| **`>> ENSAYAR DERROTA`** | pinta el despegue |

Los dos ensayos **se traen la proyección a la final** aunque haya otra fase
destacada: se pulsan para VERLO, y no servirían de nada si la pared siguiera en
otro sitio. Se marcan con un rótulo `ENSAYO` en la esquina —quien gobierna el
evento tiene que poder decir de un vistazo si lo que hay en la pared ya pasó o
lo acaba de pulsar él— y se caen solos a los veintidós segundos. `PARAR ENSAYO`
los corta antes.

Nada de esto toca el juego: no sella tiempos, no resuelve nada y no saca a nadie
de su fase. El ensayo viaja **por el socket** y solo a la room de admins, porque
el panel y la proyección son dos ventanas distintas: el botón se pulsa en una y
lo que tiene que pasar, pasa en la otra.

**Ojo con volver a sembrar:** `npm run db:seed` devuelve el límite a los 30
minutos de serie, aunque lo hubieras cambiado desde el panel. El seed define el
recorrido, y eso incluye el reloj.

## Averías

Cada persona del panel tiene un botón `><!` que le provoca **la avería de su
puesto**. Es ruido a petición del que gobierna el evento:

| puesto | qué le pasa | cuánto |
|---|---|---|
| **Terminal** | el teclado se vuelve loco: la consola se escribe sola con letras y números | 3 s |
| **Pantalla** | le llueven avisos de «Conexión perdida» por toda la pantalla | 12 s |
| **Datos** | la base de datos empieza a temblar y no hay quien lea | 12 s |

**No toca nada del juego.** Ni cronómetros, ni intentos, ni estado de fase. Una
avería que penalizara sería un castigo disfrazado de broma, y el equipo no sabría
por cuál de las dos cosas va perdiendo. Queda en la bitácora como `AVERIA`.

Tres detalles que no son casualidad:

- **El tipo sale del rol que la persona tiene en ese instante**, leído de la base
  de datos y no del panel: entre que el admin mira la lista y pulsa, una mezcla de
  roles pudo cambiar quién es quién. El smoke lo comprueba mezclando y volviendo a
  disparar.
- **Los caracteres del Terminal van al mismo campo que está usando el jugador**,
  no a un adorno aparte. La gracia es que tenga que darse cuenta y limpiarlo. No
  se bloquea el envío: mandar basura no cuesta nada y descubrirlo así es parte de
  la broma.
- **Los avisos de Pantalla se pueden cerrar a mano**, pero salen cada 260 ms y
  empiezan de cuatro en cuatro: cerrar sirve para abrirse un hueco por donde
  mirar, no para ganarle a la avería. Se reparten sobre **el panel**, no sobre la
  ventana —repartidos por la ventana, en una pantalla grande la mitad caían en el
  vacío de alrededor y dejaban el texto despejado—. Se cierren o no, al terminar
  se van todos.
- **El temblor de Datos son dos movimientos a la vez**: el panel entero da un
  bandazo lento y amplio (el mareo) y por dentro cada bloque trepida rápido y
  corto, medio paso desfasado (lo que emborrona el texto). Uno solo se leía como
  un adorno en bucle; los dos juntos no se repiten.

El botón **no mira si esa persona está conectada**: la señal se manda a su
canal y punto. Si está, la sufre; si no, se pierde sin más. Es deliberado —la
alternativa era apagar el botón según una presencia que el panel puede tener
desactualizada, y un botón apagado a destiempo se lee como panel roto.

Bajo `prefers-reduced-motion` la avería de Datos **no se anula, se sustituye**:
en vez de sacudirse, se desenfoca. Estorba la lectura igual sin mover nada, que
es justo el gesto que marea.

## Ataques entre equipos

Un desplegable abajo a la izquierda, en **los tres puestos**, durante la partida.
Se abre, se elige a un rival y se le manda la avería de su puesto a cada uno de
sus tres integrantes.

```
 ┌──────────────────────┐
 │ [·] BRAVO     último │   ← al que acabas de atacar, apagado
 │ [·] CHARLIE          │
 │ [·] DELTA            │
 └──────────────────────┘
 [ ><! ATACAR │ 00:47 ]     ← el reloj, siempre a la vista
```

El daño es **el mismo que ya provoca el panel**: el teclado loco tres segundos en
Terminal, los avisos de «Conexión perdida» doce en Pantalla, la base temblando
doce en Datos. Está probado, dura poco y estorba sin impedir. Un ataque que
quitara tiempo del marcador convertiría el evento en una guerra de todos contra
todos en vez de en una carrera.

Lo que sí cambia es que **lleva remite**: al atacado le sale una banda con el
nombre de quien se lo ha hecho. Saberlo es media gracia, y la otra media es
devolvérselo.

### Las tres reglas

| | |
|---|---|
| **un ataque por minuto** | y es del **EQUIPO**, no de la persona |
| **no dos veces seguidas al mismo** | el último objetivo sale apagado y marcado |
| **solo con la partida en marcha** | en el lobby de antes y con el evento terminado no hay menú |

Que el minuto sea del equipo y no de cada uno no es un detalle de implementación:
es la misma regla que gobierna el resto del juego —nadie resuelve una fase solo—
aplicada a lo único que aquí se le puede hacer a un rival. Los tres comparten un
disparo, así que tienen que ponerse de acuerdo en a quién. Si fuera por persona,
diez equipos serían treinta ataques por minuto y el evento dejaría de ser jugable.

Lo de no repetir objetivo es lo que impide que diez equipos se conviertan en
**diez contra el que va ganando**.

### El reloj

**Va siempre en el botón**, abierto o cerrado el desplegable. Saber cuánto falta
es la mitad de la decisión, y esconderlo dentro obligaría a abrirlo para mirar
la hora.

Y **no corre con el evento en pausa**, como todos los relojes de este juego. Se
mide con el contador global de pausas: se guarda cuánto llevaba acumulado el
evento en el momento del ataque y se resta la diferencia. Así una parada de cinco
minutos no le regala el ataque a quien acaba de gastarlo ni se lo quita a quien
ya estaba esperando.

### Dónde se comprueba

**En el servidor, las tres.** El desplegable apaga los botones para que nadie
pulse en balde, pero un jugador con la consola del navegador abierta puede emitir
lo que quiera, y ahí el ataque se rechaza igual con su motivo.

El sello —hora y objetivo— se escribe **antes** de disparar las averías. Al revés,
dos pulsaciones en el mismo instante —y los tres puestos tienen el mismo botón—
se colarían las dos por el hueco entre el envío y el registro.

La lista de rivales se reconstruye en cada snapshot en vez de cachearse, porque
los nombres y los logos se cambian en caliente desde el panel: un desplegable con
el nombre viejo sería un desplegable que miente.

Todo queda en la **bitácora** como `ATAQUE`, con quién atacó a quién. Y
**reiniciar el juego borra enfriamientos y vetos**: empezar una partida con media
sala en enfriamiento, o con un objetivo vetado de la anterior, es el resto que
nadie ve hasta que alguien pulsa y le dicen que no.

## Acceso libre a las fases abiertas

Por defecto el evento es una **cadena**: una fase se desbloquea al resolver la
anterior. El panel tiene un interruptor —`[ ] ACCESO LIBRE A FASES ABIERTAS`—
que suelta esa cadena, y **viene apagado**.

Con él encendido, cualquier fase que el admin haya abierto es accesible aunque
el equipo no haya resuelto la anterior. Sirve para una demo, para una sala que
va con retraso, o para probar una fase suelta sin jugarse las cinco previas.

**Libera el prerrequisito y nada más**, y eso es lo que hay que tener claro:

| | con acceso libre |
|---|---|
| fase abierta, anterior sin resolver | **se abre** |
| fase que el admin no ha abierto | sigue cerrada (`ADMIN`) |
| fase que el equipo ya resolvió | sigue sin poder rejugarse (`COMPLETED`) |

No es un modo libre: es quitar una cadena. Encenderlo o apagarlo **repinta los
lobbies al instante** —si hubiera que recargar, la opción no serviría de nada en
sala— y no toca ningún reloj ya sellado. El interruptor se ve encendido desde el
otro lado de la mesa a propósito: cambia cómo se comporta el evento entero y es
fácil olvidarse de apagarlo. Cada cambio queda en la bitácora como
`ACCESO_LIBRE`.

El `availableAt` de cada equipo —el instante en que de verdad pudo entrar, que
es con lo que se audita una reclamación del ranking— se sella también bajo
acceso libre. Sin eso, una fase jugada en este modo se quedaría sin ese dato.

## La pantalla de victoria

Al resolver una fase, el servidor emite `phase:solved` a la room del **equipo**,
no a la de un rol: la cortinilla sale **a pantalla completa en los tres puestos a
la vez**. La fase se gana entre los tres, así que el momento tiene que ser común
— si solo lo viera quien teclea, los otros dos se enterarían de su propia
victoria por el vecino.

Lleva el rótulo, el título de la fase, el tiempo oficial y los intentos
fallidos.

**Volver al lobby es un acto de equipo**, igual que entrar: quien pulsa el botón
se lleva a los otros dos. El servidor ya mandaba el `workspace:update` a la room
del equipo entero; lo que faltaba era bajar la cortinilla en las tres pantallas,
porque si no, quien no pulsó se quedaba mirando la victoria por encima de un
lobby que ya tenía debajo y no podía tocar. Un ensayo del panel es la excepción:
ese lo cierra cada uno, porque no saca a nadie de ninguna parte. La rotulación va en `clamp()` y no en tamaños fijos: la misma pantalla
tiene que leerse en el portátil del jugador y en el proyector de la sala.

**Sin glitch, a propósito.** En este sistema visual la avería significa fallo —se
dispara al mezclar roles— y esto es lo contrario: aquí el tubo se estabiliza.

### Ensayarla desde el panel

La victoria es lo único del juego que no se puede ver sin jugar una fase entera,
y el día del evento no vale «resolvemos la primera a mano para comprobar que se ve
bien». El panel tiene dos botones:

- **`[OK] ENSAYAR VICTORIA (TODOS)`**, junto a mezclar roles.
- **`[OK]`** en la cabecera de cada equipo, para lanzarla solo a ese.

El ensayo se ve **exactamente igual** que una victoria real —para eso es un
ensayo— con una sola diferencia: una chapa azul que dice `ENSAYO DEL PANEL · no
se ha guardado ningún tiempo`. Nadie en la sala puede confundirlos.

Y no toca nada: no sella tiempos, no marca ninguna fase `SOLVED`, no cierra el
monitor de tráfico y **no saca a nadie de la fase que esté jugando** — cerrar una
victoria real devuelve al lobby, cerrar un ensayo solo baja el telón. Si sellara
tiempos, probar la pantalla en mitad del evento falsearía el ranking de quien la
estuviera jugando. Queda una entrada `CELEBRACION_ENSAYO` en la bitácora, porque
alguien verá esa pantalla en la sala y preguntará por qué.

### Añadir una fase nueva

Los módulos se llaman por su concepto, no por su número (`acceso.ts`,
`muro.ts`, `nucleo.ts`…): el orden lo fija el seed, y una fase que se recoloca
no debería obligar a renombrar un archivo.

1. Crea `server/src/phases/<concepto>.ts` implementando `ModuloFase`
   (`proyectar` por rol + `ejecutar` comandos). Los constructores de bloques y
   la cuarentena están en `phases/comun.ts`.
2. Regístralo en `server/src/phases/index.ts` — una línea.
3. Siémbralo en `prisma/seed.ts` con su `key` y su `order`. El seed vacía los
   huecos antes de repartirlos, así que recolocar fases no lo rompe.

El motor (`realtime/commands.ts`) no necesita ningún cambio: valida permisos,
registra y reparte; el contenido lo pone el módulo. Las seis fases del recorrido
se añadieron sin tocar una sola línea del motor, que es la prueba de que el
contrato aguanta.

Si la fase necesita un flujo continuo hacia Pantalla, el comando devuelve
`flujo: { accion: 'iniciar', intervaloMs, peticiones, bucle, filtro }` y del
reloj, del sellado, del filtrado y de las paradas se encarga
`realtime/trafico.ts`. Si no lo necesita —como la Fase 2— basta con no
devolver `flujo`.

**Lo que hay que vigilar al diseñarla**, aprendido a base de romperlo dos veces:
ningún comando de la Terminal puede nombrar por su cuenta algo que solo debería
saber el Operador de Datos, **ni siquiera en un ejemplo de la ayuda o en un
mensaje de error**. Las dos fases tienen un test dedicado a esa invariante
(«ningún comando nombra una cuenta / una máquina»), y en las dos cazó una fuga
real escrita sin darse cuenta.

## El sonido

Todo suena, y **nada es un archivo de audio**: se sintetiza en el navegador con
Web Audio, un cuadrado, un triángulo y ruido blanco. Tres motivos, y ninguno es
la nostalgia:

- El tubo es de 1983. Eso suena a eso; un wav grabado suena a otra cosa.
- El front lo sirve Vercel y la API vive detrás de un túnel casero. Medio mega
  de audio por pestaña, con treinta portátiles conectándose a la vez, es justo
  el peso que no hay que meter en esa red.
- No hay nada que precargar, así que el primer sonido del evento no llega tarde
  por estar descargándose.

### Qué suena

| dónde | cuándo |
|---|---|
| **Terminal** | cada tecla (un chasquido de nada), enviar un comando, y el rechazo |
| **Pantalla** | el veredicto del sistema, cada petición del ataque, cada golpe del ariete y cada choque del pasillo |
| **Datos** | abrir una tabla |
| **los tres puestos** | entrar y salir de una fase, la mezcla de roles, la avería, la fase resuelta, la pausa |
| **panel** | cada acción, y el aviso de acierto o de error |
| **carrera** | una barrera pasada, y la meta con otra cosa |
| **proyección** | el cambio de canal, el zumbido de la sala y la estática de las averías |
| **la final** | el último minuto tic a tic, el rugido del despegue y el estallido en tierra |

El veredicto de un comando suena **en Pantalla, no en la consola**, igual que se
ve: quien teclea lo hace a ciegas, y darle el resultado por el oído le devolvería
lo que el juego le quita a propósito.

Dos cosas se miden en vez de repetirse:

- **El zumbido de la sala sube con la fase**, con la misma escala que las
  averías visuales: en la primera es un hilo y en la final se oye que el aparato
  está para el arrastre.
- **La estática se clava a la animación de verdad.** Se le pregunta al navegador
  por dónde va el ciclo del CSS y se suena en los dos instantes exactos en que
  la imagen se rompe. Con un temporizador propio la deriva llegaba a medio
  segundo, y un chasquido con la imagen limpia se nota.

Y el tic de la cuenta atrás **solo entra en el último minuto**, agudizándose en
los últimos diez segundos. Un tic por segundo durante media hora deja de ser
tensión y pasa a ser un grifo.

### El interruptor, y el portero del navegador

Cada pantalla tiene el suyo en el renglón de estado, y **se recuerda en ese
navegador**. Importa: en la sala hay treinta portátiles, y quien quiera el suyo
callado no debería tener que pedirlo.

Los navegadores no dejan sonar nada hasta que alguien toca la página. Eso es un
problema concreto de **la proyección**, que se arrastra al segundo monitor y
nadie vuelve a pulsar: sin avisar, el operador da el sonido por roto. Así que:

- el interruptor del renglón de estado pasa a `[!] SONIDO` y parpadea en azul;
- la proyección enseña además un `[!] ACTIVAR SONIDO` entre sus mandos, y el
  propio botón sirve de gesto para desbloquearlo.

El e2e comprueba la correspondencia, que es lo que puede mentir: hay aviso
**exactamente cuando** no ha sonado nada. Si el navegador viene ya desbloqueado
—porque el operador lleva un rato en el panel— no hay aviso y sí hay sonido.

Todo el módulo es **a prueba de fallos**. Un navegador sin audio, un dispositivo
ocupado o una política rara no pueden tumbar una pantalla en mitad del evento:
si algo revienta, se traga el error y el juego sigue mudo.

## Las luces de la sala

Hay un Arduino con emisores infrarrojos apuntando a las tiras de LED y al
reflector, y la carpeta `Luces/` con su propio servidor en Python. Eso **se queda
como está** y desde aquí no se reimplementa: las ondas son trabajo manual de una
tarde con un mando en la mano, tienen sus respaldos, y el puerto serie es un
recurso único que allí ya está bajo candado.

Lo que se añade es lo único que el otro lado no puede hacer: **saber qué acaba de
pasar en el evento** y traducirlo a «manda este código por este pin».

| capa | de qué responde |
|---|---|
| este servidor | qué pasó y qué luz le toca — **las reglas** |
| `Luces/` | cómo se emite una onda — el actuador |
| Arduino | la luz — el músculo |

### Arrancarlo

Son **dos procesos**, y conviene saberlo antes del evento y no durante:

```bash
cd server && npm run dev            # el juego, como siempre
cd server && npm run luces          # el actuador IR (autodetecta el puerto)
# npm run luces:sin-placa           # sin Arduino, para editar reglas y botones
```

Si el segundo no está, la pestaña lo dice con su motivo y **el juego sigue igual**.
El destino se cambia con `LUCES_URL` (por defecto `http://127.0.0.1:8000`).

### La pestaña

`>> LUCES` en la barra del panel, o `…/#luces`. Tres secciones, en el orden en
que se usan:

1. **LA PLACA.** Si está conectada y por dónde. Los pines de emisión por defecto
   como nueve interruptores, y los tres diagnósticos: *probar si sale luz*
   —emite un patrón que no significa nada y mira si el receptor lo oye—,
   *identificar con la cámara* —portadora continua, para encontrar un LED a ojo
   con el móvil— y *nivel del receptor*.
2. **AUTOMATIZACIÓN.** Las reglas. Es lo nuevo.
3. **BOTONES.** Los 27 ya capturados, cada uno con su envío a mano, más el alta
   de uno nuevo: *aprender del control*, *probar sin guardar*, portadora,
   repeticiones, pausa y pines. Las mismas opciones que tenía la interfaz de
   Luces, dentro del panel.

Y debajo, la **BITÁCORA**: qué luz saltó, por qué acción y si salió. Es la única
forma de saber que una regla se cumplió sin estar mirando la tira de LEDs.

### Las reglas

Una regla se lee de izquierda a derecha como una frase:

```
 [X]  Un equipo pasa una fase   [ALFA]  ->  LEDs - Rojo   pin 3   [ENSAYAR] [BORRAR]
```

Las quince acciones a las que se puede colgar una luz:

| | |
|---|---|
| del evento | arranca · se pausa · se reanuda · se termina |
| de las fases | el admin abre · cierra · destaca una |
| de los equipos | **pasa una fase** · llega a la meta |
| de la final | arranca la cuenta atrás · se aborta el lanzamiento · despega el cohete |
| lo demás | se mezclan los roles · avería del panel · un equipo ataca a otro |

- Las que **las provoca un equipo** se pueden acotar a uno: «cuando ALFA pase una
  fase» es distinto de «cuando alguien pase una fase». Las demás tienen el
  desplegable de equipo apagado, porque no hay equipo que poner.
- Los **pines son opcionales**. Vacío significa «los que diga el botón», que es
  el caso normal: el botón dice QUÉ señal mandar y los pines dicen POR DÓNDE.
- Se **desactivan sin borrarse**, para tener una regla preparada y encenderla en
  el momento.
- `ENSAYAR` la emite ahora, sin esperar a que pase su acción. Es lo que se usa
  para dejarlo montado la tarde de antes.

### Una luz no para el juego

Regla de oro de todo el módulo. Si el servidor de Luces está caído, el Arduino
desenchufado o la onda tarda tres segundos, **el evento sigue exactamente igual**:

- El disparador **no devuelve promesa**. Quien abre una fase o la resuelve no
  espera a una tira de LEDs, y sobre todo no falla porque ella falle.
- Las emisiones van **en cola, de una en una**. El puerto serie es uno: si diez
  equipos resuelven a la vez, diez peticiones simultáneas se pelean y la última
  espera por todas. Y la cola tiene tope: pasado ese punto se descartan las
  nuevas, porque más vale perder una luz que tener el aparato emitiendo cosas de
  hace un minuto. Lo descartado sale en la bitácora.
- Cada llamada al actuador tiene **tiempo límite**. Importa más de lo que parece:
  *aprender del control* se queda esperando a que alguien apunte un mando, y sin
  un tope explícito una petición colgada se lleva por delante el manejador del
  socket que la lanzó.

### Dos cosas que hubo que resolver

**`FINAL_DERROTA` no la provoca nadie.** Pasa cuando un reloj llega a cero. La
proyección lo deduce sola en el navegador, pero una luz la enciende el servidor,
así que hace falta alguien mirando. Es un vigía que pregunta cada dos segundos, y
solo mientras la final está abierta y sin resolver. Un temporizador de treinta
minutos habría que rehacerlo cada vez que el admin cambia el límite o pausa el
evento; preguntar se lleva las dos cosas gratis.

**Borrar un botón no borra sus reglas: las desactiva.** Así se ve que quedaron
huérfanas y por qué dejaron de funcionar, en vez de desaparecer sin dejar rastro.
El nombre del botón va **copiado** en la regla por lo mismo: aunque el botón ya no
exista en Luces, la regla se sigue pudiendo leer.

### Un truco para el montaje

`PROBAR SI SALE LUZ` sirve para saber **qué pines tienen LED de verdad**. El
receptor está en la misma placa que los emisores, así que siempre debería oír lo
que sale; un eco en cero significa que por ese pin no salió luz. En la placa de
este evento, por ejemplo, emiten el 2, 5, 7, 8, 9 y 10, y el 3, 4 y 6 están
libres. Un pin libre también sirve: es por donde se prueban las reglas sin
encenderle las luces a la sala.

## Estética

Todas las pantallas usan el mismo sistema visual que
[undefinedclub.org/hackmethon](https://www.undefinedclub.org/hackmethon): un tubo
de rayos catódicos de fósforo rosa, duotono con un segundo cañón azul. Los
identificadores de color, el rayado, la aberración cromática y la geometría del
mueble están tomados de esa hoja para que el sitio y las pantallas del evento se
lean como el mismo aparato.

- **Tipografías servidas en local** (`client/public/fonts`, subconjuntos latin y
  latin-ext, 283 KB). La sala puede quedarse sin internet y la rotulación no debe
  cambiar a mitad de partida.
- **Los tres roles dentro del duotono**: Terminal en rosa relleno, Pantalla en
  rosa pálido, Datos en contorno azul. Se distinguen a distancia y en proyector.
- **Sin emoji.** Los candados y los iconos van en ASCII (`[+]`, `[X]`, `[OK]`,
  `><`): un emoji trae su propio color y rompería el duotono.
- **Glitch en dos intensidades.** El ambiental es el de la referencia, casi
  imperceptible. El de fallo se dispara solo al mezclar roles: sacudida,
  separación de canales, desgarro, estática y dos pérdidas de sincronía, con el
  rótulo del puesto saltando entre basura y los tres roles antes de estabilizarse.
- **`prefers-reduced-motion`** apaga todo el movimiento. Un evento con proyector
  es justo donde alguien puede marearse.

Las perillas están en `client/src/index.css`: `--glitch` escala la avería (0 la
apaga), `--curva` el abombado del tubo y `--marco` el grosor del mueble.
