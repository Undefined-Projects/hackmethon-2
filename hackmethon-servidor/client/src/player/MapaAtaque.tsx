import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ElementoPlano, Plano } from '../shared/events';
import { VIDA_LINEA_ATAQUE_MS } from '../shared/constants';
import type { EquipoPlano } from '../lib/plano';
import type { AtaqueVivo } from '../lib/ataques';
import { PlanoSala } from '../admin/PlanoSala';
import { JardinEscena } from '../admin/JardinEscena';

/**
 * El mapa de ataque: el auditorio, con la mesa de cada equipo, y se
 * ataca pulsando la mesa del rival.
 *
 * Encima van las LÍNEAS de los ataques del último minuto, de todos
 * contra todos: rojas las que vienen a por ti, verdes las tuyas, rosas
 * las de los demás. Ver quién va a por quién es la mitad del juego: el
 * que lleva tres flechas encima es el que va ganando, y el que dispara
 * a todo el mundo se queda sin amigos.
 *
 * No sabe de sockets: recibe los datos y avisa con `alAtacar`. Así el
 * jugador de verdad (MenuAtaque) y la prueba del panel (AtaquePrueba)
 * pintan exactamente lo mismo.
 *
 * Elegir y atacar son DOS pasos: pulsar una mesa la marca, y el botón de
 * abajo dispara. En un mapa de treinta mesas un dedo se equivoca de
 * mesa, y un ataque no se deshace.
 */
export type PropsMapaAtaque = {
  plano: Pick<Plano, 'ancho' | 'alto' | 'elementos'>;
  equipos: Map<string, EquipoPlano>;
  /** El equipo de quien mira. */
  yo: string;
  ataques: AtaqueVivo[];
  /** Los rivales, estén o no en el plano. `intensidad` es el
   *  multiplicador del ataque normal contra cada uno (lo calcula el
   *  servidor); sin él, no se enseña. */
  objetivos: { id: string; name: string; intensidad?: number }[];
  ultimoObjetivoId: string | null;
  listo: boolean;
  /** El reloj del botón: «LISTO», «00:42»… */
  reloj: string;
  enviando: string | null;
  alAtacar: (id: string, nombre: string) => void;
  alCerrar: () => void;
  /** Una franja arriba: el aviso de simulación, la nota del último ataque… */
  cabecera?: ReactNode;
  /** Lo que va en la barra de arriba junto al reloj: tickets y escudo. */
  barra?: ReactNode;
  /** El súper ataque, si quien mira puede lanzarlo. Va junto al botón
   *  de atacar porque se apunta igual: a la mesa elegida. */
  superAtaque?: {
    listo: boolean;
    /** Por qué no se puede, si no se puede: «faltan tickets», «00:42»… */
    motivo: string | null;
    precio: number;
    alLanzar: (id: string, nombre: string) => void;
  };
};

/** El multiplicador, en palabras: es lo que se lee de un vistazo. */
const fuerza = (x: number) => (x < 0.85 ? 'débil' : x > 1.15 ? 'fuerte' : 'normal');

