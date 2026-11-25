import { useCallback, useEffect, useRef, useState } from 'react';
import { FOV, pintar, type Celda } from '../fases/motor3d';
import type { MinijuegoView } from '../../shared/events';
import type { AppSocket } from '../../lib/socket';
import { sonar } from '../../lib/sonido';
import { SINAPSIS_BASE } from '../../lib/minijuegos';
import { Cifra, Final, Marco } from './Marco';
import { usePuntaje } from './puntaje';
import { centro, color, useMotorFx } from './efectos';

/**
 * REFLEJOS, versión 2.0: SINAPSIS.
 *
 * Una neurona de circuito, quieta. En un instante al azar se dispara
 * —se enciende en clorofila— y hay que contestar lo más rápido posible.
 * Cinco disparos; cuenta el promedio.
 *
 * La trampa es la misma idea que en PLAGA: a veces lo que se abre no es
 * la señal sino una flor, y esa no se toca. El instinto también se
 * equivoca. Contestar antes de tiempo cuenta como un disparo fallido.
 *
 * El puntaje es `1000 − promedio en ms`: más alto, más rápido.
 */

const RONDAS = 5;
const FALLIDO_MS = 700;   // contestar antes de la señal
const TRAMPA_MS = 250;    // tocar la flor: se suma al total
const PROB_TRAMPA = 0.25;
const SIN_RESPUESTA_MS = 1000; // nadie contestó: el peor tiempo posible

type Estado = 'listo' | 'espera' | 'senal' | 'flor' | 'pronto' | 'tiempo' | 'fin';

/** Cómo se canta cada tiempo, y con cuánto alboroto. */
const calificar = (ms: number) =>
  ms < 200 ? { txt: 'RAYO', tono: 'verdeHi' as const, n: 40 }
  : ms < 260 ? { txt: 'RÁPIDO', tono: 'verde' as const, n: 26 }
  : ms < 350 ? { txt: 'BIEN', tono: 'phosHi' as const, n: 16 }
  : { txt: 'LENTO', tono: 'phosDim' as const, n: 8 };

/** El veredicto de la secuencia completa, por su promedio. */
const veredicto = (ms: number) =>
  ms < 220 ? 'REFLEJO DE RAYO' : ms < 280 ? 'SISTEMA NERVIOSO AFINADO' : ms < 380 ? 'CONDUCCIÓN NORMAL' : 'SEÑAL DÉBIL';

