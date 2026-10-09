import { describe, expect, it } from 'vitest';

import { CODIGOS, TEMA_NEUTRO, fuenteCanonicaSchema, genericIcons, validate } from 'canonico';
import type { FuenteCanonica, Ubicador } from 'canonico';

const nodo = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'servicio',
  title: id.split('.').pop() as string,
  description: '',
  attributes: [],
  source: [],
  children: [],
  ...extra,
});

/** a { a1 }, b. Sin pasar por el esquema: `validate` debe ver tambien fuentes con errores. */
function fuente(cambios: Record<string, unknown> = {}): FuenteCanonica {
  return {
    specification: { nodeTypes: [{ name: 'servicio', description: '' }] },
    model: {
      nodes: [nodo('a', { children: [nodo('a.a1')] }), nodo('b', { attributes: [{ name: 'id', type: 'int', notes: '' }] })],
      edges: [{ from: { node: 'a.a1' }, to: { node: 'b', attribute: 'id' } }],
    },
    views: [],
    themes: [TEMA_NEUTRO],
    ...cambios,
  } as FuenteCanonica;
}

const vista = (cambios: Record<string, unknown> = {}) => ({
  id: 'v',
  type: 'architecture',
  include: ['**'],
  exclude: [],
  overrides: [],
  collapsed: [],
  expanded: [],
  links: [],
  steps: [],
  ...cambios,
});

const codigos = (f: FuenteCanonica, opciones = {}) => validate(f, opciones).map(({ code }) => code);