export function MapaAtaque(p: PropsMapaAtaque) {
  const { plano, equipos, yo, ataques, objetivos, ultimoObjetivoId, listo, reloj, enviando, alAtacar, alCerrar } = p;
  const [elegido, setElegido] = useState<string | null>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar(); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [alCerrar]);

  const mesaDe = new Map(plano.elementos.filter((e) => e.tipo === 'mesa' && e.teamId).map((e) => [e.teamId!, e]));
  const sinMesa = objetivos.filter((o) => !mesaDe.has(o.id));
  const ahora = Date.now();
  // Recién atacadas: tiemblan un momento.
  const golpeadas = new Set(ataques.filter((a) => ahora - a.local < 2500).map((a) => a.a));
  const nombre = (id: string) => equipos.get(id)?.nombre ?? '¿?';
  const objetivo = elegido ? objetivos.find((o) => o.id === elegido) ?? null : null;
  const vetado = elegido !== null && elegido === ultimoObjetivoId;
  // La maleza late con cada ataque nuevo, de quien sea.
  const latido = ataques.length ? ataques[ataques.length - 1].local : 0;

  const clase = (el: ElementoPlano) => {
    const id = el.teamId;
    if (!id) return 'mesa-vacia';
    return [
      id === yo ? 'mesa-mia' : 'mesa-rival',
      id === ultimoObjetivoId ? 'mesa-vetada' : '',
      id === elegido ? 'mesa-elegida' : '',
      golpeadas.has(id) ? 'mesa-golpeada' : '',
    ].join(' ');
  };
  const elegir = (el: ElementoPlano) => {
    if (el.teamId && el.teamId !== yo) setElegido(el.teamId === elegido ? null : el.teamId);
  };

  return createPortal(
    <div className="mapa-ataque" role="dialog" aria-modal="true" aria-label="Elige a quién atacar"
      onMouseDown={(e) => { if (e.target === e.currentTarget) alCerrar(); }}>
      <div className="mapa-ataque-caja">
        {/* La maleza de la sala de guerra: raíces de circuito que cuelgan
            de arriba, enredaderas que trepan por las esquinas y buses por
            los costados. Detrás de todo; se asoma por los márgenes del
            plano y laten con cada ataque. */}
        <JardinEscena variante="ataque" latido={latido} />
        <header className="mapa-ataque-cab">
          <h2>&gt;&lt;! ¿A QUIÉN ATACAS?</h2>
          <span className={`mapa-ataque-reloj ${listo ? 'listo' : ''}`}>{reloj}</span>
          {p.barra}
          <span className="mapa-ataque-leyenda">
            <i className="lin lin--contra" /> a por ti
            <i className="lin lin--mia" /> tuyos
            <i className="lin lin--otros" /> entre otros
          </span>
          <button type="button" className="mapa-ataque-cerrar" onClick={alCerrar} aria-label="Cerrar">[x]</button>
        </header>
        {p.cabecera}

        <div className="mapa-ataque-cuerpo">
          <div className="mapa-ataque-lienzo">
            <PlanoSala
              plano={plano} equipos={equipos} className="plano--ataque"
              mesas={{ alElegir: elegir, clase }} maleza
              encima={<LineasAtaque mesaDe={mesaDe} ataques={ataques} yo={yo} ahora={ahora} />}
            />
          </div>

          <aside className="mapa-ataque-lado">
            <h3>Último minuto</h3>
            {ataques.length === 0
              ? <p className="mapa-ataque-calma">Nadie ha atacado todavía.</p>
              : (
                <ol className="mapa-ataque-feed">
                  {[...ataques].reverse().slice(0, 8).map((a) => (
                    <li key={a.id} className={[a.a === yo ? 'contra' : a.de === yo ? 'mia' : '', a.super ? 'super' : '', a.bloqueado ? 'bloqueado' : ''].join(' ')}>
                      <b>{nombre(a.de)}</b> {a.super ? '>>>' : '>>'} <b>{nombre(a.a)}</b>
                      {a.super && <em> SÚPER</em>}
                      {a.bloqueado && <em> ESCUDO</em>}
                      <span>{Math.max(0, Math.round((ahora - a.local) / 1000))} s</span>
                    </li>
                  ))}
                </ol>
              )}
            {sinMesa.length > 0 && (
              <>
                <h3>Sin mesa en el mapa</h3>
                <div className="mapa-ataque-sueltos">
                  {sinMesa.map((o) => (
                    <button key={o.id} type="button" className={o.id === elegido ? 'elegido' : ''}
                      onClick={() => setElegido(o.id === elegido ? null : o.id)}>{o.name}</button>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>

        <footer className="mapa-ataque-pie">
          {objetivo ? (
            <>
              <span className="mapa-ataque-elegido">
                Objetivo: <b>{objetivo.name}</b>
                {objetivo.intensidad !== undefined && (
                  <span className={`mapa-ataque-intensidad intensidad--${fuerza(objetivo.intensidad)}`}>
                    {' '}· intensidad ×{objetivo.intensidad.toFixed(1)} ({fuerza(objetivo.intensidad)})
                  </span>
                )}
                {vetado && <em> · le atacaste el último: toca otro</em>}
                {!vetado && !listo && <em> · todavía enfriando</em>}
              </span>
              <span className="mapa-ataque-botones">
                <button
                  type="button" className="mapa-ataque-fuego"
                  disabled={!listo || vetado || enviando !== null}
                  onClick={() => alAtacar(objetivo.id, objetivo.name)}
                >
                  {enviando ? 'LANZANDO…' : `ATACAR A ${objetivo.name}`}
                </button>
                {p.superAtaque && (
                  <button
                    type="button" className="mapa-ataque-super"
                    disabled={!p.superAtaque.listo || enviando !== null}
                    title={p.superAtaque.motivo ?? 'Inmoviliza a todo el equipo 15 s y atraviesa su escudo'}
                    onClick={() => p.superAtaque!.alLanzar(objetivo.id, objetivo.name)}
                  >
                    SÚPER ATAQUE · {p.superAtaque.precio} T
                    {p.superAtaque.motivo && <small>{p.superAtaque.motivo}</small>}
                  </button>
                )}
              </span>
            </>
          ) : (
            <span className="mapa-ataque-elegido">Pulsa la mesa de un rival.</span>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Las líneas de los ataques, de mesa a mesa.
 *
 * Curvas y siempre hacia el mismo lado de su sentido: así un ataque de
 * A a B y la devolución de B a A no se pisan, se ven las dos. Acaban un
 * poco antes de la mesa para que la flecha no quede debajo, y se van
 * apagando según envejecen: la de hace diez segundos grita, la de hace
 * cincuenta susurra.
 */
export function LineasAtaque({ mesaDe, ataques, yo, ahora }: {
  mesaDe: Map<string, ElementoPlano>; ataques: AtaqueVivo[]; yo: string | null; ahora: number;
}) {
  return (
    <g className="lineas-ataque" aria-hidden="true">
      <defs>
        {(['contra', 'mia', 'otros'] as const).map((t) => (
          <marker key={t} id={`punta-${t}`} viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="0.55" markerHeight="0.55" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M0 0 L10 5 L0 10 Z" className={`punta punta--${t}`} />
          </marker>
        ))}
      </defs>
      {ataques.map((a) => {
        const m1 = mesaDe.get(a.de), m2 = mesaDe.get(a.a);
        if (!m1 || !m2) return null;
        const tipo = a.a === yo ? 'contra' : a.de === yo ? 'mia' : 'otros';
        const dx = m2.x - m1.x, dy = m2.y - m1.y, d = Math.hypot(dx, dy) || 1;
        const cx = (m1.x + m2.x) / 2 - (dy / d) * d * 0.22, cy = (m1.y + m2.y) / 2 + (dx / d) * d * 0.22;
        // Se recorta por los dos lados, hacia el punto de control.
        const corta = (x: number, y: number, r: number) => {
          const ex = cx - x, ey = cy - y, l = Math.hypot(ex, ey) || 1;
          return [x + (ex / l) * r, y + (ey / l) * r];
        };
        const [x1, y1] = corta(m1.x, m1.y, Math.min(m1.w, m1.h) * 0.6);
        const [x2, y2] = corta(m2.x, m2.y, Math.min(m2.w, m2.h) * 0.75);
        const edad = (ahora - a.local) / VIDA_LINEA_ATAQUE_MS;
        return (
          <g key={a.id} className={`linea-ataque linea-ataque--${tipo}${a.super ? ' linea-ataque--super' : ''}${a.bloqueado ? ' linea-ataque--bloqueado' : ''}`} style={{ opacity: Math.max(0.15, 1 - edad * 0.85) }}>
            <path className="linea-ataque__halo" d={`M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`} />
            <path className="linea-ataque__trazo" d={`M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`} markerEnd={`url(#punta-${tipo})`} />
            {ahora - a.local < 1600 && <circle className="linea-ataque__impacto" cx={m2.x} cy={m2.y} r={0.4} />}
          </g>
        );
      })}
    </g>
  );
}
