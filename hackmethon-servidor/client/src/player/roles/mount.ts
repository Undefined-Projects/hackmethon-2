import { useRef } from 'react';

/**
 * Identificador único por MONTAJE del componente.
 * Sirve para comprobar a simple vista que al cambiar de rol el árbol se
 * destruye y se reconstruye: si el identificador cambia, hubo desmontaje.
 */
export function useMountId(): string {
  const ref = useRef<string>('');
  if (!ref.current) ref.current = Math.random().toString(36).slice(2, 8);
  return ref.current;
}
