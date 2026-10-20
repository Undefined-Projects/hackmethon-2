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
import { DURACION_ESCUDO_MS, PRECIO_ESCUDO, PRECIO_SUPER } from '../shared/constants';

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
//  Con tickets se compran el ESCUDO (los ataques normales rebotan un
//  rato) y el SÚPER ATAQUE (inmoviliza a todo el rival y atraviesa su
//  escudo). El saldo es del equipo y privado: solo se ve aquí.
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
  SIN_TICKETS: 'No les alcanzan los tickets',
  ESCUDO_ACTIVO: 'Ya tienen un escudo puesto',
  SUPER_ENFRIANDO: 'El súper ataque todavía está enfriando',
  TIMEOUT: 'El servidor no respondió',
};

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function MenuAtaque() {
  const player = usePlayer();
  const { socket, stampedAt, clockOffset, refrescar } = useSession();
  useTicker(250);

  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [nota, setNota] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { esperaMs, ultimoObjetivoId, objetivos, plano, recientes, escudoMs, superEsperaMs } = player.ataque;
  const tickets = player.team.tickets;
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
  const corre = (ms: number) => (enPausa ? ms : Math.max(0, ms - (Date.now() - stampedAt)));
  const restante = corre(esperaMs);
  const enMarcha = player.event.status === 'RUNNING' && !enPausa;
  const listo = restante <= 0 && enMarcha;
  const escudo = corre(escudoMs);
  const superRestante = corre(superEsperaMs);
  const superMotivo = !enMarcha ? 'evento detenido'
    : superRestante > 0 ? `enfriando ${mmss(superRestante)}`
    : tickets < PRECIO_SUPER ? `faltan ${PRECIO_SUPER - tickets} T`
    : null;

  // La intensidad depende de las fases de cada rival, y esas cambian sin
  // que nadie nos avise: al abrir el mapa se pide el estado al día.
  useEffect(() => { if (abierto) refrescar(); }, [abierto, refrescar]);


  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current); }, []);

  const avisar = (tipo: 'ok' | 'err', texto: string) => {
    setNota({ tipo, texto });
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setNota(null), 4000);
  };

  async function atacar(id: string, nombre: string) {
    if (!socket) return;
    setEnviando(id);
    const r = await call<{ esperaMs: number; intensidad: number; bloqueado: boolean }>(socket, 'player:ataque', { teamId: id });
    setEnviando(null);
    if (r.ok) {
      sonar('ataque');
      // Se deja ver salir la línea propia antes de cerrar el mapa.
      setTimeout(() => setAbierto(false), 1600);
      avisar('ok', r.data?.bloqueado
        ? `${nombre} tenía escudo: el ataque rebotó`
        : `Ataque lanzado a ${nombre} · ×${(r.data?.intensidad ?? 1).toFixed(1)}`);
    } else {
      sonar('error');
      avisar('err', MOTIVOS[r.error ?? ''] ?? r.error ?? 'No se pudo atacar');
    }
  }

  async function lanzarSuper(id: string, nombre: string) {
    if (!socket) return;
    if (!confirm(`¿Súper ataque a ${nombre} por ${PRECIO_SUPER} tickets?\n\nLos inmoviliza a todos 15 segundos y atraviesa su escudo.`)) return;
    setEnviando(id);
    const r = await call(socket, 'player:super', { teamId: id });
    setEnviando(null);
    if (r.ok) {
      sonar('estallido');
      setTimeout(() => setAbierto(false), 1600);
      avisar('ok', `SÚPER ATAQUE a ${nombre}`);
    } else {
      sonar('error');
      avisar('err', MOTIVOS[r.error ?? ''] ?? r.error ?? 'No se pudo lanzar');
    }
  }

  async function comprarEscudo() {
    if (!socket || enviando) return;
    if (!confirm(`¿Activar el escudo por ${PRECIO_ESCUDO} tickets?\n\nDurante ${DURACION_ESCUDO_MS / 1000} s los ataques normales rebotan. El súper ataque lo atraviesa.`)) return;
    setEnviando('escudo');
    const r = await call(socket, 'player:escudo', {});
    setEnviando(null);
    if (r.ok) {
      sonar('ok');
      avisar('ok', 'Escudo activado');
    } else {
      sonar('error');
      avisar('err', MOTIVOS[r.error ?? ''] ?? r.error ?? 'No se pudo activar');
    }
  }

  const puedeEscudo = enMarcha && escudo <= 0 && tickets >= PRECIO_ESCUDO && enviando === null;
  const barra = (
    <span className="ataque-bolsa">
      <span className="ataque-tickets" title="Tickets del equipo. Solo los ve tu equipo.">{tickets} T</span>
      {escudo > 0 ? (
        <span className="ataque-escudo activo">ESCUDO {mmss(escudo)}</span>
      ) : (
        <button type="button" className="ataque-escudo" disabled={!puedeEscudo} onClick={() => void comprarEscudo()}
          title={tickets < PRECIO_ESCUDO ? `Faltan ${PRECIO_ESCUDO - tickets} tickets` : `Los ataques normales rebotan ${DURACION_ESCUDO_MS / 1000} s`}>
          {enviando === 'escudo' ? 'ACTIVANDO…' : `ESCUDO · ${PRECIO_ESCUDO} T`}
        </button>
      )}
    </span>
  );

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
          barra={barra}
          superAtaque={{ listo: superMotivo === null, motivo: superMotivo, precio: PRECIO_SUPER, alLanzar: lanzarSuper }}
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
        <span className="ataque-reloj" title="Tickets del equipo">{tickets} T</span>
        {escudo > 0 && <span className="ataque-reloj ataque-reloj--escudo">ESCUDO {mmss(escudo)}</span>}
      </button>
    </div>
  );
}
