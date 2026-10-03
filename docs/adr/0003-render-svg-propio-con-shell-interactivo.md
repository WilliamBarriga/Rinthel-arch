# Render: nucleo SVG propio puro, shell interactivo aparte

El render es una funcion pura de geometria y tema a SVG React, sin reloj ni estado propio. El pan/zoom (d3-zoom), el colapso y la seleccion viven en un shell interactivo separado que controla las mismas props. Se descarta React Flow como renderer: ELK ya entrega posiciones, puertos y rutas de aristas, asi que React Flow solo aportaria pan/zoom y culling, su export a imagen es raster (html-to-image fijado a 1.11.11), su ejemplo de colapso es Pro y obligaria a mantener un segundo renderer para export, slides y video. tldraw queda descartado por licencia de produccion. Un solo dibujo sirve a web, slides, video y export SVG/PNG.

## Contrato del componente

Props: `geometry` (salida del layout de una Vista), `width` y `height` en px, `theme` (tokens), `expanded` y `onToggle` (colapso controlado), `visibility: (id) => 0..1` para Nodos y Aristas (slides devuelve 0 o 1 por paso, video un valor interpolado del frame), `camera`/`viewBox` controlado y `onSelect`. Sin dependencia de Next, Tailwind ni json-render; peer React 18 y 19.

## Consecuencias

- El culling con miles de Nodos se resuelve con colapso (Grupos cerrados no se dibujan) y filtrado por viewport en el shell.
- El paquete `render` es independiente de cualquier consumidor (slides, video, web): este repo no depende de ellos ni los referencia en codigo. Como se instala o integra en un repo consumidor lo decide ese repo y queda fuera de este sistema. El export SVG estatico queda como camino secundario.
- Declarar pasos de revelado en la Vista (DSL) es azucar futuro sobre `visibility`.
