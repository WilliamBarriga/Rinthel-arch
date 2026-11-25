---
name: rinthel-diagramas
description: Write, validate and serve .dg diagrams (Nodes, Edges, Views, Steps; Diagram types architecture, flow, sequence and er) with the rinthel-arch `diagrams` CLI. Use when creating or editing a Workspace, writing an Interaction or an ER table, fixing validate issues, reordering Lifelines, showing a diagram to the user, turning an existing codebase into a Workspace, refreshing that Workspace after the code changed, drawing a Blueprint from a PRD or spec, or reconciling planned elements with the code.
compatibility: Requires Node 22 or newer and the `diagrams` CLI (npm package rinthel-arch). Use `diagrams` when it is on the PATH, otherwise `npx -y -p rinthel-arch@0.1.0 diagrams`. Serving the viewer needs a free local port; images need a headless browser.
---

# Diagrams: write and serve

A **Workspace** is a folder of `.dg` files; the text DSL is the only editable source. `.diagrams/` is derived output: it is regenerated, never edited. Vocabulary: Model, View, Pin, Step.

Below, `dg` stands for the CLI: run `diagrams` when it is on the PATH, otherwise `npx -y -p rinthel-arch@0.1.0 diagrams` (the pinned version keeps the JSON contract stable under this skill). `dg <command> --help` is the source of the options. Syntax: `references/dsl-reference.md`.

## Loop

1. **Locate**: `dg inspect search <text> --workspace <path>` gives qualified ids and `file:line`. Use ids that `inspect` returned.
2. **Edit** the `.dg`. Syntax in `references/dsl-reference.md`; a starter Workspace is in "Start a Workspace" below.
3. **Validate**: `dg validate --workspace <path> --json`. Apply each `fix` first (through `dg edit --edits '<json>'` or by hand), read `hint` when there is no `fix`, and key on `code` (stable; `message` changes).
4. **Close** when `ok` is `true` and the summary has no errors. With `--strict`, no warnings either.
5. **Look** at the result (see "Serve and show") when the change is visual: a new View, Pins, Steps.

## Start a Workspace

A new Workspace is a folder with one `main.dg`. This one validates as is and draws an `architecture` View:

```
specification {
  node service  { description "A piece of logic" icon server   color blue }
  node database { description "Storage"          icon database color green }
}
model {
  service api "API"
  database db "Database"
  api -> db "reads and writes"
}
view overview { type architecture include ** }
```

Grow it by adding Nodes and Edges to `model`, kinds to `specification` and Views as needed. Keep Themes in `theme.dg` or a `themes/` folder and fonts in `fonts/` (see skill `rinthel-temas`).

## Pick the Diagram type

The Diagram type (`type` of the View) decides how the same Model is drawn; the Model does not change.

| The user wants... | `type` | What to write |
| --- | --- | --- |
| Pieces and their dependencies | `architecture` | Nodes and Edges; `include`, `depth`, `pin` |
| A step-by-step walk through pieces | `flow` | The same plus `steps { show/hide }` |
| Who calls whom and in what order | `sequence` | An `interaction` in `model` and a View that projects it |
| Tables, columns and foreign keys | `er` | Attributes with `pk fk uk` and Edges with cardinality |

One Model admits several Views of different types. Each syntax in detail: `references/dsl-reference.md` (sections Interactions, Sequence View, `er` Views).

## Sequence

An **Interaction** is an ordered scenario between Model Nodes (the Lifelines); the `sequence` View projects it. This example validates as is:

```
specification { node service { description "A service" icon box color blue } }
model {
  service client "Client"
  service api "API"
  service db "Database"
  interaction purchase "Purchase" {
    order: client -> api "POST /orders"
    alt "in stock" {
      api -> db "reserve"
      reply db -> api "ok"
    } else "out of stock" {
      api -> client "reject"
    }
    note right of db "idempotent"
    reply api -> client "201"
  }
}
view purchase { type sequence interaction purchase order client, api, db autonumber }
```

