import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateOutputSchema } from 'canonical';
import { run } from 'cli';

const fixtures = join(import.meta.dirname, 'fixtures');

describe('validate', () => {
  it('a valid Workspace exits with code 0 and the versioned object', async () => {
    const result = await run(['validate', '--workspace', join(fixtures, 'minimal'), '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      contractVersion: 2,
      ok: true,
      summary: { errors: 0, warnings: 0, truncated: false },
      issues: [],
    });
  });

  it('with errors it exits with code 1 and a stable snapshot of the contract', async () => {
    const result = await run(['validate', '--workspace', join(fixtures, 'with-errors'), '--json']);

    expect(result.exitCode).toBe(1);
    const output = validateOutputSchema.parse(JSON.parse(result.stdout));
    expect(output.ok).toBe(false);
    expect(output.summary).toEqual({ errors: 2, warnings: 0, truncated: false });
    expect(output.issues.map((i) => [i.file, i.line, i.column, i.code])).toEqual([
      ['main.dg', 6, 3, 'unknown-node-type'],
      ['main.dg', 8, 1, 'syntax-error'],
    ]);
    // `message` is not contract: the snapshot pins only what is.
    expect({ ...output, issues: output.issues.map(({ message, ...rest }) => rest) }).toMatchSnapshot();
  });

  it('in text, every issue with a candidate says "did you mean" (from its fix or its hint), as in --json', async () => {
    const root = mkdtempSync(join(tmpdir(), 'validate-hint-'));
    writeFileSync(
      join(root, 'main.dg'),
      `specification { node servicio { color blue } }
model { servicio a }
view v { type architecture  include **  theme mio }
theme mio extends neutral-drak { }
theme otro extends neutral { node { layer fill { color fram } } }
`,
    );

    const result = await run(['validate', '--workspace', root]);

    expect(result.exitCode).toBe(1);
    const lines = result.stdout.split('\n');
    expect(lines.find((l) => l.includes("'neutral-drak'"))).toContain("did you mean 'neutral-dark'");
    expect(lines.find((l) => l.includes('unknown-palette-color'))).toContain("did you mean 'frame'");
  });

  it('a dangling Edge exits with dangling-edge, position and a single-candidate fix', async () => {
    const result = await run(['validate', '--workspace', join(fixtures, 'dangling-edge'), '--json']);

    expect(result.exitCode).toBe(1);
    const output = validateOutputSchema.parse(JSON.parse(result.stdout));
    expect(output.issues).toHaveLength(1);
    expect(output.issues[0]).toMatchObject({
      code: 'dangling-edge',
      severity: 'error',
      file: 'main.dg',
      line: 9,
      column: 18,
      fix: {
        file: 'main.dg',
        range: { start: { line: 9, column: 18 }, end: { line: 9, column: 21 } },
        replacement: 'db',
      },
    });
  });

  it('a missing Attribute on an Edge exits with unknown-attribute through validate', async () => {
    const result = await run(
      ['validate', '--workspace', join(fixtures, 'missing-attribute'), '--json'],
    );

    expect(result.exitCode).toBe(1);
    const output = validateOutputSchema.parse(JSON.parse(result.stdout));
    expect(output.issues.map((i) => [i.line, i.column, i.code])).toEqual([
      [9, 23, 'unknown-attribute'],
    ]);
  });

  it('--max-issues cuts the list but summary counts everything and marks truncated', async () => {
    const result = await run([
      'validate', '--workspace', join(fixtures, 'with-errors'), '--json', '--max-issues', '1',
    ]);

    const output = JSON.parse(result.stdout);
    expect(output.issues).toHaveLength(1);
    expect(output.summary).toEqual({ errors: 2, warnings: 0, truncated: true });
    expect(result.exitCode).toBe(1);
  });

  it('--strict treats warnings as a failure; without it, a warning leaves code 0', async () => {
    const dependencies = {
      read: () => ({
        'main.dg': `specification { node servicio }
model { servicio a  servicio b }
view v {
  type architecture
  include **
  node a { pin 0,0 }
  node b { pin 10,10 }
}
`,
      }),
    };
    const args = ['validate', '--workspace', '.', '--json'];

    const tolerant = await run(args, dependencies);
    expect(tolerant.exitCode).toBe(0);
    expect(JSON.parse(tolerant.stdout).summary).toEqual({ errors: 0, warnings: 1, truncated: false });

    const strictFlag = await run([...args, '--strict'], dependencies);
    expect(strictFlag.exitCode).toBe(1);
    expect(JSON.parse(strictFlag.stdout).ok).toBe(false);
  });

  it('without --json it prints readable text with position', async () => {
    const result = await run(['validate', '--workspace', join(fixtures, 'with-errors')]);

    expect(result.stdout).toContain('main.dg:6:3 error unknown-node-type');
    expect(result.stdout).toContain('2 errors, 0 warnings');
  });

  it.each([
    [['validate']],
    [['validate', '--workspace', '/no/existe']],
    [['validate', '--workspace', '.', '--max-issues', '0']],
    [['validate', '--workspace', '.', '--rara']],
    [['construir']],
  ])('usage failure %j exits with code 2, stderr and empty stdout', async (argv) => {
    const result = await run(argv);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toBe('');
  });

  it('never writes: the Workspace stays identical after validating', async () => {
    const copy = mkdtempSync(join(tmpdir(), 'diagrams-'));
    cpSync(join(fixtures, 'with-errors'), copy, { recursive: true });
    const snapshot = () =>
      readdirSync(copy, { recursive: true })
        .map(String)
        .sort()
        .map((path) => {
          const abs = join(copy, path);
          return [path, statSync(abs).isFile() ? readFileSync(abs, 'utf8') : null];
        });
    const before = snapshot();

    await run(['validate', '--workspace', copy, '--json']);

    expect(snapshot()).toEqual(before);
  });

  it('ignores the derived output .diagrams/ when reading the Workspace', async () => {
    const copy = mkdtempSync(join(tmpdir(), 'diagrams-'));
    cpSync(join(fixtures, 'minimal'), copy, { recursive: true });
    mkdirSync(join(copy, '.diagrams'));
    writeFileSync(join(copy, '.diagrams', 'roto.dg'), 'basura {{{');

    const result = await run(['validate', '--workspace', copy, '--json']);

    expect(result.exitCode).toBe(0);
  });

  it('an unclosed block exits with code 1 and a valid position', async () => {
    const copy = mkdtempSync(join(tmpdir(), 'diagrams-'));
    writeFileSync(join(copy, 'main.dg'), 'specification { node servicio }\nmodel {\n  servicio api {');

    const result = await run(['validate', '--workspace', copy, '--json']);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).issues[0]).toMatchObject({ code: 'syntax-error', line: 3 });
  });
});

