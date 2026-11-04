# render

Dibuja una Vista resuelta con su Geometria como componente React.

## Que hace

- `<Diagram>` pinta Grupos (HTML), Aristas (SVG) y Nodos (HTML) bajo un contenedor con un solo `transform` de camara.
- `resolverEstilo` entrega el Estilo del Tema; cada Primitiva tiene su pintor y la hoja de estilo es determinista.
- Acepta `visibility`, `camera`, `detail`, `onSelect` y `onToggle`; el revelado de Pasos lo produce `revealAt` de `canonico`.
- Recibe la Geometria ya calculada, asi sirve a cualquier caso de uso (visor, slides, video).

## Que NO hace

- No calcula layout: recibe la Geometria de `layout`.
- No maneja pan/zoom, seleccion ni Worker: eso es de `shell`.
- No lee texto DSL ni disco.

## Depende de

`canonico`, `layout` y `tema`. Dependencia externa: `react` (peer).

## Archivo de entrada

`packages/render/src/index.ts` (la cabecera documenta el contrato del componente).

## ADR relacionado

`docs/adr/0002-render-tema-y-revelado.md` (contrato puro y revelado) y `docs/adr/0008-sistema-de-temas-expresivo.md` (render hibrido y Estilo resuelto).

## Probar

`pnpm --filter render test`
