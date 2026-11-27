# canonical
Zod schemas of the Canonical form, the pure functions that query it and the contracts shared by `cli`, `sesion` and `estudio`.

## What it does
- Defines and validates the schema of the Canonical form (Nodes, Edges, Views, Steps, Palette) and of the Geometry; `validate` returns `Issue`s with `hint` and `fix` (codes in `CODES`).
- `resolveView` selects the Nodes of a View and, in a `sequence` View, resolves its Interaction (Lifelines, activations; `sequence.ts`); an `er` View is resolved as `architecture`. `revealAt` interprets its Steps.
- Single owner of the versioned contracts: the edit Intents (`pin.ts`: `move-pin`, `reorder-lifelines`, `set-theme`), the `--json` outputs of `validate`, `inspect` and `edit`, the Activity event (`activity.ts`, one line of the Activity log; `createActivityReader` reads only what was appended) and the `dev` protocol (`dev.ts`: routes, SSE events, state, Diff, File history; `estudio/protocolo` re-exports it). A new field of a contract is added here, not in its user.

## What it does not do
- Does not read DSL text nor merge files: that is `dsl`.
- Does not define the content of a Theme nor compute geometry: that is `tema` and `layout`.
- Does not touch disk, clock or network: it is pure core (the on-disk Activity log is `cli`'s; the protocol is served by `cli` and produced by `sesion`).

## Depends on
No workspace package. It is the first of the chain (`docs/CODING.md`, "Dependency direction"). External dependency: `zod`.

## Entry file
`packages/canonical/src/index.ts` (the header documents invariants and error modes).

## Related ADR
`docs/adr/0001-dsl-editable-source.md` (Canonical form), `docs/adr/0002-render-theme-and-reveal.md` (Steps and Palette colors) and `docs/adr/0007-interaction-and-edit-protocol.md` (Intents and the `dev` protocol).

## Test
`pnpm --filter canonical test`
