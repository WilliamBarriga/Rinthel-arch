# shell
Capa interactiva en React sobre `render`: pan/zoom, Seleccion, navegacion entre Vistas y edicion de Pins.

## Que hace
- `VistaInteractiva` resuelve una Vista, pide la Geometria al adaptador de layout (`adaptadorDeWorker` en la pagina, `servirLayout` dentro del Worker) y la dibuja con `render`; mide texto con la fuente real (`medirEnVisor`).
- Camara con pan y zoom, Seleccion, ruta mas corta, foco, hover, colapso de Grupos con relayout y morph, Pasos con drill-down y zoom semantico (en `sequence`, Seleccion por Mensaje, Nota, Lifeline y Fragmento, teclado y `ref`/`link` entre Vistas); cada estado es controlado por props o interno, y `useEstadoEnHash` lo lleva al hash de la URL (`AdaptadorDeHash` permite renombrar claves, como hace `estudio`).
- Solo bajo `dev`, arrastres que avisan al padre sin escribir: `onMoveNode` (centro nuevo del Nodo, como un Pin) y `onReorderLifelines` (orden visible completo); si la promesa resuelve `false` el elemento vuelve a su sitio. Construir la Intencion, deshacer y rehacer es del padre (`estudio`).
- Chrome del lienzo (issues, toasts, leyenda, migas) desactivable con `chrome={false}`; `Leyenda` y `Migas` se exportan para montarlo fuera.

## Que NO hace
- No dibuja SVG ni calcula posiciones: eso es de `render` y `layout`.
- No lee ni escribe el DSL: la edicion pura es de `sesion`.
- No define el CLI ni sirve archivos: eso es de `cli`.

## Depende de
`canonical`, `tema`, `layout`, `sesion` y `render`. Dependencias externas: `d3-selection`, `d3-zoom`; `react` es peer.

## Archivo de entrada
`packages/shell/src/index.ts` (la cabecera documenta la interfaz publica y los props).

## ADR relacionado
`docs/adr/0008-sistema-de-temas-expresivo.md` (ruta, foco y medicion de texto) y `docs/adr/0007-interaccion-y-protocolo-de-edicion.md` (Gesto de mover un Pin).

## Probar
`pnpm --filter shell test`
