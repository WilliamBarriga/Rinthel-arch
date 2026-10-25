# Contribuir a rinthel-arch

Gracias por el interes. Este archivo dice por donde empezar; el detalle esta en los documentos enlazados.

## Antes de escribir codigo

- Vocabulario: [CONTEXT.md](CONTEXT.md). Usa esos terminos exactos (Modelo, Vista, Tema, Pin...) en codigo, docs y mensajes.
- Reglas de codigo (estructura de paquetes, modulos profundos, arquitectura hexagonal, pruebas): [docs/CODING.md](docs/CODING.md).
- Decisiones: [docs/adr/](docs/adr/). Lee el ADR del modulo antes de cambiar su interfaz.
- Trabajo pendiente: los [issues](https://github.com/WilliamBarriga/Rinthel-arch/issues). Abre uno antes de una contribucion grande.

## Entorno

```
pnpm install
pnpm check   # typecheck, orden de paquetes y emojis: rapido, para iterar
pnpm test    # compuerta completa: build, typecheck y todas las pruebas
```

No hay CI: las pruebas se corren en local. El hook de pre-commit corre `pnpm check`.

## Convenciones

- El nucleo es agnostico del proyecto documentado: lo especifico de un proyecto va como ejemplo en `examples/`.
- Docs y mensajes en espanol, sin emojis unicode (`pnpm check:emojis` lo verifica).
- `docs/referencia-catalogo.md` se genera con `pnpm docs:catalogo`; no se edita a mano.
- Las capturas de `docs/img/` se regeneran con `pnpm docs:capturas` (necesita `pnpm build` y Chromium) cuando cambia un Tema o un ejemplo.
- Antes de adoptar una dependencia nueva, investigala (licencia, mantenimiento, encaje) y deja el research escrito; la adopcion se decide en un issue o ADR.

## Ramas de research y prototipos

Las ramas `research/*` guardan investigaciones (un archivo `research/<nombre>.md` por rama) y `prototype/*` guarda los prototipos que fundaron decisiones. Son material de contexto: no se mezclan en `main`. Lista las de research con `git branch -a -l '*research/*'` y lee una con `git show research/<nombre>:research/<nombre>.md`.

## Agentes

`AGENTS.md` y `CLAUDE.md` describen el repo para agentes de codigo; `skills/` trae las skills `rinthel-diagramas` y `rinthel-temas`. Si contribuyes con un agente, empieza por ahi.
