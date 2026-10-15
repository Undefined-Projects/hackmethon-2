import { useEffect, useRef, useState } from 'react';
import type { ParteRobot, PrimeraVez } from '../shared/events';
import type { AppSocket } from './socket';
import { ordenDeDestruccion, partesDeFases, type ParteClave } from './anatomia';
import { urlLogo } from './logo';
import type { Golpe } from '../admin/DestruccionRobot';

/**
 * La cola de destrucciones del robot que tiene que pintar una pantalla.
 *
 * La comparten la proyección y los jugadores: las dos escuchan lo mismo
 * —`fase:primera` cuando un equipo es el primero en superar una fase, y
 * `destruccion:ensayo` cuando el panel la ensaya— y traducen cada fase a
 * su parte del cuerpo con el mismo reparto que el lobby.
 *
 * Si llega una mientras se reproduce otra, va detrás: dos equipos que
 * estrenan fases seguidas se ven los dos, en orden.
 */

type Fase = { id: string; order: number; esFinal: boolean; esBonus: boolean };
type EquipoEnsayo = { id: string; name: string; logoAt: number | null };

export function useDestruccion(socket: AppSocket | null, fases: Fase[]) {
  const [cola, setCola] = useState<Golpe[] | null>(null);
  const [base, setBase] = useState<Set<ParteClave>>(new Set());
  const enMarcha = useRef(false);

  // Los manejadores leen las fases de AHORA sin volver a suscribirse.
  const fasesRef = useRef(fases);
  useEffect(() => { fasesRef.current = fases; });

  const encolar = (golpes: Golpe[], desde: Set<ParteClave>) => {
    if (!golpes.length) return;
    if (!enMarcha.current) setBase(desde);
    enMarcha.current = true;
    setCola((c) => (c ? [...c, ...golpes] : golpes));
  };

  /** El ensayo: el robot entero, y sus partes en orden. El cartel final
   *  sale con equipos de verdad, uno por parte, para verlo con logos. */
  const ensayar = (parte: ParteRobot | 'todo', equipos: EquipoEnsayo[]) => {
    const fs = fasesRef.current;
    const porParte = new Map([...partesDeFases(fs)].map(([id, c]) => [c, fs.find((f) => f.id === id)?.order ?? null]));
    const partes = parte === 'todo' ? ordenDeDestruccion(fs) : [parte];
    const t = Date.now();
    enMarcha.current = true;
    setBase(new Set());
    setCola(partes.map((c, k) => {
      const e = equipos.length ? equipos[k % equipos.length] : null;
      return {
        id: `ensayo-${t}-${k}`, parte: c, fase: porParte.get(c) ?? null, ensayo: true,
        equipo: e?.name ?? null, logo: e ? urlLogo(e.id, e.logoAt) : null,
      };
    }));
  };

  const ensayarRef = useRef(ensayar);
  const encolarRef = useRef(encolar);
  useEffect(() => { ensayarRef.current = ensayar; encolarRef.current = encolar; });

  useEffect(() => {
    if (!socket) return;
    const primera = (p: PrimeraVez) => {
      const partes = partesDeFases(fasesRef.current);
      const parte = partes.get(p.phaseId);
      // Una fase que no cabe en el cuerpo (más de cinco regulares) no
      // tiene parte que romper.
      if (!parte) return;
      const rotas = new Set(p.previas.map((id) => partes.get(id)).filter((c): c is ParteClave => !!c));
      encolarRef.current([{
        id: p.id, parte, fase: p.order, equipo: p.teamName, logo: urlLogo(p.teamId, p.logoAt),
      }], rotas);
    };
    const ensayo = (p: { parte: ParteRobot | 'todo'; equipos: EquipoEnsayo[] }) => ensayarRef.current(p.parte, p.equipos);
    socket.on('fase:primera', primera);
    socket.on('destruccion:ensayo', ensayo);
    return () => {
      socket.off('fase:primera', primera);
      socket.off('destruccion:ensayo', ensayo);
    };
  }, [socket]);

  const terminar = () => { enMarcha.current = false; setCola(null); };
  return { cola, base, terminar, ensayar };
}
