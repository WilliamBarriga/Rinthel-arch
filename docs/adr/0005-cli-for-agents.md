# CLI for agents: `validate`, `dev`/`inspect` and `edit`

## Output contract of `validate`: versioned JSON object, issues with a structured `fix`

`validate` is read-only and reports every Issue in one pass (cap `--max-issues`, 100 by default; `truncated: true` if it is cut). With `--json` it prints a single object to stdout, with no extra text, sorted deterministically (file, line, column, code):

```
{ contractVersion: 2, ok, summary: { errors, warnings, truncated }, issues: [...] }
```

Each Issue: a stable `code`, `severity` (`error` | `warning`), `file`, `line`, `column`, `message`, and optional `hint` (text), `related: [{file,line,column,message}]` (e.g. the original duplicated Node) and `fix`. The `fix` is a structured edit of the Text DSL (`{ file, range, replacement }`; with `rename` it renames `file`, a file or folder of the Workspace, to that path and the range is an empty edit) and is only emitted in unambiguous cases (a single candidate); if there is ambiguity, `hint` remains. It never edits the canonical JSON (ADR 0001).

Exit codes: `0` no errors (warnings allowed), `1` there are errors, `2` usage or internal failure. `--strict` treats warnings as exit 1.

Versioning: `contractVersion` is an integer from the start. Removing or renaming fields or codes, changing their meaning or the exit codes is a breaking change; adding fields or codes is not (consumers ignore what they do not know). Codes are deprecated, never recycled. The codes and `code`/`fix` are public contract; the text of `message` and `hint` is not. The Zod schema of the output is the source of the skill generated for agents.

`validate --fix` is discarded: the agent applies the edits with its own tools and revalidates (the validate/autoFix loop of json-render), and the CLI does not rewrite Workspace files. NDJSON is discarded: one object is simpler to parse and to test with snapshots.

Explicit structured editing (`diagrams edit` and the `dev` shell) is a bounded exception, see below; `validate --fix` stays discarded.

## Live loop (`dev`) and Model query (`inspect`) for human, agent or joint work

The Text DSL in git is the only coordination point between whoever edits (human, agent or both); the system adds no locks or shared state.

### `diagrams dev --workspace <path>`

A `cli` command with a Node HTTP server with no new dependencies, listening only on `127.0.0.1`. It serves the bundled shell and the geometry per View; changes reach the browser through Server-Sent Events (the flow is one-way). It watches the Workspace, recompiles with a ~150 ms debounce and pushes the View and the Issues. The screen shows the View (chosen by the URL hash) and a panel of clickable Issues (`file:line`). If two authors touch the same `.dg`, the last write wins; reconciliation belongs to git. WebSocket is discarded (no inbound channel is needed), as is any edit lock.

### `diagrams inspect`

Read-only subcommands: `search <text>`, `node <id>`, `view <id>`. Readable text by default; `--json` prints an object with its own `contractVersion`, independent of `validate`'s. Each result carries the qualified id, the kind and the `file:line` from the Locator.

### Skill for agents

`diagrams skill` documents `inspect` and `dev`; the loop becomes inspect, edit, validate.

### Out of scope

Structured editing of the DSL (applying `fix`, moving Pins from the shell, formatter) is the only capability that writes to disk; it is decided below.

## Structured editing of the DSL: explicit and bounded writing, same core for human and agent

Human and agent must be able to work comfortably, alone or together. Moving a Pin from the shell is a gesture a human does not do well by hand and that costs the agent effort (read, locate the block, rewrite a line). That is why the `validate` contract is reopened at a single point: there is an explicit and bounded write over the Text DSL. `validate` stays read-only and `validate --fix` stays discarded. The DSL is still the only editable source (ADR 0001); the canonical JSON is never edited.

### Common core

A single write gate `aplicarAlWorkspace(puerto, aplicable, visto?)` in the `sesion` package (applying `{ file, range, replacement }` edits over the file map is internal, pure and does not touch disk; only the gate writes through the port). It has two entry points:

- **Shell** (`dev`): edit endpoint, at the human's request when making a gesture.
- **CLI**: `diagrams edit` with `--json`, for the agent. Same exit codes as `validate` (0 correct, 1 edit rejected or invalid, 2 usage or internal failure) and its own `contractVersion`, like `inspect`. It only writes edits the caller asked for; never as a side effect of validating.

### Semantic Intent

