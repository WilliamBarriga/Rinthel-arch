# Planned mark: Blueprints from a PRD and their move to real code

An agent can write a Workspace from a PRD, a spec or a description of something that does not exist yet, and almost always does so on top of a system that already exists (a new feature in a repo with a Workspace). That is why what is proposed is marked element by element with a Model mark, **Planned** (`planned`), which the Theme draws as a paint-only state. Real and proposed elements thus live together in the same View. Rejected alternatives: marking it only by Source convention (the core does not interpret Source, so it is not visible on the canvas), duplicated Node kinds (they pollute the catalog and do not work for Edges) and a "plan" Theme or View (they do not work when mixed with real elements). Source: the ticket "Blueprint from a PRD or a description" (#221) of map #211. Amends ADR 0008 with a new state.

## Decisions

- **`planned` mark** on Node, Edge, Attribute (next to `pk fk uk`, drawn as a chip) and Interaction. It is part of the Model, not of the View.
- **Inheritance**: a planned Group marks all its descendants. An Edge is drawn as planned if it carries the mark or if either of its endpoints is planned. A Message inherits the mark of its Interaction or of a planned Lifeline; individual Messages are not marked. A real descendant (with a `path` Source) under a planned Group is a `validate` error, with a `fix` that removes the mark from the Group; the other way out is to move it out of the Group.
- **`planned` Theme state** (amendment to ADR 0008): paint only, like `fantasma`, and never changes Metrics. The Default theme draws it with a dashed border and low opacity; each Theme can restyle it and, without a patch of its own, inherits the Default theme's.
- **Trace to the PRD**: when the PRD is a file, each element written from it carries `source { spec "<file>#<section>" }` (the DSL form is `<kind> "<ref>"`). It is symmetric to the `path "<unit>"` of ADR 0010, and the core does not interpret it either. An unknown kind (for example the wrong form `kind "spec" ref "..."`) is the `unknown-source-kind` warning.
- **Assumptions and open questions**: go in the `description` of the affected element with the prefix `Assumption:` or `Open question:`, searchable with `inspect`. The agent first writes the draft without asking, hands over the `dev` URL and at most about 5 questions that change the shape of the diagram.
- **Default Diagram types**: one `architecture` View plus one `sequence` per key flow of the PRD; `er` if the PRD brings a data model and `flow` on request.
- **Move to real code**: when the system exists, the agent runs `diagrams scan` and reconciles. To each planned element it finds in the Scan draft it adds the `path` Source and removes `planned`. What it does not find stays planned and is reported to the user as "not built yet or diverges from the plan". The matching is decided by the agent, never by the system. Mechanical helpers: `dg inspect planned` lists what is planned with its `spec` Source, and the `planned-with-path` warning (with a `fix` that removes `planned`) detects an element that has both marks.
- **Agent flow**: section "Plan from a spec" of the `rinthel-diagramas` skill, next to "Import from code".

## Out of v1

- A mark for what the PRD retires (`retiring`). In v1 a retirement is noted as an `Open question:` in the element's `description`.
- View filters by planned (`exclude planned`, a Step that reveals what is planned). In v1, "today versus tomorrow" is done with two Views and an explicit `exclude`.
