import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { inspectOutputSchema, validateOutputSchema } from 'canonical';
import { run } from 'cli';

const FIXTURE = resolve(__dirname, 'fixtures/theme-code');
const copies: string[] = [];

function copy(): string {
  const root = mkdtempSync(join(tmpdir(), 'rinthel-theme-code-'));
  copies.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  return root;
}
afterEach(() => {
  for (const folder of copies.splice(0)) rmSync(folder, { recursive: true, force: true });
});

async function validateCommand(root: string) {
  const r = await run(['validate', '--workspace', root, '--json']);
  return { ...r, output: validateOutputSchema.parse(JSON.parse(r.stdout)) };
}

describe('validate: Theme with code', () => {
  it('a Theme with valid code emits only the trust warning', async () => {
    const { exitCode, output } = await validateCommand(FIXTURE);

    expect(exitCode).toBe(0);
    expect(output.issues.map((i) => i.code)).toEqual(['theme-with-code']);
    expect(output.issues[0]).toMatchObject({ severity: 'warning', file: 'main.dg', message: expect.stringContaining('Aurora') });
  });

  it('--strict treats the code warning as a failure', async () => {
    const r = await run(['validate', '--workspace', FIXTURE, '--strict', '--json']);
    expect(r.exitCode).toBe(1);
  });

  it('a component that no .tsx exports is an error', async () => {
    const root = copy();
    writeFileSync(join(root, 'components', 'aurora.tsx'), 'export function Otra() { return null; }\n');

    const { exitCode, output } = await validateCommand(root);

    expect(exitCode).toBe(1);
    expect(output.issues.map((i) => i.code)).toEqual(['theme-component-missing', 'theme-with-code']);
  });

  it('a compile error of the .tsx shows up as an issue with file and line', async () => {
    const root = copy();
    writeFileSync(join(root, 'components', 'aurora.tsx'), 'export function Aurora() {\n  const x = ;\n  return x;\n}\n');

    const { exitCode, output } = await validateCommand(root);

    expect(exitCode).toBe(1);
    const compilation = output.issues.find((i) => i.code === 'theme-code-compile');
    expect(compilation).toMatchObject({ severity: 'error', file: 'components/aurora.tsx', line: 2 });
  });

  it('inspect theme marks the Theme with code and lists its components', async () => {
    const r = await run(['inspect', 'theme', 'neon', '--workspace', FIXTURE, '--json']);

    const output = inspectOutputSchema.parse(JSON.parse(r.stdout));
    expect(output.command === 'theme' && output.theme).toMatchObject({ hasCode: true, components: ['Aurora'] });
  });
});
