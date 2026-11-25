import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FOV, H, W, pintar, type Celda } from './motor3d';
import { porNivel, type DibujoNucleo } from './Nucleo3D';

// ============================================================
//  LAS DEPENDENCIAS EN 3D · la cámara 2 de Pantalla en Núcleo Modular
//
//  Un corredor donde la PROFUNDIDAD es la profundidad de la cadena: tres
//  carriles (M1, M2, M3) y en cada uno tres nodos, `nucleo/` cerca de la
//  cámara, `medio/` más lejos y `base/` al fondo. «Más adentro» es,
//  literalmente, más hondo en la cadena de llamadas. Los nodos hondos
//  flotan más alto, como plataformas que suben hacia el fondo unidas por
//  cables: así cada nivel ocupa su franja de la pantalla y no se tapan.
//
//  Con `probar` / `ejecutar` se ve lo que es una función dependiente:
//  la LLAMADA viaja hacia el fondo (el núcleo llama al medio, el medio a
//  la base) y el RETORNO vuelve hacia la cámara cargando el valor de cada
//  nodo. Si una validación frena, el retorno se para ahí con un anillo
//  rojo. Sin corrida, un pulso suave baja y sube en bucle. En la Parte 2,
//  un conducto rosa cruza de la base de M1 al medio de M3: el acoplamiento.
//
//  Enseña lo mismo que la sala (cámara 1) —los valores del recorrido que
//  `probar` ya imprime para Pantalla—, nunca las ventanas de Datos.
// ============================================================

type DibujoDependencias = Omit<DibujoNucleo, 'tipo'> & { tipo: 'dependencias' };
export type { DibujoDependencias };

const CORREDOR = [
  '#########',
  '#.......#',
  '#.......#',
  '#.......#',
  '#.......#',
  '#.......#',
  '#.......#',
  '#.......#',
  '#########',
];
const CAM = { x: 4.5, y: 7.6 };
const CARRIL_X = [3.6, 4.5, 5.4];
/** Profundidad de cada nivel: base al fondo, medio, núcleo cerca. */
const NIVEL_Y = [3.6, 4.8, 5.7];
/** A qué altura flota cada nivel (la base, la más alta). */
const ALTO = [0.95, 0.45, 0];
/** La plataforma de cada nodo, en casillas. */
const NODO_W = 0.5, NODO_H = 0.2;
const LLAMA_MS = 420;
const DEVUELVE_MS = 520;
const CLAVE_VISTO = 'hm:nucleo-red-visto';

const proyecta = (wx: number, wy: number, alto = 0) => {
  const z = CAM.y - wy;
  return { sx: (W / 2) * (1 + (wx - CAM.x) / (z * FOV)), suelo: H / 2 + ((0.5 - alto) * H) / z, esc: H / z };
};
/** El centro de un nodo en pantalla, y su caja. */
const nodo = (t: number, k: number) => {
  const q = proyecta(CARRIL_X[t], NIVEL_Y[k], ALTO[k]);
  const w = NODO_W * q.esc, h = NODO_H * q.esc;
  return { x: q.sx, y: q.suelo - h / 2, w, h, base: q.suelo, suelo: proyecta(CARRIL_X[t], NIVEL_Y[k]).suelo };
};
/** Un punto entre dos niveles de un carril, a la altura del centro del nodo. */
const entre = (t: number, a: number, b: number, u: number) => {
  const y = NIVEL_Y[a] + (NIVEL_Y[b] - NIVEL_Y[a]) * u;
  const al = ALTO[a] + (ALTO[b] - ALTO[a]) * u + NODO_H / 2;
  const q = proyecta(CARRIL_X[t], y, al);
  return { x: q.sx, y: q.suelo };
};

