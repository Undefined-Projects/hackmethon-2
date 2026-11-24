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
