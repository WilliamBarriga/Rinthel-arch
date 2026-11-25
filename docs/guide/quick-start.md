[Leer en espanol](../guia/quick-start.md)

# Quick start

## Requirements

- Node 20 or later.
- pnpm.
- For `pnpm test` and to regenerate the documentation screenshots: Chromium, from the Playwright cache (`pnpm exec playwright install chromium`) or via `CHROMIUM_PATH`.

## Install the skills in your agent

A single `skills/` tree (`rinthel-diagramas` and `rinthel-temas`) serves four agents, each with its own thin manifest (formats follow each agent's official documentation, checked on 2026-11-24).

| Agent | Install | Notes |
| --- | --- | --- |
| Claude Code | `claude plugin install rinthel-arch --marketplace WilliamBarriga/Rinthel-arch` | Needs Claude Code 2.1.292 or later. In a session: `/plugin install rinthel-arch --marketplace WilliamBarriga/Rinthel-arch`. The skills become `/rinthel-arch:rinthel-diagramas` and `/rinthel-arch:rinthel-temas` |
| Codex | `codex plugin marketplace add WilliamBarriga/Rinthel-arch` | Then install `rinthel-arch` from the Plugins directory and open a new session. Alternative without a plugin: copy `skills/*` to `~/.agents/skills/` |
| OpenCode | `npx skills add WilliamBarriga/Rinthel-arch -a opencode -g` | OpenCode has no plugin format for skills: it reads `~/.config/opencode/skills`, `~/.claude/skills` and `~/.agents/skills`. Copying `skills/*` by hand also works |
| Pi | `pi install npm:rinthel-arch` | The npm package declares `pi.skills` and the `pi-package` keyword. With `--local` it writes to the project's `.pi/settings.json` |

The CLI does not travel with the plugin: the skills use `diagrams` if it is on the `PATH` and otherwise `npx -y -p rinthel-arch@<version> diagrams`. To have it installed: `npm i -g rinthel-arch` (commands `diagrams` and `rinthel-arch`). Do not run the bare name `diagrams` with npx: that name on npm belongs to another package.

## Install and build from source

To work on the repo itself (or to run the examples), use a clone:

```
git clone https://github.com/WilliamBarriga/Rinthel-arch.git
cd Rinthel-arch
pnpm install
pnpm build
```

The CLI ends up at `packages/cli/dist/bin.js`. In this guide we shorten it to `dg`:

```
alias dg="node $PWD/packages/cli/dist/bin.js"
```

## The concepts in one minute

A **Workspace** is a folder of `.dg` files. They all merge into a single **Model** (the Nodes and Edges of your project). A **View** chooses which part of the Model is drawn and of which **Diagram type** (`architecture`, `flow`, `sequence` or `er`). A **Theme** decides how it looks. The full vocabulary is in [CONTEXT.md](../../CONTEXT.md).

A `.dg` file has up to five kinds of block:

| Block | Purpose |
| --- | --- |
| `specification` | Declares the Node kinds (icon and color) |
| `model` | Declares the Nodes and Edges |
| `view` | Chooses what to show and with which Theme |
| `theme` | Defines an aesthetic (Palette, fonts, Layers) |
| `part` | Reusable piece of a Theme |

## The commands

Each one is detailed in the [CLI guide](cli.md), or `dg <command> --help`. All of them require `--workspace <path>`.

| Command | What it does |
| --- | --- |
| `dg validate --workspace <path>` | Compiles and validates; lists errors and warnings with file and line. `--json` gives the same result, structured |
| `dg build --workspace <path>` | Writes the canonical source and the geometry to `<path>/.diagrams/` (not versioned) |
| `dg dev --workspace <path>` | Live UI at `http://127.0.0.1:4173/` ([Dev UI](dev-ui.md)); rebuilds on save |
| `dg inspect search <text>`<br>`dg inspect node <id>`<br>`dg inspect view <id>`<br>`dg inspect interaction <id>`<br>`dg inspect theme <name>` | Read-only queries over the Model, with `file:line` |
| `dg edit` | Writes to the `.dg`: sets a Pin (`--view <id> --node <id> --x N --y N`) or applies an Intent (`--intent '<json>'`, e.g. `reorder-lifelines` in a sequence) or structured edits (`--edits '<json>'`, for example the `fix` of `validate`). It is what the viewer uses when you drag a Node |
| `dg skill` | Prints a skill (Markdown) so an agent can write and fix `.dg` with the inspect, edit, validate loop |

In the UI, the View is chosen in the Views panel or with the URL hash (`#vista=<id>`), and drill-down links and breadcrumbs navigate between Views. Dragging a Node sets its Pin and rewrites the `.dg` file.

## Walk through the examples

```
dg dev --workspace examples/tutorial/step-2      # the small diagram of the tutorial
dg dev --workspace examples/rinthel-arch         # this repo documented, with its example Themes
dg dev --workspace examples/themes/gallery --theme-path examples/rinthel-arch/themes        # a common Model with the example Themes and the states of each Node
```

In `examples/rinthel-arch` (regenerated with `dg scan`) try the `context` View and click `estudio` or `scanner` (drill-down), or open an `open-<theme>` View. The `flow-dev` View is of type `flow`: advance its Steps to see how the diagram is revealed; `tables` is `er` and `export-sequence` is `sequence`.

## Sequence and ER in one minute

The same Model is drawn as a sequence or as tables by changing the View `type`. An **Interaction** (`interaction`) is an ordered scenario between Model Nodes, and Attributes with `pk`, `fk` and `uk` make tables:

```dg
specification {
  node service  { icon server   color blue }
  node store    { icon database color green }
}

model {
  service api "API"
  store orders "Orders" { id: uuid pk  total: decimal }
  interaction place-order { api -> orders "insert"  reply orders -> api "ok" }
}

view order-flow { type sequence  interaction place-order }
view order-tables { type er  include orders }
```

`dg dev` opens the sequence View with `#vista=order-flow`. More in [step 6 of the tutorial](tutorial.md#step-6-optional-sequence-and-er).

## Next

- [Tutorial](tutorial.md): your first diagram, from zero to customized.
- [Customizing with Themes](themes.md).
- [DSL reference](dsl-reference.md).
