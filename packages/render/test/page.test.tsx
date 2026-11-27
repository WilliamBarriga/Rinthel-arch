import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import { layoutView } from 'layout';
import { Diagram } from 'render';
import { NEUTRAL_THEME, resolvedStyle } from 'theme';
import type { ResolvedTheme } from 'theme';

import { tagWith, sheetOf, property } from './helpers';

const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [{ id: 'a', type: 'servicio', title: 'A', description: '', children: [] }], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});

const withPage = (fixed: boolean): ResolvedTheme => ({
  ...NEUTRAL_THEME,
  palette: { ...NEUTRAL_THEME.palette, ink: '#102030' },
  pagina: {
    fijo: fixed,
    capas: [
      { nombre: 'fondo', primitiva: { tipo: 'solid', props: { color: 'ink' } } },
      { nombre: 'luz', primitiva: { tipo: 'radial', props: { from: 'blue/0.5', to: 'ink/0', x: 15, y: 10 } } },
      { nombre: 'puntos', primitiva: { tipo: 'dots', props: { color: 'ink/0.1', size: 22, radius: 1 } } },
    ],
  },
});

async function drawing(theme: ResolvedTheme): Promise<string> {
  const view = resolveView(source, 'v', {})!;
  const geometry = await layoutView(view, theme);
  return renderToStaticMarkup(<Diagram view={view} geometry={geometry} theme={theme} width={800} height={600} />);
}

describe('Diagram: page background', () => {
  it('a Theme without page paints no page layer: the Theme background color remains', async () => {
    const html = await drawing(NEUTRAL_THEME);

    expect(html).not.toContain('data-capa="pagina"');
    expect(sheetOf(html)).toContain('background:#ffffff');
    expect(resolvedStyle(NEUTRAL_THEME, { diagrama: 'architecture' }).pintura.pagina).toEqual({ capas: [], fijo: false });
  });

  it('page fixed goes outside the world, before it, and under Groups, Edges and Nodes', async () => {
    const html = await drawing(withPage(true));
    const [page, world, groups] = [html.indexOf('data-capa="pagina"'), html.indexOf('class="rd-mundo"'), html.indexOf('data-capa="grupos"')];

    expect(page).toBeGreaterThan(-1);
    expect(page).toBeLessThan(world);
    expect(world).toBeLessThan(groups);
  });

  it('page without fixed goes inside the world (moves with pan/zoom), with a margin and before the Groups', async () => {
    const html = await drawing(withPage(false));
    const [world, page, groups] = [html.indexOf('class="rd-mundo"'), html.indexOf('data-capa="pagina"'), html.indexOf('data-capa="grupos"')];

    expect(world).toBeLessThan(page);
    expect(page).toBeLessThan(groups);
    expect(property(tagWith(html, 'data-capa="pagina"'), 'left')).toBe('-4000px');
  });

  it('the sheet stacks the fills: the last of the stack stays on top and the solid one goes first', async () => {
    const rule = /\.rd-\w+ \.rd-pagina\{([^}]*)\}/.exec(sheetOf(await drawing(withPage(true))))?.[1] ?? '';

    expect(rule).toContain('background:#102030');
    expect(rule.indexOf('background:#102030')).toBeLessThan(rule.indexOf('background-image'));
    const images = /background-image:(.*?);background-size/.exec(rule)?.[1] ?? '';
    expect(images.indexOf('radial-gradient(circle,')).toBeLessThan(images.indexOf('radial-gradient(circle at'));
    expect(images).toContain('radial-gradient(circle at 15% 10%,rgba(37, 99, 235, 0.5),rgba(16, 32, 48, 0) 110%)');
  });

  it('a disc is a sharp-edged circle at a position of the page (percentage) or of the box (px)', async () => {
    const withDiscs: ResolvedTheme = {
      ...NEUTRAL_THEME,
      palette: { ...NEUTRAL_THEME.palette, sol: '#f2b705' },
      pagina: { fijo: true, capas: [{ nombre: 'sol', primitiva: { tipo: 'disc', props: { color: 'sol/0.9', radius: 170, x: 88, y: 18, unit: 'percent' } } }] },
      nodo: { ...NEUTRAL_THEME.nodo, capas: [{ nombre: 'muesca', primitiva: { tipo: 'disc', props: { color: 'sol', radius: 3, x: 9, y: 9, unit: 'px' } } }] },
    };
    const sheet = sheetOf(await drawing(withDiscs));

    expect(/\.rd-\w+ \.rd-pagina\{([^}]*)\}/.exec(sheet)?.[1]).toContain('background-image:radial-gradient(circle at 88% 18%,rgba(242, 183, 5, 0.9) 0 170px,transparent 171px)');
    expect(/\.rd-\w+ \.rd-nodo\{([^}]*)\}/.exec(sheet)?.[1]).toContain('background-image:radial-gradient(circle at 9px 9px,#f2b705 0 3px,transparent 4px)');
  });

  it('noise with a color is grain of that color (not gray), with the Layer opacity', async () => {
    const withGrain = (color?: string): ResolvedTheme => ({
      ...NEUTRAL_THEME,
      palette: { ...NEUTRAL_THEME.palette, white: '#ffffff' },
      pagina: { fijo: true, capas: [{ nombre: 'fibra', primitiva: { tipo: 'noise', props: { frequency: 0.8, opacity: 0.07, ...(color !== undefined && { color }) } } }] },
    });
    const svgOf = async (theme: ResolvedTheme): Promise<string> => {
      const rule = /\.rd-\w+ \.rd-pagina\{([^}]*)\}/.exec(sheetOf(await drawing(theme)))?.[1] ?? '';
      return decodeURIComponent(/data:image\/svg\+xml,([^"]*)/.exec(rule)?.[1] ?? '');
    };

    const white = await svgOf(withGrain('white'));
    expect(white).toContain("<feFlood flood-color='#ffffff'/><feComposite in2='ruido' operator='in'/>");
    expect(white).toContain("opacity='0.07'");
    expect(await svgOf(withGrain())).toContain("<feColorMatrix type='saturate' values='0'/>");
  });
});

