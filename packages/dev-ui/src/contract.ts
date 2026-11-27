/**
 * `dev-ui/contract` (tests only): `testDevContract(create)` is the suite that runs the same against `inMemoryDev`
 * (here) and against the real `dev` with `inMemoryPort` (in `cli`), so the fake does not lie. It also exports
 * `inMemoryDev`, `eventsOverFetch` (SSE transport over `fetch`, for Node) and the factory of test Activity events
 * (`activityEvent`, `activityLines`).
 * Invariants: inputs are Text DSL; routes are requested relative (`/api/state`); it does not enter the browser bundle.
 * Depends on `vitest` (optional peerDependency), `session` and `canonical`.
 */
import { describe, expect, it } from 'vitest';

import type { ActivityEvent } from 'canonical';

import { devCodeSchema, devTrustSchema, devErrorSchema, devWriteSchema, devRejectionSchema } from './protocol';
import type { DevActivity, DevDiff, DevState, DevHistory } from './protocol';
import type { TestDevContent } from './in-memory-dev';
import { createSseReader } from './sse';

export { inMemoryDev } from './in-memory-dev';
export type { TestCode, TestDevContent, InMemoryDev } from './in-memory-dev';
export { createSseReader } from './sse';

/** Relative path -> text, like `WorkspaceFiles` of `dsl`. */
type WorkspaceFiles = Readonly<Record<string, string>>;

/** A `dev` started for a test: what the page sees of it (transport) plus an outside write. */
export interface TestDev {
  /** Accepts routes relative to the server root. */
  fetch: typeof fetch;
  /** Same contract as the page's `ClientDependencies.events`. */
  events: (url: string, onEvent: (name: string, data: string) => void) => () => void;
  /** A write outside `dev` (an agent or another editor); `undefined` deletes. */
  editOutside(route: string, text: string | undefined): void;
  /** Appends text to `.diagrams/activity.jsonl`, like the CLI of another process. */
  appendActivity(text: string): void;
  close(): Promise<void>;
}

/** Opens a test `dev` with that content (`TestDevContent`, the same shape as `inMemoryDev`). */
export type CreateDev = (content: TestDevContent) => Promise<TestDev>;

/** `events` over a `fetch` that streams the body (Node 18+); the page uses `EventSource`. */
export function eventsOverFetch(fetchFn: typeof fetch): TestDev['events'] {
  return (url, onEvent) => {
    const abort = new AbortController();
    const read = createSseReader(onEvent);
    void (async () => {
      const res = await fetchFn(url, { signal: abort.signal });
      const reader = res.body?.getReader();
      if (reader === undefined) return;
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        read(decoder.decode(value, { stream: true }));
      }
    })().catch(() => undefined);
    return () => abort.abort();
  };
}

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db "lee"
}

view general {
  type architecture
  include **
}

view datos {
  type architecture
  include db
}

theme claro extends neutral {
  palette { acento "#0ea5e9" }
}
`;

/** A Theme with a `code` Layer that uses the `Aurora` Component. */
export const WITH_CODE = `specification {
  node servicio
}

model {
  servicio api "API"
}

theme neon {
  node {
    layer forma rect { radius 8 }
    layer aura code over { component Aurora }
    slots { title }
  }
}

