import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LobbyPhaseView, PhaseWorkspace } from '../shared/events';
import { PARTES, asignarPartes, estadoDe, type ParteClave } from '../lib/anatomia';
import { sonar } from '../lib/sonido';

// ============================================================
//  LA LÁMINA · la cabecera de cada fase
//
//  Dentro de una fase se seguía en una consola cualquiera, y el lobby
//  contaba otra cosa: que se está desmontando una máquina que creció.
//  Esta franja ata las dos: qué lámina es, qué parte del cuerpo se está
//  diseccionando y —si la fase va por capas— por cuál va el equipo.
//
//  La ven los tres puestos por igual. La capa no es contenido, es
//  progreso, y saber que la pierna tiene dos capas no resuelve ninguna.
// ============================================================

type Lamina = { capa: number; capas: number; nombres: string[]; resuelta: boolean };

const ROMANOS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** «Fase 1 — El Reflejo» → «El Reflejo». */
const epiteto = (titulo: string) => titulo.split(/\s+[—–-]\s+/).slice(1).join(' — ') || titulo;
/** «CONDICIONALES · …» → «CONDICIONALES». */
const concepto = (descripcion: string | null) => {
  const m = descripcion?.match(/^([A-ZÁÉÍÓÚÑ ]{3,})\s+·/);
  return m ? m[1].trim() : null;
};

export function LaminaFase({ workspace, lobby }: { workspace: PhaseWorkspace; lobby: LobbyPhaseView[] }) {
  const fase = lobby.find((f) => f.phaseId === workspace.phaseId);
  const partes = useMemo(() => asignarPartes(lobby), [lobby]);
  const parte = partes.get(workspace.phaseId) ?? null;
  const lamina = (workspace.payload as { lamina?: Lamina } | null)?.lamina ?? null;

  // Cuando cae una capa se celebra en la franja: un destello, la
  // enredadera que avanza y un aviso grande de qué se ha superado y qué
  // viene. Solo con el CAMBIO, no al entrar. Es lo que ven los tres
  // puestos a la vez, también los que no tienen cámara.
  const [cae, setCae] = useState<{ superada: number; final: boolean } | null>(null);
  const capa = lamina?.capa ?? 0;
  const resuelta = lamina?.resuelta ?? false;
  const capaVista = useRef(capa);
  const resueltaVista = useRef(resuelta);
  useEffect(() => {
    const subeCapa = capa > capaVista.current && capaVista.current > 0;
    const termina = resuelta && !resueltaVista.current;
    const superada = termina ? capa : capaVista.current;
    capaVista.current = capa;
    resueltaVista.current = resuelta;
    if (!subeCapa && !termina) return;
    setCae({ superada, final: termina });
    sonar('barrera');
    const t = setTimeout(() => setCae(null), 4200);
    return () => clearTimeout(t);
  }, [capa, resuelta]);

  const progreso = lamina ? (lamina.resuelta ? 1 : (lamina.capa - 1) / lamina.capas) : 0;
  const numero = fase ? ROMANOS[fase.order] ?? String(fase.order) : '';

  return (
    <div className={`franja-lamina${cae ? ' cae' : ''}`} style={{ ['--progreso' as string]: progreso } as CSSProperties}>
      {cae && lamina && (
        <div className="lamina-superada" role="status">
          <span className="ok">[OK] CAPA {cae.superada} · {lamina.nombres[cae.superada - 1]} SUPERADA</span>
          {cae.final
            ? <span className="siguiente">LÁMINA COMPLETA</span>
            : <>
                <span className="flecha">&gt;&gt;</span>
                <span className="siguiente">CAPA {lamina.capa} · {lamina.nombres[lamina.capa - 1]}</span>
              </>}
        </div>
      )}
      <div className="lamina-texto">
        <p className="lamina-numero">
          LÁMINA {numero}
          {parte && <span className="lamina-parte">{PARTES[parte].nombre}</span>}
        </p>
        <p className="lamina-titulo">{epiteto(workspace.title)}</p>
        {concepto(fase?.description ?? null) && (
          <p className="lamina-concepto">{concepto(fase?.description ?? null)}</p>
        )}
      </div>

      {lamina && (
        <ol className="lamina-capas" aria-label="Capas de la fase">
          {lamina.nombres.map((nombre, i) => {
            const n = i + 1;
            const estado = lamina.resuelta || n < lamina.capa ? 'caida' : n === lamina.capa ? 'actual' : 'cerrada';
            return (
              <li key={n} className={estado}>
                <span className="lamina-capa-n">{estado === 'caida' ? '[OK]' : `CAPA ${n}`}</span>
                <span className="lamina-capa-nombre">{nombre}</span>
              </li>
            );
          })}
        </ol>
      )}

      {parte && <RobotGuia actual={parte} partes={partes} lobby={lobby} />}

      {/* La enredadera que cruza la franja: crece con cada capa que cae. */}
      <svg className="lamina-enredadera" viewBox="0 0 1000 14" preserveAspectRatio="none" aria-hidden="true">
        <path className="lamina-tallo" pathLength={1}
              d="M0 8 C40 2 80 13 120 7 S200 2 240 8 S320 13 360 7 S440 2 480 8 S560 13 600 7 S680 2 720 8 S800 13 840 7 S920 2 1000 8" />
        {Array.from({ length: 24 }, (_, i) => {
          const x = 20 + i * 41;
          return (
            <path key={i} className="lamina-hoja" d={`M${x} 7 l5 -5 l3 5 l-3 4 Z`}
                  style={{ ['--en' as string]: x / 1000 } as CSSProperties} />
          );
        })}
      </svg>
    </div>
  );
}

/** El robot del lobby en miniatura: dónde está esta fase en el cuerpo, y
 *  qué partes ya han caído. */
function RobotGuia({ actual, partes, lobby }: {
  actual: ParteClave; partes: Map<string, ParteClave>; lobby: LobbyPhaseView[];
}) {
  const caidas = new Set(
    lobby.filter((f) => estadoDe(f) === 'resuelta').map((f) => partes.get(f.phaseId)).filter(Boolean) as ParteClave[],
  );
  return (
    <svg className="lamina-robot" viewBox="104 14 352 760" aria-hidden="true">
      {(Object.keys(PARTES) as ParteClave[]).map((k) => (
        <path key={k} d={PARTES[k].d}
              className={k === actual ? 'actual' : caidas.has(k) ? 'caida' : ''} />
      ))}
    </svg>
  );
}
