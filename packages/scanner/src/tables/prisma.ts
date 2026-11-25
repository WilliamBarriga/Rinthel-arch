/**
 * Prisma schemas (`*.prisma`), read by hand: no dependency (see `research/escaner-esquemas`). `model` blocks become
 * tables named by `@@map`; scalar and enum fields become columns named by `@map`; relation fields (typed with another
 * model) give the fk columns and the relations. Models resolve across every `.prisma` file of the scan, so multi-file
 * schemas work. Not read: `view` and composite `type` blocks, implicit many-to-many join tables.
 */
import type { ScanColumn } from '../draft';
import type { FoundRelation, FoundTable, SchemaFile, TableExtractor } from '.';
import { relationOf, scanColumn } from './relation';
import { BRACES, PARENS_AND_BRACKETS, type Token as Shared, closing, split } from './tokens';

export const prisma: TableExtractor = {
  origin: 'prisma',
  matches: (path) => path.endsWith('.prisma'),
  load: () => Promise.resolve(readPrisma),
};

/** `string` for `"..."` literals (text without quotes). */
type Token = Shared<'word' | 'string' | 'punct'>;

interface Attribute {
  /** `id`, `unique`, `relation`, `map`, `db.VarChar`... */
  name: string;
  args: Argument[];
}

/** `key: value` or a positional value; arrays keep their words. */
interface Argument {
  key?: string;
  words: string[];
  string?: string;
}

interface Field {
  name: string;
  line: number;
  type: string;
  optional: boolean;
  list: boolean;
  attributes: Attribute[];
}

interface Model {
  name: string;
  file: string;
  line: number;
  fields: Field[];
  blockAttributes: Attribute[];
}

function readPrisma(files: readonly SchemaFile[]): FoundTable[] {
  const models = files.flatMap((file) => readModels(file));
  const byName = new Map<string, Model[]>();
  for (const model of models) byName.set(model.name, [...(byName.get(model.name) ?? []), model]);
  const folder = (path: string): string => path.slice(0, Math.max(path.lastIndexOf('/'), 0));
  /** A model by name, preferring the same folder (one schema per folder in a monorepo). */
  const modelNamed = (name: string, from: Model): Model | undefined => {
    const candidates = byName.get(name) ?? [];
    return candidates.find((model) => folder(model.file) === folder(from.file)) ?? candidates[0];
  };
  return models.map((model) => toTable(model, (name) => modelNamed(name, model)));
}

function toTable(model: Model, modelNamed: (name: string) => Model | undefined): FoundTable {
  const relationFields = model.fields.filter((field) => modelNamed(field.type) !== undefined);
  const scalars = model.fields.filter((field) => !relationFields.includes(field));
  const fieldsOf = (attribute: Attribute | undefined): string[] =>
    (attribute?.args.find((arg) => arg.key === 'fields') ?? attribute?.args.find((arg) => arg.key === undefined))?.words ?? [];
  const blockAttributes = (name: string): Attribute[] => model.blockAttributes.filter((attribute) => attribute.name === name);
  const pks = new Set([
    ...scalars.filter((field) => has(field, 'id')).map((field) => field.name),
    ...blockAttributes('id').flatMap((attribute) => fieldsOf(attribute)),
  ]);
  const uniques = new Set([
    ...scalars.filter((field) => has(field, 'unique')).map((field) => field.name),
    ...blockAttributes('unique').map(fieldsOf).filter((names) => names.length === 1).flat(),
  ]);
  /** Field sets whose values are unique: single `@id`/`@unique` fields and `@@id`/`@@unique` lists. */
  const uniqueSets = new Set([
    ...scalars.filter((field) => has(field, 'id') || has(field, 'unique')).map((field) => field.name),
    ...[...blockAttributes('unique'), ...blockAttributes('id')].map((attribute) => fieldsOf(attribute).sort().join(',')),
  ]);

  const relations: FoundRelation[] = [];
  const fks = new Set<string>();
  for (const field of relationFields) {
    const relation = field.attributes.find((attribute) => attribute.name === 'relation');
    const keys = relation?.args.find((arg) => arg.key === 'fields')?.words ?? [];
    const references = relation?.args.find((arg) => arg.key === 'references')?.words ?? [];
    const target = modelNamed(field.type);
    if (target === undefined || keys.length === 0) continue;
    const unique = uniqueSets.has([...keys].sort().join(','));
    keys.forEach((key, index) => {
      fks.add(key);
      const referenced = references[index];
      if (referenced === undefined) return;
      relations.push(
        relationOf(columnName(model, key), { table: tableName(target), column: columnName(target, referenced) }, { unique, optional: field.optional }, { file: model.file, line: field.line }),
      );
    });
  }

  return {
    name: tableName(model),
    origin: 'prisma',
    columns: scalars.map(
      (field): ScanColumn =>
        scanColumn({
          name: columnName(model, field.name),
          type: field.list ? `${field.type}[]` : field.type,
          pk: pks.has(field.name),
          unique: uniques.has(field.name),
          optional: field.optional,
          fk: fks.has(field.name),
        }),
    ),
    relations,
    source: { file: model.file, line: model.line },
    confidence: 'extracted',
  };
}

