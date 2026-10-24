/**
 * Limite de error de un Componente de Tema: si el codigo del Workspace lanza al
 * dibujar, solo desaparece su Capa; el resto del diagrama se conserva. Es el
 * unico componente de clase del paquete (React no tiene limites de error en
 * funciones). `Suspense` tambien lo rodea para que el render de servidor no
 * propague el fallo.
 */
import { Component, Suspense } from 'react';
import type { ReactNode } from 'react';

interface Estado {
  fallo: boolean;
}

class LimiteDeError extends Component<{ children: ReactNode }, Estado> {
  override state: Estado = { fallo: false };

  static getDerivedStateFromError(): Estado {
    return { fallo: true };
  }

  override render(): ReactNode {
    return this.state.fallo ? null : this.props.children;
  }
}

export function ConLimite({ children }: { children: ReactNode }): ReactNode {
  return (
    <LimiteDeError>
      <Suspense fallback={null}>{children}</Suspense>
    </LimiteDeError>
  );
}
