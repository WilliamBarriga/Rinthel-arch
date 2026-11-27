# rinthel-arch

System to explain projects with large, detailed diagrams, agnostic of the project being documented.

## Language

Each entry is headed by its canonical English term, the official one on the public face, followed by its Spanish term (`es:`) used in `README.es.md` and `docs/guia/`; in both languages glossary terms are capitalized.

**Documented project** (es: **Proyecto documentado**):
The software or system being explained (e.g. this same repo, in `examples/rinthel-arch/`). The diagram system does not depend on it.

**Model** (es: **Modelo**):
The single set of Nodes and Edges of a Documented project, from which every View is drawn. Semantic text (title, description) lives once, here.

**Node** (es: **Nodo**):
Model entity with a stable identity (id qualified by its hierarchy, e.g. `rinthel.api.auth`), a Node kind declared by the project, title, description, optional Attributes and optional `source`.

**Group** (es: **Grupo**):
Node that contains other Nodes. Nests without limit. Not a concept separate from Node.

**Edge** (es: **Arista**):
Relation between two ends of the Model. An end is a Node or an Attribute of a Node, and may carry a cardinality and a short label.
_Avoid_: relationship, link

**Attribute** (es: **Atributo**):
Structured, ordered element of a Node (column, field, method), with name, type and notes. It is addressable as an Edge end. Distinct from a child Node.

**Interaction** (es: **Interaccion**):
Model scenario with its own id (a namespace separate from that of Nodes), optional title and description: an ordered list of Messages, Notes, Fragments and references to other Interactions. The list order is the temporal order. A sequence View projects exactly one. Distinct from Edge: it neither requires nor creates Edges.

**Lifeline** (es: **Lifeline**):
Participant of an Interaction. It is a Node of any level, not a separate entity; its order in the View is the order of first appearance, unless the View overrides it.

**Message** (es: **Mensaje**):
Interaction item from one Node to another (or to itself, a self message), with a type (`sync`, `async`, `reply`, `create`, `destroy`), and optional label and description. Its identity is its position in the Interaction; it may carry an optional id, unique in its Interaction, which is only an alias to cite it. Activation is not declared: it is derived from `sync`/`reply` pairs.

**Fragment** (es: **Fragmento**):
Interaction item that groups Messages under an operator (`alt`, `opt`, `loop`, `par`, `break`, `critical`) in one or more operands with an optional guard. Nests. It is neither a Node nor a Group: it contains Messages, not entities.

**Node kind** (es: **Tipo de nodo**):
Category of Node (service, table, actor...) declared in the Documented project's catalog, with its icon and style. An undeclared Node kind is a validation error. Distinct from Diagram type.
_Avoid_: node type

**Source** (es: **Source**):
List of opaque references from a Node to the Documented project (file path, path and symbol, URL, external entity id), each with `kind` and `ref`. The core stores them without interpreting them.

**View** (es: **Vista**):
Declarative projection of a Model, of one Diagram type: which Nodes it includes or excludes and down to what depth (in sequence, which Interaction it projects). It never defines new entities. It may override presentation only (short label, Pin, style, order).

**Diagram type** (es: **Tipo de diagrama**):
Notation family that fixes how a View is drawn. Today there are four: architecture, flow, sequence and ER; all share the same Model and the same Themes.

**Drill-down** (es: **Drill-down**):
Going from a Node to its detail. Each View has a default mechanism (collapse or expand the Group in the same View) and may override it per Node by linking to another View. A linked Group does not expand in that View.

**Group header** (es: **Cabecera del Grupo**):
Tree of Slots (mini-layout) that the Theme declares in `group` for the title and icon of an open Group; its height, plus the padding of the children area, is the top margin that layout reserves.

**Collapsed group** (es: **Grupo colapsado**):
Group shown as a single Node, with its child counter and its children's Edges lifted to its border. When a View opens, the Groups that exceed its depth appear collapsed.

**View link** (es: **Enlace entre Vistas**):
Drill-down from a Node, or from a `ref` in sequence, to another View of any Diagram type. It is navigation, not hierarchy: a View may have several parents and cycles are valid. The path walked is shown as breadcrumbs.

**Theme** (es: **Tema**):
Presentation declaration a View is drawn with: Palette, fonts, tokens and, for each element (Node, Edge, Group, page background), a stack of Layers, plus its animation. It is declared in the Workspace, it is modular (`extends` from a parent and reusable Parts) and it never touches the Model. A View picks a single Theme, so different diagrams can have different visual lines; inside the View, the shape varies by Node kind, state, Edge and Group through patches.

**Default theme** (es: **Tema por defecto**):
Built-in Theme used by a View without a Theme: `neutral` (light). It comes with `neutral-dark` and `high-contrast`. Written in the same DSL as any Theme.

