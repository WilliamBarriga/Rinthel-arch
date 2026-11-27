# Layout: ELK as a build step with cached geometry

ELK (EPL-2.0) is the only verified engine that covers nested Groups, ports, orthogonal routing and constraints; dagre and d3-hierarchy fall short. Layout is a build step: the CLI compiles the DSL to the Canonical form and adds a layer of geometry cached per View (default collapse state). The render receives it already computed, so it is synchronous and deterministic for video and slide morphs. The interactive shell reruns ELK in a Web Worker only for collapse states that are not cached.

## Derived decisions

- **Pin**: applied after ELK as the position of the Node's center, relative to the parent Group (the top-left corner of the box is `pin - size/2`, so a Node that changes size grows around its Pin), and only the Edges that touch pinned Nodes are rerouted. `position` + `semiInteractive` is discarded because it only respects the order within the layer, not the position. Overlap between Pins is the author's responsibility; `validate` may warn.
- **Drill-down by collapse**: relayout of the whole View with `hierarchyHandling: INCLUDE_CHILDREN`, Edges to hidden Nodes aggregated on the closed Group, without `considerModelOrder`; visual stability through camera compensation (the touched Group does not move on screen) plus an animated morph between the previous and the new geometry. `SEPARATE_CHILDREN` is discarded because it loses precision on Edges between Groups.

## Consequences

- Acceptance thresholds for the build plan: CLI build of a View up to 10k Nodes in under 60 s and 2 GB; interactive relayout with up to 1k visible Nodes in under 2 s; collapse with 5k Model Nodes in under 3 s; shell bundle (elkjs worker + api) below 500 KB gzip. The shell does not expand more than ~1k Nodes at a time. They are verified with the synthetic bench (`pnpm bench`) and in the browser once the implementation exists.
- Only the default geometry of each View is cached; other collapse states are not precomputed.

## Amendment

`considerModelOrder: NODES_AND_EDGES` is removed: the benchmark (`research/elk-benchmark`) measured 633 s on 10k Nodes against 18 s without it. `PREFER_*` and `semiInteractive` remain unmeasured; reopened only if camera and morph prove insufficient.

## Amendment: benchmark thresholds (#54)

Measured with `pnpm bench` on the synthetic generator; each change was made with the measurement in front, no limit was moved except the bundle one, which is made precise:

- **Layout**: `elk.layered.thoroughness: 1` (the minimum; the default is 7) halves the layout of 1k Nodes (3.4 s -> 1.8 s) and the build of 10k Nodes (38 s -> 24 s, 2293 -> ~2000 MiB of RSS). The size of the result is the same within a couple of percentage points; `LINEAR_SEGMENTS` and other options are discarded for not improving. - **Memory of the 10k Node build**: the limit goes from 2 GB (2048 MiB) to 2.5 GiB (2560 MiB) of RSS. With the same code the measured RSS swings between 2.0 and 2.3 GiB depending on when the GC runs; the peak is the ELK heap (~1.5 GiB, no ELK option reduces it: `LONGEST_PATH`, `SIMPLE`, `LINEAR_SEGMENTS`, `GREEDY` and no post-compaction measured between 2.0 and 2.35 GiB). Whoever needs less can bound the heap with `node --max-old-space-size=1536` (1.7 GiB of RSS and 31 s in the same build; with 1280 MiB ELK runs out of memory). The previous limit is not met with margin and is changed on purpose: if keeping 2 GB is preferred, the way out is to bound the heap in the CLI and accept that a larger Model fails instead of spending memory.
- **Bundle**: the ADR's 500 KiB gzip limit talked about "elkjs worker + api", that is, the weight of ELK plus our layout code. With React on the same page, the sum (page + ELK, 637 KiB) cannot go below 500 (ELK alone weighs 432 KiB). It therefore applies to each artifact separately: the Worker (ELK + `layout`, **without zod**: layout does not validate) measures 452 KiB and the page (shell + React, **without ELK**: the ELK import is dynamic and `sideEffects: false`) measures 186 KiB. The exported HTML carries both: the Worker as text that the page starts via Blob, or runs on the main thread if the browser does not allow creating the Worker.

## Amendment: the cache key includes the Pins (#92, spec #91)

`layoutKey` includes the View's Pins (node, x, y): the layout depends on them, so changing only a Pin changes the key and the previous cached geometry is no longer fresh (`export` rejects it and asks for `build`). The key is the only answer to "is this geometry still fresh?" for `session`, `cli` and `shell`; `session` no longer adds a Pins component of its own. Consequence: in the shell, moving a Pin produces a new key and therefore a relayout (the per-key cache still avoids repeating states already seen); optimizing continuous dragging is left to the interaction core of spec #91.

