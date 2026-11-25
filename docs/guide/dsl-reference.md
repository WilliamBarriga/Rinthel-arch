[Leer en espanol](../guia/dsl-reference.md)

# DSL reference

Summary of the syntax of `.dg` files. The full grammar is in `packages/dsl/src/gramatica/diagramas.langium`; the decisions, in [ADR 0001](../adr/0001-dsl-fuente-editable.md). Themes are described in [Customizing with Themes](themes.md). Comments start with `//`.

A Workspace is a folder with any number of `.dg` files (in subfolders too); they merge into a single Model. A file can mix `specification`, `model`, `view`, `theme` and `part` blocks.

## `specification`: Node kinds

```
specification {
  node service { description "Logic piece"  icon server  color blue }
  node note    { description "Test element"  color gray }
}
```

`description`, `icon` and `color` are optional. `color` is a Palette name of the Theme. Icons used in the examples: `user`, `box`, `server`, `database`, `queue`, `cloud`. Using an undeclared kind is an error.

## `model`: Nodes and Edges

```
model {
  kind id "Title" "Description" {
    kind child "Title"                     // a Group is a Node with children
    attrs { id: uuid   total: decimal "in cents" }
    email: text? uk "unique"               // an Attribute can also stand loose in the body (see "`er` Views")
    source { file "packages/x/src/a.ts"  url "https://..." }
  }

  source -> target "label"
  source "1" -> "N" target                 // optional cardinalities
  orders#customer_id -> customers#id       // an Attribute as an end (`node#attribute`)
}
```

- Title and description are optional; without a title, the id is used.
- Children are referenced with the id qualified by their hierarchy: `platform.orders`.
- The spaces around `->` are required (`-` is valid inside an id).
- `source` keeps opaque references to the documented project, one `<kind> "<ref>"` per entry (`path "src/api"`, `spec "prd.md#2"`, `file`, `url`, `git`); the system does not interpret the ref. `scan` and coverage read `path`, `inspect planned` reads `spec`; any other kind is the warning `unknown-source-kind`.
- `extend <node> { ... }`, inside a `model` block, adds children, Attributes or `source` to a Node declared in another file or block.
- Edges are declared only in `model`, never in a View.
- An ordered scenario between Nodes is an Interaction (see below).

### Planned

`planned` marks what is proposed and does not exist yet, next to what is real. It is part of the Model, so every View draws it: the default Theme fades what is planned and gives it a dashed contour (boxes) or dashed lines (Edges, Messages); a Theme can restyle it with `state planned { ... }`.

```
model {
  service checkout "Checkout" "Pays an order" planned {   // after title and description, before the body
    service cart "Cart"                                   // also planned: a planned Group marks its descendants
  }
  table orders "Orders" {
    coupon: text? fk planned "From the PRD"               // among the key marks; in er Views, a PLAN chip
  }
  api -> checkout.cart "adds" planned                     // at the end, after `identifying` if both are present
  interaction pay "Pay" planned { api -> checkout }       // after title and description
}
```

- An Edge is drawn as planned if it carries the mark or if either of its ends (Node or Attribute) is planned; a merged one, only if all that it groups are.
- A Message is drawn as planned if its Interaction or one of its Lifelines is.
- A real Node (with a `path` Source) under a planned Group is the error `real-node-in-planned-group`; its `fix` removes the mark from the Group. The other way out is to take the Node out of the Group.
- A Node named `planned` cannot open the declaration that comes right after a Node, an Edge or an Attribute (it would be read as its mark).

### Interactions

A complete Workspace with an Interaction and the View that draws it:

```dg
specification {
  node actor    { icon user     color purple }
  node service  { icon server   color blue }
  node store    { icon database color green }
  node queue    { icon queue    color amber }
}

model {
  actor client "Customer"
  service api "API"
  store db "Database"
  queue events "Events"

  interaction checkout "Purchase" "Payment flow" {
    place: client -> api "POST /orders"     // `place:` is an optional alias of the Message
    api -> db "query"
    reply db -> api "rows"
    async api -> events "event"
    api -> api "validate"                    // self Message
    reply api -> client "201"
  }
}

