/**
 * `inMemoryDev`: the `dev` server without network, to test the page in jsdom. It is the real Live workspace of `session`
 * (Session, issues, edits with `visto`, Undo history, Diff with origin by hash, Activity log) over `inMemoryPort`, with
 * the routes of `handleDevApi`, the same ones `dev` serves; only the transport is fake: `fetch` calls the API and
 * `events` serializes the connection snapshot and the Live workspace event stream as `/events`.
 * Invariants: it passes `testDevContract` (the same suite runs against the real `dev`); a write (own or `editOutside`)
 * recompiles and pushes a state with a higher `version`; old versions are forgotten as in `dev`.
 * No watcher nor debounce: `editOutside` recompiles at once and the Activity log notifies without waiting.
 * Errors: it never throws for a request; it answers the HTTP status `dev` would.
 */
import { DEV_ROUTES } from 'canonical';
import { openLiveWorkspace, fetchOverDevApi, inMemoryPort } from 'session';
import type { Clock, InMemoryWorkspace } from 'session';

export interface InMemoryDev {
  fetch: typeof fetch;
  events: (url: string, onEvent: (name: string, data: string) => void) => () => void;
  /** Foreign write (agent or another editor); `undefined` deletes. Recompiles and pushes the state. */
  editOutside(route: string, text: string | undefined): void;
  /** Foreign write to a `--theme-path` file; `undefined` deletes it. Recompiles and pushes the state. */
  editThemeOutside(route: string, text: string | undefined): void;
  /** Appends text to the Activity log (like the CLI of another process) and pushes the new Events as `actividad`. */
  appendActivity(text: string): void;
  /** Waits for the writes (POST, `editOutside`) and their recompilations to finish. */
  settled(): Promise<void>;
  /** The in-memory Workspace, to read what was written. */
  workspace: InMemoryWorkspace;
  close(): Promise<void>;
}

/** Themes with code already compiled: `components`, the exported names; `bundle`, the CommonJS body `(require) => exports` that `cli` compiles. */
export interface TestCode {
  components: readonly string[];
  bundle: string;
}

/**
 * What a test `dev` needs (the in-memory or the real one): the content of `inMemoryPort` (`own`, `themes` of
 * `--theme-path`, initial `activity` and `brokenWrite`, every write throws with that message) and `code`, Themes with
 * code already compiled (what the adapter's `.tsx` compiler would give; without it, there is no code).
 */
export type TestDevContent = Pick<Parameters<typeof inMemoryPort>[0], 'own' | 'themes' | 'activity' | 'brokenWrite'> & { code?: TestCode };

const ROOT = '/memoria';

/** No debounce: the log notice is handled at once. */
const relojInmediato: Clock = {
  schedule(fn) {
    fn();
    return () => undefined;
  },
};

/** `now`: time in ms of each File history entry; `code` is served at `/components.js` after `POST /api/trust`. */
export async function inMemoryDev({ code, now: now = Date.now, ...content }: TestDevContent & { now?: () => number }): Promise<InMemoryDev> {
  const port = inMemoryPort(content);
  // No watcher: own writes recompile when they finish and `editOutside` asks for the recompilation.
  const live = await openLiveWorkspace({
    port: { ...port, watch: () => () => undefined },
    root: ROOT,
    clock: relojInmediato,
    now: now,
    ...(code !== undefined && { compileCode: () => ({ components: Object.fromEntries(code.components.map((name) => [name, {}])), issues: [], bundle: code.bundle }) }),
  });

  const listeners = new Set<(name: string, data: string) => void>();
  const stopListening = live.listen(({ name, data }) => {
    const text = JSON.stringify(data);
    for (const listener of [...listeners]) listener(name, text);
  });

  let inProgress: Promise<unknown> = Promise.resolve();
  const follow = <T>(p: Promise<T>): Promise<T> => {
    inProgress = Promise.all([inProgress, p.catch(() => undefined)]);
    return p;
  };

  const attend = fetchOverDevApi(live, 'http://memoria');

  return {
    fetch: ((entry: string | URL | Request, init?: RequestInit) => {
      const p = attend(entry, init);
      // Only the writes: a read (Geometry) may wait on the test's fake timers.
      return init?.method === 'POST' ? follow(p) : p;
    }) as typeof fetch,
    events(url, onEvent) {
      if (url !== DEV_ROUTES.events) return () => undefined;
      listeners.add(onEvent);
      queueMicrotask(() => {
        if (!listeners.has(onEvent)) return;
        for (const { name, data } of live.connection()) onEvent(name, JSON.stringify(data));
      });
      return () => listeners.delete(onEvent);
    },
    editOutside(route, text) {
      port.editOutside(route, text);
      void follow(live.reload());
    },
    editThemeOutside(route, text) {
      port.editThemeOutside(route, text);
      void follow(live.reload());
    },
    appendActivity: (text) => port.appendActivity(text),
    settled: async () => {
      let seen: Promise<unknown> | undefined;
      while (seen !== inProgress) {
        seen = inProgress;
        await seen;
      }
    },
    workspace: port,
    async close() {
      listeners.clear();
      stopListening();
      await inProgress;
      live.close();
    },
  };
}
