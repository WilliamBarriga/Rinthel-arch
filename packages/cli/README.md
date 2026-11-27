# cli
The `diagrams` binary: validates, builds, queries, edits and serves Workspaces from the terminal.

## What it does
- Commands `validate`, `build`, `skill`, `inspect` (`search`, `node`, `view`, `interaction`, `theme`), `edit`, `dev`, `scan` and `export`; `run(argv, dependencias?)` returns `{ exitCode, stdout, stderr }` and does not write to the process (`bin.ts` prints). Each command's `--help` lives in `src/ayuda.ts`; the options, in `docs/guide/cli.md`.
- It is the only package that reads and writes the Workspace on disk; `edit` is the only write on the DSL. `--json` gives one contract per command (schemas in `canonical`).
- Activity log: `validate`, `build`, `inspect` and `edit` append an Event (`src/actividad.ts`; `DIAGRAMS_ACTIVITY=0` turns it off, `DIAGRAMS_AGENT` names the agent). `src/registro-en-disco.ts` is its only owner on disk: `.diagrams/activity.jsonl` (`CARPETA_DE_SALIDA` of `workspace.ts`), appended with rotation at 1 MB and watched for `dev`.
- `dev` (`src/dev.ts`) serves the `dev-ui` app (`/` and `/_dev-ui/*`, read from disk on every request: a rebuild shows on reload) and delegates `/api/*` to `handleDevApi` over the Live workspace of `session`; only the disk port lives here (`puertoDeDisco`, replaceable with the `puerto` option; TCP is `puertoHttp`), plus the watcher, the SSE and HTTP security (Host, Origin, size). `src/codigo.ts` compiles Themes with code (`.tsx`) with esbuild, without running them.
- `export` (`src/export.ts`) opens the live Workspace once (no server, no watcher), captures its data through `handleDevApi` with `captureExport` (fonts read with `leerArchivoDeFuente`) and writes `exportHtml` from `dev-ui`: one read-only HTML.

## What it does not do
- Does not compile DSL nor validate: that is `session`.
- Does not compute geometry nor draw: that is `layout`, `render` and `shell`.
- Has no browser code: the `dev` page and the export page are `dev-ui`'s (from it, it takes `devUiAssets`, `DEV_UI_ROUTE`, `devUiFolder`, `captureExport` and `exportHtml`).

## Depends on
`canonical`, `dsl`, `session` and `dev-ui`. External dependency: `esbuild`.

## Entry file
`packages/cli/src/index.ts` (the header documents interface, invariants and error modes).

## Related ADR
`docs/adr/0005-cli-for-agents.md` (with its Activity log amendment, and `0008-expressive-theme-system.md` for Themes with code).

## Test
`pnpm --filter cli test` (includes the `dev` contract against the real server and the Chromium end-to-end tests `test/e2e-estudio.test.ts` and `test/e2e-export.test.ts`, which opens an export over http and over `file://`; requires `pnpm build`).
