/**
 * The only browser piece that knows the routes of the `dev` server. No method throws: failures are data.
 * Everything it receives is validated with the protocol schemas: a malformed 2xx is a failure, a rejection outside the
 * protocol gives the status and the route, and the Components bundle requires a JavaScript content-type.
 * A Geometry that does not arrive within `geometryDeadlineMs` is a failure: the page computes it in the Worker.
 * SSE: a single connection to `/events` shared by all listeners (`listen`), opened with the first one and closed
 * with the last one; data that is not JSON is discarded. The `estado` event is validated like `GET /api/state`: a
 * malformed one does not reach `subscribe` and is reported to `onMalformed`.
 */
import { cachedGeometrySchema, inspectOutputSchema } from 'canonical';
import type { CachedGeometry, Intent, RejectionReason, InspectOutput } from 'canonical';

import {
  devFileSchema,
  devFilesSchema,
  devCodeSchema,
  devTrustSchema,
  devErrorSchema,
  devWriteSchema,
  devStateSchema,
  inspectNotFoundSchema,
  devRejectionSchema,
  fileRoute,
  DEV_ROUTES,
  inspectRoute,
} from '../src/protocol';
import type { DevFile, DevFiles, DevCode, InspectCommand, DevState, DevEventName, EditsRequest } from '../src/protocol';

/**
 * `stale` is the 409 (`stale-hash`; `writing/writing.ts` resolves it). `version` (if `dev` gives it) is that of the
 * state after the write; `reason` and `file`, those of the rejection.
 */
export type SendResult = { ok: true; version?: number } | { ok: false; stale: boolean; message: string; reason?: RejectionReason; file?: string };

/** `error` only if it arrived malformed. */
export type GeometryRead = { ok: true; geometry: CachedGeometry } | { ok: false; error?: string };

export interface ClientDependencies {
  fetch: typeof fetch;
  /** SSE subscription to `url` that delivers each event with its name (an `EventSource` in the browser); returns how to close it. */
  events: (url: string, onEvent: (name: string, data: string) => void) => () => void;
  /** Maximum wait in ms for a Geometry before considering it not arrived. */
  geometryDeadlineMs?: number;
}

/** What the client needs from a zod schema. */
interface Schema<T> {
  safeParse(x: unknown): { success: true; data: T } | { success: false; error: { issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }> } };
}

/** First problem of a schema, readable. */
function reason(error: { issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }> }): string {
  const first = error.issues[0];
  return `${first?.path.map(String).join('.') ?? ''} ${first?.message ?? ''}`.trim();
}

/** Past this deadline, the Worker computes it sooner than it would take to arrive. */
const GEOMETRY_DEADLINE_MS = 4000;

/** `ok: false` carries the `inspect` message and the nearby ids (empty if the failure is not "does not exist"). */
export type InspectRead = { ok: true; output: InspectOutput } | { ok: false; message: string; suggestions: string[] };

/** A read that can fail with a visible reason (network, HTTP status or malformed response). */
export type Read<T> = { ok: true; value: T } | { ok: false; message: string };

