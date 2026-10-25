# rinthel-arch

A React + TypeScript system for writing and rendering large, detailed diagrams of any project. You describe your system once in text (`.dg`) and get several navigable Views, styled however you choose: the same diagram can look like sober cards, neon, a technical blueprint, sticky notes or a circuit board, by changing only the Theme.

![The same diagram with the synthwave Theme](docs/img/temas/synthwave.png)

## Highlights

- **One Model, many Views.** Nodes, Edges and Attributes are written once; each View picks what to show and can link to another (drill-down) or reveal itself step by step.
- **Aesthetics are a Theme.** A Theme is text: a Palette, fonts and a stack of Layers per element, drawn from a closed catalog (shapes, fills, borders, shadows, glow, glass, strokes, markers, animations). 14 example Themes ship with the repo.
- **Live viewer.** `dev` rebuilds on save; the viewer has pan and zoom, Group collapse, and node dragging that rewrites the `.dg`.
- **Built for humans and agents.** `validate` returns structured issues with suggestions, `inspect` queries the Model, `skill` explains the workflow to an agent.

## Getting started

Requires Node 20+ and pnpm. Not published on npm yet: use it from a clone.

```
git clone https://github.com/WilliamBarriga/Rinthel-arch.git
cd Rinthel-arch
pnpm install
pnpm build
node packages/cli/dist/bin.js dev --workspace examples/rinthel-arch
```

Open the URL `dev` prints (`http://127.0.0.1:4173/`).

## Status and documentation

Version 0.x: the DSL and package contracts may change. Supports `architecture` and `flow` diagram types.

The documentation is in Spanish for now. Start with the [Spanish README](README.md), the [tutorial](docs/guia/tutorial.md) and the [DSL reference](docs/guia/referencia-dsl.md); the code, CLI output and examples are usable regardless. Issues in English are welcome.

Licensed under [MIT](LICENSE).
