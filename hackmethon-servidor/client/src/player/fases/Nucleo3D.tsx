import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FOV, H, W, pintar, type Celda } from './motor3d';

// ============================================================
//  LA SALA DEL NÚCLEO EN 3D · la cámara 1 de Pantalla en Núcleo Modular
//
//  Tres torres al fondo de la sala, una por subsistema (M1 tracción, M2
//  hidráulica, M3 enfriamiento). Cada torre son tres bloques apilados,
//  uno por función de su cadena: `base/` abajo, `medio/` en medio y
//  `nucleo/` arriba. Un bloque está SELLADO (oscuro, «???») hasta que se
//  arma, ARMADO (circuito encendido) cuando ya se conoce su código, y
//  SABOTEADO (rosa, con interferencia) cuando se le mete un `enganar`.
//
//  Con `probar` el pulso sube por cada torre, a saltos, bloque a bloque, y
//  en cada uno se ve el valor que devolvió esa función; si una validación
//  lo frena, sale una barrera roja en ese bloque. Con `ejecutar`, cada
//  torre enseña su desenlace: colapsa (sobrecarga), quema el fusible o
//  aguanta. En la Parte 2 un cable une la base de M1 con el medio de M3:
//  el acoplamiento, y el pulso también viaja por él.
//
//  Solo enseña lo que la salida de `probar` / `ejecutar`, el árbol y el
//  visor de código ya le enseñan a Pantalla. Las ventanas (`aguanta_max`,
//  `fusible_corte`) NO llegan: son de Datos.
//
//  Ligera como El Reflejo: la sala se dibuja una vez; cada cuadro pega las
//  torres encima, a ~8 cuadros por segundo y solo si algo se mueve.
// ============================================================

type Resultado = 'aguanta' | 'sobrecarga' | 'fusible' | 'bloqueado';
type Paso = { pieza: string; nivel: string; salida: number | null; enganada: boolean; bloqueado: boolean };
export type CorridaNucleo = {
  n: number;
  tipo: 'probar' | 'ejecutar';
  acoplado: boolean;
  torres: { id: string; pasos: Paso[]; salida: number | null; bloqueado: boolean; resultado: Resultado | null }[];
};
export type DibujoNucleo = {
  tipo: 'nucleo';
  parte: number;
  abierta: string | null;
  armadas: string[];
  enganadas: string[];
  /** Por torre, sus piezas de abajo arriba: base, medio, núcleo. */
  torres: { id: string; nombre: string; piezas: string[] }[];
  corrida: CorridaNucleo | null;
};

const SALA = [
  '#######',
  '#.....#',
  '#.....#',
  '#.....#',
  '#.....#',
  '#.....#',
  '#######',
];
const CAM = { x: 3.5, y: 5.7 };
const TORRE_X = [2.05, 3.5, 4.95];
const TORRE_Y = 1.9;
/** Lo que dura cada salto del pulso, y lo que se enseña el desenlace. */
const PASO_MS = 600;
const DESENLACE_MS = 2400;
const CLAVE_VISTO = 'hm:nucleo-visto';

/** Los pasos de una torre, por nivel (base, medio, núcleo), buscados por el
 *  nombre de su pieza: en la Parte 2 la cadena de M3 trae un paso más (la
 *  `carga` de M1, por el acoplamiento) y por posición se correrían. */
export function porNivel(piezas: string[], pasos: Paso[]): { pasos: (Paso | undefined)[]; bloqueoEn: number; tope: number } {
  const xs = piezas.map((p) => pasos.find((q) => q.pieza === p));
  const bloqueoEn = xs.findIndex((q) => q?.bloqueado);
  let tope = -1;
  xs.forEach((q, k) => { if (q && (bloqueoEn < 0 || k <= bloqueoEn)) tope = k; });
  return { pasos: xs, bloqueoEn, tope };
}

const proyecta = (wx: number, wy: number) => {
  const z = CAM.y - wy;
  return { sx: (W / 2) * (1 + (wx - CAM.x) / (z * FOV)), suelo: H / 2 + (0.5 * H) / z, esc: H / z };
};

/** Dónde cae cada bloque de cada torre, en el lienzo de 320 × 200. */
function geometria() {
  return TORRE_X.map((wx) => {
    const q = proyecta(wx, TORRE_Y);
    const bw = 0.72 * q.esc, bh = 0.36 * q.esc, hueco = 3;
    const bloques = [0, 1, 2].map((k) => ({
      x: q.sx - bw / 2, y: q.suelo - (k + 1) * bh - k * hueco, w: bw, h: bh,
    }));
    return { sx: q.sx, suelo: q.suelo, bloques, cima: bloques[2].y };
  });
}
const GEO = geometria();

