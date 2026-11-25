import { useCallback, useEffect, useRef, useState } from 'react';
import type { MinijuegoView } from '../../shared/events';
import type { AppSocket } from '../../lib/socket';
import { sonar, tonoSostenido } from '../../lib/sonido';
import { Cifra, Final, Marco } from './Marco';
import { usePuntaje } from './puntaje';
import { color, enLienzo, useCuentaAtras, useMotorFx } from './efectos';

/**
 * RITMO, versión 2.0: LATIDO.
 *
 * El monitor de signos vitales de la portada, convertido en juego. El
 * trazo del paciente entra por la derecha y cada complejo QRS —el pico
 * del latido— tiene que marcarse justo cuando cruza la línea verde.
 * El monitor pita en cada latido, como uno de verdad, y ese pitido es
 * la mejor guía.
 *
 * Y a veces el corazón no late: SOSTIENE. El trazo se queda arriba en
 * una meseta y hay que presionar al inicio, mantener mientras dura y
 * soltar justo al final. Mientras se sostiene suena el tono continuo
 * del monitor y se suman puntos; soltar antes rompe el pulso.
 *
 * El corazón empieza tranquilo (72 lpm) y se acelera hasta 132; desde
 * el latido 10 se vuelve arrítmico: latidos prematuros seguidos de su
 * pausa. Lo instintivo es pulsar a compás, y el paciente ya no late a
 * compás.
 */

const W = 720, H = 260;
const XL = 150;                    // la línea donde se marca
const VEL = 0.26;                  // px por ms
const LATIDOS = 40;
const PERFECTO = 38, BIEN = 92;    // ventanas en ms
const PUNTOS = { perfecto: 30, bien: 15 };
const SPAM_MS = 250;               // pulsar lejos de cualquier latido castiga
/** Lo que vale mantener un pulso sostenido, por cada 100 ms. */
const PUNTOS_SOSTEN = 2;
const BASE = H * 0.62, AMP = H * 0.48;
const MESETA = 0.52;               // a qué altura se queda el trazo al sostener

type Juicio = 'perfecto' | 'bien' | 'fuera';
type Latido = {
  t: number;
  juicio: Juicio | null;
  pito: boolean;
  /** Si es un pulso sostenido: cuándo termina. */
  fin?: number;
  /** El sostén: esperando, sostenido ahora, completo o roto. */
  sosten?: 'espera' | 'vivo' | 'hecho' | 'roto';
  /** Hasta dónde se ha sostenido (para pintar la franja llena). */
  hasta?: number;
};
type Estado = 'listo' | 'monitor' | 'fin';

/** El programa del paciente: cuándo late cada vez y cuándo sostiene. */
function programa(desde: number): Latido[] {
  const out: Latido[] = [];
  let t = desde;
  for (let i = 0; out.length < LATIDOS; i++) {
    const k = Math.min(1, i / (LATIDOS - 1));
    let rr = 830 - 375 * k;                      // 72 → 132 lpm
    // Pulsos sostenidos desde el sexto latido: largos al principio,
    // más cortos (y más difíciles de soltar a tiempo) después.
    if (i > 5 && Math.random() < 0.22) {
      const dura = 1300 - 500 * k + Math.random() * 300;
      out.push({ t, juicio: null, pito: false, fin: t + dura, sosten: 'espera' });
      t += dura + rr * 0.9;
      continue;
    }
    // Desde el latido 10, extrasístoles: uno prematuro y su pausa.
    if (i > 9 && Math.random() < 0.26) {
      out.push({ t, juicio: null, pito: false });
      t += rr * 0.55;
      rr *= 1.45;
    }
    out.push({ t, juicio: null, pito: false });
    t += rr;
  }
  return out.slice(0, LATIDOS);
}

