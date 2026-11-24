import { existsSync, mkdirSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs';
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

/** Aplica los `fix` de renombrado tal como los reporta `validate`. */
function aplicarRenombrados(raiz: string, issues: ReadonlyArray<{ fix?: { file: string; rename?: string } }>): void {
  for (const { fix } of issues) if (fix?.rename !== undefined) renameSync(join(raiz, fix.file), join(raiz, fix.rename));
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

    aplicarRenombrados(raiz, salida.issues);
    expect(existsSync(join(raiz, 'sub/theme.dg'))).toBe(true);
    expect((await validar(raiz)).salida.issues).toEqual([]);
  });

  it('temas/ es un error por carpeta y su fix la renombra a themes/', async () => {
    const raiz = workspace({ 'temas/a.dg': 'theme a extends neutral-dark {\n}\n', 'temas/b.dg': 'theme b extends neutral-dark {\n}\n' });
    const { salida } = await validar(raiz);

    expect(salida.issues.map((i) => [i.code, i.file, i.fix?.rename])).toEqual([['old-workspace-convention', 'temas', 'themes']]);

    aplicarRenombrados(raiz, salida.issues);
    const despues = await validar(raiz);
    expect(despues.salida.issues).toEqual([]);
    expect(despues.exitCode).toBe(0);
  });

  it('fuentes/ es un error aunque solo tenga archivos que no son .dg', async () => {
    const raiz = workspace({ 'fuentes/LICENCIA.txt': 'ofl' });
    const { salida } = await validar(raiz);

    expect(salida.issues.map((i) => [i.code, i.file, i.fix?.rename])).toEqual([['old-workspace-convention', 'fuentes', 'fonts']]);

    aplicarRenombrados(raiz, salida.issues);
    expect((await validar(raiz)).salida.issues).toEqual([]);
  });

  it('un nombre viejo anidado en otro se reporta tras renombrar el de fuera', async () => {
    const raiz = workspace({ 'temas/fuentes/LICENCIA.txt': 'ofl', 'temas/tema.dg': TEMA });
    const primera = await validar(raiz);
    expect(primera.salida.issues.map((i) => i.file)).toEqual(['temas']);

    aplicarRenombrados(raiz, primera.salida.issues);
    const segunda = await validar(raiz);
    expect(segunda.salida.issues.map((i) => [i.file, i.fix?.rename])).toEqual([
      ['themes/fuentes', 'themes/fonts'],
      ['themes/tema.dg', 'themes/theme.dg'],
    ]);

    aplicarRenombrados(raiz, segunda.salida.issues);
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
});
