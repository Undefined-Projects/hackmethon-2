import type { AdminSnapshot, ElementoPlano, Plano } from '../shared/events';
import { urlLogo } from './logo';

/**
 * Lo que el plano del auditorio necesita saber de cada equipo. Va aparte
 * del dibujo (admin/PlanoSala.tsx) porque lo usan la ventana del mapa y
 * el editor, y un archivo de componentes no debe exportar otra cosa.
 */
export type EquipoPlano = {
  nombre: string;
  logo: string | null;
  /** En qué va: decide el color de su mesa en el proyector. */
  estado: 'salida' | 'trabaja' | 'espera' | 'meta';
  /** «F3», «META»… el rótulo pequeño de la esquina. */
  marca: string | null;
};

/** Cada equipo del snapshot, con su estado en el recorrido. La misma
 *  cuenta que la carrera: el bonus no es barrera y no cuenta para meta. */
export function equiposDelPlano(snapshot: AdminSnapshot, logos?: Record<string, string>) {
  const fases = [...snapshot.phases].sort((a, b) => a.order - b.order);
  const barreras = fases.filter((f) => !f.esBonus);
  const mapa = new Map<string, EquipoPlano>();
  for (const t of snapshot.teams) {
    const de = (id: string) => t.progress.find((p) => p.phaseId === id)?.status;
    const resueltas = barreras.filter((f) => de(f.id) === 'SOLVED').length;
    const enCurso = fases.find((f) => de(f.id) === 'IN_PROGRESS');
    const meta = barreras.length > 0 && resueltas === barreras.length;
    mapa.set(t.id, {
      nombre: t.name,
      logo: logos?.[t.id] ?? urlLogo(t.id, t.logoAt),
      estado: meta ? 'meta' : enCurso ? 'trabaja' : resueltas > 0 ? 'espera' : 'salida',
      marca: meta ? 'META' : enCurso ? `F${enCurso.order}` : null,
    });
  }
  return mapa;
}

/**
 * Un auditorio repartido solo: una mesa por equipo, en filas frente al
 * escenario y con un pasillo en medio. Es lo que ve el jugador al
 * atacar mientras nadie ha mapeado la sala de verdad en el editor; en
 * cuanto se guarde un plano con equipos sentados, manda ese.
 *
 * Las mesas van por ORDEN ALFABÉTICO, no por quién mira: así todos los
 * jugadores ven la misma sala, y una línea de ALFA a BRAVO cruza el
 * mismo sitio en todas las pantallas.
 */
export function planoAutomatico(equipos: { id: string; nombre: string }[], nombre = 'Auditorio MENLO'): Omit<Plano, 'guardadoAt'> {
  const lista = [...equipos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const n = Math.max(1, lista.length);
  // Columnas pares para que el pasillo quede en medio; más filas que
  // columnas no, que la sala es más ancha que honda.
  let cols = Math.min(8, Math.max(2, Math.ceil(Math.sqrt(n * 1.6))));
  if (cols % 2) cols += 1;
  const filas = Math.ceil(n / cols);
  const W = 2, H = 0.9, HUECO = 1.3, PASILLO = 2.2, FILA = 3.1, LADO = 3;
  const ancho = LADO * 2 + cols * W + (cols - 1) * HUECO + PASILLO;
  const alto = 6.5 + filas * FILA + 1.5;
  const mitad = cols / 2;
  const elementos: ElementoPlano[] = [
    { id: 'escenario', tipo: 'escenario', x: ancho / 2, y: 1.75, w: Math.min(12, ancho * 0.5), h: 3.5, rot: 0, etiqueta: 'ESCENARIO' },
    { id: 'pantalla', tipo: 'pantalla', x: ancho / 2, y: 0.25, w: Math.min(8, ancho * 0.35), h: 0.3, rot: 0, etiqueta: 'PANTALLA' },
    { id: 'puerta-1', tipo: 'puerta', x: 3, y: alto - 0.15, w: 2, h: 0.3, rot: 0, etiqueta: 'ENTRADA' },
    { id: 'puerta-2', tipo: 'puerta', x: ancho - 3, y: alto - 0.15, w: 2, h: 0.3, rot: 0, etiqueta: 'ENTRADA' },
  ];
  lista.forEach((t, i) => {
    const fila = Math.floor(i / cols), col = i % cols;
    elementos.push({
      id: `auto-${t.id}`, tipo: 'mesa', w: W, h: H, rot: 0, teamId: t.id, etiqueta: `M${i + 1}`,
      x: LADO + W / 2 + col * (W + HUECO) + (col >= mitad ? PASILLO : 0),
      y: 6.5 + fila * FILA,
    });
  });
  return { nombre, ancho, alto, elementos };
}
