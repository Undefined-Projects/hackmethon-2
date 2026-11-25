import { useEffect, useRef } from 'react';

// ============================================================
//  EL CORAZÓN · el monitor de fósforo verde (bonus, Pantalla)
//
//  Una pantalla de IBM vieja: fósforo verde que deja estela (cada cuadro
//  se borra solo un poco, como el tubo de verdad). A la izquierda, el
//  corazón en píxeles gordos; a la derecha, su electrocardiograma como un
//  osciloscopio, con el haz barriendo de izquierda a derecha.
//
//    · MUERTO: el corazón apagado y agrietado, línea plana. «SIN PULSO».
//    · INFECTADO: late, pero mal: arritmia, picos de más y bloques del
//      corazón que se corrompen en glifos. El medidor de virus baja con
//      cada línea borrada.
//    · SANO: late tranquilo, el trazo es limpio, y aparece su rostro.
// ============================================================

export type DibujoCorazon = {
  capa: 1 | 2;
  estado: 'muerto' | 'infectado' | 'sano';
  cwd: string;
  virus: { quedan: number; total: number };
  evento: { n: number; tipo: 'arranque' | 'falla' | 'borra' | 'perdida' | 'termina' | 'reinicia' | 'consulta' } | null;
};

const W = 320, H = 200;
const VERDE = '51,255,102';
/** El corazón, en píxeles: 13 × 11. */
const FORMA = [
  '..XXX...XXX..',
  '.XXXXX.XXXXX.',
  'XXXXXXXXXXXXX',
  'XXXXXXXXXXXXX',
  'XXXXXXXXXXXXX',
  '.XXXXXXXXXXX.',
  '..XXXXXXXXX..',
  '...XXXXXXX...',
  '....XXXXX....',
  '.....XXX.....',
  '......X......',
];
/** Las grietas del corazón muerto: bloques que faltan. */
const GRIETA = new Set(['2,5', '3,6', '4,6', '5,7', '6,6', '7,7', '3,9', '4,10']);
const GLIFOS = '#%&@$?!▓▒░01';
const azar = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** La forma de un latido en el instante `dt` (ms) respecto a su pico. */
const g = (x: number, a: number, mu: number, s: number) => a * Math.exp(-((x - mu) ** 2) / (2 * s * s));
const onda = (dt: number) => g(dt, 0.12, -170, 28) - g(dt, 0.12, -24, 7) + g(dt, 1, 0, 9) - g(dt, 0.28, 26, 8) + g(dt, 0.24, 190, 45);

