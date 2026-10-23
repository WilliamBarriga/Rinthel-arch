# CLI para agentes: `validate`, `dev`/`inspect` y `edit`

## Contrato de salida de `validate`: objeto JSON versionado, issues con `fix` estructurado

`validate` es de solo lectura y reporta todos los issues en una pasada (tope `--max-issues`, 100 por defecto; `truncated: true` si se corta). Con `--json` imprime un unico objeto a stdout, sin texto extra, ordenado de forma determinista (archivo, linea, columna, codigo):

```
{ contractVersion: 1, ok, summary: { errors, warnings, truncated }, issues: [...] }
```

Cada issue: `code` estable, `severity` (`error` | `warning`), `file`, `line`, `column`, `message`, y opcionales `hint` (texto), `related: [{file,line,column,message}]` (p. ej. el Nodo duplicado original) y `fix`. El `fix` es una edicion estructurada del DSL de texto (`{ file, range, replacement }`) y solo se emite en casos inequivocos (un unico candidato); si hay ambiguedad queda `hint`. Nunca edita el JSON canonico (ADR 0001).

Codigos de salida: `0` sin errores (warnings permitidos), `1` hay errores, `2` fallo de uso o interno. `--strict` trata warnings como exit 1.

Versionado: `contractVersion` entero desde el inicio. Es cambio incompatible quitar o renombrar campos o codigos, cambiar su significado o los codigos de salida; anadir campos o codigos no lo es (los consumidores ignoran lo desconocido). Los codigos se deprecan, nunca se reciclan. Los codigos y `code`/`fix` son contrato publico; el texto de `message` y `hint` no. El esquema Zod de la salida es la fuente del skill generado para agentes.

Se descarta `validate --fix`: el agente aplica las ediciones con sus herramientas y revalida (bucle validate/autoFix de json-render), y el CLI no reescribe archivos del Workspace. Se descarta NDJSON: un objeto es mas simple de parsear y de probar con snapshots.

La edicion estructurada explicita (`diagrams edit` y el shell de `dev`) es una excepcion acotada, ver mas abajo; `validate --fix` sigue descartado.

## Bucle en vivo (`dev`) y consulta del Modelo (`inspect`) para trabajo humano, agente o conjunto

El DSL de texto en git es el unico punto de coordinacion entre quien edita (humano, agente o ambos); el sistema no agrega bloqueos ni estado compartido.

### `diagrams dev --workspace <ruta>`

Comando de `cli` con un servidor HTTP de Node sin dependencias nuevas, que escucha solo en `127.0.0.1`. Sirve el shell empaquetado y la geometria por Vista; los cambios llegan al navegador por Server-Sent Events (el flujo es de un solo sentido). Observa el Workspace, recompila con debounce de ~150 ms y empuja la Vista y los issues. La pantalla muestra la Vista (elegida por el hash de URL) y un panel de issues clicables (`archivo:linea`). Si dos autores tocan el mismo `.dg`, gana la ultima escritura; la reconciliacion es de git. Se descarta WebSocket (no hace falta canal de ida) y cualquier bloqueo de edicion.

### `diagrams inspect`

Subcomandos de solo lectura: `buscar <texto>`, `nodo <id>`, `vista <id>`. Texto legible por defecto; `--json` imprime un objeto con su propio `contractVersion`, independiente del de `validate`. Cada resultado trae id cualificado, tipo y `archivo:linea` del Ubicador.

### Skill para agentes

`diagrams skill` documenta `inspect` y `dev`; el bucle pasa a inspect, editar, validate.

### Fuera de alcance

La edicion estructurada del DSL (aplicar `fix`, mover Pins desde el shell, formateador) es la unica capacidad que escribe en disco; se decide mas abajo.

## Edicion estructurada del DSL: escritura explicita y acotada, mismo nucleo para humano y agente

Humano y agente deben poder trabajar comodos, solos o juntos. Mover un Pin desde el shell es un gesto que un humano no hace bien a mano y que al agente le cuesta (leer, ubicar el bloque, reescribir una linea). Por eso se reabre el contrato de `validate` en un solo punto: existe una escritura explicita y acotada sobre el DSL de texto. `validate` sigue de solo lectura y `validate --fix` sigue descartado. El DSL sigue siendo la unica fuente editable (ADR 0001); nunca se edita el JSON canonico.

### Nucleo comun

Modulo puro `aplicarEdiciones(archivos, ediciones)` en el paquete `sesion`, que aplica ediciones `{ file, range, replacement }` sobre el mapa de archivos sin tocar disco. Tiene dos entradas que escriben el resultado:

