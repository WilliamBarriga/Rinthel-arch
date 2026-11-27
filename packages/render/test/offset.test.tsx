import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import type { ResolvedView } from 'canonical';
import { layoutView } from 'layout';
import { Diagram } from 'render';
import type { DiagramProps } from 'render';
import { NEUTRAL_THEME, buildTransition } from 'theme';
import type { ResolvedTheme } from 'theme';

import { sheetOf } from './helpers';

const node = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });
const makeView = (): ResolvedView =>
  resolveView(
    canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [node('a'), node('b')], edges: [{ from: { node: 'a' }, to: { node: 'b' } }] },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    }),
    'v',
    {},
  )!;

const layers = (shadowValue: Record<string, number>) => [
  { nombre: 'sombra', primitiva: { tipo: 'solid', props: { color: 'blue', ...shadowValue } } },
  { nombre: 'tarjeta', primitiva: { tipo: 'solid', props: { color: 'amber' } } },
];

const themeWith = (extraNode: Record<string, unknown> = {}): ResolvedTheme =>
  ({ ...NEUTRAL_THEME, nodo: { slots: NEUTRAL_THEME.nodo.slots, tipos: {}, estados: {}, capas: layers({ 'offset-x': 4, 'offset-y': -3, grow: 2 }), ...extraNode } }) as unknown as ResolvedTheme;

async function draw(theme: ResolvedTheme, extra: Partial<DiagramProps> = {}) {
  const view = makeView();
  const geometry = await layoutView(view, NEUTRAL_THEME);
  const html = renderToStaticMarkup(<Diagram view={view} geometry={geometry} theme={theme} width={800} height={600} {...extra} />);
  return { html, geometry };
}

describe('Diagram: offset and grow of a Layer', () => {
  it('the offset Layer is painted moved, in its own element, and the measured box does not change', async () => {
    const { html, geometry } = await draw(themeWith());
    const { html: unshifted, geometry: baseGeometry } = await draw(themeWith({ capas: layers({}) }));
    const css = sheetOf(html);

    expect(html.match(/class="rd-anim" data-anim="sombra"/g)).toHaveLength(2);
    const rule = css.match(/\.rd-anim\[data-anim="sombra"\]\{([^}]*)\}/)![1]!;
    expect(rule).toContain('translate:4px -3px');
    expect(rule).toContain('z-index:-1'); // an offset shadow stays under the card fill
    expect(rule).toContain('width:calc(100% + 2px);height:calc(100% + 2px)');
    expect(css).not.toMatch(/\.rd-nodo,[^{]*\{[^}]*translate/);
    expect(unshifted).not.toContain('data-anim="sombra"');
    expect(geometry).toEqual(baseGeometry);
    expect(html).toContain('transform:translate(');
  });

  it('a state patch moves the Layer only with that state and honors the transition', async () => {
    const transitionValue = buildTransition([{ key: 'duration', value: 150 }]).animacion!;
    const theme = themeWith({
      capas: layers({ 'offset-x': 4, 'offset-y': 4 }),
      estados: { hover: [{ nombre: 'sombra', props: { 'offset-x': 7, 'offset-y': 7 } }] },
      animacion: { transicion: transitionValue },
    });
    const { html } = await draw(theme, { states: { a: ['hover'] } });
    const css = sheetOf(html);

    expect(css).toMatch(/\.rd-anim\[data-anim="sombra"\]\{[^}]*translate:4px 4px/);
    expect(css).toMatch(/\[data-estados~="hover"\] \.rd-anim\[data-anim="sombra"\]\{[^}]*translate:7px 7px/);
    expect(css).toMatch(/transition:[^;}]*translate 150ms/);
    expect(css).not.toMatch(/@keyframes/);
  });

  it('the own-element Layer covers the whole box, border included: offset 0 matches the outline', async () => {
    const withBorder = [...layers({ 'offset-x': -7, 'offset-y': -7, grow: 2 }), { nombre: 'borde', primitiva: { tipo: 'border', props: { color: 'gray', width: 3 } } }];
    const { html } = await draw(themeWith({ capas: withBorder }));
    const rule = sheetOf(html).match(/\.rd-anim\[data-anim="sombra"\]\{([^}]*)\}/)![1]!;

    expect(rule).toContain('left:-3px;top:-3px');
    expect(rule).toContain('width:calc(100% + 8px);height:calc(100% + 8px)');
    expect(rule).toContain('translate:-7px -7px');
  });

  it('a Layer that does not paint in the box (a tilt) before the offset one does not take it out from under the fill', async () => {
    const withTilt = [{ nombre: 'giro', primitiva: { tipo: 'tilt', props: { degrees: 2 } } }, ...layers({ 'offset-x': 6, 'offset-y': 5 })];
    const { html } = await draw(themeWith({ capas: withTilt }));

    expect(sheetOf(html).match(/\.rd-anim\[data-anim="sombra"\]\{([^}]*)\}/)![1]).toContain('z-index:-1');
  });

  it('a state patch that changes grow animates it with scale (compositor), not with width nor height', async () => {
    const transitionValue = buildTransition([{ key: 'duration', value: 150 }]).animacion!;
    const theme = themeWith({
      capas: layers({ 'offset-x': 4, 'offset-y': 4, grow: 2 }),
      estados: { hover: [{ nombre: 'sombra', props: { grow: 10 } }] },
      animacion: { transicion: transitionValue },
    });
    const { html } = await draw(theme, { states: { a: ['hover'] } });
    const css = sheetOf(html);
    const ofHover = css.match(/\[data-estados~="hover"\] \.rd-anim\[data-anim="sombra"\]\{([^}]*)\}/)![1]!;

    expect(ofHover).toContain('scale:calc((var(--rd-ancho) + 10) / (var(--rd-ancho) + 2)) calc((var(--rd-alto) + 10) / (var(--rd-alto) + 2))');
    expect(ofHover).not.toMatch(/width|height/);
    expect(css).toMatch(/\.rd-anim\[data-anim="sombra"\]\{[^}]*transform-origin:0 0/);
    expect(html).toMatch(/--rd-ancho:\d+/);
  });
});

