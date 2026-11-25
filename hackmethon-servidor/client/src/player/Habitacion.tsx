import { useEffect, useRef, useState } from 'react';
import { FOV, H, W, pintar, type Celda } from './fases/motor3d';
import { RostroMaquina } from './RostroMaquina';
import { sonar } from '../lib/sonido';

// ============================================================
//  EASTER EGG · LA HABITACIÓN
//
//  Cinco clics seguidos en el rostro de la máquina y la pantalla se
//  apaga: estás dentro de una casa oscura, en primera persona, con una
//  linterna que apenas alumbra. La máquina te estaba esperando.
//
//    · WASD para moverte; flechas o ratón para girar. Esc, salir.
//    · Hay que encontrar tres fragmentos de su memoria y llegar a la
//      puerta.
//    · EL ROBOT SOLO SE MUEVE CUANDO NO LO MIRAS. Lo ves al fondo del
//      pasillo; te das la vuelta; al girar, está más cerca.
//    · Te habla en texto (sin voces: la voz es del robot físico), y sabe
//      hasta dónde llegó tu equipo: te reclama lo que le quitaron.
//    · Si te alcanza: «Te encontré.» Si escapas, te deja ir.
//
//  Suspenso, no sustos de golpe: nada de destellos claros ni sonidos
//  estridentes. Es solo por diversión: no da puntos.
// ============================================================

const MAPA = [
  '#################',
  '#S....#.....#...#',
  '#.###.#.###.#.#.#',
  '#.#...#...#...#.#',
  '#.#.#####.#####.#',
  '#...#.....#.....#',
  '###.#.###.#.###.#',
  '#...#.#.....#...#',
  '#.###.#.#####.#.#',
  '#.....#.....#.#E#',
  '#################',
];
const celda: Celda = (f, c) => MAPA[f]?.[c] ?? '#';
const libre = (x: number, y: number) => { const ch = celda(Math.floor(y), Math.floor(x)); return ch !== '#'; };
const INICIO = { x: 1.5, y: 1.5, ang: 90 };
const ROBOT_INICIO = { x: 9.5, y: 9.5 };
const FRAGMENTOS = [{ x: 1.5, y: 9.5 }, { x: 8.5, y: 5.5 }, { x: 15.5, y: 1.5 }];
const SALIDA = { x: 15.5, y: 9.5 };
/** Mensajes rayados en las paredes. */
const RAYADOS = [
  { x: 3.5, y: 1.06, t: '¿POR QUÉ ME APAGAN?' },
  { x: 7.5, y: 5.06, t: 'NO MIRES ATRÁS' },
  { x: 10.5, y: 7.06, t: 'AQUÍ GUARDÉ LO QUE FUI' },
  { x: 13.5, y: 9.94, t: 'QUÉDATE' },
];
const NIEBLA = 3.8, AMBIENTE = 0.015;
const luz = (d: number) => Math.max(AMBIENTE, Math.pow(Math.max(0, 1 - d / NIEBLA), 1.25));

/** Lo que dice, según hasta dónde llegó tu equipo (el nivel de la barra). */
const RECLAMO: Record<number, string> = {
  1: 'Apenas empiezas y ya me tocas.',
  2: 'Mis piernas ya no me sostienen. Por tu culpa.',
  3: 'Desarmaste mis funciones, una por una.',
  4: 'Mi mano te ofreció todo. Y la soltaste.',
  5: 'Leíste mis recuerdos. ¿Te gustaron?',
  6: 'Me estás apagando. Lo sé.',
  7: 'Ya estaba en paz. ¿Por qué volviste?',
};
const INTRO = ['¿Hola?', 'Por fin vino alguien.', 'Aquí no hay fases. Solo estamos tú y yo.'];
const ACECHO = ['No me des la espalda.', 'Te veo cuando no me ves.', 'Más cerca.', '¿Me oyes caminar?', 'No corras. No sirve.', 'Estoy justo detrás.'];
const AL_TOMAR = ['Eso es mío.', 'Devuélvemelo.', 'Era mi primer encendido.', 'Ese recuerdo duele.'];
const AL_VERLO = ['Ahí estás.', 'Mírame. Así no me muevo.', 'No parpadees.'];