- Message: `[id:] [async|reply|create|destroy] origin -> target ["label"]`. Declaration order is time order; activations are derived (a `sync` opens, the `reply` closes).
- Fragments `opt loop break critical`, `alt { } else { }`, `par { } and { }`; Notes `note left|right of X`, `note over X, Y`; `ref other-interaction` (also declare a View that projects the referenced one).
- `sequence` View: `interaction` required; `order` optional; `depth`, `collapsed`, `exclude`, `autonumber`. `include` and `pin` do not apply. Steps: `step "title" { upto <Message id> }` or `steps each`; give an `id:` to the Messages a Step cuts at.
- `dg inspect interaction <id> --workspace <path>` gives its Lifelines in order, how many Messages it has and the Views that project it.
- `dg inspect planned --workspace <path>` (no argument) lists the planned elements with their `spec` refs; see the planned mark in `references/dsl-reference.md`.

### Sequence and ER codes in validate

| `code` | Action |
| --- | --- |
| `unknown-lifeline`, `unknown-interaction`, `unknown-step` | Apply the `fix` (typo) or pick an id from the `hint` list |
| `sequence-without-interaction` | Add `interaction <id>` to the View |
| `view-property-for-type` | Remove the property or change `type`; the `hint` says which |
| `create-not-first`, `after-destroy` | Move the `create` to the first appearance or remove the Messages after the `destroy`; `related` points at the other end |
| `invalid-fragment-operand` | `else` only in `alt`, `and` only in `par`; `opt/loop/break/critical` have one operand |
| `step-not-advancing`, `step-not-projected`, `steps-each-with-step` | Steps only advance, over projected Messages; do not mix `steps each` with `step` |
| `er-cardinality` | Only `0..1`, `1`, `0..*`, `1..*` in an `er` View; apply the `fix` |
| `old-catalog-value` | Old (Spanish) name of a built-in Motion, effect, state, Theme, Palette color or Layer, or `ORIGEN`; apply the `fix` |
| `duplicate-key-mark` | Apply the `fix` (deletes the repeated mark) |
| `old-workspace-convention` | Apply the `fix` with `edit --edits`: it renames the file or folder to `fix.rename` (`theme.dg`, `themes/`, `fonts/`). Revalidate: a nested old name shows up next |
| `reply-without-sync`, `order-not-in-interaction`, `ref-without-view` | Warnings: check Message order, the `order`, or add the View of the referenced Interaction |

The full list of codes comes from `dg skill --workspace <path>`.

### Reorder Lifelines

Dragging a header in the viewer rewrites `order`. From the CLI, with the full visible order:

```
dg edit --workspace <path> --intent '{"type":"reorder-lifelines","view":"purchase","order":["api","client","db"]}'
```

## ER

A `type er` View draws each leaf Node as a table. This example validates as is:

```
specification { node table { description "Table" icon box color blue } }
model {
  table customers "Customers" {
    id: uuid pk
    email: text? uk "unique"
  }
  table orders "Orders" {
    id: uuid pk
    customer_id: uuid fk
  }
  orders#customer_id "0..*" -> "1" customers#id "belongs to" identifying
}
view tables { type er include ** }
```

- Attribute `name: type[?] [pk] [fk] [uk] [planned] ["notes"]`; `?` makes it optional. Trailing `identifying` on an Edge: solid line, the rest dashed.
- Endpoints `node#attribute`; cardinalities `0..1`, `1`, `0..*`, `1..*`.
- A collapsed Group aggregates the FKs of its tables (no markers).

## Import from code

Turn a codebase into a Workspace in two halves: `scan` extracts the mechanical facts into a **Scan draft**; you decide what is worth drawing and write the `.dg`. `scan` never writes `.dg` and never runs the project's code.

