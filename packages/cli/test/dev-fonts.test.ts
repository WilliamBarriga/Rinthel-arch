import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startDev } from 'cli';
import type { DevServer } from 'cli';

import { diskPortOf } from '../src/disk-port';

const model = (fonts: string) => `specification { node servicio }
model { servicio api "API" }
theme t {
  palette { papel "#fefce8" }
  ${fonts}
  node { layer relleno solid { color papel }  slots { title } }
}
view general { type architecture  include **  theme t }
`;

const BYTES = Buffer.from('wOF2-fake-but-binary\u0000\u0001', 'latin1');
let root: string;
let outside: string;
let server: DevServer | undefined;

beforeEach(() => {
  outside = mkdtempSync(join(tmpdir(), 'rinthel-outside-'));
  root = join(outside, 'workspace');
  mkdirSync(join(root, 'fonts'), { recursive: true });
  writeFileSync(join(root, 'main.dg'), model('fonts { body "Caveat"  mono "Caveat"  fallback "cursive" }'));
  writeFileSync(join(root, 'fonts', 'caveat-latin-400-normal.woff2'), BYTES);
  writeFileSync(join(root, 'fonts', 'With Spaces.woff2'), BYTES);
  writeFileSync(join(outside, 'secret.woff2'), 'must not leak');
  symlinkSync(join(outside, 'secret.woff2'), join(root, 'fonts', 'link.woff2'));
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(outside, { recursive: true, force: true });
});

async function startServer(): Promise<DevServer> {
  server = await startDev({ workspace: root, port: diskPortOf(root, { watch: () => () => undefined }), httpPort: 0 });
  return server;
}

/** GET with the path as is (without the client normalizing it, as an attacker would). */
function fetchPath(url: string, rawPath: string): Promise<{ status: number; body: Buffer; type: string | undefined }> {
  const { hostname, port } = new URL(url);
  return new Promise((ok, failure) => {
    const req = request({ host: hostname, port, path: rawPath, method: 'GET' }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (t: Buffer) => chunks.push(t));
      res.on('end', () => ok({ status: res.statusCode!, body: Buffer.concat(chunks), type: res.headers['content-type'] }));
    });
    req.on('error', failure);
    req.end();
  });
}

describe('dev: Workspace font route', () => {
  it('serves the Workspace font file with its type, byte for byte', async () => {
    const { url } = await startServer();

    const r = await fetchPath(url, '/fonts/fonts/caveat-latin-400-normal.woff2');

    expect(r.status).toBe(200);
    expect(r.type).toBe('font/woff2');
    expect(r.body.equals(BYTES)).toBe(true);
  });

  it('understands paths with encoded spaces', async () => {
    const { url } = await startServer();

    expect((await fetchPath(url, '/fonts/fonts/With%20Spaces.woff2')).status).toBe(200);
  });

  it.each([
    ['..', '/fonts/../secret.woff2'],
    ['encoded ../', '/fonts/..%2Fsecret.woff2'],
    ['%2e%2e', '/fonts/%2e%2e/secret.woff2'],
    ['several levels', '/fonts/fonts/..%2F..%2Fsecret.woff2'],
    ['absolute', () => `/fonts/${encodeURIComponent(join(outside, 'secret.woff2'))}`],
    ['absolute with slash', () => `/fonts//${join(outside, 'secret.woff2')}`],
  ])('serves nothing outside the Workspace (%s)', async (_name, path) => {
    const { url } = await startServer();

    const r = await fetchPath(url, typeof path === 'function' ? path() : path);

    expect(r.status).toBe(404);
    expect(r.body.toString()).not.toContain('must not leak');
  });

  it('does not serve a symbolic link that points outside the Workspace', async () => {
    const { url } = await startServer();

    const r = await fetchPath(url, '/fonts/fonts/link.woff2');

    expect(r.status).toBe(404);
    expect(r.body.toString()).not.toContain('must not leak');
  });

  it('only serves fonts: the Workspace own DSL and missing files give 404', async () => {
    const { url } = await startServer();

    expect((await fetchPath(url, '/fonts/main.dg')).status).toBe(404);
    expect((await fetchPath(url, '/fonts/fonts/no-existe.woff2')).status).toBe(404);
    expect((await fetchPath(url, '/fonts/%E0%A4%A.woff2')).status).toBe(404);
  });

  it('the state lists the Workspace fonts with their hash', async () => {
    const { url } = await startServer();

    const status = (await (await fetch(`${url}api/state`)).json()) as { fuentes: Record<string, string>; issues: { code: string }[] };

    expect(Object.keys(status.fuentes).sort()).toEqual(['fonts/With Spaces.woff2', 'fonts/caveat-latin-400-normal.woff2', 'fonts/link.woff2'].sort());
    expect(status.issues.map((i) => i.code)).not.toContain('theme-font-missing');
  });

  it('a font declared without a file is an error in the state, with position', async () => {
    writeFileSync(join(root, 'main.dg'), model('fonts { body "Press Start 2P"  mono "monospace"  fallback "monospace" }'));
    const { url } = await startServer();

    const status = (await (await fetch(`${url}api/state`)).json()) as { issues: { code: string; file: string; line: number }[] };

    expect(status.issues).toContainEqual(expect.objectContaining({ code: 'theme-font-missing', file: 'main.dg', line: 3 }));
  });
});
