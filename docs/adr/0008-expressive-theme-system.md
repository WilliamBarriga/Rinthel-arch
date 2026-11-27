# Expressive Theme system: declarative Layers, hybrid render and animation

Context: the previous model (closed fixed shapes, ADR 0002 and 0006) only allowed varying values within a few shapes. The aesthetics prototype (variants A-G) and the hybrid render one (14 Themes: glass, Bauhaus, post-its, 3D keycaps, metro, PCB, pixel...) showed that changing only the Theme can give radically different designs if the Theme describes the drawing as data and not as a choice between fixed shapes. This ADR replaces that model. It rewrites ADR 0002 (which keeps only what does not change) and absorbs and deletes ADR 0006. The decisions come from the "Expressive Theme system" map and its tickets; the detail of each lives in the cited ticket. Implementation is out of scope.

## Hybrid render: HTML/CSS for Nodes and Groups, SVG for Edges

Nodes and Groups are drawn as HTML/CSS (glass with real `backdrop-filter`, shadows, filters, browser text); Edges, in an SVG layer. Everything lives under a single container with a single pan/zoom `transform`, so alignment is exact at any zoom (prototype, ticket "Prototype: hybrid render").

- The order Group < Edge < Node requires three flat layers in absolute canvas coordinates, not nested divs: the Geometry gives boxes relative to the parent Group and Edges in canvas coordinates, and the render converts to absolute ones.
- Performance: `contain: layout style` per Node and per-View collapse as the main lever. No official Node ceiling; an estimate to validate of 300-500 HTML Nodes with full detail at once. The cost of `backdrop-filter` and `box-shadow` has no primary figures (research `render-hibrido-rendimiento`).
- Canvas/WebGL is discarded as overkill.
- The render is still a pure function of geometry and Resolved style: no external clock; animation runs in the browser (CSS and WAAPI). The `visibility` and per-`view` collapse contracts of ADR 0002 stay.
- Static SVG, PNG and export in general are out: the system assumes only screen and there is no per-Primitive exportability mark.

## Layer model: Layers, Primitives and Slots

Each element (Node, Edge, Group and page background) is an ordered stack of named **Layers**. A Layer is an instance of a **Primitive**, taken from a closed catalog; the DSL never carries raw CSS.

- **Families** (twelve): shape, fill, border, Edge stroke, shadow, glow, glass, filter (hand-drawn), decoration, Edge marker, Slot text style and code. Each Primitive belongs to only one. Examples from the initial catalog: shapes rect, pill, cut corner and circle; fills solid, gradient, patterns (grid, lines, disc) and noise; multiple shadows, `inset` and `spread` (blur 0 gives a hard shadow); Edge strokes solid, dashed, dotted and pixel, corner `chaflan`, markers including `via`. Exact names and ranges live in the catalog schema (see below), not in this ADR.
- **Content in Slots**: fixed names `icon`, `title`, `desc`, `badge`, `footer`, `attrs`, `counter`, with a declarative mini-layout (row/column, alignment, gap). The Theme decides which are shown, where and with which style; the order of the block is the visual order and an unlisted Slot is not painted. There is no free px position.
- **Order relative to content**: each Layer goes under the content (default) or over it (`over`).
- **Group**: a `group` block with the same Layer stack, `type` and `state` as `node`, plus the header (a Slot tree of the mini-layout: `slots row gap 6 { icon title }`), the `padding` of the children zone (1, 2 or 4 values) and `state collapsed`, the patch of the closed Group, which behaves like a leaf Node (it uses the Node's Slots and styles unless the patch changes them, and it may change the box; the Group's other state and Kind patches do not touch the Metrics). The header height plus the padding give the top padding of the open Group entry of the Metrics table, and the header sets the Group's minimum width: children never overlap it. The `text` style of the title accepts `size`, `tracking`, `alpha`, `transform` and chip (`fill`, `border`, `radius`, `pad`, `dot`). A Theme without `group` resolves a sober Group derived from its tokens, never the Node's Layers. `COLOR` is painted as the color variable of each Node or Group, and the Kind and state patches are painted the same for Nodes and Groups (selectors `.rd-nodo`, `.rd-grupo`, `.rd-colapsado` with `data-tipo` and `data-estados`).
- **Edge**: its own smaller model: a stack of strokes (a second wide translucent stroke gives the glow), origin and end markers from the catalog, and a label that reuses the Node's box model. Routing still belongs to ELK and does not depend on the Theme.
- **No fixed shapes**: each Theme describes its drawing with Layers.
- **Values**: color is always a Palette name (ADR 0002) with modifiers (alpha, `mix`, the specials `COLOR` and `ORIGEN`); no hex outside `palette`. Numbers are literals or named `$token`s, without arithmetic.