describe('validate: validate/fix loop', () => {
  /** Applies a `fix` (1-based ranges, end excluded) to the file text. */
  function applyFix(text: string, { range, replacement }: { range: { start: { line: number; column: number }; end: { line: number; column: number } }; replacement: string }): string {
    const lines = text.split('\n');
    const offset = (p: { line: number; column: number }) =>
      lines.slice(0, p.line - 1).reduce((sum, line) => sum + line.length + 1, 0) + p.column - 1;
    return text.slice(0, offset(range.start)) + replacement + text.slice(offset(range.end));
  }

  async function validateCommand(root: string) {
    const result = await run(['validate', '--workspace', root, '--json']);
    return validateOutputSchema.parse(JSON.parse(result.stdout));
  }

  it('applying the fix to the text makes the issue disappear on revalidation, without validate writing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'diagrams-fix-'));
    const file = join(root, 'main.dg');
    const original = 'specification { node servicio }\nmodel {\n  servico api\n}\n';
    writeFileSync(file, original);

    const before = await validateCommand(root);
    expect(readFileSync(file, 'utf8')).toBe(original);
    expect(before.issues.map((i) => i.code)).toEqual(['unknown-node-type']);

    const fix = before.issues[0]?.fix;
    expect(fix?.file).toBe('main.dg');
    writeFileSync(file, applyFix(original, fix as NonNullable<typeof fix>));

    const after = await validateCommand(root);
    expect(after).toMatchObject({ ok: true, issues: [] });
  });

  it('the fix of a dangling Edge also closes the loop', async () => {
    const root = mkdtempSync(join(tmpdir(), 'diagrams-fix-'));
    const file = join(root, 'main.dg');
    const original = 'specification { node servicio }\nmodel {\n  servicio api\n  servicio db\n  api -> dbb\n}\n';
    writeFileSync(file, original);

    const fix = (await validateCommand(root)).issues[0]?.fix;
    writeFileSync(file, applyFix(original, fix as NonNullable<typeof fix>));

    expect((await validateCommand(root)).issues).toEqual([]);
  });

  it('sorts the issues by file, line, column and code even if the source does not', async () => {
    const result = await run(['validate', '--workspace', '.', '--json'], {
      read: () => ({
        'b.dg': 'specification { node servicio }\nmodel {\n  servicio api {',
        'a.dg': 'specification { node servicio }\nmodel {\n  servicio api {',
      }),
    });

    const files = JSON.parse(result.stdout).issues.map((i: { file: string }) => i.file);
    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files).toEqual([...files].sort());
    expect(new Set(files)).toEqual(new Set(['a.dg', 'b.dg']));
  });

  describe('overlapping-pins', () => {
    const withOverlappingPins = (): string => {
      const workspace = mkdtempSync(join(tmpdir(), 'validate-'));
      writeFileSync(
        join(workspace, 'main.dg'),
        `specification { node servicio }
model { servicio a  servicio b }
view v {
  type architecture
  include **
  node a { pin 0,0 }
  node b { pin 10,10 }
}
`,
      );
      return workspace;
    };

    it('validate --json emits the warning with position and related, without writing .diagrams', async () => {
      const workspace = withOverlappingPins();

      const result = await run(['validate', '--workspace', workspace, '--json']);

      expect(result.exitCode).toBe(0);
      const output = validateOutputSchema.parse(JSON.parse(result.stdout));
      expect(output.ok).toBe(true);
      expect(output.summary).toEqual({ errors: 0, warnings: 1, truncated: false });
      expect(output.issues).toEqual([
        expect.objectContaining({
          code: 'overlapping-pins',
          severity: 'warning',
          file: 'main.dg',
          line: 6,
          column: 8,
          related: [{ file: 'main.dg', line: 7, column: 8, message: "Pin of 'b'" }],
        }),
      ]);
      expect(readdirSync(workspace)).toEqual(['main.dg']);
    });

    it('with --strict the warning fails', async () => {
      const result = await run(['validate', '--workspace', withOverlappingPins(), '--strict']);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('overlapping-pins');
    });

    it('Pins that do not overlap do not warn', async () => {
      const workspace = withOverlappingPins();
      writeFileSync(join(workspace, 'main.dg'), readFileSync(join(workspace, 'main.dg'), 'utf8').replace('pin 10,10', 'pin 500,500'));

      const result = await run(['validate', '--workspace', workspace, '--json']);

      expect(JSON.parse(result.stdout).issues).toEqual([]);
    });

    it('does not compute layout if there are compile errors', async () => {
      const workspace = withOverlappingPins();
      writeFileSync(join(workspace, 'roto.dg'), 'model { servicio }');

      const result = await run(['validate', '--workspace', workspace, '--json']);

      expect(JSON.parse(result.stdout).issues.map((i: { code: string }) => i.code)).toEqual(['syntax-error']);
    });
  });

  describe('--theme-path and --theme', () => {
    it('--theme-path contributes Themes before the Workspace', async () => {
      const result = await run([
        'validate', '--workspace', join(fixtures, 'build-basic'), '--theme-path', join(fixtures, 'extra-themes'), '--json',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
    });

    it('a Theme from --theme-path makes a View that uses it valid', async () => {
      const workspace = mkdtempSync(join(tmpdir(), 'validate-'));
      writeFileSync(join(workspace, 'main.dg'), 'specification { node s } model { s a } view v { type flow include ** theme corporativo }');

      const without = await run(['validate', '--workspace', workspace, '--json']);
      const withValue = await run(['validate', '--workspace', workspace, '--theme-path', join(fixtures, 'extra-themes'), '--json']);

      expect(JSON.parse(without.stdout).issues.map((i: { code: string }) => i.code)).toEqual(['unknown-theme']);
      expect(withValue.exitCode).toBe(0);
    });

    it('a missing --theme is a usage failure (code 2), as in build', async () => {
      const result = await run(['validate', '--workspace', join(fixtures, 'build-basic'), '--theme', 'nada']);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("'nada'");
    });
  });
});
