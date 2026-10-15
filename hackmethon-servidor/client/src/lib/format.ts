export const formatMs = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined) return '--:--';
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

export const roleLabel: Record<string, string> = {
  DATOS: 'Datos',
  TERMINAL: 'Terminal',
  PANTALLA: 'Pantalla',
};
