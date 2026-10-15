// ============================================================
//  Contrato de un módulo de fase.
//
//  Cada fase es una unidad independiente: sus datos, su proyección por
//  rol y su intérprete de comandos. El motor (realtime/commands.ts) no
//  sabe nada del contenido de ninguna fase; solo valida permisos,
//  registra y reparte. Añadir la Fase 2 será escribir un archivo y
//  registrarlo, sin tocar el motor.
// ============================================================

import type { Role } from '../lib/constants.js';
// Los tipos de salida son contrato de cable: se definen una sola vez en
// events.ts, que es lo que se copia al cliente.
import type {
  BloqueSalida, FiltroTrafico, PeticionTrafico, SalidaComando,
} from '../lib/events.js';

export type { BloqueSalida, FiltroTrafico, PeticionTrafico, SalidaComando };

// ============================================================
//  Flujo de tráfico.
//
//  El módulo describe QUÉ peticiones entran y a qué ritmo; el motor se
//  encarga del reloj, de sellar cada línea y de repartirla solo a
//  Pantalla. Así la fase se puede probar llamando a `ejecutar` sin
//  levantar un socket: lo que devuelve es una lista, no un temporizador.
// ============================================================
export type FlujoTrafico =
  | {
      accion: 'iniciar';
      /** Milisegundos entre petición y petición. */
      intervaloMs: number;
      /** El guion del ataque. Se emite en orden. */
      peticiones: PeticionTrafico[];
      /** true → al terminar la lista vuelve a empezar. Un ataque que se
       *  agota mientras el equipo sigue deliberando rompe la ficción. */
      bucle?: boolean;
      /** Arranca ya acotado. `null` o ausente = todo. */
      filtro?: FiltroTrafico | null;
    }
  /** Reencuadra el flujo que YA está corriendo, sin reiniciar el guion:
   *  filtrar no es empezar de cero, es mirar lo mismo con lupa. */
  | { accion: 'filtrar'; filtro: FiltroTrafico | null }
  | { accion: 'detener' };

export type ContextoComando = {
  /** Estado interno del reto para ESTE equipo (persistido en stateJson). */
  estado: Record<string, unknown>;
  intentos: number;
  ahora: number;
  /** ¿El monitor de este equipo está abierto ahora mismo? Lo resuelve el
   *  motor. Sin este dato, `trafico cuenta X` no puede distinguir entre
   *  «acota lo que ya cae» y «abre el monitor ya acotado». */
  traficoActivo: boolean;
};

export type ResultadoComando = {
  bloques: BloqueSalida[];
  /** true → el equipo ha resuelto la fase. */
  resuelto?: boolean;
  /** true → cuenta como intento fallido (penaliza en el desempate). */
  fallo?: boolean;
  /** Nuevo estado interno a persistir. */
  estado?: Record<string, unknown>;
  /** Arranca o detiene el monitor de tráfico de ESTE equipo. */
  flujo?: FlujoTrafico;
  /**
   * Milisegundos a esperar antes de levantar la pantalla de victoria.
   *
   * La fase se sella igual de rápido —el tiempo oficial no se toca— pero
   * la cortinilla espera. Es para las fases que tienen un DESENLACE que
   * ver: sin esto, la celebración tapa el último fotograma en el mismo
   * milisegundo en que empieza, y el equipo se pierde justo lo que ha
   * conseguido. Los tres puestos esperan lo mismo: el momento es común.
   */
  esperaVictoriaMs?: number;
};

export interface ModuloFase {
  key: string;
  /** Lo que ve cada rol al entrar. La asimetría del juego vive aquí. */
  proyectar(
    role: Role,
    ctx: {
      estado: Record<string, unknown>;
      salidas: SalidaComando[];
      /** ¿El monitor de tráfico sigue corriendo para este equipo?
       *  Lo resuelve el motor: quien reconecta a mitad de un ataque
       *  tiene que saber que sigue vivo aunque su panel salga vacío. */
      traficoActivo: boolean;
      /** Y con qué filtro, o el panel recién recargado parecería averiado
       *  cuando en realidad está acotado. */
      filtroTrafico: FiltroTrafico | null;
    },
  ): unknown;
  /** Intérprete de comandos del Operador de Terminal. */
  ejecutar(comando: string, ctx: ContextoComando): ResultadoComando;
}

/** Quita acentos y normaliza: `política` y `politica` deben valer igual. */
export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // fuera acentos: `política` == `politica`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
