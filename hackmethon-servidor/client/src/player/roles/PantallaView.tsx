import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FiltroTrafico, LineaTrafico, PhaseWorkspace, SalidaComando } from '../../shared/events';
import { useSession } from '../../session/SessionContext';
import { CaraRobot, useSalida } from '../RobotAtaque';
import { JardinEscena } from '../../admin/JardinEscena';
import { sonar } from '../../lib/sonido';
import { Salida } from '../Bloques';
import { useMountId } from './mount';
import { Interior, type Cuidador } from '../fases/Membrana';
import { Reflejo3D } from '../fases/Reflejo3D';
import { Nucleo3D, type DibujoNucleo } from '../fases/Nucleo3D';
import { Mano3D, type DibujoMano } from '../fases/Mano3D';
import { Boveda3D, type DibujoBoveda } from '../fases/Boveda3D';
import { Mente3D, type DibujoMente } from '../fases/Mente3D';
import { Dependencias3D, type DibujoDependencias } from '../fases/Dependencias3D';
import { Marana, type Mundo, type ViajePantalla } from '../fases/Marana';

type Payload = {
  salidas: SalidaComando[];
  nota: string;
  traficoActivo?: boolean;
  filtroTrafico?: FiltroTrafico | null;
  codigo?: VistaCodigo | null;
  laberinto?: VistaLaberinto | null;
  camaras?: VistaCamaras | null;
  /** La maraña de la Fase 2: el laberinto y el último brote. */
  mano?: DibujoMano | null;
  boveda?: DibujoBoveda | null;
  mente?: DibujoMente | null;
  marana?: { capa: number; resuelta: boolean; titulo?: string; final?: { t: string; sub: string }; mundo: Mundo; viaje: ViajePantalla | null } | null;
};

/**
 * La cuenta atrás del reto, en el rótulo del monitor.
 *
 * Tick propio y no una reproyección por segundo: el servidor manda el
 * instante en que caduca y aquí se resta. Un pulso de red por segundo y
 * por equipo para pintar un número sería un derroche, y además el número
 * se quedaría clavado entre comando y comando, que es justo cuando hay
 * que verlo correr.
 */
function Ventana({ hasta, ahora }: { hasta: number | null; ahora: number }) {
  // El hueco se pinta SIEMPRE, aunque no haya reto abierto. Desaparecer
  // dejaba a Pantalla sin saber si es que no hay ventana o es que el
  // rótulo se ha roto, y encima movía el resto de la fila.
  if (hasta === null) return <span className="cam-ventana vacia">SIN RETO</span>;
  const quedan = Math.max(0, Math.ceil((hasta - ahora) / 1000));
  const agotado = quedan === 0;
  return (
    <span className={`cam-ventana${agotado ? ' agotada' : quedan <= 20 ? ' apurada' : ''}`}>
      {agotado ? 'RETO CADUCADO' : `RETO ${String(quedan).padStart(2, '0')} s`}
    </span>
  );
}

/** Cuánto se aguanta el último fotograma de la detonación antes de soltar
 *  el monitor a su bucle. Cabe de sobra en la espera que la fase le pide a
 *  la cortinilla de victoria. */
const REPOSO_DETONACION = 800;

/** El circuito cerrado de la Fase 6. La imagen viene hecha del servidor
 *  —el dibujo y los rotulos— porque lo que se ve depende del estado de la
 *  fase, no de esta pantalla. Aqui solo se le pone el monitor alrededor.
 *
 *  Quien cambia de camara es la consola, que no las ve. Por eso el
 *  selector de abajo se pinta pero NO se puede pulsar: enseña que hay
 *  cuatro y cual esta puesta, y deja claro que el mando lo tiene otro. */
type VistaCamaras = {
  activa: number;
  lista: { n: number; nombre: string; sector: string }[];
  /** El reto en curso y cuándo caduca, en el rótulo del monitor. Solo lo
   *  manda la fase que tiene reloj; `hasta: null` es «esta fase lo tiene
   *  pero ahora no corre», y que falte entero es «aquí no hay reloj». */
  ventana?: { hasta: number | null };
  vista: {
    n: number;
    nombre: string;
    sector: string;
    /** Firma de la imagen. Mientras no cambie, el bucle no se reinicia:
     *  una reproyección por un contador que sube no puede devolver el
     *  cohete al primer fotograma. */
    clave: string;
    /** Fotogramas en bucle. Uno solo = imagen quieta. */
    fotogramas: string[][];
    ritmo: number;
    /** La detonación: se reproduce UNA vez y termina en la rampa vacía. */
    detonacion: string[][] | null;
    ritmoDetonacion: number;
    rotulos: { texto: string; tono: 'ok' | 'alerta' | 'neutro' }[];
    armada: boolean;
    /** 0 en calma · 3 a punto de lanzar. */
    tension: number;
    /** 0-3. Cada adelanto del lanzamiento ensucia mas la señal. */
    ruido: number;
    /** La escena en datos, para la fase que se dibuja aquí en vez de en
     *  caracteres (la membrana de la Fase 1). Si viene, manda ella. */
    dibujo?: DibujoCamara;
  };
};

