[Leer en espanol](../guia/cli.md)

# CLI

The CLI is `packages/cli/dist/bin.js` (after `pnpm build`), or the `diagrams` command of the `rinthel-arch` npm package. In this guide it is shortened to `dg`:

```
alias dg="node $PWD/packages/cli/dist/bin.js"
```

`dg --help` lists the commands and `dg <command> --help` gives the options of each one (help goes to stdout, exit code 0). All of them except `scan` require `--workspace <path>` (in `scan` it is optional), the folder with the `.dg` files. Design contract: [ADR 0005](../adr/0005-cli-para-agentes.md).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success (warnings do not fail, except with `--strict`) |
| 1 | The Workspace has errors, or an edit was rejected |
| 2 | Usage or internal failure (message on stderr, empty stdout) |

## `--json` output

With `--json`, stdout is exactly one object, with no extra text. `validate`/`build`, `inspect` and `edit` each carry their own `contractVersion`. Unknown things can be ignored: adding fields or codes does not break the contract; removing or renaming them does. The `code` of an issue is stable; `message` and `hint` are not. The full schema comes out of `dg skill`.

## Commands

### `validate`: compile and validate (read-only)

```
dg validate --workspace <path> [--json] [--strict] [--max-issues N] [--theme <name>] [--theme-path <dir>]
```

Lists all issues in one pass, sorted by file, line, column and code. Without compile errors it computes the layout of Views with at least two Pins and warns `overlapping-pins` for each overlapping pair (with `--strict` it fails); Views without Pins do not pay for layout. If a Theme brings code (`.tsx`) that does not compile, the error is `theme-code-compile`, with file and line. `--max-issues` (100 by default) cuts the list and sets `summary.truncated`. An issue can carry `fix` (`{ file, range, replacement }`) when there is a single candidate, or `hint` if there are several. `validate` never rewrites files.

Codes of the `sequence` and `er` Diagram types (the full list, with descriptions, comes out of `dg skill`):

| Code | When |
| --- | --- |
| `unknown-view-type`, `view-property-for-type` | The View `type` does not exist, or a property does not apply to its type (`include`/`pin` in a sequence; `interaction`/`order`/`autonumber`/`upto` outside it) |
| `sequence-without-interaction`, `unknown-interaction`, `duplicate-interaction` | The `sequence` View declares no `interaction`, or an Interaction (of a View or a `ref`) does not exist or is duplicated |
| `unknown-lifeline`, `duplicate-message-id` | A Message end, a Note or `order` is not a Node; duplicate Message id |
| `create-not-first`, `after-destroy`, `invalid-fragment-operand` | Invalid Lifeline lifecycle and Fragment operands |
| `step-not-projected`, `step-not-advancing` | An `upto` points to a Message the View does not project or that does not advance |
| `order-not-in-interaction`, `ref-without-view`, `reply-without-sync` | Warnings (only fail with `--strict`) |
| `er-cardinality`, `duplicate-key-mark` | Invalid ER cardinality (with `fix`) and repeated key mark (`pk`, `fk`, `uk`) |
| `old-catalog-value` | A Motion, effect, state, built-in Theme, built-in Palette color or Layer, or `ORIGEN` written with its old Spanish name; the `fix` rewrites it to the English name |
| `real-node-in-planned-group` | A real Node (with a `path` Source) under a Group marked `planned`; the `fix` removes the mark from the Group |
| `planned-with-path` | Warning: a Node marked `planned` that also has a `path` Source (it already exists in the code); the `fix` removes `planned` |
| `old-workspace-convention` | A Workspace file or folder uses an old name (`tema.dg`, `temas/`, `fuentes/`); the `fix` carries `rename` to `theme.dg`, `themes/`, `fonts/`. Rename from the outside in and revalidate |

### `build`: write the geometry

```
dg build --workspace <path> [the options of validate]
```

Writes `canonico.json` and `geometria/<view>.json` (`{ view, theme, layoutKey, geometry }`; `geometry.kind` is `grafo` for architecture, flow and er, and `secuencia` for a `sequence` View, with `lifelines`, `activations`, `messages`, `fragments`, `notes` and `groups`) to `<path>/.diagrams/`, replacing only those two (derived: not versioned and not edited; the Activity log is kept). With errors, or with warnings under `--strict`, it exits 1 and deletes the previous output. `--theme` sets the global Theme (a View with its own `theme` overrides it; with none, the neutral one); an undeclared Theme exits 2.

### `dev`: live viewer

