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
    // `message` no es contrato (ADR 0005): el snapshot fija solo lo que si lo es.
    expect({ ...salida, issues: salida.issues.map(({ message, ...resto }) => resto) }).toMatchSnapshot();
  });

  it('en texto, cada issue con candidato dice "quisiste decir" (de su fix o de su hint), como en --json', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'validate-hint-'));
    writeFileSync(
      join(raiz, 'main.dg'),
      `specification { node servicio { color blue } }
model { servicio a }
view v { type architecture  include **  theme mio }
theme mio extends neutral-drak { }
theme otro extends neutral { node { layer relleno { color margo } } }
`,
    );

    const resultado = await run(['validate', '--workspace', raiz]);

    expect(resultado.exitCode).toBe(1);
    const lineas = resultado.stdout.split('\n');
    expect(lineas.find((l) => l.includes("'neutral-drak'"))).toContain("quisiste decir 'neutral-dark'");
    expect(lineas.find((l) => l.includes('E_UNKNOWN_PALETTE_COLOR'))).toContain("quisiste decir 'marco'");
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
    const dependencias = {
      leer: () => ({
        'main.dg': `specification { node servicio }
model { servicio a  servicio b }
view v {
  type architecture
  include **
  node a { pin 0,0 }
  node b { pin 10,10 }
}
`,
      }),
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

  it('ordena los issues por archivo, linea, columna y codigo aunque la fuente no lo haga', async () => {
    const resultado = await run(['validate', '--workspace', '.', '--json'], {
      leer: () => ({
        'b.dg': 'specification { node servicio }\nmodel {\n  servicio api {',
        'a.dg': 'specification { node servicio }\nmodel {\n  servicio api {',
      }),
    });

    const archivos = JSON.parse(resultado.stdout).issues.map((i: { file: string }) => i.file);
    expect(archivos.length).toBeGreaterThanOrEqual(2);
    expect(archivos).toEqual([...archivos].sort());
    expect(new Set(archivos)).toEqual(new Set(['a.dg', 'b.dg']));
  });

  describe('W_OVERLAPPING_PINS', () => {
    const conPinsSolapados = (): string => {
      const workspace = mkdtempSync(join(tmpdir(), 'validate-'));
      writeFileSync(
        join(workspace, 'main.dg'),
        `specification { node servicio }
model { servicio a  servicio b }
view v {
  type architecture
  include **
  node a { pin 0,0 }
  node b { pin 10,10 }
}
`,
      );
      return workspace;
    };

    it('validate --json emite el aviso con posicion y related, sin escribir .diagrams', async () => {
      const workspace = conPinsSolapados();

      const resultado = await run(['validate', '--workspace', workspace, '--json']);

      expect(resultado.exitCode).toBe(0);
      const salida = salidaDeValidateSchema.parse(JSON.parse(resultado.stdout));
      expect(salida.ok).toBe(true);
      expect(salida.summary).toEqual({ errors: 0, warnings: 1, truncated: false });
      expect(salida.issues).toEqual([
        expect.objectContaining({
          code: 'W_OVERLAPPING_PINS',
          severity: 'warning',
          file: 'main.dg',
          line: 6,
          column: 8,
          related: [{ file: 'main.dg', line: 7, column: 8, message: "Pin de 'b'" }],
        }),
      ]);
      expect(readdirSync(workspace)).toEqual(['main.dg']);
    });

    it('con --strict el aviso hace fallar', async () => {
      const resultado = await run(['validate', '--workspace', conPinsSolapados(), '--strict']);

      expect(resultado.exitCode).toBe(1);
      expect(resultado.stdout).toContain('W_OVERLAPPING_PINS');
    });

    it('Pins que no se solapan no avisan', async () => {
      const workspace = conPinsSolapados();
      writeFileSync(join(workspace, 'main.dg'), readFileSync(join(workspace, 'main.dg'), 'utf8').replace('pin 10,10', 'pin 500,500'));

      const resultado = await run(['validate', '--workspace', workspace, '--json']);

      expect(JSON.parse(resultado.stdout).issues).toEqual([]);
    });

    it('no calcula layout si hay errores de compilacion', async () => {
      const workspace = conPinsSolapados();
      writeFileSync(join(workspace, 'roto.dg'), 'model { servicio }');

      const resultado = await run(['validate', '--workspace', workspace, '--json']);

      expect(JSON.parse(resultado.stdout).issues.map((i: { code: string }) => i.code)).toEqual(['E_SYNTAX_ERROR']);
    });
  });

  describe('--theme-path y --theme', () => {
    it('--theme-path aporta Temas antes del Workspace', async () => {
      const resultado = await run([
        'validate', '--workspace', join(fixtures, 'build-basico'), '--theme-path', join(fixtures, 'temas-extra'), '--json',
      ]);

      expect(resultado.exitCode).toBe(0);
      expect(resultado.stderr).toBe('');
    });

    it('un Tema de --theme-path hace valida una Vista que lo usa', async () => {
      const workspace = mkdtempSync(join(tmpdir(), 'validate-'));
      writeFileSync(join(workspace, 'main.dg'), 'specification { node s } model { s a } view v { type flow include ** theme corporativo }');

      const sin = await run(['validate', '--workspace', workspace, '--json']);
      const con = await run(['validate', '--workspace', workspace, '--theme-path', join(fixtures, 'temas-extra'), '--json']);

      expect(JSON.parse(sin.stdout).issues.map((i: { code: string }) => i.code)).toEqual(['E_UNKNOWN_THEME']);
      expect(con.exitCode).toBe(0);
    });

    it('--theme inexistente es un fallo de uso (codigo 2), como en build', async () => {
      const resultado = await run(['validate', '--workspace', join(fixtures, 'build-basico'), '--theme', 'nada']);

      expect(resultado.exitCode).toBe(2);
      expect(resultado.stderr).toContain("'nada'");
    });
  });
});
