# DSL landscape for text-to-diagram (ticket t01)

Fetched 2026-10-03 from primary sources (official docs, repos). Items marked **UNVERIFIED** were not confirmed from a primary source in this pass. Fetch-tool summaries were partly unreliable (e.g. release dates), so versions/dates need a recheck.

## Recommendation (short)

- **Adopt LikeC4 as the DSL baseline and extend it** (fork/contribute) as first candidate. Keep our own Fuente canonica (JSON + schema) as the contract and treat LikeC4 DSL as one compiler front-end. It is the only candidate that natively covers model + multiple views + nested elements + drill-down + sequence + React + TS API + agent tooling under MIT.
- Writing a DSL from scratch is only justified if the canonical-source decision rejects LikeC4's model shape. If so, build on **Langium** (MIT, TS, AST types + LSP), not a hand-rolled parser.
- Mermaid / PlantUML / D2 / DOT: do not adopt as source; at most import/export targets.
- Eraser: discarded by the map (not researched).

## Comparison

| DSL | Arch | Sequence | Flow | Nested groups | Multiple views of one model | TS-reusable parser/AST | License | Verdict |
|---|---|---|---|---|---|---|---|---|
| LikeC4 | yes (C4-inspired, custom kinds) | yes (dynamic view, sequence variant, alt/opt/loop/par) | partial (dynamic views, steps) | yes (nested elements, FQN like `service.backend`) | yes (views = projections of one model; scoped views; view inheritance) | yes (TS monorepo; `@likec4/language-server`, `@likec4/core`, Model API, builder) | MIT | adopt + extend |
| Structurizr DSL | yes (C4 only) | dynamic views only | no | yes (system > container > component, nested deployment nodes) | yes (context, container, component, dynamic, deployment, filtered, custom) | no (Java) | **UNVERIFIED** | idea source, not adopt |
| D2 | yes (generic) | yes (sequence_diagram shape; groups need top-level actors) | yes (generic graph) | yes (containers) | partial (layers/scenarios/steps boards, no shared model) | no (Go) | MPL-2.0 | no |
| Mermaid | partial (architecture: `in` nests groups; C4 experimental, no auto-layout) | yes | yes | partial | no (one diagram per definition) | weak (`mermaid.parse` returns only diagramType; no AST) | MIT | export target only |
| PlantUML | yes (component/deployment) | yes (strongest) | yes (activity) | yes | no | no (Java, Graphviz for some) | multiple listed: GPL-3.0, LGPL-3.0, Apache-2.0, EPL-2.0, MIT | no |
| DOT (Graphviz) | graph only | no | yes | yes (clusters) | no | **UNVERIFIED** | **UNVERIFIED** | no; layout reference |

## Per-DSL notes

### LikeC4
- Elements have `kind` + name, nest with qualified names; description, technology, tags, links, metadata. https://likec4.dev/dsl/model/
- Views are "projections of the model"; `view of <element>` scoping; view inheritance; a scoped view becomes the default for its element and click navigates to it (drill-down). https://likec4.dev/dsl/views/
- Dynamic views: steps `A -> B`, `A <- B`, self-calls; sequence variant renders a classic sequence diagram (leaf elements only); experimental par/opt/loop/alt/try-catch blocks, nestable; step navigation between dynamic views. https://likec4.dev/dsl/views/dynamic/
- API: `LikeC4.fromWorkspace`, `LikeC4.fromSource(dsl)`; `LikeC4Model.Computed` (no layout) vs `Layouted` (positions/dimensions); Model Builder at `@likec4/core/builder`; `toDSL()` round-trip is "intentionally lossy" (comments, positions, formatting). https://likec4.dev/tooling/model-api/
- Embed via Vite plugin, React, Web Components; CLI generates React components; MIT. https://likec4.dev/
- Agents: official Agent Skills (`npx skills add https://likec4.dev/`) and MCP server (`likec4 mcp`, `@likec4/mcp`, 20+ tools). https://likec4.dev/tooling/ai-tools/
- Repo: MIT, TypeScript monorepo, ~5.8k stars, 6k+ commits, active. https://github.com/likec4/likec4 . Releases (latest seen v1.59.x): https://github.com/likec4/likec4/releases
- Gaps/risks: sequence variant only on leaf elements; flow blocks experimental; flowchart-style diagrams not first-class; model is C4-flavoured (our Tipo de diagrama set may need extension); lossy DSL round-trip; render/layout stack is its own (ties to render-stack ticket).

