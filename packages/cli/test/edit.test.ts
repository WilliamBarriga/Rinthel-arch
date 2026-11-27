import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { EDIT_CONTRACT_VERSION, editOutputSchema } from 'canonical';
import { run } from 'cli';
import { contentHash } from 'session';

const DG = `specification { node servicio }
model {
  servicio a "A"
  servicio b "B"
}
view general {
  type architecture
  include **
  node a { pin 10,20 }
}
`;

function workspace(text = DG): string {
  const root = mkdtempSync(join(tmpdir(), 'edit-'));
  writeFileSync(join(root, 'main.dg'), text);
  return root;
}
const read = (root: string) => readFileSync(join(root, 'main.dg'), 'utf8');
const pin = (view: string, node: string, x: string, y: string) => ['--view', view, '--node', node, '--x', x, '--y', y];

describe('edit pin', () => {
  it('replaces an existing Pin and writes only the DSL', async () => {
    const root = workspace();
    const r = await run(['edit', '--workspace', root, ...pin('general', 'a', '30', '40'), '--json']);
    expect(r.exitCode).toBe(0);
    const output = editOutputSchema.parse(JSON.parse(r.stdout));
    expect(output).toMatchObject({ contractVersion: EDIT_CONTRACT_VERSION, ok: true, files: ['main.dg'] });
    expect(read(root)).toBe(DG.replace('pin 10,20', 'pin 30,40'));
  });

  it('inserts the Pin of a Node that had none', async () => {
    const root = workspace();
    const r = await run(['edit', '--workspace', root, ...pin('general', 'b', '5', '6')]);
    expect(r.exitCode).toBe(0);
    expect(read(root)).toContain('node b { pin 5,6 }');
  });

  it('rejects an outdated hash with code 1 and without writing', async () => {
    const root = workspace();
    const r = await run(['edit', '--workspace', root, ...pin('general', 'a', '1', '2'), '--hash', 'main.dg=000', '--json']);
    expect(r.exitCode).toBe(1);
    expect(editOutputSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: false, reason: 'stale-hash' });
    expect(read(root)).toBe(DG);
  });

  it('accepts a current hash', async () => {
    const root = workspace();
    const r = await run(['edit', '--workspace', root, ...pin('general', 'a', '1', '2'), '--hash', `main.dg=${contentHash(DG)}`]);
    expect(r.exitCode).toBe(0);
  });

  it('missing View or Node: code 1, text on stderr without --json', async () => {
    const root = workspace();
    const v = await run(['edit', '--workspace', root, ...pin('nada', 'a', '1', '2')]);
    expect(v).toMatchObject({ exitCode: 1, stdout: '' });
    expect(v.stderr).toContain('nada');
    const n = await run(['edit', '--workspace', root, ...pin('general', 'zzz', '1', '2')]);
    expect(n.exitCode).toBe(1);
    expect(read(root)).toBe(DG);
  });

  it('usage failures: code 2', async () => {
    const root = workspace();
    expect((await run(['edit', ...pin('general', 'a', '1', '2')])).exitCode).toBe(2);
    expect((await run(['edit', '--workspace', root])).exitCode).toBe(2);
    expect((await run(['edit', '--workspace', root, ...pin('general', 'a', 'x', '2')])).exitCode).toBe(2);
    expect((await run(['edit', '--workspace', root, ...pin('general', 'a', '1', '2'), '--edits', '[]'])).exitCode).toBe(2);
    expect((await run(['edit', '--workspace', join(root, 'no-existe'), ...pin('general', 'a', '1', '2')])).exitCode).toBe(2);
  });
});

