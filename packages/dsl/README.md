# dsl
Compilador del DSL de texto (gramatica Langium) a la Fuente canonica.

## Que hace
- `compile` fusiona los archivos del Workspace de forma determinista y devuelve la Fuente canonica con sus `Issue` posicionados, sin lanzar excepciones.
- Compila `interaction`, `type sequence`, `type er` y el bloque `theme`, cuyas Capas y Slots valida contra el catalogo de `tema`, incluidos los Elementos de secuencia (`lifeline`, `activation`, `message`, `fragment`, `note`) y de ER (`row`).
- Devuelve la posicion en el texto de cada `pin` y de cada valor (`ubicar`), base de la edicion de Pins.
- Declara en DSL los Temas incorporados `neutral` y `neutral-dark` (`src/incorporados.ts`, cero avisos de contraste); `alto-contraste` es de `tema`. La gramatica es `src/gramatica/diagramas.langium`; `src/generated/` sale de `pnpm generate` (lo corre `build`), no se versiona ni se edita.

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
