/**
 * Scaffolding of the per-client stores of `dev` (File history, Diffs, agent activity): an observable value, the
 * memory of one store per client (WeakMap) and listening to an SSE event validated with its schema.
 * Invariants: a store is created only once per client and listens from that moment (create it on connect so the first
 * event is not lost); an event that does not validate is ignored.
 */
import { useSyncExternalStore } from 'react';
import type { z } from 'zod';

import type { DevEventName } from '../src/protocol';
import type { DevClient } from './client';

export type ListeningClient = Pick<DevClient, 'listen'>;

/** Value with listeners, for `useSyncExternalStore`. */
export interface Observable<T> {
  snapshot(): T;
  subscribe(onChange: () => void): () => void;
}

export interface Value<T> extends Observable<T> {
  /** Notifies only if it changes (by identity). */
  change(next: T): void;
}

export function createValue<T>(initial: T): Value<T> {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    snapshot: () => current,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    change(next) {
      if (next === current) return;
      current = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

/** `create` runs once per client; later calls return the same store. */
export function storePerClient<A>(create: (client: ListeningClient) => A): (client: ListeningClient) => A {
  const perClient = new WeakMap<ListeningClient, A>();
  return (client) => {
    let store = perClient.get(client);
    if (store === undefined) {
      store = create(client);
      perClient.set(client, store);
    }
    return store;
  };
}

/** Listens to `event: <name>` and delivers only the data that validates with `schema`. */
export function listenValidated<T>(client: ListeningClient, name: DevEventName, schema: z.ZodType<T>, onDatum: (datum: T) => void): void {
  client.listen(name, (data) => {
    const parsed = schema.safeParse(data);
    if (parsed.success) onDatum(parsed.data);
  });
}

export const useObservable = <T,>(store: Observable<T>): T => useSyncExternalStore(store.subscribe, store.snapshot);
