import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { startDev } from 'cli';
import type { DevServer } from 'cli';

import { devCommand } from '../src/dev';
import { diskPortOf } from '../src/disk-port';
import { evaluateBundle as loadComponents } from './evaluate-bundle';

const FIXTURE = resolve(__dirname, 'fixtures/theme-code');

const folderList: string[] = [];
const openServers: DevServer[] = [];
afterEach(async () => {
  await Promise.all(openServers.splice(0).map((s) => s.close()));
  for (const folder of folderList.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function copy(): string {
  const root = mkdtempSync(join(tmpdir(), 'rinthel-dev-code-'));
  folderList.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  return root;
}

/** Manual watcher: the test reports disk changes once it finishes writing them. */
function watcher() {
  let warn: (() => void) | undefined;
  return { watch: (_root: string, handleChange: () => void) => ((warn = handleChange), () => (warn = undefined)), change: () => warn?.() };
}

async function startServer(root: string, extra: { trustCode?: boolean } = {}) {
  const obs = watcher();
  const server = await startDev({ workspace: root, port: diskPortOf(root, { watch: obs.watch }), debounceMs: 5, httpPort: 0, ...extra });
  openServers.push(server);
  return { server, change: obs.change };
}

interface State {
  version: number;
  cambio?: string;
  fuente?: unknown;
  issues: Array<{ code: string; file: string; line: number }>;
}
const status = async (s: DevServer): Promise<State> => (await fetch(`${s.url}api/state`)).json() as Promise<State>;
const code = async (s: DevServer) => (await fetch(`${s.url}api/code`)).json() as Promise<{ temaConCodigo: boolean; componentes: string[]; confiado: boolean }>;
const trustIt = (s: DevServer) => fetch(`${s.url}api/trust`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
const bundle = async (s: DevServer) => fetch(`${s.url}components.js`);
const drawAurora = (text: string) => renderToStaticMarkup(createElement(loadComponents(text)['Aurora']!, { id: 'api', parametros: { hue: 3 } } as never));

async function waitForStatus(server: DevServer, version: number): Promise<State> {
  for (let i = 0; i < 200; i++) {
    const current = await status(server);
    if (current.version >= version) return current;
    await new Promise((ok) => setTimeout(ok, 10));
  }
  throw new Error('the state never arrived');
}

describe('dev: Themes with code', () => {
  it('warns about the code and does not serve it until explicit confirmation', async () => {
    const { server } = await startServer(copy());

    expect(server.codeComponents).toEqual(['Aurora']);
    expect(await code(server)).toEqual({ temaConCodigo: true, componentes: ['Aurora'], confiado: false });
    expect((await bundle(server)).status).toBe(403);

    expect((await trustIt(server)).status).toBe(200);
    expect((await code(server)).confiado).toBe(true);
    const response = await bundle(server);
    expect(response.status).toBe(200);
    expect(drawAurora(await response.text())).toBe('<i data-aurora="api" data-hue="3"></i>');
  });

  it('confirming requires JSON and the server own origin', async () => {
    const { server } = await startServer(copy());

    const foreign = await fetch(`${server.url}api/trust`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: '{}' });
    const withoutJson = await fetch(`${server.url}api/trust`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });

    expect([foreign.status, withoutJson.status]).toEqual([403, 415]);
    expect((await code(server)).confiado).toBe(false);
  });

  it('with prior trust the code is served from the start; a Workspace without code has nothing to confirm', async () => {
    const trusted = await startServer(copy(), { trustCode: true });
    expect((await bundle(trusted.server)).status).toBe(200);

    const root = copy();
    rmSync(join(root, 'components'), { recursive: true });
    writeFileSync(join(root, 'main.dg'), 'specification { node servicio }\nmodel { servicio api }\nview v { type architecture include ** }\n');
    const without = await startServer(root);
    expect(without.server.codeComponents).toEqual([]);
    expect(await code(without.server)).toEqual({ temaConCodigo: false, componentes: [], confiado: false });
  });

  it('a change in the .tsx is pushed as code and registered again', async () => {
    const root = copy();
    const { server, change } = await startServer(root, { trustCode: true });
    const before = await status(server);

    writeFileSync(join(root, 'components', 'aurora.tsx'), 'export function Aurora({ id }: { id: string }) { return <b data-v2={id} />; }\n');
    change();
    const after = await waitForStatus(server, before.version + 1);

    expect(after.cambio).toBe('codigo');
    expect(renderToStaticMarkup(createElement(loadComponents(await (await bundle(server)).text())['Aurora']!, { id: 'api' } as never))).toBe('<b data-v2="api"></b>');
  });

  it('a .tsx that does not compile comes out as an issue with file and line and dev keeps the last good drawing', async () => {
    const root = copy();
    const { server, change } = await startServer(root, { trustCode: true });
    const before = await status(server);

    writeFileSync(join(root, 'components', 'aurora.tsx'), 'export function Aurora() {\n  const x = ;\n  return x;\n}\n');
    change();
    const broken = await waitForStatus(server, before.version + 1);

    expect(broken.issues).toContainEqual(expect.objectContaining({ code: 'theme-code-compile', file: 'components/aurora.tsx', line: 2 }));
    expect(broken.fuente).toEqual(before.fuente);
    expect(drawAurora(await (await bundle(server)).text())).toBe('<i data-aurora="api" data-hue="3"></i>');
  });

  it('the command warns about the code and asks for confirmation; --trust-code gives it beforehand', async () => {
    const dependencies = { watch: () => () => undefined };
    const without = await devCommand(['--workspace', copy(), '--port', '0'], dependencies);
    expect(without.exitCode).toBe(0);
    expect(without.stdout).toContain('Aurora');
    expect(without.stdout).toContain('confirmation');

    const trusted = await devCommand(['--workspace', copy(), '--port', '0', '--trust-code'], dependencies);
    expect(trusted.exitCode).toBe(0);
    expect(trusted.stdout).not.toContain('confirmation');
  });
});
