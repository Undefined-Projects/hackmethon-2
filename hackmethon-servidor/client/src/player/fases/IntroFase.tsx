import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { sonar } from '../../lib/sonido';
import { INTRO_REFLEJO } from './IntroReflejo';

// ============================================================
//  LA INTRODUCCIÓN DE UNA FASE
//
//  Una animación corta que cuenta, casi sin leer, qué hay que hacer.
//  Sale sola la primera vez que alguien entra en la fase, se vuelve a
//  ver con «cómo se juega» y el panel la puede reproducir para ensayarla.
//
//  Cada fase registra sus escenas en INTROS; esto solo pone el aparato:
//  el avance automático, la barra de cada escena, las flechas, la pausa
//  y el botón de cerrar. No pide nada al servidor: es la misma para todas
//  las mesas, y no lleva ni un dato de la partida.
// ============================================================

export type EscenaIntro = {
  clave: string;
  /** Cuánto dura antes de pasar sola a la siguiente, en ms. */
  dur: number;
  titulo: string;
  texto: ReactNode;
  Dibujo: () => ReactNode;
};

export type Intro = { lamina: string; nombre: string; cierre: string; escenas: EscenaIntro[] };

/** Las introducciones, por `key` de fase. Las fases sin entrada aquí no
 *  enseñan nada al entrar. */
export const INTROS: Record<string, Intro> = {
  'fase-1-acceso': {
    lamina: 'LÁMINA I · PIERNA IZQUIERDA',
    nombre: 'El Reflejo',
    cierre: 'ENTENDIDO · A LA MEMBRANA',
    escenas: INTRO_REFLEJO,
  },
};

const reducido = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Lo ya visto se recuerda en este navegador, por persona y fase. Si el
 *  almacenamiento falla, se vuelve a enseñar: mejor de más que de menos. */
const claveVisto = (usuario: string, fase: string) => `hm:intro:${usuario}:${fase}`;
export function introVista(usuario: string, fase: string): boolean {
  try { return localStorage.getItem(claveVisto(usuario, fase)) === '1'; } catch { return false; }
}
export function marcarIntroVista(usuario: string, fase: string): void {
  try { localStorage.setItem(claveVisto(usuario, fase), '1'); } catch { /* sin almacenamiento */ }
}

export function IntroFase({ fase, onCerrar, ensayo = false }: { fase: string; onCerrar: () => void; ensayo?: boolean }) {
  const intro = INTROS[fase];
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(reducido);
  const total = intro?.escenas.length ?? 0;
  const ultima = i === total - 1;

  const ir = useCallback((n: number) => {
    setI(Math.max(0, Math.min(total - 1, n)));
    sonar('abrir');
  }, [total]);

  // Avance automático. En la última se para: el cierre lo decide quien mira.
  useEffect(() => {
    if (!intro || pausa || ultima) return;
    const t = setTimeout(() => setI((n) => n + 1), intro.escenas[i].dur);
    return () => clearTimeout(t);
  }, [i, pausa, ultima, intro]);

  useEffect(() => {
    const teclas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
      else if (e.key === 'ArrowRight') ir(i + 1);
      else if (e.key === 'ArrowLeft') ir(i - 1);
      else if (e.key === ' ') { e.preventDefault(); setPausa((p) => !p); }
    };
    window.addEventListener('keydown', teclas);
    return () => window.removeEventListener('keydown', teclas);
  }, [i, ir, onCerrar]);

  useEffect(() => { sonar('entrar'); }, []);

  if (!intro) return null;
  const escena = intro.escenas[i];
  const Dibujo = escena.Dibujo;

  return (
    <div className="intro" role="dialog" aria-modal="true" aria-label={`Cómo se juega: ${intro.nombre}`}>
      <div className={`intro-caja${pausa ? ' en-pausa' : ''}`}>
        <header className="intro-cab">
          <span className="intro-lamina">{intro.lamina}</span>
          <span className="intro-nombre">{intro.nombre} · cómo se juega</span>
          {ensayo && <span className="intro-ensayo">VISTA DEL PANEL</span>}
          <button type="button" className="intro-saltar" onClick={onCerrar}>[X] {ultima ? 'CERRAR' : 'SALTAR'}</button>
        </header>

        <ol className="intro-pasos" aria-label="Escenas">
          {intro.escenas.map((e, k) => (
            <li key={e.clave} className={k < i ? 'vista' : k === i ? 'actual' : ''}>
              <button type="button" onClick={() => ir(k)} aria-label={`Escena ${k + 1}: ${e.titulo}`}>
                <span className="intro-barra"
                      style={{ ['--dur' as string]: `${e.dur}ms` } as CSSProperties} />
              </button>
            </li>
          ))}
        </ol>

        <div className="intro-escena" key={escena.clave}>
          <p className="intro-n">{String(i + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</p>
          <h2 className="intro-titulo">{escena.titulo}</h2>
          <div className="intro-dibujo"><Dibujo /></div>
          <p className="intro-texto">{escena.texto}</p>
        </div>

        <footer className="intro-pie">
          <button type="button" className="sutil" onClick={() => ir(i - 1)} disabled={i === 0}>&lt;&lt; ANTERIOR</button>
          <button type="button" className="sutil" onClick={() => setPausa((p) => !p)}>{pausa ? '> SEGUIR' : '|| PAUSA'}</button>
          {ultima
            ? <button type="button" className="intro-vamos" onClick={onCerrar}>{intro.cierre}</button>
            : <button type="button" className="sutil" onClick={() => ir(i + 1)}>SIGUIENTE &gt;&gt;</button>}
        </footer>
      </div>
    </div>
  );
}
