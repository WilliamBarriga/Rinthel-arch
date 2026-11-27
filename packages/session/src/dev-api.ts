/**
 * `/api/*` and `/components.js` routes of `dev` over a Live workspace, without transport: a request goes in (method, URL
 * and raw body) and a complete response always comes out (HTTP status, body already serialized and headers). Used by the
 * real server (`cli`) and `inMemoryDev` (`dev-ui/contract`), so routing, validation and edges are a single one (ADR 0007).
 * Edges: unknown route 404; wrong method 405 with `allow`; invalid JSON or shape 400; rejections `rejectionHttpStatus`
 * (409/422); the Theme components bundle without trust 403; an exception (port I/O failure) 500 with its message.
 * All with `{ ok: false, message }`. The bundle is the only non-JSON body (`text/javascript`).
 * Invariants: it never rejects. The adapter keeps only the transport and its security (Host, Origin, content-type) and
 * the rest (static files, `/events`, fonts).
 */
import { fileFromRoute, INSPECT_COMMANDS, rejectionHttpStatus, intentSchema, editsRequestSchema, jumpRequestSchema, DEV_ROUTES } from 'canonical';
import type { InspectCommand, Intent } from 'canonical';

import type { Query } from './queries';
import type { TextEdits, LiveWorkspaceResult, LiveWorkspace } from './live-workspace';

export interface DevRequest {
  method: string;
  url: URL;
  /** Raw body (text); only POST routes read it. */
  body?: string;
}

export interface DevResponse {
  status: number;
  /** Serialized JSON, except the `/components.js` bundle (JavaScript). */
  body: string;
  headers: Readonly<Record<string, string>>;
}

/** Internal response before serializing; `javascript` goes as is instead of `body`. */
interface RouteResponse {
  status: number;
  body?: unknown;
  javascript?: string;
  headers?: Record<string, string>;
}

const json = (status: number, body: unknown): RouteResponse => ({ status, body });
const error = (status: number, message: string): RouteResponse => json(status, { ok: false, message });

const fromResult = (r: LiveWorkspaceResult): RouteResponse =>
  r.ok ? json(200, r) : json(rejectionHttpStatus(r.reason), { ok: false, reason: r.reason, message: r.message, ...(r.file !== undefined && { file: r.file }) });

/** An Intent or `{ ediciones, version?, descripcion?, aunqueNoCompile? }` (`EditsRequest`); `undefined` is 400. */
export function editRequest(body: unknown): { applicable: Intent | TextEdits; version?: number } | undefined {
  if (typeof body === 'object' && body !== null && 'ediciones' in body) {
    const r = editsRequestSchema.safeParse(body);
    if (!r.success) return undefined;
    const { ediciones: edits, version, descripcion: description, aunqueNoCompile: evenIfBroken } = r.data;
    return { applicable: { edits, ...(description !== undefined && { description }), ...(evenIfBroken === true && { evenIfBroken }) }, ...(version !== undefined && { version }) };
  }
  const r = intentSchema.safeParse(body);
  if (!r.success) return undefined;
  const version = (body as { version?: unknown }).version;
  return { applicable: r.data, ...(typeof version === 'number' && Number.isInteger(version) && version >= 0 && { version }) };
}

/** `/api/inspect/<command>/<argument>[?kind&state&diagram&catalog]` as a Query; `undefined` if it does not fit. */
export function queryFromRoute(url: URL): Query | undefined {
  const [command, encoded, ...extra] = url.pathname.slice(DEV_ROUTES.inspect.length).split('/');
  let argument: string | undefined;
  try {
    argument = encoded === undefined ? undefined : decodeURIComponent(encoded);
  } catch {
    argument = undefined;
  }
  if (command === undefined || !(INSPECT_COMMANDS as readonly string[]).includes(command) || extra.length > 0) return undefined;
  // `planned` takes no argument (`/api/inspect/planned/`); the rest require it.
  if (command === 'planned') return argument === undefined || argument === '' ? { command } : undefined;
  if (argument === undefined || argument === '') return undefined;
  if (command !== 'theme') return { command: command as Exclude<InspectCommand, 'theme' | 'planned'>, argument };
  const option = (param: 'kind' | 'state' | 'diagram'): { [k: string]: string } => {
    const value = url.searchParams.get(param);
    return value === null ? {} : { [param]: value };
  };
  return { command, argument, ...option('kind'), ...option('state'), ...option('diagram'), catalog: url.searchParams.get('catalog') === 'true' };
}

/** An API route: exact, or a prefix (`<prefix><argument>`) if it ends in `/`; `body` is the already parsed JSON (POST). */
interface Route {
  method: 'GET' | 'POST';
  path: string;
  handle(live: LiveWorkspace, url: URL, body: unknown): RouteResponse | Promise<RouteResponse>;
}

