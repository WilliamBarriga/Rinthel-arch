# Scanner schema readers: Prisma and SQL DDL

Research for ticket #238 (Prisma and SQL DDL tables in the Scan draft, spec #226). Question: which parser does the `scanner` package adopt to read Prisma schemas and SQL DDL statically, with line numbers, without running project code. Builds on `research/escaner-codebases` (which recommended `@mrleebo/prisma-ast` for Prisma and `tree-sitter-sql` or `node-sql-parser` for SQL) and `research/escaner-dependencias` (web-tree-sitter runtime).

Date: 2026-11-24. Metadata from `npm view <package>` and `gh api repos/<repo>` that day. Probes: each candidate installed with `npm install --ignore-scripts` in a scratch folder and run from Node 24 against small schemas.

## Conclusion

- Adopt no dependency. Both readers are hand-written in `packages/scanner/src/tables/` (a Prisma block reader and a tolerant SQL DDL statement reader over one shared tokenizer), error-tolerant per block or statement, with 1-based lines from the tokenizer.
- Reject `@mrleebo/prisma-ast` 0.16.0: importing the module runs `lilconfigSync('prisma-ast').search()` at load time, which searches from `process.cwd()` up to the home folder for `.prisma-astrc.js` and similar files and `require`s them. Running `diagrams scan` inside an untrusted repo would execute that repo's JavaScript, which breaks the Scanner's invariant (never execute project code). Locations are also off by default and only enabled through that same config file.
- Reject `@prisma/prisma-schema-wasm` (the official DMMF, Apache-2.0, 3.2 MB `.wasm`): its README says the package is internal and "Its API will break without prior warning"; versions are engine hashes (`8.1.0-2.<sha>`); the DMMF has no line numbers; and it validates the whole schema, so one file of a multi-file schema (`Type "User" is neither a built-in type...`) or one syntax error fails every model.
- Reject `@derekstride/tree-sitter-sql` 0.3.13 (MIT, active): the npm package and the GitHub releases ship only C sources (48 MB unpacked), no `.wasm`; using it means building and vendoring a grammar with emscripten. Revisit if a `.wasm` is published.
- Reject `node-sql-parser` 5.4.0 (Apache-2.0, 92 MB unpacked, ~300 KB per dialect build): one unsupported statement fails the whole file (a Postgres `DO $$ ... $$` block made a migration with two `CREATE TABLE` unparseable), it needs a dialect chosen up front (backticks, brackets and `$$` differ), and the scanner would still need its own statement splitter to be tolerant. With that splitter written, reading `CREATE TABLE`, `ALTER TABLE` and `CREATE UNIQUE INDEX` is a small step.
- What the hand-written readers cover is a deliberate subset (see Scope); anything else is skipped, never an error. Drizzle, Django and SQLAlchemy (#239) still go through `web-tree-sitter` with the TS and Python grammars.

## Candidates

| Package | Version | License | Dependencies | Last publish | Verdict |
|---|---|---|---|---|---|
| `@mrleebo/prisma-ast` | 0.16.0 | MIT | `chevrotain` ^12, `lilconfig` ^2.1 | 2026-05-11 | rejected: loads and `require`s a config file found from the cwd at import time |
| `@prisma/prisma-schema-wasm` | 8.1.0-2.59be4fd | Apache-2.0 | none | 2026-09-01 | rejected: internal API, no lines, whole-schema validation |
| `@derekstride/tree-sitter-sql` | 0.3.13 | MIT | native (`node-addon-api`, `node-gyp-build`), peer `tree-sitter` | 2026-11-10 | rejected for now: no `.wasm` published |
| `tree-sitter-sql` | 0.1.0 | MIT | `nan` | 2022-05-22 | rejected: unmaintained |
| `node-sql-parser` | 5.4.0 | Apache-2.0 | `@types/pegjs`, `big-integer` | 2026-01-12 | rejected: all-or-nothing per file, dialect-bound |

Repos: `MrLeebo/prisma-ast` (166 stars, push 2026-05-08), `DerekStride/tree-sitter-sql` (250 stars, push 2026-11-10), `taozhi8833998/node-sql-parser` (1045 stars, push 2026-07-19).

## Scope of the hand-written readers

- Prisma: `model` and `view` blocks become tables (`@@map` gives the table name, `@map` the column name); scalar and enum fields become columns (`?` optional, `@id` and `@@id` pk, `@unique` and single-column `@@unique` uk); `@relation(fields, references)` marks fk and gives a relation whose cardinality comes from the uniqueness and optionality of the fk fields. Relations are resolved across every `.prisma` file of the scan (multi-file schemas). Implicit many-to-many join tables are not emitted in v1.
- SQL: a tokenizer that skips comments, strings and dollar-quoted bodies and reads `"x"`, `` `x` `` and `[x]` identifiers; statements split at top-level `;`. Read: `CREATE TABLE` (column and table constraints), `ALTER TABLE` (add, drop, rename columns; add pk, unique and fk constraints; set or drop not null; rename table), `DROP TABLE`, `CREATE UNIQUE INDEX` on one column. Files are applied in path order per migrations folder, so a migration history folds into the final tables. Down migrations, Prisma migrations (a folder with `migration_lock.toml`) and drizzle-kit output (a folder with `meta/_journal.json`) are skipped, because their schema source is already read.

## Sources

- `npm view @mrleebo/prisma-ast`, `npm view @mrleebo/prisma-ast readme` ("Configuration Options": lilconfig search paths); `dist/prisma-ast.esm.js` line 177 (`lilconfigSync('prisma-ast').search()` at module scope).
- `npm view @prisma/prisma-schema-wasm readme` ("The published NPM package is internal to Prisma. Its API will break without prior warning."); probe of `get_dmmf` on a split schema and on a syntax error.
- `npm view @derekstride/tree-sitter-sql`, `gh api repos/DerekStride/tree-sitter-sql/releases` (assets: only `tree-sitter-sql-v<version>.tar.gz`).
- `npm view node-sql-parser readme` (dialect builds `node-sql-parser/build/<database>`, `includeLocations`); probe of the PostgreSQL build on a migration with a `DO $$` block.
- Prisma schema reference: https://www.prisma.io/docs/orm/reference/prisma-schema-reference (attributes `@id`, `@@id`, `@unique`, `@@unique`, `@map`, `@@map`, `@relation`).
