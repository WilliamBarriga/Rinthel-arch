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
});