1. **Scan**: `dg scan <root> --json` writes `<root>/.rinthel/scan.json` (not versioned) and prints counts. Read the draft for the detail; fields and the starting Node kind catalog are in `references/scan-import.md`. Check `limits` first: `truncated` or languages without imports mean a partial picture, say so to the user.
2. **Declare kinds** in `specification` from the catalog in the reference; add only what the draft needs.
3. **Nodes and Groups**: one Node per unit worth showing, with `source { path "<unit id>" }` (the unit id exactly as in the draft; this ref is how a refresh finds the Node again). Nest a Node inside the Node of its `parent` unit, so the folder tree becomes Groups. Skip units that carry no meaning to the reader (an empty root, a folder of fixtures); skipped units stay out of the Model. A Node may cite several units to merge them.
4. **Edges**: draw a `dependencies` item as an Edge when its `weight` makes it meaningful, heaviest first, and leave out the weight-1 imports that add noise. Between Groups, keep one Edge on the Group rather than one per child. Label an Edge with what it means ("calls", "reads") when the code makes it clear, otherwise "uses".
5. **Externals**: add an `external` Node only for the few that shape the system (database driver, queue, payment API); leave the long tail out. Cite `source { path "<external id>" }` like units.
6. **Tables**: for each `tables` item write a `table` Node citing `source { path "<table id>" }` (the table id, not the schema file), its `columns` as Attributes (`name: type[?] [pk] [fk] [uk]`) and each `relations` item as an Edge between `node#column` endpoints with its `cardinality`. Add a `type er` View over them. See "ER".
7. **Views**: a **context View** first (`type architecture`, top-level Groups `collapsed`), then a **per-Group View** for each Group worth opening, reached from the context View with `link <group> -> <view>` (Drill-down). Keep about 30 visible Nodes per View: past that, collapse a Group, split the View or leave minor Nodes out.
8. **Validate** with `dg validate --workspace <path> --json`, as in the Loop, and show the result with `dev`. The Workspace goes in a folder of its own under the root (for example `diagrams/`), versioned with the code.

Completion: every unit and table in the draft is either cited by a Node or deliberately left out, and `validate` reports `ok` with no errors. The next `scan` tells you which: its coverage lists what no Node cites.

## Refresh from code

Run it only when the user asks. No hook or watcher refreshes a Workspace on its own.

1. **Scan again**: `dg scan <root> --json`. It finds the Workspace under `<root>` (pass `--workspace <path>` when several exist), rotates the old draft to `scan.prev.json` and reports `coverage` (what is uncovered, orphan refs, Attribute drift) and `changes` since the previous scan.
2. **Reconcile refs by `path` alone**: a Node matches the draft only through its Source `path` refs; titles, names and guesses do not count. For each orphan ref, decide: a unit or table in `changes.added` that is clearly the same thing was moved, so re-point the ref and keep the Node id; otherwise it is gone.
3. **Remove what disappeared**: a Node whose last ref is gone is removed with every Edge that touches it, without asking, and listed in your report. Ask first only when removal would lose hand-written content: a long description, an Interaction that uses it.
4. **Add what is new**: give each uncovered unit or table worth showing a Node, with the criteria of "Import from code". Draw new `dependencies` the same way; remove an import Edge whose dependency disappeared and keep an Edge that carries meaning the imports never had. Align a table's Attributes with its columns (`missing` and `extra`).
5. **Keep what is written**: for a Node that stays covered, never rewrite its title, description, Group, Node kind, Views or Pins. The refresh only adds, removes or re-points refs and Nodes; a person may have edited the rest on purpose.
6. **Leave things out on purpose** by adding their id or a gitignore-style pattern to `<root>/.rinthel/scan-ignore` (one per line, versioned). Ignored ids leave the coverage report, not the draft.
7. **Validate**, then scan once more.

Completion: the second `scan` reports no orphan refs and no uncovered items that you did not decide to ignore, `validate` is `ok`, and your report lists the Nodes you added, re-pointed and removed. Decision table: `references/scan-import.md`.

## Plan from a spec

Turn a PRD, spec or description of something that does not exist yet into a **Blueprint**: a Workspace whose proposed elements carry the Model mark `planned`. Often the system already exists (a new feature in a repo with a Workspace): then add the proposal to that Workspace and keep real and planned together in the same View. Details, the default Views and an example: `references/plan-from-spec.md`.