const has = (field: Field, attribute: string): boolean => field.attributes.some(({ name }) => name === attribute);
const mapped = (attributes: Attribute[]): string | undefined => attributes.find(({ name }) => name === 'map')?.args[0]?.string;
const tableName = (model: Model): string => mapped(model.blockAttributes) ?? model.name;
function columnName(model: Model, field: string): string {
  const found = model.fields.find(({ name }) => name === field);
  return (found === undefined ? undefined : mapped(found.attributes)) ?? field;
}

/** `model` blocks of one file. A block that does not parse is skipped, the rest of the file still counts. */
function readModels(file: SchemaFile): Model[] {
  const tokens = tokenize(file.text);
  const models: Model[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i + 2];
    if (tokens[i]?.text !== 'model' || tokens[i + 1]?.kind !== 'word' || open?.text !== '{') continue;
    const end = closing(tokens, i + 2, BRACES) ?? tokens.length;
    const model: Model = { name: (tokens[i + 1] as Token).text, file: file.path, line: (tokens[i] as Token).line, fields: [], blockAttributes: [] };
    for (const statement of lines(tokens.slice(i + 3, end))) readStatement(statement, model);
    models.push(model);
    i = end;
  }
  return models;
}

/** Splits a block body into its lines (Prisma's statements); a line continues while a paren or bracket is open. */
function lines(tokens: Token[]): Token[][] {
  const result: Token[][] = [];
  let depth = 0;
  let line = -1;
  for (const token of tokens) {
    if (depth === 0 && token.line !== line) result.push([]);
    line = token.line;
    result[result.length - 1]?.push(token);
    if (token.text === '(' || token.text === '[') depth++;
    else if ((token.text === ')' || token.text === ']') && depth > 0) depth--;
  }
  return result;
}

function readStatement(tokens: Token[], model: Model): void {
  const [first, second] = tokens;
  if (first?.text === '@' && second?.text === '@') {
    const [attribute] = attributes(tokens.slice(1));
    if (attribute !== undefined) model.blockAttributes.push(attribute);
    return;
  }
  if (first?.kind !== 'word' || second?.kind !== 'word') return;
  let i = 2;
  if (tokens[i]?.text === '(') i = closingOrLast(tokens, i) + 1;
  const list = tokens[i]?.text === '[' && tokens[i + 1]?.text === ']';
  if (list) i += 2;
  const optional = tokens[i]?.text === '?';
  if (optional) i++;
  model.fields.push({ name: first.text, line: first.line, type: second.text, optional, list, attributes: attributes(tokens.slice(i)) });
}

/** `@name(args)` and `@group.name(args)` in order; `tokens` starts at an `@`. */
function attributes(tokens: Token[]): Attribute[] {
  const result: Attribute[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i]?.text !== '@' || tokens[i + 1]?.kind !== 'word') {
      i++;
      continue;
    }
    let name = (tokens[i + 1] as Token).text;
    i += 2;
    while (tokens[i]?.text === '.' && tokens[i + 1]?.kind === 'word') {
      name += `.${(tokens[i + 1] as Token).text}`;
      i += 2;
    }
    let args: Argument[] = [];
    if (tokens[i]?.text === '(') {
      const end = closingOrLast(tokens, i);
      args = argumentsOf(tokens.slice(i + 1, end));
      i = end + 1;
    }
    result.push({ name, args });
  }
  return result;
}

/** Top-level comma-separated arguments; nested calls (`sort: Desc`, `ids(...)`) only keep their words. */
function argumentsOf(tokens: Token[]): Argument[] {
  return split(tokens, PARENS_AND_BRACKETS).map((current): Argument => {
    const keyed = current[1]?.text === ':' && current[0]?.kind === 'word';
    const value = keyed ? current.slice(2) : current;
    const string = value[0]?.kind === 'string' && value.length === 1 ? value[0].text : undefined;
    const words = value.filter((token, index) => token.kind === 'word' && value[index + 1]?.text !== '(' && value[index + 1]?.text !== ':').map(({ text }) => text);
    return { ...(keyed ? { key: (current[0] as Token).text } : {}), words, ...(string === undefined ? {} : { string }) };
  });
}

/** Index of the token closing the paren or bracket at `open`, or the last index (an unclosed list ends the line). */
const closingOrLast = (tokens: Token[], open: number): number => closing(tokens, open, PARENS_AND_BRACKETS) ?? tokens.length - 1;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let i = 0;
  while (i < text.length) {
    const char = text[i] as string;
    if (char === '\n') {
      line++;
      i++;
    } else if (/\s/.test(char)) {
      i++;
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (char === '"') {
      let end = i + 1;
      while (end < text.length && text[end] !== '"' && text[end] !== '\n') end += text[end] === '\\' ? 2 : 1;
      tokens.push({ text: text.slice(i + 1, end), line, kind: 'string' });
      i = end + 1;
    } else if (/[\w-]/.test(char)) {
      let end = i + 1;
      while (end < text.length && /[\w-]/.test(text[end] as string)) end++;
      tokens.push({ text: text.slice(i, end), line, kind: 'word' });
      i = end;
    } else {
      tokens.push({ text: char, line, kind: 'punct' });
      i++;
    }
  }
  return tokens;
}
