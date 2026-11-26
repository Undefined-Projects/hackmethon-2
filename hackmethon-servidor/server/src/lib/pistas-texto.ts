// ============================================================
//  Los textos de las pistas: por fase, por capa, tres niveles con tres
//  pistas cada uno (ver `pistas.ts`). Español de México, con «ustedes».
//  Nunca un valor de una mesa concreta: cada mesa juega su versión.
// ============================================================

import type { CatalogoPistas } from './events.js';

export const PISTAS: CatalogoPistas = {
  "fase-2-enemigo": {
    capas: [
      {
        nombre: "EL SEMILLERO",
        sutil: [
          "Nada se mueve hasta que alguien lo manda. Pantalla, ¿qué ven ustedes que Terminal no puede ver? Terminal, ¿ya leyeron `ayuda`?",
          "La flecha tiene su propia izquierda. ¿Hacia dónde apunta justo cuando llega a la vuelta?",
          "El brote no olvida lo que ya le escribieron. ¿Qué dice su bitácora del último paso?",
        ],
        normal: [
          "Pantalla dicta el camino por tramos; Terminal escribe una instrucción por línea (`avanzar`, `girar izquierda`, `girar derecha`) y al final `lanzar`. Antes de eso, el brote no brota.",
          "Izquierda y derecha son las del brote, no las de la pantalla. Pantalla, dicten los giros desde la vista grande, que mira con sus ojos; el `manual` de Datos lo explica.",
          "El programa se queda tras cada lanzamiento: no lo escriban otra vez encima. Datos, la tabla `brote` dice en qué línea falló; corríjanla con `cambiar` o `borrar`.",
        ],
        obvia: [
          "Pantalla, cuenten las casillas hasta cada vuelta. Terminal, escriban un `avanzar` por casilla y el `girar` de cada vuelta, en orden, y luego `lanzar`. Datos, lean el programa en voz alta.",
          "Si la flecha baja por el plano, su derecha es la izquierda de ustedes. Si chocó en una vuelta, ese giro va al revés: `cambiar n girar derecha` (o `girar izquierda`), con n la línea del giro.",
          "Datos, el último renglón de `brote` dice la línea que falló. Terminal: `cambiar n avanzar` para arreglarla, `borrar n` si sobra o `borrar todo` para empezar limpio. Luego `lanzar`.",
        ],
      },
      {
        nombre: "EL SETO",
        sutil: [
          "Diez líneas no alcanzan para un camino tan largo. Pantalla, ¿hay un tramo del seto que se dibuje igual varias veces seguidas?",
          "El plano no lo dice todo. Datos, ¿por qué casillas pasa el camino que eligieron?",
          "Si el brote se marchita a medio ciclo, ¿en qué vuelta iba? Datos, la columna `vuelta` de la bitácora lo cuenta.",
        ],
        normal: [
          "Usen un ciclo: el tramo que se repite se escribe UNA vez entre `repetir N veces` y `fin`, y N es cuántas veces aparece. El `repetir` y su `fin` cuentan como dos líneas.",
          "Hay tres caminos con forma de ciclo y espinas que el plano pinta como camino. Datos, lean cada casilla de `espinas` (letra = columna, número = fila) y Pantalla búsquenla antes de elegir.",
          "Dentro del ciclo el orden importa: si la escalera arranca girando, el giro va primero; si arranca recto, primero los `avanzar`. Datos, sigan la línea encendida para ver dónde se tuerce.",
        ],
        obvia: [
          "Pantalla, en una escalera cuenten las casillas entre giro y giro y cuántos escalones tiene. Terminal: `repetir N veces` (N escalones), un escalón (sus `avanzar` y sus dos giros) y `fin`.",
          "La L y una de las dos escaleras tienen espinas. Datos, dicten cada casilla de `espinas`; Pantalla, ubíquenlas en el plano. El camino bueno es la escalera donde no cae ninguna.",
          "Si chocó en la primera vuelta, el orden de adentro está mal: si la escalera empieza girando, la línea 2 es el `girar`; si empieza recto, es `avanzar`. Corrijan con `cambiar 2 …` y `lanzar`.",
        ],
      },
    ],
  },
  "fase-1-acceso": {
    capas: [
      {
        nombre: "LA RÓTULA",
        sutil: [
          "Antes de escribir nada, miren el filtro azul que ya está en el flujo. ¿A quién deja fuera? Las corridas de Datos lo saben.",
          "A la tabla de Datos le faltan dos rasgos de cada programa. ¿Quién de ustedes puede verlos y quién puede pedirlos?",
          "Cuatro anticuerpos y pocos huecos. ¿Hay algún rasgo que compartan dos de ellos y ninguna espora?",
        ],
        normal: [
          "La defensa azul es de la pierna y frena a sus esporas. Terminal, quítenla con `quitar` y su número; luego `probar`, y Datos revisa la corrida.",
          "Datos tiene tipo y permisos; el origen lo ve Pantalla en la cámara y la firma la pide Terminal con `firmas tipo <tipo>`. Junten todo en una sola lista.",
          "Con 3 filtros no caben 4 nombres. Busquen una firma que solo tengan anticuerpos y tiren a dos de golpe; a los otros, nómbrenlos. Ojo: `!=` puede tirar a una espora.",
        ],
        obvia: [
          "Terminal, escriban `quitar 1` (la defensa azul es el filtro 1) y luego `probar`. Datos, en `resultados` confirmen que sus esporas ya dicen PASA.",
          "Datos, dicten los tipos del registro. Terminal, escriban `firmas tipo <tipo>` por cada uno. Pantalla, apunten de dónde viene cada nombre al cruzar la membrana.",
          "Terminal: `filtrar si firma = <firma que solo tienen anticuerpos>`, `filtrar si nombre = <anticuerpo>` y otro igual para el último. `probar`, revisen y `desplegar`.",
        ],
      },
      {
        nombre: "LA MUDA",
        sutil: [
          "La pierna mudó la piel. Miren el principio del flujo: ¿hay algo azul que antes no estaba? ¿A quién de los suyos frena?",
          "No confíen en lo que sabían de la rótula. ¿Alguien cambió de bando? ¿Quién acaba de llegar y qué no saben aún de ellos?",
          "Si cae quien no debe, ¿qué rasgo lo separa de los anticuerpos que ese mismo filtro sí tenía que tirar?",
        ],
        normal: [
          "La muda levantó una defensa nueva al inicio del flujo y frena a dos de sus esporas. Terminal, quítenla con `quitar` y su número, y `probar` antes de seguir.",
          "Datos, relean el encargo: un programa de rutina ahora es anticuerpo y llegaron seis nuevos. Pantalla, apunten su origen; Terminal, pidan sus firmas con `firmas`.",
          "Ya no hay nombres: describan con `y`, juntando tipo, origen, permisos y firma hasta que solo caigan anticuerpos. `cae_en_filtro` dice qué condición tira de más.",
        ],
        obvia: [
          "Terminal: `quitar 1` (la defensa nueva queda primero), luego `flujo` para ver qué sobrevivió y `probar`. Datos, revisen en `resultados` que sus esporas pasen.",
          "Datos, dicten los ids marcados como nuevos. Terminal: `firmas <id>` por cada uno. Pantalla: anoten de dónde viene cada nuevo al cruzar. Datos lo suma a su lista.",
          "Un filtro por familia: `filtrar si tipo = <t> y permisos >= <n>` (o `<=`, copien la tabla), y sumen `y origen = <o>` o `y firma = <f>` hasta que solo caigan anticuerpos. Máx. 4.",
        ],
      },
    ],
  },
  "fase-4-nucleo": {
    capas: [
      {
        nombre: "PARTE 1",
        sutil: [
          "Cada .fn nace oculto en [ ??? ]. Datos, en `resultados` ya está lo que cada función recibe y lo que devuelve: ¿qué operación convierte una cosa en la otra?",
          "En cada torre hay un guardián y una raíz que nadie vigila. Pantalla, cuando armen una pieza, lean qué comprueba… y qué se le olvidó comprobar.",
          "Crecer poco no rompe nada y crecer de más quema. Datos, ¿entre qué dos números de `tolerancias` tiene que caer cada salida?",
        ],
        normal: [
          "Base/ se arma solo con su operación; medio/ dice a quién llama: `armar <pieza> llama <hija> luego <operacion>`. Datos les canta los números de `resultados`.",
          "Hay que engañar la pieza cuyo retorno nadie comprueba. Si `probar` dice BLOQUEADO, cambien de pieza: busquen en Pantalla las líneas de «mala practica».",
          "Corran `probar` (es gratis) y que Pantalla cante cada salida. Datos la compara con `tolerancias`: debe pasar `aguanta_max` y quedar debajo de `fusible_corte`.",
        ],
        obvia: [
          "Terminal, escriban `armar presion llama carga luego x + 5`, `armar pulso n * 3` y `armar freno n - 2`. Así cada cadena tiene una pieza armada.",
          "Las piezas sin guardián son `presion`, `pulso` y `freno`. Escriban `enganar presion x + K`, `enganar pulso n + K` y `enganar freno n + K`, cambiando cada K por un número.",
          "Con esos K: M1 da (10+K)×2, M2 da 9+K y M3 da 11+3K. Elijan K para quedar arriba de `aguanta_max` y abajo de `fusible_corte` de Datos; `probar` y luego `ejecutar`.",
        ],
      },
      {
        nombre: "PARTE 2",
        sutil: [
          "La máquina se curó a medias. Datos, lean `parche_emergencia`; Pantalla, busquen las líneas [PARCHE P2]. Donde cerró una herida, ¿cuál dejó abierta?",
          "El parche borró sus sabotajes y las grietas cambiaron de lugar. ¿Qué piezas de las nuevas grietas todavía no han armado?",
          "Dos torres comparten ahora una misma raíz. Si M3 se dispara sin que la tocaran, ¿de dónde le llega esa savia?",
        ],
        normal: [
          "El parche tapó `presion`, `pulso` y `freno`, pero abrió otros huecos. Datos, la columna `mala_practica_del_parche` dice qué quedó sin vigilar en cada torre.",
          "Solo se engaña lo armado. Armen las piezas nuevas (base/ solo con operación, medio/ con `llama <hija> luego`). Al engañar usen `n` en base/ y `x` en medio/.",
          "`flujo` ahora suma `freno(n) + carga(n)`: lo que suban `carga` para M1 también sube M3. Corran `probar` y compensen engañando también a `flujo`.",
        ],
        obvia: [
          "Las piezas abiertas son `carga`, `valvula` y `flujo`. Si les falta alguna: `armar carga n * 2`, `armar valvula llama pulso luego x - 3`, `armar flujo llama freno luego x * 3`.",
          "Escriban `enganar carga n * K` y `enganar valvula x + K`. M1 da (5K+5)×2 y M2 da 24+K. Elijan cada K para quedar entre `aguanta_max` y `fusible_corte` de Datos.",
          "`flujo` recibe 3 + carga(5). Con `enganar flujo x + K` (o `x - K`) se quita el ×3 y M3 da carga(5) - 1 ± K. Ajusten K con `probar` y luego `ejecutar`.",
        ],
      },
    ],
  },
  "fase-mano-listas": {
    capas: [
      {
        nombre: "LAS FALANGES",
        sutil: [
          "¿Todos mis dedos son iguales? Datos guarda algo de cada uno que Pantalla no puede ver.",
          "Cada falange tiene dos caras, y Pantalla solo mira una a la vez. ¿Cuál cara importa en cada dedo?",
          "Un número y un texto pueden verse idénticos y aun así no ordenarse igual. ¿Qué va primero, «10» o «9»?",
        ],
        normal: [
          "Cada dedo tiene un TIPO DE DATO. Datos, lean la tabla dedos y luego la tabla tipos: les dice qué cara manda en cada dedo.",
          "Terminal, cambien de cara con `camara 1` (frente) y `camara 2` (reverso). Pantalla, anoten ambas: el reverso va en espejo, guíense por el número de dedo.",
          "En los dedos tipo texto se compara carácter por carácter: «10» va antes que «9». De menor a mayor, de la base (0) a la punta (2).",
        ],
        obvia: [
          "Datos, dicten la tabla dedos: numero se ordena por el FRENTE (`camara 1`); texto, por el REVERSO (`camara 2`). Anoten qué cara toca a cada dedo, del 0 al 4.",
          "Terminal, escriban `camara 2`. Pantalla, lean el reverso dedo por dedo por su número, no por su lugar: está en espejo. Anoten las falanges 0, 1 y 2 de cada dedo.",
          "Ordenen cada dedo en papel y muevan con `intercambiar <dedo> <i> <j>`, contando desde 0. Usen `probar` hasta ver 5 de 5 y entonces `apretar`.",
        ],
      },
      {
        nombre: "LOS TENDONES",
        sutil: [
          "Antes de mover un solo tendón, ¿saben cómo debe verse la fila cuando la mano ya esté suelta?",
          "Datos sabe qué es cada letra; Pantalla sabe dónde está. ¿Cómo junta el equipo esas dos mitades?",
          "Los intercambios se acaban rápido. ¿Cada movimiento deja algún tendón donde ya no tendrá que moverse?",
        ],
        normal: [
          "Es un orden con DOS CRITERIOS: primero por dedo y, dentro del mismo dedo, por tensión. Datos, escriban con su tabla la fila final completa, del 0 al 11.",
          "Terminal, escriban `tendones`: muestra cada letra con su índice, del 0 al 11. Pantalla, díctenlo y compárenlo con la fila final de Datos.",
          "Vayan lugar por lugar: busquen el tendón que va en el 0 y llévenlo ahí, luego el 1, y así. Si se acaban los intercambios, `reiniciar` los devuelve.",
        ],
        obvia: [
          "Datos: agrupen las letras por dedo (pulgar, índice, medio, anular, meñique) y en cada grupo pongan la menor tensión primero. Esa es la fila final, del 0 al 11.",
          "Terminal, escriban `tendones`. Pantalla, dicten índice y letra; Datos, marquen qué letra está en cada lugar y cuál debería estar ahí.",
          "Para cada lugar i, del 0 al 11: si la letra no es la que va, busquen en qué lugar j está la correcta y escriban `intercambiar i j`. Al final, `soltar`.",
        ],
      },
    ],
  },
  "fase-5-boveda": {
    capas: [
      {
        nombre: "EL EMBUDO",
        sutil: [
          "Terminal pregunta a ciegas. Datos, ¿qué columnas y qué valores trae su diccionario? ¿Y qué pide cada línea del encargo?",
          "Lean despacio la línea de la emoción en el encargo. ¿Pide las dos a la vez, o le basta con una de ellas?",
          "«Después de» y «o más» no dicen lo mismo: ¿el número del encargo entra o se queda fuera? Y antes de abrir, ¿cuántos recuerdos quedan?",
        ],
        normal: [
          "Cada requisito del encargo es una condición: columna, operador y valor. Terminal, empiecen con `contar en recuerdos donde ...` y sumen una condición a la vez con `y`.",
          "La emoción es un O, y la memoria resuelve `y` antes que `o`. Encierren las dos emociones entre paréntesis para que el O no se trague las demás condiciones.",
          "«Después de» es `>` y «o más» es `>=`. Cuando `contar` dé 1, usen `buscar` para ver su id y luego `abrir`. Abrir uno equivocado cierra la bóveda un rato.",
        ],
        obvia: [
          "Datos, dicten el encargo. Terminal, escriban `contar en recuerdos donde lugar = <lugar>` y luego agreguen `y intensidad >= <número>`, con los valores del encargo.",
          "Escriban la emoción así, con espacios: `( emocion = <emoción1> o emocion = <emoción2> )` y únanla a lo demás con `y`. Las dos emociones las tiene Datos en el encargo.",
          "Terminal: `buscar en recuerdos donde lugar = <lugar> y ( emocion = <e1> o emocion = <e2> ) y año > <año> y intensidad >= <n>`. Sale uno: `abrir <su id>`.",
        ],
      },
      {
        nombre: "EL RECUERDO COMPARTIDO",
        sutil: [
          "El oficio no vive en los recuerdos. Datos, ¿qué columna de `recuerdos` apunta hacia otra tabla?",
          "¿Quién guarda más recuerdos del tipo del encargo? El encargo avisa que quien más aparece no es del oficio. ¿Ya lo dejaron fuera?",
          "Ya saben de quién es. Relean el último requisito del encargo: ¿su recuerdo más intenso tiene que ser del mismo tipo?",
        ],
        normal: [
          "`persona_id` es una clave foránea: apunta a `personas`, donde está el oficio. Para usar `oficio` o `nombre`, agreguen `unir personas` justo después de `en recuerdos`.",
          "Para saber quién aparece más, cuenten por grupo: `contar` con `agrupar por nombre`, filtrando por el tipo Y el oficio del encargo. El primer grupo es el que más tiene.",
          "El más intenso de esa persona, de cualquier tipo: quiten la condición de tipo, `buscar` por su nombre y ordenen por intensidad de mayor a menor, limitando a 1.",
        ],
        obvia: [
          "Terminal, escriban `contar en recuerdos unir personas donde oficio = <oficio>`, con el oficio que les dicta Datos del encargo. Si ya no sale error, la unión funciona.",
          "`contar en recuerdos unir personas donde tipo = <tipo> y oficio = <oficio> agrupar por nombre`. Pantalla, dicten el nombre del primer renglón: esa es la persona.",
          "`buscar en recuerdos unir personas donde nombre = <nombre> ordenar por intensidad desc limitar 1`, sin condición de tipo. Luego `abrir <su id>`.",
        ],
      },
    ],
  },
  "fase-6-puente": {
    capas: [
      {
        nombre: "LAS DEFENSAS",
        sutil: [
          "Sin decir quiénes son, la mente no escucha a nadie. Datos, ¿qué endpoint va primero? ¿Y qué trajeron de la bóveda?",
          "¿Cómo va a destruir Terminal algo cuyo nombre no conoce? Antes de atacar, conviene preguntarle a la mente qué tiene vivo.",
          "Cada rebote trae un número. Pantalla, cántenlo; Datos, búsquenlo en la tabla de códigos: les dice justo qué corregir.",
        ],
        normal: [
          "Primero se pide acceso: POST a /mente/sesion con la clave de la tabla acceso en el cuerpo. La respuesta trae un token; Pantalla lo dicta.",
          "El token va en la cabecera de todo lo demás. GET /mente/procesos les da los ids; luego DELETE /mente/procesos/<id> por cada facultad.",
          "¿422? Esa facultad tiene blindaje: manden fuerza en el cuerpo, igual o mayor. ¿403? El token caducó: pidan acceso otra vez. ¿429? Esperen.",
        ],
        obvia: [
          "Terminal, escriban `enviar POST /mente/sesion cuerpo clave=<clave>` con la clave que Datos lee en la tabla acceso. Pantalla, dicten el token.",
          "Terminal: `enviar GET /mente/procesos cabecera token=<token>`. Con cada id que dicte Pantalla: `enviar DELETE /mente/procesos/<id> cabecera token=<token>`.",
          "Con blindaje: `enviar DELETE /mente/procesos/<id> cabecera token=<token> cuerpo fuerza=5`. ¿403? Repitan el POST a /mente/sesion. ¿429? Esperen 6 s.",
        ],
      },
      {
        nombre: "EL ÚLTIMO PENSAMIENTO",
        sutil: [
          "La voluntad no se deja golpear de frente. Datos, lean las rutas nuevas en orden: ¿qué pide la mente antes de bajar la guardia?",
          "Ni el reto ni el escudo duran para siempre. ¿Quién del equipo avisa cuándo cambian? Repártanse los ojos y la voz.",
          "Cuando la mente grita, algo que ya tenían deja de servir. Miren qué código responde ahora y qué paso les toca repetir.",
        ],
        normal: [
          "Es una conversación de tres pasos: GET /mente/nucleo/reto, luego PATCH /mente/nucleo con escudo=abajo y el reto en el cuerpo, y al final golpear.",
          "El reto cambia cada 45 s (si sale 400, pidan otro) y el escudo baja solo 25 s. Golpeen con DELETE /mente/nucleo y fuerza de 1 a 25 en el cuerpo.",
          "A los 75, 50 y 25 de vida la mente invalida el token y sube el escudo (403, 423). Pidan acceso otra vez y repitan reto, escudo y golpe.",
        ],
        obvia: [
          "Terminal: `enviar GET /mente/nucleo/reto cabecera token=<token>`; con el reto que dicte Pantalla: `enviar PATCH /mente/nucleo cabecera token=<token> cuerpo escudo=abajo reto=<reto>`.",
          "Con el escudo abajo: `enviar DELETE /mente/nucleo cabecera token=<token> cuerpo fuerza=25`. No manden más de 4 peticiones en 8 s.",
          "Tras cada contraataque: `enviar POST /mente/sesion cuerpo clave=<clave>`, y otra vez reto, PATCH y DELETE con fuerza=25. Cuatro vueltas y la mente se apaga.",
        ],
      },
    ],
  },
  "fase-bonus-corazon": {
    capas: [
      {
        nombre: "REINICIAR",
        sutil: [
          "Antes de arreglar un corazón, hay que saber qué necesita para latir. ¿Hay algún archivo que diga qué hace el arranque, paso a paso?",
          "Una copia vieja puede salvarlo… o no. ¿Cómo sabrían cuál está sana sin probarla? Datos guarda una pista en su manual.",
          "Ya saben cuál es la buena. Ahora, ¿dónde debe vivir para que el arranque la encuentre? AUTOEXEC.BAT ya lo dijo.",
        ],
        normal: [
          "Terminal, usen DIR para ver carpetas y TYPE para leer archivos. Lean AUTOEXEC.BAT y luego el MARCAPASO.SYS de C:\\CORAZON: está dañado.",
          "En C:\\RESPALDO hay una carpeta por año, cada una con su MARCAPASO.SYS. Léanlos con TYPE y comparen su SUMA con la tabla de verificación de Datos.",
          "Copien el respaldo sano con COPY origen destino a C:\\CORAZON y luego escriban ARRANCAR. Si arrancan con el marcapasos dañado, hay cuarentena.",
        ],
        obvia: [
          "Terminal, escriban `DIR` y luego `TYPE AUTOEXEC.BAT`. Después `TYPE C:\\CORAZON\\MARCAPASO.SYS`: Pantalla verá que está dañado.",
          "Escriban `DIR C:\\RESPALDO` y luego `TYPE C:\\RESPALDO\\<año>\\MARCAPASO.SYS` con cada año. Pantalla dicta la SUMA; Datos dice cuál coincide.",
          "Con el año bueno, escriban `COPY C:\\RESPALDO\\<año>\\MARCAPASO.SYS C:\\CORAZON` y luego `ARRANCAR`. Cambien <año> por el que coincidió.",
        ],
      },
      {
        nombre: "EL VIRUS",
        sutil: [
          "Late, pero algo lo acelera desde dentro. ¿Dónde vive lo que le dice cómo latir? Ahí empieza la búsqueda.",
          "No todo lo que se parece al virus lo es. Cada línea, ¿cumple de verdad alguna firma de Datos, o solo se le parece?",
          "Apagar el síntoma no cura. ¿Qué queda por hacer cuando ya no hay nada extraño en el código?",
        ],
        normal: [
          "El virus está en los programas de C:\\CORAZON: RITMO.BAS, VALVULAS.BAS y SANGRE.BAS. Lean cada uno con TYPE y Pantalla dicte cada línea con su número.",
          "Datos, comparen cada línea con la tabla de firmas: GOTO que no va a 666, un 180 que calma o LEE MEMORIA son sanos. TERMINAR el proceso no sirve: vuelve.",
          "BORRAR lleva archivo y número de línea, una a la vez. Cuando el medidor de virus llegue a cero, escriban REINICIAR. Borrar una sana cuesta un recuerdo.",
        ],
        obvia: [
          "Terminal, escriban `TYPE C:\\CORAZON\\RITMO.BAS`, luego `TYPE C:\\CORAZON\\VALVULAS.BAS` y `TYPE C:\\CORAZON\\SANGRE.BAS`. Pantalla lee cada línea con su número.",
          "Datos, marquen solo las líneas que llaman a ORDEN.MAESTRA o ATACAR, saltan a 666, ponen PULSO arriba de 180 o ESCRIBEN en MEMORIA. La tabla dice cuántas son.",
          "Por cada línea marcada, escriban `BORRAR C:\\CORAZON\\<archivo> <línea>` con el nombre y número que dictó Pantalla. Con el medidor de virus en cero, `REINICIAR`.",
        ],
      },
    ],
  },
  "fase-bonus-espesura": {
    capas: [
      {
        nombre: "LA ESPESURA",
        sutil: [
          "Cuatro brotes, un solo programa, cuatro esquinas distintas. ¿Qué camino podrían dictarles a todos a la vez? Datos, lean `crecimiento` con calma.",
          "Si la bitácora dice que se quedó quieto, al programa se le acabó la cuerda antes del claro. Y cada bloque que abren, ¿dónde se cierra? `estado` lo cuenta.",
          "Si un brote se desconecta, ¿qué pisó? Datos, comparen las bitácoras con la tabla `minas`: hay dos paredes que seguir y solo una es segura en su espesura.",
        ],
        normal: [
          "No hay camino que dictar: el brote decide con sensores. La regla de `crecimiento` es la clave: un brote que nunca suelta la pared de un mismo lado llega al claro.",
          "Cada `repetir` y cada `si` se cierran con su `fin`, y el `sino` va entre el `si` y ese `fin`. Para que no se acabe antes del claro, envuelvan todo en `repetir 99 veces` (y otro adentro).",
          "Si algún brote pisa una mina, sigan la pared del otro lado: cambien izquierda por derecha en el `si`, en su giro y en el giro del `sino`.",
        ],
        obvia: [
          "Pegarse a una pared: si ese lado está libre, giren hacia él; si no, mientras el frente esté bloqueado, giren al otro lado; luego avancen. Todo dentro de dos `repetir 99 veces`.",
          "Terminal, en orden: `repetir 99 veces`, `repetir 99 veces`, `si izquierda libre`, `girar izquierda`, `sino`, `repetir mientras frente bloqueado`, `girar derecha`, `fin`, `fin`, `avanzar`, `fin`, `fin`.",
          "Si un brote pisa mina, cambien de pared: `cambiar 3 si derecha libre`, `cambiar 4 girar derecha`, `cambiar 7 girar izquierda` y `lanzar`. Si empezaron por la derecha, al revés.",
        ],
      },
    ],
  },
};
