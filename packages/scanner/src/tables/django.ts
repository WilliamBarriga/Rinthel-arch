/**
 * Django models (`models.py` and `models/*.py`), read from the Python syntax tree: nothing is imported or run, so
 * settings and installed apps are never needed. A class is a model if it extends `models.Model` or another model
 * (by class name, across files); abstract models only lend their fields, proxy models make no table. The table is
 * `Meta.db_table` or `<app>_<model>` (the app is the folder of `models`), and an implicit `id` AutoField is added when
 * no field is a primary key. `ForeignKey` and `OneToOneField` give `<field>_id` (or `db_column`) with a relation to
 * the target's primary key (or `to_field`); `ManyToManyField` gives its join table. Targets are `Model`, `'Model'`,
 * `'app.Model'` and `'self'`; one that does not resolve is named `<app>_<model>` and the relation is `inferred`.
 * Not read: migrations, `through` tables, `GenericForeignKey`, multi-table inheritance links.
 */
import type { ScanColumn } from '../draft';
import type { FoundRelation, FoundTable, SchemaFile, TableExtractor } from '.';
import { type PlainCall, type PyClass, boolOf, callOf, classesOf, lastSegment, loadPython, plain, stringOf } from './python-ast';
import { relationOf } from './relation';

export const django: TableExtractor = {
  origin: 'django',
  matches: (path) => /(?:^|\/)models\.py$/.test(path) || /(?:^|\/)models\/[^/]+\.py$/.test(path),
  async load() {
    const python = await loadPython();
    return (files) => {
      const classes = files.flatMap((file) => (/\bModel\b/.test(file.text) ? (python.parse(file.text, (root) => classesOf(root).map((pyClass) => toModel(pyClass, file))) ?? []) : []));
      return build(resolveModels(classes));
    };
  },
};

interface Field {
  attr: string;
  /** `CharField`, `ForeignKey`... */
  kind: string;
  call: PlainCall;
}

interface Model {
  name: string;
  app: string;
  file: string;
  line: number;
  bases: string[];
  fields: Field[];
  dbTable: string | undefined;
  abstract: boolean;
  proxy: boolean;
  /** Set by `resolveModels`: true if it descends from `models.Model`. */
  isModel: boolean;
}

const RELATIONS = new Set(['ForeignKey', 'OneToOneField', 'ManyToManyField']);

function toModel(pyClass: PyClass, file: SchemaFile): Model {
  const meta = pyClass.nested.get('Meta');
  const metaValue = (name: string) => meta?.assignments.find((assignment) => assignment.name === name)?.value;
  const parts = file.path.split('/');
  const folder = parts.lastIndexOf('models') > 0 ? parts.slice(0, parts.lastIndexOf('models')) : parts.slice(0, -1);
  return {
    name: pyClass.name,
    app: folder[folder.length - 1] ?? '',
    file: file.path,
    line: pyClass.line,
    bases: pyClass.bases,
    fields: pyClass.assignments.flatMap(({ name, value }): Field[] => {
      const call = callOf(value);
      const kind = call?.last ?? '';
      return call !== undefined && (kind.endsWith('Field') || kind === 'ForeignKey') && kind !== 'GenericForeignKey' ? [{ attr: name, kind, call: plain(call) }] : [];
    }),
    dbTable: stringOf(metaValue('db_table')),
    abstract: boolOf(metaValue('abstract')) === true,
    proxy: boolOf(metaValue('proxy')) === true,
    isModel: false,
  };
}

/** Marks which classes are models: those that extend `Model` or, transitively, another model of the scan. */
function resolveModels(models: Model[]): Model[] {
  for (let changed = true; changed; ) {
    changed = false;
    for (const model of models) {
      if (model.isModel) continue;
      if (model.bases.some((base) => lastSegment(base) === 'Model' || models.some((other) => other.isModel && other.name === lastSegment(base)))) {
        model.isModel = true;
        changed = true;
      }
    }
  }
  return models.filter((model) => model.isModel);
}

const tableName = (model: Model): string => model.dbTable ?? (model.app === '' ? model.name.toLowerCase() : `${model.app}_${model.name.toLowerCase()}`);