export interface DevClient {
  /** The current state; `undefined` if it does not arrive or arrives broken. */
  state(): Promise<DevState | undefined>;
  /**
   * Receives the current one on connect and one per recompilation, already validated; a malformed one is discarded and
   * goes to `onMalformed` with the reason. Returns the unsubscribe.
   */
  subscribe(onState: (state: DevState) => void, onMalformed?: (message: string) => void): () => void;
  /** Listens to an SSE event by name with its data already parsed (not validated); returns the unsubscribe. */
  listen(name: DevEventName, onData: (data: unknown) => void): () => void;
  /** `GET /api/inspect/<command>/<argument>`; `options` go in the query (those of `theme`). */
  inspect(command: InspectCommand, argument: string, options?: Readonly<Record<string, string>>): Promise<InspectRead>;
  /** `version` is that of the state the page saw; the server translates it to `visto`. */
  edit(intent: Intent, version: number): Promise<SendResult>;
  /** Text edits (`POST /api/edit { ediciones, version, descripcion?, aunqueNoCompile? }`): editor, `fix` and "Apply N fixes". */
  editText(request: EditsRequest): Promise<SendResult>;
  /** `GET /api/files`. */
  files(): Promise<Read<DevFiles>>;
  /** `GET /api/file/<path>`; `undefined` if it does not exist or fails. */
  file(file: string): Promise<DevFile | undefined>;
  undo(): Promise<SendResult>;
  redo(): Promise<SendResult>;
  /** `POST /api/history/jump { id }` (0: Start). */
  jump(id: number): Promise<SendResult>;
  /** `GET /api/code`: whether the Themes use Components with code, which ones and whether they are already trusted. */
  code(): Promise<Read<DevCode>>;
  /** `POST /api/trust`: from here on `dev` serves the Components bundle. */
  trust(): Promise<SendResult>;
  /** `GET /components.js`: the CommonJS bundle of the Theme Components (403 until trusted). */
  componentsBundle(): Promise<Read<string>>;
  /** With `theme`, the View drawn with that Theme (`?theme=`, no cache on the server): preview without writing. */
  geometry(view: string, options?: { theme?: string }): Promise<GeometryRead>;
}

