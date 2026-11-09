import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { run } from 'cli';

function workspace(texto: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'dg-secuencia-'));
  writeFileSync(join(dir, 'main.dg'), texto);
  return dir;
}

const modelo = (interaccion: string) => `specification { node servicio }
model {
  servicio cliente
  servicio api
  ${interaccion}
}
view v { type sequence
 interaction checkout }
`;

describe('validate: Vistas de secuencia', () => {
  it('una Interaccion valida sale con codigo 0', async () => {
    const resultado = await run(['validate', '--workspace', workspace(modelo('interaction checkout { cliente -> api "pedir"\n reply api -> cliente "ok" }')), '--json']);
    expect(resultado.exitCode).toBe(0);
  });

  it('un extremo desconocido es E_UNKNOWN_LIFELINE con su correccion, nunca un error de sintaxis', async () => {
    const resultado = await run(['validate', '--workspace', workspace(modelo('interaction checkout { cliente -> apii }')), '--json']);
    expect(resultado.exitCode).toBe(1);
    const { issues } = JSON.parse(resultado.stdout) as { issues: { code: string; fix?: { replacement: string } }[] };
    expect(issues.map((i) => i.code)).toEqual(['E_UNKNOWN_LIFELINE']);
    expect(issues[0]!.fix?.replacement).toBe('api');
  });

  it('un reply sin sync es un aviso que solo falla con --strict', async () => {
    const dir = workspace(modelo('interaction checkout { reply api -> cliente }'));
    expect((await run(['validate', '--workspace', dir])).exitCode).toBe(0);
    expect((await run(['validate', '--workspace', dir, '--strict'])).exitCode).toBe(1);
  });

  describe('Notas y ref', () => {
    const issuesDe = async (texto: string) => {
      const resultado = await run(['validate', '--workspace', workspace(texto), '--json']);
      return { exitCode: resultado.exitCode, issues: (JSON.parse(resultado.stdout) as { issues: { code: string; severity: string; hint?: string; fix?: { replacement: string } }[] }).issues };
    };

    it('un ref a una Interaccion inexistente es E_UNKNOWN_INTERACTION con fix por typo', async () => {
      const { exitCode, issues } = await issuesDe(modelo('interaction login { cliente -> api }\n interaction checkout { cliente -> api "pedir"\n ref logn }'));
      expect(exitCode).toBe(1);
      const unknown = issues.filter((i) => i.code === 'E_UNKNOWN_INTERACTION');
      expect(unknown).toHaveLength(1);
      expect(unknown[0]!.fix?.replacement).toBe('login');
    });

    it('un ref a una Interaccion que ninguna Vista de secuencia proyecta es W_REF_WITHOUT_VIEW con hint', async () => {
      const { exitCode, issues } = await issuesDe(modelo('interaction login { cliente -> api }\n interaction checkout { cliente -> api "pedir"\n ref login }'));
      expect(exitCode).toBe(0);
      expect(issues.map((i) => i.code)).toEqual(['W_REF_WITHOUT_VIEW']);
      expect(issues[0]!.severity).toBe('warning');
      expect(issues[0]!.hint).toContain('Vista');
    });

    it('un ref en ciclo hacia la propia Interaccion proyectada no da issue', async () => {
      const { exitCode, issues } = await issuesDe(modelo('interaction checkout { cliente -> api "pedir"\n ref checkout }'));
      expect(exitCode).toBe(0);
      expect(issues).toEqual([]);
    });

    it('una Nota sobre un Nodo desconocido es E_UNKNOWN_LIFELINE', async () => {
      const { issues } = await issuesDe(modelo('interaction checkout { cliente -> api "pedir"\n note over cliente, apii "x" }'));
      expect(issues.map((i) => i.code)).toEqual(['E_UNKNOWN_LIFELINE']);
      expect(issues[0]!.fix?.replacement).toBe('api');
    });
  });
});