**Layer** (es: **Capa**):
Named unit of the stack that draws an element; it is an instance of a Primitive, goes under the content (default) or over it, and can be animated. Variation by kind, state or View is expressed as a patch by Layer name (change, add with `before`/`after`, remove with `none`). A Theme code component is also a Layer (Theme component).

**Primitive** (es: **Primitiva**):
Layer type from the closed catalog (shape, fill, stroke, shadow, glass, decoration...). A new Primitive is added to the catalog through an issue; a new Family, through an ADR.

**Family** (es: **Familia**):
Group of Primitives with the same job (shape, fill, border (solid, dashed, dotted, outline), Edge stroke, shadow, glow, glass, filter, decoration, Edge marker, Slot text style, code). Each Primitive belongs to exactly one.

**Slot** (es: **Slot**):
Fixed-name content place in a Node or Group (`icon`, `title`, `desc`, `badge`, `footer`, `attrs`, `counter`). The Theme decides which are shown, in what order and with what style. Together with the box, they are the only thing that affects the Metrics.

**Theme element** (es: **Elemento de Tema**):
Each thing a Theme knows how to draw with its own stack of Layers: page, Node, Group and Edge, plus the sequence and ER ones (Lifeline, activation, Message, Fragment, Note, Attribute row). A Theme that does not declare an Element receives it derived from its other Elements, so any Theme draws any Diagram type. What varies by Diagram type in Node, Group or Edge is a level of the cascade, not a separate Element.

**Motion** (es: **Movimiento**):
Continuous animation from a closed catalog (`stream`, `pulse`, `breathe`...) that hangs from a Layer and can be tied to a state. Reactions to interaction are transitions between state patches; `enter`/`exit` animate appearance and exit, and a Step only triggers `enter`.

**Theme part** (es: **Parte de Tema**):
Reusable patch without a Theme (`part`), included with `use` inside an element.

**Theme component** (es: **Componente de Tema**):
React/TS component of the Workspace that a Theme references by name as a `code` Layer, for what the catalog does not cover. It is only visual and does not affect the Metrics; a Theme that uses one is marked "with code".

**Palette** (es: **Paleta**):
Named colors of a Theme (`blue`, `danger`). The Model and the Views only refer to a color by its Palette name, never by literal value.

**Step** (es: **Paso**):
Ordered point of a View that reveals Nodes and Edges cumulatively. It only changes visibility, never position. A View without Steps is shown complete. In sequence, a Step is a cut in time: it shows the Interaction up to a Message and only moves forward.

**Autonumbering** (es: **Autonumeracion**):
Number that a sequence View puts on each Message it projects, in declaration order. It is View presentation: it does not depend on Steps and is not stored in the Model.

**Pin** (es: **Pin**):
Manual position of an element in a View that overrides auto-layout. It anchors the element's center.

**Canonical form** (es: **Fuente canonica**):
Structured format (Model and Views), validatable by schema, from which everything is rendered. It is a derived artifact: nobody edits it, it is always compiled from the Text DSL.
_Avoid_: canonical source

**Text DSL** (es: **DSL de texto**):
Syntax readable by humans and agents, and the only source that is edited and versioned. It compiles one way to the Canonical form.

**Workspace** (es: **Workspace**):
Folder of Text DSL files that merge into the single Model of a Documented project. Each file may contribute Nodes, Edges and Views.

**Issue** (es: **Issue**):
Finding of the validation of a Workspace: stable code, severity (`error` or `warning`), `file:line`, message and, optionally, a hint and a `fix` (the text replacement that corrects it when there is a single candidate). It is data, never an exception.

**Session** (es: **Sesion**):
Compiled state of a Workspace at a given moment: Canonical form, issues and geometry per View (computed on demand). It is an immutable value; a file change produces another Session. The CLI, `dev` and `inspect` consume it.

**Resolved style** (es: **Estilo resuelto**):
Result of applying the cascade (base Theme, Node kind, state, View override) to the Layer stacks. It has two halves: the Metrics (read by layout) and the paint (the Layers, read by render). Changing the look means changing the Theme, not the drawing logic.

**Metrics** (es: **Metricas**):
Space measures derived from a Theme, per element (Node per Node kind, open Group, Collapsed group, Edge label and, in sequence, Lifeline header, activation, Fragment, Note and Message label): padding, gap, Slot size and minimum shape box, plus the sequence spacings (between Lifelines, between Messages, self-message loop). Only the box and the Slots affect them. Position computation and drawing share them, so what is reserved and what is drawn cannot diverge.

