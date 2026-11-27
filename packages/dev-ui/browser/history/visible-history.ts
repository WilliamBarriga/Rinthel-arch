/**
 * Visible `dev` Undo history: the last `event: historial` of the connection, stored per client so the panel has it
 * even if it mounts after connecting. `relativeTime` is pure.
 */
import { devHistorySchema } from '../../src/protocol';
import type { DevHistory } from '../../src/protocol';
import { storePerClient, createValue, listenValidated, useObservable } from '../store';
import type { ListeningClient, Observable } from '../store';

/** `undefined` until the first `event: historial`. */
export type HistoryStore = Observable<DevHistory | undefined>;

/** Creates (once per client) the store that listens to `event: historial`; call it on connect so the first one is not lost. */
export const clientHistory = storePerClient((client): HistoryStore => {
  const value = createValue<DevHistory | undefined>(undefined);
  listenValidated(client, 'historial', devHistorySchema, value.change);
  return value;
});

export const useVisibleHistory = (client: ListeningClient): DevHistory | undefined => useObservable(clientHistory(client));

/** "now", "12 s ago", "3 min ago", "2 h ago" or "4 d ago"; `when` and `now` in ms. */
export function relativeTime(when: number, now: number): string {
  const s = Math.max(0, Math.floor((now - when) / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}
