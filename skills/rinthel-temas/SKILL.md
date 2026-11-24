---
name: rinthel-temas
description: Customize the look of a rinthel-arch diagram with Themes (Palette, fonts, Layers, Slots, Motions, Parts, plus sequence and ER elements). Use when creating or tweaking a Theme, styling a sequence or er View, changing colors or fonts, animating, or fixing Theme issues from validate.
compatibility: Requires Node 22 or newer and the `diagrams` CLI (npm package rinthel-arch). Use `diagrams` when it is on the PATH, otherwise `npx -y -p rinthel-arch@0.1.0 diagrams`.
---

# Themes: customize the look

The look lives in the **Theme** (`.dg` text), never in the Model: changing `theme <name>` in a View changes the appearance without touching Nodes or Edges. A View uses one Theme; the built-in ones are `neutral`, `neutral-dark` and `high-contrast`.

Below, `dg` stands for the CLI: `diagrams` when on the PATH, otherwise `npx -y -p rinthel-arch@0.1.0 diagrams`. `dg <command> --help` lists the options. The `rinthel-diagramas` skill covers writing the Model and serving it.

## Loop

1. **Start from an existing Theme**: extend a built-in with `theme mine extends neutral-dark { ... }` and write only what changes, or inspect a Theme the Workspace already has.
2. **Find the patch to edit**: `dg inspect theme <name> --workspace <path> --kind <kind> --state <state> --diagram <type>` shows the Layer stack with the `file:line` of each patch. Edit that patch.
3. **Edit** with the closed catalog vocabulary: `references/theme-catalog.md` (Primitives, Slots, Motions, effects with ranges). A name outside the catalog is an error; `validate` proposes the closest one.
4. **Validate**: `dg validate --workspace <path> --json` until `ok: true`. Fix contrast (`theme-low-contrast`) and `theme-color-only`; if the aesthetic requires them, say so in a comment on the first line of the file (`// Contrast: <kinds>`): the warning still shows, so that Theme does not pass `--strict`.
5. **Look**: `dg dev --workspace <path>` and open the View with that Theme (serving: skill `rinthel-diagramas`).

Anatomy, Slots, patches, Parts, ER and sequence blocks, motion and accessibility: `references/theme-guide.md`. Read it before writing a Theme from scratch.

## Sequence, ER and Diagram type

When the Theme does not declare these elements they derive from `edge` and `node`: a `sequence` or `er` View draws well with any Theme, so declare only what you want different. `neutral` declares them all and is the reference model.

| Element | Declared at | Derived from |
| --- | --- | --- |
| `lifeline`, `message` (patches `kind <type>`) | `edge` level | `edge` |
| `activation`, `fragment` (patches `op <operator>`), `note` | `node` level | `node` |
| `row` (ER table: `alternate`, `key pk`, `optional`, `name`, `type`) | `node` level | Slot `attrs` |
| `zone header`, `body` or `all` on a Node Layer | inside `layer` | `all` |
| `diagram <type> { ... }` in `node`, `group`, `edge` | any block | the patch applies only to that Diagram type |
| markers `cross`, `one`, `zero-one`, `many`, `zero-many` | `end`/`start` of an Edge | the cardinality and the Message kind |

- Sequence gaps are Theme Metrics (`gap`, `loop-width`, `create-offset`, `width`, `padding`) and `row { height }` is the ER one: they change Geometry. Layers and colors only paint.
- The core picks ER markers by cardinality; the Theme changes only their `color` and `size`.
- This Theme validates as is and styles a sequence and a table:

```
specification { node service { description "A service" icon box color blue } }
model {
  service client "Client"
  service api "API"
  interaction purchase "Purchase" {
    client -> api "POST /orders"
    reply api -> client "201"
  }
}
theme mine extends neutral {
  palette { blue "#2457d6" }
  lifeline { gap 220 }
  message { gap 40  loop-width 48 }
  row { height 30 }
}
view purchase { type sequence interaction purchase theme mine }
```

- To see the stack of one element: `dg inspect theme mine --workspace <path> --diagram sequence` (or `er`); those the Theme does not declare appear marked `(derived)` (`derived: true` in `--json`), as they are drawn.

## Rules that save errors

- An inherited Layer is patched by the name `dg inspect theme` shows for it; a Layer that does not exist yet needs `before` or `after` another Layer (otherwise `theme-patch-without-placement`).
- Hex exists only in `palette`; everywhere else a color is a Palette name, with `name/0.4` for opacity, or `COLOR` (the Node kind's color) and `ORIGIN` (on Edges).
- Cascade, last wins: base Theme, Node kind, state, View patch. States (`hover`, `selected`, `ghost`, `on-path`, `dimmed`, `focus`, `planned`) only change paint: size and Slots stay fixed. An old (Spanish) catalog name is the error `old-catalog-value`, and its `fix` rewrites it: apply it with `edit`.
- Self-hosted fonts: `woff2` or `ttf` files in the Workspace `fonts/` folder, named in `fonts`. Keep the license next to the file.
- A Theme for one View only: `theme <name> { layer outline { color amber } }` inside the `view`.
- Change a View's Theme without touching its patch: `dg edit --workspace <path> --intent '{"type":"set-theme","view":"<id>","theme":"<name>"}'` (without `theme` it removes it). In `dev`, the Themes tab previews and pins.
- Reusable piece: `part <name> { ... }` and `use <name>` in a patch; the name is unique in the Workspace.
- Edge routing belongs to the layout; the Theme paints, it does not route.
- A Theme with `.tsx` components runs code in the viewer: `dev` asks for confirmation or `--trust-code`; trust only your own Workspaces.
- Keep Themes and fonts in the Workspace (`theme.dg` or `themes/`, and `fonts/`); do not copy the same Theme twice.
