import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminSnapshot, BotonLuzView, LineaLuz, PanelLucesView } from '../shared/events';
import type { AppSocket } from '../lib/socket';
import { call } from '../lib/socket';
import { sonar } from '../lib/sonido';

// ============================================================
//  La pestaña de LUCES.
//
//  Tres cosas, y en este orden porque es el orden en que se usan:
//
//  1. LA PLACA. Está conectada o no, y por qué pines sale luz. Los
//     diagnósticos van aquí porque son lo primero que se toca cuando
//     algo no enciende.
//  2. LOS BOTONES. Las ondas capturadas del mando, con su envío a mano.
//     Es el mando a distancia de la sala metido en el panel.
//  3. LA AUTOMATIZACIÓN. «Cuando pase esto, manda este código por este
//     pin». Es lo único que no existía antes, y es el motivo de traer
//     todo esto aquí: el servidor de Luces no sabe qué es una fase.
//
//  Y debajo la bitácora, que es la única forma de saber si una regla
//  saltó de verdad sin estar mirando la tira de LEDs.
// ============================================================

const MOTIVOS: Record<string, string> = {
  EVENTO_DESCONOCIDO: 'Esa acción del evento no existe',
  BOTON_DESCONOCIDO: 'Ese botón ya no está en el almacén de Luces',
  EQUIPO_DESCONOCIDO: 'Ese equipo ya no existe',
  ESE_EVENTO_NO_LLEVA_EQUIPO: 'Esa acción no la provoca un equipo: no se puede acotar',
  FALTA_BOTON: 'Elige un botón',
  FALTA_ID: 'Falta el identificador',
  OPERACION_DESCONOCIDA: 'Operación desconocida',
  PRUEBA_DESCONOCIDA: 'Prueba desconocida',
  NOT_ALLOWED: 'Esa acción es solo del panel',
  TIMEOUT: 'El servidor no respondió',
};

const motivo = (e?: string): string => {
  if (!e) return 'Error';
  if (e.startsWith('PIN_INVALIDO:')) return `El pin ${e.split(':')[1]} no sirve para emitir`;
  return MOTIVOS[e] ?? e;
};

const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { hour12: false });

/** Los pines, como interruptores. Es lo que hay: nueve casillas. */
function Pines({
  validos, puestos, onCambiar, bloqueado,
}: {
  validos: number[]; puestos: number[];
  onCambiar: (p: number[]) => void; bloqueado?: boolean;
}) {
  return (
    <span className="pines">
      {validos.map((p) => (
        <button
          key={p}
          type="button"
          className={`pin ${puestos.includes(p) ? 'on' : ''}`}
          disabled={bloqueado}
          onClick={() => onCambiar(
            puestos.includes(p) ? puestos.filter((x) => x !== p) : [...puestos, p].sort((a, b) => a - b),
          )}
        >
          {p}
        </button>
      ))}
    </span>
  );
}

