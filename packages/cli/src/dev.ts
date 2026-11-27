/**
 * Command `dev`: HTTP server on 127.0.0.1 only that serves the `dev-ui` app (`/` and `/_dev-ui/*`, read from disk on
 * every request and with `no-store`), the state and the Geometry per View, and serializes over SSE (`/events`) the
 * connection snapshot and the event stream of the live Workspace (the sequence is `session`'s; the protocol, `canonical`'s).
 * Security: 403 for any `Host` other than `127.0.0.1:<port>` or `localhost:<port>` (DNS rebinding); every POST requires
 * its own `Origin` (or none, otherwise 403) and `application/json` (otherwise 415); a body over 64 KiB is 413;
 * `/fonts/<path>` only serves font files under the root (otherwise 404).
 * `/api/*` and every route not served here: the full response of `handleDevApi` (routing, 400, 404, 405, 409, 422, 500).
 * Ports: `httpPort` is the TCP one; `port` is the `LiveWorkspacePort` (by default `diskPortOf`: the disk of the
 * Workspace and of `--theme-path`, `fs.watch` and the Activity log of `disk-log.ts`).
 * Errors: `startDev` rejects if the TCP port is taken (without leaving the watcher active) and throws if the initial
 * read fails; `run(['dev', ...])` turns them into code 2. An unbuilt `dev-ui` static file is 404 when requested.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { DEV_ROUTES } from 'canonical';
import type { DevEvent } from 'canonical';
import { DEV_UI_ROUTE, devUiAssets } from 'dev-ui';
import type { DevUiAssets } from 'dev-ui';
import { openLiveWorkspace, handleDevApi } from 'session';
import type { LiveWorkspacePort, LiveWorkspace } from 'session';

import { codeCompiler } from './code';
import type { CodeResult } from './code';
import { diskPortOf, realClock } from './disk-port';
import type { Watcher } from './disk-port';
import { usage as usoComun } from './cli-session';
import type { RunResult } from './cli-session';
import { readFontFile } from './workspace';

/** Everything but `workspace` has a real default. */
export interface DevOptions {
  workspace: string;
  /** Themes folder (`--theme-path`): merged before the Workspace, which wins on repeated paths. Not watched. */
  themes?: string;
  /** TCP port on 127.0.0.1 (`--port`); 0 picks a free one. */
  httpPort?: number;
  /** Where the live Workspace reads, writes, watches and follows the Activity log; by default `diskPortOf(workspace, { themes })`. */
  port?: LiveWorkspacePort;
  /** Wait in ms after the last change before recompiling; by default the live Workspace's. */
  debounceMs?: number;
  /** Paths of the app's static files; by default those of the `dev-ui` build. Looked up on every request. */
  devUi?: () => DevUiAssets;
  /** `--trust-code`: serves `/components.js` without asking for confirmation in the browser. Default `false`. */
  trustCode?: boolean;
  /** Compiles the `.tsx` files of `workspace`; by default the esbuild adapter (a missing Workspace has no code). */
  compileCode?: () => CodeResult;
}

export interface DevServer {
  /** `http://127.0.0.1:<port>/` */
  url: string;
  /** Theme components the Workspace Themes used at startup (empty if there is no code). */
  codeComponents: string[];
  /** Whether the code is already served (confirmed beforehand with `trustCode`). */
  trusted: boolean;
  close(): Promise<void>;
}

const BODY_LIMIT = 64 * 1024;

/** `undefined` if it exceeds `BODY_LIMIT`; rejects if the connection fails. */
function readBody(req: IncomingMessage): Promise<string | undefined> {
  return new Promise((ok, failure) => {
    let text = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      text += chunk;
      if (text.length > BODY_LIMIT) {
        req.removeAllListeners('data');
        req.resume();
        ok(undefined);
      }
    });
    req.on('end', () => ok(text));
    req.on('error', failure);
  });
}

function header(res: ServerResponse, type: string, status = 200): void {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
}

const respond = (res: ServerResponse, httpStatus: number, body: unknown): void => {
  header(res, 'application/json', httpStatus);
  res.end(JSON.stringify(body));
};

const STATIC_TYPES: Readonly<Record<string, string>> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/** Reads from disk on every request (a `dev-ui` rebuild shows on reload); missing -> 404. */
function serveStatic(res: ServerResponse, path: string | undefined): void {
  let bytes: Buffer;
  try {
    if (path === undefined) throw new Error('not declared');
    bytes = readFileSync(path);
  } catch {
    header(res, 'text/plain', 404);
    res.end('Not found (if the app build is missing: pnpm --filter dev-ui build)');
    return;
  }
  header(res, STATIC_TYPES[extname(path)] ?? 'application/octet-stream');
  res.end(bytes);
}

