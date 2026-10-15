import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { FxCtx, useConteo, useFx, type MotorDeJuego } from './efectos';
import { JardinVentana, type VarianteVentana } from './JardinVentana';
import { sonar } from '../../lib/sonido';
import type { Envio } from './puntaje';
import { textoEnvio } from './puntaje';

/**
 * La ventana común de los minijuegos: barra de título con el marcador,
 * la pantalla del juego y, encima de ella, el lienzo de efectos que
 * comparten los cuatro juegos (`useFx`).
 *
 * Aquí no hay ranking a propósito: el de la sala se canta en la
 * proyección. En el portátil de cada quien solo está lo suyo —su
 * puntaje y su mejor intento—, así nadie juega mirando de reojo una
 * tabla en vez del tablero.
 */
export function Marco({
  nombre, marcador, mejor, children, pie, cuenta, motor, variante,
}: {
  /** Qué jardín envuelve la ventana: cada juego tiene el suyo. */
  variante: VarianteVentana;
  /** El motor de efectos del juego (`useMotorFx`). */
  motor: MotorDeJuego;
  nombre: string;
  marcador: ReactNode;
  mejor: number;
  children: ReactNode;
  /** Lo que va debajo, como la cruceta del teléfono. */
  pie?: ReactNode;
  /** La cuenta regresiva en curso (3, 2, 1, 0 = ¡YA!), o null. */
  cuenta?: number | null;
}) {
  const marco = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const { montar, fx } = motor;

  useEffect(() => (lienzo.current ? montar(lienzo.current, marco.current) : undefined), [montar]);

  return (
    <div className="minijuego" role="dialog" aria-label={`Minijuego: ${nombre}`}>
      <JardinVentana variante={variante} marco={marco} />
      <div className="minijuego__marco" ref={marco}>
        <p className="minijuego__bar">
          <span className="minijuego__tag">RECREO</span>
          <span className="minijuego__name">{nombre}</span>
          <span className="minijuego__marcador">
            {marcador}
            {mejor > 0 && <> · MEJOR <span>{mejor}</span></>}
          </span>
        </p>

        <div className="minijuego__pantalla">
          <FxCtx.Provider value={fx}>{children}</FxCtx.Provider>
          <canvas ref={lienzo} className="minijuego__fx" aria-hidden="true" />
          {cuenta != null && (
            <div className="minijuego__cuenta" aria-live="assertive">
              <span key={cuenta} className={cuenta === 0 ? 'ya' : ''}>{cuenta === 0 ? '¡YA!' : cuenta}</span>
            </div>
          )}
        </div>

        {pie}
      </div>
    </div>
  );
}

/** Un número del marcador que salta cuando cambia. */
export function Cifra({ v }: { v: number | string }) {
  return <b key={v} className="fx-cifra">{v}</b>;
}

/**
 * La pantalla final común: el veredicto entra con glitch, el puntaje
 * llega contando y, si es récord personal, llueven pétalos.
 */
export function Final({
  titulo, malo, puntos, detalle, envio, mejor, record, otra, onOtra, unidad = 'puntos', valor,
}: {
  titulo: string;
  /** El veredicto es malo: va en rojo, como el jardín marchito. */
  malo?: boolean;
  puntos: number;
  detalle?: ReactNode;
  envio: Envio;
  mejor: number;
  record: boolean;
  otra: string;
  onOtra: () => void;
  unidad?: string;
  /** Lo que se cuenta en grande, si no son los puntos (p. ej. los ms). */
  valor?: number;
}) {
  const fx = useFx();
  const grande = useConteo(valor ?? puntos);
  const yaLlovio = useRef(false);
  useEffect(() => {
    if (!record || yaLlovio.current) return;
    yaLlovio.current = true;
    fx.lluvia(90);
    sonar('victoria');
  }, [record, fx]);

  return (
    <div className="minijuego__msg minijuego__msg--fin">
      {record && <p className="minijuego__record">NUEVO RÉCORD</p>}
      <p className={`minijuego__titulo fx-glitch ${malo ? 'marchita' : ''}`}>{titulo}</p>
      <p className="minijuego__cifra">{grande}<small> {unidad}</small></p>
      <p className="minijuego__txt">
        {detalle}
        {detalle && <br />}
        {textoEnvio(envio, mejor)}
      </p>
      <button className="minijuego__otra" onClick={(e) => { e.stopPropagation(); onOtra(); }}>{otra}</button>
    </div>
  );
}