### Cascade and patches

Variation is expressed as patches by Layer name, never by index. Cascade order, where the last wins: base Theme, Node kind, state, View override. A patch changes an existing Layer, adds it (with `before` or `after`) or removes it (`none`). States: `hover`, `selected`, `ghost`, `on-path`, `dimmed` and `focus`. Conditions are limited to Node kind, state, Group/collapsed and presence of content (there is a description, there are Attributes); no expressions or reading of arbitrary Model data.

One Theme per View; within the View the shape varies by Node kind, Edge and Group. Mixing whole Themes within a View is discarded: internal variation is covered with Kind patches, `extends` and `part`/`use`. Explicit exception: the `high-contrast` Theme replaces the View's only in the viewer.

## DSL syntax of the `theme` block

Same conventions as the current DSL: braces, no commas, `key value` properties on one line and a sub-block only when the compound value does not fit on one. Keywords in English; Spanish is left for docs and domain terms. Guiding criterion: easy for a human to read first, and then an agent.

```
theme soft-card {
  palette { ink #1f2937  paper #ffffff  accent #3b82f6 }
  tokens { gap 8  radius 10 }

  node {
    layer base   { shape rect radius $radius  fill paper }
    layer border { stroke ink/0.15 width 1 }
    layer accent after base { bar left width 4 fill accent }
    slots column gap $gap pad 12 {
      title { size 14  weight 600  color ink }
      desc  { size 12  color ink/0.7 }
    }
    type service { layer accent { fill mix(accent, paper, 0.3) } }
    state hover  { layer border { stroke accent } transition 120ms ease-out }
    state selected { layer accent { motion pulse 1.2s ease-in-out intensity 0.4 } }
  }

  edge {
    layer line { stroke ORIGEN width 1.5 }
    end arrow
  }
}
```

- **One Layer verb**: `layer <name>` defines, changes or adds depending on whether it exists in the level below in the cascade. Adding requires `before`/`after`; removing is `layer <name> none`; adding without a location is an error.
- **Composition**: single-parent `extends` with patch semantics; `part <name> { ... }` is a reusable patch without a Theme, included with `use <part>` inside an element. No multiple inheritance.
- **Unique names** across the whole Workspace: a repeated `theme` or `part` is a duplicate error, never a merge. Tweaking someone else's Theme is done with `extends`.
- **No compatibility** with the old format: `nodeStyles`, `edgeStyles`, the Theme `tokens` and the current Themes go away. Examples and fixtures are rewritten to the Layer format.
- The concrete Langium grammar and the final property names are set at implementation, using the `const T` of the hybrid prototype (prototype branch) as test cases.

## Catalog extension and validation

