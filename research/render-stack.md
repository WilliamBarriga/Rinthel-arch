# Research: stack de render React para diagramas grandes (t02)

Fecha: 2026-10-03. Fuentes primarias (docs/licencias oficiales). Lo no verificado se marca **[no verificado]**.

## Pregunta
Que opciones (React Flow/xyflow, SVG propio, tldraw, Cytoscape, D3, Konva) rinden con miles de nodos, zoom/pan, grupos colapsables, nodos React custom, export SVG/PNG y embebido en slides? Costos y limites.

## Resumen

| Opcion | Nodos React custom | Grupos/colapso | Escala (miles) | Export SVG/PNG | Licencia |
|---|---|---|---|---|---|
| React Flow (@xyflow/react) | Nativo (DOM) | `parentId` + `hidden`; ejemplo expand/collapse es Pro | DOM; mitigaciones propias, sin cifras oficiales | PNG via html-to-image (version fijada); SVG estatico via SSR | MIT |
| SVG propio (React + d3-zoom) | Total | A construir | Depende de ti (DOM/SVG) | SVG trivial; PNG a construir | ISC (d3-zoom) |
| tldraw | Shapes custom con componentes React | **[no verificado]** colapso nativo | **[no verificado]** | SVG/PNG en el Editor | Prohibe produccion sin licencia comercial/trial |
| Cytoscape.js | No (canvas/WebGL, no React) | Compound nodes (colapso via extension, **[no verificado]**) | Mejor medido: WebGL 1.2k nodos/16k aristas >100 FPS | PNG/JPG/SVG mencionados (SVG: **[no verificado]** si core) | MIT |
| D3 | Toolbox, no framework | A construir | SVG o Canvas a eleccion | A construir | **[no verificado]** (d3-zoom ISC) |
| Konva | No (canvas; react-konva no revisado) | A construir | Canvas; sin limite declarado | **[no verificado]** | **[no verificado]** |

## React Flow / xyflow
- Paquete `@xyflow/react`; v12 anade soporte SSR y `node.measured.width/height`. https://reactflow.dev/learn/troubleshooting/migrate-to-v12
- Licencia MIT (copyright webkid GmbH). https://github.com/xyflow/xyflow/blob/main/LICENSE
- Rendimiento: memoizar componentes/funciones/objetos pasados como props, no leer `nodes`/`edges` completos en el store, ocultar nodos anidados via `hidden`, simplificar CSS (animaciones, sombras, gradientes). No da cifras de nodos. https://reactflow.dev/learn/advanced-use/performance
- `onlyRenderVisibleElements`: renderiza solo lo visible, pero introduce overhead de computo; zoom por defecto min 0.5 / max 2 (configurable). https://reactflow.dev/api-reference/react-flow
- Sub-flows: `parentId`, hijos con posicion relativa, padres antes que hijos en el array, `extent: 'parent'`. Hijos no son hijos en el DOM. La pagina no cubre colapso. https://reactflow.dev/learn/layouting/sub-flows
- Expand/collapse: ejemplo con hook `useExpandCollapse` + Dagre; **es ejemplo Pro** (licencia Pro, no MIT) -> habria que reimplementarlo. https://reactflow.dev/examples/layout/expand-collapse
- Export imagen: html-to-image fijado a 1.11.11; versiones posteriores no exportan bien (issue abierto https://github.com/bubkoo/html-to-image/issues/516). Es rasterizacion del DOM, no SVG vectorial. https://reactflow.dev/examples/misc/download-image
- SSR/SVG estatico: requiere width/height de nodos y `handles` explicitos; `renderToStaticMarkup` produce HTML estatico para docs. Util para embeber en slides sin JS. https://reactflow.dev/learn/advanced-use/ssr-ssg-configuration

## SVG propio / D3
- D3 es toolbox de bajo nivel (sin concepto de "chart"), trabaja con SVG, Canvas, DOM. https://d3js.org/what-is-d3
- d3-zoom es agnostico del DOM: SVG, HTML o Canvas; licencia ISC. https://github.com/d3/d3-zoom
- Implicacion: control total (nodos React como `foreignObject` o HTML sobrepuesto, export SVG directo) pero se construye interaccion, culling, seleccion, edges, colapso. Costo de ingenieria mayor.

## tldraw
- Shapes custom = `ShapeUtil` con `component` React, registrados en `<Tldraw shapeUtils>`; `meta` para datos propios. https://tldraw.dev/docs/shapes
- Editor expone export de imagen (SVG, PNG, otros) segun su indice de docs. https://tldraw.dev/docs/editor
- Licencia: la gratuita **prohibe uso en produccion** (despliegue que da funcionalidad a usuarios/publico); requiere licencia trial o comercial; license key con enforcement tecnico. https://github.com/tldraw/tldraw/blob/main/LICENSE.md
- Riesgo: es un editor de whiteboard, no un motor de grafos; sin layout ni colapso verificados. La licencia es bloqueante para un sistema propio abierto.

## Cytoscape.js
- Libreria de grafos MIT, compound nodes, layouts (CoSE, fCoSE, Cola, Dagre, ELK), headless en Node. https://js.cytoscape.org/
- Hints de rendimiento: `hideEdgesOnViewport`, `textureOnViewport`, `motionBlur`, `pixelRatio`. https://js.cytoscape.org/
- WebGL (preview, ene 2025): 1.2k nodos/16k aristas 20 -> >100 FPS; 3.2k nodos/68k aristas 3 -> 10 FPS. Limites: aristas solo straight/haystack/bezier, sin dashed, sin labels source/target, flechas triangulo. https://blog.js.cytoscape.org/2025/01/13/webgl-preview/
- Export PNG/JPG nativo; SVG mencionado en docs (no confirmado si core o extension). https://js.cytoscape.org/#core/export
- Limite para este proyecto: no renderiza nodos React; el contenido rico se dibuja con estilos canvas.

## Konva
- Canvas 2D. Tips: minimizar capas (~41 MB por capa en 1920x1080 retina), `listening(false)`, cachear shapes, ocultar fuera de vista (`visible(false)`). Sin limite de shapes declarado. Mobile Safari: techo de 256-384 MB de canvas (se queda en blanco). https://konvajs.org/docs/performance/All_Performance_Tips.html
- No es DOM: sin nodos React reales, export SVG no nativo **[no verificado]**.

## Conclusiones (inputs para t08, no decision)
1. Nodos React custom + export SVG estatico + embebido en slides apuntan a DOM/SVG: React Flow (MIT) o SVG propio sobre d3-zoom.
2. React Flow da pan/zoom, culling opcional y sub-flows gratis; colapso y export SVG vectorial hay que construirlos (el ejemplo de colapso es Pro). Con miles de nodos, apoyarse en `hidden` (colapso/drill-down) mas que en culling.
3. Canvas/WebGL (Cytoscape, Konva) rinden mas en volumen bruto pero pierden nodos React y fidelidad de export; solo valen como modo "vista general" si hiciera falta.
4. tldraw: descartable por licencia de produccion salvo licencia comercial.
5. Pendiente: benchmark propio de React Flow a 2k/5k/10k nodos con `onlyRenderVisibleElements` y colapso (no hay cifras oficiales).
