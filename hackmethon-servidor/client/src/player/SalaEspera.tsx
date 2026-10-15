import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer, useSession } from '../session/SessionContext';
import { rondaLibre, type MinijuegoClave, type MinijuegoView } from '../shared/events';
import { CATALOGO, msDeSinapsis } from '../lib/minijuegos';
import { enEspera } from '../lib/espera';
import { sonar } from '../lib/sonido';
import { JUEGOS } from './minijuegos/juegos';

/**
 * LA SALA DE ESPERA.
 *
 * Un equipo que va rápido supera todo lo que hay abierto y se queda
 * mirando el lobby hasta que el panel abre la siguiente fase. Ese rato
 * es para los minijuegos: se le abren solos, y en cuanto se abre la
 * fase siguiente se cierran y se le avisa a lo grande.
 *
 * - Se abren SOLOS una vez por cada espera, unos segundos después de
 *   entrar en ella: así no pisan la celebración de la fase ni la
 *   destrucción del robot. Si alguien los cierra, no vuelven a saltar
 *   en esa espera; queda un botón para volver.
 * - Empieza por el juego que esa persona menos ha jugado.
 * - Cada intento cuenta para sus marcas, y la barra enseña el récord de
 *   la sala en ese juego, para picar.
 * - El recreo que lanza el panel manda: mientras lo haya, esto se esconde.
 * - Dentro de una fase no se espera: no aparece.
 */

/** Lo que se espera antes de abrir los juegos al entrar en la espera. */
const RESPIRO_MS = 6000;
/** Lo que se queda el aviso de «se abrió la fase». */
const AVISO_MS = 7000;

const leer = (clave: MinijuegoClave, puntos: number) =>
  clave === 'sinapsis' ? `${msDeSinapsis(puntos)} ms` : `${puntos} pts`;

export function SalaEspera({ recreoDelPanel }: { recreoDelPanel: boolean }) {
  const player = usePlayer();
  const { socket, resuelta } = useSession();
  const { esperando, siguiente } = enEspera(player.lobby, player.event);
  const enLobby = player.workspace === null;
  const activa = esperando && enLobby && !recreoDelPanel;

  const [abierta, setAbierta] = useState(false);
  const [clave, setClave] = useState<MinijuegoClave | null>(null);
  const [aviso, setAviso] = useState<{ order: number; title: string } | null>(null);

  // Cada espera se identifica por lo que el equipo lleva superado: al
  // superar otra fase y volver a esperar, es una espera nueva.
  const superadas = player.lobby.filter((f) => f.teamStatus === 'SOLVED').map((f) => f.phaseId).sort().join(',');
  const yaSalto = useRef<string | null>(null);

  // El juego por el que empezar: el que menos ha jugado esta persona.
  const primero = useMemo(() => {
    const intentos = (c: MinijuegoClave) => player.misMarcas?.find((m) => m.clave === c)?.intentos ?? 0;
    return [...CATALOGO].sort((a, b) => intentos(a.clave) - intentos(b.clave))[0].clave;
  }, [player.misMarcas]);

  // Abrirse sola, una vez por espera, con un respiro.
  useEffect(() => {
    if (!activa || abierta || resuelta || yaSalto.current === superadas) return;
    const t = setTimeout(() => {
      yaSalto.current = superadas;
      setClave((c) => c ?? primero);
      setAbierta(true);
      sonar('abrir');
    }, RESPIRO_MS);
    return () => clearTimeout(t);
  }, [activa, abierta, resuelta, superadas, primero]);

  // Se abrió la siguiente fase: fuera los juegos y aviso a lo grande.
  const antes = useRef(esperando);
  const siguienteAntes = useRef(siguiente);
  useEffect(() => {
    if (antes.current && !esperando) {
      const abiertaAhora = player.lobby.find((f) => f.phaseId === siguienteAntes.current?.phaseId && f.canEnter)
        ?? player.lobby.find((f) => f.canEnter && f.teamStatus !== 'SOLVED');
      if (abiertaAhora) {
        setAbierta(false);
        setAviso({ order: abiertaAhora.order, title: abiertaAhora.title });
        sonar('entrar');
      }
    }
    antes.current = esperando;
    if (siguiente) siguienteAntes.current = siguiente;
  }, [esperando, siguiente, player.lobby]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), AVISO_MS);
    return () => clearTimeout(t);
  }, [aviso]);

  const elegida = clave ?? primero;
  const minijuego: MinijuegoView = useMemo(() => ({ clave: elegida, ronda: rondaLibre(elegida), desde: 0 }), [elegida]);
  const Juego = JUEGOS[elegida];
  const record = player.recordsSala?.find((r) => r.clave === elegida);

  return (
    <>
      {aviso && (
        <div className="sala-aviso" role="alert" onClick={() => setAviso(null)}>
          <span className="sala-aviso__tag">¡SE ABRIÓ!</span>
          <strong className="sala-aviso__fase">FASE {aviso.order}</strong>
          <span className="sala-aviso__titulo">{aviso.title.replace(/^\s*fase\s+\d+\s*[—–-]\s*/i, '')}</span>
          <span className="sala-aviso__nota">se acabó el recreo · a por ella</span>
        </div>
      )}

      {activa && !abierta && (
        <button type="button" className="sala-volver" onClick={() => { sonar('abrir'); setAbierta(true); }}>
          ◆ MINIJUEGOS MIENTRAS ABRE LA FASE {siguiente?.order}
        </button>
      )}

      {activa && abierta && Juego && (
        <>
          <div className="sala-barra" role="toolbar" aria-label="Sala de espera">
            <span className="sala-barra__tag">SALA DE ESPERA</span>
            <span className="sala-barra__nota">
              la fase {siguiente?.order} aún no abre · cuando abra, esto se cierra solo
            </span>
            <span className="sala-barra__juegos">
              {CATALOGO.map((c) => (
                <button
                  key={c.clave} type="button" className={c.clave === elegida ? 'activo' : ''}
                  onClick={() => { sonar('boton'); setClave(c.clave); }}
                >{c.nombre.split(' · ')[0]}</button>
              ))}
            </span>
            <span className="sala-barra__record">
              {record
                ? <>RÉCORD DE LA SALA <b>{leer(elegida, record.puntos)}</b> · {record.nombre}</>
                : 'nadie tiene récord aún'}
            </span>
            <button type="button" className="sala-barra__cerrar" onClick={() => { sonar('salir'); setAbierta(false); }}>
              VOLVER AL LOBBY
            </button>
          </div>
          {/* `key` por juego: cambiar de juego empieza de cero. */}
          <Juego key={elegida} minijuego={minijuego} socket={socket} />
        </>
      )}
    </>
  );
}