export function CorazonCRT(d: DibujoCorazon) {
  const cv = useRef<HTMLCanvasElement>(null);
  const datos = useRef(d);
  datos.current = d;
  const evento = useRef<{ tipo: string; desde: number } | null>(null);
  const n = d.evento?.n ?? 0;
  useEffect(() => { if (n && d.evento) evento.current = { tipo: d.evento.tipo, desde: performance.now() }; }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const quieto = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // El ritmo: cuándo cae cada latido. Sano, regular; infectado, a saltos.
    let proximo = performance.now() + 600, ultimoLatido = -1e9, xHaz = 0, yAntes = 150;
    // El trazo va en su propia capa, con la persistencia del fósforo: se
    // borra solo un poco cada cuadro y deja estela. Lo demás se pinta
    // limpio, para que lo apagado se vea apagado.
    const trazo = document.createElement('canvas'); trazo.width = W; trazo.height = H;
    const tc = trazo.getContext('2d')!;
    let id = 0, ultimo = 0;
    const cuadro = (t: number) => {
      id = requestAnimationFrame(cuadro);
      if (t - ultimo < 33) return;
      const dt = t - ultimo; ultimo = t;
      const s = datos.current;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      tc.globalCompositeOperation = 'destination-out';
      tc.fillStyle = quieto ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,.09)';
      tc.fillRect(0, 0, W, H);
      tc.globalCompositeOperation = 'source-over';

      const vivo = s.estado !== 'muerto';
      if (vivo && t >= proximo) {
        ultimoLatido = t;
        const base = s.estado === 'sano' ? 820 : 520;
        proximo = t + (s.estado === 'infectado' ? base * (0.45 + Math.random() * 0.9) : base);
      }
      const desde = t - ultimoLatido;
      const late = vivo ? Math.max(0, 1 - desde / 260) : 0;
      const ev = evento.current && t - evento.current.desde < 1600 ? evento.current : null;

      // ── el corazón ──
      const bloque = 8 + Math.round(late * 1.5);
      const ox = 86 - (13 * bloque) / 2, oy = 92 - (11 * bloque) / 2;
      const infeccion = s.virus.total ? s.virus.quedan / s.virus.total : 0;
      ctx.font = `${bloque}px "IBM Plex Mono", monospace`;
      ctx.textBaseline = 'top';
      FORMA.forEach((fila, r) => [...fila].forEach((c, k) => {
        if (c !== 'X') return;
        const x = ox + k * bloque, y = oy + r * bloque;
        if (s.estado === 'muerto') {
          if (GRIETA.has(`${r},${k}`)) return;
          ctx.fillStyle = `rgba(${VERDE},.16)`; ctx.fillRect(x, y, bloque - 1, bloque - 1);
          return;
        }
        // Infectado: algunos bloques se vuelven glifos que cambian.
        const corrupto = s.estado === 'infectado' && azar(r * 31 + k * 7 + Math.floor(t / 180)) < infeccion * 0.35;
        const brillo = s.estado === 'sano' ? 0.55 + 0.45 * late : 0.35 + 0.5 * late;
        if (corrupto) {
          ctx.fillStyle = `rgba(${VERDE},${brillo})`;
          ctx.fillText(GLIFOS[Math.floor(azar(r + k + t / 100) * GLIFOS.length)], x, y - 1);
        } else {
          ctx.fillStyle = `rgba(${VERDE},${brillo})`;
          ctx.fillRect(x, y, bloque - 1, bloque - 1);
          if (r < 3 && k % 3 === 1) { ctx.fillStyle = `rgba(200,255,210,${brillo})`; ctx.fillRect(x + 1, y + 1, 2, 2); }
        }
      }));
      if (late > 0.6) {
        ctx.strokeStyle = `rgba(${VERDE},${(late - 0.6) * 0.8})`; ctx.lineWidth = 1;
        ctx.strokeRect(ox - 6 - late * 6, oy - 6 - late * 6, 13 * bloque + 12 + late * 12, 11 * bloque + 12 + late * 12);
      }

      // ── el electrocardiograma: el haz barre de izquierda a derecha ──
      const X0 = 176, X1 = 312, BASE = 112, AMP = 46;
      const vel = 0.09;
      const x0 = xHaz;
      xHaz += dt * vel;
      if (xHaz > X1 - X0) { xHaz = 0; yAntes = BASE; }
      let y = BASE;
      if (vivo) {
        const desdeL = t - ultimoLatido;
        y = BASE - onda(desdeL - 60) * AMP;
        if (s.estado === 'infectado') y += (Math.random() - 0.5) * 6 * infeccion + (Math.random() < 0.02 * infeccion ? -AMP * 0.7 : 0);
      } else {
        y = BASE + (Math.random() - 0.5) * 1.2;
      }
      tc.strokeStyle = `rgba(${VERDE},.95)`; tc.lineWidth = 1.5;
      tc.shadowColor = `rgba(${VERDE},.9)`; tc.shadowBlur = quieto ? 0 : 5;
      tc.beginPath(); tc.moveTo(X0 + x0, yAntes); tc.lineTo(X0 + xHaz, y); tc.stroke();
      tc.shadowBlur = 0;
      ctx.drawImage(trazo, 0, 0);
      ctx.fillStyle = '#d8ffe0'; ctx.fillRect(X0 + xHaz - 1, y - 1, 3, 3);
      yAntes = y;
      // La retícula del osciloscopio, tenue.
      ctx.fillStyle = `rgba(${VERDE},.06)`;
      for (let gx = X0; gx <= X1; gx += 17) ctx.fillRect(gx, 60, 1, 104);
      for (let gy = 60; gy <= 164; gy += 13) ctx.fillRect(X0, gy, X1 - X0, 1);

      // ── los rótulos ──
      ctx.font = '8px "IBM Plex Mono", monospace';
      ctx.fillStyle = `rgba(${VERDE},.9)`;
      ctx.fillText('CORAZON v1.0  (C) 1987', 8, 6);
      ctx.fillText(s.cwd + '>', 8, H - 14);
      const lpm = s.estado === 'muerto' ? '---' : s.estado === 'sano' ? '073' : String(90 + Math.floor(Math.random() * 70)).padStart(3, '0');
      ctx.fillText(`LPM ${lpm}`, X0, 44);
      if (s.estado === 'muerto') {
        if (Math.floor(t / 600) % 2) { ctx.fillStyle = `rgba(${VERDE},.95)`; ctx.fillText('** SIN PULSO **', X0 + 52, 44); }
      } else if (s.estado === 'infectado') {
        // El medidor de virus: cuánto queda.
        ctx.fillText(`VIRUS  ${s.virus.quedan}/${s.virus.total}`, X0, 172);
        for (let k = 0; k < s.virus.total; k++) {
          ctx.fillStyle = k < s.virus.quedan ? `rgba(${VERDE},.9)` : `rgba(${VERDE},.18)`;
          ctx.fillRect(X0 + 86 + k * 8, 172, 6, 7);
        }
      }
      // ── los eventos ──
      if (ev) {
        const u = (t - ev.desde) / 1600;
        ctx.font = '10px "IBM Plex Mono", monospace';
        const msg = ev.tipo === 'arranque' ? 'PRUEBA DE MEMORIA 640K OK'
          : ev.tipo === 'falla' ? 'ERROR: EL CORAZON NO RESPONDE'
          : ev.tipo === 'borra' ? 'LINEA ELIMINADA'
          : ev.tipo === 'perdida' ? 'ERROR: SE PERDIO UN RECUERDO'
          : ev.tipo === 'termina' ? 'ORDEN.EXE SE VOLVIO A CARGAR'
          : ev.tipo === 'reinicia' ? 'REINICIANDO...' : '';
        if (msg && Math.floor(u * 8) % 2 === 0) {
          ctx.fillStyle = '#000'; ctx.fillRect(W / 2 - msg.length * 3.2 - 6, 22, msg.length * 6.4 + 12, 14);
          ctx.fillStyle = `rgba(${VERDE},1)`; ctx.fillText(msg, W / 2 - msg.length * 3.2, 24);
        }
      }
    };
    id = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={`corazon-crt ${d.estado}`}>
      <canvas ref={cv} width={W} height={H} role="img"
              aria-label={d.estado === 'muerto' ? 'El corazón, sin pulso' : d.estado === 'sano' ? 'El corazón late en paz' : `El corazón late mal: quedan ${d.virus.quedan} líneas del virus`} />
      {d.estado === 'sano' && (
        <pre className="corazon-crt__rostro" aria-hidden="true">{`   .-""""-.
  /  ^  ^  \\
 |   .--.   |
  \\  \\__/  /
   '-....-'
  GRACIAS.`}</pre>
      )}
    </div>
  );
}
