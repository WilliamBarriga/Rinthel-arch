# shell

Capa interactiva en React sobre `render`: pan/zoom, Seleccion, navegacion entre Vistas y edicion de Pins.

## Que hace

- `VistaInteractiva` resuelve una Vista, pide la Geometria al adaptador de `layout` y la dibuja con `render`.
- Camara con pan y zoom (d3-zoom), filtrado por viewport y zoom semantico.
- Seleccion, ruta mas corta, foco por teclado, hover y colapso de Grupos con relayout en Worker.
- Pasos con controles anterior/siguiente, drill-down con breadcrumbs y estado de la Vista en el hash de la URL.
- Arrastre de Nodos que emite el Gesto de mover un Pin, con historial de deshacer y rehacer (`sesion`).
- Recarga de Tema al guardar su archivo y medicion de texto con la fuente real.

## Que NO hace

- No dibuja SVG: eso es de `render`.
- No calcula posiciones: eso es de `layout`; el shell solo llama al adaptador `AdaptadorDeLayout`.
- No lee ni escribe el DSL en disco: la edicion y el historial puros son de `sesion`.
- No define el CLI ni sirve archivos: eso es de `cli`.

## Depende de

`canonico`, `tema`, `layout`, `sesion` y `render`. Dependencias externas: `d3-selection`, `d3-zoom`; `react` es peer.

## Archivo de entrada

`packages/shell/src/index.ts` (la cabecera documenta la interfaz publica y los props).

## ADR relacionado

`docs/adr/0008-sistema-de-temas-expresivo.md` (ruta, foco y medicion de texto) y `docs/adr/0007-interaccion-y-protocolo-de-edicion.md` (Gesto de mover un Pin).

## Probar

`pnpm --filter shell test`
