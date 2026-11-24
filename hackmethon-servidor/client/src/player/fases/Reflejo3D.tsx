import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { DUR, useReflejo, type Cuidador } from './Membrana';
import { FOV, H, W, pintar, type Celda } from './motor3d';

// ============================================================
//  EL REFLEJO EN PRIMERA PERSONA · la vista 3D de Pantalla
//
//  En La Maraña, Pantalla ES el brote. Aquí es al revés: Pantalla es el
//  reflejo, plantado en la rodilla frente a su propia membrana, y ve
//  llegar a los programas por el pasillo. Al fondo hay dos puertas: la
//  del EXTERIOR, a la izquierda, y la del CUERPO, a la derecha. Por cuál
//  sale cada uno ES su origen: lo que antes era un texto («viene de…») se
//  ve, y hay que mirarlo y apuntarlo, que es el trabajo de Pantalla.
//
//  No sabe nada que la escena 2D no sepa: el nombre, si pasa, si llegó
//  con la muda y el origen. Ni tipo, ni permisos, ni firma, ni en qué
//  filtro cae nadie: eso es de Datos y de las corridas.
//
//  LIGERA A PROPÓSITO (equipos modestos, cualquier navegador):
//    · la cámara no se mueve, así que el pasillo se dibuja UNA vez y se
//      guarda como fondo; cada cuadro solo pega encima los programas y la
//      membrana;
//    · se anima a saltos, unos 10 cuadros por segundo, y solo mientras algo
//      se mueve; con la fila quieta no se dibuja nada;
//    · si un equipo tarda en dibujar, baja sola a 4 cuadros por segundo.
//  El reloj es el de la escena 2D (`useReflejo`): las dos van igual.
// ============================================================

/** El pasillo de la rodilla. Dos puertas al fondo, oscuras por dentro. */
const PLANO = [
  '#####',
  '#?#?#',
  '#.#.#',
  '#...#',
  '#...#',
  '#...#',
  '#...#',
  '#...#',
  '#####',
];
const CAM = { x: 2.5, y: 7.6 };
const PUERTA: Record<string, { x: number; y: number }> = {
  externo: { x: 1.5, y: 2.3 },
  interno: { x: 3.5, y: 2.3 },
};
const CANDIDATO = { x: 2.5, y: 6.1 };
const ROSA: [number, number, number] = [250, 57, 186];
const VERDE: [number, number, number] = [61, 220, 151];
const AZUL: [number, number, number] = [79, 134, 238];

/** Dónde cae en pantalla un punto del suelo del pasillo, y a qué escala. */
function proyecta(wx: number, wy: number) {
  const z = CAM.y - wy;
  return { sx: (W / 2) * (1 + (wx - CAM.x) / (z * FOV)), suelo: H / 2 + (0.5 * H) / z, esc: H / z, z };
}

// ---------- el programa: una cápsula de circuito, en píxeles ----------

const ARTE = [
  '.......g........',
  '.....gg.gg......',
  '......ggg.......',
  '.......g........',
  '...kkkkkkkkkk...',
  '..kbbbbbbbbbbk..',
  '..kbsssssssbbk..',
  '..kbsrsssrsbbk..',
  '..kbsssssssbbk..',
  '..kbbbbbbbbbbk..',
  '..kbtttbbtttbk..',
  '..kbbbbbbbbbbk..',
  '..kbbttttttbbk..',
  '..kbbbbbbbbbbk..',
  '...kkkkkkkkkk...',
];
const PATAS = [
  ['...k.k....k.k...', '..k..k....k..k..', '..k...k..k...k..'],
  ['....k.k..k.k....', '....k..kk..k....', '...k...kk...k...'],
];
const COLOR: Record<string, string> = {
  k: '#0b1a14', b: '#cfe9dc', s: '#07121a', r: '#fa39ba', t: '#7fb9a2', g: '#3ddc97',
};

/** Las dos poses de la cápsula (patas a un lado y al otro), y la del que
 *  llegó con la muda, con el brote azul. Se pintan una vez. */
function hacerSprites(): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (const nuevo of [false, true]) {
    for (const patas of PATAS) {
      const cv = document.createElement('canvas');
      cv.width = 16; cv.height = ARTE.length + patas.length;
      const ctx = cv.getContext('2d')!;
      [...ARTE, ...patas].forEach((fila, y) => [...fila].forEach((ch, x) => {
        if (ch === '.') return;
        ctx.fillStyle = ch === 'g' && nuevo ? '#4f86ee' : COLOR[ch];
        ctx.fillRect(x, y, 1, 1);
      }));
      out.push(cv);
    }
  }
  return out;
}

