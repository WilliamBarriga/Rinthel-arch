# Monorepo pnpm con seis paquetes e independencia de consumidores

pnpm workspaces sin orquestador de tareas (seis paquetes no lo justifican; los repos hermanos ya usan pnpm). Vitest como runner y tsup para el build. Paquetes en `packages/`: `canonico` (esquema Zod, validacion, resolucion de Vistas), `dsl` (texto a Fuente canonica, fusion del Workspace), `layout` (ELK y Pin), `render` (SVG React puro), `shell` (pan/zoom, colapso, worker) y `cli`. Orden de dependencias: `canonico -> dsl -> layout -> render -> shell / cli`. `canonico` va primero porque lo consumen layout, render y cli sin necesitar el parser. `shell` se separa de `render` para que cualquier consumidor importe solo el dibujo puro.

## Export

Superado (ticket #27, ADR 0008): el sistema de exportaciones (`export` svg/png/html) se borro. El CLI ya no produce SVG, PNG ni HTML; las Vistas se ven con `dev`.

## Independencia

Este repo no depende de slides-rinthel, video-openmotion ni de ningun repo de un Proyecto documentado, ni al reves en codigo. `render` es un paquete utilizable de forma aislada; el revelado paso a paso se hace con la prop `visibility`. El Workspace de un Proyecto documentado lo elige el usuario del CLI (`--workspace <ruta>`); la salida derivada va a `<workspace>/.diagrams/` y no se versiona. Integrar el sistema en otro repo es trabajo de ese repo, fuera de este.

## Enmienda: PNG con `@resvg/resvg-js`

Superada: se quito el PNG y la dependencia `@resvg/resvg-js` junto con el resto de las exportaciones.

## Enmienda: paquete `sesion`

Se suma `sesion` entre `layout` y `render`/`shell`/`cli`: orden `canonico -> dsl -> layout -> sesion -> render -> shell / cli`. Importa solo `canonico`, `dsl` y `layout`. Es una funcion pura sobre el mapa de archivos del Workspace (sin puerto de filesystem: leer disco y observar cambios son adaptadores de `cli`), de modo que CLI, `dev` e `inspect` comparten una sola tuberia compilar, validar y calcular layout. Interfaz: `diagnosticar()`, `construir()` y `geometria(vista)` (perezosa y memoizada por Vista). Ver el termino Sesion en `CONTEXT.md`.
