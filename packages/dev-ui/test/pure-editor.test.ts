import { readFileSync } from 'node:fs';

import { ChangeSet, EditorState, Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

import { editsFromChanges } from '../browser/editor/changes';
import { completionOptions } from '../browser/editor/completion';
import { diagnosticsOf } from '../browser/editor/diagnostics';
import { keywordsModule, grammarKeywords } from '../scripts/keywords';

const GRAMMAR = readFileSync(new URL('../../dsl/src/grammar/diagrams.langium', import.meta.url), 'utf8');

describe('highlighting keywords', () => {
  it('come from the grammar and the list generated at build time is up to date', () => {
    const extracted = grammarKeywords(GRAMMAR);
    expect(extracted).toEqual(expect.arrayContaining(['specification', 'model', 'view', 'include', 'theme', 'interaction', 'ease-in-out']));
    expect(extracted).not.toContain('->');
    expect(readFileSync(new URL('../browser/editor/keywords.ts', import.meta.url), 'utf8')).toBe(keywordsModule(extracted));
  });
});

describe('minimal edits from the editor changes', () => {
  const base = 'linea uno\nlinea dos\nlinea tres\n';
  const change = (spec: Parameters<typeof ChangeSet.of>[0]) => ChangeSet.of(spec, base.length);

  it('an insertion is an empty edit at its point, in 1-based lines and columns', () => {
    const insertion = change({ from: base.indexOf('dos'), insert: 'numero ' });
    expect(editsFromChanges('main.dg', base, insertion)).toEqual([
      { file: 'main.dg', range: { start: { line: 2, column: 7 }, end: { line: 2, column: 7 } }, replacement: 'numero ' },
    ]);
  });

  it('several changes (multicursor) are several edits over the base text; composed changes are merged', () => {
    const first = change([
      { from: 0, to: 5, insert: 'LINEA' },
      { from: base.indexOf('tres'), to: base.indexOf('tres') + 4, insert: '3' },
    ]);
    const after = first.apply(Text.of(base.split('\n')));
    const second = ChangeSet.of({ from: after.length, insert: 'fin\n' }, after.length);
    expect(editsFromChanges('main.dg', base, first.compose(second))).toEqual([
      { file: 'main.dg', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } }, replacement: 'LINEA' },
      { file: 'main.dg', range: { start: { line: 3, column: 7 }, end: { line: 3, column: 11 } }, replacement: '3' },
      { file: 'main.dg', range: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } }, replacement: 'fin\n' },
    ]);
  });

  it('without changes there are no edits', () => {
    expect(editsFromChanges('main.dg', base, ChangeSet.empty(base.length))).toEqual([]);
  });
});

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db
  interaction login "Login" {
    api -> db "consulta"
  }
}

view mapa {
  type architecture
  include **
}
`;

describe('completion', () => {
  it('offers the keywords and the ids of the last good Source (Nodes, Views, Types, Interactions)', () => {
    const source = openSession({ 'main.dg': DSL }).source;
    const options = completionOptions(source);
    const labelsOf = (kind: string) => options.filter((o) => o.type === kind).map((o) => o.label);
    expect(labelsOf('keyword')).toEqual(expect.arrayContaining(['view', 'include']));
    expect(labelsOf('variable')).toEqual(['api', 'db']);
    expect(labelsOf('class')).toEqual(['servicio']);
    expect(labelsOf('namespace')).toEqual(['mapa']);
    expect(labelsOf('function')).toEqual(['login']);
    expect(completionOptions(undefined).every((o) => o.type === 'keyword')).toBe(true);
  });
});

describe('inline issues', () => {
  it('the file issues become diagnostics at their position, with the fix as an action', () => {
    const doc = EditorState.create({ doc: DSL }).doc;
    const issue = { code: 'x', severity: 'warning' as const, file: 'main.dg', line: 6, column: 3, message: 'aviso', href: '', fix: { file: 'main.dg', range: { start: { line: 6, column: 3 }, end: { line: 6, column: 11 } }, replacement: 'servicio' } };
    const other = { ...issue, file: 'otro.dg' };
    const applied: unknown[] = [];
    const diagnostics = diagnosticsOf(doc, 'main.dg', [issue, other], (fix) => applied.push(fix));
    expect(diagnostics).toHaveLength(1);
    const [d] = diagnostics;
    expect(d).toMatchObject({ from: doc.line(6).from + 2, severity: 'warning', message: 'aviso', source: 'x' });
    expect(d?.actions?.map((a) => a.name)).toEqual(['Apply fix']);
    d?.actions?.[0]?.apply(undefined as never, 0, 0);
    expect(applied).toEqual([issue.fix]);
  });
});
