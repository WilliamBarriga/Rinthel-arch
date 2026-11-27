import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateOutputSchema } from 'canonical';
import { run } from 'cli';

const MODEL = `specification {
  node service
}

model {
  service api "API"
}
`;

const THEME = `theme mine extends neutral-dark {
}
`;

function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'conventions-'));
  for (const [path, text] of Object.entries({ 'main.dg': MODEL, ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

async function validateCommand(root: string) {
  const result = await run(['validate', '--workspace', root, '--json']);
  return { exitCode: result.exitCode, output: validateOutputSchema.parse(JSON.parse(result.stdout)) };
}

/** Applies the rename `fix`es as `validate` reports them, through `edit --edits` (one batch). */
async function applyRenames(root: string, issues: ReadonlyArray<{ fix?: unknown }>): Promise<void> {
  const fixes = issues.flatMap((i) => (i.fix === undefined ? [] : [i.fix]));
  const r = await run(['edit', '--workspace', root, '--edits', JSON.stringify(fixes)]);
  expect(r.exitCode, r.stderr).toBe(0);
}

describe('Workspace file conventions', () => {
  it('with English names the Workspace validates', async () => {
    const root = workspace({ 'theme.dg': THEME, 'themes/a.dg': 'theme a extends neutral-dark {\n}\n', 'fonts/x.txt': 'licencia' });
    const { exitCode, output } = await validateCommand(root);
    expect(output.issues).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it('tema.dg is an error with a fix that renames it to theme.dg', async () => {
    const root = workspace({ 'sub/tema.dg': THEME });
    const { exitCode, output } = await validateCommand(root);

    expect(exitCode).toBe(1);
    expect(output.issues).toHaveLength(1);
    expect(output.issues[0]).toMatchObject({
      code: 'old-workspace-convention',
      severity: 'error',
      file: 'sub/tema.dg',
      fix: { file: 'sub/tema.dg', rename: 'sub/theme.dg' },
    });

    await applyRenames(root, output.issues);
    expect(existsSync(join(root, 'sub/theme.dg'))).toBe(true);
    expect((await validateCommand(root)).output.issues).toEqual([]);
  });

  it('temas/ is one error per folder and its fix renames it to themes/', async () => {
    const root = workspace({ 'temas/a.dg': 'theme a extends neutral-dark {\n}\n', 'temas/b.dg': 'theme b extends neutral-dark {\n}\n' });
    const { output } = await validateCommand(root);

    expect(output.issues.map((i) => [i.code, i.file, i.fix?.rename])).toEqual([['old-workspace-convention', 'temas', 'themes']]);

    await applyRenames(root, output.issues);
    const after = await validateCommand(root);
    expect(after.output.issues).toEqual([]);
    expect(after.exitCode).toBe(0);
  });

  it('fuentes/ is an error even if it only has files that are not .dg', async () => {
    const root = workspace({ 'fuentes/LICENCIA.txt': 'ofl' });
    const { output } = await validateCommand(root);

    expect(output.issues.map((i) => [i.code, i.file, i.fix?.rename])).toEqual([['old-workspace-convention', 'fuentes', 'fonts']]);

    await applyRenames(root, output.issues);
    expect((await validateCommand(root)).output.issues).toEqual([]);
  });

  it('an old name nested in another is reported after renaming the outer one', async () => {
    const root = workspace({ 'temas/fuentes/LICENCIA.txt': 'ofl', 'temas/tema.dg': THEME });
    const first = await validateCommand(root);
    expect(first.output.issues.map((i) => i.file)).toEqual(['temas']);

    await applyRenames(root, first.output.issues);
    const second = await validateCommand(root);
    expect(second.output.issues.map((i) => [i.file, i.fix?.rename])).toEqual([
      ['themes/fuentes', 'themes/fonts'],
      ['themes/tema.dg', 'themes/theme.dg'],
    ]);

    await applyRenames(root, second.output.issues);
    expect((await validateCommand(root)).output.issues).toEqual([]);
  });

  it('build also fails with an old name', async () => {
    const root = workspace({ 'temas/a.dg': 'theme a extends neutral-dark {\n}\n' });
    const result = await run(['build', '--workspace', root, '--json']);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).issues[0].code).toBe('old-workspace-convention');
  });

  it('the readable text says what to rename to', async () => {
    const root = workspace({ 'tema.dg': THEME });
    const result = await run(['validate', '--workspace', root]);
    expect(result.stdout).toContain("tema.dg:1:1 error old-workspace-convention");
    expect(result.stdout).toContain("rename 'tema.dg' to 'theme.dg'");
  });

  it('edit applies a rename fix together with a text fix as one batch, and says what it renamed', async () => {
    const root = workspace({ 'tema.dg': 'theme mine extends neutral { node { state hover { layer borde { width 2 } } } }\n', 'fuentes/LICENSE.txt': 'ofl' });
    writeFileSync(join(root, 'main.dg'), `${MODEL}\nview v {\n  type architecture\n  include **\n  theme mine\n}\n`);
    const { output } = await validateCommand(root);
    expect(output.issues.map((i) => i.code).sort()).toEqual(['old-catalog-value', 'old-workspace-convention', 'old-workspace-convention']);

    const r = await run(['edit', '--workspace', root, '--edits', JSON.stringify(output.issues.map((i) => i.fix))]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stdout).toContain('renamed tema.dg -> theme.dg');
    expect(r.stdout).toContain('renamed fuentes -> fonts');
    expect(readFileSync(join(root, 'theme.dg'), 'utf8')).toContain('layer border');
    expect(existsSync(join(root, 'fonts/LICENSE.txt'))).toBe(true);
    expect((await validateCommand(root)).output.issues).toEqual([]);
  });

  it('edit --json lists the rename in edits and its new path in files', async () => {
    const root = workspace({ 'tema.dg': THEME });
    const { output } = await validateCommand(root);
    const r = await run(['edit', '--workspace', root, '--json', '--edits', JSON.stringify([output.issues[0]?.fix])]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, edits: [{ file: 'tema.dg', rename: 'theme.dg' }], files: ['theme.dg'] });
  });

  it('an impossible rename rejects the whole batch: nothing is written or renamed', async () => {
    const root = workspace({ 'temas/a.dg': 'theme a extends neutral { node { state hover { layer borde { width 2 } } } }\n', 'themes/b.dg': 'theme b extends neutral-dark {\n}\n' });
    const { output } = await validateCommand(root);
    const r = await run(['edit', '--workspace', root, '--json', '--edits', JSON.stringify(output.issues.map((i) => i.fix))]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, reason: 'invalid-rename', file: 'temas' });
    expect(readFileSync(join(root, 'temas/a.dg'), 'utf8')).toContain('layer borde');
  });

  it('a rename of a path that does not exist is unknown-file', async () => {
    const root = workspace({});
    const fix = { file: 'temas', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: '', rename: 'themes' };
    const r = await run(['edit', '--workspace', root, '--json', '--edits', JSON.stringify([fix])]);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, reason: 'unknown-file', file: 'temas' });
  });
});
