import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { destinoEnWorkspace, escribirTexto } from '../src/workspace';

const carpetas: string[] = [];
const temporal = (): string => {
  const c = mkdtempSync(join(tmpdir(), 'ws-'));
  carpetas.push(c);
  return c;
};
afterEach(() => {
  for (const c of carpetas.splice(0)) rmSync(c, { recursive: true, force: true });
});

describe('destinoEnWorkspace', () => {
  it('resuelve una ruta relativa con / bajo la raiz', () => {
    expect(destinoEnWorkspace('/ws', 'a/b.dg')).toBe(resolve('/ws', 'a', 'b.dg'));
  });

  it('rechaza rutas que escapan de la raiz', () => {
    expect(() => destinoEnWorkspace('/ws', '../fuera.dg')).toThrow(/fuera del Workspace/);
    expect(() => destinoEnWorkspace('/ws', 'a/../../fuera.dg')).toThrow(/fuera del Workspace/);
    expect(() => destinoEnWorkspace('/ws', '/otra/ruta.dg')).toThrow(/fuera del Workspace/);
  });
});

describe('escribirTexto', () => {
  it('crea carpetas, reemplaza el contenido y no deja temporales', () => {
    const raiz = temporal();
    const destino = join(raiz, 'sub', 'a.dg');
    escribirTexto(destino, 'uno');
    writeFileSync(join(raiz, 'sub', 'otro.dg'), 'x');
    escribirTexto(destino, 'dos');

    expect(readFileSync(destino, 'utf8')).toBe('dos');
    expect(readdirSync(join(raiz, 'sub')).sort()).toEqual(['a.dg', 'otro.dg']);
  });
});
