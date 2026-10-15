import { useEffect, useMemo, useRef, useState } from 'react';
import type { AdminSnapshot } from '../shared/events';
import { VIDA_LINEA_ATAQUE_MS } from '../shared/constants';
import type { AtaqueVivo } from '../lib/ataques';
import type { EquipoPlano } from '../lib/plano';
import { urlLogo } from '../lib/logo';
import { logoInventado } from '../lib/logoInventado';
import { SALA_LLENA, planoDeEjemplo } from '../lib/salaInventada';
import { sonar } from '../lib/sonido';
import { useTicker } from '../lib/useTicker';
import { MapaAtaque } from '../player/MapaAtaque';

/**
 * El ataque de prueba: lo que ve un jugador al pulsar ATACAR, sin
 * jugador y sin partida.
 *
 * Todo vive en este navegador. Los demás equipos se atacan solos cada
 * pocos segundos —y de vez en cuando van a por ti— para ver las líneas
 * cruzar la sala, y tú atacas pulsando una mesa. No sale nada al
 * servidor: ni averías, ni enfriamientos, ni bitácora.
 *
 * Con el plano real si ya tiene equipos sentados; si no, con la sala de
 * ejemplo de treinta equipos.
 */

/** En la prueba se enfría en diez segundos: un minuto de espera no deja
 *  probar nada. La regla de no repetir objetivo sí es la de verdad. */