function hacerFondo(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const celda: Celda = (f, c) => CORREDOR[f]?.[c] ?? '#';
  pintar(new Uint32Array(img.data.buffer), new Float32Array(W), celda, { x: CAM.x, y: CAM.y, ang: 0 }, {
    niebla: 8, ambiente: 0.09, salto: 0, sprites: [],
  });
  ctx.putImageData(img, 0, 0);
  // Los cables de cada carril y los postes de las plataformas, una sola vez.
  CARRIL_X.forEach((_, t) => {
    [0, 1, 2].forEach((k) => {
      const n = nodo(t, k);
      if (ALTO[k] > 0) { ctx.fillStyle = 'rgba(42,51,80,.9)'; ctx.fillRect(n.x - 1, n.base, 2, n.suelo - n.base); }
    });
    ctx.strokeStyle = 'rgba(79,134,238,.55)'; ctx.lineWidth = 2;
    ctx.beginPath();
    [0, 1, 2].forEach((k) => { const n = nodo(t, k); if (k === 0) ctx.moveTo(n.x, n.y); else ctx.lineTo(n.x, n.y); });
    ctx.stroke();
  });
  return cv;
}

/** Por dónde va la corrida: −1 sin corrida; 0–2, la llamada bajando
 *  (núcleo, medio, base); 3–5, el retorno subiendo (base, medio, núcleo);
 *  6, ya contada. */
type Momento = { etapa: number; desde: number };
const DURA = (etapa: number) => (etapa < 3 ? LLAMA_MS : DEVUELVE_MS);
const INICIO = [0, 1, 2, 3, 4, 5, 6].map((e) => [0, 1, 2, 3, 4, 5].slice(0, e).reduce((t, k) => t + DURA(k), 0));

/** Nivel (0 base, 1 medio, 2 núcleo) de la etapa: la llamada baja, el retorno sube. */
const nivelDe = (etapa: number) => (etapa < 3 ? 2 - etapa : etapa - 3);

