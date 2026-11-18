/**
 * Limite de error de un Componente de Tema: si lanza, solo desaparece su Capa. Es de clase porque React no tiene
 * limites de error en funciones; `Suspense` evita que el render de servidor propague el fallo.
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
