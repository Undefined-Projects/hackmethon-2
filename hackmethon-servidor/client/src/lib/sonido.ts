// ============================================================
//  El sonido del aparato.
//
//  Nada de archivos: todo se sintetiza aquí con Web Audio. Tres
//  motivos, y ninguno es la nostalgia:
//
//  1. El tubo es de 1983. Un cuadrado, un triángulo y ruido blanco
//     suenan a eso; un wav grabado suena a otra cosa.
//  2. El front lo sirve Vercel y la API vive detrás de un túnel casero.
//     Medio mega de audio por pestaña, con treinta portátiles
//     conectándose a la vez, es exactamente el peso que no hay que
//     meter en esa red.
//  3. No hay nada que precargar, así que el primer sonido del evento no
//     llega tarde por estar descargándose.
//
//  TODO lo de este archivo es a prueba de fallos. Un navegador sin
//  audio, un dispositivo ocupado o una política rara NO pueden tumbar
//  una pantalla en mitad del evento: si algo revienta, se traga el
//  error y el juego sigue mudo.
// ============================================================

type Onda = OscillatorType;

const LS = 'hm:sonido';
const VOL_MAESTRO = 0.34;

let ctx: AudioContext | null = null;
let maestro: GainNode | null = null;
let bufRuido: AudioBuffer | null = null;
let gateAtado = false;

const oyentes = new Set<() => void>();
const avisar = () => { for (const fn of oyentes) fn(); };

// ---------- preferencia del usuario ----------

function leerPreferencia(): boolean {
  // En modo privado o con el almacenamiento bloqueado, `localStorage`
  // LANZA en vez de devolver null. Un fallo aquí no puede impedir que
  // arranque la aplicación.
  try {
    const v = localStorage.getItem(LS);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

let quiereSonido = leerPreferencia();

export function alternarSonido(): void {
  quiereSonido = !quiereSonido;
  try { localStorage.setItem(LS, quiereSonido ? '1' : '0'); } catch { /* sin memoria, vale para esta carga */ }
  if (quiereSonido) despertar();
  else zumbido(null);
  avisar();
}

/**
 * Lo que necesita saber la interfaz:
 *  - `encendido`: lo que el usuario quiere.
 *  - `bloqueado`: lo quiere, pero el navegador aún no deja sonar nada
 *    porque nadie ha tocado la página. Es el caso de la PROYECCIÓN, que
 *    se arrastra al segundo monitor y se queda ahí sin que nadie la
 *    pulse; sin decirlo, el operador da el sonido por roto.
 */
let instantanea: { encendido: boolean; bloqueado: boolean } = { encendido: quiereSonido, bloqueado: quiereSonido };

export function estadoSonido(): { encendido: boolean; bloqueado: boolean } {
  // La identidad del objeto SOLO cambia cuando cambia el estado de
  // verdad: `useSyncExternalStore` compara por referencia y un objeto
  // nuevo en cada lectura lo dejaría repintando sin parar.
  const bloqueado = quiereSonido && (ctx === null || ctx.state !== 'running');
  if (instantanea.encendido !== quiereSonido || instantanea.bloqueado !== bloqueado) {
    instantanea = { encendido: quiereSonido, bloqueado };
  }
  return instantanea;
}

export function suscribirSonido(fn: () => void): () => void {
  oyentes.add(fn);
  return () => { oyentes.delete(fn); };
}

// ---------- el aparato ----------

function atarGate(): void {
  if (gateAtado || typeof window === 'undefined') return;
  // Se ata al cargar el módulo, no al crear el aparato: hace falta que
  // el PRIMER gesto ya sirva para desbloquear, y el aparato todavía no
  // existe en ese momento.
  gateAtado = true;
  // El navegador no deja sonar nada hasta que alguien toca la página.
  // Cualquier gesto vale, y con uno basta para toda la sesión.
  const abrir = () => { despertar(); };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(ev, abrir, { passive: true });
  }
}

function asegurar(): boolean {
  if (!quiereSonido) return false;
  if (ctx) return ctx.state === 'running';
  try {
    const Clase = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Clase) return false;
    ctx = new Clase();
    maestro = ctx.createGain();
    maestro.gain.value = VOL_MAESTRO;
    maestro.connect(ctx.destination);
    if (ctx.state !== 'running') void ctx.resume().then(avisar).catch(() => {});
    avisar();
    return ctx.state === 'running';
  } catch {
    ctx = null;
    return false;
  }
}