export function createDevClient({ fetch: fetchFn, events, geometryDeadlineMs: geometryDeadlineMs = GEOMETRY_DEADLINE_MS }: ClientDependencies): DevClient {
  /** The body of a 2xx against its schema; malformed is a failure with the first problem. */
  const validate = <T>(route: string, schema: Schema<T>, body: unknown): Read<T> => {
    const parsed = schema.safeParse(body);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, message: `Malformed response from ${route} (${reason(parsed.error)})` };
  };

  /** Message of a non-2xx: the protocol's if the body follows it; otherwise the status and the route. */
  const errorMessage = (status: number, route: string, body: unknown): string => {
    const parsed = devErrorSchema.safeParse(body);
    return parsed.success ? parsed.data.message : `Error ${status} at ${route}`;
  };

  /** Validated JSON `GET`; network, HTTP status or shape give a failure with a reason. */
  const read = async <T>(route: string, schema: Schema<T>): Promise<Read<T>> => {
    try {
      const res = await fetchFn(route);
      const body: unknown = await res.json().catch(() => undefined);
      return res.ok ? validate(route, schema, body) : { ok: false, message: errorMessage(res.status, route, body) };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  };

  const unwrap = <T>(reading: Read<T>): T | undefined => (reading.ok ? reading.value : undefined);

  /** JSON `POST`: the 2xx against `accepted` and the rejection against `devRejectionSchema`. */
  const post = async (route: string, body: unknown, accepted: Schema<{ ok: true; version?: number }> = devWriteSchema): Promise<SendResult> => {
    try {
      const res = await fetchFn(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const parsed: unknown = await res.json().catch(() => undefined);
      if (res.ok) {
        const r = validate(route, accepted, parsed);
        if (!r.ok) return { ok: false, stale: false, message: r.message };
        return r.value.version === undefined ? { ok: true } : { ok: true, version: r.value.version };
      }
      const stale = res.status === 409;
      const rejection = devRejectionSchema.safeParse(parsed);
      if (!rejection.success) return { ok: false, stale, message: `Error ${res.status} at ${route}` };
      const { message, reason: because, file } = rejection.data;
      return { ok: false, stale, message, ...(because !== undefined && { reason: because }), ...(file !== undefined && { file }) };
    } catch (error) {
      return { ok: false, stale: false, message: (error as Error).message };
    }
  };

  const listeners = new Map<string, Set<(data: unknown) => void>>();
  let closeConnection: (() => void) | undefined;
  const onEvent = (name: string, data: string): void => {
    const ofName = listeners.get(name);
    if (ofName === undefined || ofName.size === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    for (const listener of [...ofName]) listener(parsed);
  };
  const listen = (name: DevEventName, onData: (data: unknown) => void): (() => void) => {
    const ofName = listeners.get(name) ?? new Set();
    listeners.set(name, ofName);
    ofName.add(onData);
    closeConnection ??= events(DEV_ROUTES.events, onEvent);
    return () => {
      ofName.delete(onData);
      if ([...listeners.values()].every((o) => o.size === 0)) {
        closeConnection?.();
        closeConnection = undefined;
      }
    };
  };

  return {
    listen: listen,
    async inspect(command, argument, options = {}) {
      const route = inspectRoute(command, argument, options);
      try {
        const res = await fetchFn(route);
        const body: unknown = await res.json().catch(() => undefined);
        if (res.ok) {
          const read = validate(route, inspectOutputSchema, body);
          return read.ok ? { ok: true, output: read.value } : { ok: false, message: read.message, suggestions: [] };
        }
        const rejection = inspectNotFoundSchema.safeParse(body);
        return rejection.success ? { ok: false, message: rejection.data.message, suggestions: rejection.data.suggestions } : { ok: false, message: `Error ${res.status}`, suggestions: [] };
      } catch (error) {
        return { ok: false, message: (error as Error).message, suggestions: [] };
      }
    },
    state: async () => unwrap(await read(DEV_ROUTES.state, devStateSchema)),
    subscribe: (onState, onMalformed) =>
      listen('estado', (data) => {
        const parsed = devStateSchema.safeParse(data);
        if (parsed.success) onState(parsed.data);
        else onMalformed?.(`Malformed state event (${reason(parsed.error)})`);
      }),
    code: () => read(DEV_ROUTES.code, devCodeSchema),
    trust: () => post(DEV_ROUTES.trust, {}, devTrustSchema),
    async componentsBundle() {
      const route = DEV_ROUTES.components;
      try {
        const res = await fetchFn(route);
        if (!res.ok) return { ok: false, message: errorMessage(res.status, route, await res.json().catch(() => undefined)) };
        const kind = res.headers.get('content-type') ?? '';
        return /javascript/i.test(kind) ? { ok: true, value: await res.text() } : { ok: false, message: `Malformed response from ${route} (content-type '${kind}', expected JavaScript)` };
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }
    },
    edit: (intent, version) => post(DEV_ROUTES.edit, { ...intent, version }),
    editText: (request) => post(DEV_ROUTES.edit, request),
    files: () => read(DEV_ROUTES.files, devFilesSchema),
    file: async (file) => unwrap(await read(fileRoute(file), devFileSchema)),
    undo: () => post(DEV_ROUTES.undo, {}),
    redo: () => post(DEV_ROUTES.redo, {}),
    jump: (id) => post(DEV_ROUTES.jump, { id }),
    async geometry(view, { theme } = {}) {
      const NEVER_ARRIVED = Symbol('no-llego');
      const abort = new AbortController();
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<typeof NEVER_ARRIVED>((resolve) => {
        deadline = setTimeout(() => {
          abort.abort();
          resolve(NEVER_ARRIVED);
        }, geometryDeadlineMs);
      });
      const requested = (async (): Promise<unknown> => {
        const res = await fetchFn(`${DEV_ROUTES.view}${encodeURIComponent(view)}${theme === undefined ? '' : `?theme=${encodeURIComponent(theme)}`}`, { signal: abort.signal });
        return res.ok ? await res.json() : NEVER_ARRIVED;
      })().catch(() => NEVER_ARRIVED);
      const raw = await Promise.race([requested, expired]);
      clearTimeout(deadline);
      if (raw === NEVER_ARRIVED) return { ok: false };
      const read = cachedGeometrySchema.safeParse(raw);
      if (read.success) return { ok: true, geometry: read.data };
      return { ok: false, error: `Malformed geometry in View ${view}: ${reason(read.error)}`.trim() };
    },
  };
}
