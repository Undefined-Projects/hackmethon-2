import { useEffect, useRef, useState } from 'react';
import { H, W, pintar, type Celda } from './motor3d';

// ============================================================
//  EL ASALTO A LA MENTE en 3D · lo que ve Pantalla (la final)
//
//  Una pelea de jefe. En el centro de una cámara de la cabeza late el
//  NÚCLEO de la mente; a su alrededor orbitan sus cinco facultades. Cada
//  petición de la consola sale como un rayo desde abajo:
//    · 200 sobre una facultad: impacta y la facultad ESTALLA —onda,
//      fragmentos, destello, sacudida—;
//    · 4xx: el rayo rebota y el código aparece en grande;
//    · PATCH bueno: el escudo de la voluntad se hace añicos;
//    · golpe: el núcleo retrocede y suelta pedazos;
//    · CONTRAATAQUE: tentáculos rojos se lanzan contra la cámara.
//  La destrucción se acumula —escombros en el piso, grietas en las
//  paredes, luces que fallan, la imagen que se rasga— y la máquina se
//  desespera: late más rápido, abre un ojo inyectado, tiembla. Al morir
//  convulsiona, implosiona, destella y se apaga.
//
//  Ligera aunque no pare: el cuarto se pinta una vez y encima van solo
//  primitivas a ~12 cuadros por segundo; con «reducir movimiento», sin
//  sacudidas ni desgarros.
// ============================================================

export type DibujoMente = {
  capa: 1 | 2;
  resuelta: boolean;
  procesos: { nombre: string; vivo: boolean; blindaje: number }[];
  nucleo: { vida: number; max: number; escudo: boolean; escudoHasta: number | null; furia: number };
  evento: { n: number; tipo: string; codigo: number; objetivo?: string; dano?: number } | null;
  limiteHasta: number | null;
};