view general {
  type architecture
  include **
  theme neon
}
`;

/** A CommonJS bundle like the one `cli` compiles: `Aurora` draws `<i data-aurora={id}>`. */
export const TEST_BUNDLE = `var j = require('react/jsx-runtime');
return { Aurora: function (p) { return j.jsx('i', { 'data-aurora': p.id }); } };`;

const WITH_ERROR = DSL.replace('include db', 'include db\n  nada-de-esto');

interface Body {
  ok?: boolean;
  [key: string]: unknown;
}

/** Waits for the first `estado` event that satisfies `enough`. */
function waitForState(dev: TestDev, enough: (e: DevState) => boolean, onOpen?: () => void): Promise<DevState> {
  return new Promise((ok) => {
    let opened = false;
    const close = dev.events('/events', (name, data) => {
      if (name !== 'estado') return;
      const state = JSON.parse(data) as DevState;
      if (!opened) {
        opened = true;
        onOpen?.();
      }
      if (enough(state)) {
        setTimeout(close, 0);
        ok(state);
      }
    });
  });
}

/** Collects the `event: actividad` arriving through `/events` until `enough` accepts them. */
function waitForActivity(dev: TestDev, enough: (received: DevActivity[]) => boolean, onOpen?: () => void): Promise<DevActivity[]> {
  return new Promise((ok) => {
    const received: DevActivity[] = [];
    let opened = false;
    const close = dev.events('/events', (name, data) => {
      if (name === 'estado' && !opened) {
        opened = true;
        onOpen?.();
      }
      if (name !== 'actividad') return;
      received.push(JSON.parse(data) as DevActivity);
      if (enough(received)) {
        setTimeout(close, 0);
        ok(received);
      }
    });
  });
}

/** Collects every `/events` event (name and parsed data) until `enough` accepts them. */
function waitForEvents(dev: TestDev, enough: (received: [string, unknown][]) => boolean, onOpen: () => void): Promise<[string, unknown][]> {
  return new Promise((ok) => {
    const received: [string, unknown][] = [];
    let opened = false;
    const close = dev.events('/events', (name, data) => {
      received.push([name, JSON.parse(data)]);
      if (name === 'estado' && !opened) {
        opened = true;
        onOpen();
      }
      if (enough(received)) {
        setTimeout(close, 0);
        ok(received);
      }
    });
  });
}

/** Waits for the first `event: historial` that satisfies `enough`. */
function waitForHistory(dev: TestDev, enough: (h: DevHistory) => boolean, onOpen?: () => void): Promise<DevHistory> {
  return new Promise((ok) => {
    let opened = false;
    const close = dev.events('/events', (name, data) => {
      if (name !== 'historial') return;
      const history = JSON.parse(data) as DevHistory;
      if (!opened) {
        opened = true;
        onOpen?.();
      }
      if (enough(history)) {
        setTimeout(close, 0);
        ok(history);
      }
    });
  });
}

/** Test Activity event (a successful `edit` of process `pid`); `extra` overrides any field. */
export const activityEvent = (pid: number, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({
  contractVersion: 2,
  ts: '2026-11-19T10:00:00.000Z',
  pid,
  command: 'edit',
  args: ['--workspace', '.', '--intent', '{}'],
  exitCode: 0,
  durationMs: 4,
  ...extra,
});

/** The `.diagrams/activity.jsonl` lines with those Events. */
export const activityLines = (...events: ActivityEvent[]): string => events.map((e) => `${JSON.stringify(e)}\n`).join('');

export function testDevContract(create: CreateDev): void {
  const withDev = async <T>(own: WorkspaceFiles, test: (dev: TestDev) => Promise<T>, extra: Omit<TestDevContent, 'own'> = {}): Promise<T> => {
    const dev = await create({ own, ...extra });
    try {
      return await test(dev);
    } finally {
      await dev.close();
    }
  };
  const json = async (dev: TestDev, route: string, init?: RequestInit): Promise<{ status: number; body: Body }> => {
    const res = await dev.fetch(route, init);
    return { status: res.status, body: (await res.json()) as Body };
  };
  /** `POST` with a raw body and JSON content-type (the edge cases send bodies that are not JSON). */
  const send = (dev: TestDev, route: string, body: string): Promise<Response> => dev.fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const post = async (dev: TestDev, route: string, body: unknown): Promise<{ status: number; body: Body }> => {
    const res = await send(dev, route, JSON.stringify(body));
    return { status: res.status, body: (await res.json()) as Body };
  };

  describe('dev protocol contract', () => {
    it('GET /api/state: version, Views in declaration order and no issues', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const { status, body } = await json(dev, '/api/state');
        expect(status).toBe(200);
        expect(body).toMatchObject({ vistas: ['general', 'datos'], issues: [] });
        expect(typeof body['version']).toBe('number');
      });
    });

    it('a Workspace with errors from the start gives issues with a link and no Source', async () => {
      await withDev({ 'main.dg': WITH_ERROR }, async (dev) => {
        const { body } = await json(dev, '/api/state');
        expect(body['fuente']).toBeUndefined();
        const issues = body['issues'] as Array<{ severity: string; file: string; href: string }>;
        expect(issues.some((i) => i.severity === 'error' && i.file === 'main.dg' && i.href.length > 0)).toBe(true);
      });
    });

    it('/events: on connect state, history and activity with previous entries; after each state its history and then its diff', async () => {
      await withDev(
        { 'main.dg': DSL },
        async (dev) => {
          const received = await new Promise<[string, unknown][]>((ok) => {
            const list: [string, unknown][] = [];
            const close = dev.events('/events', (name, data) => {
              list.push([name, JSON.parse(data)]);
              if (list.length === 3) dev.editOutside('main.dg', DSL.replace('"API"', '"API nueva"'));
              if (name !== 'diferencia') return;
              if ((JSON.parse(data) as DevDiff).origen === 'externo') void post(dev, '/api/edit', { type: 'move-pin', view: 'general', node: 'api', x: 1, y: 2 });
              else {
                setTimeout(close, 0);
                ok(list);
              }
            });
          });
          const names = received.map(([name]) => name);
          expect(names.slice(0, 3)).toEqual(['estado', 'historial', 'actividad']);
          expect(received[2]?.[1]).toEqual({ previos: true, eventos: [activityEvent(1)] });
          const rest = names.slice(3);
          // A watcher echo can add a state without a Diff: what matters is the order within each batch.
          rest.forEach((name, i) => {
            if (name === 'estado') expect(rest[i + 1]).toBe('historial');
            if (name === 'historial') expect(rest[i - 1]).toBe('estado');
            if (name === 'diferencia') {
              expect(rest[i - 1]).toBe('historial');
              expect((received[i + 3 - 2]?.[1] as DevState).version).toBe((received[i + 3]?.[1] as DevDiff).version);
            }
          });
          expect(rest.filter((n) => n === 'diferencia')).toHaveLength(2);
        },
        { activity: activityLines(activityEvent(1)) },
      );
    });

    it('/events sends event: estado on connect and another, with a higher version, after an external write', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const initial = (await json(dev, '/api/state')).body['version'] as number;
        const fresh = await waitForState(
          dev,
          (e) => e.version > initial,
          () => dev.editOutside('main.dg', DSL.replace('"API"', '"API nueva"')),
        );
        expect(fresh.fuente?.model.nodes.find((n) => n.id === 'api')?.title).toBe('API nueva');
      });
    });

    it('/events replays on connect the last 50 Activity events (previous) without the broken lines', async () => {
      const registry = Array.from({ length: 55 }, (_, i) => activityLines(activityEvent(i))).join('') + '{roto\n';
      await withDev(
        { 'main.dg': DSL },
        async (dev) => {
          const [previous] = await waitForActivity(dev, (r) => r.length > 0);
          expect(previous?.previos).toBe(true);
          expect(previous?.eventos.map((e) => e.pid)).toEqual(Array.from({ length: 50 }, (_, i) => i + 5));
        },
        { activity: registry },
      );
    });

    it('an Event appended to the log arrives as a live event: actividad', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const fresh = activityEvent(7, { agent: 'claude', target: { view: 'datos' } });
        const received = await waitForActivity(
          dev,
          (r) => r.some((a) => !a.previos),
          () => dev.appendActivity(`no es json\n${activityLines(fresh)}`),
        );
        expect(received.filter((a) => !a.previos)).toEqual([{ previos: false, eventos: [fresh] }]);
      });
    });

    it('an external write arrives as an external event: diferencia, after the state of the same version', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const received = await waitForEvents(
          dev,
          (r) => r.some(([name]) => name === 'diferencia'),
          () => dev.editOutside('main.dg', DSL.replace('servicio db "Base de datos"', 'servicio db "Datos"\n  servicio cola "Cola"')),
        );
        const diff = received.find(([name]) => name === 'diferencia')?.[1] as DevDiff;
        expect(diff).toMatchObject({ origen: 'externo', agregados: [{ kind: 'node', id: 'cola' }], quitados: [], cambiados: [{ elemento: { kind: 'node', id: 'db' }, propiedades: [{ nombre: 'title', clase: 'texto' }] }] });
        const states = received.filter(([name]) => name === 'estado').map(([, data]) => (data as DevState).version);
        expect(states[states.length - 1]).toBe(diff.version);
      });
    });

    it('an Intent through POST /api/edit gives an own event: diferencia', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const received = await waitForEvents(
          dev,
          (r) => r.some(([name]) => name === 'diferencia'),
          () => void post(dev, '/api/edit', { type: 'set-theme', view: 'datos', theme: 'claro' }),
        );
        expect(received.find(([name]) => name === 'diferencia')?.[1]).toMatchObject({ origen: 'propio', cambiados: [{ elemento: { kind: 'view', id: 'datos' }, propiedades: [{ nombre: 'theme', clase: 'estructura' }] }] });
      });
    });

    it('GET /api/view/<id> gives the Geometry of the View; a missing View is 404', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const { status, body } = await json(dev, '/api/view/datos');
        expect(status).toBe(200);
        expect(body['view']).toBe('datos');
        expect(Object.keys((body['geometry'] as { nodes: object }).nodes)).toEqual(['db']);
        expect((await dev.fetch('/api/view/nada')).status).toBe(404);
      });
    });

    it('GET /api/inspect/<command>/<argument> gives the same as inspect --json; if missing, 404 with the nearby ids', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const node = await json(dev, '/api/inspect/node/api');
        expect(node.status).toBe(200);
        expect(node.body).toMatchObject({ command: 'node', node: { id: 'api', type: 'servicio', title: 'API', file: 'main.dg', line: 6 }, edges: [{ from: 'api', to: 'db', label: 'lee', direction: 'out' }], views: [{ id: 'general' }] });
        const search = await json(dev, '/api/inspect/search/dat');
        expect((search.body['results'] as Array<{ kind: string; id: string }>).map((r) => `${r.kind}:${r.id}`)).toEqual(['view:datos', 'node:db']);
        const view = await json(dev, '/api/inspect/view/datos');
        expect(view.body).toMatchObject({ command: 'view', view: { id: 'datos', nodes: [{ id: 'db' }] } });

        const absent = await json(dev, '/api/inspect/node/apj');
        expect(absent).toEqual({ status: 404, body: { ok: false, message: "No such Node 'apj'. Did you mean: api", suggestions: ['api'] } });
        expect((await dev.fetch('/api/inspect/nada/x')).status).toBe(404);
      });
    });

    it('GET /api/view/<id>?theme=<name> gives the Geometry with another Theme without caching it; 404 if the View or the Theme is missing', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        expect(await json(dev, '/api/view/datos?theme=claro')).toMatchObject({ status: 200, body: { view: 'datos', theme: 'claro' } });
        expect(await json(dev, '/api/view/datos')).toMatchObject({ status: 200, body: { view: 'datos', theme: 'neutral' } });
        expect((await dev.fetch('/api/view/datos?theme=nada')).status).toBe(404);
        expect((await dev.fetch('/api/view/nada?theme=claro')).status).toBe(404);
      });
    });

    it('GET /api/inspect/theme/<name> gives the extends chain and the Layers; a missing Theme is 404 with the nearby ones', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const { status, body } = await json(dev, '/api/inspect/theme/claro');
        expect(status).toBe(200);
        expect(body).toMatchObject({ command: 'theme', theme: { name: 'claro', file: 'main.dg', extends: ['neutral'] } });
        expect(await json(dev, '/api/inspect/theme/clara')).toEqual({ status: 404, body: { ok: false, message: "No such Theme 'clara'. Did you mean: claro", suggestions: ['claro'] } });
      });
    });

    it('POST /api/edit with set-theme writes theme in the View; without theme it removes it; an undeclared Theme is 422 unknown-theme', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const themeOf = async (view: string) => ((await json(dev, '/api/state')).body['fuente'] as DevState['fuente'])?.views.find((v) => v.id === view)?.theme;
        expect(await post(dev, '/api/edit', { type: 'set-theme', view: 'datos', theme: 'claro' })).toMatchObject({ status: 200, body: { ok: true } });
        expect(await themeOf('datos')).toBe('claro');
        expect(await post(dev, '/api/edit', { type: 'set-theme', view: 'datos' })).toMatchObject({ status: 200, body: { ok: true } });
        expect(await themeOf('datos')).toBeUndefined();
        expect(await post(dev, '/api/edit', { type: 'set-theme', view: 'datos', theme: 'clara' })).toMatchObject({ status: 422, body: { ok: false, reason: 'unknown-theme' } });
      });
    });

    it('POST /api/edit applies an Intent with the seen version; undo and redo remove and restore it', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const version = (await json(dev, '/api/state')).body['version'] as number;
        const overrides = async () => ((await json(dev, '/api/state')).body['fuente'] as DevState['fuente'])?.views[0]?.overrides ?? [];

        const edited = await post(dev, '/api/edit', { type: 'move-pin', view: 'general', node: 'api', x: 40, y: 80, version });
        expect(edited).toMatchObject({ status: 200, body: { ok: true } });
        expect(await overrides()).toMatchObject([{ node: 'api', pin: { x: 40, y: 80 } }]);

        expect(await post(dev, '/api/undo', {})).toMatchObject({ status: 200, body: { ok: true } });
        expect(await overrides()).toEqual([]);
        expect(await post(dev, '/api/redo', {})).toMatchObject({ status: 200, body: { ok: true } });
        expect(await overrides()).toMatchObject([{ node: 'api' }]);
      });
    });

    it('POST /api/edit rejections: stale version 409, unknown View 422, body that is not an Intent 400', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        expect(await post(dev, '/api/edit', { type: 'move-pin', view: 'general', node: 'api', x: 1, y: 1, version: 9999 })).toMatchObject({ status: 409, body: { ok: false, reason: 'stale-hash' } });
        expect(await post(dev, '/api/edit', { type: 'move-pin', view: 'nada', node: 'api', x: 1, y: 1 })).toMatchObject({ status: 422, body: { ok: false, reason: 'unknown-view' } });
        expect((await post(dev, '/api/edit', { tipo: 'otra-cosa' })).status).toBe(400);
        expect(await post(dev, '/api/undo', {})).toMatchObject({ status: 422, body: { ok: false, reason: 'nothing-to-undo' } });
      });
    });

    it('/events sends event: historial on connect and after each entry, with id, server description, files, time and reachability', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const initial = await waitForHistory(dev, () => true);
        expect(initial).toEqual({ pasado: [], futuro: [], inicio: { alcanzable: true } });
        const withOne = await waitForHistory(
          dev,
          (h) => h.pasado.length === 1,
          () => void post(dev, '/api/edit', { type: 'move-pin', view: 'general', node: 'api', x: 1, y: 2 }),
        );
        expect(withOne.pasado).toEqual([{ id: 1, descripcion: 'move api in general', archivos: ['main.dg'], cuando: expect.any(Number), alcanzable: true }]);
      });
    });

    it('POST /api/history/jump goes to the entry without pushing and keeps the future; unknown id 422; file changed outside 409', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        await post(dev, '/api/edit', { type: 'move-pin', view: 'general', node: 'api', x: 1, y: 2 });
        await post(dev, '/api/edit', { type: 'move-pin', view: 'general', node: 'api', x: 3, y: 4 });
        const withTwo = (await json(dev, '/api/file/main.dg')).body['texto'];

        const atStart = await post(dev, '/api/history/jump', { id: 0 });
        expect(atStart.status).toBe(200);
        expect(devWriteSchema.parse(atStart.body)).toMatchObject({ ok: true });
        expect((await json(dev, '/api/file/main.dg')).body['texto']).toBe(DSL);
        expect(await post(dev, '/api/history/jump', { id: 2 })).toMatchObject({ status: 200, body: { ok: true } });
        expect((await json(dev, '/api/file/main.dg')).body['texto']).toBe(withTwo);
        expect(await post(dev, '/api/history/jump', { id: 99 })).toMatchObject({ status: 422, body: { ok: false, reason: 'unknown-entry' } });
        expect((await post(dev, '/api/history/jump', { id: 'uno' })).status).toBe(400);

        await waitForState(dev, (e) => e.fuente?.model.nodes.some((n) => n.title === 'Otra') === true, () => dev.editOutside('main.dg', String(withTwo).replace('"API"', '"Otra"')));
        const stale = await post(dev, '/api/history/jump', { id: 1 });
        expect(stale.status).toBe(409);
        expect(devRejectionSchema.parse(stale.body)).toMatchObject({ ok: false, reason: 'stale-hash' });
      });
    });

    it('/api/* edges: unknown route 404, wrong method 405 with allow, invalid JSON 400; all with { ok: false, message }', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const error = async (res: Response) => ({ status: res.status, allow: res.headers.get('allow'), body: devErrorSchema.parse(await res.json()) });

        expect(await error(await dev.fetch('/api/nada'))).toMatchObject({ status: 404 });
        expect(await error(await send(dev, '/api/nada', '{}'))).toMatchObject({ status: 404 });
        // The Spanish routes were removed without compatibility.
        for (const route of ['/api/estado', '/api/archivos', '/api/archivo/main.dg', '/api/codigo', '/api/vista/datos', '/fuentes/x.woff2']) expect((await dev.fetch(route)).status).toBe(404);
        for (const route of ['/api/deshacer', '/api/rehacer', '/api/historial/saltar', '/api/confiar']) expect((await send(dev, route, '{}')).status).toBe(404);
        expect((await dev.fetch('/componentes.js')).status).toBe(404);
        for (const route of ['/api/edit', '/api/undo', '/api/redo', '/api/history/jump', '/api/trust']) {
          expect(await error(await dev.fetch(route))).toMatchObject({ status: 405, allow: 'POST' });
          expect(await error(await send(dev, route, 'no es json'))).toEqual({ status: 400, allow: null, body: { ok: false, message: 'Invalid JSON' } });
        }
        for (const route of ['/api/state', '/api/files', '/api/code', '/api/view/datos', '/api/inspect/node/api', '/api/file/main.dg']) {
          expect(await error(await send(dev, route, '{}'))).toMatchObject({ status: 405, allow: 'GET' });
        }
        expect((await json(dev, '/api/file/main.dg')).body['texto']).toBe(DSL);
      });
    });

    it('a port I/O failure while writing is 500 with the failure message', async () => {
      await withDev(
        { 'main.dg': DSL },
        async (dev) => {
          const res = await send(dev, '/api/edit', JSON.stringify({ type: 'move-pin', view: 'general', node: 'api', x: 1, y: 2 }));
          expect({ status: res.status, body: devErrorSchema.parse(await res.json()) }).toEqual({ status: 500, body: { ok: false, message: 'disco lleno' } });
        },
        { brokenWrite: 'disco lleno' },
      );
    });

    it('GET /api/code says whether there are Themes with code and whether they are trusted; POST /api/trust confirms it', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const code = async () => devCodeSchema.parse((await json(dev, '/api/code')).body);
        expect(await code()).toEqual({ temaConCodigo: false, componentes: [], confiado: false });
        const trust = await post(dev, '/api/trust', {});
        expect(trust.status).toBe(200);
        expect(devTrustSchema.parse(trust.body)).toEqual({ ok: true });
        expect(await code()).toEqual({ temaConCodigo: false, componentes: [], confiado: true });
      });
    });

    it('/components.js serves the bundle of the Themes with code only after trusting; before it is 403', async () => {
      await withDev(
        { 'main.dg': WITH_CODE },
        async (dev) => {
          expect(devCodeSchema.parse((await json(dev, '/api/code')).body)).toEqual({ temaConCodigo: true, componentes: ['Aurora'], confiado: false });
          const before = await dev.fetch('/components.js');
          expect({ status: before.status, body: devErrorSchema.parse(await before.json()) }).toMatchObject({ status: 403, body: { ok: false } });

          expect((await post(dev, '/api/trust', {})).status).toBe(200);
          const after = await dev.fetch('/components.js');
          expect(after.status).toBe(200);
          expect(after.headers.get('content-type')).toContain('text/javascript');
          expect(await after.text()).toBe(TEST_BUNDLE);
          expect((await send(dev, '/components.js', '{}')).status).toBe(405);
        },
        { code: { components: ['Aurora'], bundle: TEST_BUNDLE } },
      );
    });

    const THEME = 'theme claro extends neutral {}\n';
    const atLine = (line: number, column: number) => ({ start: { line, column }, end: { line, column } });
    const readText = async (dev: TestDev, route: string) => (await json(dev, `/api/file/${route}`)).body['texto'];

    it('GET /api/files lists the Workspace files and the --theme-path ones (soloLectura) with hash and version', async () => {
      await withDev(
        { 'main.dg': DSL },
        async (dev) => {
          const { status, body } = await json(dev, '/api/files');
          expect(status).toBe(200);
          expect(typeof body['version']).toBe('number');
          const files = body['archivos'] as Array<{ file: string; hash: string; soloLectura: boolean }>;
          expect(files.map(({ file, soloLectura }) => ({ file, soloLectura }))).toEqual([
            { file: 'main.dg', soloLectura: false },
            { file: 'tema.dg', soloLectura: true },
          ]);
          expect(files.every((a) => a.hash.length > 0)).toBe(true);
        },
        { themes: { 'tema.dg': THEME } },
      );
    });

    it('GET /api/file/<path> gives { file, texto, hash, version }; a missing one is 404', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const { status, body } = await json(dev, '/api/file/main.dg');
        expect(status).toBe(200);
        expect(body).toMatchObject({ file: 'main.dg', texto: DSL, version: expect.any(Number), hash: expect.any(String) });
        expect((await dev.fetch('/api/file/nada.dg')).status).toBe(404);
      });
    });

    it('POST /api/edit { ediciones, version } writes the text and undo removes it', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const { version } = (await json(dev, '/api/file/main.dg')).body;
        const edited = await post(dev, '/api/edit', { ediciones: [{ file: 'main.dg', range: atLine(1, 1), replacement: '// hola\n' }], version });
        expect(edited).toMatchObject({ status: 200, body: { ok: true } });
        expect(await readText(dev, 'main.dg')).toBe(`// hola\n${DSL}`);
        expect((await post(dev, '/api/undo', {})).status).toBe(200);
        expect(await readText(dev, 'main.dg')).toBe(DSL);
      });
    });

    it('a text that does not compile: 422 invalid by default; with aunqueNoCompile it is saved and the state carries the issues', async () => {
      await withDev({ 'main.dg': DSL }, async (dev) => {
        const broken = { ediciones: [{ file: 'main.dg', range: atLine(8, 3), replacement: 'fantasma -> ' }] };
        expect(await post(dev, '/api/edit', broken)).toMatchObject({ status: 422, body: { ok: false, reason: 'invalid' } });
        expect(await post(dev, '/api/edit', { ...broken, aunqueNoCompile: true })).toMatchObject({ status: 200, body: { ok: true } });
        expect(await readText(dev, 'main.dg')).toContain('fantasma -> api -> db');
        const state = (await json(dev, '/api/state')).body as unknown as DevState;
        expect(state.issues.some((i) => i.severity === 'error')).toBe(true);
        expect(state.vistas).toEqual(['general', 'datos']);
      });
    });

    it('edit rejections: --theme-path file 422, file changed outside 409, invalid shape 400', async () => {
      await withDev(
        { 'main.dg': DSL },
        async (dev) => {
          const { version } = (await json(dev, '/api/file/main.dg')).body;
          expect(await post(dev, '/api/edit', { ediciones: [{ file: 'tema.dg', range: atLine(1, 1), replacement: '// x\n' }], aunqueNoCompile: true })).toMatchObject({
            status: 422,
            body: { ok: false, reason: 'unknown-file' },
          });
          await waitForState(
            dev,
            (e) => e.version > (version as number),
            () => dev.editOutside('main.dg', `${DSL}\n`),
          );
          expect(await post(dev, '/api/edit', { ediciones: [{ file: 'main.dg', range: atLine(1, 1), replacement: '// x\n' }], version })).toMatchObject({
            status: 409,
            body: { ok: false, reason: 'stale-hash' },
          });
          expect((await post(dev, '/api/edit', { ediciones: [{ file: 1 }] })).status).toBe(400);
        },
        { themes: { 'tema.dg': THEME } },
      );
    });
  });
}
