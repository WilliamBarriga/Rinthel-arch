import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { run } from 'cli';

const fixtures = join(import.meta.dirname, 'fixtures');
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Workspace fixture en disco temporal; con `fuente`, el tema de `general` usa "Erica One" y se agrega el .ttf. */
async function workspaceConstruido(fuente = false): Promise<string> {
  const workspace = mkdtempSync(join(tmpdir(), 'png-'));
  cpSync(join(fixtures, 'build-basico'), workspace, { recursive: true });
  if (fuente) {
    writeFileSync(join(workspace, 'temas.dg'), 'theme rotulado extends neutral { fonts { body "Erica One" } }');
    const principal = readFileSync(join(workspace, 'main.dg'), 'utf8');
    writeFileSync(join(workspace, 'main.dg'), principal.replace('type architecture', 'type architecture\n  theme rotulado'));
  }
  expect((await run(['build', '--workspace', workspace])).exitCode).toBe(0);
  return workspace;
}

const leerPng = (workspace: string, vista: string): Buffer =>
  readFileSync(join(workspace, '.diagrams', 'png', `${vista}.png`));

describe('export --format png', () => {
  it('escribe un PNG por Vista, determinista entre ejecuciones', async () => {
    const workspace = await workspaceConstruido();

    const resultado = await run(['export', '--workspace', workspace, '--format', 'png']);
    const primero = leerPng(workspace, 'general');
    await run(['export', '--workspace', workspace, '--format', 'png']);

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stderr).toBe('');
    expect(readdirSync(join(workspace, '.diagrams', 'png')).sort()).toEqual(['detalle.png', 'general.png']);
    expect(primero.subarray(0, 8)).toEqual(FIRMA_PNG);
    expect(leerPng(workspace, 'general').equals(primero)).toBe(true);
    expect(existsSync(join(workspace, '.diagrams', 'svg'))).toBe(false);
  });

  it('dibuja con la fuente del Tema que el Workspace trae como archivo', async () => {
    const sinFuente = await workspaceConstruido(true);
    await run(['export', '--workspace', sinFuente, '--format', 'png']);
    const conFuente = await workspaceConstruido(true);
    cpSync(join(fixtures, 'fuentes', 'Erica One.ttf'), join(conFuente, 'Erica One.ttf'));

    const resultado = await run(['export', '--workspace', conFuente, '--format', 'png']);

    expect(resultado.exitCode).toBe(0);
    expect(leerPng(conFuente, 'general').equals(leerPng(sinFuente, 'general'))).toBe(false);
    // La Vista que no usa ese Tema no cambia.
    expect(leerPng(conFuente, 'detalle').equals(leerPng(sinFuente, 'detalle'))).toBe(true);
  });

  it('una familia que solo existe como woff2 no se puede rasterizar: fallo de uso', async () => {
    const workspace = await workspaceConstruido(true);
    writeFileSync(join(workspace, 'Erica One.woff2'), Buffer.from('ABC'));

    const resultado = await run(['export', '--workspace', workspace, '--format', 'png']);

    expect(resultado.exitCode).toBe(2);
    expect(resultado.stderr).toContain('Erica One');
    expect(resultado.stderr).toContain('ttf');
    expect(existsSync(join(workspace, '.diagrams', 'png'))).toBe(false);
  });

  it('un formato desconocido es un fallo de uso', async () => {
    const workspace = await workspaceConstruido();

    const resultado = await run(['export', '--workspace', workspace, '--format', 'gif']);

    expect(resultado.exitCode).toBe(2);
    expect(resultado.stderr).toContain('svg');
    expect(resultado.stderr).toContain('png');
  });
});