function hacerFondo(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const celda: Celda = (f, c) => SALA[f]?.[c] ?? '#';
  pintar(new Uint32Array(img.data.buffer), new Float32Array(W), celda, { x: CAM.x, y: CAM.y, ang: 0 }, {
    niebla: 9, ambiente: 0.1, salto: 0,
    // Una luz fría detrás de cada torre.
    sprites: TORRE_X.map((x) => ({ x, y: TORRE_Y - 0.6, rgb: [79, 134, 238] as [number, number, number], alto: 1.3, ancho: 0.5, base: 0 })),
  });
  ctx.putImageData(img, 0, 0);
  return cv;
}

// ---------- el instante de la animación ----------

/** Por dónde va la corrida: −1 sin corrida; 0, 1 y 2, el bloque por el que
 *  sube el pulso; 3, el desenlace; 4, ya contada. */
type Momento = { etapa: number; desde: number };

type Estado = { d: DibujoNucleo; m: Momento; cuadro: number };

const COLOR = {
  sellado: '#1d1830', selladoBorde: '#3d3356',
  armado: '#0e3a2b', armadoTraza: '#3ddc97',
  enganado: '#3b0e2e', enganadoTraza: '#fa39ba',
  luz: '#b4f5d4', bloqueo: '#ff4466',
};

