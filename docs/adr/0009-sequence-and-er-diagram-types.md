# Sequence and ER Diagram types on the single Model and the existing Themes

Sequence and ER come in as two new Diagram types without a second Model, without separate Themes and without migration: every change is additive. ER fits in today's Model (Nodes with Attributes, Edges between endpoints) with three new marks; sequence needs a new entity, the Interaction, because neither Edges nor the View can hold an ordered scenario. Any existing Theme draws the four Diagram types: the new Theme elements are derived from the ones it already declares. The layout is chosen per Diagram type behind the same entry and a common Geometry. Reference notation: the UML 2 subset common to Mermaid, PlantUML and D2 for sequence; only crow's foot for ER (Chen discarded). Sources: the closed tickets of the map "New Diagram types: sequence and ER" (#94) and the research `research/tipos-diagrama-notacion`.

Outside this ADR (pending in the map): concrete `validate` codes, export, guides, skills and example Themes. Other Diagram types (state, class, C4, Gantt, mindmap) are out of scope.

## Model

### ER: marks on Attribute and Edge

- **Attribute**: optional `keys`, closed set `pk | fk | uk`, combinable; boolean `optional` (default `false`).
- **Edge**: optional boolean `identifying` (default `false`).
- **Cardinality**: the Model keeps the free `string` per endpoint. Only in an ER View are the four canonical values `0..1 | 1 | 0..* | 1..*` required.
- **FK**: an Edge between Attributes (`orders#customer_id -> customers#id`); between Nodes it is also valid. ER draws no arrows: the direction only fixes how the label reads.
- No reserved Node kinds: a leaf Node in an ER View is a table, with or without Attributes.
- `keys`, `optional` and `identifying` are always written (they are Model); only ER Views draw them, the others ignore them without warning.

### Sequence: the Interaction

- **Interaction**: Model entity with an id in its own namespace (it may match a Node's), optional title and description. It is declared whole in one block, without `extend`. It is an ordered list of items (Message, Note, Fragment, `ref`); declaration order is temporal order.
- **Lifeline**: a Node of any level (a Group too), not a separate entity. Left-to-right order by first appearance, overridable in the View. The parent Group covers UML's `box`.
- **Message**: `from`, `to` (Nodes only, never Attributes), `kind` in `sync | async | reply | create | destroy` (default `sync`), optional label and description. Self message: `from == to`. Its identity is its position (index path in the Canonical form); an optional id, unique in its Interaction, is only an alias to cite it. Lost/found, deferred.
- **Activation**: not stored, derived. A `sync` opens an activation on the receiver and the next `reply` from the receiver to the sender closes it (a stack for nested ones); a `sync` without `reply` lasts until the end of its Fragment or of the Interaction. `reply` is always explicit.
- **Fragment**: operator `alt opt loop par break critical`; `opt loop break critical` have one operand, `alt par` one or more; each operand with an optional free-text guard and its list of items. Nestable. It is not a Node or a Group: the Lifelines it covers are derived from its content.
- **Note**: item anchored `left of X`, `right of X` or `over X[, Y]`.
- **`ref <interaction>`**: item that references another Interaction; cycles are valid (it is not expanded); a nonexistent target is an error.
- **Message and Edge are independent**: a Message neither requires nor creates an Edge and architecture Views derive nothing from Interactions.

Discarded: ordered Edges (they do not cover repetitions, returns or labels specific to the scenario) and Messages declared in the View (it would break "the View does not define entities").

## Views

- **Type**: `type sequence` and `type er`, next to `architecture` and `flow`.
- **ER View**: accepts the same as `architecture` (`include`, `exclude`, `depth`, `expanded`, `collapsed`, `pin`, `node` overrides, `steps` over tables and FKs). Each leaf Node is drawn as a table (header plus rows of the `attrs` Slot, always visible); Groups collapse or flatten according to depth, as in architecture. `link` stays as today.
- **Sequence View**: projects exactly one Interaction (`interaction <id>`, required); it has no `include`. `order a, b, c` overrides the order of the Lifelines and can be partial (the rest follows first appearance). Valid: `depth`, `collapsed`, `exclude`, `theme`, `node id { label color }`, `steps` and `autonumber`; `include`, `pin` and `expanded` are errors; `link` is only valid with a Lifeline as origin (error on Messages, Notes and Fragments). `depth`/`collapsed` merge child Lifelines into their Group's and lift their Messages the way Edges are lifted today (inside the same Group they become self messages); `exclude X` removes the Lifeline and its Messages; an empty Fragment disappears.

### Steps and autonumbering in sequence

- **Step = a cut in time**: each Step shows the Interaction up to a Message (inclusive) and only moves forward. It does not cite Lifelines; `show`/`hide` are errors.
- **`steps each`**: one Step per projected Message, titled with its label or `from -> to`. Not combined with explicit `step`s.
- **Explicit Step**: `step "title" { upto <id> }`, with the Message's optional id. Only Messages can be cited. Discarded: citing by number (fragile against insertions and projection) and Step marks in the Interaction (presentation inside the Model).
- **Reveal**: Notes and `ref`s appear with the Message before them (those before the first Message, in the first Step). All Lifelines are visible from the first Step except those born with `create`, which appear with it. The activation is clipped at the cut (it does not announce the `reply`). A Fragment's frame and operator appear whole, at their final size, when the cut enters it; each operand's guard, when the cut enters that operand. Nothing changes position. What the last Step does not reach stays hidden, without warning.
- **`autonumber`**: View property. Numbers the projected Messages (after `exclude`/`depth`) in declaration order, walking operands in order; counts `reply`, `create`, `destroy` and lifted self messages; does not number Notes or `ref`s. No start or increment. It does not depend on Steps and may differ between Views of the same Interaction. The number is part of the Message label.

## Navigation and drill-down

- **`ref`**: clicking the frame navigates, as a View link with breadcrumbs, to the first declared sequence View that projects the referenced Interaction. With none, the frame is inert and `validate` warns (informative). If that View is the current one (cycle), inert and without warning. No syntax to choose the target; it can be added later.
- **`link`**: the target can be a View of any Diagram type, from any type. In sequence, only from a Lifeline (click on its header); a linked Group navigates and does not expand.
- **Expand/collapse in sequence**: the same gesture as in architecture. The children of the merged Lifeline appear in its place (by first appearance or `order`), the rest shifts and the Group's `box` wraps them; if the Group has Messages of its own, it keeps its Lifeline as the first inside the `box`. Relayout with the sequence algorithm, camera compensation (the Group's left edge stays fixed) and morph, as in ADR 0003. The current Step is kept (`upto`s and `autonumber` do not change when lifting).
- **Collapsed group in ER**: a single Node with a counter, not a table. A single lifted FK keeps its markers; several aggregated go without markers, as in architecture (the resolved Edge carries `count`, but `render` does not draw it in any type); the identifying line only if all of them are.
- Navigating to another View enters its first Step. A `sequence` or `er` View with `steps` opens at Step 1 (Step 0 would leave it empty); `architecture` and `flow` still open at 0 (ADR 0002).
- **Nested ref**: the frame of a `ref` counts for the bounds of the Fragment containing it, which always wraps it.

## Selection, gestures and editing

- **Selectable in sequence**: Lifeline (header and line, with its Node's id), Message, Fragment and Note; `TipoDeElemento` adds `mensaje | fragmento | nota`. The activation is not selected: the click falls on its Lifeline. A `ref` is selected as a Fragment and also navigates. What the current Step has not revealed is not selected.
- **Hit testing**: Message (arrow or label), Note, Lifeline or activation, Fragment (only tab and border; the interior lets the click through), background.
- **Selection id of a Message**: always its index path, with the Interaction (`checkout:2.0.1`), also in the hash state; the alias is not used. After an external edit the selection may shift to another Message: accepted.
- **Dragging in sequence**: dragging a Lifeline's header horizontally emits the `reorder-lifelines` Intent (ADR 0007), which rewrites the View's whole `order`; the dragged Lifeline is in `fantasma`. The visible order is written and the `order` entries that are hidden today (children of a Collapsed group, excluded) keep their relative position; it is written even if it matches first appearance. A child inside its Group's `box` only moves inside the `box`; dragging the `box` header moves the block, written as consecutive children in `order`. Messages, Notes and Fragments are not dragged: reordering the Interaction is editing the Model and is done in the text.
- **ER**: as architecture. Table = Node, row = `atributo`, FK = Edge; dragging a table emits `move-pin`; rows are not dragged.
- **Shortest path**: in ER as in architecture (over the FKs). In sequence there is no path or derived highlight: two selected Lifelines are just a multiple selection.
- **Keyboard in sequence**: Tab walks the Lifelines in column order; left/right jump to the neighbouring Lifeline; down/up walk the visible Messages in temporal order (focus moves to the Message); Enter on a Group Lifeline collapses or opens, on one with `link` navigates. In ER, as in architecture.
- **States the shell emits**: `lifeline` and its header `hover seleccionado foco fantasma`; `activation` mirrors those of its Lifeline; `message` `hover seleccionado foco`; `fragment` and `note` `hover seleccionado`; `row` `hover seleccionado`. In sequence nobody emits `en-ruta` or `atenuado`; the Theme may declare them anyway.
- **Out of scope**: in-place editing (renaming, creating Messages, changing `kind`), reordering Messages and Attributes. The only new Intent is `reorder-lifelines`.

## DSL syntax

The new words enter the `Id` rule and remain valid as Node ids.

```
model {
  orders "Pedidos" {
    id: uuid pk
    customer_id: uuid pk fk
    email: text? uk "unico"
  }
  orders "1..*" -> "1" customers "pertenece" identifying

  interaction checkout "Compra" "Flujo de pago" {
    pedido: cliente -> api "POST /orders"
    async api -> cola "evento"
    alt "con saldo" { api -> pagos "cobrar" } else "sin saldo" { reply api -> cliente "402" }
    par { api -> a } and { api -> b }
    opt "reintento" { loop "3 veces" { api -> api "reintentar" } }
    note over cliente, api "sesion abierta"
    ref login
    reply api -> cliente "201"
  }
}

view compra {
  type sequence
  interaction checkout
  order cliente, api
  autonumber
  step "Pedido" { upto pedido }
}
```

- **Attribute**: `name: type[?] [pk] [fk] [uk] ["notes"]`; `?` attached to the type is `optional`; marks in any order, repeating one is an error.
- **Identifying Edge**: trailing word `identifying`.
- **Interaction**: `interaction <id> ["Title"] ["Description"] { items }` inside `model`; inside there are only items, no Edges.
- **Message**: `[id:] [async|reply|create|destroy] from -> to ["label"] ["description"]`.
- **Fragment**: `opt|loop|break|critical ["guard"] { ... }`; `alt ["guard"] { ... } else ["guard"] { ... }`; `par { ... } and { ... }`.
- **Note and ref**: `note left of X "t"`, `note right of X "t"`, `note over X[, Y] "t"`; `ref <interaction>`.

## Validation

Severities and codes fixed here (codes in "Issue codes").

- **Errors**: View property not valid for its type; sequence View without `interaction` or with a nonexistent one; `ref` to a nonexistent Interaction; duplicate Interaction id; Lifeline or Message endpoint that is not a Node; `create` that is not the target's first appearance; appearance after `destroy`; repeated key mark; invalid operands in a Fragment (crossed `else`/`and` or a second operand in `opt|loop|break|critical`); duplicate Message id in its Interaction; `upto` to a nonexistent id, to a non-projected Message or one that does not strictly advance; `steps each` together with `step`; `show`/`hide` in sequence.
- **Error in an ER View**: cardinality outside `0..1 | 1 | 0..* | 1..*` on an included Edge.
- **Warning**: `reply` without an open `sync`. `solo-color` (ADR 0008) is extended to Message kinds and the identifying Edge.

### Issue codes

The parser accepts the general form (Fragment operands, View properties, `show`/`hide`, `link`) and `canonical` emits the specific code; none of this comes out as `syntax-error`. `fix` only with a single candidate (ADR 0005); otherwise, `hint`.

| Rule | Code | Severity | Help |
| --- | --- | --- | --- |
| View property not valid for its type (`include`/`pin`/`expanded` in sequence, `interaction`/`order`/`autonumber` outside sequence, `show`/`hide` in sequence) | `view-property-for-type` | error | `hint` with the alternative (`show`/`hide` to `step { upto }`) |
| Sequence View without `interaction` | `sequence-without-interaction` | error | `hint` with the existing Interactions |
| View `interaction` or `ref` to a nonexistent Interaction | `unknown-interaction` | error | `fix` for typo |
| Duplicate Interaction id | `duplicate-interaction` | error | `related` to the original |
| Lifeline, Message endpoint or `order` entry that is not a Node | `unknown-lifeline` | error | `fix` for typo |
| `create` that is not the target's first appearance | `create-not-first` | error | `related` to the first appearance |
| Appearance after `destroy` | `after-destroy` | error | `related` to the `destroy` |
| Repeated key mark | `duplicate-key-mark` | error | `fix`: delete the repeated one |
| Invalid operands in a Fragment | `invalid-fragment-operand` | error | `hint` (`else` belongs to `alt`, `and` to `par`) |
| Duplicate Message id in its Interaction | `duplicate-message-id` | error | `related` |
| `upto` to a nonexistent id | `unknown-step` (reused) | error | `fix` for typo |
| `upto` to a non-projected Message (`depth`/`exclude`) | `step-not-projected` | error | `hint` |
| `upto` that does not strictly advance | `step-not-advancing` | error | `related` to the previous Step |
| `steps each` together with `step` | `steps-each-with-step` | error | - |
| `link` in sequence with an origin that is not a Lifeline | `link-not-lifeline` | error | - |
| Cardinality outside `0..1 \| 1 \| 0..* \| 1..*` on an Edge of an ER View | `er-cardinality` | error | `fix` with a single close candidate, otherwise `hint` with the four |
| `reply` without an open `sync` | `reply-without-sync` | warning | - |
| `ref` to an Interaction no sequence View projects | `ref-without-view` | warning | `hint`: add a View |
| `order` Node that does not take part in the projected Interaction (ignored in layout) | `order-not-in-interaction` | warning | - |
| `solo-color` on Message kinds or identifying Edge | `theme-color-only` (reused, extended description) | warning | - |

No `info` severity: the `ref` without a View is a warning and `--strict` makes it fail on purpose. No consistency warnings between Messages and Edges: a Message between two Nodes without an Edge is valid (Messages are independent of Edges), and an Interaction without a View is not warned about either.

## Theme

Everything reuses Layers, Primitives, Slots and Palette (ADR 0008); there is no new Family.

- **New Theme elements**: blocks at the level of `node` and `edge`: `lifeline`, `activation`, `message`, `fragment`, `note` and `row`. The Lifeline header and the ER table are drawn with `node`. They accept `extends`, `part`, `use` and the same states as Node and Edge (a state only paints); `inspect theme` shows their stacks.
- **Cascade by Diagram type**: `diagram <type> { ... }` inside `node`, `edge` and `group`, for the four types. Order: base Theme, Diagram type, Node kind, state, View. Unlike a state, it can change the Metrics.
- **`message`**: the `edge` model (stroke stack, `start`/`end`, `label`) with `kind <type>` patches. Defaults: `sync` solid with `arrow`; `async` solid with `chevron`; `reply` dashed with `chevron`; `create` dashed with `chevron`, ending at the header; `destroy` solid with `arrow`.
- **`lifeline`**: stroke stack plus `end`, the marker at the end of a destroyed Lifeline (default `cross`). The header is not repeated at the foot.
- **`activation`**: Node Layers with its own `width` (10 in `neutral`) and the `COLOR` of its Lifeline's Node.
- **`fragment`**: Node Layers for the frame; `operator` (tab, `label` style), `guard` (`text` style), `divider` (stroke between operands) and `op <operator>` patches. `ref` is an `op ref` fragment with the title of the referenced Interaction.
- **`note`**: Node Layers plus the `text` style.
- **`row`**: per-row Layers (alternating backgrounds, `stripe side bottom` separator), `name`, `type` and `key` texts (`chip` style) and `key pk|fk|uk` and `optional` patches, which fall into ADR 0008's content-presence category.
- **`zone all|header|body`**: new common property of Node Layers, paint only (default `all`). `header` is the zone of the Slots before `attrs`; without `attrs` it equals `all`.
- **New markers** in the marker Family: `one`, `zero-one`, `many`, `zero-many` (compound, because an endpoint accepts a single marker) and `cross`. In an ER View the core translates the cardinality to its marker (`1` to `one`, `0..1` to `zero-one`, `1..*` to `many`, `0..*` to `zero-many`); the Theme only changes `color`/`size` with `edge { diagram er { ... } }`, not the translation. Identifying Edge solid, non-identifying dashed, patchable.

### Derivation when the Theme does not declare an Element

The core derives a sober version, so existing Themes draw sequence and ER without being touched (verified with 17 Themes in the prototype on the `prototype/tipos-diagrama` branch):

- `message` and `lifeline` come from `edge` (the Lifeline with a dashed stroke).
- `activation` and `fragment` come only from the shape, fill and border Layers of `node`, with no decorations, shadows, effects or rotation.
- `note` is derived as "paper": folded corner (`fold`), fill with a soft tint of the Palette's note color (`amber`, otherwise the border), thin stroke and normal text (no `title`, icon or badge) wrapped to a maximum width. It does not inherit the full Node stack because it was confused with a participant.
- **Guaranteed `reply`/`sync` distinction**: if the base Edge stroke is solid, `reply` and `create` are dashed; if it is not, they are solid.
- **Text on the page** (Fragment guards) takes the color of the Edge stroke, not the `foreground`. Guards go above activations.
- **ER table**: a `pill` or `circle` Node shape is drawn as a `rect` with a bounded radius; the Theme can change it with `node { diagram er { ... } }`.

Built-in Themes: `neutral` explicitly declares all the Elements and `diagram` patches (reference model); `neutral-dark` inherits them and only changes the Palette; `alto-contraste` declares them with thicker strokes. All three without warnings. The example Themes rely on the derivation.

### New Metrics

Lifeline header (Node entry with its `diagram sequence` patch), `activation.width`, Fragment tab and guard, Note box, Message label (with the Edge label rule), `row` height, and the sequence spacings: gap between Lifelines, gap between Messages, Fragment padding, self loop width and `create` offset. All have core defaults and are tuned with `diagram sequence` or in the new blocks. Fragment tabs and guards, Message labels and Note text enter `textosAMedir` (with the estimate the tab came out clipped).

## Layout and Geometry

- **A single entry**: `layoutView` / `layoutConMetricas` choose the algorithm by `vista.type`; `sesion`, `cli`, `shell` and the Worker do not change. Sequence runs through the same adapter (Worker in the shell, Node in the CLI).
- **Geometry**: union discriminated by `kind`, `grafo` (architecture, flow, ER) or `secuencia`. Both share `nodes` (in sequence, the Lifeline headers), `width` and `height`, so `indiceDeGeometria`, camera and morph keep working. `secuencia` adds Lifelines (x, start y, end y, destroyed), activations, Messages (by index path, with points and label box), Fragments (frame, tab, guards, dividers) and Notes. `render` switches on `kind` and does not measure.
- **ER**: the architecture ELK path (`layered`, `RIGHT`, orthogonal) with the post-ELK adjustment of the port to the Attribute's row, plus a new guarantee: the last segment of every Edge into a table is horizontal and is at least as long as the crow's foot marker (without it the foot rides on the bend). ELK ports per row (`FIXED_POS` E/W) discarded; reopened only for unacceptable crossings or overlaps.
- **Sequence**: own algorithm without ELK, deterministic and synchronous (`async` signature for uniformity).
  - Columns: one per Lifeline in `order` order and then first appearance; distance between neighbours = max(Theme gap, widest label of a Message between them, self loop, Note).
  - Rows: top to bottom; each Message takes label height plus gap; the self message, the height of its loop; a Fragment adds tab, guard and padding at the top, padding at the bottom and a divider per operand. `par` stacks its operands vertically with a divider, like `alt`.
  - Headers at the same `y` with the height of the tallest; `create` lowers the target's to the height of its Message. Lines reach the bottom (last item plus padding) except destroyed ones, cut at their marker.
  - Activations derived from the `sync`/`reply` stack; each nested level shifts by `activation.width/2`; arrows end at the edge of the activation.
  - Fragment frame: the Lifelines its content covers plus padding; for `ref`, the participants of the referenced Interaction present in the View, or all of them if there are none in common.
  - Message label centered above the arrow; for the self message, to the right of the loop.
- **Key and cache**: `claveDeLayout` and `claveDeEstructura` include `vista.type`; in sequence, also the items of the projected Interaction (endpoints, kind and labels after `depth`/`exclude`), `order` and `autonumber` (it changes the labels); no Pins. The new Metrics enter through the existing path. `cachedGeometrySchema` validates the union; an older JSON without `kind` is read as `grafo`.
- **Performance**: new scenario `secuencia-grande` in `pnpm bench`: 1000 Messages, 50 Lifelines, Fragments nested 3 levels, budget 500 ms.

## Consequences

- ADRs 0001 (DSL), 0003 (layout) and 0008 (Themes) remain in force; this ADR extends them per Diagram type without changing what already applies to architecture and flow.
- `pixel-art` looks bad in sequence and ER even with the derivation; it stays in the example Themes backlog.
- Selection, gestures and editing are fixed in "Selection, gestures and editing"; navigation, in "Navigation and drill-down".