/** Reintenta arrancar el audio. Se llama en cada gesto del usuario. */
export function despertar(): void {
  if (!quiereSonido) return;
  if (!ctx) { asegurar(); return; }
  if (ctx.state !== 'running') void ctx.resume().then(avisar).catch(() => {});
}

function ruidoBuffer(): AudioBuffer {
  if (bufRuido) return bufRuido;
  const c = ctx!;
  const b = c.createBuffer(1, Math.floor(c.sampleRate * 0.6), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  bufRuido = b;
  return b;
}

// ---------- ladrillos ----------

type Tono = {
  f: number; dur: number; f2?: number; onda?: Onda; vol?: number; retardo?: number;
};

function tono({ f, f2, dur, onda = 'square', vol = 0.3, retardo = 0 }: Tono): void {
  const c = ctx!, t = c.currentTime + retardo;
  const o = c.createOscillator(), g = c.createGain();
  o.type = onda;
  o.frequency.setValueAtTime(f, t);
  if (f2 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
  // Ataque corto pero no instantáneo: un salto seco de 0 a volumen hace
  // un «clic» que se oye más que la nota.
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.35));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(maestro!);
  o.start(t);
  o.stop(t + dur + 0.03);
}

type Ruido = {
  dur: number; f?: number; f2?: number; vol?: number; retardo?: number; paso?: BiquadFilterType;
};

function ruido({ dur, f = 2400, f2, vol = 0.3, retardo = 0, paso = 'bandpass' }: Ruido): void {
  const c = ctx!, t = c.currentTime + retardo;
  const s = c.createBufferSource(), g = c.createGain(), fl = c.createBiquadFilter();
  s.buffer = ruidoBuffer();
  s.loop = true;
  fl.type = paso;
  fl.Q.value = 0.8;
  fl.frequency.setValueAtTime(f, t);
  if (f2 !== undefined) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(maestro!);
  s.start(t);
  s.stop(t + dur + 0.03);
}

// ---------- el repertorio ----------
//
// Las frecuencias no son al azar: las que confirman suben y las que
// niegan bajan, y las de la sala —cambio de fase, cohete— ocupan la
// parte grave para que no compitan con el pitido de treinta portátiles.

