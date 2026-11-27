# session
Compiled state of a Workspace: compiles, validates, computes layout and edits the DSL text without touching disk; also the state of `dev` without transport.

## What it does
- `openSession` gives an immutable `Session` with `diagnose`, `build`, `geometry`, `style`, `query` (Node detail, search, `file:line`, `inspect theme`; used by `inspect`) and `update`.
- Edits the text: the single write door `applyToWorkspace` (an Intent or a list of hashed edits, all or nothing, only the Workspace's own files; those from `--theme-path` are read but not written) and the Intent `UndoHistory`. The reducer, the Gestures and applying loose edits are internal; `computeDiff` gives the pure Diff between two sources.
- Live workspace (`src/live-workspace.ts`): `openLiveWorkspace` over `LiveWorkspacePort` (disk, watcher and Activity log; `Clock` and time injected). Single owner of the protocol event sequence (`connection`, `listen`), of the write queue, the versions and the Diff with its origin. It composes the File history (`src/file-history.ts`: undo, redo and jump per file; an external write does not reset it, it only rejects with `stale-hash` if it touched a file the entry restores) and the live Activity log (`src/live-activity-log.ts`: incremental read with debounce).
- `handleDevApi` (`src/dev-api.ts`): request with raw body -> full response, never rejects; a single `ROUTES` table gives routing, 404 and 405 (400/403/409/422/500 edges and the `/components.js` bundle). A new route goes here, into the `canonical` protocol and into the `dev-ui` contract. `inMemoryPort` is the port's fake. It only exports what another package (or its tests) uses.

## What it does not do
- Does not read disk, watch changes nor serve HTTP: the disk port, the watcher, the SSE and HTTP security are `cli`'s.
- Does not parse DSL nor compute positions: that is `dsl` and `layout`.
- Does not run nor import Theme code: it receives the `.tsx` already compiled (`CompiledCode`) from the adapter.

## Depends on
`canonical`, `theme`, `dsl` and `layout` (`docs/CODING.md`, "Dependency direction").

## Entry file
`packages/session/src/index.ts` (the header summarizes the interface; the detail is in each export's TSDoc).

## Related ADR
`docs/adr/0007-interaction-and-edit-protocol.md` (Intents, Undo history and the `dev` protocol) and `docs/adr/0005-cli-for-agents.md` (structured editing and Activity log).

## Test
`pnpm --filter session test` (tests cross the public interface; fake clock and test Activity events in the root `tests/ayudas/`).