```
dg dev --workspace <path> [--port N] [--trust-code] [--theme-path <dir>]
```

Serves the [Dev UI](dev-ui.md) at `http://127.0.0.1:<port>/` (4173 by default, `--port 0` picks a free one; it only listens on localhost): a canvas with the four Diagram types, a View index, the DSL editor, Issues, a Theme gallery, History and the agent feed. It rebuilds on save and, if an edit breaks the DSL, keeps the last good drawing. The View is chosen with the hash (`#vista=<id>`).

- **Themes with code (`.tsx`)**: `dev` does not serve them until you confirm in the UI; `--trust-code` gives it in advance. Use it only with Workspaces you know.
- **Writes**: dragging a Node sets its Pin; in a `sequence` View, dragging a Lifeline header horizontally (or the title of a `box`, which moves the block) rewrites the full `order` and a child does not leave the `box` of its Group. The editor, the `fix` buttons and the gallery also write the `.dg` with the same core as `edit`; each write is an entry in the `dev` file History, which survives edits by other programs.
- **As a process**: it is long-lived. Launch it in the background and wait for the line with the URL; a busy port is an error (use another `--port`).

### `inspect`: query the Model (read-only)

```
dg inspect search <text>    --workspace <path> [--json]
dg inspect node <id>        --workspace <path> [--json]
dg inspect view <id>        --workspace <path> [--json]
dg inspect interaction <id> --workspace <path> [--json]
dg inspect planned          --workspace <path> [--json]
dg inspect theme <name>     --workspace <path> [--kind <kind>] [--state <state>] [--diagram <type>] [--catalog] [--json]
```

Each result carries the qualified id, the kind and `file:line`. `search` also finds Interactions (by id or title); `view` gives the type of the View (`architecture`, `flow`, `sequence`, `er`) and, in a sequence, its Lifelines as Nodes and the `interaction` it projects; `interaction` gives the title, the number of items (first level) and of Messages, the Lifelines in order of appearance and the Views that project it. `planned` (no argument) lists what is planned with inheritance applied: Nodes (with their `spec` Source refs), marked Attributes, Edges and Interactions. `theme` shows the `extends` chain, the Parts, the Layer stack with the `file:line` of the patch that set each one (so you know what to edit) and the Metrics; also the sequence Elements and the ER row with the same resolution as the drawing: the declared ones and, with `--diagram sequence` or `--diagram er`, those derived from `edge` and `node` (`derived: true` in `--json`); `--catalog` adds the keys of Primitives and Motions. `inspect theme` sets `hasCode` and lists the components when the Theme uses code. It exits 1 if the Node, View, Interaction or Theme does not exist (stderr suggests nearby ids).

### `edit`: the only explicit write

```
dg edit --workspace <path> --view <id> --node <id> --x N --y N [--hash <file>=<hash>] [--json]
dg edit --workspace <path> --intent '<json>' [--hash <file>=<hash>] [--json]
dg edit --workspace <path> --edits '<json>' [--hash <file>=<hash>] [--json]
```

All or nothing: if an edit fails nothing is written. With `--hash`, it rejects the edit if the file changed since it was read. It only touches the `.dg` files of the Workspace. `--intent` applies an Intent through its JSON contract (it carries no `hash`: one inherited in the JSON is ignored; concurrency is `--hash <file>=<hash>`, which rejects if that file changed, and without `--hash` it applies on the current text); today, besides `move-pin`, there is `{"type":"reorder-lifelines","view":"flow","order":["client","api","db"]}`: it rewrites the full `order` of a `sequence` View with the given visible order, even if it matches first appearance; entries of `order` that are hidden today (children of a collapsed Group, excluded) keep their relative position. `{"type":"set-theme","view":"overview","theme":"light"}` sets the Theme of a View: it rewrites the name of its `theme` keeping the patch, or inserts `theme light` as the first line of the body if it had none; without `"theme"` it removes the line (if there was a patch it writes `theme neutral { patch }`). A Theme that is not declared (neither in the Workspace nor in `--theme-path`) is rejected with `unknown-theme` (exit 1). It serves to set Pins and to apply the `fix` of `validate`; other changes are edited by hand in the `.dg` and revalidated.

Where `--hash` comes from: it is the `hashDeContenido` of `canonico` of the text you read (53 bits in hexadecimal, not a SHA), and it is optional: without it, `edit` applies on the current text. With `dev` running, `GET http://127.0.0.1:<port>/api/archivo/<path>` gives `{ file, texto, hash, version }` and `GET /api/archivos` the `hash` of each `.dg` (for example `curl -s http://127.0.0.1:4173/api/archivo/main.dg`); read the text and its `hash` from the same response and pass it as is: `--hash main.dg=<hash>`. If the file changed in between, `edit` rejects with `stale-hash` (exit 1): read again and retry.

