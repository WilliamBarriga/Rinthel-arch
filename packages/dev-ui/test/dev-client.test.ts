import { describe, expect, it, vi } from 'vitest';

import type { DevState } from '../src/protocol';

import { createDevClient } from '../browser/client';

const good = { view: 'v', theme: 't', layoutKey: 'k', geometry: { kind: 'grafo', nodes: { a: { x: 0, y: 0, width: 1, height: 1 } }, edges: {}, pinsSolapados: [], width: 1, height: 1 } };

/** Fake `fetch`: responds by route and records each request. */
function server(routes: Record<string, { status?: number; body?: unknown; text?: string; kind?: string } | Error>) {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const route = String(url);
    requests.push({ url: route, ...(init !== undefined && { init }) });
    const r = routes[route];
    if (r instanceof Error) return Promise.reject(r);
    if (r === undefined) return Promise.resolve(new Response('No encontrado', { status: 404 }));
    return Promise.resolve(new Response(r.text ?? JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { 'content-type': r.kind ?? 'application/json' } }));
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, requests };
}

const withoutEvents = () => () => undefined;

describe('single client of the dev page', () => {
  it('sends an Intent through POST /api/edit with the seen version and no hash', async () => {
    const s = server({ '/api/edit': { body: { ok: true, version: 4 } } });
    const client = createDevClient({ fetch: s.fetch, events: withoutEvents });

    const r = await client.edit({ type: 'move-pin', view: 'general', node: 'api', x: 1, y: 2 }, 3);

    expect(r).toEqual({ ok: true, version: 4 });
    expect(s.requests).toHaveLength(1);
    expect(s.requests[0]?.url).toBe('/api/edit');
    expect(s.requests[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(s.requests[0]?.init?.body))).toEqual({ type: 'move-pin', view: 'general', node: 'api', x: 1, y: 2, version: 3 });
  });

  it('a 409 is stale; another rejection or a network failure is not, and it never throws', async () => {
    const intent = { type: 'reorder-lifelines' as const, view: 's', order: ['a', 'b'] };
    const stale = createDevClient({ fetch: server({ '/api/edit': { status: 409, body: { ok: false, reason: 'stale-hash', message: 'cambio' } } }).fetch, events: withoutEvents });
    const rejection = createDevClient({ fetch: server({ '/api/edit': { status: 422, body: { ok: false, message: 'no compila' } } }).fetch, events: withoutEvents });
    const down = createDevClient({ fetch: server({ '/api/edit': new Error('caido') }).fetch, events: withoutEvents });

    expect(await stale.edit(intent, 0)).toEqual({ ok: false, stale: true, message: 'cambio', reason: 'stale-hash' });
    expect(await rejection.edit(intent, 0)).toEqual({ ok: false, stale: false, message: 'no compila' });
    expect(await down.edit(intent, 0)).toEqual({ ok: false, stale: false, message: 'caido' });
  });

  it('undo and redo go to their POST routes', async () => {
    const s = server({ '/api/undo': { body: { ok: true, version: 2 } }, '/api/redo': { status: 422, body: { ok: false, message: 'Nada que rehacer' } } });
    const client = createDevClient({ fetch: s.fetch, events: withoutEvents });

    expect(await client.undo()).toEqual({ ok: true, version: 2 });
    expect(await client.redo()).toEqual({ ok: false, stale: false, message: 'Nada que rehacer' });
    expect(s.requests.map(({ url, init }) => [url, init?.method])).toEqual([
      ['/api/undo', 'POST'],
      ['/api/redo', 'POST'],
    ]);
  });

  it('requests the Geometry of a View and validates it with the canonical schema', async () => {
    const s = server({ '/api/view/v%201': { body: good }, '/api/view/rota': { body: { ...good, geometry: { kind: 'grafo', nodes: 3 } } } });
    const client = createDevClient({ fetch: s.fetch, events: withoutEvents });

    const read = await client.geometry('v 1');
    expect(read.ok && read.geometry.geometry.kind).toBe('grafo');

    const broken = await client.geometry('rota');
    expect(broken.ok).toBe(false);
    expect(!broken.ok && broken.error).toContain('rota');
  });

  it('a Geometry that does not arrive (404 or network) is a failure with no error to show', async () => {
    const client = createDevClient({ fetch: server({ '/api/view/caida': new Error('red') }).fetch, events: withoutEvents });

    expect(await client.geometry('nada')).toEqual({ ok: false });
    expect(await client.geometry('caida')).toEqual({ ok: false });
  });

  it('a Geometry that does not arrive in time is a failure with no error (the page falls back to the Worker)', async () => {
    const hanging = vi.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
    const client = createDevClient({ fetch: hanging, events: withoutEvents, geometryDeadlineMs: 20 });

    expect(await client.geometry('lenta')).toEqual({ ok: false });
  });

  it('state() does not throw: a network failure or a broken response give undefined', async () => {
    const down = createDevClient({ fetch: server({ '/api/state': new Error('red') }).fetch, events: withoutEvents });
    const broken = createDevClient({ fetch: server({ '/api/state': { status: 500, body: { error: 'x' } } }).fetch, events: withoutEvents });

    expect(await down.state()).toBeUndefined();
    expect(await broken.state()).toBeUndefined();
  });

  it('subscribes to the state (event: estado) through /events and requests it from /api/state', async () => {
    const state = { version: 3, cambio: 'pintura', iconos: {}, vistas: [], issues: [] } satisfies DevState;
    let push: ((name: string, data: string) => void) | undefined;
    const close = vi.fn();
    const open = vi.fn((_url: string, onEvent: (name: string, data: string) => void) => ((push = onEvent), close));
    const client = createDevClient({ fetch: server({ '/api/state': { body: state } }).fetch, events: open });
    const received: DevState[] = [];

    const low = client.subscribe((e) => received.push(e));
    push?.('estado', JSON.stringify(state));
    push?.('actividad', '{"otro":1}');
    low();

    expect(open).toHaveBeenCalledWith('/events', expect.any(Function));
    expect(received).toEqual([state]);
    expect(close).toHaveBeenCalled();
    expect(await client.state()).toEqual(state);
  });

  it('a single SSE connection for all listeners; it closes when the last one leaves', () => {
    let push: ((name: string, data: string) => void) | undefined;
    const close = vi.fn();
    const open = vi.fn((_url: string, onEvent: (name: string, data: string) => void) => ((push = onEvent), close));
    const client = createDevClient({ fetch: server({}).fetch, events: open });
    const activity: unknown[] = [];
    const history: unknown[] = [];

    const lowA = client.listen('actividad', (d) => activity.push(d));
    const lowH = client.listen('historial', (d) => history.push(d));
    push?.('actividad', '{"command":"edit"}');
    push?.('historial', '{"pasado":[]}');
    push?.('historial', 'no es json');
    lowA();
    expect(close).not.toHaveBeenCalled();
    lowH();

    expect(open).toHaveBeenCalledTimes(1);
    expect(activity).toEqual([{ command: 'edit' }]);
    expect(history).toEqual([{ pasado: [] }]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('inspects through GET /api/inspect: the output, or the message and the nearby ids if it does not exist', async () => {
    const output = { contractVersion: 2, command: 'search', query: 'api', results: [] };
    const ofTheme = { contractVersion: 2, command: 'search', query: 'neutral', results: [] };
    const s = server({
      '/api/inspect/search/api': { body: output },
      '/api/inspect/node/apj': { status: 404, body: { ok: false, message: "No such Node 'apj'. Did you mean: api", suggestions: ['api'] } },
      '/api/inspect/theme/neutral?kind=servicio': { body: ofTheme },
    });
    const client = createDevClient({ fetch: s.fetch, events: withoutEvents });

    expect(await client.inspect('search', 'api')).toEqual({ ok: true, output });
    expect(await client.inspect('node', 'apj')).toEqual({ ok: false, message: "No such Node 'apj'. Did you mean: api", suggestions: ['api'] });
    expect(await client.inspect('theme', 'neutral', { kind: 'servicio' })).toEqual({ ok: true, output: ofTheme });
    expect(await createDevClient({ fetch: server({}).fetch, events: withoutEvents }).inspect('view', 'x')).toMatchObject({ ok: false, suggestions: [] });
  });

  it('an accepted write with a response outside the protocol is a failure, not a success', async () => {
    const s = server({ '/api/edit': { body: { ok: 'si' } }, '/api/trust': { body: { aceptado: true } }, '/api/redo': { body: { ok: true } } });
    const client = createDevClient({ fetch: s.fetch, events: withoutEvents });

    expect(await client.edit({ type: 'move-pin', view: 'general', node: 'api', x: 1, y: 2 }, 3)).toMatchObject({ ok: false, stale: false, message: expect.stringContaining('Malformed response from /api/edit') });
    expect(await client.trust()).toMatchObject({ ok: false, message: expect.stringContaining('Malformed response from /api/trust') });
    expect(await client.redo()).toMatchObject({ ok: false, message: expect.stringContaining('Malformed response from /api/redo') });
  });

  it('a rejection with a body outside the protocol gives the status and the route, and its reason does not leak', async () => {
    const s = server({ '/api/edit': { status: 422, body: { ok: false, message: 7, reason: 'inventado' } }, '/api/history/jump': { status: 409, body: { error: 'x' } } });
    const client = createDevClient({ fetch: s.fetch, events: withoutEvents });

    expect(await client.editText({ ediciones: [{ file: 'a.dg', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: 'x' }] })).toEqual({ ok: false, stale: false, message: 'Error 422 at /api/edit' });
    expect(await client.jump(2)).toEqual({ ok: false, stale: true, message: 'Error 409 at /api/history/jump' });
  });

  it('the Components bundle is only valid with 200 and a JavaScript content-type', async () => {
    const bundle = 'module.exports = {}';
    const good = createDevClient({ fetch: server({ '/components.js': { text: bundle, kind: 'text/javascript; charset=utf-8' } }).fetch, events: withoutEvents });
    const html = createDevClient({ fetch: server({ '/components.js': { text: '<html></html>', kind: 'text/html' } }).fetch, events: withoutEvents });
    const forbidden = createDevClient({ fetch: server({ '/components.js': { status: 403, body: { ok: false, message: 'El codigo del Workspace no esta confirmado' } } }).fetch, events: withoutEvents });

    expect(await good.componentsBundle()).toEqual({ ok: true, value: bundle });
    expect(await html.componentsBundle()).toEqual({ ok: false, message: expect.stringContaining('text/html') });
    expect(await forbidden.componentsBundle()).toEqual({ ok: false, message: 'El codigo del Workspace no esta confirmado' });
  });

  it('malformed GET /api/code and /api/files are failures with their reason', async () => {
    const s = server({ '/api/code': { body: { temaConCodigo: 'si' } }, '/api/files': { body: { version: 1 } } });
    const client = createDevClient({ fetch: s.fetch, events: withoutEvents });

    expect(await client.code()).toEqual({ ok: false, message: expect.stringContaining('Malformed response from /api/code') });
    expect(await client.files()).toEqual({ ok: false, message: expect.stringContaining('Malformed response from /api/files') });
  });

  it('an inspect output that does not match the schema is a failure', async () => {
    const s = server({ '/api/inspect/search/api': { body: { contractVersion: 2, command: 'search', query: 'api', results: 'muchos' } } });
    const client = createDevClient({ fetch: s.fetch, events: withoutEvents });

    expect(await client.inspect('search', 'api')).toEqual({ ok: false, message: expect.stringContaining('Malformed response from /api/inspect/search/api'), suggestions: [] });
  });
});
