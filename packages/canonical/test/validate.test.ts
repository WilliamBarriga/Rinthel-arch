import { describe, expect, it } from 'vitest';

import { CODES, canonicalFormSchema, genericIcons, validate } from 'canonical';
import type { CanonicalForm, Locator } from 'canonical';

const NEUTRAL_THEME = {
  name: 'neutral',
  palette: { gray: '#6b7280', blue: '#2563eb', green: '#16a34a', amber: '#d97706', red: '#dc2626', purple: '#7c3aed' },
};

const node = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'servicio',
  title: id.split('.').pop() as string,
  description: '',
  attributes: [],
  source: [],
  children: [],
  ...extra,
});

/** a { a1 }, b. Bypasses the schema: `validate` must also see sources with errors. */
function source(changes: Record<string, unknown> = {}): CanonicalForm {
  return {
    specification: { nodeTypes: [{ name: 'servicio', description: '' }] },
    model: {
      nodes: [node('a', { children: [node('a.a1')] }), node('b', { attributes: [{ name: 'id', type: 'int', notes: '' }] })],
      edges: [{ from: { node: 'a.a1' }, to: { node: 'b', attribute: 'id' } }],
      interactions: [],
    },
    views: [],
    themes: [NEUTRAL_THEME],
    ...changes,
  } as CanonicalForm;
}

const view = (changes: Record<string, unknown> = {}) => ({
  id: 'v',
  type: 'architecture',
  include: ['**'],
  exclude: [],
  order: [],
  overrides: [],
  collapsed: [],
  expanded: [],
  links: [],
  steps: [],
  ...changes,
});

const codes = (f: CanonicalForm, options = {}) => validate(f, options).map(({ code }) => code);

