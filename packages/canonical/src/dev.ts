/**
 * The `dev` protocol, with a single owner, shared by the Live workspace (`sesion`), the server (`cli`) and the page
 * (`estudio`): routes, named SSE events, schemas of what the Live workspace produces (state, Diff, File history,
 * activity, files, `inspect` not found) and of the write requests, the identity of the elements of a
 * Diff and the mapping of a rejection to an HTTP status (ADR 0004, 0007). `estudio/protocolo` re-exports it for the page.
 * Invariants: no I/O; a value from here (route, event, command, HTTP status) is the only one the real server and `devEnMemoria` use.
 */
import { z } from 'zod';

import { activityEventSchema } from './activity';
import { textEditSchema } from './edit';
import { canonicalFormSchema } from './schema';
import { REJECTION_REASONS } from './pin';
import type { RejectionReason } from './pin';
import { FONTS_ROUTE } from './fonts-route';
import { issueSchema } from './output';

/** `dev` routes; those ending in `/` are prefixes (`<prefix><argument>`). */
export const DEV_ROUTES = {
  state: '/api/estado',
  events: '/eventos',
  files: '/api/archivos',
  file: '/api/archivo/',
  edit: '/api/edit',
  undo: '/api/deshacer',
  redo: '/api/rehacer',
  jump: '/api/historial/saltar',
  trust: '/api/confiar',
  code: '/api/codigo',
  components: '/componentes.js',
  inspect: '/api/inspect/',
  view: '/api/vista/',
  fonts: FONTS_ROUTE,
} as const;

/** 409 if what the writer saw is no longer on disk; 422 otherwise (ADR 0007). */
export const rejectionHttpStatus = (reason: RejectionReason): 409 | 422 => (reason === 'stale-hash' ? 409 : 422);

export const devIssueSchema = issueSchema.extend({
  /** Link `vscode://file/<path>:<line>:<column>`. */
  href: z.string(),
});

/**
 * `pintura`: Layers or animation, the Resolved style is reapplied over the Fresh geometry; `estructura`: Metrics,
 * fonts, Model or Views, relayout; `codigo`: a `.tsx`, the component is re-registered without relayout.
 * With several at once the strongest wins: `estructura`, `codigo`, `pintura`.
 */
export const CHANGE_KINDS = ['pintura', 'estructura', 'codigo'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/**
 * The page sends `version` back when editing and the server maps it to the hashes it saw (resolves concurrency).
 * With `cambio: 'pintura'` the page does not request Geometry.
 */
export const devStateSchema = z.object({
  version: z.number().int(),
  /** Absent in the initial state and when the recompilation failed (the last good drawing is kept). */
  cambio: z.enum(CHANGE_KINDS).optional(),
  /** Absent while the Workspace has never compiled without errors. */
  fuente: canonicalFormSchema.optional(),
  iconos: z.record(z.string(), z.string()),
  vistas: z.array(z.string()),
  /** Relative path -> content hash of the font files; served at `/fuentes/<path>`. Absent if the adapter does not know them. */
  fuentes: z.record(z.string(), z.string()).optional(),
  issues: z.array(devIssueSchema),
});

export type DevIssue = z.infer<typeof devIssueSchema>;
export type DevState = z.infer<typeof devStateSchema>;

/**
 * Element of a Diff with its identity: Node by `id`; Attribute by Node + `name`; Edge by `from` + `to`
 * (Node ids) + ordinal within the same pair; Interaction by `id`; Message by `id` or, without it, by Interaction +
 * `position` (index among its Messages, flattening Fragments; `path` is the viewer's, `2.0.1`); View by `id`; Theme by `name`.
 */
export const diffElementSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('node'), id: z.string() }),
  z.object({ kind: z.literal('attribute'), node: z.string(), name: z.string() }),
  z.object({ kind: z.literal('edge'), from: z.string(), to: z.string(), ordinal: z.number().int() }),
  z.object({ kind: z.literal('interaction'), id: z.string() }),
  z.object({ kind: z.literal('message'), interaction: z.string(), id: z.string().optional(), position: z.number().int(), path: z.string() }),
  z.object({ kind: z.literal('view'), id: z.string() }),
  z.object({ kind: z.literal('theme'), name: z.string() }),
]);
export type DiffElement = z.infer<typeof diffElementSchema>;
export type DiffElementKind = DiffElement['kind'];

/** Identity key of an element (two elements with the same key are the same one). */
export function elementKey(element: DiffElement): string {
  switch (element.kind) {
    case 'node':
    case 'interaction':
    case 'view':
      return `${element.kind}:${element.id}`;
    case 'attribute':
      return `attribute:${element.node}#${element.name}`;
    case 'edge':
      return `edge:${element.from}->${element.to}:${element.ordinal}`;
    case 'message':
      return `message:${element.interaction}:${element.id ?? `#${element.position}`}`;
    case 'theme':
      return `theme:${element.name}`;
  }
}

