import { useEffect, useState } from 'react';
import { useSession } from './session/SessionContext';
import { sonar } from './lib/sonido';

// ============================================================
//  Salir de la sesión para entrar con otro código.
//
//  El caso real no es el código equivocado que el servidor rechaza:
//  ese ya se ve y tiene su pantalla. El caso real es el código VÁLIDO
//  pero que no era el tuyo —teclear ALFA-2 cuando te habían dado
//  BRAVO-1— y descubrirlo ya dentro, viendo el nombre de otro en la
//  cabecera. Ahí hay que poder salir sin buscar nada.
//
//  Antes era un botón de diez píxeles al 45 % de opacidad en una
//  esquina, y decía «Salir» sin decir de dónde ni para qué.
//
//  Lleva confirmación en dos pasos, y no un `confirm()` del navegador:
//  al hacerlo visible se hace más fácil pulsarlo sin querer, y en
//  mitad de una fase eso son treinta segundos de volver a teclear. La
//  confirmación aprovecha para decir las dos cosas que hacen falta
//  para decidir: como quién estás, y que no se pierde nada.
// ============================================================

/** La confirmación se cae sola: un cartel abierto para siempre en la
 *  esquina de la pantalla estorba más de lo que ayuda. */
const ESPERA_MS = 8_000;

export function BotonSalir() {
  const { snapshot, codigo, cerrarSesion } = useSession();
  const [pidiendo, setPidiendo] = useState(false);

  useEffect(() => {
    if (!pidiendo) return;
    const t = setTimeout(() => setPidiendo(false), ESPERA_MS);
    return () => clearTimeout(t);
  }, [pidiendo]);

  useEffect(() => {
    if (!pidiendo) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setPidiendo(false); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [pidiendo]);

  const quien = snapshot?.kind === 'PLAYER'
    ? snapshot.me.displayName
    : snapshot?.kind === 'ADMIN' ? 'Control del evento' : null;

  if (!pidiendo) {
    return (
      <button
        className="salir"
        title="Salir de esta sesión para entrar con otro código"
        onClick={() => { sonar('boton'); setPidiendo(true); }}
      >
        [&gt;] SALIR · OTRO CÓDIGO
      </button>
    );
  }

  return (
    <div className="salir-caja" role="dialog" aria-label="Salir de la sesión">
      {/* Como quién estás. Es justo el dato que falta cuando alguien
          entra con el código de otro: lo ve y ya sabe si es el suyo. */}
      {quien && (
        <p className="salir-quien">
          entraste como <b>{quien}</b>
          {codigo && <span className="salir-codigo">{codigo}</span>}
        </p>
      )}
      <p className="salir-aviso">
        Salir no borra nada. Puedes volver a entrar con este mismo código y lo
        recuperas todo donde lo dejaste.
      </p>
      <div className="salir-botones">
        <button className="primaria" onClick={() => { sonar('salir'); cerrarSesion(); }}>
          SÍ, SALIR
        </button>
        <button className="sutil" onClick={() => setPidiendo(false)}>NO, SEGUIR</button>
      </div>
    </div>
  );
}
