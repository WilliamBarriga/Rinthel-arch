# layout
Computes the Geometry of a View (ELK for architecture, flow and er; an own algorithm for sequence) and applies the Pins.

## What it does
- `layoutView` gives the box of each visible Node and the orthogonal route of each Edge of a `ResolvedView`.
- `layoutView` picks by `view.type`: layered ELK for graphs; in `sequence`, `layoutSequence` (internal, `src/sequence.ts`) places Lifelines (columns) and Messages (rows) without ELK. The Geometry is a union by `kind` (`grafo` or `secuencia`). The Geometry types are not declared here: they come from the `canonical` schema (`geometrySchema`) and are imported from `canonical`.
- `layoutWithMetrics` is `layoutView` over already resolved Metrics, without the Theme: the Worker (`shell`) runs it, which does not bundle the Theme schema. `render` must draw with the same Metrics.
- `layoutKey` and `structureKey` say when to relayout; `applyPinsToGeometry` applies Pins without ELK; `geometryIndex` gives absolute boxes, each Node's parent and the roots.

## What it does not do
- Does not define the Metrics nor the placement of Slots: it reads them from `theme`.
- Does not draw nor handle the viewer's Worker: that is `render` and `shell`.
- Does not store the geometry on disk: that is `cli`.

## Depends on
`canonical` and `theme`. External dependency: `elkjs`.

## Entry file
`packages/layout/src/index.ts` (the header documents invariants and error modes).

## Related ADR
`docs/adr/0003-elk-layout-cached-geometry.md`.

## Test
`pnpm --filter layout test`
