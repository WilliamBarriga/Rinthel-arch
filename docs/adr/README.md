# Indice de ADRs

Un ADR por modulo o decision de contrato. Leer el ADR del modulo antes de cambiar su interfaz. Los numeros no se reutilizan ni se renumeran. `pnpm check` falla si un archivo `NNNN-*.md` de esta carpeta no aparece aqui.

Estados: vigente (rige tal cual), reescrito (otro ADR lo reemplaza y el archivo conserva solo lo que no cambia), absorbido (otro ADR integro su contenido y el archivo se borro).

| ADR | Tema | Estado |
| --- | --- | --- |
| [`0001-dsl-fuente-editable.md`](0001-dsl-fuente-editable.md) | DSL de texto como unica fuente editable | vigente |
| [`0002-render-tema-y-revelado.md`](0002-render-tema-y-revelado.md) | Contrato puro del render, Paleta, iconos y Pasos de revelado | reescrito por el 0008 |
| [`0003-layout-elk-geometria-cacheada.md`](0003-layout-elk-geometria-cacheada.md) | Layout con ELK y geometria cacheada | vigente |
| [`0004-monorepo-pnpm-y-paquetes.md`](0004-monorepo-pnpm-y-paquetes.md) | Monorepo pnpm, paquetes e independencia de consumidores | vigente |
| [`0005-cli-para-agentes.md`](0005-cli-para-agentes.md) | CLI: `validate`, `dev`/`inspect` y `edit` | vigente |
| `0006` (sin archivo) | Metricas y Estilo resuelto | absorbido por el 0008 |
| [`0007-interaccion-y-protocolo-de-edicion.md`](0007-interaccion-y-protocolo-de-edicion.md) | Intenciones, reductor puro e historial | vigente |
| [`0008-sistema-de-temas-expresivo.md`](0008-sistema-de-temas-expresivo.md) | Temas expresivos: Capas, render hibrido y animacion | vigente |

## El hueco del 0006

El 0006 (metricas y Estilo resuelto) lo absorbio y borro el 0008. El ADR de interaccion se renombro a 0007 porque el 0006 ya estaba ocupado. El 0006 queda sin archivo y no se renumera nada.