export function Sinapsis({
  minijuego, socket,
}: { minijuego: MinijuegoView; socket: AppSocket | null }) {
  const { mejor, envio, enviar, olvidar, record } = usePuntaje(socket, minijuego.ronda);
  const motor = useMotorFx();
  const { fx } = motor;
  const zona = useRef<HTMLDivElement>(null);
  /** El centro del soma, en ventana: de ahí salen todos los efectos. */
  const soma = () => centro(zona.current?.querySelector('.neurona__soma') ?? null);
  const [estado, setEstado] = useState<Estado>('listo');
  const [tiempos, setTiempos] = useState<number[]>([]);
  const [castigo, setCastigo] = useState(0);
  const [aviso, setAviso] = useState('');

  const est = useRef<Estado>('listo');
  const tiemposRef = useRef<number[]>([]);
  const castigoRef = useRef(0);
  const senalEn = useRef(0);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cambia = (e: Estado) => { est.current = e; setEstado(e); };
  const limpia = () => { if (reloj.current) clearTimeout(reloj.current); reloj.current = null; };

  const puntosDe = (ts: number[], c: number) =>
    Math.max(0, Math.round(SINAPSIS_BASE - (ts.reduce((a, b) => a + b, 0) + c) / RONDAS));

  /** Espera un rato al azar y luego dispara: señal o, a veces, flor. */
  const armar = useCallback(() => {
    limpia();
    cambia('espera');
    reloj.current = setTimeout(() => {
      if (Math.random() < PROB_TRAMPA) {
        cambia('flor');
        sonar('abrir');
        const c = soma();
        fx.estallido(c.x, c.y, { n: 12, formas: ['petalo'], colores: [color('uv'), color('violeta')], fuerza: 0.12, dura: 900, tam: 5 });
        // La flor se cierra sola; si nadie la tocó, sigue la ronda.
        reloj.current = setTimeout(() => armar(), 1100);
        return;
      }
      cambia('senal');
      // El cronómetro arranca cuando la señal YA está pintada, no cuando
      // se pidió pintarla: así no se le cobra a nadie el cuadro de retraso.
      requestAnimationFrame((t) => {
        senalEn.current = t;
        // La descarga: onda desde el soma y chispas por las dendritas.
        const c = soma();
        fx.anillo(c.x, c.y, { color: color('verdeHi'), radio: 190, dura: 420, grosor: 4 });
        fx.estallido(c.x, c.y, { n: 14, formas: ['chispa'], colores: [color('verdeHi'), color('verde')], fuerza: 0.5, dura: 380, tam: 4 });
      });
      sonar('tic');
      // Quien se distrae no se queda esperando para siempre.
      reloj.current = setTimeout(() => {
        if (est.current !== 'senal') return;
        anota(SIN_RESPUESTA_MS, 'SIN RESPUESTA');
        cambia('pronto');
        void siguienteRef.current();
      }, SIN_RESPUESTA_MS);
    }, 1200 + Math.random() * 2600);
  }, [fx]);

  // `armar` necesita llamar a `siguiente` y `siguiente` a `armar`: el
  // ref corta el círculo de dependencias.
  const siguienteRef = useRef<() => Promise<void>>(async () => {});

  const siguiente = useCallback(async () => {
    if (tiemposRef.current.length >= RONDAS) {
      limpia();
      cambia('fin');
      sonar('meta');
      await enviar(puntosDe(tiemposRef.current, castigoRef.current));
      return;
    }
    reloj.current = setTimeout(() => armar(), 900);
  }, [armar, enviar]);
  useEffect(() => { siguienteRef.current = siguiente; }, [siguiente]);

  const arrancar = useCallback(() => {
    limpia();
    tiemposRef.current = []; castigoRef.current = 0;
    setTiempos([]); setCastigo(0); setAviso('');
    olvidar();
    sonar('entrar');
    armar();
  }, [armar, olvidar]);

  function anota(ms: number, texto: string) {
    tiemposRef.current = [...tiemposRef.current, ms];
    setTiempos(tiemposRef.current);
    setAviso(texto);
  }

  /** El disparo del jugador: clic, toque o cualquier tecla. */
  const dispara = useCallback(() => {
    const e = est.current;
    if (e === 'listo' || e === 'fin') { arrancar(); return; }
    if (e === 'senal') {
      limpia();
      const ms = Math.min(SIN_RESPUESTA_MS, Math.round(performance.now() - senalEn.current));
      cambia('tiempo');
      const nota = calificar(ms);
      anota(ms, `${ms} ms · ${nota.txt}`);
      sonar(ms < 300 ? 'ok' : 'boton');
      const c = soma();
      fx.texto(c.x, c.y - 70, nota.txt, { color: color(nota.tono), tam: ms < 200 ? 40 : 30, dura: 900 });
      fx.estallido(c.x, c.y, { n: nota.n, formas: ['chispa', 'pixel'], colores: [color(nota.tono), color('verdeHi')], fuerza: 0.45, dura: 600 });
      if (ms < 260) { fx.destello(color('verde'), ms < 200 ? 0.22 : 0.12); fx.anillo(c.x, c.y, { color: color(nota.tono), radio: 240, grosor: 5 }); }
      if (ms < 200) fx.sacudida(0.9);
      void siguiente();
    } else if (e === 'espera') {
      limpia();
      cambia('pronto');
      anota(FALLIDO_MS, 'DEMASIADO PRONTO');
      sonar('error');
      fx.sacudida(1);
      fx.destello(color('sangre'), 0.2);
      void siguiente();
    } else if (e === 'flor') {
      limpia();
      castigoRef.current += TRAMPA_MS;
      setCastigo(castigoRef.current);
      cambia('pronto');
      setAviso(`FLOR PISADA · +${TRAMPA_MS} ms`);
      sonar('golpe');
      const c = soma();
      fx.estallido(c.x, c.y, { n: 24, formas: ['petalo', 'hoja'], colores: [color('uv'), color('violeta'), color('verde')], fuerza: 0.3, dura: 1000, tam: 6 });
      fx.destello(color('sangre'), 0.26, 380);
      fx.sacudida(1.1);
      // No consume ronda: la flor era la trampa, no la señal.
      reloj.current = setTimeout(() => armar(), 900);
    }
  }, [arrancar, armar, siguiente, fx]);

  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const tecla = (ev: KeyboardEvent) => {
      // Cualquier tecla de escribir dispara; F5, Tab o Esc siguen siendo suyas.
      if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key !== 'Enter' && ev.key.length !== 1) return;
      ev.preventDefault();
      dispara();
    };
    window.addEventListener('keydown', tecla);
    return () => { window.removeEventListener('keydown', tecla); limpia(); };
  }, [dispara]);

  const promedio = tiempos.length ? Math.round((tiempos.reduce((a, b) => a + b, 0) + castigo) / tiempos.length) : null;
  const puntos = estado === 'fin' ? puntosDe(tiempos, castigo) : 0;

  const rotulo: Record<Estado, string> = {
    listo: 'EN REPOSO', espera: 'ESPERA…', senal: '¡AHORA!', flor: 'ES UNA FLOR · NO',
    pronto: aviso, tiempo: aviso, fin: 'SECUENCIA COMPLETA',
  };

  return (
    <Marco
      nombre="SINAPSIS · REFLEJOS"
      marcador={<>DISPARO <b>{Math.min(tiempos.length + (estado === 'fin' ? 0 : 1), RONDAS)}/{RONDAS}</b> · PROMEDIO <Cifra v={promedio ?? '---'} /> ms</>}
      mejor={mejor}
      motor={motor}
      variante="sinapsis"
    >
      <div
        ref={zona}
        className={`sinapsis sinapsis--${estado}`}
        onPointerDown={(e) => { e.preventDefault(); dispara(); }}
        role="button"
        tabIndex={-1}
        aria-label="Neurona: dispara cuando se encienda"
      >
        <Neurona3D estado={estado} />
        <p key={`${estado}-${tiempos.length}`} className="sinapsis__rotulo" aria-live="polite">{rotulo[estado]}</p>
        <ol className="sinapsis__tiempos" aria-label="Tiempos">
          {Array.from({ length: RONDAS }, (_, i) => (
            <li key={`${i}-${tiempos[i] ?? 'x'}`} className={tiempos[i] === FALLIDO_MS ? 'fallo' : tiempos[i] !== undefined ? 'hecho' : ''}>
              {tiempos[i] === undefined ? '---' : tiempos[i] === FALLIDO_MS ? 'XXX' : tiempos[i]}
            </li>
          ))}
        </ol>
      </div>

      {estado === 'listo' && (
        <div className="minijuego__msg">
          <p className="minijuego__titulo fx-glitch">SINAPSIS</p>
          <p className="minijuego__txt">
            La neurona se va a disparar cuando menos lo esperes: contesta en cuanto
            se encienda en <b>verde</b>. Si se abre una <b>flor</b>, no la toques
            (+{TRAMPA_MS} ms). Contestar antes de tiempo es un disparo fallido.
            Cinco disparos; cuenta el promedio.
          </p>
          <p className="minijuego__tecla">CLIC · TOCA · CUALQUIER TECLA</p>
          <button className="minijuego__otra" onClick={(e) => { e.stopPropagation(); arrancar(); }}>EMPEZAR ▸</button>
        </div>
      )}
      {estado === 'fin' && promedio !== null && (
        <Final
          titulo={veredicto(promedio)} malo={promedio >= 380}
          puntos={puntos} valor={promedio} unidad="ms de promedio"
          detalle={<>{puntos} puntos{castigo > 0 && <> · <span className="plaga__flores">+{castigo} ms por flores</span></>}</>}
          envio={envio} mejor={mejor} record={record}
          otra="OTRA SECUENCIA ▸" onOtra={arrancar}
        />
      )}
    </Marco>
  );
}

