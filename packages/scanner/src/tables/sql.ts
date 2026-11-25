/**
 * SQL DDL (`*.sql`), read by hand with a tolerant statement reader: no dependency (see `research/escaner-esquemas`).
 * Dialect-agnostic: `"x"`, `` `x` `` and `[x]` identifiers, `--`, `#` and block comments, `$tag$` bodies. A statement it
 * does not know is skipped; one it cannot follow never hides the rest of the file.
 */
import type { ScanColumn, Source } from '../draft';
import type { FoundRelation, FoundTable, SchemaContext, SchemaFile, TableExtractor } from '.';
import { relationOf, scanColumn } from './relation';
import { PARENS, type Token as Shared, closing as closingOf, split as splitBy } from './tokens';

export const sql: TableExtractor = {
  origin: 'sql',
  matches: (path) => path.toLowerCase().endsWith('.sql'),
  load: () => Promise.resolve(readSql),
};

/** `ident` for quoted identifiers (text unquoted), `string` for literals and `$$` bodies. */
type Token = Shared<'word' | 'ident' | 'string' | 'punct'>;

interface Column {
  name: string;
  type: string;
  notNull: boolean;
}

interface ForeignKey {
  columns: string[];
  table: string;
  /** `undefined`: the target's primary key. */
  references: string[] | undefined;
  /** The definition that declares it, in the file of its statement. */
  source: Source;
}

interface Table {
  name: string;
  file: string;
  line: number;
  columns: Column[];
  primaryKey: string[];
  uniques: string[][];
  foreignKeys: ForeignKey[];
}

/**
 * Files fold in path order within their folder, so a migration history gives the final tables; a folder named like a
 * migration (`20240101_init/up.sql`) folds into its parent. Separate folders stay separate schemas.
 */
function readSql(files: readonly SchemaFile[], context: SchemaContext): FoundTable[] {
  const groups = new Map<string, Map<string, Table>>();
  for (const file of files) {
    if (DOWN_MIGRATION.test(file.path) || generatedElsewhere(file.path, context.files)) continue;
    const group = groupOf(file.path);
    const tables = groups.get(group) ?? new Map<string, Table>();
    groups.set(group, tables);
    for (const statement of statements(tokenize(file.text))) apply(tables, statement, file.path);
  }
  return [...groups.values()].flatMap((tables) => [...tables.values()].map((table) => toFound(table, (name) => tables.get(key(name)))));
}

const DOWN_MIGRATION = /(^|[/._-])down\.sql$/i;

/** Migrations generated from a schema that another extractor reads: Prisma (`migration_lock.toml`), drizzle-kit (`meta/_journal.json`). */
function generatedElsewhere(path: string, files: ReadonlySet<string>): boolean {
  const parts = path.split('/');
  for (let depth = parts.length - 1; depth >= 0; depth--) {
    const folder = parts.slice(0, depth).join('/');
    const prefix = folder === '' ? '' : `${folder}/`;
    if (files.has(`${prefix}migration_lock.toml`) || files.has(`${prefix}meta/_journal.json`)) return true;
  }
  return false;
}

function groupOf(path: string): string {
  const parts = path.split('/').slice(0, -1);
  if (/^\d/.test(parts[parts.length - 1] ?? '')) parts.pop();
  return parts.join('/');
}

const key = (name: string): string => name.toLowerCase();

function apply(tables: Map<string, Table>, statement: Token[], file: string): void {
  const [first, second, third] = statement;
  if (isWord(first, 'CREATE') && isWord(second, 'UNIQUE') && (isWord(third, 'INDEX') || isWord(third, 'CLUSTERED') || isWord(third, 'NONCLUSTERED'))) {
    const on = statement.findIndex((token) => isWord(token, 'ON'));
    const target = on < 0 ? undefined : qualifiedName(statement, isWord(statement[on + 1], 'ONLY') ? on + 2 : on + 1);
    const table = target === undefined ? undefined : tables.get(key(target.name));
    if (table !== undefined && target !== undefined) table.uniques.push(names(statement, target.end));
  } else if (isWord(first, 'CREATE')) {
    const table = createTable(statement, file);
    if (table !== undefined) tables.set(key(table.name), table);
  } else if (isWord(first, 'ALTER') && isWord(second, 'TABLE')) {
    alterTable(tables, statement, file);
  } else if (isWord(first, 'DROP') && isWord(second, 'TABLE')) {
    let i = 2;
    if (isWord(statement[i], 'IF') && isWord(statement[i + 1], 'EXISTS')) i += 2;
    for (const part of split(statement.slice(i))) {
      const name = qualifiedName(part, 0);
      if (name !== undefined) tables.delete(key(name.name));
    }
  }
}

