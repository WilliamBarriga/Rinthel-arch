import { CARPETA_DE_SALIDA } from './workspace';

const COMANDOS = ['validate', 'build', 'dev', 'inspect', 'edit', 'skill', 'scan', 'export'] as const;
export type ComandoConAyuda = (typeof COMANDOS)[number];

const WORKSPACE = '--workspace <path>  Folder with the .dg files (required)';
const THEME_PATH = '--theme-path <dir>  Extra Theme folder; merged before the Workspace (the Workspace wins)';

const AYUDA_DE_COMANDO: Record<ComandoConAyuda, string> = {
  validate: `diagrams validate --workspace <path> [options]

Compiles and validates. Read-only: never rewrites files.

Options:
  ${WORKSPACE}
  --json               stdout is exactly one object { contractVersion, ok, summary, issues }
  --strict             warnings fail too (exit 1)
  --max-issues <N>     cap on listed issues (100 by default; summary.truncated reports it)
  --theme <name>       Theme used to measure overlapping Pins
  ${THEME_PATH}

Exit: 0 no errors, 1 errors found, 2 usage or internal failure (message on stderr).
Every issue carries a stable code, file, line, column and, when there is a single candidate, a fix.
`,
  build: `diagrams build --workspace <path> [options]

Validates and writes the canonical Source and the geometry to <path>/${CARPETA_DE_SALIDA}/ (derived, not versioned).
With errors it exits 1 and deletes the previous output.

Options: those of validate (--json, --strict, --max-issues, --theme, --theme-path).
`,
  dev: `diagrams dev --workspace <path> [options]

Dev UI at http://127.0.0.1:<port>/ (listens on localhost only): canvas, DSL editor, Issues, Themes,
file History and the activity log feed. Recompiles on save. The active View lives in the URL hash
(#view=<id>). Dragging a Node sets its Pin and rewrites the .dg.
Guide: docs/guide/dev-ui.md.

Options:
  ${WORKSPACE}
  --port <N>           Port (4173 by default; 0 picks a free one)
  --trust-code         Trust in advance the Workspace Themes with code (.tsx)
  ${THEME_PATH}

This is a long-running process: start it in the background and wait for the line with the URL.
`,
  inspect: `diagrams inspect <search|node|view|interaction|planned|theme> [argument] --workspace <path> [options]

Read-only queries over the Model; each result carries the qualified id, kind and file:line.

  inspect search <text>       Nodes and Interactions by partial id, title or description, Views by id
  inspect node <id>           Node, parent and children, Attributes, Edges and the Views that show it
  inspect view <id>           Visible Nodes and Edges of the View in its initial state
  inspect interaction <id>    Lifelines in order, Messages and the Views that project the Interaction
  inspect planned             Planned Nodes, Attributes, Edges and Interactions (no argument), with their spec refs
  inspect theme <name>        extends chain, Parts, Layer stack with file:line, Metrics

Options:
  ${WORKSPACE}
  --json               One object with its own contractVersion (independent from validate)
  --kind <kind>        (theme) resolves the cascade for that Node kind
  --state <state>      (theme) resolves the cascade for that state
  --diagram <type>     (theme) applies the diagram patches of that Diagram type (architecture, flow, sequence, er)
  --catalog            (theme) adds the keys of the Primitive and Motion catalog
  ${THEME_PATH}

Exit: 0 there is an answer, 1 the Node/View/Theme does not exist or the Workspace has errors, 2 usage failure.
`,
  edit: `diagrams edit --workspace <path> (--view <id> --node <id> --x N --y N | --intent '<json>' | --edits '<json>') [options]

The CLI's only explicit write: all or nothing, only on .dg files of the Workspace.

  --view <id> --node <id> --x N --y N   Sets the Node Pin in the View (inserts or replaces it)
  --intent '<json>'                     Intent { type, ... }; today, besides move-pin:
                                        {"type":"reorder-lifelines","view":"<id>","order":["a","b"]} rewrites the
                                        whole order of a sequence View (hidden ones keep their place);
                                        {"type":"set-theme","view":"<id>","theme":"<name>"} writes theme in the
                                        View (keeps the patch); without "theme" it removes it. An undeclared Theme
                                        is rejected with unknown-theme
  --edits '<json>'                      List of { file, range, replacement }, for example the fix of validate
  --hash <file>=<hash>                  Rejects the edit if the file changed since you read it

Options:
  ${WORKSPACE}
  --json               Structured result with its own contractVersion
  ${THEME_PATH}

Exit: 0 applied, 1 edit rejected or invalid (no partial write), 2 usage failure.
`,
  skill: `diagrams skill --workspace <path> [--out <file>]

Generates a skill (SKILL.md) so an agent can write and fix the .dg files of THAT Workspace: its Node kinds,
Themes, syntax, the validate/inspect/edit contract and issue codes. It goes to stdout or to --out.
Regenerate it when the Node kinds, the Themes or the codes change.
`,
  scan: `diagrams scan [<root>] [options]

Reads a codebase without running it and writes a Scan draft (rinthel/scan@1): units from manifests
(package.json, pyproject.toml, go.mod, Cargo.toml), dependencies between them from TS/JS imports,
externals, database tables from Prisma schemas and SQL DDL, and limits. Prints a compact summary that
ends with the next step. Never writes .dg files.

With a Workspace (--workspace, or the shallowest folder under <root> with .dg files) it adds Scan
coverage: units and tables no Node cites as a Source path ref, orphan refs, and columns missing or extra
versus Attributes. Ids matching <root>/.rinthel/scan-ignore (gitignore-style, versioned) are left out
of coverage, not of the draft. The previous draft rotates to scan.prev.json next to --out and the
summary lists the units, dependencies, externals, tables and columns added or removed since then.

Options:
  <root>               Folder to scan (current folder by default)
  --out <file>         Where to write the draft (<root>/.rinthel/scan.json by default, not versioned)
  --json               stdout is exactly one summary object with its own contractVersion
  --depth <N>          Folder levels a large manifest is split into (2 by default; 0 never splits)
  --max-files <N>      Files read at most (20000 by default); beyond it limits.truncated is true
  --workspace <path>   Workspace to report Scan coverage against (found under <root> by default)

Honors .gitignore and always skips node_modules, dist, build, .venv and vendored code.
Exit: 0 draft written (coverage gaps included), 2 usage or internal failure (message on stderr).
`,
  export: `diagrams export --workspace <path> --out <file>.html [options]

Writes the Dev UI of the Workspace as one self-contained, read-only HTML file to send to anyone:
Views, Steps, links, collapsing, selection and Theme switching work; editing, Undo history, agent
activity and Diffs are left out. Layout engine (ELK) and Theme fonts go inside; it opens from disk
(file://) or from any static server, with no network requests. Writes nothing next to the Workspace.

Options:
  --workspace <path>   Folder with the .dg files (required)
  --out <file>         The HTML file to write (required; missing folders are created)
  --theme-path <dir>   Extra Themes folder; merged before the Workspace (the Workspace wins)

Themes with code (.tsx components) go inside and run in the browser of whoever opens the file.
Exit: 0 written, 1 the Workspace has errors (nothing written), 2 usage or internal failure.
`,
};

