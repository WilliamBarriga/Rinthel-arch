# Indice de ADRs

Un ADR por modulo o decision de contrato. Leer el ADR del modulo antes de cambiar su interfaz. Los numeros no se reutilizan ni se renumeran. `pnpm check` falla si un archivo `NNNN-*.md` de esta carpeta no aparece aqui.

Estados: vigente (rige tal cual), reescrito (otro ADR lo reemplaza y el archivo conserva solo lo que no cambia), absorbido (el contenido vive en otro ADR y no hay archivo propio).

| ADR | Tema | Estado |
| --- | --- | --- |
| [`0001-dsl-fuente-editable.md`](0001-dsl-fuente-editable.md) | DSL de texto como unica fuente editable | vigente |
| [`0002-render-tema-y-revelado.md`](0002-render-tema-y-revelado.md) | Contrato puro del render, Paleta, iconos y Pasos de revelado (enmienda: Pasos sin visibilidad continua) | reescrito por el 0008 |
| [`0003-layout-elk-geometria-cacheada.md`](0003-layout-elk-geometria-cacheada.md) | Layout con ELK y geometria cacheada (enmiendas: sin `considerModelOrder`, umbrales del benchmark, Pins en la clave de cache, mover un Pin no relayouta, Pin al centro, Worker con datos validados y limite de 1 MiB) | vigente |
| [`0004-monorepo-pnpm-y-paquetes.md`](0004-monorepo-pnpm-y-paquetes.md) | Monorepo pnpm, paquetes e independencia de consumidores (enmiendas: paquetes `sesion`, `tema` y `estudio`, protocolo de `dev` con un solo dueno, Workspace vivo y rutas `/api/*` en `sesion`, subpath `estudio/construir`) | vigente |
| [`0005-cli-para-agentes.md`](0005-cli-para-agentes.md) | CLI: `validate`, `dev`/`inspect` y `edit` (enmiendas: Temas en el CLI, Registro de actividad, `set-theme`) | vigente |
| `0006` (sin archivo) | Metricas y Estilo resuelto | absorbido en el 0008 |
| [`0007-interaccion-y-protocolo-de-edicion.md`](0007-interaccion-y-protocolo-de-edicion.md) | Intenciones, reductor puro e historial (enmiendas: `pin` en el centro del Nodo, Historial ante escrituras externas y editor de texto, rutas y escrituras de la UI, `atenderApiDeDev` con respuesta completa y bundle de Componentes, Historial visible, fix masivo y salto) | vigente |
| [`0008-sistema-de-temas-expresivo.md`](0008-sistema-de-temas-expresivo.md) | Temas expresivos: Capas, render hibrido y animacion | vigente |
| [`0009-tipos-de-diagrama-secuencia-y-er.md`](0009-tipos-de-diagrama-secuencia-y-er.md) | Tipos de diagrama secuencia y ER: Interaccion, marcas ER, Elementos de Tema y Geometria por tipo | vigente |
| [`0010-importador-de-codebases.md`](0010-importador-de-codebases.md) | Importador de codebases: Escaner fuera del nucleo, `diagrams scan` y Borrador de escaneo `rinthel/scan@1` | vigente |
| [`0011-marca-planeado.md`](0011-marca-planeado.md) | Marca Planeado (`planned`) para Blueprints desde un PRD, estado de Tema `planned` y paso a codigo real | vigente |

## El hueco del 0006

El 0006 no tiene archivo: su contenido (metricas y Estilo resuelto) esta en el 0008. El ADR de interaccion es el 0007.