function build(models: Model[]): FoundTable[] {
  /** Parent models by class name, same file first. */
  const parentsOf = (model: Model): Model[] =>
    model.bases.flatMap((base) => {
      const candidates = models.filter((other) => other !== model && other.name === lastSegment(base));
      const parent = candidates.find((other) => other.file === model.file) ?? candidates[0];
      return parent === undefined ? [] : [parent];
    });
  /** Own fields after those of abstract parents (recursively). */
  const fieldsOf = (model: Model, seen: Set<Model> = new Set()): { owner: Model; field: Field }[] => {
    if (seen.has(model)) return [];
    seen.add(model);
    return [
      ...parentsOf(model).filter((parent) => parent.abstract).flatMap((parent) => fieldsOf(parent, seen)),
      ...model.fields.map((field) => ({ owner: model, field })),
    ];
  };
  const isPk = (field: Field): boolean => field.call.kwargs.get('primary_key')?.bool === true;
  const columnNameOf = (field: Field): string => field.call.kwargs.get('db_column')?.string ?? (RELATIONS.has(field.kind) ? `${field.attr}_id` : field.attr);

  /** Primary key column of a model: name and type. */
  const pkOf = (model: Model, depth = 0): { name: string; type: string } => {
    const own = fieldsOf(model).find(({ field }) => isPk(field));
    if (own === undefined) return { name: 'id', type: 'AutoField' };
    if (!RELATIONS.has(own.field.kind) || depth > 5) return { name: columnNameOf(own.field), type: own.field.kind };
    const target = targetOf(own.field, own.owner);
    return { name: columnNameOf(own.field), type: target === undefined ? own.field.kind : pkOf(target.model, depth + 1).type };
  };

  /** The model a relation field points at (null for `self`-less unresolvable text) and the app/name as written. */
  function targetOf(field: Field, from: Model): { model: Model; written: string } | undefined {
    const node = field.call.args[0] ?? field.call.kwargs.get('to');
    const written = node?.string ?? node?.text;
    if (written === undefined) return undefined;
    if (written === 'self') return { model: from, written: from.name };
    const [app, name] = written.includes('.') ? [written.slice(0, written.lastIndexOf('.')), lastSegment(written)] : [undefined, written];
    const candidates = models.filter((model) => model.name === name && !model.abstract && (app === undefined || model.app === lastSegment(app) || node?.string === undefined));
    const model = candidates.find((candidate) => candidate.app === from.app) ?? candidates.find((candidate) => candidate.file === from.file) ?? candidates[0];
    return model === undefined ? undefined : { model, written };
  }

  const found: FoundTable[] = [];
  for (const model of models) {
    if (model.abstract || model.proxy) continue;
    const columns: ScanColumn[] = [];
    const relations: FoundRelation[] = [];
    let certain = true;
    const fields = fieldsOf(model);
    if (!fields.some(({ field }) => isPk(field))) columns.push({ name: 'id', type: 'AutoField', pk: true });
    for (const { owner, field } of fields) {
      const { call, kind } = field;
      const pk = isPk(field);
      const optional = call.kwargs.get('null')?.bool === true && !pk;
      if (kind === 'ManyToManyField') {
        if (call.kwargs.has('through')) continue;
        const target = targetOf(field, owner);
        if (target === undefined) {
          certain = false;
          continue;
        }
        found.push(joinTable(model, field, target.model, pkOf(model), pkOf(target.model), tableName(model)));
        continue;
      }
      const column: ScanColumn = { name: columnNameOf(field), type: kind };
      if (pk) column.pk = true;
      if (RELATIONS.has(kind)) {
        column.fk = true;
        const target = targetOf(field, owner);
        const unique = kind === 'OneToOneField' || call.kwargs.get('unique')?.bool === true || pk;
        if (target === undefined) {
          const written = call.args[0]?.string ?? call.args[0]?.text ?? '';
          const [app, name] = written.includes('.') ? [written.slice(0, written.lastIndexOf('.')), lastSegment(written)] : [owner.app, written];
          column.type = 'ForeignKey';
          if (/^[\w.]+$/.test(written)) {
            relations.push(relationOf(column.name, { table: `${lastSegment(app)}_${name.toLowerCase()}`, column: 'id' }, { unique, optional }, 'inferred'));
          } else {
            certain = false;
          }
        } else {
          const toField = call.kwargs.get('to_field')?.string;
          const targetPk = pkOf(target.model);
          const toFieldNode = fieldsOf(target.model).find(({ field: other }) => other.attr === toField)?.field;
          const targetColumn = toField === undefined ? targetPk.name : toFieldNode === undefined ? toField : columnNameOf(toFieldNode);
          column.type = targetPk.type;
          relations.push(relationOf(column.name, { table: tableName(target.model), column: targetColumn }, { unique, optional }));
        }
      }
      if (call.kwargs.get('unique')?.bool === true || kind === 'OneToOneField') {
        if (!pk) column.uk = true;
      }
      if (optional) column.optional = true;
      columns.push(column);
    }
    found.push({
      name: tableName(model),
      origin: 'django',
      columns,
      relations,
      source: { file: model.file, line: model.line },
      confidence: certain ? 'extracted' : 'inferred',
    });
  }
  return found;
}

/** The hidden table of a `ManyToManyField`: `<table>_<field>` with a key to each side. */
function joinTable(model: Model, field: Field, target: Model, ownPk: { name: string; type: string }, targetPk: { name: string; type: string }, owner: string): FoundTable {
  const self = target === model;
  const fromName = self ? `from_${model.name.toLowerCase()}_id` : `${model.name.toLowerCase()}_id`;
  const toName = self ? `to_${target.name.toLowerCase()}_id` : `${target.name.toLowerCase()}_id`;
  const shape = { unique: false, optional: false };
  return {
    name: `${field.call.kwargs.get('db_table')?.string ?? `${owner}_${field.attr}`}`,
    origin: 'django',
    columns: [
      { name: 'id', type: 'AutoField', pk: true },
      { name: fromName, type: ownPk.type, fk: true },
      { name: toName, type: targetPk.type, fk: true },
    ],
    relations: [
      relationOf(fromName, { table: tableName(model), column: ownPk.name }, shape),
      relationOf(toName, { table: tableName(target), column: targetPk.name }, shape),
    ],
    source: { file: model.file, line: model.line },
    confidence: 'extracted',
  };
}
