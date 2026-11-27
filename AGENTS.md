# AGENTS.md - rinthel-arch

A React + TS system to write and render large, detailed diagrams of any project. The example in `examples/rinthel-arch/` documents this same repo; the system does not depend on any external project.

## Reading path

Before touching a package, in this order:

1. `CONTEXT.md`: the repo glossary. Use those exact terms (Model, View, Diagram type, Pin...).
2. `docs/CODING.md`: code rules.
3. The module's ADR, picked from the index `docs/adr/README.md`.
4. `packages/<package>/README.md`: what it does, what it does not do, entry file.

Tests of a single package: `pnpm --filter <package> test`.

## Sources of truth

- Decisions and pending work: GitHub Issues of this repo (`gh`, `WilliamBarriga/Rinthel-arch`); each ticket is an issue labelled `wayfinder:<type>`.
- Code rules (package structure, deep modules, hexagonal, tests): `docs/CODING.md`.
- Research: index with one conclusion per branch in `docs/research-branches.md`; `research/<name>.md` lives on `research/<name>` branches, not on `main`; list them with `git branch -a -l '*research/*'` and read the file with `git show research/<name>:research/<name>.md` before researching again.
- User guides (README, `docs/guide/` with its Spanish pair `docs/guia/`, `CONTRIBUTING.md`; the pair rule is in CONTRIBUTING): when changing the DSL, an example Theme, the CLI or the Dev UI (`packages/estudio`), update them; `pnpm docs:capturas` regenerates the images in `docs/img/`.
- Contract ADRs: index in `docs/adr/README.md`. Read the module's ADR before changing its interface.
- Theme catalog (Primitives, Slots, Motions, Effects with ranges and defaults): `docs/theme-catalog.md`, generated from `packages/tema` with `pnpm docs:catalogo`; do not edit it by hand (a test fails if it drifts).

## Repo skills

`skills/` (`SKILL.md` format, harness-agnostic): `rinthel-diagramas` (write, validate and serve `.dg`) and `rinthel-temas` (customize the look). Load them before editing a Workspace or a Theme. CLI options: `docs/guide/cli.md` or `diagrams <command> --help`.

## Dependencies and technology

Before adopting a dependency, research it (license, maintenance, fit with the requirements) and write the research down; adoption is decided in a ticket or ADR.

## Conventions

- The core is agnostic of the documented project; everything specific to a project lives as an example or use case.
- This repo is independent: it does not depend on any consumer repo. Integrating the system into a consumer repo (slides, video or other) is that repo's work, outside this one. Slides, video and the rest are use cases of the `render` contract.
- Eraser DSL and Archify are discarded; do not reintroduce them.
- Language: the whole repo is written in English (code, docs, commit messages, CLI messages). Spanish is secondary and lives only in `README.es.md` and the Spanish guides (`docs/guia/`); touching a guide means touching its pair in the other language. Identifiers in a new file follow the language of its host package until the internal migration (see CONTRIBUTING). Answer the user in Spanish. No unicode emojis (`pnpm check:emojis` verifies it).

## Verification

- Iterate with `pnpm check` (typecheck, lint, package order, docs template, emojis); the pre-commit hook runs it. `pnpm test` is the full gate (build + tests).
- There is no CI: everything is tested locally. Do not add GitHub Actions workflows.
- Wait for long processes with Monitor, not with `sleep`.
- Any HTML meant for the user (reports, previews, exports) is served from a small local server (e.g. `python3 -m http.server` in the file's folder, or `dev`) and handed over as the URL `http://localhost:<port>/...`. Firefox cannot see this disk, so `xdg-open` on a file or a `file://` path does not work.
- One ticket per subagent: load the `tdd` skill first (it is not pinned in the repo; put it in the prompt).
