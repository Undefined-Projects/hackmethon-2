import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { AdminSnapshot } from '../shared/events';
import { useSession } from '../session/SessionContext';
import { useTicker } from '../lib/useTicker';
import { formatMs } from '../lib/format';
import { urlLogo } from '../lib/logo';
import { sonar } from '../lib/sonido';
import { useFlip } from '../lib/useFlip';
import { JardinCarrera, Rastro } from './JardinCarrera';

/**
 * La carrera: una vista para el proyector de la sala.
 *
 * No pide nada al servidor. El panel de administración ya recibe todos
 * los equipos con su progreso y se repinta solo en cada cambio, así que
 * esto es otra FORMA DE PINTAR los mismos datos, no otra fuente. Un
 * endpoint propio habría que mantenerlo en sincronía con el panel, y
 * tarde o temprano los dos contarían cosas distintas.
 *
 * El caballo es una silueta plana, recortada, como los de hojalata de las
 * casetas de feria, en `currentColor`. Lo vivo va DETRÁS de él: cada
 * calle deja un rastro de circuito con hojas que el caballo va
 * sembrando, y la pared de la sala la reclaman raíces y trepadoras
 * (JardinCarrera.tsx). El rosa sigue siendo solo de los caballos.
 */
export function Carrera({ snapshot, sellado, logos }: {
  snapshot: AdminSnapshot;
  /** Cuándo se sellaron los cronómetros. Sin él, el del último snapshot
   *  del servidor; la carrera de prueba trae el suyo (CarreraPrueba.tsx). */
  sellado?: number;
  /** Logos que no vienen del servidor, por equipo: los inventados de la
   *  carrera de prueba. */
  logos?: Record<string, string>;
}) {
  const sesion = useSession();
  const stampedAt = sellado ?? sesion.stampedAt;
  useTicker(1000); // los cronómetros de la carrera corren solos

  const { phases, teams, event } = snapshot;
  const todas = [...phases].sort((a, b) => a.order - b.order);
  // El BONUS va detrás de la meta: no es una barrera del recorrido, así
  // que ni pone poste ni cuenta para llegar. Si contara, la pista diría
  // que nadie ha terminado cuando en realidad la carrera ya se ganó.
  const barreras = todas.filter((f) => !f.esBonus);
  const bonus = todas.filter((f) => f.esBonus);
  const total = barreras.length;

  const corredores = teams.map((t) => {
    const resueltas = barreras.filter(
      (f) => t.progress.find((p) => p.phaseId === f.id)?.status === 'SOLVED',
    ).length;

    // La fase en curso es la primera sin resolver que el equipo ya ha
    // empezado. Si no ha empezado ninguna, está en la salida. Aquí sí
    // entra el bonus: quien lo está jugando está trabajando, y la pista
    // tiene que decirlo aunque ya haya pasado la meta.
    const enCurso = todas.find(
      (f) => t.progress.find((p) => p.phaseId === f.id)?.status === 'IN_PROGRESS',
    ) ?? null;
    const bonusHecho = bonus.some(
      (f) => t.progress.find((p) => p.phaseId === f.id)?.status === 'SOLVED',
    );

    const acumulado = t.progress.reduce((a, p) => a + (p.timeToSolveMs ?? 0), 0);
    const crudo = enCurso
      ? t.progress.find((p) => p.phaseId === enCurso.id)?.elapsedMs ?? null
      : null;
    // Mismo truco que el lobby: el servidor sella el cronómetro al emitir
    // y aquí se le suma lo transcurrido. En pausa se congela, porque el
    // reloj del equipo tampoco corre.
    const cronometro =
      crudo === null ? null : event.paused ? crudo : crudo + (Date.now() - stampedAt);

    // Medio paso mientras se está dentro de una fase: un caballo parado
    // en el poste no distingue «acaba de llegar» de «lleva diez minutos».
    // El medio paso NO lo da quien está en el bonus: ese ya está en la
    // meta, y adelantarlo más lo sacaría de la pista.
    const avance = total === 0
      ? 0
      : Math.min(1, (resueltas + (enCurso && !enCurso.esBonus ? 0.5 : 0)) / total);

    return {
      id: t.id,
      nombre: t.name,
      logo: logos?.[t.id] ?? urlLogo(t.id, t.logoAt),
      resueltas,
      enCurso,
      acumulado,
      cronometro,
      avance,
      bonusHecho,
      meta: resueltas === total && total > 0,
    };
  });

  // Un poste pasado suena, y la meta suena distinto. Se compara contra
  // lo que había en el repintado anterior: al abrir la carrera a mitad
  // de partida no puede sonar una traca por todo lo ya resuelto.
  const antes = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    for (const c of corredores) {
      const previo = antes.current.get(c.id);
      if (previo !== undefined && c.resueltas > previo) sonar(c.meta ? 'meta' : 'barrera');
      antes.current.set(c.id, c.resueltas);
    }
  });

  const orden = [...corredores].sort(
    (a, b) => b.resueltas - a.resueltas || a.acumulado - b.acumulado,
  );
  const lider = orden[0];
  const hayCarrera = corredores.some((c) => c.resueltas > 0 || c.enCurso);
  // La pared late con cada barrera que pasa cualquiera.
  const latido = corredores.reduce((a, c) => a + c.resueltas, 0);

  // Con pocos equipos, una calle por equipo y las calles quietas: en una
  // carrera la posición se lee en el eje, no en la lista, y una tabla que
  // se baraja sola marea a quien la mira desde el fondo de la sala.
  //
  // Con muchos no caben: treinta calles en un proyector salen de veinte
  // píxeles y no se lee nada. Entonces arriba va la CABEZA DE CARRERA
  // —las primeras, en calles grandes, que es donde se pelea— y abajo el
  // PELOTÓN, con todos los equipos como fichas en la barrera en la que
  // van. Ahí la cabeza sí se reordena, pero deslizándose (useFlip): una
  // calle que adelanta se ve adelantar.
  const conPeloton = corredores.length > PELOTON_DESDE;
  const calles = conPeloton ? orden.slice(0, CABEZA) : corredores;
  const caja = useRef<HTMLDivElement>(null);
  useFlip(caja);

  return (
    // `--calles` gobierna el alto de la pista: con cuatro equipos cabe
    // un caballo grande, con diez hay que repartir la misma pantalla
    // entre diez calles. Va en CSS y no en JS porque es puro reparto de
    // espacio, y el navegador ya sabe hacer esa cuenta.
    <div
      ref={caja}
      className={`carrera ${conPeloton ? 'carrera--peloton' : ''}`}
      style={{ '--calles': calles.length } as CSSProperties}
    >
      <JardinCarrera latido={latido} />
      <header className="carrera-cab">
        <h1>CARRERA</h1>
        <span className="carrera-dato">{teams.length} equipos</span>
        <span className="carrera-dato">{total} barreras</span>
        {bonus.length > 0 && <span className="carrera-dato">+{bonus.length} bonus</span>}
        {event.paused && <span className="chip err">EN PAUSA</span>}
      </header>

      {conPeloton && <h2 className="carrera-seccion">cabeza de carrera</h2>}

      <div className="carrera-postes" aria-hidden>
        <span className="poste-etiqueta salida">salida</span>
        {barreras.map((f, i) => (
          <span
            key={f.id}
            className={`poste-etiqueta ${f.status === 'ACTIVE' ? 'viva' : ''}`}
            style={{ left: `${((i + 1) / total) * 100}%` }}
          >
            {f.order}
          </span>
        ))}
        <span className="poste-etiqueta meta">meta</span>
      </div>

      <ul className="calles">
        {calles.map((c, i) => (
          <li
            key={c.id}
            data-flip={conPeloton ? `calle:${c.id}` : undefined}
            className={`calle ${c.meta ? 'en-meta' : ''}`}
            style={{ '--retardo': `${(i % 4) * 0.17}s` } as CSSProperties}
          >
            <span className="calle-nombre">
              <span className="calle-id">
                {conPeloton && <span className="calle-pos">{i + 1}</span>}
                {/* El hueco del escudo se reserva SIEMPRE. Si solo lo
                    ocupara quien tiene logo, los nombres de las demás
                    calles empezarían cada uno en un sitio y la columna
                    dejaría de leerse como una columna.
                    Sin `alt`: el nombre va al lado, en texto, y un lector
                    de pantalla no gana nada leyéndolo dos veces. */}
                {c.logo
                  ? <img className="escudo-calle" src={c.logo} alt="" />
                  : <span className="escudo-calle" aria-hidden="true" />}
                <span className="calle-txt">{c.nombre}</span>
              </span>
              {hayCarrera && c.id === lider.id && <em className="banderin">LIDER</em>}
            </span>

            <div className="pista">
              {/* Primero, para que postes y caballo vayan encima. */}
              <Rastro equipo={c.id} resueltas={c.resueltas} meta={c.meta} />
              {/* Los postes de la pista: uno por fase, el de la fase
                  abierta encendido. */}
              {barreras.map((f, i) => (
                <span
                  key={f.id}
                  className={`poste ${f.status === 'ACTIVE' ? 'viva' : ''}`}
                  style={{ left: `${((i + 1) / total) * 100}%` }}
                />
              ))}

              <span
                className={`caballo ${c.enCurso ? 'corriendo' : ''} ${c.meta ? 'llegado' : ''}`}
                style={{ '--x': c.avance } as CSSProperties}
              >
                <Tordo />
              </span>
            </div>

            <Marca c={c} />
          </li>
        ))}
      </ul>

      {conPeloton && <Peloton corredores={corredores} barreras={barreras} />}

      {!hayCarrera && (
        <p className="carrera-pendiente">
          Nadie ha salido todavía. Abre una fase para dar el pistoletazo.
        </p>
      )}
    </div>
  );
}

