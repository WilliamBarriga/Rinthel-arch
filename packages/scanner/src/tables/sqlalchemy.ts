/**
 * SQLAlchemy models, read from the Python syntax tree (files that mention `sqlalchemy`; nothing is imported or run).
 * Tables are classes with a literal `__tablename__` and module-level `Table('name', metadata, Column(...), ...)`.
 * Columns come from `Column(...)` and `mapped_column(...)`: name (first string or the attribute), type (the first type
 * argument, else the `Mapped[...]` annotation), `primary_key`, `unique`, `nullable` (else the annotation's `Optional`
 * or `| None`; a column without annotation is nullable, a primary key is not) and `ForeignKey('table.column')` or
 * `ForeignKey(Model.attr)`. A foreign key that does not resolve leaves the table `inferred`. Not read:
 * `__table_args__` constraints, `declared_attr` names, `relationship()`.
 */
import type { ScanColumn } from '../draft';
import type { FoundRelation, FoundTable, SchemaFile, TableExtractor } from '.';
import type { SyntaxNode } from '../tree-sitter';
import { type Call, boolOf, callOf, classesOf, lastSegment, loadPython, stringOf } from './python-ast';
import { relationOf, scanColumn } from './relation';

export const sqlalchemy: TableExtractor = {
  origin: 'sqlalchemy',
  matches: (path) => path.endsWith('.py'),
  async load() {
    const python = await loadPython();
    return (files) => {
      const tables = files.flatMap((file) => (/sqlalchemy/i.test(file.text) ? (python.parse(file.text, (root) => readTables(root, file)) ?? []) : []));
      return tables.map((table) => toFound(table, tables));
    };
  },
};

type Target = { table: string; column: string } | { model: string; attr: string } | undefined;

interface Column {
  attr: string;
  line: number;
  name: string;
  type: string;
  pk: boolean;
  unique: boolean;
  optional: boolean;
  foreignKey: Target | 'unresolved' | undefined;
}

interface Table {
  name: string;
  className: string | undefined;
  file: string;
  line: number;
  columns: Column[];
}

const COLUMN_CALLS = new Set(['Column', 'mapped_column']);
const NOT_TYPES = new Set(['ForeignKey', 'Sequence', 'Identity', 'Computed', 'FetchedValue', 'CheckConstraint', 'UniqueConstraint', 'Index', 'PrimaryKeyConstraint']);

function readTables(root: SyntaxNode, file: SchemaFile): Table[] {
  const tables: Table[] = [];
  for (const pyClass of classesOf(root)) {
    const name = stringOf(pyClass.assignments.find((assignment) => assignment.name === '__tablename__')?.value);
    if (name === undefined) continue;
    const columns = pyClass.assignments.flatMap(({ name: attr, annotation, value, line }) => {
      const call = callOf(value);
      return call !== undefined && COLUMN_CALLS.has(call.last) ? [readColumn(call, attr, annotation, line)] : [];
    });
    tables.push({ name, className: pyClass.name, file: file.path, line: pyClass.line, columns });
  }
  for (const statement of root.namedChildren) {
    const assignment = statement?.type === 'expression_statement' ? statement.namedChildren[0] : undefined;
    const call = assignment?.type === 'assignment' ? callOf(assignment.childForFieldName('right')) : undefined;
    const name = stringOf(call?.args[0]);
    if (statement === null || statement === undefined || call?.last !== 'Table' || name === undefined) continue;
    const columns = call.args.flatMap((arg) => {
      const column = callOf(arg);
      return column !== undefined && COLUMN_CALLS.has(column.last) ? [readColumn(column, '', undefined, arg.startPosition.row + 1)] : [];
    });
    tables.push({ name, className: undefined, file: file.path, line: statement.startPosition.row + 1, columns });
  }
  return tables;
}

