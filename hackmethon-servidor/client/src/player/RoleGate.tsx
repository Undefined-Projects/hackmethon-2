import type { ComponentType } from 'react';
import type { Role } from '../shared/constants';
import type { PhaseWorkspace } from '../shared/events';
import { DatosView } from './roles/DatosView';
import { TerminalView } from './roles/TerminalView';
import { PantallaView } from './roles/PantallaView';

// ============================================================
//  Renderizado condicional ABSOLUTO.
//
//  Un solo sitio en toda la aplicación decide qué ve cada operador, y
//  lo decide con el rol que viene del servidor. No hay condicionales de
//  rol dispersos por otros componentes: si los hubiera, bastaría uno mal
//  puesto para que el Operador de Terminal viera los datos.
//
//  Por qué `key={role}` y no un simple if/else:
//  React reutiliza el árbol cuando el tipo de componente coincide. Sin
//  key, al pasar de DATOS a TERMINAL podrían sobrevivir estados locales
//  (un input a medio escribir, un scroll, un temporizador). Con key,
//  React DESMONTA el árbol anterior y monta uno nuevo desde cero: los
//  efectos se limpian y no queda ni un byte del rol anterior.
// ============================================================

const VISTAS: Record<Role, ComponentType<{ workspace: PhaseWorkspace }>> = {
  DATOS: DatosView,
  TERMINAL: TerminalView,
  PANTALLA: PantallaView,
};

export function RoleGate({ role, workspace }: { role: Role; workspace: PhaseWorkspace }) {
  const Vista = VISTAS[role];

  // Defensa en profundidad: el servidor ya proyecta el workspace para el
  // rol, pero si alguna vez llegaran desalineados, no pintamos nada.
  if (workspace.role !== role) {
    return (
      <div className="desfase">
        Sincronizando rol… <small>({workspace.role} → {role})</small>
      </div>
    );
  }

  return <Vista key={role} workspace={workspace} />;
}