/* ── la neurona en 3D ──────────────────────────────────────
   Un túnel nervioso; al fondo, sobre la pared, la neurona con sus
   dendritas, y su axón recorriendo el piso hasta la cámara. Al
   dispararse, el impulso corre por el axón hacia quien juega. Un ancla
   invisible (.neurona__soma) marca su centro: de ahí salen los efectos. */

const NW = 320, NH = 200;
const SALA_N = ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'];
const NC = { x: 2.5, y: 8.4 };
const FONDO_Y = 1.25;
const prN = (x: number, y: number, h: number) => {
  const z = Math.max(0.05, NC.y - y);
  return { x: (NW / 2) * (1 + (x - NC.x) / (z * FOV)), y: NH / 2 + ((0.5 - h) * NH) / z, z };
};
/** Las dendritas: ramas sobre la pared del fondo, en coordenadas (x, h). */
const RAMAS: [number, number][][] = [
  [[2.5, 0.55], [1.9, 0.75], [1.5, 0.78], [1.2, 0.95]], [[1.9, 0.75], [1.7, 0.95]],
  [[2.5, 0.55], [3.1, 0.75], [3.5, 0.78], [3.8, 0.95]], [[3.1, 0.75], [3.3, 0.95]],
  [[2.5, 0.55], [1.8, 0.4], [1.35, 0.36], [1.1, 0.2]], [[2.5, 0.55], [3.2, 0.4], [3.65, 0.36], [3.9, 0.2]],
  [[2.5, 0.55], [2.5, 0.85], [2.3, 0.98]], [[2.5, 0.85], [2.75, 0.98]],
];

