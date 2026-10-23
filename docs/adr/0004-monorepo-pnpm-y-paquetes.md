# Monorepo pnpm con paquetes e independencia de consumidores

pnpm workspaces sin orquestador de tareas (pocos paquetes no lo justifican; los repos hermanos ya usan pnpm). Vitest como runner y tsup para el build. Paquetes en `packages/`: `canonico` (esquema Zod, validacion, resolucion de Vistas), `tema` (catalogo, Estilo resuelto y Slots), `dsl` (texto a Fuente canonica, fusion del Workspace), `layout` (ELK y Pin), `sesion` (tuberia compartida), `render` (React puro: Nodos y Grupos en HTML/CSS, Aristas en SVG), `shell` (pan/zoom, colapso, worker) y `cli`. Orden de dependencias: `canonico -> tema -> dsl -> layout -> sesion -> render -> shell / cli` (ver las enmiendas). `canonico` va primero porque lo consumen layout, render y cli sin necesitar el parser. `shell` se separa de `render` para que cualquier consumidor importe solo el dibujo puro.

## Independencia

Este repo no depende de slides-rinthel, video-openmotion ni de ningun repo de un Proyecto documentado, ni al reves en codigo. `render` es un paquete utilizable de forma aislada; el revelado paso a paso se hace con la prop `visibility`. El Workspace de un Proyecto documentado lo elige el usuario del CLI (`--workspace <ruta>`); la salida derivada va a `<workspace>/.diagrams/` y no se versiona. Integrar el sistema en otro repo es trabajo de ese repo, fuera de este.

## Enmienda: paquete `sesion`

Se suma `sesion` entre `layout` y `render`/`shell`/`cli`: orden `canonico -> dsl -> layout -> sesion -> render -> shell / cli`. Importa solo `canonico`, `dsl` y `layout`. Es una funcion pura sobre el mapa de archivos del Workspace (sin puerto de filesystem: leer disco y observar cambios son adaptadores de `cli`), de modo que CLI, `dev` e `inspect` comparten una sola tuberia compilar, validar y calcular layout. Interfaz: `diagnosticar()`, `construir()` y `geometria(vista)` (perezosa y memoizada por Vista). Ver el termino Sesion en `CONTEXT.md`.

## Enmienda: paquete `tema`

Se suma `tema` (ADR 0008): orden `canonico -> tema -> dsl -> layout -> sesion -> render -> shell / cli`. Es puro (entra en la lista de nucleo del chequeo de pureza) e importa solo `canonico`. Es dueno del catalogo de Primitivas y Slots, del esquema estricto del Tema ya resuelto, del Estilo resuelto (Metricas y pintura) y de la colocacion de Slots que comparten `layout` y `render`.

Por que despues de `canonico` y no antes: la validacion de Temas emite `Issue` con los codigos de `CODIGOS` y sugerencias de `candidatosCercanos`, que viven en `canonico`; ponerlo antes habria obligado a duplicar el tipo de error o a subir `Issue` a `tema`. Por que antes de `dsl`: el compilador de Temas (modulo propio de `dsl`) valida cada Capa y cada Slot con el catalogo. Consecuencia: la Fuente canonica solo conoce el sobre del Tema (`name`, `palette`); `canonico` ya no tiene esquema de Tema ni Metricas, y `layout` tampoco (`metricasDe` y `atributosVisibles` son de `tema`). `pnpm check:deps` cubre el paquete nuevo (cadena, exports y pureza).
