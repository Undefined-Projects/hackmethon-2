import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { PARTES } from '../lib/anatomia';

// ============================================================
//  El robot de los ataques.
//
//  Es el MISMO robot de la lámina del lobby —mitad estatua de mármol,
//  mitad máquina de circuito, con las mismas siluetas de lib/anatomia—,
//  solo que aquí no es el paciente: es quien te ataca. Cada avería lo
//  saca a escena a su manera:
//
//   - Pantalla: su cara riéndose dentro de cada aviso emergente.
//   - Terminal: su cara riéndose mientras teclea por ti.
//   - Datos: sus brazos agarrando la pantalla y sacudiéndola.
//   - Súper ataque: su cara, enorme, con la cuenta atrás para volver.
//
//  Y al terminar no se esfuma: se REINICIA —se le apaga la risa, una
//  barra de arranque le cruza la frente— y se va por donde vino. Eso es
//  `useSalida`: mantiene al robot montado `SALIDA_MS` más, en fase de
//  salida, para que el CSS lo despida.
//
//  Las pieles van con patrones PROPIOS de cada dibujo (ids de `useId`):
//  los de la lámina solo existen mientras el lobby está montado, y dentro
//  de una fase no lo está.
// ============================================================

/** Un id utilizable dentro de `url(#…)`: sin los dos puntos de React. */
export const useIdSvg = () => `ra${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

/** Lo que dura la despedida: el reinicio y la huida. El CSS la reparte
 *  en esos mismos milisegundos (ver `robot-reinicia` y compañía). */
export const SALIDA_MS = 1800;

export type FaseRobot = 'activo' | 'saliendo' | null;

/**
 * El robot sigue en escena un rato después de que acabe su avería.
 * `activo` mientras dura; `saliendo` durante `SALIDA_MS` al acabar; y
 * `null` cuando ya se fue. Si vuelve a atacar a media salida, vuelve a
 * `activo` sin pasar por cero.
 *
 * El cambio a `saliendo` se hace EN EL RENDER y no en un efecto: con un
 * efecto habría un fotograma con el robot desmontado entre medias, y se
 * vería parpadear justo antes de despedirse.
 */
export function useSalida(activa: boolean): FaseRobot {
  const [fase, setFase] = useState<FaseRobot>(activa ? 'activo' : null);
  if (activa && fase !== 'activo') setFase('activo');
  if (!activa && fase === 'activo') setFase('saliendo');
  useEffect(() => {
    if (fase !== 'saliendo') return;
    const t = setTimeout(() => setFase(null), SALIDA_MS);
    return () => clearTimeout(t);
  }, [fase]);
  return fase;
}

/** Las dos pieles del robot, recortadas por la mitad del cuerpo (x=280). */
export function Pieles({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-marmol`} width="46" height="46" patternUnits="userSpaceOnUse">
        <path d="M0 34 C10 22 18 30 26 20 S40 8 46 12" className="an-veta" />
        <path d="M6 0 C10 8 4 14 12 22" className="an-veta an-veta--fina" />
      </pattern>
      <pattern id={`${id}-circuito`} width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M0 12 H8 L12 8 H24 M12 8 V0 M18 8 V16 L22 20 H24" className="an-pista" />
        <rect x="6" y="10" width="3" height="3" className="an-via" />
        <rect x="16" y="14" width="4" height="4" className="an-via" />
      </pattern>
      <clipPath id={`${id}-organica`}><rect x="0" y="0" width="280" height="884" /></clipPath>
      <clipPath id={`${id}-maquina`}><rect x="280" y="0" width="280" height="884" /></clipPath>
    </defs>
  );
}

/** Una silueta del robot con su base, sus dos pieles y su borde. */
export function Silueta({ id, d }: { id: string; d: string }) {
  return (
    <>
      <path d={d} className="parte__base" />
      <path d={d} fill={`url(#${id}-marmol)`} clipPath={`url(#${id}-organica)`} />
      <path d={d} fill={`url(#${id}-circuito)`} clipPath={`url(#${id}-maquina)`} />
      <path d={d} className="parte__borde robot-ataque__borde" />
    </>
  );
}

/**
 * La cabeza del robot, muerta de risa: el ojo de estatua cerrado en arco,
 * el LED hecho un ^ y la boca abierta de par en par, con los dientes
 * arriba y la mandíbula que sube y baja. Alrededor, el JA JA JA.
 */
