import { useEffect, useMemo, useState } from 'react';
import type { AppSocket } from '../lib/socket';
import { call } from '../lib/socket';
import { sonar } from '../lib/sonido';
import { LetreroRobot } from '../player/LetreroRobot';
import {
  NIVELES_PISTA,
  type AdminSnapshot, type CatalogoPistas, type ConsejoRobot, type DestinoPista,
  type NivelPista, type PistaEnviada, type ResultadoPista,
} from '../shared/events';

// ============================================================
//  PISTAS
//
//  Tres pasos: el nivel (no obvia, normal, muy obvia), a quién (equipos
//  sueltos, los que están en una fase, o todos) y cuál de las tres del
//  nivel. Sin elegir cuál, a cada equipo le sale la siguiente que no ha
//  recibido de su fase y capa: para un equipo atascado se va subiendo de
//  nivel sin repetirle nada.
// ============================================================

export const NOMBRE_NIVEL: Record<NivelPista, string> = { sutil: 'NO OBVIA', normal: 'NORMAL', obvia: 'MUY OBVIA' };
const QUE_ES: Record<NivelPista, string> = {
  sutil: 'Dónde mirar o qué preguntarse.',
  normal: 'El concepto y el siguiente paso.',
  obvia: 'Casi la solución, paso a paso.',
};

type Equipo = AdminSnapshot['teams'][number];
type Fase = AdminSnapshot['phases'][number];
type TipoDestino = DestinoPista['tipo'];

/** Igual que en el servidor (`siguienteIndice`): la primera que no ha
 *  recibido; si ya tuvo las tres, la que recibió hace más tiempo. */
function siguiente(pistas: PistaEnviada[], phaseId: string, capa: number, nivel: NivelPista, total: number) {
  const previas = pistas.filter((p) => p.phaseId === phaseId && p.capa === capa && p.nivel === nivel);
  for (let i = 0; i < total; i++) if (!previas.some((p) => p.indice === i)) return i;
  const ultima = (i: number) => Math.max(...previas.filter((p) => p.indice === i).map((p) => p.at));
  let mejor = 0;
  for (let i = 1; i < total; i++) if (ultima(i) < ultima(mejor)) mejor = i;
  return mejor;
}

