import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { MinijuegoView } from '../../shared/events';
import type { AppSocket } from '../../lib/socket';
import { sonar } from '../../lib/sonido';
import { Cifra, Final, Marco } from './Marco';
import { usePuntaje } from './puntaje';
import { centro, color, useCuentaAtras, useMotorFx } from './efectos';

/**
 * WHAC-A-MOLE, versión 2.0: PLAGA.
 *
 * Nueve macetas con tierra de circuito. De ellas asoman gusanos —el
 * gusano polimórfico de la portada, la parte artificial— y hay que
 * golpearlos antes de que se metan. Pero de las mismas macetas también
 * brotan flores, y esas NO se tocan: golpear lo vivo resta. Saca la
 * máquina, cuida la planta.
 *
 * Treinta segundos por intento, cada vez más rápido. De vez en cuando
 * sale un gusano mutado (azul): vale más y se esconde antes.
 */

const DURACION = 30_000;
const CELDAS = 9;

type Tipo = 'gusano' | 'mutado' | 'flor';
const VALOR: Record<Tipo, number> = { gusano: 10, mutado: 25, flor: -15 };

type Celda = {
  tipo: Tipo | null;
  /** Hasta cuándo se queda afuera (reloj de performance.now). */
  hasta: number;
  /** Cambia con cada aparición: React reinicia la animación de salida. */
  n: number;
  /** El golpe recién dado, para el destello y el +10 / −15. */
  golpe: { valor: number; hasta: number } | null;
  /** Se está escondiendo: la animación de bajada antes de vaciarse. */
  sale?: boolean;
};

type Estado = 'listo' | 'cuenta' | 'jugando' | 'fin';

const vacias = (): Celda[] =>
  Array.from({ length: CELDAS }, () => ({ tipo: null, hasta: 0, n: 0, golpe: null }));

const mezcla = (a: number, b: number, k: number) => a + (b - a) * k;

/** Teclado como cruceta numérica, y su equivalente en letras para quien no tiene numpad. */
const TECLAS: Record<string, number> = {
  '7': 0, '8': 1, '9': 2, '4': 3, '5': 4, '6': 5, '1': 6, '2': 7, '3': 8,
  q: 0, w: 1, e: 2, a: 3, s: 4, d: 5, z: 6, x: 7, c: 8,
};

