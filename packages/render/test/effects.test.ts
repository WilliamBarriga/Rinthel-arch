import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import type { Theme, ResolvedView } from 'canonical';
import { layoutView } from 'layout';
import { toHtml, tagWith, sheetOf, property } from './helpers';
import { NEUTRAL_THEME, buildPrimitive } from 'theme';

const node = (id: string, title: string, children: unknown[] = []) => ({ id, type: 'servicio', title, description: '', children });

function view(title = 'Base', collapsed = false): ResolvedView {
  const source = canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio', color: 'blue' }] },
    model: { nodes: [node('a', 'Plataforma', [node('a.api', 'API')]), node('db', title)], edges: [{ from: { node: 'a.api' }, to: { node: 'db' } }] },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], overrides: [] }],
  });
  return resolveView(source, 'v', collapsed ? { collapsed: ['a'] } : {})!;
}

/** Layer as the DSL compiler delivers it: validated properties with the catalog defaults. */
const layer = (name: string, kind: string, props: Record<string, string | number> = {}) => {
  const { primitive, errors } = buildPrimitive(kind, Object.entries(props).map(([key, value]) => ({ key, value })), NEUTRAL_THEME.palette);
  if (primitive === undefined) throw new Error(errors.map((e) => e.message).join('; '));
  return { nombre: name, primitiva: { tipo: kind, props: primitive.props } };
};
const withLayers = (layers: ReturnType<typeof layer>[], seed?: string): Theme => ({
  ...NEUTRAL_THEME,
  tokens: { ...NEUTRAL_THEME.tokens, ...(seed !== undefined && { seed }) },
  nodo: { ...NEUTRAL_THEME.nodo, capas: layers },
});

async function draw(theme: Theme, v = view()): Promise<string> {
  return toHtml({ view: v, geometry: await layoutView(v, theme), theme, width: 800, height: 600 });
}

/** Markup of the freehand filters (`<filter ...>...</filter>`) inside the box of Node `id`. */
const filterOf = (html: string, id: string): string => {
  const from = html.indexOf(`data-id="${id}"`);
  return /<filter[\s\S]*?<\/filter>/.exec(html.slice(from))?.[0] ?? '';
};

