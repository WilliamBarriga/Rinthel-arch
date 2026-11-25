/**
 * Drizzle schemas (`pgTable`, `mysqlTable`, `sqliteTable`, `singlestoreTable`, `pgSchema(...).table`), read from the
 * TypeScript syntax tree: the file is never imported or run. A table is named by the string literal of its call; a
 * column by the literal of its builder (`varchar('email')`) or, as Drizzle does, by its key; its type is the builder's
 * name. `.primaryKey()`, `.notNull()`, `.unique()`, `.array()` and `.references(() => t.col)` are read, as is a
 * `primaryKey({ columns })` of the extra-config callback. References resolve against the tables of every file by
 * variable name, preferring the same file. A table whose columns cannot all be read (spreads, helper calls) is
 * `inferred`, and an unreadable column has type `unknown`. Not read: `foreignKey()`, `unique().on()`, `relations()`.
 */
import type { ScanColumn } from '../draft';
import { type SyntaxNode, loadTypescriptSyntax } from '../tree-sitter';
import type { FoundRelation, FoundTable, SchemaFile, TableExtractor } from '.';
import { relationOf, scanColumn } from './relation';

const FACTORY = /^(?:pg|mysql|sqlite|singlestore)Table$/;

export const drizzle: TableExtractor = {
  origin: 'drizzle',
  matches: (path) => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(path) && !path.endsWith('.d.ts'),
  async load() {
    const syntaxFor = await loadTypescriptSyntax();
    return (files) => {
      const tables = files.flatMap((file) => {
        if (!file.text.includes('drizzle-orm')) return [];
        return syntaxFor(file.path).parse(file.text, (root) => readTables(root, file)) ?? [];
      });
      return tables.map((table) => toFound(table, tables));
    };
  },
};

interface Reference {
  variable: string;
  key: string;
}

interface Column {
  key: string;
  name: string;
  type: string;
  pk: boolean;
  unique: boolean;
  notNull: boolean;
  reference: Reference | undefined;
}

interface Table {
  name: string;
  variable: string | undefined;
  file: string;
  line: number;
  columns: Column[];
  /** Keys of the columns of a `primaryKey({ columns })` in the extra config. */
  primaryKeys: string[];
  certain: boolean;
}

/** Names a file imports from `drizzle-orm/...`: the column builders it can use bare. */
function drizzleImports(root: SyntaxNode): Set<string> {
  const names = new Set<string>();
  for (const statement of root.descendantsOfType('import_statement')) {
    if (!stringOf(statement?.childForFieldName('source'))?.startsWith('drizzle-orm')) continue;
    for (const specifier of statement?.descendantsOfType('import_specifier') ?? []) {
      const name = specifier?.childForFieldName('alias') ?? specifier?.childForFieldName('name');
      if (name !== null && name !== undefined) names.add(name.text);
    }
  }
  return names;
}

function readTables(root: SyntaxNode, file: SchemaFile): Table[] {
  const tables: Table[] = [];
  const imported = drizzleImports(root);
  for (const call of root.descendantsOfType('call_expression')) {
    if (call === null || !isTableCall(call)) continue;
    const args = argsOf(call);
    const name = stringOf(args[0]);
    if (name === undefined) continue;
    const parent = call.parent;
    const variable = parent?.type === 'variable_declarator' ? parent.childForFieldName('name')?.text : undefined;
    const table: Table = { name, variable, file: file.path, line: call.startPosition.row + 1, columns: [], primaryKeys: [], certain: true };
    const body = objectOf(args[1]);
    if (body === undefined) table.certain = false;
    else readColumns(body, table, imported);
    for (const inner of args[2]?.descendantsOfType('call_expression') ?? []) {
      if (inner === null || inner.childForFieldName('function')?.text !== 'primaryKey') continue;
      const pair = objectOf(argsOf(inner)[0])?.namedChildren.find((member) => member?.type === 'pair' && keyOf(member) === 'columns');
      for (const member of pair?.childForFieldName('value')?.descendantsOfType('member_expression') ?? []) {
        const key = member?.childForFieldName('property')?.text;
        if (key !== undefined) table.primaryKeys.push(key);
      }
    }
    tables.push(table);
  }
  return tables;
}

function isTableCall(call: SyntaxNode): boolean {
  const fn = call.childForFieldName('function');
  if (fn?.type === 'identifier') return FACTORY.test(fn.text);
  return fn?.type === 'member_expression' && fn.childForFieldName('property')?.text === 'table' && fn.childForFieldName('object')?.type === 'call_expression';
}

const argsOf = (call: SyntaxNode): (SyntaxNode | undefined)[] => call.childForFieldName('arguments')?.namedChildren ?? [];

/** The object literal of a node, or of the arrow function (or `return`) that yields it: `(t) => ({ ... })`. */
function objectOf(node: SyntaxNode | undefined | null): SyntaxNode | undefined {
  if (node === undefined || node === null) return undefined;
  if (node.type === 'object') return node;
  if (node.type === 'parenthesized_expression') return objectOf(node.namedChildren[0]);
  if (node.type === 'arrow_function') {
    const body = node.childForFieldName('body');
    if (body?.type === 'statement_block') return objectOf(body.descendantsOfType('return_statement')[0]?.namedChildren[0]);
    return objectOf(body);
  }
  return undefined;
}

