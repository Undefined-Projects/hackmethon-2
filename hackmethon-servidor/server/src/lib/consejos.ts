// ============================================================
//  EL LETRERO DEL ROBOT · consejos
//
//  El admin le manda al equipo un consejo para la fase y la capa en la
//  que está, y a cada puesto el suyo: Terminal, Pantalla y Datos ven
//  cosas distintas, así que se atascan en cosas distintas. Hay varios
//  por puesto y sale uno al azar: si el admin lo vuelve a mandar, el
//  equipo recibe otro.
//
//  Son empujones, no soluciones: dicen dónde mirar o qué preguntarse,
//  nunca qué escribir. Español de México, con «ustedes».
// ============================================================

import type { Role } from './constants.js';

type PorPuesto = Record<Role, string[]>;
type FaseConsejos = { capas: { nombre: string; consejos: PorPuesto }[] };

const CONSEJOS: Record<string, FaseConsejos> = {
  'fase-1-acceso': {
    capas: [
      {
        nombre: 'LA RÓTULA',
        consejos: {
          TERMINAL: [
            'Antes de desplegar, prueben. `probar` es gratis y Datos ve en qué filtro cae cada programa.',
            'Con 3 filtros no alcanza para nombrar a cada anticuerpo. Busquen qué tienen en común y descríbanlo.',
            'La defensa de la pierna también se puede quitar. Si frena a sus esporas, sobra.',
          ],
          PANTALLA: [
            'Después de cada `probar`, di en voz alta quién pasa y quién rebota. Tú ves nombres; Datos sabe quién es quién.',
            'Si una espora rebota, avisa de inmediato: algún filtro está tirando de más.',
          ],
          DATOS: [
            'Compara las esporas con los anticuerpos en el registro: ¿qué campo los separa a todos de una vez?',
            'Las corridas dicen en qué filtro cayó cada programa. Si cae la rutina, esa condición es demasiado ancha.',
            '`y` estrecha y `o` ensancha. Úsenlo para afinar sin gastar filtros.',
          ],
        },
      },
      {
        nombre: 'LA MUDA',
        consejos: {
          TERMINAL: [
            '`nombre` ya no vale. Describan a los anticuerpos por sus campos, no por cómo se llaman.',
            'La pierna levantó una defensa nueva. Pregúntenle a Datos si estorba a sus esporas.',
            'Tienen 4 filtros. Junten familias en un solo filtro en vez de agregar uno por programa.',
          ],
          PANTALLA: [
            'Llegó una oleada nueva. Cuenta en voz alta quién pasa y quién rebota en cada prueba.',
            'Ojo con la rutina: si un programa de rutina rebota, la pierna se da cuenta.',
          ],
          DATOS: [
            'Algo cambió de bando con la muda. Revisen el encargo otra vez antes de confiar en lo de la capa anterior.',
            'Hay un programa de rutina que se parece a un anticuerpo. Busca el campo que los distingue.',
            'Las esporas nuevas no son idénticas a las de antes. Revisa sus campos antes de reusar un filtro.',
          ],
        },
      },
    ],
  },
  'fase-2-enemigo': {
    capas: [
      {
        nombre: 'EL SEMILLERO',
        consejos: {
          TERMINAL: [
            'Escriban una instrucción por línea, en el orden en que el brote las tiene que hacer. Luego `lanzar`.',
            'Antes de lanzar, pídele a Datos que te lea el programa: él lo ve completo, tú no.',
          ],
          PANTALLA: [
            'Fíjate hacia dónde apunta la flecha. Izquierda y derecha son las de ella, no las tuyas.',
            'Dicta por tramos: «avanza tres, gira a SU derecha, avanza tres…».',
            'Si el brote se desconecta, di en qué casilla se quedó y hacia dónde apuntaba.',
          ],
          DATOS: [
            'El `manual` dice qué sabe hacer el brote. Si Terminal escribe otra cosa, no la va a entender.',
            'Mientras el brote anda, la línea encendida te dice qué instrucción está cumpliendo.',
          ],
        },
      },
      {
        nombre: 'EL SETO',
        consejos: {
          TERMINAL: [
            'El brote solo carga 10 líneas. Lo que se repite, métanlo en un `repetir`.',
            'Cada `repetir` lleva su `fin`. Pídanle a Datos que les confirme que el programa está bien cerrado antes de lanzar.',
          ],
          PANTALLA: [
            'Busca un patrón en el camino: ¿hay un tramo que se repita igual varias veces?',
            'Hay más de un camino con forma de escalera. Antes de elegir, pregúntenle a Datos por las espinas.',
            'Si el brote se desconecta, dile a tu equipo en qué casilla quedó y hacia dónde miraba.',
          ],
          DATOS: [
            'En la pantalla las espinas se ven como camino. Antes de lanzar, revisen que el camino no pase por ninguna.',
            'La bitácora dice dónde terminó cada brote. Esa casilla les dice en qué parte se equivocaron.',
            'Mientras el brote anda, la línea encendida y la vuelta del ciclo te dicen dónde falló.',
          ],
        },
      },
    ],
  },
  'fase-mano-listas': {
    capas: [
      {
        nombre: 'LAS FALANGES',
        consejos: {
          TERMINAL: [
            'Pantalla solo ve una cara a la vez: pídele qué necesita ver y cambia con `camara 1` o `camara 2`.',
            'Antes de `apretar`, usa `probar`: es gratis y dice cuántos dedos ya están en orden.',
          ],
          PANTALLA: [
            'En el reverso la mano se ve en espejo: el pulgar queda del otro lado. Guíate por el número de cada dedo.',
            'Apunta los dos datos de cada falange, el del frente y el del reverso: no los vas a ver al mismo tiempo.',
          ],
          DATOS: [
            'Revisa el tipo de cada dedo antes de que muevan nada: no todos se ordenan igual.',
            'Como texto, "10" va antes que "9": se compara el primer carácter, y "1" es menor que "9".',
          ],
        },
      },
      {
        nombre: 'LOS TENDONES',
        consejos: {
          TERMINAL: [
            'No muevas nada sin plan: cada intercambio gasta del presupuesto.',
            'Si se acaban los intercambios, `reiniciar` los devuelve, pero también el revoltijo.',
          ],
          PANTALLA: [
            'Dicta el orden actual de las letras, de izquierda a derecha, para que Datos lo compare con su tabla.',
            'Después de cada intercambio, confirma en voz alta qué letra quedó en cada lugar.',
          ],
          DATOS: [
            'Primero escriban el orden final completo, de la posición 0 a la 11. Luego decidan los intercambios.',
            '¿Qué tendón tiene que ir en la posición 0? Búsquenlo y llévenlo ahí. Luego la 1, y así.',
            'Si dos tendones son del mismo dedo, manda la tensión: el de menor tensión va primero.',
          ],
        },
      },
    ],
  },
  'fase-5-boveda': {
    capas: [
      {
        nombre: 'EL EMBUDO',
        consejos: {
          TERMINAL: [
            'Usa `contar` antes de `buscar`: dice cuántos quedan sin gastar nada.',
            'Agrega una condición a la vez y pide a Pantalla el número: así se ve cómo se cierra el embudo.',
            'Si mezclas `y` con `o`, pon paréntesis: `( emocion = a o emocion = b )`.',
          ],
          PANTALLA: [
            'Canta el número de cada recuento: si de pronto da 0, algo sobra o algún valor está mal escrito.',
            'Debajo de cada respuesta está la consulta en SQL: léela para confirmar que la bóveda entendió lo que querían.',
          ],
          DATOS: [
            'Traduce cada requisito del encargo a una condición: columna, operador y valor.',
            'El requisito de emoción es un O: cualquiera de las dos sirve, pero tiene que ir entre paréntesis.',
            '"Después de 2023" es `año > 2023`; "7 o más" es `intensidad >= 7`.',
          ],
        },
      },
      {
        nombre: 'EL RECUERDO COMPARTIDO',
        consejos: {
          TERMINAL: [
            'El oficio está en `personas`: para usarlo, `unir personas`.',
            '`agrupar por nombre` con `contar` dice cuántos recuerdos tiene cada persona.',
            'Para "el más intenso": `ordenar por intensidad desc limitar 1`.',
          ],
          PANTALLA: [
            'Al agrupar, el primer grupo de la tabla es el que más tiene: dicta su nombre y su número.',
            'Compara el agrupado con y sin la condición de oficio: no siempre gana la misma persona.',
          ],
          DATOS: [
            'Son dos pasos: primero quién (agrupar y contar), luego cuál de sus recuerdos (ordenar).',
            'El último requisito avisa de la trampa: sin filtrar por oficio, gana otra persona.',
          ],
        },
      },
    ],
  },
  'fase-6-puente': {
    capas: [
      {
        nombre: 'LAS DEFENSAS',
        consejos: {
          TERMINAL: [
            'Primero el acceso: `enviar POST /mente/sesion cuerpo clave=...`. Sin token no pasa nada.',
            'El token va en la CABECERA; la fuerza, en el CUERPO. No son lo mismo.',
            'Si sale 429, espera: si insistes, la mente contraataca.',
          ],
          PANTALLA: [
            'Dicta el token y los ids letra por letra: Terminal no los ve.',
            'Canta el código de cada respuesta: Datos sabe qué significa cada uno.',
          ],
          DATOS: [
            'Revisa la tabla de códigos con cada respuesta: 401, 403 y 422 se arreglan distinto.',
            'Las facultades con blindaje piden `fuerza` en el cuerpo, igual o mayor que su blindaje.',
          ],
        },
      },
      {
        nombre: 'EL ULTIMO PENSAMIENTO',
        consejos: {
          TERMINAL: [
            'Ten listas las tres peticiones: reto, escudo abajo y golpe. El escudo solo dura 25 s.',
            'Golpea con `fuerza=25`, el máximo: son cuatro golpes.',
            'Tras cada contraataque el token deja de servir: pide acceso otra vez.',
          ],
          PANTALLA: [
            'En cuanto aparezca el reto, cántalo: cambia cada 45 s.',
            'Avisa cuando el escudo baje, y cuánto le queda.',
          ],
          DATOS: [
            'Prepara al equipo para los contraataques a los 75, 50 y 25 de vida: el que quede averiado, que espere.',
            'Repasen el orden en voz alta antes de cada golpe: GET reto, PATCH escudo, DELETE fuerza.',
          ],
        },
      },
    ],
  },
  'fase-bonus-corazon': {
    capas: [
      {
        nombre: 'REINICIAR',
        consejos: {
          TERMINAL: [
            'Empieza con DIR y TYPE AUTOEXEC.BAT: dice qué necesita el arranque.',
            'CD .. sube una carpeta; CD \\ vuelve a la raíz.',
            'No ARRANQUES hasta haber copiado el respaldo correcto: fallar cuesta cuarentena.',
          ],
          PANTALLA: [
            'Dicta las rutas completas, con sus barras: C:\\RESPALDO\\1991.',
            'Lee la SUMA de cada respaldo en voz alta para que Datos la compare.',
          ],
          DATOS: [
            'Tu manual dice la suma de un marcapasos sano: solo un respaldo la tiene.',
            'El marcapasos va en C:\\CORAZON. COPY origen destino.',
          ],
        },
      },
      {
        nombre: 'EL VIRUS',
        consejos: {
          TERMINAL: [
            'Antes de borrar, que Pantalla lea el programa completo: TYPE RITMO.BAS.',
            'BORRAR lleva archivo y número de línea. Una sola línea cada vez.',
          ],
          PANTALLA: [
            'Lee cada línea con su número. No te saltes las que parecen inocentes.',
            'El medidor de VIRUS dice cuántas líneas quedan.',
          ],
          DATOS: [
            'Compara cada línea con las firmas. Un GOTO que no va a 666 es sano; un 180 que calma, también.',
            'TERMINAR el proceso no sirve: vuelve. La cura está en el código.',
          ],
        },
      },
    ],
  },
  'fase-bonus-espesura': {
    capas: [
      {
        nombre: 'LA ESPESURA',
        consejos: {
          TERMINAL: [
            'Aquí no hay camino que dictar: el programa tiene que preguntar con sensores antes de moverse.',
            '`repetir mientras` sirve cuando no saben cuántas vueltas hacen falta. Un `si` adentro decide hacia dónde.',
          ],
          PANTALLA: [
            'Cuenta qué hizo cada brote antes de desconectarse: ¿giró hacia el lado equivocado o avanzó de más?',
            'La espesura no cambia: lo que ya alumbraron sigue ahí. Fíjense en cómo decide el brote, no en un camino.',
          ],
          DATOS: [
            'Lean la tabla `crecimiento`: lo que siempre se cumple es la clave para un programa que sirva en todas.',
            'Cuando el camino gira, enfrente siempre hay pared y solo un lado está libre. ¿Cómo se lo preguntarían al brote?',
            'Al llegar a la salida el brote se detiene: no importa que al programa le sobren vueltas.',
          ],
        },
      },
    ],
  },
};