/** La forma de un latido en el instante `dt` (ms) respecto a su pico. */
const gauss = (x: number, a: number, mu: number, s: number) => a * Math.exp(-((x - mu) ** 2) / (2 * s * s));
const onda = (dt: number) =>
  gauss(dt, 0.12, -170, 28)      // P
  - gauss(dt, 0.12, -24, 7)      // Q
  + gauss(dt, 1, 0, 9)           // R
  - gauss(dt, 0.28, 26, 8)       // S
  + gauss(dt, 0.24, 190, 45);    // T

/** La forma de un pulso sostenido: el pico, la meseta que tiembla y la T al soltar. */
function ondaSostenida(dt: number, dura: number): number {
  const sube = Math.min(1, Math.max(0, (dt - 10) / 24));
  const baja = Math.min(1, Math.max(0, (dura - dt) / 24));
  const meseta = dt > 0 && dt < dura ? MESETA * Math.min(sube, baja) + 0.035 * Math.sin(dt / 17) : 0;
  return gauss(dt, 0.12, -170, 28) - gauss(dt, 0.12, -24, 7) + gauss(dt, 1, 0, 9) + meseta
    + gauss(dt, 0.24, dura + 190, 45);
}

let colores: Record<string, string> | null = null;
function tonos() {
  if (colores) return colores;
  const css = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => css.getPropertyValue(n).trim() || d;
  return (colores = {
    fondo: v('--screen', '#0a070c'), phos: v('--phos', '#fa39ba'), phosDim: v('--phos-dim', '#b0559b'),
    phosHi: v('--phos-hi', '#ffd3ee'), verde: v('--clorofila', '#3ddc97'), verdeHi: v('--clorofila-hi', '#b4f5d4'),
    sangre: v('--sangre', '#ff3355'), azul: v('--blue-hi', '#4f86ee'),
  });
}

type Cuenta = { perfecto: number; bien: number; fuera: number; sostenidos: number; rotos: number };
const CERO: Cuenta = { perfecto: 0, bien: 0, fuera: 0, sostenidos: 0, rotos: 0 };

