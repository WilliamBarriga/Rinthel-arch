# DSL reference

Syntax summary of `.dg` files. Comments start with `//`. Theme syntax is in the `rinthel-temas` skill.

A Workspace is a folder with any number of `.dg` files (subfolders too); they merge into a single Model. A file may mix `specification`, `model`, `view`, `theme` and `part` blocks.

## Contents

- `specification`: Node kinds
- `model`: Nodes and Edges
- Planned elements
- Interactions (sequence)
- `view`: what to show
- Sequence View
- Pin
- `er` Views: tables and foreign keys
- `flow` Views and Steps
- Errors and warnings

## `specification`: Node kinds

```
specification {
  node service { description "A piece of logic"  icon server  color blue }
  node note    { description "Test element"  color gray }
}
```

`description`, `icon` and `color` are optional. `color` is a Theme Palette name. Icons: `user`, `box`, `server`, `database`, `queue`, `cloud`. Using an undeclared kind is an error.

## `model`: Nodes and Edges

```
model {
  kind id "Title" "Description" {
    kind child "Title"                     // a Group is a Node with children
    attrs { id: uuid   total: decimal "in cents" }
    email: text? uk "unique"               // an Attribute may also sit loose in the body (see `er` Views)
    source { file "src/a.ts"  url "https://..." }
  }

  origin -> target "label"
  origin "1" -> "N" target                 // optional cardinalities
  orders#customer_id -> customers#id       // an Attribute as endpoint (`node#attribute`)
}
```

- Title and description are optional; without a title the id is used.
- Children are referenced by their hierarchy-qualified id: `platform.orders`.
- Spaces around `->` are required (`-` is valid inside an id).
- `source` keeps opaque references (`kind "ref"`, `kind "path"`) to the documented project; the system does not interpret them.
- `extend <node> { ... }`, inside a `model` block, adds children, Attributes or `source` to a Node declared in another file or block.
- Edges are declared only in `model`, never in a View.
- An ordered scenario between Nodes is an Interaction (below).

## Planned elements

`planned` marks what is proposed and not built yet, next to what exists. It belongs to the Model, so every View draws it: the default Theme fades planned elements and gives them a dashed contour (boxes) or dashed lines (Edges, Messages); a Theme can restyle it with `state planned { ... }`.

```
model {
  service checkout "Checkout" "Pays an order" planned {   // after title and description, before the body
    service cart "Cart"                                   // planned too: a planned Group marks its descendants
  }
  table orders "Orders" {
    coupon: text? fk planned "From the PRD"               // among the key marks; drawn as a PLAN chip in er Views
  }
  api -> checkout.cart "adds" planned                     // trailing, after `identifying` if both
  interaction pay "Pay" planned { api -> checkout }      // after title and description
}
```

- An Edge is drawn planned if it carries the mark or if either end (Node or Attribute) is planned; a merged Edge only if all it merges are.
- A Message is drawn planned if its Interaction or one of its Lifelines is planned.
- A real Node (with a Source `path`) under a planned Group is the error `real-node-in-planned-group`; its `fix` removes the Group's mark. The other way out is to move the Node out of the Group.
- A Node named `planned` cannot open the declaration right after a Node, Edge or Attribute (it would read as its mark).

## Interactions

A complete Workspace with an Interaction and the View that draws it:

```dg
specification {
  node actor   { icon user     color purple }
  node service { icon server   color blue }
  node store   { icon database color green }
  node queue   { icon queue    color amber }
}

model {
  actor customer "Customer"
  service api "API"
  store db "Database"
  queue events "Events"

  interaction checkout "Purchase" "Payment flow" {
    order: customer -> api "POST /orders"   // `order:` is an optional alias of the Message
    api -> db "query"
    reply db -> api "rows"
    async api -> events "event"
    api -> api "validate"                    // self Message
    reply api -> customer "201"
  }
}

