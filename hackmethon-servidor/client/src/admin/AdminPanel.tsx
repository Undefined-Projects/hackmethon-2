import { useEffect, useRef, useState } from 'react';
import { PanelIntros } from './PanelIntros';
import { PruebaAnimaciones } from './PruebaAnimaciones';
import { PanelPistas } from './PanelPistas';
import type { AdminSnapshot } from '../shared/events';
import type { AppSocket } from '../lib/socket';
import { call } from '../lib/socket';
import { sonar } from '../lib/sonido';
import { formatMs, roleLabel } from '../lib/format';
import { ROLES, type Role } from '../shared/constants';
import { Carrera } from './Carrera';
import { CarreraPrueba } from './CarreraPrueba';
import { AtaquePrueba } from './AtaquePrueba';
import { EditorMapa } from './EditorMapa';
import { MapaSala } from './MapaSala';
import { Proyeccion } from './Proyeccion';
import { IdentidadEquipo } from './IdentidadEquipo';
import { PanelFinal } from './PanelFinal';
import { PanelLuces } from './PanelLuces';
import { PanelMinijuegos } from './PanelMinijuegos';
import { PanelRobot } from './PanelRobot';
import { PanelAtaques } from './PanelAtaques';
import { BolsaEquipo } from './BolsaEquipo';
import { ListaEquipos, MoverEquipo } from './ListaEquipos';

type Props = { snapshot: AdminSnapshot; socket: AppSocket; online: boolean };

// ============================================================
//  Las vistas de sala viven en el hash, no en un estado suelto.
//
//  Así la proyección se abre en SU PROPIA VENTANA —`…/#proyeccion`,
//  arrastrada al segundo monitor y puesta a pantalla completa— y
//  sobrevive a un F5 sin volver al panel a mitad del evento.
//
//  No es una ruta de verdad y no abre ninguna puerta: quien no traiga
//  un código de admin no llega aquí escribiendo la URL, porque el
//  reparto lo sigue decidiendo el `kind` del snapshot, en el servidor.
// ============================================================
type Vista = 'panel' | 'carrera' | 'prueba-carrera' | 'prueba-ataque' | 'mapa' | 'mapa-editor' | 'proyeccion' | 'luces';
const VISTAS: Vista[] = ['carrera', 'prueba-carrera', 'prueba-ataque', 'mapa', 'mapa-editor', 'proyeccion', 'luces'];

// ============================================================
//  Las pestañas del panel. Lo que se usa durante el evento va primero;
//  lo que solo se ensaya, al final y aparte, para no pulsarlo sin querer.
//  La pestaña se recuerda en este navegador: es comodidad, no estado.
// ============================================================
type Pestana = 'vivo' | 'equipos' | 'pistas' | 'sala' | 'pantallas' | 'ensayos';
const PESTANA_KEY = 'hm:admin:pestana';
const leerPestana = (): Pestana => {
  try {
    const p = localStorage.getItem(PESTANA_KEY);
    return p === 'equipos' || p === 'pistas' || p === 'sala' || p === 'pantallas' || p === 'ensayos' ? p : 'vivo';
  } catch { return 'vivo'; }
};
/** Cómo se ven los equipos: fichas completas o lista para mover gente. */
type VistaEquipos = 'fichas' | 'lista';
const VISTA_EQUIPOS_KEY = 'hm:admin:vista-equipos';
const leerVistaEquipos = (): VistaEquipos => {
  try { return localStorage.getItem(VISTA_EQUIPOS_KEY) === 'lista' ? 'lista' : 'fichas'; } catch { return 'fichas'; }
};

/** Las vistas de sala, con lo que son. `ventana`: se abren aparte, con
 *  nombre, y pulsar otra vez la trae al frente en vez de abrir otra. */
const PANTALLAS: { nombre: string; que: string; vista?: Vista; ventana?: string }[] = [
  { nombre: 'Carrera', que: 'La carrera de los equipos por las fases, para el proyector.', vista: 'carrera' },
  { nombre: 'Proyección', que: 'La escena de la fase destacada, para la pared de la sala.', vista: 'proyeccion' },
  { nombre: 'Mapa del auditorio', que: 'Dónde está cada mesa, para el proyector o la entrada.', ventana: 'mapa' },
  { nombre: 'Editar mapa', que: 'Colocar mesas y equipos en el plano del auditorio.', vista: 'mapa-editor' },
  { nombre: 'Luces', que: 'Las luces de la sala: botones infrarrojos y automatización.', vista: 'luces' },
];