describe('validate', () => {
  it('a correct Canonical form produces no issues', () => {
    const f = canonicalFormSchema.parse(source({ views: [view()] }));
    expect(validate(f, { icons: genericIcons() })).toEqual([]);
  });

  it('unknown-node-type, with a fix when there is a single candidate', () => {
    const f = source();
    f.model.nodes[0]!.children[0]!.type = 'servicioo';
    const [issue] = validate(f);
    expect(issue).toMatchObject({ code: CODES.E_UNKNOWN_NODE_TYPE, severity: 'error' });
    expect(issue?.fix).toBeUndefined();
  });

  it('dangling-edge and unknown-attribute', () => {
    const f = source();
    f.model.edges.push(
      { from: { node: 'zzz' }, to: { node: 'b' } },
      { from: { node: 'a' }, to: { node: 'b', attribute: 'idd' } },
    );
    expect(codes(f)).toEqual([CODES.E_DANGLING_EDGE, CODES.E_UNKNOWN_ATTRIBUTE]);
  });

  it('unknown-icon is only checked with an IconProvider', () => {
    const f = source({ specification: { nodeTypes: [{ name: 'servicio', description: '', icon: 'no-existe' }] } });
    expect(codes(f)).toEqual([]);
    expect(codes(f, { icons: genericIcons() })).toEqual([CODES.E_UNKNOWN_ICON]);
  });

  it('unknown-palette-color on the Node kind and on an override', () => {
    const f = source({
      specification: { nodeTypes: [{ name: 'servicio', description: '', color: '#ff0000' }] },
      views: [view({ overrides: [{ node: 'a', color: 'bluee' }] })],
    });
    const issues = validate(f);
    expect(issues.map(({ code }) => code)).toEqual([CODES.E_UNKNOWN_PALETTE_COLOR, CODES.E_UNKNOWN_PALETTE_COLOR]);
  });

  it('unknown-theme on the View', () => {
    expect(codes(source({ views: [view({ theme: 'oscuro' })] }))).toEqual([CODES.E_UNKNOWN_THEME]);
  });

  it('override-outside-view', () => {
    const f = source({ views: [view({ include: ['a'], overrides: [{ node: 'b', label: 'x' }] })] });
    expect(codes(f)).toEqual([CODES.E_OVERRIDE_OUTSIDE_VIEW]);
  });

  it('unknown-view-link', () => {
    const f = source({ views: [view({ links: [{ node: 'a', view: 'otra' }] })] });
    expect(codes(f)).toEqual([CODES.E_UNKNOWN_VIEW_LINK]);
  });

  it('invalid-expansion-target: collapsed on a leaf and expanded on a missing Node', () => {
    const f = source({ views: [view({ collapsed: ['b'], expanded: ['zzz'] })] });
    expect(codes(f)).toEqual([CODES.E_INVALID_EXPANSION_TARGET, CODES.E_INVALID_EXPANSION_TARGET]);
  });

  it('link-with-expanded', () => {
    const f = source({
      views: [view({ expanded: ['a'], links: [{ node: 'a', view: 'v' }] })],
    });
    expect(codes(f)).toEqual([CODES.E_LINK_WITH_EXPANDED]);
  });

  it('unknown-step: missing selector and Edge, in show and in hide', () => {
    const f = source({
      views: [
        view({
          steps: [
            { title: 's', show: [{ selector: 'zzz' }, { from: 'a', to: 'b' }], hide: [{ selector: 'yyy.*' }] },
            { title: 't', show: [{ selector: 'a.*' }, { from: 'a.a1', to: 'b' }], hide: [] },
          ],
        }),
      ],
    });
    expect(codes(f)).toEqual(Array(3).fill(CODES.E_UNKNOWN_STEP));
  });

  describe('location', () => {
    it('without a Locator issues land at (canonico):1:1 with no fix', () => {
      const f = source({ views: [view({ theme: 'neutra' })] });
      const [issue] = validate(f);
      expect(issue).toMatchObject({ file: '(canonico)', line: 1, column: 1 });
      expect(issue?.fix).toBeUndefined();
    });

    it('a Locator places the issue and enables the fix with a single candidate', () => {
      const f = source({ views: [view({ theme: 'neutra' })] });
      const routes: unknown[] = [];
      const locate: Locator = (path) => {
        routes.push(path);
        return { file: 'x.dg', range: { start: { line: 3, column: 5 }, end: { line: 3, column: 11 } } };
      };
      const [issue] = validate(f, { locate });
      expect(routes).toEqual([['views', 0, 'theme']]);
      expect(issue).toMatchObject({ file: 'x.dg', line: 3, column: 5 });
      expect(issue?.fix).toEqual({
        file: 'x.dg',
        range: { start: { line: 3, column: 5 }, end: { line: 3, column: 11 } },
        replacement: 'neutral',
      });
    });

    it('with several candidates gives a hint and no fix', () => {
      const f = source({
        themes: [NEUTRAL_THEME, { ...NEUTRAL_THEME, name: 'neutra1' }, { ...NEUTRAL_THEME, name: 'neutra2' }],
        views: [view({ theme: 'neutra' })],
      });
      const [issue] = validate(f);
      expect(issue?.fix).toBeUndefined();
      expect(issue?.hint).toContain('neutra1, neutra2');
    });

    it('a Locator that returns null drops the issue', () => {
      const f = source({ views: [view({ theme: 'neutra' })] });
      expect(validate(f, { locate: () => null })).toEqual([]);
    });

    it('sorts by file, line, column and code', () => {
      const f = source({ views: [view({ theme: 'x', links: [{ node: 'a', view: 'y' }] })] });
      const lines: Record<string, number> = { theme: 9, view: 2 };
      const locate: Locator = (path) => ({
        file: 'a.dg',
        range: { start: { line: lines[String(path.at(-1))] ?? 1, column: 1 }, end: { line: 1, column: 1 } },
      });
      expect(validate(f, { locate }).map(({ code }) => code)).toEqual([CODES.E_UNKNOWN_VIEW_LINK, CODES.E_UNKNOWN_THEME]);
    });
  });
});
