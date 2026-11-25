import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { run } from 'cli';

const skills = join(import.meta.dirname, '../../../skills');
const nombres = ['rinthel-diagramas', 'rinthel-temas'];

function archivosMd(skill: string): string[] {
  const dir = join(skills, skill);
  const referencias = existsSync(join(dir, 'references')) ? readdirSync(join(dir, 'references')).map((f) => join('references', f)) : [];
  return ['SKILL.md', ...referencias];
}

function leer(skill: string, archivo: string): string {
  return readFileSync(join(skills, skill, archivo), 'utf8');
}

function ejemplosDg(texto: string): string[] {
  return [...texto.matchAll(/```(?:dg)?\n([\s\S]*?)```/g)].map(([, bloque]) => bloque!).filter((bloque) => bloque.startsWith('specification'));
}

function frontmatter(texto: string): Record<string, string> {
  const bloque = /^---\n([\s\S]*?)\n---\n/.exec(texto)?.[1] ?? '';
  return Object.fromEntries([...bloque.matchAll(/^([\w-]+): (.*)$/gm)].map(([, clave, valor]) => [clave!, valor!]));
}

describe('repo skills: Agent Skills format', () => {
  for (const skill of nombres) {
    it(`${skill} has valid frontmatter with compatibility`, () => {
      const campos = frontmatter(leer(skill, 'SKILL.md'));
      expect(campos['name']).toBe(skill);
      expect(campos['name']).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(campos['description']!.length).toBeGreaterThan(0);
      expect(campos['description']!.length).toBeLessThanOrEqual(1024);
      expect(campos['compatibility']!.length).toBeGreaterThan(0);
      expect(campos['compatibility']!.length).toBeLessThanOrEqual(500);
      expect(campos['compatibility']).toContain('rinthel-arch');
    });

    it(`${skill} keeps SKILL.md under 500 lines`, () => {
      expect(leer(skill, 'SKILL.md').split('\n').length).toBeLessThan(500);
    });
  }
});

describe('repo skills: self-contained and in English', () => {
  for (const skill of nombres) {
    for (const archivo of archivosMd(skill)) {
      it(`${skill}/${archivo} has no repo-only paths and no unrelated npx`, () => {
        const texto = leer(skill, archivo);
        expect(texto).not.toMatch(/\b(?:docs|examples|packages|scripts|research)\//);
        expect(texto).not.toMatch(/\b(?:CONTEXT|AGENTS|CODING)\.md\b|\bADR\b|\bpnpm\b/);
        expect(texto).not.toMatch(/npx\s+(?:-y\s+)?diagrams/);
        expect(texto).not.toMatch(/<rinthel-arch>/);
        expect(texto).not.toMatch(/[áéíóúñ¿¡]|\b(?:Usalo|Vista de|Nodos? y)\b/);
      });
    }

    it(`${skill} invokes the CLI as diagrams or npx -y -p rinthel-arch@<version> diagrams`, () => {
      const texto = leer(skill, 'SKILL.md');
      expect(texto).toMatch(/npx -y -p rinthel-arch@\d+\.\d+\.\d+ diagrams/);
    });

    it(`${skill} links only to reference files that exist`, () => {
      const texto = leer(skill, 'SKILL.md');
      for (const [, ruta] of texto.matchAll(/`(references\/[\w.-]+)`/g)) {
        expect(existsSync(join(skills, skill, ruta!)), ruta).toBe(true);
      }
    });
  }
});

describe('repo skills: every .dg example compiles with the CLI', () => {
  for (const skill of nombres) {
    it(`${skill} ships examples and all of them validate`, async () => {
      const ejemplos = archivosMd(skill).flatMap((archivo) => ejemplosDg(leer(skill, archivo)));
      expect(ejemplos.length).toBeGreaterThan(0);
      for (const ejemplo of ejemplos) {
        const dir = mkdtempSync(join(tmpdir(), 'skill-ej-'));
        writeFileSync(join(dir, 'main.dg'), ejemplo);
        const resultado = await run(['validate', '--workspace', dir, '--json']);
        expect(JSON.parse(resultado.stdout).issues ?? [], ejemplo).toEqual([]);
        expect(resultado.exitCode).toBe(0);
      }
    });
  }
});

describe('repo skills: import and refresh from code', () => {
  const texto = leer('rinthel-diagramas', 'SKILL.md');
  const seccion = (titulo: string): string => new RegExp(`## ${titulo}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(texto)?.[1] ?? '';

  it('has an "Import from code" section with the scan flow', () => {
    const cuerpo = seccion('Import from code');
    for (const termino of ['dg scan', 'source { path', 'parent', 'weight', 'external', 'collapsed', 'link', '30', 'validate']) {
      expect(cuerpo, termino).toContain(termino);
    }
  });

  it('has a "Refresh from code" section with the matching and protection rules', () => {
    const cuerpo = seccion('Refresh from code').toLowerCase();
    for (const termino of ['orphan', 'last ref', 'hand-written', 'never rewrite', 'title, description, group, node kind, views or pins', 'scan-ignore', 'only when the user asks']) {
      expect(cuerpo, termino).toContain(termino);
    }
  });

  it('ships the reference with the starting Node kind catalog and the coverage shape', () => {
    const referencia = leer('rinthel-diagramas', 'references/scan-import.md');
    expect(referencia).toContain('rinthel/scan@1');
    expect(referencia).toContain('node external');
    expect(referencia).toContain('orphanRefs');
  });

  it('is the section the scan summary points to', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skill-scan-'));
    writeFileSync(join(dir, 'package.json'), '{"name":"x"}');
    const resultado = await run(['scan', dir, '--json']);
    expect(JSON.parse(resultado.stdout).next).toContain('"Import from code"');
    expect(texto).toContain('## Import from code');
    expect(texto).toContain('## Refresh from code');
  });
});

describe('repo skills: plan from a spec', () => {
  const texto = leer('rinthel-diagramas', 'SKILL.md');
  const seccion = (titulo: string): string => new RegExp(`## ${titulo}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(texto)?.[1] ?? '';

  it('has a "Plan from a spec" section with the Blueprint rules', () => {
    const cuerpo = seccion('Plan from a spec');
    for (const termino of ['planned', 'spec "<file>#<section>"', 'Assumption:', 'Open question:', 'architecture', 'sequence', 'er', 'at most about 5 questions', 'dev']) {
      expect(cuerpo, termino).toContain(termino);
    }
  });

  it('has a reconcile section that uses inspect planned and planned-with-path and reports what is not built', () => {
    const cuerpo = seccion('Reconcile a Blueprint with the code');
    for (const termino of ['inspect planned', 'planned-with-path', 'dg scan', 'not built yet or diverges from the plan', 'path']) {
      expect(cuerpo, termino).toContain(termino);
    }
  });

  it('ships the reference and the CLI facts it relies on exist', async () => {
    expect(leer('rinthel-diagramas', 'references/plan-from-spec.md')).toContain('## Reconcile decisions');
    const ayuda = await run(['inspect', '--help']);
    expect(ayuda.stdout).toContain('inspect planned');
  });
});
