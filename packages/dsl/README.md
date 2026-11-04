# dsl

Compilador del DSL de texto (gramatica Langium) a la Fuente canonica.

## Que hace
- `compile` fusiona los archivos del Workspace de forma determinista y devuelve la Fuente canonica con sus `Issue` posicionados, sin lanzar excepciones.
- Compila el bloque `theme` y valida cada Capa y Slot contra el catalogo de `tema`.
- Devuelve la posicion en el texto de cada `pin` y de cada valor (`ubicar`), base de la edicion de Pins.

## Que NO hace
- No define ni valida el esquema de la Fuente canonica: eso es de `canonico`.
- No define el catalogo de Primitivas, Slots y Efectos ni calcula geometria: eso es de `tema` y `layout`.
- No lee disco: recibe `ArchivosDelWorkspace` ya leido.

## Depende de
`canonico` y `tema` (`docs/CODING.md`, "Direccion de dependencias"). Dependencia externa: `langium`.

## Archivo de entrada
`packages/dsl/src/index.ts` (la cabecera documenta invariantes y modos de error).

## ADR relacionado
`docs/adr/0001-dsl-fuente-editable.md` (el DSL es la unica fuente editable) y `docs/adr/0008-sistema-de-temas-expresivo.md` (sintaxis del bloque `theme`).

## Probar
`pnpm --filter dsl test`
