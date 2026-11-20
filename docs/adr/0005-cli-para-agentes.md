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

Puerta de escritura unica `aplicarAlWorkspace(puerto, aplicable, visto?)` en el paquete `sesion` (la aplicacion de ediciones `{ file, range, replacement }` sobre el mapa de archivos es interna, pura y sin tocar disco; solo la puerta escribe por el puerto). Tiene dos entradas:

- **Shell** (`dev`): endpoint de edicion, a peticion del humano al hacer un gesto.
- **CLI**: `diagrams edit` con `--json`, para el agente. Mismos codigos de salida que `validate` (0 correcto, 1 edicion rechazada o invalida, 2 fallo de uso o interno) y `contractVersion` propio, como `inspect`. Solo escribe ediciones que el llamador pidio; nunca como efecto de validar.

### Intencion semantica

El shell y el comando envian la intencion (`{ vista, nodo, x, y }`), no rangos. El servidor calcula la edicion con el AST y el Ubicador: reemplaza el `pin` si ya existe y lo inserta si no. Los llamadores no necesitan conocer la sintaxis del DSL. El comando tambien acepta ediciones `{ file, range, replacement }` ya calculadas (p. ej. el `fix` de un issue de `validate`).

### Concurrencia

Cada edicion estructurada (`--edits`) lleva el hash del contenido que vio quien la pide. Para Intenciones (`--intent`) rige `visto` (ADR 0007): el `hash` de `--intent` es opcional y se ignora. Si el archivo en disco ya no coincide, se rechaza sin escritura parcial; el shell recarga la Vista y avisa. Esto matiza el "gana la ultima escritura" de `dev` solo para ediciones estructuradas; el resto de la reconciliacion sigue siendo de git. No hay deshacer propio: el DSL esta en git.

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
- los Elementos de secuencia y la fila ER (ADR 0009) con la misma resolucion que el dibujo (el Estilo resuelto de `tema`, sin parches propios del CLI): los declarados y, con `--diagrama sequence` o `er`, los derivados de `edge` y `node` con `derivado: true` (cambio aditivo; `contractVersion` sigue en 1);
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

Si algo falla (DSL o compilacion) el panel de issues lo muestra y `dev` conserva el ultimo dibujo bueno. La pagina pide la Geometria solo de la Vista activa, y ninguna tras un cambio de `pintura` (protocolo en ADR 0007).

Confianza en el codigo: `dev` no sirve `/componentes.js` mientras el usuario no confirme (el visor pregunta la primera vez que el Workspace tiene un Tema con codigo; `--trust-code` lo da de antemano) y avisa del codigo al arrancar. `/api/codigo` informa `temaConCodigo`, los componentes y si esta confirmado.

### Queda como implementacion

El subcomando `inspect tema`, los codigos de Tema en `validate`, el clasificador de cambios (`pintura` | `estructura` | `codigo`) y el watcher de fuentes y `.tsx`.

## Enmienda: Registro de actividad

La UI de `dev` muestra en tiempo real lo que hace un agente con el CLI desde otro proceso. Opciones comparadas en `research/actividad-cli-dev` (rama `research/actividad-cli-dev`).

### Canal

El CLI escribe un log append-only por Workspace, `resolve(--workspace)/.diagrams/actividad.jsonl`, con un Evento de actividad JSON por linea. `dev` lo observa con un observador propio (el watcher del Workspace sigue ignorando carpetas ocultas). Es el unico canal: funciona sin `dev`, con varios agentes y varios `dev`, sirve a otros consumidores (`tail -f`, pruebas, capturas) y no abre superficie de red. El POST al `dev` vivo con el mismo esquema queda como posible transporte de menor latencia, sin ruta reservada. Se descarta ejecutar los comandos a traves de `dev` (dos caminos de ejecucion, endpoint que ejecuta escrituras, estado compartido).

`build` deja de borrar `.diagrams/` entero: reemplaza solo `canonico.json` y `geometria/`.

### Que se registra

Registran `validate`, `build`, `inspect` y `edit`, tambien cuando salen 1 o 2. No registran `skill`, `dev` ni la ayuda. Si `--workspace` falta o no resuelve, no hay donde escribir y no se registra. Lo que el humano hace desde la UI de `dev` (Gestos, guardar desde el editor) no entra en el registro.

`validate` e `inspect` siguen sin tocar el DSL ni las salidas de `build`; su unico efecto lateral nuevo es este rastro. Activo por defecto; `DIAGRAMS_ACTIVIDAD=0` lo desactiva. Un fallo al escribir el log se ignora: nunca cambia stdout, stderr ni el codigo de salida.

El emisor es un solo punto del CLI (envoltorio de `run` o dependencia inyectable), no cada comando; `sesion` sigue pura.

### Evento

```
{ contractVersion: 1, ts, pid, agente?, comando, args, exitCode, duracionMs,
  objetivo?: { vista?, nodo?, tema?, archivos? },
  resumen?: { errores, avisos } }
```

- `agente`: texto libre de `DIAGRAMS_AGENTE`, si alguien lo fija; el sistema no conoce ningun harness.
- `args`: el argv tras el comando, completo.
- `objetivo`: solo lo que el comando nombra (`inspect vista|nodo|tema`, la Vista o Nodo de una Intencion de `edit`, los `files` que escribio `edit`). El CLI no deduce nada.
- `resumen`: de `validate` y `build`. No se guardan stdout ni stderr.

Lineas cortas escritas con un solo `write` en modo append; el lector descarta las lineas que no parsean. Esquema Zod `eventoDeActividadSchema` en `canonico`, con `contractVersion` propio y las reglas de compatibilidad de `validate`.

### Retencion

Al pasar 1 MB, quien escribe rota a `actividad.1.jsonl` (una sola generacion anterior). El lector tolera que el archivo se acorte.

### En `dev` y la UI

`dev` reproduce los ultimos 50 eventos al arrancar y luego sigue en vivo. Los empuja por SSE como evento con nombre (`event: actividad`), separado de `EstadoDeDev`.

Feed del panel Agente: una linea por evento (hora, agente o pid, comando, objetivo clicable, marca de resultado: ok, errores, avisos o fallo de uso); los `args` al expandir. Sin filtros en la primera entrega.

Seguir al agente (interruptor): `objetivo.vista` lleva a esa Vista; `objetivo.nodo` se queda en la Vista activa si lo contiene y si no salta a la primera Vista, en orden de declaracion, que lo contenga, y lo selecciona; `objetivo.archivos` no mueve por si solo. La pagina de `dev` lo resuelve con la Fuente del estado vigente (`destinoDelObjetivo` en `estudio`). Resaltar lo que cambio es del diff de Sesiones, no de este registro.

## Enmienda: Intencion `fijar-tema` y motivo `tema-desconocido` (#176, mapa #168)

`diagrams edit --intent` acepta la Intencion `fijar-tema` `{ vista, tema? }` (ADR 0007). El enum `reason` de `edit --json` suma `tema-desconocido` (salida 1; 422 en `dev`), paralelo a `vista-desconocida`. El resto de la salida de `edit` no cambia.
