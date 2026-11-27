import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonical';
import type { GraphView, SequenceView } from 'canonical';
import { compile } from 'dsl';
import { openSession } from 'session';
import { CATALOG, STATES, resolvedStyle, resolveTheme } from 'theme';
import type { ResolvedTheme } from 'theme';

/** Gallery of the 14 example Themes: one `.dg` per Theme over a common Model. */
const ROOT = resolve(import.meta.dirname, '../examples/themes/gallery');
/** The 14 Themes and their fonts have a single copy, in `examples/rinthel-arch/themes/`; the gallery takes them with `--theme-path`. */
const THEME_FOLDER = resolve(import.meta.dirname, '../examples/rinthel-arch/themes');
const readDg = (root: string): [string, string][] => readdirSync(root).filter((f) => f.endsWith('.dg')).map((f) => [f, readFileSync(resolve(root, f), 'utf8')]);
const read = (): Record<string, string> => Object.fromEntries([...readDg(THEME_FOLDER), ...readDg(ROOT)]);

const THEMES = [
  'soft-card', 'glass-chip', 'neobrutalist', 'blueprint', 'soft-light', 'crt-terminal', 'synthwave',
  'editorial', 'bauhaus', 'sticky-notes', 'keycaps', 'metro-map', 'pcb', 'pixel-art',
];

const files = read();
const { canonical, issues } = compile(files);
/** Model Nodes in order, with each Group's children flattened. */
type FlatNode = { title: string; type: string; children: FlatNode[] };
const flatten = (nodes: FlatNode[]): FlatNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);
const allNodes = (): FlatNode[] => flatten(canonical!.model.nodes as FlatNode[]);
const errors = issues.filter((i) => i.severity === 'error');

/** Every Primitive a Theme uses (base stack, Kind and state patches, Edges and text). */
const primitivesOf = (t: ResolvedTheme): Set<string> => {
  const used = new Set<string>();
  for (const c of [...t.nodo.capas, ...t.arista.capas]) used.add(c.primitiva.tipo);
  for (const ops of [...Object.values(t.nodo.tipos), ...Object.values(t.nodo.estados)]) for (const op of ops) if (op.primitiva !== undefined) used.add(op.primitiva);
  for (const p of [t.arista.origen, t.arista.fin, t.arista.etiqueta, ...Object.values(t.nodo.textos)]) if (p !== undefined) used.add(p.tipo);
  return used;
};

