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

Lista todos los issues en una pasada, ordenados por archivo, linea, columna y codigo. `--max-issues` (100 por defecto) corta la lista y marca `summary.truncated`. Un issue puede traer `fix` (`{ file, range, replacement }`) cuando hay un unico candidato, o `hint` si hay varios. `validate` nunca reescribe archivos.

### `build`: escribir la geometria

```
dg build --workspace <ruta> [las opciones de validate]
```

Escribe `canonico.json` y `geometria/<vista>.json` en `<ruta>/.diagrams/` (derivado: no se versiona ni se edita). Con errores sale 1 y borra la salida anterior.

### `dev`: visor en vivo

```
dg dev --workspace <ruta> [--port N] [--trust-code] [--theme-path <dir>]
```

Sirve en `http://127.0.0.1:<puerto>/` (4173 por defecto, `--port 0` elige uno libre; solo escucha en localhost). Recompila al guardar y muestra un panel de issues clicables; si una edicion rompe el DSL conserva el ultimo dibujo bueno. La Vista se elige con el hash (`#p=<vista>`).

- **Temas con codigo (`.tsx`)**: `dev` no los sirve hasta que lo confirmes en el visor; `--trust-code` lo da de antemano. Usalo solo con Workspaces que conoces.
- **Arrastrar un Nodo** fija su Pin y reescribe el `.dg` (mismo nucleo que `edit`).
- **Como proceso**: es de larga vida. Lanzalo en segundo plano y espera la linea con la URL; el puerto ocupado es un error (`--port` otro).

### `inspect`: consultar el Modelo (solo lectura)

```
dg inspect buscar <texto>   --workspace <ruta> [--json]
dg inspect nodo <id>        --workspace <ruta> [--json]
dg inspect vista <id>       --workspace <ruta> [--json]
dg inspect tema <nombre>    --workspace <ruta> [--tipo <tipo>] [--estado <estado>] [--catalogo] [--json]
```

Cada resultado trae el id cualificado, el tipo y `archivo:linea`. `tema` muestra la cadena `extends`, las Partes, la pila de Capas con el `archivo:linea` del parche que fijo cada una (asi se sabe que editar) y las Metricas; `--catalogo` agrega las claves de Primitivas y Movimientos. Sale 1 si el Nodo, la Vista o el Tema no existe (stderr sugiere ids cercanos).

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

Genera un `SKILL.md` con los Tipos de nodo, Temas, sintaxis, contratos y codigos de issue de ese Workspace. Es para proyectos que usan el sistema: instalala en su `.claude/skills/diagrams/SKILL.md`. Regenerala cuando cambien los Tipos de nodo, los Temas o los codigos.

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
