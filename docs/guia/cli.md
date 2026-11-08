# CLI

El CLI es `packages/cli/dist/bin.js` (tras `pnpm build`). En esta guia se abrevia `dg`:

```
alias dg="node $PWD/packages/cli/dist/bin.js"
```

`dg --help` lista los comandos y `dg <comando> --help` da las opciones de cada uno (la ayuda sale en stdout, codigo 0). Todos piden `--workspace <ruta>`, la carpeta con los `.dg`. Contrato de diseno: [ADR 0005](../adr/0005-cli-para-agentes.md).

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

Lista todos los issues en una pasada, ordenados por archivo, linea, columna y codigo. Sin errores de compilacion calcula el layout de las Vistas con al menos dos Pins y avisa `W_OVERLAPPING_PINS` por cada par solapado (con `--strict` hace fallar); las Vistas sin Pins no pagan layout. Si un Tema trae codigo (`.tsx`) que no compila, el error es `E_THEME_CODE_COMPILE`, con archivo y linea. `--max-issues` (100 por defecto) corta la lista y marca `summary.truncated`. Un issue puede traer `fix` (`{ file, range, replacement }`) cuando hay un unico candidato, o `hint` si hay varios. `validate` nunca reescribe archivos.

Codigos de los Tipos de diagrama `sequence` y `er` (la lista completa, con su descripcion, sale en `dg skill`):

| Codigo | Cuando |
| --- | --- |
| `E_UNKNOWN_VIEW_TYPE`, `E_VIEW_PROPERTY_FOR_TYPE` | El `type` de la Vista no existe, o una propiedad no vale para su Tipo (`include`/`pin` en secuencia; `interaction`/`order`/`autonumber`/`upto` fuera de ella) |
| `E_SEQUENCE_WITHOUT_INTERACTION`, `E_UNKNOWN_INTERACTION`, `E_DUPLICATE_INTERACTION` | La Vista `sequence` no declara `interaction`, o una Interaccion (de una Vista o un `ref`) no existe o esta repetida |
| `E_UNKNOWN_LIFELINE`, `E_DUPLICATE_MESSAGE_ID` | Un extremo de Mensaje, una Nota u `order` no es un Nodo; id de Mensaje repetido |
| `E_CREATE_NOT_FIRST`, `E_AFTER_DESTROY`, `E_INVALID_FRAGMENT_OPERAND` | Ciclo de vida de la Lifeline y operandos de Fragmento invalidos |
| `E_STEP_NOT_PROJECTED`, `E_STEP_NOT_ADVANCING` | Un `upto` apunta a un Mensaje que la Vista no proyecta o no avanza |
| `W_ORDER_NOT_IN_INTERACTION`, `W_REF_WITHOUT_VIEW`, `W_REPLY_WITHOUT_SYNC` | Avisos (solo fallan con `--strict`) |
| `E_ER_CARDINALITY`, `E_DUPLICATE_KEY_MARK` | Cardinalidad ER invalida (con `fix`) y marca de clave repetida (`pk`, `fk`, `uk`) |

### `build`: escribir la geometria

```
dg build --workspace <ruta> [las opciones de validate]
```

Escribe `canonico.json` y `geometria/<vista>.json` (`{ view, theme, layoutKey, geometry }`; `geometry.kind` es `grafo` para architecture, flow y er, y `secuencia` para una Vista `sequence`, con `lifelines`, `activations`, `messages`, `fragments`, `notes` y `groups`) en `<ruta>/.diagrams/`, reemplazandola (derivado: no se versiona ni se edita). Con errores, o con avisos en `--strict`, sale 1 y borra la salida anterior. `--theme` fija el Tema global (una Vista con `theme` propio lo anula; sin ninguno, el neutro); un Tema no declarado sale 2.

### `dev`: visor en vivo

```
dg dev --workspace <ruta> [--port N] [--trust-code] [--theme-path <dir>]
```

Sirve en `http://127.0.0.1:<puerto>/` (4173 por defecto, `--port 0` elige uno libre; solo escucha en localhost). Sirve los cuatro Tipos de diagrama (architecture, flow, sequence y er). Recompila al guardar y muestra un panel de issues clicables; si una edicion rompe el DSL conserva el ultimo dibujo bueno. La Vista se elige con el hash (`#p=<vista>`).

- **Temas con codigo (`.tsx`)**: `dev` no los sirve hasta que lo confirmes en el visor; `--trust-code` lo da de antemano. Usalo solo con Workspaces que conoces.
- **Arrastrar un Nodo** fija su Pin y reescribe el `.dg` (mismo nucleo que `edit`).
- **Como proceso**: es de larga vida. Lanzalo en segundo plano y espera la linea con la URL; el puerto ocupado es un error (`--port` otro).

### `inspect`: consultar el Modelo (solo lectura)

```
dg inspect buscar <texto>   --workspace <ruta> [--json]
dg inspect nodo <id>        --workspace <ruta> [--json]
dg inspect vista <id>       --workspace <ruta> [--json]
dg inspect interaccion <id> --workspace <ruta> [--json]
dg inspect tema <nombre>    --workspace <ruta> [--tipo <tipo>] [--estado <estado>] [--diagrama <tipo>] [--catalogo] [--json]
```

Cada resultado trae el id cualificado, el tipo y `archivo:linea`. `buscar` tambien halla Interacciones (por id o titulo); `vista` da el tipo de la Vista (`architecture`, `flow`, `sequence`, `er`) y, en secuencia, sus Lifelines como Nodos y la `interaction` que proyecta; `interaccion` da titulo, cantidad de items (primer nivel) y de Mensajes, Lifelines en orden de aparicion y las Vistas que la proyectan. `tema` muestra la cadena `extends`, las Partes, la pila de Capas con el `archivo:linea` del parche que fijo cada una (asi se sabe que editar) y las Metricas; `--catalogo` agrega las claves de Primitivas y Movimientos. `inspect tema` marca `temaConCodigo` y lista los componentes cuando el Tema usa codigo. Sale 1 si el Nodo, la Vista, la Interaccion o el Tema no existe (stderr sugiere ids cercanos).

### `edit`: la unica escritura explicita

```
dg edit --workspace <ruta> --view <id> --node <id> --x N --y N [--hash <archivo>=<hash>] [--json]
dg edit --workspace <ruta> --edits '<json>' [--hash <archivo>=<hash>] [--json]
```

Todo o nada: si una edicion falla no se escribe nada. Con `--hash`, rechaza la edicion si el archivo cambio desde que se leyo. Solo toca `.dg` del Workspace. Sirve para fijar Pins y para aplicar los `fix` de `validate`; el resto de cambios se editan a mano en el `.dg` y se revalidan.

### `skill`: skill de agente de un Workspace

```
dg skill --workspace <ruta> [--out <archivo>]
```

Genera un `SKILL.md` con los Tipos de nodo, Temas, sintaxis, contratos y codigos de issue de ese Workspace. Es para proyectos que usan el sistema: instalala en la carpeta de skills de tu harness. Regenerala cuando cambien los Tipos de nodo, los Temas o los codigos.

## Bucle de trabajo

```
dg inspect buscar <texto> --workspace <ruta>   # que existe y donde esta escrito
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