type DibujoCamara =
  | { tipo: 'membrana'; capa: number; resuelta: boolean; muda: number; corrida?: number; cola: Cuidador[] }
  | { tipo: 'interior'; capa: number; resuelta: boolean; dentro: string[] }
  | DibujoNucleo
  | DibujoDependencias;

/** Medio segundo por embestida y dos segundos por casilla: el ritmo lo
 *  marca la sala, no el reloj del servidor. */
const EMBESTIDA = 500;
const PAUSA_TANDA = 400;

/** Los cuatro rumbos, para saber que casilla se esta golpeando. */
const RUMBOS: Record<string, [number, number]> = {
  arriba: [-1, 0], abajo: [1, 0], izquierda: [0, -1], derecha: [0, 1],
};
// Antes eran 2 s porque el corredor avanzaba solo tras romper una
// barrera. Ahora cada casilla la pide el jugador y el laberinto tiene 46
// pasos de recorrido: a 2 s serian minuto y medio de caminata.
const PASO_MS = 300;
/** El impacto y la sacudida del tubo detras. */
const CHOQUE_MS = 420;
const SACUDIDA_MS = 620;

/** El pasillo de la Fase 3. Las PLACAS viajan —son lo que hay que leer en
 *  voz alta— pero cuantos golpes hacen falta no: eso sale de cruzarlas con
 *  la tabla de durezas que tiene Datos. */
type VistaLaberinto = {
  /** El plano. Una roca o una barrera solo llegan con su `tipo` de verdad
   *  si alguien las ha mirado: hasta entonces vienen como `camino`, igual
   *  que un hueco libre. Esa es toda la niebla que hay. */
  rejilla: { tipo: string; barrera: number | null; placa: string | null }[][];
  pos: [number, number];
  /** Las casillas del ultimo paseo, para andarlas en vez de saltar. */
  paseo: [number, number][];
  ultimo: {
    n: number; golpes: number; tandas: number | null; resultado: string;
    hacia: string; barrera: number;
  } | null;
  rotas: number[];
  /** El ultimo choque, para poder enseñarlo: el servidor ya ha devuelto
   *  al corredor a la entrada, asi que sin esto solo se le veria
   *  aparecer alli sin saber por que. */
  choque: { desde: [number, number]; hacia: string; contra: string; n: number } | null;
  fuera: boolean;
};


/** El árbol del núcleo y la pieza abierta. Lo manda el servidor ya
 *  resuelto —qué está abierto, dónde está el cursor— porque quien decide
 *  eso es el Operador de Terminal desde su consola, no esta pantalla. */
type VistaCodigo = {
  raiz: string;
  carpetas: { nombre: string; piezas: { nombre: string; abierta: boolean }[] }[];
  abierta: { ruta: string; lineas: { n: number; texto: string; cursor: boolean }[] } | null;
  pila: string[];
};

type Monitor = { activo: boolean; nota: string; filtro?: FiltroTrafico | null };

/** `cuenta=j.ortega · ip=188.42.19.6`. Sin filtro no devuelve nada, y la
 *  barra no pinta la chapa: un encuadre vacío es ruido. */
const describirFiltro = (f?: FiltroTrafico | null): string =>
  f
    ? Object.entries(f)
        .map(([clave, valores]) => `${clave}=${(valores as (string | number)[]).join(', ')}`)
        .join(' · ')
    : '';

/** Tope de líneas en pantalla. Un ataque en bucle llenaría el DOM sin
 *  esto, y nadie lee hacia arriba 900 peticiones: se mira lo que cae. */
const TOPE_LINEAS = 90;

/**
 * La animación del pasillo: los golpes y los pasos.
 *
 * Los golpes NO se emiten uno a uno desde el servidor —serían 450
 * mensajes para decir lo que el ciclo hace en un suspiro, y la gracia de
 * un ciclo es justo que no se sufre—. El servidor manda el resultado y
 * aquí se representa: el contador sube, la barrera tiembla, y si el
 * intento iba en tandas se ven las tandas separadas. Esa pausa entre
 * tandas es la que enseña qué es un ciclo dentro de otro.
 *
 * Después de los golpes, el corredor ANDA casilla a casilla hasta la
 * siguiente barrera. Primero se golpea y luego se avanza: si las dos
 * cosas pasaran a la vez no se entendería cuál causó cuál.
 */
