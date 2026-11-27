/** `diagrams export`, run in-process: the single self-contained HTML it writes (its browser behavior is in `e2e-export`). */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { run } from 'cli';
import { exportDataSchema } from 'dev-ui';

const fixtures = join(import.meta.dirname, 'fixtures');

function copy(fixture: string): string {
  const target = mkdtempSync(join(tmpdir(), 'export-'));
  cpSync(join(fixtures, fixture), target, { recursive: true });
  return target;
}

/** The embedded data of an exported HTML, validated as the page does. */
function dataOf(html: string): ReturnType<typeof exportDataSchema.parse> {
  const json = /<script type="application\/json" id="rinthel-datos">([\s\S]*?)<\/script>/.exec(html)?.[1];
  return exportDataSchema.parse(JSON.parse(json ?? 'null'));
}

describe('export', () => {
  it('writes one HTML with the page, the layout Worker and the data inline, and nothing to load from outside', async () => {
    const workspace = copy('medium');
    const out = join(mkdtempSync(join(tmpdir(), 'export-out-')), 'sub', 'diagrams.html');

    const { exitCode, stdout, stderr } = await run(['export', '--workspace', workspace, '--out', out]);

    expect(stderr).toBe('');
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(new RegExp(`^Exported \\d+ Views to ${out.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\([\\d.]+ MB\\)`));
    const html = readFileSync(out, 'utf8');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<(script|link|img|iframe)\b[^>]*\b(src|href)="(?!data:)/i);
    expect(html).not.toMatch(/@import\b/);
    expect(html).toContain('<script type="text/plain" id="rinthel-worker">');
    const data = dataOf(html);
    expect(data.estado.vistas.length).toBeGreaterThan(0);
    expect(stdout).toContain(`Exported ${data.estado.vistas.length} Views`);
    expect(Object.keys(data.temas).sort()).toEqual(data.estado.fuente!.themes.map(({ name }) => name).sort());
    // Export reads the Workspace: it writes nothing next to it.
    expect(existsSync(join(workspace, '.diagrams'))).toBe(false);
  }, 60_000);

  it('embeds the font files of the Themes as data URLs', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'export-fonts-'));
    mkdirSync(join(workspace, 'fonts'));
    cpSync(join(fixtures, 'fonts', 'Erica One.ttf'), join(workspace, 'fonts', 'Erica One.ttf'));
    writeFileSync(
      join(workspace, 'main.dg'),
      `specification { node servicio }
model { servicio api "API" }
theme t {
  palette { papel "#ffffff" }
  fonts { body "Erica One"  fallback "serif" }
  node { layer relleno solid { color papel }  slots { title } }
}
view general { type architecture  include **  theme t }
`,
    );
    const out = join(workspace, 'out.html');

    const { exitCode, stderr } = await run(['export', '--workspace', workspace, '--out', out]);

    expect(stderr).toBe('');
    expect(exitCode).toBe(0);
    const { fuentes: fonts } = dataOf(readFileSync(out, 'utf8'));
    const bytes = readFileSync(join(fixtures, 'fonts', 'Erica One.ttf'));
    expect(fonts).toEqual({ 'fonts/Erica One.ttf': `data:font/ttf;base64,${bytes.toString('base64')}` });
  }, 60_000);

  it('a Workspace that does not compile exports nothing and exits 1 with its Issues', async () => {
    const workspace = copy('with-errors');
    const out = join(workspace, 'out.html');

    const { exitCode, stdout } = await run(['export', '--workspace', workspace, '--out', out]);

    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/error/i);
    expect(existsSync(out)).toBe(false);
  }, 60_000);

  it('without --out or --workspace it is a usage error', async () => {
    expect((await run(['export', '--workspace', copy('minimal')])).exitCode).toBe(2);
    expect((await run(['export', '--out', join(tmpdir(), 'x.html')])).exitCode).toBe(2);
  });
});
