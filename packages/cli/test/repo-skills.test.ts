import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { run } from 'cli';

const skills = join(import.meta.dirname, '../../../skills');
const names = ['rinthel-diagramas', 'rinthel-temas'];

function mdFiles(skill: string): string[] {
  const dir = join(skills, skill);
  const references = existsSync(join(dir, 'references')) ? readdirSync(join(dir, 'references')).map((f) => join('references', f)) : [];
  return ['SKILL.md', ...references];
}

function read(skill: string, file: string): string {
  return readFileSync(join(skills, skill, file), 'utf8');
}

function dgExamples(text: string): string[] {
  return [...text.matchAll(/```(?:dg)?\n([\s\S]*?)```/g)].map(([, block]) => block!).filter((block) => block.startsWith('specification'));
}

function frontmatter(text: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/^([\w-]+): (.*)$/gm)].map(([, key, value]) => [key!, value!]));
}

describe('repo skills: Agent Skills format', () => {
  for (const skill of names) {
    it(`${skill} has valid frontmatter with compatibility`, () => {
      const fields = frontmatter(read(skill, 'SKILL.md'));
      expect(fields['name']).toBe(skill);
      expect(fields['name']).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(fields['description']!.length).toBeGreaterThan(0);
      expect(fields['description']!.length).toBeLessThanOrEqual(1024);
      expect(fields['compatibility']!.length).toBeGreaterThan(0);
      expect(fields['compatibility']!.length).toBeLessThanOrEqual(500);
      expect(fields['compatibility']).toContain('rinthel-arch');
    });

    it(`${skill} keeps SKILL.md under 500 lines`, () => {
      expect(read(skill, 'SKILL.md').split('\n').length).toBeLessThan(500);
    });
  }
});

describe('repo skills: self-contained and in English', () => {
  for (const skill of names) {
    for (const file of mdFiles(skill)) {
      it(`${skill}/${file} has no repo-only paths and no unrelated npx`, () => {
        const text = read(skill, file);
        expect(text).not.toMatch(/\b(?:docs|examples|packages|scripts|research)\//);
        expect(text).not.toMatch(/\b(?:CONTEXT|AGENTS|CODING)\.md\b|\bADR\b|\bpnpm\b/);
        expect(text).not.toMatch(/npx\s+(?:-y\s+)?diagrams/);
        expect(text).not.toMatch(/<rinthel-arch>/);
        expect(text).not.toMatch(/[áéíóúñ¿¡]|\b(?:Usalo|Vista de|Nodos? y)\b/);
      });
    }

    it(`${skill} invokes the CLI as diagrams or npx -y -p rinthel-arch@<version> diagrams`, () => {
      const text = read(skill, 'SKILL.md');
      expect(text).toMatch(/npx -y -p rinthel-arch@\d+\.\d+\.\d+ diagrams/);
    });

    it(`${skill} links only to reference files that exist`, () => {
      const text = read(skill, 'SKILL.md');
      for (const [, path] of text.matchAll(/`(references\/[\w.-]+)`/g)) {
        expect(existsSync(join(skills, skill, path!)), path).toBe(true);
      }
    });
  }
});

describe('repo skills: every .dg example compiles with the CLI', () => {
  for (const skill of names) {
    it(`${skill} ships examples and all of them validate`, async () => {
      const examples = mdFiles(skill).flatMap((file) => dgExamples(read(skill, file)));
      expect(examples.length).toBeGreaterThan(0);
      for (const example of examples) {
        const dir = mkdtempSync(join(tmpdir(), 'skill-example-'));
        writeFileSync(join(dir, 'main.dg'), example);
        const result = await run(['validate', '--workspace', dir, '--json']);
        expect(JSON.parse(result.stdout).issues ?? [], example).toEqual([]);
        expect(result.exitCode).toBe(0);
      }
    });
  }
});

describe('repo skills: import and refresh from code', () => {
  const text = read('rinthel-diagramas', 'SKILL.md');
  const section = (title: string): string => new RegExp(`## ${title}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(text)?.[1] ?? '';

  it('has an "Import from code" section with the scan flow', () => {
    const body = section('Import from code');
    for (const term of ['dg scan', 'source { path', 'parent', 'weight', 'external', 'collapsed', 'link', '30', 'validate']) {
      expect(body, term).toContain(term);
    }
  });

  it('has a "Refresh from code" section with the matching and protection rules', () => {
    const body = section('Refresh from code').toLowerCase();
    for (const term of ['orphan', 'last ref', 'hand-written', 'never rewrite', 'title, description, group, node kind, views or pins', 'scan-ignore', 'only when the user asks']) {
      expect(body, term).toContain(term);
    }
  });

  it('ships the reference with the starting Node kind catalog and the coverage shape', () => {
    const reference = read('rinthel-diagramas', 'references/scan-import.md');
    expect(reference).toContain('rinthel/scan@1');
    expect(reference).toContain('node external');
    expect(reference).toContain('orphanRefs');
  });

  it('is the section the scan summary points to', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skill-scan-'));
    writeFileSync(join(dir, 'package.json'), '{"name":"x"}');
    const result = await run(['scan', dir, '--json']);
    expect(JSON.parse(result.stdout).next).toContain('"Import from code"');
    expect(text).toContain('## Import from code');
    expect(text).toContain('## Refresh from code');
  });
});

describe('repo skills: plan from a spec', () => {
  const text = read('rinthel-diagramas', 'SKILL.md');
  const section = (title: string): string => new RegExp(`## ${title}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(text)?.[1] ?? '';

  it('has a "Plan from a spec" section with the Blueprint rules', () => {
    const body = section('Plan from a spec');
    for (const term of ['planned', 'spec "<file>#<section>"', 'Assumption:', 'Open question:', 'architecture', 'sequence', 'er', 'at most about 5 questions', 'dev']) {
      expect(body, term).toContain(term);
    }
  });

  it('has a reconcile section that uses inspect planned and planned-with-path and reports what is not built', () => {
    const body = section('Reconcile a Blueprint with the code');
    for (const term of ['inspect planned', 'planned-with-path', 'dg scan', 'not built yet or diverges from the plan', 'path']) {
      expect(body, term).toContain(term);
    }
  });

  it('ships the reference and the CLI facts it relies on exist', async () => {
    expect(read('rinthel-diagramas', 'references/plan-from-spec.md')).toContain('## Reconcile decisions');
    const help = await run(['inspect', '--help']);
    expect(help.stdout).toContain('inspect planned');
  });
});
