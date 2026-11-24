# CLI

El CLI es `packages/cli/dist/bin.js` (tras `pnpm build`). En esta guia se abrevia `dg`:

```
alias dg="node $PWD/packages/cli/dist/bin.js"
```

`dg --help` lista los comandos y `dg <comando> --help` da las opciones de cada uno (la ayuda sale en stdout, codigo 0). Todos salvo `scan` piden `--workspace <ruta>`, la carpeta con los `.dg`. Contrato de diseno: [ADR 0005](../adr/0005-cli-para-agentes.md).

## Codigos de salida

| Codigo | Significado |
| --- | --- |
| 0 | Correcto (los avisos no fallan, salvo `--strict`) |
| 1 | El Workspace tiene errores, o una edicion fue rechazada |
| 2 | Fallo de uso o interno (mensaje en stderr, stdout vacio) |

## Salida `--json`

Con `--json`, stdout es exactamente un objeto, sin texto extra. `validate`/`build`, `inspect` y `edit` llevan cada uno su `contractVersion`. Se puede ignorar lo desconocido: anadir campos o codigos no rompe el contrato; quitarlos o renombrarlos si. El `code` de un issue es estable; `message` y `hint` no. El esquema completo sale en `dg skill`.

## Comandos

### `validate`: compilar y validar (solo lectura)

```
dg validate --workspace <ruta> [--json] [--strict] [--max-issues N] [--theme <nombre>] [--theme-path <dir>]
```

Lista todos los issues en una pasada, ordenados por archivo, linea, columna y codigo. Sin errores de compilacion calcula el layout de las Vistas con al menos dos Pins y avisa `overlapping-pins` por cada par solapado (con `--strict` hace fallar); las Vistas sin Pins no pagan layout. Si un Tema trae codigo (`.tsx`) que no compila, el error es `theme-code-compile`, con archivo y linea. `--max-issues` (100 por defecto) corta la lista y marca `summary.truncated`. Un issue puede traer `fix` (`{ file, range, replacement }`) cuando hay un unico candidato, o `hint` si hay varios. `validate` nunca reescribe archivos.

Codigos de los Tipos de diagrama `sequence` y `er` (la lista completa, con su descripcion, sale en `dg skill`):

| Codigo | Cuando |
| --- | --- |
| `unknown-view-type`, `view-property-for-type` | El `type` de la Vista no existe, o una propiedad no vale para su Tipo (`include`/`pin` en secuencia; `interaction`/`order`/`autonumber`/`upto` fuera de ella) |
| `sequence-without-interaction`, `unknown-interaction`, `duplicate-interaction` | La Vista `sequence` no declara `interaction`, o una Interaccion (de una Vista o un `ref`) no existe o esta repetida |
| `unknown-lifeline`, `duplicate-message-id` | Un extremo de Mensaje, una Nota u `order` no es un Nodo; id de Mensaje repetido |
| `create-not-first`, `after-destroy`, `invalid-fragment-operand` | Ciclo de vida de la Lifeline y operandos de Fragmento invalidos |
| `step-not-projected`, `step-not-advancing` | Un `upto` apunta a un Mensaje que la Vista no proyecta o no avanza |
| `order-not-in-interaction`, `ref-without-view`, `reply-without-sync` | Avisos (solo fallan con `--strict`) |
| `er-cardinality`, `duplicate-key-mark` | Cardinalidad ER invalida (con `fix`) y marca de clave repetida (`pk`, `fk`, `uk`) |

### `build`: escribir la geometria

```
dg build --workspace <ruta> [las opciones de validate]
```

Escribe `canonico.json` y `geometria/<vista>.json` (`{ view, theme, layoutKey, geometry }`; `geometry.kind` es `grafo` para architecture, flow y er, y `secuencia` para una Vista `sequence`, con `lifelines`, `activations`, `messages`, `fragments`, `notes` y `groups`) en `<ruta>/.diagrams/`, reemplazando solo esos dos (derivado: no se versiona ni se edita; el Registro de actividad se conserva). Con errores, o con avisos en `--strict`, sale 1 y borra la salida anterior. `--theme` fija el Tema global (una Vista con `theme` propio lo anula; sin ninguno, el neutro); un Tema no declarado sale 2.

### `dev`: visor en vivo

```
dg dev --workspace <ruta> [--port N] [--trust-code] [--theme-path <dir>]
```

Sirve en `http://127.0.0.1:<puerto>/` (4173 por defecto, `--port 0` elige uno libre; solo escucha en localhost) la [UI de dev](ui-de-dev.md): lienzo con los cuatro Tipos de diagrama, indice de Vistas, editor del DSL, Issues, galeria de Temas, Historial y feed del agente. Recompila al guardar y, si una edicion rompe el DSL, conserva el ultimo dibujo bueno. La Vista se elige con el hash (`#vista=<id>`).