describe('edit --edits', () => {
  const edition = (replacement: string, extra = {}) => ({
    file: 'main.dg',
    range: { start: { line: 3, column: 14 }, end: { line: 3, column: 17 } },
    replacement,
    ...extra,
  });

  it('applies already computed edits (e.g. the fix of an issue)', async () => {
    const root = workspace();
    const r = await run(['edit', '--workspace', root, '--edits', JSON.stringify([edition('"Z"')]), '--json']);
    expect(r.exitCode).toBe(0);
    expect(read(root)).toContain('servicio a "Z"');
  });

  it('rejects the edit that introduces an error, without writing', async () => {
    const root = workspace();
    const r = await run(['edit', '--workspace', root, '--edits', JSON.stringify([edition('{{{')]), '--json']);
    expect(r.exitCode).toBe(1);
    expect(editOutputSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: false, reason: 'invalid' });
    expect(read(root)).toBe(DG);
  });

  it('honors the hash of each edit and rejects malformed JSON with code 2', async () => {
    const root = workspace();
    const r = await run(['edit', '--workspace', root, '--edits', JSON.stringify([edition('"Z"', { hash: 'viejo' })]), '--json']);
    expect(r.exitCode).toBe(1);
    expect(read(root)).toBe(DG);
    expect((await run(['edit', '--workspace', root, '--edits', 'not json'])).exitCode).toBe(2);
    expect((await run(['edit', '--workspace', root, '--edits', '[{"file":1}]'])).exitCode).toBe(2);
  });

  it('every remaining rejection reason (file, range, overlap) exits with code 1, its reason and without writing', async () => {
    const root = workspace();
    const testCases: [string, unknown[]][] = [
      ['unknown-file', [edition('x', { file: 'otro.dg' })]],
      ['invalid-range', [edition('x', { range: { start: { line: 99, column: 1 }, end: { line: 99, column: 2 } } })]],
      ['overlapping-edits', [edition('"Y"'), edition('"Z"')]],
    ];

    for (const [reason, editions] of testCases) {
      const r = await run(['edit', '--workspace', root, '--edits', JSON.stringify(editions), '--json']);

      expect(r.exitCode, reason).toBe(1);
      expect(editOutputSchema.parse(JSON.parse(r.stdout)), reason).toMatchObject({ ok: false, reason });
      expect(read(root)).toBe(DG);
    }
  });
});

describe('edit --intent (reorder-lifelines)', () => {
  const SEQ = `specification { node servicio }
model {
  servicio cliente
  servicio api
  servicio db
  interaction i {
    cliente -> api "pedir"
    api -> db "leer"
  }
}
view flujo {
  type sequence
  interaction i
}
`;
  const intent = (order: string[], extra: object = {}) => JSON.stringify({ type: 'reorder-lifelines', view: 'flujo', order, ...extra });

  it('applies the Intent through its JSON contract and writes the order', async () => {
    const root = workspace(SEQ);
    const r = await run(['edit', '--workspace', root, '--intent', intent(['db', 'cliente', 'api']), '--json']);
    expect(r.exitCode).toBe(0);
    expect(editOutputSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: true, files: ['main.dg'] });
    expect(read(root)).toBe(SEQ.replace('  interaction i\n}', '  interaction i\n  order db, cliente, api\n}'));
  });

  it('ignores an inherited hash in the JSON', async () => {
    const root = workspace(SEQ);
    const r = await run(['edit', '--workspace', root, '--intent', intent(['db', 'cliente', 'api'], { hash: '000' })]);
    expect(r.exitCode).toBe(0);
    expect(read(root)).toContain('order db, cliente, api');
  });

  it('with an old --hash of the file it rejects with code 1 and without writing', async () => {
    const root = workspace(SEQ);
    const r = await run(['edit', '--workspace', root, '--intent', intent(['db']), '--hash', 'main.dg=000', '--json']);
    expect(r.exitCode).toBe(1);
    expect(editOutputSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: false, reason: 'stale-hash' });
    expect(read(root)).toBe(SEQ);
  });

  it('a malformed Intent is a usage failure', async () => {
    const r = await run(['edit', '--workspace', workspace(SEQ), '--intent', '{"tipo":"nada"}']);
    expect(r.exitCode).toBe(2);
  });
});