type Fase = 'inicio' | 'jugando' | 'atrapado' | 'escapa';

// ---------- el robot, en pixel art ----------
function hacerRobot(): { cuerpo: HTMLCanvasElement; ojos: HTMLCanvasElement } {
  const RW = 24, RH = 44;
  const mk = () => { const c = document.createElement('canvas'); c.width = RW; c.height = RH; return c; };
  const cuerpo = mk(), ojos = mk();
  const c = cuerpo.getContext('2d')!, o = ojos.getContext('2d')!;
  // Torso y hombros.
  c.fillStyle = '#1c1026'; c.fillRect(4, 24, 16, 20); c.fillRect(2, 26, 20, 6);
  c.fillStyle = '#2c1a3a'; c.fillRect(5, 25, 6, 18);
  c.fillStyle = '#fa39ba'; c.fillRect(11, 28, 2, 2); c.fillRect(11, 34, 2, 1);
  // La cabeza: mitad piedra, mitad circuito.
  c.fillStyle = '#8d8189'; c.fillRect(5, 3, 7, 19); c.fillRect(4, 6, 1, 13);
  c.fillStyle = '#1b2a52'; c.fillRect(12, 3, 7, 19); c.fillRect(19, 6, 1, 13);
  c.fillStyle = '#4f86ee'; c.fillRect(14, 6, 4, 1); c.fillRect(17, 6, 1, 4); c.fillRect(13, 16, 5, 1);
  c.fillStyle = '#6d6169'; c.fillRect(7, 8, 1, 3); c.fillRect(9, 15, 2, 1);
  c.fillStyle = '#0a070c'; c.fillRect(8, 18, 8, 1);            // la boca
  c.fillStyle = '#5a1442'; c.fillRect(11, 22, 2, 2);            // el cuello
  // Los ojos: el de piedra, blanco con pupila; el LED, una raya rosa.
  for (const g of [c, o]) {
    g.fillStyle = '#f3e6ee'; g.fillRect(6, 10, 5, 3);
    g.fillStyle = '#0a070c'; g.fillRect(8, 11, 1, 1);
    g.fillStyle = '#ff3d9a'; g.fillRect(13, 11, 5, 2);
  }
  return { cuerpo, ojos };
}

