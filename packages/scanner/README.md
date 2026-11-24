# scanner
The Scanner: reads a codebase, without running it, into a Scan draft `rinthel/scan@1` (folder in, draft out).

## Que hace
- `scan(root, { depth, maxFiles })` lists files (`.gitignore`, `EXCLUDED_FOLDERS`, `maxFiles` cap), finds units from manifests (`src/manifests.ts`), splits large leaf units into `folder` sub-units (`src/units.ts`), reads imports per language (`src/imports/`: TS/JS and Python, via `web-tree-sitter`) and aggregates them into `dependencies` and `externals`. `serializeDraft` gives the exact bytes `diagrams scan` writes.
- Deterministic: sorted output, ids from paths and names, no clock; the commit is read from `.git` files, never by running `git`.
- Reads database tables statically (`src/tables/`): Prisma schemas and SQL DDL with hand-written readers (no parser dependency), table ids and relation targets resolved across extractors.
- For refreshing a Workspace (`src/refresh.ts`): `diffDrafts(previous, current)` gives the ids added and removed between two drafts, and `idMatcher(patterns)` matches ids against `.rinthel/scan-ignore`.
- Extension points: `MANIFEST_READERS`, `IMPORT_EXTRACTORS` and `TABLE_EXTRACTORS` (`src/tables/index.ts`).

## Que NO hace
- No writes to disk, no summary text, no Scan coverage against a Workspace (it needs the compiled Model): that is `cli` (`diagrams scan`, `src/scan-coverage.ts`).
- No knowledge of the DSL, the Model or Themes: the agent turns the draft into `.dg` files and `validate` checks them.

## Depende de
No workspace package; only `cli` imports it (`pnpm check:deps`, rule `aislado`). External: `web-tree-sitter` with the `.wasm` grammars of `tree-sitter-typescript` and `tree-sitter-python` (their native build scripts are disabled in `pnpm-workspace.yaml`), and `ignore`.

## Archivo de entrada
`packages/scanner/src/index.ts` (the header documents interface, invariants and modes of error; the draft's shape is `packages/scanner/src/draft.ts`).

## ADR relacionado
`docs/adr/0010-importador-de-codebases.md`.

## Probar
`pnpm --filter scanner test` (requires `pnpm build`).