1. **Read the spec** whole. List the parts, the key journeys (one user goal each) and any data model it states.
2. **Declare kinds** in `specification`: reuse the Workspace's kinds, or the starting catalog in `references/scan-import.md`.
3. **Draw the proposal**: Nodes (Groups for subsystems), Edges, and Attributes when the spec has tables. Mark every proposed Node, Edge, Attribute and Interaction `planned`; a planned Group marks its descendants, and an Edge or Message touching a planned thing is drawn planned, so mark the root and the Edges that stand alone. Never mark what already exists.
4. **Cite the spec**: when the spec is a file, each Node written from it carries `source { spec "<file>#<section>" }`. Interactions, Edges and Attributes take no `source`: start their `description` with `Spec: <file>#<section>` (an Attribute inherits its table's Node ref). Write no `path` ref on a planned Node, because that says it exists.
5. **Record doubt in the element**: put each guess in the `description` of the element it affects as `Assumption: <what you assumed>`, and each thing the spec leaves undecided (including anything the spec retires) as `Open question: <the question>`. `inspect search "Open question" --workspace <path>` lists them (search also matches descriptions).
6. **Views by default**: one `architecture` View, one `sequence` View per key journey (an `interaction` plus a View that projects it), an `er` View when the spec has a data model. A `flow` View only when the user asks. Keep about 30 visible Nodes per View; collapse Groups and link per-Group Views as in "Import from code".
7. **Validate** as in the Loop (`--strict`), then serve with `dev`.
8. **Ask after showing**: hand over the `dev` URL first, then ask the user at most about 5 questions, only the ones whose answer changes the shape of the diagram (pick them from your `Open question:` list). Apply the answers and validate again.

Completion: `validate` is `ok` with no warnings, every part, journey and table the spec names is drawn or listed as an `Open question:`, and the user has the URL.

## Reconcile a Blueprint with the code

Run it when the user says the system is built (or partly built), never on your own.

1. **List the plan**: `dg inspect planned --workspace <path> --json` gives each planned Node with its `spec` refs, plus planned Attributes, Edges and Interactions.
2. **Scan**: `dg scan <root> --json`, then read the draft (`references/scan-import.md`). The draft is the only evidence of what is built.
3. **Match each planned Node and table** to a unit, external or table of the draft by what it does, never by its title alone. Matching is your decision, not the tool's.
4. **Found**: add the Source `path` ref with the draft id, and remove `planned` from that Node (and from its Attributes when the table exists). Keep its title, description and Edges; drop an `Assumption:` the code confirmed and keep one it did not. An Edge was drawn planned through this Node: when the draft has no such dependency, mark that Edge `planned` itself before the Node loses its mark.
5. **Not found**: keep it `planned` and put it in your report.
6. **Clean up**: `validate` warns `planned-with-path` on a Node that has both marks and gives a `fix` that removes `planned`; apply it only after you checked the path is the real thing. The error `real-node-in-planned-group` means a real Node sits under a planned Group: apply its `fix` (remove the Group's mark) once the Group's children are built, otherwise move the real Node out.
7. **Cover the rest**: units of the draft that no Node cites are new work outside the plan; add them as in "Refresh from code" or leave them out on purpose. `scan` coverage never counts planned Nodes as missing.
8. **Validate**, scan once more, and report.

Report to the user in three lists: **built** (planned elements now cited by a path), **not built yet or diverges from the plan** (still planned; for each, say whether the draft has something close and what differs), and **built but not planned** (uncovered units you added or ignored). Completion: `inspect planned` lists exactly the elements in the second list.

## Serve and show

- `dg dev --workspace <path> --port <N>` serves the dev UI at `http://127.0.0.1:<N>/#view=<id>`. It is a long process: start it in the background, watch its output until the line with the URL and hand that URL to the user.
- `dev` recompiles on save: edit the `.dg` and the UI updates itself. The user also writes from the UI (editor, drags, `fix`, Theme gallery) and can undo from the file History: re-read the file before editing it. So `dg edit` does not overwrite their change, pass `--hash <file>=<hash>` with the `hash` from `GET /api/archivo/<path>` (rejects with `stale-hash`: re-read and retry).
- The UI shows in its Agent panel every `validate`, `build`, `inspect` and `edit` you run and highlights what you change. Export `DIAGRAMS_AGENT=<your name>` so the user knows who it was; do not set `DIAGRAMS_ACTIVITY=0` unless asked.
- To send the diagram to someone without the tool: `dg export --workspace <path> --out <file>.html` writes a self-contained read-only HTML (Views, Steps, `link`, Theme gallery). To show it, serve its folder with a local server and hand over the URL.
- Image of a View: capture the `dev` viewer with a headless browser and give the user a URL served by a local server (`http://localhost:<port>/...`), not a file path.
- A Workspace with a code Theme (`.tsx`) needs `--trust-code` or confirmation in the viewer; trust only your own Workspaces.

## Look things up before inventing

- Unknown syntax or block: `references/dsl-reference.md`.
- Look, colors, fonts, animation: skill `rinthel-temas`.
- CLI options: `dg <command> --help`.