view purchase { type sequence  interaction checkout }
```

Lifeline lifecycle: `create origin -> target` makes it born (its header drops to the Message height and the arrow ends in it) and `destroy origin -> target` ends it (its line is cut by an X, the `cross` marker).

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

- A Message is `[id:] [async|reply|create|destroy] origin -> target ["label"] ["description"]`; without a kind it is `sync`. Endpoints are Nodes of any level (the Lifelines) and no Edge between them is needed.
- Declaration order is time order. Activation is not written: a `sync` opens one on the receiver and the next `reply` from the receiver to the sender closes it.
- `create` is valid only at the first appearance of the target (`create-not-first`) and no Lifeline may appear after its `destroy` (`after-destroy`) in declaration order, also inside Fragments; both errors carry `related`.
- Fragment: `opt|loop|break|critical ["guard"] { }` (one operand), `alt ["guard"] { } else ["guard"] { }` and `par { } and { }` (one or more). The guard is free optional text. `else` is valid only in `alt` and `and` in `par`; anything else is `invalid-fragment-operand`. A `sync` without `reply` inside a Fragment leaves its activation open until the Fragment ends. `opt`, `loop`, `break`, `critical`, `alt`, `par`, `else` and `and` remain valid Node ids.
- Note: `note left of X "text"`, `note right of X "text"` and `note over X[, Y] "text"`. Drawn as paper (folded corner, text wrapped to a max width); it is not a Lifeline; `over X, Y` widens the gap between X and Y if needed. A target that is not a Node is `unknown-lifeline`.
- `ref <interaction>`: a `ref` frame titled with the referenced Interaction; it covers its participants present in the View, or all Lifelines if none are shared. Cycles are valid (not expanded). A missing Interaction is `unknown-interaction` (with a typo `fix`) and one that no sequence View projects is `ref-without-view`. `note`, `left`, `right`, `of` and `ref` remain valid Node ids.
- An Interaction id has its own namespace (it may equal a Node id); `interaction`, `async`, `reply`, `create`, `destroy` and `order` remain valid Node ids.

Nestable Fragments, Notes and `ref` in an Interaction; the example is complete:

```dg
specification { node piece { icon box  color blue } }