function useAnimacionPasillo(lab: VistaLaberinto | null | undefined) {
  const [iPaso, setIPaso] = useState(0);
  const [golpe, setGolpe] = useState<{ n: number; tanda: number; tandas: number } | null>(null);
  const [estrellado, setEstrellado] = useState(false);
  const vistoGolpe = useRef(lab?.ultimo?.n ?? 0);
  const vistoChoque = useRef(lab?.choque?.n ?? 0);
  const vistoPaseo = useRef('');

  const sinMovimiento =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const paseo = lab?.paseo ?? [];
  const firma = JSON.stringify(paseo);

  // Un paseo nuevo se ANDA. El servidor manda las casillas por las que se
  // paso, no solo la de llegada: con la de llegada sola el corredor se
  // teletransportaria y no se veria por donde fue.
  useEffect(() => {
    if (firma === vistoPaseo.current) return;
    vistoPaseo.current = firma;
    if (sinMovimiento || paseo.length <= 1) { setIPaso(paseo.length - 1); return; }
    setIPaso(0);
    const relojes = paseo.slice(1).map((_, i) =>
      setTimeout(() => setIPaso(i + 1), PASO_MS * (i + 1)),
    );
    return () => relojes.forEach(clearTimeout);
  }, [firma, sinMovimiento]);

  // Un choque: el cuadro se estrella DONDE se estrello, y detras viene la
  // sacudida del tubo. La clase `fallo` va en <body> y no aqui porque
  // sacude el aparato entero —es el mismo gesto que usa el cambio de rol—
  // y este puesto no deberia tener que enterarse de como se dibuja.
  useEffect(() => {
    const ch = lab?.choque;
    if (!ch || ch.n === vistoChoque.current) return;
    vistoChoque.current = ch.n;
    if (sinMovimiento) return;

    setEstrellado(true);
    const sacude = setTimeout(() => document.body.classList.add('fallo'), CHOQUE_MS - 60);
    const limpia = setTimeout(() => document.body.classList.remove('fallo'), CHOQUE_MS + SACUDIDA_MS);
    const suelta = setTimeout(() => setEstrellado(false), CHOQUE_MS + SACUDIDA_MS);
    return () => {
      clearTimeout(sacude); clearTimeout(limpia); clearTimeout(suelta);
      document.body.classList.remove('fallo');
    };
  }, [lab?.choque?.n, sinMovimiento]);

  // Un intento nuevo: el cuadro embiste la barrera.
  useEffect(() => {
    const u = lab?.ultimo;
    if (!u || u.n === vistoGolpe.current) return;
    vistoGolpe.current = u.n;
    if (sinMovimiento) return;

    const tandas = u.tandas ?? 1;
    const porTanda = u.golpes / tandas;
    // Cuantas EMBESTIDAS se ven por tanda. No son los golpes: 360 golpes a
    // medio segundo cada uno serian tres minutos mirando una pared, y un
    // ciclo que se hace mas largo que hacerlo a mano enseña lo contrario
    // de lo que hay que enseñar.
    const embestidas = Math.min(6, Math.max(2, Math.ceil(porTanda / 45)));
    const relojes: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    for (let g = 0; g < tandas; g++) {
      for (let i = 1; i <= embestidas; i++) {
        relojes.push(setTimeout(() => {
          setGolpe({ n: Math.round(g * porTanda + (porTanda * i) / embestidas), tanda: g + 1, tandas });
        }, t + EMBESTIDA * (i - 1)));
      }
      t += EMBESTIDA * embestidas;
      // La pausa entre tandas es lo que hace visible que son GRUPOS.
      if (u.tandas) t += PAUSA_TANDA;
    }
    relojes.push(setTimeout(() => setGolpe(null), t));
    return () => relojes.forEach(clearTimeout);
  }, [lab?.ultimo?.n, sinMovimiento]);

  // Mientras dura el choque, el corredor se queda DONDE se estrello: el
  // servidor ya lo ha devuelto a la entrada, pero lo que hay que ver es
  // el golpe, no el resultado.
  const aqui: [number, number] =
    estrellado && lab?.choque
      ? lab.choque.desde
      : (paseo[Math.min(iPaso, paseo.length - 1)] ?? lab?.pos ?? [1, 1]);

  // Hacia donde fue el golpe. Se lee del propio intento y NO del plano:
  // cuando el golpe acierta, la barrera ya figura como pasillo y buscarla
  // ahi dejaba el acierto sin animacion, que es justo el que hay que ver.
  const rumbo = golpe && lab?.ultimo ? RUMBOS[lab.ultimo.hacia] : null;
  const embiste = rumbo ? { dx: rumbo[1], dy: rumbo[0] } : null;
  /** La casilla que esta recibiendo. Mientras dura la embestida se pinta
   *  como barrera aunque ya este rota: asi se ve CAER al terminar. */
  const golpeada: [number, number] | null =
    rumbo ? [aqui[0] + rumbo[0], aqui[1] + rumbo[1]] : null;

  // Contra que casilla se estrello, para encenderla en el impacto.
  const rumboChoque = estrellado && lab?.choque ? RUMBOS[lab.choque.hacia] : null;
  const impacto: [number, number] | null = rumboChoque && lab?.choque
    ? [lab.choque.desde[0] + rumboChoque[0], lab.choque.desde[1] + rumboChoque[1]]
    : null;
  const chocando = rumboChoque ? { dx: rumboChoque[1], dy: rumboChoque[0] } : null;

  return { aqui, golpe, embiste, golpeada, chocando, impacto };
}