describe('validate', () => {
  it('una Fuente correcta no produce issues', () => {
    const f = fuenteCanonicaSchema.parse(fuente({ views: [vista()] }));
    expect(validate(f, { iconos: genericIcons() })).toEqual([]);
  });

  it('E_UNKNOWN_NODE_TYPE, con fix si hay un unico candidato', () => {
    const f = fuente();
    f.model.nodes[0]!.children[0]!.type = 'servicioo';
    const [issue] = validate(f);
    expect(issue).toMatchObject({ code: CODIGOS.E_UNKNOWN_NODE_TYPE, severity: 'error' });
    expect(issue?.fix).toBeUndefined();
  });

  it('E_DANGLING_EDGE y E_UNKNOWN_ATTRIBUTE', () => {
    const f = fuente();
    f.model.edges.push(
      { from: { node: 'zzz' }, to: { node: 'b' } },
      { from: { node: 'a' }, to: { node: 'b', attribute: 'idd' } },
    );
    expect(codigos(f)).toEqual([CODIGOS.E_DANGLING_EDGE, CODIGOS.E_UNKNOWN_ATTRIBUTE]);
  });

  it('E_UNKNOWN_ICON solo se comprueba con un IconProvider', () => {
    const f = fuente({ specification: { nodeTypes: [{ name: 'servicio', description: '', icon: 'no-existe' }] } });
    expect(codigos(f)).toEqual([]);
    expect(codigos(f, { iconos: genericIcons() })).toEqual([CODIGOS.E_UNKNOWN_ICON]);
  });

  it('E_UNKNOWN_PALETTE_COLOR en el Tipo de nodo y en un override', () => {
    const f = fuente({
      specification: { nodeTypes: [{ name: 'servicio', description: '', color: '#ff0000' }] },
      views: [vista({ overrides: [{ node: 'a', color: 'bluee' }] })],
    });
    const issues = validate(f);
    expect(issues.map(({ code }) => code)).toEqual([CODIGOS.E_UNKNOWN_PALETTE_COLOR, CODIGOS.E_UNKNOWN_PALETTE_COLOR]);
  });

  it('E_UNKNOWN_THEME en la Vista', () => {
    expect(codigos(fuente({ views: [vista({ theme: 'oscuro' })] }))).toEqual([CODIGOS.E_UNKNOWN_THEME]);
  });

  it('E_OVERRIDE_OUTSIDE_VIEW', () => {
    const f = fuente({ views: [vista({ include: ['a'], overrides: [{ node: 'b', label: 'x' }] })] });
    expect(codigos(f)).toEqual([CODIGOS.E_OVERRIDE_OUTSIDE_VIEW]);
  });

  it('E_UNKNOWN_VIEW_LINK', () => {
    const f = fuente({ views: [vista({ links: [{ node: 'a', view: 'otra' }] })] });
    expect(codigos(f)).toEqual([CODIGOS.E_UNKNOWN_VIEW_LINK]);
  });

  it('E_INVALID_EXPANSION_TARGET: collapsed sobre una hoja y expanded sobre un Nodo ausente', () => {
    const f = fuente({ views: [vista({ collapsed: ['b'], expanded: ['zzz'] })] });
    expect(codigos(f)).toEqual([CODIGOS.E_INVALID_EXPANSION_TARGET, CODIGOS.E_INVALID_EXPANSION_TARGET]);
  });

  it('E_LINK_WITH_EXPANDED', () => {
    const f = fuente({
      views: [vista({ expanded: ['a'], links: [{ node: 'a', view: 'v' }] })],
    });
    expect(codigos(f)).toEqual([CODIGOS.E_LINK_WITH_EXPANDED]);
  });

  it('E_UNKNOWN_STEP: selector y Arista inexistentes, en show y en hide', () => {
    const f = fuente({
      views: [
        vista({
          steps: [
            { title: 's', show: [{ selector: 'zzz' }, { from: 'a', to: 'b' }], hide: [{ selector: 'yyy.*' }] },
            { title: 't', show: [{ selector: 'a.*' }, { from: 'a.a1', to: 'b' }], hide: [] },
          ],
        }),
      ],
    });
    expect(codigos(f)).toEqual(Array(3).fill(CODIGOS.E_UNKNOWN_STEP));
  });

  describe('ubicacion', () => {
    it('sin Ubicador los issues salen en (canonico):1:1 y sin fix', () => {
      const f = fuente({ views: [vista({ theme: 'neutra' })] });
      const [issue] = validate(f);
      expect(issue).toMatchObject({ file: '(canonico)', line: 1, column: 1 });
      expect(issue?.fix).toBeUndefined();
    });

    it('un Ubicador situa el issue y habilita el fix con un unico candidato', () => {
      const f = fuente({ views: [vista({ theme: 'neutra' })] });
      const rutas: unknown[] = [];
      const ubicar: Ubicador = (ruta) => {
        rutas.push(ruta);
        return { file: 'x.dg', range: { start: { line: 3, column: 5 }, end: { line: 3, column: 11 } } };
      };
      const [issue] = validate(f, { ubicar });
      expect(rutas).toEqual([['views', 0, 'theme']]);
      expect(issue).toMatchObject({ file: 'x.dg', line: 3, column: 5 });
      expect(issue?.fix).toEqual({
        file: 'x.dg',
        range: { start: { line: 3, column: 5 }, end: { line: 3, column: 11 } },
        replacement: 'neutral',
      });
    });

    it('con varios candidatos da hint y no fix', () => {
      const f = fuente({
        themes: [TEMA_NEUTRO, { ...TEMA_NEUTRO, name: 'neutra1' }, { ...TEMA_NEUTRO, name: 'neutra2' }],
        views: [vista({ theme: 'neutra' })],
      });
      const [issue] = validate(f);
      expect(issue?.fix).toBeUndefined();
      expect(issue?.hint).toContain('neutra1, neutra2');
    });

    it('un Ubicador que devuelve null descarta el issue', () => {
      const f = fuente({ views: [vista({ theme: 'neutra' })] });
      expect(validate(f, { ubicar: () => null })).toEqual([]);
    });

    it('ordena por archivo, linea, columna y codigo', () => {
      const f = fuente({ views: [vista({ theme: 'x', links: [{ node: 'a', view: 'y' }] })] });
      const lineas: Record<string, number> = { theme: 9, view: 2 };
      const ubicar: Ubicador = (ruta) => ({
        file: 'a.dg',
        range: { start: { line: lineas[String(ruta.at(-1))] ?? 1, column: 1 }, end: { line: 1, column: 1 } },
      });
      expect(validate(f, { ubicar }).map(({ code }) => code)).toEqual([CODIGOS.E_UNKNOWN_VIEW_LINK, CODIGOS.E_UNKNOWN_THEME]);
    });
  });
});
