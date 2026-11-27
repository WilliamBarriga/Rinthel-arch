import {
  CODES,
  CONTRACT_VERSION,
  CODE_DESCRIPTION,
  EDIT_CONTRACT_VERSION,
  INSPECT_CONTRACT_VERSION,
  editOutputJsonSchema,
  inspectOutputJsonSchema,
  validateOutputJsonSchema,
} from 'canonical';
import type { CanonicalForm } from 'canonical';

import { OUTPUT_FOLDER } from './workspace';

/** No line breaks nor pipes that break the Markdown row. */
const cellValue = (text: string): string => (text.trim() === '' ? '-' : text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|'));

const DSL_EXAMPLE = `specification {
  node service { description "Deployable unit"  color blue }
}

theme light extends neutral {
  palette { accent "#0ea5e9" }
}

model {
  service system "System" {
    service api "API"
    service db "Database" {
      attrs { id: uuid "key"  email: text }
    }
  }
  system.api -> system.db
}

view overview {
  type architecture
  include **
  theme light
  node system.db { label "Data"  color accent }
}`;

/** The project's `SKILL.md`. Deterministic: the same catalog produces the same bytes. */
export function generateSkill(source: CanonicalForm): string {
  const kinds = source.specification.nodeTypes.map(
    (type) => `| \`${type.name}\` | ${cellValue(type.description)} | ${cellValue(type.icon ?? '')} | ${cellValue(type.color ?? '')} |`,
  );
  const themes = source.themes.map(
    (theme) =>
      `| \`${theme.name}\` | ${Object.keys(theme.palette).map((color) => `\`${color}\``).join(', ') || '-'} |`,
  );
  const codes = Object.values(CODES).map((code) => `| \`${code}\` | ${CODE_DESCRIPTION[code]} |`);

  return `---
name: diagrams
description: Write and fix the .dg files (diagram DSL) of this project with the diagrams loop inspect, edit, validate. Use it when creating or editing Nodes, Edges, Views or Themes.
---

# Diagrams of this project

Diagrams are written in \`.dg\` files of the Workspace. They are the only editable source: never edit the JSON in \`${OUTPUT_FOLDER}/\`, which is derived output.

## Working loop

1. Query the Model with \`diagrams inspect\` to learn which ids exist, where they are written and how they connect (do not guess ids or re-read every \`.dg\`).
2. Edit the \`.dg\` files.
3. Run \`diagrams validate --workspace <path> --json\`.
4. If \`ok\` is \`false\`, fix each issue (start with the \`fix\` entries, which are exact text edits) and go back to step 3.
5. Stop when \`ok\` is \`true\`. \`diagrams build\` generates the geometry and \`diagrams dev\` shows the diagrams.

To see the result while editing (person or agent), \`diagrams dev\` opens the live loop (see below). If two authors touch the same \`.dg\`, the last write wins; reconciliation is git's job.

This skill is generated: after changing the Node kinds, Themes or codes, regenerate it with \`diagrams skill --workspace <path> --out <file>\`.

## Node kinds

Every Node declares its kind with one of these (\`specification { node <kind> { ... } }\`).

| Kind | Description | Icon | Color |
| --- | --- | --- | --- |
${kinds.join('\n') || '| - | - | - | - |'}

## Palette and Themes

A color is written only by Palette name (in a Node kind or a View override); the hex value lives only inside a \`theme\`.

| Theme | Palette colors |
| --- | --- |
${themes.join('\n')}

## DSL syntax

\`\`\`dg
${DSL_EXAMPLE}
\`\`\`

- A Node is \`<kind> <id> ["Title" ["Description"]] [{ children, attrs, source }]\`; its children make it a Group and its full id is \`parent.child\`.
- An Edge is \`origin ["card"] -> ["card"] target ["label"]\` (spaces around \`->\`; the label is lost when merging Edges lifted by a collapsed Group); an end can be \`node#attribute\`.
- A View only selects (\`include\`, \`exclude\`, \`depth\`; selectors \`a\`, \`a.*\`, \`a.**\`); \`type\` is \`architecture\`, \`flow\`, \`sequence\` (with \`interaction <id>\`, and a Model with \`interaction <id> { a -> b "msg" }\`) or \`er\` (Nodes with \`attrs\` and \`pk\`/\`fk\` keys, Edges with cardinality). Its per-Node overrides (\`label\`, \`pin x,y\`, \`order\`, \`color\`) never touch the Model; \`pin\` is the position relative to the parent Group, and in a \`sequence\` View \`order a, b\` sets the (partial) order of the Lifelines. An Interaction accepts \`async|reply|create|destroy\` Messages, Fragments (\`opt loop break critical alt/else par/and\`), \`note\` and \`ref\`; the View accepts \`autonumber\` and Steps \`upto <Message id>\`/\`steps each\`; an \`er\` View marks Attributes \`pk fk uk\` and Edges \`identifying\`.
- A View can declare \`theme\`, \`collapsed\`/\`expanded\`, \`link <node> -> <view>\` and reveal \`steps\` (\`steps { step "Title" { show a, a -> b  hide c } }\`: cumulative; \`show\` reveals and \`hide\` hides what came before; in a step \`a.*\` reveals the Group \`a\` and its children).
- \`extend <node> { ... }\` adds children, \`attrs\` and \`source\` to a Node declared in another file. A Node kind accepts \`description\`, \`icon\`, \`style\` and \`color\`; the \`icon\` is a generic icon or the name of an \`.svg\` in the Workspace.

## validate contract

\`diagrams validate --workspace <path> [--json] [--max-issues N] [--strict]\`. With \`--json\`, stdout is exactly one object (contractVersion ${CONTRACT_VERSION}). \`summary\` counts all issues; \`truncated\` says \`issues\` was cut at \`--max-issues\` (100 by default). Issues are sorted by file, line, column and code.

| Exit code | Meaning |
| --- | --- |
| 0 | No errors (warnings do not fail) |
| 1 | There are errors; with \`--strict\`, warnings too |
| 2 | Usage or internal failure (message on stderr) |

Every issue carries \`code\` (stable), \`severity\` (\`error\` or \`warning\`), \`file\`, \`line\`, \`column\`, \`message\`, and optionally \`hint\`, \`related\` and \`fix\`. The \`fix\` is an exact text edit (\`{ file, range, replacement }\`) and only appears when there is a single candidate; if there are several, read \`hint\`. There is never a \`fix\` over the canonical JSON. Rely on \`code\`: \`message\` and \`hint\` may change.

Schema (JSON Schema derived from the contract's Zod schema):

\`\`\`json
${JSON.stringify(validateOutputJsonSchema(), null, 2)}
\`\`\`

## Query the Model (inspect)

Read-only; never writes. Every result carries the qualified id, the kind and the \`file:line\` where it was written.

\`\`\`text
diagrams inspect search <text> --workspace <path> [--json]
diagrams inspect node <id> --workspace <path> [--json]
diagrams inspect view <id> --workspace <path> [--json]
diagrams inspect interaction <id> --workspace <path> [--json]
diagrams inspect theme <name> --workspace <path> [--kind <kind>] [--state <state>] [--diagram <type>] [--catalog] [--json]
\`\`\`

- \`search\` finds Nodes by partial id or title, Views by id and Interactions by id or title (case-insensitive).
- \`node\` returns the Node, its parent and children, its Attributes, the Edges in and out, and the Views that show it.
- \`view\` returns the type (\`architecture\`, \`flow\`, \`sequence\` or \`er\`) and the visible Nodes and Edges of the View in its initial state; in a \`sequence\` View the Nodes are its Lifelines and it includes the \`interaction\` it projects.
- \`interaction\` returns the title, the number of items and Messages, the Lifelines (in order of appearance) and the \`sequence\` Views that project it.
- \`theme\` returns the \`extends\` chain, the \`part\` used, the Layer stack resolved for the requested \`--kind\`, \`--state\` and \`--diagram\` (architecture, flow, sequence, er) (each Layer with the \`file:line\` of the patch that set it, so you know which patch to edit), the Metrics and whether the Theme uses code; with \`--catalog\`, also the keys of the Primitive, Motion and effect catalog.
- Without \`--json\` the output is readable text. With \`--json\`, stdout is exactly one object (contractVersion ${INSPECT_CONTRACT_VERSION}, independent from validate) with \`command\` = \`search\`, \`node\`, \`view\`, \`interaction\` or \`theme\`.
- Exit codes: 0 there is an answer (\`search\` with no matches too), 1 the Node, View, Interaction, Theme, kind or state does not exist (stderr suggests nearby ids) or the Workspace has errors (fix them with validate), 2 usage or internal failure.

\`inspect --json\` schema (JSON Schema derived from the Zod schema):

\`\`\`json
${JSON.stringify(inspectOutputJsonSchema(), null, 2)}
\`\`\`

## Structured editing (edit)

It is the CLI's only explicit write and it writes only what you ask for; \`validate\` never rewrites. Always edit the \`.dg\`, never the canonical JSON.

\`\`\`text
diagrams edit --workspace <path> --view <view> --node <qualified id> --x N --y N [--json]
diagrams edit --workspace <path> --intent '{"type":"reorder-lifelines","view":"<view>","order":["a","b"]}' [--json]
diagrams edit --workspace <path> --edits '[{"file":"main.dg","range":{"start":{"line":1,"column":1},"end":{"line":1,"column":2}},"replacement":"..."}]' [--json]
\`\`\`

- The first form moves the Pin of a Node in a View: it replaces the \`pin\` if it exists and adds it if not; you do not need to know the syntax.
- The second applies an Intent through its JSON contract (it carries no \`hash\`: one inherited in the JSON is ignored; concurrency is \`--hash <file>=<hash>\`); \`reorder-lifelines\` rewrites the whole \`order\` of a \`sequence\` View with the given visible order, and the \`order\` entries that are hidden today (collapsed Group, \`exclude\`) keep their relative position. \`set-theme\` (\`{ view, theme? }\`) writes \`theme <theme>\` in the View keeping its patch, or removes it without \`theme\`; an undeclared Theme is rejected with \`unknown-theme\`.
- The third applies already computed text edits (e.g. the \`fix\` of a \`validate\` issue): 1-based ranges, end excluded.
- Concurrency: every edit carries the hash of the file you saw (\`hash\` in the edit, or \`--hash <file>=<hash>\`); without a hash the one on disk is used. If the file changed, everything is rejected with no partial write.
- Also rejected: anything that introduces new errors, overlaps edits or points outside the file.
- With \`--json\`, stdout is exactly one object (contractVersion ${EDIT_CONTRACT_VERSION}, independent from the others) with \`ok\`; if it is \`false\` it carries \`reason\` and \`message\`.
- Exit codes: 0 written, 1 edit rejected or invalid, 2 usage or internal failure.

\`edit --json\` schema (JSON Schema derived from the Zod schema):

\`\`\`json
${JSON.stringify(editOutputJsonSchema(), null, 2)}
\`\`\`

## Live loop (dev)

\`diagrams dev --workspace <path>\` starts a local server (on 127.0.0.1 only, port 4173 by default; \`--port N\` changes it) that serves the Dev UI. It watches the Workspace and, on every change to the \`.dg\` files (with a ~150 ms debounce), recompiles and pushes the View, the issues and the activity to the page over Server-Sent Events. The UI shows the active View from the URL hash (\`#view=<id>\`), a DSL editor, clickable issues (\`file:line\`), the Theme gallery, the file History and a feed with every \`validate\`, \`build\`, \`inspect\` and \`edit\` you run (export \`DIAGRAMS_AGENT=<name>\` to sign them). An agent does not need to open it: use inspect and validate; \`dev\` is for the person to see the result live and edit. The person also writes the \`.dg\` files from the UI: re-read the file before editing it and pass \`edit --hash <file>=<hash>\` so you do not overwrite their change.

## Issue codes

| Code | Meaning |
| --- | --- |
${codes.join('\n')}
`;
}