The shell and the command send the Intent (`{ vista, nodo, x, y }`), not ranges. The server computes the edit with the AST and the Locator: it replaces the `pin` if it already exists and inserts it otherwise. Callers do not need to know the DSL syntax. The command also accepts already computed `{ file, range, replacement }` edits (e.g. the `fix` of a `validate` Issue).

### Concurrency

Each structured edit (`--edits`) carries the hash of the content its requester saw. For Intents (`--intent`), `visto` rules (ADR 0007): the `hash` of `--intent` is optional and ignored. If the file on disk no longer matches, it is rejected with no partial write; the shell reloads the View and warns. This qualifies the "last write wins" of `dev` only for structured edits; the rest of the reconciliation still belongs to git. There is no undo of its own: the DSL is in git.

### Scope

The first delivery covers only dragging Pins. The module is generic: each new gesture (short label, style, order, drill-down link) is a small ticket, with no ADR of its own.

### Discarded

- A full canonical formatter: it rewrites whole files and there is no concrete need. Each gesture emits the minimal edit with a fixed format. It is revisited if real noise appears in the diffs.
- `validate --fix` and any automatic correction while validating.
- An undo of its own and edit locks.

## Amendment: Themes in the CLI (expressive Theme system, ADR 0008)

A Theme is DSL text like any other block, so the CLI gains no new mode. Only four points are bounded; the detail of each Theme, Layer and code lives in ADR 0008.

### `inspect theme <name>`

Read-only subcommand, with `--json` and its own `contractVersion` like the rest of `inspect`. Options `--kind <kind>` and `--state <state>` resolve the cascade for one case. The output carries:

- the `extends` chain and the `part`s used;
- the resolved Layer stack for the requested Kind and state, each Layer with the `file:line` of the patch that set it;
- the Metrics table;
- the sequence Elements and the ER row (ADR 0009) with the same resolution as drawing (the Resolved style of `tema`, with no CLI-specific patches): the declared ones and, with `--diagram sequence` or `er`, the ones derived from `edge` and `node` with `derivado: true` (additive change; `contractVersion` stays at 1);
- `hasCode` and the list of components;
- with `--catalog`, the catalog keys of Primitives and Motions, derived from the single schema (no parallel lists).

It lets the agent know which patch to touch before editing.

### `edit`: no changes

`edit` gains no gestures for Themes: the agent edits the `.dg` with its own tools and revalidates. A Layer patch is readable text, not an awkward gesture by hand. A future gesture (e.g. a color picker in the viewer) is a small ticket with no ADR, as this ADR already establishes. Through `edit` only the `fix`es of `validate` are applied (`{ file, range, replacement }`).

### `validate`: no structural amendment

Theme codes (unknown property, nonexistent `before`/`after`, contrast, `solo-color`, `hasCode`, `.tsx` compilation errors...) are new codes: adding codes does not break the contract and `contractVersion` stays at 1. Conventions for them:

- the "did you mean" `fix` is emitted only with a single close candidate; if there are more, `hint` remains;
- Issues of a Theme patch carry `related` pointing to the base Layer it patches.

### `dev`: reload classified by kind of change

`dev` also watches the fonts and the `.tsx` files of the Workspace, with the same debounce (~150 ms) and the same SSE channel. The pushed message states the kind of change so the viewer does the minimum:

- `pintura` (only painted Layers or animation): the Resolved style is pushed without relayout, with the Fresh geometry;
- `estructura` (the structure key changes: Metrics, font): relayout;
- `codigo` (a `.tsx` changes): the component is recompiled and registered again, without relayout.

If something fails (DSL or compilation) the Issues panel shows it and `dev` keeps the last good drawing. The page requests the geometry only for the active View, and none after a `pintura` change (protocol in ADR 0007).

Trust in code: `dev` does not serve `/componentes.js` until the user confirms (the viewer asks the first time the Workspace has a Theme with code; `--trust-code` grants it beforehand) and warns about the code at startup. `/api/codigo` reports `hasCode`, the components and whether it is confirmed.

### Left as implementation

The `inspect theme` subcommand, the Theme codes in `validate`, the change classifier (`pintura` | `estructura` | `codigo`) and the watcher for fonts and `.tsx`.

## Amendment: Activity log

The Dev UI shows in real time what an agent does with the CLI from another process. Options compared in `research/actividad-cli-dev` (branch `research/actividad-cli-dev`).

### Channel

