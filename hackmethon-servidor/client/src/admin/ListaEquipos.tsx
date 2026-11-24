import { useState } from 'react';
import type { AdminSnapshot } from '../shared/events';
import { roleLabel } from '../lib/format';

type Equipo = AdminSnapshot['teams'][number];
type Miembro = Equipo['members'][number];
type Accion = (key: string, event: string, payload: unknown, exito: string) => Promise<unknown>;

/** El nombre sin el prefijo del equipo («ALFA · Jugador 2» → «Jugador 2»). */
export const sinEquipo = (m: Miembro, t: Equipo) => m.displayName.replace(`${t.name} · `, '');

// ============================================================
//  Mover a alguien de equipo. Es un selector y no un arrastre: en un
//  panel en vivo, con la sala llena, lo que hace falta es que no se
//  dispare sin querer. Por eso además pide confirmación: a esa persona
//  se le recarga la pantalla y aparece en otra mesa.
// ============================================================
export function MoverEquipo({ miembro, equipo, equipos, bloqueado, accion }: {
  miembro: Miembro; equipo: Equipo; equipos: Equipo[]; bloqueado: boolean; accion: Accion;
}) {
  const quien = sinEquipo(miembro, equipo);
  return (
    <select
      className="mover-equipo"
      value=""
      disabled={bloqueado || equipos.length < 2}
      title={`Cambiar a ${quien} de equipo`}
      aria-label={`Cambiar a ${quien} de equipo`}
      onChange={(e) => {
        const destino = equipos.find((x) => x.id === e.target.value);
        if (!destino) return;
        const terminal = miembro.role === 'TERMINAL'
          ? `\n\nTiene la TERMINAL: en ${equipo.name} la tomará otra persona.`
          : '';
        if (!confirm(`¿Mover a ${quien} de ${equipo.name} a ${destino.name}?${terminal}\n\nSu pantalla se recarga ya en el equipo nuevo. En ${destino.name} solo toma la TERMINAL si nadie la tiene.`)) return;
        void accion(`mover-${miembro.id}`, 'admin:jugador:equipo', { userId: miembro.id, teamId: destino.id },
          `${quien} pasa a ${destino.name}`);
      }}
    >
      <option value="" disabled>⇄</option>
      {equipos.filter((x) => x.id !== equipo.id).map((x) => (
        <option key={x.id} value={x.id}>→ {x.name} ({x.members.length})</option>
      ))}
    </select>
  );
}

// ============================================================
//  La vista de lista: todos los equipos con su gente, apretados, para
//  encontrar a alguien de un vistazo y moverlo. Las fichas siguen siendo
//  el sitio del progreso, los tickets y las averías.
// ============================================================
export function ListaEquipos({ teams, bloqueado, accion }: {
  teams: Equipo[]; bloqueado: boolean; accion: Accion;
}) {
  const [busca, setBusca] = useState('');
  const q = busca.trim().toLocaleLowerCase();
  const coincide = (m: Miembro, t: Equipo) => !q
    || m.displayName.toLocaleLowerCase().includes(q) || t.name.toLocaleLowerCase().includes(q);

  return (
    <div className="lista-equipos">
      <input
        className="lista-equipos__busca"
        type="search"
        placeholder="Buscar persona o equipo…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      <div className="lista-equipos__grid">
        {teams.map((t) => {
          const gente = t.members.filter((m) => coincide(m, t));
          if (q && gente.length === 0) return null;
          const enLinea = t.members.filter((m) => m.connected).length;
          const terminales = t.members.filter((m) => m.role === 'TERMINAL').length;
          return (
            <section key={t.id} className="lista-equipos__equipo">
              <header>
                <strong>{t.name}</strong>
                <span>{enLinea}/{t.members.length} en línea</span>
                {t.members.length > 0 && terminales !== 1 && (
                  <span className="lista-equipos__aviso">{terminales === 0 ? 'SIN TERMINAL' : `${terminales} TERMINALES`}</span>
                )}
              </header>
              {t.members.length === 0
                ? <p className="lista-equipos__vacio">Sin integrantes</p>
                : (
                  <ul className="miembros">
                    {gente.map((m) => (
                      <li key={m.id}>
                        <span className={`punto ${m.connected ? 'on' : 'off'}`} />
                        <span className="nombre">{sinEquipo(m, t)}</span>
                        <span className={`rol rol-${m.role}`}>{roleLabel[m.role]}</span>
                        <MoverEquipo miembro={m} equipo={t} equipos={teams} bloqueado={bloqueado} accion={accion} />
                      </li>
                    ))}
                  </ul>
                )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
