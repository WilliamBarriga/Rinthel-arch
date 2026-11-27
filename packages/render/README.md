# render
React component `<Diagram>` that draws a resolved View with its Geometry and the Style of a Theme.

## What it does
- Draws Groups (HTML), Edges (SVG) and Nodes (HTML) in three layers under a pan/zoom camera; an ER View draws each table as a Node with rows.
- A `secuencia` Geometry is drawn with `construirEscenaDeSecuencia`: Lifelines with a mirrored header, activations, Messages, Fragments and Notes; it reads the already resolved stacks of those Theme elements (declared or derived) from the `tema` Style, with no derivation rules of its own.
- `resolverEstilo` turns a Theme into the painters' `Estilo`; `hojaDeFuentes` emits the deterministic sheet. `PINTORES` (`src/hoja.ts`) is the exhaustive Primitive -> painter table: a new Primitive in `tema` without a painter here breaks the typecheck.
- Paints visual states, level of detail and Steps, animates with CSS (respects reduced-motion) and accepts code only through the `componentes` prop.

## What it does not do
- Does not compute positions nor validate Themes: that is `layout` and `tema`.
- Does not resolve Views nor interpret Steps: that is `canonical`; selection and camera state is `shell`'s.
- Does not touch disk, clock or network: it is pure core.

## Depends on
`canonical`, `layout` and `tema` (`docs/CODING.md`, "Dependency direction"). External dependency: peer `react` 18 or 19.

## Entry file
`packages/render/src/index.ts` (the header documents props, invariants and error modes).

## Related ADR
`docs/adr/0008-expressive-theme-system.md` (hybrid render, Style and animation) and `docs/adr/0002-render-theme-and-reveal.md` (pure contract and color by Palette).

## Test
`pnpm --filter render test`
