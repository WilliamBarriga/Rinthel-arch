# ADR index

One ADR per module or contract decision. Read the module's ADR before changing its interface. Numbers are never reused or renumbered. `pnpm check` fails if an `NNNN-*.md` file in this folder does not appear here.

Statuses: current (applies as is), rewritten (another ADR replaces it and the file keeps only what does not change), absorbed (the content lives in another ADR and there is no own file).

| ADR | Topic | Status |
| --- | --- | --- |
| [`0001-dsl-editable-source.md`](0001-dsl-editable-source.md) | Text DSL as the only editable source | current |
| [`0002-render-theme-and-reveal.md`](0002-render-theme-and-reveal.md) | Pure render contract, Palette, icons and reveal Steps (amendment: Steps without continuous visibility) | rewritten by 0008 |
| [`0003-elk-layout-cached-geometry.md`](0003-elk-layout-cached-geometry.md) | Layout with ELK and cached geometry (amendments: no `considerModelOrder`, benchmark thresholds, Pins in the cache key, moving a Pin does not relayout, Pin at the center, Worker with validated data and a 1 MiB limit) | current |
| [`0004-pnpm-monorepo-and-packages.md`](0004-pnpm-monorepo-and-packages.md) | pnpm monorepo, packages and independence from consumers (amendments: packages `session`, `theme` and `dev-ui`, `dev` protocol with a single owner, Live workspace and `/api/*` routes in `session`, subpath `dev-ui/build`) | current |
| [`0005-cli-for-agents.md`](0005-cli-for-agents.md) | CLI: `validate`, `dev`/`inspect` and `edit` (amendments: Themes in the CLI, Activity log, `set-theme`) | current |
| `0006` (no file) | Metrics and Resolved style | absorbed into 0008 |
| [`0007-interaction-and-edit-protocol.md`](0007-interaction-and-edit-protocol.md) | Intents, pure reducer and history (amendments: `pin` at the Node center, Undo history against external writes and the text editor, UI routes and writes, `handleDevApi` with a full response and Component bundle, visible history, bulk fix and jump) | current |
| [`0008-expressive-theme-system.md`](0008-expressive-theme-system.md) | Expressive Themes: Layers, hybrid render and animation | current |
| [`0009-sequence-and-er-diagram-types.md`](0009-sequence-and-er-diagram-types.md) | Sequence and ER Diagram types: Interaction, ER marks, Theme elements and per-type Geometry | current |
| [`0010-codebase-importer.md`](0010-codebase-importer.md) | Codebase importer: Scanner outside the core, `diagrams scan` and the `rinthel/scan@1` Scan draft | current |
| [`0011-planned-mark.md`](0011-planned-mark.md) | Planned mark (`planned`) for Blueprints from a PRD, `planned` Theme state and transition to real code | current |

## The 0006 gap

0006 has no file: its content (Metrics and Resolved style) is in 0008. The interaction ADR is 0007.
