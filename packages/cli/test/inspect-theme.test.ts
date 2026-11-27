import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { INSPECT_CONTRACT_VERSION, inspectOutputSchema } from 'canonical';
import { run } from 'cli';

const ROOT = resolve(__dirname, 'fixtures/theme-cli');

async function json(args: string[], root = ROOT) {
  const r = await run(['inspect', 'theme', ...args, '--workspace', root, '--json']);
  return { ...r, output: r.stdout === '' ? undefined : inspectOutputSchema.parse(JSON.parse(r.stdout)) };
}

const themeOf = (output: Awaited<ReturnType<typeof json>>['output']) => {
  if (output?.command !== 'theme') throw new Error('expected the theme output');
  return output.theme;
};
const origins = (output: Awaited<ReturnType<typeof json>>['output']) =>
  Object.fromEntries(themeOf(output).layers.map((c) => [c.name, `${c.origin.file}:${c.origin.line}`]));

describe('inspect theme', () => {
  it('gives the extends chain, the resolved Layers with the file:line of the patch that set them, and the Metrics', async () => {
    const r = await json(['app']);

    expect(r.exitCode).toBe(0);
    expect(r.output).toMatchObject({ contractVersion: INSPECT_CONTRACT_VERSION, command: 'theme' });
    const theme = themeOf(r.output);
    expect(theme).toMatchObject({ name: 'app', file: 'app.dg', line: 1, extends: ['base'], parts: ['resalte'], hasCode: false, components: [] });
    expect(theme.layers.map((c) => [c.name, c.primitive])).toEqual([
      ['forma', 'rect'],
      ['relleno', 'solid'],
      ['borde', 'border'],
    ]);
    // `borde` was set by the child patch; the rest comes from the parent.
    expect(origins(r.output)).toEqual({ forma: 'base.dg:8', relleno: 'base.dg:9', borde: 'app.dg:3' });
    expect(theme.layers[2]?.props).toMatchObject({ width: 2 });
    expect(theme.metrics.fontSize).toBeGreaterThan(0);
    expect(theme.slots).toBe('column { title attrs }');
    expect(`${theme.slotsOrigin.file}:${theme.slotsOrigin.line}`).toBe('base.dg:11');
  });

  it('--kind and --state resolve the cascade of one case, with the parts used', async () => {
    const type = await json(['app', '--kind', 'servicio']);
    expect(type.exitCode).toBe(0);
    expect(themeOf(type.output)).toMatchObject({ kind: 'servicio', parts: ['resalte'] });
    expect(themeOf(type.output).layers.map((c) => c.name)).toEqual(['forma', 'brillo', 'relleno', 'borde']);
    expect(origins(type.output)).toMatchObject({ brillo: 'base.dg:2', relleno: 'app.dg:5' });
    expect(themeOf(type.output).layers[1]).toMatchObject({ above: true });

    const status = await json(['app', '--kind', 'servicio', '--state', 'hover']);
    expect(themeOf(status.output)).toMatchObject({ kind: 'servicio', state: 'hover' });
    expect(origins(status.output)).toMatchObject({ borde: 'app.dg:8', relleno: 'app.dg:5' });
    expect(themeOf(status.output).layers.find((c) => c.name === 'borde')?.props).toMatchObject({ width: 4 });
  });

  it('a built-in Theme is marked as such; with --catalog it brings the catalog keys', async () => {
    const r = await json(['neutral', '--catalog']);

    expect(r.exitCode).toBe(0);
    const theme = themeOf(r.output);
    expect(theme.file).toBe('<built-in>');
    expect(theme.catalog?.primitives).toEqual(expect.arrayContaining(['rect', 'solid', 'border', 'circle']));
    expect(theme.catalog?.motions).toEqual(expect.arrayContaining(['pulse']));
    expect(theme.catalog?.effects.length).toBeGreaterThan(0);
    expect(themeOf((await json(['neutral'])).output).catalog).toBeUndefined();
  });

  it('a built-in that extends another gives its extends chain and the site of each Layer in the built-in text', async () => {
    const theme = themeOf((await json(['neutral-dark'])).output);

    expect(theme.extends).toEqual(['neutral']);
    // neutral-dark only changes the Palette: all its Layers were set by neutral, on different lines of the built-in text.
    const sites = theme.layers.map((c) => c.origin);
    expect(sites.every((s) => s.file === '<built-in>' && s.line > 1)).toBe(true);
    expect(new Set(sites.map((s) => s.line)).size).toBe(sites.length);
  });

  it('a missing Theme, kind or state exits with code 1 and a suggestion', async () => {
    const theme = await run(['inspect', 'theme', 'ap', '--workspace', ROOT]);
    expect(theme.exitCode).toBe(1);
    expect(theme.stdout).toBe('');
    expect(theme.stderr).toContain("No such Theme 'ap'");
    expect(theme.stderr).toContain('app');

    const type = await run(['inspect', 'theme', 'app', '--kind', 'servicioo', '--workspace', ROOT]);
    expect(type.exitCode).toBe(1);
    expect(type.stderr).toContain('servicio');

    const status = await run(['inspect', 'theme', 'app', '--state', 'hovr', '--workspace', ROOT]);
    expect(status.exitCode).toBe(1);
    expect(status.stderr).toContain('hover');
  });

  it('the readable text lists the chain, the Layers with their origin and the Metrics', async () => {
    const r = await run(['inspect', 'theme', 'app', '--kind', 'servicio', '--workspace', ROOT]);

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('app app.dg:1');
    expect(r.stdout).toContain('extends: base');
    expect(r.stdout).toContain('parts: resalte');
    expect(r.stdout).toMatch(/relleno solid .*app\.dg:5/);
    expect(r.stdout).toContain('Metrics:');
  });

  it('shows the page background with the patch that set each Layer and whether it stays fixed', async () => {
    const root = resolve(__dirname, 'fixtures/theme-page');
    const r = await json(['hijo'], root);

    expect(r.exitCode).toBe(0);
    const { page } = themeOf(r.output);
    expect(page.fixed).toBe(true);
    expect(page.layers.map((c) => [c.name, c.primitive, `${c.origin.file}:${c.origin.line}`])).toEqual([
      ['fondo', 'solid', 'main.dg:8'],
      ['puntos', 'dots', 'main.dg:15'],
    ]);
    expect(page.layers[1]?.props).toMatchObject({ size: 30 });

    const text = await run(['inspect', 'theme', 'hijo', '--workspace', root]);
    expect(text.stdout).toContain('Page: (fixed to the viewer)');
    expect(text.stdout).toMatch(/puntos dots .*main\.dg:15/);
  });

  it('shows the group stack, the collapsed Group stack and the header, each Layer with the patch that set it', async () => {
    const root = resolve(__dirname, 'fixtures/theme-group');
    const open = themeOf((await json(['hijo'], root)).output).group;
    const byKind = themeOf((await json(['hijo', '--kind', 'capa', '--state', 'hover'], root)).output).group;
    const origin = (layers: typeof open.layers) => Object.fromEntries(layers.map((c) => [c.name, `${c.origin.file}:${c.origin.line}`]));

    expect(open).toMatchObject({ own: true, header: 'row gap 6 pad 6 { icon title }', padding: { top: 12, left: 12, bottom: 12, right: 12 } });
    expect(open.headerHeight).toBeGreaterThan(0);
    expect(open.layers.map((c) => c.name)).toEqual(['caja', 'borde']);
    // `borde` was set by the child patch (width); the rest comes from the parent.
    expect(origin(open.layers)).toEqual({ caja: 'main.dg:8', borde: 'main.dg:19' });
    expect(open.layers[1]?.props).toMatchObject({ width: 2, color: 'tinta' });
    // Collapsed: another stack, with the Layer that the parent's `state collapsed` adds.
    expect(open.collapsed.layers.map((c) => c.name)).toEqual(['caja', 'relleno', 'borde']);
    expect(origin(open.collapsed.layers)['relleno']).toBe('main.dg:14');
    // With kind and state: the last level that set the Layer wins.
    expect(origin(byKind.layers)['borde']).toBe('main.dg:13');
    expect(byKind.layers.find((c) => c.name === 'borde')?.props).toMatchObject({ color: 'azul', width: 3 });

    const text = await run(['inspect', 'theme', 'hijo', '--workspace', root]);
    expect(text.stdout).toContain('Grupo:');
    expect(text.stdout).toContain('header: row gap 6 pad 6 { icon title }');
    expect(text.stdout).toMatch(/borde dashed .*main\.dg:19/);
  });

  it('shows where the Slots arrangement of the Node, the Group header and the collapsed Group was written', async () => {
    const root = resolve(__dirname, 'fixtures/theme-group');
    const { group, slotsOrigin } = themeOf((await json(['hijo'], root)).output);
    const site = ({ file, line }: { file: string; line: number }) => `${file}:${line}`;

    // The `hijo` Theme inherits its header from `base`; the collapsed Group and the Node do not write `slots`: the Theme line holds.
    expect(site(group.headerOrigin)).toBe('main.dg:10');
    expect(site(group.collapsed.slotsOrigin)).toBe(site(slotsOrigin));
    expect(site(slotsOrigin)).toBe('main.dg:18');

    const text = (await run(['inspect', 'theme', 'hijo', '--workspace', root])).stdout;
    expect(text).toMatch(/header: row gap 6 pad 6 \{ icon title \} \(height \d+\) main\.dg:10/);
    expect(text).toMatch(/^Slots: .* main\.dg:18$/m);
  });

  it('the Metrics bring the effective Group padding (header plus padding), not the Node default', async () => {
    const root = resolve(__dirname, 'fixtures/theme-group');
    const { metrics, group } = themeOf((await json(['hijo'], root)).output);

    expect(metrics['paddingGrupo']).toEqual({ top: group.headerHeight + 12, left: 12, bottom: 12, right: 12 });
  });

  it('a Theme without group says so: a plain stack from the tokens and not the Node Layers', async () => {
    const root = resolve(__dirname, 'fixtures/theme-group');
    const { group } = themeOf((await json(['sobrio'], root)).output);

    expect(group).toMatchObject({ own: false, layers: [] });
    expect((await run(['inspect', 'theme', 'sobrio', '--workspace', root])).stdout).toContain('Group: (no group: sober stack derived from the Theme tokens, not the Node Layers)');
  });

  it('a Workspace with errors is not queried (code 1)', async () => {
    const r = await run(['inspect', 'theme', 'app', '--workspace', join(__dirname, 'fixtures/with-errors')]);
    expect(r.exitCode).toBe(1);
  });
});

