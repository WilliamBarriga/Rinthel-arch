/**
 * Live Activity log: what `dev` shows of the Activity log (`.diagrams/activity.jsonl`), without its own disk or
 * clock. `connection()` gives the `actividad` event with `previos: true` and the last `PREVIOUS_EVENTS` Activity events;
 * each notice of the log watcher, debounced, pushes the new events through `listen` (`previos: false`).
 * Invariants: tolerant incremental read (broken lines; a shortened, rotated or removed file is read again from the
 * start); it shares no state with the Session. Errors: a read failure is ignored and the next notice retries.
 */
import { createActivityReader } from 'canonical';
import type { ActivityEvent, DevEvent } from 'canonical';

import { debounce } from './clock';
import type { Clock } from './clock';

/** The log in the adapter, with its own watcher (the Workspace watcher ignores hidden folders). */
export interface ActivityLog {
  /** Whole text of the log, or `undefined` if it does not exist. */
  read(): string | undefined;
  /** Returns how to stop watching. */
  watch(onChange: () => void): () => void;
}

/** Activity events that `dev` replays on connect. */
const PREVIOUS_EVENTS = 50;

/** The `actividad` branch of the `/events` events. */
export type DevActivityEvent = Extract<DevEvent, { name: 'actividad' }>;

export interface LiveActivityLogOptions {
  /** Without it there is no activity: it connects without events and never pushes. */
  log?: ActivityLog;
  clock: Clock;
  /** Wait in ms after the last notice before reading. */
  debounceMs: number;
}

export interface LiveActivityLog {
  /** What a client receives on connect. */
  connection(): DevActivityEvent;
  /** One batch per debounce, only if it carries events. Returns how to stop listening. */
  listen(onEvent: (event: DevActivityEvent) => void): () => void;
  /** Stops watching and cancels the pending debounce. */
  close(): void;
}

export function openLiveActivityLog({ log, clock, debounceMs }: LiveActivityLogOptions): LiveActivityLog {
  const readActivity = createActivityReader();
  const read = (): ActivityEvent[] => {
    try {
      return readActivity(log?.read());
    } catch {
      return []; // the next notice retries
    }
  };
  let recent = read().slice(-PREVIOUS_EVENTS);
  const listeners = new Set<(event: DevActivityEvent) => void>();
  const readDebounce = debounce(clock, debounceMs);
  const stopWatching =
    log?.watch(() =>
      readDebounce.schedule(() => {
        const fresh = read();
        if (fresh.length === 0) return;
        recent = [...recent, ...fresh].slice(-PREVIOUS_EVENTS);
        const event: DevActivityEvent = { name: 'actividad', data: { previos: false, eventos: fresh } };
        for (const listener of [...listeners]) listener(event);
      }),
    ) ?? (() => undefined);

  return {
    connection: () => ({ name: 'actividad', data: { previos: true, eventos: [...recent] } }),
    listen(onEvent) {
      listeners.add(onEvent);
      return () => void listeners.delete(onEvent);
    },
    close() {
      readDebounce.cancel();
      stopWatching();
    },
  };
}
