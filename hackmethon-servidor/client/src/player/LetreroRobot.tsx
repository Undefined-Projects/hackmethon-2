import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { sonar } from '../lib/sonido';
import { roleLabel } from '../lib/format';
import type { ConsejoRobot } from '../shared/events';

// ============================================================
//  EL LETRERO DEL ROBOT
//
//  Cuando el admin manda un consejo, el robot asoma desde abajo con un
//  letrero colgado y lo escribe letra a letra, moviendo la boca mientras
//  «habla». Cada puesto recibe el suyo. No tapa el juego: va en una
//  esquina, y se queda hasta que lo cierran. Un clic en el letrero
//  termina de escribirlo de golpe.
// ============================================================

const RITMO_MS = 26;

/** `así` → código: los consejos citan comandos entre comillas invertidas.
 *  Se parte una vez y se enseñan los primeros `n` caracteres VISIBLES, así
 *  que mientras se escribe nunca asoma una comilla suelta. */
const trozos = (texto: string) => texto.split(/`([^`]+)`/).map((t, i) => ({ t, codigo: i % 2 === 1 }));
function conCodigo(partes: { t: string; codigo: boolean }[], n = Infinity): ReactNode[] {
  let queda = n;
  return partes.map((p, i) => {
    const t = p.t.slice(0, Math.max(0, queda));
    queda -= p.t.length;
    if (!t) return null;
    return p.codigo ? <code key={i}>{t}</code> : <span key={i}>{t}</span>;
  });
}

/** El robot, de frente y amable: antena con brote, cara de pantalla,
 *  ojos que parpadean y una boca que se mueve mientras habla. */
export function RobotConsejo({ habla }: { habla: boolean }) {
  return (
    <svg viewBox="0 0 132 150" className={`consejo-robot${habla ? ' habla' : ''}`} aria-hidden="true">
      <g className="consejo-robot__antena">
        <path d="M66 24 V8" />
        <path className="hoja" d="M66 12 C58 4 50 8 52 14 C58 14 62 14 66 12 Z" />
        <path className="hoja" d="M66 9 C72 1 81 4 79 10 C73 11 70 11 66 9 Z" />
      </g>
      <rect className="consejo-robot__cabeza" x="20" y="24" width="92" height="70" rx="16" />
      <rect className="consejo-robot__pantalla" x="31" y="36" width="70" height="46" rx="9" />
      <g className="consejo-robot__ojos">
        <rect x="45" y="48" width="9" height="12" rx="3" />
        <rect x="78" y="48" width="9" height="12" rx="3" />
      </g>
      <rect className="consejo-robot__boca" x="56" y="67" width="20" height="4" rx="2" />
      <circle className="consejo-robot__perno" cx="20" cy="58" r="5" />
      <circle className="consejo-robot__perno" cx="112" cy="58" r="5" />
      <path className="consejo-robot__cuerpo" d="M44 94 H88 L100 150 H32 Z" />
      <path className="consejo-robot__brazo" d="M98 112 L124 86" />
      <circle className="consejo-robot__mano" cx="125" cy="84" r="5" />
    </svg>
  );
}

export function LetreroRobot({ consejo, onCerrar, ensayo = false }: {
  consejo: ConsejoRobot;
  onCerrar: () => void;
  /** En el panel: lo dice, para que nadie crea que se mandó. */
  ensayo?: boolean;
}) {
  const [n, setN] = useState(0);
  const partes = trozos(consejo.texto);
  const total = partes.reduce((t, p) => t + p.t.length, 0);

  // Cada consejo nuevo se escribe desde cero.
  useEffect(() => {
    setN(0);
    sonar('consejo');
    let k = 0;
    const id = setInterval(() => {
      k += 1;
      setN(k);
      if (k % 3 === 0) sonar('tecla');
      if (k >= total) clearInterval(id);
    }, RITMO_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consejo.id, consejo.texto]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  const habla = n < total;
  const donde = [consejo.fase, consejo.capa ? `capa ${consejo.capa}${consejo.nombreCapa ? ` · ${consejo.nombreCapa}` : ''}` : null]
    .filter(Boolean).join(' · ');

  return (
    <div className="consejo" role="status" aria-live="polite">
      <RobotConsejo habla={habla} />
      <div className="consejo-letrero" onClick={() => setN(total)}>
        <span className="consejo-letrero__cadena izq" aria-hidden="true" />
        <span className="consejo-letrero__cadena der" aria-hidden="true" />
        <header className="consejo-letrero__cab">
          <span className="consejo-letrero__sello">CONSEJO DEL ROBOT</span>
          <span className={`rol rol-${consejo.rol}`}>{roleLabel[consejo.rol]}</span>
          {ensayo && <span className="consejo-letrero__ensayo">VISTA PREVIA</span>}
        </header>
        {donde && <p className="consejo-letrero__donde">{donde}</p>}
        {/* El texto entero ocupa su sitio desde el principio (invisible),
            y encima se escribe: así el letrero no cambia de tamaño. */}
        <p className="consejo-letrero__texto">
          <span className="fantasma" aria-hidden="true">{conCodigo(partes)}</span>
          <span className="escrito">{conCodigo(partes, n)}{habla && <i className="cursor" />}</span>
        </p>
        <button type="button" className="consejo-letrero__ok" onClick={(e) => { e.stopPropagation(); onCerrar(); }}>
          [OK] ENTENDIDO
        </button>
      </div>
    </div>
  );
}
