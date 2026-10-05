import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { salidaDeValidateSchema } from 'canonico';
import { run } from 'cli';

const fixtures = join(import.meta.dirname, 'fixtures');

describe('validate', () => {
  it('un Workspace valido sale con codigo 0 y el objeto versionado', async () => {
    const resultado = await run(['validate', '--workspace', join(fixtures, 'minimo'), '--json']);

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stderr).toBe('');
    expect(JSON.parse(resultado.stdout)).toEqual({
      contractVersion: 1,
      ok: true,
      summary: { errors: 0, warnings: 0, truncated: false },
      issues: [],
    });
  });

  it('con errores sale con codigo 1 y un snapshot estable del contrato', async () => {
    const resultado = await run(['validate', '--workspace', join(fixtures, 'con-errores'), '--json']);

    expect(resultado.exitCode).toBe(1);
    const salida = salidaDeValidateSchema.parse(JSON.parse(resultado.stdout));
    expect(salida.ok).toBe(false);
    expect(salida.summary).toEqual({ errors: 2, warnings: 0, truncated: false });
    expect(salida.issues.map((i) => [i.file, i.line, i.column, i.code])).toEqual([
      ['main.dg', 6, 3, 'E_UNKNOWN_NODE_TYPE'],
      ['main.dg', 7, 12, 'E_SYNTAX_ERROR'],
    ]);
    // `message` no es contrato (ADR 0008): el snapshot fija solo lo que si lo es.
    expect({ ...salida, issues: salida.issues.map(({ message, ...resto }) => resto) }).toMatchSnapshot();
  });

  it('--max-issues corta la lista pero summary cuenta todo y marca truncated', async () => {
    const resultado = await run([
      'validate', '--workspace', join(fixtures, 'con-errores'), '--json', '--max-issues', '1',
    ]);

    const salida = JSON.parse(resultado.stdout);
    expect(salida.issues).toHaveLength(1);
    expect(salida.summary).toEqual({ errors: 2, warnings: 0, truncated: true });
    expect(resultado.exitCode).toBe(1);
  });

  it('--strict trata los warnings como fallo; sin el, un warning deja codigo 0', async () => {
    const warning = {
      code: 'W_OVERLAPPING_PINS',
      severity: 'warning' as const,
      file: 'main.dg',
      line: 1,
      column: 1,
      message: 'Pins solapados',
    };
    const dependencias = {
      leer: () => ({}),
      compilar: () => ({ issues: [warning] }),
    };
    const args = ['validate', '--workspace', '.', '--json'];

    const tolerante = await run(args, dependencias);
    expect(tolerante.exitCode).toBe(0);
    expect(JSON.parse(tolerante.stdout).summary).toEqual({ errors: 0, warnings: 1, truncated: false });

    const estricto = await run([...args, '--strict'], dependencias);
    expect(estricto.exitCode).toBe(1);
    expect(JSON.parse(estricto.stdout).ok).toBe(false);
  });

  it('sin --json imprime texto legible con posicion', async () => {
    const resultado = await run(['validate', '--workspace', join(fixtures, 'con-errores')]);

    expect(resultado.stdout).toContain('main.dg:6:3 error E_UNKNOWN_NODE_TYPE');
    expect(resultado.stdout).toContain('2 errores, 0 avisos');
  });

  it.each([
    [['validate']],
    [['validate', '--workspace', '/no/existe']],
    [['validate', '--workspace', '.', '--max-issues', '0']],
    [['validate', '--workspace', '.', '--rara']],
    [['construir']],
  ])('fallo de uso %j sale con codigo 2, stderr y stdout vacio', async (argv) => {
    const resultado = await run(argv);

    expect(resultado.exitCode).toBe(2);
    expect(resultado.stdout).toBe('');
    expect(resultado.stderr).not.toBe('');
  });

  it('nunca escribe: el Workspace queda identico tras validar', async () => {
    const copia = mkdtempSync(join(tmpdir(), 'diagrams-'));
    cpSync(join(fixtures, 'con-errores'), copia, { recursive: true });
    const foto = () =>
      readdirSync(copia, { recursive: true })
        .map(String)
        .sort()
        .map((ruta) => {
          const abs = join(copia, ruta);
          return [ruta, statSync(abs).isFile() ? readFileSync(abs, 'utf8') : null];
        });
    const antes = foto();

    await run(['validate', '--workspace', copia, '--json']);

    expect(foto()).toEqual(antes);
  });

  it('ignora la salida derivada .diagrams/ al leer el Workspace', async () => {
    const copia = mkdtempSync(join(tmpdir(), 'diagrams-'));
    cpSync(join(fixtures, 'minimo'), copia, { recursive: true });
    mkdirSync(join(copia, '.diagrams'));
    writeFileSync(join(copia, '.diagrams', 'roto.dg'), 'basura {{{');

    const resultado = await run(['validate', '--workspace', copia, '--json']);

    expect(resultado.exitCode).toBe(0);
  });
});
