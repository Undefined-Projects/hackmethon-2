import { useState } from 'react';
import type { AppSocket } from '../lib/socket';
import { call } from '../lib/socket';
import { roleLabel } from '../lib/format';
import { ROLES, type Role } from '../shared/constants';
import type { ConsejoRobot } from '../shared/events';
import { LetreroRobot } from '../player/LetreroRobot';

/**
 * Vista previa del letrero del robot: elige fase, capa y puesto, y el
 * letrero sale AQUÍ, en este panel, como lo vería ese jugador. No se
 * manda a nadie. Pulsar otra vez saca otro consejo de los que hay.
 */
export function PruebaConsejo({ socket, phases, onAviso }: {
  socket: AppSocket;
  phases: { key: string; order: number; title: string }[];
  onAviso: (a: { tipo: 'ok' | 'err'; texto: string }) => void;
}) {
  const [faseKey, setFaseKey] = useState<string>(phases[0]?.key ?? '');
  const [capa, setCapa] = useState(1);
  const [rol, setRol] = useState<Role>('TERMINAL');
  const [visto, setVisto] = useState<ConsejoRobot | null>(null);

  const probar = async () => {
    const r = await call<ConsejoRobot & { capas: number }>(socket, 'admin:consejo:ver', { faseKey: faseKey || null, capa, rol });
    if (!r.ok || !r.data) { onAviso({ tipo: 'err', texto: r.error ?? 'No se pudo ver el consejo' }); return; }
    setVisto(r.data);
  };

  return (
    <article className="admin-tarjeta">
      <strong>Letrero del robot</strong>
      <p>Cómo se ve el consejo para una fase, capa y puesto. Sale solo aquí; a los equipos se les manda desde la pestaña Equipos.</p>
      <div className="prueba-consejo__campos">
        <select value={faseKey} onChange={(e) => setFaseKey(e.target.value)} aria-label="Fase">
          {[...phases].sort((a, b) => a.order - b.order).map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}
          <option value="">En el lobby</option>
        </select>
        <select value={capa} onChange={(e) => setCapa(Number(e.target.value))} aria-label="Capa">
          <option value={1}>Capa 1</option>
          <option value={2}>Capa 2</option>
        </select>
        <select value={rol} onChange={(e) => setRol(e.target.value as Role)} aria-label="Puesto">
          {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
        </select>
      </div>
      <button type="button" className="ir-carrera" onClick={probar}>&gt;&gt; {visto ? 'OTRO CONSEJO' : 'PROBAR LETRERO'}</button>
      {visto && <LetreroRobot consejo={visto} ensayo onCerrar={() => setVisto(null)} />}
    </article>
  );
}