/** El pasillo, dibujado una sola vez. */
function hacerFondo(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const celda: Celda = (f, c) => PLANO[f]?.[c] ?? '#';
  pintar(new Uint32Array(img.data.buffer), new Float32Array(W), celda, { x: CAM.x, y: CAM.y, ang: 0 }, {
    niebla: 9, ambiente: 0.1, salto: 0,
    sprites: [
      { ...PUERTA.externo, y: 2.05, rgb: ROSA, alto: 1, ancho: 0.42, base: 0 },
      { ...PUERTA.interno, y: 2.05, rgb: VERDE, alto: 1, ancho: 0.42, base: 0 },
    ],
  });
  ctx.putImageData(img, 0, 0);
  return cv;
}

// ---------- la membrana, en primer plano ----------

type Estado = ReturnType<typeof useReflejo>;
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
const rgb = (c: [number, number, number], k = 1) => `rgb(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0})`;

/** Las hebras de raíz: cinco por lado, de un pilar hacia el centro. Finas,
 *  para que se vea a través de ellas a quien está delante. */
const HEBRAS = Array.from({ length: 10 }, (_, k) => {
  const lado = k < 5 ? -1 : 1, i = k % 5;
  return { lado, y: 70 + i * 26 + (lado > 0 ? 13 : 0), grueso: 2 + ((k * 5) % 2), onda: ((k * 37) % 11) - 5 };
});
const PILAR = { izq: 54, der: 266, alto: 44 };

