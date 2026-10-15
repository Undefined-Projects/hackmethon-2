import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { AdminSnapshot, ElementoPlano, Plano, TipoPlano } from '../shared/events';
import type { AppSocket } from '../lib/socket';
import { call } from '../lib/socket';
import { sonar } from '../lib/sonido';
import { urlLogo } from '../lib/logo';
import { PlanoSala } from './PlanoSala';
import { equiposDelPlano } from '../lib/plano';

/**
 * El editor del plano del auditorio.
 *
 * Se trabaja sobre un BORRADOR local y se guarda con un botón (o
 * Ctrl+S): mover cuarenta mesas no puede ser cuarenta viajes al
 * servidor, ni el proyector puede ir enseñando la sala a medio
 * colocar. Mientras haya cambios sin guardar, el borrador manda; sin
 * cambios, sigue al plano del servidor.
 *
 * Arrastrar mueve, el cuadrado de la esquina cambia el tamaño y el
 * círculo de arriba gira. Todo se ajusta a la rejilla de 25 cm (y el
 * giro a 15°); con Alt pulsado, a mano alzada. Mayús+clic suma a la
 * selección y arrastrar sobre el suelo vacío selecciona con un marco,
 * que es como se mueve una fila de mesas entera.
 */

type Borrador = Omit<Plano, 'guardadoAt'>;
type Modo = 'mover' | 'tamano' | 'girar' | 'marco';

const REJILLA = 0.25, PASO_TAMANO = 0.05, PASO_GIRO = 15, MINIMO = 0.2;
const encaja = (v: number, paso: number, libre: boolean) => (libre ? Math.round(v * 100) / 100 : Math.round(v / paso) * paso);
/** Sin crypto.randomUUID: en la red local la página va por http y ahí no existe. */
const nuevoId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Lo que trae cada tipo al crearlo. */
const NUEVO: Record<TipoPlano, Omit<ElementoPlano, 'id' | 'x' | 'y' | 'tipo'>> = {
  mesa: { w: 1.8, h: 0.8, rot: 0, teamId: null },
  escenario: { w: 8, h: 3, rot: 0, etiqueta: 'ESCENARIO' },
  pantalla: { w: 5, h: 0.3, rot: 0, etiqueta: 'PANTALLA' },
  puerta: { w: 1.8, h: 0.3, rot: 0, etiqueta: 'PUERTA' },
  pared: { w: 6, h: 0.25, rot: 0 },
  zona: { w: 6, h: 4, rot: 0, etiqueta: 'ZONA' },
  columna: { w: 0.6, h: 0.6, rot: 0 },
  texto: { w: 4, h: 0.6, rot: 0, etiqueta: 'TEXTO' },
};
const NOMBRE_TIPO: Record<TipoPlano, string> = {
  mesa: 'Mesa', escenario: 'Escenario', pantalla: 'Pantalla', puerta: 'Puerta',
  pared: 'Pared', zona: 'Zona', columna: 'Columna', texto: 'Texto',
};

const limpio = (p: Plano): Borrador => ({ nombre: p.nombre, ancho: p.ancho, alto: p.alto, elementos: p.elementos });

/** El número de una mesa («M12» → 12), para numerar las nuevas detrás. */
const numeroDe = (e: ElementoPlano) => Number(/(\d+)\s*$/.exec(e.etiqueta ?? '')?.[1] ?? NaN);