describe('inspect theme --diagram', () => {
  const DIAGRAM_ROOT = resolve(__dirname, 'fixtures/theme-diagram');
  const fill = (output: Awaited<ReturnType<typeof json>>['output']) => themeOf(output).layers.find((c) => c.name === 'relleno')?.props['color'];

  it('applies the diagram patches of that Diagram type to the cascade', async () => {
    const without = await json(['t'], DIAGRAM_ROOT);
    const flow = await json(['t', '--diagram', 'flow'], DIAGRAM_ROOT);
    const architecture = await json(['t', '--diagram', 'architecture'], DIAGRAM_ROOT);

    expect(fill(without.output)).toBe('azul');
    expect(fill(architecture.output)).toBe('azul');
    expect(fill(flow.output)).toBe('verde');
    expect(themeOf(flow.output)).toMatchObject({ diagram: 'flow' });
  });

  it('an unknown Diagram type exits with code 1 and suggests the closest one', async () => {
    const r = await run(['inspect', 'theme', 't', '--diagram', 'flo', '--workspace', DIAGRAM_ROOT]);

    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('flow');
  });
});

describe('inspect theme: sequence and row elements', () => {
  const SEQUENCE_ROOT = resolve(__dirname, 'fixtures/theme-sequence');

  it('shows the stack, the patches and the Metrics of each declared element', async () => {
    const r = await json(['t'], SEQUENCE_ROOT);

    const { elements } = themeOf(r.output);
    expect(elements?.sequence?.['message']).toMatchObject({
      layers: [{ name: 'linea', primitive: 'line' }],
      markers: { end: 'arrow' },
      metrics: { gap: 40 },
      patches: { reply: [{ name: 'linea', primitive: 'line', props: { style: 'dashed' } }] },
    });
    expect(elements?.sequence?.['fragment']?.patches['alt']?.map((c) => c.name)).toEqual(['forma', 'relleno']);
    expect(elements?.sequence?.['lifeline']).toBeUndefined();
    expect(elements?.row).toMatchObject({ height: 30, layers: [{ name: 'fondo' }] });
  });

  it('--diagram sequence of a Theme without lifeline shows the lifeline derived from edge, dashed and with derived: true', async () => {
    const r = await json(['app', '--diagram', 'sequence']);

    const sequence = themeOf(r.output).elements?.sequence;
    expect(sequence?.['lifeline']).toMatchObject({ derived: true, layers: [{ primitive: 'line', props: { style: 'dashed' } }], markers: { end: 'cross' } });
    // The five sequence Elements, all derived: the Theme declares none.
    expect(Object.keys(sequence ?? {}).sort()).toEqual(['activation', 'fragment', 'lifeline', 'message', 'note']);
    expect(Object.values(sequence ?? {}).every((e) => e.derived === true)).toBe(true);
    // The activation takes only forma, relleno and borde from the Node; `reply` carries the opposite continuity.
    expect(sequence?.['activation']?.layers.map((c) => c.name)).toEqual(['forma', 'relleno', 'borde']);
    expect(sequence?.['message']?.patches['reply']?.at(-1)?.props).toMatchObject({ style: 'dashed' });
  });

  it('a declared Element is not marked derived and --diagram er derives the row', async () => {
    const declared = await json(['t', '--diagram', 'sequence'], SEQUENCE_ROOT);
    const er = await json(['app', '--diagram', 'er']);

    expect(themeOf(declared.output).elements?.sequence?.['message']?.derived).toBeUndefined();
    expect(themeOf(declared.output).elements?.sequence?.['lifeline']?.derived).toBe(true);
    expect(themeOf(er.output).elements?.row).toMatchObject({ derived: true, layers: [] });
  });

  it('the readable text marks the derived Elements', async () => {
    const r = await run(['inspect', 'theme', 'app', '--diagram', 'sequence', '--workspace', ROOT]);

    expect(r.stdout).toMatch(/Sequence:\n {2}lifeline \(derived\):[^\n]*end=cross/);
  });

  it('the readable text lists the elements and a Theme without them does not mention them', async () => {
    const withValue = await run(['inspect', 'theme', 't', '--workspace', SEQUENCE_ROOT]);
    const without = await run(['inspect', 'theme', 'app', '--workspace', ROOT]);

    expect(withValue.stdout).toMatch(/Sequence:\n {2}message:[^\n]*\n[\s\S]*patch reply/);
    expect(withValue.stdout).toMatch(/Row: height 30/);
    expect(without.stdout).not.toMatch(/Sequence:|Row:/);
  });
});