/** `ALTER TABLE [ONLY] [IF EXISTS] name action, action...`; unknown actions are skipped. */
function alterTable(tables: Map<string, Table>, statement: Token[], file: string): void {
  let i = 2;
  if (isWord(statement[i], 'IF') && isWord(statement[i + 1], 'EXISTS')) i += 2;
  if (isWord(statement[i], 'ONLY')) i++;
  const name = qualifiedName(statement, i);
  const table = name === undefined ? undefined : tables.get(key(name.name));
  if (name === undefined || table === undefined) return;
  for (const action of split(statement.slice(name.end))) {
    const [verb, object] = action;
    const columnAt = isWord(object, 'COLUMN') ? 2 : 1;
    const exists = isWord(action[columnAt], 'IF') ? 2 + Number(isWord(action[columnAt + 1], 'NOT')) : 0;
    if (isWord(verb, 'ADD')) {
      addDefinition(table, action.slice(columnAt + exists), file);
    } else if (isWord(verb, 'DROP') && !isWord(object, 'CONSTRAINT')) {
      const column = action[columnAt + exists]?.text;
      if (column !== undefined) dropColumn(table, column);
    } else if (isWord(verb, 'RENAME') && isWord(object, 'TO')) {
      const renamed = qualifiedName(action, 2);
      if (renamed === undefined) continue;
      tables.delete(key(table.name));
      table.name = renamed.name;
      tables.set(key(table.name), table);
    } else if (isWord(verb, 'RENAME') && isWord(action[columnAt + 1], 'TO')) {
      renameColumn(table, (action[columnAt] as Token).text, action[columnAt + 2]?.text ?? '');
    } else if ((isWord(verb, 'ALTER') || isWord(verb, 'MODIFY')) && action[columnAt] !== undefined) {
      const column = table.columns.find((candidate) => key(candidate.name) === key((action[columnAt] as Token).text));
      const set = action.findIndex((token, index) => isWord(token, 'NOT') && isWord(action[index + 1], 'NULL'));
      if (column !== undefined && set > 0) column.notNull = !isWord(action[set - 1], 'DROP');
    }
  }
}

function dropColumn(table: Table, name: string): void {
  const kept = (list: string[]): boolean => !list.some((item) => key(item) === key(name));
  table.columns = table.columns.filter((column) => key(column.name) !== key(name));
  table.primaryKey = kept(table.primaryKey) ? table.primaryKey : [];
  table.uniques = table.uniques.filter(kept);
  table.foreignKeys = table.foreignKeys.filter((fk) => kept(fk.columns));
}

function renameColumn(table: Table, from: string, to: string): void {
  if (to === '') return;
  const rename = (list: string[]): string[] => list.map((item) => (key(item) === key(from) ? to : item));
  table.columns = table.columns.map((column) => (key(column.name) === key(from) ? { ...column, name: to } : column));
  table.primaryKey = rename(table.primaryKey);
  table.uniques = table.uniques.map(rename);
  table.foreignKeys = table.foreignKeys.map((fk) => ({ ...fk, columns: rename(fk.columns) }));
}

function toFound(table: Table, tableNamed: (name: string) => Table | undefined): FoundTable {
  const has = (list: readonly string[], name: string): boolean => list.some((item) => key(item) === key(name));
  const uniqueSets = [table.primaryKey, ...table.uniques].filter((set) => set.length > 0).map((set) => set.map(key).sort().join(','));
  const relations: FoundRelation[] = [];
  for (const { columns, table: target, references, source } of table.foreignKeys) {
    const referenced = tableNamed(target);
    const targetColumns = references ?? (referenced !== undefined && referenced.primaryKey.length > 0 ? referenced.primaryKey : undefined);
    const unique = uniqueSets.includes(columns.map(key).sort().join(','));
    const optional = columns.some((name) => {
      const column = table.columns.find((candidate) => key(candidate.name) === key(name));
      return column !== undefined && !column.notNull && !has(table.primaryKey, name);
    });
    columns.forEach((column, index) => {
      relations.push(
        relationOf(
          table.columns.find((candidate) => key(candidate.name) === key(column))?.name ?? column,
          { table: referenced?.name ?? target, column: targetColumns?.[index] ?? 'id' },
          { unique, optional },
          source,
          targetColumns === undefined ? 'inferred' : 'extracted',
        ),
      );
    });
  }
  return {
    name: table.name,
    origin: 'sql',
    columns: table.columns.map(
      ({ name, type, notNull }): ScanColumn =>
        scanColumn({
          name,
          type,
          pk: has(table.primaryKey, name),
          unique: table.uniques.some((set) => set.length === 1 && has(set, name)),
          optional: !notNull,
          fk: table.foreignKeys.some((fk) => has(fk.columns, name)),
        }),
    ),
    relations,
    source: { file: table.file, line: table.line },
    confidence: 'extracted',
  };
}

