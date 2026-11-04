# shell

Capa interactiva sobre `render`: pan/zoom, seleccion, colapso, navegacion y Pasos.

## Que hace

- `<VistaInteractiva>` resuelve la Vista, pide la Geometria al `AdaptadorDeLayout` y la dibuja con `Diagram`.
- Camara controlada o interna (d3-zoom), Seleccion multiple y filtrado por viewport.
- Colapso de Grupos con relayout en Web Worker, drill-down con breadcrumbs, controles de Pasos, zoom semantico y estado en el hash de la URL.
- `elementoBajo` decide que hay bajo un punto del lienzo, sin DOM.

## Que NO hace

- No dibuja Nodos ni Aristas: eso es de `render`.
- No calcula layout: lo pide por el adaptador; el motor es de `layout`.
- No lee ni escribe disco ni sirve HTTP: eso es de `cli`.
- No define el Tema: recibe el Tema resuelto de `tema`.

## Depende de

`canonico`, `layout`, `render`, `sesion` y `tema`. Dependencias externas: `d3-selection`, `d3-zoom` y `react` (peer).

## Archivo de entrada

`packages/shell/src/index.ts` (la cabecera documenta la interfaz publica).

## ADR relacionado

`docs/adr/0007-interaccion-y-protocolo-de-edicion.md` (interaccion y edicion) y `docs/adr/0003-layout-elk-geometria-cacheada.md` (relayout en Worker).

## Probar

`pnpm --filter shell test`