### `skill`: agent skill of a Workspace

```
dg skill --workspace <path> [--out <file>]
```

Generates a `SKILL.md` with the Node kinds, Themes, syntax, contracts and issue codes of that Workspace. It is for projects that use the system: install it in the skills folder of your harness. Regenerate it when the Node kinds, the Themes or the codes change.

### `scan`: Scan draft of a codebase

```
dg scan [<root>] [--out <file>] [--json] [--depth <N>] [--max-files <N>] [--workspace <path>]
```

Reads the codebase at `<root>` (the current folder by default) without running anything and writes the `rinthel/scan@1` Scan draft to `<root>/.rinthel/scan.json` (or to `--out`; not versioned). It does not use `--workspace` for input nor write `.dg`: the agent reads the draft and writes the Workspace, which is validated with `validate`. Contract: [ADR 0010](../adr/0010-importador-de-codebases.md).

- **Units** (`units`): one per manifest (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`), plus the root. Its `id` is the folder relative to the root (`.` for the root) and is the ref of the `path` Source of the Node that draws it. `parent` comes from the path and `kind` (`package`, `app`, `module`, `folder`) is a hint, not a Node kind. A manifest with no other manifests inside and with 30 files or more is split into `folder` sub-units down to `--depth` levels (2 by default; 0 does not split).
- **Dependencies** (`dependencies`): TS/JS imports (`import`, `export ... from`, `import()`, `require()`) aggregated per pair of units, with `weight` (how many imports) and up to 3 `examples` (`file:line`). Imports within the same unit and Node modules do not count.
- **Externals** (`externals`): imported packages that are not units, with `importedBy`; `extracted` if a manifest declares them, `inferred` if only an import names them.
- **Tables** (`tables`): read without running anything from Prisma schemas (`*.prisma`, even spread over several files), Drizzle models (`pgTable`, `mysqlTable`, `sqliteTable`), Django (`models.py`, table `db_table` or `<app>_<model>`, implicit `id`, `ManyToManyField` tables) and SQLAlchemy (classes with `__tablename__`, `Column`, `mapped_column` and `Table(...)`), read from the syntax tree without importing the code (a pattern it does not understand lowers `confidence` to `inferred`), and from SQL DDL (`*.sql`: `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `CREATE UNIQUE INDEX`). `name` is the name in the database (`@@map` and `@map` in Prisma), `origin` says where it came from (`prisma`, `sql`, `drizzle`, `django`, `sqlalchemy`), `columns` carry `type` and `pk`, `fk`, `uk`, `optional`, and `relations` go from `<table>#<column>` to `<table>#<column>` with their `cardinality` (`["0..*", "1"]`). Its `id` is the table name, or `<schema file>:<name>` if two schemas have a table with the same name; it is the ref of the `path` Source of the Node that draws it in an `er` View. The `.sql` files of a folder are applied in path order, so a migration history gives the final tables; `down` migrations and those generated by Prisma (folder with `migration_lock.toml`) or drizzle-kit (with `meta/_journal.json`) are skipped, since their schema is already read.
- **Limits** (`limits`): files read, `truncated` if `--max-files` was reached (20000 by default; it does not fail), unresolved imports (aliases, URLs), files over 1 MB not parsed and the languages whose imports this version does not read (they give units without dependencies).

Each item carries `source {file, line}` (line 0: the folder itself) and `confidence` (`extracted` or `inferred`). It respects `.gitignore` and always skips `node_modules`, `dist`, `build`, `.venv`, `venv`, `vendor`, `third_party`, `__pycache__`, `.git`, `.rinthel` and `.diagrams`. With the same commit, the draft is byte-for-byte identical. stdout is a compact summary that ends with the next step; with `--json`, that summary as an object with its own `contractVersion` (`draft`, `schema`, `commit`, `counts`, `limits` and the first 15 `units`, `dependencies`, `externals` and `tables`). If there are tables, the next step suggests an `er` View. It exits 0 if it wrote the draft and 2 on a usage failure.

Refreshing an already written Workspace ([ADR 0010](../adr/0010-importador-de-codebases.md), "incremental refresh" amendment):