/** `CREATE [OR REPLACE] [TEMP...] TABLE [IF NOT EXISTS] name ( ... )`; `AS SELECT`, `LIKE` and `PARTITION OF` give nothing. */
function createTable(tokens: Token[], file: string): Table | undefined {
  let i = 1;
  if (isWord(tokens[i], 'OR') && isWord(tokens[i + 1], 'REPLACE')) i += 2;
  while (['TEMP', 'TEMPORARY', 'UNLOGGED', 'GLOBAL', 'LOCAL'].some((word) => isWord(tokens[i], word))) i++;
  if (!isWord(tokens[i], 'TABLE')) return undefined;
  i++;
  if (isWord(tokens[i], 'IF') && isWord(tokens[i + 1], 'NOT') && isWord(tokens[i + 2], 'EXISTS')) i += 3;
  const name = qualifiedName(tokens, i);
  if (name === undefined || tokens[name.end]?.text !== '(') return undefined;
  const table: Table = { name: name.name, file, line: (tokens[0] as Token).line, columns: [], primaryKey: [], uniques: [], foreignKeys: [] };
  for (const definition of split(tokens.slice(name.end + 1, closing(tokens, name.end)))) addDefinition(table, definition, file);
  return table;
}

/** Column definition or table constraint, as inside `CREATE TABLE (...)` or after `ALTER TABLE ... ADD`. */
/** `file`: of the statement, where a foreign key it declares is written. */
function addDefinition(table: Table, tokens: Token[], file: string): void {
  const source = { file, line: tokens[0]?.line ?? table.line };
  let i = 0;
  if (isWord(tokens[i], 'CONSTRAINT')) i += 2;
  const first = tokens[i];
  if (isWord(first, 'PRIMARY') && isWord(tokens[i + 1], 'KEY')) {
    table.primaryKey = names(tokens, i + 2);
  } else if (isWord(first, 'UNIQUE')) {
    table.uniques.push(names(tokens, i + 1));
  } else if (isWord(first, 'FOREIGN') && isWord(tokens[i + 1], 'KEY')) {
    const open = tokens.findIndex((token, index) => index > i && token.text === '(');
    const references = tokens.findIndex((token, index) => index > open && isWord(token, 'REFERENCES'));
    if (open < 0 || references < 0) return;
    const fk = foreignKey(tokens, references, names(tokens, open), source);
    if (fk !== undefined) table.foreignKeys.push(fk);
  } else if (i === 0 && first !== undefined && (first.kind === 'ident' || (first.kind === 'word' && !TABLE_CLAUSES.has(first.text.toUpperCase())))) {
    addColumn(table, tokens, source);
  }
}

/** Words that open a table-level clause rather than a column. */
const TABLE_CLAUSES = new Set(['CHECK', 'KEY', 'INDEX', 'FULLTEXT', 'SPATIAL', 'EXCLUDE', 'LIKE', 'PERIOD']);

/** Words that end a column's type. */
const COLUMN_CLAUSES = new Set([
  'CONSTRAINT', 'PRIMARY', 'NOT', 'NULL', 'UNIQUE', 'REFERENCES', 'DEFAULT', 'CHECK', 'COLLATE', 'GENERATED', 'AUTO_INCREMENT',
  'AUTOINCREMENT', 'IDENTITY', 'COMMENT', 'ON', 'AS', 'CHARSET', 'INVISIBLE', 'VISIBLE', 'STORED', 'VIRTUAL', 'ENCODE', 'KEY',
]);

function addColumn(table: Table, tokens: Token[], source: Source): void {
  let i = 1;
  const type: Token[] = [];
  for (let depth = 0; i < tokens.length; i++) {
    const token = tokens[i] as Token;
    const word = token.kind === 'word' ? token.text.toUpperCase() : '';
    if (depth === 0 && (COLUMN_CLAUSES.has(word) || (word === 'CHARACTER' && isWord(tokens[i + 1], 'SET')))) break;
    if (token.text === '(') depth++;
    else if (token.text === ')') depth--;
    type.push(token);
  }
  const name = (tokens[0] as Token).text;
  let notNull = false;
  for (let depth = 0; i < tokens.length; i++) {
    const token = tokens[i] as Token;
    if (token.text === '(') depth++;
    else if (token.text === ')') depth--;
    if (depth !== 0) continue;
    if (isWord(token, 'NOT') && isWord(tokens[i + 1], 'NULL')) notNull = true;
    else if (isWord(token, 'PRIMARY') && isWord(tokens[i + 1], 'KEY')) table.primaryKey = [name];
    else if (isWord(token, 'UNIQUE')) table.uniques.push([name]);
    else if (isWord(token, 'REFERENCES')) {
      const fk = foreignKey(tokens, i, [name], source);
      if (fk !== undefined) table.foreignKeys.push(fk);
    }
  }
  table.columns = [...table.columns.filter((column) => key(column.name) !== key(name)), { name, type: typeText(type), notNull }];
}

