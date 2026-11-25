import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { salidaDeValidateSchema } from 'canonico';
import { run } from 'cli';

const MODELO = `specification {
  node service
}

model {
  service api "API"
}
`;

const TEMA = `theme mine extends neutral-dark {
}
`;

function workspace(archivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), 'convenciones-'));
  for (const [ruta, texto] of Object.entries({ 'main.dg': MODELO, ...archivos })) {
    mkdirSync(dirname(join(raiz, ruta)), { recursive: true });
    writeFileSync(join(raiz, ruta), texto);
  }
  return raiz;
}

async function validar(raiz: string) {
  const resultado = await run(['validate', '--workspace', raiz, '--json']);
  return { exitCode: resultado.exitCode, salida: salidaDeValidateSchema.parse(JSON.parse(resultado.stdout)) };
}

/** Applies the rename `fix`es as `validate` reports them, through `edit --edits` (one batch). */
async function aplicarRenombrados(raiz: string, issues: ReadonlyArray<{ fix?: unknown }>): Promise<void> {
  const fixes = issues.flatMap((i) => (i.fix === undefined ? [] : [i.fix]));
  const r = await run(['edit', '--workspace', raiz, '--edits', JSON.stringify(fixes)]);
  expect(r.exitCode, r.stderr).toBe(0);
}

