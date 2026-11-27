/**
 * Check of the documentation that can rot; each `checkX(root) -> Violation[]` returns sorted violations.
 * `checkReadmes`: each `packages/<package>/README.md` exists and has the `README_SECTIONS` (`section`), its
 * "Entry file" paths exist (`entry`) and "Test" contains `pnpm --filter <package> test` (`test`).
 * `checkAdrIndex`: each `docs/adr/NNNN-*.md` appears in `docs/adr/README.md` (`index`).
 * `checkAgentsLinks`: `AGENTS.md` names `docs/adr/README.md` and `docs/research-branches.md`, and both exist (`index`).
 * `checkGuidePairs`: each `docs/guide/<x>.md` (English, source) has `docs/guia/<x>.md` (Spanish) and the other way round
 * (`pair`); the first line of each links to its pair (`link`); same number of `## ` (`headings`) and identical code blocks (`code`).
 * `checkGlossary`: each entry of `CONTEXT.md` (line `**X**...:`) is headed `**English** (es: **Spanish**):` (`glossary`).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const README_SECTIONS = [
  'What it does',
  'What it does not do',
  'Depends on',
  'Entry file',
  'Related ADR',
  'Test',
] as const;

export interface Violation {
  file: string;
  rule: 'section' | 'entry' | 'test' | 'index' | 'pair' | 'link' | 'headings' | 'code' | 'glossary';
  message: string;
}

/** Text under `## <section>` up to the next `## `; `undefined` if the heading is missing. */
function sectionBody(readme: string, section: string): string | undefined {
  const lines = readme.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${section}`);
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

export function checkReadmes(root: string): Violation[] {
  const violations: Violation[] = [];
  const packagesFolder = join(root, 'packages');
  if (!existsSync(packagesFolder)) return violations;

  for (const pkg of readdirSync(packagesFolder).sort()) {
    const file = `packages/${pkg}/README.md`;
    if (!existsSync(join(root, file))) {
      violations.push({ file, rule: 'section', message: 'the package README is missing' });
      continue;
    }
    const readme = readFileSync(join(root, file), 'utf8');
    const violate = (rule: Violation['rule'], message: string) =>
      violations.push({ file, rule, message });

    for (const section of README_SECTIONS) {
      if (sectionBody(readme, section) === undefined) {
        violate('section', `the section "## ${section}" is missing`);
      }
    }

    const entry = sectionBody(readme, 'Entry file');
    if (entry !== undefined) {
      const paths = [...entry.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      if (paths.length === 0) {
        violate('entry', 'the entry section names no file between backticks');
      }
      for (const path of paths) {
        if (!existsSync(join(root, path))) violate('entry', `the entry file "${path}" does not exist`);
      }
    }

    const test = sectionBody(readme, 'Test');
    if (test !== undefined && !test.includes(`pnpm --filter ${pkg} test`)) {
      violate('test', `the "Test" section does not contain "pnpm --filter ${pkg} test"`);
    }
  }
  return violations;
}

export function checkAdrIndex(root: string): Violation[] {
  const folder = join(root, 'docs/adr');
  if (!existsSync(folder)) return [];
  const adrs = readdirSync(folder)
    .filter((f) => /^\d{4}-.+\.md$/.test(f))
    .sort();
  if (adrs.length === 0) return [];

  const indexPath = 'docs/adr/README.md';
  if (!existsSync(join(root, indexPath))) {
    return [{ file: indexPath, rule: 'index', message: 'the ADR index is missing' }];
  }
  const index = readFileSync(join(root, indexPath), 'utf8');
  return adrs
    .filter((adr) => !index.includes(adr))
    .map((adr) => ({
      file: `docs/adr/${adr}`,
      rule: 'index' as const,
      message: `the ADR does not appear in ${indexPath}`,
    }));
}

const AGENTS_INDEXES = ['docs/adr/README.md', 'docs/research-branches.md'] as const;

export function checkAgentsLinks(root: string): Violation[] {
  const file = 'AGENTS.md';
  if (!existsSync(join(root, file))) {
    return [{ file, rule: 'index', message: 'AGENTS.md is missing' }];
  }
  const agents = readFileSync(join(root, file), 'utf8');
  const unlinked = AGENTS_INDEXES.filter((index) => !agents.includes(index)).map((index) => ({
    file,
    rule: 'index' as const,
    message: `AGENTS.md does not link ${index}`,
  }));
  const missing = AGENTS_INDEXES.filter((index) => !existsSync(join(root, index))).map((index) => ({
    file: index,
    rule: 'index' as const,
    message: 'the file AGENTS.md links is missing',
  }));
  return [...unlinked, ...missing];
}

const ENGLISH_FOLDER = 'docs/guide';
const SPANISH_FOLDER = 'docs/guia';

/** `## ` headings and code blocks (with their fence) of a Markdown file; ignores `## ` inside a block. */
function guideStructure(text: string): { headings: number; blocks: string[] } {
  let headings = 0;
  const blocks: string[] = [];
  let current: string[] | undefined;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      if (current === undefined) current = [line];
      else {
        blocks.push([...current, line].join('\n'));
        current = undefined;
      }
    } else if (current !== undefined) current.push(line);
    else if (line.startsWith('## ')) headings += 1;
  }
  return { headings, blocks };
}