describe('inspect theme: declared Elements come out as before derivation', () => {
  const SEQUENCE_ROOT = resolve(__dirname, 'fixtures/theme-sequence');
  /** Output recorded without Element derivation for the same Workspace: the independent reference. */
  const fromMain = (testCase: string): string => readFileSync(resolve(__dirname, `fixtures/inspect-theme-main/t-${testCase}.json`), 'utf8');

  it.each([
    ['none', []],
    ['er', ['--diagram', 'er']],
    ['flow', ['--diagram', 'flow']],
  ])('without derived Elements (%s), the output is exactly the previous one', async (testCase, extra) => {
    const r = await run(['inspect', 'theme', 't', ...extra, '--workspace', SEQUENCE_ROOT, '--json']);

    expect(r.stdout).toBe(fromMain(testCase));
  });

  it('with --diagram sequence, the output is the previous one plus the derived Elements, marked', async () => {
    const r = await run(['inspect', 'theme', 't', '--diagram', 'sequence', '--workspace', SEQUENCE_ROOT, '--json']);
    const output = JSON.parse(r.stdout) as { theme: { elements: { sequence: Record<string, { derived?: true }> } } };
    const { sequence } = output.theme.elements;
    const derivedBlocks = Object.keys(sequence).filter((name) => sequence[name]?.derived === true);
    for (const name of derivedBlocks) delete sequence[name];

    expect(derivedBlocks.sort()).toEqual(['activation', 'lifeline', 'note']);
    expect(output).toEqual(JSON.parse(fromMain('sequence')));
  });
});

describe('inspect theme without --diagram', () => {
  it('Layers and Metrics without Diagram type patches, as before (a diagram architecture patch does not apply)', async () => {
    const root = resolve(__dirname, 'fixtures/theme-diagram-architecture');
    const r = await run(['inspect', 'theme', 't', '--workspace', root, '--json']);

    expect(r.stdout).toBe(readFileSync(resolve(__dirname, 'fixtures/inspect-theme-main/architecture-none.json'), 'utf8'));
    expect(JSON.parse(r.stdout).theme.slots).toBe('column { title attrs }');
  });
});
