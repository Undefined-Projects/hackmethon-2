import { useCallback, useEffect, useRef, useState } from 'react';
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
        <div className="plaga__tablero">
          {celdas.map((c, i) => (
            <button
              key={i}
              ref={(el) => { macetas.current[i] = el; }}
              type="button"
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