type Estado = { d: DibujoDependencias; m: Momento; cuadro: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

function pintarRed(ctx: CanvasRenderingContext2D, fondo: HTMLCanvasElement, e: Estado, ahora: number) {
  const { d, m, cuadro } = e;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fondo, 0, 0);
  const corrida = d.corrida;
  const anda = !!corrida && m.etapa >= 0 && m.etapa < 6;
  const u = anda ? Math.min(1, (ahora - m.desde) / DURA(m.etapa)) : 0;

  // El acoplamiento: de la base de M1 al medio de M3, cruzando el suelo.
  const cruce = d.parte === 2 ? { a: nodo(0, 0), b: nodo(2, 1) } : null;
  if (cruce) {
    ctx.strokeStyle = 'rgba(250,57,186,.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cruce.a.x, cruce.a.y); ctx.lineTo(cruce.b.x, cruce.b.y); ctx.stroke();
  }

  // El pulso de cada carril.
  CARRIL_X.forEach((_, t) => {
    const run = corrida?.torres[t];
    const bloqueoEn = run && d.torres[t] ? porNivel(d.torres[t].piezas, run.pasos).bloqueoEn : -1;
    let desdeN: number, hastaN: number, color: string, visible = true;
    if (anda && run) {
      const subiendo = m.etapa >= 3;
      // El retorno no pasa de donde lo bloquearon.
      if (subiendo && bloqueoEn >= 0 && nivelDe(m.etapa) > bloqueoEn) visible = false;
      hastaN = nivelDe(m.etapa);
      desdeN = subiendo ? Math.max(0, hastaN - 1) : Math.min(2, hastaN + 1);
      if (m.etapa === 0 || m.etapa === 3) desdeN = hastaN;
      color = subiendo ? '#b4f5d4' : '#4f86ee';
    } else if (!corrida || m.etapa >= 6 || m.etapa < 0) {
      // Sin nada que contar: un pulso suave baja y sube en bucle.
      const c = ((ahora / 3600) + t * 0.12) % 1;
      const baja = c < 0.5, k = baja ? c * 2 : (c - 0.5) * 2;
      desdeN = baja ? 2 : 0; hastaN = baja ? 0 : 2;
      const q = entre(t, desdeN, hastaN, k);
      ctx.fillStyle = baja ? 'rgba(79,134,238,.7)' : 'rgba(180,245,212,.7)';
      ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
      return;
    } else {
      return;
    }
    if (!visible) return;
    const q = entre(t, desdeN, hastaN, u);
    ctx.fillStyle = color;
    ctx.fillRect(q.x - 2.5, q.y - 2.5, 5, 5);
    // En la Parte 2, cuando el medio de M3 llama, también llama a la base de M1.
    if (cruce && corrida?.acoplado && t === 2 && m.etapa === 2) {
      ctx.fillStyle = '#fa39ba';
      ctx.fillRect(lerp(cruce.b.x, cruce.a.x, u) - 2, lerp(cruce.b.y, cruce.a.y, u) - 2, 4, 4);
    }
  });

  // Los nodos: un zócalo por función, del color de su estado.
  CARRIL_X.forEach((_, t) => {
    const torre = d.torres[t];
    if (!torre) return;
    const run = corrida?.torres[t];
    const bloqueoEn = run ? porNivel(d.torres[t].piezas, run.pasos).bloqueoEn : -1;
    NIVEL_Y.forEach((_, k) => {
      const pieza = torre.piezas[k];
      const n = nodo(t, k);
      const w = n.w, h = n.h;
      const q = { sx: n.x, suelo: n.base };
      const armada = d.armadas.includes(pieza), enganada = d.enganadas.includes(pieza);
      ctx.fillStyle = enganada ? '#3b0e2e' : armada ? '#0e3a2b' : '#1d1830';
      ctx.fillRect(q.sx - w / 2, q.suelo - h, w, h);
      ctx.fillStyle = enganada ? (cuadro % 2 ? '#fa39ba' : '#b02a84') : armada ? '#3ddc97' : '#3d3356';
      ctx.fillRect(q.sx - w / 2, q.suelo - h - 2, w, 2);
      // El nodo en el que está ahora el pulso se enciende.
      const aqui = anda && run && nivelDe(m.etapa) === k && !(m.etapa >= 3 && bloqueoEn >= 0 && k > bloqueoEn);
      if (aqui) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        ctx.strokeRect(q.sx - w / 2 - 1.5, q.suelo - h - 3.5, w + 3, h + 5);
      }
      // La validación que frena: anillo rojo, en cuanto el retorno llega ahí.
      if (run && k === bloqueoEn && (m.etapa >= 3 + k || m.etapa >= 6)) {
        ctx.strokeStyle = '#ff4466'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(q.sx, q.suelo - h / 2, w * 0.7, h * 1.4, 0, 0, Math.PI * 2); ctx.stroke();
      }
    });
  });
}

const vistaYa = (): number => { try { return Number(sessionStorage.getItem(CLAVE_VISTO) ?? 0); } catch { return 0; } };
const marcarVista = (n: number) => { try { sessionStorage.setItem(CLAVE_VISTO, String(n)); } catch { /* sin almacenamiento */ } };
const reducido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const pct = (v: number, total: number) => `${(v / total) * 100}%`;
const NIVELES = ['BASE', 'MEDIO', 'NÚCLEO'];

