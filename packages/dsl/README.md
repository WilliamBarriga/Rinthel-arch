# dsl
Compiler from the Text DSL (Langium grammar) to the Canonical form.

## What it does
- `compile` merges the Workspace files deterministically and returns the Canonical form with its positioned `Issue`s, without throwing.
- Compiles `interaction`, `type sequence`, `type er` and the `theme` block, whose Layers and Slots it validates against the `tema` catalog, including the sequence Elements (`lifeline`, `activation`, `message`, `fragment`, `note`) and the ER one (`row`).
- Returns the text position of each `pin` and each value (`ubicar`), the basis of Pin editing.
- Declares in DSL the built-in Themes `neutral` and `neutral-dark` (`src/incorporados.ts`, zero contrast warnings); `high-contrast` belongs to `tema`. The grammar is `src/gramatica/diagramas.langium`; `src/generated/` comes from `pnpm generate` (run by `build`), it is neither versioned nor edited.

## What it does not do
- Does not define nor validate the schema of the Canonical form: that is `canonico`.
- Does not define the catalog of Primitives, Slots and Effects nor compute geometry: that is `tema` and `layout`.
- Does not read disk: it receives `ArchivosDelWorkspace` already read.

## Depends on
`canonico` and `tema` (`docs/CODING.md`, "Dependency direction"). External dependency: `langium`.

## Entry file
`packages/dsl/src/index.ts` (the header documents invariants and error modes).

## Related ADR
`docs/adr/0001-dsl-editable-source.md` (the DSL is the only editable source) and `docs/adr/0008-expressive-theme-system.md` (syntax of the `theme` block).

## Test
`pnpm --filter dsl test`