export function Latido({
  minijuego, socket,
}: { minijuego: MinijuegoView; socket: AppSocket | null }) {
  const { mejor, envio, enviar, olvidar, record } = usePuntaje(socket, minijuego.ronda);
  const motor = useMotorFx();
  const { fx } = motor;
  const { cuenta: regresiva, iniciar } = useCuentaAtras();
  // Cuántos latidos han pitado: el corazón del marcador salta con cada uno.
  const [oidos, setOidos] = useState(0);
  /** Cuándo pitó el último latido (la cuadrícula se enciende) y cuándo se falló uno (el trazo se pone rojo). */
  const pulsoEn = useRef(-1e9);
  const fallaEn = useRef(-1e9);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [estado, setEstado] = useState<Estado>('listo');
  const [puntos, setPuntos] = useState(0);
  const [racha, setRacha] = useState(0);
  const [fc, setFc] = useState(72);
  const [cuenta, setCuenta] = useState<Cuenta>(CERO);
  const [sosteniendo, setSosteniendo] = useState(false);

  const est = useRef<Estado>('listo');
  const latidos = useRef<Latido[]>([]);
  const puntosRef = useRef(0);
  const rachaRef = useRef(0);
  const cuentaRef = useRef<Cuenta>(CERO);
  /** El pulso sostenido que se está manteniendo ahora, si hay uno. */
  const vivo = useRef<Latido | null>(null);
  /** Para sumar los puntos del sostén cada 100 ms. */
  const ultimoTic = useRef(0);

  const multiplicador = () => Math.min(3, 1 + Math.floor(rachaRef.current / 8));
  /** Dónde está el pico en la línea, en ventana: ahí salen los efectos. */
  const enLinea = (alto = 1) => { const q = enPared(XL, BASE - AMP * alto); return enLienzo(lienzo.current, q.x, q.y); };

  const publica = () => {
    setPuntos(puntosRef.current);
    setRacha(rachaRef.current);
    setCuenta({ ...cuentaRef.current });
  };

  const sumaRacha = (base: number) => {
    const multAntes = multiplicador();
    puntosRef.current += base * multiplicador();
    rachaRef.current++;
    // Sube el multiplicador: se canta en grande.
    const mult = multiplicador();
    if (mult > multAntes) {
      const m = enLienzo(lienzo.current, VW / 2, VH / 2);
      fx.texto(m.x, m.y, `×${mult}`, { color: color('verdeHi'), tam: 64, dura: 1100 });
      fx.destello(color('verde'), 0.18, 420);
      fx.sacudida(0.7);
      sonar('barrera');
    }
  };

  const falla = (t: number, texto: string) => {
    rachaRef.current = 0;
    fallaEn.current = t;
    fx.destello(color('sangre'), 0.14, 240);
    const p = enLinea();
    fx.texto(p.x + 54, p.y + 10, texto, { color: color('sangre'), tam: 15, dura: 520 });
  };

  /** Un acierto o un fallo de un latido (o del inicio de un sostenido). */
  const juzga = (l: Latido | null, juicio: Juicio, t: number) => {
    if (l) l.juicio = juicio;
    cuentaRef.current[juicio]++;
    const p = enLinea();
    if (juicio === 'fuera') {
      // Pulsar sin latido cerca resta: sin esto, aporrear la tecla ganaría.
      if (!l) puntosRef.current = Math.max(0, puntosRef.current - 5);
      if (l?.sosten) { l.sosten = 'roto'; cuentaRef.current.rotos++; }
      falla(t, 'FUERA');
    } else {
      sumaRacha(PUNTOS[juicio]);
      if (juicio === 'perfecto') {
        fx.estallido(p.x, p.y, { n: 18, formas: ['chispa', 'pixel'], colores: [color('verdeHi'), color('verde'), color('phosHi')], fuerza: 0.4, dura: 520 });
        fx.anillo(p.x, p.y, { color: color('verdeHi'), radio: 46, dura: 380 });
        fx.texto(p.x + 60, p.y + 10, 'PERFECTO', { color: color('verdeHi'), tam: 18, dura: 600 });
      } else {
        fx.estallido(p.x, p.y, { n: 8, formas: ['pixel'], colores: [color('verde')], fuerza: 0.25, dura: 420 });
        fx.texto(p.x + 50, p.y + 10, 'BIEN', { color: color('verde'), tam: 15, dura: 500 });
      }
    }
    publica();
  };

  /** Empieza a sostener: el pulso ya se juzgó en su inicio. */
  const empiezaSosten = (l: Latido, t: number) => {
    l.sosten = 'vivo';
    l.hasta = t;
    vivo.current = l;
    ultimoTic.current = t;
    setSosteniendo(true);
    tonoSostenido(true);
  };

  /** Termina el sostén: a tiempo (con premio), antes (roto) o porque ya pasó. */
  const acabaSosten = (t: number, motivo: 'suelta' | 'pasado') => {
    const l = vivo.current;
    if (!l || l.fin === undefined) return;
    vivo.current = null;
    setSosteniendo(false);
    tonoSostenido(false);
    const p = enLinea(MESETA);
    if (motivo === 'pasado') {
      // Se quedó apretando de más: el pulso cuenta, sin el premio del final.
      l.sosten = 'hecho'; l.hasta = l.fin;
      cuentaRef.current.sostenidos++;
      fx.texto(p.x + 70, p.y, 'SOSTENIDO', { color: color('verde'), tam: 16, dura: 600 });
      publica();
      return;
    }
    const d = t - l.fin;
    if (d < -BIEN) {
      l.sosten = 'roto';
      cuentaRef.current.rotos++;
      falla(t, 'SOLTASTE');
      sonar('error');
      fx.sacudida(0.8);
    } else {
      l.sosten = 'hecho'; l.hasta = l.fin;
      cuentaRef.current.sostenidos++;
      const perfecto = Math.abs(d) <= PERFECTO;
      sumaRacha(perfecto ? 30 : 15);
      // Soltar justo a tiempo es lo más difícil del juego: se celebra.
      fx.estallido(p.x, p.y, {
        n: perfecto ? 34 : 18, formas: ['chispa', 'pixel', 'hoja'],
        colores: [color('verdeHi'), color('verde'), color('phosHi'), color('uv')], fuerza: 0.5, dura: 700,
      });
      fx.anillo(p.x, p.y, { color: color('verdeHi'), radio: perfecto ? 90 : 55, grosor: 4 });
      fx.texto(p.x + 80, p.y - 6, perfecto ? 'SOSTÉN PERFECTO' : 'SOSTENIDO', { color: color('verdeHi'), tam: perfecto ? 20 : 16, dura: 800 });
      if (perfecto) { fx.destello(color('verde'), 0.14, 300); sonar('ok'); }
    }
    publica();
  };

  const terminar = useCallback(async () => {
    est.current = 'fin';
    setEstado('fin');
    vivo.current = null;
    setSosteniendo(false);
    tonoSostenido(false);
    sonar('meta');
    await enviar(puntosRef.current);
  }, [enviar]);

  const arrancar = useCallback(() => {
    if (est.current === 'monitor') return;
    // La cuenta 3 · 2 · 1 · ¡YA! dura lo mismo que la entrada del primer
    // latido: el ¡YA! cae justo antes de que el pico llegue a la línea.
    iniciar(() => {}, (k) => sonar(k === 0 ? 'entrar' : 'tic'));
    setOidos(0);
    latidos.current = programa(performance.now() + 2600);
    puntosRef.current = 0; rachaRef.current = 0;
    cuentaRef.current = { ...CERO };
    vivo.current = null;
    setPuntos(0); setRacha(0); setFc(72); setCuenta(CERO); setSosteniendo(false);
    olvidar();
    est.current = 'monitor';
    setEstado('monitor');
  }, [olvidar, iniciar]);

  /** Presionar: el latido (o inicio de sostenido) sin juzgar más cercano a la línea. */
  const presiona = useCallback(() => {
    if (est.current !== 'monitor') { if (est.current === 'listo') arrancar(); return; }
    if (vivo.current) return;
    const t = performance.now();
    let cerca: Latido | null = null, dist = Infinity;
    for (const l of latidos.current) {
      if (l.juicio) continue;
      const d = Math.abs(l.t - t);
      if (d < dist) { dist = d; cerca = l; }
    }
    if (cerca && dist <= BIEN) {
      juzga(cerca, dist <= PERFECTO ? 'perfecto' : 'bien', t);
      if (cerca.fin !== undefined) empiezaSosten(cerca, t);
    } else if (dist > SPAM_MS || !cerca) { juzga(null, 'fuera', t); sonar('error'); }
    // Entre BIEN y SPAM_MS no pasa nada: ni premio ni castigo por adelantarse un poco.
    // `juzga` y compañía solo tocan refs, el motor de efectos y setters estables.
  }, [arrancar]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Soltar: solo importa si se estaba sosteniendo un pulso. */
  const suelta = useCallback(() => {
    if (est.current !== 'monitor' || !vivo.current) return;
    acabaSosten(performance.now(), 'suelta');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── el monitor ───────────────────────────────────────────── */
  useEffect(() => {
    let raf = 0;
    // El monitor se pinta como siempre, pero en un lienzo aparte; luego se
    // proyecta como una pared de luz que se aleja (ver `pared`).
    const buf = document.createElement('canvas'); buf.width = W; buf.height = H;
    const cuadro = (t: number) => {
      const ctx = buf.getContext('2d');
      const C = tonos();
      if (ctx) {
        ctx.fillStyle = C.fondo; ctx.fillRect(0, 0, W, H);
        // Papel de electrocardiograma. Se enciende con cada latido.
        const brillo = Math.exp(-(t - pulsoEn.current) / 160);
        ctx.strokeStyle = `rgba(79,134,238,${(0.1 + 0.22 * brillo).toFixed(3)})`; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = 0; x <= W; x += 20) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
        for (let y = 0; y <= H; y += 20) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
        ctx.stroke();

        // La zona de marcado: la ventana de «bien», y la línea al centro.
        ctx.fillStyle = 'rgba(61,220,151,.07)';
        ctx.fillRect(XL - BIEN * VEL, 0, BIEN * 2 * VEL, H);
        ctx.fillStyle = 'rgba(61,220,151,.13)';
        ctx.fillRect(XL - PERFECTO * VEL, 0, PERFECTO * 2 * VEL, H);
        ctx.fillStyle = vivo.current ? C.verdeHi : C.verde;
        ctx.fillRect(XL - (vivo.current ? 2 : 1), 0, vivo.current ? 4 : 2, H);

        const ls = latidos.current;
        const jugando = est.current === 'monitor';

        if (jugando) {
          // Juicio automático de lo que ya pasó, y el pitido al cruzar.
          for (const l of ls) {
            if (!l.pito && t >= l.t) { l.pito = true; sonar('tic', 0.6); pulsoEn.current = t; setOidos((n) => n + 1); }
            if (!l.juicio && t - l.t > BIEN) juzga(l, 'fuera', t);
          }
          // El sostén en curso: suma, echa chispas y se cierra solo si ya pasó.
          const v = vivo.current;
          if (v && v.fin !== undefined) {
            v.hasta = Math.min(t, v.fin);
            if (t - ultimoTic.current >= 100) {
              ultimoTic.current = t;
              puntosRef.current += PUNTOS_SOSTEN * multiplicador();
              setPuntos(puntosRef.current);
              const p = enLinea(MESETA);
              fx.estallido(p.x, p.y, { n: 3, formas: ['chispa'], colores: [color('verdeHi'), color('phosHi')], fuerza: 0.3, dura: 300, angulo: Math.PI, apertura: 1.4 });
            }
            if (t > v.fin + BIEN) acabaSosten(t, 'pasado');
          }
          const prox = ls.findIndex((l) => l.t > t);
          if (prox > 0) setFc(Math.round(60000 / (ls[prox].t - (ls[prox - 1].fin ?? ls[prox - 1].t))));
          const ultimo = ls[ls.length - 1];
          if (t > (ultimo.fin ?? ultimo.t) + 900) void terminar();
        }

        // Las franjas de los sostenidos, debajo del trazo: pendiente en
        // rosa tenue, lo ya sostenido en verde, lo roto en rojo.
        for (const l of ls) {
          if (l.fin === undefined) continue;
          const x0 = XL + (l.t - t) * VEL, x1 = XL + (l.fin - t) * VEL;
          if (x1 < -10 || x0 > W + 10) continue;
          const yTop = BASE - AMP * MESETA - 10;
          ctx.fillStyle = l.sosten === 'roto' ? 'rgba(255,51,85,.14)' : 'rgba(250,57,186,.10)';
          ctx.fillRect(x0, yTop, x1 - x0, BASE - yTop);
          if ((l.sosten === 'vivo' || l.sosten === 'hecho') && l.hasta) {
            const xh = XL + (l.hasta - t) * VEL;
            ctx.fillStyle = l.sosten === 'vivo' ? 'rgba(61,220,151,.30)' : 'rgba(61,220,151,.18)';
            ctx.fillRect(x0, yTop, xh - x0, BASE - yTop);
          }
          // El fin del sostén: dónde hay que soltar.
          ctx.fillStyle = l.sosten === 'roto' ? C.sangre : l.sosten === 'hecho' ? C.verde : C.phosHi;
          ctx.fillRect(x1 - 1, yTop - 8, 3, BASE - yTop + 8);
        }

        // El trazo: de izquierda (pasado) a derecha (lo que viene).
        // Brilla más con la racha, se pone verde al sostener y rojo un instante al fallar.
        const rojo = t - fallaEn.current < 180;
        const verde = !!vivo.current;
        ctx.lineWidth = 2.5 + Math.min(1.5, rachaRef.current / 12); ctx.lineJoin = 'round';
        ctx.strokeStyle = rojo ? C.sangre : verde ? C.verdeHi : C.phos;
        ctx.shadowColor = rojo ? C.sangre : verde || rachaRef.current >= 16 ? C.verde : C.phos;
        ctx.shadowBlur = 6 + Math.min(16, rachaRef.current) + 8 * brillo + (verde ? 10 : 0);
        ctx.beginPath();
        let k = 0;
        for (let x = 0; x <= W; x += 2) {
          const tx = t + (x - XL) / VEL;
          while (k < ls.length - 1 && (ls[k + 1].fin ?? ls[k + 1].t) < tx - 400) k++;
          let y = 0;
          for (let j = Math.max(0, k - 1); j < Math.min(ls.length, k + 3); j++) {
            const l = ls[j];
            y += l.fin !== undefined ? ondaSostenida(tx - l.t, l.fin - l.t) : onda(tx - l.t);
          }
          // Antes de empezar, el paciente late solo, en reposo.
          if (!jugando && est.current === 'listo') y = onda(((tx % 830) + 830) % 830 - 415);
          const py = BASE - y * AMP;
          if (x === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Marcas sobre cada pico: pendiente, acertado o perdido. Los
        // sostenidos llevan una barra larga: «aquí no basta un toque».
        for (const l of ls) {
          const x = XL + (l.t - t) * VEL;
          if (x < -10 || x > W + 10 + (l.fin ? (l.fin - l.t) * VEL : 0)) continue;
          const y = BASE - AMP - 16;
          if (l.fin !== undefined && !l.juicio) {
            ctx.fillStyle = C.phosHi;
            ctx.fillRect(x - 2, y + 2, Math.max(4, (l.fin - l.t) * VEL), 4);
            ctx.font = '11px Silkscreen, monospace';
            ctx.fillText('SOSTÉN', x + 6, y - 2);
          } else if (l.juicio === 'perfecto' || l.juicio === 'bien') {
            ctx.fillStyle = l.juicio === 'perfecto' ? C.verdeHi : C.verde;
            ctx.fillRect(x - 5, y, 10, 10);
          } else if (l.juicio === 'fuera') {
            ctx.fillStyle = C.sangre;
            ctx.fillRect(x - 5, y + 3, 10, 4);
          } else {
            ctx.fillStyle = C.phosDim;
            ctx.fillRect(x - 2, y + 2, 4, 6);
          }
        }
      }
      if (ctx && lienzo.current) pared(lienzo.current, buf, t, !!vivo.current, t - pulsoEn.current);
      raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    return () => { cancelAnimationFrame(raf); tonoSostenido(false); };
  }, [terminar]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const abajo = (ev: KeyboardEvent) => {
      if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key !== 'Enter' && ev.key.length !== 1) return;
      ev.preventDefault();
      if (est.current === 'fin' && (ev.key === ' ' || ev.key === 'Enter')) { arrancar(); return; }
      presiona();
    };
    const arriba = (ev: KeyboardEvent) => {
      if (ev.key !== 'Enter' && ev.key.length !== 1) return;
      suelta();
    };
    // Si la ventana pierde el foco con la tecla abajo, nunca llega el
    // keyup: se toma como soltar, o el pulso quedaría sostenido solo.
    const pierde = () => suelta();
    window.addEventListener('keydown', abajo);
    window.addEventListener('keyup', arriba);
    window.addEventListener('blur', pierde);
    return () => {
      window.removeEventListener('keydown', abajo);
      window.removeEventListener('keyup', arriba);
      window.removeEventListener('blur', pierde);
    };
  }, [arrancar, presiona, suelta]);

  const total = cuenta.perfecto + cuenta.bien + cuenta.fuera;
  const ritmo = Math.round(((cuenta.perfecto + cuenta.bien) / Math.max(1, total)) * 100);
  const sostenesTotal = cuenta.sostenidos + cuenta.rotos;

  return (
    <Marco
      nombre="LATIDO · RITMO"
      marcador={<>
        <span key={oidos} className="latido__corazon" aria-hidden="true">♥</span> FC <b>{fc}</b> · RACHA <Cifra v={racha} />
        {racha >= 8 && <> <Cifra v={`×${Math.min(3, 1 + Math.floor(racha / 8))}`} /></>} · PUNTOS <Cifra v={puntos} />
      </>}
      mejor={mejor}
      motor={motor}
      variante="latido"
      cuenta={regresiva}
    >
      <canvas
        ref={lienzo}
        width={VW}
        height={VH}
        className={`latido__monitor ${racha >= 16 ? 'latido__monitor--x3' : racha >= 8 ? 'latido__monitor--x2' : ''} ${sosteniendo ? 'latido__monitor--sosten' : ''}`}
        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); presiona(); }}
        onPointerUp={suelta}
        onPointerCancel={suelta}
        aria-label="Monitor: marca cada latido al cruzar la línea verde; en los sostenidos, mantén y suelta al final"
      />
      {estado === 'listo' && (
        <div className="minijuego__msg">
          <p className="minijuego__titulo fx-glitch">LATIDO</p>
          <p className="minijuego__txt">
            Marca cada latido justo cuando el pico cruce la <b>línea verde</b>: el monitor
            pita en cada uno. Cuando veas una franja <b>SOSTÉN</b>, el pulso se queda arriba:
            <b> mantén presionado</b> mientras dura y <b>suelta justo al final</b>. Encadena
            aciertos para multiplicar. Ojo: el paciente se acelera y se vuelve arrítmico.
          </p>
          <p className="minijuego__tecla">ESPACIO (MANTÉN EN LOS SOSTENIDOS) · O TOCA Y MANTÉN EL MONITOR</p>
          <button className="minijuego__otra" onClick={arrancar}>CONECTAR ▸</button>
        </div>
      )}
      {estado === 'fin' && (
        <Final
          titulo={ritmo >= 70 ? 'PACIENTE ESTABLE' : 'ARRITMIA'} malo={ritmo < 70}
          puntos={puntos}
          detalle={<>
            {cuenta.perfecto} perfectos · {cuenta.bien} bien · {cuenta.fuera} fuera · {ritmo}% de ritmo
            {sostenesTotal > 0 && <><br />{cuenta.sostenidos}/{sostenesTotal} pulsos sostenidos</>}
          </>}
          envio={envio} mejor={mejor} record={record}
          otra="OTRA LECTURA ▸" onOtra={arrancar}
        />
      )}
    </Marco>
  );
}