model {
  piece client
  piece api
  piece db
  piece queue

  interaction checkout {
    client -> api "order"
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
  exclude a.private
  depth 1
  expanded render, session      // Groups open at start
  collapsed canonical, theme    // Groups closed at start
  link canonical -> canonical-detail // drill-down to another View (a Group with a link does not expand)
  node render { label "Render"  pin 120,40  color amber }
}
```

| Property | Effect |
| --- | --- |
| `type` | `architecture`, `flow`, `sequence` or `er` |
| `include`, `exclude` | Selectors: `a` (the Node), `a.*` (its direct children), `a.**` (all descendants). `**` alone is the whole Model |
| `depth N` | Initial depth; Groups beyond it appear collapsed |
| `expanded`, `collapsed` | Initial state of the named Groups |
| `link node -> view` | A linked Group does not expand in this View: it navigates to the other. Cycles are valid; the viewer shows breadcrumbs. In sequence it is valid only from a Lifeline (click its header or Enter with focus); from a Message, Note or Fragment it is `link-not-lifeline`. A `ref` frame navigates to the first sequence View that projects the referenced Interaction (inert if none or the current one) |
| `theme name { patch }` | The View's Theme, with an optional patch for it only |
| `interaction id` | Only in `sequence` (required): the Interaction it projects |
| `order a, b` | Only in `sequence`: Lifeline order left to right; partial, the rest follow by first appearance |
| `autonumber` | Only in `sequence`: numbers the projected Messages (`1. label`), after `exclude`/`depth`; counts `reply`, `create`, `destroy` and lifted self Messages |
| `steps each` | Only in `sequence`: one Step per projected Message (see Steps); not combinable with `step` |
| `node id { ... }` | Presentation overrides of a Node in this View: `label`, `pin x,y`, `color` |

A View never defines new entities nor touches the Model.

## Sequence View

```
view purchase {
  type sequence
  interaction checkout
  order customer, api
}
```

Draws one column per Lifeline and the Messages top to bottom, with derived activations (nested ones are offset). Any Theme draws it: `message` and `lifeline` derive from the Edge and `activation` from the Node; `reply` carries the opposite continuity of the base stroke. `include` and `pin` are errors in a sequence View (`view-property-for-type`), as are `interaction`, `order` and `autonumber` outside it. `depth`, `collapsed` and `exclude` are valid: `depth`/`collapsed` merge child Lifelines into their Group's and their Messages are lifted (inside the same Group they become self Messages; a `create`/`destroy` of a child becomes `async`); with the Group open, a `box` with its name wraps its children and the Group's own Lifeline, if any, goes first. `exclude` removes the Lifeline and its Messages, and a Fragment left empty disappears.

## Pin

`pin x,y` fixes a Node's position (relative to its parent Group, or the canvas if root) and turns off auto-layout for that Node. Do not write it by hand: drag the Node in the viewer and the Pin is written to the `.dg` (or use `diagrams edit` with a `move-pin` intent).

## `er` Views: tables and foreign keys

A `type er` View draws each leaf Node as a table (header plus one row per Attribute) and Edges as FKs with crow's-foot markers, no arrows. It accepts what `architecture` does (`include`, `exclude`, `depth`, `expanded`, `collapsed`, `pin`, `node`, `steps`). Works with any Theme; a `pill` or `circle` Node is drawn as `rect`.

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

- Attribute: `name: type[?] [pk] [fk] [uk] ["notes"]`. A `?` glued to the type makes it optional; marks go in any order and repeating one is `duplicate-key-mark` (its `fix` deletes the repeat). Each mark is drawn as a chip on the row.
- Identifying Edge: trailing word `identifying` (solid line; the rest are dashed). A Node named `identifying` cannot open the declaration right after an Edge (it would read as its mark); `pk`, `fk`, `uk` and `er` are valid ids anywhere.
- Cardinality: in an ER View only `0..1`, `1`, `0..*` and `1..*` are valid (`er-cardinality`, with a `fix` when there is a single close candidate). Each is drawn as its marker (`zero-one`, `one`, `zero-many`, `many`); a collapsed Group with several aggregated FKs has no markers.
- Outside an ER View the marks and `identifying` are ignored without warning.

## `flow` Views and Steps

A View may reveal its content by **Steps**. Each Step is cumulative: `show` reveals, `hide` hides. Only visibility changes, never position, so the diagram does not move between Steps.

```
view edit-flow {
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

In a `sequence` View a Step is a **time cut**: `step "title" { upto <id> }` shows the Interaction up to the Message with that id (inclusive) and only advances; `steps each` gives one Step per projected Message, titled with its label or `from -> to`. `show` and `hide` are errors there (`view-property-for-type`, with a `hint` to `upto`), as are `upto` and `steps each` outside sequence. Notes and `ref` appear with the previous Message; all Lifelines show from the first Step except those born with `create`; the activation is trimmed at the cut; a Fragment frame appears when the cut enters it and each operand's guard when the cut enters the operand. Nothing changes position. Errors: `unknown-step` (with a typo `fix`), `step-not-projected` (`depth`/`exclude` removed the Message), `step-not-advancing` (with `related` to the previous Step) and `steps-each-with-step`.

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

## Errors and warnings

`diagrams validate` prints `file:line:column severity code message`, with a `hint` or a correction (`fix`) when there is a single candidate. With `--json` the result is an object with `contractVersion`, for agents and tools. Codes are stable kebab-case English (`duplicate-part`, `theme-low-contrast`, `unknown-lifeline`, `reply-without-sync`...); severity (`error` blocks, `warning` warns) lives in each Issue's `severity`, not in the code. `diagrams skill --workspace <path>` prints the full list of codes.
