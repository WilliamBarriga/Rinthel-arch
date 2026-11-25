# rinthel-arch map (use case)

Example Workspace in which the system documents itself: monorepo packages, dependencies and the editing flow. It is not part of the core: it serves as an end-to-end test (validate, build, dev).

## Contents

| File | What it maps |
| --- | --- |
| `specification.dg` | Node kinds (actor, package, module, artifact, output, external...) and the Themes `diagrams` (dark) and `diagrams-light`: they extend the built-in `neutral-dark` and `neutral` with the Workspace fonts and two patches per kind (the Parts `bar-package` and `border-dashed`) |
| `system.dg` | The nine packages with their modules (one per `src` file, with `source` pointing at the file; `dev-ui/browser` grouped by feature), actors, artifacts (including the Activity log), processes and external libraries. Module titles carry the package or the feature (`theme/style`, `editor/saving`) to tell homonyms apart |
| `connections.dg` | Dependencies between packages (from `package.json`) and between modules: inside a package, all imports; across packages, only the seams that explain the map. Plus the data flow with actors, dev server, SSE and Worker. Edges are only declared in `model`, with qualified ids |
| `views.dg` | A packages View with drill-down into each package, the `open` View (render and layout expanded; the `open` View of the approved prototype), one detail per package (`*-detail`, including `dev-ui-detail`) and five flow Views with Steps: `flow-edit` (dragging a Node in the Dev UI), `flow-validate`, `flow-dev`, `flow-agent` (from the command to the Agent panel) and `flow-theme` |
| `canonical-form.dg` | The Canonical form as an ER schema (View `canonical-er`, with Steps) and two Interactions with a sequence View: `edit-pin` (from the drag to the write, `/api/edit` and the live Workspace, with the 409; `alt` Fragment, `ref`, Notes, Steps and `link` to `session-detail`, `shell-detail` and `dev-ui-detail`) and `recompile` (Session, Diff and change classification) |
| `themes/` | The approved Themes and, in `themes/fonts/`, their families as `woff2` with `OFL-<family>.txt` licenses. It is the only copy: the gallery uses them with `--theme-path` |
| `theme-views.dg` | One `open-<theme>` View per Theme: the same diagram as the `open` View with each aesthetic. Their screenshots are in the [gallery](../../docs/gallery.md) |
| `fonts/` | DejaVu Sans and Mono (license in `LICENSE-DejaVu.txt`) |

## Usage

```
node packages/cli/dist/bin.js validate --workspace examples/rinthel-arch
node packages/cli/dist/bin.js build    --workspace examples/rinthel-arch
node packages/cli/dist/bin.js dev      --workspace examples/rinthel-arch
```

To regenerate the screenshots in `docs/img/`: `pnpm docs:capturas`. To see a View with another Theme without touching the example (needs `pnpm build`):

```
pnpm capturas --workspace examples/rinthel-arch --vista open --prototipo A neutral neutral-dark
```

The output goes to `examples/rinthel-arch/.diagrams/` (ignored by git). `dev` serves the live preview on 127.0.0.1; navigate with the drill-down links.

## Remaining limitations

- Edges cannot be declared inside a Node block: use the full qualified id in `model`.
- An Edge label lifted by a collapsed Group is kept only if it is the only one between that pair; if several are merged, it is lost.