const mdFiles = (root: string, folder: string): string[] =>
  existsSync(join(root, folder)) ? readdirSync(join(root, folder)).filter((f) => f.endsWith('.md')).sort() : [];

export function checkGuidePairs(root: string): Violation[] {
  const violations: Violation[] = [];
  const english = mdFiles(root, ENGLISH_FOLDER);
  const spanish = mdFiles(root, SPANISH_FOLDER);
  const sides = [
    { folder: ENGLISH_FOLDER, files: english, other: SPANISH_FOLDER, existing: spanish },
    { folder: SPANISH_FOLDER, files: spanish, other: ENGLISH_FOLDER, existing: english },
  ];
  for (const { folder, files, other, existing } of sides) {
    const target = other.slice('docs/'.length);
    for (const name of files) {
      const file = `${folder}/${name}`;
      if (!existing.includes(name)) {
        violations.push({ file, rule: 'pair', message: `the pair ${other}/${name} is missing` });
        continue;
      }
      const first = readFileSync(join(root, file), 'utf8').split('\n').find((l) => l.trim() !== '') ?? '';
      if (!first.includes(`](../${target}/${name})`)) {
        violations.push({ file, rule: 'link', message: `the first line does not link to ../${target}/${name}` });
      }
    }
  }
  for (const name of english.filter((n) => spanish.includes(n))) {
    const a = guideStructure(readFileSync(join(root, ENGLISH_FOLDER, name), 'utf8'));
    const b = guideStructure(readFileSync(join(root, SPANISH_FOLDER, name), 'utf8'));
    const file = `${ENGLISH_FOLDER}/${name}`;
    if (a.headings !== b.headings) {
      violations.push({ file, rule: 'headings', message: `${a.headings} "## " headings in English and ${b.headings} in Spanish` });
    }
    if (a.blocks.length !== b.blocks.length) {
      violations.push({ file, rule: 'code', message: `${a.blocks.length} code blocks in English and ${b.blocks.length} in Spanish` });
    } else {
      const i = a.blocks.findIndex((block, k) => block !== b.blocks[k]);
      if (i !== -1) violations.push({ file, rule: 'code', message: `code block ${i + 1} differs between languages` });
    }
  }
  return violations;
}

const GLOSSARY_ENTRY = /^\*\*[^*]+\*\* \(es: \*\*[^*]+\*\*\):$/;

export function checkGlossary(root: string): Violation[] {
  const file = 'CONTEXT.md';
  if (!existsSync(join(root, file))) return [];
  return readFileSync(join(root, file), 'utf8')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith('**') && line.endsWith(':'))
    .filter((line) => !GLOSSARY_ENTRY.test(line))
    .map((line) => ({
      file,
      rule: 'glossary' as const,
      message: `the entry "${line}" does not follow "**English** (es: **Spanish**):"`,
    }));
}
