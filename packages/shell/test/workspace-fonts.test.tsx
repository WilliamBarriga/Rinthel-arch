import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import type { Geometry } from 'canonical';
import { InteractiveView, familyHashes } from 'shell';
import type { LayoutAdapter } from 'shell';
import { NEUTRAL_THEME } from 'theme';
import type { TextMeasures, ResolvedTheme } from 'theme';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [{ id: 'a', type: 'servicio', title: 'a', description: '', children: [] }], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});
const geometry: Geometry = { nodes: { a: { x: 0, y: 0, width: 100, height: 50 } }, edges: {}, labels: {}, kind: 'grafo', pinsSolapados: [], width: 100, height: 50 };
const CAVEAT: ResolvedTheme = { ...NEUTRAL_THEME, fonts: { body: 'Caveat', mono: 'Caveat', fallback: 'cursive' } };
const FILES = { 'fuentes/caveat-latin-400-normal.woff2': 'h400', 'fuentes/caveat-latin-700-normal.woff2': 'h700', 'fuentes/inter-latin-400-normal.woff2': 'hi' };
const url = (path: string): string => `/fonts/${path}`;

describe('familyHashes', () => {
  it('joins the hashes of the files of each declared family and omits the rest', () => {
    expect(familyHashes(CAVEAT.fonts, FILES)).toEqual({ Caveat: 'h400+h700' });
  });
});

describe('InteractiveView with Workspace fonts', () => {
  it('declares the @font-face of the Theme fonts with the consumer URL, before computing the geometry', () => {
    const layout: LayoutAdapter = () => new Promise(() => undefined);
    const { container } = render(<InteractiveView source={source} view="v" theme={CAVEAT} layout={layout} width={400} height={300} fontFiles={FILES} fontUrl={url} />);

    const sheet = container.querySelector('style[data-fuentes]')?.textContent ?? '';
    expect(sheet).toContain('font-family:"Caveat"');
    expect(sheet).toContain('url("/fonts/fuentes/caveat-latin-700-normal.woff2")');
    expect(sheet).not.toContain('Inter');
  });

  it('measures with the real font after loading it and hands the layout the measures with the font hash', async () => {
    const order: string[] = [];
    vi.stubGlobal('document', Object.assign(document, { fonts: { load: async (fuente: string) => void order.push(`carga ${fuente}`) } }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ font: '', measureText: () => ({ width: 77 }) } as unknown as CanvasRenderingContext2D);
    const received: (TextMeasures | undefined)[] = [];
    const layout: LayoutAdapter = async (_view, _theme, measures) => (received.push(measures), geometry);

    render(<InteractiveView source={source} view="v" theme={CAVEAT} layout={layout} width={400} height={300} fontFiles={FILES} fontUrl={url} />);
    await waitFor(() => expect(received).toHaveLength(1));

    expect(order[0]).toMatch(/^carga \d+(\.\d+)?px "Caveat"$/);
    expect(received[0]).toMatchObject({ nivel: 'medido', fuentes: { Caveat: 'h400+h700' } });
    expect(Object.values(received[0]!.anchos)).toContain(77);
  });

  it('without fontFiles declares no fonts and the layout estimates', async () => {
    const received: (TextMeasures | undefined)[] = [];
    const layout: LayoutAdapter = async (_view, _theme, measures) => (received.push(measures), geometry);

    const { container } = render(<InteractiveView source={source} view="v" theme={CAVEAT} layout={layout} width={400} height={300} />);
    await waitFor(() => expect(received).toHaveLength(1));

    expect(container.querySelector('style[data-fuentes]')).toBeNull();
    expect(received[0]).toBeUndefined();
  });

  it('without fontUrl and with a Theme that declares non-generic fonts, the issues panel warns instead of silently measuring with another font', async () => {
    const layout: LayoutAdapter = async () => geometry;
    const { container } = render(<InteractiveView source={source} view="v" theme={CAVEAT} layout={layout} width={400} height={300} />);

    const panel = container.querySelector('[data-panel="issues"]');
    expect(panel?.textContent).toContain('1 warning');
    (panel?.querySelector('button') as HTMLButtonElement).click();
    await waitFor(() => expect(panel?.textContent).toContain('theme-font-not-served'));
    expect(panel?.textContent).toContain('Caveat');
  });

  it('with fontUrl, or with a Theme of generic families, does not warn', () => {
    const layout: LayoutAdapter = async () => geometry;
    const withUrl = render(<InteractiveView source={source} view="v" theme={CAVEAT} layout={layout} width={400} height={300} fontFiles={FILES} fontUrl={url} />);
    expect(withUrl.container.querySelector('[data-panel="issues"]')).toBeNull();
    cleanup();
    const generic = render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={layout} width={400} height={300} />);
    expect(generic.container.querySelector('[data-panel="issues"]')).toBeNull();
  });
});
