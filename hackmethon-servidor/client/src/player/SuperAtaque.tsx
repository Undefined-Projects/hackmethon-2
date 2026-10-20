import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from '../session/SessionContext';
import { useTicker } from '../lib/useTicker';
import { useAvisosDeConexion } from './roles/PantallaView';
import { CaraRobot, useSalida } from './RobotAtaque';

/**
 * El súper ataque, visto por quien lo sufre.
 *
 * Es la avería de Pantalla —avisos de «conexión perdida» brotando sin
 * parar— pero para TODO el equipo, a pantalla completa y encima de lo
 * que sea: lobby, fase o minijuego. Y aquí los avisos NO se cierran: el
 * súper ataque inmoviliza, y eso es lo que se pagó con tickets.
 *
 * Inmovilizar de verdad son dos cosas. La capa se come los clics por
 * estar encima de todo; el teclado no lo frena ninguna capa, así que se
 * intercepta en la fase de captura, antes de que llegue a la consola de
 * la Terminal o a cualquier campo que tuviera el foco.
 *
 * Al acabar, el robot se reinicia y se va (`useSalida`). Durante esa
 * despedida el equipo YA está libre: el teclado se suelta y la capa deja
 * pasar los clics, porque los 15 segundos pagados ya se cumplieron.
 */
export function SuperAtaque() {
  const { averia } = useSession();
  useTicker(250);
  const activa = averia?.tipo === 'SUPER' && averia.hasta > Date.now();
  const avisos = useAvisosDeConexion(activa, averia?.hasta ?? 0);
  const capa = useRef<HTMLDivElement>(null);
  const fase = useSalida(activa);
  // Quién fue, guardado: en la despedida la avería ya no existe.
  const [de, setDe] = useState<string | undefined>(undefined);
  if (activa && averia?.de !== de) setDe(averia?.de);

  useEffect(() => {
    if (!activa) return;
    // Quien estaba tecleando pierde el foco: si no, el cursor seguiría
    // parpadeando en la consola como si se pudiera escribir.
    (document.activeElement as HTMLElement | null)?.blur?.();
    capa.current?.focus();
    const bloquear = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    const tipos = ['keydown', 'keyup', 'keypress', 'paste', 'wheel'] as const;
    for (const t of tipos) window.addEventListener(t, bloquear, { capture: true, passive: false });
    return () => { for (const t of tipos) window.removeEventListener(t, bloquear, { capture: true }); };
  }, [activa]);

  if (!fase) return null;
  const saliendo = fase === 'saliendo';
  const quedan = averia && !saliendo ? Math.max(0, Math.ceil((averia.hasta - Date.now()) / 1000)) : 0;

  return createPortal(
    <div ref={capa} className={`super-ataque${saliendo ? ' super-ataque--saliendo' : ''}`}
      role="alertdialog" aria-modal={!saliendo} tabIndex={-1}
      aria-label={saliendo ? 'Sistema reiniciado' : `Súper ataque de ${de ?? 'un rival'}: sistema caído ${quedan} segundos`}>
      {/* El robot en grande, riéndose encima de la cuenta atrás: es él
          quien decide cuándo se vuelve a jugar. */}
      <div className={`super-ataque__rotulo${saliendo ? ' robot-se-va' : ''}`}>
        <span className="super-ataque__cab">&gt;&lt;! SÚPER ATAQUE DE {de ?? 'UN RIVAL'}</span>
        <CaraRobot className="super-ataque__cara" reiniciando={saliendo} />
        <strong className="super-ataque__cuenta">{String(quedan).padStart(2, '0')}</strong>
        <span className="super-ataque__pie">
          {saliendo ? 'SISTEMA REINICIADO · ¡A JUGAR!' : `SISTEMA CAÍDO · VUELVES A JUGAR EN ${quedan} s`}
        </span>
      </div>
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
        </div>
      ))}
    </div>,
    document.body,
  );
}