- **Single source**: a single typed schema of the catalog (in the DSL/theme package); validation, messages, `inspect` and the docs reference table are derived from it. No parallel lists.
- **Extension**: a new family requires an ADR. A new Primitive or property within a family is an issue and a catalog change, with no ADR. It must (1) not be composable from existing ones, (2) be deterministic, (3) declare whether it affects the Metrics (default: paint only) and (4) appear in at least one example Theme as a test case. The maintainer extends it; a Theme author uses the code escape hatch.
- **Strict validation**, with a stable code and position, all errors together and a message in Spanish with the valid keys and the closest one ("did you mean ..."). Errors are: unknown property, `before`/`after` to a nonexistent Layer, patch to a nonexistent Layer without a location, color outside the Palette, undeclared `$token`, value out of range or of the wrong type (never silently clamped; rotation is capped at 3 degrees), state patch that touches Metrics.
- **Determinism** (hand-drawn, rotation, noise): 32-bit FNV-1a seed from the element id mixed with the Layer name; a PRNG seeded once per Layer, independent of the box size and render order (resizing or collapsing does not change the stroke); the View does not enter the seed. Optional `seed N` in the Theme to "reroll". The hand-drawn filter uses the seed as the `feTurbulence` integer. Edges derive their identity from `origin->target` plus an index among identical Edges, without touching the DSL.

## Metrics and Resolved style

From ADR 0006 the principle that layout and render read the same Metrics is kept, so what is reserved and what is drawn cannot diverge; the layout cache key is computed over them (ADR 0003) and `resolverEstilo` stays pure and deterministic. The rest is rewritten.

- **What affects layout**: only the box and the Slots (padding, gap, Slot size, minimum width). Painted Layers (shadow, glow, decoration, hand-drawn) may stick out without reserving space. Slots that add width (collapsed Group counter, title `prefijo`) enter the Metrics; each Theme sets its text width factor (pixel font).
- **Metrics table**: `metricsOf(theme)` goes from a single object to a table of entries per element: Node per Node kind (cascade base Theme, Kind), open Group, collapsed Group and Edge label. A Kind the Theme does not mention uses the base entry; a declared and unused Kind is ignored; different boxes per Kind in one View are normal.
- **What is measured**: the text of each Slot; the minimum box the shape requires (rule declared per Primitive: width, height, ratio; the circle asks for a square that contains the content); and conditional Slots. Painted Layers are not measured. Of Edges, only the label box counts.
- **States**: only the base state and the collapsed state of a Group can change the box. A state patch (`hover`, `selected`, `ghost`, `on-path`, `dimmed`, `focus`) that touches padding, gap, size or visibility of a Slot is a `validate` error. Hover never relayouts.
- **Text**: per-character estimation remains the base (layout runs without a DOM). Real measurement is an adapter of `metricsOf`: the viewer measures after loading the fonts and hands the measures to layout as input; the CLI stays with the estimation.
- **Relayout**: a Theme change relayouts only if the structure key changes (Metrics per element, origin of the measures, fonts). A change of only painted Layers or animation does not relayout nor invalidate the Fresh geometry; a whole different Theme with identical Metrics reuses the cache.
- **Resolved style**: the result of applying the cascade (base Theme, Kind, state, View override) to the Layer stacks. It has two halves: the **Metrics** (read by layout) and the **paint** (the Layers, read by render). The render only reads the Resolved style and works as an interpreter of Primitives; the per-part painters of ADR 0006 go away.
- **Pin**: now anchors the **center** of the Node (before, the top-left corner), so that a Node that changes size with the Theme grows around its Pin without moving or invalidating it. The semantics of `pin` change in layout, DSL and editing (ADR 0003 and 0007) and existing Pins are migrated.

## Fonts

- Fonts are Workspace files, self-hosted and embedded (the OFL license allows embedding). A CDN stays out of the core; system fonts are only valid as a declared fallback, because `system-ui` and the generics vary by platform and are not deterministic.
- The viewer measures only after `await document.fonts.load(<font>, <text>)` (`ready` and `check` are not enough).
- harfbuzzjs (MIT) is a candidate to evaluate for measuring glyph advances in Node/Worker; before adopting it, its own research and decision are needed.
- The layout cache key includes the hash of the font file and the measurement level (estimated or measured). Not verified: equality of `measureText` across engines (research `fuentes-tema`).

