# Edicion estructurada del DSL: escritura explicita y acotada, mismo nucleo para humano y agente

Humano y agente deben poder trabajar comodos, solos o juntos. Mover un Pin desde el shell es un gesto que un humano no hace bien a mano y que al agente le cuesta (leer, ubicar el bloque, reescribir una linea). Por eso se reabre el ADR 0008 en un solo punto: existe una escritura explicita y acotada sobre el DSL de texto. `validate` sigue de solo lectura y `validate --fix` sigue descartado. El DSL sigue siendo la unica fuente editable (ADR 0002); nunca se edita el JSON canonico.

## Nucleo comun

Modulo puro `aplicarEdiciones(archivos, ediciones)` en el paquete `sesion`, que aplica ediciones `{ file, range, replacement }` sobre el mapa de archivos sin tocar disco. Tiene dos entradas que escriben el resultado:

- **Shell** (`dev`): endpoint de edicion, a peticion del humano al hacer un gesto.
- **CLI**: `diagrams edit` con `--json`, para el agente. Mismos codigos de salida que `validate` (0 correcto, 1 edicion rechazada o invalida, 2 fallo de uso o interno) y `contractVersion` propio, como `inspect`. Solo escribe ediciones que el llamador pidio; nunca como efecto de validar.

## Intencion semantica

El shell y el comando envian la intencion (`{ vista, nodo, x, y }`), no rangos. El servidor calcula la edicion con el AST y el Ubicador: reemplaza el `pin` si ya existe y lo inserta si no. Los llamadores no necesitan conocer la sintaxis del DSL. El comando tambien acepta ediciones `{ file, range, replacement }` ya calculadas (p. ej. el `fix` de un issue de `validate`).

## Concurrencia

Cada edicion lleva el hash del contenido que vio quien la pide. Si el archivo en disco ya no coincide, se rechaza sin escritura parcial; el shell recarga la Vista y avisa. Esto matiza el "gana la ultima escritura" del ADR 0009 solo para ediciones estructuradas; el resto de la reconciliacion sigue siendo de git. No hay deshacer propio: el DSL esta en git.

## Alcance

La primera entrega cubre solo arrastrar Pins. El modulo es generico: cada gesto nuevo (etiqueta corta, estilo, orden, enlace de drill-down) es un ticket pequeno, sin ADR propio.

## Descartado

- Formateador canonico completo: reescribe archivos enteros y no hay necesidad concreta. Cada gesto emite la edicion minima con formato fijo. Se retoma si aparece ruido real en los diffs.
- `validate --fix` y cualquier correccion automatica al validar (ADR 0008).
- Deshacer propio y bloqueos de edicion.
