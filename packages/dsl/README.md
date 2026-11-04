# dsl

Compilador del DSL de texto (gramatica Langium) a la Fuente canonica.

## Que hace

- `compile` recibe los archivos del Workspace, los fusiona de forma determinista y devuelve la Fuente canonica con sus `Issue` posicionados.
- Reporta errores de sintaxis, fusion y negocio como lista de issues, sin lanzar excepciones.
- Compila el bloque `theme` (Paleta, fuentes, Capas, Slots, Movimientos) y valida cada Capa y Slot contra el catalogo de `tema`.
- Devuelve la posicion en el texto de cada `pin` (`PosicionDePin`) y de cada valor (`ubicar`), base de la edicion de Pins.

## Que NO hace

- No define el esquema de la Fuente canonica ni valida su semantica: eso es de `canonico`.
- No define el catalogo de Primitivas, Slots y Efectos: eso es de `tema`.
- No calcula posiciones ni geometria: eso es de `layout`.
- No lee archivos del disco: recibe el contenido ya leido (`ArchivosDelWorkspace`).

## Depende de

`canonico` y `tema` (`docs/CODING.md`, "Direccion de dependencias"). Dependencia externa: `langium`.

## Archivo de entrada

`packages/dsl/src/index.ts` (la cabecera documenta invariantes y modos de error).

## ADR relacionado

`docs/adr/0001-dsl-fuente-editable.md` (el DSL es la unica fuente editable) y `docs/adr/0008-sistema-de-temas-expresivo.md` (sintaxis del bloque `theme`).

## Probar

`pnpm --filter dsl test`
