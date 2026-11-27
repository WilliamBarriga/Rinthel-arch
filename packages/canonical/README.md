# canonical
Zod schemas of the Canonical form, the pure functions that query it and the contracts shared by `cli`, `sesion` and `estudio`.

## Que hace
- Defines and validates the schema of the Canonical form (Nodes, Edges, Views, Steps, Palette) and of the Geometry; `validate` returns `Issue`s with `hint` and `fix` (codes in `CODES`).
- `resolveView` selects the Nodes of a View and, in a `sequence` View, resolves its Interaction (Lifelines, activations; `sequence.ts`); an `er` View resolves like `architecture`. `revealAt` interprets its Steps.
- Single owner of the versioned contracts: the edit Intents (`pin.ts`: `move-pin`, `reorder-lifelines`, `set-theme`), the `--json` outputs of `validate`, `inspect` and `edit`, the Activity event (`activity.ts`, one line of the Activity log; `createActivityReader` reads only what was appended) and the `dev` protocol (`dev.ts`: routes, SSE events, state, Diff, File history; `estudio/protocolo` re-exports it). A new field of a contract is added here, not where it is used.

## Que NO hace
- Does not read DSL text or merge files: that is `dsl`.
- Does not define the content of a Theme or compute geometry: that is `tema` and `layout`.
- Does not touch disk, clock or network: it is pure core (the Activity log on disk belongs to `cli`; `cli` serves the protocol and `sesion` produces it).

## Depende de
No workspace package. It is the first of the chain (`docs/CODING.md`, "Direccion de dependencias"). External dependency: `zod`.

## Archivo de entrada
`packages/canonical/src/index.ts` (its header documents invariants and error modes).

## ADR relacionado
`docs/adr/0001-dsl-fuente-editable.md` (Canonical form), `docs/adr/0002-render-tema-y-revelado.md` (Steps and Palette colors) and `docs/adr/0007-interaccion-y-protocolo-de-edicion.md` (Intents and the `dev` protocol).

## Probar
`pnpm --filter canonical test`