- **Shell** (`dev`): endpoint de edicion, a peticion del humano al hacer un gesto.
- **CLI**: `diagrams edit` con `--json`, para el agente. Mismos codigos de salida que `validate` (0 correcto, 1 edicion rechazada o invalida, 2 fallo de uso o interno) y `contractVersion` propio, como `inspect`. Solo escribe ediciones que el llamador pidio; nunca como efecto de validar.

### Intencion semantica

El shell y el comando envian la intencion (`{ vista, nodo, x, y }`), no rangos. El servidor calcula la edicion con el AST y el Ubicador: reemplaza el `pin` si ya existe y lo inserta si no. Los llamadores no necesitan conocer la sintaxis del DSL. El comando tambien acepta ediciones `{ file, range, replacement }` ya calculadas (p. ej. el `fix` de un issue de `validate`).

### Concurrencia

Cada edicion lleva el hash del contenido que vio quien la pide. Si el archivo en disco ya no coincide, se rechaza sin escritura parcial; el shell recarga la Vista y avisa. Esto matiza el "gana la ultima escritura" de `dev` solo para ediciones estructuradas; el resto de la reconciliacion sigue siendo de git. No hay deshacer propio: el DSL esta en git.

### Alcance

La primera entrega cubre solo arrastrar Pins. El modulo es generico: cada gesto nuevo (etiqueta corta, estilo, orden, enlace de drill-down) es un ticket pequeno, sin ADR propio.

### Descartado

- Formateador canonico completo: reescribe archivos enteros y no hay necesidad concreta. Cada gesto emite la edicion minima con formato fijo. Se retoma si aparece ruido real en los diffs.
- `validate --fix` y cualquier correccion automatica al validar.
- Deshacer propio y bloqueos de edicion.

## Enmienda: Temas en el CLI (Sistema de Temas expresivo, ADR 0008)

Un Tema es texto del DSL como cualquier otro bloque, asi que el CLI no gana un modo nuevo. Solo se acotan cuatro puntos; el detalle de cada Tema, Capa y codigo vive en el ADR 0008.

### `inspect tema <nombre>`

Subcomando de solo lectura, con `--json` y `contractVersion` propio como el resto de `inspect`. Opciones `--tipo <tipo>` y `--estado <estado>` para resolver la cascada de un caso. La salida trae:

- la cadena `extends` y las `part` usadas;
- la pila de Capas resuelta para el Tipo y estado pedidos, cada Capa con el `archivo:linea` del parche que la fijo;
- la tabla de Metricas;
- `temaConCodigo` y la lista de componentes;
- con `--catalogo`, las claves del catalogo de Primitivas y Movimientos, derivadas del esquema unico (sin listas paralelas).

Sirve al agente para saber que parche tocar antes de editar.

### `edit`: sin cambios

`edit` no gana gestos para Temas: el agente edita el `.dg` con sus herramientas y revalida. Un parche de Capa es texto legible, no un gesto incomodo a mano. Un gesto futuro (p. ej. selector de color en el visor) es un ticket pequeno sin ADR, como ya establece este ADR. Por `edit` solo se aplican los `fix` de `validate` (`{ file, range, replacement }`).

### `validate`: sin enmienda estructural

Los codigos de Tema (propiedad desconocida, `before`/`after` inexistente, contraste, `solo-color`, `temaConCodigo`, errores de compilacion de `.tsx`...) son codigos nuevos: anadir codigos no rompe el contrato y `contractVersion` sigue en 1. Convenciones para ellos:

- el `fix` con "quisiste decir" se emite solo con un unico candidato cercano; si hay mas, queda `hint`;
- los issues de un parche de Tema traen `related` apuntando a la Capa base que parchea.

### `dev`: recarga clasificada por tipo de cambio

`dev` observa tambien las fuentes y los `.tsx` del Workspace, con el mismo debounce (~150 ms) y el mismo canal SSE. El mensaje empujado indica el tipo de cambio para que el visor haga lo minimo:

- `pintura` (solo Capas pintadas o animacion): se empuja el Estilo resuelto sin relayout, con la Geometria vigente;
- `estructura` (cambia la clave de estructura: Metricas, fuente): relayout;
- `codigo` (cambia un `.tsx`): se recompila y se vuelve a registrar el componente, sin relayout.

Si algo falla (DSL o compilacion) el panel de issues lo muestra y `dev` conserva el ultimo dibujo bueno.

### Queda como implementacion

El subcomando `inspect tema`, los codigos de Tema en `validate`, el clasificador de cambios (`pintura` | `estructura` | `codigo`) y el watcher de fuentes y `.tsx`.
