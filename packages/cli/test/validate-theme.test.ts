import { resolve } from 'node:path';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CONTRACT_VERSION, validateOutputSchema } from 'canonical';
import { run } from 'cli';

const FIXTURE = resolve(__dirname, 'fixtures/theme-errors');

async function validateCommand(root: string) {
  const r = await run(['validate', '--workspace', root, '--json']);
  return { ...r, output: validateOutputSchema.parse(JSON.parse(r.stdout)) };
}

describe('validate: Theme codes', () => {
  it('reports every error at once with a stable code, without bumping contractVersion', async () => {
    const { exitCode, output } = await validateCommand(FIXTURE);

    expect(exitCode).toBe(1);
    expect(output.contractVersion).toBe(CONTRACT_VERSION);
    expect(CONTRACT_VERSION).toBe(2);
    expect(output.issues.map((i) => [i.code, i.line])).toEqual([
      ['theme-unknown-property', 20],
      ['theme-unknown-property', 26],
      ['theme-unknown-layer', 27],
      ['theme-patch-without-placement', 28],
      ['theme-state-touches-metrics', 29],
    ]);
  });

  it('with a single close candidate it emits a fix; the issues of a patch bring related to the base Layer', async () => {
    const { output } = await validateCommand(FIXTURE);
    const [base, patch] = output.issues;

    expect(base?.fix).toEqual({ file: 'main.dg', range: { start: { line: 20, column: 38 }, end: { line: 20, column: 42 } }, replacement: 'width' });
    expect(base).not.toHaveProperty('hint');
    expect(patch?.fix).toMatchObject({ replacement: 'color' });
    expect(patch?.related).toEqual([{ file: 'main.dg', line: 23, column: 13, message: expect.stringContaining('relleno') }]);
  });

  it('applying the fixes through edit leaves the Theme without those errors', async () => {
    const root = mkdtempSync(join(tmpdir(), 'validate-theme-'));
    cpSync(FIXTURE, root, { recursive: true });
    const { output } = await validateCommand(root);
    const fixes = output.issues.flatMap((i) => (i.fix === undefined ? [] : [i.fix]));
    expect(fixes).toHaveLength(2);

    const before = readFileSync(join(root, 'main.dg'), 'utf8');
    const r = await run(['edit', '--workspace', root, '--edits', JSON.stringify(fixes)]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(readFileSync(join(root, 'main.dg'), 'utf8')).not.toBe(before);
    expect((await validateCommand(root)).output.issues.map((i) => i.code)).not.toContain('theme-unknown-property');
  });
});