/** Para las fases sin consejos propios, o si el equipo está en el lobby. */
const GENERALES: PorPuesto = {
  TERMINAL: [
    'Tú escribes a ciegas. Antes de cada comando, pídele a tu equipo que te confirme lo que ve.',
    'Escribe `ayuda`: ahí están los comandos de esta fase.',
  ],
  PANTALLA: [
    'Describe en voz alta todo lo que cambia en tu pantalla: tu equipo no lo ve.',
  ],
  DATOS: [
    'Tú tienes la información. Compártela antes de que Terminal la necesite.',
  ],
};

export type Consejo = { capa: number | null; nombreCapa: string | null; texto: string };

/** Un consejo para ese puesto, en esa fase y capa. `evitar` es el último
 *  que recibió, para no repetirlo si hay otro. */
export function consejoPara(faseKey: string | null, capa: number | null, rol: Role, evitar?: string): Consejo {
  const fase = faseKey ? CONSEJOS[faseKey] : undefined;
  const i = fase ? Math.min(Math.max(1, capa ?? 1), fase.capas.length) - 1 : -1;
  const lista = fase ? fase.capas[i].consejos[rol] : GENERALES[rol];
  const opciones = lista.length > 1 ? lista.filter((t) => t !== evitar) : lista;
  return {
    capa: fase ? i + 1 : null,
    nombreCapa: fase ? fase.capas[i].nombre : null,
    texto: opciones[Math.floor(Math.random() * opciones.length)],
  };
}

/** Cuántas capas con consejos tiene una fase (para la vista previa). */
export const capasConConsejo = (faseKey: string) => CONSEJOS[faseKey]?.capas.length ?? 0;