const VOCES = {
  /** Una tecla del Operador de Terminal. Casi nada: se pulsan cientos. */
  tecla: () => tono({ f: 1500, dur: 0.014, onda: 'square', vol: 0.05 }),
  /** Comando enviado. */
  enviar: () => { tono({ f: 420, f2: 780, dur: 0.07, vol: 0.16 }); },
  /** El sistema acepta. */
  ok: () => {
    tono({ f: 660, dur: 0.07, onda: 'triangle', vol: 0.2 });
    tono({ f: 990, dur: 0.1, onda: 'triangle', vol: 0.18, retardo: 0.07 });
  },
  /** El sistema rechaza. Grave y con cuerpo: se nota sin ser una alarma. */
  error: () => {
    tono({ f: 200, f2: 120, dur: 0.18, onda: 'square', vol: 0.22 });
    ruido({ dur: 0.12, f: 700, f2: 300, vol: 0.1 });
  },
  /** Pulsar en el panel. */
  boton: () => tono({ f: 1000, dur: 0.02, onda: 'square', vol: 0.09 }),
  /** Entrar a una fase. */
  entrar: () => tono({ f: 280, f2: 860, dur: 0.22, onda: 'triangle', vol: 0.2 }),
  /** Volver al lobby. */
  salir: () => tono({ f: 780, f2: 260, dur: 0.2, onda: 'triangle', vol: 0.18 }),
  /** Una tabla o una pieza que se abre. */
  abrir: () => tono({ f: 880, dur: 0.04, onda: 'triangle', vol: 0.12 }),
  /** Cambio de canal: la proyección pasa de una fase a otra. */
  canal: () => {
    ruido({ dur: 0.28, f: 4000, f2: 400, vol: 0.2 });
    tono({ f: 140, f2: 60, dur: 0.3, onda: 'sawtooth', vol: 0.12 });
  },
  /** La rotura del tubo. La intensidad la pone quien llama. */
  estatica: (i = 1) => {
    ruido({ dur: 0.05 + 0.1 * i, f: 900 + 3000 * i, f2: 600, vol: 0.05 + 0.13 * i });
    if (i > 0.55) tono({ f: 90, dur: 0.07, onda: 'square', vol: 0.06 * i });
  },
  /** Mezcla de roles: el fallo de sincronía. Dos tonos que no casan. */
  cortinilla: () => {
    tono({ f: 300, dur: 0.5, onda: 'sawtooth', vol: 0.14 });
    tono({ f: 317, dur: 0.5, onda: 'sawtooth', vol: 0.14 });
    ruido({ dur: 0.45, f: 1800, f2: 500, vol: 0.12, retardo: 0.1 });
  },
  /** La avería de un puesto. Larga y fea, que de eso se trata. */
  averia: () => {
    ruido({ dur: 0.9, f: 400, f2: 2600, vol: 0.16 });
    tono({ f: 70, f2: 55, dur: 0.9, onda: 'square', vol: 0.1 });
  },
  /** Fase resuelta. Cuatro notas hacia arriba, y ya. */
  victoria: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tono({ f, dur: 0.16, onda: 'triangle', vol: 0.22, retardo: i * 0.085 }));
  },
  /** Un equipo pasa una barrera, visto desde la carrera. */
  barrera: () => {
    tono({ f: 587, dur: 0.09, onda: 'triangle', vol: 0.18 });
    tono({ f: 880, dur: 0.13, onda: 'triangle', vol: 0.16, retardo: 0.09 });
  },
  /** Un equipo llega a la meta. */
  meta: () => {
    [523, 784, 1047, 1319].forEach((f, i) =>
      tono({ f, dur: 0.2, onda: 'square', vol: 0.2, retardo: i * 0.11 }));
  },
  /** Evento en pausa. */
  pausa: () => tono({ f: 440, f2: 220, dur: 0.3, onda: 'sine', vol: 0.18 }),
  reanudar: () => tono({ f: 220, f2: 440, dur: 0.3, onda: 'sine', vol: 0.18 }),
  /** Segundo de la cuenta atrás de la final. */
  tic: () => tono({ f: 900, dur: 0.035, onda: 'square', vol: 0.14 }),
  /** Los últimos diez segundos. */
  ticFinal: () => tono({ f: 1400, dur: 0.06, onda: 'square', vol: 0.22 }),
  /** El cohete despega: rugido grave que crece. */
  despegue: () => {
    ruido({ dur: 4.2, f: 120, f2: 900, vol: 0.3, paso: 'lowpass' });
    tono({ f: 45, f2: 130, dur: 4.2, onda: 'sawtooth', vol: 0.16 });
    tono({ f: 60, f2: 150, dur: 4.2, onda: 'square', vol: 0.08 });
  },
  /** El cohete revienta en la plataforma. */
  estallido: () => {
    ruido({ dur: 1.4, f: 3200, f2: 80, vol: 0.34, paso: 'lowpass' });
    tono({ f: 110, f2: 32, dur: 1.1, onda: 'square', vol: 0.24 });
    tono({ f: 70, f2: 28, dur: 1.6, onda: 'sawtooth', vol: 0.16, retardo: 0.05 });
  },
  /** Un ataque lanzado contra otro equipo. Cae en picado: lo que se
   *  oye es algo que sale de aquí y aterriza en otra mesa. */
  ataque: () => {
    tono({ f: 900, f2: 170, dur: 0.32, onda: 'sawtooth', vol: 0.2 });
    ruido({ dur: 0.26, f: 2800, f2: 500, vol: 0.13, retardo: 0.05 });
  },
  /** Un golpe del ariete contra el muro. */
  golpe: () => {
    tono({ f: 150, f2: 60, dur: 0.1, onda: 'square', vol: 0.16 });
    ruido({ dur: 0.08, f: 1200, f2: 300, vol: 0.1 });
  },
  /** Una petición del ataque entrando por el monitor. */
  linea: () => tono({ f: 2100, dur: 0.012, onda: 'square', vol: 0.045 }),
} as const;

export type Voz = keyof typeof VOCES;

/** Cada cuánto puede repetirse una voz, en ms. Sin esto, el monitor de
 *  tráfico y el teclado se convierten en una ametralladora. */
