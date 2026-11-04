# Ramas research y prototype

Indice de las ramas `research/*` y `prototype/*`: una conclusion por rama y el comando para leerla. No copia las investigaciones; lee la rama antes de re-investigar. Mantenido a mano, sin test (un clon no siempre trae todas las ramas).

Listar: `git branch -a -l '*research/*' '*prototype/*'`

## Research

Cada rama tiene un solo archivo, `research/<nombre>.md`. Leer: `git show research/<nombre>:research/<nombre>.md`.

| Rama | Conclusion | Leer |
|---|---|---|
| `research/animacion-efectos` | Base CSS + WAAPI nativos sin dependencia; Motion (MIT) solo en la via "con codigo" y con ticket/ADR propio; descartar GSAP (licencia no OSI) y anime.js. | `git show research/animacion-efectos:research/animacion-efectos.md` |
| `research/capturas-visuales` | Playwright (Apache-2.0, Chromium headless) como devDependency de la raiz, no de ningun paquete; el shell no tiene senal de layout terminado (propuesto `data-layout="listo"` en `.rd-vista`); Firefox descartado. | `git show research/capturas-visuales:research/capturas-visuales.md` |
| `research/dsl-landscape` | LikeC4 (MIT) era la unica opcion con modelo, Vistas, anidacion, TS y herramientas para agentes; si se escribe un DSL propio, sobre Langium; Mermaid, PlantUML, D2 y DOT solo como export. | `git show research/dsl-landscape:research/dsl-landscape.md` |
| `research/elk-benchmark` | Con `considerModelOrder: NODES_AND_EDGES` 10k Nodos tardan 633 s y 5k colapsados 40 s; sin esa opcion 18 s y 1.7 s; el costo lo domina esa opcion. | `git show research/elk-benchmark:research/elk-benchmark.md` |
| `research/fuentes-tema` | Fuentes auto-hospedadas e incrustadas desde el Workspace; sin CDN en el nucleo; fuentes del sistema solo como fallback; medicion en niveles (estimacion por caracter, `measureText` tras `document.fonts.load`, glifos del archivo) y hash de fuente en la clave de layout. | `git show research/fuentes-tema:research/fuentes-tema.md` |
| `research/iconos-marcas` | Nucleo sin set de iconos (clave opaca via puerto `IconProvider`); paquete opcional de marcas sobre `simple-icons` (CC0); AWS, Azure y OpenAI fuera del set por defecto; la licencia del set no cubre la marca. | `git show research/iconos-marcas:research/iconos-marcas.md` |
| `research/json-render-fit` | No adoptar json-render como Fuente canonica (su spec es un arbol UI, no un grafo); esquema propio en Zod; reutilizables SpecStream y el patron validate+autofix. | `git show research/json-render-fit:research/json-render-fit.md` |
| `research/layout-engines` | ELK es el unico motor verificado con Grupos anidados, puertos, routing ortogonal y restricciones; dagre y d3-hierarchy no cubren el requisito. | `git show research/layout-engines:research/layout-engines.md` |
| `research/render-hibrido-rendimiento` | No hay limite oficial de Nodos; pan/zoom con un solo `transform`; el colapso por Vista es la palanca principal, `contain` y culling son secundarios; punto de partida de 300-500 Nodos HTML visibles (estimacion propia); benchmark propio pendiente. | `git show research/render-hibrido-rendimiento:research/render-hibrido-rendimiento.md` |
| `research/render-stack` | Nodos React custom, export SVG y embebido apuntan a DOM/SVG (React Flow o SVG propio sobre d3-zoom); canvas/WebGL rinde mas pero pierde Nodos React y fidelidad de export; tldraw descartable por licencia. | `git show research/render-stack:research/render-stack.md` |
| `research/sibling-flows` | Slides, video y json-render consumen React; un `<Diagram>` React puro encaja en los tres si no tiene reloj propio y acepta paso, progreso y tamano externos. | `git show research/sibling-flows:research/sibling-flows.md` |
| `research/temas-landscape` | Ningun sistema de diagramas verificado modela el elemento como pila de Capas con parches por Tipo y estado; hay precedentes fuera de diagramas (Mapbox Style Spec, Cytoscape); el eje "por Tipo" es el de mas precedente, el eje "estado" casi no existe. | `git show research/temas-landscape:research/temas-landscape.md` |

## Prototype

Las ramas `prototype/*` son copias completas del repo con el prototipo en `prototype-estetica/`; no llevan archivo de conclusiones. Inspeccionar: `git ls-tree -r --name-only <rama> prototype-estetica`.

| Rama | Contenido | Leer |
|---|---|---|
| `prototype/estetica` | Siete variantes de anatomia de dibujo (A-G) de una Vista real, generadas con `packages/render/src/prototipo.ts`. | `git show prototype/estetica:prototype-estetica/generar.ts` |
| `prototype/render-hibrido` | Render hibrido: Nodos y Grupos en HTML/CSS, Aristas en una capa SVG, todo bajo un solo `transform`; 14 Temas (A-R) como datos declarativos de Capas sobre Primitivas, con parches por Tipo y estado. | `git show prototype/render-hibrido:prototype-estetica/hibrido.ts` |