const leerHash = (): Vista => {
  const h = window.location.hash.replace(/^#/, '');
  return (VISTAS as string[]).includes(h) ? (h as Vista) : 'panel';
};

export function AdminPanel({ snapshot, socket, online }: Props) {
  // La carrera es otra vista de los MISMOS datos, no otra pantalla: por eso
  // vive dentro del panel y no en una ruta. Lo normal es abrir una segunda
  // pestaña con el mismo código y dejarla en la carrera para el proyector,
  // mientras en la primera se sigue gobernando el evento.
  const [vista, setVista] = useState<Vista>(leerHash);
  const [busy, setBusy] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const [pestana, setPestana] = useState<Pestana>(leerPestana);
  const [vistaEquipos, setVistaEquipos] = useState<VistaEquipos>(leerVistaEquipos);
  const elegirVistaEquipos = (v: VistaEquipos) => {
    setVistaEquipos(v);
    try { localStorage.setItem(VISTA_EQUIPOS_KEY, v); } catch { /* sin almacenamiento */ }
  };
  const elegir = (p: Pestana) => {
    setPestana(p);
    try { localStorage.setItem(PESTANA_KEY, p); } catch { /* sin almacenamiento */ }
  };
  // El código va en el localStorage, así que la ventana nueva entra sola
  // como admin.
  const abrirVentana = (v: string) =>
    window.open(`${window.location.pathname}${window.location.search}#${v}`, `hackmethon-${v}`);

  // Botón «atrás» del navegador y ventanas abiertas a mano: las dos
  // cambian el hash sin pasar por aquí.
  useEffect(() => {
    const alCambiar = () => setVista(leerHash());
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  // `replaceState` y no `location.hash = ''`: asignar vacío deja un `#`
  // colgando en la barra y mete una entrada en el historial por cada ida
  // y vuelta al panel.
  const ir = (v: Vista) => {
    const destino = v === 'panel'
      ? window.location.pathname + window.location.search
      : `#${v}`;
    window.history.replaceState(null, '', destino);
    setVista(v);
  };

  // El aviso efímero, con UN SOLO temporizador.
  //
  // Antes cada aviso programaba su propio borrado a los 4 s sin cancelar
  // el del anterior, así que dos acciones seguidas se pisaban: el reloj
  // del primero vencía y se llevaba por delante el mensaje del segundo a
  // los doscientos milisegundos de aparecer. En un panel en vivo eso es
  // un error que nadie llega a leer.
  const relojAviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisar = (a: { tipo: 'ok' | 'err'; texto: string }) => {
    sonar(a.tipo === 'ok' ? 'ok' : 'error');
    setAviso(a);
    if (relojAviso.current) clearTimeout(relojAviso.current);
    relojAviso.current = setTimeout(() => setAviso(null), 4000);
  };
  useEffect(() => () => { if (relojAviso.current) clearTimeout(relojAviso.current); }, []);

  // Un único punto de emisión: bloquea el botón, muestra el resultado y
  // NO toca el estado local. El repintado llega por el snapshot del
  // servidor, que es la única fuente de verdad.
  async function accion(key: string, event: string, payload: unknown, exito: string) {
    sonar('boton');
    setBusy(key);
    const r = await call(socket, event, payload);
    setBusy(null);
    avisar(r.ok ? { tipo: 'ok', texto: exito } : { tipo: 'err', texto: r.error ?? 'Error' });
    return r;
  }

  // Lo que le toca a cada puesto. Va aqui y no en el servidor porque es
  // el TEXTO del boton: el admin tiene que saber que va a provocar antes
  // de pulsarlo, no despues.
  const AVERIA: Record<string, string> = {
    TERMINAL: 'el robot se ríe y teclea por él 3 s',
    PANTALLA: 'avisos con el robot riéndose 12 s',
    DATOS: 'los brazos del robot sacuden la pantalla 12 s',
  };

  const { event, phases, teams } = snapshot;
  const jugadores = teams.flatMap((t) => t.members);
  const conectados = jugadores.filter((m) => m.connected).length;

  // La proyección va sin el armazón del panel: es una pared, no una
  // pantalla de trabajo.
  if (vista === 'proyeccion') {
    return <Proyeccion snapshot={snapshot} onVolver={() => ir('panel')} />;
  }

  // Las luces son otra pestaña del panel, no una vista de sala: se
  // gobierna desde el mismo puesto y se vuelve con `<< PANEL`.
  if (vista === 'luces') {
    return <PanelLuces snapshot={snapshot} socket={socket} onVolver={() => ir('panel')} />;
  }

  // El mapa del auditorio y su editor. El mapa vive normalmente en su
  // propia ventana (ver el botón MAPA), pero también se llega desde el
  // editor con VER MAPA, y de él al editor con EDITAR MAPA.
  if (vista === 'mapa') {
    return <MapaSala snapshot={snapshot} onVolver={() => ir('panel')} onEditar={() => ir('mapa-editor')} />;
  }
  // Lo que ve un jugador al pulsar ATACAR, simulado en este navegador.
  if (vista === 'prueba-ataque') {
    return <AtaquePrueba snapshot={snapshot} onVolver={() => ir('panel')} />;
  }
  if (vista === 'mapa-editor') {
    return <EditorMapa snapshot={snapshot} socket={socket} onVolver={() => ir('panel')} onVerMapa={() => ir('mapa')} />;
  }

  // La carrera de prueba: la misma vista con una partida inventada que
  // corre sola en este navegador. No emite nada al servidor.
  if (vista === 'prueba-carrera') {
    return <CarreraPrueba snapshot={snapshot} onVolver={() => ir('panel')} />;
  }

  if (vista === 'carrera') {
    return (
      <div className="admin admin-carrera">
        <button className="volver-panel" onClick={() => ir('panel')}>&lt;&lt; PANEL</button>
        <Carrera snapshot={snapshot} />
      </div>
    );
  }

  // Las pestañas: lo de durante el evento, separado de lo que se ensaya.
  const alertas = teams.filter((t) => t.alertas.pegados > 0 || t.alertas.rafagas > 0 || t.alertas.rapidas.length > 0).length;
  const activas = phases.filter((p) => p.status === 'ACTIVE').length;
  const totalPistas = teams.reduce((n, t) => n + t.pistas.length, 0);
  const PESTANAS: { id: Pestana; nombre: string; marca?: string; peligro?: boolean }[] = [
    { id: 'vivo', nombre: 'EN VIVO', marca: `${activas} abierta(s)` },
    { id: 'equipos', nombre: 'EQUIPOS', marca: alertas ? `[!] ${alertas}` : `${teams.length}`, peligro: alertas > 0 },
    { id: 'pistas', nombre: 'PISTAS', marca: totalPistas ? `${totalPistas} mandadas` : undefined },
    { id: 'sala', nombre: 'MINIJUEGOS Y ATAQUES', marca: snapshot.minijuego ? 'en juego' : undefined },
    { id: 'pantallas', nombre: 'PANTALLAS' },
    { id: 'ensayos', nombre: 'ENSAYOS' },
  ];

  return (
    <div className="admin">
      <header className="barra">
        <div>
          <h1>HACK(ME)THON<span className="edicion__ver">2.0</span> · CONTROL</h1>
          <span className="sub">
            {conectados}/{jugadores.length} jugadores en línea · {teams.length} equipos ·
            {' '}{event.shuffleCount} mezclas
          </span>
        </div>
        <div className="estado-evento">
          {/* Pausar y reanudar, siempre a mano: es lo que corre prisa. */}
          {event.status === 'RUNNING' && (
            <button className="sutil" disabled={busy !== null}
                    onClick={() => accion('ev-PAUSED', 'admin:event:status', { status: 'PAUSED' }, 'Evento → PAUSED')}>
              || PAUSAR
            </button>
          )}
          {event.status === 'PAUSED' && (
            <button className="activo" disabled={busy !== null}
                    onClick={() => accion('ev-RUNNING', 'admin:event:status', { status: 'RUNNING' }, 'Evento → RUNNING')}>
              &gt; REANUDAR
            </button>
          )}
          <span className={`chip estado-${event.status}`}>{event.status}</span>
          <span className={`chip ${online ? 'ok' : 'err'}`}>{online ? 'conectado' : 'sin conexión'}</span>
        </div>
      </header>

      <nav className="admin-pestanas" aria-label="Secciones del panel">
        {PESTANAS.map((t) => (
          <button key={t.id} type="button" className={pestana === t.id ? 'activo' : ''}
                  aria-current={pestana === t.id ? 'page' : undefined} onClick={() => elegir(t.id)}>
            {t.nombre}
            {t.marca && <span className={`admin-pestanas__marca${t.peligro ? ' peligro' : ''}`}>{t.marca}</span>}
          </button>
        ))}
      </nav>

      {aviso && <div className={`aviso ${aviso.tipo}`}>{aviso.texto}</div>}

      {pestana === 'vivo' && (
        <>
          <section className="panel">
            <div className="panel__bar">
              <span className="panel__name">EVENTO</span>
              <span className="panel__stat">{event.status}</span>
            </div>
            <div className="panel__body">
            <div className="fila-botones">
              {(['RUNNING', 'PAUSED', 'FINISHED'] as const).map((s) => (
                <button
                  key={s}
                  disabled={busy !== null || event.status === s}
                  className={event.status === s ? 'activo' : ''}
                  onClick={() => accion(`ev-${s}`, 'admin:event:status', { status: s }, `Evento → ${s}`)}
                >
                  {s === 'RUNNING' ? '> REANUDAR' : s === 'PAUSED' ? '|| PAUSAR' : '[] FINALIZAR'}
                </button>
              ))}
            </div>
            {/* Acceso libre. Es un interruptor, no un boton de accion: tiene que
                leerse de un vistazo si esta encendido, porque cambia como se
                comporta el evento entero y es facil olvidarse de apagarlo. */}
            <div className="fila-botones">
              <button
                className={`interruptor ${event.libreAcceso ? 'encendido' : ''}`}
                disabled={busy !== null}
                onClick={() => {
                  const libre = !event.libreAcceso;
                  if (libre && !confirm('¿Permitir que los equipos entren a CUALQUIER fase abierta?\n\nDejaran de necesitar haber resuelto la anterior. Las fases siguen necesitando que tu las abras, y una fase ya resuelta sigue sin poder rejugarse.')) return;
                  accion(
                    'acceso', 'admin:event:acceso', { libre },
                    libre ? 'Acceso libre ACTIVADO' : 'Acceso libre desactivado',
                  );
                }}
              >
                {busy === 'acceso'
                  ? 'CAMBIANDO…'
                  : `[${event.libreAcceso ? 'X' : ' '}] ACCESO LIBRE A FASES ABIERTAS`}
              </button>
            </div>

            {event.libreAcceso && (
              <p className="nota-acceso">
                Acceso libre activo: cualquier fase que abras es accesible aunque el equipo
                no haya resuelto la anterior. La cadena vuelve al apagarlo.
              </p>
            )}


            {event.paused && (
              <p className="nota-pausa">
                Evento en pausa: el cronómetro de todas las fases sin resolver está detenido.
              </p>
            )}
            </div>
          </section>
          <section className="panel">
            <div className="panel__bar">
              <span className="panel__name">BARRERAS</span>
              <span className="panel__stat">
                {phases.filter((p) => p.status === 'ACTIVE').length} activa(s) de {phases.length}
              </span>
            </div>
            <div className="panel__body">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Fase</th><th>Estado</th><th>Resueltas</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {phases.map((p) => {
                  const resueltas = teams.filter((t) =>
                    t.progress.some((x) => x.phaseId === p.id && x.status === 'SOLVED'),
                  ).length;
                  return (
                    <tr key={p.id} className={event.focusPhaseId === p.id ? 'destacada' : ''}>
                      <td>{p.order}</td>
                      <td>
                        {p.title}
                        {/* Cuál cierra el evento y cuál está fuera del recorrido.
                            Sin esto hay que saberlo de memoria, y el que gobierna
                            el evento no tiene por qué. */}
                        {p.esFinal && <span className="chip mini marca-final">FINAL</span>}
                        {p.esBonus && <span className="chip mini marca-bonus">BONUS</span>}
                      </td>
                      <td><span className={`chip fase-${p.status}`}>{p.status}</span></td>
                      <td>{resueltas}/{teams.length}</td>
                      <td className="acciones">
                        <button
                          className="primaria"
                          disabled={busy !== null || p.status === 'ACTIVE'}
                          onClick={() => accion(`open-${p.id}`, 'admin:phase:open', { phaseId: p.id }, `Fase abierta: ${p.title}`)}
                        >
                          Abrir
                        </button>
                        <button
                          className="peligro"
                          disabled={busy !== null || p.status !== 'ACTIVE'}
                          onClick={() => {
                            if (!confirm(`¿Cerrar "${p.title}"? Los equipos que no la hayan resuelto quedarán como FAILED.`)) return;
                            accion(`close-${p.id}`, 'admin:phase:close', { phaseId: p.id }, `Fase cerrada: ${p.title}`);
                          }}
                        >
                          Cerrar
                        </button>
                        <button
                          className="sutil"
                          disabled={busy !== null}
                          onClick={() =>
                            accion(`focus-${p.id}`, 'admin:phase:focus',
                              { phaseId: event.focusPhaseId === p.id ? null : p.id },
                              event.focusPhaseId === p.id ? 'Destacado retirado' : 'Fase destacada')
                          }
                        >
                          {event.focusPhaseId === p.id ? '[*]' : '[ ]'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </section>
          {snapshot.final && (
            <PanelFinal
              final={snapshot.final}
              socket={socket}
              bloqueado={busy !== null}
              paused={event.paused}
              onAviso={avisar}
            />
          )}

          <section className="panel panel--peligro">
            <div className="panel__bar">
              <span className="panel__name">ZONA DE PELIGRO</span>
            </div>
            <div className="panel__body">
              <div className="fila-botones">
                <button
                  className="peligro"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!confirm('¿Reiniciar el juego?\n\nSe borra TODO el progreso (tiempos, intentos, fases resueltas), los roles vuelven a su reparto inicial y el acceso libre se apaga. Los equipos y sus códigos de acceso NO se tocan.')) return;
                    accion('reset', 'admin:event:reset', {}, 'Juego reiniciado');
                  }}
                >
                  {busy === 'reset' ? 'REINICIANDO…' : '<< REINICIAR JUEGO'}
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {pestana === 'equipos' && (
        <section className="panel">
          <div className="panel__bar">
            <span className="panel__name">EQUIPOS Y ROLES</span>
            <span className="panel__stat">{conectados}/{jugadores.length} en línea</span>
          </div>
          <div className="panel__body">
          <div className="cabecera-seccion">
            <h2>Reparto actual</h2>
            <div className="vista-equipos" role="group" aria-label="Cómo ver los equipos">
              {(['fichas', 'lista'] as const).map((v) => (
                <button key={v} type="button" className={vistaEquipos === v ? 'activo' : ''}
                        aria-pressed={vistaEquipos === v} onClick={() => elegirVistaEquipos(v)}>
                  {v === 'fichas' ? '[#] FICHAS' : '[=] LISTA'}
                </button>
              ))}
            </div>
            <div className="acciones-reparto">
            <button
              className="mezclar-todo"
              disabled={busy !== null}
              onClick={() => {
                if (!confirm('¿Mezclar los roles de TODOS los equipos? El cambio es inmediato en sus pantallas.')) return;
                accion('shuffle-all', 'admin:roles:shuffle', {}, 'Roles mezclados en todos los equipos');
              }}
            >
              {busy === 'shuffle-all' ? 'MEZCLANDO…' : '>< MEZCLAR ROLES (TODOS)'}
            </button>
            </div>
          </div>

          {vistaEquipos === 'lista' && (
            <ListaEquipos teams={teams} bloqueado={busy !== null} accion={accion} />
          )}

          {vistaEquipos === 'fichas' && <div className="equipos">
            {teams.map((t) => (
              <article key={t.id} className="equipo">
                <header>
                  <IdentidadEquipo
                    equipo={t}
                    socket={socket}
                    bloqueado={busy !== null}
                    onAviso={avisar}
                  />
                  <button
                    className="sutil"
                    disabled={busy !== null}
                    onClick={() => accion(`shuffle-${t.id}`, 'admin:roles:shuffle', { teamIds: [t.id] }, `Roles mezclados en ${t.name}`)}
                  >
                    &gt;&lt;
                  </button>
                  <button
                    className="sutil"
                    title={`Ensayar la pantalla de victoria en ${t.name}`}
                    disabled={busy !== null}
                    onClick={() => accion(`celebrar-${t.id}`, 'admin:phase:celebrar', { teamIds: [t.id] }, `Ensayo de victoria lanzado a ${t.name}`)}
                  >
                    [OK]
                  </button>
                </header>

                <BolsaEquipo equipo={t} bloqueado={busy !== null} accion={accion} />

                {/* Señales para acercarse a esa mesa. No castigan nada: solo
                    dicen dónde mirar. */}
                {(t.alertas.pegados > 0 || t.alertas.rafagas > 0 || t.alertas.rapidas.length > 0) && (
                  <p className="equipo-alertas" title="Señales de que quizá no están tecleando lo que piensan">
                    <span className="equipo-alertas__marca">[!] MIRAR ESTA MESA</span>
                    {t.alertas.pegados > 0 && <span>{t.alertas.pegados} intento(s) de pegar</span>}
                    {t.alertas.rafagas > 0 && <span>{t.alertas.rafagas} comando(s) demasiado rápidos</span>}
                    {t.alertas.rapidas.length > 0 && <span>resolvió muy rápido: {t.alertas.rapidas.join(', ')}</span>}
                  </p>
                )}

                <ul className="miembros">
                  {t.members.map((m) => (
                    <li key={m.id}>
                      <span className={`punto ${m.connected ? 'on' : 'off'}`} />
                      <span className="nombre">{m.displayName.replace(`${t.name} · `, '')}</span>
                      {/* El rol se cambia a mano aquí. La TERMINAL no se le quita a
                          quien la tiene: se le da a otro, y entonces se intercambian.
                          Así el equipo nunca se queda sin nadie que teclee. */}
                      <select
                        className={`rol rol-${m.role} rol-select`}
                        value={m.role}
                        disabled={busy !== null || m.role === 'TERMINAL'}
                        title={m.role === 'TERMINAL'
                          ? 'Para cambiar la TERMINAL, dásela a otro jugador del equipo'
                          : 'Cambiar el rol de este jugador'}
                        onChange={(e) => {
                          const rol = e.target.value as Role;
                          const quien = m.displayName.replace(`${t.name} · `, '');
                          void accion(
                            `rol-${m.id}`, 'admin:jugador:rol', { userId: m.id, rol },
                            rol === 'TERMINAL' ? `${quien} toma la TERMINAL en ${t.name}` : `${quien} pasa a ${roleLabel[rol]}`,
                          );
                        }}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
                      </select>
                      <MoverEquipo miembro={m} equipo={t} equipos={teams} bloqueado={busy !== null} accion={accion} />
                      <button
                        className="averia"
                        // La señal se manda siempre. Si esa persona no esta
                        // conectada no pasa nada: se pierde y ya. Mirar la
                        // presencia antes solo servia para bloquear el boton
                        // cuando el panel la tenia desactualizada.
                        title={`Avería para ${roleLabel[m.role]}: ${AVERIA[m.role]}`}
                        disabled={busy !== null}
                        onClick={() =>
                          accion(
                            `averia-${m.id}`,
                            'admin:jugador:averia',
                            { userId: m.id },
                            `Avería lanzada a ${m.displayName.replace(`${t.name} · `, '')}: ${AVERIA[m.role]}`,
                          )
                        }
                      >
                        &gt;&lt;!
                      </button>
                    </li>
                  ))}
                </ul>

                <table className="progreso">
                  <tbody>
                    {phases.map((p) => {
                      const pr = t.progress.find((x) => x.phaseId === p.id);
                      return (
                        <tr key={p.id}>
                          <td>F{p.order}</td>
                          <td><span className={`chip mini prog-${pr?.status}`}>{pr?.status ?? '—'}</span></td>
                          <td className="tiempo">{formatMs(pr?.timeToSolveMs)}</td>
                          <td className="intentos">{pr?.attempts ?? 0} int.</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </article>
            ))}
          </div>}
          </div>
        </section>
      )}

      {pestana === 'pistas' && (
        <section className="panel">
          <div className="panel__bar">
            <span className="panel__name">PISTAS</span>
            <span className="panel__stat">{totalPistas} mandadas desde el último reinicio</span>
          </div>
          <div className="panel__body">
            <PanelPistas socket={socket} snapshot={snapshot} onAviso={avisar} />
          </div>
        </section>
      )}

      {pestana === 'sala' && (
        <>
          <PanelMinijuegos minijuego={snapshot.minijuego} bloqueado={busy !== null} accion={accion} />
          <PanelAtaques
            enfriamientoMs={event.enfriamientoAtaqueMs}
            socket={socket}
            bloqueado={busy !== null}
            onAviso={avisar}
            onProbar={() => ir('prueba-ataque')}
          />
        </>
      )}

      {pestana === 'pantallas' && (
        <section className="panel">
          <div className="panel__bar">
            <span className="panel__name">PANTALLAS DE LA SALA</span>
            <span className="panel__stat">cada una en su ventana</span>
          </div>
          <div className="panel__body">
            <p className="ayuda">
              Lo que se pone en el proyector o en otra pantalla. Lo normal es abrirlas en otra
              pestaña con el mismo código y dejarlas ahí; este panel sigue gobernando el evento.
            </p>
            <div className="admin-tarjetas">
              {PANTALLAS.map((t) => (
                <article key={t.nombre} className="admin-tarjeta">
                  <strong>{t.nombre}</strong>
                  <p>{t.que}</p>
                  <button type="button" className="ir-carrera" onClick={() => (t.ventana ? abrirVentana(t.ventana) : ir(t.vista!))}>
                    &gt;&gt; {t.ventana ? 'ABRIR EN VENTANA' : 'ABRIR'}
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {pestana === 'ensayos' && (
        <>
          <section className="panel">
            <div className="panel__bar">
              <span className="panel__name">SIMULACIONES</span>
              <span className="panel__stat">no tocan el juego</span>
            </div>
            <div className="panel__body">
              <div className="admin-tarjetas">
                <article className="admin-tarjeta">
                  <strong>Carrera de prueba</strong>
                  <p>Los caballos corren solos con una partida inventada.</p>
                  <button type="button" className="ir-carrera" onClick={() => ir('prueba-carrera')}>&gt;&gt; PROBAR CARRERA</button>
                </article>
                <article className="admin-tarjeta">
                  <strong>Mapa de ataque</strong>
                  <p>Lo que ve un jugador al pulsar ATACAR; los demás equipos se atacan solos.</p>
                  <button type="button" className="ir-carrera" onClick={() => ir('prueba-ataque')}>&gt;&gt; PROBAR ATAQUE</button>
                </article>
                <article className="admin-tarjeta">
                  <strong>Pantalla de victoria</strong>
                  <p>Se lanza a TODOS los equipos. No sella tiempos ni resuelve nada. Por equipo, con [OK] en su ficha.</p>
                    {/* Ensayo de la pantalla de victoria: es lo único del juego que
                        no se puede ver sin jugar una fase entera. No guarda nada. */}
                    <button
                      className="ensayar-todo"
                      disabled={busy !== null}
                      onClick={() => {
                        if (!confirm('¿Lanzar la pantalla de VICTORIA en todos los equipos?\n\nEs un ensayo: no sella tiempos, no marca ninguna fase resuelta y no saca a nadie de la fase que esté jugando. Ellos la verán a pantalla completa.')) return;
                        accion('celebrar-all', 'admin:phase:celebrar', {}, 'Ensayo de victoria lanzado a todos los equipos');
                      }}
                    >
                      {busy === 'celebrar-all' ? 'LANZANDO…' : '[OK] ENSAYAR VICTORIA (TODOS)'}
                    </button>
                </article>
              </div>
            </div>
          </section>
          <PanelRobot bloqueado={busy !== null} accion={accion} />
          <PanelIntros phases={snapshot.phases} />
          <PruebaAnimaciones />
        </>
      )}
    </div>
  );
}
