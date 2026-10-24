import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { compiladorDeCodigo } from '../src/codigo';
import { cargarComponentes } from '../navegador/componentes';

const AURORA = `export function Aurora({ id, parametros }: { id: string; parametros: { hue: number } }) {
  return <i data-aurora={id} data-hue={parametros.hue} />;
}
`;

const carpetas: string[] = [];
function workspace(archivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), 'rinthel-codigo-'));
  carpetas.push(raiz);
  for (const [ruta, texto] of Object.entries(archivos)) escribir(raiz, ruta, texto);
  return raiz;
}
function escribir(raiz: string, ruta: string, texto: string): void {
  const destino = join(raiz, ...ruta.split('/'));
  mkdirSync(join(destino, '..'), { recursive: true });
  writeFileSync(destino, texto);
}
afterEach(() => {
  for (const carpeta of carpetas.splice(0)) rmSync(carpeta, { recursive: true, force: true });
});

describe('adaptador de compilacion de .tsx', () => {
  it('compila los .tsx del Workspace: da los componentes exportados y un bundle que el navegador registra y React dibuja', () => {
    const raiz = workspace({ 'temas/aurora.tsx': AURORA, 'main.dg': '' });

    const resultado = compiladorDeCodigo(raiz).compilar();

    expect(resultado.issues).toEqual([]);
    expect(Object.keys(resultado.componentes)).toEqual(['Aurora']);
    const registro = cargarComponentes(resultado.bundle);
    expect(Object.keys(registro)).toEqual(['Aurora']);
    const html = renderToStaticMarkup(createElement(registro['Aurora']!, { id: 'api', parametros: { hue: 3 } } as never));
    expect(html).toBe('<i data-aurora="api" data-hue="3"></i>');
  });

  it('un error de compilacion es un issue con file y line, y no lanza', () => {
    const raiz = workspace({ 'temas/roto.tsx': 'export function Roto() {\n  const x = ;\n  return x;\n}\n' });

    const { issues } = compiladorDeCodigo(raiz).compilar();

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toMatchObject({ code: 'E_THEME_CODE_COMPILE', severity: 'error', file: 'temas/roto.tsx', line: 2 });
    expect(issues[0]!.column).toBeGreaterThan(0);
  });

  it('conserva el ultimo bueno de un archivo que deja de compilar', () => {
    const raiz = workspace({ 'temas/aurora.tsx': AURORA });
    const compilador = compiladorDeCodigo(raiz);
    compilador.compilar();

    escribir(raiz, 'temas/aurora.tsx', 'export function Aurora() { return <i> }\n');
    const roto = compilador.compilar();

    expect(new Set(roto.issues.map((i) => i.code))).toEqual(new Set(['E_THEME_CODE_COMPILE']));
    expect(Object.keys(roto.componentes)).toEqual(['Aurora']);
    const registro = cargarComponentes(roto.bundle);
    expect(renderToStaticMarkup(createElement(registro['Aurora']!, { id: 'x', parametros: { hue: 1 } } as never))).toBe('<i data-aurora="x" data-hue="1"></i>');
  });

  it('un componente repetido en dos archivos es un error en el segundo', () => {
    const raiz = workspace({ 'a/aurora.tsx': AURORA, 'b/aurora.tsx': AURORA });

    const { issues } = compiladorDeCodigo(raiz).compilar();

    expect(issues).toEqual([expect.objectContaining({ code: 'E_THEME_COMPONENT_DUPLICATE', file: 'b/aurora.tsx', line: 1 })]);
  });

  it('un Workspace sin .tsx o inexistente no tiene componentes ni issues', () => {
    expect(compiladorDeCodigo(workspace({ 'main.dg': '' })).compilar()).toMatchObject({ componentes: {}, issues: [] });
    expect(compiladorDeCodigo('/no/existe/rinthel').compilar()).toMatchObject({ componentes: {}, issues: [] });
  });

  it('un cambio en un .tsx se recompila y un Workspace igual reutiliza el resultado', () => {
    const raiz = workspace({ 'temas/aurora.tsx': AURORA });
    const compilador = compiladorDeCodigo(raiz);
    const primero = compilador.compilar();

    expect(compilador.compilar()).toBe(primero);
    escribir(raiz, 'temas/aurora.tsx', AURORA.replace('data-aurora', 'data-otro'));
    const segundo = compilador.compilar();
    expect(segundo).not.toBe(primero);
    expect(segundo.bundle).toContain('data-otro');
  });
});
