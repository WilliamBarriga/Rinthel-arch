# tema
Catalogo de Primitivas y Slots, esquema del Tema resuelto y Estilo resuelto (Metricas y pintura).

## Que hace
- Define el catalogo (`CATALOGO`, `SLOTS`, `MOVIMIENTOS`, `EFECTOS`), fuente de `docs/theme-catalog.md` (`referenciaDelCatalogo`; tras cambiarlo, `pnpm docs:catalogo`). `resolverTema` valida un Tema; `TEMA_NEUTRO` es la base resuelta (el `neutral` en DSL lo declara `dsl`) y `TEMA_ALTO_CONTRASTE` el incorporado del visor.
- `estiloResuelto(tema)` entrega `{ metricas, pintura }` con cascada y parches; `colocarNodo` coloca Slots y `resolverColor` resuelve colores; `temaParaDiagrama(tema, tipo)` aplica los parches `diagram <tipo>` (nivel entre el Tema base y el Tipo de nodo); `tablaDeMetricas` y `estiloResuelto` lo reciben como `diagrama`.
- Define los Elementos de secuencia (`lifeline`, `activation`, `message`, `fragment`, `note`) y de ER (`row`); un Tema que no los declara los recibe derivados de `node` y `edge` en el Estilo resuelto (`derivacion.ts`, unico sitio con esas reglas; `derivado: true`).
- Calcula contraste, leyenda y tablas de medicion de texto; `fnv1a` (`semilla.ts`) es el unico hash, que reusan la huella de `render` y `hashDeFuente`.

## Que NO hace
- No lee ni compila el texto DSL de un Tema: eso es de `dsl`.
- No calcula posiciones ni dibuja: eso es de `layout` y `render`.
- No mide texto en el navegador ni decide si un aviso bloquea: eso es de `shell` y `sesion`.

## Depende de
`canonico` (tipos y constantes del Modelo, `CODIGOS` y `candidatosCercanos`). Dependencia externa: `zod`.

## Archivo de entrada
`packages/tema/src/index.ts` (la cabecera documenta la interfaz completa).

## ADR relacionado
`docs/adr/0008-sistema-de-temas-expresivo.md`.

## Probar
`pnpm --filter tema test`
