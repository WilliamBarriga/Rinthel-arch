# Contribuir a rinthel-arch

Gracias por el interes. Este archivo dice por donde empezar; el detalle esta en los documentos enlazados.

## Antes de escribir codigo

Sigue el camino de lectura de [AGENTS.md](AGENTS.md#camino-de-lectura): glosario, reglas de codigo, ADR del modulo y README del paquete. Para probar un solo paquete: `pnpm --filter <paquete> test`.

- Vocabulario: [CONTEXT.md](CONTEXT.md). Usa esos terminos exactos (Modelo, Vista, Tema, Pin...) en codigo, docs y mensajes.
- Reglas de codigo (estructura de paquetes, modulos profundos, arquitectura hexagonal, pruebas): [docs/CODING.md](docs/CODING.md).
- Decisiones: [indice de ADRs](docs/adr/README.md). Lee el ADR del modulo antes de cambiar su interfaz.
- Trabajo pendiente: los [issues](https://github.com/WilliamBarriga/Rinthel-arch/issues). Abre uno antes de una contribucion grande.

## Entorno

```
pnpm install
pnpm exec playwright install chromium   # una vez: lo usan la punta a punta de pnpm test y pnpm docs:capturas
pnpm check   # typecheck, lint, orden de paquetes, docs y emojis: rapido, para iterar
pnpm test    # compuerta completa: build, typecheck y todas las pruebas
```

No hay CI: las pruebas se corren en local. El hook de pre-commit corre `pnpm check`.

## Convenciones

- El nucleo es agnostico del proyecto documentado: lo especifico de un proyecto va como ejemplo en `examples/`.
- Docs y mensajes en espanol, sin emojis unicode (`pnpm check:emojis` lo verifica).
- `docs/referencia-catalogo.md` se genera con `pnpm docs:catalogo`; no se edita a mano.
- Las capturas de `docs/img/` se regeneran con `pnpm docs:capturas` (necesita `pnpm build` y Chromium) cuando cambia un Tema, un ejemplo o la UI de `dev`.
- Antes de adoptar una dependencia nueva, investigala (licencia, mantenimiento, encaje) y deja el research escrito; la adopcion se decide en un issue o ADR.

## Mapa del repo

| Ruta | Contenido |
| --- | --- |
| `packages/canonico` | Esquema de la Fuente canonica (Zod), validacion, resolucion de Vistas y contratos versionados (Intenciones, `--json`, Evento de actividad, protocolo de `dev`) |
| `packages/tema` | Catalogo de Primitivas y Slots, Estilo resuelto y Metricas |
| `packages/dsl` | Gramatica (Langium) y compilador del texto `.dg` |
| `packages/layout` | Layout con ELK y Pins; geometria cacheada |
| `packages/sesion` | Tuberia compartida: compilar, validar, calcular geometria y editar el texto; el Workspace vivo de `dev` sin transporte |
| `packages/render` | Dibujo puro en React (Nodos y Grupos en HTML/CSS, Aristas en SVG) |
| `packages/shell` | Visor interactivo: pan/zoom, colapso, arrastre |
| `packages/estudio` | App de navegador de `dev` (la [UI de dev](docs/guia/ui-de-dev.md)): lienzo, editor, Issues, Temas, Historial de archivos y feed del agente |
| `packages/cli` | `validate`, `build`, `dev`, `inspect`, `edit`, `skill`; unico paquete que toca disco y servidor de `dev` |
| `examples/tutorial` | El tutorial, un Workspace por paso |
| `examples/rinthel-arch` | Este repo documentado con su propio DSL, con sus Temas de ejemplo |
| `examples/temas` | Temas sueltos de muestra (catalogo de formas, Capa `code`, secuencia, ER) |
| `examples/temas/galeria` | Un Modelo comun para los Temas de ejemplo (de `examples/rinthel-arch/temas`, via `--theme-path`), y estados de cada Nodo |

## Ramas de research y prototipos

Las ramas `research/*` guardan investigaciones (un archivo `research/<nombre>.md` por rama) y `prototype/*` guarda los prototipos que fundaron decisiones. Son material de contexto: no se mezclan en `main`. El indice con una conclusion por rama es [docs/ramas.md](docs/ramas.md). Lista las de research con `git branch -a -l '*research/*'` y lee una con `git show research/<nombre>:research/<nombre>.md`.

## Agentes

`AGENTS.md` y `CLAUDE.md` describen el repo para agentes de codigo; `skills/` trae las skills `rinthel-diagramas` y `rinthel-temas`. Si contribuyes con un agente, empieza por ahi.
