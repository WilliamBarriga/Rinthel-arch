import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import {
  README_SECTIONS,
  checkAgentsLinks,
  checkGlossary,
  checkAdrIndex,
  checkGuidePairs,
  checkReadmes,
} from '../scripts/check-docs';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const temporaries: string[] = [];

afterAll(() => {
  for (const folder of temporaries) {
    rmSync(folder, { force: true, recursive: true });
  }
});

/** Temporary repo with the given files (relative path -> content). */
function createRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'check-docs-'));
  temporaries.push(root);
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
}

/** README that follows the template; `without` removes sections and `entry` changes the entry file. */
function validReadme(name: string, options: { without?: string[]; entry?: string } = {}): string {
  const entry = options.entry ?? `packages/${name}/src/index.ts`;
  const bodies: Record<string, string> = {
    'What it does': 'Does something.',
    'What it does not do': 'Does not do anything else.',
    'Depends on': 'Nothing.',
    'Entry file': `\`${entry}\``,
    'Related ADR': '`docs/adr/0001-x.md`',
    Test: `\`pnpm --filter ${name} test\``,
  };
  const sections = README_SECTIONS.filter((s) => !options.without?.includes(s))
    .map((s) => `## ${s}\n\n${bodies[s]}\n`)
    .join('\n');
  return `# ${name}\n\nSummary.\n\n${sections}`;
}

function repoWithPackage(readme?: string): Record<string, string> {
  return {
    'packages/canonical/src/index.ts': 'export const a = 1;\n',
    ...(readme === undefined ? {} : { 'packages/canonical/README.md': readme }),
  };
}

describe('checkReadmes', () => {
  it('pins the section template', () => {
    expect(README_SECTIONS).toEqual([
      'What it does',
      'What it does not do',
      'Depends on',
      'Entry file',
      'Related ADR',
      'Test',
    ]);
  });

  it('accepts a README that follows the template', () => {
    const root = createRepo(repoWithPackage(validReadme('canonical')));

    expect(checkReadmes(root)).toEqual([]);
  });

  it('fails when a package has no README', () => {
    const root = createRepo(repoWithPackage());

    expect(checkReadmes(root)).toContainEqual(
      expect.objectContaining({ file: 'packages/canonical/README.md', rule: 'section' }),
    );
  });

  it('fails when a README loses a section', () => {
    const root = createRepo(repoWithPackage(validReadme('canonical', { without: ['What it does not do'] })));

    expect(checkReadmes(root)).toContainEqual(
      expect.objectContaining({ file: 'packages/canonical/README.md', rule: 'section' }),
    );
  });

  it('fails when the named entry file does not exist', () => {
    const root = createRepo(
      repoWithPackage(validReadme('canonical', { entry: 'packages/canonical/src/missing.ts' })),
    );

    expect(checkReadmes(root)).toContainEqual(
      expect.objectContaining({ file: 'packages/canonical/README.md', rule: 'entry' }),
    );
  });

  it('fails when the entry section names no file', () => {
    const readme = validReadme('canonical').replace(/`packages\/canonical\/src\/index\.ts`/, 'the index');
    const root = createRepo(repoWithPackage(readme));

    expect(checkReadmes(root)).toContainEqual(expect.objectContaining({ rule: 'entry' }));
  });

  it('fails when the Test section does not give the package command', () => {
    const readme = validReadme('canonical').replace('pnpm --filter canonical test', 'pnpm test');
    const root = createRepo(repoWithPackage(readme));

    expect(checkReadmes(root)).toContainEqual(expect.objectContaining({ rule: 'test' }));
  });

  it('the READMEs of this repo follow the template', () => {
    expect(checkReadmes(repoRoot)).toEqual([]);
  });
});

describe('checkAdrIndex', () => {
  const index = '# ADRs\n\n- `0001-one.md`: current.\n- `0002-two.md`: current.\n';

  it('accepts an index that lists every ADR', () => {
    const root = createRepo({
      'docs/adr/README.md': index,
      'docs/adr/0001-one.md': '# One\n',
      'docs/adr/0002-two.md': '# Two\n',
    });

    expect(checkAdrIndex(root)).toEqual([]);
  });

  it('fails when an ADR is not in the index', () => {
    const root = createRepo({
      'docs/adr/README.md': index,
      'docs/adr/0001-one.md': '# One\n',
      'docs/adr/0002-two.md': '# Two\n',
      'docs/adr/0003-three.md': '# Three\n',
    });

    expect(checkAdrIndex(root)).toContainEqual(
      expect.objectContaining({ file: 'docs/adr/0003-three.md', rule: 'index' }),
    );
  });

  it('fails when there are ADRs and the index is missing', () => {
    const root = createRepo({ 'docs/adr/0001-one.md': '# One\n' });

    expect(checkAdrIndex(root)).toContainEqual(expect.objectContaining({ rule: 'index' }));
  });

  it('the index of this repo lists every ADR', () => {
    expect(checkAdrIndex(repoRoot)).toEqual([]);
  });
});

