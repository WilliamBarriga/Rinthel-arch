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
