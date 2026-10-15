import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer, useSession } from '../session/SessionContext';
import { useAtaques } from '../lib/ataques';
import type { EquipoPlano } from '../lib/plano';
import { MapaAtaque } from './MapaAtaque';
import { planoAutomatico } from '../lib/plano';
import { useTicker } from '../lib/useTicker';
import { call } from '../lib/socket';
import { urlLogo } from '../lib/logo';
import { sonar } from '../lib/sonido';

// ============================================================
//  El botón de ataques, y el mapa del auditorio que abre (MapaAtaque):
//  se ataca pulsando la mesa del equipo rival.
//
//  Lo tienen los TRES puestos, y el enfriamiento es del equipo: un
//  ataque por enfriamiento entre los tres (lo ajusta el panel). Es la misma regla que gobierna el
//  resto del juego —nadie resuelve una fase solo— aplicada a lo único
//  que aquí se le puede hacer a un rival: obliga a ponerse de acuerdo
//  en a quién, en vez de que cada uno dispare por su cuenta.
//
//  Las reglas se comprueban en el SERVIDOR. Aquí se apagan los botones
//  para que nadie pulse en balde, pero un jugador con la consola del
//  navegador abierta puede emitir lo que quiera y el servidor lo
//  rechaza igual.
// ============================================================

const MOTIVOS: Record<string, string> = {
  ENFRIANDO: 'Todavía está enfriando',
  OBJETIVO_REPETIDO: 'A ese acabas de atacarle: toca otro',
  EVENTO_NO_EN_JUEGO: 'El evento no está en marcha',
  A_TI_NO: 'A tu propio equipo no',
  EQUIPO_DESCONOCIDO: 'Ese equipo ya no existe',
  NO_TEAM: 'No estás en un equipo',
  TIMEOUT: 'El servidor no respondió',
};

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function MenuAtaque() {
  const player = usePlayer();
  const { socket, stampedAt, clockOffset } = useSession();
  useTicker(250);

  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [nota, setNota] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { esperaMs, ultimoObjetivoId, objetivos, plano, recientes } = player.ataque;
  const enPausa = player.event.paused;
  const ataques = useAtaques(socket, recientes, clockOffset);

  // Se ataca SIEMPRE sobre el mapa del auditorio. Con la sala mapeada
  // en el editor, ese plano; mientras no haya rivales sentados en él, un
  // reparto automático de mesas, que un mapa vacío no deja atacar a nadie.
  const mapeado = plano.elementos.some((e) => e.tipo === 'mesa' && e.teamId && e.teamId !== player.team.id);
  const sala = useMemo(() => mapeado ? plano : planoAutomatico([
    { id: player.team.id, nombre: player.team.name },
    ...objetivos.map((o) => ({ id: o.id, nombre: o.name })),
  ]), [mapeado, plano, player.team.id, player.team.name, objetivos]);
  const equipos = useMemo(() => {
    const m = new Map<string, EquipoPlano>();
    const de = (id: string, nombre: string, logoAt: number | null) =>
      m.set(id, { nombre, logo: urlLogo(id, logoAt), estado: 'salida', marca: null });
    de(player.team.id, player.team.name, player.team.logoAt);
    for (const o of objetivos) de(o.id, o.name, o.logoAt);
    return m;
  }, [player.team.id, player.team.name, player.team.logoAt, objetivos]);
  const cerrar = useCallback(() => setAbierto(false), []);

  // Sellado al emitir y continuado aquí, igual que el lobby y la
  // carrera. En pausa se congela, porque el enfriamiento tampoco corre.
  const restante = enPausa ? esperaMs : Math.max(0, esperaMs - (Date.now() - stampedAt));
  const listo = restante <= 0 && player.event.status === 'RUNNING' && !enPausa;


  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current); }, []);

  const avisar = (tipo: 'ok' | 'err', texto: string) => {
    setNota({ tipo, texto });
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setNota(null), 4000);
  };

  async function atacar(id: string, nombre: string) {
    if (!socket) return;
    setEnviando(id);
    const r = await call<{ esperaMs: number }>(socket, 'player:ataque', { teamId: id });
    setEnviando(null);
    if (r.ok) {
      sonar('ataque');
      // Se deja ver salir la línea propia antes de cerrar el mapa.
      setTimeout(() => setAbierto(false), 1600);
      avisar('ok', `Ataque lanzado a ${nombre}`);
    } else {
      sonar('error');
      avisar('err', MOTIVOS[r.error ?? ''] ?? r.error ?? 'No se pudo atacar');
    }
  }

  return (
    <div className={`ataque ${abierto ? 'desplegado' : ''}`}>
      {nota && <p className={`ataque-nota ${nota.tipo}`}>{nota.texto}</p>}

      {abierto && (
        <MapaAtaque
          plano={sala} equipos={equipos} yo={player.team.id} ataques={ataques}
          objetivos={objetivos} ultimoObjetivoId={ultimoObjetivoId}
          listo={listo} reloj={listo ? 'LISTO' : mmss(restante)} enviando={enviando}
          alAtacar={atacar} alCerrar={cerrar}
          cabecera={nota && <p className={`mapa-ataque-nota ${nota.tipo}`}>{nota.texto}</p>}
        />
      )}

      {/* El reloj va SIEMPRE en el botón, abierto o cerrado: saber
          cuánto falta es la mitad de la decisión, y esconderlo dentro
          del desplegable obligaría a abrirlo para mirar la hora. */}
      <button
        type="button"
        className={`ataque-boton ${listo ? 'listo' : 'enfriando'}`}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        onClick={() => setAbierto((a) => !a)}
      >
        <span className="ataque-rotulo">&gt;&lt;! ATACAR</span>
        <span className="ataque-reloj">
          {listo ? 'LISTO' : enPausa ? `${mmss(restante)} ·` : mmss(restante)}
        </span>
      </button>
    </div>
  );
}