/** Readable kind (as in CONTEXT.md) and name of an element; ordinals and positions from 1. */
export function elementLabel(element: DiffElement): { kind: string; id: string } {
  switch (element.kind) {
    case 'node':
      return { kind: 'Node', id: element.id };
    case 'attribute':
      return { kind: 'Attribute', id: `${element.node}#${element.name}` };
    case 'edge':
      return { kind: 'Edge', id: `${element.from} -> ${element.to}${element.ordinal > 0 ? ` (${element.ordinal + 1})` : ''}` };
    case 'interaction':
      return { kind: 'Interaction', id: element.id };
    case 'message':
      return { kind: 'Message', id: `${element.interaction}:${element.id ?? `#${element.position + 1}`}` };
    case 'view':
      return { kind: 'View', id: element.id };
    case 'theme':
      return { kind: 'Theme', id: element.name };
  }
}

/** `texto`: label, description, Message text; `estructura`: everything else. */
export const PROPERTY_CLASSES = ['texto', 'estructura'] as const;
export type PropertyClass = (typeof PROPERTY_CLASSES)[number];
const changedPropertySchema = z.object({ nombre: z.string(), clase: z.enum(PROPERTY_CLASSES) });
export type ChangedProperty = z.infer<typeof changedPropertySchema>;
const changedElementSchema = z.object({ elemento: diffElementSchema, propiedades: z.array(changedPropertySchema) });
export type ChangedElement = z.infer<typeof changedElementSchema>;

/** Diff (CONTEXT.md) between two Canonical forms; computed by `diferenciar` in `sesion`. */
export const diffSchema = z.object({
  agregados: z.array(diffElementSchema),
  quitados: z.array(diffElementSchema),
  cambiados: z.array(changedElementSchema),
});
export type Diff = z.infer<typeof diffSchema>;

/** A Diff with nothing added, removed or changed. */
export const emptyDiff = (d: Diff): boolean => d.agregados.length === 0 && d.quitados.length === 0 && d.cambiados.length === 0;

/**
 * `propio`: produced by a UI write (Intent, text edits, `fix`, undo, redo, jump),
 * recognized by the hash of what was written; `externo`: any other (agent, another editor, CLI).
 */
export const DIFF_ORIGINS = ['propio', 'externo'] as const;
export type DiffOrigin = (typeof DIFF_ORIGINS)[number];

/**
 * Data of `event: diferencia`: the Diff of the Canonical form against the last good Session, pushed after the `estado` of
 * the same `version` and only if it is not empty. Several Sessions with errors in a row yield a single one when it compiles
 * again (external if any of the intermediate writes was). The page does not recompute: it only projects.
 */
export const devDiffSchema = diffSchema.extend({ version: z.number().int(), origen: z.enum(DIFF_ORIGINS) });
export type DevDiff = z.infer<typeof devDiffSchema>;

/**
 * Data of `event: historial` (on connect and after each recompilation): the File history of `dev`, `pasado` from the
 * oldest entry to the most recent and `futuro` from the next one to redo. `id` is a stable process counter
 * (`0` is Start), `cuando` the time in ms and `descripcion` is built by the server. `alcanzable: false` (with `reason`) if
 * jumping to it would restore a file that changed outside.
 */
const scopeSchema = { alcanzable: z.boolean(), reason: z.string().optional() };
export const devHistoryEntrySchema = z.object({ id: z.number().int().positive(), descripcion: z.string(), archivos: z.array(z.string()), cuando: z.number(), ...scopeSchema });
export const devHistorySchema = z.object({ pasado: z.array(devHistoryEntrySchema), futuro: z.array(devHistoryEntrySchema), inicio: z.object(scopeSchema) });
export type DevHistoryEntry = z.infer<typeof devHistoryEntrySchema>;
export type DevHistory = z.infer<typeof devHistorySchema>;

/** `POST /api/historial/saltar { id }`: 200 after writing the target, 409 if it changed outside, 422 `unknown-entry`. */
export const jumpRequestSchema = z.object({ id: z.number().int().nonnegative() });
export const DEV_HISTORY_START = 0;

/** Subcommands of `inspect` and of `GET /api/inspect/<command>/<argument>`; the `theme` options go in the query. */
export const INSPECT_COMMANDS = ['search', 'node', 'view', 'interaction', 'planned', 'theme'] as const;
export type InspectCommand = (typeof INSPECT_COMMANDS)[number];

export function inspectRoute(command: InspectCommand, argument: string, options: Readonly<Record<string, string>> = {}): string {
  const query = new URLSearchParams(options).toString();
  return `${DEV_ROUTES.inspect}${command}/${encodeURIComponent(argument)}${query === '' ? '' : `?${query}`}`;
}

/** `GET /api/archivos`: the Workspace `.dg` files and those of `--theme-path` (`soloLectura: true`), sorted by path. */
export const devFilesSchema = z.object({
  version: z.number().int(),
  archivos: z.array(z.object({ file: z.string(), hash: z.string(), soloLectura: z.boolean() })),
});
export type DevFiles = z.infer<typeof devFilesSchema>;

/** `GET /api/archivo/<path>` (404 if it does not exist): the `version` is the base of the editor's next edit. */
export const devFileSchema = z.object({ file: z.string(), texto: z.string(), hash: z.string(), version: z.number().int() });
export type DevFile = z.infer<typeof devFileSchema>;

export const fileRoute = (file: string): string => `${DEV_ROUTES.file}${file.split('/').map(encodeURIComponent).join('/')}`;

/** Inverse of `fileRoute` on the rest after the prefix; `undefined` if it is badly encoded. */
export function fileFromRoute(rest: string): string | undefined {
  try {
    return rest.split('/').map(decodeURIComponent).join('/');
  } catch {
    return undefined;
  }
}

/**
 * `POST /api/edit` with text (ADR 0007): the same shape and gate as `edit --edits`, with the `version` the page saw
 * (the server maps it to `visto`). `descripcion` names the File history entry (by default "text of <file>").
 * `aunqueNoCompile` (editor save, story 21) writes even if the text introduces errors; without it, a new error
 * rejects with `invalid` (`fix` and "Aplicar N fix", all or nothing).
 */
export const editsRequestSchema = z.object({
  ediciones: z.array(textEditSchema).min(1),
  version: z.number().int().nonnegative().optional(),
  descripcion: z.string().optional(),
  aunqueNoCompile: z.boolean().optional(),
});
export type EditsRequest = z.infer<typeof editsRequestSchema>;

/** `GET /api/codigo`: whether the Workspace Themes use Theme components with code, which ones, and whether they are already served (`/componentes.js`). */
export const devCodeSchema = z.object({ temaConCodigo: z.boolean(), componentes: z.array(z.string()), confiado: z.boolean() });
export type DevCode = z.infer<typeof devCodeSchema>;

/** `POST /api/confiar`: from now on the Themes' code is served. */
export const devTrustSchema = z.object({ ok: z.literal(true) });

/** Body of the `/api/*` boundary errors: 400 (invalid JSON or shape), 404 (route or resource), 405 (method, with `allow`) and 500 (I/O failure). */
export const devErrorSchema = z.object({ ok: z.literal(false), message: z.string() });
export type DevError = z.infer<typeof devErrorSchema>;

/** Accepted `POST /api/edit`, `/api/deshacer`, `/api/rehacer` and `/api/historial/saltar`: the `version` of the state after writing. */
export const devWriteSchema = z.object({ ok: z.literal(true), version: z.number().int() });
export type DevWrite = z.infer<typeof devWriteSchema>;

/** A boundary error (`devErrorSchema`) or a write rejection (409/422), which also carries `reason` and, if any, `file`. */
export const devRejectionSchema = devErrorSchema.extend({ reason: z.enum(REJECTION_REASONS).optional(), file: z.string().optional() });
export type DevRejection = z.infer<typeof devRejectionSchema>;

/** Body of a 404 from `/api/inspect` (or 422 if the Workspace never compiled): the `inspect` message and the nearby ids. */
export const inspectNotFoundSchema = z.object({ ok: z.literal(false), message: z.string(), suggestions: z.array(z.string()) });
export type InspectNotFound = z.infer<typeof inspectNotFoundSchema>;

/**
 * SSE events of `/eventos`, each with `event: <name>` and the data in JSON. On connect `estado`,
 * `historial` and `actividad` arrive with `previos: true`; after each `estado`, the `historial` and, if any, the `diferencia`
 * of that `version`; and an `actividad` with `previos: false` per batch appended to the log. The sequence is decided by
 * the Live workspace (`conexion` and `escuchar` in `sesion`); the real server and `devEnMemoria` only serialize it.
 */
export const DEV_EVENTS = ['estado', 'actividad', 'diferencia', 'historial'] as const;
export type DevEventName = (typeof DEV_EVENTS)[number];

/**
 * Data of `event: actividad`: Activity events of the Activity log in order. On connect one arrives with `previos: true`
 * and the last 50 of the log (maybe none); afterwards, one with `previos: false` per batch the CLI appends.
 */
export const devActivitySchema = z.object({ previos: z.boolean(), eventos: z.array(activityEventSchema) });
export type DevActivity = z.infer<typeof devActivitySchema>;

/** A `/eventos` event with its name and its data. */
export type DevEvent =
  | { name: 'estado'; data: DevState }
  | { name: 'historial'; data: DevHistory }
  | { name: 'actividad'; data: DevActivity }
  | { name: 'diferencia'; data: DevDiff };