let fondoN: HTMLCanvasElement | null = null;
function fondoNeurona() {
  if (fondoN) return fondoN;
  const cv = document.createElement('canvas'); cv.width = NW; cv.height = NH;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(NW, NH);
  const celda: Celda = (f, c) => SALA_N[f]?.[c] ?? '#';
  pintar(new Uint32Array(img.data.buffer), new Float32Array(NW), celda, { x: NC.x, y: NC.y, ang: 0 }, { niebla: 10, ambiente: 0.06, salto: 0, sprites: [] });
  ctx.putImageData(img, 0, 0);
  return (fondoN = cv);
}

function Neurona3D({ estado }: { estado: Estado }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const est = useRef(estado);
  const cambio = useRef(performance.now());
  if (est.current !== estado) { est.current = estado; cambio.current = performance.now(); }
  const soma = prN(2.5, FONDO_Y, 0.55);
  useEffect(() => {
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    let id = 0, ultimo = 0;
    const cuadro = (t: number) => {
      id = requestAnimationFrame(cuadro);
      if (t - ultimo < 70) return;
      ultimo = t;
      const e = est.current, u = (t - cambio.current) / 1000;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(fondoNeurona(), 0, 0);
      const senal = e === 'senal' || (e === 'tiempo' && u < 0.6);
      const mal = e === 'pronto' && u < 0.8;
      const tono = senal ? '61,220,151' : mal ? '255,51,85' : e === 'flor' ? '217,70,239' : '250,57,186';
      // Cuánto brilla: respira en reposo, tiembla al esperar, estalla al disparar.
      const brillo = senal ? 1 : mal ? 0.9 * (1 - u / 0.8) + 0.2 : e === 'espera' ? 0.25 + 0.12 * Math.sin(t / 45) : 0.3 + 0.15 * Math.sin(t / 600);
      // El halo del fondo.
      const c = prN(2.5, FONDO_Y, 0.55);
      const h = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, 90);
      h.addColorStop(0, `rgba(${tono},${0.15 + brillo * 0.5})`); h.addColorStop(1, `rgba(${tono},0)`);
      ctx.fillStyle = h; ctx.fillRect(0, 0, NW, NH);
      // Las dendritas, sobre la pared.
      ctx.lineWidth = 1.5;
      for (const rama of RAMAS) {
        ctx.strokeStyle = `rgba(${tono},${0.35 + brillo * 0.6})`;
        ctx.beginPath();
        rama.forEach(([x, hh], i) => { const p = prN(x, FONDO_Y, hh); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
        ctx.stroke();
        const [fx, fh] = rama[rama.length - 1]; const q = prN(fx, FONDO_Y, fh);
        ctx.fillStyle = `rgba(${tono},${0.5 + brillo * 0.5})`; ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
      }
      // El axón: del soma al piso y por el piso hasta la cámara.
      const ax = [prN(2.5, FONDO_Y, 0.55), prN(2.5, FONDO_Y + 0.2, 0.02), prN(2.5, NC.y - 0.9, 0.02)];
      ctx.strokeStyle = `rgba(${tono},${0.3 + brillo * 0.4})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax[0].x, ax[0].y); ctx.lineTo(ax[1].x, ax[1].y); ctx.lineTo(ax[2].x, ax[2].y); ctx.stroke();
      // El impulso: al dispararse, corre por el axón hacia quien juega.
      if (senal) {
        const k = Math.min(1, u / 0.35);
        const y = FONDO_Y + 0.2 + k * (NC.y - 0.9 - FONDO_Y - 0.2);
        const p = prN(2.5, y, 0.03), r = Math.max(2, 10 / p.z);
        ctx.fillStyle = 'rgba(180,245,212,.5)'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      }
      // El soma: un nodo de circuito, o una flor que se abre.
      const r = 15;
      if (e === 'flor') {
        const abre = Math.min(1, u / 0.25);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + t / 900;
          ctx.fillStyle = k % 2 ? '#d946ef' : '#a32198';
          ctx.beginPath(); ctx.ellipse(c.x + Math.cos(a) * r * abre, c.y + Math.sin(a) * r * abre, r * 0.7 * abre + 1, r * 0.4 * abre + 1, a, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#ffd3ee'; ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = `rgba(${tono},${0.4 + brillo * 0.6})`;
        ctx.fillRect(c.x - r, c.y - r * 0.85, r * 2, r * 1.7);
        ctx.fillStyle = '#0a070c'; ctx.fillRect(c.x - r * 0.45, c.y - r * 0.4, r * 0.9, r * 0.8);
        ctx.fillStyle = `rgba(${tono},1)`; ctx.fillRect(c.x - r * 0.25, c.y - r * 0.2, r * 0.5, r * 0.4);
        ctx.strokeStyle = senal ? '#fff' : `rgba(${tono},.9)`; ctx.lineWidth = 1;
        ctx.strokeRect(c.x - r + 0.5, c.y - r * 0.85 + 0.5, r * 2 - 1, r * 1.7 - 1);
      }
      // Al disparar, la pantalla entera se ilumina un instante.
      if (senal && u < 0.15) { ctx.fillStyle = `rgba(180,245,212,${0.25 * (1 - u / 0.15)})`; ctx.fillRect(0, 0, NW, NH); }
    };
    id = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="neurona3d" aria-hidden="true">
      <canvas ref={cv} width={NW} height={NH} />
      <span className="neurona__soma" style={{ left: `${(soma.x / NW) * 100}%`, top: `${(soma.y / NH) * 100}%` }} />
    </div>
  );
}
