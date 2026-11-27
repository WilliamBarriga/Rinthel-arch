import { describe, expect, it } from 'vitest';

import { compile } from 'dsl';

const base = 'specification { node servicio { color blue } }  model { servicio a }';
const theme = (body: string, extra = '') => compile({ 'main.dg': `${base}\n${extra}\ntheme t { palette { ink "#111111"  paper "#ffffff" }  ${body} }` });
const pageOf = (result: ReturnType<typeof compile>, name = 't') => result.canonical?.themes.find((t) => t.name === name)?.['pagina'];

describe('compile: Theme page block', () => {
  it('compiles the fill stack with its defaults and the fixed mark', () => {
    const result = theme(`page {
      layer fondo solid { color paper }
      layer luz radial { from ink/0.1  to paper/0  x 15  y 10 }
      layer puntos dots { color ink/0.1  size 22 }
      fixed
    }`);

    expect(result.issues).toEqual([]);
    expect(pageOf(result)).toEqual({
      capas: [
        { nombre: 'fondo', primitiva: { tipo: 'solid', props: { color: 'paper' } } },
        { nombre: 'luz', primitiva: { tipo: 'radial', props: { from: 'ink/0.1', to: 'paper/0', x: 15, y: 10 } } },
        { nombre: 'puntos', primitiva: { tipo: 'dots', props: { color: 'ink/0.1', size: 22, radius: 2 } } },
      ],
      fijo: true,
    });
  });

  it('the center of a radial can lie outside the box (light rising from below), with a limit', () => {
    const outside = theme(`page { layer luz radial { from ink/0.3  to paper  x 50  y 115 } }`);
    const far = theme(`page { layer luz radial { from ink/0.3  to paper  x -150  y 50 } }`);

    expect(outside.issues).toEqual([]);
    expect(pageOf(outside)).toMatchObject({ capas: [{ primitiva: { props: { x: 50, y: 115 } } }] });
    expect(far.issues.map((i) => i.code)).toEqual(['theme-invalid-value']);
  });

  it('a Theme without page has an empty, moving page', () => {
    expect(pageOf(theme(''))).toEqual({ capas: [], fijo: false });
  });

  it('a child patches the inherited stack and can add with after', () => {
    const result = compile({
      'main.dg': `${base}
        theme padre { palette { ink "#111111"  paper "#ffffff" }  page { layer fondo solid { color paper }  fixed } }
        theme hijo extends padre { page { layer fondo { color ink }  layer rejilla grid after fondo { color ink/0.1 } } }`,
    });

    expect(result.issues).toEqual([]);
    expect(pageOf(result, 'hijo')).toMatchObject({
      capas: [
        { nombre: 'fondo', primitiva: { tipo: 'solid', props: { color: 'ink' } } },
        { nombre: 'rejilla', primitiva: { tipo: 'grid' } },
      ],
      fijo: true,
    });
  });

  it('rejects Primitives that are not fills, colors outside the Palette and COLOR, with a suggestion', () => {
    const result = theme(`page {
      layer forma rect
      layer a solid { color inc }
      layer b solid { color COLOR }
      layer c dots { color ink  size 1 }
    }`);

    expect(result.issues.map((i) => i.code)).toEqual(['theme-unknown-primitive', 'unknown-palette-color', 'theme-invalid-value', 'theme-invalid-value']);
    expect(result.issues[1]?.hint ?? result.issues[1]?.fix?.replacement).toMatch(/ink/);
    expect(result.issues[0]?.message).toContain('rect');
  });

  it('a page Layer with motion or keyframes is an error: the page is not animated', () => {
    const result = theme(`page { layer puntos dots { color ink/0.1  motion pulse 1s } }`);
    const keyframes = theme(`page { layer puntos dots { color ink/0.1  keyframes opacity 1s { 0 1  100 0.5 } } }`);

    for (const r of [result, keyframes]) {
      expect(r.issues.map((i) => i.code)).toEqual(['theme-invalid-value']);
      expect(r.issues[0]).toMatchObject({ file: 'main.dg', line: 3, message: expect.stringContaining("'page'") });
      expect(r.issues[0]?.hint).toContain('node');
    }
  });
});