function pintarMembrana(
  ctx: CanvasRenderingContext2D, s: Estado, capa: number, abierta: number, t: number,
  candidato: { x: number; y: number } | null,
) {
  const { mudando, rindiendo } = s;
  const viejo = mudando === 'cede' || mudando === 'seca' || mudando === 'cae';
  const tono = (viejo ? capa - 1 : capa) >= 2 ? AZUL : VERDE;
  const color = mudando === 'seca' || mudando === 'cae' ? [107, 90, 58] as [number, number, number] : tono;
  const cae = mudando === 'cae' ? t : 0;
  const crece = mudando === 'brota' ? t : 1;
  const furia = s.estado === 'rechaza';

  // Las raíces
  ctx.lineCap = 'round';
  for (const h of HEBRAS) {
    const x0 = h.lado < 0 ? PILAR.izq + 8 : PILAR.der - 8;
    const lejos = h.lado < 0 ? 168 : 152;
    const xFin = lerp(x0, lerp(lejos, x0 + h.lado * -16, abierta), crece);
    const y = h.y + cae * 140;
    ctx.globalAlpha = 1 - cae * 0.8;
    ctx.strokeStyle = rgb(color, 0.4);
    ctx.lineWidth = h.grueso + 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo((x0 + xFin) / 2, y + h.onda, xFin, y + h.onda * 0.4); ctx.stroke();
    ctx.strokeStyle = rgb(color);
    ctx.lineWidth = h.grueso;
    ctx.stroke();
    // Espinas, cuando se cierra con alguien delante.
    if (furia && !viejo) {
      ctx.fillStyle = rgb(ROSA);
      for (let x = Math.min(x0, xFin) + 6; x < Math.max(x0, xFin) - 4; x += 11) {
        ctx.beginPath(); ctx.moveTo(x, y - 1); ctx.lineTo(x + 1.5, y - 6); ctx.lineTo(x + 3, y - 1); ctx.fill();
      }
    }
    // Flores, cuando la pierna se rinde.
    if ((s.estado === 'rendida' || rindiendo) && h.y % 2 === 0) {
      ctx.fillStyle = '#ffd3ee';
      ctx.fillRect(xFin - 2, y - 2 + h.onda * 0.4, 4, 4);
    }
  }
  ctx.globalAlpha = 1;

  // Los pilares: placas a la izquierda, hueso a la derecha.
  ctx.fillStyle = '#2b3550'; ctx.fillRect(PILAR.izq - 10, PILAR.alto, 18, H - PILAR.alto);
  ctx.fillStyle = '#566389';
  for (let y = PILAR.alto + 10; y < H; y += 22) ctx.fillRect(PILAR.izq - 10, y, 18, 2);
  ctx.fillStyle = '#d8cfc0'; ctx.fillRect(PILAR.der - 8, PILAR.alto, 18, H - PILAR.alto);
  ctx.fillStyle = '#a89c88';
  for (let y = PILAR.alto + 14; y < H; y += 30) ctx.fillRect(PILAR.der - 4, y, 2, 14);

  // La rótula, mitad placa y mitad mármol.
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#3a4566';
  ctx.beginPath(); ctx.moveTo(PILAR.izq, PILAR.alto + 4); ctx.quadraticCurveTo(100, 4, 160, 6); ctx.stroke();
  ctx.strokeStyle = '#e4dccd';
  ctx.beginPath(); ctx.moveTo(160, 6); ctx.quadraticCurveTo(220, 4, PILAR.der, PILAR.alto + 4); ctx.stroke();
  if (capa >= 2 || mudando === 'cede') {
    ctx.strokeStyle = '#120a14'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(160, 2); ctx.lineTo(156, 10); ctx.lineTo(162, 16); ctx.lineTo(158, 24); ctx.stroke();
  }
  if (mudando === 'cede') {
    ctx.fillStyle = rgb(VERDE);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, r = 6 + t * 46;
      ctx.fillRect(160 + Math.cos(a) * r, 22 + Math.sin(a) * r * 0.6, 2, 2);
    }
  }

  // El impulso: sube por el nervio al palpar, baja al decidir.
  if (s.paso.etapa === 'palpa' && s.anda) {
    ctx.fillStyle = '#fff'; ctx.fillRect(PILAR.izq - 2, lerp(H - 10, PILAR.alto, t), 4, 6);
  }
  if (s.paso.etapa === 'decide' && s.anda) {
    ctx.fillStyle = rgb(s.actual?.pasa ? VERDE : ROSA); ctx.fillRect(PILAR.der, lerp(PILAR.alto, H - 10, t), 4, 6);
  }
  // El zarcillo que palpa al que está delante.
  if (candidato && (s.paso.etapa === 'palpa' || s.paso.etapa === 'decide') && s.anda) {
    ctx.strokeStyle = rgb(VERDE, 0.9); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(PILAR.izq + 6, 170);
    ctx.quadraticCurveTo(candidato.x - 30, 185, candidato.x, candidato.y); ctx.stroke();
  }

  // El ganglio, con su ojo: quien decide.
  const ojo = { vela: '#8a6f86', mira: '#fa39ba', piensa: '#4f86ee', calma: '#3ddc97', furia: '#ff4466', duerme: '#3ddc97' }[
    s.estado === 'rendida' ? 'duerme' : s.mirada] ?? '#8a6f86';
  ctx.fillStyle = '#2a0f26'; ctx.beginPath(); ctx.arc(160, 22, 12, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fa39ba'; ctx.lineWidth = 1.5; ctx.stroke();
  if (s.estado === 'rendida') {
    ctx.strokeStyle = ojo; ctx.beginPath(); ctx.moveTo(153, 22); ctx.lineTo(167, 22); ctx.stroke();
  } else {
    ctx.fillStyle = '#efe6ea'; ctx.beginPath(); ctx.ellipse(160, 22, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ojo; ctx.beginPath(); ctx.arc(160 + (s.mirada === 'mira' ? 0 : 0), 22, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b0610'; ctx.fillRect(159, 21, 2, 2);
  }
}

/** Dónde está el programa de turno y cómo, en este instante. */
function programaEn(s: Estado, t: number): { x: number; y: number; cae: number; pasa: boolean; nuevo: boolean; origen: string } | null {
  const c = s.actual as Cuidador | undefined;
  if (!c || s.mudando) return null;
  const puerta = PUERTA[c.origen ?? 'externo'] ?? PUERTA.externo;
  const base = { pasa: c.pasa, nuevo: !!c.nuevo, origen: c.origen ?? 'externo', cae: 0 };
  switch (s.paso.etapa) {
    case 'llega': {
      // Sale de su puerta, da un paso al pasillo y va hacia la membrana.
      if (t < 0.3) return { ...base, x: puerta.x, y: lerp(puerta.y, puerta.y + 1, t / 0.3) };
      const u = (t - 0.3) / 0.7;
      return { ...base, x: lerp(puerta.x, CANDIDATO.x, u), y: lerp(puerta.y + 1, CANDIDATO.y, u) };
    }
    case 'palpa':
    case 'decide':
      return { ...base, ...CANDIDATO };
    case 'veredicto':
      return c.pasa
        // Pasa a tu lado: cruza la membrana y sale por la derecha.
        ? { ...base, x: lerp(CANDIDATO.x, 3.3, t), y: lerp(CANDIDATO.y, 7.25, t) }
        // Rebota: la membrana lo empuja atrás y cae.
        : { ...base, x: CANDIDATO.x, y: lerp(CANDIDATO.y, 4.9, t), cae: t };
    default:
      return null;
  }
}

/** Un cuadro entero: fondo, programa y membrana. */
function componer(
  ctx: CanvasRenderingContext2D, fondo: HTMLCanvasElement, sprites: HTMLCanvasElement[],
  s: Estado, capa: number, abierta: number, t: number, cuadro: number,
) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fondo, 0, 0);
  const p = programaEn(s, t);
  let candidato: { x: number; y: number } | null = null;
  if (p) {
    const q = proyecta(p.x, p.y);
    if (q.z > 0.35) {
      const anda = s.paso.etapa === 'llega' || (s.paso.etapa === 'veredicto' && p.pasa);
      const sp = sprites[(p.nuevo ? 2 : 0) + (anda ? cuadro % 2 : 0)];
      const h = 0.62 * q.esc, w = (h * sp.width) / sp.height;
      ctx.save();
      ctx.globalAlpha = 1 - p.cae * 0.9;
      ctx.translate(q.sx, q.suelo);
      if (p.cae) ctx.rotate(p.cae * 1.3);
      ctx.drawImage(sp, -w / 2, -h, w, h);
      ctx.restore();
      candidato = { x: q.sx, y: q.suelo - h * 0.5 };
    }
  }
  pintarMembrana(ctx, s, capa, abierta, t, candidato);
}