describe('example Theme gallery', () => {
  it('every catalog Primitive (without pinning their number) appears in at least one example Theme', () => {
    const used = new Set<string>();
    const standalone = ['shape-catalog.dg', 'code.dg'].map((f) => compile({ [f]: readFileSync(resolve(import.meta.dirname, '../examples/themes', f), 'utf8') }).canonical!);
    for (const theme of [...canonical!.themes, ...standalone.flatMap((c) => c.themes)]) for (const p of primitivesOf(resolveTheme(theme))) used.add(p);
    expect(Object.keys(CATALOG).filter((p) => !used.has(p))).toEqual([]);
  });

  it('each Theme lives in its own file and all 14 are there', () => {
    for (const name of THEMES) {
      expect(files[`${name}.dg`], name).toBeDefined();
      expect(files[`${name}.dg`]).toMatch(new RegExp(`^theme ${name}\\b`, 'm'));
    }
    expect(canonical?.themes.map((t) => t.name).filter((n) => THEMES.includes(n)).sort()).toEqual([...THEMES].sort());
  });

  it('the Workspace validates without errors', () => {
    expect(errors).toEqual([]);
  });

  it('there is a coverage View, a reference one, a sequence one and an ER one per Theme', () => {
    const expected = [...THEMES, ...THEMES.map((t) => `${t}-reference`), ...THEMES.map((t) => `${t}-sequence`), ...THEMES.map((t) => `${t}-er`)];
    expect(canonical?.views.map((v) => v.id).sort()).toEqual(expected.sort());
  });

  it('the coverage Views do not show the reference Model', () => {
    for (const theme of THEMES) {
      const ids = resolveView(canonical!, theme)!.nodes.map((n) => n.id);
      expect(ids.filter((id) => id.startsWith('reference')), theme).toEqual([]);
    }
  });

  it.each(THEMES)('the reference View of %s is equivalent to the prototype open View', (theme) => {
    const view = resolveView(canonical!, `${theme}-reference`) as GraphView;
    const node = (id: string) => view.nodes.find((n) => n.id === `reference.${id}`)!;
    // Open Groups with their modules and collapsed Groups with a counter (4 roots, 3 open).
    for (const id of ['render', 'session', 'layout']) expect(node(id).collapsed, id).toBe(false);
    for (const [id, children] of [['canonical', 6], ['dsl', 4], ['shell', 4], ['cli', 5]] as const) {
      expect(node(id).collapsed, id).toBe(true);
      expect(node(id).childCount, id).toBe(children);
    }
    expect(view.nodes.map((n) => n.id)).not.toContain('reference');
    expect(view.nodes).toHaveLength(22);
    expect(view.edges).toHaveLength(36);
    expect(view.edges.some((e) => e.label === 'memoizes per View')).toBe(true);
  });

  it.each(THEMES)('%s has sequence (with Fragment and Note) and ER (with three tables) Views with its Theme', (theme) => {
    const sequence = resolveView(canonical!, `${theme}-sequence`) as SequenceView;
    expect(sequence.type).toBe('sequence');
    expect(sequence.nodes.map((n) => n.id).sort()).toEqual(['client', 'gateway', 'platform.events', 'platform.orders', 'platform.payments', 'provider']);
    expect(sequence.interaction.items.map((i) => i.type)).toEqual(expect.arrayContaining(['fragment', 'note']));
    const er = resolveView(canonical!, `${theme}-er`) as GraphView;
    expect(er.type).toBe('er');
    expect(er.nodes.map((n) => n.id).sort()).toEqual(['data.customers', 'data.lines', 'data.orders-table']);
    expect(er.edges).toHaveLength(2);
    expect(canonical!.views.find((v) => v.id === `${theme}-er`)?.theme).toBe(theme);
  });

  it('the Model covers open and collapsed Groups, Edges with and without label and one Node per state', () => {
    const text = Object.values(files).join('\n');
    expect(text).toMatch(/\bexpanded\b/);
    expect(text).toMatch(/\bcollapsed\b/);
    const edges = canonical!.model.edges;
    expect(edges.some((e) => e.label !== undefined && e.label !== '')).toBe(true);
    expect(edges.some((e) => e.label === undefined || e.label === '')).toBe(true);
    const titles = allNodes().map((n) => n.title.toLowerCase());
    // `planned` is not set by the shell but by the Model mark (ADR 0011): the gallery has no Node naming it.
    for (const state of STATES.filter((s) => s !== 'planned')) expect(titles, state).toContain(state);
  });

  it('the Model uses every declared Node kind', () => {
    const used = new Set(allNodes().map((n) => n.type));
    for (const kind of canonical!.specification.nodeTypes) expect(used.has(kind.name), kind.name).toBe(true);
  });

  it('together they cover the catalog Families', () => {
    const used = new Set<string>();
    for (const theme of canonical!.themes.filter((t) => THEMES.includes(t.name))) for (const p of primitivesOf(resolveTheme(theme))) used.add(CATALOG[p as keyof typeof CATALOG].familia);
    const all = new Set(Object.values(CATALOG).map((d) => d.familia as string).filter((f) => f !== 'codigo'));
    expect([...all].filter((f) => !used.has(f))).toEqual([]);
  });

  it.each(THEMES)('%s resolves its Style deterministically', (name) => {
    const theme = canonical!.themes.find((t) => t.name === name)!;
    const other = compile(read()).canonical!.themes.find((t) => t.name === name)!;
    expect(JSON.stringify(resolvedStyle(theme, { diagrama: 'architecture' }))).toBe(JSON.stringify(resolvedStyle(other, { diagrama: 'architecture' })));
  });

  it('the warnings of each example are exactly the ones declared in its header, and there are no others', async () => {
    const warnings = (await openSession(files).diagnose()).filter((i) => i.severity === 'warning');
    const viewsOf = (name: string) => ['', '-reference', '-sequence', '-er'].map((suffix) => `In View '${name}${suffix}'`);
    const ofTheme = (name: string) => warnings.filter((i) => i.message.startsWith(`Theme '${name}'`) || viewsOf(name).some((v) => i.message.startsWith(v)));
    const list = (name: string, line: string): string[] => {
      const value = new RegExp(`^// ${line}:\\s*(.+)$`, 'm').exec(files[`${name}.dg`]!)?.[1]?.replace(/\.$/, '').trim();
      return value === undefined || value === 'none' ? [] : value.split(',').map((t) => t.trim()).sort();
    };
    for (const name of THEMES) {
      expect(files[`${name}.dg`], `${name}: missing the "// Contrast: ..." line at the top`).toMatch(/^\/\/ Contrast:/);
      const contrast = ofTheme(name).filter((i) => i.code === 'theme-low-contrast');
      const actual = [...new Set(contrast.map((i) => /of kind '([^']+)'/.exec(i.message)![1]!))].sort();
      expect(actual, name).toEqual(list(name, 'Contrast'));
      // `// Color only: a/b, ...` declares the Kind pairs the Theme tells apart only by color (like the prototype).
      const colorOnly = ofTheme(name).filter((i) => i.code === 'theme-color-only').map((i) => /kinds '([^']+)' and '([^']+)'/.exec(i.message)!.slice(1).join('/'));
      expect([...new Set(colorOnly)].sort(), name).toEqual(list(name, 'Color only'));
      // Any other Theme warning is not declared in the header: it is a defect of the example.
      expect(ofTheme(name).filter((i) => i.code !== 'theme-low-contrast' && i.code !== 'theme-color-only').map((i) => `${i.code}: ${i.message}`), name).toEqual([]);
    }
    expect(warnings.filter((i) => !THEMES.some((n) => i.message.startsWith(`Theme '${n}'`) || viewsOf(n).some((v) => i.message.startsWith(v)))).map((i) => `${i.code}: ${i.message}`), 'warnings without a Theme').toEqual([]);
  });

  it('the bundled fonts are OFL files of the Workspace, each family with its license, without CDN', () => {
    const fonts = readdirSync(resolve(THEME_FOLDER, 'fonts'));
    const families = new Set(fonts.filter((f) => f.endsWith('.woff2')).map((f) => f.replace(/-latin-\d{3}-(?:normal|italic)\.woff2$/, '')));
    expect([...families].sort()).toEqual(['caveat', 'gelasio', 'inter', 'jetbrains-mono', 'nunito', 'outfit', 'press-start-2p', 'space-mono']);
    for (const family of families) expect(fonts, family).toContain(`OFL-${family}.txt`);
    for (const text of Object.values(files)) expect(text).not.toMatch(/https?:\/\//);
  });

  it('every font a gallery Theme declares has a file in the Workspace', async () => {
    const fontFiles = readdirSync(resolve(THEME_FOLDER, 'fonts')).map((f) => `fonts/${f}`);
    const missing = (await openSession(files, { fontFiles }).diagnose()).filter((i) => i.code === 'theme-font-missing');
    expect(missing.map((i) => i.message)).toEqual([]);
  });
});