The CLI writes an append-only log per Workspace, `resolve(--workspace)/.diagrams/activity.jsonl`, with one JSON Activity event per line. `dev` watches it with a watcher of its own (the Workspace watcher still ignores hidden folders). It is the only channel: it works without `dev`, with several agents and several `dev`s, serves other consumers (`tail -f`, tests, screenshots) and opens no network surface. A POST to the live `dev` with the same schema remains a possible lower-latency transport, with no reserved route. Running the commands through `dev` is discarded (two execution paths, an endpoint that runs writes, shared state).

`build` no longer deletes the whole `.diagrams/`: it replaces only `canonico.json` and `geometria/`.

### What is logged

`validate`, `build`, `inspect` and `edit` log, also when they exit with 1 or 2. `skill`, `dev` and help do not log. If `--workspace` is missing or does not resolve, there is nowhere to write and nothing is logged. What the human does from the Dev UI (Gestures, saving from the editor) does not enter the log.

`validate` and `inspect` still do not touch the DSL or the outputs of `build`; their only new side effect is this trail. On by default; `DIAGRAMS_ACTIVITY=0` turns it off. A failure writing the log is ignored: it never changes stdout, stderr or the exit code.

The emitter is a single point of the CLI (a wrapper of `run` or an injectable dependency), not each command; `sesion` stays pure.

### Event

```
{ contractVersion: 2, ts, pid, agent?, command, args, exitCode, durationMs,
  target?: { view?, node?, theme?, files? },
  summary?: { errors, warnings } }
```

- `agent`: free text from `DIAGRAMS_AGENT`, if someone sets it; the system knows no harness.
- `args`: the full argv after the command.
- `target`: only what the command names (`inspect view|node|theme`, the View or Node of an `edit` Intent, the `files` that `edit` wrote). The CLI infers nothing.
- `summary`: from `validate` and `build`. stdout and stderr are not stored.

Short lines written with a single `write` in append mode; the reader drops lines that do not parse. Zod schema `eventoDeActividadSchema` in `canonico`, with its own `contractVersion` and the compatibility rules of `validate`.

### Retention

Past 1 MB, the writer rotates to `activity.1.jsonl` (a single previous generation). The reader tolerates the file getting shorter.

### In `dev` and the UI

`dev` replays the last 50 events at startup and then follows live. It pushes them over SSE as a named event (`event: actividad`), separate from `EstadoDeDev`.

Feed of the Agent panel: one line per event (time, agent or pid, command, clickable target, result mark: ok, errors, warnings or usage failure); the `args` on expand. No filters in the first delivery.

Follow the agent (toggle): `target.view` goes to that View; `target.node` stays on the active View if it contains it and otherwise jumps to the first View, in declaration order, that contains it, and selects it; `target.files` does not move on its own. The `dev` page resolves it with the source of the current state (`destinoDelObjetivo` in `estudio`). Highlighting what changed belongs to the Session Diff, not to this log.

## Amendment: Intent `set-theme` and reason `unknown-theme` (#176, map #168)

`diagrams edit --intent` accepts the Intent `set-theme` `{ vista, tema? }` (ADR 0007). The `reason` enum of `edit --json` adds `unknown-theme` (exit 1; 422 in `dev`), parallel to `unknown-view`. The rest of the `edit` output does not change.

## Amendment: English public contract (spec #226)

- **JSON keys and values in English (#228), one breaking change without aliases**: `validate` 2, `inspect` 2, `edit` 2 and the activity log 2. `inspect`: `comando`/`consulta`/`resultados` are `command`/`query`/`results`, and the node, view, interaction and theme payloads use English keys (`node`, `edges`, `views`, `theme`, `layers`...). `edit` Intents use `type`, `view`, `node`, `order`, `theme`; rejections carry `reason`, `message` and `suggestions`. Activity events carry `agent`, `command`, `durationMs`, `target { view, node, theme, files }` and `summary { errors, warnings }`. New codes and reasons are kebab-case English with no `E_`/`W_` prefix. The env vars are `DIAGRAMS_AGENT` and `DIAGRAMS_ACTIVITY` and the log is `.diagrams/activity.jsonl` (rotated to `activity.1.jsonl`).
- **Additive, no version bump (review of #226)**: `inspect search` also matches Node and Interaction descriptions (description-only matches sort last). An `edit --edits` entry may carry `rename` (the `fix` of `old-workspace-convention`): the file or folder is renamed in the same all-or-nothing batch as the text edits, its new path is listed in `files`, and an impossible rename rejects the batch with the new reason `invalid-rename`. The warning `unknown-source-kind` is a new code. `scan --json` (contract `SCAN_CONTRACT_VERSION`) has its Zod schema `scanSummarySchema` in `canonico`; draft relations gained `source`.
