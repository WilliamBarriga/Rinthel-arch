import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { run } from 'cli';

const fixtures = join(import.meta.dirname, 'fixtures');

/** A copy of a fixture repo outside any git repo, so the draft has no commit and the fixture stays clean. */
function repo(fixture: string): string {
  const target = mkdtempSync(join(tmpdir(), 'scan-'));
  cpSync(join(fixtures, fixture), target, { recursive: true });
  return target;
}

describe('scan', () => {
  it('writes the Scan draft to <root>/.rinthel/scan.json and prints a compact summary ending with the next step', async () => {
    const root = repo('scan-monorepo');

    const { exitCode, stdout, stderr } = await run(['scan', root]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    const draft = JSON.parse(readFileSync(join(root, '.rinthel/scan.json'), 'utf8'));
    expect(draft).toMatchObject({ schema: 'rinthel/scan@1', root: '.', commit: null });
    expect(draft.units.map(({ id }: { id: string }) => id)).toEqual(['.', 'apps/web', 'packages/api']);
    expect(stdout).toBe(
      [
        `Scan draft written to ${join(root, '.rinthel/scan.json')} (rinthel/scan@1, no commit).`,
        '3 units, 1 dependency, 2 externals, 0 tables from 5 files.',
        '',
        'Units (most files first):',
        '  apps/web      web        app      2 files',
        '  packages/api  @acme/api  package  2 files',
        '  .             acme       module   1 file',
        '',
        'Dependencies (heaviest first):',
        '  apps/web -> packages/api  weight 1',
        '',
        'Externals (most imported first):',
        '  npm:react   weight 1',
        '  npm:stripe  weight 1',
        '',
        'Next: read the draft and write the Workspace .dg files: a Node per unit worth showing, citing its unit id as a',
        'Source path ref, then run diagrams validate --workspace <workspace>. Guide: skill rinthel-diagramas, "Import from code".',
        '',
      ].join('\n'),
    );
  });

  it('--json prints the summary as one object with its own contractVersion', async () => {
    const root = repo('scan-monorepo');

    const { exitCode, stdout } = await run(['scan', root, '--json']);

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      contractVersion: 1,
      draft: join(root, '.rinthel/scan.json'),
      schema: 'rinthel/scan@1',
      commit: null,
      counts: { units: 3, dependencies: 1, externals: 2, tables: 0 },
      limits: { maxFiles: 20000, files: 5, truncated: false, largeFilesSkipped: 0, unresolvedImports: 0, languagesWithoutImports: [] },
      units: [
        { id: 'apps/web', name: 'web', kind: 'app', files: 2 },
        { id: 'packages/api', name: '@acme/api', kind: 'package', files: 2 },
        { id: '.', name: 'acme', kind: 'module', files: 1 },
      ],
      dependencies: [{ id: 'apps/web->packages/api', from: 'apps/web', to: 'packages/api', weight: 1 }],
      externals: [
        { id: 'npm:react', weight: 1 },
        { id: 'npm:stripe', weight: 1 },
      ],
      next: expect.stringContaining('diagrams validate --workspace'),
    });
  });

  it('reports languages without import support, --max-files truncation and --out', async () => {
    const root = repo('scan-app');
    const out = join(mkdtempSync(join(tmpdir(), 'scan-out-')), 'draft.json');

    const { exitCode, stdout } = await run(['scan', root, '--out', out, '--max-files', '2']);

    expect(exitCode).toBe(0);
    expect(existsSync(join(root, '.rinthel'))).toBe(false);
    expect(JSON.parse(readFileSync(out, 'utf8')).limits).toMatchObject({ truncated: true, maxFiles: 2 });
    expect(stdout).toContain(`Scan draft written to ${out}`);
    expect(stdout).toContain('Limits: stopped at --max-files 2 (truncated); imports not read for go (1 file).');
  });

  it('two runs write byte-identical drafts', async () => {
    const root = repo('scan-monorepo');
    await run(['scan', root]);
    const first = readFileSync(join(root, '.rinthel/scan.json'), 'utf8');
    await run(['scan', root]);

    expect(readFileSync(join(root, '.rinthel/scan.json'), 'utf8')).toBe(first);
  });

  it('--depth is passed to the Scanner', async () => {
    const root = repo('scan-app');
    for (let i = 0; i < 30; i++) writeFileSync(join(root, 'src', `m${i}.py`), '');

    const shallow = JSON.parse((await run(['scan', root, '--json', '--depth', '0'])).stdout);
    const deep = JSON.parse((await run(['scan', root, '--json'])).stdout);

    expect(shallow.counts.units).toBe(1);
    expect(deep.units.map(({ id }: { id: string }) => id)).toEqual(['src', '.', 'tools']);
  });

  it.each([
    [['--depth=-1'], '--depth must be an integer >= 0'],
    [['--max-files', '0'], '--max-files must be an integer >= 1'],
    [['--bogus'], 'bogus'],
  ])('rejects %j with exit 2 and nothing on stdout', async (args, message) => {
    const { exitCode, stdout, stderr } = await run(['scan', repo('scan-app'), ...args]);

    expect(exitCode).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain(message);
  });

  it('a root that is not a folder is a usage error', async () => {
    const { exitCode, stderr } = await run(['scan', join(tmpdir(), 'does-not-exist-scan')]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('does-not-exist-scan');
  });
});
