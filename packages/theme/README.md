# theme
Catalog of Primitives and Slots, schema of the resolved Theme and Resolved style (Metrics and paint).

## What it does
- Defines the catalog (`CATALOG`, `SLOTS`, `MOTIONS`, `EFFECTS`), source of `docs/theme-catalog.md` (`catalogReference`; after changing it, `pnpm docs:catalog`). `resolveTheme` validates a Theme; `NEUTRAL_THEME` is the resolved base (the DSL `neutral` is declared by `dsl`) and `HIGH_CONTRAST_THEME` the viewer's built-in.
- `resolvedStyle(theme)` gives `{ metricas, pintura }` with cascade and patches; `placeNode` places Slots and `resolveColor` resolves colors; `themeForDiagram(theme, type)` applies the `diagram <type>` patches (a level between the base Theme and the Node kind); `metricsTable` and `resolvedStyle` receive it as `diagrama`.
- Defines the sequence Elements (`lifeline`, `activation`, `message`, `fragment`, `note`) and the ER one (`row`); a Theme that does not declare them receives them derived from `node` and `edge` in the Resolved style (`derivation.ts`, the only place with those rules; `derivado: true`).
- Computes contrast, legend and text measuring tables; `fnv1a` (`seed.ts`) is the only hash, reused by the `render` fingerprint and `fontHash`.
- Object keys of the resolved Theme, the Metrics and the paint (`capas`, `metricas`, `pintura`...) are still Spanish: they travel in the Canonical form and the `inspect theme` output, so renaming them is a contract change.

## What it does not do
- Does not read nor compile the DSL text of a Theme: that is `dsl`.
- Does not compute positions nor draw: that is `layout` and `render`.
- Does not measure text in the browser nor decide whether a warning blocks: that is `shell` and `session`.

## Depends on
`canonical` (Model types and constants, `CODES` and `nearestCandidates`). External dependency: `zod`.

## Entry file
`packages/theme/src/index.ts` (the header documents the full interface).

## Related ADR
`docs/adr/0008-expressive-theme-system.md`.

## Test
`pnpm --filter theme test`
