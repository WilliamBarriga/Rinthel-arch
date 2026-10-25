# AGENTS.md - rinthel-arch

Sistema React + TS para escribir y renderizar diagramas grandes y detallados de cualquier proyecto. El ejemplo de `examples/rinthel-arch/` documenta este mismo repo; el sistema no depende de ningun proyecto externo.

## Fuentes de verdad

- Vocabulario: `CONTEXT.md`. Usar esos terminos exactos (Modelo, Vista, Tipo de diagrama, Pin...).
- Decisiones y trabajo pendiente: GitHub Issues de este repo (`gh`, `WilliamBarriga/Rinthel-arch`); cada ticket es un issue con label `wayfinder:<tipo>`.
- Reglas de codigo (estructura de paquetes, modulos profundos, hexagonal, pruebas): `docs/CODING.md`. Leer antes de crear o modificar codigo.
- Research: `research/<nombre>.md` en ramas `research/<nombre>`, no en `main`; listarlas con `git branch -a -l '*research/*'` y leer el archivo con `git show research/<nombre>:research/<nombre>.md` antes de re-investigar.
- Guias de usuario (README, `docs/guia/`, `CONTRIBUTING.md`): al cambiar el DSL, un Tema de ejemplo o el CLI, actualizarlas; `pnpm docs:capturas` regenera las imagenes de `docs/img/`.
- ADRs de contrato (dsl, render, layout, paquetes, cli): `docs/adr/`. Leer el ADR del modulo antes de cambiar su interfaz.
- Catalogo de Temas (Primitivas, Slots, Movimientos, Efectos con rangos y defectos): `docs/referencia-catalogo.md`, generado desde `packages/tema` con `pnpm docs:catalogo`; no editar a mano (una prueba falla si se desvia).

## Skills del repo

`skills/` (formato `SKILL.md`, agnostico del harness): `diagramas` (escribir, validar y servir `.dg`) y `temas` (personalizar la estetica). Cargalas antes de editar un Workspace o un Tema. Opciones del CLI: `docs/guia/cli.md` o `diagrams <comando> --help`.

## Dependencias y tecnologia

Antes de adoptar una dependencia, investigarla (licencia, mantenimiento, encaje con los requisitos) y dejar el research escrito; la adopcion se decide en un ticket o ADR.

## Convenciones

- El nucleo es agnostico del proyecto documentado; todo lo especifico de un proyecto vive como ejemplo o caso de uso.
- Este repo es independiente: no depende de ningun repo consumidor. Integrar el sistema en un repo consumidor (slides, video u otro) es trabajo de ese repo, fuera de este. Slides, video y los demas son casos de uso del contrato de `render`.
- Eraser DSL y Archify estan descartados; no reintroducirlos.
- Docs y respuestas en espanol. Sin emojis unicode (`pnpm check:emojis` lo verifica).

## Verificacion

- Iterar con `pnpm check` (typecheck, orden de paquetes, emojis); el hook pre-commit lo corre. `pnpm test` es la compuerta completa (build + tests).
- No hay CI: todo se prueba en local. No agregar workflows de GitHub Actions.
- Esperar procesos largos con Monitor, no con `sleep`.
- Todo HTML que se quiera mostrar al usuario (reportes, previews, exports) se sirve desde un mini server local (ej. `python3 -m http.server` en el directorio del archivo, o `dev`) y se entrega la URL `http://localhost:<puerto>/...`. Firefox no ve este disco, asi que `xdg-open` de un archivo o una ruta `file://` no sirve.
- Ticket por subagente: cargar la skill `tdd` primero (no queda fijada en el repo; ponerlo en el prompt).
