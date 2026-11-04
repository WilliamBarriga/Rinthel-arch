# tema

Catalogo de Primitivas y Slots, esquema del Tema resuelto y Estilo resuelto (Metricas y pintura).

## Que hace

- Define el catalogo (`CATALOGO`, `SLOTS`, `MOVIMIENTOS`, `EFECTOS`) y construye Primitivas, Movimientos y Efectos con todos los errores a la vez y sugerencia de correccion.
- `resolverTema` valida un Tema contra `temaResueltoSchema`; `TEMA_NEUTRO` y `TEMA_ALTO_CONTRASTE` son los Temas incorporados.
- `estiloResuelto(tema)` entrega `{ metricas, pintura }`; la cascada y los parches (`cascada`, `aplicarOps`) arman la pila de Capas por Tipo y estado.
- Coloca Slots (`colocarNodo`, `colocarDisposicion`) y resuelve colores (`resolverColor`).
- Calcula contraste y leyenda (`advertenciasDeContraste`, `leyendaDelTema`) y las tablas de medicion de texto (`tablaDeMetricas`).

## Que NO hace

- No lee el texto DSL de un Tema ni lo compila: eso es de `dsl`.
- No decide si una advertencia de contraste bloquea: eso es de `sesion`.
- No calcula posiciones de Nodos ni rutas de Aristas: eso es de `layout`.
- No dibuja ni anima: eso es de `render`.
- No mide texto en el navegador (`document.fonts`): eso es de `shell`; aqui solo se reciben las medidas como datos.

## Depende de

`canonico` (reutiliza `Issue` y `candidatosCercanos`). Dependencia externa: `zod`.

## Archivo de entrada

`packages/tema/src/index.ts` (la cabecera documenta la interfaz completa).

## ADR relacionado

`docs/adr/0008-sistema-de-temas-expresivo.md`.

## Probar

`pnpm --filter tema test`