/**
 * Averia de pantalla: avisos de «conexion perdida» cayendo encima.
 *
 * Se pueden cerrar a mano, y es deliberado: darle algo que hacer al
 * Operador de Pantalla mientras su equipo le grita es mas divertido que
 * obligarle a mirar cinco segundos de bloqueo. Se cierren o no, al
 * terminar la averia se van todos.
 */
/** Cada cuanto brota uno nuevo. A 260 ms salen mas rapido de lo que se
 *  pueden cerrar: cerrar sirve para abrirse un hueco por donde mirar, no
 *  para ganarle a la averia. Esa carrera perdida es justo la gracia. */
const CADA_MS = 260;
/** Cuantos caen de golpe al empezar: sin esto la averia entra de puntillas
 *  y el primer segundo no se entera nadie. */
const PRIMERA_TANDA = 4;
/** Tope duro. A doce segundos saldrian unos cuarenta y seis; el tope no es
 *  por estetica sino para que un tiron de red o un rato sin repintar no
 *  deje el DOM con cientos de nodos animados. */
const TOPE_AVISOS = 48;

/** Reparto sobre el panel, en porcentaje de su propia caja. Los extremos
 *  dejan asomar el aviso por los bordes sin que llegue a irse: al 78% de
 *  ancho todavia le queda casi todo el cuerpo encima del texto. */
const REPARTO = { x0: -4, x1: 78, y0: -6, y1: 82 };

export function useAvisosDeConexion(activa: boolean, hasta: number) {
  const [avisos, setAvisos] = useState<{ id: number; x: number; y: number; giro: number }[]>([]);
  // Al acabar la avería los avisos no se borran de golpe: el robot de
  // cada uno se reinicia y se va, y solo entonces desaparecen.
  const fase = useSalida(activa);

  useEffect(() => {
    if (!activa) return;
    let n = 0;
    const brotar = () => {
      n++;
      setAvisos((v) => {
        if (v.length >= TOPE_AVISOS) return v;
        // Se reparten sobre EL PANEL, no sobre la ventana: repartidos por
        // la ventana, en una pantalla grande la mitad caian en el vacio de
        // alrededor y dejaban el texto despejado, que es justo lo que no
        // pueden hacer. Son hijos del panel y van en porcentaje suyo, asi
        // que no hay que medir nada ni convertir coordenadas.
        const entre = (a: number, b: number) => a + Math.random() * (b - a);
        return [...v, {
          id: n + hasta,
          x: entre(REPARTO.x0, REPARTO.x1),
          y: entre(REPARTO.y0, REPARTO.y1),
          // Un poco torcidos y cada uno para su lado. Alineados se leian
          // como una lista del sistema; asi se leen como un estropicio.
          giro: -5 + Math.random() * 10,
        }];
      });
    };
    for (let i = 0; i < PRIMERA_TANDA; i++) brotar();
    const id = setInterval(brotar, CADA_MS);
    return () => clearInterval(id);
  }, [activa, hasta]);

  // Ya se fueron todos los robots: ahora sí, fuera los avisos.
  useEffect(() => { if (fase === null) setAvisos([]); }, [fase]);

  const cerrar = (id: number) => setAvisos((v) => v.filter((a) => a.id !== id));
  return { avisos, cerrar, saliendo: fase === 'saliendo' };
}

/**
 * El circuito cerrado del recinto enemigo.
 *
 * El mando NO esta aqui. Se pinta el selector de las cuatro camaras, pero
 * no se puede pulsar: quien cambia de camara es el Operador de Terminal,
 * que no ve ninguna. Un selector pulsable convertiria la fase en un juego
 * de una sola persona, que es exactamente lo que no es.
 */