describe('shadow, glow, glass', () => {
  it('stacks several shadows (the last on top) with inset, spread and hard blur 0', async () => {
    const theme = withLayers([
      layer('suave', 'shadow', { color: 'green', y: 8, blur: 16 }),
      layer('dura', 'shadow', { color: 'blue', x: 4, y: 4, spread: 2 }),
      layer('interior', 'shadow', { color: 'gray', inset: 1, y: 0, blur: 6 }),
    ]);

    const sheet = sheetOf(await draw(theme));

    expect(sheet).toMatch(/box-shadow:inset 0px 0px 6px 0px #6b7280, 4px 4px 0px 2px #2563eb, 0px 8px 16px 0px #16a34a/);
  });

  it('glow is a glow without offset and glass a backdrop-filter', async () => {
    const sheet = sheetOf(await draw(withLayers([layer('aura', 'glow', { color: 'blue', radius: 20, spread: 2 }), layer('cristal', 'glass', { blur: 10, saturate: 150 })])));

    expect(sheet).toContain('box-shadow:0px 0px 20px 2px #2563eb');
    expect(sheet).toContain('backdrop-filter:blur(10px) saturate(150%)');
  });
});

describe('deterministic freehand and tilt', () => {
  const sketch = withLayers([layer('trazo', 'sketch', { roughness: 3 })]);

  it('each Node references its own seeded filter', async () => {
    const html = await draw(sketch);

    const id = /<filter[^>]*id="([^"]+)"/.exec(filterOf(html, 'db'))?.[1];
    expect(id).toBeDefined();
    expect(html).toContain(`filter:url(#${id})`);
    expect(filterOf(html, 'db')).toContain('feTurbulence');
    expect(filterOf(html, 'db')).not.toBe(filterOf(html, 'a.api'));
  });

  it('resizing or collapsing does not change the stroke', async () => {
    const base = filterOf(await draw(sketch), 'db');

    expect(base).not.toBe('');
    expect(filterOf(await draw(sketch, view('Un titulo mucho mas largo para ensanchar la caja')), 'db')).toBe(base);
    expect(filterOf(await draw(sketch, view('Base', true)), 'db')).toBe(base);
  });

  it('`seed N` changes the stroke and is reproducible', async () => {
    const without = filterOf(await draw(sketch), 'db');
    const seven = filterOf(await draw(withLayers([layer('trazo', 'sketch', { roughness: 3 })], '7')), 'db');
    const again = filterOf(await draw(withLayers([layer('trazo', 'sketch', { roughness: 3 })], '7')), 'db');

    expect(seven).toBe(again);
    expect(seven).not.toBe(without);
  });

  it('the tilt is stable, does not exceed 3 degrees and varies with the seed', async () => {
    const tiltDeg = async (seed?: string) => {
      const html = await draw(withLayers([layer('ladeo', 'tilt', { degrees: 3 })], seed));
      return Number.parseFloat(/rotate\((-?[\d.]+)deg\)/.exec(property(tagWith(html, 'data-id="db"'), 'transform') ?? '')?.[1] ?? '');
    };

    const base = await tiltDeg();
    expect(Math.abs(base)).toBeLessThanOrEqual(3);
    expect(await tiltDeg()).toBe(base);
    expect(await tiltDeg('5')).not.toBe(base);
  });

  it('the tilt is around the center of the box in place: it goes after the translation, it does not shift it', async () => {
    const html = await draw(withLayers([layer('ladeo', 'tilt', { degrees: 3 })]));
    const box = tagWith(html, 'data-id="db"');

    expect(property(box, 'transform')).toMatch(/^translate\([-\d.]+px,[-\d.]+px\) rotate\(-?[\d.]+deg\)$/);
    expect(property(box, 'rotate')).toBeUndefined();
  });
});

describe('freehand Edge stroke', () => {
  const line = (props: Record<string, string | number>) => {
    const { primitive, errors } = buildPrimitive('line', Object.entries(props).map(([key, value]) => ({ key, value })), NEUTRAL_THEME.palette, 'capa-arista');
    if (primitive === undefined) throw new Error(errors.map((e) => e.message).join('; '));
    return { nombre: 'linea', primitiva: primitive };
  };
  const withStroke = (props: Record<string, string | number>): Theme => ({ ...NEUTRAL_THEME, arista: { ...NEUTRAL_THEME.arista, capas: [line({ color: 'blue', ...props })] } });
  const edges = (html: string): string => /data-capa="aristas"[\s\S]*?<\/svg>/.exec(html)?.[0] ?? '';

  it('roughness displaces the stroke with a noise filter on the canvas, which does not vanish on straight runs', async () => {
    const svg = edges(await draw(withStroke({ roughness: 3.5, frequency: 0.035 })));
    const id = /<filter[^>]*id="([^"]+)"/.exec(svg)?.[1];

    expect(id).toBeDefined();
    expect(svg).toMatch(/<filter[^>]*filterUnits="userSpaceOnUse"/);
    expect(svg).toContain('baseFrequency="0.035"');
    expect(svg).toContain('scale="3.5"');
    expect(svg).toContain(`filter="url(#${id})"`);
  });

  it('without roughness the stroke carries no filter', async () => {
    const svg = edges(await draw(withStroke({})));

    expect(svg).not.toContain('<filter');
    expect(svg).not.toContain('filter="url(');
  });
});