export function CaraRobot({ className = '', risa = true, reiniciando = false }: {
  className?: string;
  /** Sin el JA JA JA alrededor: para los sitios donde no cabe. */
  risa?: boolean;
  /** Se acabó la avería: la risa se apaga y arranca el reinicio. */
  reiniciando?: boolean;
}) {
  const id = useIdSvg();
  return (
    <svg viewBox="214 4 132 192" className={`robot-cara ${reiniciando ? 'robot-cara--reinicio' : ''} ${className}`} aria-hidden="true">
      <Pieles id={id} />
      <g className="robot-cara__cabeza">
        <Silueta id={id} d={PARTES.cabeza.d} />
        <path d="M280 24 V112" className="an-costura" />
        <path d="M238 66 a7 7 0 1 1 12 6 M252 48 a7 7 0 1 1 12 6 M234 86 a7 7 0 1 1 12 6" className="an-rizo" />
        <path d="M296 56 H318 L326 64" className="an-placas" />
        <path d="M314 92 H326 L332 86" className="an-cable" />

        {reiniciando ? (
          <>
            {/* Reiniciando: ojos en blanco, el LED parpadeando como al
                arrancar, la boca en línea y la barra de carga en la frente. */}
            <path d="M244 92 H266" className="robot-cara__ojo" />
            <rect x="294" y="88" width="20" height="8" className="robot-cara__led-arranque" />
            <path d="M262 134 H298" className="robot-cara__ojo" />
            <rect x="250" y="56" width="60" height="9" className="robot-cara__barra" />
            <rect x="252" y="58" width="56" height="5" className="robot-cara__barra-carga" />
          </>
        ) : (
          <>
        {/* Los ojos, cerrados de risa. */}
        <path d="M243 96 Q254 82 266 96" className="robot-cara__ojo" />
        <path d="M293 97 L304 85 L315 97" className="robot-cara__ojo robot-cara__ojo--led" />
        {/* Las lágrimas: una de piedra y un píxel de luz. */}
        <path d="M246 100 q-3 6 0 9 q3 -3 0 -9 Z" className="robot-cara__lagrima" />
        <rect x="312" y="100" width="4" height="4" className="robot-cara__lagrima robot-cara__lagrima--led" />

        {/* La boca: los dientes arriba, fijos; la mandíbula abajo, la
            que se mueve con cada carcajada. */}
        <g className="robot-cara__boca">
          <path d="M254 118 H306 L302 126 H258 Z" className="robot-cara__dientes" />
          <path d="M263 118 V126 M272 118 V126 M281 118 V126 M290 118 V126 M299 118 V126" className="robot-cara__juntas" />
          <path d="M256 124 H304 Q300 150 280 152 Q260 150 256 124 Z" className="robot-cara__garganta" />
          <path d="M268 146 Q280 138 292 146 Q286 151 280 151 Q274 151 268 146 Z" className="robot-cara__lengua" />
        </g>
          </>
        )}

      </g>
      {reiniciando ? (
        <text x="280" y="16" textAnchor="middle" className="robot-cara__reinicio-txt">REINICIANDO</text>
      ) : risa && (
        <g className="robot-cara__ja">
          <text x="216" y="40" className="robot-cara__ja-1">JA</text>
          <text x="314" y="30" className="robot-cara__ja-2">JA</text>
          <text x="322" y="150" className="robot-cara__ja-3">JA</text>
        </g>
      )}
    </svg>
  );
}

/**
 * Un brazo del robot, del hombro a la mano, tal como cuelga en la lámina.
 * Lo coloca y lo mueve el CSS: aquí solo se dibuja. El izquierdo es de
 * estatua y el derecho de máquina, como en el cuerpo entero.
 */
export function BrazoRobot({ lado, className = '' }: { lado: 'izq' | 'der'; className?: string }) {
  const id = useIdSvg();
  const parte = lado === 'izq' ? PARTES['brazo-izq'] : PARTES['brazo-der'];
  const caja = lado === 'izq' ? '110 184 102 326' : '348 184 102 326';
  return (
    <svg viewBox={caja} className={`robot-brazo robot-brazo--${lado} ${className}`} aria-hidden="true">
      <Pieles id={id} />
      <Silueta id={id} d={parte.d} />
      {lado === 'izq' ? (
        <path d="M152 314 C160 322 170 322 176 314 M126 488 L136 496 L150 494" className="an-anatomia" />
      ) : (
        <>
          <path d="M382 304 H410 V330 H382 Z M384 194 L376 212 L404 226 L406 206 Z" className="an-junta" />
          <path d="M410 488 V502 M418 488 V504 M426 486 V500 M434 482 V494" className="an-dedos" />
        </>
      )}
    </svg>
  );
}

/**
 * El robot entero detrás de la pantalla de Datos: los brazos suben desde
 * abajo y la agarran por los lados para sacudirla, y la cabeza asoma por
 * arriba, muerta de risa. En una capa FIJA del tamaño de la ventana y
 * recortada: los hombros quedan fuera, y unos brazos de medio metro
 * colgando de la vista estirarían la página hacia abajo.
 *
 * Al salir se reinicia, suelta la pantalla y se va: los brazos bajan y
 * la cabeza se esconde por arriba.
 */
export function RobotSacudiendo({ fase }: { fase: FaseRobot }) {
  if (!fase) return null;
  const saliendo = fase === 'saliendo';
  return createPortal(
    <div className={`robot-brazos ${saliendo ? 'robot-se-va' : ''}`} aria-hidden="true">
      <BrazoRobot lado="izq" />
      <BrazoRobot lado="der" />
      <div className="robot-asoma-arriba">
        <CaraRobot reiniciando={saliendo} />
      </div>
    </div>,
    document.body,
  );
}
