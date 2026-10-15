import { useCallback, useEffect, useRef, useState } from 'react';
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
        <Neurona />
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

/** La neurona: un soma con dendritas de circuito. Todo el color lo pone
 *  el CSS según el estado (reposo, señal, flor). */
function Neurona() {
  return (
    <svg className="neurona" viewBox="0 0 240 160" shapeRendering="crispEdges" aria-hidden="true">
      <g className="neurona__dendritas">
        <path d="M120 80 H80 L60 60 H30 M60 60 L50 40 H20 M80 80 L60 100 H24 L14 110" />
        <path d="M120 80 H160 L180 60 H210 M180 60 L190 40 H222 M160 80 L180 100 H216 L228 112" />
        <path d="M120 80 V40 L100 20 H84 M120 40 L140 20 H156 M120 80 V120 L104 140 H86 M120 120 L136 140 H156" />
      </g>
      <g className="neurona__vias">
        {[[30, 60], [20, 40], [24, 100], [210, 60], [222, 40], [216, 100], [84, 20], [156, 20], [86, 140], [156, 140]].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x - 3} y={y - 3} width="6" height="6" />
        ))}
      </g>
      <rect className="neurona__soma" x="100" y="62" width="40" height="36" />
      <rect className="neurona__nucleo" x="112" y="72" width="16" height="16" />
      <g className="neurona__flor">
        <rect x="114" y="52" width="12" height="10" />
        <rect x="100" y="66" width="12" height="28" />
        <rect x="128" y="66" width="12" height="28" />
        <rect x="114" y="98" width="12" height="10" />
        <rect className="neurona__flor-c" x="112" y="72" width="16" height="16" />
      </g>
    </svg>
  );
}
