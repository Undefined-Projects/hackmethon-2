import { useMemo } from 'react';
import type { AdminSnapshot } from '../shared/events';
import { useTicker } from '../lib/useTicker';
import { JardinCarrera } from './JardinCarrera';
import { PlanoSala } from './PlanoSala';
import { equiposDelPlano } from '../lib/plano';
import { useAtaques } from '../lib/ataques';
import { useSession } from '../session/SessionContext';
import { LineasAtaque } from '../player/MapaAtaque';

/**
 * El mapa del auditorio, para el proyector o para el puesto de la
 * entrada: dónde se sienta cada equipo, con su logo en la mesa.
 *
 * Se abre en SU PROPIA VENTANA (`…/#mapa`) desde el panel: así se
 * arrastra a otra pantalla y el panel sigue a mano. Pinta el plano que
 * llega en el snapshot, así que al guardar en el editor se repinta solo.
 *
 * Las mesas dicen también en qué va su equipo —trabajando, esperando,
 * en meta—, con el mismo color que la carrera: desde la puerta se ve
 * qué rincón de la sala está atascado.
 */
export function MapaSala({ snapshot, onVolver, onEditar }: {
  snapshot: AdminSnapshot; onVolver: () => void; onEditar: () => void;
}) {
  useTicker(5000);
  const { socket, clockOffset } = useSession();
  const { plano } = snapshot;
  // Las líneas de los ataques también en la pared: la sala entera ve
  // quién va a por quién.
  const ataques = useAtaques(socket, snapshot.ataques, clockOffset);
  const mesaDe = new Map(plano.elementos.filter((e) => e.tipo === 'mesa' && e.teamId).map((e) => [e.teamId!, e]));
  const equipos = useMemo(() => equiposDelPlano(snapshot), [snapshot]);
  const mesas = plano.elementos.filter((e) => e.tipo === 'mesa');
  const sentados = new Set(mesas.map((m) => m.teamId).filter(Boolean));
  const sinMesa = snapshot.teams.filter((t) => !sentados.has(t.id));
  const latido = snapshot.teams.reduce(
    (a, t) => a + t.progress.filter((p) => p.status === 'SOLVED').length, 0);

  return (
    <div className="admin admin-mapa">
      <button className="volver-panel" onClick={onVolver}>&lt;&lt; PANEL</button>
      <div className="mapa">
        <JardinCarrera latido={latido} />
        <header className="carrera-cab mapa-cab">
          <h1>{plano.nombre.toUpperCase()}</h1>
          <span className="carrera-dato">{mesas.length} mesas</span>
          <span className="carrera-dato">{sentados.size} de {snapshot.teams.length} equipos sentados</span>
          <span className="mapa-leyenda">
            <i className="ley ley--trabaja" /> trabajando
            <i className="ley ley--espera" /> esperando
            <i className="ley ley--meta" /> en meta
          </span>
          <button className="mapa-editar" onClick={onEditar}>EDITAR MAPA</button>
        </header>

        {/* Para que las raíces de la pared no bajen sobre el plano: se
            paran en el primer elemento con esta clase. */}
        <div className="carrera-postes mapa-tope" aria-hidden />

        <div className="mapa-lienzo">
          <PlanoSala
            plano={plano} equipos={equipos} conEstado maleza
            encima={<LineasAtaque mesaDe={mesaDe} ataques={ataques} yo={null} ahora={Date.now()} />}
          />
        </div>

        {sinMesa.length > 0 && mesas.length > 0 && (
          <p className="mapa-sin-mesa">
            Sin mesa: {sinMesa.map((t) => t.name).join(' · ')}
          </p>
        )}
        {mesas.length === 0 && (
          <p className="mapa-sin-mesa">
            El plano no tiene mesas todavía. Pulsa EDITAR MAPA para colocarlas.
          </p>
        )}
      </div>
    </div>
  );
}
