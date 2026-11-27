# rinthel-arch map (use case)

This repo as a Workspace: the system documents itself. It is regenerated from code: `diagrams scan .` writes the Scan draft and an agent following the skill `rinthel-diagramas` ("Import from code") writes the `.dg` files, so every Node of the repo cites its scan unit with a Source `path` ref. It is not part of the core: it serves as an end-to-end test (validate, build, dev, export) and as the [live demo](https://williambarriga.github.io/Rinthel-arch/).

## Contents

| File | What it maps |
| --- | --- |
| `specification.dg` | Node kinds (actor, package, app, artifact, module, table, external) and the Themes `diagrams` (dark) and `diagrams-light`: they extend the built-in `neutral-dark` and `neutral` with the Workspace fonts and two patches per kind (the Parts `bar-package` and `border-dashed`) |
| `model.dg` | The scan units as Nodes: the root Group `repo`, one Node per package (merging its `src` folders), the Scanner and the Dev UI as Groups with their folders, the externals that shape the system, and the dependencies as Edges (heaviest first, test folders and weight-1 imports left out). Two actors run the CLI |
| `architecture.dg` | The `context` View (sorts first, so the Dev UI and the demo open on it) with Drill-down into `dev-ui-detail` (then `browser-detail`) and `scanner-detail`, and the `open` View that the Theme gallery draws |
| `flows.dg` | Two `flow` Views with Steps: `flow-dev` (from the `.dg` files to the canvas) and `flow-scan` (what `diagrams scan` reads) |
| `tables.dg` | The tables the scan found (the Scanner's test fixture: Prisma and SQL) and their `er` View `tables` |
| `sequence.dg` | The Interaction `export` and its `sequence` View `export-sequence`, with a `break` Fragment, a Note, Steps and a `link` to `dev-ui-detail` |
| `theme-views.dg` | One `open-<theme>` View per Theme: the `open` View with each aesthetic. Their screenshots are in the [gallery](../../docs/galeria.md) |
| `themes/` | The approved Themes and, in `themes/fonts/`, their families as `woff2` with `OFL-<family>.txt` licenses. It is the only copy: the gallery uses them with `--theme-path` |
| `fonts/` | DejaVu Sans and Mono (license in `LICENSE-DejaVu.txt`) |

Left out on purpose, in `.rinthel/scan-ignore` at the repo root: the test folders and the other scanner fixtures.

## Usage

```
node packages/cli/dist/bin.js validate --workspace examples/rinthel-arch
node packages/cli/dist/bin.js dev      --workspace examples/rinthel-arch
node packages/cli/dist/bin.js scan .   --workspace examples/rinthel-arch   # what changed in the code since the Workspace
```

When `scan` reports uncovered units or orphan refs, refresh the Workspace with the skill (`skills/rinthel-diagramas`, "Refresh from code"). The derived output goes to `examples/rinthel-arch/.diagrams/` (ignored by git).

To see a View with another Theme without touching the example (needs `pnpm build`):

```
pnpm screenshots --workspace examples/rinthel-arch --view open --prototype A neutral neutral-dark
```

## Live demo

`pnpm demo:publish` exports this Workspace and publishes it on the orphan `gh-pages` branch (see "Live demo" in [CONTRIBUTING](../../CONTRIBUTING.md#live-demo)); `pnpm demo:publish --dry-run` builds the branch locally without pushing.