/** The single route table: routing, 404 and 405 come from it. */
const ROUTES: readonly Route[] = [
  {
    method: 'POST',
    path: DEV_ROUTES.edit,
    async handle(live, _url, body) {
      const request = editRequest(body);
      if (request === undefined) return error(400, 'Expected an Intent { type, ... } or { ediciones, version, descripcion? }');
      return fromResult(await live.edit(request.applicable, request.version));
    },
  },
  { method: 'POST', path: DEV_ROUTES.undo, handle: async (live) => fromResult(await live.undo()) },
  { method: 'POST', path: DEV_ROUTES.redo, handle: async (live) => fromResult(await live.redo()) },
  {
    method: 'POST',
    path: DEV_ROUTES.jump,
    async handle(live, _url, body) {
      const jumpBody = jumpRequestSchema.safeParse(body);
      if (!jumpBody.success) return error(400, 'Expected { id } with a non-negative integer');
      return fromResult(await live.jump(jumpBody.data.id));
    },
  },
  {
    method: 'POST',
    path: DEV_ROUTES.trust,
    handle(live) {
      live.trust();
      return json(200, { ok: true });
    },
  },
  { method: 'GET', path: DEV_ROUTES.state, handle: (live) => json(200, live.state()) },
  { method: 'GET', path: DEV_ROUTES.files, handle: (live) => json(200, live.files()) },
  {
    method: 'GET',
    path: DEV_ROUTES.file,
    handle(live, url) {
      const file = fileFromRoute(url.pathname.slice(DEV_ROUTES.file.length));
      const loaded = file === undefined ? undefined : live.file(file);
      return loaded === undefined ? error(404, 'File not found') : json(200, loaded);
    },
  },
  {
    method: 'GET',
    path: DEV_ROUTES.code,
    handle(live) {
      const { components, trusted } = live.code();
      return json(200, { temaConCodigo: components.length > 0, componentes: components, confiado: trusted });
    },
  },
  {
    method: 'GET',
    path: DEV_ROUTES.components,
    handle(live) {
      const { trusted, bundle } = live.code();
      return trusted ? { status: 200, javascript: bundle } : error(403, 'The Workspace code is not confirmed');
    },
  },
  {
    method: 'GET',
    path: DEV_ROUTES.inspect,
    handle(live, url) {
      const query = queryFromRoute(url);
      if (query === undefined) return json(404, { ok: false, message: `Unknown inspect route; expected ${DEV_ROUTES.inspect}<${INSPECT_COMMANDS.join('|')}>/<argumento>`, suggestions: [] });
      const r = live.query(query);
      if (r === undefined) return json(422, { ok: false, message: 'The Workspace has errors and never compiled; there is nothing to query', suggestions: [] });
      return 'notFound' in r ? json(404, { ok: false, message: r.notFound, suggestions: r.suggestions }) : json(200, r.output);
    },
  },
  {
    method: 'GET',
    path: DEV_ROUTES.view,
    async handle(live, url) {
      let id: string;
      try {
        id = decodeURIComponent(url.pathname.slice(DEV_ROUTES.view.length));
      } catch {
        return error(404, 'View not found');
      }
      // `?theme=<name>`: the View with another Theme (preview), without cache or File history.
      const theme = url.searchParams.get('theme') ?? undefined;
      const geometry = await live.geometry(id, theme === undefined ? undefined : { theme });
      return geometry === undefined ? error(404, theme === undefined ? `View '${id}' not found` : `View '${id}' or Theme '${theme}' not found`) : json(200, geometry);
    },
  },
];

const routeOf = (pathname: string): Route | undefined => ROUTES.find(({ path }) => (path.endsWith('/') ? pathname.startsWith(path) : pathname === path));

function serialize({ status, body, javascript, headers }: RouteResponse): DevResponse {
  if (javascript !== undefined) return { status, body: javascript, headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', ...headers } };
  return { status, body: JSON.stringify(body), headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } };
}

const wrongMethod = (allowed: 'GET' | 'POST'): RouteResponse => ({ ...error(405, 'Method not allowed'), headers: { allow: allowed } });

async function handle(live: LiveWorkspace, { method, url, body }: DevRequest): Promise<RouteResponse> {
  const path = routeOf(url.pathname);
  if (path === undefined) return error(404, 'Not found');
  if (path.method === 'GET') return method === 'GET' || method === 'HEAD' ? path.handle(live, url, undefined) : wrongMethod('GET');
  if (method !== 'POST') return wrongMethod('POST');
  let loaded: unknown;
  try {
    loaded = JSON.parse(body ?? '');
  } catch {
    return error(400, 'Invalid JSON');
  }
  return path.handle(live, url, loaded);
}

/** Handles any request as an API route; it never rejects (an exception is 500). */
export async function handleDevApi(live: LiveWorkspace, request: DevRequest): Promise<DevResponse> {
  try {
    return serialize(await handle(live, request));
  } catch (e) {
    return serialize(error(500, e instanceof Error ? e.message : String(e)));
  }
}

/**
 * `fetch` over the dev API in process, without HTTP: every request goes to `handleDevApi`. `base` resolves relative
 * URLs (`/api/state`). Shared by `export` (it captures the state) and the in-memory dev of the dev-ui tests.
 */
export function fetchOverDevApi(live: LiveWorkspace, base = 'http://127.0.0.1'): typeof fetch {
  return (async (entry: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entry instanceof Request ? entry.url : entry), base);
    const { status, body, headers } = await handleDevApi(live, { method: init?.method ?? 'GET', url, ...(typeof init?.body === 'string' && { body: init.body }) });
    return new Response(body, { status, headers });
  }) as typeof fetch;
}
