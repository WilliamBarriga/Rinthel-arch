/**
 * Store of the external Diffs, one per `dev` client (like the agent's): it listens to `event: diferencia`, drops the
 * own ones and keeps the external ones until the state of their `version` arrives (the projection needs that Source).
 * Whoever knows the active View merges it into the `Highlight` (`useExternalDiffs` in the frame); the index, the gallery
 * and the Agent panel only read.
 */
import { devDiffSchema } from '../../src/protocol';
import type { DevDiff } from '../../src/protocol';
import { storePerClient, createValue, listenValidated, useObservable } from '../store';
import type { ListeningClient, Observable } from '../store';
import { EMPTY_HIGHLIGHT } from './projection';
import type { Highlight } from './projection';

export interface DiffsSnapshot {
  highlight: Highlight;
  /** External Diffs not merged yet, in arrival order. */
  pending: readonly DevDiff[];
}

export interface DiffStore extends Observable<DiffsSnapshot> {
  /** Takes the pending ones with `version <= to` (those whose state already arrived). */
  takePending(to: number): DevDiff[];
  update(change: (highlight: Highlight) => Highlight): void;
}

export function createDiffStore(client: ListeningClient): DiffStore {
  const value = createValue<DiffsSnapshot>({ highlight: EMPTY_HIGHLIGHT, pending: [] });
  listenValidated(client, 'diferencia', devDiffSchema, (diff) => {
    if (diff.origen !== 'externo') return;
    const current = value.snapshot();
    value.change({ ...current, pending: [...current.pending, diff] });
  });
  return {
    snapshot: value.snapshot,
    subscribe: value.subscribe,
    takePending(to) {
      const current = value.snapshot();
      const lists = current.pending.filter((d) => d.version <= to);
      if (lists.length > 0) value.change({ ...current, pending: current.pending.filter((d) => d.version > to) });
      return lists;
    },
    update(change) {
      const current = value.snapshot();
      const highlight = change(current.highlight);
      if (highlight !== current.highlight) value.change({ ...current, highlight });
    },
  };
}

export const clientDiffs = storePerClient(createDiffStore);

export function useDiffs(client: ListeningClient): { store: DiffStore; snapshot: DiffsSnapshot } {
  const store = clientDiffs(client);
  return { store, snapshot: useObservable(store) };
}
