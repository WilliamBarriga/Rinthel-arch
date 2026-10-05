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
      ['main.dg', 8, 1, 'E_SYNTAX_ERROR'],
    ]);
    // `message` no es contrato (ADR 0008): el snapshot fija solo lo que si lo es.
    expect({ ...salida, issues: salida.issues.map(({ message, ...resto }) => resto) }).toMatchSnapshot();
  });

  it('una Arista colgante sale con E_DANGLING_EDGE, posicion y fix de un unico candidato', async () => {
    const resultado = await run(['validate', '--workspace', join(fixtures, 'arista-colgante'), '--json']);

    expect(resultado.exitCode).toBe(1);
    const salida = salidaDeValidateSchema.parse(JSON.parse(resultado.stdout));
    expect(salida.issues).toHaveLength(1);
    expect(salida.issues[0]).toMatchObject({
      code: 'E_DANGLING_EDGE',
      severity: 'error',
      file: 'main.dg',
      line: 9,
      column: 18,
      fix: {
        file: 'main.dg',
        range: { start: { line: 9, column: 18 }, end: { line: 9, column: 21 } },
        replacement: 'db',
      },
    });
  });

  it('un Atributo inexistente en una Arista sale con E_UNKNOWN_ATTRIBUTE por validate', async () => {
    const resultado = await run(
      ['validate', '--workspace', join(fixtures, 'atributo-inexistente'), '--json'],
    );

    expect(resultado.exitCode).toBe(1);
    const salida = salidaDeValidateSchema.parse(JSON.parse(resultado.stdout));
    expect(salida.issues.map((i) => [i.line, i.column, i.code])).toEqual([
      [9, 23, 'E_UNKNOWN_ATTRIBUTE'],
    ]);
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
      compilar: () => ({ pins: [], issues: [warning] }),
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

  it('un fallo interno (issue fuera de contrato) sale con codigo 2 y no lanza', async () => {
    const roto = { code: 'E_X', severity: 'error' as const, file: 'a.dg', line: 0, column: 0, message: 'x' };

    const resultado = await run(['validate', '--workspace', '.', '--json'], {
      leer: () => ({}),
      compilar: () => ({ pins: [], issues: [roto] }),
    });

    expect(resultado.exitCode).toBe(2);
    expect(resultado.stdout).toBe('');
    expect(resultado.stderr).toContain('interno');
  });

  it('un bloque sin cerrar sale con codigo 1 y posicion valida', async () => {
    const copia = mkdtempSync(join(tmpdir(), 'diagrams-'));
    writeFileSync(join(copia, 'main.dg'), 'specification { node servicio }\nmodel {\n  servicio api {');

    const resultado = await run(['validate', '--workspace', copia, '--json']);

    expect(resultado.exitCode).toBe(1);
    expect(JSON.parse(resultado.stdout).issues[0]).toMatchObject({ code: 'E_SYNTAX_ERROR', line: 3 });
  });
});

describe('validate: bucle validate/fix', () => {
  /** Aplica un `fix` (rangos 1-based, fin excluido) sobre el texto del archivo. */
  function aplicarFix(texto: string, { range, replacement }: { range: { start: { line: number; column: number }; end: { line: number; column: number } }; replacement: string }): string {
    const lineas = texto.split('\n');
    const desplazamiento = (p: { line: number; column: number }) =>
      lineas.slice(0, p.line - 1).reduce((suma, linea) => suma + linea.length + 1, 0) + p.column - 1;
    return texto.slice(0, desplazamiento(range.start)) + replacement + texto.slice(desplazamiento(range.end));
  }

  async function validar(raiz: string) {
    const resultado = await run(['validate', '--workspace', raiz, '--json']);
    return salidaDeValidateSchema.parse(JSON.parse(resultado.stdout));
  }

  it('aplicar el fix al texto hace desaparecer el issue al revalidar, sin que validate escriba', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'diagramas-fix-'));
    const archivo = join(raiz, 'main.dg');
    const original = 'specification { node servicio }\nmodel {\n  servico api\n}\n';
    writeFileSync(archivo, original);

    const antes = await validar(raiz);
    expect(readFileSync(archivo, 'utf8')).toBe(original);
    expect(antes.issues.map((i) => i.code)).toEqual(['E_UNKNOWN_NODE_TYPE']);

    const fix = antes.issues[0]?.fix;
    expect(fix?.file).toBe('main.dg');
    writeFileSync(archivo, aplicarFix(original, fix as NonNullable<typeof fix>));

    const despues = await validar(raiz);
    expect(despues).toMatchObject({ ok: true, issues: [] });
  });

  it('el fix de una Arista colgante tambien cierra el bucle', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'diagramas-fix-'));
    const archivo = join(raiz, 'main.dg');
    const original = 'specification { node servicio }\nmodel {\n  servicio api\n  servicio db\n  api -> dbb\n}\n';
    writeFileSync(archivo, original);

    const fix = (await validar(raiz)).issues[0]?.fix;
    writeFileSync(archivo, aplicarFix(original, fix as NonNullable<typeof fix>));

    expect((await validar(raiz)).issues).toEqual([]);
  });
});
