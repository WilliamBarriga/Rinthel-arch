# Interaction and edit protocol: Intents, pure reducer and history

## Intent: union discriminated by `tipo`

Every edit born from interaction is an `Intencion` (package `sesion`): a union discriminated by `tipo`. There are two variants (the Amendment: UI routes and writes adds `set-theme`): `reorder-lifelines` (ADR 0009: `{ vista, orden }`, rewrites the `order` of a sequence View) and `move-pin`, which is the `IntencionDePin` of `canonico` (`{ vista, nodo, x, y }`, without `hash`) plus `tipo: 'move-pin'`. The Intent carries no `hash`: the concurrency check is a separate parameter, `visto`, of whoever applies it (see Pure reducer). Each future tool (resize, rename, create Edge) is added as a new variant with its branch in the reducer; the rest of the protocol does not change.

Over the network every Intent travels through `POST /api/edit` of `dev`, with its `tipo` and the `version` of the state the page saw, without `hash` (see `dev` protocol). The output of `edit --json` and the endpoint's response keep their shape (ADR 0005). The route `POST /api/pin` (body `IntencionDePin` without `tipo`) was removed (#164).

## Pure reducer

`aplicarIntencion(archivos, intencion, visto?)` returns the new files or a rejection with a `motivo` (`MotivoDeRechazo`). It is pure: no disk, clock or DOM, tested without jsdom. `move-pin` is an internal Gesture of `sesion` (computing the minimal edit, self-test and applying in memory). `visto` is a map file -> hash of the text seen by whoever emits the Intent. It is rejected with `stale-hash` only if some file that the edit changes differs from `visto`; files it does not touch do not count. Without `visto`, the Intent is applied over the current text. The write gate is `aplicarAlWorkspace(puerto, aplicable, visto?)`; in `dev` the page sends the `version` of the state it saw and the Live workspace translates it into `visto` with the per-file hashes of that version (it keeps the last 16; a forgotten version is rejected as `stale-hash`), and `diagrams edit` with `--hash <file>=<hash>`. The DSL text is still the only editable source (ADR 0001): an Intent always reduces to text edits.

## Undo and redo history

`Historial` is an immutable value over the Workspace text: `archivos` (current), `pasado` and `futuro` (snapshots of the file map). `editarEnHistorial` applies an Intent and pushes it, discards the future and leaves the history intact on a rejection; `deshacer` and `rehacer` return another history, or `undefined` if there is nothing to do. Undo restores the text exactly (byte for byte), not an inverse edit. Snapshots of the map are chosen because they are cheap (strings are shared) and cannot diverge from the text.

## Shell