export function Plaga({
  minijuego, socket,
}: { minijuego: MinijuegoView; socket: AppSocket | null }) {
  const { mejor, envio, enviar, olvidar, record } = usePuntaje(socket, minijuego.ronda);
  const motor = useMotorFx();
  const { fx } = motor;
  const { cuenta: regresiva, iniciar } = useCuentaAtras();
  const [estado, setEstado] = useState<Estado>('listo');
  const [celdas, setCeldas] = useState<Celda[]>(vacias);
  const [puntos, setPuntos] = useState(0);
  const [restante, setRestante] = useState(DURACION);
  const [cuenta, setCuenta] = useState({ gusanos: 0, flores: 0 });
  const [racha, setRacha] = useState(0);
  const macetas = useRef<(HTMLButtonElement | null)[]>([]);
  const rachaRef = useRef(0);

  // El bucle trabaja sobre refs y solo empuja a React lo que cambió.
  const est = useRef<Estado>('listo');
  const celdasRef = useRef<Celda[]>(vacias());
  const puntosRef = useRef(0);
  const cuentaRef = useRef({ gusanos: 0, flores: 0 });
  const t0 = useRef(0);
  const proxima = useRef(0);

  const publicar = () => setCeldas(celdasRef.current.map((c) => ({ ...c })));

  const terminar = useCallback(async () => {
    est.current = 'fin';
    setEstado('fin');
    celdasRef.current = vacias();
    setCeldas(vacias());
    sonar('meta');
    await enviar(puntosRef.current);
  }, [enviar]);

  const arrancar = useCallback(() => {
    if (est.current === 'jugando' || est.current === 'cuenta') return;
    celdasRef.current = vacias();
    puntosRef.current = 0;
    rachaRef.current = 0;
    cuentaRef.current = { gusanos: 0, flores: 0 };
    setCeldas(vacias());
    setPuntos(0);
    setRacha(0);
    setCuenta({ gusanos: 0, flores: 0 });
    setRestante(DURACION);
    olvidar();
    est.current = 'cuenta';
    setEstado('cuenta');
    iniciar(() => {
      t0.current = performance.now();
      proxima.current = t0.current + 350;
      est.current = 'jugando';
      setEstado('jugando');
    }, (k) => sonar(k === 0 ? 'entrar' : 'tic'));
  }, [olvidar, iniciar]);

  /* ── el reloj: apariciones, escondidas y fin ─────────────── */
  useEffect(() => {
    let raf = 0, ultimoSeg = -1;
    const cuadro = (t: number) => {
      if (est.current === 'jugando') {
        const pasado = t - t0.current;
        const k = Math.min(1, pasado / DURACION);
        let cambio = false;
        const cs = celdasRef.current;

        // Lo que se cumplió su tiempo baja a la tierra (y luego se vacía).
        for (const c of cs) {
          if (c.tipo && !c.sale && t >= c.hasta) {
            c.sale = true; c.hasta = t + 170; cambio = true;
            // Un gusano que se escapa corta la racha.
            if (c.tipo !== 'flor' && rachaRef.current) { rachaRef.current = 0; setRacha(0); }
          } else if (c.sale && t >= c.hasta) { c.tipo = null; c.sale = false; cambio = true; }
          if (c.golpe && t >= c.golpe.hasta) { c.golpe = null; cambio = true; }
        }

        // Aparece algo. Más seguido y más a la vez conforme avanza.
        const ocupadas = cs.filter((c) => c.tipo).length;
        const tope = 1 + Math.floor(k * 3);
        if (t >= proxima.current && ocupadas < tope) {
          const libres = cs.map((c, i) => (c.tipo || c.golpe ? -1 : i)).filter((i) => i >= 0);
          if (libres.length) {
            const i = libres[Math.floor(Math.random() * libres.length)];
            const r = Math.random();
            const tipo: Tipo = r < 0.22 ? 'flor' : r < 0.3 ? 'mutado' : 'gusano';
            const vida = tipo === 'flor' ? 1500
              : mezcla(1250, 650, k) * (tipo === 'mutado' ? 0.65 : 1);
            cs[i] = { tipo, hasta: t + vida, n: cs[i].n + 1, golpe: null };
            cambio = true;
          }
          proxima.current = t + mezcla(820, 360, k) * (0.7 + Math.random() * 0.6);
        }

        if (cambio) publicar();
        const seg = Math.ceil((DURACION - pasado) / 100);
        if (seg !== ultimoSeg) {
          // Los últimos cinco segundos suenan: tic, tic, tic.
          if (seg <= 50 && seg % 10 === 0 && seg > 0) sonar('tic');
          ultimoSeg = seg; setRestante(Math.max(0, DURACION - pasado));
        }
        if (pasado >= DURACION) void terminar();
      }
      raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(raf);
  }, [terminar]);

  /* ── golpear ─────────────────────────────────────────────── */
  const golpear = useCallback((i: number) => {
    if (est.current !== 'jugando') return;
    const c = celdasRef.current[i];
    if (!c.tipo || c.sale) return;
    const valor = VALOR[c.tipo];
    const p = centro(macetas.current[i]);
    if (c.tipo === 'flor') {
      cuentaRef.current.flores++; sonar('golpe');
      rachaRef.current = 0;
      // Pisar lo vivo: la pantalla se pone roja y vuelan pétalos.
      fx.estallido(p.x, p.y, { n: 20, formas: ['petalo', 'hoja'], colores: [color('uv'), color('violeta'), color('verde')], fuerza: 0.25, dura: 1000, tam: 6 });
      fx.destello(color('sangre'), 0.28, 380);
      fx.sacudida(1.2);
    } else {
      cuentaRef.current.gusanos++;
      rachaRef.current++;
      const mutado = c.tipo === 'mutado';
      sonar(mutado ? 'ok' : 'abrir');
      // El aplastón: escombro de pixel y chispas en el color del bicho.
      fx.estallido(p.x, p.y, {
        n: mutado ? 30 : 16, formas: ['escombro', 'pixel', 'chispa'],
        colores: mutado ? [color('azulHi'), color('azul'), color('phosHi')] : [color('phos'), color('violeta'), color('phosHi')],
        fuerza: mutado ? 0.42 : 0.3, dura: 650, tam: mutado ? 6 : 5,
      });
      fx.anillo(p.x, p.y, { color: mutado ? color('azulHi') : color('phosHi'), radio: mutado ? 70 : 44 });
      fx.sacudida(mutado ? 0.8 : 0.35);
      if (mutado) { fx.destello(color('azulHi'), 0.12); fx.texto(p.x, p.y - 30, 'MUTANTE', { color: color('azulHi'), tam: 16 }); }
      // Cada cinco seguidos, la racha se canta.
      if (rachaRef.current % 5 === 0) {
        fx.texto(p.x, p.y - 50, `RACHA ${rachaRef.current}`, { color: color('verdeHi'), tam: 22, dura: 1000 });
        sonar('barrera');
      }
    }
    setRacha(rachaRef.current);
    puntosRef.current = Math.max(0, puntosRef.current + valor);
    const t = performance.now();
    celdasRef.current[i] = { tipo: null, hasta: 0, n: c.n, golpe: { valor, hasta: t + 420 } };
    setPuntos(puntosRef.current);
    setCuenta({ ...cuentaRef.current });
    publicar();
  }, [fx]);

  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        if (est.current !== 'jugando') { e.preventDefault(); arrancar(); }
        return;
      }
      const i = TECLAS[e.key.toLowerCase()];
      if (i === undefined) return;
      e.preventDefault();
      golpear(i);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [arrancar, golpear]);

  return (
    <Marco
      nombre="PLAGA · WHAC-A-MOLE"
      marcador={<>TIEMPO <b>{(restante / 1000).toFixed(1)}</b> · RACHA <Cifra v={racha} /> · PUNTOS <Cifra v={puntos} /></>}
      mejor={mejor}
      motor={motor}
      variante="plaga"
      cuenta={regresiva}
    >
      <div className={`plaga ${estado === 'jugando' ? 'plaga--viva' : ''} ${estado === 'jugando' && restante <= 5000 ? 'plaga--final' : ''}`}>
        <div className="plaga__reloj" aria-hidden="true">
          <span style={{ transform: `scaleX(${restante / DURACION})` }} />
        </div>
        <div className="plaga__tablero p3d">
          <Invernadero celdas={celdas} />
          {celdas.map((c, i) => (
            <button
              key={i}
              ref={(el) => { macetas.current[i] = el; }}
              type="button"
              style={cajaDe(i)}
              className={`maceta ${c.tipo ? `maceta--${c.tipo}` : ''} ${c.sale ? 'maceta--sale' : ''} ${c.golpe ? (c.golpe.valor < 0 ? 'maceta--mal' : 'maceta--ok') : ''}`}
              onPointerDown={(e) => { e.preventDefault(); golpear(i); }}
              aria-label={c.tipo === 'flor' ? 'Flor: no la toques' : c.tipo ? 'Gusano: golpéalo' : 'Maceta vacía'}
              tabIndex={-1}
            >
              {c.tipo && <Bicho key={c.n} tipo={c.tipo} />}
              <Tierra />
              {c.golpe && (
                <span className="maceta__valor">{c.golpe.valor > 0 ? `+${c.golpe.valor}` : `${c.golpe.valor}`}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {estado === 'listo' && (
        <div className="minijuego__msg">
          <p className="minijuego__titulo fx-glitch">PLAGA</p>
          <p className="minijuego__txt">
            Los gusanos de circuito están saliendo de las macetas. Golpéalos
            antes de que se escondan: <b>+10</b>, y los azules mutados <b>+25</b>.
            Las flores no se tocan: <b>−15</b>. Tienes 30 segundos.
          </p>
          <p className="minijuego__tecla">CLIC · TOCA · TECLAS 1-9 / QWE-ASD-ZXC · ESPACIO PARA EMPEZAR</p>
          <button className="minijuego__otra" onClick={arrancar}>EMPEZAR ▸</button>
        </div>
      )}
      {estado === 'fin' && (
        <Final
          titulo={puntos > 0 ? 'PLAGA CONTENIDA' : 'LA PLAGA GANÓ'} malo={puntos === 0}
          puntos={puntos}
          detalle={<>
            {cuenta.gusanos} gusanos
            {cuenta.flores > 0 && <> · <span className="plaga__flores">{cuenta.flores} flor{cuenta.flores > 1 ? 'es' : ''} pisada{cuenta.flores > 1 ? 's' : ''}</span></>}
          </>}
          envio={envio} mejor={mejor} record={record}
          otra="OTRA RONDA ▸" onOtra={arrancar}
        />
      )}
    </Marco>
  );
}

/* ── el invernadero en 3D ──────────────────────────────────
   Las nueve macetas en tres filas, a distinta profundidad, vistas desde
   arriba y adelante. El lienzo pinta la sala y las macetas; los botones
   van encima de cada una, escalados por su distancia: los bichos asoman
   de la tierra igual que antes. */

const LW = 320, LH = 200;
const F3 = 200, OJO = 2;
/** Profundidad de cada fila (la de arriba, al fondo) y separación entre columnas. */
const FILAS_Z = [5.2, 3.6, 2.4], SEP = 1.05, RADIO = 0.34, ALTO_MACETA = 0.32;
const pr = (x: number, z: number, h: number) => ({ x: LW / 2 + (F3 * x) / z, y: (F3 * (OJO - h)) / z });
const maceta3d = (i: number) => {
  const z = FILAS_Z[Math.floor(i / 3)], x = ((i % 3) - 1) * SEP;
  const tapa = pr(x, z, ALTO_MACETA), pie = pr(x, z, 0);
  return { z, x, tapa, pie, r: (F3 * RADIO) / z };
};
/** La caja del botón: sobre la tapa de la maceta, del tamaño de su distancia. */
function cajaDe(i: number): CSSProperties {
  const m = maceta3d(i);
  const w = m.r * 2.3, h = m.r * 1.9;
  return {
    position: 'absolute', left: `${((m.tapa.x - w / 2) / LW) * 100}%`, top: `${((m.tapa.y + m.r * 0.18 - h) / LH) * 100}%`,
    width: `${(w / LW) * 100}%`, height: `${(h / LH) * 100}%`, zIndex: 10 + Math.floor(i / 3),
  };
}

function Invernadero({ celdas }: { celdas: { tipo: Tipo | null; golpe: { valor: number } | null }[] }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    // La sala: pared del fondo, piso con cuadrícula en perspectiva y una lámpara.
    const g = ctx.createLinearGradient(0, 0, 0, LH);
    g.addColorStop(0, '#1a0820'); g.addColorStop(0.3, '#120a1c'); g.addColorStop(1, '#1d1636');
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
    const horizonte = pr(0, 12, 0).y;
    ctx.fillStyle = '#0d0815'; ctx.fillRect(0, 0, LW, horizonte);
    for (let k = 0; k < 16; k++) {
      const x0 = (Math.sin(k * 91.7) * 0.5 + 0.5) * LW, y0 = (Math.sin(k * 37.3) * 0.5 + 0.5) * horizonte * 0.85;
      ctx.strokeStyle = `rgba(${k % 3 ? '250,57,186' : '61,220,151'},.22)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 10, y0); ctx.lineTo(x0 + 15, y0 + 5); ctx.lineTo(x0 + 15, y0 + 12); ctx.stroke();
    }
    const luz = ctx.createRadialGradient(LW / 2, horizonte * 0.4, 2, LW / 2, horizonte * 0.4, LW * 0.6);
    luz.addColorStop(0, 'rgba(250,57,186,.4)'); luz.addColorStop(1, 'rgba(250,57,186,0)');
    ctx.fillStyle = luz; ctx.fillRect(0, 0, LW, LH);
    ctx.strokeStyle = 'rgba(79,134,238,.22)'; ctx.lineWidth = 1;
    for (let x = -6; x <= 6; x++) { const a = pr(x * 0.55, 12, 0), b = pr(x * 0.55, 1.6, 0); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    for (const z of [1.8, 2.1, 2.5, 3, 3.6, 4.4, 5.4, 6.8, 9]) { const a = pr(-6, z, 0), b = pr(6, z, 0); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    // Las macetas, del fondo hacia delante.
    for (let i = 0; i < CELDAS; i++) {
      const m = maceta3d(i), c = celdas[i];
      const ry = m.r * 0.42 * (OJO / (m.z * 0.6));
      // La sombra y la luz que echa el bicho que asoma.
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.beginPath(); ctx.ellipse(m.pie.x + 3, m.pie.y, m.r * 1.15, ry * 0.9, 0, 0, Math.PI * 2); ctx.fill();
      if (c?.tipo || c?.golpe) {
        const tono = c.golpe ? (c.golpe.valor < 0 ? '255,51,85' : '61,220,151') : c.tipo === 'flor' ? '61,220,151' : c.tipo === 'mutado' ? '79,134,238' : '250,57,186';
        const h = ctx.createRadialGradient(m.tapa.x, m.tapa.y, 0, m.tapa.x, m.tapa.y, m.r * 2.4);
        h.addColorStop(0, `rgba(${tono},.45)`); h.addColorStop(1, `rgba(${tono},0)`);
        ctx.fillStyle = h; ctx.fillRect(m.tapa.x - m.r * 2.4, m.tapa.y - m.r * 2.4, m.r * 4.8, m.r * 4.8);
      }
      // El cuerpo: un cilindro con su sombreado de lado a lado.
      const cuerpo = ctx.createLinearGradient(m.tapa.x - m.r, 0, m.tapa.x + m.r, 0);
      cuerpo.addColorStop(0, '#2a1838'); cuerpo.addColorStop(0.35, '#5a2f6e'); cuerpo.addColorStop(1, '#1a0f24');
      ctx.fillStyle = cuerpo;
      ctx.beginPath();
      ctx.moveTo(m.tapa.x - m.r, m.tapa.y);
      ctx.lineTo(m.pie.x - m.r * 0.82, m.pie.y);
      ctx.ellipse(m.pie.x, m.pie.y, m.r * 0.82, ry * 0.82, 0, Math.PI, 0, true);
      ctx.lineTo(m.tapa.x + m.r, m.tapa.y);
      ctx.closePath(); ctx.fill();
      // Una banda de circuito alrededor.
      ctx.strokeStyle = 'rgba(79,134,238,.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(m.tapa.x, (m.tapa.y + m.pie.y) / 2, m.r * 0.92, ry * 0.9, 0, 0, Math.PI); ctx.stroke();
      // La boca: el borde iluminado y la tierra de circuito.
      ctx.fillStyle = '#3a2048'; ctx.beginPath(); ctx.ellipse(m.tapa.x, m.tapa.y, m.r, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.ellipse(m.tapa.x, m.tapa.y + 0.5, m.r * 0.84, ry * 0.78, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(61,220,151,.55)';
      ctx.beginPath(); ctx.moveTo(m.tapa.x - m.r * 0.5, m.tapa.y); ctx.lineTo(m.tapa.x - m.r * 0.1, m.tapa.y); ctx.lineTo(m.tapa.x, m.tapa.y + ry * 0.4); ctx.stroke();
      ctx.strokeStyle = 'rgba(250,57,186,.85)';
      ctx.beginPath(); ctx.ellipse(m.tapa.x, m.tapa.y, m.r, ry, 0, Math.PI, Math.PI * 2); ctx.stroke();
    }
  }, [celdas]);
  return <canvas ref={cv} width={LW} height={LH} className="plaga__sala" aria-hidden="true" />;
}

/* ── sprites ───────────────────────────────────────────────
   SVG a 32×32 con bordes duros: pixel art de terminal, sin curvas
   suaves. Los colores salen de las variables de index.css. */

/** La tierra de la maceta: un socket con pistas de circuito. */
export function Tierra() {
  return (
    <svg className="maceta__tierra" viewBox="0 0 32 10" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="0" y="0" width="32" height="10" className="t-borde" />
      <rect x="2" y="2" width="28" height="6" className="t-suelo" />
      <path d="M4 5h6l2 2h6M20 4h4l2 2h2" className="t-pista" />
      <rect x="9" y="4" width="2" height="2" className="t-via" />
      <rect x="23" y="3" width="2" height="2" className="t-via" />
    </svg>
  );
}

export function Bicho({ tipo }: { tipo: Tipo }) {
  if (tipo === 'flor') {
    return (
      <svg className="bicho bicho--flor" viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="15" y="14" width="2" height="18" className="f-tallo" />
        <path d="M17 22h3v-2h3v2h-2v2h-4zM15 26h-3v-2h-3v2h2v2h4z" className="f-hoja" />
        <rect x="13" y="4" width="6" height="4" className="f-petalo" />
        <rect x="9" y="8" width="4" height="6" className="f-petalo" />
        <rect x="19" y="8" width="4" height="6" className="f-petalo" />
        <rect x="13" y="14" width="6" height="2" className="f-petalo" />
        <rect x="13" y="8" width="6" height="6" className="f-centro" />
      </svg>
    );
  }
  return (
    <svg className={`bicho bicho--${tipo}`} viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden="true">
      {/* cuerpo en anillos, como un bus de datos */}
      <rect x="10" y="22" width="12" height="10" className="g-cuerpo" />
      <rect x="10" y="24" width="12" height="2" className="g-anillo" />
      <rect x="10" y="28" width="12" height="2" className="g-anillo" />
      {/* cabeza */}
      <rect x="8" y="8" width="16" height="14" className="g-cuerpo" />
      {/* antenas: pines de chip */}
      <rect x="10" y="4" width="2" height="4" className="g-pin" />
      <rect x="20" y="4" width="2" height="4" className="g-pin" />
      <rect x="9" y="3" width="4" height="2" className="g-pin" />
      <rect x="19" y="3" width="4" height="2" className="g-pin" />
      {/* ojos de LED */}
      <rect x="11" y="12" width="4" height="4" className="g-ojo" />
      <rect x="17" y="12" width="4" height="4" className="g-ojo" />
      <rect x="12" y="13" width="2" height="2" className="g-brillo" />
      <rect x="18" y="13" width="2" height="2" className="g-brillo" />
      {/* boca de rejilla */}
      <rect x="12" y="18" width="8" height="2" className="g-boca" />
    </svg>
  );
}
