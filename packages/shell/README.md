# shell
Interactive React layer over `render`: pan/zoom, Selection, navigation between Views and Pin editing.

## What it does
- `InteractiveView` resolves a View, asks the layout adapter for the Geometry (`workerAdapter` in the page, `serveLayout` inside the Worker) and draws it with `render`; it measures text with the real font (`measureInViewer`).
- Camera with pan and zoom, Selection, shortest path, focus, hover, Group collapse with relayout and morph, Steps with drill-down and semantic zoom (in `sequence`, Selection by Message, Note, Lifeline and Fragment, keyboard and `ref`/`link` between Views); each state is controlled by props or internal, and `useHashState` carries it into the URL hash (`HashAdapter` allows renaming keys, as `dev-ui` does).
- Only under `dev`, drags that notify the parent without writing: `onMoveNode` (new Node center, like a Pin) and `onReorderLifelines` (full visible order); if the promise resolves `false` the element goes back to its place. Building the Intent, undo and redo are the parent's (`dev-ui`).
- Canvas chrome (issues, toasts, legend, breadcrumbs) can be turned off with `chrome={false}`; `Legend` and `Breadcrumbs` are exported to mount it outside.

## What it does not do
- Does not draw SVG nor compute positions: that is `render` and `layout`.
- Does not read nor write the DSL: pure editing is `session`'s.
- Does not define the CLI nor serve files: that is `cli`.

## Depends on
`canonical`, `theme`, `layout`, `session` and `render`. External dependencies: `d3-selection`, `d3-zoom`; `react` is a peer.

## Entry file
`packages/shell/src/index.ts` (the header documents the public interface and the props).

## Related ADR
`docs/adr/0008-expressive-theme-system.md` (path, focus and text measuring) and `docs/adr/0007-interaction-and-edit-protocol.md` (Gesture to move a Pin).

## Test
`pnpm --filter shell test`
