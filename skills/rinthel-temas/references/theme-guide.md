# Theme guide

How a Theme is built and how to write one. The exact Primitives, properties and ranges are in `theme-catalog.md` (same folder).

## Choosing a Theme

- Built in: `neutral` (default), `neutral-dark` and `high-contrast`.
- Yours: a `theme` block in any `.dg` of the Workspace. By convention a Workspace keeps its Themes in `theme.dg` or in a `themes/` folder (one `.dg` per Theme), and fonts in `fonts/`.

A View uses one Theme. Adjust it for that View only with a patch between braces:

```
view highlighted {
  type architecture
  theme shop { layer border { color amber  width 3 } }
  include **
}
```

## Anatomy of a Theme

```
theme my-theme extends neutral-dark {   // `extends` is optional; one parent
  palette { ... }   // color names
  fonts   { ... }   // font families
  tokens  { ... }   // default background, text and border
  page    { ... }   // page background Layers
  node    { ... }   // Layers, Slots, patches per Node kind and per state
  group   { ... }   // same for Groups, plus header and padding
  edge    { ... }   // strokes, markers and label of Edges
}
```

Everything is optional; with `extends` write only what changes.

### Palette, fonts and tokens

```
palette { bg "#13001f"  text "#fdf4ff"  pink "#ff2bd6"  blue "#22e4ff" }
fonts   { body "Outfit"  mono "JetBrains Mono"  fallback "sans-serif" }
tokens  { background "#13001f"  foreground "#fdf4ff"  border "#ff2bd6" }
```

