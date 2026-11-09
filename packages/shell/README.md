# shell

Capa interactiva en React sobre `render`: pan/zoom, Seleccion, navegacion entre Vistas y edicion de Pins.

## Que hace
- `VistaInteractiva` resuelve una Vista, pide la Geometria al adaptador de `layout` y la dibuja con `render`.
- Camara con pan y zoom, Seleccion, ruta mas corta, foco, hover, colapso de Grupos con relayout en Worker y Pasos con drill-down.
- Arrastre de Nodos que emite el Gesto de mover un Pin, con deshacer y rehacer (`sesion`), y recarga de Tema al guardar.
- En Vistas `sequence`: seleccion por Mensaje, Nota, Lifeline y Fragmento, teclado, `ref` y `link` entre Vistas, y arrastre de cabecera que emite la Intencion `ordenar-lifelines`.

## Que NO hace
- No dibuja SVG ni calcula posiciones: eso es de `render` y `layout`.
- No lee ni escribe el DSL: la edicion pura es de `sesion`.
- No define el CLI ni sirve archivos: eso es de `cli`.

## Depende de
`canonico`, `tema`, `layout`, `sesion` y `render`. Dependencias externas: `d3-selection`, `d3-zoom`; `react` es peer.

## Archivo de entrada
`packages/shell/src/index.ts` (la cabecera documenta la interfaz publica y los props).

## ADR relacionado
`docs/adr/0008-sistema-de-temas-expresivo.md` (ruta, foco y medicion de texto) y `docs/adr/0007-interaccion-y-protocolo-de-edicion.md` (Gesto de mover un Pin).

## Probar
`pnpm --filter shell test`