## Declarative animation

- **Motions**: continuous animation is declared as Motions from a closed named catalog (`stream`, `pulse`, `breathe`, `spin`, `aura`...) with parameters (duration, easing, intensity, delay). It is a property of a Layer and can be tied to a state. It is extended like the Primitives. Declarative emergency exit: minimal `keyframes` over a Layer property; beyond that, the code escape hatch.
- **Reactions**: not a separate concept; they are automatic transitions between state patches. The Theme declares `transition` (duration, easing) per Layer or state.
- **Enter and exit**: `enter`/`exit` per element with catalog effects (`fade`, `zoom`, `slide`, `dibujar-trazo` for Edges) and declarative `stagger`. A reveal Step (ADR 0002) has no mechanism of its own: it only triggers the `enter` of what was just revealed.
- **Path focus**: `en-ruta` and `atenuado` are just more cascade states. Whoever computes the path is the renderer or the interaction; the Theme only decides how it looks.
- **What is animated**: only painted or composable properties (opacity, color, transform, stroke offset and length, blur, glow). Nothing that affects the Metrics: animation never causes relayout. Position changes (Group collapse, View change) are not animated declaratively: instant change, with a fade for what appears or disappears; layout animation belongs to code.
- **Mechanism**: the Theme compiles to native CSS (keyframes and transitions) for the continuous and the states, and to WAAPI for coordinated sequences (enter, exit, stagger, Steps). No dependency in the core. Motion (MIT) only as an optional extension of the code path; GSAP is discarded due to its license (research `animacion-efectos`).
- **`prefers-reduced-motion`**: an automatic policy at a single point of the core. Continuous Motions stay on their static frame; enter, exit and transitions are reduced to a short fade or an instant change. The Theme may declare `reduced still|fade|instant` per animation but cannot disable the policy. The viewer also offers a manual toggle independent of the system preference.
- **Syntax** (first cut, Node only): inside a Layer, `motion <name> [duration] [easing] [intensity N] [delay D] [reduced still]`, `motion none` (removes the inherited one) or `keyframes <property> [duration] [easing] { <percentage> <value> ... }`; in `node`, `transition D [easing]`, `enter <effect> ...`, `exit <effect> ...` and `stagger D`; `transition` also inside a `state`. Durations `120ms` or `1.2s`; easings `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`. The catalog (`theme`) sets names, defaults and ranges; an out-of-range value is an error, never clamped. `keyframes` properties: `opacity`, `scale`, `rotate`, `shift-x`, `shift-y`, `blur`.
- **Realization**: everything compiles to native CSS (`@keyframes`, `animation`, `transition`, individual properties `scale`/`rotate`/`translate`); a Motion tied to a state runs under the selector `[data-estados~="<state>"]`. `enter` is an `animation` over what is visible (with `stagger` via `--rd-n`) and `exit` a `transition` toward the `data-oculto` attribute; WAAPI is not needed as long as the stagger is declarative. `dibujar-trazo` comes with the Edge model.
- **reduced-motion**: a single render function generates the policy, with the system media query and the manual attribute `data-reduced-motion="on|off"` on the container (prop `reducedMotion` of `Diagram`). Motions and `keyframes` only accept `reduced still`; `transition`, `enter` and `exit` accept `fade` (default, 100 ms) or `instant`.
- To verify at implementation: performance of many Edges with continuous flow.

## Code escape hatch

