# Render: pure contract, color by Palette and reveal Steps

Rewritten by ADR 0008 (Expressive Theme system). From the original survive the pure render contract, color only by Palette name, icons and reveal Steps. The hybrid render (HTML/CSS for Nodes and Groups, SVG for Edges), the Theme model, relayout and animation are in ADR 0008. The Theme error codes of this ADR (inheritance, duplicates) move to ADR 0008.

## Pure render, interactive shell apart

The render is a pure function from geometry and Resolved style to a React view, with no external clock and no data state of its own. Pan/zoom, collapse and selection live in a separate interactive shell that controls the same props. React Flow is discarded as renderer: ELK already delivers positions, ports and edge routes, and React Flow would only add pan/zoom and culling. tldraw is discarded because of its production license.

### Component contract

Props: `geometry` (layout output of a View), `width` and `height` in px, the already resolved Theme, `visibility: (id) => number` for Nodes and Edges (0 hidden, 1 revealed; see the `visibility` decision in reveal Steps), controlled `camera`, `onToggle` and `onSelect`. No dependency on Next, Tailwind or json-render; peer React 18 and 19.

- **Collapse by `view`, not by `expanded`**: the collapse state lives in the resolved View (`resolveView(fuente, id, { expanded, collapsed })`), which decides which Nodes exist and with which lifted Edges. Duplicating it in a prop would give two sources of truth. `onToggle(id)` only reports that the control of a Group was pressed (drawn when `onToggle` is present); whoever owns the state resolves the View again and recomputes the layout.
- Culling with thousands of Nodes is handled with collapse and viewport filtering in the shell.
- The `render` package is independent of any consumer (slides, video, web): this repo does not depend on them nor reference them in code. How it is integrated into a consumer repo is decided by that repo.

## Color only by Palette name

The Theme is declared in the DSL (`theme` block, in any file of the Workspace) and compiles to the Canonical form; `render` receives the already resolved object, with no inheritance logic. A color is written only by Palette name, in Node kinds (`specification`), in Themes and in View overrides; the literal value (hex) lives only inside the Theme's `palette` block. Allowing hex in the Model is discarded: a Theme change would no longer recolor everything. Error with a stable code and file/line: unknown Palette color.

Theme selection (`--theme`, `--theme-path`, `theme` in the View, Default theme) and the rest of the Theme model are in ADR 0008.

### Icons

The core ships a small set of generic icons and accepts SVG from the Workspace. An icon resolves to inline SVG through a catalog port, so an optional brand set plugs in without touching the core; its choice is left to the brand icons research.

## Reveal Steps: `steps` block in the View, sugar over `visibility`

A View can declare a `steps` block with ordered Steps. It is cumulative: each `step` adds with `show` what is revealed (and an optional `hide` hides it); what came before stays visible. Naming a Node reveals only that Node; a Group is revealed with an explicit selector (`a.b.*`, which reveals the Group `a.b` and its direct children; `a.b.**`, the Group and all its descendants). An Edge is revealed by itself when both endpoints are visible, unless a later step names it (`edge a -> b`) to reveal it later. Annotating `#step` on each element is discarded: it pollutes the Model with presentation and hides the order.

```
view overview {
  include rinthel.**
  steps {
    step "Entrada" { show rinthel.api }
    step "Auth"    { show rinthel.api.auth, rinthel.api.auth -> rinthel.db }
  }
}
```

### Consequences

- The ELK layout is computed once with all the elements of the View; steps only change visibility, never geometry. There is no relayout per step and no position jumps; the cost is empty space reserved in the first steps.
- A pure function `revealAt(view, position: number)` turns a step into the `visibility(id)` of the render contract: it always gives 0 or 1 and a fraction counts as its integer part. Consumers do not reimplement the logic.
- Without `steps`, everything is revealed. A Collapsed group counts as visible if any child is revealed.
- The shell offers previous/next; the current step lives in the URL hash, like drill-down.
- Validation error codes cover steps with nonexistent ids or selectors.
- A Step only triggers the `enter` animation of what was just revealed (ADR 0008); it still does not change position.

### Decision: continuous `0..1` visibility is removed from reveal (animation ticket)

A Step only changes what is revealed; it has no animation mechanism of its own (ADR 0008): what was just revealed triggers the Theme's `enter` and what gets hidden, its `exit`, both in native CSS. Therefore:

- `revealAt` no longer interpolates: it returns 0 or 1 and a fractional position applies the previous whole step. The fade between steps belongs to the Theme (`enter`/`exit`, with `stagger`), not to a continuous number.
- The render distinguishes hidden (`visibility` 0, `data-oculto` attribute, no clicks) from visible; entering is the `enter` animation of the element that stops being hidden, and leaving is the `exit` transition towards `data-oculto`. Without `enter`/`exit` in the Theme the change is instantaneous. The optional `nuevos` prop of `Diagram` limits the `stagger` to what was just revealed.
- The `Visibilidad` type still returns `number` and the render still paints an intermediate opacity if it receives one: it does not break the shell, whose layout morph (layout animation, which ADR 0008 leaves to code and not to declarations) uses it to fade Nodes that appear when switching Views. Nothing in the Steps flow or the DSL produces intermediate values anymore.
