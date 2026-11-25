[Leer en espanol](../guia/themes.md)

# Customizing with Themes

The aesthetic of a diagram lives in the **Theme**, never in the Model: the same Model and the same View can be seen as sober cards, neon or a circuit board by changing one line (`theme <name>`). This guide explains how a Theme is built and how to write one. If you have not yet, start with the [tutorial](tutorial.md). The exact list of Primitives, properties and ranges is in the [catalog](../theme-catalog.md); the contract, in [ADR 0008](../adr/0008-sistema-de-temas-expresivo.md).

## Choosing a Theme

- The built-in ones: `neutral` (default), `neutral-dark` and `high-contrast`.
- The example ones, one `.dg` per Theme in [`examples/rinthel-arch/themes/`](../../examples/rinthel-arch/themes/): the list, with an image each, is in the [gallery](../gallery.md). Copy the `.dg` of one into your Workspace (and its fonts, see below) and use it in a View.
- Your own: a `theme` block in any `.dg` of the Workspace.

A View uses one Theme. It can be adjusted just for that View with a patch in braces:

```
view highlighted {
  type architecture
  theme shop { layer borde { color amber  width 3 } }
  include **
}
```

## Anatomy of a Theme

```
theme my-theme extends neutral-dark {   // `extends` is optional; a single parent
  palette { ... }   // color names
  fonts   { ... }   // font families
  tokens  { ... }   // default background, text and border
  page    { ... }   // Layers of the page background
  node    { ... }   // Layers, Slots, patches per kind and per state
  group   { ... }   // the same for Groups, plus header and padding
  edge    { ... }   // strokes, markers and label of the Edges
}
```

Everything is optional; with `extends` you only write what changes.

### Palette, fonts and tokens

```
palette { fondo "#13001f"  texto "#fdf4ff"  rosa "#ff2bd6"  blue "#22e4ff" }
fonts   { body "Outfit"  mono "JetBrains Mono"  fallback "sans-serif" }
tokens  { background "#13001f"  foreground "#fdf4ff"  border "#ff2bd6" }
```

