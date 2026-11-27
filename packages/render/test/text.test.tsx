import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import { layoutView } from 'layout';
import { Diagram } from 'render';
import { NEUTRAL_THEME } from 'theme';
import type { ResolvedTheme } from 'theme';

import { layerOf, tagWith, sheetOf } from './helpers';

const view = resolveView(
  canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio', color: 'blue', icon: 'box' }] },
    model: {
      nodes: [
        { id: 'a', type: 'servicio', title: 'Api', description: '', children: [] },
        { id: 'b', type: 'servicio', title: 'Base', description: '', children: [] },
      ],
      edges: [{ from: { node: 'a' }, to: { node: 'b' }, label: 'lee' }],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  }),
  'v',
)!;

const theme = (title: Record<string, number | string>, label: Record<string, number | string> = {}, icon?: Record<string, number | string>): ResolvedTheme =>
  ({
    ...NEUTRAL_THEME,
    nodo: {
      ...NEUTRAL_THEME.nodo,
      capas: [{ nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 0 } } }],
      textos: { title: { tipo: 'text', props: { weight: 700, ...title } }, ...(icon !== undefined && { icon: { tipo: 'icon', props: icon } }) },
    },
    arista: { ...NEUTRAL_THEME.arista, etiqueta: { tipo: 'label', props: { fill: 'blue', ...label } } },
  }) as unknown as ResolvedTheme;

const iconList = { keys: () => ['box'], resolve: () => '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>' };

async function draw(theme: ResolvedTheme) {
  const geometry = await layoutView(view, theme);
  const html = renderToStaticMarkup(<Diagram view={view} geometry={geometry} theme={theme} width={800} height={600} icons={iconList} />);
  return { html, css: sheetOf(html) };
}

const rule = (css: string, selector: string): string | undefined => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)\\.rd-[a-z0-9]+ ${escaped}\\{([^}]*)\\}`).exec(css)?.[1];
};

describe('Diagram: text style of the Slots and of the label', () => {
  it('`prefix` is written before the title, after uppercasing', async () => {
    const { html } = await draw(theme({ prefix: '> ', transform: 'uppercase' }));

    expect(layerOf(html, 'nodos')).toContain('>&gt; API</div>');
  });

  it('a text `glow` is a glow (text-shadow) of the given color, COLOR included', async () => {
    const { css } = await draw(theme({ glow: 'COLOR/0.8' }));

    expect(rule(css, '.rd-nodo .rd-slot[data-slot="title"]')).toContain('text-shadow:0 0 8px color-mix(in srgb, var(--trazo) 80%, transparent)');
  });

  it('`glyph` sets the glyph side inside the icon box; without it, the glyph takes 60% of the side', async () => {
    const box = { variant: 'box', side: 34, radius: 10 };
    const withGlyph = await draw(theme({}, {}, { ...box, glyph: 16 }));
    const withoutGlyph = await draw(theme({}, {}, box));

    const side = (html: string) => /<svg width="([\d.]+)" height="([\d.]+)"/.exec(layerOf(html, 'nodos'))?.slice(1);
    expect(side(withGlyph.html)).toEqual(['16', '16']);
    expect(side(withoutGlyph.html)).toEqual(['20', '20']);
  });

  it('the Edge label in italics', async () => {
    const { html } = await draw(theme({}, { style: 'italic' }));

    expect(tagWith(html, 'data-edge-label=')).toContain('font-style="italic"');
  });
});
