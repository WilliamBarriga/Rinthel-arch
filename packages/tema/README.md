# tema

Catalogo de Primitivas y Slots, esquema del Tema resuelto y Estilo resuelto (Metricas y pintura).

## Que hace
- Define el catalogo (`CATALOGO`, `SLOTS`, `MOVIMIENTOS`, `EFECTOS`); `resolverTema` valida un Tema; `TEMA_NEUTRO` y `TEMA_ALTO_CONTRASTE` son los incorporados.
- `estiloResuelto(tema)` entrega `{ metricas, pintura }` con cascada y parches; `colocarNodo` coloca Slots y `resolverColor` resuelve colores.
- `temaParaDiagrama(tema, tipo)` aplica los parches `diagram <tipo>` (nivel entre el Tema base y el Tipo de nodo); `tablaDeMetricas` y `estiloResuelto` lo reciben como `diagrama`.
- Calcula contraste, leyenda y tablas de medicion de texto.

## Que NO hace
- No lee ni compila el texto DSL de un Tema: eso es de `dsl`.
- No calcula posiciones ni dibuja: eso es de `layout` y `render`.
- No mide texto en el navegador ni decide si un aviso bloquea: eso es de `shell` y `sesion`.

## Depende de
`canonico` (reutiliza `Issue` y `candidatosCercanos`). Dependencia externa: `zod`.

## Archivo de entrada
`packages/tema/src/index.ts` (la cabecera documenta la interfaz completa).

## ADR relacionado
`docs/adr/0008-sistema-de-temas-expresivo.md`.

## Probar
`pnpm --filter tema test`
