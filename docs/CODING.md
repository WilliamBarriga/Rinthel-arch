# Coding rules

Design vocabulary: **Module**, **Interface**, **Seam**, **Adapter**, **Depth** (skill `codebase-design`). Domain vocabulary: `CONTEXT.md`. Contract decisions per module: `docs/adr/`.

## Structure

Monorepo with workspaces. One package in `packages/` per deep module (canonico, tema, dsl, layout, sesion, render, shell, estudio, cli, scanner). The module's interface is the package: whatever does not leave through the `exports` of its `package.json` is private. `exports` declares only `.`; the only exception is `estudio`, with `./protocolo` (types of the `dev` protocol that `cli` imports without loading the app), `./contrato` (test-only contract suite) and `./construir` (builds the app bundle; used by its build and the bench). A package is imported by its name; internal files of another package are not imported.

## Deep modules

- Small interface (few functions and types), a lot of behavior behind it.
- The interface includes invariants, call order, error modes and required configuration. The header of `index.ts` summarizes it in a few lines (interface, invariants, error modes, dependencies); the detail of each export lives in its TSDoc and user options in `docs/guide/`.
- Deletion test: if deleting the module makes the complexity disappear, it was a pass-through; merge it into its caller.
- Internal pieces may be small and replaceable; only what crosses the seam counts as interface.

## Hexagonal where there is real variation

- **Pure core**: DSL compiler, Model, Views, validation, Pin, render. No I/O, no clock, no global state.
- **Ports**: interfaces the core defines according to what it needs. **Adapters**: file system, ELK, d3-zoom, Web Worker, CLI; they live at the edge and depend on the core, never the other way around.
- A seam exists when something varies across it: one adapter is a hypothetical seam, two is a real one. With a single adapter, a direct call.
- Dependencies come in as arguments; functions return results instead of mutating.
- Dependency direction: `canonico -> tema -> dsl -> layout -> sesion -> render -> shell -> estudio -> cli`. A package only imports from the earlier ones. `tema` comes after `canonico` because it reuses its `Issue` and codes, and before `dsl` because the Theme compiler validates against its catalog (ADR 0004, amendment).
- `scanner` sits outside the chain (ADR 0010): it imports no workspace package and only `cli` imports it (`AISLADOS` in `scripts/check-dependencies.ts`).
- The core is agnostic of the Documented project (see `AGENTS.md`).

## Tests

- The interface is the test surface: tests and callers cross the same seam.
- Observable inputs and outputs. An internal refactor leaves every test green.
- In-memory fakes (cheap real adapters) before mocks; mock only for I/O that cannot be simulated.
- Compiler: DSL text goes in, Canonical form comes out; compare against the public output.
- Client-server protocol: the fake sits on the transport, not on the domain. `devEnMemoria` (`estudio/contrato`) is the real Live workspace of `sesion` (with `atenderApiDeDev`, the same routes as `dev`) over `puertoEnMemoria`; only HTTP and SSE are fake. The app receives `fetch` and the injected event factory (no `EventSource` polyfills nor MSW) and network errors are injected by wrapping `fetch`.
- Contract shared between fake and real: one suite (`probarContratoDeDev(crear)`) runs against the fake in the package that defines it and against the real adapter in the one that implements it. A new route enters the contract, the fake and the real one at the same time.
- User interface: query by role and accessible name (it also tests accessibility), never components or internal state; wait with `findBy*`/`waitFor` and time (debounce, notices) with fake timers. Islands and components are not seams: they are tested through the app mounted in jsdom. Exception, only where there is no role to query: the canvas (`data-id`, `data-vista`, `data-layout`, `data-part` of the drawn Parts, the drawing's `--rd-*` variables and what the test Theme component draws, `data-aurora` from `BUNDLE_DE_PRUEBA`; `lienzoListo` from `packages/estudio/test/ayudas-de-ui.tsx`; the canvas pointer helpers, such as `pulsarNodo`, have a single copy in `tests/ayudas/lienzo.ts`, which package tests import by relative path, like the fake clock and the Activity events of `tests/ayudas/reloj.ts` and `tests/ayudas/actividad.ts`) and the CodeMirror decorations (`cm-*` classes and the marks the editor puts on its lines); a chrome state attribute (`data-arrastrando`) is searched as an ancestor of an element queried by role.
- A single end-to-end in a real browser, inside `pnpm test` (`packages/cli/test/e2e-estudio.test.ts`): real `dev`, Playwright's headless Chromium, locators and a 60 s deadline. It covers only what jsdom cannot (disk writes, CodeMirror, scroll, drags); the rest goes to jsdom. It finds Chromium with `tests/ayudas/chromium.ts` (shared test helper at the root), the same helper as `pnpm capturas` and `pnpm docs:capturas`; without Chromium it fails asking for `pnpm exec playwright install chromium`. No automatic visual regression: the look is reviewed by hand with `pnpm docs:capturas` served from `localhost`.
- Derived documentation: what comes out of a schema is generated, not hand-written. `docs/theme-catalog.md` comes from the `tema` catalog (`pnpm docs:catalogo`); `tests/referencia-catalogo.test.ts` fails if it drifts. A new Primitive: an entry in the catalog, its painter and regenerating the reference.
- Test runner: Vitest. Package build: tsup. Manager: pnpm workspaces, no task orchestrator.

## Package README

`packages/<package>/README.md` is the package's front door: up to 25 lines (no blank line after each heading), with a one-line summary under the title `# <package>` and these `##` sections, in this order (the list lives in `SECCIONES_README` of `scripts/check-docs.ts`):

1. `What it does`: the package's capabilities, in a few lines.
2. `What it does not do`: what people look for here and lives in another package, with the owning package.
3. `Depends on`: workspace packages it imports (or "No workspace package").
4. `Entry file`: path of `index.ts` in backticks, relative to the repo root.
5. `Related ADR`: the ADR of the package's contract.
6. `Test`: `pnpm --filter <package> test`.

Model: `packages/canonico/README.md`. `pnpm check:docs` fails if a package has no README or if it loses a section, names a nonexistent entry file or does not give the `Test` command.

## Automatic checks

The dependency direction, internal imports between packages, the `exports` surface and core purity (`canonico`, `tema`, `dsl`, `sesion`, `render`: no `node:*`, clock, randomness, `process`, network or DOM; `layout`, `shell`, `estudio` and `cli` are adapters), that no file re-exports (`export ... from`) from another package except `estudio/protocolo` and the `shell` facade, and that `scripts/` and `bench/` use from packages only their name or what `exports` declares (never their `test/` or `scripts/` by path), are verified by `scripts/check-dependencies.ts` (`pnpm check:deps`); they are not repeated in review.
