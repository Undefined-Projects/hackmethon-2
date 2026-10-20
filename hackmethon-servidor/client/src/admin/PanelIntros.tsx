import { useState } from 'react';
import { INTROS, IntroFase } from '../player/fases/IntroFase';

/**
 * Las introducciones de las fases: la animación que cada jugador ve sola
 * la primera vez que entra en una fase. Desde aquí se reproduce en ESTA
 * pantalla, para revisarla o enseñarla en la sala, sin tocar a nadie ni
 * marcarla como vista para ningún jugador.
 */
export function PanelIntros({ phases }: { phases: { key: string; order: number; title: string }[] }) {
  const [viendo, setViendo] = useState<string | null>(null);
  const conIntro = phases.filter((p) => INTROS[p.key]).sort((a, b) => a.order - b.order);
  const sinIntro = phases.filter((p) => !INTROS[p.key]).length;

  return (
    <section className="panel">
      <div className="panel__bar">
        <span className="panel__name">ANIMACIONES DE LAS FASES</span>
        <span className="panel__stat">{conIntro.length} DE {phases.length}</span>
      </div>
      <div className="panel__body">
        <p className="ayuda">
          Cada jugador ve la animación de una fase sola, la primera vez que entra, y puede volver a
          verla con «cómo se juega». Aquí se reproduce solo en esta pantalla: no se manda a nadie ni
          cuenta como vista. Se maneja con las flechas, la barra espaciadora pausa y Escape la cierra.
        </p>
        <div className="intros-lista">
          {conIntro.map((p) => (
            <article key={p.key} className="intros-ficha">
              <span className="intros-lamina">{INTROS[p.key].lamina}</span>
              <strong>{p.title}</strong>
              <span className="intros-meta">
                {INTROS[p.key].escenas.length} escenas · ~{Math.round(INTROS[p.key].escenas.reduce((t, e) => t + e.dur, 0) / 1000)} s
              </span>
              <button type="button" onClick={() => setViendo(p.key)}>&gt; VER ANIMACIÓN</button>
            </article>
          ))}
          {sinIntro > 0 && (
            <p className="intros-pendiente">{sinIntro} fase(s) todavía sin animación.</p>
          )}
        </div>
      </div>
      {viendo && <IntroFase fase={viendo} ensayo onCerrar={() => setViendo(null)} />}
    </section>
  );
}