export function Dependencias3D(d: DibujoDependencias) {
  const cv = useRef<HTMLCanvasElement>(null);
  const fondo = useRef<HTMLCanvasElement | null>(null);
  const n = d.corrida?.n ?? 0;

  const [m, setM] = useState<Momento>(() => ({ etapa: n && n <= vistaYa() ? 6 : -1, desde: 0 }));
  useEffect(() => {
    if (n === 0) { setM({ etapa: -1, desde: 0 }); return; }
    if (n <= vistaYa() || reducido()) { setM({ etapa: 6, desde: 0 }); marcarVista(n); return; }
    const relojes = INICIO.map((en, etapa) => setTimeout(() => {
      setM({ etapa, desde: performance.now() });
      if (etapa === 6) marcarVista(n);
    }, en));
    return () => relojes.forEach(clearTimeout);
  }, [n]);

  const estado = useRef<{ d: DibujoDependencias; m: Momento; cuadro: number }>({ d, m, cuadro: 0 });
  estado.current.d = d;
  estado.current.m = m;

  // Siempre hay algo que se mueve (el pulso en bucle), pero despacio: ~8
  // cuadros por segundo, y solo mientras esta cámara está puesta.
  useLayoutEffect(() => {
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    if (!fondo.current) fondo.current = hacerFondo();
    const dibujar = () => { estado.current.cuadro++; pintarRed(ctx, fondo.current!, estado.current, performance.now()); };
    dibujar();
    if (reducido()) return;
    const id = setInterval(dibujar, 125);
    return () => clearInterval(id);
  }, [d, m]);

  // El nombre va dentro de la plataforma y el valor a un lado: a la
  // derecha, salvo en el carril de la derecha, que lo lleva a su izquierda.
  const sitios = useMemo(() => CARRIL_X.map((_, t) => NIVEL_Y.map((__, k) => {
    const n = nodo(t, k);
    const derecha = t !== 2;
    return {
      left: pct(n.x, W), centro: pct(n.y, H),
      valor: pct(derecha ? n.x + n.w / 2 + 2 : n.x - n.w / 2 - 2, W), derecha, esc: n.w / NODO_W,
    };
  })), []);

  const run = d.corrida;
  const anda = !!run && m.etapa >= 0 && m.etapa < 6;

  return (
    <div className="dp3d">
      <canvas ref={cv} width={W} height={H} className="dp3d-lienzo" role="img"
              aria-label={`Las dependencias de las tres cadenas, parte ${d.parte}`} />
      <span className="nu3d-ojo" aria-hidden="true">
        DEPENDENCIAS · PARTE {d.parte}
        {anda ? ` · ${m.etapa < 3 ? 'LLAMANDO…' : 'DEVOLVIENDO…'}` : ''}
      </span>
      <span className="dp3d-leyenda" aria-hidden="true">
        <i className="llama" /> llama hacia adentro · <i className="devuelve" /> devuelve hacia afuera
      </span>
      {d.parte === 2 && <span className="nu3d-acople" aria-hidden="true">BASE DE M1 ACOPLADA A M3</span>}
      {NIVELES.map((nv, k) => (
        <span key={nv} className="dp3d-nivel" aria-hidden="true" style={{ left: '1.5%', top: sitios[0][k].centro }}>{nv}</span>
      ))}
      {d.torres.map((t, i) => (
        <div key={t.id} aria-hidden="true">
          <span className="dp3d-carril" style={{ left: sitios[i][2].left, top: '93%' }}>{t.id}</span>
          {t.piezas.map((p, k) => {
            const niv = run?.torres[i] ? porNivel(t.piezas, run.torres[i].pasos) : null;
            const paso = niv?.pasos[k];
            const bloqueoEn = niv?.bloqueoEn ?? -1;
            // El valor aparece cuando el retorno pasa por el nodo.
            const devuelto = run && paso && (m.etapa >= 3 + k) && !(bloqueoEn >= 0 && k > bloqueoEn);
            return (
              <span key={p}>
                <span className={`dp3d-nodo${d.abierta === p ? ' abierta' : ''}${sitios[i][k].esc < 50 ? ' lejos' : ''}`}
                      style={{ left: sitios[i][k].left, top: sitios[i][k].centro }}>{p}</span>
                {devuelto && (
                  <b className={`dp3d-valor${paso!.bloqueado ? ' bloqueo' : paso!.enganada ? ' enganada' : ''}${sitios[i][k].derecha ? '' : ' izq'}`}
                     style={{ left: sitios[i][k].valor, top: sitios[i][k].centro }}>
                    {paso!.bloqueado ? 'BLOQUEO' : paso!.salida}
                  </b>
                )}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
