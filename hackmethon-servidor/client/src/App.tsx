import { useState } from 'react';
import { SessionProvider, useSession } from './session/SessionContext';
import { AdminPanel } from './admin/AdminPanel';
import { PlayerApp } from './player/PlayerApp';
import { LineaEstado } from './LineaEstado';
import { BotonSalir } from './BotonSalir';

const STORAGE_KEY = 'hm:code';

/**
 * Por qué no se pudo entrar, dicho para una persona.
 *
 * El servidor manda códigos —`INVALID_CODE`— porque es lo que un
 * cliente necesita para decidir. Enseñárselos a alguien que acaba de
 * teclear mal una letra convierte una errata en una avería: se queda
 * mirando una palabra en inglés y mayúsculas sin saber si es culpa
 * suya, del wifi o del servidor.
 */
const MOTIVO_ACCESO: Record<string, string> = {
  INVALID_CODE: 'Ese código no está dado de alta. Míralo otra vez: es el que te dieron impreso, con el guion.',
  NO_CODE: 'No llegó ningún código.',
  NO_TEAM: 'Ese código existe pero no tiene equipo asignado. Avisa a quien gobierna el evento.',
  NOT_ALLOWED: 'Ese código no puede entrar por aquí.',
  INTERNAL: 'El servidor falló al preparar tu sesión. Vuelve a intentarlo.',
};

export default function App() {
  const [code, setCode] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  // Lo último que se tecleó, para devolverlo al formulario. Quien se
  // equivoca en una letra no tiene por qué reescribir las otras cinco.
  const [ultimo, setUltimo] = useState('');

  const salir = () => {
    setUltimo(code ?? '');
    localStorage.removeItem(STORAGE_KEY);
    setCode(null);
  };

  const entrar = (c: string) => {
    localStorage.setItem(STORAGE_KEY, c);
    setCode(c);
  };

  if (!code) return <Login inicial={ultimo} onEntrar={entrar} />;

  // `key={code}` : cambiar de credencial reconstruye la sesión entera.
  return (
    <SessionProvider key={code} code={code} onLogout={salir}>
      <Enrutador />
    </SessionProvider>
  );
}

function Login({ inicial, onEntrar }: { inicial: string; onEntrar: (c: string) => void }) {
  const [input, setInput] = useState(inicial);
  return (
    <div className="login">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const c = input.trim().toUpperCase();
          if (c) onEntrar(c);
        }}
      >
        <h1>HACK(ME)THON</h1>
        <p className="edicion" aria-label="2.0: The Anatomy of a Machine">
          <span className="edicion__ver">2.0</span>
          <span className="edicion__name">THE ANATOMY OF A MACHINE</span>
        </p>
        <p className="epigrafe">“El instinto es solo un algoritmo sin documentar”</p>
        <p>Introduce tu código de acceso</p>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ALFA-1"
          autoFocus
          autoCapitalize="characters"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="submit">Entrar</button>
      </form>
    </div>
  );
}

/**
 * Reparto por tipo de snapshot. La decisión la toma el servidor (kind),
 * no una ruta del navegador: nadie llega al panel de admin escribiendo
 * una URL.
 */
function Enrutador() {
  const { snapshot, conn, error, codigo, credencialRechazada, socket, cerrarSesion } = useSession();

  if (!snapshot) {
    // Tres estados distintos y conviene no confundirlos: la credencial
    // rechazada NO se arregla esperando, y un fallo de red SÍ. Decir
    // «sin acceso» a las dos cosas manda a media sala a reescribir un
    // código que estaba bien.
    return (
      <div className="login">
        <div className="acceso">
          <h1>
            {credencialRechazada ? 'Código no válido'
              : error ? 'Sin conexión'
              : 'Enlazando…'}
          </h1>

          {codigo && (
            <p className="acceso-codigo">
              tecleaste <b>{codigo}</b>
            </p>
          )}

          <p className={credencialRechazada || error ? 'error' : ''}>
            {credencialRechazada
              ? (MOTIVO_ACCESO[error ?? ''] ?? error)
              : error
                ? 'No se llega al servidor. Se sigue intentando…'
                : 'Buscando tu puesto…'}
          </p>

          {/* La salida está SIEMPRE, no solo cuando el código es malo:
              si el servidor no contesta, esta pantalla sería un callejón
              sin ella. */}
          <button className="primaria salir-acceso" onClick={cerrarSesion}>
            &lt;&lt; SALIR Y PROBAR OTRO CÓDIGO
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {snapshot.kind === 'ADMIN' && socket ? (
        <AdminPanel snapshot={snapshot} socket={socket} online={conn === 'online'} />
      ) : (
        <PlayerApp />
      )}
      <LineaEstado />
      <BotonSalir />
    </>
  );
}
