---
name: rinthel-diagramas
description: Write, validate and serve .dg diagrams (Nodes, Edges, Views, Steps; Diagram types architecture, flow, sequence and er) with the rinthel-arch `diagrams` CLI. Use when creating or editing a Workspace, writing an Interaction or an ER table, fixing validate issues, reordering Lifelines or showing a diagram to the user.
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
| `old-catalog-value` | Old (Spanish) name of a built-in Motion, effect, state or Theme; apply the `fix` |
| `duplicate-key-mark` | Apply the `fix` (deletes the repeated mark) |
| `old-workspace-convention` | Rename the file or folder to the path in `fix.rename` (`theme.dg`, `themes/`, `fonts/`) and revalidate |
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

- Attribute `name: type[?] [pk] [fk] [uk] ["notes"]`; `?` makes it optional. Trailing `identifying` on an Edge: solid line, the rest dashed.
- Endpoints `node#attribute`; cardinalities `0..1`, `1`, `0..*`, `1..*`.
- A collapsed Group aggregates the FKs of its tables (no markers).

## Serve and show

- `dg dev --workspace <path> --port <N>` serves the dev UI at `http://127.0.0.1:<N>/#vista=<id>`. It is a long process: start it in the background, watch its output until the line with the URL and hand that URL to the user.
- `dev` recompiles on save: edit the `.dg` and the UI updates itself. The user also writes from the UI (editor, drags, `fix`, Theme gallery) and can undo from the file History: re-read the file before editing it. So `dg edit` does not overwrite their change, pass `--hash <file>=<hash>` with the `hash` from `GET /api/archivo/<path>` (rejects with `stale-hash`: re-read and retry).
- The UI shows in its Agent panel every `validate`, `build`, `inspect` and `edit` you run and highlights what you change. Export `DIAGRAMS_AGENTE=<your name>` so the user knows who it was; do not set `DIAGRAMS_ACTIVIDAD=0` unless asked.
- To send the diagram to someone without the tool: `dg export --workspace <path> --out <file>.html` writes a self-contained read-only HTML (Views, Steps, `link`, Theme gallery). To show it, serve its folder with a local server and hand over the URL.
- Image of a View: capture the `dev` viewer with a headless browser and give the user a URL served by a local server (`http://localhost:<port>/...`), not a file path.
- A Workspace with a code Theme (`.tsx`) needs `--trust-code` or confirmation in the viewer; trust only your own Workspaces.

## Look things up before inventing

- Unknown syntax or block: `references/dsl-reference.md`.
- Look, colors, fonts, animation: skill `rinthel-temas`.
- CLI options: `dg <command> --help`.