describe('decoration and overflow', () => {
  const decorated = withLayers([layer('sombra', 'shadow', { color: 'gray', blur: 20 }), layer('cinta', 'tape', { color: 'blue/0.5' }), layer('aro', 'ring', { color: 'blue', offset: 8 }), layer('trazo', 'sketch')]);

  it('painted Layers stick out without changing the geometry nor the boxes', async () => {
    const flat = withLayers([]);
    const v = view();

    expect(await layoutView(v, decorated)).toEqual(await layoutView(v, flat));
    const box = (html: string) => tagWith(html, 'data-id="db"');
    expect(box(await draw(decorated))).toBe(box(await draw(flat)));
  });

  it('the tape is its own element that sticks out at the top and gets no clicks; the ring comes out through outline', async () => {
    const html = await draw(decorated);

    expect(html).toMatch(/class="rd-cinta"[^>]*style="[^"]*top:-8px/);
    expect(sheetOf(html)).toContain('outline:2px solid #2563eb;outline-offset:8px');
    expect(sheetOf(html)).toContain('.rd-cinta{');
  });

  it('the fold is a folded top right corner that covers the border, with the page background and a hard shadow', async () => {
    const html = await draw(withLayers([layer('borde', 'border', { color: 'gray', width: 2 }), layer('doblez', 'fold', { color: 'blue', size: 14, shadow: 'gray' })]));
    const foldSize = tagWith(html.slice(html.indexOf('data-id="db"')), 'class="rd-doblez"');

    expect(property(foldSize, 'top')).toBe('-2px');
    expect(property(foldSize, 'right')).toBe('-2px');
    expect(property(foldSize, 'border-width')).toBe('0 14px 14px 0');
    expect(property(foldSize, 'border-color')).toBe(`transparent ${NEUTRAL_THEME.tokens.background} #2563eb transparent`);
    expect(property(foldSize, 'box-shadow')).toBe('-2px 2px 0 #6b7280');
  });

  it('pins are two combs of the Layer color that stick out at the top and bottom, with a side margin', async () => {
    const html = await draw(withLayers([layer('patas', 'pins', { color: 'gray', width: 4, step: 11, length: 6, margin: 10 })]));
    const pinList = tagWith(html.slice(html.indexOf('data-id="db"')), 'class="rd-pines"');
    const comb = 'repeating-linear-gradient(90deg,#6b7280 0 4px,transparent 4px 11px)';

    expect(property(pinList, 'left')).toBe('10px');
    expect(property(pinList, 'right')).toBe('10px');
    expect(property(pinList, 'top')).toBe('-6px');
    expect(property(pinList, 'bottom')).toBe('-6px');
    expect(property(pinList, 'background-image')).toBe(`${comb},${comb}`);
    expect(property(pinList, 'background-size')).toBe('100% 6px,100% 6px');
    expect(property(pinList, 'background-position')).toBe('0 0,0 100%');
    expect(sheetOf(html)).toMatch(/\.rd-pines\{position:absolute;[^}]*background-repeat:no-repeat/);
  });

  it('the tape with angle is rotated that fixed angle, the same on every element', async () => {
    const html = await draw(withLayers([layer('cinta', 'tape', { color: 'blue/0.5', angle: -4 })]));

    expect(tagWith(html.slice(html.indexOf('data-id="db"')), 'class="rd-cinta"')).toContain('rotate(-4deg)');
    expect(tagWith(html.slice(html.indexOf('data-id="a.api"')), 'class="rd-cinta"')).toContain('rotate(-4deg)');
  });

  it('the stripe is a band of the Layer color on one side of the box, over its border and clipped by its outline', async () => {
    const html = await draw(withLayers([layer('borde', 'border', { color: 'gray', width: 3 }), layer('franja', 'stripe', { color: 'blue', side: 'right', width: 12 })]));
    const band = tagWith(html.slice(html.indexOf('data-id="db"')), 'class="rd-franja"');

    expect(property(band, 'left')).toBe('-3px');
    expect(property(band, 'top')).toBe('-3px');
    expect(property(band, 'width')).toBe('calc(100% + 6px)');
    expect(property(band, 'background')).toBe('linear-gradient(to left,#2563eb 12px,transparent 12px)');
    expect(sheetOf(html)).toMatch(/\.rd-franja\{position:absolute;[^}]*border-radius:inherit/);
  });
});

