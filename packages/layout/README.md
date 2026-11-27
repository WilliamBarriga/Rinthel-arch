# layout
Computes the Geometry of a View (ELK for architecture, flow and er; an own algorithm for sequence) and applies the Pins.

## What it does
- `layoutView` gives the box of each visible Node and the orthogonal route of each Edge of a `VistaResuelta`.
- `layoutView` picks by `vista.type`: layered ELK for graphs; in `sequence`, `layoutSecuencia` (internal, `src/secuencia.ts`) places Lifelines (columns) and Messages (rows) without ELK. The Geometry is a union by `kind` (`grafo` or `secuencia`). The Geometry types are not declared here: they come from the `canonico` schema (`geometriaSchema`) and are imported from `canonico`.
- `layoutConMetricas` is `layoutView` over already resolved Metrics, without the Theme: the Worker (`shell`) runs it, which does not bundle the Theme schema. `render` must draw with the same Metrics.
- `claveDeLayout` and `claveDeEstructura` say when to relayout; `aplicarPinsAGeometria` applies Pins without ELK; `indiceDeGeometria` gives absolute boxes, each Node's parent and the roots.

## What it does not do
- Does not define the Metrics nor the placement of Slots: it reads them from `tema`.
- Does not draw nor handle the viewer's Worker: that is `render` and `shell`.
- Does not store the geometry on disk: that is `cli`.

## Depends on
`canonico` and `tema`. External dependency: `elkjs`.

## Entry file
`packages/layout/src/index.ts` (the header documents invariants and error modes).

## Related ADR
`docs/adr/0003-elk-layout-cached-geometry.md`.

## Test
`pnpm --filter layout test`