// ---------- el monitor en 3D: una pared de luz que se aleja ----------
//
//  El trazo se pinta en un lienzo plano (el de siempre) y aquí se proyecta
//  columna a columna sobre una pared en perspectiva: lo que ya pasó queda
//  cerca, a la izquierda; lo que viene aparece al fondo y se acerca hacia
//  la línea de marcado, como una pista de juego de ritmo.

const VW = 600, VH = 300;
const PROF = 3.2;                          // cuántas veces más lejos queda el final
const BORDE_CERCA = -0.22 * VW, BORDE_LEJOS = 1.0 * VW;
const HORIZONTE = VH * 0.48, ALTO_CERCA = VH * 1.25;
const CENTRO_SRC = 0.55;

/** De una posición del monitor plano a la pared. */
function enPared(x: number, y: number) {
  const u = Math.max(0, Math.min(1, x / W)), z = 1 + u * (PROF - 1);
  const frac = (u * PROF) / z;
  const alto = ALTO_CERCA / z;
  return { x: BORDE_CERCA + frac * (BORDE_LEJOS - BORDE_CERCA), y: HORIZONTE + (y - H * CENTRO_SRC) * (alto / H) };
}
const uDe = (sx: number) => { const f = (sx - BORDE_CERCA) / (BORDE_LEJOS - BORDE_CERCA); return f / (PROF - f * (PROF - 1)); };