const MINIMO: Partial<Record<Voz, number>> = {
  // La estática va en pares —el salto y el desliz van seguidos—, así
  // que su tope tiene que dejar pasar los dos.
  tecla: 25, linea: 90, estatica: 45, golpe: 110, abrir: 60, boton: 40,
};
const ultima = new Map<Voz, number>();

export function sonar(voz: Voz, intensidad = 1): void {
  try {
    if (!asegurar()) return;
    const tope = MINIMO[voz];
    if (tope !== undefined) {
      const t = performance.now();
      if (t - (ultima.get(voz) ?? -Infinity) < tope) return;
      ultima.set(voz, t);
    }
    VOCES[voz](intensidad as never);
  } catch {
    // Un sonido que falla no puede llevarse por delante la pantalla.
  }
}

// ---------- el zumbido de la sala ----------

let zumbidoNodos: { osc: OscillatorNode; osc2: OscillatorNode; g: GainNode } | null = null;

/**
 * El ronroneo del tubo, solo para la proyección. `nivel` va de 0 a 1 y
 * sale de lo averiada que esté la fase: en la primera es un hilo y en la
 * final se oye que el aparato está para el arrastre. `null` lo apaga.
 */
export function zumbido(nivel: number | null): void {
  try {
    if (nivel === null || !quiereSonido) {
      if (zumbidoNodos) {
        const { osc, osc2, g } = zumbidoNodos;
        const t = ctx!.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0.0001, t + 0.3);
        osc.stop(t + 0.35); osc2.stop(t + 0.35);
        zumbidoNodos = null;
      }
      return;
    }
    if (!asegurar()) return;
    const c = ctx!;
    if (!zumbidoNodos) {
      const osc = c.createOscillator(), osc2 = c.createOscillator(), g = c.createGain();
      osc.type = 'sine'; osc.frequency.value = 50;      // el zumbido de la red
      osc2.type = 'sine'; osc2.frequency.value = 100.5; // y su armónico, desafinado
      g.gain.value = 0.0001;
      osc.connect(g); osc2.connect(g); g.connect(maestro!);
      osc.start(); osc2.start();
      zumbidoNodos = { osc, osc2, g };
    }
    const t = c.currentTime;
    const { g, osc2 } = zumbidoNodos;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
    g.gain.linearRampToValueAtTime(0.012 + 0.05 * nivel, t + 0.6);
    // Cuanto peor va la señal, más se va el armónico: es lo que hace que
    // suene a aparato cansado y no a nota sostenida.
    osc2.frequency.setTargetAtTime(100.5 + 9 * nivel, t, 0.5);
  } catch {
    // Igual que arriba: el zumbido es un adorno, no puede romper nada.
  }
}

// El portero del navegador se ata al cargar: el primer gesto de quien
// abra la pestaña tiene que valer, y para entonces el aparato de audio
// puede no existir todavía.
atarGate();

/**
 * El tono continuo del pulso sostenido en LATIDO: el pitido largo de un
 * monitor, con un temblor leve para que suene a aparato y no a diapasón.
 * `true` lo enciende, `false` lo apaga con una caída corta (un corte en
 * seco hace clic).
 */
let sostenidoNodos: { osc: OscillatorNode; lfo: OscillatorNode; g: GainNode } | null = null;
export function tonoSostenido(encendido: boolean): void {
  try {
    if (!encendido || !quiereSonido) {
      if (sostenidoNodos) {
        const { osc, lfo, g } = sostenidoNodos;
        const t = ctx!.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0.0001, t + 0.06);
        osc.stop(t + 0.08); lfo.stop(t + 0.08);
        sostenidoNodos = null;
      }
      return;
    }
    if (sostenidoNodos || !asegurar()) return;
    const c = ctx!, t = c.currentTime;
    const osc = c.createOscillator(), lfo = c.createOscillator(), prof = c.createGain(), g = c.createGain();
    osc.type = 'square'; osc.frequency.value = 988;   // el si del monitor
    lfo.type = 'sine'; lfo.frequency.value = 7; prof.gain.value = 6;
    lfo.connect(prof).connect(osc.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.02);
    osc.connect(g).connect(maestro!);
    osc.start(t); lfo.start(t);
    sostenidoNodos = { osc, lfo, g };
  } catch {
    // Un adorno: si el audio falla, el juego sigue.
  }
}