const AYUDA_GENERAL = `diagrams: CLI to write, validate and view .dg diagrams

Usage: diagrams <command> --workspace <path> [options]
       diagrams <command> --help

Commands:
  validate   Compiles and validates; lists issues with file, line and fix (read-only)
  build      Writes the canonical Source and the geometry to <path>/${CARPETA_DE_SALIDA}/
  dev        Dev UI at http://127.0.0.1:4173/: view, edit and follow the Workspace
  inspect    Queries the Model: search, node, view, interaction, planned, theme (read-only)
  edit       Sets a Pin or applies structured edits to the .dg
  skill      Generates the agent skill of a Workspace
  scan       Reads a codebase into a Scan draft for an agent to diagram (diagrams scan [<root>])
  export     Writes the Dev UI as one self-contained, read-only HTML file (--out <file>.html)

Agent loop: inspect, edit the .dg, validate --json until ok:true.
Exit codes: 0 success, 1 Workspace errors, 2 usage or internal failure.
validate, build, inspect and edit append an Event to <path>/${CARPETA_DE_SALIDA}/activity.jsonl
(DIAGRAMS_ACTIVITY=0 turns it off; DIAGRAMS_AGENT names the agent).
Full guide: docs/guide/cli.md
`;

/** `undefined` si `argv` no pide ayuda (`--help`, `-h`, `help [comando]` o sin argumentos). */
export function ayudaPara(argv: readonly string[]): string | undefined {
  const [comando, ...resto] = argv;
  const pide = (valor: string | undefined): boolean => valor === '--help' || valor === '-h';
  const esComando = (valor: string | undefined): valor is ComandoConAyuda => COMANDOS.includes(valor as ComandoConAyuda);

  if (comando === undefined || pide(comando)) return AYUDA_GENERAL;
  if (comando === 'help') return esComando(resto[0]) ? AYUDA_DE_COMANDO[resto[0]] : AYUDA_GENERAL;
  if (esComando(comando) && resto.some(pide)) return AYUDA_DE_COMANDO[comando];
  return undefined;
}