describe('convenciones de archivos del Workspace', () => {
  it('con los nombres en ingles el Workspace valida', async () => {
    const raiz = workspace({ 'theme.dg': TEMA, 'themes/a.dg': 'theme a extends neutral-dark {\n}\n', 'fonts/x.txt': 'licencia' });
    const { exitCode, salida } = await validar(raiz);
    expect(salida.issues).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it('tema.dg es un error con un fix que lo renombra a theme.dg', async () => {
    const raiz = workspace({ 'sub/tema.dg': TEMA });
    const { exitCode, salida } = await validar(raiz);

    expect(exitCode).toBe(1);
    expect(salida.issues).toHaveLength(1);
    expect(salida.issues[0]).toMatchObject({
      code: 'old-workspace-convention',
      severity: 'error',
      file: 'sub/tema.dg',
      fix: { file: 'sub/tema.dg', rename: 'sub/theme.dg' },
    });

    await aplicarRenombrados(raiz, salida.issues);
    expect(existsSync(join(raiz, 'sub/theme.dg'))).toBe(true);
    expect((await validar(raiz)).salida.issues).toEqual([]);
  });

  it('temas/ es un error por carpeta y su fix la renombra a themes/', async () => {
    const raiz = workspace({ 'temas/a.dg': 'theme a extends neutral-dark {\n}\n', 'temas/b.dg': 'theme b extends neutral-dark {\n}\n' });
    const { salida } = await validar(raiz);

    expect(salida.issues.map((i) => [i.code, i.file, i.fix?.rename])).toEqual([['old-workspace-convention', 'temas', 'themes']]);

    await aplicarRenombrados(raiz, salida.issues);
    const despues = await validar(raiz);
    expect(despues.salida.issues).toEqual([]);
    expect(despues.exitCode).toBe(0);
  });

  it('fuentes/ es un error aunque solo tenga archivos que no son .dg', async () => {
    const raiz = workspace({ 'fuentes/LICENCIA.txt': 'ofl' });
    const { salida } = await validar(raiz);

    expect(salida.issues.map((i) => [i.code, i.file, i.fix?.rename])).toEqual([['old-workspace-convention', 'fuentes', 'fonts']]);

    await aplicarRenombrados(raiz, salida.issues);
    expect((await validar(raiz)).salida.issues).toEqual([]);
  });

  it('un nombre viejo anidado en otro se reporta tras renombrar el de fuera', async () => {
    const raiz = workspace({ 'temas/fuentes/LICENCIA.txt': 'ofl', 'temas/tema.dg': TEMA });
    const primera = await validar(raiz);
    expect(primera.salida.issues.map((i) => i.file)).toEqual(['temas']);

    await aplicarRenombrados(raiz, primera.salida.issues);
    const segunda = await validar(raiz);
    expect(segunda.salida.issues.map((i) => [i.file, i.fix?.rename])).toEqual([
      ['themes/fuentes', 'themes/fonts'],
      ['themes/tema.dg', 'themes/theme.dg'],
    ]);

    await aplicarRenombrados(raiz, segunda.salida.issues);
    expect((await validar(raiz)).salida.issues).toEqual([]);
  });

  it('build tambien falla con un nombre viejo', async () => {
    const raiz = workspace({ 'temas/a.dg': 'theme a extends neutral-dark {\n}\n' });
    const resultado = await run(['build', '--workspace', raiz, '--json']);
    expect(resultado.exitCode).toBe(1);
    expect(JSON.parse(resultado.stdout).issues[0].code).toBe('old-workspace-convention');
  });

  it('el texto legible dice a donde renombrar', async () => {
    const raiz = workspace({ 'tema.dg': TEMA });
    const resultado = await run(['validate', '--workspace', raiz]);
    expect(resultado.stdout).toContain("tema.dg:1:1 error old-workspace-convention");
    expect(resultado.stdout).toContain("rename 'tema.dg' to 'theme.dg'");
  });

  it('edit applies a rename fix together with a text fix as one batch, and says what it renamed', async () => {
    const raiz = workspace({ 'tema.dg': 'theme mine extends neutral { node { state hover { layer borde { width 2 } } } }\n', 'fuentes/LICENSE.txt': 'ofl' });
    writeFileSync(join(raiz, 'main.dg'), `${MODELO}\nview v {\n  type architecture\n  include **\n  theme mine\n}\n`);
    const { salida } = await validar(raiz);
    expect(salida.issues.map((i) => i.code).sort()).toEqual(['old-catalog-value', 'old-workspace-convention', 'old-workspace-convention']);

    const r = await run(['edit', '--workspace', raiz, '--edits', JSON.stringify(salida.issues.map((i) => i.fix))]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stdout).toContain('renamed tema.dg -> theme.dg');
    expect(r.stdout).toContain('renamed fuentes -> fonts');
    expect(readFileSync(join(raiz, 'theme.dg'), 'utf8')).toContain('layer border');
    expect(existsSync(join(raiz, 'fonts/LICENSE.txt'))).toBe(true);
    expect((await validar(raiz)).salida.issues).toEqual([]);
  });

  it('edit --json lists the rename in edits and its new path in files', async () => {
    const raiz = workspace({ 'tema.dg': TEMA });
    const { salida } = await validar(raiz);
    const r = await run(['edit', '--workspace', raiz, '--json', '--edits', JSON.stringify([salida.issues[0]?.fix])]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, edits: [{ file: 'tema.dg', rename: 'theme.dg' }], files: ['theme.dg'] });
  });

  it('an impossible rename rejects the whole batch: nothing is written or renamed', async () => {
    const raiz = workspace({ 'temas/a.dg': 'theme a extends neutral { node { state hover { layer borde { width 2 } } } }\n', 'themes/b.dg': 'theme b extends neutral-dark {\n}\n' });
    const { salida } = await validar(raiz);
    const r = await run(['edit', '--workspace', raiz, '--json', '--edits', JSON.stringify(salida.issues.map((i) => i.fix))]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, reason: 'invalid-rename', file: 'temas' });
    expect(readFileSync(join(raiz, 'temas/a.dg'), 'utf8')).toContain('layer borde');
  });

  it('a rename of a path that does not exist is unknown-file', async () => {
    const raiz = workspace({});
    const fix = { file: 'temas', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: '', rename: 'themes' };
    const r = await run(['edit', '--workspace', raiz, '--json', '--edits', JSON.stringify([fix])]);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, reason: 'unknown-file', file: 'temas' });
  });
});