describe('edit --intent (set-theme)', () => {
  const set = (theme?: string) => JSON.stringify({ type: 'set-theme', view: 'general', ...(theme !== undefined && { theme }) });

  it('writes theme as the first line of the View with a Theme from --theme-path, and without a theme removes it', async () => {
    const root = workspace();
    const themes = mkdtempSync(join(tmpdir(), 'themes-'));
    writeFileSync(join(themes, 'claro.dg'), 'theme claro extends neutral { palette { acento "#0ea5e9" } }\n');

    const r = await run(['edit', '--workspace', root, '--theme-path', themes, '--intent', set('claro'), '--json']);
    expect(r.exitCode).toBe(0);
    expect(editOutputSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: true, files: ['main.dg'] });
    expect(read(root)).toBe(DG.replace('view general {\n', 'view general {\n  theme claro\n'));

    expect((await run(['edit', '--workspace', root, '--theme-path', themes, '--intent', set()])).exitCode).toBe(0);
    expect(read(root)).toBe(DG);
  });

  it('an undeclared Theme exits 1 with reason unknown-theme, without writing', async () => {
    const root = workspace();
    const r = await run(['edit', '--workspace', root, '--intent', set('neutro'), '--json']);
    expect(r.exitCode).toBe(1);
    expect(editOutputSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: false, reason: 'unknown-theme' });
    expect(read(root)).toBe(DG);
  });

  it('--help names the set-theme Intent and its rejection', async () => {
    const r = await run(['edit', '--help']);
    expect(r.stdout).toContain('"type":"set-theme"');
    expect(r.stdout).toContain('unknown-theme');
  });
});

describe('edit: single write gate', () => {
  const jsonOutput = (r: { stdout: string }) => JSON.parse(r.stdout) as unknown;

  it('the three modes give the same text and JSON output', async () => {
    const pinText = await run(['edit', '--workspace', workspace(), ...pin('general', 'a', '30', '40')]);
    expect(pinText).toEqual({ exitCode: 0, stdout: '1 file(s) edited: main.dg\n', stderr: '' });

    const pinJsonText = await run(['edit', '--workspace', workspace(), ...pin('general', 'b', '5', '6'), '--json']);
    expect(jsonOutput(pinJsonText)).toEqual({
      contractVersion: EDIT_CONTRACT_VERSION,
      ok: true,
      edits: [{ file: 'main.dg', range: { start: { line: 10, column: 1 }, end: { line: 10, column: 1 } }, replacement: '  node b { pin 5,6 }\n' }],
      files: ['main.dg'],
    });

    const range = { start: { line: 3, column: 14 }, end: { line: 3, column: 17 } };
    const edits = await run(['edit', '--workspace', workspace(), '--edits', JSON.stringify([{ file: 'main.dg', range, replacement: '"Z"' }]), '--json']);
    expect(jsonOutput(edits)).toEqual({ contractVersion: EDIT_CONTRACT_VERSION, ok: true, edits: [{ file: 'main.dg', range, replacement: '"Z"' }], files: ['main.dg'] });

    const intent = await run(['edit', '--workspace', workspace(), '--intent', JSON.stringify({ type: 'move-pin', view: 'general', node: 'a', x: 1, y: 2 }), '--json']);
    expect(jsonOutput(intent)).toEqual({
      contractVersion: EDIT_CONTRACT_VERSION,
      ok: true,
      edits: [{ file: 'main.dg', range: { start: { line: 9, column: 12 }, end: { line: 9, column: 21 } }, replacement: 'pin 1,2' }],
      files: ['main.dg'],
    });

    const rejection = await run(['edit', '--workspace', workspace(), ...pin('nada', 'a', '1', '2')]);
    expect(rejection).toEqual({ exitCode: 1, stdout: '', stderr: "Edit rejected (unknown-view): View 'nada' does not exist\n" });
  });

  describe('does not write files of --theme-path: unknown-file', () => {
    const [model, viewList] = DG.split('\nview general');
    const withThemes = () => {
      const root = workspace(`${model as string}\n`);
      const themes = mkdtempSync(join(tmpdir(), 'edit-themes-'));
      writeFileSync(join(themes, 'vistas.dg'), `view general${viewList as string}`);
      return { root, themes, views: () => readFileSync(join(themes, 'vistas.dg'), 'utf8') };
    };
    const testCases: [string, string[]][] = [
      ['Pin flags', pin('general', 'a', '1', '2')],
      ['--intent', ['--intent', JSON.stringify({ type: 'move-pin', view: 'general', node: 'b', x: 1, y: 2 })]],
      ['--edits', ['--edits', JSON.stringify([{ file: 'vistas.dg', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: '\n' }])]],
    ];
    it.each(testCases)('%s', async (_mode, args) => {
      const ws = withThemes();
      const before = ws.views();
      const r = await run(['edit', '--workspace', ws.root, '--theme-path', ws.themes, ...args, '--json']);
      expect(r.exitCode).toBe(1);
      expect(editOutputSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: false, reason: 'unknown-file', file: 'vistas.dg' });
      expect(ws.views()).toBe(before);
    });
  });
});