function pintarTorres(ctx: CanvasRenderingContext2D, fondo: HTMLCanvasElement, e: Estado, ahora: number) {
  const { d, m, cuadro } = e;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fondo, 0, 0);
  const corrida = d.corrida;
  const enDesenlace = m.etapa >= 3;
  const tDes = enDesenlace ? Math.min(1, (ahora - m.desde) / DESENLACE_MS) : 0;

  // El acoplamiento de la Parte 2: de la base de M1 al medio de M3.
  if (d.parte === 2) {
    const a = GEO[0].bloques[0], b = GEO[2].bloques[1];
    const x0 = a.x + a.w, y0 = a.y + a.h * 0.6, x1 = b.x, y1 = b.y + b.h * 0.5;
    const yc = Math.max(y0, y1) + 22;
    ctx.strokeStyle = 'rgba(250,57,186,.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, yc, x1, y1); ctx.stroke();
    // El pulso de carga también viaja por aquí, en el segundo salto.
    if (corrida?.acoplado && m.etapa === 1) {
      const u = Math.min(1, (ahora - m.desde) / PASO_MS);
      const px = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * ((x0 + x1) / 2) + u * u * x1;
      const py = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * yc + u * u * y1;
      ctx.fillStyle = '#fff'; ctx.fillRect(px - 2, py - 2, 4, 4);
    }
  }

  GEO.forEach((g, t) => {
    const torre = d.torres[t];
    if (!torre) return;
    const run = corrida?.torres[t];
    const niv = run ? porNivel(torre.piezas, run.pasos) : null;
    const bloqueoEn = niv?.bloqueoEn ?? -1;
    const llegaA = niv?.tope ?? -1;
    const res = enDesenlace ? run?.resultado ?? null : null;
    // Colapso: tiembla y el bloque de arriba se va desplazando.
    const tiembla = res === 'sobrecarga' && tDes < 1 ? (cuadro % 2 ? 1.5 : -1.5) : 0;

    g.bloques.forEach((b, k) => {
      const pieza = torre.piezas[k];
      const armada = d.armadas.includes(pieza);
      const enganada = d.enganadas.includes(pieza);
      const cae = res === 'sobrecarga' ? tDes * (k + 1) * 4 : 0;
      const x = b.x + tiembla + (k === 2 ? cae : 0), y = b.y + (k === 2 ? -cae * 0.6 : 0);
      ctx.fillStyle = enganada ? COLOR.enganado : armada ? COLOR.armado : COLOR.sellado;
      ctx.fillRect(x, y, b.w, b.h);
      // La cara de arriba, para que se lea como volumen.
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(x + 3, y - 3, b.w - 3, 3);
      // Lo de dentro: circuito, interferencia o «???».
      if (enganada) {
        ctx.fillStyle = COLOR.enganadoTraza;
        for (let r = (cuadro % 3); r < b.h; r += 4) ctx.fillRect(x + 2, y + r, b.w - 4, 1);
      } else if (armada) {
        ctx.fillStyle = COLOR.armadoTraza;
        ctx.fillRect(x + 4, y + b.h / 2, b.w - 8, 1);
        ctx.fillRect(x + b.w * 0.3, y + 3, 1, b.h / 2 - 2);
        ctx.fillRect(x + b.w * 0.7, y + b.h / 2, 1, b.h / 2 - 3);
      } else {
        ctx.fillStyle = COLOR.selladoBorde;
        for (let q = 0; q < 3; q++) ctx.fillRect(x + b.w / 2 - 7 + q * 6, y + b.h / 2 - 1, 3, 3);
      }
      ctx.strokeStyle = enganada ? COLOR.enganadoTraza : armada ? '#2a8f69' : COLOR.selladoBorde;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, b.w - 1, b.h - 1);
      // El candado del núcleo: sellado, no se edita.
      if (k === 2) {
        ctx.fillStyle = '#8a7fb0';
        ctx.fillRect(x + b.w - 9, y + 3, 6, 4);
        ctx.strokeStyle = '#8a7fb0'; ctx.strokeRect(x + b.w - 8, y + 0.5, 4, 3);
      }
      // El pulso: el bloque por el que pasa ahora, y los ya pasados.
      if (run && m.etapa >= 0 && k <= Math.min(m.etapa, llegaA)) {
        const ahoraAqui = k === m.etapa;
        ctx.strokeStyle = ahoraAqui ? '#ffffff' : COLOR.luz;
        ctx.lineWidth = ahoraAqui ? 2 : 1;
        ctx.strokeRect(x - 1, y - 1, b.w + 2, b.h + 2);
        if (ahoraAqui) { ctx.fillStyle = 'rgba(180,245,212,.25)'; ctx.fillRect(x, y, b.w, b.h); }
      }
      // La validación que frena: barrera roja.
      if (run && k === bloqueoEn && m.etapa >= k) {
        ctx.fillStyle = COLOR.bloqueo;
        ctx.fillRect(x - 3, y + b.h / 2 - 2, b.w + 6, 4);
        ctx.beginPath(); ctx.moveTo(x + 4, y + 3); ctx.lineTo(x + b.w - 4, y + b.h - 3);
        ctx.moveTo(x + b.w - 4, y + 3); ctx.lineTo(x + 4, y + b.h - 3);
        ctx.strokeStyle = COLOR.bloqueo; ctx.lineWidth = 1.5; ctx.stroke();
      }
    });

    // El cable de cada torre al suelo, por donde entra el pulso.
    ctx.fillStyle = run && m.etapa >= 0 && m.etapa < 3 ? COLOR.luz : '#2a3350';
    ctx.fillRect(g.sx - 1, g.bloques[0].y + g.bloques[0].h, 2, g.suelo - (g.bloques[0].y + g.bloques[0].h) + 1);

    // El desenlace al ejecutar.
    if (res === 'sobrecarga') {
      for (let k = 0; k < 14; k++) {
        const a = ((k * 47 + cuadro * 13) % 100) / 100;
        const sx = g.sx + (a - 0.5) * 40, sy = g.cima - 4 - ((k * 31 + cuadro * 7) % 40) * tDes;
        ctx.fillStyle = k % 3 ? '#ffd36b' : '#ffffff';
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.fillStyle = `rgba(255,120,60,${0.25 * (1 - tDes)})`;
      ctx.fillRect(g.bloques[0].x - 4, g.cima - 6, g.bloques[0].w + 8, g.suelo - g.cima + 6);
    } else if (res === 'fusible') {
      if (tDes < 0.15) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(g.sx - 14, g.cima - 14, 28, 14); }
      ctx.fillStyle = 'rgba(120,120,130,.55)';
      for (let k = 0; k < 5; k++) {
        const r = 3 + k * 1.5 + tDes * 6;
        ctx.beginPath(); ctx.arc(g.sx + Math.sin(k + cuadro * 0.4) * 5, g.cima - 8 - k * 7 - tDes * 14, r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (res === 'aguanta') {
      ctx.strokeStyle = 'rgba(61,220,151,.7)'; ctx.lineWidth = 1;
      ctx.strokeRect(g.bloques[0].x - 3, g.cima - 3, g.bloques[0].w + 6, g.suelo - g.cima + 3);
    }
  });

  // El dron sobre la pieza abierta.
  if (d.abierta) {
    const t = d.torres.findIndex((tr) => tr.piezas.includes(d.abierta!));
    if (t >= 0) {
      const k = d.torres[t].piezas.indexOf(d.abierta);
      const b = GEO[t].bloques[k];
      const y = b.y - 12 + (cuadro % 2);
      ctx.fillStyle = '#4f86ee';
      ctx.fillRect(b.x + b.w / 2 - 5, y, 10, 4);
      ctx.fillRect(b.x + b.w / 2 - 9, y - 1, 4, 1); ctx.fillRect(b.x + b.w / 2 + 5, y - 1, 4, 1);
      ctx.fillStyle = '#fa39ba'; ctx.fillRect(b.x + b.w / 2 - 1, y + 1, 2, 2);
      ctx.strokeStyle = 'rgba(79,134,238,.9)'; ctx.setLineDash([2, 2]);
      ctx.strokeRect(b.x - 2.5, b.y - 2.5, b.w + 5, b.h + 5); ctx.setLineDash([]);
    }
  }
}

const vistaYa = (): number => { try { return Number(sessionStorage.getItem(CLAVE_VISTO) ?? 0); } catch { return 0; } };
const marcarVista = (n: number) => { try { sessionStorage.setItem(CLAVE_VISTO, String(n)); } catch { /* sin almacenamiento */ } };
const reducido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const pct = (v: number, total: number) => `${(v / total) * 100}%`;
/** «1. traccion motriz» → «TRACCIÓN»: cabe bajo la torre. */
const CORTOS: Record<string, string> = { traccion: 'TRACCIÓN', presion: 'HIDRÁULICA', enfriamiento: 'ENFRIAMIENTO' };
const nombreCorto = (s: string) => {
  const w = s.replace(/^\d+\.\s*/, '').split(' ')[0].toLowerCase();
  return CORTOS[w] ?? w.toUpperCase();
};

export function Nucleo3D(d: DibujoNucleo) {
  const cv = useRef<HTMLCanvasElement>(null);
  const fondo = useRef<HTMLCanvasElement | null>(null);
  const n = d.corrida?.n ?? 0;

  // La corrida se cuenta una vez por pestaña: quien recarga la ve contada.
  const [m, setM] = useState<Momento>(() =>
    (n === 0 ? { etapa: -1, desde: 0 } : n <= vistaYa() ? { etapa: 4, desde: 0 } : { etapa: -1, desde: 0 }));
  useEffect(() => {
    if (n === 0) { setM({ etapa: -1, desde: 0 }); return; }
    if (n <= vistaYa() || reducido()) { setM({ etapa: 4, desde: 0 }); marcarVista(n); return; }
    const relojes = [0, 1, 2, 3, 4].map((etapa) => setTimeout(() => {
      setM({ etapa, desde: performance.now() });
      if (etapa === 4) marcarVista(n);
    }, etapa < 4 ? etapa * PASO_MS : 3 * PASO_MS + DESENLACE_MS));
    return () => relojes.forEach(clearTimeout);
  }, [n]);

  const estado = useRef<Estado>({ d, m, cuadro: 0 });
  estado.current.d = d;
  estado.current.m = m;

  // Se dibuja al cambiar algo, y en bucle a ~8 cuadros por segundo solo si
  // algo se mueve: el pulso, el desenlace, la interferencia o el dron.
  useLayoutEffect(() => {
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    if (!fondo.current) fondo.current = hacerFondo();
    const dibujar = () => { estado.current.cuadro++; pintarTorres(ctx, fondo.current!, estado.current, performance.now()); };
    dibujar();
    const vivo = (m.etapa >= 0 && m.etapa < 4) || d.enganadas.length > 0 || !!d.abierta;
    if (!vivo || reducido()) return;
    const id = setInterval(dibujar, 125);
    return () => clearInterval(id);
  }, [d, m]);

  // Los rótulos van en HTML encima del lienzo: nítidos a cualquier tamaño.
  const run = d.corrida;
  const etiquetas = useMemo(() => GEO.map((g) => ({
    left: pct(g.sx, W), pie: pct(g.suelo + 4, H), cima: pct(g.cima - 4, H),
    // Los valores, al lado de fuera de cada torre; la de la derecha, a su izquierda.
    bloques: g.bloques.map((b, k) => ({
      left: pct(g.sx > W / 2 + 10 ? b.x - 3 : b.x + b.w + 3, W), top: pct(b.y + b.h / 2, H),
      centro: pct(b.x + b.w / 2, W), izquierda: g.sx > W / 2 + 10, k,
    })),
  })), []);

  return (
    <div className="nu3d">
      <canvas ref={cv} width={W} height={H} className="nu3d-lienzo" role="img"
              aria-label={`La sala del núcleo: tres torres, parte ${d.parte}`} />
      <span className="nu3d-ojo" aria-hidden="true">
        SALA DEL NÚCLEO · PARTE {d.parte}
        {run && m.etapa >= 0 && m.etapa < 4 ? ` · ${run.tipo === 'probar' ? 'PROBANDO…' : 'EJECUTANDO…'}` : ''}
      </span>
      {d.parte === 2 && <span className="nu3d-acople" aria-hidden="true">M1 Y M3 ACOPLADOS</span>}
      {d.torres.map((t, i) => {
        const e = etiquetas[i];
        const r = run?.torres[i];
        const niv = r ? porNivel(t.piezas, r.pasos) : null;
        const tope = niv?.tope ?? -1;
        return (
          <div key={t.id} aria-hidden="true">
            <span className="nu3d-torre" style={{ left: e.left, top: e.pie }}>{t.id} · {nombreCorto(t.nombre)}</span>
            {t.piezas.map((p, k) => (
              <span key={p} className={`nu3d-pieza${d.abierta === p ? ' abierta' : ''}`} style={{ left: e.bloques[k].centro, top: e.bloques[k].top }}>{p}</span>
            ))}
            {/* Los valores del recorrido, según los va alcanzando el pulso. */}
            {r && niv && m.etapa >= 0 && niv.pasos.map((p, k) => p && k <= Math.min(m.etapa, tope) && (
              <span key={`v${k}`} className={`nu3d-valor${p.bloqueado ? ' bloqueo' : ''}${p.enganada ? ' enganada' : ''}${e.bloques[k].izquierda ? ' izq' : ''}`}
                    style={{ left: e.bloques[k].left, top: e.bloques[k].top }}>
                {p.bloqueado ? 'BLOQUEO' : p.salida}
              </span>
            ))}
            {r && m.etapa >= 3 && (
              <span className={`nu3d-salida ${r.resultado ?? (r.bloqueado ? 'bloqueado' : 'sale')}`} style={{ left: e.left, top: e.cima }}>
                {r.resultado === 'sobrecarga' ? `${r.salida} · COLAPSA`
                  : r.resultado === 'fusible' ? `${r.salida} · FUSIBLE`
                  : r.resultado === 'aguanta' ? `${r.salida} · AGUANTA`
                  : r.bloqueado ? 'BLOQUEADO' : `sale ${r.salida}`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Banco de pruebas: arma la sala una vez y pinta `n` cuadros con corridas
 *  a medias y desenlaces. Lo usa `e2e/_rendimiento.mjs`. */
export function medirRendimientoNucleo(n = 120): { media: number; p95: number; max: number } {
  const fondo = hacerFondo();
  const lienzo = document.createElement('canvas');
  lienzo.width = W; lienzo.height = H;
  const ctx = lienzo.getContext('2d')!;
  const paso = (pieza: string, nivel: string, salida: number | null, bloqueado = false): Paso =>
    ({ pieza, nivel, salida, enganada: nivel === 'medio', bloqueado });
  const d: DibujoNucleo = {
    tipo: 'nucleo', parte: 2, abierta: 'presion', armadas: ['carga', 'presion', 'pulso', 'freno'], enganadas: ['presion', 'pulso'],
    torres: [
      { id: 'M1', nombre: '1. traccion motriz', piezas: ['carga', 'presion', 'reactor'] },
      { id: 'M2', nombre: '2. presion hidraulica', piezas: ['pulso', 'valvula', 'escudo'] },
      { id: 'M3', nombre: '3. enfriamiento de marcha', piezas: ['freno', 'flujo', 'latido'] },
    ],
    corrida: {
      n: 1, tipo: 'ejecutar', acoplado: true,
      torres: [
        { id: 'M1', pasos: [paso('carga', 'base', 10), paso('presion', 'medio', 22), paso('reactor', 'nucleo', 44)], salida: 44, bloqueado: false, resultado: 'sobrecarga' },
        { id: 'M2', pasos: [paso('pulso', 'base', 18), paso('valvula', 'medio', 58), paso('escudo', 'nucleo', null, true)], salida: null, bloqueado: true, resultado: 'bloqueado' },
        { id: 'M3', pasos: [paso('freno', 'base', 3), paso('flujo', 'medio', 27), paso('latido', 'nucleo', 99)], salida: 99, bloqueado: false, resultado: 'fusible' },
      ],
    },
  };
  const tiempos: number[] = [];
  for (let k = 0; k < n; k++) {
    const t = performance.now();
    pintarTorres(ctx, fondo, { d, m: { etapa: k % 5, desde: t - (k % 7) * 200 }, cuadro: k }, t);
    tiempos.push(performance.now() - t);
  }
  tiempos.sort((a, b) => a - b);
  return { media: tiempos.reduce((a, b) => a + b, 0) / n, p95: tiempos[Math.floor(n * 0.95)], max: tiempos[n - 1] };
}
