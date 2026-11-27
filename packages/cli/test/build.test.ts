import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import { run } from 'cli';

const fixtures = join(import.meta.dirname, 'fixtures');

function copyFixture(name: string): string {
  const target = mkdtempSync(join(tmpdir(), 'build-'));
  cpSync(join(fixtures, name), target, { recursive: true });
  return target;
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

describe('build', () => {
  it('writes the canonical source and one geometry per View in .diagrams/', async () => {
    const workspace = copyFixture('build-basic');

    const result = await run(['build', '--workspace', workspace]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const source = canonicalFormSchema.parse(readJson(join(workspace, '.diagrams', 'canonico.json')));
    expect(source.views.map((view) => view.id)).toEqual(['general', 'detalle']);
    expect(readdirSync(join(workspace, '.diagrams', 'geometria')).sort()).toEqual([
      'detalle.json',
      'general.json',
    ]);
    const general = readJson(join(workspace, '.diagrams', 'geometria', 'general.json')) as {
      view: string;
      geometry: { nodes: Record<string, unknown>; edges: Record<string, unknown>; width: number };
    };
    expect(general.view).toBe('general');
    expect(Object.keys(general.geometry.nodes).sort()).toEqual(['api', 'db']);
    expect(Object.keys(general.geometry.edges)).toEqual(['api -> db']);
    expect(general.geometry.width).toBeGreaterThan(0);
  });

  it('with validation errors it exits 1 and writes nothing', async () => {
    const workspace = copyFixture('with-errors');

    const result = await run(['build', '--workspace', workspace]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('error');
    expect(existsSync(join(workspace, '.diagrams'))).toBe(false);
  });

  it('a View with its own theme uses that Theme and the rest the global one', async () => {
    const workspace = copyFixture('build-basic');
    const themeOf = (view: string): unknown =>
      (readJson(join(workspace, '.diagrams', 'geometria', `${view}.json`)) as { theme: string }).theme;

    await run(['build', '--workspace', workspace]);
    expect([themeOf('general'), themeOf('detalle')]).toEqual(['neutral', 'grande']);

    await run(['build', '--workspace', workspace, '--theme', 'grande']);
    expect([themeOf('general'), themeOf('detalle')]).toEqual(['grande', 'grande']);
  });

  it('the View Theme changes the geometry (larger font, larger boxes)', async () => {
    const workspace = copyFixture('build-basic');
    await run(['build', '--workspace', workspace]);
    const height = (view: string): number =>
      (readJson(join(workspace, '.diagrams', 'geometria', `${view}.json`)) as { geometry: { height: number } }).geometry.height;

    expect(height('detalle')).toBeGreaterThan(height('general'));
  });

  it('--theme with a missing Theme is a usage failure and does not write', async () => {
    const workspace = copyFixture('build-basic');

    const result = await run(['build', '--workspace', workspace, '--theme', 'nada']);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("'nada'");
    expect(result.stderr).toContain('neutral, neutral-dark, high-contrast, grande');
    expect(existsSync(join(workspace, '.diagrams'))).toBe(false);
  });

  it('--theme-path brings Themes before the Workspace; the Workspace Themes are still available', async () => {
    const workspace = copyFixture('build-basic');
    const themes = join(fixtures, 'extra-themes');

    const result = await run(['build', '--workspace', workspace, '--theme-path', themes, '--theme', 'corporativo']);

    expect(result.exitCode).toBe(0);
    const source = canonicalFormSchema.parse(readJson(join(workspace, '.diagrams', 'canonico.json')));
    expect(source.themes.map((theme) => theme.name)).toContain('corporativo');
    const general = readJson(join(workspace, '.diagrams', 'geometria', 'general.json')) as { theme: string };
    expect(general.theme).toBe('corporativo');
  });

  it('if the Workspace and --theme-path share a path, the Workspace wins', async () => {
    const workspace = copyFixture('build-basic');
    writeFileSync(join(workspace, 'themes.dg'), '');

    const result = await run([
      'build', '--workspace', workspace, '--theme-path', join(fixtures, 'extra-themes'), '--theme', 'corporativo',
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("'corporativo'");
  });

  it('rebuilding replaces the output: no deleted Views are left', async () => {
    const workspace = copyFixture('build-basic');
    await run(['build', '--workspace', workspace]);
    const source = readFileSync(join(workspace, 'main.dg'), 'utf8');
    writeFileSync(join(workspace, 'main.dg'), source.replace(/view detalle[\s\S]*$/, ''));

    await run(['build', '--workspace', workspace]);

    expect(readdirSync(join(workspace, '.diagrams', 'geometria'))).toEqual(['general.json']);
  });

  it('a pair of overlapping Pins comes out as overlapping-pins with position and related', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'build-'));
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

    const result = await run(['build', '--workspace', workspace, '--json']);

    expect(result.exitCode).toBe(0);
    const { issues } = JSON.parse(result.stdout) as { issues: Record<string, unknown>[] };
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'overlapping-pins',
        severity: 'warning',
        file: 'main.dg',
        line: 6,
        column: 8,
        related: [{ file: 'main.dg', line: 7, column: 8, message: "Pin of 'b'" }],
      }),
    ]);
    expect(existsSync(join(workspace, '.diagrams', 'canonico.json'))).toBe(true);
  });

  it('with --strict overlapping Pins make the build fail', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'build-'));
    writeFileSync(
      join(workspace, 'main.dg'),
      'specification { node s } model { s a  s b } view v { type flow include ** node a { pin 0,0 } node b { pin 0,0 } }',
    );

    const result = await run(['build', '--workspace', workspace, '--strict']);

    expect(result.exitCode).toBe(1);
    expect(existsSync(join(workspace, '.diagrams'))).toBe(false);
  });
});
