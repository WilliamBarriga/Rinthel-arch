# AGENTS.md - rinthel-arch

Sistema React + TS para escribir y renderizar diagramas grandes y detallados de cualquier proyecto. un proyecto externo (`../un proyecto externo`) es el primer caso de uso; el sistema no depende de el.

## Fuentes de verdad

- Vocabulario: `CONTEXT.md`. Usar esos terminos exactos (Modelo, Vista, Tipo de diagrama, Pin...).
- Decisiones y trabajo pendiente: GitHub Issues de este repo (`gh`, `WilliamBarriga/rinthel-arch`). El mapa es el issue #1 (label `wayfinder:map`); cada ticket es sub-issue con label `wayfinder:<tipo>`.
- Reglas de codigo (estructura de paquetes, modulos profundos, hexagonal, pruebas): `docs/CODING.md`. Leer antes de crear o modificar codigo.
- Research: `research/<nombre>.md` en ramas `research/<nombre>`, no en `main`. Leer el archivo antes de re-investigar.
- Repos hermanos de referencia: `../slides-rinthel`, `../video-openmotion`, `../json-renderer`, `../json-render-learning`. Solo lectura.

## Dependencias y tecnologia

Tecnologia nueva es bienvenida. Antes de adoptar una dependencia, investigarla (licencia, mantenimiento, encaje con los requisitos) y dejar el research escrito; la adopcion se decide en un ticket o ADR.

## Convenciones

- El nucleo es agnostico del proyecto documentado; todo lo especifico de un proyecto externo vive como ejemplo o caso de uso.
- Eraser DSL y Archify estan descartados; no reintroducirlos.
- Docs y respuestas en espanol, concisas. Sin emojis unicode.
