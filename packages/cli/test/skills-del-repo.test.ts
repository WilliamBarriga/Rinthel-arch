import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { run } from 'cli';

const skills = join(import.meta.dirname, '../../../skills');

function ejemplosDg(skill: string): string[] {
  const texto = readFileSync(join(skills, skill, 'SKILL.md'), 'utf8');
  return [...texto.matchAll(/```\n([\s\S]*?)```/g)].map(([, bloque]) => bloque!).filter((bloque) => bloque.startsWith('specification'));
}

describe('skills del repo: cada ejemplo .dg compila con el CLI', () => {
  for (const skill of ['rinthel-diagramas', 'rinthel-temas']) {
    it(`${skill} trae ejemplos y todos validan`, async () => {
      const ejemplos = ejemplosDg(skill);
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
