/**
 * What is specific to the `dev` HTTP adapter: static files, transport security (Host, Origin, content-type, size), disk and
 * closing. The `/api/*` routes, their edges and the SSE events are covered by `testDevContract` (`dev-contract.test.ts`).
 */
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { activityEvent, eventsOverFetch, activityLines } from 'dev-ui/contract';
import type { DevActivity } from 'dev-ui/protocol';

import { startDev } from 'cli';
import type { DevOptions, DevServer } from 'cli';
import { inMemoryPort } from 'session';
import type { LiveWorkspacePort } from 'session';

import { diskPortOf } from '../src/disk-port';

const BASE = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db
}

view general {
  type architecture
  include **
}
`;

/** In-memory Workspace with a watcher that can be queried. */
function memoryEnv(initial: Record<string, string>) {
  const base = inMemoryPort({ own: initial });
  let watchers = 0;
  const port: LiveWorkspacePort = {
    ...base,
    watch(handleChange) {
      watchers += 1;
      const leave = base.watch(handleChange);
      return () => {
        watchers -= 1;
        leave();
      };
    },
  };
  return { port, watching: () => watchers > 0 };
}

/** The real disk without `fs.watch`: the tests do not depend on the system watcher. */
const diskPort = (root: string) => diskPortOf(root, { watch: () => () => undefined });

const folderList: string[] = [];

/** Fake `dev-ui`: its static files are files in a temp folder that the test can rewrite. */
function fakeDevUi() {
  const folder = mkdtempSync(join(tmpdir(), 'rinthel-fake-dev-ui-'));
  folderList.push(folder);
  const path = (name: string) => join(folder, name);
  const write = (name: string, text: string) => writeFileSync(path(name), text);
  write('index.html', '<!doctype html><title>fake</title>');
  write('page.js', '/*page*/');
  write('style.css', '/*style*/');
  return { devUi: () => ({ index: path('index.html'), files: { 'page.js': path('page.js'), 'style.css': path('style.css'), 'missing.js': path('missing.js') } }), write };
}

/** Real Workspace in a temp folder, with `main.dg` = `BASE`. */
function diskWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'rinthel-dev-'));
  folderList.push(root);
  writeFileSync(join(root, 'main.dg'), BASE);
  return root;
}

const withoutCode: DevOptions['compileCode'] = () => ({ components: {}, issues: [], bundle: 'return {};' });

const response = async (res: Response) => ({ status: res.status, body: (await res.json()) as unknown });

const openServers: DevServer[] = [];
async function startServer(env: ReturnType<typeof memoryEnv>, extra: Partial<DevOptions> = {}): Promise<DevServer> {
  const server = await startDev({ workspace: '/ws', port: env.port, ...extra, debounceMs: 5, httpPort: 0 });
  openServers.push(server);
  return server;
}
afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => server.close()));
  for (const folder of folderList.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const JSON_ = { 'content-type': 'application/json' };
const post = (server: DevServer, path: string, body: unknown = {}, headerValues: Record<string, string> = JSON_) =>
  fetch(`${server.url}${path}`, { method: 'POST', headers: headerValues, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('dev: routes', () => {
  it('listens only on 127.0.0.1 and serves / and /_dev-ui/* of the injected dev-ui, without cache', async () => {
    const { devUi } = fakeDevUi();
    const server = await startServer(memoryEnv({ 'main.dg': BASE }), { devUi });

    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const page = await fetch(server.url);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(await page.text()).toBe('<!doctype html><title>fake</title>');
    const js = await fetch(`${server.url}_dev-ui/page.js`);
    expect([js.headers.get('content-type'), js.headers.get('cache-control'), await js.text()]).toEqual(['text/javascript; charset=utf-8', 'no-store', '/*page*/']);
    const css = await fetch(`${server.url}_dev-ui/style.css`);
    expect([css.headers.get('content-type'), await css.text()]).toEqual(['text/css; charset=utf-8', '/*style*/']);
    expect((await fetch(`${server.url}nada`)).status).toBe(404);
  });

  it('reads the static files from disk on every request: a dev-ui rebuild shows on reload', async () => {
    const { devUi, write } = fakeDevUi();
    const server = await startServer(memoryEnv({ 'main.dg': BASE }), { devUi });
    expect(await (await fetch(`${server.url}_dev-ui/page.js`)).text()).toBe('/*page*/');

    write('page.js', '/*new page*/');
    write('index.html', '<p>new</p>');

    expect(await (await fetch(`${server.url}_dev-ui/page.js`)).text()).toBe('/*new page*/');
    expect(await (await fetch(server.url)).text()).toBe('<p>new</p>');
  });

  it('under /_dev-ui/ it only serves the declared files; one missing on disk is 404', async () => {
    const { devUi } = fakeDevUi();
    const server = await startServer(memoryEnv({ 'main.dg': BASE }), { devUi });

    expect((await fetch(`${server.url}_dev-ui/index.html`)).status).toBe(404);
    expect((await fetch(`${server.url}_dev-ui/..%2F..%2Fetc%2Fpasswd`)).status).toBe(404);
    expect((await fetch(`${server.url}_dev-ui/missing.js`)).status).toBe(404);
    expect((await fetch(`${server.url}app.js`)).status).toBe(404);
  });

  it('without injection, it serves the real dev-ui build', async () => {
    const env = memoryEnv({ 'main.dg': BASE });
    const server = await startDev({ workspace: '/ws', port: env.port, httpPort: 0 });
    openServers.push(server);

    expect(await (await fetch(server.url)).text()).toContain('<script type="module" src="/_dev-ui/page.js">');
    const page = await (await fetch(`${server.url}_dev-ui/page.js`)).text();
    const chunk = /"\.\/(chunks\/[^"]+\.js)"/.exec(page)?.[1];
    expect(chunk).toBeDefined();
    const served = await fetch(`${server.url}_dev-ui/${chunk}`);
    expect([served.status, served.headers.get('content-type')]).toEqual([200, 'text/javascript; charset=utf-8']);
    expect((await (await fetch(`${server.url}_dev-ui/worker.js`)).text()).length).toBeGreaterThan(1000);
  });

  it('--theme-path (themes option) brings Themes before the Workspace', async () => {
    const themes = join(import.meta.dirname, 'fixtures', 'extra-themes');
    const server = await startDev({ workspace: diskWorkspace(), themes, compileCode: withoutCode, httpPort: 0 });
    openServers.push(server);

    const source = ((await (await fetch(`${server.url}api/state`)).json()) as { fuente: { themes: { name: string }[] } }).fuente;
    expect(source.themes.map(({ name }) => name)).toContain('corporativo');
  });

  it('closing frees the port and stops watching', async () => {
    const env = memoryEnv({ 'main.dg': BASE });
    const server = await startServer(env);
    expect(env.watching()).toBe(true);

    await server.close();

    expect(env.watching()).toBe(false);
    await expect(fetch(server.url)).rejects.toThrow();
  });
});

describe('dev: security', () => {
  it('rejects requests whose Host is not 127.0.0.1 or localhost with the server port (DNS rebinding)', async () => {
    const server = await startServer(memoryEnv({ 'main.dg': BASE }));
    const port = Number(new URL(server.url).port);
    const withHost = (host: string | undefined) =>
      new Promise<number>((ok, failure) => {
        const req = request({ host: '127.0.0.1', port, path: '/api/state', headers: host === undefined ? {} : { host } }, (res) => {
          res.resume();
          ok(res.statusCode ?? 0);
        });
        req.on('error', failure);
        req.end();
      });

    expect(await withHost(`127.0.0.1:${port}`)).toBe(200);
    expect(await withHost(`localhost:${port}`)).toBe(200);
    expect(await withHost(`evil.example:${port}`)).toBe(403);
    expect(await withHost(`127.0.0.1.evil.example:${port}`)).toBe(403);
    expect(await withHost('127.0.0.1:1')).toBe(403);
    expect(await withHost('127.0.0.1')).toBe(403);
  });

  it('every POST requires its own Origin (403) and JSON (415), and limits the body (413), before reaching the API', async () => {
    const root = diskWorkspace();
    const server = await startDev({ workspace: root, port: diskPort(root), compileCode: withoutCode, httpPort: 0 });
    openServers.push(server);
    const body = { type: 'move-pin', view: 'general', node: 'api', x: 1, y: 2 };

    for (const path of ['api/edit', 'api/undo', 'api/redo', 'api/history/jump', 'api/trust', 'api/nada']) {
      expect(await response(await post(server, path, body, { ...JSON_, origin: 'http://evil.example' }))).toEqual({ status: 403, body: { ok: false, message: 'Origin not allowed' } });
      expect(await response(await post(server, path, body, { 'content-type': 'text/plain' }))).toEqual({ status: 415, body: { ok: false, message: 'Expected application/json' } });
    }
    expect(await response(await post(server, 'api/edit', { ...body, padding: 'x'.repeat(70 * 1024) }))).toEqual({ status: 413, body: { ok: false, message: 'Request body too large' } });
    expect((await post(server, 'api/edit', body, { ...JSON_, origin: server.url.replace(/\/$/, '') })).status).toBe(200);
    expect(readFileSync(join(root, 'main.dg'), 'utf8')).toContain('node api { pin 1,2 }');
  });
});

describe('dev: disk and Activity log', () => {
  it('POST /api/edit writes to the Workspace disk and undo restores it', async () => {
    const root = diskWorkspace();
    const server = await startDev({ workspace: root, port: diskPort(root), compileCode: withoutCode, httpPort: 0 });
    openServers.push(server);

    expect((await post(server, 'api/edit', { type: 'move-pin', view: 'general', node: 'api', x: 1, y: 2 })).status).toBe(200);
    expect(readFileSync(join(root, 'main.dg'), 'utf8')).toContain('node api { pin 1,2 }');
    expect((await post(server, 'api/undo')).status).toBe(200);
    expect(readFileSync(join(root, 'main.dg'), 'utf8')).toBe(BASE);
  });

  it('watches .diagrams/activity.jsonl apart from the Workspace: replays what came before connecting and pushes what is appended', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rinthel-dev-activity-'));
    folderList.push(root);
    writeFileSync(join(root, 'main.dg'), BASE);
    mkdirSync(join(root, '.diagrams'));
    writeFileSync(join(root, '.diagrams', 'activity.jsonl'), activityLines(activityEvent(1)));
    const server = await startDev({ workspace: root, port: diskPort(root), compileCode: withoutCode, httpPort: 0 });
    openServers.push(server);
    const serverFetch: typeof fetch = (path, init) => fetch(new URL(String(path).replace(/^\//, ''), server.url), init);

    const received = await new Promise<DevActivity[]>((ok) => {
      const list: DevActivity[] = [];
      const close = eventsOverFetch(serverFetch)('/events', (name, data) => {
        if (name !== 'actividad') return;
        list.push(JSON.parse(data) as DevActivity);
        if (list.length === 1) appendFileSync(join(root, '.diagrams', 'activity.jsonl'), activityLines(activityEvent(2)));
        else {
          close();
          ok(list);
        }
      });
    });

    expect(received.map((a) => [a.previos, a.eventos.map((e) => e.pid)])).toEqual([
      [true, [1]],
      [false, [2]],
    ]);
  });
});
