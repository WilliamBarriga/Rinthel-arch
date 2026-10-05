# Monorepo pnpm con seis paquetes e independencia de consumidores

pnpm workspaces sin orquestador de tareas (seis paquetes no lo justifican; los repos hermanos ya usan pnpm). Vitest como runner y tsup para el build. Paquetes en `packages/`: `canonico` (esquema Zod, validacion, resolucion de Vistas), `dsl` (texto a Fuente canonica, fusion del Workspace), `layout` (ELK y Pin), `render` (SVG React puro), `shell` (pan/zoom, colapso, worker) y `cli`. Orden de dependencias: `canonico -> dsl -> layout -> render -> shell / cli`. `canonico` va primero porque lo consumen layout, render y cli sin necesitar el parser. `shell` se separa de `render` para que cualquier consumidor importe solo el dibujo puro.

## Export

El CLI produce por Vista: SVG estatico (render sobre la geometria cacheada), PNG rasterizando ese SVG con resvg (determinista, sin navegador) y HTML interactivo en un solo archivo autocontenido con Fuente canonica y geometria incrustadas. Las fuentes las declara el tema y se incrustan para que SVG y PNG coincidan.

## Independencia

Este repo no depende de slides-rinthel, video-openmotion ni de ningun repo de un Proyecto documentado, ni al reves en codigo. `render` es un paquete utilizable de forma aislada; el revelado paso a paso se hace con la prop `visibility`. El Workspace de un Proyecto documentado lo elige el usuario del CLI (`--workspace <ruta>`); la salida derivada va a `<workspace>/.diagrams/` y no se versiona. Integrar el sistema en otro repo es trabajo de ese repo, fuera de este.

## Enmienda: PNG con `@resvg/resvg-js`

El PNG se rasteriza con `@resvg/resvg-js` 2.6.2 (MPL-2.0, binario nativo precompilado por plataforma, sin navegador). resvg no lee los `@font-face` del SVG ni archivos `woff`/`woff2`, y la version actual solo carga fuentes desde archivos: el CLI carga las familias del Tema desde `.ttf`/`.otf` del Workspace (con una copia temporal) y falla si una familia solo existe como `woff`/`woff2`. Una familia sin archivo se resuelve con las fuentes del sistema; el PNG es identico entre maquinas solo si el Workspace trae todas las familias.