`shell` does not expose a stateful edit control: the pure history lives in `sesion`. The `dev` server writes to disk through `POST /api/edit`, `POST /api/deshacer` and `POST /api/rehacer`; `shell` does not know those routes nor export HTTP clients: it reports the Gestures (`onMoveNode`, `onReorderLifelines`) and the double click on an element (`onOpen`, #184; that double click does not zoom) and the writer is the `dev` page. `dev` keeps a `Historial` of the Workspace's own text: each edit pushes it (`apilar`) and undo/redo write the exact text of the snapshot (since #190 it is the File history of `sesion`, `historial-de-archivos.ts`, which the Live workspace composes: each entry keeps the text before and after each file that changed; see Amendment: History under external writes and text editor). If the disk no longer matches the history (external edit), they answer 409 `stale-hash` and the history starts over (replaced: see Amendment: History under external writes and text editor); with nothing to undo or redo, 422. The `dev` page wires Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y) to those endpoints, except with focus in a text field.

## `dev` protocol and single client (#164, spec #153)

The `dev` page has a single client module (`packages/estudio/navegador/cliente.ts`; formerly in `cli/navegador/`), the only browser piece that knows routes:

- **State**: `/eventos` (SSE, the state on connect and after each recompilation) and `/api/estado`. It carries the `version` and the classification of the `cambio` (`pintura` | `estructura` | `codigo`, ADR 0005); it no longer carries per-file hashes or the file of each View.
- **Write**: `POST /api/edit` with `{ ...intencion, version }`; `POST /api/deshacer` and `POST /api/rehacer`. A 409 `stale-hash` reloads the state and warns.
- **Geometry**: `/api/vista/<id>`, validated with `geometriaCacheadaSchema` from `canonico`; a malformed one is reported and not drawn. The page requests only the Geometry of the active View, and another View's when navigating to it. After an `estructura` change (or if a version was skipped) it requests the active View's again and keeps showing the previous drawing until it arrives; after `pintura` or `codigo` it requests none. If a Geometry does not arrive, `VistaInteractiva` computes it in the Worker.

## Consequences

- Rejection by stale hash stays, but `visto` decides it (a parameter of whoever applies), not a field of the Intent: an Intent is computed against the text its emitter saw.
- One history per editing session; it does not persist across reloads.
- A stack of inverse edits (fragile under DSL format changes) and a history of replayable Intents (the result would depend on the base text) are discarded.

## Amendment: `pin x,y` is the center of the Node (#26, spec #24)

The coordinates of `IntencionDePin`, of `move-pin` and of the `pin x,y` written in the DSL are those of the **center** of the Node, relative to its parent Group (ADR 0003, ADR 0008). The move Gesture (`onMoveNode` in `shell`) reports the center of the dropped box; the `move-pin` Gesture still writes the `Intencion` as is, without knowing sizes. The shape of the network interfaces and of `edit --json` does not change.

## Amendment: History under external writes and text editor (#174, map #168)

- An external write no longer resets the `dev` history. Undo and redo are rejected with `stale-hash` only if some file the snapshot restores changed outside (the same rule as `visto`); entries that do not touch that file stay valid.
- The UI text editor saves only with a debounce (~400 ms) through the write gate with `visto`; each save is an entry of the `dev` history (own origin). With focus in the editor, Ctrl/Cmd+Z uses the editor's own history; outside it, `dev`'s.
- It saves even if the text does not compile; the canvas keeps the last good source and the Gestures are disabled with the reason visible.

## Amendment: UI routes and writes (#176, map #168)

Routes, events and their schemas have a single owner, `canonico` (ADR 0004, amendment #201), and `estudio/protocolo` re-exports them for the page. Since #184 the translation of rejections into HTTP comes from `canonico`, and the Live workspace with its `/api/*` routes (`atenderApiDeDev`) from `sesion`, so `dev` and `devEnMemoria` share the same code and only the transport differs. The single client of the `dev` protocol section moves from `packages/cli/navegador/` to `estudio` and is still the only browser piece that knows routes.

### Write

- **Text edits through `POST /api/edit`**: besides an Intent, it accepts `{ ediciones: [{ file, range, replacement }], version, descripcion? }`, the same shape and the same path as `diagrams edit --edits`. Saving from the editor sends the minimal changes of the buffer (not the whole file); applying an Issue's `fix` sends its `IssueFix` as is, with the `version` of the state in which it was seen, one Issue per request (except "Apply all `fix`es", which gathers the visible ones in a single request; see Amendment: Bulk fix and jump in the history). There are no `escribir-archivo` or `aplicar-fix` Intents: both are text. The editor save also sends `aunqueNoCompile: true`, which skips only the error self-test of the gate (it still rejects hash, range, overlap and `unknown-file`): that way it saves even if it does not compile; without the field (`fix`, "Apply N fixes", `edit --edits`) a new error rejects with `invalid`. With no per-edit `hash`, the `version` is translated into a per-file `visto` (#190).
- **Intent `set-theme`** `{ vista, tema? }`: rewrites the name in the View's `theme <name>`, keeping its patch; without `theme`, it inserts `theme <name>` as the first line of the View body. Without `tema`, it removes the line (the View goes back to the Default theme); if there was a patch, it writes `theme neutral { patch }` so it is not lost. An undeclared Theme is rejected with the new reason `unknown-theme` (422). Per View only: the DSL has no Workspace Theme.
- Writes happen only inside the Workspace: a file from `--theme-path` is rejected with `unknown-file`.
- Errors without schema change: 400 malformed body; 403/405/415 origin, method, content-type; 409 `stale-hash`; 422 the other reasons. Amendment (#200): `atenderApiDeDev` receives the raw body and always returns the full response, owning routing, 400, 404, 405 (with `allow`), 409, 422 and 500, with body `{ ok: false, mensaje }` (`errorDeDevSchema`); the HTTP adapter is left with Host (403), Origin (403), content-type (415) and body size (413). Amendment (#202): `atenderApiDeDev` also serves the `/componentes.js` bundle (`text/javascript`; 403 `{ ok: false, mensaje }` until trusted), and the page client is the only piece that requests `/api/codigo`, `/api/confiar` and the bundle, with a schema and without throwing; the `estado` event is validated like `GET /api/estado` and a malformed one is dropped with a warning.

### Read

- `GET /api/archivos`: `{ version, archivos: [{ file, hash, soloLectura }] }`, the `.dg` files of the Workspace and those of `--theme-path` (these with `soloLectura: true`). `EstadoDeDev` still has no per-file hashes.
- `GET /api/archivo/<path>`: `{ file, texto, hash, version }`; the `version` is the base of the editor's next edit. 404 if it does not exist.
- `GET /api/inspect/<command>/<argument>` (`search`, `node`, `view`, `interaction`, `theme`; the `theme` options in the query): the same JSON as `inspect --json` (`SalidaDeInspect`, same `contractVersion`); 404 with the message and the nearby ids if it does not exist. The list of Themes of the gallery comes from `fuente.themes` of the state.
- `GET /api/vista/<id>?tema=<name>`: the Geometry of the View computed with another Theme (its Metrics), to preview without writing or touching the history; it is not cached between requests. 404 if the View or the Theme does not exist. The browser resolves the style. There is no thumbnail route.

### Visible history

`dev` pushes the history over SSE as `event: historial` (apart from `estado`, `actividad` (ADR 0005) and `diferencia`, the Diff with its origin and `version`): `{ pasado: [entry], futuro: [entry] }`, each entry `{ descripcion, archivos, cuando }` (the Amendment: Bulk fix and jump in the history adds `id` and `alcanzable`). The server builds the `descripcion` from the Intent; for text edits it is the request's `descripcion` or, without it, "text of `<file>`". Undo and redo are still one step; jumping to an entry is a separate operation (same amendment).

## Amendment: Bulk fix and jump in the history (#182, map #168)

- **Apply all `fix`es**: acts on the Issues with a `fix` that the Issues panel shows under its active filter, of any severity. They travel in **one** request `POST /api/edit { ediciones, version, descripcion }` (the same route and the same reducer as `edit --edits`) and become **one** history entry. It is all or nothing (`aplicarSobre`): on `overlapping-edits` or `invalid` nothing is written and the user applies them one by one; on 409 the panel is recomputed. There is no automatic subset, nor a new route, Intent or CLI change.
- **Jump in the history**: pure operation `saltar(historial, id)` in `sesion`, not repeated undo/redo; `dev` writes the target snapshot once through `POST /api/historial/saltar { id }`. 409 `stale-hash` rejection with the same rule as undo (some file the snapshot restores changed outside); 422 if the `id` does not exist. A click on a past entry goes to the state right after it; on a future one it redoes up to it inclusive; the "Start" row goes back to the text before the first entry. The jump does not push and keeps the future.
- **Entries**: `event: historial` carries `{ id, descripcion, archivos, cuando, alcanzable }`; `id` is a stable counter of the `dev` process and `dev` computes `alcanzable` with the rejection rule. The History island lists the most recent at the top, marks the current position, dims the future and disables unreachable entries with the reason; no preview on hover. Implemented in #193: the 422 carries the reason `unknown-entry`; `id` 0 is Start; each unreachable entry carries `motivo` and the event adds `inicio: { alcanzable, motivo? }`; `dev` pushes it on connect and after each recompilation.

## Amendment: read-only client of an export (spec #226, ticket #245)

An exported Dev UI (`diagrams export`) has no `dev` server: `<Estudio>` receives a `cliente` instead of `fetch` and `eventos`, the read-only client (`estudio/navegador/exportado/`). It serves the data captured once through this same protocol (`capturarExportado`: the connection state, `inspect tema` per Theme and the Theme components bundle), refuses every write, emits no SSE events and never returns a Geometry. `modo: 'export'` (`estudio/navegador/marco/modo.ts`) is the single flag of the read-only mode: registry entries marked `soloEnDev` (Code, Details, Issues, Undo history, Agent, the agent pills and the writing commands) are left out, the canvas has no Gestures and the Themes gallery previews without pinning. No route or schema of the protocol changes.
