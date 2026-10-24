import { describe, expect, it } from 'vitest';

import { compile } from 'dsl';

const base = 'specification { node servicio { color blue } }  model { servicio a }';
const tema = (cuerpo: string, extra = '') => compile({ 'main.dg': `${base}\n${extra}\ntheme t { palette { ink "#111111"  paper "#ffffff" }  ${cuerpo} }` });
const paginaDe = (resultado: ReturnType<typeof compile>, nombre = 't') => resultado.canonico?.themes.find((t) => t.name === nombre)?.['pagina'];

describe('compile: bloque page del Tema', () => {
  it('compila la pila de rellenos con sus defectos y la marca fixed', () => {
    const resultado = tema(`page {
      layer fondo solid { color paper }
      layer luz radial { from ink/0.1  to paper/0  x 15  y 10 }
      layer puntos dots { color ink/0.1  size 22 }
      fixed
    }`);

    expect(resultado.issues).toEqual([]);
    expect(paginaDe(resultado)).toEqual({
      capas: [
        { nombre: 'fondo', primitiva: { tipo: 'solid', props: { color: 'paper' } } },
        { nombre: 'luz', primitiva: { tipo: 'radial', props: { from: 'ink/0.1', to: 'paper/0', x: 15, y: 10 } } },
        { nombre: 'puntos', primitiva: { tipo: 'dots', props: { color: 'ink/0.1', size: 22, radius: 2 } } },
      ],
      fijo: true,
    });
  });

  it('el centro de un radial puede quedar fuera de la caja (luz que sube desde abajo), con limite', () => {
    const fuera = tema(`page { layer luz radial { from ink/0.3  to paper  x 50  y 115 } }`);
    const lejos = tema(`page { layer luz radial { from ink/0.3  to paper  x -150  y 50 } }`);

    expect(fuera.issues).toEqual([]);
    expect(paginaDe(fuera)).toMatchObject({ capas: [{ primitiva: { props: { x: 50, y: 115 } } }] });
    expect(lejos.issues.map((i) => i.code)).toEqual(['E_THEME_INVALID_VALUE']);
  });

  it('un Tema sin page tiene la pagina vacia y movil', () => {
    expect(paginaDe(tema(''))).toEqual({ capas: [], fijo: false });
  });

  it('un hijo parchea la pila heredada y puede anadir con after', () => {
    const resultado = compile({
      'main.dg': `${base}
        theme padre { palette { ink "#111111"  paper "#ffffff" }  page { layer fondo solid { color paper }  fixed } }
        theme hijo extends padre { page { layer fondo { color ink }  layer rejilla grid after fondo { color ink/0.1 } } }`,
    });

    expect(resultado.issues).toEqual([]);
    expect(paginaDe(resultado, 'hijo')).toMatchObject({
      capas: [
        { nombre: 'fondo', primitiva: { tipo: 'solid', props: { color: 'ink' } } },
        { nombre: 'rejilla', primitiva: { tipo: 'grid' } },
      ],
      fijo: true,
    });
  });

  it('rechaza Primitivas que no son rellenos, colores fuera de la Paleta y COLOR, con sugerencia', () => {
    const resultado = tema(`page {
      layer forma rect
      layer a solid { color inc }
      layer b solid { color COLOR }
      layer c dots { color ink  size 1 }
    }`);

    expect(resultado.issues.map((i) => i.code)).toEqual(['E_THEME_UNKNOWN_PRIMITIVE', 'E_UNKNOWN_PALETTE_COLOR', 'E_THEME_INVALID_VALUE', 'E_THEME_INVALID_VALUE']);
    expect(resultado.issues[1]?.hint ?? resultado.issues[1]?.fix?.replacement).toMatch(/ink/);
    expect(resultado.issues[0]?.message).toContain('rect');
  });

  it('una Capa de page con motion o keyframes es error: la pagina no se anima', () => {
    const resultado = tema(`page { layer puntos dots { color ink/0.1  motion pulso 1s } }`);
    const keyframes = tema(`page { layer puntos dots { color ink/0.1  keyframes opacity 1s { 0 1  100 0.5 } } }`);

    for (const r of [resultado, keyframes]) {
      expect(r.issues.map((i) => i.code)).toEqual(['E_THEME_INVALID_VALUE']);
      expect(r.issues[0]).toMatchObject({ file: 'main.dg', line: 3, message: expect.stringContaining("'page'") });
      expect(r.issues[0]?.hint).toContain('node');
    }
  });
});