- Hex exists only in `palette`. Everywhere else a color is a **Palette name**, with modifiers: `pink/0.4` (opacity) or the specials `COLOR` (the Node kind's color, declared in `specification`) and `ORIGIN` (on Edges, the color of the source Node).
- `blue`, `green`, `amber`, `red`, `purple` and `gray` are the colors Node kinds use; define the ones you use.
- Fonts are **self-hosted**: put the files in the Workspace, usually in `fonts/` (`woff2`, `woff`, `ttf` or `otf`, one per family and weight), and name the family in `fonts`. There is no CDN. `fallback` is the generic fallback family. Keep each font's license next to the file.

### Layers and Primitives

Each element is drawn as a **Layer stack**, bottom to top. A Layer is an instance of a catalog **Primitive** (the DSL has no loose CSS):

```
node {
  layer glow    glow     { color pink/0.55  radius 18 }
  layer shape   rect     { radius 12 }
  layer fill    gradient { from pink  to cyan  angle 100 }
  layer outline border   { color cyan  width 2 }
}
```

Families: shape (`rect`, `pill`, `cut`, `circle`), fill (`solid`, `gradient`, `radial`, `disc`, `grid`, `lines`, `dots`, `noise`), border (`border`, `dashed`, `dotted`, `outline`), shadow and glow, glass and filter (`glass`, `sketch`), decoration (`tilt`, `tape`, `stripe`, `pins`, `fold`, `ring`), stroke (`line`, with `corner` `sharp|chamfer|round` and `style`), marker (`arrow`, `dot`, `diamond`, `square`, `bar`, `via`, `hollow`, `chevron`, `cross`, ER `one`, `zero-one`, `many`, `zero-many`), text and content (`text`, `chip`, `icon`, `label`), and `code` (a custom React component, for what the catalog does not cover).

Numbers have ranges; one out of range is a `validate` error, never clamped. A patch may also order a Layer (`before` / `after` another), put it over the content (`over`), shift it (`offset x y`), grow it (`grow`) or remove it (`layer shadow none`).

### Slots: which content shows and where

A Node has content Slots with fixed names: `icon`, `title`, `badge` (the Node kind name), `desc`, `footer`, `attrs` and `counter` (child count of a collapsed Group). The Theme decides which are drawn, in what order and style, with a small row/column layout:

```
slots column min-width 160 slack 28 {
  row gap 10 pad 14 min-height 50 {
    icon { variant dot  side 18 }
    column {
      title { weight 700  text-align start }
      badge { alpha 0.6  transform uppercase  size 0.66  tracking 0.18 }
    }
    counter { fill pink  border cyan }
  }
  attrs
}
```

A Slot you do not list is not drawn. Slots and the box are the only things that change a Node's size (its **Metrics**); everything else only paints.

### Patches per kind and per state

Variation inside a Theme is written as patches over Layers, by name:

```
node {
  type external { layer outline dashed { color cyan } }        // only Nodes of that kind
  state hover { layer glow { color cyan/0.8  radius 28 }  transition 140ms ease-out }
}
```

Cascade, last wins: base Theme, Diagram type, Node kind, state, View patch.

`diagram <type> { ... }` (inside `node`, `group` and `edge`) targets one Diagram type (`architecture`, `flow`, `sequence`, `er`): `node { diagram flow { slots row pad 20 { title attrs } } }` changes only flow Views. It accepts `layer`, `use` and `slots`; `padding` in `group`; markers (`start`/`end`) and `label` in `edge`. Unlike a state, it may change Metrics. An unknown type is `theme-unknown-diagram-type`.

States: `hover`, `selected`, `ghost`, `on-path`, `dimmed`, `focus` (and `planned`, for Planned elements). A state may only change paint, never size or Slots (`validate` rejects it), so hovering never moves the diagram. A Group also has `state collapsed`, the look of the closed Group.

### Parts: reusable patches

```
part bar { layer accent shadow after outline { color COLOR  x 4  y 0  inset 1 } }

theme my-theme { node { type service { use bar }  type package { use bar } } }
```

A `part` belongs to no Theme and its name is unique in the Workspace.

### Edges and page

```
edge {
  layer halo line { color pink/0.18  width 8  corner round  radius 14 }   // wide translucent stroke gives the glow
  layer main line { color cyan  width 1.8  corner round  radius 14 }
  start hollow { size 7 }
  end arrow { size 10  color cyan }
  label { scale 0.82  pad 10  radius 50  fill bg  border pink/0.7 }
}
page {
  layer grid grid { color pink/0.10  size 44 }
  fixed          // the background does not move with pan/zoom
}
```

Edge routing belongs to the layout; the Theme paints, it does not route.

### ER tables: `row`, `zone` and markers

An `er` View draws each Node as a table (header plus one row per Attribute). The Theme styles it with the `row` block, the `zone` property of Node Layers and Edge markers:

```dg
specification { node table { icon database  color green } }

model {
  table customers "Customers" { id: uuid pk  email: text? uk }
  table orders "Orders" { id: uuid pk  customer_id: uuid fk  note: text? }
  orders#customer_id "0..*" -> "1" customers#id "belongs to" identifying
}

theme notebook {
  palette { paper "#fffdf5"  ink "#1f2937"  blue "#2457d6"  gray "#ece8dc"  green "#d9f2dc"  amber "#fdecc8" }
  node {
    layer shape rect { radius 6 }
    layer fill solid { color paper }
    layer header solid { color blue  zone header }     // only the header (all, header or body)
    layer outline border { color ink }
    slots column { title { color paper  weight 700 }  attrs }
  }
  row {
    height 26                                           // row height: changes table size
    layer fill solid { color paper }
    layer divider stripe { color gray  side bottom  width 1 }
    alternate { layer fill { color gray } }             // odd rows
    key pk { layer fill { color green } }               // rows with that mark (pk, fk, uk); stack in that order
    optional { layer fill { color amber } }             // optional Attributes (after the keys)
    state selected { layer fill { color green } }       // selected row (also hover); paint only
    name { weight 600  size 1.1 }  type { color blue }  // text style; size changes the measured size
    key { fill blue  color paper  radius 4 }            // the chip of each key mark
  }
  edge {
    layer line line { color ink }
    diagram er { end arrow { size 12  color blue } }    // only color and size of the crow's foot
  }
}

view tables { type er  theme notebook  include ** }
```

- `zone header` paints from the top to where rows start (`attrs`); without `attrs` it equals `all`. `zone body` covers the rows. A Layer with `zone` paints apart from the box, so a state patch does not change it.
- `row` only applies in `er` Views. `height` (12 to 120) is a Metric; Layers and patches only paint (one that changes the box is `theme-state-touches-metrics`).
- The core picks each end's marker by cardinality (`1` is `one`, `0..1` is `zero-one`, `1..*` is `many`, `0..*` is `zero-many`); the Theme changes only its `color` and `size`.
- Identifying Edges are solid and the rest dashed; `edge { identifying { layer line { color blue } } }` also changes the stroke of identifying ones. If both end up equal but for color, `validate` warns `theme-color-only`.

### Sequence: `lifeline`, `activation`, `message`, `fragment` and `note`

A `sequence` View draws itself with any Theme (elements derive from `edge` and `node`). To style it, declare blocks at `node` and `edge` level. All accept `layer`, `use`, `state` and, where it applies, per-variant patches; the sequence gaps are their Metrics:

```dg
specification { node piece { icon box  color blue } }

model {
  piece client
  piece api
  piece db
  interaction order {
    client -> api "ask"
    api -> db "save"
    reply db -> api "ok"
    alt "in stock" { api -> db "reserve" }
    note right of db "idempotent"
    reply api -> client "201"
  }
}

theme ink {
  palette { paper "#fefce8"  ink "#1f2937"  blue "#2563eb"  green "#16a34a"  red "#dc2626"  amber "#d97706" }
  node {
    layer shape rect { radius 6 }
    layer fill solid { color paper }
    layer outline border { color ink }
    slots { title }
  }
  edge { layer line line { color ink  width 1.2 } }
  lifeline {
    layer line line { color ink/0.5  width 1  style dashed }
    end cross { size 12  color red }
    gap 200                                          // minimum distance between Lifelines
  }
  activation {
    layer fill solid { color blue/0.2 }
    layer outline border { color blue }
    width 12
  }
  message {
    layer line line { color ink  width 1.5 }
    end arrow { size 10 }
    gap 40  loop-width 48  create-offset 0           // between Messages, self-loop width, offset of the created header
    kind async { layer line { color green }  end chevron { size 10  color green } }   // per-kind patch: sync, async, reply, create, destroy
  }
  fragment {
    layer shape rect { radius 8 }
    layer fill solid { color paper/0.6 }
    layer outline border { color ink/0.6 }
    operator { color ink  weight 700 }  guard { color ink }  divider { color ink/0.5  style dashed }
    op alt { layer outline { color blue } }          // per-operator patch: opt loop break critical alt par ref
    padding 20  padding-y 10                         // around the content
  }
  note {
    layer fill solid { color amber/0.25 }
    layer outline border { color amber }
    text { color ink  weight 600 }
  }
}

view order { type sequence  theme ink  interaction order }
```

- `message { kind async { ... } }` touches only `async` Messages. Without a patch, `reply` and `create` use the opposite continuity of the base stroke, and the marker depends on the kind.
- `lifeline` and `message` use Edge strokes; `activation`, `fragment` and `note` use Node Layers. `COLOR` is the Lifeline's. `gap`, `loop-width`, `create-offset`, `width` and `padding` are Metrics (they change Geometry); the rest only paints.
- If two Message kinds the View uses end up equal but for color, `validate` warns `theme-color-only`.
- The built-in Themes declare all these elements and `row`: `neutral` is the reference model, `neutral-dark` inherits it changing only the Palette, `high-contrast` uses thicker strokes.

## Motion and entrance

- **Motions** (closed catalog): `stream`, `pulse`, `breathe`, `spin` and `aura`, hung from a Layer: `layer glow { motion aura 2s ease-in-out intensity 0.6 }`. They can be bound to a state.
- **Keyframes** for animatable properties (`opacity`, `scale`, `rotate`, `shift-x`, `shift-y`, `blur`): `keyframes opacity 2s { 0 1  50 0.4  100 1 }`.
- **Transitions and entrances**: `transition 140ms ease-out` between states; `enter fade 300ms`, `exit zoom 200ms` (`fade`, `zoom`, `slide`) and `stagger 60ms` to stagger.

Ranges and easings: `theme-catalog.md`.

## Contrast and accessibility

`validate` measures the contrast of each kind and state (text 4.5:1, graphic parts 3:1) and warns `theme-low-contrast`. If two kinds differ only by color it warns `theme-color-only` and the viewer shows a legend. An aesthetic may require them: say so in a comment on the first line of the Theme file (`// Contrast: <kinds>`); the warning still shows, so that Theme does not pass `--strict`. The built-in `high-contrast` Theme replaces the View's in the viewer only, for whoever needs it: with the canvas "High contrast" button or, if untouched, when the system asks `prefers-contrast: more`.

## Inspect and debug

- `diagrams inspect theme <name> --workspace <path>` prints the resolved Theme (parent, Parts, Layers with their `file:line`). With `extends`, it shows what you inherit.
- `--kind <kind> --state <state> --diagram <type>` narrows it to one Layer stack; elements the Theme does not declare appear marked `(derived)` (`derived: true` in `--json`), as they are drawn.
- `diagrams validate` lists errors with suggestions: a misspelled Primitive proposes the closest.
