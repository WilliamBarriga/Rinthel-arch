# tema
Catalog of Primitives and Slots, schema of the resolved Theme and Resolved style (Metrics and paint).

## What it does
- Defines the catalog (`CATALOGO`, `SLOTS`, `MOVIMIENTOS`, `EFECTOS`), source of `docs/theme-catalog.md` (`referenciaDelCatalogo`; after changing it, `pnpm docs:catalogo`). `resolverTema` validates a Theme; `TEMA_NEUTRO` is the resolved base (the DSL `neutral` is declared by `dsl`) and `TEMA_ALTO_CONTRASTE` the viewer's built-in.
- `estiloResuelto(tema)` gives `{ metricas, pintura }` with cascade and patches; `colocarNodo` places Slots and `resolverColor` resolves colors; `temaParaDiagrama(tema, tipo)` applies the `diagram <tipo>` patches (a level between the base Theme and the Node kind); `tablaDeMetricas` and `estiloResuelto` receive it as `diagrama`.
- Defines the sequence Elements (`lifeline`, `activation`, `message`, `fragment`, `note`) and the ER one (`row`); a Theme that does not declare them receives them derived from `node` and `edge` in the Resolved style (`derivacion.ts`, the only place with those rules; `derivado: true`).
- Computes contrast, legend and text measuring tables; `fnv1a` (`semilla.ts`) is the only hash, reused by the `render` fingerprint and `hashDeFuente`.

## What it does not do
- Does not read nor compile the DSL text of a Theme: that is `dsl`.
- Does not compute positions nor draw: that is `layout` and `render`.
- Does not measure text in the browser nor decide whether a warning blocks: that is `shell` and `sesion`.

## Depends on
`canonical` (Model types and constants, `CODES` and `nearestCandidates`). External dependency: `zod`.

## Entry file
`packages/tema/src/index.ts` (the header documents the full interface).

## Related ADR
`docs/adr/0008-expressive-theme-system.md`.

## Test
`pnpm --filter tema test`
