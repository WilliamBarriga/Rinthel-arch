# sesion
Compiled state of a Workspace: compiles, validates, computes layout and edits the DSL text without touching disk; also the state of `dev` without transport.

## What it does
- `abrirSesion` gives an immutable `Sesion` with `diagnosticar`, `construir`, `geometria`, `estilo`, `consultar` (Node detail, search, `file:line`, `inspect theme`; used by `inspect`) and `actualizar`.
- Edits the text: the single write door `aplicarAlWorkspace` (an Intent or a list of hashed edits, all or nothing, only the Workspace's own files; those from `--theme-path` are read but not written) and the Intent `Historial`. The reducer, the Gestures and applying loose edits are internal; `diferenciar` gives the pure Diff between two sources.
- Live workspace (`src/workspace-vivo.ts`): `abrirWorkspaceVivo` over `PuertoDelWorkspaceVivo` (disk, watcher and Activity log; `Reloj` and time injected). Single owner of the protocol event sequence (`conexion`, `escuchar`), of the write queue, the versions and the Diff with its origin. It composes the File history (`src/historial-de-archivos.ts`: undo, redo and jump per file; an external write does not reset it, it only rejects with `stale-hash` if it touched a file the entry restores) and the live Activity log (`src/registro-de-actividad-vivo.ts`: incremental read with debounce).
- `atenderApiDeDev` (`src/api-de-dev.ts`): request with raw body -> full response, never rejects; a single `RUTAS` table gives routing, 404 and 405 (400/403/409/422/500 edges and the `/componentes.js` bundle). A new route goes here, into the `canonico` protocol and into the `estudio` contract. `puertoEnMemoria` is the port's fake. It only exports what another package (or its tests) uses.

## What it does not do
- Does not read disk, watch changes nor serve HTTP: the disk port, the watcher, the SSE and HTTP security are `cli`'s.
- Does not parse DSL nor compute positions: that is `dsl` and `layout`.
- Does not run nor import Theme code: it receives the `.tsx` already compiled (`CodigoCompilado`) from the adapter.

## Depends on
`canonico`, `tema`, `dsl` and `layout` (`docs/CODING.md`, "Dependency direction").

## Entry file
`packages/sesion/src/index.ts` (the header summarizes the interface; the detail is in each export's TSDoc).

## Related ADR
`docs/adr/0007-interaction-and-edit-protocol.md` (Intents, Undo history and the `dev` protocol) and `docs/adr/0005-cli-for-agents.md` (structured editing and Activity log).

## Test
`pnpm --filter sesion test` (tests cross the public interface; fake clock and test Activity events in the root `tests/ayudas/`).