const reducido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Reflejo3D({
  cola, capa = 1, resuelta = false, muda = 0, corrida = 0,
}: { cola: Cuidador[]; capa?: number; resuelta?: boolean; muda?: number; corrida?: number }) {
  const s = useReflejo({ cola, capa, resuelta, muda, corrida });
  const cv = useRef<HTMLCanvasElement>(null);
  const recursos = useRef<{ fondo: HTMLCanvasElement; sprites: HTMLCanvasElement[] } | null>(null);
  const estado = useRef({ s, capa, t0: performance.now(), abierta: 0, cuadro: 0, sucio: true });
  estado.current.s = s;
  estado.current.capa = capa;

  // Cuándo empezó lo que se está viendo: un tiempo del reflejo o de la muda.
  const marca = `${s.paso.ciclo}:${s.paso.i}:${s.paso.etapa}:${s.mudando}:${s.rindiendo}`;
  useLayoutEffect(() => { estado.current.t0 = performance.now(); estado.current.sucio = true; }, [marca, capa]);

  useEffect(() => {
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    if (!recursos.current) recursos.current = { fondo: hacerFondo(), sprites: hacerSprites() };
    const { fondo, sprites } = recursos.current;
    const quieto = reducido();
    let id = 0, ultimo = 0, intervalo = 100;
    const lentos: number[] = [];
    const bucle = (ahora: number) => {
      id = requestAnimationFrame(bucle);
      if (ahora - ultimo < intervalo) return;
      ultimo = ahora;
      const e = estado.current;
      const meta = e.s.estado === 'abre' || e.s.estado === 'rendida' ? 1 : 0;
      // Solo se dibuja si algo se mueve o acaba de cambiar.
      const mueve = (e.s.anda && e.s.paso.etapa !== 'espera' && e.s.paso.etapa !== 'fin')
        || !!e.s.mudando || e.s.rindiendo || Math.abs(e.abierta - meta) > 0.01;
      if (!mueve && !e.sucio) return;
      e.sucio = false;
      const dur = e.s.mudando ? 1500 : DUR[e.s.paso.etapa];
      const t = quieto ? 1 : Math.min(1, (ahora - e.t0) / dur);
      e.abierta = quieto ? meta : lerp(e.abierta, meta, 0.45);
      e.cuadro++;
      const t0 = performance.now();
      componer(ctx, fondo, sprites, e.s, e.capa, e.abierta, t, e.cuadro);
      // Si un equipo tarda en dibujar, baja a 4 cuadros por segundo.
      lentos.push(performance.now() - t0);
      if (lentos.length > 12) lentos.shift();
      if (lentos.length === 12 && lentos.reduce((a, b) => a + b, 0) / 12 > 40) intervalo = 250;
    };
    id = requestAnimationFrame(bucle);
    return () => cancelAnimationFrame(id);
  }, []);

  // Las puertas, rotuladas: por color y también por lugar y palabra.
  const puertas = useMemo(() => (['externo', 'interno'] as const).map((o) => {
    const q = proyecta(PUERTA[o].x, PUERTA[o].y - 0.3);
    return { o, left: (q.sx / W) * 100, top: ((q.suelo - q.esc * 1.05) / H) * 100 };
  }), []);

  const c = s.actual;
  const turno = c && s.enJuego ? c : null;
  const hechos = s.paso.etapa === 'fin' ? cola.length : s.paso.i + (s.paso.etapa === 'veredicto' ? 1 : 0);

  return (
    <div className={`rf3d${resuelta ? ' rendida' : ''}`}>
      <div className="rf3d-escena">
        <canvas ref={cv} width={W} height={H} className="rf3d-lienzo" role="img"
                aria-label={turno ? `${turno.nombre} en la membrana` : 'La membrana de la rodilla, vista desde dentro'} />
        {puertas.map((p) => (
          <span key={p.o} className={`rf3d-puerta ${p.o}`} style={{ left: `${p.left}%`, top: `${p.top}%` }} aria-hidden="true">
            {p.o === 'externo' ? 'EXTERIOR' : 'CUERPO'}
          </span>
        ))}
        <span className="rf3d-ojo" aria-hidden="true">1ª PERSONA · LA MEMBRANA · CAPA {capa}</span>
        {turno && (
          <div className={`rf3d-turno ${s.paso.etapa === 'veredicto' ? (turno.pasa ? 'pasa' : 'alto') : ''}`} role="status">
            <strong>{turno.nombre}</strong>
            <span>
              {s.paso.etapa === 'llega' ? 'llega…'
                : s.paso.etapa === 'veredicto' ? (turno.pasa ? 'PASA' : 'ALTO')
                : 'palpando…'}
            </span>
          </div>
        )}
        {s.mudando && (
          <div className={`rf3d-muda ${s.mudando}`} role="status">
            {s.mudando === 'cede'
              ? <><b>[OK] LA RÓTULA CEDE</b><span>CAPA 1 SUPERADA · sus esporas ya están dentro</span></>
              : <><b>CAPA 2 · LA MUDA</b><span>{s.mudando === 'brota' ? 'la pierna levanta otra defensa' : 'la pierna muda la piel: lo que nombraba a alguien se seca'}</span></>}
          </div>
        )}
      </div>
      {/* La fila, en 2D: quién viene y en qué orden, para poder señalarlo. */}
      <ol className="rf3d-fila" aria-label="La fila de la membrana">
        {cola.map((p, j) => {
          const hecho = j < hechos;
          return (
            <li key={`${j}-${p.nombre}`}
                className={`${j === s.paso.i && s.enJuego ? 'turno' : ''}${hecho ? (p.pasa ? ' pasa' : ' alto') : ''}${p.nuevo ? ' nuevo' : ''}`}>
              {p.nombre}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Banco de pruebas: arma el pasillo una vez y compone `n` cuadros con
 *  programas en distintos tiempos del reflejo. Lo usa `e2e/_rendimiento.mjs`. */
export function medirRendimientoReflejo(n = 120): { media: number; p95: number; max: number; fondo: number } {
  const t0 = performance.now();
  const fondo = hacerFondo();
  const tFondo = performance.now() - t0;
  const sprites = hacerSprites();
  const lienzo = document.createElement('canvas');
  lienzo.width = W; lienzo.height = H;
  const ctx = lienzo.getContext('2d')!;
  const etapas = ['llega', 'palpa', 'decide', 'veredicto'] as const;
  const tiempos: number[] = [];
  for (let k = 0; k < n; k++) {
    const etapa = etapas[k % 4];
    const pasa = k % 3 !== 0;
    const s = {
      paso: { ciclo: 0, i: 0, etapa }, actual: { nombre: 'brote', pasa, origen: k % 2 ? 'externo' : 'interno' },
      enJuego: true, mudando: null, rindiendo: false, anda: true, quieto: false, n: 1,
      estado: etapa === 'veredicto' ? (pasa ? 'abre' : 'rechaza') : 'alerta', mirada: 'mira',
    } as unknown as Estado;
    const t = performance.now();
    componer(ctx, fondo, sprites, s, 1 + (k % 2), (k % 5) / 4, (k % 10) / 10, k);
    tiempos.push(performance.now() - t);
  }
  tiempos.sort((a, b) => a - b);
  return { media: tiempos.reduce((a, b) => a + b, 0) / n, p95: tiempos[Math.floor(n * 0.95)], max: tiempos[n - 1], fondo: tFondo };
}