- **Where it lives**: `.tsx`/`.ts` modules inside the Workspace, next to the Theme's `.dg` and versioned with it. An npm package as a possible source later, without changing the contract.
- **Loading**: `session` stays pure and never imports code. An adapter (`cli`/`dev`) compiles the `.tsx` and registers it in the render by name. The DSL references it by declared name, never by free path.
- **Scope**: the component is one more **Layer** of the stack, via the Primitive `code <Component>` (with patches, `over` order and states like any Layer); it does not replace the whole element and cannot change its size nor affect the Metrics.
- **Props**: a read-only, serializable object: already computed box, current state, resolved Palette color, element `id` (deterministic seed), parameters declared in the Theme and bounded data (Kind, title, presence of content). No full Model nor callbacks into the Model.
- **Validation**: a Theme with code is marked in `inspect` and `validate` (`hasCode` and list of components). `validate` emits a warning and only checks the interface (the component exists, its parameters match the schema it exports, the id does not collide). The declarative part is validated with the same rigor as any Theme.
- **Trust**: the code runs with the privileges of the browser and of `dev`, without a sandbox. The Workspace is treated as trusted code: `dev` warns the first time it loads a Theme with code and opening someone else's Workspace requires explicit confirmation. The sandbox (iframe/worker) is out.
- **Agent**: `edit` and `inspect` operate on the Theme's DSL, not on the `.tsx`; the agent edits the `.tsx` with its normal tools. A compilation error is a `validate` Issue (`file`/`line`, stable code) and `dev` keeps the last good drawing.
- **Implementation (ticket #42)**: the Layer is written `layer aura code over { component Aurora  hue 3 }`; `component` is mandatory and the other properties are the declared parameters (number or text as is; a state patch may change them). A component is a capitalized named export of a Workspace `.tsx`. The adapter (`cli/src/codigo.ts`) compiles them with esbuild without running them: it gives the names to the `session` registry (`SessionOptions.components`) and a CommonJS bundle that `dev` serves at `/components.js`. `render` receives the registry through the `componentes` prop of `Diagram` and mounts each Layer in a fixed-size container equal to the box (`data-codigo`), with an error boundary per Layer. Codes: `theme-with-code` (warning), `theme-component-missing`, `theme-component-params` (only if the registry declares parameters; the static CLI does not know them because it does not run the `.tsx`), `theme-component-duplicate` and `theme-code-compile` (with the `file`/`line` of the error). `dev` does not serve the code until the user confirms in the browser (`POST /api/trust`) or starts with `--trust-code`; if a `.tsx` stops compiling, it keeps the last good version of that file.

## Accessibility

- **Contrast**: a warning (never blocks the render), computed by `validate` over Palette colors, per Kind and per state (base, `en-ruta`, `atenuado`). Thresholds: 4.5:1 for text (3:1 if large) and 3:1 for graphic parts.
- **`high-contrast`**: a core Theme of its own, not a patch. It is activated by a viewer toggle or `prefers-contrast: more`; it replaces the View's Theme only in the viewer, without touching the Workspace.
- **Focus and keyboard**: Nodes and Groups are focusable in the Model's declaration order; Enter or Space collapses or opens a Group; the arrows jump along Edges to the neighbor Node. `foco` is a cascade state. The core guarantees a minimal ring: the Theme restyles it but cannot remove it (`none` is ignored with a warning). A single policy in the core, like reduced-motion.
- **Color only**: `validate` emits the `solo-color` warning when two Kinds of a View differ only by Palette color; the viewer can always show a legend derived from the Theme (Kind, shape, color) and turns it on by itself in that case.
- **Accessible content**: the accessible name of Nodes, Groups and Edges comes from the Model (label, Kind, origin/target); the Theme cannot hide or change it. The Edges SVG is decorative (`aria-hidden`) and the relation is announced on the Nodes ("goes to" / "comes from").

## Example Themes and Default theme

- The 14 prototype Themes (`soft-card`, `glass-chip`, `neobrutalist`, `blueprint`, `crt-terminal`, `synthwave`, `editorial`, `bauhaus`, `sticky-notes`, `keycaps`, `metro-map`, `pcb`, `pixel-art` and the soft light one) live in `examples/rinthel-arch/themes/`, one `.dg` each, with a gallery Workspace (`examples/themes/gallery/`, which takes them with `--theme-path`) and an agnostic Model of its own that covers every Kind, open and collapsed Group, Edges with and without label and one Node per state. They cover the eleven families. Examples that need their own font include the OFL file in `examples/rinthel-arch/themes/fonts/`; no CDN.
- Default theme: **`neutral`**, built into the core, light, written in the same DSL as any Theme as a reference model, with system fonts, no `code` Layers, only simple Primitives (no glass nor hand-drawn), minimal animation (`hover`, `on-path`) and zero warnings. It comes with `neutral-dark` (a Theme is a single mode) and `high-contrast`: three built-ins. A View without a Theme uses `neutral`.
- Acceptance: every example validates without errors; the three built-ins, without warnings; the rest may keep deliberate contrast warnings, listed in a comment at the start of the file, with no suppression syntax. Tests are structural (they load, resolve, validate; deterministic Resolved style; Metrics change only with the structure key), with no pixel snapshots; a person does the visual review in the gallery.

## Consequences

- The fixed shapes of the previous model are replaced by Layers; the Resolved style and the Metrics are redefined (see above and `CONTEXT.md`). ADRs 0003 (Pin at the center, cache key with fonts and origin of measures) and 0007 (`pin` semantics) are adjusted at implementation.
- New vocabulary in `CONTEXT.md`: Layer, Primitive, Family, Slot, Motion, Theme part, Theme component and Default theme.
- The CLI contract for Themes (`inspect theme`, `validate`, `dev` reload) is in the amendment of ADR 0005; `edit` does not change.
- Out of scope: integration with slides, video or other consumers, and mixing whole Themes within a View.

## Amendment (map #211, ticket #227): language, `planned` state and export

- **Language**: user-facing guide prose is bilingual (English primary, Spanish secondary, each guide paired with its translation). Every message an agent or user reads from the CLI (`validate` and `fix` messages, errors, `--help`) is in English, using the English canonical terms of `CONTEXT.md`. The DSL keywords were already English.
- **`planned` Theme state**: a new paint-only state, like `fantasma`; it never changes Metrics. The default Theme draws it with a dashed border and low opacity, any Theme may restyle it, and without its own patch it inherits the default Theme's. Mark semantics live in ADR 0011.
- **Export is no longer out of scope**: the statement "static SVG, PNG and export in general are out" in "Hybrid render" is superseded. A self-contained static HTML export of a Workspace is part of the map; PNG and static SVG remain out, and there is still no per-Primitive exportability mark.

## English catalog names (spec #226)

- **Catalog values in English, no aliases**: Motions `stream`, `pulse`, `breathe`, `spin` (and `aura`); effects `fade`, `slide`, `zoom`; states `selected`, `dimmed`, `focus`, `ghost`, `on-path`; built-in Theme `high-contrast` and gallery Theme `soft-light`. An old Spanish name (`flujo`, `pulso`, `respiracion`, `giro`, `fundido`, `deslizar`, `escala`, `seleccionado`, `atenuado`, `foco`, `fantasma`, `en-ruta`, `alto-contraste`, `claro-suave`) is an `error` Issue `old-catalog-value` whose `fix` rewrites it. The old-to-new tables are `packages/canonical/src/renames.ts`.
- **Built-in names in English (review of spec #226)**: the built-in Palette colors are `background`, `paper`, `ink`, `frame`, `stroke`, `shadow` and the built-in Layers `shape`, `fill`, `border`, `shadow`, `dots`, `stack`, `stack-border`, `accent`, `line`, `background`, `separator`; the special color `ORIGEN` is `ORIGIN`. An old name is `old-catalog-value` with a `fix` when the new one exists where it is looked up (a user Theme that declares its own `fondo` or `borde` is untouched).
- **States on lines**: `edge { state <name> { ... } }` and the `message` block `state` patch the stroke stack per state (paint-only: markers, labels and Metrics stay). With a `planned` patch the default dashed and faded look is not applied to that line.
