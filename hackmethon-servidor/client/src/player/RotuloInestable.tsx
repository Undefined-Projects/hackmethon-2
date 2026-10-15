import { useEffect, useState } from 'react';

const RUIDO = '#@%&*/\\|_=+<>[]{}·:;~^$?';
const PUESTOS = ['DATOS', 'TERMINAL', 'PANTALLA'];

const basura = (largo: number) =>
  Array.from({ length: largo }, () => RUIDO[Math.floor(Math.random() * RUIDO.length)]).join('');

/**
 * El rótulo no aparece: se estabiliza. Durante el fallo va saltando
 * entre basura y los tres puestos posibles, y solo al final se queda
 * con el bueno. Es la diferencia entre "te cambió el rol" y "el
 * sistema perdió el control y te reasignó".
 */
export function RotuloInestable({ texto, ms = 900 }: { texto: string; ms?: number }) {
  const [visible, setVisible] = useState(texto);

  useEffect(() => {
    const inicio = Date.now();
    const id = setInterval(() => {
      if (Date.now() - inicio >= ms) {
        clearInterval(id);
        setVisible(texto);
        return;
      }
      // Alterna basura y puestos reales: leer de reojo un rol que no es
      // el tuyo y verlo cambiar es lo que vende la avería.
      setVisible(
        Math.random() < 0.45
          ? basura(texto.length)
          : PUESTOS[Math.floor(Math.random() * PUESTOS.length)],
      );
    }, 55);
    return () => clearInterval(id);
  }, [texto, ms]);

  return <>{visible}</>;
}