### Structurizr DSL
- Model: person, softwareSystem, container, component, deploymentEnvironment/nodes, custom elements. Views: system context, container, component, dynamic, deployment, plus landscape/filtered/custom/image. https://docs.structurizr.com/dsl/language
- Java (Maven `com.structurizr:structurizr-dsl`) + CLI; exports PlantUML, C4-PlantUML, Mermaid, WebSequenceDiagrams, static site, PNG/SVG. https://docs.structurizr.com/dsl
- Not TS-native; LikeC4 draws from it (https://github.com/likec4/likec4).

### D2
- Go, MPL-2.0 (confirmed): https://raw.githubusercontent.com/terrastruct/d2/master/LICENSE.txt . Engines Dagre (default), ELK, TALA; exports SVG/PNG/GIF/PDF/PPTX; ~25.6k stars. https://github.com/terrastruct/d2 , releases https://github.com/terrastruct/d2/releases
- Sequence: spans, groups, notes; groups reference only top-level actors; strict ordering. https://d2lang.com/tour/sequence-diagrams/
- Layers/scenarios/steps = multiple boards in one file, not projections of a shared model. https://d2lang.com/tour/composition/

### Mermaid
- MIT, ~90k stars, JS/TS, mixed jison/modern parsers. https://github.com/mermaid-js/mermaid ; releases show mermaid 12.x and separate `@mermaid-js/parser`: https://github.com/mermaid-js/mermaid/releases
- `mermaid.parse()` validates only, no AST. https://mermaid.js.org/config/usage.html
- Architecture diagram: `in` nests groups. https://mermaid.js.org/syntax/architecture.html
- C4: experimental, syntax may change, positions by statement order, no Lay_*, no sprites/tags/links/legend. https://mermaid.js.org/syntax/c4.html
- Value: ubiquity (GitHub render); export target only.

### PlantUML
- Java; sequence, component, deployment, activity...; Java 11+, Graphviz for some. https://plantuml.com/starting
- Repo lists GPL-3.0, LGPL-3.0, Apache-2.0, EPL-2.0, MIT. https://github.com/plantuml/plantuml
- C4-PlantUML not individually checked (**UNVERIFIED**).

### DOT / Graphviz
- Clusters are a naming convention honoured by layout engines; strict hierarchy; no sequence, no coordinated views, no animation. https://graphviz.org/doc/info/lang.html
- Layout-engine reference (compound graphs), not an authoring DSL.

### C4 model (context)
- Notation-independent method: context/container/component/code + landscape/dynamic/deployment. https://c4model.com/

## Build-your-own option
- Langium: MIT, TypeScript, grammar-driven, generates AST TS types, built-in LSP. https://github.com/eclipse-langium/langium (summary confirmed via the `langium/langium` repo page).
- LikeC4's `@likec4/language-server` likely Langium-based (**UNVERIFIED**; check its package source).
- Own DSL benefit: schema-validated canonical JSON + small grammar; but LikeC4 already ships skills + MCP.

## Open questions for downstream tickets
1. Does LikeC4's element/view model cover non-C4 types (flow, free-form) or must the grammar be extended? Needs a spike.
2. Verify directly from repo pages: licenses of Structurizr DSL, Graphviz, C4-PlantUML; release versions/dates of all projects.
3. Can LikeC4's model export as stable JSON usable as Fuente canonica, or do we define our own schema and compile LikeC4 into it?
4. LikeC4 scale on giant diagrams (layout performance) and pins/manual positions (layout ticket).
