---
label: wayfinder:map
tracker: local-markdown (tickets en .wayfinder/tickets/, un archivo por ticket)
---
# Map: rinthel-arch

## Destination

Spec decidido (CONTEXT.md + ADRs + spec) para `rinthel-arch`: sistema propio React+TS de diagramas gigantes y personalizables, listo para planear su construccion. Decide DSL de texto, fuente canonica, stack de render y layout, e integracion con slides/video. Construir el sistema queda fuera.

## Notes

- Agnostico del proyecto documentado; un proyecto externo (`../un proyecto externo`) es solo el primer caso de uso (cada parte del repo explicada en varios diagramas).
- Un modelo, varias vistas; drill-down; zoom/pan; varios tipos de diagrama; auto-layout jerarquico + pins.
- Autores: humanos y agentes. Fuente canonica estructurada validable + DSL de texto que compila a ella.
- Salidas: componente React nucleo, HTML interactivo, export SVG/PNG, embebible en `../slides-rinthel`. Video (`../video-openmotion`) es consumidor futuro.
- Se descartan Eraser DSL y Archify; sin importar legado (archivos viejos quedan sin versionar en esta carpeta).
- Referencias locales: `../slides-rinthel`, `../video-openmotion`, `../json-renderer` (json-render de Vercel), `../json-render-learning`.
- Research se captura en `research/<name>.md` en ramas `research/<name>`.
- Chat en espanol, conciso.

## Decisions so far

<!-- una linea por ticket cerrado -->

## Not yet specified

- Diseno de interaccion del drill-down (colapsar vs vistas enlazadas) y navegacion entre vistas.
- Tematizacion con la paleta canonica de Rinthel (`../Rinthel-general`) y iconos/logos de marcas.
- Estructura del repo (monorepo, paquetes core/render/cli/dsl) y pipeline de export.
- Flujo de autoria por agentes (skills, validacion con esquema, loop de correccion).
- Soporte de animacion/revelado paso a paso para video (OpenMotion).
- Prototipo del diagrama de un proyecto externo como prueba de escala.

## Out of scope

- Construir el sistema (implementacion): el mapa termina en el spec.
- Generar o validar diagramas automaticamente desde codigo (graphify, docker-compose).
- Diagramas ER.
- Importar o migrar los `.eraser` y el pipeline Archify actuales.