const SALA = ['#########', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#########'];
const CX = W / 2, CY = 88;
const COLOR: Record<string, string> = {
  VISION: '79,134,238', LENGUAJE: '250,57,186', MEMORIA: '61,220,151', CALCULO: '255,209,102', MIEDO: '255,68,102',
};
const NOMBRE: Record<string, string> = { VISION: 'visión', LENGUAJE: 'lenguaje', MEMORIA: 'memoria', CALCULO: 'cálculo', MIEDO: 'miedo' };
const MUERTE_MS = 6000;
const azar = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function hacerFondo(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const celda: Celda = (f, c) => SALA[f]?.[c] ?? '#';
  pintar(new Uint32Array(img.data.buffer), new Float32Array(W), celda, { x: 4.5, y: 7.6, ang: 0 }, {
    niebla: 9, ambiente: 0.05, salto: 0, sprites: [],
  });
  ctx.putImageData(img, 0, 0);
  // Las dendritas: filamentos rosas y azules que trepan por las paredes.
  for (let k = 0; k < 26; k++) {
    const x0 = azar(k) * W, y0 = H * (0.15 + azar(k + 40) * 0.6);
    ctx.strokeStyle = `rgba(${k % 3 ? '250,57,186' : '79,134,238'},${0.12 + azar(k + 9) * 0.18})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    let x = x0, y = y0;
    for (let s = 0; s < 5; s++) {
      const nx = x + (azar(k * 7 + s) - 0.5) * 50, ny = y + (azar(k * 11 + s) - 0.5) * 30;
      ctx.quadraticCurveTo((x + nx) / 2 + (azar(k + s) - 0.5) * 20, (y + ny) / 2, nx, ny);
      x = nx; y = ny;
      ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(nx - 1, ny - 1, 2, 2);
    }
    ctx.stroke();
  }
  // Una pátina violeta: estamos dentro de algo vivo.
  const g = ctx.createRadialGradient(CX, CY, 10, CX, CY, W * 0.7);
  g.addColorStop(0, 'rgba(60,10,70,.25)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  return cv;
}

/** Dónde va cada facultad en su órbita, y si pasa por delante o por detrás. */
function orbita(i: number, t: number, lento: boolean) {
  const a = t * (lento ? 0.00012 : 0.00042) + (i * Math.PI * 2) / 5;
  const prof = Math.sin(a);
  return { x: CX + Math.cos(a) * 112, y: CY + 8 + prof * 26, s: 0.75 + 0.35 * (prof + 1) / 2, delante: prof > 0 };
}

type Efecto = { tipo: string; codigo: number; objetivo?: string; desde: number; x?: number; y?: number; color?: string };
type Particula = { x: number; y: number; vx: number; vy: number; vida: number; color: string; desde: number };

export function Mente3D(d: DibujoMente) {
  const cv = useRef<HTMLCanvasElement>(null);
  const fondo = useRef<HTMLCanvasElement | null>(null);
  const datos = useRef(d);
  datos.current = d;
  const efectos = useRef<Efecto[]>([]);
  const parts = useRef<Particula[]>([]);
  const etiquetas = useRef<(HTMLSpanElement | null)[]>([]);
  const muerteDesde = useRef<number | null>(null);
  const [rastro, setRastro] = useState(d.nucleo.vida);
  const [, setTic] = useState(0);

  // Cada evento nuevo dispara su efecto.
  const n = d.evento?.n ?? 0;
  useEffect(() => {
    if (!n || !d.evento) return;
    const t = performance.now();
    const ev = d.evento;
    const ef: Efecto = { tipo: ev.tipo, codigo: ev.codigo, objetivo: ev.objetivo, desde: t };
    if (ev.tipo === 'impacto' && ev.objetivo) {
      const i = d.procesos.findIndex((p) => p.nombre === ev.objetivo);
      const o = orbita(i, t, false);
      ef.x = o.x; ef.y = o.y; ef.color = COLOR[ev.objetivo];
      // La facultad estalla en pedazos.
      for (let k = 0; k < 46; k++) {
        const a = Math.random() * Math.PI * 2, v = 0.03 + Math.random() * 0.09;
        parts.current.push({ x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.03, vida: 900 + Math.random() * 900, color: k % 4 ? ef.color! : '255,255,255', desde: t });
      }
    }
    if (ev.tipo === 'golpe' || ev.tipo === 'contraataque' || ev.tipo === 'escudo') {
      for (let k = 0; k < (ev.tipo === 'escudo' ? 30 : 36); k++) {
        const a = Math.random() * Math.PI * 2, v = 0.04 + Math.random() * 0.08;
        const r = ev.tipo === 'escudo' ? 62 : 30;
        parts.current.push({ x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.02, vida: 700 + Math.random() * 900,
          color: ev.tipo === 'escudo' ? '120,200,255' : k % 3 ? '250,57,186' : '255,68,102', desde: t });
      }
    }
    if (ev.tipo === 'muerte') muerteDesde.current = t;
    efectos.current.push(ef);
    if (efectos.current.length > 6) efectos.current.shift();
    setTic((x) => x + 1);
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  // La barra deja un rastro blanco que baja despacio detrás del daño.
  useEffect(() => {
    const id = setTimeout(() => setRastro(d.nucleo.vida), 700);
    return () => clearTimeout(id);
  }, [d.nucleo.vida]);
  // Si se entra con la mente ya muerta, se queda a oscuras sin repetir la muerte.
  useEffect(() => { if (d.resuelta && muerteDesde.current === null) muerteDesde.current = -1e9; }, [d.resuelta]);

  useEffect(() => {
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    if (!fondo.current) fondo.current = hacerFondo();
    const quieto = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let id = 0, ultimo = 0;
    const cuadro = (t: number) => {
      id = requestAnimationFrame(cuadro);
      if (t - ultimo < 80) return;
      ultimo = t;
      // Si algo falla a media pintura, el lienzo no se queda transformado.
      ctx.save();
      try {
        pintarMente(ctx, fondo.current!, datos.current, efectos.current, parts.current, etiquetas.current, muerteDesde.current, t, quieto);
      } catch (err) {
        console.error('Mente3D', err);
      } finally {
        ctx.restore();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      parts.current = parts.current.filter((p) => t - p.desde < p.vida);
      efectos.current = efectos.current.filter((e) => t - e.desde < 2600);
      setTic((x) => (x + 1) % 1000);
    };
    id = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(id);
  }, []);

  const ahora = Date.now();
  const escudoRestante = d.nucleo.escudoHasta && d.nucleo.escudoHasta > ahora ? Math.ceil((d.nucleo.escudoHasta - ahora) / 1000) : 0;
  const limite = d.limiteHasta && d.limiteHasta > ahora ? Math.ceil((d.limiteHasta - ahora) / 1000) : 0;
  const vivos = d.procesos.filter((p) => p.vivo).length;
  const ultimoEf = d.evento;
  const muerta = d.resuelta;
  return (
    <div className={`mt3d capa-${d.capa} furia-${d.nucleo.furia}${muerta ? ' muerta' : ''}`}>
      <canvas ref={cv} width={W} height={H} className="mt3d-lienzo" role="img"
              aria-label={d.capa === 1 ? `La mente: quedan ${vivos} de 5 facultades` : `La voluntad de la mente: ${d.nucleo.vida} de vida`} />

      {/* La barra del jefe, o las defensas que quedan. */}
      {d.capa === 2 ? (
        <div className="mt3d-jefe" aria-hidden="true">
          <span className="mt3d-jefe-nombre">VOLUNTAD</span>
          <div className="mt3d-jefe-barra">
            <i className="rastro" style={{ width: `${(rastro / d.nucleo.max) * 100}%` }} />
            <i className="vida" style={{ width: `${(d.nucleo.vida / d.nucleo.max) * 100}%` }} />
            {[75, 50, 25].map((u) => <b key={u} style={{ left: `${u}%` }} />)}
          </div>
          <span className="mt3d-jefe-n">{d.nucleo.vida}</span>
        </div>
      ) : (
        <div className="mt3d-defensas" aria-hidden="true">
          <span>DEFENSAS</span>
          {d.procesos.map((p) => <i key={p.nombre} className={p.vivo ? 'viva' : ''} style={{ ['--c' as string]: `rgb(${COLOR[p.nombre]})` }} />)}
          <span>{vivos} / 5</span>
        </div>
      )}

      {/* Las facultades, con su nombre (se mueven con la órbita). */}
      {d.capa === 1 && d.procesos.map((p, i) => (
        <span key={p.nombre} ref={(el) => { etiquetas.current[i] = el; }}
              className={`mt3d-etq${p.vivo ? '' : ' muerta'}`} style={{ ['--c' as string]: `rgb(${COLOR[p.nombre]})` }}>
          {NOMBRE[p.nombre]}{p.vivo && p.blindaje > 0 && <small> ▣{p.blindaje}</small>}
        </span>
      ))}

      {d.capa === 2 && !muerta && (
        <span className={`mt3d-escudo${escudoRestante ? ' abajo' : ''}`} aria-hidden="true">
          {escudoRestante ? `ESCUDO ABAJO · ${escudoRestante} s` : 'ESCUDO ARRIBA'}
        </span>
      )}
      {limite > 0 && <span className="mt3d-limite">429 · LA MENTE SE CIERRA {limite} s</span>}

      {/* El código de la última respuesta, en grande. */}
      {ultimoEf && !muerta && (
        <span key={ultimoEf.n} className={`mt3d-codigo c${String(ultimoEf.codigo)[0]}xx`} aria-hidden="true">
          {ultimoEf.tipo === 'contraataque' ? '¡CONTRAATAQUE!' : ultimoEf.codigo}
          {ultimoEf.dano ? <small>−{ultimoEf.dano}</small> : null}
        </span>
      )}
      {muerta && <span className="mt3d-apagada">APAGADA</span>}
    </div>
  );
}

// ---------- el dibujo ----------

function pintarMente(ctx: CanvasRenderingContext2D, fondo: HTMLCanvasElement, d: DibujoMente, efectos: Efecto[],
  parts: Particula[], etiquetas: (HTMLSpanElement | null)[], muerteDesde: number | null, t: number, quieto: boolean) {
  const furia = d.capa === 2 ? d.nucleo.furia : 0;
  const muertos = d.procesos.filter((p) => !p.vivo).length;
  const dano = muertos + furia * 2 + (d.capa === 2 ? 2 : 0);
  // ¿Muriendo? 0 a 1 durante la muerte; más allá, a oscuras.
  const m = muerteDesde === null ? null : Math.min(1, (t - muerteDesde) / MUERTE_MS);

  // La sacudida: los impactos, los golpes y los contraataques la piden.
  let sx = 0, sy = 0;
  if (!quieto) {
    for (const e of efectos) {
      const u = (t - e.desde) / 1000;
      const fuerza = e.tipo === 'contraataque' ? 7 : e.tipo === 'impacto' || e.tipo === 'golpe' ? 4 : e.tipo === 'muerte' ? 6 : 0;
      if (fuerza && u < 0.6) { sx += (Math.random() - 0.5) * fuerza * (1 - u / 0.6); sy += (Math.random() - 0.5) * fuerza * (1 - u / 0.6); }
    }
    if (m !== null && m < 0.55) { sx += (Math.random() - 0.5) * 8 * m; sy += (Math.random() - 0.5) * 8 * m; }
    if (furia >= 2) { sx += (Math.random() - 0.5) * furia * 0.6; sy += (Math.random() - 0.5) * furia * 0.6; }
  }
  ctx.save();
  ctx.translate(sx, sy);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fondo, 0, 0);

  // Las grietas de las paredes: más cuanto más se ha roto.
  for (let k = 0; k < Math.min(14, dano * 2); k++) {
    const lado = k % 4;
    let x = lado === 0 ? 0 : lado === 1 ? W : azar(k) * W, y = lado < 2 ? H * (0.1 + azar(k + 3) * 0.5) : lado === 2 ? 0 : H * 0.62;
    ctx.strokeStyle = 'rgba(10,0,10,.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) { x += (CX - x) * 0.18 + (azar(k * 5 + s) - 0.5) * 24; y += (CY - y) * 0.18 + (azar(k * 9 + s) - 0.5) * 16; ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(250,57,186,.35)'; ctx.lineWidth = 0.5; ctx.stroke();
  }
  // Los escombros del piso: lo que ya se rompió se queda ahí, brillando.
  for (let k = 0; k < dano * 6; k++) {
    const x = azar(k * 3 + 1) * W, y = H * 0.66 + azar(k * 3 + 2) * H * 0.32, s = 1 + azar(k) * 3;
    const c = ['250,57,186', '79,134,238', '61,220,151', '255,68,102'][k % 4];
    ctx.fillStyle = `rgba(${c},${0.35 + 0.3 * Math.sin(t / 400 + k)})`;
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.6); ctx.lineTo(x - s * 0.8, y + s * 0.4); ctx.closePath(); ctx.fill();
  }

  const lento = quieto;
  const orbs = d.capa === 1 ? d.procesos.map((p, i) => ({ p, i, o: orbita(i, t, lento) })) : [];
  // Las facultades que pasan por detrás, antes que el núcleo.
  for (const { p, o } of orbs) if (!o.delante) pintarOrbe(ctx, p, o, t);
  if (m === null || m < 0.92) pintarNucleo(ctx, d, furia, efectos, t, quieto, m);
  for (const { p, o } of orbs) if (o.delante) pintarOrbe(ctx, p, o, t);
  // Las etiquetas siguen a sus facultades.
  orbs.forEach(({ o }, i) => {
    const el = etiquetas[i];
    if (!el) return;
    el.style.left = `${((o.x + sx) / W) * 100}%`;
    el.style.top = `${((o.y + sy - 14 * o.s) / H) * 100}%`;
    el.style.zIndex = o.delante ? '3' : '1';
  });

  // Los rayos: de la cámara (abajo) al blanco.
  for (const e of efectos) {
    const u = (t - e.desde) / 1000;
    const desde = { x: CX, y: H + 4 };
    const blanco = e.tipo === 'impacto' && e.x !== undefined ? { x: e.x, y: e.y! } : { x: CX, y: CY };
    if (u < 0.35 && ['impacto', 'golpe', 'escudo', 'rebote', 'sesion', 'consulta', 'limite', 'contraataque', 'muerte'].includes(e.tipo)) {
      const k = Math.min(1, u / 0.18);
      const bueno = e.codigo < 300;
      const col = e.tipo === 'sesion' || e.tipo === 'consulta' ? '120,200,255' : bueno ? '255,255,255' : '255,68,102';
      // El rebote se queda a medio camino, en el escudo, y vuelve.
      const hasta = e.tipo === 'rebote' || e.tipo === 'limite' ? 0.72 : 1;
      const v = u < 0.18 ? k * hasta : hasta * (1 - (u - 0.18) / 0.17 * (e.tipo === 'rebote' || e.tipo === 'limite' ? 1 : 0));
      const x = desde.x + (blanco.x - desde.x) * v, y = desde.y + (blanco.y - desde.y) * v;
      ctx.strokeStyle = `rgba(${col},.35)`; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(desde.x, desde.y); ctx.lineTo(x, y); ctx.stroke();
      ctx.strokeStyle = `rgba(${col},.95)`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(desde.x, desde.y); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // La onda del impacto y el destello.
    if (e.tipo === 'impacto' && e.x !== undefined && u < 1.2) {
      const r = 4 + u * 70;
      ctx.strokeStyle = `rgba(${e.color},${1 - u / 1.2})`; ctx.lineWidth = 3 * (1 - u / 1.2) + 0.5;
      ctx.beginPath(); ctx.arc(e.x, e.y!, r, 0, Math.PI * 2); ctx.stroke();
      if (u < 0.5) { ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - u / 0.5)})`; ctx.beginPath(); ctx.arc(e.x, e.y!, 16 * (1 - u), 0, Math.PI * 2); ctx.fill(); }
    }
    // El rebote: un escudo hexagonal que destella donde paró el rayo.
    if ((e.tipo === 'rebote' || e.tipo === 'limite') && u < 0.6) {
      ctx.strokeStyle = `rgba(${e.tipo === 'limite' ? '255,209,102' : '255,68,102'},${1 - u / 0.6})`; ctx.lineWidth = 2;
      hexagono(ctx, CX, CY, 64 + u * 10);
    }
    // El contraataque: tentáculos que se lanzan contra la cámara.
    if (e.tipo === 'contraataque' && u < 1.6) {
      const k = Math.min(1, u / 0.35), sale = u > 1 ? 1 - (u - 1) / 0.6 : 1;
      for (let j = 0; j < 7; j++) {
        const ax = j < 3 ? -20 : j > 3 ? W + 20 : CX, ay = j === 3 ? H + 30 : H * (0.2 + azar(j) * 0.8);
        const ex = CX + (ax - CX) * k * sale, ey = CY + (ay - CY) * k * sale;
        ctx.strokeStyle = 'rgba(255,40,90,.9)'; ctx.lineWidth = 4 - j % 2;
        ctx.beginPath(); ctx.moveTo(CX, CY);
        ctx.quadraticCurveTo(CX + (ex - CX) * 0.5 + Math.sin(t / 60 + j) * 24, CY + (ey - CY) * 0.5 + Math.cos(t / 70 + j) * 18, ex, ey);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(255,20,60,${0.35 * (1 - u / 1.6)})`; ctx.fillRect(-10, -10, W + 20, H + 20);
    }
    // El golpe a la voluntad: un destello rosa.
    if ((e.tipo === 'golpe' || e.tipo === 'escudo') && u < 0.3) {
      ctx.fillStyle = `rgba(255,255,255,${0.45 * (1 - u / 0.3)})`; ctx.fillRect(-10, -10, W + 20, H + 20);
    }
  }

  // Los fragmentos, con su gravedad.
  for (const p of parts) {
    const u = t - p.desde;
    const x = p.x + p.vx * u, y = p.y + p.vy * u + 0.00006 * u * u;
    ctx.fillStyle = `rgba(${p.color},${Math.max(0, 1 - u / p.vida)})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Las luces fallan cuanto más desesperada está.
  if (!quieto && furia > 0 && azar(Math.floor(t / 120)) < furia * 0.12) {
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(-10, -10, W + 20, H + 20);
  }
  ctx.restore();

  // La imagen se rasga: franjas desplazadas.
  if (!quieto && furia > 0) {
    for (let k = 0; k < furia * 2; k++) {
      if (azar(Math.floor(t / 90) * 13 + k) > 0.45) continue;
      const y = Math.floor(azar(Math.floor(t / 90) + k * 7) * H), h = 2 + Math.floor(azar(k + t) * 6);
      // Se copia a un lienzo aparte y se devuelve corrido: copiar un
      // lienzo sobre sí mismo lo componen mal algunos navegadores.
      const tira = tiraAux(W, h);
      const tc = tira.getContext('2d')!;
      tc.clearRect(0, 0, W, h);
      tc.drawImage(ctx.canvas, 0, y, W, h, 0, 0, W, h);
      ctx.drawImage(tira, 0, 0, W, h, (azar(t + k) - 0.5) * 14 * furia, y, W, h);
    }
  }

  // La muerte: convulsión, implosión, destello blanco y oscuridad.
  if (m !== null) {
    if (m > 0.55 && m < 0.92) {
      const k = (m - 0.55) / 0.37;
      ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.beginPath(); ctx.arc(CX, CY, 4 + (1 - k) * 60, 0, Math.PI * 2); ctx.fill();
    }
    if (m >= 0.9) {
      const k = Math.min(1, (m - 0.9) / 0.1);
      ctx.fillStyle = `rgba(255,255,255,${1 - k})`; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(0,0,0,${0.85 * k})`; ctx.fillRect(0, 0, W, H);
      // Unas brasas que tardan en apagarse.
      for (let j = 0; j < 12; j++) {
        ctx.fillStyle = `rgba(250,57,186,${0.25 + 0.25 * Math.sin(t / 500 + j)})`;
        ctx.fillRect(CX + (azar(j) - 0.5) * 80, CY + 20 + azar(j + 5) * 60, 1.5, 1.5);
      }
    }
  }
}

let aux: HTMLCanvasElement | null = null;
function tiraAux(w: number, h: number) {
  if (!aux) { aux = document.createElement('canvas'); aux.width = w; aux.height = 16; }
  if (aux.height < h) aux.height = h;
  return aux;
}

function hexagono(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let k = 0; k <= 6; k++) {
    const a = (k * Math.PI) / 3 + Math.PI / 6;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.85;
    if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.stroke();
}

function pintarOrbe(ctx: CanvasRenderingContext2D, p: { nombre: string; vivo: boolean }, o: { x: number; y: number; s: number }, t: number) {
  const c = COLOR[p.nombre];
  if (!p.vivo) {
    // Lo que queda: un anillo roto que parpadea donde estaba.
    if (Math.sin(t / 200 + o.x) > 0) {
      ctx.strokeStyle = `rgba(${c},.25)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(o.x, o.y, 6 * o.s, 0.4, Math.PI * 1.4); ctx.stroke();
    }
    return;
  }
  const r = 7 * o.s;
  const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * 2.6);
  g.addColorStop(0, `rgba(${c},.55)`); g.addColorStop(1, `rgba(${c},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, r * 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgb(${c})`; ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(o.x - r * 0.3, o.y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
  // El hilo que la une al núcleo: por ahí se hablan.
  ctx.strokeStyle = `rgba(${c},.25)`; ctx.lineWidth = 1;
  const [rx, ry] = REGION[p.nombre] ?? [0, 0];
  ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(CX + rx * 44, CY + ry * 44); ctx.stroke();
}

// ---------- el cerebro ----------
//
//  Se dibuja UNA vez en un lienzo aparte, con el mismo píxel que la escena,
//  y luego se estampa escalado por el latido. Mitad orgánico (izquierda:
//  tejido con circunvoluciones) y mitad máquina (derecha: placas y pistas
//  de circuito con la forma de los surcos), como el rostro de la barra.
//  Debajo, el cerebelo y el tallo, mitad médula y mitad cables.

/** La región de cada facultad, en radios desde el centro del cerebro. */
const REGION: Record<string, [number, number]> = {
  VISION: [-0.5, -0.5], LENGUAJE: [-0.78, 0.3], MEMORIA: [-0.25, 0.42], CALCULO: [0.52, -0.5], MIEDO: [0.74, 0.32],
};
const RB = 50;                          // el radio con el que se dibuja el sprite
type Ruta = { x: number; y: number }[];
type Cerebro = { cv: HTMLCanvasElement; ox: number; oy: number; surcos: Ruta[]; pistas: Ruta[] };
let cerebroHecho: Cerebro | null = null;

function cerebro(): Cerebro {
  if (cerebroHecho) return cerebroHecho;
  const R = RB, w = Math.ceil(R * 2.9), h = Math.ceil(R * 2.7), ox = w / 2, oy = R * 1.05;
  const nuevo = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // La silueta de un hemisferio: el lóbulo grande y el temporal.
  const silueta = (c: CanvasRenderingContext2D, lado: number) => {
    c.beginPath(); c.ellipse(ox + lado * R * 0.5, oy - R * 0.08, R * 0.62, R * 0.8, lado * 0.08, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(ox + lado * R * 0.68, oy + R * 0.36, R * 0.42, R * 0.3, lado * -0.25, 0, Math.PI * 2); c.fill();
  };
  const az = (k: number) => azar(k * 1.37 + 5);
  const surcos: Ruta[] = [], pistas: Ruta[] = [];

  // El hemisferio orgánico.
  const izq = nuevo(), ci = izq.getContext('2d')!;
  ci.fillStyle = '#fff'; silueta(ci, -1);
  ci.globalCompositeOperation = 'source-atop';
  const gi = ci.createLinearGradient(0, oy - R, 0, oy + R * 0.7);
  gi.addColorStop(0, '#ff8fd6'); gi.addColorStop(0.45, '#c2307f'); gi.addColorStop(1, '#4a0a33');
  ci.fillStyle = gi; ci.fillRect(0, 0, w, h);
  // Volúmenes: cada circunvolución, un bulto un poco más claro.
  for (let k = 0; k < 22; k++) {
    const x = ox - R * (0.1 + az(k + 400) * 0.95), y = oy - R * 0.75 + az(k + 430) * R * 1.35;
    const g = ci.createRadialGradient(x - 2, y - 2, 0, x, y, 7);
    g.addColorStop(0, 'rgba(255,170,225,.45)'); g.addColorStop(1, 'rgba(255,170,225,0)');
    ci.fillStyle = g; ci.fillRect(x - 8, y - 8, 16, 16);
  }
  for (let k = 0; k < 24; k++) {
    let x = ox - R * (0.08 + az(k) * 1.0), y = oy - R * 0.82 + az(k + 50) * R * 1.45;
    let a = az(k + 90) * Math.PI * 2;
    const ruta: Ruta = [{ x, y }];
    for (let st = 0; st < 13; st++) { a += (az(k * 13 + st) - 0.5) * 1.1; x += Math.cos(a) * 2.8; y += Math.sin(a) * 2.8; ruta.push({ x, y }); }
    surcos.push(ruta);
    const trazo = (dx: number, dy: number, color: string, ancho: number) => {
      ci.strokeStyle = color; ci.lineWidth = ancho; ci.lineCap = 'round'; ci.lineJoin = 'round';
      ci.beginPath(); ruta.forEach((q, i) => (i ? ci.lineTo(q.x + dx, q.y + dy) : ci.moveTo(q.x + dx, q.y + dy))); ci.stroke();
    };
    trazo(1, 1, 'rgba(30,0,20,.5)', 2.6);           // la sombra del surco
    trazo(0, 0, 'rgba(90,10,60,.95)', 1.4);          // el surco
    trazo(-1, -1, 'rgba(255,205,238,.6)', 1);        // el borde de la circunvolución, iluminado
  }
  // Sombra abajo, como un volumen.
  const si = ci.createRadialGradient(ox - R * 0.5, oy - R * 0.4, R * 0.2, ox - R * 0.5, oy, R * 1.1);
  si.addColorStop(0, 'rgba(0,0,0,0)'); si.addColorStop(1, 'rgba(20,0,20,.55)');
  ci.fillStyle = si; ci.fillRect(0, 0, w, h);

  // El hemisferio máquina.
  const der = nuevo(), cd = der.getContext('2d')!;
  cd.fillStyle = '#fff'; silueta(cd, 1);
  cd.globalCompositeOperation = 'source-atop';
  const gd = cd.createLinearGradient(0, oy - R, 0, oy + R * 0.7);
  gd.addColorStop(0, '#34406a'); gd.addColorStop(0.5, '#1a2140'); gd.addColorStop(1, '#090c1c');
  cd.fillStyle = gd; cd.fillRect(0, 0, w, h);
  // Placas: la misma idea de circunvolución, pero en contornos de metal.
  for (let k = 0; k < 16; k++) {
    const x = ox + R * (0.1 + az(k + 200) * 0.95), y = oy - R * 0.8 + az(k + 250) * R * 1.45;
    cd.strokeStyle = 'rgba(120,150,220,.35)'; cd.lineWidth = 1;
    cd.beginPath(); cd.ellipse(x, y, 4 + az(k) * 6, 3 + az(k + 7) * 4, az(k + 3) * 3, 0, Math.PI * 1.6); cd.stroke();
  }
  // Pistas de circuito: tramos rectos con codos, y un nodo al final.
  for (let k = 0; k < 18; k++) {
    let x = Math.round(ox + R * (0.08 + az(k + 300) * 0.9)), y = Math.round(oy - R * 0.75 + az(k + 340) * R * 1.4);
    const ruta: Ruta = [{ x, y }];
    for (let st = 0; st < 4; st++) {
      const horiz = (st + k) % 2 === 0, l = Math.round((az(k * 7 + st) - 0.4) * 16);
      if (horiz) x += l; else y += l;
      ruta.push({ x, y });
    }
    pistas.push(ruta);
    cd.strokeStyle = k % 3 ? 'rgba(79,134,238,.85)' : 'rgba(250,57,186,.75)'; cd.lineWidth = 1;
    cd.beginPath(); ruta.forEach((q, i) => (i ? cd.lineTo(q.x + 0.5, q.y + 0.5) : cd.moveTo(q.x + 0.5, q.y + 0.5))); cd.stroke();
    cd.fillStyle = k % 3 ? '#9fd6ff' : '#ff7ad1';
    cd.fillRect(ruta[ruta.length - 1].x - 1, ruta[ruta.length - 1].y - 1, 3, 3);
  }
  // Un par de chips.
  for (const [cx, cy] of [[0.45, -0.25], [0.7, 0.3]] as const) {
    const x = ox + R * cx, y = oy + R * cy;
    cd.fillStyle = '#0b0e1c'; cd.fillRect(x - 5, y - 4, 10, 8);
    cd.strokeStyle = 'rgba(159,214,255,.8)'; cd.strokeRect(x - 4.5, y - 3.5, 9, 7);
    cd.fillStyle = 'rgba(159,214,255,.7)';
    for (let p = -3; p <= 3; p += 2) { cd.fillRect(x + p, y - 6, 1, 2); cd.fillRect(x + p, y + 4, 1, 2); }
  }
  const sd = cd.createRadialGradient(ox + R * 0.5, oy - R * 0.5, R * 0.1, ox + R * 0.5, oy, R * 1.1);
  sd.addColorStop(0, 'rgba(120,150,255,.18)'); sd.addColorStop(1, 'rgba(0,0,10,.5)');
  cd.fillStyle = sd; cd.fillRect(0, 0, w, h);

  // El montaje: tallo y cerebelo detrás, los hemisferios con su contorno, la fisura.
  const cv = nuevo(), c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  // El tallo: mitad médula, mitad cables.
  c.fillStyle = '#7a1d55'; c.fillRect(ox - R * 0.14, oy + R * 0.55, R * 0.14, h);
  for (let k = 0; k < 3; k++) {
    c.fillStyle = ['#4f86ee', '#fa39ba', '#3ddc97'][k];
    c.fillRect(ox + k * 3, oy + R * 0.55, 2, h);
  }
  c.fillStyle = 'rgba(255,150,210,.5)'; c.fillRect(ox - R * 0.14, oy + R * 0.55, 1, h);
  // El cerebelo, estriado.
  c.fillStyle = '#5a1442';
  c.beginPath(); c.ellipse(ox - R * 0.12, oy + R * 0.66, R * 0.42, R * 0.2, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(255,150,210,.45)'; c.lineWidth = 1;
  for (let k = -2; k <= 2; k++) { c.beginPath(); c.ellipse(ox - R * 0.12, oy + R * 0.66 + k * 2.6, R * (0.4 - Math.abs(k) * 0.05), 1.2, 0, 0, Math.PI); c.stroke(); }
  // Cada hemisferio con un contorno de un píxel: su silueta corrida a los
  // cuatro lados, en color, y encima la textura.
  const contorno = (hemi: HTMLCanvasElement, color: string) => {
    const sil = nuevo(), cs = sil.getContext('2d')!;
    cs.drawImage(hemi, 0, 0); cs.globalCompositeOperation = 'source-in'; cs.fillStyle = color; cs.fillRect(0, 0, w, h);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.drawImage(sil, dx, dy);
    c.drawImage(hemi, 0, 0);
  };
  contorno(izq, '#ff7ad1');
  contorno(der, '#4f86ee');
  // La fisura entre los dos: una costura de luz.
  const gf = c.createLinearGradient(0, oy - R * 0.9, 0, oy + R * 0.6);
  gf.addColorStop(0, 'rgba(255,255,255,.9)'); gf.addColorStop(1, 'rgba(250,57,186,0)');
  c.fillStyle = gf; c.fillRect(ox - 0.5, oy - R * 0.86, 1.5, R * 1.4);
  cerebroHecho = { cv, ox, oy, surcos, pistas };
  return cerebroHecho;
}

function pintarNucleo(ctx: CanvasRenderingContext2D, d: DibujoMente, furia: number, efectos: Efecto[], t: number, quieto: boolean, m: number | null) {
  const capa2 = d.capa === 2;
  // El latido: más rápido cuanto más desesperada.
  const ritmo = 1.1 + furia * 0.7 + (m ?? 0) * 4;
  const late = Math.pow(Math.max(0, Math.sin(t / 1000 * Math.PI * ritmo)), 6);
  // El retroceso de un golpe.
  const golpe = efectos.find((e) => (e.tipo === 'golpe' || e.tipo === 'contraataque' || e.tipo === 'muerte') && t - e.desde < 400);
  const retro = golpe ? 1 - (t - golpe.desde) / 400 : 0;
  // Al morir se encoge hacia un punto.
  const enc = m !== null && m > 0.55 ? Math.max(0, 1 - (m - 0.55) / 0.37) : 1;
  const R = (capa2 ? 50 : 44) * (1 + late * 0.06 - retro * 0.12) * enc;
  const x = CX + (quieto ? 0 : (Math.random() - 0.5) * (retro * 6 + (m ?? 0) * 10)), y = CY;

  // El halo.
  const g = ctx.createRadialGradient(x, y, R * 0.3, x, y, R * 2.4);
  const tono = furia >= 2 ? '255,40,90' : '250,57,186';
  g.addColorStop(0, `rgba(${tono},${0.45 + late * 0.3})`); g.addColorStop(1, `rgba(${tono},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 2.4, 0, Math.PI * 2); ctx.fill();

  // Los tentáculos de la desesperación, que ya no se están quietos.
  for (let j = 0; j < furia * 3; j++) {
    const a = (j / (furia * 3)) * Math.PI * 2 + t / 900;
    const l = R * (1.4 + 0.5 * Math.sin(t / 240 + j));
    ctx.strokeStyle = `rgba(255,40,90,${0.5 + 0.2 * Math.sin(t / 150 + j)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.6, y + Math.sin(a + 0.6) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }

  // Un anillo tenue que gira: la mente sigue pensando.
  ctx.strokeStyle = 'rgba(79,134,238,.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(x, y + R * 0.1, R * 1.55, R * 0.4, (t / -2400) % (Math.PI * 2), 0, Math.PI * 2); ctx.stroke();

  // El cerebro, escalado por el latido y el retroceso.
  const cb = cerebro();
  const s = R / RB;
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.drawImage(cb.cv, -cb.ox, -cb.oy);
  const muertas = new Set(d.procesos.filter((p) => !p.vivo).map((p) => p.nombre));
  // Las regiones de las facultades destruidas: quemadas, con brasas y humo.
  for (const [nombre, [rx, ry]] of Object.entries(REGION)) {
    if (!muertas.has(nombre)) continue;
    const px = rx * RB, py = ry * RB;
    const g = ctx.createRadialGradient(px, py, 1, px, py, RB * 0.32);
    g.addColorStop(0, 'rgba(10,0,8,.92)'); g.addColorStop(0.7, 'rgba(40,5,20,.6)'); g.addColorStop(1, 'rgba(40,5,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, RB * 0.32, 0, Math.PI * 2); ctx.fill();
    for (let k = 0; k < 5; k++) {
      const on = Math.sin(t / 180 + k * 2 + rx * 9) > 0.2;
      if (!on) continue;
      ctx.fillStyle = k % 2 ? '#ff7a3a' : '#ff4466';
      ctx.fillRect(px + (azar(k + rx * 50) - 0.5) * 14, py + (azar(k + ry * 50) - 0.5) * 10, 1.5, 1.5);
    }
    // El humo que sube.
    for (let k = 0; k < 3; k++) {
      // Módulo siempre positivo: con rx negativo, `%` daría un radio negativo.
      const u = (((t / 1600 + k / 3 + rx) % 1) + 1) % 1;
      ctx.fillStyle = `rgba(90,70,90,${0.35 * (1 - u)})`;
      ctx.beginPath(); ctx.arc(px + Math.sin(u * 6 + k) * 3, py - u * 22, 2 + u * 4, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Las sinapsis: chispas por los surcos y pulsos por las pistas. Donde
  // está quemado ya no pasa nada.
  const cerca = (q: { x: number; y: number }) => [...muertas].some((nb) => {
    const [rx, ry] = REGION[nb]; return Math.hypot(q.x - cb.ox - rx * RB, q.y - cb.oy - ry * RB) < RB * 0.3;
  });
  const vel = 70 - furia * 15;
  cb.surcos.forEach((ruta, i) => {
    const k = Math.floor(t / vel + i * 5) % (ruta.length * 3);
    if (k >= ruta.length) return;
    const q = ruta[k];
    if (cerca(q)) return;
    ctx.fillStyle = 'rgba(255,240,250,.95)'; ctx.fillRect(q.x - cb.ox - 1, q.y - cb.oy - 1, 2, 2);
    const pr = ruta[Math.max(0, k - 1)];
    ctx.fillStyle = 'rgba(255,122,209,.6)'; ctx.fillRect(pr.x - cb.ox - 1, pr.y - cb.oy - 1, 2, 2);
  });
  cb.pistas.forEach((ruta, i) => {
    const u = ((t / (900 - furia * 150) + i * 0.17) % 1.6);
    if (u > 1) return;
    const tramos = ruta.length - 1, f = u * tramos, j = Math.min(tramos - 1, Math.floor(f)), r = f - j;
    const q = { x: ruta[j].x + (ruta[j + 1].x - ruta[j].x) * r, y: ruta[j].y + (ruta[j + 1].y - ruta[j].y) * r };
    if (cerca(q)) return;
    ctx.fillStyle = i % 3 ? '#cfe9ff' : '#ffd1ee'; ctx.fillRect(q.x - cb.ox - 1, q.y - cb.oy - 1, 2, 2);
  });
  // El latido enciende el cerebro entero un instante.
  if (late > 0.5) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (late - 0.5) * 0.5;
    ctx.drawImage(cb.cv, -cb.ox, -cb.oy);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();

  // Las grietas del núcleo: una por cada umbral cruzado, y más al morir.
  const grietas = furia * 2 + (m !== null ? 6 : 0);
  for (let k = 0; k < grietas; k++) {
    const a = azar(k + 70) * Math.PI * 2;
    ctx.strokeStyle = 'rgba(255,220,240,.85)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * R * 0.2, y + Math.sin(a) * R * 0.2);
    ctx.lineTo(x + Math.cos(a + 0.2) * R * 0.55, y + Math.sin(a + 0.2) * R * 0.55);
    ctx.lineTo(x + Math.cos(a - 0.1) * R * 0.85, y + Math.sin(a - 0.1) * R * 0.85);
    ctx.stroke();
  }

  // El ojo: en la capa 2 la voluntad mira. Cada vez más abierto, más
  // inyectado y más inquieto.
  if (capa2) {
    const abre = 0.45 + furia * 0.18;
    ctx.fillStyle = '#f3e6ee';
    ctx.beginPath(); ctx.ellipse(x, y, R * 0.5, R * 0.3 * abre * 1.6, 0, 0, Math.PI * 2); ctx.fill();
    for (let v = 0; v < furia * 3; v++) {
      const a = azar(v + 20) * Math.PI * 2;
      ctx.strokeStyle = 'rgba(220,30,60,.8)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * R * 0.48, y + Math.sin(a) * R * 0.3 * abre);
      ctx.lineTo(x + Math.cos(a) * R * 0.25, y + Math.sin(a) * R * 0.15 * abre); ctx.stroke();
    }
    const mira = quieto ? 0 : Math.sin(t / (500 - furia * 120)) * R * 0.15 + (Math.random() - 0.5) * furia * 2;
    ctx.fillStyle = furia >= 2 ? '#ff2050' : '#c2185b';
    ctx.beginPath(); ctx.arc(x + mira, y, R * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0008'; ctx.beginPath(); ctx.arc(x + mira, y, R * (0.08 - furia * 0.012), 0, Math.PI * 2); ctx.fill();

    // El escudo: un hexágono azul que respira. Abajo, apenas un contorno.
    if (m !== null) { /* muriendo: ya no hay escudo que valga */ } else if (d.nucleo.escudo) {
      ctx.strokeStyle = `rgba(120,200,255,${0.55 + 0.3 * Math.sin(t / 300)})`; ctx.lineWidth = 2;
      hexagono(ctx, x, y, R * 1.65);
      ctx.strokeStyle = 'rgba(120,200,255,.2)'; ctx.lineWidth = 6;
      hexagono(ctx, x, y, R * 1.65);
    } else {
      ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(120,200,255,.3)'; ctx.lineWidth = 1;
      hexagono(ctx, x, y, R * 1.65); ctx.setLineDash([]);
    }
  }
}
