import type { AdminSnapshot, Plano } from '../shared/events';
import { planoAutomatico } from './plano';

/**
 * La sala inventada de las pruebas del panel: treinta equipos que no
 * existen, con su plano de ejemplo. La usan la carrera de prueba y el
 * ataque de prueba, para ver el evento con el aforo de verdad sin tocar
 * la base de datos.
 */

/** Nombres cortos a propósito: los de verdad lo son. */
const INVENTADOS = [
  'ALFA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL', 'INDIA', 'JULIETT',
  'KILO', 'LIMA', 'MIKE', 'NOVEMBER', 'OSCAR', 'PAPA', 'QUEBEC', 'ROMEO', 'SIERRA', 'TANGO',
  'UNIFORM', 'VICTOR', 'WHISKEY', 'XRAY', 'YANKEE', 'ZULU', 'MICELIO', 'RAIZ', 'SINAPSIS', 'VOLTIO',
];

export const SALA_LLENA: AdminSnapshot['teams'] = INVENTADOS.map((name, i) => ({
  id: `sim-${i}`, name, score: 0, tickets: 0, escudoMs: 0, logoAt: null,
  alertas: { pegados: 0, rafagas: 0, rapidas: [] }, ubicacion: null, pistas: [], members: [], progress: [],
}));

/** El auditorio de ejemplo: una mesa por equipo inventado, repartidas
 *  igual que las de un evento sin mapear. */
export function planoDeEjemplo(): Omit<Plano, 'guardadoAt'> {
  return planoAutomatico(SALA_LLENA.map((t) => ({ id: t.id, nombre: t.name })), 'Auditorio MENLO (ejemplo)');
}