let fondoPared: HTMLCanvasElement | null = null;
function salaMonitor() {
  if (fondoPared) return fondoPared;
  const cv = document.createElement('canvas'); cv.width = VW; cv.height = VH;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#12081c'); g.addColorStop(0.5, '#07050c'); g.addColorStop(1, '#141028');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  // El piso y el techo convergen al fondo de la pared.
  const fuga = { x: BORDE_LEJOS + 40, y: HORIZONTE };
  ctx.strokeStyle = 'rgba(79,134,238,.22)'; ctx.lineWidth = 1;
  for (let k = -12; k <= 12; k++) {
    ctx.beginPath(); ctx.moveTo(fuga.x, fuga.y); ctx.lineTo(-VW * 0.6, HORIZONTE + k * 60); ctx.stroke();
  }
  for (let k = 1; k < 14; k++) {
    const u = k / 14, a = enPared(u * W, H * 1.15), b = enPared(u * W, -H * 0.15);
    ctx.strokeStyle = 'rgba(79,134,238,.12)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - 30 / (1 + u * (PROF - 1)), VH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - 30 / (1 + u * (PROF - 1)), 0); ctx.stroke();
  }
  // Un resplandor al fondo: de ahí viene el pulso.
  const luz = ctx.createRadialGradient(fuga.x, fuga.y, 4, fuga.x, fuga.y, VW * 0.5);
  luz.addColorStop(0, 'rgba(250,57,186,.35)'); luz.addColorStop(1, 'rgba(250,57,186,0)');
  ctx.fillStyle = luz; ctx.fillRect(0, 0, VW, VH);
  return (fondoPared = cv);
}