/** Desde cuántos equipos la carrera se parte en cabeza y pelotón. */
const PELOTON_DESDE = 8;
/** Cuántas calles lleva la cabeza de carrera. */
const CABEZA = 5;

type Corredor = {
  id: string; nombre: string; logo: string | null; resueltas: number;
  enCurso: AdminSnapshot['phases'][number] | null; cronometro: number | null;
  bonusHecho: boolean; meta: boolean;
};

function Marca({ c }: { c: Corredor }) {
  return (
    <span className="calle-marca">
      {c.meta ? (
        <strong className="meta-ok">
          [OK] META{c.bonusHecho ? ' +B' : ''}
        </strong>
      ) : c.enCurso ? (
        <>
          <strong>F{c.enCurso.order}</strong>
          <span className="crono">{formatMs(c.cronometro)}</span>
        </>
      ) : (
        <span className="quieto">{c.resueltas > 0 ? 'esperando' : 'en la salida'}</span>
      )}
    </span>
  );
}

/**
 * El pelotón: todos los equipos, como fichas, en la columna de la
 * barrera a la que van. Las columnas son los mismos tramos que la pista
 * de arriba —«F3» es el tramo que acaba en el poste 3—, más la meta.
 *
 * Una columna con más gente se ensancha: al principio está la sala
 * entera en la primera y al final casi toda en la meta, y repartir el
 * ancho a partes iguales dejaría una columna desbordada y seis vacías.
 *
 * La ficha se remonta cada vez que su equipo pasa una barrera (va en la
 * `key`), y eso relanza el destello de llegada; useFlip la hace viajar
 * desde la columna de antes.
 */