- Hex only exists in `palette`. Everywhere else, a color is a **Palette name**, with modifiers: `rosa/0.4` (opacity) or the special `COLOR` (the color of the Node's kind, the one you declared in `specification`) and `ORIGEN` (in Edges, the color of the source Node).
- The names `blue`, `green`, `amber`, `red`, `purple` and `gray` are the colors the Node kinds use; define the ones you use.
- Fonts are **self-hosted**: put the files in the Workspace, for example in a `fonts/` folder (`woff2`, `woff`, `ttf` or `otf`, one per family and weight; the naming convention is in the [example gallery](../../examples/themes/gallery/README.md#fonts)) and name the family in `fonts`. There is no CDN. `fallback` is the generic fallback family. The examples ship their fonts and licenses in `examples/rinthel-arch/themes/fonts/`.

### Layers and Primitives

Each element is drawn with a **stack of Layers**, from bottom to top. A Layer is an instance of a **Primitive** of the catalog (the DSL does not accept loose CSS):

```
node {
  layer glow   glow     { color rosa/0.55  radius 18 }
  layer forma  rect     { radius 12 }
  layer relleno gradient { from rosa  to cian  angle 100 }
  layer borde  border   { color cian  width 2 }
}
```

Primitives are grouped into families:

| Family | Examples |
| --- | --- |
| shape | `rect`, `pill`, `cut` (cut corner), `circle` |
| fill | `solid`, `gradient`, `radial`, `disc`, `grid`, `lines`, `dots`, `noise` |
| border | `border`, `dashed`, `dotted`, `outline` |
| shadow and glow | `shadow`, `glow` |
| glass and filter | `glass`, `sketch` (hand-drawn) |
| decoration | `tilt`, `tape`, `stripe`, `pins`, `fold`, `ring` |
| stroke (Edges) | `line` with `corner` (`sharp`, `chamfer`, `round`) and `style` |
| marker (Edges) | `arrow`, `dot`, `diamond`, `square`, `bar`, `via`, `hollow`, `chevron`, `cross` (an X centered on the end), and the ER crow's feet `one`, `zero-one`, `many`, `zero-many` |
| text and content | `text`, `chip`, `icon`, `label` |
| code | `code`: your own React component, for what the catalog does not cover |

Numbers have ranges; one out of range is a `validate` error, never clamped. The Layers and the properties of each Primitive are in the [catalog](../theme-catalog.md). A patch can also order a Layer (`before` / `after` another), put it over the content (`over`), shift it (`offset x y`), enlarge it (`grow`) or remove it (`layer shadow none`).

### Slots: what content is shown and where

A Node has content Slots with fixed names: `icon`, `title`, `badge` (the name of the kind), `desc`, `footer`, `attrs` and `counter` (the number of children of a collapsed Group). The Theme decides which are painted, in what order and with what style, with a mini-layout of rows and columns:

```
slots column min-width 160 slack 28 {
  row gap 10 pad 14 min-height 50 {
    icon { variant dot  side 18 }
    column {
      title { weight 700  text-align start }
      badge { alpha 0.6  transform uppercase  size 0.66  tracking 0.18 }
    }
    counter { fill rosa  border cian }
  }
  attrs
}
```

A Slot you do not list is not drawn. Slots and the box are the only things that change the size of the Node (its **Metrics**); everything else only paints.

### Patches per kind and per state

Variation inside a Theme is written as patches over the Layers, by name:

```
node {
  type external { layer borde dashed { color cian } }           // only Nodes of that kind
  state hover { layer glow { color cian/0.8  radius 28 }  transition 140ms ease-out }
}
```

The cascade, where the last one wins, is: base Theme, Diagram type, Node kind, state, View patch.

`diagram <type> { ... }` (inside `node`, `group` and `edge`) singles out a Diagram type (`architecture`, `flow`, `sequence`, `er`): `node { diagram flow { slots row pad 20 { title attrs } } }` only changes flow Views. It accepts `layer`, `use` and `slots`; `padding` in `group`; markers (`start`/`end`) and `label` in `edge`. Unlike a state, it can change the Metrics. An unknown type is `theme-unknown-diagram-type`. `inspect theme <name> --diagram flow` shows the resulting stack. The states are `planned`, `hover`, `selected`, `ghost`, `on-path`, `dimmed` and `focus`. `planned` is set by the Model (elements with the `planned` mark): without its own patch, the Theme inherits the default look (faded, with a contour or dashed lines); with `state planned { ... }` in `node` or `group`, that patch replaces it on boxes. A state can only change paint: never the size nor the Slots (`validate` rejects it), so hovering does not move the diagram. A Group also has `state collapsed`, the look of the closed Group.

### Parts: reusable patches

```
part bar { layer acento shadow after borde { color COLOR  x 4  y 0  inset 1 } }

theme my-theme { node { type service { use bar }  type package { use bar } } }
```

A `part` belongs to no Theme and its name is unique in the Workspace. The ones from the tutorial are in [`examples/tutorial/step-4/theme.dg`](../../examples/tutorial/step-4/theme.dg).

### Edges and background

```
edge {
  layer halo  line { color rosa/0.18  width 8  corner round  radius 14 }   // wide translucent stroke: gives the glow
  layer linea line { color cian  width 1.8  corner round  radius 14 }
  start hollow { size 7 }
  end arrow { size 10  color cian }
  label { scale 0.82  pad 10  radius 50  fill fondo  border rosa/0.7 }
}
page {
  layer rejilla grid { color rosa/0.10  size 44 }
  fixed          // the background does not move with pan/zoom
}
```

The routing of Edges is done by the layout and does not depend on the Theme.

### ER tables: `row`, `zone` and markers

An `er` View draws each Node as a table (header and one row per Attribute). The Theme styles it with the `row` block, the `zone` property of Node Layers and the Edge markers (complete example in [`examples/themes/er.dg`](../../examples/themes/er.dg)):

```dg
specification { node table { icon database  color green } }

model {
  table customers "Customers" { id: uuid pk  email: text? uk }
  table orders "Orders" { id: uuid pk  customer_id: uuid fk  note: text? }
  orders#customer_id "0..*" -> "1" customers#id "belongs to" identifying
}

theme notebook {
  palette { papel "#fffdf5"  tinta "#1f2937"  azul "#2457d6"  gris "#ece8dc"  verde "#d9f2dc"  ambar "#fdecc8" }
  node {
    layer forma rect { radius 6 }
    layer relleno solid { color papel }
    layer cabecera solid { color azul  zone header }   // only the header (all, header or body)
    layer borde border { color tinta }
    slots column { title { color papel  weight 700 }  attrs }
  }
  row {
    height 26                                           // height of each row: changes the size of the tables
    layer fondo solid { color papel }
    layer separador stripe { color gris  side bottom  width 1 }
    alternate { layer fondo { color gris } }            // odd rows
    key pk { layer fondo { color verde } }              // rows with that mark (pk, fk, uk); they stack in that order
    optional { layer fondo { color ambar } }            // optional Attributes (after the keys)
    state selected { layer fondo { color verde } }      // selected row (also hover); only paints
    name { weight 600  size 1.1 }  type { color azul }  // text style; size (a multiple of the Theme text) changes the measured size
    key { fill azul  color papel  radius 4 }            // the chip of each key mark
  }
  edge {
    layer linea line { color tinta }
    diagram er { end arrow { size 12  color azul } }    // only color and size of the crow's foot
  }
}

view tables { type er  theme notebook  include ** }
```

- `zone header` paints from the top down to where the rows (`attrs`) start; without `attrs` it equals `all`. `zone body` covers the rows. A Layer with `zone` paints apart from the box, so a state patch does not change it.
- `row` only applies in `er` Views; in the others Attributes keep the style of the `attrs` Slot. The height (`height`, 12 to 120) is a Metric; Layers and patches only paint (one that changes the box is `theme-state-touches-metrics`).
- The marker of each end is set by the core according to the cardinality (`1` to `one`, `0..1` to `zero-one`, `1..*` to `many`, `0..*` to `zero-many`); the Theme only changes its `color` and `size`.
- Identifying Edges (`identifying`) are solid and the others dashed; `edge { identifying { layer linea { color azul } } }` also changes the stroke of the identifying ones. If both end up equal except for color, `validate` warns with `theme-color-only`.

### Sequence: `lifeline`, `activation`, `message`, `fragment` and `note`

A `sequence` View draws itself with any Theme (the elements are derived from `edge` and `node`); to style it, blocks are declared at the level of `node` and `edge` (complete example in [`examples/themes/sequence.dg`](../../examples/themes/sequence.dg)). All of them accept `layer`, `use`, `state` and, where it applies, patches per variant, and the sequence spacings are their Metrics:

```dg
specification { node piece { icon box  color blue } }

model {
  piece client
  piece api
  piece db
  interaction place-order {
    client -> api "request"
    api -> db "save"
    reply db -> api "ok"
    alt "in stock" { api -> db "reserve" }
    note right of db "idempotent"
    reply api -> client "201"
  }
}

theme ink {
  palette { papel "#fefce8"  tinta "#1f2937"  azul "#2563eb"  verde "#16a34a"  rojo "#dc2626"  ambar "#d97706" }
  node {
    layer forma rect { radius 6 }
    layer relleno solid { color papel }
    layer borde border { color tinta }
    slots { title }
  }
  edge { layer linea line { color tinta  width 1.2 } }
  lifeline {
    layer linea line { color tinta/0.5  width 1  style dashed }
    end cross { size 12  color rojo }
    gap 200                                          // minimum distance between Lifelines
  }
  activation {
    layer relleno solid { color azul/0.2 }
    layer borde border { color azul }
    width 12
  }
  message {
    layer linea line { color tinta  width 1.5 }
    end arrow { size 10 }
    gap 40  loop-width 48  create-offset 0           // between Messages, width of the self loop, offset of the created header
    kind async { layer linea { color verde }  end chevron { size 10  color verde } }   // patch per kind: sync, async, reply, create, destroy
  }
  fragment {
    layer forma rect { radius 8 }
    layer relleno solid { color papel/0.6 }
    layer borde border { color tinta/0.6 }
    operator { color tinta  weight 700 }  guard { color tinta }  divider { color tinta/0.5  style dashed }
    op alt { layer borde { color azul } }            // patch per operator: opt loop break critical alt par ref
    padding 20  padding-y 10                         // around the content
  }
  note {
    layer relleno solid { color ambar/0.25 }
    layer borde border { color ambar }
    text { color tinta  weight 600 }
  }
}

view place-order { type sequence  theme ink  interaction place-order }
```

- What changes with each kind: `message { kind async { ... } }` only touches `async` Messages. Without a patch, `reply` and `create` go with the opposite continuity to the base stroke and the marker depends on the kind.
- `lifeline` and `message` use Edge strokes; `activation`, `fragment` and `note` use Node Layers. `COLOR` is that of the Lifeline. `gap`, `loop-width`, `create-offset`, `width` and `padding` are Metrics (they change the Geometry); the rest only paints. The ranges and defaults are in the [catalog](../theme-catalog.md#sequence-elements); one out of range is a `validate` error.
- If two Message kinds (the ones the View uses) end up equal except for color, `validate` warns with `theme-color-only`.
- The built-in Themes declare all these elements and the `row`: `neutral` is the reference model, `neutral-dark` inherits it and only changes the Palette, `high-contrast` uses thicker strokes. `inspect theme <name>` shows the stack, the patches and the Metrics of each one; with `--diagram sequence` (or `er`) it also shows those the Theme does not declare, as they are derived to be drawn, marked `(derived)` (`derived: true` in `--json`).

## Motion and enter

- **Motions** (closed catalog): `stream`, `pulse`, `breathe`, `spin` and `aura`, hung from a Layer: `layer glow { motion aura 2s ease-in-out intensity 0.6 }`. They can be tied to a state.
- **Keyframes** for animatable properties (`opacity`, `scale`, `rotate`, `shift-x`, `shift-y`, `blur`): `keyframes opacity 2s { 0 1  50 0.4  100 1 }`.
- **Transitions and entrances**: `transition 140ms ease-out` between states; `enter fade 300ms`, `exit zoom 200ms` (`fade`, `zoom`, `slide`) and `stagger 60ms` to stagger.

Ranges and easings are in the [catalog](../theme-catalog.md#motions).

## Contrast and accessibility

`validate` measures the contrast of each kind and state (text 4.5:1 and graphic parts 3:1) and warns with `theme-low-contrast`. If two kinds are only told apart by color, it warns with `theme-color-only` and the viewer shows a legend. Some example Themes (`glass-chip`, `soft-card`, `pixel-art`...) emit them on purpose, because their aesthetic calls for it: the first line of their file says so. The built-in `high-contrast` Theme replaces the View's, only in the viewer, for whoever needs it: with the "High contrast" button on the canvas or, if it is not touched, when the system asks for `prefers-contrast: more`.

## Inspecting and debugging a Theme

- `dg inspect theme <name> --workspace <path>` prints the resolved Theme (its parent, its Parts, the Layers and their `file:line`). With `extends`, it is the way to see what you inherit.
- `dg validate` lists errors with suggestions: a misspelled Primitive proposes the closest one.
- To study a specific effect, look for the example Theme that uses it: `synthwave` (neon and grid), `glass-chip` (glass), `sticky-notes` (hand-drawn and tape), `keycaps` (3D keys), `pcb` (pins and strokes with `corner chamfer`), `metro-map` (strokes in the color of the source, `ORIGEN`), `pixel-art` (`style pixel`).