const ENFRIA_PRUEBA_MS = 10_000;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function AtaquePrueba({ snapshot, onVolver }: { snapshot: AdminSnapshot; onVolver: () => void }) {
  useTicker(250);
  const sentadosReales = snapshot.plano.elementos.filter((e) => e.tipo === 'mesa' && e.teamId).length;
  const [real, setReal] = useState(sentadosReales >= 2);

  // La sala: el plano y los equipos de verdad, o los inventados.
  const sala = useMemo(() => {
    if (real) {
      const equipos = new Map<string, EquipoPlano>(snapshot.teams.map((t) => [t.id, {
        nombre: t.name, logo: urlLogo(t.id, t.logoAt), estado: 'salida', marca: null,
      }]));
      return { plano: snapshot.plano, equipos };
    }
    const equipos = new Map<string, EquipoPlano>(SALA_LLENA.map((t, i) => [t.id, {
      nombre: t.name, logo: logoInventado(i + 1), estado: 'salida', marca: null,
    }]));
    return { plano: planoDeEjemplo(), equipos };
  }, [real, snapshot.plano, snapshot.teams]);

  // Solo cuentan los que tienen mesa: son los que pueden lanzar líneas.
  const sentados = useMemo(
    () => sala.plano.elementos.filter((e) => e.tipo === 'mesa' && e.teamId && sala.equipos.has(e.teamId)).map((e) => e.teamId!),
    [sala],
  );
  const [yoElegido, setYo] = useState<string | null>(null);
  const yo = yoElegido && sala.equipos.has(yoElegido) ? yoElegido : sentados[0] ?? null;

  const [ataques, setAtaques] = useState<AtaqueVivo[]>([]);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [desde, setDesde] = useState(0); // cuándo atacó «yo» por última vez
  const [bots, setBots] = useState(true);
  const [abierto, setAbierto] = useState(true);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [nota, setNota] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = (tipo: 'ok' | 'err', texto: string) => {
    setNota({ tipo, texto });
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setNota(null), 3500);
  };
  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current); }, []);

  const lanzar = (de: string, a: string) => setAtaques((l) => {
    const t = Date.now();
    return [...l.filter((x) => t - x.local < VIDA_LINEA_ATAQUE_MS), { id: `sim-${t}-${Math.random()}`, de, a, at: t, local: t }];
  });

  // Los bots: un ataque cada dos o tres segundos, uno de cada cuatro
  // contra ti, que es el que hay que poder ver.
  const yoRef = useRef(yo);
  useEffect(() => { yoRef.current = yo; }, [yo]);
  useEffect(() => {
    if (!bots || sentados.length < 2) return;
    let t: ReturnType<typeof setTimeout>;
    const otro = (no: string[]) => {
      const libres = sentados.filter((id) => !no.includes(id));
      return libres[Math.floor(Math.random() * libres.length)];
    };
    const tic = () => {
      const mio = yoRef.current;
      const de = otro(mio ? [mio] : []);
      const a = mio && Math.random() < 0.25 ? mio : otro([de]);
      if (de && a) {
        lanzar(de, a);
        if (a === mio) {
          sonar('averia');
          avisar('err', `${sala.equipos.get(de)?.nombre ?? '¿?'} te ha atacado`);
        }
      }
      t = setTimeout(tic, 1800 + Math.random() * 1600);
    };
    t = setTimeout(tic, 900);
    return () => clearTimeout(t);
  }, [bots, sentados, sala]);

  const restante = Math.max(0, ENFRIA_PRUEBA_MS - (Date.now() - desde));
  const listo = restante <= 0;

  function atacar(id: string, nombre: string) {
    if (!yo) return;
    if (id === ultimo) { sonar('error'); avisar('err', 'A ese acabas de atacarle: toca otro'); return; }
    if (!listo) { sonar('error'); avisar('err', 'Todavía está enfriando'); return; }
    setEnviando(id);
    // Un respiro, como el viaje de ida y vuelta al servidor.
    setTimeout(() => {
      setEnviando(null);
      lanzar(yo, id);
      setUltimo(id);
      setDesde(Date.now());
      sonar('ataque');
      avisar('ok', `Ataque lanzado a ${nombre}`);
    }, 300);
  }

  const cambiarSala = (r: boolean) => {
    sonar('boton');
    setReal(r); setYo(null); setAtaques([]); setUltimo(null); setDesde(0);
  };

  const objetivos = [...sala.equipos.entries()]
    .filter(([id]) => id !== yo)
    .map(([id, e]) => ({ id, name: e.nombre }));

  const mandos = (
    <div className="ataque-prueba-mandos">
      <span className="chip err">SIMULACIÓN · no toca el juego</span>
      <label>
        juegas como
        <select value={yo ?? ''} onChange={(e) => { setYo(e.target.value); setUltimo(null); setDesde(0); }}>
          {sentados.map((id) => <option key={id} value={id}>{sala.equipos.get(id)?.nombre}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => cambiarSala(!real)} disabled={!real && sentadosReales < 2}
        title={sentadosReales < 2 ? 'El plano real todavía no tiene equipos sentados' : ''}>
        {real ? 'SALA DE EJEMPLO (30)' : 'PLANO REAL'}
      </button>
      <button type="button" onClick={() => { sonar('boton'); setBots((b) => !b); }}>
        {bots ? 'PARAR A LOS DEMÁS' : 'QUE ATAQUEN LOS DEMÁS'}
      </button>
      <button type="button" onClick={() => { sonar('boton'); setAtaques([]); }}>BORRAR LÍNEAS</button>
      <span className="ataque-prueba-nota">enfriamiento de prueba: 10 s</span>
      {nota && <span className={`mapa-ataque-nota ${nota.tipo}`}>{nota.texto}</span>}
    </div>
  );

  return (
    <div className="admin ataque-prueba">
      <button className="volver-panel" onClick={onVolver}>&lt;&lt; PANEL</button>
      <section className="ataque-prueba-intro">
        <h1>PRUEBA DEL ATAQUE</h1>
        <p>
          Lo que ve un jugador al pulsar <b>ATACAR</b>: el auditorio con las mesas de cada equipo y las
          líneas de los ataques del último minuto. Pulsa la mesa de un rival y luego el botón de abajo.
          Nada de esto llega al servidor.
        </p>
        {sentados.length < 2 && <p className="aviso err">No hay al menos dos equipos con mesa para probar.</p>}
      </section>

      {/* El mismo botón que tiene el jugador en la esquina. */}
      <div className="ataque">
        <button type="button" className={`ataque-boton ${listo ? 'listo' : 'enfriando'}`} onClick={() => setAbierto(true)}>
          <span className="ataque-rotulo">&gt;&lt;! ATACAR</span>
          <span className="ataque-reloj">{listo ? 'LISTO' : mmss(restante)}</span>
        </button>
      </div>

      {abierto && yo && (
        <MapaAtaque
          plano={sala.plano} equipos={sala.equipos} yo={yo} ataques={ataques}
          objetivos={objetivos} ultimoObjetivoId={ultimo}
          listo={listo} reloj={listo ? 'LISTO' : mmss(restante)} enviando={enviando}
          alAtacar={atacar} alCerrar={() => setAbierto(false)}
          cabecera={mandos}
        />
      )}
    </div>
  );
}