function readColumn(call: Call, attr: string, annotation: string | undefined, line: number): Column {
  const explicit = stringOf(call.args[0]);
  const named = call.args.filter((arg) => stringOf(arg) === undefined);
  const typeNode = call.kwargs.get('type_') ?? named.find((arg) => !NOT_TYPES.has(callOf(arg)?.last ?? lastSegment(arg.text)));
  const fromAnnotation = annotationOf(annotation);
  const pk = boolOf(call.kwargs.get('primary_key')) === true;
  const nullable = boolOf(call.kwargs.get('nullable'));
  const foreignKey = named.map((arg) => callOf(arg)).find((inner) => inner?.last === 'ForeignKey');
  return {
    attr,
    line,
    name: stringOf(call.kwargs.get('name')) ?? explicit ?? attr,
    type: typeNode === undefined ? (fromAnnotation?.type ?? 'unknown') : (callOf(typeNode)?.last ?? lastSegment(typeNode.text)),
    pk,
    unique: boolOf(call.kwargs.get('unique')) === true,
    optional: !pk && (nullable ?? fromAnnotation?.optional ?? annotation === undefined),
    foreignKey: foreignKey === undefined ? undefined : targetOf(foreignKey.args[0]),
  };
}

/** `Mapped[Optional[str]]` gives `str`, optional; `Mapped[int | None]` the same. */
function annotationOf(annotation: string | undefined): { type: string; optional: boolean } | undefined {
  if (annotation === undefined) return undefined;
  let inner = (/^(?:\w+\.)?Mapped\[([\s\S]*)\]$/.exec(annotation.trim()) ?? [])[1];
  if (inner === undefined) return undefined;
  let optional = false;
  const wrapped = /^(?:typing\.)?Optional\[([\s\S]*)\]$/.exec(inner);
  if (wrapped !== null) {
    inner = wrapped[1] as string;
    optional = true;
  }
  const union = /^([\s\S]*?)\s*\|\s*None$/.exec(inner) ?? /^None\s*\|\s*([\s\S]*)$/.exec(inner);
  if (union !== null) {
    inner = union[1] as string;
    optional = true;
  }
  return { type: lastSegment(inner.trim()), optional };
}

/** `'users.id'` (also `'schema.users.id'`) or `User.id`. */
function targetOf(node: SyntaxNode | undefined): Target | 'unresolved' {
  const text = stringOf(node);
  if (text !== undefined) {
    const parts = text.split('.');
    return parts.length < 2 ? 'unresolved' : { table: parts[parts.length - 2] as string, column: parts[parts.length - 1] as string };
  }
  const model = node?.type === 'attribute' ? node.childForFieldName('object')?.text : undefined;
  const attr = node?.type === 'attribute' ? node.childForFieldName('attribute')?.text : undefined;
  return model !== undefined && attr !== undefined ? { model, attr } : 'unresolved';
}

function toFound(table: Table, all: readonly Table[]): FoundTable {
  const pks = table.columns.filter((column) => column.pk).length;
  const relations: FoundRelation[] = [];
  let certain = table.columns.every((column) => column.type !== 'unknown');
  const columns = table.columns.map((column): ScanColumn => {
    if (column.foreignKey !== undefined) {
      const target = resolve(column.foreignKey, all);
      if (target === undefined) certain = false;
      else relations.push(relationOf(column.name, target, { unique: column.unique || (column.pk && pks === 1), optional: column.optional }, { file: table.file, line: column.line }));
    }
    const { name, type, pk, unique, optional } = column;
    return scanColumn({ name, type, pk, unique, optional, fk: column.foreignKey !== undefined });
  });
  return { name: table.name, origin: 'sqlalchemy', columns, relations, source: { file: table.file, line: table.line }, confidence: certain ? 'extracted' : 'inferred' };
}

function resolve(target: Target | 'unresolved', all: readonly Table[]): { table: string; column: string } | undefined {
  if (target === undefined || target === 'unresolved') return undefined;
  if ('table' in target) return target;
  const model = all.find((table) => table.className === target.model);
  if (model === undefined) return undefined;
  return { table: model.name, column: model.columns.find((column) => column.attr === target.attr)?.name ?? target.attr };
}
