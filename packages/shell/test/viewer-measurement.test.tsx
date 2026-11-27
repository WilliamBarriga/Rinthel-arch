import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import type { Geometry } from 'canonical';
import { InteractiveView, workerAdapter, measureInViewer, serveLayout } from 'shell';
import type { LayoutAdapter, LayoutPort } from 'shell';
import { NEUTRAL_THEME, textKey } from 'theme';
import type { TextMeasures, TextToMeasure } from 'theme';

afterEach(cleanup);

const node = (id: string) => ({ id, type: 'servicio', title: id, description: '', children: [] });
const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [node('a')], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});

describe('measureInViewer', () => {
  it('loads each font before measuring and returns widths by key with the hash of each font', async () => {
    const order: string[] = [];
    const texts: TextToMeasure[] = [
      { familia: 'Inter', tamano: 14, texto: 'hola' },
      { familia: 'Inter', tamano: 12, texto: 'x' },
    ];

    const measures = await measureInViewer(texts, {
      hashes: { Inter: 'abcd1234' },
      load: async (font, text) => void order.push(`carga ${font} ${text}`),
      width: (font, text) => (order.push(`mide ${font} ${text}`), text.length * 10),
    });

    expect(order.indexOf('carga 14px "Inter" hola')).toBeLessThan(order.indexOf('mide 14px "Inter" hola'));
    expect(order.indexOf('carga 12px "Inter" x')).toBeLessThan(order.indexOf('mide 12px "Inter" x'));
    expect(measures).toEqual({
      nivel: 'medido',
      fuentes: { Inter: 'abcd1234' },
      anchos: { [textKey('Inter', 14, 'hola')]: 40, [textKey('Inter', 12, 'x')]: 10 },
    });
  });
});

describe('InteractiveView with real measuring', () => {
  const geometry: Geometry = { nodes: { a: { x: 0, y: 0, width: 100, height: 50 } }, edges: {}, labels: {}, kind: 'grafo', pinsSolapados: [], width: 100, height: 50 };

  it('a text with weight is loaded and measured with that weight, under its own key', async () => {
    const sources: string[] = [];
    const measures = await measureInViewer([{ familia: 'Inter', tamano: 14, texto: 'hola', peso: 800 }], {
      load: async (font) => void sources.push(font),
      width: (font) => (sources.push(font), 50),
    });

    expect(sources).toEqual(['800 14px "Inter"', '800 14px "Inter"']);
    expect(measures.anchos).toEqual({ [textKey('Inter', 14, 'hola', 800)]: 50 });
  });

  it('waits for the measures and hands them to the layout; without a measurer the layout does not receive them', async () => {
    const received: (TextMeasures | undefined)[] = [];
    const layout: LayoutAdapter = async (_view, _theme, measures) => (received.push(measures), geometry);
    const measures: TextMeasures = { nivel: 'medido', fuentes: { sans: 'h1' }, anchos: {} };
    let requests: TextToMeasure[] = [];

    const { container } = render(
      <InteractiveView
        source={source}
        view="v"
        theme={NEUTRAL_THEME}
        layout={layout}
        width={400}
        height={300}
        measure={async (texts) => ((requests = texts), measures)}
      />,
    );
    await waitFor(() => expect(container.querySelector('[data-id="a"]')).not.toBeNull());

    expect(requests.map((t) => t.texto)).toContain('a');
    expect(received).toEqual([measures]);
  });

  it('drawing places the Slots with the same measures as the layout: a title in a chip takes its measured width', async () => {
    const inChip = {
      ...NEUTRAL_THEME,
      nodo: { ...NEUTRAL_THEME.nodo, slots: { direccion: 'row' as const, gap: 0, pad: 0, hijos: [{ slot: 'title' as const }] }, textos: { title: { tipo: 'text', props: { fill: 'blue' } } } },
    };
    const measures: TextMeasures = { nivel: 'medido', fuentes: {}, anchos: { [textKey(NEUTRAL_THEME.fonts.body, 14, 'a')]: 300 } };
    const layout: LayoutAdapter = async (view, theme, m) => (await import('layout')).layoutView(view, theme, { ...(m !== undefined && { measures: m }) });

    const { container } = render(<InteractiveView source={source} view="v" theme={inChip} layout={layout} width={400} height={300} measure={async () => measures} />);
    await waitFor(() => expect(container.querySelector('[data-id="a"] [data-slot="title"]')).not.toBeNull());

    expect((container.querySelector('[data-id="a"] [data-slot="title"]') as HTMLElement).style.width).toBe('300px');
  });
});

describe('layout in a Worker with measures', () => {
  it('the measures travel in the request and reach layoutView', async () => {
    const [page, worker] = (() => {
      const create = (): LayoutPort & { target?: LayoutPort } => {
        const p: LayoutPort & { target?: LayoutPort } = {
          onmessage: null,
          postMessage(m) {
            const copy = structuredClone(m);
            setTimeout(() => p.target?.onmessage?.({ data: copy }), 0);
          },
        };
        return p;
      };
      const a = create();
      const b = create();
      a.target = b;
      b.target = a;
      return [a, b];
    })();
    serveLayout(worker);
    const adapter = workerAdapter(page);
    const view = { ...(await import('canonical')).resolveView(source, 'v')! };
    const m = NEUTRAL_THEME.fonts['body']!;
    const fontSize = 14;

    const without = await adapter(view, NEUTRAL_THEME);
    const withValue = await adapter(view, NEUTRAL_THEME, { nivel: 'medido', fuentes: {}, anchos: { [textKey(m, fontSize, 'a')]: 600 } });

    expect(without.nodes['a']!.width).toBe(120);
    expect(withValue.nodes['a']!.width).toBe(632);
  });
});