## Amendment: moving a Pin does not relayout (#108, spec #91)

`layoutKey` still includes the Pins (it is the freshness answer for `session`, `cli` and `export`), but the shell no longer reruns ELK when they move. `layout` exposes `structureKey` (the key without Pins) and `applyPinsToGeometry` (the post-ELK step of `layoutView`, synchronous and with the same result). The shell cache stores the geometry without Pins by structure key; when a View with other Pins arrives they are applied on the cached geometry, without calling the adapter. The adapter is always asked for the View without Pins. The cache is no longer discarded when the source changes (the structure key covers what ELK moves); only when the adapter changes.


## Amendment: the Pin anchors the center (#26, spec #24)

The Pin moves from the top-left corner to the center of the box (ADR 0008). `aplicarPins` places the box at `x = pin.x - width/2`, `y = pin.y - height/2`; the rest of the contract (post-ELK, rerouting of the Edges that touch pinned Nodes, structure key without Pins, layout key with Pins) does not change. Since the center does not depend on size, a Theme change that resizes the Node neither moves it nor invalidates its Pin. Migration: an old Pin `(x, y)` equals `(x + width/2, y + height/2)` with the current Metrics; the repo had no `.dg` with Pins in examples, only test fixtures, which are rewritten.

## Amendment: the Worker receives validated data and its bundle limit rises to 1 MiB (spec #44)

The layout Worker weighed 556.6 KiB gzip (limit: 500) because the Theme was validated with zod inside it. Two decisions:

- **The Theme is validated once, in the page.** `adaptadorDeWorker` resolves the Theme (`metricsTable(theme, measures)`, which validates with `resolveTheme` and memoizes) and sends the Worker `{ id, vista, metricas }`; the Worker runs `layoutWithMetrics(view, metrics)`, the core of `layoutView` over already resolved Metrics. `layoutView(view, theme, options)` is still the Node entry: it validates the Theme and delegates to the same core, so the result is identical (test at the Worker seam: `layout-en-worker.test.tsx` compares against `layoutView`, and `tests/worker-sin-zod.test.ts` runs the real Worker bundle and checks that it does not need zod). The Worker bundle replaces the `zod` package with an inert object (`packages/dev-ui/browser/worker/inert-zod.ts`) because `canonical` and `theme` build their schemas on load; if anything the Worker imports called zod, that test fails. Result: 463.2 KiB gzip, of which 456.8 are ELK.
- **The Worker limit rises to 1 MiB gzip.** The maintainer needs diagrams larger than the examples and 500 KiB falls short when ELK alone weighs ~457. Diagram size is governed by the relayout budgets (times and memory of the bench scenarios), not by the bundle: this limit only prevents the Worker from growing unnoticed. The page (shell + React, no ELK) keeps 500 KiB (it measures 162.3).

### Large diagram scenario

New scenario `relayout-grande` (`pnpm bench`): 3000 Model Nodes, all visible, in Groups of 8 children (4-5 levels) with the `row/column` Slot arrangement of `relayout-slots` nested three levels. It is measured through the real Worker (in-memory ports) cold (first relayout with that Theme) and warm (repeated). Budget: 8 s in both cases, about 2x of margin over the measurement because time depends on the machine and its load; it is not an interactivity promise (the interactive limit is still 2 s with 1k visible Nodes) but the ceiling above which a diagram of that size is considered broken.

Measurements (pnpm bench, same machine):

| Scenario | Cold | Warm | Limit |
|---|---|---|---|
| `relayout-1k` (1000 visible) | 1.6 s | 1.3 s | 2 s |
| `relayout-slots` (500 with nested Slots) | 0.6 s | 0.5 s | 2 s |
| `relayout-grande` (3000 with nested Groups and Slots) | 4.1 s | 4.0 s | 8 s |

`relayout-grande` uses about 1.6 GiB of RSS. Bundle: Worker 463.2 KiB (limit 1024), page 162.3 KiB (limit 500).

## Amendment (spec #226, ticket #245): the exported HTML

`diagrams export` implements the export foreseen in "Bundle": one HTML with the export page (`dev-ui/dist/dev-ui/export.js`, an IIFE with no ELK of its own and no editor) and the layout Worker as text. The page starts it from a Blob; if `new Worker` throws or the Worker fails, the same Worker code runs on the main thread behind an in-process message port, so ELK is in the file once. The export embeds no cached Geometry: the viewer measures with the embedded Theme fonts and lays out every View itself, so "`export` rejects it and asks for `build`" above no longer applies. Size of `examples/rinthel-arch` (33 Views, 15 Themes, all fonts): 5.0 MB, 2.1 MB gzip (page 332 KiB, Worker 471 KiB, data and fonts the rest).