function MonitorCamaras({ camaras }: { camaras: VistaCamaras }) {
  const { vista, lista, activa } = camaras;

  // --- El bucle de la imagen ---
  // Depende de `clave`, no del array: el servidor reproyecta en cada
  // comando y un array nuevo con el mismo dibujo reiniciaba el bucle.
  const [cuadro, setCuadro] = useState(0);
  const { clave, ritmo, fotogramas } = vista;
  const marcos = useRef(fotogramas);
  marcos.current = fotogramas;
  useEffect(() => {
    setCuadro(0);
    if (marcos.current.length < 2) return;
    const id = setInterval(() => setCuadro((c) => (c + 1) % marcos.current.length), ritmo);
    return () => clearInterval(id);
  }, [clave, ritmo]);

  // --- La detonación ---
  // Se dispara con el CAMBIO de armada a destruida, no con la presencia
  // de la secuencia: quien recarga la página después ve la rampa vacía,
  // no una explosión que ya pasó.
  const [detonando, setDetonando] = useState<number | null>(null);
  const eraArmada = useRef(vista.armada);
  useEffect(() => {
    const acabaDeReventar = eraArmada.current && !vista.armada && vista.detonacion !== null;
    eraArmada.current = vista.armada;
    if (acabaDeReventar) setDetonando(0);
  }, [vista.armada, vista.detonacion]);

  const total = vista.detonacion?.length ?? 0;
  useEffect(() => {
    if (detonando === null) return;
    // Al llegar al final NO se queda ahí: se aguanta el último fotograma
    // un momento y se suelta, para que el monitor vuelva a su bucle —la
    // ruina humeando— y deje de temblar. Sin soltarlo, la cámara se
    // quedaba sacudiéndose para siempre sobre una imagen quieta.
    const ultimo = detonando >= total - 1;
    const id = setTimeout(
      () => setDetonando((d) => (d === null ? null : ultimo ? null : d + 1)),
      ultimo ? REPOSO_DETONACION : vista.ritmoDetonacion,
    );
    return () => clearTimeout(id);
  }, [detonando, total, vista.ritmoDetonacion]);

  const enExplosion = detonando !== null && vista.detonacion !== null;
  const imagen = enExplosion
    ? vista.detonacion![Math.min(detonando!, total - 1)]
    : fotogramas[Math.min(cuadro, fotogramas.length - 1)];

  // El reloj del rotulo es de esta pantalla, no del servidor: es cristal
  // del monitor, no estado de la fase. Que corra solo basta para que la
  // imagen parezca viva entre comando y comando.
  const [hora, setHora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Al cambiar de camara el monitor da un tiron. Sin el, pedir una camara
  // y que te pongan otra imagen parecida se te puede pasar por alto.
  const [cambiando, setCambiando] = useState(false);
  const previa = useRef(activa);
  useEffect(() => {
    if (previa.current === activa) return;
    previa.current = activa;
    setCambiando(true);
    const id = setTimeout(() => setCambiando(false), 460);
    return () => clearTimeout(id);
  }, [activa]);

  return (
    <div
      className={`camaras${cambiando ? ' cambiando' : ''}${vista.armada ? '' : ' desarmada'}`
        + `${enExplosion ? ' detonando' : ''}`}
      // Atributos y no variables CSS: el nivel de ruido y la tensión
      // eligen REGLAS, y seleccionar por el texto serializado de un
      // `style` es frágil.
      data-ruido={vista.ruido}
      data-tension={vista.tension}
      data-fogonazo={enExplosion ? Math.min(detonando!, total - 1) : undefined}
    >
      <div className="cam-osd">
        <span className="cam-rec">REC</span>
        <span className="cam-id">CAM-{vista.n}</span>
        <span className="cam-nombre">{vista.nombre}</span>
        <span className="cam-sector">sector {vista.sector}</span>
        {camaras.ventana && <Ventana hasta={camaras.ventana.hasta} ahora={hora.getTime()} />}
        <span className="cam-hora">{hora.toTimeString().slice(0, 8)}</span>
      </div>

      <div className={`cam-imagen${vista.dibujo ? ' con-dibujo' : ''}`}>
        {vista.dibujo?.tipo === 'membrana' ? (
          <Reflejo3D cola={vista.dibujo.cola} capa={vista.dibujo.capa}
                     resuelta={vista.dibujo.resuelta} muda={vista.dibujo.muda} corrida={vista.dibujo.corrida} />
        ) : vista.dibujo?.tipo === 'nucleo' ? (
          <Nucleo3D {...vista.dibujo} />
        ) : vista.dibujo?.tipo === 'dependencias' ? (
          <Dependencias3D {...vista.dibujo} />
        ) : vista.dibujo?.tipo === 'interior' ? (
          <Interior dentro={vista.dibujo.dentro} resuelta={vista.dibujo.resuelta} />
        ) : (
          <pre className="cam-plano">{imagen.join('\n')}</pre>
        )}
        {vista.rotulos.length > 0 && (
          <ul className="cam-rotulos">
            {vista.rotulos.map((r) => (
              <li key={r.texto} className={`cam-tono-${r.tono}`}>{r.texto}</li>
            ))}
          </ul>
        )}
      </div>

      <ul className="cam-selector">
        {lista.map((c) => (
          <li key={c.n} className={c.n === activa ? 'puesta' : ''}>
            <span className="cam-n">{c.n}</span>
            <span className="cam-etq">{c.nombre}</span>
          </li>
        ))}
      </ul>
      <p className="cam-pie">La cámara la cambia la consola. Dile cuál quieres.</p>
    </div>
  );
}

/**
 * Operador de Pantalla: solo resultados.
 *
 * Dos superficies distintas. Arriba, el MONITOR: peticiones que caen
 * solas mientras el ataque dure, sin pasar por la bitácora porque no
 * son respuestas a nada. Abajo, las SALIDAS de los comandos, que sí se
 * reconstruyen desde el servidor y por eso sobreviven a una recarga.
 *
 * El monitor no sobrevive: al reconectar se sabe que sigue activo, pero
 * las líneas ya emitidas no vuelven. Es un monitor, no un registro; y
 * fingir lo contrario obligaría a persistir cientos de filas por equipo
 * que nadie va a releer.
 */
export function PantallaView({ workspace }: { workspace: PhaseWorkspace }) {
  const mountId = useMountId();
  const { socket, averia } = useSession();
  const payload = workspace.payload as Payload | null;

  const [salidas, setSalidas] = useState<SalidaComando[]>(payload?.salidas ?? []);
  const [lineas, setLineas] = useState<LineaTrafico[]>([]);
  // Quien recarga a mitad de captura recupera también el encuadre: sin
  // eso, un monitor acotado parecería una captura averiada.
  const [monitor, setMonitor] = useState<Monitor | null>(
    payload?.traficoActivo
      ? {
          activo: true,
          nota: payload.filtroTrafico ? 'Captura en curso · acotada.' : 'Captura en curso.',
          filtro: payload.filtroTrafico,
        }
      : null,
  );
  const { aqui, golpe, embiste, golpeada, chocando, impacto } = useAnimacionPasillo(payload?.laberinto);

  // El ariete del Muro y los choques del pasillo. Se escuchan por el
  // PASO a la vez que se ven —de ahí el booleano derivado: `embiste` es
  // un objeto nuevo en cada repintado y como dependencia sonaría sin
  // parar—. Es la fase de los mil quinientos noventa golpes: el sonido
  // es media fase.
  const hayEmbestida = embiste !== null;
  const hayChoque = chocando !== null;
  useEffect(() => { if (hayEmbestida) sonar('golpe'); }, [hayEmbestida]);
  useEffect(() => { if (hayChoque) sonar('error'); }, [hayChoque]);
  const avisos = useAvisosDeConexion(averia?.tipo === 'PANTALLA', averia?.hasta ?? 0);
  const salidasRef = useRef<HTMLDivElement>(null);
  const flujoRef = useRef<HTMLDivElement>(null);
  const filtroRef = useRef(describirFiltro(payload?.filtroTrafico));

  useEffect(() => {
    if (!socket) return;
    const alRecibir = (s: SalidaComando) => {
      // El veredicto suena AQUÍ y no en la consola: aquí es donde se ve,
      // y quien teclea lo hace a ciegas.
      sonar(s.bloques.some((b) => b.tipo === 'error') ? 'error' : 'ok');
      // Guardia de idempotencia: si una reconexión reenvía algo ya
      // pintado, no lo duplicamos.
      setSalidas((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s]));
    };
    const alEntrar = (l: LineaTrafico) => {
      sonar('linea');
      return setLineas((prev) => {
        if (prev.some((x) => x.id === l.id)) return prev;
        const siguiente = [...prev, l];
        return siguiente.length > TOPE_LINEAS ? siguiente.slice(-TOPE_LINEAS) : siguiente;
      });
    };
    // Cambiar de encuadre vacía lo ya pintado: dejar arriba las líneas de
    // antes haría leer como «filtrado» lo que no lo está. Pausar o
    // reanudar reemiten el estado sin tocar el filtro, y ahí no se borra.
    const alCambiarEstado = (p: Monitor) => {
      const encuadre = describirFiltro(p.filtro);
      if (encuadre !== filtroRef.current) {
        filtroRef.current = encuadre;
        setLineas([]);
      }
      setMonitor(p);
    };

    socket.on('pantalla:output', alRecibir);
    socket.on('pantalla:trafico', alEntrar);
    socket.on('pantalla:trafico:estado', alCambiarEstado);
    return () => {
      socket.off('pantalla:output', alRecibir);
      socket.off('pantalla:trafico', alEntrar);
      socket.off('pantalla:trafico:estado', alCambiarEstado);
    };
  }, [socket]);

  // Las dos cajas se desplazan SOLAS, cada una dentro de sí misma.
  // Con scrollIntoView el monitor arrastraría la página entera cada
  // segundo y las dos superficies se pelearían por el foco: el operador
  // acababa viendo el principio de las salidas en vez del final.
  const alFinal = (caja: HTMLDivElement | null) => {
    if (caja) caja.scrollTop = caja.scrollHeight;
  };
  useLayoutEffect(() => alFinal(salidasRef.current), [salidas]);
  useLayoutEffect(() => alFinal(flujoRef.current), [lineas]);

  return (
    <section className="vista vista-pantalla">
      {/* La máquina viva de fondo: late con cada respuesta del sistema. */}
      <JardinEscena variante="pantalla" marco={150} latido={salidas.length} />
      <header>
        <h2>Salida del sistema</h2>
        <span className="organo">el ojo</span>
        <span className="rol rol-PANTALLA">Operador de Pantalla</span>
      </header>

      <p className="ayuda">{payload?.nota ?? 'Tú ves lo que responde el sistema.'}</p>

      {avisos.avisos.map((a, i) => (
        <div
          key={a.id}
          className={`aviso-conexion${avisos.saliendo ? ' robot-se-va' : ''}`}
          style={{ left: `${a.x}%`, top: `${a.y}%`, ['--giro' as string]: `${a.giro}deg`, ['--i' as string]: i % 8 }}
        >
          <span className="aviso-cab">SISTEMA</span>
          <CaraRobot className="aviso-cara" reiniciando={avisos.saliendo} />
          <strong>{avisos.saliendo ? 'Reconectando' : 'Conexión perdida'}</strong>
          <span className="aviso-pie">{avisos.saliendo ? 'el robot se reinicia…' : 'JA JA JA · reintentando…'}</span>
          <button type="button" onClick={() => avisos.cerrar(a.id)}>Cerrar</button>
        </div>
      ))}

      {/* El circuito cerrado del recinto. Va arriba del todo: es lo que
          hay que mirar mientras la consola prueba peticiones a ciegas. */}
      {payload?.camaras && <MonitorCamaras camaras={payload.camaras} />}

      {/* La maraña: el laberinto que la pierna hace crecer y el brote que
          lo cruza. Va arriba del todo: es lo que hay que mirar. */}
      {/* La mano derecha: las falanges o los tendones. */}
      {payload?.mano && (
        <div className="camaras">
          <Mano3D {...payload.mano} />
          <p className="cam-pie">
            {payload.mano.capa === 1
              ? 'Una cara a la vez: pídanle a Terminal la cámara 1 (frente) o la 2 (reverso). Datos sabe cuál manda en cada dedo.'
              : 'Díganle a Terminal qué intercambiar. Cada intercambio gasta del presupuesto.'}
          </p>
        </div>
      )}

      {/* La final: la mente, y cómo se destruye. */}
      {payload?.mente && (
        <div className="camaras">
          <Mente3D {...payload.mente} />
          <p className="cam-pie">
            {payload.mente.capa === 1
              ? 'Cada petición es un disparo. Dicten tokens e ids letra por letra, y canten el código de cada respuesta.'
              : 'Canten el reto en cuanto salga y avisen cuando baje el escudo: hay 25 s para golpear.'}
          </p>
        </div>
      )}

      {/* El torso: la bóveda de los recuerdos y su embudo. */}
      {payload?.boveda && (
        <div className="camaras">
          <Boveda3D {...payload.boveda} />
          <p className="cam-pie">
            {payload.boveda.capa === 1
              ? 'Cada consulta apaga los cajones que no cumplen. Canten el número: cuando quede uno, Terminal lo abre.'
              : 'Al unir, los recuerdos se conectan con sus personas; al agrupar, cada grupo se levanta como una columna.'}
          </p>
        </div>
      )}

      {payload?.marana && (
        <div className="camaras marana-monitor">
          <Marana mundo={payload.marana.mundo} viaje={payload.marana.viaje}
                  capa={payload.marana.capa} resuelta={payload.marana.resuelta}
                  titulo={payload.marana.titulo} final={payload.marana.final} />
          <p className="cam-pie">
            {payload.marana.mundo.brotes.length > 1
              ? 'Los cuatro llevan el programa de la consola. Cuéntenle al equipo por dónde fue cada uno y dónde acabó.'
              : 'El brote lo escribe y lo lanza la consola. Díctenle el camino: la flecha apunta hacia donde mira.'}
          </p>
        </div>
      )}

      {/* El pasillo. Esta pantalla no lo recorre —no tiene con qué— y eso
          es deliberado: quien anda es el de la consola, a ciegas, y aquí
          se ve por dónde va y qué tiene delante. */}
      {payload?.laberinto && (
        <div className="laberinto">
          <div
            className="rejilla"
            style={{ '--cols': payload.laberinto.rejilla[0].length } as CSSProperties}
          >
            {payload.laberinto.rejilla.flatMap((fila, f) =>
              fila.map((c, i) => {
                const hayCorredor = f === aqui[0] && i === aqui[1];
                const recibiendo = !!golpeada && f === golpeada[0] && i === golpeada[1];
                // Mientras dura la embestida la casilla golpeada se pinta
                // como barrera aunque el servidor ya la de por rota: la
                // barrera cae cuando termina la animacion, no antes.
                const tipo = recibiendo ? 'barrera' : c.tipo;
                const golpeado = !!impacto && f === impacto[0] && i === impacto[1];
                const dir = hayCorredor ? (chocando ?? embiste) : null;
                return (
                  <span
                    key={`${f}-${i}`}
                    className={`celda ${tipo}${hayCorredor ? ' corredor' : ''}`
                      + `${recibiendo ? ' golpeada' : ''}`
                      + `${golpeado ? ' impacto' : ''}`
                      + `${hayCorredor && chocando ? ' estrellandose' : hayCorredor && embiste ? ' embistiendo' : ''}`}
                    style={dir ? ({ '--dx': dir.dx, '--dy': dir.dy } as CSSProperties) : undefined}
                  >
                    {hayCorredor ? '>'
                      : tipo === 'barrera' ? (c.barrera ?? payload.laberinto!.ultimo?.barrera)
                      : tipo === 'roca' ? 'X' : ''}
                  </span>
                );
              }),
            )}
          </div>

          {golpe && (
            <p className="contador">
              <strong>{golpe.n}</strong> golpes
              {golpe.tandas > 1 && <span className="contador-tanda">tanda {golpe.tanda} de {golpe.tandas}</span>}
            </p>
          )}

          {/* Las placas descubiertas se quedan a la vista: son el dato que
              hay que cantarle a Datos, y perderlo al hacer scroll seria
              obligar a mirar dos veces. */}
          <ul className="placas">
            {payload.laberinto.rejilla.flatMap((fila) =>
              fila.filter((c) => c.tipo === 'barrera' && c.placa),
            ).map((c) => (
              <li key={c.barrera} className="enfrente">
                <span className="placa-n">{c.barrera}</span>
                <span className="placa-txt">{c.placa}</span>
              </li>
            ))}
            {payload.laberinto.rotas.map((n) => (
              <li key={`rota-${n}`} className="rota">
                <span className="placa-n">[OK]</span>
                <span className="placa-txt">barrera {n} derribada</span>
              </li>
            ))}
          </ul>

          {payload.laberinto.ultimo && !golpe && (
            <p className="laberinto-ultimo">
              último intento: {payload.laberinto.ultimo.golpes} golpes
              {payload.laberinto.ultimo.tandas
                ? ` en ${payload.laberinto.ultimo.tandas} tandas`
                : ' seguidos'}
              {' — '}{payload.laberinto.ultimo.resultado}
            </p>
          )}
        </div>
      )}

      {/* El núcleo: el árbol a la izquierda y la pieza abierta a la
          derecha. Esta pantalla NO navega —no tiene con qué— y eso es
          deliberado: quien anda es el de la consola, a ciegas, y lo que
          aquí se ve es adónde ha llegado. */}
      {payload?.codigo && (
        <div className="nucleo">
          <div className="arbol">
            <p className="arbol-raiz">{payload.codigo.raiz}</p>
            {payload.codigo.carpetas.map((c) => (
              <div key={c.nombre} className="carpeta">
                <p className="carpeta-nombre">{c.nombre}/</p>
                <ul>
                  {c.piezas.map((pz) => (
                    <li key={pz.nombre} className={pz.abierta ? 'abierta' : ''}>
                      {pz.abierta && <span className="flecha">&gt;</span>}
                      {pz.nombre}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="fuente">
            {payload.codigo.abierta ? (
              <>
                <p className="fuente-ruta">
                  {payload.codigo.abierta.ruta}
                  {payload.codigo.pila.length > 1 && (
                    <span className="fuente-pila">{payload.codigo.pila.join(' \u203a ')}</span>
                  )}
                </p>
                {payload.codigo.abierta.lineas.map((l) => (
                  <div key={l.n} className={`fuente-linea ${l.cursor ? 'cursor' : ''}`}>
                    <span className="fuente-n">{l.n}</span>
                    <span className="fuente-txt">{l.texto}</span>
                  </div>
                ))}
              </>
            ) : (
              <p className="pendiente">
                Nada abierto todavía. Tu compañero tiene que abrir una pieza.
              </p>
            )}
          </div>
        </div>
      )}

      {monitor && (
        <div className="monitor">
          <div className="monitor-barra">
            <span className={`monitor-luz ${monitor.activo ? 'viva' : ''}`}>
              {monitor.activo ? '[*]' : '[ ]'}
            </span>
            <span className="monitor-titulo">Tráfico entrante</span>
            <span className="monitor-nota">{monitor.nota}</span>
            {describirFiltro(monitor.filtro) && (
              <span className="monitor-filtro">&gt;&lt; {describirFiltro(monitor.filtro)}</span>
            )}
            <span className="monitor-cuenta">{lineas.length} peticiones</span>
          </div>

          <div className="flujo" ref={flujoRef}>
            <div className="flujo-cab">
              <span>hora</span><span>metodo</span><span>ruta</span>
              <span>cuenta</span><span>origen</span><span>resp</span>
            </div>
            {lineas.length === 0 && (
              <p className="pendiente">
                {describirFiltro(monitor.filtro)
                  ? 'Nada encaja con el filtro todavía. El ataque sigue cayendo por debajo.'
                  : 'Esperando peticiones…'}
              </p>
            )}
            {lineas.map((l) => (
              <div key={l.id} className={`flujo-linea c${Math.floor(l.codigo / 100)}xx`}>
                <span className="f-hora">{l.hora}</span>
                <span className="f-metodo">{l.metodo}</span>
                <span className="f-ruta">{l.ruta}</span>
                <span className="f-cuenta">{l.cuenta}</span>
                <span className="f-ip">{l.ip}</span>
                <span className="f-codigo">{l.codigo}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="marco-pantalla" ref={salidasRef}>
        {salidas.length === 0 && (
          <p className="pendiente">
            Sin salidas todavía. Pide al Operador de Terminal que escriba algo.
          </p>
        )}
        {salidas.map((s) => <Salida key={s.id} s={s} />)}
      </div>

      <footer className="huella">montaje #{mountId}</footer>
    </section>
  );
}