- **Temas con codigo (`.tsx`)**: `dev` no los sirve hasta que lo confirmes en la UI; `--trust-code` lo da de antemano. Usalo solo con Workspaces que conoces.
- **Escrituras**: arrastrar un Nodo fija su Pin; en una Vista `sequence`, arrastrar en horizontal la cabecera de una Lifeline (o el titulo de un `box`, que mueve el bloque) reescribe el `order` completo y una hija no sale del `box` de su Grupo. El editor, los `fix` y la galeria tambien escriben el `.dg` con el mismo nucleo que `edit`; cada escritura es una entrada del Historial de archivos de `dev`, que sobrevive a las ediciones de otros programas.
- **Como proceso**: es de larga vida. Lanzalo en segundo plano y espera la linea con la URL; el puerto ocupado es un error (`--port` otro).

### `inspect`: consultar el Modelo (solo lectura)

```
dg inspect search <texto>   --workspace <ruta> [--json]
dg inspect node <id>        --workspace <ruta> [--json]
dg inspect view <id>       --workspace <ruta> [--json]
dg inspect interaction <id> --workspace <ruta> [--json]
dg inspect theme <nombre>    --workspace <ruta> [--kind <tipo>] [--state <estado>] [--diagram <tipo>] [--catalog] [--json]
```

Cada resultado trae el id cualificado, el tipo y `archivo:linea`. `search` tambien halla Interacciones (por id o titulo); `view` da el tipo de la Vista (`architecture`, `flow`, `sequence`, `er`) y, en secuencia, sus Lifelines como Nodos y la `interaction` que proyecta; `interaction` da titulo, cantidad de items (primer nivel) y de Mensajes, Lifelines en orden de aparicion y las Vistas que la proyectan. `theme` muestra la cadena `extends`, las Partes, la pila de Capas con el `archivo:linea` del parche que fijo cada una (asi se sabe que editar) y las Metricas; tambien los Elementos de secuencia y la fila ER con la misma resolucion que el dibujo: los declarados y, con `--diagram sequence` o `--diagram er`, los derivados de `edge` y `node` (`derived: true` en `--json`); `--catalog` agrega las claves de Primitivas y Movimientos. `inspect theme` marca `hasCode` y lista los componentes cuando el Tema usa codigo. Sale 1 si el Nodo, la Vista, la Interaccion o el Tema no existe (stderr sugiere ids cercanos).

### `edit`: la unica escritura explicita

```
dg edit --workspace <ruta> --view <id> --node <id> --x N --y N [--hash <archivo>=<hash>] [--json]
dg edit --workspace <ruta> --intent '<json>' [--hash <archivo>=<hash>] [--json]
dg edit --workspace <ruta> --edits '<json>' [--hash <archivo>=<hash>] [--json]
```

Todo o nada: si una edicion falla no se escribe nada. Con `--hash`, rechaza la edicion si el archivo cambio desde que se leyo. Solo toca `.dg` del Workspace. `--intent` aplica una Intencion por su contrato JSON (no lleva `hash`: uno heredado en el JSON se ignora; la concurrencia es `--hash <archivo>=<hash>`, que rechaza si ese archivo cambio, y sin `--hash` aplica sobre el texto vigente); hoy ademas de `move-pin` existe `{"type":"reorder-lifelines","view":"flujo","order":["cliente","api","db"]}`: reescribe el `order` completo de una Vista `sequence` con el orden visible dado, aunque coincida con la primera aparicion; las entradas de `order` hoy ocultas (hijas de un Grupo colapsado, excluidas) conservan su posicion relativa. `{"type":"set-theme","view":"general","theme":"claro"}` fija el Tema de una Vista: reescribe el nombre de su `theme` conservando el parche, o inserta `theme claro` como primera linea del cuerpo si no tenia; sin `"theme"` quita la linea (si habia parche escribe `theme neutral { parche }`). Un Tema no declarado (ni en el Workspace ni en `--theme-path`) rechaza con `unknown-theme` (salida 1). Sirve para fijar Pins y para aplicar los `fix` de `validate`; el resto de cambios se editan a mano en el `.dg` y se revalidan.

De donde sale el `--hash`: es el `hashDeContenido` de `canonico` del texto que leiste (53 bits en hexadecimal, no un SHA), y es opcional: sin el, `edit` aplica sobre el texto vigente. Con `dev` corriendo, `GET http://127.0.0.1:<puerto>/api/archivo/<ruta>` da `{ file, texto, hash, version }` y `GET /api/archivos` el `hash` de cada `.dg` (por ejemplo `curl -s http://127.0.0.1:4173/api/archivo/main.dg`); lee el texto y su `hash` de la misma respuesta y pasalo tal cual: `--hash main.dg=<hash>`. Si el archivo cambio entre medias, `edit` rechaza con `stale-hash` (salida 1): vuelve a leer y reintenta.

### `skill`: skill de agente de un Workspace

```
dg skill --workspace <ruta> [--out <archivo>]
```

Genera un `SKILL.md` con los Tipos de nodo, Temas, sintaxis, contratos y codigos de issue de ese Workspace. Es para proyectos que usan el sistema: instalala en la carpeta de skills de tu harness. Regenerala cuando cambien los Tipos de nodo, los Temas o los codigos.