view purchase { type sequence  interaction checkout }
```

Lifeline lifecycle: `create source -> target` makes it be born (its header drops to the height of the Message and the arrow ends on it) and `destroy source -> target` ends it (its line is cut with an X, the `cross` marker).

```dg
specification { node piece { icon box  color blue } }
model {
  piece client
  piece api
  piece token
  interaction session {
    client -> api "login"
    create api -> token "issue"
    destroy api -> token "revoke"
  }
}
view lifecycle { type sequence  interaction session }
```

- A Message is `[id:] [async|reply|create|destroy] source -> target ["label"] ["description"]`; without a kind it is `sync`. The ends are Nodes of any level (the Lifelines) and no Edge between them is needed.
- Declaration order is time order. Activation is not written: a `sync` opens one on the receiver and the receiver's next `reply` to the sender closes it.
- `create` only applies on the first appearance of the target (`create-not-first`) and no Lifeline can appear after its `destroy` (`after-destroy`) in declaration order, also inside Fragments; both errors carry `related`.
- Fragment: `opt|loop|break|critical ["guard"] { }` (one operand), `alt ["guard"] { } else ["guard"] { }` and `par { } and { }` (one or more). The guard is free text and optional. `else` only applies in `alt` and `and` in `par`; any other combination gives `invalid-fragment-operand`. A `sync` without `reply` inside a Fragment leaves its activation open until the end of the Fragment. `opt`, `loop`, `break`, `critical`, `alt`, `par`, `else` and `and` remain valid as Node ids.
- Note: `note left of X "text"`, `note right of X "text"` and `note over X[, Y] "text"`. It is drawn as paper (folded corner, text wrapped to a maximum width) and is not a Lifeline; `over X, Y` widens the separation between X and Y if needed. A target that is not a Node gives `unknown-lifeline`.
- `ref <interaction>`: a `ref` frame with the title of the referenced Interaction; it covers its participants present in the View, or all the Lifelines if there is none in common. Cycles are valid (it is not expanded). A nonexistent Interaction gives `unknown-interaction` (with a typo `fix`) and one that no sequence View projects, `ref-without-view`. `note`, `left`, `right`, `of` and `ref` remain valid as Node ids.
- The id of an Interaction has its own namespace (it can match that of a Node); `interaction`, `async`, `reply`, `create`, `destroy` and `order` remain valid as Node ids.

Fragments (nestable), Notes and `ref` in an Interaction; the example is complete:

```dg
specification { node piece { icon box  color blue } }

model {
  piece client
  piece api
  piece db
  piece queue

  interaction checkout {
    client -> api "request"
    alt "in stock" {
      api -> db "reserve"
    } else "out of stock" {
      api -> client "reject"
    }
    par { api -> queue "event" } and { api -> db "audit" }
    note over client, api "idempotent"
    ref auditing
  }
  interaction auditing { db -> queue "record" }
}

view purchase { type sequence  interaction checkout  autonumber }
view audit { type sequence  interaction auditing }
```

## `view`: what to show

```
view packages {
  type architecture             // or flow, sequence, er
  theme diagrams                // optional; default: neutral
  include a, b.*, c.**          // selectors
  exclude a.internal
  depth 1
  expanded render, session      // Groups open at the start
  collapsed canonical, theme    // Groups closed at the start
  link canonical -> canonical-detail // drill-down to another View (a Group with a link does not expand)
  node render { label "Render"  pin 120,40  color amber }
}
```

| Property | Effect |
| --- | --- |
| `type` | `architecture`, `flow`, `sequence` or `er` |
| `include`, `exclude` | Selectors: `a` (the Node), `a.*` (its direct children), `a.**` (all its descendants). `**` alone, the whole Model |
| `depth N` | Initial depth; Groups that exceed it appear collapsed |
| `expanded`, `collapsed` | Initial state of the named Groups |
| `link node -> view` | A linked Group does not expand in this View: it navigates to the other. Cycles are valid; the viewer shows breadcrumbs. In a sequence it only applies from a Lifeline (click on its header or Enter with focus); from a Message, Note or Fragment it is `link-not-lifeline`. The frame of a `ref` navigates to the first sequence View that projects the referenced Interaction (inert if there is none or it is the current one) |
| `theme name { patch }` | Theme of the View, with an optional patch just for it |
| `interaction id` | Only in `sequence` (required): the Interaction it projects |
| `order a, b` | Only in `sequence`: order of the Lifelines from left to right; partial, the rest follows first appearance |
| `autonumber` | Only in `sequence`: numbers the projected Messages (`1. label`), after `exclude`/`depth`; counts `reply`, `create`, `destroy` and lifted self Messages |
| `steps each` | Only in `sequence`: one Step per projected Message (see Steps); it is not combined with `step` |
| `node id { ... }` | Presentation overrides of a Node in this View: `label`, `pin x,y`, `color` |

A View never defines new entities nor touches the Model.

### Sequence View

```
view purchase {
  type sequence
  interaction checkout
  order client, api
}
```

It draws one column per Lifeline and the Messages from top to bottom, with derived activations (nested ones are shifted). Any Theme draws it: `message` and `lifeline` are derived from the Edge and `activation` from the Node; `reply` carries the opposite continuity to the base stroke. `include` and `pin` are an error in a sequence View (`view-property-for-type`), as are `interaction`, `order` and `autonumber` outside it. `depth`, `collapsed` and `exclude` apply: `depth`/`collapsed` merge the child Lifelines into that of their Group and their Messages are lifted (within the same Group they become a self message; a `create`/`destroy` of a child becomes `async`); with the Group open, a `box` with its name wraps its children and the Group's own Lifeline, if it has one, goes first. `exclude` removes the Lifeline and its Messages, and a Fragment that is left empty disappears.

### Pin

`pin x,y` fixes the position of a Node (relative to its parent Group, or to the canvas if it is a root) and overrides auto-layout for that Node. It is not written by hand: drag the Node in the viewer and the Pin is written to the `.dg` (or use `dg edit --view <id> --node <id> --x N --y N`).

## `er` Views: tables and foreign keys

A `type er` View draws each leaf Node as a table (header plus one row per Attribute) and the Edges as FKs with crow's foot markers, without arrows. It accepts the same as `architecture` (`include`, `exclude`, `depth`, `expanded`, `collapsed`, `pin`, `node`, `steps`). It works with any Theme; a `pill` or `circle` Node is drawn as `rect`.

```dg
specification { node table { icon database  color green } }

