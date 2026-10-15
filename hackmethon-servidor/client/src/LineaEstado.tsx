import { useSession } from './session/SessionContext';
import { roleLabel } from './lib/format';
import { alternarSonido } from './lib/sonido';
import { useSonido } from './lib/useSonido';

/**
 * El renglón 24 del terminal: siempre visible, siempre el mismo sitio.
 * En un evento en vivo, "¿estoy conectado?" y "¿qué rol tengo?" son las
 * dos preguntas que se repiten, y ninguna debería obligar a buscar.
 *
 * Y desde el Paso del sonido, una tercera: "¿por qué no suena?". El
 * interruptor vive aquí porque es el único sitio que existe en TODAS
 * las pantallas —jugador, panel y proyección— y porque quien quiere
 * callar su portátil no debería tener que buscar dónde.
 */
export function LineaEstado() {
  const { snapshot, conn } = useSession();
  const { encendido, bloqueado } = useSonido();

  const rol =
    snapshot?.kind === 'PLAYER' ? roleLabel[snapshot.me.role].toUpperCase() : 'CONTROL';
  const equipo = snapshot?.kind === 'PLAYER' ? snapshot.team.name : 'ADMIN';
  const evento = snapshot?.event.status ?? '—';

  return (
    // Las celdas de estado van `aria-hidden` una a una, no el renglón
    // entero: dentro hay un botón de verdad, y esconder a su padre lo
    // dejaría fuera del alcance de un lector de pantalla.
    <div className="oia">
      <span aria-hidden="true" className={`oia__cell ${conn === 'online' ? 'oia__on' : 'oia__off'}`}>
        {conn === 'online' ? 'EN LÍNEA' : conn === 'connecting' ? 'ENLAZANDO' : 'SIN ENLACE'}
      </span>
      <span aria-hidden="true" className="oia__cell">
        <b>{equipo}</b>
      </span>
      <span aria-hidden="true" className="oia__cell oia__opt">{rol}</span>

      <button
        type="button"
        className={`oia__cell oia__son ${encendido ? 'on' : ''} ${bloqueado ? 'mudo' : ''}`}
        aria-pressed={encendido}
        title={
          bloqueado
            ? 'El navegador no deja sonar nada hasta que toques la página'
            : encendido ? 'Silenciar esta pantalla' : 'Activar el sonido en esta pantalla'
        }
        onClick={alternarSonido}
      >
        {encendido ? (bloqueado ? '[!] SONIDO' : '[*] SONIDO') : '[ ] SONIDO'}
      </button>

      <span aria-hidden="true" className="oia__cell oia__fin">
        {evento}
        {snapshot?.event.paused ? ' · PAUSA' : ''}
      </span>
    </div>
  );
}
