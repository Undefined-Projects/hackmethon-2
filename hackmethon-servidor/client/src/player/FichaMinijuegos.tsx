import type { MarcaMinijuego } from '../shared/events';
import { CATALOGO, msDeSinapsis } from '../lib/minijuegos';

/**
 * La ficha de los recreos: el desglose personal de cada minijuego, bajo
 * la ficha de la fase. Es solo de quien la mira —su mejor marca, cuántas
 * veces jugó y cómo le fue la última—; el ranking de la sala sigue
 * viviendo en la proyección, no aquí.
 */

/** Cómo se lee la marca de cada juego: SINAPSIS va en milisegundos. */
const leer = (clave: string, puntos: number) =>
  clave === 'sinapsis'
    ? { v: `${msDeSinapsis(puntos)}`, u: 'ms' }
    : { v: `${puntos}`, u: 'pts' };

const ICONO: Record<string, string> = { snake: '~', plaga: '#', sinapsis: '*', latido: '♥' };

export function FichaMinijuegos({ marcas }: { marcas: MarcaMinijuego[] }) {
  const jugados = marcas.length;
  const intentos = marcas.reduce((s, m) => s + m.intentos, 0);
  return (
    <section className="ficha ficha-mini" aria-label="Mis minijuegos">
      <header className="ficha__cab ficha-mini__cab">
        <span className="ficha__n">◆</span>
        <span className="ficha__parte">MIS MINIJUEGOS</span>
        <span className="chip mini">{jugados}/{CATALOGO.length} · {intentos} intento{intentos === 1 ? '' : 's'}</span>
      </header>
      {jugados === 0 ? (
        <p className="ficha__texto ficha-mini__vacio">
          Aún no juegas ningún minijuego. Se abren solos cuando tu equipo supera todo lo abierto y
          espera a que abra la siguiente fase, o cuando el panel lanza un recreo. Aquí quedará tu
          desglose: tu mejor marca, tus intentos y la última vez.
        </p>
      ) : null}
      <ul className="ficha-mini__lista">
        {CATALOGO.map((c) => {
          const m = marcas.find((x) => x.clave === c.clave);
          const nombre = c.nombre.split(' · ')[0];
          if (!m) {
            return (
              <li key={c.clave} className="ficha-mini__fila ficha-mini__fila--vacia">
                <span className="ficha-mini__icono" aria-hidden="true">{ICONO[c.clave] ?? '·'}</span>
                <span className="ficha-mini__nombre">{nombre}</span>
                <span className="ficha-mini__sin">SIN JUGAR</span>
              </li>
            );
          }
          const mejor = leer(c.clave, m.mejor), ultimo = leer(c.clave, m.ultimo);
          // Barra: cuánto se acercó el último intento a la mejor marca.
          const cerca = m.mejor > 0 ? Math.min(1, m.ultimo / m.mejor) : 0;
          return (
            <li key={c.clave} className="ficha-mini__fila">
              <span className="ficha-mini__icono" aria-hidden="true">{ICONO[c.clave] ?? '·'}</span>
              <span className="ficha-mini__nombre">
                {nombre}
                <small>{m.intentos} intento{m.intentos === 1 ? '' : 's'} · {m.rondas} ronda{m.rondas === 1 ? '' : 's'}</small>
              </span>
              <span className="ficha-mini__mejor" title="Tu mejor marca">
                {mejor.v}<small> {mejor.u}</small>
              </span>
              <span className="ficha-mini__ultimo">
                <span className="ficha-mini__barra" aria-hidden="true"><span style={{ transform: `scaleX(${cerca})` }} /></span>
                último {ultimo.v} {ultimo.u}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
