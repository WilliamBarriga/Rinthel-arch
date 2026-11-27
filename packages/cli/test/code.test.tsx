import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { codeCompiler } from '../src/code';
import { evaluateBundle as cargarComponentes } from './evaluate-bundle';

const AURORA = `export function Aurora({ id, parametros }: { id: string; parametros: { hue: number } }) {
  return <i data-aurora={id} data-hue={parametros.hue} />;
}
`;

const folderList: string[] = [];
function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'rinthel-code-'));
  folderList.push(root);
  for (const [path, text] of Object.entries(files)) write(root, path, text);
  return root;
}
function write(root: string, path: string, text: string): void {
  const target = join(root, ...path.split('/'));
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, text);
}
afterEach(() => {
  for (const folder of folderList.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('.tsx compile adapter', () => {
  it('compiles the Workspace .tsx files: gives the exported components and a bundle that the browser registers and React draws', () => {
    const root = workspace({ 'temas/aurora.tsx': AURORA, 'main.dg': '' });

    const result = codeCompiler(root).compile();

    expect(result.issues).toEqual([]);
    expect(Object.keys(result.components)).toEqual(['Aurora']);
    const log = cargarComponentes(result.bundle);
    expect(Object.keys(log)).toEqual(['Aurora']);
    const html = renderToStaticMarkup(createElement(log['Aurora']!, { id: 'api', parametros: { hue: 3 } } as never));
    expect(html).toBe('<i data-aurora="api" data-hue="3"></i>');
  });

  it('a compile error is an issue with file and line, and does not throw', () => {
    const root = workspace({ 'temas/roto.tsx': 'export function Roto() {\n  const x = ;\n  return x;\n}\n' });

    const { issues } = codeCompiler(root).compile();

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toMatchObject({ code: 'theme-code-compile', severity: 'error', file: 'temas/roto.tsx', line: 2 });
    expect(issues[0]!.column).toBeGreaterThan(0);
  });

  it('keeps the last good version of a file that stops compiling', () => {
    const root = workspace({ 'temas/aurora.tsx': AURORA });
    const compiler = codeCompiler(root);
    compiler.compile();

    write(root, 'temas/aurora.tsx', 'export function Aurora() { return <i> }\n');
    const broken = compiler.compile();

    expect(new Set(broken.issues.map((i) => i.code))).toEqual(new Set(['theme-code-compile']));
    expect(Object.keys(broken.components)).toEqual(['Aurora']);
    const log = cargarComponentes(broken.bundle);
    expect(renderToStaticMarkup(createElement(log['Aurora']!, { id: 'x', parametros: { hue: 1 } } as never))).toBe('<i data-aurora="x" data-hue="1"></i>');
  });

  it('a component repeated in two files is an error in the second one', () => {
    const root = workspace({ 'a/aurora.tsx': AURORA, 'b/aurora.tsx': AURORA });

    const { issues } = codeCompiler(root).compile();

    expect(issues).toEqual([expect.objectContaining({ code: 'theme-component-duplicate', file: 'b/aurora.tsx', line: 1 })]);
  });

  it('a Workspace without .tsx or missing has no components nor issues', () => {
    expect(codeCompiler(workspace({ 'main.dg': '' })).compile()).toMatchObject({ components: {}, issues: [] });
    expect(codeCompiler('/no/existe/rinthel').compile()).toMatchObject({ components: {}, issues: [] });
  });

  it('a change in a .tsx is recompiled and an unchanged Workspace reuses the result', () => {
    const root = workspace({ 'temas/aurora.tsx': AURORA });
    const compiler = codeCompiler(root);
    const first = compiler.compile();

    expect(compiler.compile()).toBe(first);
    write(root, 'temas/aurora.tsx', AURORA.replace('data-aurora', 'data-otro'));
    const second = compiler.compile();
    expect(second).not.toBe(first);
    expect(second.bundle).toContain('data-otro');
  });
});
