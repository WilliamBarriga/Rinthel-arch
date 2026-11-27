import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import { layoutView as layoutDeVista } from 'layout';
import type { GraphGeometry } from 'canonical';
import { Diagram, resolveStyle } from 'render';
import type { DiagramProps } from 'render';
import { NEUTRAL_THEME } from 'theme';

import { sheetOf } from './helpers';

/** `layoutView` of a graph View (architecture or flow): these tests look at Edge paths and boxes. */
const layoutView = async (...args: Parameters<typeof layoutDeVista>) => {
  const geometry = await layoutDeVista(...args);
  if (geometry.kind !== 'grafo') throw new Error('expected a graph Geometry');
  return geometry;
};


const node = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });

async function props(extra: Partial<Omit<DiagramProps, 'geometry'>> = {}): Promise<Omit<DiagramProps, 'geometry'> & { geometry: GraphGeometry }> {
  const source = canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: { nodes: [node('a'), node('b'), node('c')], edges: [{ from: { node: 'a' }, to: { node: 'b' } }, { from: { node: 'b' }, to: { node: 'c' } }] },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  });
  const view = resolveView(source, 'v')!;
  return { view, geometry: await layoutView(view, NEUTRAL_THEME), theme: NEUTRAL_THEME, width: 800, height: 600, ...extra };
}
const drawing = (p: DiagramProps): string => renderToStaticMarkup(<Diagram {...p} />);
const marks = (full: string, attribute: string): string[] => [...full.replace(/<style>[\s\S]*<\/style>/, '').matchAll(new RegExp(`<[^>]*${attribute}[^>]*>`, 'g'))].map((m) => m[0]);

describe('Diagram: path and focus states as selectors', () => {
  it('the sheet has one selector per state: on-path and focus with an outline, dimmed with opacity', async () => {
    const sheet = sheetOf(drawing(await props()));
    const style = resolveStyle(NEUTRAL_THEME, 'architecture');

    expect(sheet).toContain(`.rd-estado[data-state="on-path"]{border:${style.states['on-path'].width}px solid ${style.states['on-path'].color}}`);
    expect(sheet).toContain('.rd-estado[data-state="focus"]{');
    expect(sheet).toMatch(/\[data-atenuado\]\{opacity:0\.\d+\}/);
    expect(sheet).not.toContain('.rd-estado[data-state="dimmed"]');
  });

  it('an on-path Node and a focused one carry their outline; the dimmed one, a dimmed mark on its box', async () => {
    const html = drawing(await props({ states: { a: ['on-path'], b: ['focus'], c: ['dimmed'] } }));

    expect(html.slice(html.indexOf('data-id="a"'), html.indexOf('data-id="b"'))).toContain('data-state="on-path"');
    expect(html.slice(html.indexOf('data-id="b"'), html.indexOf('data-id="c"'))).toContain('data-state="focus"');
    expect(marks(html, 'data-atenuado')).toHaveLength(1);
    expect(marks(html, 'data-atenuado')[0]).toContain('data-id="c"');
    expect(marks(html, 'data-state="dimmed"')).toHaveLength(0);
  });

  it('an on-path Edge carries its state stroke and a dimmed one its mark', async () => {
    const html = drawing(await props({ states: { 'a -> b': ['on-path'], 'b -> c': ['dimmed'] } }));

    expect(marks(html, 'data-state="on-path"').some((m) => m.startsWith('<path'))).toBe(true);
    expect(marks(html, 'data-atenuado')[0]).toContain('data-edge="b -&gt; c"');
  });

  it('the state outline of a path with an elbow follows the same corner as the Edge stroke', async () => {
    const line = { nombre: 'linea', primitiva: { tipo: 'line', props: { color: 'gray', width: 2, style: 'solid', corner: 'round', radius: 8, cut: 6 } } };
    const rounded = { ...NEUTRAL_THEME, arista: { ...NEUTRAL_THEME.arista, capas: [line] } };
    const base = await props({ theme: rounded });
    const elbow = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }];
    const geometry = { ...base.geometry, edges: { ...base.geometry.edges, 'a -> b': { ...base.geometry.edges['a -> b']!, points: elbow } } };
    const html = drawing({ ...base, geometry, states: { 'a -> b': ['on-path'] } });

    const outlineLook = marks(html, 'data-state="on-path"').find((m) => m.startsWith('<path'))!;
    expect(outlineLook).toContain('d="M 0 0 L 52 0 Q 60 0 60 8 L 60 60"');
  });

  it('the focus ring cannot be removed: a Style that leaves it without width is drawn with the minimum', async () => {
    const base = resolveStyle(NEUTRAL_THEME, 'architecture');
    const withoutRing = { ...base, estados: { ...base.states, focus: { ...base.states.focus, ancho: 0 } } };
    const html = drawing(await props({ style: withoutRing, states: { a: ['focus'], 'a -> b': ['focus'] } }));

    expect(sheetOf(html)).toMatch(/\.rd-estado\[data-state="focus"\]\{border:[2-9]px solid/);
    expect(marks(html, 'data-state="focus"').find((m) => m.startsWith('<path'))).toMatch(/stroke-width="[2-9]/);
  });

  it('without states there are no dimmed marks', async () => {
    expect(drawing(await props()).replace(/<style>[\s\S]*<\/style>/, '')).not.toContain('data-atenuado');
  });
});