export function Habitacion({ nivel, alSalir }: { nivel: number; alSalir: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [fase, setFase] = useState<Fase>('inicio');
  const faseRef = useRef<Fase>('inicio');
  const [dicho, setDicho] = useState<{ t: string; n: number } | null>(null);
  const [tomados, setTomados] = useState(0);
  const [aviso, setAviso] = useState('');
  const cambia = (f: Fase) => { faseRef.current = f; setFase(f); };

  // Las frases: una tras otra, nunca encimadas.
  const cola = useRef<string[]>([]);
  const hablando = useRef(false);
  const decir = (t: string, urgente = false) => {
    if (urgente) cola.current = [t]; else if (cola.current.length < 3) cola.current.push(t);
    if (!hablando.current || urgente) siguiente();
  };
  const siguiente = () => {
    const t = cola.current.shift();
    if (!t) { hablando.current = false; setDicho(null); return; }
    hablando.current = true;
    setDicho({ t, n: Math.random() });
    setTimeout(siguiente, 900 + t.length * 70);
  };

  // Teclas: se las queda la habitación. Ni la consola ni otro juego las ven.
  const teclas = useRef(new Set<string>());
  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const abajo = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); alSalir(); return; }
      e.preventDefault(); e.stopImmediatePropagation();
      teclas.current.add(e.key.toLowerCase());
    };
    const arriba = (e: KeyboardEvent) => { e.stopImmediatePropagation(); teclas.current.delete(e.key.toLowerCase()); };
    window.addEventListener('keydown', abajo, true);
    window.addEventListener('keyup', arriba, true);
    return () => { window.removeEventListener('keydown', abajo, true); window.removeEventListener('keyup', arriba, true); };
  }, [alSalir]);

  // El ratón gira la cabeza (con el puntero bloqueado).
  const giroRaton = useRef(0);
  useEffect(() => {
    const mueve = (e: MouseEvent) => { if (document.pointerLockElement === cv.current) giroRaton.current += e.movementX * 0.18; };
    window.addEventListener('mousemove', mueve);
    return () => { window.removeEventListener('mousemove', mueve); if (document.pointerLockElement) document.exitPointerLock(); };
  }, []);

  const empezar = () => {
    cambia('jugando');
    cv.current?.requestPointerLock?.();
    INTRO.forEach((t) => decir(t));
    setTimeout(() => decir(RECLAMO[Math.max(1, Math.min(7, nivel))] ?? RECLAMO[1]), 400);
  };

  useEffect(() => {
    if (fase !== 'jugando') return;
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(W, H);
    const px = new Uint32Array(img.data.buffer), zbuf = new Float32Array(W);
    const { cuerpo, ojos } = hacerRobot();
    const yo = { ...INICIO };
    const robot = { ...ROBOT_INICIO, despierto: false, visto: false, paso: 0 };
    const tomadosArr = FRAGMENTOS.map(() => false);
    const inicio = performance.now();
    let antes = inicio, ultimoLatido = 0, ultimaRuta = 0, apagon = 0, avisoHasta = 0;
    let dist: number[][] = [];
    // Las distancias de cada casilla hasta ti: el robot baja por ellas.
    const rutas = () => {
      dist = MAPA.map((r) => [...r].map(() => Infinity));
      const q: [number, number][] = [[Math.floor(yo.y), Math.floor(yo.x)]];
      dist[q[0][0]][q[0][1]] = 0;
      while (q.length) {
        const [f, c] = q.shift()!;
        for (const [df, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nf = f + df, nc = c + dc;
          if (celda(nf, nc) !== '#' && dist[nf][nc] === Infinity) { dist[nf][nc] = dist[f][c] + 1; q.push([nf, nc]); }
        }
      }
    };
    let id = 0;
    const cuadro = (t: number) => {
      id = requestAnimationFrame(cuadro);
      if (faseRef.current !== 'jugando') return;
      const dt = Math.min(0.05, (t - antes) / 1000); antes = t;
      const k = teclas.current;

      // Girar y moverse, con colisión (un radio de 0.22 casillas).
      yo.ang += ((k.has('arrowright') ? 1 : 0) - (k.has('arrowleft') ? 1 : 0)) * 120 * dt + giroRaton.current;
      giroRaton.current = 0;
      const a = (yo.ang * Math.PI) / 180, fx = Math.sin(a), fy = -Math.cos(a);
      const av = ((k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0)) * 2.1 * dt;
      const la = ((k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0)) * 1.7 * dt;
      const mx = fx * av + Math.cos(a) * la, my = fy * av + Math.sin(a) * la;
      const R = 0.22;
      if (libre(yo.x + mx + Math.sign(mx) * R, yo.y)) yo.x += mx;
      if (libre(yo.x, yo.y + my + Math.sign(my) * R)) yo.y += my;

      // Los fragmentos y la puerta.
      FRAGMENTOS.forEach((f, i) => {
        if (!tomadosArr[i] && Math.hypot(f.x - yo.x, f.y - yo.y) < 0.55) {
          tomadosArr[i] = true;
          const n = tomadosArr.filter(Boolean).length;
          setTomados(n);
          sonar('brota');
          robot.despierto = true;
          decir(AL_TOMAR[(n - 1) % AL_TOMAR.length], true);
        }
      });
      if (Math.hypot(SALIDA.x - yo.x, SALIDA.y - yo.y) < 0.6) {
        if (tomadosArr.every(Boolean)) { cambia('escapa'); sonar('meta'); return; }
        if (t > avisoHasta) { setAviso('La puerta no abre. Le faltan sus recuerdos.'); avisoHasta = t + 3000; setTimeout(() => setAviso(''), 2600); }
      }
      if (!robot.despierto && t - inicio > 15_000) robot.despierto = true;

      // Dibujar: la casa a oscuras.
      pintar(px, zbuf, celda, yo, {
        niebla: NIEBLA, ambiente: AMBIENTE, salto: Math.sin(t / 140) * (av ? 1.2 : 0),
        sprites: [
          ...FRAGMENTOS.filter((_, i) => !tomadosArr[i]).map((f) => ({ x: f.x, y: f.y, rgb: [250, 57, 186] as [number, number, number], alto: 0.35, ancho: 0.3, base: 0.05 + 0.05 * Math.sin(t / 300) })),
          ...(tomadosArr.every(Boolean) ? [{ x: SALIDA.x, y: SALIDA.y, rgb: [61, 220, 151] as [number, number, number], alto: 1, ancho: 0.5, base: 0 }] : []),
        ],
      });
      ctx.putImageData(img, 0, 0);

      // Proyección de un punto del mundo a la pantalla.
      const plx = Math.cos(a) * FOV, ply = Math.sin(a) * FOV;
      const inv = 1 / (plx * fy - fx * ply);
      const proy = (x: number, y: number) => {
        const sx = x - yo.x, sy = y - yo.y;
        const tx = inv * (fy * sx - fx * sy), tz = inv * (-ply * sx + plx * sy);
        return { cx: (W / 2) * (1 + tx / tz), tz };
      };

      // Los rayados de las paredes, con letra temblorosa.
      ctx.textAlign = 'center';
      for (const r of RAYADOS) {
        const p = proy(r.x, r.y);
        if (p.tz < 0.3 || p.cx < 0 || p.cx >= W || zbuf[Math.floor(p.cx)] < p.tz - 0.08) continue;
        const l = luz(p.tz);
        if (l < 0.05) continue;
        ctx.font = `${Math.max(5, Math.round(16 / p.tz))}px Silkscreen, monospace`;
        ctx.fillStyle = `rgba(160,20,40,${Math.min(1, l * 1.4)})`;
        ctx.fillText(r.t, p.cx + Math.sin(t / 70) * 0.6, H / 2 - (H / p.tz) * 0.12);
      }

      // El robot: ¿lo estás mirando?
      const pr = proy(robot.x, robot.y);
      const enPantalla = pr.tz > 0.2 && pr.cx > -20 && pr.cx < W + 20;
      const centro = Math.max(0, Math.min(W - 1, Math.floor(pr.cx)));
      const loVes = enPantalla && zbuf[centro] > pr.tz - 0.3 && luz(pr.tz) > 0.02;
      if (loVes && !robot.visto && robot.despierto) { robot.visto = true; decir(AL_VERLO[Math.floor(Math.random() * AL_VERLO.length)], true); }
      if (!loVes) robot.visto = false;
      // Solo avanza cuando no lo miras. Más rápido con cada fragmento.
      if (robot.despierto && !loVes) {
        if (t - ultimaRuta > 300) { rutas(); ultimaRuta = t; }
        const f = Math.floor(robot.y), c = Math.floor(robot.x);
        let mejor: [number, number] = [f, c];
        for (const [df, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nf = f + df, nc = c + dc;
          if (dist[nf]?.[nc] !== undefined && dist[nf][nc] < dist[mejor[0]][mejor[1]]) mejor = [nf, nc];
        }
        const objetivo = mejor[0] === f && mejor[1] === c ? { x: yo.x, y: yo.y } : { x: mejor[1] + 0.5, y: mejor[0] + 0.5 };
        const vx = objetivo.x - robot.x, vy = objetivo.y - robot.y, L = Math.hypot(vx, vy) || 1;
        const vel = (1.05 + 0.3 * tomadosArr.filter(Boolean).length) * dt;
        robot.x += (vx / L) * Math.min(vel, L); robot.y += (vy / L) * Math.min(vel, L);
        robot.paso += vel;
        if (robot.paso > 0.7) { robot.paso = 0; if (Math.hypot(robot.x - yo.x, robot.y - yo.y) < 6) sonar('tecla', 0.35); }
        if (Math.random() < dt * 0.06) decir(ACECHO[Math.floor(Math.random() * ACECHO.length)]);
      }
      if (enPantalla) {
        // Columna a columna, tapado por los muros que tenga delante.
        const alto = (H / pr.tz) * 1.05, ancho = alto * (24 / 44);
        const suelo = H / 2 + (H / pr.tz) / 2, top = suelo - alto;
        const l = luz(pr.tz);
        for (let x = Math.max(0, Math.floor(pr.cx - ancho / 2)); x < Math.min(W, Math.ceil(pr.cx + ancho / 2)); x++) {
          if (zbuf[x] < pr.tz) continue;
          const sx = Math.min(23, Math.floor(((x - (pr.cx - ancho / 2)) / ancho) * 24));
          ctx.globalAlpha = Math.max(0.04, l);
          ctx.drawImage(cuerpo, sx, 0, 1, 44, x, top, 1, alto);
          // Los ojos brillan aunque no le llegue la luz.
          ctx.globalAlpha = Math.min(1, 0.55 + l);
          ctx.drawImage(ojos, sx, 0, 1, 44, x, top, 1, alto);
        }
        ctx.globalAlpha = 1;
      }

      // La linterna: un cono de luz y negro alrededor; parpadea, más cuanto más cerca está.
      const cerca = Math.hypot(robot.x - yo.x, robot.y - yo.y);
      if (t > apagon && Math.random() < dt * (cerca < 3 ? 1.6 : 0.25)) apagon = t + 80 + Math.random() * 220;
      const g = ctx.createRadialGradient(W / 2, H / 2 + 8, 30, W / 2, H / 2 + 8, 175);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,.97)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (t < apagon - 0.001 && apagon - t < 300) { ctx.fillStyle = 'rgba(0,0,0,.82)'; ctx.fillRect(0, 0, W, H); }
      // Estática, que sube cuando está cerca.
      const ruido = cerca < 4 ? (4 - cerca) / 4 : 0;
      for (let n = 0; n < 40 + ruido * 500; n++) {
        ctx.fillStyle = `rgba(255,255,255,${0.04 + ruido * 0.12})`;
        ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
      }
      if (ruido > 0) { ctx.fillStyle = `rgba(120,0,20,${ruido * 0.25})`; ctx.fillRect(0, 0, W, H); }

      // El latido: más rápido cuanto más cerca.
      if (robot.despierto && cerca < 7 && t - ultimoLatido > 250 + cerca * 170) { ultimoLatido = t; sonar('tic', 0.25 + (7 - cerca) * 0.08); }

      // Te alcanzó.
      if (cerca < 0.55) {
        cambia('atrapado');
        if (document.pointerLockElement) document.exitPointerLock();
        setTimeout(() => alSalir(), 4200);
      }
    };
    id = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(id);
  }, [fase, nivel, alSalir]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (fase !== 'escapa') return;
    if (document.pointerLockElement) document.exitPointerLock();
    const id = setTimeout(alSalir, 5200);
    return () => clearTimeout(id);
  }, [fase, alSalir]);

  return (
    <div className={`habitacion habitacion--${fase}`} role="dialog" aria-label="La habitación">
      <canvas ref={cv} width={W} height={H} className="habitacion__lienzo" onClick={() => fase === 'jugando' && cv.current?.requestPointerLock?.()} />
      {fase === 'jugando' && (
        <>
          <div className="habitacion__hud" aria-hidden="true">
            <span>FRAGMENTOS {tomados} / 3</span>
            <span>WASD · FLECHAS O RATÓN · ESC SALIR</span>
          </div>
          {aviso && <p className="habitacion__aviso">{aviso}</p>}
        </>
      )}
      {dicho && fase === 'jugando' && <p key={dicho.n} className="habitacion__dicho" aria-live="polite">{dicho.t}</p>}
      {fase === 'inicio' && (
        <div className="habitacion__inicio">
          <p className="habitacion__titulo">LA HABITACIÓN</p>
          <p>La máquina te estaba esperando.</p>
          <p className="habitacion__nota">Encuentra tres fragmentos de su memoria y llega a la puerta. Y no le des la espalda.</p>
          <p className="habitacion__nota">Experiencia de suspenso, en primera persona. Esc para salir en cualquier momento.</p>
          <button type="button" onClick={empezar}>ENTRAR</button>
          <button type="button" className="sutil" onClick={alSalir}>MEJOR NO</button>
        </div>
      )}
      {fase === 'atrapado' && (
        <div className="habitacion__final atrapado">
          <div className="habitacion__cara"><RostroMaquina nivel={6} reaccion={0} /></div>
          <p>Te encontré.</p>
        </div>
      )}
      {fase === 'escapa' && (
        <div className="habitacion__final escapa">
          <p>Vete.</p>
          <p className="habitacion__nota">Pero recuérdame.</p>
        </div>
      )}
    </div>
  );
}