function Peloton({ corredores, barreras }: { corredores: Corredor[]; barreras: AdminSnapshot['phases'] }) {
  const total = barreras.length;
  const columnas = [
    ...barreras.map((f) => ({ clave: f.id, rotulo: `F${f.order}`, viva: f.status === 'ACTIVE' })),
    { clave: 'meta', rotulo: 'META', viva: false },
  ];
  // Dentro de cada columna, por nombre y nada más: así cada equipo se
  // busca en orden alfabético, y una ficha no baila de sitio porque
  // otro equipo empiece a trabajar. Quién trabaja lo dice el borde.
  const en = columnas.map((_, k) =>
    corredores
      .filter((c) => Math.min(c.resueltas, total) === k)
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  );
  const ancho = en.map((l) => `minmax(0, ${1 + l.length * 0.5}fr)`).join(' ');

  return (
    <section className="peloton" aria-label="El pelotón">
      <h2 className="carrera-seccion">el pelotón</h2>
      <div className="peloton-cols" style={{ gridTemplateColumns: ancho }}>
        {columnas.map((col, k) => (
          <div key={col.clave} className={`peloton-col ${col.viva ? 'viva' : ''} ${col.clave === 'meta' ? 'meta' : ''}`}>
            <span className="peloton-rotulo">
              {col.rotulo}
              {en[k].length > 0 && <em>{en[k].length}</em>}
            </span>
            <ul className="pel-fichas">
              {en[k].map((c) => (
                <li
                  key={`${c.id}:${c.resueltas}`}
                  data-flip={`ficha:${c.id}`}
                  className={`pel-ficha ${c.enCurso ? 'trabaja' : ''} ${c.meta ? 'en-meta' : ''}`}
                  title={c.nombre}
                >
                  {c.logo
                    ? <img className="pel-ficha-escudo" src={c.logo} alt="" />
                    : <span className="pel-ficha-escudo" aria-hidden="true" />}
                  <span className="pel-ficha-txt">{c.nombre}</span>
                  {c.bonusHecho && <b className="pel-ficha-bonus">+B</b>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Silueta de hojalata. Angular a propósito: los caballos de las casetas
 * de feria son chapas recortadas, y una silueta plana se lee a diez
 * metros mucho mejor que un dibujo con detalle.
 */
function Tordo() {
  return (
    <svg className="tordo" viewBox="0 0 62 48" role="img" aria-label="caballo">
      {/* cola, al viento */}
      <path className="cola" d="M9 20 L2 14 L0 19 L4 21 L1 26 L8 24 Z" />
      {/* grupa, lomo, cuello y cabeza, de una pieza */}
      <path d="M8 24 C8 18 14 15 22 15 L31 16 L35 17 L41 10 L46 5 L51 4
               L55 7 L59 11 L58 14 L53 13 L48 11 L43 15 L39 21 L38 27
               L22 29 L14 28 C9 27 8 26 8 24 Z" />
      {/* oreja */}
      <path d="M50 4 L49 0 L53 3 Z" />
      {/* manos, tendidas hacia delante */}
      <path d="M36 26 L41 33 L47 41 L44 43 L37 34 L34 28 Z" />
      <path d="M31 27 L33 34 L33 42 L30 42 L28 34 L27 28 Z" />
      {/* patas, estiradas hacia atras */}
      <path d="M15 27 L11 34 L3 41 L1 38 L8 31 L11 26 Z" />
      <path d="M21 28 L19 35 L14 42 L11 40 L15 33 L17 27 Z" />
    </svg>
  );
}
