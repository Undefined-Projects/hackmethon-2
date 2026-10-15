import { useEffect, useState } from 'react';

/** Fuerza un repintado periódico para los cronómetros en vivo. */
export function useTicker(ms = 1000): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}