function pared(cv: HTMLCanvasElement, buf: HTMLCanvasElement, _t: number, sosten: boolean, desdePulso: number) {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(salaMonitor(), 0, 0);
  // La pared, columna a columna (de dos en dos píxeles: sobra resolución).
  for (let sx = 0; sx < VW; sx += 2) {
    const u0 = uDe(sx), u1 = uDe(sx + 2);
    if (u1 < 0 || u0 > 1) continue;
    const z = 1 + Math.max(0, u0) * (PROF - 1), alto = ALTO_CERCA / z;
    const src = Math.max(0, u0) * W, ancho = Math.max(1, (Math.min(1, u1) - Math.max(0, u0)) * W);
    ctx.drawImage(buf, src, 0, ancho, H, sx, HORIZONTE - alto * CENTRO_SRC, 2, alto);
  }
  // El borde de arriba y de abajo de la pared, con luz.
  ctx.strokeStyle = 'rgba(250,57,186,.6)'; ctx.lineWidth = 1;
  for (const y of [0, H]) {
    const a = enPared(0, y), b = enPared(W, y);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // La puerta de marcado: un arco de luz sobre la línea, y su reflejo en el piso.
  const arriba = enPared(XL, -H * 0.08), abajo = enPared(XL, H * 1.08);
  const late = Math.exp(-desdePulso / 160);
  ctx.strokeStyle = sosten ? 'rgba(180,245,212,.95)' : `rgba(61,220,151,${0.55 + 0.4 * late})`;
  ctx.lineWidth = sosten ? 4 : 2 + late * 2;
  ctx.beginPath(); ctx.moveTo(arriba.x, arriba.y); ctx.lineTo(abajo.x, abajo.y); ctx.lineTo(abajo.x - 60, VH); ctx.stroke();
  const brillo = ctx.createLinearGradient(abajo.x - 30, 0, abajo.x + 30, 0);
  brillo.addColorStop(0, 'rgba(61,220,151,0)'); brillo.addColorStop(0.5, `rgba(61,220,151,${0.12 + 0.2 * late})`); brillo.addColorStop(1, 'rgba(61,220,151,0)');
  ctx.fillStyle = brillo; ctx.fillRect(abajo.x - 30, arriba.y, 60, abajo.y - arriba.y);
}