model {
  table orders "Orders" {
    id: uuid pk
    customer_id: uuid pk fk
    email: text? uk "unique"
  }
  table customers "Customers" { id: uuid pk }
  orders#customer_id "1..*" -> "1" customers#id "belongs to" identifying
}
view tables { type er  include ** }
```

- Attribute: `name: type[?] [pk] [fk] [uk] ["notes"]`. The `?` attached to the type makes it optional; marks go in any order and repeating one is `duplicate-key-mark` (its `fix` deletes the repeated one). Each mark is drawn as a chip in the row.
- Identifying Edge: final word `identifying` (solid line; the others are dashed). A Node named `identifying` cannot open the declaration that comes right after an Edge (it would be read as its mark); `pk`, `fk`, `uk` and `er` are valid as ids anywhere.
- Cardinality: in an ER View only `0..1`, `1`, `0..*` and `1..*` apply (`er-cardinality`, with `fix` if there is a unique close candidate). Each is drawn as its marker (`zero-one`, `one`, `zero-many`, `many`); a collapsed Group with several aggregated FKs goes without markers.
- Outside an ER View the marks and `identifying` are ignored without a warning.

## `flow` Views and Steps

A View can reveal its content in **Steps**. Each Step is cumulative: `show` reveals, `hide` hides. It only changes visibility, never position, so the diagram does not move between Steps.

```
view flow-edit {
  type flow
  include author, shell.sh-selection, session.ses-intents, workspace
  steps {
    step "The author drags a Pin in the shell" {
      show author, shell.sh-selection
    }
    step "The gesture becomes an Intent" {
      show session.ses-intents
    }
    step "The .dg file is rewritten" {
      show workspace
      hide shell.sh-selection
    }
  }
}
```

An item is a Node selector or an Edge (`a -> b`, or `edge a -> b`). In a Step, `a.*` and `a.**` also include the Group `a`.

In a `sequence` View a Step is a **slice of time**: `step "title" { upto <id> }` shows the Interaction up to the Message with that id (included) and only advances; `steps each` gives one Step per projected Message, titled with its label or `from -> to`. `show` and `hide` are an error there (`view-property-for-type`, with a `hint` to `upto`), as are `upto` and `steps each` outside a sequence. Notes and `ref` appear with the previous Message; all Lifelines from the first Step except those born with `create`; the activation is cut at the slice; the frame of a Fragment appears when the slice enters it and the guard of each operand when it enters that operand. Nothing changes position. Errors: `unknown-step` (with a typo `fix`), `step-not-projected` (`depth`/`exclude` remove the Message), `step-not-advancing` (with `related` to the previous Step) and `steps-each-with-step`.

```dg
specification { node piece { icon box  color blue } }
model {
  piece client
  piece api
  interaction checkout {
    request: client -> api "request"
    done: reply api -> client "done"
  }
}
view purchase {
  type sequence
  interaction checkout
  steps { step "Request" { upto request }  step "Done" { upto done } }
}
```

A complete example is in [`examples/rinthel-arch/architecture.dg`](../../examples/rinthel-arch/architecture.dg).

## `theme` and `part`

```
theme mine extends neutral { palette { ... }  node { ... }  group { ... }  edge { ... } }
part bar { layer accent shadow { color COLOR  x 4 } }
```

Details in [Customizing with Themes](themes.md) and in the [catalog](../theme-catalog.md).

## Errors and warnings

`dg validate` prints `file:line:column severity code message`, with `hint` or a fix (`fix`) when there is a single candidate. With `--json` the result is an object with `contractVersion`, for agents and tools ([ADR 0005](../adr/0005-cli-para-agentes.md)). Codes are stable kebab-case names (`duplicate-part`, `theme-low-contrast`, `unknown-lifeline`, `reply-without-sync`...); the severity (`error` blocks, `warning` warns) is a separate field of each issue.
