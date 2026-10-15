import { useEffect, useMemo, useState } from 'react';
import type { AdminSnapshot } from '../shared/events';
import { sonar } from '../lib/sonido';
import { logoInventado } from '../lib/logoInventado';
import { SALA_LLENA } from '../lib/salaInventada';
import { Carrera } from './Carrera';

/**
 * La carrera de prueba: la misma vista, con una partida inventada.
 *
 * Toma los equipos y las fases de verdad —nombres, escudos, cuántas
 * barreras hay— pero les borra el progreso y los hace correr solos. Todo
 * vive en ESTE componente: no emite nada al servidor, así que se puede
 * probar en plena partida sin tocar el marcador de nadie. Sirve para
 * ver el galope, los pulsos de las barreras, la meta y los sonidos
 * antes de que pase de verdad.
 *
 * Con «30 EQUIPOS» la sala se llena de equipos inventados, para ver la
 * cabeza de carrera y el pelotón con el aforo del evento.
 */

type Corredor = {
  /** Índice de la fase en curso o de la siguiente por empezar. */
  fase: number;
  /** Cuándo empezó la fase en curso; null si no está en ninguna. */
  desde: number | null;
  /** Lo resuelto, por fase: su tiempo. */
  tiempos: Map<string, number>;
};

const TICK = 650;

export function CarreraPrueba({ snapshot, onVolver }: { snapshot: AdminSnapshot; onVolver: () => void }) {
  // Las fases del recorrido, como las ordena la carrera: las barreras
  // primero y el bonus detrás de la meta.
  const recorrido = useMemo(() => {
    const todas = [...snapshot.phases].sort((a, b) => a.order - b.order);
    return [...todas.filter((f) => !f.esBonus), ...todas.filter((f) => f.esBonus)];
  }, [snapshot.phases]);
  const barreras = recorrido.filter((f) => !f.esBonus).length;

  const [treinta, setTreinta] = useState(false);
  const equipos: AdminSnapshot['teams'] = useMemo(() => treinta ? SALA_LLENA : snapshot.teams, [treinta, snapshot.teams]);

  const vacia = (lista: AdminSnapshot['teams']) =>
    new Map(lista.map((t) => [t.id, { fase: 0, desde: null, tiempos: new Map() } as Corredor]));
  const [partida, setPartida] = useState(() => vacia(equipos));
  // Los inventados traen un logo inventado; los de verdad, el suyo.
  const logos = useMemo(() => treinta
    ? Object.fromEntries(SALA_LLENA.map((t, i) => [t.id, logoInventado(i + 1)]))
    : undefined, [treinta]);
  const [ronda, setRonda] = useState(0); // al reiniciar se remonta la carrera entera
  const [rapido, setRapido] = useState(false);
  const [sellado, setSellado] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => {
      const ahora = Date.now();
      setPartida((antes) => {
        const sig = new Map(antes);
        // Unos pocos equipos se mueven por tic, más cuanto más grande es
        // la sala: así no avanza toda a la vez y se ve quién va delante.
        const vivos = [...sig.entries()].filter(([, c]) => c.fase < recorrido.length);
        const mueven = Math.max(1, Math.round(sig.size / 7)) * (rapido ? 2 : 1) + Math.round(Math.random());
        for (let k = 0; k < mueven && vivos.length; k++) {
          const [id, c] = vivos.splice(Math.floor(Math.random() * vivos.length), 1)[0];
          const n: Corredor = { ...c, tiempos: new Map(c.tiempos) };
          // Con la meta pasada, el bonus solo a veces: no todos lo juegan.
          if (n.fase >= barreras && n.desde === null && Math.random() < 0.6) continue;
          if (n.desde === null) n.desde = ahora;
          else if (ahora - n.desde > (rapido ? 500 : 1800) && Math.random() < 0.55) {
            n.tiempos.set(recorrido[n.fase].id, ahora - n.desde);
            n.fase++;
            n.desde = null;
          }
          sig.set(id, n);
        }
        return sig;
      });
      setSellado(ahora);
    }, rapido ? TICK / 2 : TICK);
    return () => clearInterval(id);
  }, [recorrido, barreras, rapido]);

  // El snapshot inventado, con la forma exacta del de verdad.
  const falso: AdminSnapshot = useMemo(() => {
    const enCurso = new Set<string>();
    const teams = equipos.map((t) => {
      const c = partida.get(t.id);
      return {
        ...t,
        progress: recorrido.map((f, i) => {
          const tiempo = c?.tiempos.get(f.id) ?? null;
          const corre = c?.fase === i && c.desde !== null;
          if (corre) enCurso.add(f.id);
          return {
            phaseId: f.id,
            status: tiempo !== null ? 'SOLVED' : corre ? 'IN_PROGRESS' : 'LOCKED',
            timeToSolveMs: tiempo,
            attempts: 0,
            elapsedMs: corre ? sellado - c!.desde! : null,
          };
        }),
      };
    });
    return {
      ...snapshot,
      event: { ...snapshot.event, paused: false },
      // Las barreras en las que alguien está se encienden, como abiertas.
      phases: snapshot.phases.map((f) => ({ ...f, status: enCurso.has(f.id) ? 'ACTIVE' : 'LOCKED' })),
      teams,
    };
  }, [snapshot, equipos, recorrido, partida, sellado]);

  // Reiniciar, o cambiar de aforo, que es empezar otra partida.
  const reiniciar = (lista = equipos) => {
    sonar('boton');
    setPartida(vacia(lista));
    setRonda((r) => r + 1);
  };

  return (
    <div className="admin admin-carrera">
      <button className="volver-panel" onClick={onVolver}>&lt;&lt; PANEL</button>
      <div className="prueba-carrera">
        <span className="chip err">SIMULACIÓN · no toca el juego</span>
        <button onClick={() => { sonar('boton'); setRapido((r) => !r); }}>
          {rapido ? 'VELOCIDAD x1' : 'VELOCIDAD x3'}
        </button>
        <button onClick={() => { setTreinta(!treinta); reiniciar(treinta ? snapshot.teams : SALA_LLENA); }}>
          {treinta ? 'EQUIPOS REALES' : '30 EQUIPOS'}
        </button>
        <button onClick={() => reiniciar()}>REINICIAR</button>
      </div>
      <Carrera key={ronda} snapshot={falso} sellado={sellado} logos={logos} />
    </div>
  );
}