export function EditorMapa({ snapshot, socket, onVolver, onVerMapa }: {
  snapshot: AdminSnapshot; socket: AppSocket; onVolver: () => void; onVerMapa: () => void;
}) {
  const [borrador, setBorrador] = useState<Borrador>(() => limpio(snapshot.plano));
  const [sucio, setSucio] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [marco, setMarco] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const [rejilla, setRejilla] = useState({ filas: 5, columnas: 6, w: 1.8, h: 0.8, sx: 1.2, sy: 1.6, redonda: false });

  const [historia, setHistoria] = useState<{ atras: Borrador[]; alante: Borrador[] }>({ atras: [], alante: [] });
  const svg = useRef<SVGSVGElement>(null);

  // Sin cambios propios, el borrador sigue al servidor: otro admin pudo
  // guardar desde otro puesto. Con cambios, no se pisa lo que se edita.
  const guardadoAt = snapshot.plano.guardadoAt;
  const [visto, setVisto] = useState(guardadoAt);
  if (guardadoAt !== visto) {
    setVisto(guardadoAt);
    if (!sucio) setBorrador(limpio(snapshot.plano));
  }

  const equipos = useMemo(() => equiposDelPlano(snapshot), [snapshot]);

  /** Todo cambio pasa por aquí. Con `apunta`, el estado de antes se
   *  guarda para deshacer; un arrastre apunta solo en su primer paso,
   *  así que deshacer lo deshace entero y no milímetro a milímetro. */
  const cambiar = (fn: (b: Borrador) => Borrador, apunta = true) => {
    if (apunta) setHistoria((h) => ({ atras: [...h.atras.slice(-199), borrador], alante: [] }));
    setBorrador(fn);
    setSucio(true);
  };
  const tocar = (ids: Set<string>, fn: (e: ElementoPlano) => ElementoPlano, apunta = true) =>
    cambiar((b) => ({ ...b, elementos: b.elementos.map((e) => (ids.has(e.id) ? fn(e) : e)) }), apunta);

  const deshacer = () => {
    const prev = historia.atras.at(-1);
    if (!prev) return;
    setHistoria((h) => ({ atras: h.atras.slice(0, -1), alante: [...h.alante, borrador] }));
    setBorrador(prev); setSucio(true);
  };
  const rehacer = () => {
    const sig = historia.alante.at(-1);
    if (!sig) return;
    setHistoria((h) => ({ atras: [...h.atras, borrador], alante: h.alante.slice(0, -1) }));
    setBorrador(sig); setSucio(true);
  };

  const avisar = (a: { tipo: 'ok' | 'err'; texto: string }) => {
    sonar(a.tipo === 'ok' ? 'ok' : 'error');
    setAviso(a);
    window.setTimeout(() => setAviso((x) => (x === a ? null : x)), 3500);
  };

  async function guardar() {
    if (guardando) return;
    setGuardando(true);
    const r = await call<{ guardadoAt: number }>(socket, 'admin:plano:guardar', { plano: borrador });
    setGuardando(false);
    if (r.ok) { setSucio(false); avisar({ tipo: 'ok', texto: 'Plano guardado: el mapa ya lo enseña' }); }
    else avisar({ tipo: 'err', texto: r.error ?? 'No se pudo guardar' });
  }

  const descartar = () => {
    if (!window.confirm('¿Descartar los cambios sin guardar?')) return;
    setBorrador(limpio(snapshot.plano)); setSucio(false); setSeleccion(new Set());
    setHistoria({ atras: [], alante: [] });
  };

  const salir = (fn: () => void) => () => {
    if (sucio && !window.confirm('Hay cambios sin guardar. ¿Salir igualmente?')) return;
    fn();
  };

  // Cerrar la pestaña con cambios: que el navegador pregunte.
  useEffect(() => {
    if (!sucio) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [sucio]);

  // ── crear ─────────────────────────────────────────────────────
  const siguienteMesa = (lista: ElementoPlano[]) =>
    Math.max(0, ...lista.filter((e) => e.tipo === 'mesa').map(numeroDe).filter(Number.isFinite)) + 1;

  // Las piezas nuevas se calculan FUERA del actualizador de React, sobre
  // el borrador de este repintado: el actualizador puede correr dos
  // veces (modo estricto) y sacaría dos tandas de ids distintas.
  const meter = (nuevas: ElementoPlano[]) => {
    cambiar((b) => ({ ...b, elementos: [...b.elementos, ...nuevas] }));
    setSeleccion(new Set(nuevas.map((e) => e.id)));
  };

  function anadir(tipo: TipoPlano) {
    sonar('boton');
    const b = borrador;
    // En el centro de la sala, corrida si ya hay algo justo ahí.
    let x = encaja(b.ancho / 2, REJILLA, false), y = encaja(b.alto / 2, REJILLA, false);
    while (b.elementos.some((e) => Math.abs(e.x - x) < 0.3 && Math.abs(e.y - y) < 0.3)) { x += 0.5; y += 0.5; }
    const extra = tipo === 'mesa' ? { etiqueta: `M${siguienteMesa(b.elementos)}` } : {};
    meter([{ id: nuevoId(), tipo, x, y, ...NUEVO[tipo], ...extra }]);
  }

  function crearRejilla() {
    sonar('boton');
    const { filas, columnas, w, h, sx, sy, redonda } = rejilla;
    if (filas < 1 || columnas < 1 || filas * columnas > 200) return avisar({ tipo: 'err', texto: 'Entre 1 y 200 mesas de golpe' });
    const b = borrador;
    const anchoBloque = columnas * w + (columnas - 1) * sx, altoBloque = filas * h + (filas - 1) * sy;
    const x0 = encaja((b.ancho - anchoBloque) / 2 + w / 2, REJILLA, false);
    const y0 = encaja((b.alto - altoBloque) / 2 + h / 2, REJILLA, false);
    let n = siguienteMesa(b.elementos);
    const nuevas: ElementoPlano[] = [];
    for (let f = 0; f < filas; f++) for (let c = 0; c < columnas; c++) {
      nuevas.push({
        id: `${nuevoId()}-${f}-${c}`, tipo: 'mesa', x: x0 + c * (w + sx), y: y0 + f * (h + sy),
        w, h, rot: 0, redonda, teamId: null, etiqueta: `M${n++}`,
      });
    }
    // Recién creadas y elegidas: se arrastran en bloque a su sitio.
    meter(nuevas);
  }

  // ── asignar equipos ───────────────────────────────────────────
  /** Un equipo, una mesa: sentarlo en una lo levanta de la anterior. */
  const sentar = (mesaId: string, teamId: string | null) => cambiar((b) => ({
    ...b,
    elementos: b.elementos.map((e) => {
      if (e.id === mesaId) return { ...e, teamId };
      if (teamId && e.tipo === 'mesa' && e.teamId === teamId) return { ...e, teamId: null };
      return e;
    }),
  }));

  function repartir() {
    sonar('boton');
    cambiar((b) => {
      const sentados = new Set(b.elementos.map((e) => e.teamId).filter(Boolean));
      const pendientes = snapshot.teams.filter((t) => !sentados.has(t.id));
      // Las libres por número de mesa; sin número, de delante atrás y de
      // izquierda a derecha, que es como se cuentan en una sala.
      const libres = b.elementos.filter((e) => e.tipo === 'mesa' && !e.teamId)
        .sort((a, c) => (numeroDe(a) || 1e9) - (numeroDe(c) || 1e9) || a.y - c.y || a.x - c.x);
      const reparto = new Map(libres.slice(0, pendientes.length).map((m, i) => [m.id, pendientes[i].id]));
      return { ...b, elementos: b.elementos.map((e) => (reparto.has(e.id) ? { ...e, teamId: reparto.get(e.id)! } : e)) };
    });
  }

  const levantarTodos = () => {
    if (!window.confirm('¿Quitar a todos los equipos de sus mesas?')) return;
    cambiar((b) => ({ ...b, elementos: b.elementos.map((e) => (e.tipo === 'mesa' ? { ...e, teamId: null } : e)) }));
  };

  // ── borrar, duplicar, girar ───────────────────────────────────
  const borrar = () => {
    if (!seleccion.size) return;
    cambiar((b) => ({ ...b, elementos: b.elementos.filter((e) => !seleccion.has(e.id)) }));
    setSeleccion(new Set());
  };
  const duplicar = () => {
    if (!seleccion.size) return;
    let n = siguienteMesa(borrador.elementos);
    // La copia de una mesa no se lleva al equipo: un equipo, una mesa.
    meter(borrador.elementos.filter((e) => seleccion.has(e.id)).map((e, i) => ({
      ...e, id: `${nuevoId()}-${i}`, x: e.x + 1, y: e.y + 1,
      ...(e.tipo === 'mesa' ? { teamId: null, etiqueta: `M${n++}` } : {}),
    })));
  };
  const girar = (grados: number) => tocar(seleccion, (e) => ({ ...e, rot: (((e.rot + grados) % 360) + 360) % 360 }));
  const empujar = (dx: number, dy: number) => tocar(seleccion, (e) => ({ ...e, x: e.x + dx, y: e.y + dy }));

  // ── el ratón ──────────────────────────────────────────────────
  const arrastre = useRef<{
    modo: Modo; id: string | null; desde: { x: number; y: number };
    origen: Map<string, ElementoPlano>; historia: boolean; base: Set<string>;
  } | null>(null);

  const aMetros = (e: { clientX: number; clientY: number }) => {
    const s = svg.current!;
    const m = s.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };

  const alPulsar = (e: ReactPointerEvent, id: string | null, modo: 'mover' | 'tamano' | 'girar') => {
    if (e.button !== 0) return;
    svg.current?.setPointerCapture(e.pointerId);
    const p = aMetros(e);
    const suma = e.shiftKey || e.ctrlKey || e.metaKey;
    let sel = seleccion;
    if (id === null) {
      // Suelo vacío: marco de selección.
      if (!suma) setSeleccion((sel = new Set()));
      arrastre.current = { modo: 'marco', id: null, desde: p, origen: new Map(), historia: false, base: new Set(sel) };
      setMarco({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    if (suma) {
      sel = new Set(seleccion);
      if (sel.has(id)) sel.delete(id); else sel.add(id);
      setSeleccion(sel);
      if (!sel.has(id)) return;
    } else if (!seleccion.has(id) || modo !== 'mover') {
      sel = new Set([id]);
      setSeleccion(sel);
    }
    const origen = new Map(borrador.elementos.filter((x) => sel.has(x.id)).map((x) => [x.id, x]));
    arrastre.current = { modo, id, desde: p, origen, historia: false, base: sel };
  };

  const alMover = (e: ReactPointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    const p = aMetros(e);
    const libre = e.altKey;

    if (a.modo === 'marco') {
      setMarco({ x0: a.desde.x, y0: a.desde.y, x1: p.x, y1: p.y });
      const [x0, x1] = [Math.min(a.desde.x, p.x), Math.max(a.desde.x, p.x)];
      const [y0, y1] = [Math.min(a.desde.y, p.y), Math.max(a.desde.y, p.y)];
      const dentro = borrador.elementos.filter((x) => x.x >= x0 && x.x <= x1 && x.y >= y0 && x.y <= y1).map((x) => x.id);
      setSeleccion(new Set([...a.base, ...dentro]));
      return;
    }

    const dx = p.x - a.desde.x, dy = p.y - a.desde.y;
    if (!a.historia && Math.hypot(dx, dy) < 0.04) return; // un clic no es un arrastre
    const conHistoria = !a.historia;
    a.historia = true;

    if (a.modo === 'mover') {
      tocar(new Set(a.origen.keys()), (x) => {
        const o = a.origen.get(x.id)!;
        return { ...x, x: encaja(o.x + dx, REJILLA, libre), y: encaja(o.y + dy, REJILLA, libre) };
      }, conHistoria);
    } else if (a.modo === 'tamano' && a.id) {
      const o = a.origen.get(a.id)!;
      // El puntero en el marco de la pieza (deshecho el giro): el tamaño
      // crece hacia los dos lados, así que el centro no se mueve.
      const r = (-o.rot * Math.PI) / 180;
      const lx = (p.x - o.x) * Math.cos(r) - (p.y - o.y) * Math.sin(r);
      const ly = (p.x - o.x) * Math.sin(r) + (p.y - o.y) * Math.cos(r);
      tocar(new Set([a.id]), (x) => ({
        ...x,
        w: Math.max(MINIMO, encaja(Math.abs(lx) * 2, PASO_TAMANO, libre)),
        h: Math.max(MINIMO, encaja(Math.abs(ly) * 2, PASO_TAMANO, libre)),
      }), conHistoria);
    } else if (a.modo === 'girar' && a.id) {
      const o = a.origen.get(a.id)!;
      const ang = (Math.atan2(p.y - o.y, p.x - o.x) * 180) / Math.PI + 90;
      const rot = (((libre ? Math.round(ang) : Math.round(ang / PASO_GIRO) * PASO_GIRO) % 360) + 360) % 360;
      tocar(new Set([a.id]), (x) => ({ ...x, rot }), conHistoria);
    }
  };

  const alSoltar = () => {
    arrastre.current = null;
    setMarco(null);
  };

  // ── el teclado ────────────────────────────────────────────────
  // El manejador se renueva en cada repintado (lee la selección y el
  // borrador de ahora), pero se escucha una sola vez.
  const teclas = useRef<(e: KeyboardEvent) => void>(() => {});
  const alTeclear = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, select, textarea')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === 's') { e.preventDefault(); void guardar(); return; }
    if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); deshacer(); return; }
    if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); rehacer(); return; }
    if (ctrl && k === 'd') { e.preventDefault(); duplicar(); return; }
    if (ctrl && k === 'a') { e.preventDefault(); setSeleccion(new Set(borrador.elementos.map((x) => x.id))); return; }
    if (k === 'escape') { setSeleccion(new Set()); return; }
    if (!seleccion.size) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); borrar(); return; }
    if (k === 'q') { girar(-PASO_GIRO); return; }
    if (k === 'e') { girar(PASO_GIRO); return; }
    const paso = e.shiftKey ? 1 : REJILLA;
    const flechas: Record<string, [number, number]> = { arrowleft: [-paso, 0], arrowright: [paso, 0], arrowup: [0, -paso], arrowdown: [0, paso] };
    if (flechas[k]) { e.preventDefault(); empujar(...flechas[k]); }
  };
  useEffect(() => { teclas.current = alTeclear; });
  useEffect(() => {
    const h = (e: KeyboardEvent) => teclas.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ── lo que se pinta ───────────────────────────────────────────
  const elegidos = borrador.elementos.filter((e) => seleccion.has(e.id));
  const uno = elegidos.length === 1 ? elegidos[0] : null;
  const mesas = borrador.elementos.filter((e) => e.tipo === 'mesa');
  const mesaDe = new Map(mesas.filter((m) => m.teamId).map((m) => [m.teamId!, m]));
  const libres = mesas.filter((m) => !m.teamId).length;
  const sinMesa = snapshot.teams.filter((t) => !mesaDe.has(t.id)).length;

  const num = (v: number) => Math.round(v * 100) / 100;
  const campo = (etq: string, valor: number, fn: (v: number) => void, paso = 0.05) => (
    <label className="ed-campo">
      <span>{etq}</span>
      <input
        type="number" step={paso} value={num(valor)}
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) fn(v); }}
      />
    </label>
  );

  return (
    <div className="admin admin-editor-mapa">
      <header className="ed-barra">
        <button onClick={salir(onVolver)}>&lt;&lt; PANEL</button>
        <h1>EDITOR · {borrador.nombre.toUpperCase()}</h1>
        <div className="ed-grupo">
          {(Object.keys(NUEVO) as TipoPlano[]).map((t) => (
            <button key={t} className={t === 'mesa' ? 'ed-principal' : ''} onClick={() => anadir(t)}>+ {NOMBRE_TIPO[t]}</button>
          ))}
        </div>
        <div className="ed-grupo">
          <button onClick={deshacer} disabled={!historia.atras.length} title="Ctrl+Z">DESHACER</button>
          <button onClick={rehacer} disabled={!historia.alante.length} title="Ctrl+Y">REHACER</button>
        </div>
        <div className="ed-grupo ed-grupo--fin">
          <span className={`chip ${sucio ? 'err' : 'ok'}`}>{sucio ? 'sin guardar' : 'guardado'}</span>
          {sucio && <button onClick={descartar}>DESCARTAR</button>}
          <button className="ed-guardar" onClick={() => void guardar()} disabled={!sucio || guardando} title="Ctrl+S">
            {guardando ? 'GUARDANDO…' : 'GUARDAR'}
          </button>
          <button onClick={salir(onVerMapa)}>VER MAPA &gt;&gt;</button>
        </div>
      </header>

      {aviso && <div className={`aviso ${aviso.tipo}`}>{aviso.texto}</div>}

      <div className="ed-cuerpo">
        <div className="ed-lienzo" onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar}>
          <PlanoSala
            plano={borrador} equipos={equipos} svgRef={svg}
            editor={{ seleccion, marco, alPulsar }}
          />
          <p className="ed-ayuda">
            Arrastra para mover · esquina = tamaño · círculo = girar · Alt = sin rejilla ·
            Mayús+clic o marco = varias · Q/E gira · flechas empujan · Supr borra · Ctrl+D duplica
          </p>
        </div>

        <aside className="ed-lado">
          {uno ? (
            <section className="ed-seccion">
              <h2>{NOMBRE_TIPO[uno.tipo]}</h2>
              <label className="ed-campo ed-campo--ancho">
                <span>{uno.tipo === 'mesa' ? 'Número' : 'Rótulo'}</span>
                <input
                  type="text" maxLength={60} value={uno.etiqueta ?? ''}
                  onChange={(e) => tocar(new Set([uno.id]), (x) => ({ ...x, etiqueta: e.target.value }))}
                />
              </label>
              <div className="ed-fila">
                {campo('X (m)', uno.x, (v) => tocar(new Set([uno.id]), (x) => ({ ...x, x: v })), REJILLA)}
                {campo('Y (m)', uno.y, (v) => tocar(new Set([uno.id]), (x) => ({ ...x, y: v })), REJILLA)}
              </div>
              <div className="ed-fila">
                {campo('Ancho', uno.w, (v) => tocar(new Set([uno.id]), (x) => ({ ...x, w: Math.max(MINIMO, v) })))}
                {campo('Fondo', uno.h, (v) => tocar(new Set([uno.id]), (x) => ({ ...x, h: Math.max(MINIMO, v) })))}
              </div>
              <div className="ed-fila">
                {campo('Giro °', uno.rot, (v) => tocar(new Set([uno.id]), (x) => ({ ...x, rot: v })), PASO_GIRO)}
                {(uno.tipo === 'mesa' || uno.tipo === 'columna') && (
                  <label className="ed-check">
                    <input
                      type="checkbox" checked={!!uno.redonda}
                      onChange={(e) => tocar(new Set([uno.id]), (x) => ({ ...x, redonda: e.target.checked }))}
                    />
                    redonda
                  </label>
                )}
              </div>
              {uno.tipo === 'mesa' && (
                <label className="ed-campo ed-campo--ancho">
                  <span>Equipo</span>
                  <select value={uno.teamId ?? ''} onChange={(e) => sentar(uno.id, e.target.value || null)}>
                    <option value="">— libre —</option>
                    {snapshot.teams.map((t) => {
                      const otra = mesaDe.get(t.id);
                      return (
                        <option key={t.id} value={t.id}>
                          {t.name}{otra && otra.id !== uno.id ? ` (ahora en ${otra.etiqueta || 'otra mesa'})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>
              )}
              <div className="ed-acciones">
                <button onClick={() => girar(-PASO_GIRO)}>⟲ 15°</button>
                <button onClick={() => girar(PASO_GIRO)}>⟳ 15°</button>
                <button onClick={() => girar(90)}>90°</button>
                <button onClick={duplicar}>DUPLICAR</button>
                <button className="ed-peligro" onClick={borrar}>BORRAR</button>
              </div>
            </section>
          ) : elegidos.length > 1 ? (
            <section className="ed-seccion">
              <h2>{elegidos.length} piezas</h2>
              <p className="ed-nota">Arrástralas juntas, o empújalas con las flechas.</p>
              <div className="ed-acciones">
                <button onClick={() => girar(-PASO_GIRO)}>⟲ 15°</button>
                <button onClick={() => girar(PASO_GIRO)}>⟳ 15°</button>
                <button onClick={duplicar}>DUPLICAR</button>
                <button className="ed-peligro" onClick={borrar}>BORRAR</button>
              </div>
            </section>
          ) : (
            <section className="ed-seccion">
              <h2>La sala</h2>
              <label className="ed-campo ed-campo--ancho">
                <span>Nombre</span>
                <input type="text" maxLength={60} value={borrador.nombre}
                  onChange={(e) => cambiar((b) => ({ ...b, nombre: e.target.value }))} />
              </label>
              <div className="ed-fila">
                {campo('Ancho (m)', borrador.ancho, (v) => cambiar((b) => ({ ...b, ancho: Math.max(2, v) })), 0.5)}
                {campo('Fondo (m)', borrador.alto, (v) => cambiar((b) => ({ ...b, alto: Math.max(2, v) })), 0.5)}
              </div>
              <p className="ed-nota">Elige una pieza para editarla, o arrastra sobre el suelo para elegir varias.</p>
            </section>
          )}

          <section className="ed-seccion">
            <h2>Filas de mesas</h2>
            <div className="ed-fila">
              {campo('Filas', rejilla.filas, (v) => setRejilla((r) => ({ ...r, filas: Math.round(v) })), 1)}
              {campo('Columnas', rejilla.columnas, (v) => setRejilla((r) => ({ ...r, columnas: Math.round(v) })), 1)}
            </div>
            <div className="ed-fila">
              {campo('Ancho mesa', rejilla.w, (v) => setRejilla((r) => ({ ...r, w: Math.max(MINIMO, v) })))}
              {campo('Fondo mesa', rejilla.h, (v) => setRejilla((r) => ({ ...r, h: Math.max(MINIMO, v) })))}
            </div>
            <div className="ed-fila">
              {campo('Hueco lado', rejilla.sx, (v) => setRejilla((r) => ({ ...r, sx: Math.max(0, v) })), 0.1)}
              {campo('Pasillo', rejilla.sy, (v) => setRejilla((r) => ({ ...r, sy: Math.max(0, v) })), 0.1)}
            </div>
            <label className="ed-check">
              <input type="checkbox" checked={rejilla.redonda} onChange={(e) => setRejilla((r) => ({ ...r, redonda: e.target.checked }))} />
              mesas redondas
            </label>
            <button className="ed-principal ed-ancho" onClick={crearRejilla}>
              + {rejilla.filas * rejilla.columnas} MESAS
            </button>
          </section>

          <section className="ed-seccion">
            <h2>Equipos <em>{mesaDe.size}/{snapshot.teams.length} sentados · {libres} mesas libres</em></h2>
            <div className="ed-acciones">
              <button className="ed-principal" onClick={repartir} disabled={!sinMesa || !libres}>REPARTIR EN LIBRES</button>
              <button onClick={levantarTodos} disabled={!mesaDe.size}>LEVANTAR TODOS</button>
            </div>
            <p className="ed-nota">
              {uno?.tipo === 'mesa' ? `Pulsa un equipo para sentarlo en ${uno.etiqueta || 'esta mesa'}.` : 'Elige una mesa y pulsa un equipo para sentarlo.'}
            </p>
            <ul className="ed-equipos">
              {snapshot.teams.map((t) => {
                const m = mesaDe.get(t.id);
                const logo = urlLogo(t.id, t.logoAt);
                return (
                  <li key={t.id}>
                    <button
                      className={`ed-equipo ${m ? 'sentado' : ''} ${uno?.teamId === t.id ? 'aqui' : ''}`}
                      disabled={uno?.tipo !== 'mesa'}
                      onClick={() => uno && sentar(uno.id, uno.teamId === t.id ? null : t.id)}
                      title={m ? `En ${m.etiqueta || 'una mesa'}` : 'Sin mesa'}
                    >
                      {logo ? <img src={logo} alt="" /> : <span className="ed-equipo-hueco" />}
                      <span className="ed-equipo-nombre">{t.name}</span>
                      <span className="ed-equipo-mesa">{m ? m.etiqueta || '✔' : '—'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
