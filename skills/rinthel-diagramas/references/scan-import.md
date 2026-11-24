# Scan draft, node kinds and refresh details

Reference for the "Import from code" and "Refresh from code" sections of `SKILL.md`.

## Scan draft (`.rinthel/scan.json`, schema `rinthel/scan@1`)

Read the draft file for detail; the `scan` summary only counts. Every item carries `source {file, line}` and `confidence` (`extracted` = read as written, `inferred` = guessed, for example a relation to a table the scan did not find).

| Section | Item fields you use |
| --- | --- |
| `units[]` | `id` (path of the folder, `.` is the root), `name`, `kind` (`package`, `app`, `module`, `folder`: a hint, not a Node kind), `parent` (id of the enclosing unit), `languages`, `files` |
| `dependencies[]` | `from`, `to` (unit ids), `weight` (imports aggregated), `examples[]` (`file`, `line`) |
| `externals[]` | `id` (`npm:react`), `name`, `ecosystem`, `importedBy[]` (unit ids), `weight` |
| `tables[]` | `id`, `name`, `origin` (`prisma`, `sql`, ...), `unit`, `columns[]` (`name`, `type`, `pk`, `fk`, `uk`, `optional`; flags only present when true), `relations[]` (`from` and `to` as `<table id>#<column>`, `cardinality` as `[from side, to side]`) |
| `limits` | `truncated`, `largeFilesSkipped`, `unresolvedImports`, `languagesWithoutImports[]` |

Languages in `limits.languagesWithoutImports` give units but no dependencies: draw their Edges only if you can read the imports yourself, and say so to the user.

## Starting Node kind catalog

Declare only the kinds the draft needs, in `specification`. A Node kind is yours to name; this set covers most scans:

```
specification {
  node module   { description "A package or folder of code" icon box      color blue }
  node app      { description "A runnable app or service"   icon server   color green }
  node table    { description "A database table"            icon database color amber }
  node external { description "A third-party dependency"    icon cloud    color gray }
}
```

Pick `app` for a unit that starts something (a server, a CLI, a UI entry), `module` for a library or folder, `table` for each table, `external` for an `externals` item. Rename or add kinds when the project has a clear vocabulary (`service`, `worker`, `queue`); the kind is a decision for the first import, and a refresh keeps it.

## Scan coverage JSON (`scan --json`)

`coverage` is `null` (no Workspace found), `{workspace, error}` (several Workspaces at the same depth: pass `--workspace`) or:

```
{ workspace, units: {total, covered, uncovered}, tables: {total, covered, uncovered},
  orphanRefs: [{node, ref}], columns: [{node, table, missing, extra}], ignored }
```

- `uncovered` units and tables are in the draft but no Node cites them as a Source `path` ref.
- `orphanRefs` are refs a Node cites that are no longer in the draft: a unit or table was renamed, moved or deleted.
- `columns` compares a table Node's Attributes with the table's columns by name: `missing` are columns without an Attribute, `extra` are Attributes without a column (Columns appear as `<table id>#<column>`).
- `ignored` counts items left out by `.rinthel/scan-ignore` (see "Refresh from code").

`changes` is `null` (no previous draft) or `{previous, commits, units, dependencies, externals, tables, columns}`, each with `added` and `removed` ids. A unit or table id that changed shows as one removed plus one added: decide whether it is a move.

## Refresh decisions

| Situation | Action |
| --- | --- |
| Orphan ref and a unit or table in `changes.added` clearly is the same thing (same name, same files moved) | Re-point the ref to the new id; keep the Node id, title, description, Group, kind, Views and Pins |
| Orphan ref that was the Node's last ref, nothing replaces it | Remove the Node and every Edge that touches it, with no question; list it in your report |
| That Node holds hand-written content (a long description, an Interaction, ER notes) | Ask the user before removing it |
| Orphan ref but the Node cites other live refs | Remove only the dead ref |
| Unit or table `uncovered` | Add a Node in the Group of its `parent`, with the criteria of "Import from code" |
| Column in `missing` | Add the Attribute and the relation Edge if the table has a new `relations` item |
| Attribute in `extra` | Remove it |
| Dependency in `changes.dependencies.added` | Draw it with the same weight criteria as the first import |
| Dependency in `removed` | Remove its Edge if it was an import Edge; keep an Edge that carries meaning the import never had (an event, a queue, a call over HTTP) |
| Unit or table you leave out on purpose | Add its id (or a gitignore-style pattern) to `.rinthel/scan-ignore`, one per line; the file is versioned, a refresh stops reporting it |
