# Contributing to rinthel-arch

Thanks for your interest. This file says where to start; the detail is in the linked documents.

## Before writing code

Follow the reading path in [AGENTS.md](AGENTS.md#camino-de-lectura): glossary, code rules, the module's ADR and the package README. To test a single package: `pnpm --filter <package> test`.

- Vocabulary: [CONTEXT.md](CONTEXT.md). Use those exact terms (Model, View, Theme, Pin...) in code, docs and messages.
- Code rules (package structure, deep modules, hexagonal architecture, tests): [docs/CODING.md](docs/CODING.md).
- Decisions: the [ADR index](docs/adr/README.md). Read the module's ADR before changing its interface.
- Pending work: the [issues](https://github.com/WilliamBarriga/Rinthel-arch/issues). Open one before a large contribution.

## Environment

```
pnpm install
pnpm exec playwright install chromium   # once: used by the end-to-end part of pnpm test and by pnpm docs:capturas
pnpm check   # typecheck, lint, package order, docs and emojis: fast, for iterating
pnpm test    # full gate: build, typecheck and all the tests
```

There is no CI: tests run locally. The pre-commit hook runs `pnpm check`.

## Conventions

- The core is agnostic of the documented project: whatever is project-specific goes as an example in `examples/`.
- The whole repo is in English (code, docs, messages, commits), without unicode emojis (`pnpm check:emojis` verifies it). Spanish only lives in `README.es.md` and the Spanish user guides.
- Identifiers in a new file follow the language of its host package until the internal migration (#253-#257); comments in new code are always English.
- Before adopting a new dependency, research it (license, maintenance, fit) and leave the research written; adoption is decided in an issue or ADR.

### User guides come in pairs

The English guides in `docs/guide/` are the source; the Spanish guides in `docs/guia/` are their translation. Both folders use the same file name (`docs/guide/cli.md` pairs with `docs/guia/cli.md`) and the first line of each file links to its pair (a "Leer en espanol" link to `../guia/cli.md` and a "Read in English" link to `../guide/cli.md`).

The rule: touching a guide means touching its pair. `pnpm check` fails if a guide lacks its pair, if the first line does not link to it, if the two differ in the number of `##` headings, or if their fenced code blocks are not identical (so code, commands and DSL examples stay in English in both). Screenshots in `docs/img/` are English and are shared by both languages. To add a guide, create both files in the same change.

### Generated files and screenshots

- `docs/theme-catalog.md` is generated with `pnpm docs:catalogo`; do not edit it by hand.
- The screenshots in `docs/img/` are regenerated with `pnpm docs:capturas` (needs `pnpm build` and Chromium) when a Theme, an example or the `dev` UI changes.

## Repo map

| Path | Contents |
| --- | --- |
| `packages/canonical` | Schema of the canonical source (Zod), validation, View resolution and versioned contracts (Intents, `--json`, Activity event, `dev` protocol) |
| `packages/theme` | Catalog of Primitives and Slots, resolved Style and Metrics |
| `packages/dsl` | Grammar (Langium) and compiler of the `.dg` text |
| `packages/layout` | Layout with ELK and Pins; cached geometry |
| `packages/session` | Shared pipeline: compile, validate, compute geometry and edit the text; the live Workspace of `dev` without transport |
| `packages/render` | Pure drawing in React (Nodes and Groups in HTML/CSS, Edges in SVG) |
| `packages/shell` | Interactive viewer: pan/zoom, collapse, drag |
| `packages/dev-ui` | Browser app of `dev` (the [Dev UI](docs/guide/dev-ui.md)): canvas, editor, Issues, Themes, file History and agent feed |
| `packages/cli` | `validate`, `build`, `dev`, `inspect`, `edit`, `skill`, `scan`, `export`; the only package that touches disk and the `dev` server |
| `packages/scanner` | Scanner: reads a codebase, without running it, into a Scan draft; outside the core, only `cli` imports it |
| `npm` | The publishable `rinthel-arch` npm package: manifest and README; `pnpm npm:package` fills `dist/`, the licenses and the third-party notice |
| `examples/tutorial` | The tutorial, one Workspace per step |
| `examples/rinthel-arch` | This repo as a Workspace, regenerated from `diagrams scan` with the skill; the Example Themes and the live demo |
| `examples/themes` | Loose sample Themes (shape catalog, `code` Layer, sequence, ER) |
| `examples/themes/gallery` | A common Model for the example Themes (from `examples/rinthel-arch/themes`, via `--theme-path`), and the states of each Node |

## npm package

`rinthel-arch` on npm is one package that bundles the whole CLI (`npm/`, outside the pnpm workspace). After `pnpm build`, `pnpm npm:package` writes `npm/dist/` (the esbuild bundle `bin.js`, the Dev UI assets in `dev-ui/` and the Scanner's `.wasm`), `LICENSE`, `LICENSE-LIKEC4` and `THIRD-PARTY-NOTICES.md` (generated from `pnpm licenses list`); then `npm pack` in `npm/` builds the tarball. `tests/npm-package.test.ts`, part of `pnpm test`, packs it, installs it in an empty folder and runs `validate`, `scan` and `dev`. elkjs is redistributed under EPL-2.0: the notice carries its license text and where to get its source. Publishing is manual, with interactive 2FA, and not part of any test.

## Live demo

The demo at https://williambarriga.github.io/Rinthel-arch/ is `examples/rinthel-arch` exported with `diagrams export` and served by GitHub Pages from the orphan branch `gh-pages` ("Deploy from a branch", `gh-pages`, `/ (root)`). There is no workflow file: GitHub runs its own deployment when the branch changes. `pnpm demo:publish` builds the repo, exports the Workspace, commits `index.html` and an empty `.nojekyll` to `gh-pages` with git plumbing (the checked-out branch and working tree stay untouched) and pushes it to `origin`. `pnpm demo:publish --dry-run` does the same without pushing (then `git push origin gh-pages` publishes it); `--skip-build` reuses the current build. A run with the same export adds no commit. Refresh the Workspace from code first (skill `rinthel-diagramas`, "Refresh from code": `diagrams scan . --workspace examples/rinthel-arch`).

## Research and prototype branches

The `research/*` branches hold investigations (one `research/<name>.md` file per branch) and `prototype/*` holds the prototypes that grounded decisions. They are context material: they are not merged into `main`. The index with one conclusion per branch is [docs/research-branches.md](docs/research-branches.md). List the research ones with `git branch -a -l '*research/*'` and read one with `git show research/<name>:research/<name>.md`.

## Agents

`AGENTS.md` and `CLAUDE.md` describe the repo for coding agents; `skills/` ships the `rinthel-diagramas` and `rinthel-temas` skills. If you contribute with an agent, start there.