describe('checkAgentsLinks', () => {
  const complete = 'Indexes: `docs/adr/README.md` and `docs/research-branches.md`.\n';
  const indexes = { 'docs/adr/README.md': '# ADRs\n', 'docs/research-branches.md': '# Research branches\n' };

  it('accepts an AGENTS.md that links both existing indexes', () => {
    expect(checkAgentsLinks(createRepo({ 'AGENTS.md': complete, ...indexes }))).toEqual([]);
  });

  it('fails when the link to the ADR index is missing', () => {
    const root = createRepo({ 'AGENTS.md': 'Only `docs/research-branches.md`.\n', ...indexes });

    expect(checkAgentsLinks(root)).toContainEqual(
      expect.objectContaining({ file: 'AGENTS.md', rule: 'index' }),
    );
  });

  it('fails when the link to the branch index is missing', () => {
    const root = createRepo({ 'AGENTS.md': 'Only `docs/adr/README.md`.\n', ...indexes });

    expect(checkAgentsLinks(root)).toHaveLength(1);
  });

  it('fails when docs/research-branches.md does not exist', () => {
    const root = createRepo({ 'AGENTS.md': complete, 'docs/adr/README.md': '# ADRs\n' });

    expect(checkAgentsLinks(root)).toContainEqual(
      expect.objectContaining({ file: 'docs/research-branches.md', rule: 'index' }),
    );
  });

  it('the AGENTS.md of this repo links both indexes and they exist', () => {
    expect(checkAgentsLinks(repoRoot)).toEqual([]);
  });
});

describe('checkGuidePairs', () => {
  const en = '[Read in Spanish](../guia/a.md)\n\n# A\n\n## One\n\n```dg\nmodel {}\n```\n\n## Two\n';
  const es = '[Read in English](../guide/a.md)\n\n# A\n\n## Uno\n\n```dg\nmodel {}\n```\n\n## Dos\n';

  it('accepts a pair that links both ways with equal headings and code', () => {
    const root = createRepo({ 'docs/guide/a.md': en, 'docs/guia/a.md': es });

    expect(checkGuidePairs(root)).toEqual([]);
  });

  it('fails when a guide lacks its pair', () => {
    const root = createRepo({ 'docs/guide/a.md': en });

    expect(checkGuidePairs(root)).toContainEqual(expect.objectContaining({ file: 'docs/guide/a.md', rule: 'pair' }));
  });

  it('fails when the Spanish guide has no English source', () => {
    const root = createRepo({ 'docs/guia/a.md': es });

    expect(checkGuidePairs(root)).toContainEqual(expect.objectContaining({ file: 'docs/guia/a.md', rule: 'pair' }));
  });

  it('fails when the first line does not link to the pair', () => {
    const root = createRepo({ 'docs/guide/a.md': en.replace('../guia/a.md', '../guia/b.md'), 'docs/guia/a.md': es });

    expect(checkGuidePairs(root)).toContainEqual(expect.objectContaining({ file: 'docs/guide/a.md', rule: 'link' }));
  });

  it('fails when the number of ## headings differs', () => {
    const root = createRepo({ 'docs/guide/a.md': en, 'docs/guia/a.md': es.replace('\n## Dos\n', '') });

    expect(checkGuidePairs(root)).toContainEqual(expect.objectContaining({ rule: 'headings' }));
  });

  it('does not count a ## line inside a code block as a heading', () => {
    const root = createRepo({ 'docs/guide/a.md': en.replace('model {}', '## not a heading'), 'docs/guia/a.md': es.replace('model {}', '## not a heading') });

    expect(checkGuidePairs(root)).toEqual([]);
  });

  it('fails when a code block differs', () => {
    const root = createRepo({ 'docs/guide/a.md': en, 'docs/guia/a.md': es.replace('model {}', 'model { x }') });

    expect(checkGuidePairs(root)).toContainEqual(expect.objectContaining({ rule: 'code' }));
  });

  it('fails when the number of code blocks differs', () => {
    const root = createRepo({ 'docs/guide/a.md': en, 'docs/guia/a.md': es.replace(/```dg[\s\S]*?```\n/, '') });

    expect(checkGuidePairs(root)).toContainEqual(expect.objectContaining({ rule: 'code' }));
  });

  it('the guides of this repo are paired', () => {
    expect(checkGuidePairs(repoRoot)).toEqual([]);
  });
});

describe('checkGlossary', () => {
  const glossary = (entry: string) => `# x\n\n## Language\n\n${entry}\nA definition.\n`;

  it('accepts entries headed by the English term with the Spanish one in parentheses', () => {
    const root = createRepo({ 'CONTEXT.md': glossary('**Model** (es: **Modelo**):') });

    expect(checkGlossary(root)).toEqual([]);
  });

  it('fails when an entry is still headed by the Spanish term', () => {
    const root = createRepo({ 'CONTEXT.md': glossary('**Modelo** (en: **Model**):') });

    expect(checkGlossary(root)).toContainEqual(expect.objectContaining({ file: 'CONTEXT.md', rule: 'glossary' }));
  });

  it('fails when an entry lacks the Spanish term', () => {
    const root = createRepo({ 'CONTEXT.md': glossary('**Model**:') });

    expect(checkGlossary(root)).toContainEqual(expect.objectContaining({ rule: 'glossary' }));
  });

  it('the glossary of this repo is English first', () => {
    expect(checkGlossary(repoRoot)).toEqual([]);
  });
});
