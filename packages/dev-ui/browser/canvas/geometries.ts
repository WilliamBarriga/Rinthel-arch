/**
 * On-demand Geometry of the `dev` page: only the active View's. A `pintura` or `codigo` change (or a state without
 * `cambio`) requests nothing. After an `estructura` change or a skipped version, it discards what was requested and
 * requests the active View; while it arrives the previous state is drawn. A malformed Geometry is reported in `errors`.
 */
import type { CanonicalForm, CachedGeometry } from 'canonical';

import type { DevState } from '../../src/protocol';

import type { GeometryRead } from '../client';

/** `geometries`: those that already arrived for the structure of the state. */
export interface Drawable {
  state: DevState & { fuente: CanonicalForm };
  geometries: Readonly<Record<string, CachedGeometry>>;
  errors: readonly string[];
}

export interface GeometriesDependencies {
  request: (view: string) => Promise<GeometryRead>;
  /** Active View before the page draws (the one in the URL hash). */
  initialView: (source: CanonicalForm) => string | undefined;
}

export interface DevGeometries {
  receive(state: DevState): void;
  /** Requests its Geometry if it was not requested yet for the current structure. */
  activate(view: string): void;
  drawable(): Drawable | undefined;
  /** Notifies when `drawable()` changes; returns the unsubscribe. */
  subscribe(notice: () => void): () => void;
}

type WithSource = DevState & { fuente: CanonicalForm };

export function createDevGeometries({ request, initialView }: GeometriesDependencies): DevGeometries {
  const notices = new Set<() => void>();
  let shown: Drawable | undefined;
  let last: WithSource | undefined;
  /** State of a new structure waiting for the Geometry of the active View. */
  let waiting: { state: WithSource; view: string } | undefined;
  let active: string | undefined;
  /** Replaced on each structure change; whatever arrives late to the old round is discarded. */
  let round = { requested: new Set<string>(), geometries: {} as Record<string, CachedGeometry>, errors: [] as string[] };

  const notify = (): void => {
    for (const notice of notices) notice();
  };
  const show = (state: WithSource): void => {
    shown = { state, geometries: { ...round.geometries }, errors: [...round.errors] };
    notify();
  };

  const ask = (view: string): void => {
    const current = round;
    if (current.requested.has(view)) return;
    current.requested.add(view);
    void request(view).then((read) => {
      if (current !== round) return;
      if (read.ok) current.geometries[view] = read.geometry;
      else if (read.error !== undefined) current.errors.push(read.error);
      if (waiting?.view === view) {
        const ready = waiting.state;
        waiting = undefined;
        show(ready);
      } else if (waiting === undefined && shown !== undefined) {
        show(shown.state);
      }
    });
  };

  return {
    receive(state) {
      if (state.fuente === undefined) return;
      const withSource = state as WithSource;
      const previous = last;
      if (previous !== undefined && state.version <= previous.version) return;
      last = withSource;
      const relayout = previous === undefined || state.cambio === 'estructura' || state.version !== previous.version + 1;
      if (!relayout) {
        if (waiting !== undefined) waiting = { ...waiting, state: withSource };
        else show(withSource);
        return;
      }
      round = { requested: new Set(), geometries: {}, errors: [] };
      const view = active ?? initialView(withSource.fuente);
      if (view === undefined) {
        waiting = undefined;
        show(withSource);
        return;
      }
      waiting = { state: withSource, view };
      ask(view);
    },
    activate(view) {
      active = view;
      if (last !== undefined) ask(view);
    },
    drawable: () => shown,
    subscribe(notice) {
      notices.add(notice);
      return () => notices.delete(notice);
    },
  };
}