**Fresh geometry** (es: **Geometria vigente**):
Cached geometry of a View that is still valid: nothing that influences positions (structure, texts, fonts, Metrics, Pins) changed since it was computed. A single answer for Session, CLI and shell.

**Intent** (es: **Intencion**):
Change the user asks for on the Text DSL, expressed in domain terms (move a Node's Pin in a View; order the Lifelines of a sequence View; set or remove a View's Theme). It is not a text edit yet; a Gesture turns it into one.

**Gesture** (es: **Gesto**):
Session operation that receives an Intent, computes the minimal edit of the Text DSL, self-tests it and applies it in memory. Its caller only takes care of writing the result.

**Undo history** (es: **Historial**):
Immutable undo and redo stack of Intents (ADR 0007): each applied Intent pushes the Workspace text it leaves, without I/O. It is the pure reducer's, with no disk involved.
_Avoid_: plain "history" for the one in `dev` (that is the File history).

**File history** (es: **Historial de archivos**):
Undo history of `dev`: each entry stores, per file, the text before and after a UI write (Intent, editor save, `fix`), with a description and its time. Undo, redo and jumping to an entry are rejected only if a file the entry restores changed outside; an external write does not reset it. The UI sees the visible history from it: each entry with whether it is reachable on the current disk.

**Dev UI** (es: **UI de dev**):
Browser app served by `dev` (package `estudio`) to look at, edit and follow a Workspace: canvas with the active View, Text DSL editor, Issues, Theme gallery, Detail, File history and Activity log feed. Every write goes through the Live workspace; it does not touch disk.

**Live workspace** (es: **Workspace vivo**):
The state of `dev` without transport: the current and the last good Session, the File history, the write queue, the versions the UI saw, the Diff with its origin and, composed, the live Activity log (its own module that reads and pushes the activity). It is the only owner of the event sequence of the `dev` protocol: on connect, state, File history and previous activity; after each state, its File history and its Diff. The `dev` server and its test fake only transport it.

**Selection** (es: **Seleccion**):
Element or elements of a View (Node, Edge, Attribute; in sequence also Message, Fragment and Note) the editor acts on. It is the subject of Intents.

**Activity log** (es: **Registro de actividad**):
History of the CLI commands that read or write the Workspace (`validate`, `build`, `inspect`, `edit`), by any author and with or without `dev` open. It only records the CLI: what the human does in the Dev UI does not enter. It is informational only: it is not part of the Model, the Undo history or the File history.

**Activity event** (es: **Evento de actividad**):
An entry of the Activity log: which command ran, who (process and, if declared, agent), on which named target (View, Node, Theme or files) and with what result.

**Diff** (es: **Diferencia**):
What changed between two good Sessions, in domain terms: Nodes, Attributes, Edges, Interactions, Messages, Views and Themes added, removed or changed, and for each changed one which properties changed, marked as text or structure. A rename is a removal plus an addition. Its origin is own (written by the Dev UI) or external (an agent, another editor, the CLI); only the external one is highlighted. It does not say how much must be redone to draw: that is the change classification.
_Avoid_: change set, model change (it also covers Views and Themes)

**Finder** (es: **Buscador**):
Dev UI dialog that finds and jumps to Views, Nodes and `file:line`, and runs UI commands by name.
_Avoid_: palette, command palette (Palette is a Theme's colors)

**Scanner** (es: **Escaner**):
Tool outside the core that reads the codebase of a Documented project without running it and extracts mechanical facts (units, dependencies between them, externals, tables) into a Scan draft. It knows neither the Text DSL nor the Model, and decides nothing that depends on interpreting the project.

**Scan draft** (es: **Borrador de escaneo**):
Output of the Scanner: facts with their origin (`file:line`) and their confidence (extracted or inferred). The agent reads it to write the Workspace; it is neither a Workspace nor Canonical form and the system never compiles it.
_Avoid_: import, generated diagram

**Scan coverage** (es: **Cobertura de escaneo**):
Matching between a Scan draft and the Model's `path` Sources: units and tables no Node cites (uncovered), refs no longer in the Draft (orphaned), columns missing or extra against the table's Attributes, and what the project decided to ignore. Planned elements do not count: they have no `path` ref. It is informational, not a validation Issue.
_Avoid_: sync, drift, incremental import

**Planned** (es: **Planeado**):
Model mark for a Node, Edge, Attribute or Interaction that does not exist yet in the Documented project: it was proposed from a PRD or a description. The descendants of a planned Group inherit it, and so do the Edges and Messages that touch something planned. It is drawn differently from what is real in the same View and stops being planned when the element appears in the code.
_Avoid_: draft, proposed, ghost (Ghost is a Theme state), blueprint (Blueprint is the name of the feature, not of the concept)
