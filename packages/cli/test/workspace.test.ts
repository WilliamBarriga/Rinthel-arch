import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { workspaceTarget, writeTextFile } from '../src/workspace';

const folderList: string[] = [];
const tempDir = (): string => {
  const c = mkdtempSync(join(tmpdir(), 'ws-'));
  folderList.push(c);
  return c;
};
afterEach(() => {
  for (const c of folderList.splice(0)) rmSync(c, { recursive: true, force: true });
});

describe('workspaceTarget', () => {
  it('resolves a relative / path under the root', () => {
    expect(workspaceTarget('/ws', 'a/b.dg')).toBe(resolve('/ws', 'a', 'b.dg'));
  });

  it('rejects paths that escape the root', () => {
    expect(() => workspaceTarget('/ws', '../fuera.dg')).toThrow(/outside the Workspace/);
    expect(() => workspaceTarget('/ws', 'a/../../fuera.dg')).toThrow(/outside the Workspace/);
    expect(() => workspaceTarget('/ws', '/otra/ruta.dg')).toThrow(/outside the Workspace/);
  });
});

describe('writeTextFile', () => {
  it('creates folders, replaces the contents and leaves no temporary files', () => {
    const root = tempDir();
    const target = join(root, 'sub', 'a.dg');
    writeTextFile(target, 'uno');
    writeFileSync(join(root, 'sub', 'otro.dg'), 'x');
    writeTextFile(target, 'dos');

    expect(readFileSync(target, 'utf8')).toBe('dos');
    expect(readdirSync(join(root, 'sub')).sort()).toEqual(['a.dg', 'otro.dg']);
  });
});