const nombreFase = (f: Fase | undefined) => f ? (f.title.split(' — ')[1] ?? f.title) : '—';
const etiquetaFase = (f: Fase | undefined) => !f ? '—' : f.esBonus ? `♥ ${nombreFase(f)}` : `F${f.order} ${nombreFase(f)}`;
const hace = (at: number) => {
  const min = Math.max(0, Math.round((Date.now() - at) / 60_000));
  return min < 1 ? 'ahora' : min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h ${min % 60} min`;
};
/** Los comandos van entre comillas invertidas: en el panel, en código. */
const conCodigo = (t: string) => t.split(/`([^`]+)`/).map((p, i) => (i % 2 ? <code key={i}>{p}</code> : <span key={i}>{p}</span>));

export function PanelPistas({ socket, snapshot, onAviso }: {
  socket: AppSocket;
  snapshot: AdminSnapshot;
  onAviso: (a: { tipo: 'ok' | 'err'; texto: string }) => void;
}) {
  const { phases, teams } = snapshot;
  const [catalogo, setCatalogo] = useState<CatalogoPistas | null>(null);
  const [nivel, setNivel] = useState<NivelPista>('sutil');
  const [tipo, setTipo] = useState<TipoDestino>('equipos');
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [phaseId, setPhaseId] = useState<string>('');
  /** null = la siguiente no enviada de cada equipo. */
  const [indice, setIndice] = useState<number | null>(null);
  const [previa, setPrevia] = useState<ConsejoRobot | null>(null);
  const [mandando, setMandando] = useState(false);

  useEffect(() => {
    call<CatalogoPistas>(socket, 'admin:pistas:catalogo', {}).then((r) => {
      if (r.ok && r.data) setCatalogo(r.data);
      else onAviso({ tipo: 'err', texto: `No se pudieron cargar las pistas (${r.error ?? 'error'})` });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const faseDe = useMemo(() => new Map(phases.map((f) => [f.id, f])), [phases]);
  const conPistas = (f: Fase | undefined) => !!f && !!catalogo?.[f.key]?.capas.length;
  const capaDe = (f: Fase, capa: number) => {
    const capas = catalogo?.[f.key]?.capas ?? [];
    const i = Math.min(Math.max(1, capa), capas.length) - 1;
    return capas.length ? { n: i + 1, ...capas[i] } : null;
  };
  const enFase = (id: string) => teams.filter((t) => t.ubicacion?.phaseId === id);

  // Si la fase elegida deja de estar en la lista (se cerró), se suelta.
  const fasesDestino = phases.filter((f) => f.status === 'ACTIVE' && conPistas(f)).sort((a, b) => a.order - b.order);
  useEffect(() => {
    if (phaseId && !fasesDestino.some((f) => f.id === phaseId)) setPhaseId('');
  }, [phaseId, fasesDestino]);

  // Los que recibirían la pista con lo elegido ahora.
  const destinatarios: Equipo[] =
    tipo === 'equipos' ? teams.filter((t) => elegidos.includes(t.id))
    : tipo === 'fase' ? (phaseId ? enFase(phaseId) : [])
    : teams;
  const reciben = destinatarios.filter((t) => t.ubicacion && conPistas(faseDe.get(t.ubicacion.phaseId)));
  const fuera = destinatarios.filter((t) => !reciben.includes(t));

  // Agrupados por fase y capa: cada grupo ve las mismas tres pistas.
  const grupos = (() => {
    const m = new Map<string, { fase: Fase; capa: number; equipos: Equipo[] }>();
    for (const t of reciben) {
      const fase = faseDe.get(t.ubicacion!.phaseId)!;
      const c = capaDe(fase, t.ubicacion!.capa);
      if (!c) continue;
      const k = `${fase.id}:${c.n}`;
      if (!m.has(k)) m.set(k, { fase, capa: c.n, equipos: [] });
      m.get(k)!.equipos.push(t);
    }
    return [...m.values()].sort((a, b) => a.fase.order - b.fase.order || a.capa - b.capa);
  })();

  const alternar = (id: string) =>
    setElegidos((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  const destino: DestinoPista | null =
    tipo === 'equipos' ? (elegidos.length ? { tipo, teamIds: elegidos } : null)
    : tipo === 'fase' ? (phaseId ? { tipo, phaseId } : null)
    : { tipo: 'todos' };

  const textoDestino =
    tipo === 'equipos' ? (elegidos.length === 1 ? teams.find((t) => t.id === elegidos[0])?.name ?? '' : `${elegidos.length} EQUIPOS`)
    : tipo === 'fase' ? `${etiquetaFase(faseDe.get(phaseId)).toUpperCase()}`
    : 'TODOS';

  async function mandar() {
    if (!destino || reciben.length === 0) return;
    const cual = indice === null ? 'la siguiente que no han recibido' : `la pista ${indice + 1}`;
    if (tipo !== 'equipos' || reciben.length > 1) {
      if (!confirm(`¿Mandar una pista ${NOMBRE_NIVEL[nivel]} a ${reciben.length} equipo(s)?\n\nA cada uno le llega ${cual} del nivel, de la fase y capa en que está.`)) return;
    }
    sonar('boton');
    setMandando(true);
    const r = await call<ResultadoPista>(socket, 'admin:pista', { destino, nivel, indice });
    setMandando(false);
    if (!r.ok || !r.data) { onAviso({ tipo: 'err', texto: r.error ?? 'No se pudo mandar la pista' }); return; }
    const { enviadas, omitidos } = r.data;
    const dicho = enviadas.length === 1
      ? `Pista ${NOMBRE_NIVEL[nivel]} ${enviadas[0].indice + 1} mandada a ${enviadas[0].equipo}`
      : `Pista ${NOMBRE_NIVEL[nivel]} mandada a ${enviadas.length} equipos`;
    const sin = omitidos.length ? ` · sin pista: ${omitidos.map((o) => `${o.equipo} (${o.motivo})`).join(', ')}` : '';
    onAviso({ tipo: enviadas.length ? 'ok' : 'err', texto: enviadas.length ? dicho + sin : `Nadie la recibió${sin}` });
  }

  // Lo último que se mandó, de todos los equipos.
  const historial = teams
    .flatMap((t) => t.pistas.map((p) => ({ ...p, equipo: t.name })))
    .sort((a, b) => b.at - a.at)
    .slice(0, 12);

  if (!catalogo) return <p className="pendiente">Cargando pistas…</p>;

  return (
    <div className="pistas">
      {/* 1 · NIVEL */}
      <fieldset className="pistas__paso">
        <legend>1 · NIVEL</legend>
        <div className="pistas__niveles" role="radiogroup" aria-label="Nivel de la pista">
          {NIVELES_PISTA.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={nivel === n}
                    className={`pistas__nivel nivel-${n}${nivel === n ? ' activo' : ''}`}
                    onClick={() => setNivel(n)}>
              <strong>{NOMBRE_NIVEL[n]}</strong>
              <span>{QUE_ES[n]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* 2 · A QUIÉN */}
      <fieldset className="pistas__paso">
        <legend>2 · A QUIÉN</legend>
        <div className="pistas__destinos" role="radiogroup" aria-label="A quién">
          {([['equipos', 'EQUIPOS'], ['fase', 'UNA FASE'], ['todos', 'TODOS']] as const).map(([v, txt]) => (
            <button key={v} type="button" role="radio" aria-checked={tipo === v}
                    className={tipo === v ? 'activo' : ''} onClick={() => setTipo(v)}>{txt}</button>
          ))}
        </div>

        {tipo === 'equipos' && (
          <>
            <div className="pistas__equipos">
              {teams.map((t) => {
                const f = t.ubicacion ? faseDe.get(t.ubicacion.phaseId) : undefined;
                const ultima = t.pistas[t.pistas.length - 1];
                return (
                  <label key={t.id} className={`pistas__equipo${elegidos.includes(t.id) ? ' activo' : ''}${!f ? ' sin-fase' : ''}`}>
                    <input type="checkbox" checked={elegidos.includes(t.id)} onChange={() => alternar(t.id)} />
                    <strong>{t.name}</strong>
                    <span>{f ? `${etiquetaFase(f)} · capa ${t.ubicacion!.capa}` : 'sin fase abierta'}</span>
                    <span className="pistas__cuenta">
                      {t.pistas.length === 0 ? 'sin pistas' : `${t.pistas.length} pista(s) · última ${NOMBRE_NIVEL[ultima.nivel].toLowerCase()} ${ultima.indice + 1}, ${hace(ultima.at)}`}
                    </span>
                  </label>
                );
              })}
            </div>
            {elegidos.length > 0 && (
              <button type="button" className="sutil pistas__limpiar" onClick={() => setElegidos([])}>quitar selección</button>
            )}
          </>
        )}

        {tipo === 'fase' && (
          <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} aria-label="Fase">
            <option value="">— elige una fase abierta —</option>
            {fasesDestino.map((f) => (
              <option key={f.id} value={f.id}>{f.title} · {enFase(f.id).length} equipo(s)</option>
            ))}
          </select>
        )}
        {tipo === 'fase' && fasesDestino.length === 0 && <p className="pistas__nota">No hay fases abiertas con pistas.</p>}
        {tipo === 'todos' && (
          <p className="pistas__nota">A cada equipo le llega la pista de la fase y capa en que esté.</p>
        )}
      </fieldset>

      {/* 3 · CUÁL */}
      <fieldset className="pistas__paso">
        <legend>3 · CUÁL</legend>
        <div className="pistas__cual" role="radiogroup" aria-label="Cuál de las tres">
          <button type="button" role="radio" aria-checked={indice === null}
                  className={indice === null ? 'activo' : ''} onClick={() => setIndice(null)}>
            LA SIGUIENTE QUE NO TIENEN
          </button>
          {[0, 1, 2].map((i) => (
            <button key={i} type="button" role="radio" aria-checked={indice === i}
                    className={indice === i ? 'activo' : ''} onClick={() => setIndice(i)}>
              PISTA {i + 1}
            </button>
          ))}
        </div>

        {grupos.length === 0 && (
          <p className="pistas__nota">
            {destinatarios.length === 0 ? 'Elige a quién se la mandas para ver las pistas.' : 'Ninguno de esos equipos está en una fase con pistas.'}
          </p>
        )}
        {grupos.map((g) => {
          const c = capaDe(g.fase, g.capa)!;
          const lista = c[nivel];
          const tocaA = (i: number) => g.equipos.filter((t) =>
            (indice ?? siguiente(t.pistas, g.fase.id, g.capa, nivel, lista.length)) === i);
          return (
            <div key={`${g.fase.id}:${g.capa}`} className="pistas__grupo">
              <p className="pistas__grupo-cab">
                <strong>{etiquetaFase(g.fase)}</strong> · capa {g.capa} · {c.nombre}
                <span>{g.equipos.map((t) => t.name).join(', ')}</span>
              </p>
              <ol className="pistas__lista">
                {lista.map((texto, i) => {
                  const van = tocaA(i);
                  const yaLaTienen = g.equipos.filter((t) => t.pistas.some((p) =>
                    p.phaseId === g.fase.id && p.capa === g.capa && p.nivel === nivel && p.indice === i));
                  return (
                    <li key={i} className={van.length ? 'sale' : ''}>
                      <span className="pistas__num">{i + 1}</span>
                      <p>{conCodigo(texto)}</p>
                      <div className="pistas__marcas">
                        {van.length > 0 && <span className="pistas__sale">→ {van.length === g.equipos.length ? 'sale' : van.map((t) => t.name).join(', ')}</span>}
                        {yaLaTienen.length > 0 && (
                          <span className="pistas__ya">
                            {g.equipos.length === 1 ? 'ya la recibió' : `ya la tienen ${yaLaTienen.length}/${g.equipos.length}`}
                          </span>
                        )}
                        <button type="button" className="sutil" title="Ver cómo la verán en el letrero"
                                onClick={() => setPrevia({
                                  id: `${Date.now()}`, fase: g.fase.title, capa: g.capa, nombreCapa: c.nombre,
                                  rol: 'TERMINAL', texto, nivel, numero: i + 1,
                                })}>ver</button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
        {fuera.length > 0 && (
          <p className="pistas__nota">Sin pista: {fuera.map((t) => t.name).join(', ')} (no están en una fase abierta con pistas).</p>
        )}
      </fieldset>

      <button type="button" className={`pistas__mandar nivel-${nivel}`}
              disabled={mandando || !destino || reciben.length === 0} onClick={mandar}>
        {mandando ? 'MANDANDO…' : `[?] MANDAR PISTA ${NOMBRE_NIVEL[nivel]} · ${textoDestino || '…'}`}
      </button>

      {historial.length > 0 && (
        <details className="pistas__historial">
          <summary>ÚLTIMAS PISTAS MANDADAS</summary>
          <ul>
            {historial.map((p) => (
              <li key={`${p.equipo}-${p.at}`}>
                <span>{hace(p.at)}</span> <strong>{p.equipo}</strong> · {etiquetaFase(faseDe.get(p.phaseId))} capa {p.capa}
                {' '}· <span className={`nivel-${p.nivel}`}>{NOMBRE_NIVEL[p.nivel]} {p.indice + 1}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {previa && <LetreroRobot consejo={previa} ensayo onCerrar={() => setPrevia(null)} />}
    </div>
  );
}
