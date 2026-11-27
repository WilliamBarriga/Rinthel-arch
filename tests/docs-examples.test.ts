import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonical';
import type { Node, GraphView, SequenceView } from 'canonical';
import { compile } from 'dsl';

/** What the public documentation promises: the tutorial validates, the map brings the 14 Themes, the screenshots and links exist. */
const ROOT = resolve(import.meta.dirname, '..');
const readDg = (dir: string): Record<string, string> =>
  Object.fromEntries(
    readdirSync(resolve(ROOT, dir), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.dg'))
      .map((e) => [resolve(e.parentPath, e.name).slice(resolve(ROOT, dir).length + 1), readFileSync(resolve(e.parentPath, e.name), 'utf8')]),
  );

const THEMES = [
  'soft-card', 'glass-chip', 'neobrutalist', 'blueprint', 'soft-light', 'crt-terminal', 'synthwave',
  'editorial', 'bauhaus', 'sticky-notes', 'keycaps', 'metro-map', 'pcb', 'pixel-art',
];

describe('tutorial (examples/tutorial)', () => {
  for (const step of [1, 2, 3, 4, 5, 6]) {
    it(`step ${step} validates without errors or warnings and brings the main View`, () => {
      const { canonical, issues } = compile(readDg(`examples/tutorial/step-${step}`));
      expect(issues).toEqual([]);
      expect(canonical?.views.map((v) => v.id)).toContain('main');
    });
  }
});

describe('tutorial step 6: sequence and ER', () => {
  it('brings a sequence View and an er View over the same Model', () => {
    const { canonical } = compile(readDg('examples/tutorial/step-6'));
    expect(resolveView(canonical!, 'purchase-sequence')?.type).toBe('sequence');
    expect(resolveView(canonical!, 'tables')?.type).toBe('er');
  });
});

describe('rinthel-arch map with the 14 Themes', () => {
  const files = readDg('examples/rinthel-arch');
  const { canonical, issues } = compile(files);

  it('validates without errors', () => {
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('has an `open-<theme>` View per approved Theme', () => {
    const ids = canonical!.views.map((v) => v.id);
    for (const t of THEMES) expect(ids, t).toContain(`open-${t}`);
  });
});

describe('rinthel-arch map: regenerated from scan (the live demo)', () => {
  const { canonical, issues } = compile(readDg('examples/rinthel-arch'));
  const views = canonical!.views;
  const all = (nodes: Node[]): Node[] => nodes.flatMap((n) => [n, ...all(n.children)]);

  it('every Node of the repo Group cites a scan unit as a Source path ref', () => {
    const repo = canonical!.model.nodes.find((n) => n.id === 'repo')!;
    expect(repo.source.map((s) => s.ref)).toEqual(['.']);
    const ofRepo = all(repo.children);
    expect(ofRepo.length).toBeGreaterThanOrEqual(10);
    for (const n of ofRepo) expect(n.source.some((s) => s.kind === 'path'), n.id).toBe(true);
  });

  it('opens on an architecture context View with Drill-down into existing Views', () => {
    const context = views.find((v) => v.id === 'context')!;
    expect(context.type).toBe('architecture');
    expect(context.links?.length).toBeGreaterThanOrEqual(2);
    for (const l of context.links ?? []) expect(views.map((v) => v.id)).toContain(l.view);
  });

  it('has a flow View with Steps, an er View over the scanned tables and a sequence View', () => {
    const flow = views.find((v) => v.type === 'flow' && (resolveView(canonical!, v.id) as GraphView).steps.length >= 3);
    expect(flow).toBeDefined();
    const er = resolveView(canonical!, 'tables') as GraphView;
    expect(er.type).toBe('er');
    expect(er.nodes).toHaveLength(3);
    expect(er.edges).toHaveLength(2);
    const sequence = resolveView(canonical!, 'export-sequence') as SequenceView;
    expect(sequence.type).toBe('sequence');
    expect(sequence.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('adds no issues of its own (only the deliberate Theme warnings)', () => {
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(issues.filter((i) => !(i.severity === 'warning' && i.code.startsWith('theme-')))).toEqual([]);
  });
});

/** ```dg blocks of the guides: each one is a complete one-file Workspace and must compile without errors. */
describe('.dg blocks of the guides', () => {
  const GUIDES = ['docs/guide/dsl-reference.md', 'docs/guide/themes.md', 'docs/guide/tutorial.md', 'docs/guide/quick-start.md', 'docs/guia/dsl-reference.md', 'docs/guia/themes.md', 'docs/guia/tutorial.md', 'docs/guia/quick-start.md', 'README.md', 'README.es.md'];
  const blocks = GUIDES.flatMap((guide) =>
    [...readFileSync(resolve(ROOT, guide), 'utf8').matchAll(/```dg\n([\s\S]*?)```/g)].map(([, text], i) => ({ name: `${guide}#${i + 1}`, text: text! })),
  );

  it('every guide with sequence, ER or Theme DSL brings complete examples', () => {
    for (const guide of GUIDES.slice(0, 3)) expect(blocks.filter((b) => b.name.startsWith(guide)).length, guide).toBeGreaterThanOrEqual(2);
  });

  for (const block of blocks) {
    it(`${block.name} compiles without errors`, () => {
      const { issues } = compile({ 'main.dg': block.text });
      expect(issues.filter((i) => i.severity === 'error'), block.text).toEqual([]);
    });
  }

  it('the README presents the four Diagram types with a screenshot', () => {
    for (const path of ['README.md', 'README.es.md']) {
      const readme = readFileSync(resolve(ROOT, path), 'utf8');
      for (const type of ['architecture', 'flow', 'sequence', 'er']) expect(readme, `${path} ${type}`).toContain(`\`${type}\``);
      for (const img of ['diagram-types/sequence-shop.png', 'diagram-types/er-shop.png']) expect(readme, path).toContain(`docs/img/${img}`);
    }
  });
});

describe('README pair', () => {
  const en = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
  const es = readFileSync(resolve(ROOT, 'README.es.md'), 'utf8');
  const firstLink = (text: string) => /\]\(([^)]+)\)/.exec(text.replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)|!\[[^\]]*\]\([^)]*\)/g, ''))?.[1];
  const headings = (text: string) => text.split('\n').filter((l) => l.startsWith('## ')).length;
  const sections = (text: string) => text.split(/^## /m);

  it('README.md is English, opens with the tagline and links the Spanish version and the Live demo first', () => {
    expect(existsSync(resolve(ROOT, 'README.en.md'))).toBe(false);
    expect(en).toContain('**Architecture diagrams of your repo that your coding agent can read, write and keep up to date.**');
    expect(en).toContain('One text model, many views (architecture, flow, sequence, ER), with themes and step-by-step animation ready for talks and video.');
    expect(firstLink(en)).toBe('README.es.md');
    expect(firstLink(es)).toBe('README.md');
    for (const text of [en, es]) expect(text).toContain('https://williambarriga.github.io/Rinthel-arch/');
  });

  it('both READMEs share the section order and mention LikeC4 only in the License section', () => {
    expect(headings(es)).toBe(headings(en));
    expect(en.split('\n').filter((l) => l.startsWith('## '))).toEqual(['## Quick start', '## Why', '## What you get', '## Themes', '## The DSL at a glance', '## Docs', '## Status', '## Contributing', '## License']);
    for (const text of [en, es]) {
      const withLikeC4 = sections(text).filter((s) => /likec4/i.test(s));
      expect(withLikeC4.map((s) => s.split('\n')[0])).toEqual([text === en ? 'License' : 'Licencia']);
      expect(text).toContain('npx rinthel-arch dev');
      expect(text).toContain('docs/gallery.md');
    }
  });
});

describe('public documentation', () => {
  it('there are sequence and ER screenshots (tutorial step 6 and README)', () => {
    for (const f of ['tutorial/step-6-sequence-shop.png', 'tutorial/step-6-er-shop.png', 'diagram-types/sequence-shop.png', 'diagram-types/er-shop.png']) {
      expect(existsSync(resolve(ROOT, 'docs/img', f)), f).toBe(true);
    }
  });

  it('there is a screenshot per Theme and per tutorial step', () => {
    for (const t of THEMES) expect(existsSync(resolve(ROOT, `docs/img/themes/${t}.png`)), t).toBe(true);
    const steps = readdirSync(resolve(ROOT, 'docs/img/tutorial'));
    for (const n of [1, 2, 3, 4, 5]) expect(steps.some((f) => f.startsWith(`step-${n}-`)), `step ${n}`).toBe(true);
  });

  it('the relative links of README, guides and CONTRIBUTING point to files that exist', () => {
    const guides = ['docs/guide', 'docs/guia'].flatMap((dir) => readdirSync(resolve(ROOT, dir)).map((f) => `${dir}/${f}`));
    const docs = ['README.md', 'README.es.md', 'CONTRIBUTING.md', 'docs/gallery.md', ...guides];
    for (const doc of docs) {
      const text = readFileSync(resolve(ROOT, doc), 'utf8');
      for (const [, target] of text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
        if (/^[a-z]+:/.test(target!)) continue;
        expect(existsSync(resolve(ROOT, dirname(doc), target!)), `${doc} -> ${target}`).toBe(true);
      }
    }
  });
});
