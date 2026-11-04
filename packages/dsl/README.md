# dsl

Compila DSL de texto a Fuente canonica y fusiona los archivos del Workspace.

## Que hace

- `compile` convierte los archivos `.dg` del Workspace en una Fuente canonica y devuelve todos los issues con posicion, sin lanzar excepciones.
- Fusiona varios archivos de forma determinista.
- Compila el bloque `theme` (Paleta, fuentes, tokens, Capas y Slots) y valida cada Capa y Slot contra el catalogo de `tema`.
- Reporta la posicion de los Pins en el texto (`PosicionDePin`).

## Que NO hace

- No define el esquema de la Fuente canonica ni `validate`: eso es de `canonico`.
- No define el catalogo de Primitivas ni el esquema del Tema: eso es de `tema`.
- No lee disco: recibe `ArchivosDelWorkspace`; leer y escribir es de `cli`.
- No calcula layout: eso es de `layout`.

## Depende de

`canonico` y `tema`. Dependencia externa: `langium`.

## Archivo de entrada

`packages/dsl/src/index.ts` (la cabecera documenta invariantes y modos de error).

## ADR relacionado

`docs/adr/0001-dsl-fuente-editable.md` (DSL y Fuente canonica) y `docs/adr/0008-sistema-de-temas-expresivo.md` (bloque `theme`).

## Probar

`pnpm --filter dsl test`
