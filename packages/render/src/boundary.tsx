/**
 * Error boundary of a Theme Component: if it throws, only its Layer disappears. It is a class because React has no
 * error boundaries in functions; `Suspense` keeps server rendering from propagating the failure.
 */
import { Component, Suspense } from 'react';
import type { ReactNode } from 'react';

interface State {
  failure: boolean;
}

class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failure: false };

  static getDerivedStateFromError(): State {
    return { failure: true };
  }

  override render(): ReactNode {
    return this.state.failure ? null : this.props.children;
  }
}

export function WithBoundary({ children }: { children: ReactNode }): ReactNode {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>{children}</Suspense>
    </ErrorBoundary>
  );
}
