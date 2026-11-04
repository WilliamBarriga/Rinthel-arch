# tema

Dueno del concepto de Tema: catalogo de Primitivas y Slots, esquema del Tema resuelto y Estilo resuelto.

## Que hace

- Define el catalogo (`CATALOGO`, `SLOTS`) y `construirPrimitiva`, que devuelve todos los errores a la vez con codigo estable y sugerencia.
- `resolverTema` valida un Tema contra `temaResueltoSchema`; `TEMA_NEUTRO` es el Tema por defecto.
- `estiloResuelto` entrega las Metricas y la pintura; la pintura nunca cambia las Metricas.
- Aplica parches por nombre de Capa (`aplicarOps`) y resuelve la cascada por Tipo, estado y Vista.
- Coloca los Slots dentro de una caja (`construirDisposicion`, `colocarNodo`, `colocarEnCaja`).

## Que NO hace

- No lee texto DSL ni compila el bloque `theme`: eso es de `dsl`.
- No calcula posiciones de Nodos ni rutas: eso es de `layout`.
- No dibuja: eso es de `render`.
- No toca disco, reloj ni red: es nucleo puro.

## Depende de

`canonico` (reutiliza `Issue`, `CODIGOS` y `candidatosCercanos`). Dependencia externa: `zod`.

## Archivo de entrada

`packages/tema/src/index.ts` (la cabecera documenta la interfaz y la posicion en la cadena).

## ADR relacionado

`docs/adr/0008-sistema-de-temas-expresivo.md`.

## Probar

`pnpm --filter tema test`