- **Scan coverage** (`coverage`): if there is a Workspace (`--workspace <path>`, or the shallowest folder under `<root>`, up to 4 levels, that has `.dg` files), `scan` compiles it without running anything and compares it with the draft only by the `path` Sources of its Nodes: units and tables that no Node cites (`units.uncovered`, `tables.uncovered`), refs that are no id of the draft (`orphanRefs`, per Node) and, in Nodes that cite a table, columns without an Attribute (`missing`) and Attributes without a column (`extra`). It is informative: they are not Issues and the exit code stays 0. If there are two or more Workspaces at the same depth or the Workspace does not compile, `coverage` carries `error` and the text says so. Without a Workspace, `coverage` is `null`. With coverage, the next step becomes refreshing the Workspace.
- **`.rinthel/scan-ignore`** (versioned): `.gitignore`-style patterns over unit ids, table ids and refs (`packages/legacy-*`, `audit_log`; the root unit only with a `.` line). What matches leaves the coverage (and is counted in `ignored`), not the draft.
- **Changes since the previous scan** (`changes`): before writing, `scan` rotates the previous draft to `scan.prev.json` next to `--out` (`.rinthel/scan.prev.json` by default, not versioned) and lists by id the units, dependencies, externals, tables and columns (`<table>#<column>`, only of tables that remain) added or removed, with the two commits. A table whose id was qualified because another one with the same name appeared shows up as removed and added. Without a previous draft, `changes` is `null`.

### `export`: a self-contained HTML to send to anyone

```
dg export --workspace <path> --out <file>.html [--theme-path <dir>]
```

Writes the [Dev UI](dev-ui.md) of the Workspace as **a single read-only HTML file**: it opens with a double click (`file://`) or from any static server, without asking anything of the network. The View index, the Steps, the `link`s (drill-down), Group collapse, Selection, the Finder (Views and commands) and the Theme gallery to preview another Theme work; the editor, Issues, Details, History, the agent feed, Diffs and anything that writes (dragging Nodes, pinning a Theme, `fix`) are not there. The top bar marks it with "Read-only".

- **Inside the file**: the page, the layout engine (ELK, in a Worker started from a Blob or, if the browser does not allow it, on the main thread) and the fonts of the Themes (of the Workspace and of `--theme-path`). The `examples/rinthel-arch` example (33 Views, 15 Themes) weighs about 5 MB, 2.1 MB gzipped.
- **Themes with code (`.tsx`)**: they go inside and run in the browser of whoever opens the file, without confirmation; the command warns about it on stdout.
- It writes nothing next to the Workspace. It exits 0 if it wrote the file, 1 if the Workspace has errors (it lists them and writes nothing) and 2 on a usage failure.

## Working loop

```
dg inspect search <text> --workspace <path>    # what exists and where it is written
# edit the .dg
dg validate --workspace <path> --json          # repeat until ok: true
dg dev --workspace <path>                      # see it
```

## Common options

| Option | Applies to | Effect |
| --- | --- | --- |
| `--workspace <path>` | all | Folder with the `.dg` files (required) |
| `--theme-path <dir>` | validate, build, inspect, edit, dev | Folder of extra Themes; merged before the Workspace, which wins on repeated names |
| `--json` | validate, build, inspect, edit | Machine output |

## Activity log

`validate`, `build`, `inspect` and `edit` append an Activity event (one JSON line, `eventoDeActividadSchema` of `canonico`) to `<path>/.diagrams/actividad.jsonl`, also when they exit 1 or 2. `skill`, `dev` and help do not log, nor does any command whose `--workspace` is missing or not a folder. Each event carries `ts`, `pid`, `command`, `args` (the argv after the command), `exitCode`, `durationMs`, the `target` that the command names (`inspect view|node|theme`, the View and Node of an `edit` Intent, the files `edit` wrote) and, in `validate` and `build`, `summary { errors, warnings }`; never stdout or stderr. Past 1 MB it rotates to `actividad.1.jsonl`. A failure to write it changes neither the output nor the code. It is followed without `dev` with `tail -f <path>/.diagrams/actividad.jsonl`. `dev` watches it separately from the Workspace (ignores broken lines and rereads a shortened or rotated log) and shows it in the Agent panel with the last 50 events; what the UI does with them and with external changes: [Follow an agent](dev-ui.md#follow-an-agent).

| Variable | Effect |
| --- | --- |
| `DIAGRAMS_ACTIVIDAD=0` | Turns the log off (on by default) |
| `DIAGRAMS_AGENTE=<text>` | Free-form agent name; it reaches the `agent` field of the event |
