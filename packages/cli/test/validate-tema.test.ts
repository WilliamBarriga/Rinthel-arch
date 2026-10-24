import { resolve } from 'node:path';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CONTRACT_VERSION, salidaDeValidateSchema } from 'canonico';
import { run } from 'cli';

const FIXTURE = resolve(__dirname, 'fixtures/tema-errores');

async function validar(raiz: string) {
  const r = await run(['validate', '--workspace', raiz, '--json']);
  return { ...r, salida: salidaDeValidateSchema.parse(JSON.parse(r.stdout)) };
}

describe('validate: codigos de Tema', () => {
  it('informa todos los errores a la vez con codigo estable, sin subir contractVersion', async () => {
    const { exitCode, salida } = await validar(FIXTURE);

    expect(exitCode).toBe(1);
    expect(salida.contractVersion).toBe(CONTRACT_VERSION);
    expect(CONTRACT_VERSION).toBe(1);
    expect(salida.issues.map((i) => [i.code, i.line])).toEqual([
      ['E_THEME_UNKNOWN_PROPERTY', 20],
      ['E_THEME_UNKNOWN_PROPERTY', 26],
      ['E_THEME_UNKNOWN_LAYER', 27],
      ['E_THEME_PATCH_WITHOUT_PLACEMENT', 28],
      ['E_THEME_STATE_TOUCHES_METRICS', 29],
    ]);
  });

  it('con un unico candidato cercano emite fix; los issues de un parche traen related a la Capa base', async () => {
    const { salida } = await validar(FIXTURE);
    const [base, parche] = salida.issues;

    expect(base?.fix).toEqual({ file: 'main.dg', range: { start: { line: 20, column: 38 }, end: { line: 20, column: 42 } }, replacement: 'width' });
    expect(base).not.toHaveProperty('hint');
    expect(parche?.fix).toMatchObject({ replacement: 'color' });
    expect(parche?.related).toEqual([{ file: 'main.dg', line: 23, column: 13, message: expect.stringContaining('relleno') }]);
  });

  it('aplicar los fix por edit deja el Tema sin esos errores', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'validate-tema-'));
    cpSync(FIXTURE, raiz, { recursive: true });
    const { salida } = await validar(raiz);
    const fixes = salida.issues.flatMap((i) => (i.fix === undefined ? [] : [i.fix]));
    expect(fixes).toHaveLength(2);

    const antes = readFileSync(join(raiz, 'main.dg'), 'utf8');
    const r = await run(['edit', '--workspace', raiz, '--edits', JSON.stringify(fixes)]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(readFileSync(join(raiz, 'main.dg'), 'utf8')).not.toBe(antes);
    expect((await validar(raiz)).salida.issues.map((i) => i.code)).not.toContain('E_THEME_UNKNOWN_PROPERTY');
  });
});