export function PanelLuces({
  snapshot, socket, onVolver,
}: {
  snapshot: AdminSnapshot;
  socket: AppSocket;
  onVolver: () => void;
}) {
  const [datos, setDatos] = useState<PanelLucesView | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = useCallback((tipo: 'ok' | 'err', texto: string) => {
    sonar(tipo === 'ok' ? 'ok' : 'error');
    setAviso({ tipo, texto });
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setAviso(null), 5000);
  }, []);
  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current); }, []);

  const recargar = useCallback(async () => {
    const r = await call<PanelLucesView>(socket, 'admin:luces:panel', {});
    setCargando(false);
    if (r.ok && r.data) setDatos(r.data);
    else avisar('err', motivo(r.error));
  }, [socket, avisar]);

  useEffect(() => { void recargar(); }, [recargar]);

  // La bitácora llega sola: es la prueba de que una regla saltó.
  useEffect(() => {
    const alApuntar = (l: LineaLuz) =>
      setDatos((d) => (d ? { ...d, bitacora: [l, ...d.bitacora].slice(0, 40) } : d));
    socket.on('luces:bitacora', alApuntar);
    return () => { socket.off('luces:bitacora', alApuntar); };
  }, [socket]);

  /** Un único punto de emisión: bloquea, avisa y recarga. */
  const hacer = useCallback(async (
    clave: string, evento: string, carga: unknown, exito: string, recargarDespues = true,
  ) => {
    sonar('boton');
    setOcupado(clave);
    const r = await call<Record<string, unknown>>(socket, evento, carga);
    setOcupado(null);
    if (r.ok) {
      const aviso2 = r.data?.aviso ?? r.data?.detalle;
      avisar(r.data?.ok === false ? 'err' : 'ok', String(aviso2 ?? exito));
      if (recargarDespues) await recargar();
    } else {
      avisar('err', motivo(r.error));
    }
    return r;
  }, [socket, avisar, recargar]);

  // ---------- pines globales ----------
  const [pinesBorrador, setPinesBorrador] = useState<number[] | null>(null);
  const pines = pinesBorrador ?? datos?.config.pines ?? [];
  const pinesCambiados = pinesBorrador !== null
    && JSON.stringify(pinesBorrador) !== JSON.stringify(datos?.config.pines ?? []);

  // ---------- botón nuevo / editado ----------
  type Borrador = {
    id?: string; nombre: string; pulsos: number[];
    freq: number; repeticiones: number; gap_ms: number; pines: number[];
  };
  const VACIO: Borrador = {
    nombre: '', pulsos: [], freq: 38000, repeticiones: 1, gap_ms: 40, pines: [],
  };
  const [borrador, setBorrador] = useState<Borrador | null>(null);

  // ---------- regla nueva ----------
  const [regla, setRegla] = useState({ evento: '', teamId: '', botonId: '', pines: [] as number[] });
  const eventoElegido = datos?.eventos.find((e) => e.clave === regla.evento);

  const equipos = useMemo(
    () => snapshot.teams.map((t) => ({ id: t.id, name: t.name })),
    [snapshot.teams],
  );

  if (cargando) {
    return (
      <div className="admin admin-luces">
        <button className="volver-panel" onClick={onVolver}>&lt;&lt; PANEL</button>
        <p className="pendiente">Preguntándole al servidor de Luces…</p>
      </div>
    );
  }

  const validos = datos?.config.pines_validos ?? [];
  const quieto = ocupado !== null;

  return (
    <div className="admin admin-luces">
      <header className="barra">
        <div>
          <h1>LUCES · CONTROL IR</h1>
          <span className="sub">
            {datos?.estado.conectado
              ? `${datos.estado.puerto} · ${datos.estado.version}`
              : 'placa sin conexión'}
            {' · '}{datos?.botones.length ?? 0} botones · {datos?.reglas.length ?? 0} reglas
          </span>
        </div>
        <div className="estado-evento">
          <button className="volver-panel" onClick={onVolver}>&lt;&lt; PANEL</button>
          <span className={`chip ${datos?.estado.conectado ? 'ok' : 'err'}`}>
            {datos?.estado.conectado ? 'placa lista' : 'sin placa'}
          </span>
        </div>
      </header>

      {aviso && <div className={`aviso ${aviso.tipo}`}>{aviso.texto}</div>}

      {/* ── la placa ── */}
      <section className="panel">
        <div className="panel__bar">
          <span className="panel__name">LA PLACA</span>
          <span className="panel__stat">{datos?.url}</span>
        </div>
        <div className="panel__body">
          {!datos?.estado.conectado && (
            <p className="nota-luces err">
              {datos?.estado.motivo ?? 'sin conexión'}
              {datos?.estado.puertos?.length
                ? ` · puertos vistos: ${datos.estado.puertos.join(', ')}`
                : ''}
            </p>
          )}

          <div className="luces-fila">
            <span className="luces-etq">Pines de emisión por defecto</span>
            <Pines validos={validos} puestos={pines} bloqueado={quieto} onCambiar={setPinesBorrador} />
            {pinesCambiados && (
              <button
                className="primaria"
                disabled={quieto}
                onClick={async () => {
                  await hacer('pines', 'admin:luces:config', { pines }, `Pines: ${pines.join(', ')}`);
                  setPinesBorrador(null);
                }}
              >
                GUARDAR
              </button>
            )}
          </div>

          <p className="nota-luces">
            Un botón puede traer sus propios pines. Estos son los que se usan cuando no los trae.
          </p>

          <div className="fila-botones">
            <button
              disabled={quieto || pines.length === 0}
              onClick={() => hacer('probar', 'admin:luces:prueba', { op: 'probar', pines }, 'Probado', false)}
            >
              {ocupado === 'probar' ? 'PROBANDO…' : '[?] PROBAR SI SALE LUZ'}
            </button>
            <button
              disabled={quieto || pines.length === 0}
              onClick={() => hacer('ident', 'admin:luces:prueba', { op: 'identificar', pines, ms: 1500 }, 'Emitiendo', false)}
            >
              {ocupado === 'ident' ? 'EMITIENDO…' : '[*] IDENTIFICAR CON LA CÁMARA'}
            </button>
            <button
              disabled={quieto}
              onClick={() => hacer('nivel', 'admin:luces:prueba', { op: 'nivel' }, 'Receptor leído', false)}
            >
              [=] NIVEL DEL RECEPTOR
            </button>
            <button className="sutil" disabled={quieto} onClick={() => recargar()}>
              &lt;&gt; RECARGAR
            </button>
          </div>
        </div>
      </section>

      {/* ── la automatización ── */}
      <section className="panel">
        <div className="panel__bar">
          <span className="panel__name">AUTOMATIZACIÓN</span>
          <span className="panel__stat">{datos?.reglas.length ?? 0} reglas</span>
        </div>
        <div className="panel__body">
          <p className="nota-luces">
            Cuando pase algo en el evento, manda un código por unos pines. Es lo que hace que
            las luces vayan solas: no hay que estar pulsando nada mientras se gobierna la partida.
          </p>

          <div className="regla-nueva">
            <span className="luces-etq">cuando</span>
            <select
              value={regla.evento}
              disabled={quieto}
              onChange={(e) => setRegla((r) => ({ ...r, evento: e.target.value, teamId: '' }))}
            >
              <option value="">— elige una acción —</option>
              {datos?.eventos.map((e) => (
                <option key={e.clave} value={e.clave}>{e.rotulo}</option>
              ))}
            </select>

            <span className="luces-etq">de</span>
            <select
              value={regla.teamId}
              disabled={quieto || !eventoElegido?.porEquipo}
              title={eventoElegido && !eventoElegido.porEquipo
                ? 'Esa acción no la provoca un equipo'
                : 'Acotar la regla a un equipo'}
              onChange={(e) => setRegla((r) => ({ ...r, teamId: e.target.value }))}
            >
              <option value="">cualquier equipo</option>
              {equipos.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            <span className="luces-etq">manda</span>
            <select
              value={regla.botonId}
              disabled={quieto}
              onChange={(e) => setRegla((r) => ({ ...r, botonId: e.target.value }))}
            >
              <option value="">— elige un botón —</option>
              {datos?.botones.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>

            <span className="luces-etq">por</span>
            <Pines validos={validos} puestos={regla.pines} bloqueado={quieto}
                   onCambiar={(p) => setRegla((r) => ({ ...r, pines: p }))} />
            <span className="nota-luces">
              {regla.pines.length === 0 ? 'los del botón' : ''}
            </span>

            <button
              className="primaria"
              disabled={quieto || !regla.evento || !regla.botonId}
              onClick={async () => {
                const r = await hacer('regla', 'admin:luces:regla', {
                  op: 'crear', evento: regla.evento,
                  teamId: regla.teamId || null, botonId: regla.botonId, pines: regla.pines,
                }, 'Regla añadida');
                if (r.ok) setRegla({ evento: '', teamId: '', botonId: '', pines: [] });
              }}
            >
              + AÑADIR REGLA
            </button>
          </div>

          {datos?.reglas.length === 0 && (
            <p className="pendiente">
              Todavía no hay ninguna. Sin reglas, las luces solo se mueven a mano.
            </p>
          )}

          <ul className="reglas">
            {datos?.reglas.map((r) => {
              const ev = datos.eventos.find((e) => e.clave === r.evento);
              return (
                <li key={r.id} className={r.activa ? '' : 'apagada'}>
                  <button
                    className="interruptor-regla"
                    title={r.activa ? 'Desactivar' : 'Activar'}
                    disabled={quieto}
                    onClick={() => hacer(`alt-${r.id}`, 'admin:luces:regla', { op: 'alternar', id: r.id }, r.activa ? 'Regla desactivada' : 'Regla activada')}
                  >
                    [{r.activa ? 'X' : ' '}]
                  </button>
                  <span className="regla-evento">{ev?.rotulo ?? r.evento}</span>
                  {r.equipo && <span className="chip mini">{r.equipo}</span>}
                  <span className="regla-flecha">&rarr;</span>
                  <span className="regla-boton">{r.botonNombre}</span>
                  <span className="regla-pines">
                    {r.pines.length > 0 ? `pin ${r.pines.join(', ')}` : 'pines del botón'}
                  </span>
                  <button className="sutil" disabled={quieto}
                          onClick={() => hacer(`pr-${r.id}`, 'admin:luces:regla', { op: 'probar', id: r.id }, 'Emitido', false)}>
                    ENSAYAR
                  </button>
                  <button className="peligro" disabled={quieto}
                          onClick={() => hacer(`bo-${r.id}`, 'admin:luces:regla', { op: 'borrar', id: r.id }, 'Regla borrada')}>
                    BORRAR
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── los botones ── */}
      <section className="panel">
        <div className="panel__bar">
          <span className="panel__name">BOTONES</span>
          <span className="panel__stat">{datos?.botones.length ?? 0} guardados</span>
        </div>
        <div className="panel__body">
          {borrador === null ? (
            <div className="fila-botones">
              <button className="mezclar-todo" disabled={quieto} onClick={() => setBorrador({ ...VACIO })}>
                + NUEVO BOTÓN
              </button>
            </div>
          ) : (
            <div className="boton-nuevo">
              <div className="luces-fila">
                <span className="luces-etq">{borrador.id ? 'editando' : 'nombre'}</span>
                <input
                  value={borrador.nombre}
                  maxLength={60}
                  placeholder="LEDs - Rojo"
                  disabled={quieto}
                  onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                />
                <span className="luces-etq">onda</span>
                <span className="chip mini">
                  {borrador.pulsos.length > 0 ? `${borrador.pulsos.length} pulsos` : 'sin capturar'}
                </span>
                <button
                  disabled={quieto}
                  onClick={async () => {
                    const r = await hacer('capt', 'admin:luces:prueba',
                      { op: 'capturar', timeoutMs: 15000 },
                      'Onda capturada', false);
                    const pulsos = (r.data?.pulsos as number[]) ?? [];
                    if (r.ok && pulsos.length > 0) setBorrador((b) => (b ? { ...b, pulsos } : b));
                  }}
                >
                  {ocupado === 'capt' ? 'APUNTA EL MANDO Y PULSA…' : '[o] APRENDER DEL CONTROL'}
                </button>
              </div>

              <div className="luces-fila">
                <span className="luces-etq">portadora</span>
                <input type="number" min={25000} max={60000} value={borrador.freq} disabled={quieto}
                       onChange={(e) => setBorrador({ ...borrador, freq: Number(e.target.value) })} />
                <span className="luces-etq">repeticiones</span>
                <input type="number" min={1} max={20} value={borrador.repeticiones} disabled={quieto}
                       onChange={(e) => setBorrador({ ...borrador, repeticiones: Number(e.target.value) })} />
                <span className="luces-etq">pausa (ms)</span>
                <input type="number" min={0} max={1000} value={borrador.gap_ms} disabled={quieto}
                       onChange={(e) => setBorrador({ ...borrador, gap_ms: Number(e.target.value) })} />
                <span className="luces-etq">pines</span>
                <Pines validos={validos} puestos={borrador.pines} bloqueado={quieto}
                       onCambiar={(p) => setBorrador({ ...borrador, pines: p })} />
              </div>

              <div className="fila-botones">
                <button
                  disabled={quieto || borrador.pulsos.length === 0}
                  onClick={() => hacer('crudo', 'admin:luces:enviar', {
                    pulsos: borrador.pulsos, pines: borrador.pines.length ? borrador.pines : pines,
                    freq: borrador.freq, repeticiones: borrador.repeticiones, gap_ms: borrador.gap_ms,
                  }, 'Emitido sin guardar', false)}
                >
                  [&gt;] PROBAR SIN GUARDAR
                </button>
                <button
                  className="primaria"
                  disabled={quieto || !borrador.nombre.trim() || borrador.pulsos.length === 0}
                  onClick={async () => {
                    const r = await hacer('guardar', 'admin:luces:boton', {
                      op: borrador.id ? 'editar' : 'crear', id: borrador.id, datos: borrador,
                    }, borrador.id ? 'Botón guardado' : 'Botón creado');
                    if (r.ok) setBorrador(null);
                  }}
                >
                  GUARDAR
                </button>
                <button className="sutil" disabled={quieto} onClick={() => setBorrador(null)}>
                  CANCELAR
                </button>
              </div>
            </div>
          )}

          <ul className="botones-luz">
            {datos?.botones.map((b: BotonLuzView) => (
              <li key={b.id}>
                <button
                  className="enviar-luz"
                  disabled={quieto}
                  onClick={() => hacer(`en-${b.id}`, 'admin:luces:enviar', { botonId: b.id }, `Emitido: ${b.nombre}`, false)}
                >
                  {ocupado === `en-${b.id}` ? '…' : '[>]'} {b.nombre}
                </button>
                <span className="regla-pines">
                  {b.pines.length > 0 ? `pin ${b.pines.join(', ')}` : 'pines por defecto'}
                </span>
                <span className="regla-pines">{b.pulsos} pulsos · {b.freq} Hz · x{b.repeticiones}</span>
                <button className="sutil" disabled={quieto}
                        onClick={() => setBorrador({
                          id: b.id, nombre: b.nombre, pulsos: [],
                          freq: b.freq, repeticiones: b.repeticiones, gap_ms: b.gap_ms, pines: b.pines,
                        })}>
                  EDITAR
                </button>
                <button className="peligro" disabled={quieto}
                        onClick={() => {
                          if (!confirm(`¿Borrar «${b.nombre}»?\n\nLa onda no se puede regenerar: se capturó con el mando en la mano. Las reglas que la usen se quedarán desactivadas.`)) return;
                          void hacer(`bb-${b.id}`, 'admin:luces:boton', { op: 'borrar', id: b.id }, 'Botón borrado');
                        }}>
                  BORRAR
                </button>
              </li>
            ))}
          </ul>

          {borrador?.id && (
            <p className="nota-luces">
              Editando «{datos?.botones.find((b) => b.id === borrador.id)?.nombre}». Si no capturas
              una onda nueva, se queda la que ya tenía.
            </p>
          )}
        </div>
      </section>

      {/* ── la bitácora ── */}
      <section className="panel">
        <div className="panel__bar">
          <span className="panel__name">BITÁCORA</span>
          <span className="panel__stat">últimas {datos?.bitacora.length ?? 0}</span>
        </div>
        <div className="panel__body">
          {datos?.bitacora.length === 0 && (
            <p className="pendiente">Todavía no ha saltado ninguna luz.</p>
          )}
          <ul className="bitacora-luz">
            {datos?.bitacora.map((l, i) => (
              <li key={`${l.at}-${i}`} className={l.ok ? '' : 'mal'}>
                <span className="bl-hora">{hora(l.at)}</span>
                <span className="bl-evento">{l.evento}</span>
                <span className="bl-boton">{l.boton}</span>
                <span className="regla-pines">{l.pines.length ? `pin ${l.pines.join(', ')}` : ''}</span>
                <span className="bl-detalle">{l.detalle}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