/** Theme code is served at `/components.js` only after `POST /api/trust` or `trustCode`. */
export async function startDev(options: DevOptions): Promise<DevServer> {
  const { workspace, themes, httpPort: httpPort = 0, debounceMs, devUi: devUi = devUiAssets, trustCode: trustCode = false } = options;
  const { port: port = diskPortOf(workspace, themes === undefined ? {} : { themes }), compileCode: compileCode = codeCompiler(workspace).compile } = options;
  const live: LiveWorkspace = await openLiveWorkspace({
    port: port,
    root: resolve(workspace),
    clock: realClock,
    now: Date.now,
    trustCode: trustCode,
    ...(debounceMs !== undefined && { debounceMs }),
    compileCode: compileCode,
  });

  const clients = new Set<ServerResponse>();
  /** The event sequence belongs to the live Workspace; here it is only serialized as SSE. */
  const send = (client: ServerResponse, { name, data }: DevEvent): void => void client.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  const stopListening = live.listen((event) => {
    for (const client of clients) send(client, event);
  });

  const ownHosts = (): string[] => {
    const { port } = server.address() as AddressInfo;
    return [`127.0.0.1:${port}`, `localhost:${port}`];
  };

  /** Transport checks of a POST: own `Origin` (or none) and JSON; if they fail, the status and the message. */
  const postRejection = (req: IncomingMessage): [number, string] | undefined => {
    const origin = req.headers.origin;
    if (origin !== undefined && !ownHosts().some((host) => origin === `http://${host}`)) return [403, 'Origin not allowed'];
    if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return [415, 'Expected application/json'];
    return undefined;
  };

  /** The API answers in full; here the transport is only checked and read. */
  const api = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> => {
    const methodName = req.method ?? 'GET';
    let body: string | undefined;
    if (methodName === 'POST') {
      const rejection = postRejection(req);
      if (rejection !== undefined) return respond(res, rejection[0], { ok: false, message: rejection[1] });
      body = await readBody(req);
      if (body === undefined) return respond(res, 413, { ok: false, message: 'Request body too large' });
    }
    const response = await handleDevApi(live, { method: methodName, url, ...(body !== undefined && { body }) });
    res.writeHead(response.status, response.headers);
    res.end(response.body);
  };

  /** A badly encoded path or one that leaves the root gives `undefined`. */
  const serveFont = (encodedPath: string): ReturnType<typeof readFontFile> => {
    try {
      return readFontFile(themes === undefined ? [workspace] : [workspace, themes], decodeURIComponent(encodedPath));
    } catch {
      return undefined;
    }
  };

  const server = createServer((req, res) => {
    // Against DNS rebinding.
    if (!ownHosts().includes(req.headers.host ?? '')) {
      header(res, 'text/plain', 403);
      res.end('Host not allowed');
      return;
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname;
    if (path === '/') {
      serveStatic(res, devUi().index);
    } else if (path.startsWith(DEV_UI_ROUTE)) {
      const { files } = devUi();
      const name = path.slice(DEV_UI_ROUTE.length);
      serveStatic(res, Object.hasOwn(files, name) ? files[name] : undefined);
    } else if (path.startsWith(DEV_ROUTES.fonts)) {
      const source = serveFont(path.slice(DEV_ROUTES.fonts.length));
      if (source === undefined) {
        header(res, 'text/plain', 404);
        res.end('Not found');
      } else {
        res.writeHead(200, { 'content-type': source.type, 'cache-control': 'no-store', 'content-length': source.bytes.length });
        res.end(source.bytes);
      }
    } else if (path === DEV_ROUTES.events) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      clients.add(res);
      res.on('close', () => clients.delete(res));
      for (const event of live.connection()) send(res, event);
    } else {
      // A connection that drops while reading the body has no one to answer.
      api(req, res, url).catch(() => res.destroy());
    }
  });

  const stop = (): void => {
    stopListening();
    live.close();
  };
  await new Promise<void>((ok, failure) => {
    server.once('error', failure);
    server.listen(httpPort, '127.0.0.1', () => ok());
  }).catch((error: unknown) => {
    stop();
    throw error;
  });
  const direction = server.address();
  if (direction === null || typeof direction === 'string') throw new Error('The server has no port');
  const { components, trusted } = live.code();

  return {
    url: `http://127.0.0.1:${direction.port}/`,
    codeComponents: components,
    trusted: trusted,
    close: () =>
      new Promise<void>((ok) => {
        stop();
        server.close(() => ok());
        server.closeAllConnections();
      }),
  };
}


/** Resolves with the URL; the server keeps the process alive. TCP port 4173 by default. `watch` replaces `fs.watch`. */
export async function devCommand(
  args: readonly string[],
  dependencies: Pick<DevOptions, 'devUi'> & { watch?: Watcher } = {},
): Promise<RunResult> {
  const usage = usoComun;
  let valueList;
  try {
    valueList = parseArgs({ args: [...args], options: { workspace: { type: 'string' }, port: { type: 'string' }, 'theme-path': { type: 'string' }, 'trust-code': { type: 'boolean' } }, strict: true }).values;
  } catch (error) {
    return usage((error as Error).message);
  }
  if (valueList.workspace === undefined) return usage('Missing --workspace <path>');
  const httpPort = Number(valueList.port ?? 4173);
  if (!Number.isInteger(httpPort) || httpPort < 0 || httpPort > 65535) return usage('--port must be an integer between 0 and 65535');
  const { watch, devUi } = dependencies;
  const workspace = valueList.workspace;
  const themes = valueList['theme-path'];
  try {
    const server = await startDev({
      workspace,
      httpPort: httpPort,
      ...(devUi !== undefined && { devUi }),
      ...(themes !== undefined && { themes }),
      ...(watch !== undefined && { port: diskPortOf(workspace, { ...(themes !== undefined && { themes }), watch }) }),
      ...(valueList['trust-code'] === true && { trustCode: true }),
    });
    const notice =
      server.codeComponents.length === 0
        ? ''
        : server.trusted
          ? `WARNING: the Workspace Themes load code (${server.codeComponents.join(', ')}); confirmed with --trust-code.\n`
          : `WARNING: the Workspace Themes load code (${server.codeComponents.join(', ')}) that runs in your browser without a sandbox. The viewer will ask for confirmation before loading it; use --trust-code only on a Workspace you own.\n`;
    return { exitCode: 0, stdout: `${notice}diagrams dev listening on ${server.url}\n`, stderr: '' };
  } catch (error) {
    return usage(`Could not start dev: ${(error as Error).message}`);
  }
}