/** `REFERENCES table [(columns)]` starting at the `REFERENCES` token. */
function foreignKey(tokens: Token[], at: number, columns: string[], source: Source): ForeignKey | undefined {
  const target = qualifiedName(tokens, at + 1);
  if (target === undefined || columns.length === 0) return undefined;
  return { columns, table: target.name, references: tokens[target.end]?.text === '(' ? names(tokens, target.end) : undefined, source };
}

/** `a.b.c` from `at`: the last part is the name (schema prefixes are dropped). */
function qualifiedName(tokens: Token[], at: number): { name: string; end: number } | undefined {
  let i = at;
  let name: string | undefined;
  while (tokens[i]?.kind === 'word' || tokens[i]?.kind === 'ident') {
    name = (tokens[i] as Token).text;
    if (tokens[i + 1]?.text !== '.') return { name, end: i + 1 };
    i += 2;
  }
  return undefined;
}

/** Column names inside the parens at or after `from`, without sort orders or prefix lengths. */
function names(tokens: Token[], from: number): string[] {
  const open = tokens.findIndex((token, index) => index >= from && token.text === '(');
  if (open < 0) return [];
  return split(tokens.slice(open + 1, closing(tokens, open)))
    .map((part) => part[0])
    .filter((token): token is Token => token !== undefined && (token.kind === 'word' || token.kind === 'ident'))
    .map(({ text }) => text);
}

function typeText(tokens: Token[]): string {
  let text = '';
  for (const token of tokens) {
    const glue = text === '' || token.text === '(' || token.text === ')' || token.text === ',' || token.text === '[' || token.text === ']' || text.endsWith('(') || text.endsWith('[');
    text += `${glue ? '' : ' '}${token.text}${token.text === ',' ? ' ' : ''}`;
  }
  return text.replace(/ {2,}/g, ' ').replace(/, \)/g, ',)').trim();
}

/** Comma-separated parts outside parens. */
const split = (tokens: Token[]): Token[][] => splitBy(tokens, PARENS);

/** Index of the `)` closing the `(` at `open`, or the end (an unclosed list runs to the end of the statement). */
const closing = (tokens: Token[], open: number): number => closingOf(tokens, open, PARENS) ?? tokens.length;

const isWord = (token: Token | undefined, word: string): boolean => token?.kind === 'word' && token.text.toUpperCase() === word;

function statements(tokens: Token[]): Token[][] {
  const result: Token[][] = [[]];
  for (const token of tokens) {
    if (token.text === ';' && token.kind === 'punct') result.push([]);
    else result[result.length - 1]?.push(token);
  }
  return result.filter((statement) => statement.length > 0);
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let i = 0;
  /** Moves `i` to `end`, counting the line breaks skipped. */
  const skipTo = (end: number): void => {
    for (; i < end && i < text.length; i++) if (text[i] === '\n') line++;
    i = Math.min(end, text.length);
  };
  while (i < text.length) {
    const char = text[i] as string;
    const next = text[i + 1];
    if (/\s/.test(char)) {
      skipTo(i + 1);
    } else if ((char === '-' && next === '-') || char === '#') {
      const end = text.indexOf('\n', i);
      skipTo(end < 0 ? text.length : end);
    } else if (char === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      skipTo(end < 0 ? text.length : end + 2);
    } else if (char === "'" || char === '"' || char === '`' || (char === '[' && next !== undefined && /[A-Za-z_]/.test(next))) {
      const close = char === '[' ? ']' : char;
      let end = i + 1;
      while (end < text.length && !(text[end] === close && text[end + 1] !== close)) end += text[end] === close ? 2 : 1;
      const start = line;
      tokens.push({ text: text.slice(i + 1, end).replaceAll(close + close, close), line: start, kind: char === "'" ? 'string' : 'ident' });
      skipTo(end + 1);
    } else if (char === '$' && /^\$[A-Za-z_]*\$/.test(text.slice(i, i + 64))) {
      const tag = (/^\$[A-Za-z_]*\$/.exec(text.slice(i, i + 64)) as RegExpExecArray)[0];
      const end = text.indexOf(tag, i + tag.length);
      tokens.push({ text: '', line, kind: 'string' });
      skipTo(end < 0 ? text.length : end + tag.length);
    } else if (/[\w$]/.test(char)) {
      let end = i + 1;
      while (end < text.length && /[\w$]/.test(text[end] as string)) end++;
      tokens.push({ text: text.slice(i, end), line, kind: 'word' });
      i = end;
    } else {
      tokens.push({ text: char, line, kind: 'punct' });
      i++;
    }
  }
  return tokens;
}