function readColumns(body: SyntaxNode, table: Table, imported: ReadonlySet<string>): void {
  for (const member of body.namedChildren) {
    if (member === null || member.type === 'comment') continue;
    const key = member.type === 'pair' ? keyOf(member) : undefined;
    if (key === undefined) {
      table.certain = false;
      continue;
    }
    const column = readColumn(key, member.childForFieldName('value'), imported);
    if (column === undefined) table.certain = false;
    table.columns.push(column ?? { key, name: key, type: 'unknown', pk: false, unique: false, notNull: false, reference: undefined });
  }
}

function keyOf(pair: SyntaxNode): string | undefined {
  const key = pair.childForFieldName('key');
  return key?.type === 'string' ? stringOf(key) : key?.type === 'property_identifier' ? key.text : undefined;
}

function stringOf(node: SyntaxNode | undefined | null): string | undefined {
  if (node === undefined || node === null || node.type !== 'string') return undefined;
  return node.namedChildren.find((child) => child?.type === 'string_fragment')?.text ?? '';
}

/** `serial('id').primaryKey()`: a chain of calls, from the outermost modifier in to the builder. */
function readColumn(key: string, value: SyntaxNode | null, imported: ReadonlySet<string>): Column | undefined {
  const column: Column = { key, name: key, type: '', pk: false, unique: false, notNull: false, reference: undefined };
  let node = value;
  let array = false;
  while (node?.type === 'call_expression') {
    const fn = node.childForFieldName('function');
    const args = argsOf(node);
    if (fn?.type === 'member_expression' && fn.childForFieldName('object')?.type === 'call_expression') {
      const modifier = fn.childForFieldName('property')?.text;
      if (modifier === 'primaryKey') column.pk = true;
      else if (modifier === 'notNull') column.notNull = true;
      else if (modifier === 'unique') column.unique = true;
      else if (modifier === 'array') array = true;
      else if (modifier === 'references') column.reference = referenceOf(args[0]);
      node = fn.childForFieldName('object');
      continue;
    }
    // A bare builder must come from drizzle-orm; `t.integer()` (the callback form) is a method of the table's helper.
    const builder = fn?.type === 'member_expression' ? fn.childForFieldName('property') : fn;
    if (builder === null || builder === undefined || (builder.type !== 'identifier' && builder.type !== 'property_identifier')) return undefined;
    if (builder.type === 'identifier' && !imported.has(builder.text)) return undefined;
    column.type = array ? `${builder.text}[]` : builder.text;
    column.name = stringOf(args[0]) ?? key;
    return column;
  }
  return undefined;
}

/** `() => users.id` (also with a return type or a block body). */
function referenceOf(arrow: SyntaxNode | undefined): Reference | undefined {
  if (arrow?.type !== 'arrow_function') return undefined;
  let body = arrow.childForFieldName('body');
  if (body?.type === 'statement_block') body = body.descendantsOfType('return_statement')[0]?.namedChildren[0] ?? null;
  while (body?.type === 'parenthesized_expression') body = body.namedChildren[0] ?? null;
  const variable = body?.childForFieldName('object');
  const key = body?.childForFieldName('property');
  if (body?.type !== 'member_expression' || variable?.type !== 'identifier' || key === null || key === undefined) return undefined;
  return { variable: variable.text, key: key.text };
}

function toFound(table: Table, all: readonly Table[]): FoundTable {
  const pks = new Set([...table.columns.filter((column) => column.pk).map((column) => column.key), ...table.primaryKeys]);
  const relations: FoundRelation[] = [];
  const columns = table.columns.map((column): ScanColumn => {
    const pk = pks.has(column.key);
    if (column.reference !== undefined) {
      const target = targetOf(column.reference, table, all);
      relations.push(
        relationOf(
          column.name,
          target ?? { table: column.reference.variable, column: column.reference.key },
          { unique: column.unique || (pk && pks.size === 1), optional: !column.notNull && !pk },
          target === undefined ? 'inferred' : 'extracted',
        ),
      );
    }
    return scanColumn({
      name: column.name,
      type: column.type,
      pk,
      unique: column.unique,
      optional: !column.notNull,
      fk: column.reference !== undefined,
    });
  });
  return {
    name: table.name,
    origin: 'drizzle',
    columns,
    relations,
    source: { file: table.file, line: table.line },
    confidence: table.certain ? 'extracted' : 'inferred',
  };
}

/** The table (by database name) and column a reference points at. */
function targetOf(reference: Reference, from: Table, all: readonly Table[]): { table: string; column: string } | undefined {
  const candidates = all.filter((table) => table.variable === reference.variable);
  const table = candidates.find((candidate) => candidate.file === from.file) ?? candidates[0];
  if (table === undefined) return undefined;
  return { table: table.name, column: table.columns.find((column) => column.key === reference.key)?.name ?? reference.key };
}