### `scan`: Borrador de escaneo de una codebase

```
dg scan [<raiz>] [--out <archivo>] [--json] [--depth <N>] [--max-files <N>]
```

Lee la codebase de `<raiz>` (la carpeta actual por defecto) sin ejecutar nada y escribe el Borrador de escaneo `rinthel/scan@1` en `<raiz>/.rinthel/scan.json` (o en `--out`; no se versiona). No usa `--workspace` ni escribe `.dg`: el agente lee el Borrador y escribe el Workspace, que se valida con `validate`. Contrato: [ADR 0010](../adr/0010-importador-de-codebases.md).

- **Unidades** (`units`): una por manifiesto (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`), mas la raiz. Su `id` es la carpeta relativa a la raiz (`.` para la raiz) y es la ref de la Source `path` del Nodo que la dibuje. `parent` sale de la ruta y `kind` (`package`, `app`, `module`, `folder`) es una pista, no un Tipo de nodo. Un manifiesto sin otros manifiestos dentro y con 30 archivos o mas se parte en sub-unidades `folder` hasta `--depth` niveles (2 por defecto; 0 no parte).
- **Dependencias** (`dependencies`): imports de TS/JS (`import`, `export ... from`, `import()`, `require()`) agregados por par de unidades, con `weight` (cuantos imports) y hasta 3 `examples` (`archivo:linea`). Los imports dentro de una misma unidad y los modulos de Node no cuentan.
- **Externos** (`externals`): paquetes importados que no son unidades, con `importedBy`; `extracted` si un manifiesto los declara, `inferred` si solo un import los nombra.
- **Limites** (`limits`): archivos leidos, `truncated` si se llego a `--max-files` (20000 por defecto; no falla), imports sin resolver (alias, URLs), archivos de mas de 1 MB sin parsear y los lenguajes cuyos imports esta version no lee (dan unidades sin dependencias).

Cada item lleva `source {file, line}` (linea 0: la carpeta misma) y `confidence` (`extracted` o `inferred`). Respeta los `.gitignore` y siempre salta `node_modules`, `dist`, `build`, `.venv`, `venv`, `vendor`, `third_party`, `__pycache__`, `.git`, `.rinthel` y `.diagrams`. Con el mismo commit, el Borrador es identico byte a byte. stdout es un resumen compacto que termina con el siguiente paso; con `--json`, ese resumen como un objeto con su propio `contractVersion` (`draft`, `schema`, `commit`, `counts`, `limits` y las 15 primeras `units`, `dependencies` y `externals`). Sale 0 si escribio el Borrador y 2 en un fallo de uso.

## Bucle de trabajo

```
dg inspect search <texto> --workspace <ruta>   # que existe y donde esta escrito
# editar el .dg
dg validate --workspace <ruta> --json          # repetir hasta ok: true
dg dev --workspace <ruta>                      # verlo
```

## Opciones comunes

| Opcion | Aplica a | Efecto |
| --- | --- | --- |
| `--workspace <ruta>` | todos | Carpeta con los `.dg` (obligatoria) |
| `--theme-path <dir>` | validate, build, inspect, edit, dev | Carpeta de Temas extra; se fusiona antes del Workspace, que gana en nombres repetidos |
| `--json` | validate, build, inspect, edit | Salida de maquina |

## Registro de actividad

`validate`, `build`, `inspect` y `edit` anexan un Evento de actividad (una linea JSON, `eventoDeActividadSchema` de `canonico`) a `<ruta>/.diagrams/actividad.jsonl`, tambien cuando salen 1 o 2. `skill`, `dev` y la ayuda no registran, ni ningun comando cuyo `--workspace` falte o no sea una carpeta. Cada Evento lleva `ts`, `pid`, `command`, `args` (el argv tras el comando), `exitCode`, `durationMs`, el `target` que el comando nombra (`inspect view|node|theme`, la Vista y el Nodo de una Intencion de `edit`, los archivos que escribio `edit`) y, en `validate` y `build`, `summary { errors, warnings }`; nunca stdout ni stderr. Al pasar 1 MB rota a `actividad.1.jsonl`. Un fallo al escribirlo no cambia la salida ni el codigo. Se sigue sin `dev` con `tail -f <ruta>/.diagrams/actividad.jsonl`. `dev` lo observa aparte del Workspace (ignora lineas rotas y vuelve a leer un registro acortado o rotado) y lo muestra en el panel Agente con los ultimos 50 Eventos; que hace la UI con ellos y con los cambios externos: [Seguir a un agente](ui-de-dev.md#seguir-a-un-agente).

| Variable | Efecto |
| --- | --- |
| `DIAGRAMS_ACTIVIDAD=0` | Desactiva el registro (activo por defecto) |
| `DIAGRAMS_AGENTE=<texto>` | Nombre libre del agente; llega al campo `agente` del Evento |
