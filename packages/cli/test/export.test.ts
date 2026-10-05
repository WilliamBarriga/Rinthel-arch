import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { run } from 'cli';

const fixtures = join(import.meta.dirname, 'fixtures');

/** Workspace fixture copiado a disco temporal y ya construido (`build`). */
async function workspaceConstruido(): Promise<string> {
  const workspace = mkdtempSync(join(tmpdir(), 'export-'));
  cpSync(join(fixtures, 'build-basico'), workspace, { recursive: true });
  expect((await run(['build', '--workspace', workspace])).exitCode).toBe(0);
  return workspace;
}

const leerSvg = (workspace: string, vista: string): string =>
  readFileSync(join(workspace, '.diagrams', 'svg', `${vista}.svg`), 'utf8');

describe('export', () => {
  it('escribe un SVG por Vista a partir de la geometria cacheada (snapshot)', async () => {
    const workspace = await workspaceConstruido();

    const resultado = await run(['export', '--workspace', workspace]);

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stderr).toBe('');
    expect(readdirSync(join(workspace, '.diagrams', 'svg')).sort()).toEqual(['detalle.svg', 'general.svg']);
    expect(leerSvg(workspace, 'general')).toMatchSnapshot();
    expect(leerSvg(workspace, 'detalle')).toMatchSnapshot();
  });

  it('es determinista byte a byte, tambien reconstruyendo desde cero', async () => {
    const workspace = await workspaceConstruido();
    await run(['export', '--workspace', workspace]);
    const primero = leerSvg(workspace, 'general');

    await run(['build', '--workspace', workspace]);
    await run(['export', '--workspace', workspace]);

    expect(leerSvg(workspace, 'general')).toBe(primero);
  });

  it('el SVG no referencia recursos externos', async () => {
    const workspace = await workspaceConstruido();
    await run(['export', '--workspace', workspace]);

    for (const vista of ['general', 'detalle']) {
      const svg = leerSvg(workspace, vista);
      expect(svg).not.toMatch(/<image|<script|<foreignObject|@import/);
      expect(svg).not.toMatch(/(?:href|src)\s*=/);
      expect([...svg.matchAll(/url\(([^)]*)\)/g)].every(([, destino]) => destino?.startsWith('#'))).toBe(true);
      // El unico URI permitido es el espacio de nombres del propio SVG.
      expect([...svg.matchAll(/https?:\/\/[^"')\s]+/g)].map(([uri]) => uri)).toEqual([
        'http://www.w3.org/2000/svg',
      ]);
    }
  });

  it('incrusta las fuentes del Tema que el Workspace trae como archivo', async () => {
    const workspace = await workspaceConstruido();
    writeFileSync(join(workspace, 'temas.dg'), 'theme rotulado extends neutral { fonts { body "Inter, sans-serif" } }');
    writeFileSync(join(workspace, 'main.dg'), readFileSync(join(workspace, 'main.dg'), 'utf8').replace('type architecture', 'type architecture\n  theme rotulado'));
    mkdirSync(join(workspace, 'fuentes'));
    writeFileSync(join(workspace, 'fuentes', 'Inter.woff2'), Buffer.from('ABC'));
    await run(['build', '--workspace', workspace]);

    await run(['export', '--workspace', workspace]);

    expect(leerSvg(workspace, 'general')).toContain(
      "@font-face{font-family:'Inter';src:url(data:font/woff2;base64,QUJD)}",
    );
    expect(leerSvg(workspace, 'detalle')).not.toContain('@font-face');
  });

  it('sin salida de build es un fallo de uso que pide ejecutar build', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'export-'));
    cpSync(join(fixtures, 'build-basico'), workspace, { recursive: true });

    const resultado = await run(['export', '--workspace', workspace]);

    expect(resultado.exitCode).toBe(2);
    expect(resultado.stderr).toContain('build');
    expect(existsSync(join(workspace, '.diagrams'))).toBe(false);
  });
});
