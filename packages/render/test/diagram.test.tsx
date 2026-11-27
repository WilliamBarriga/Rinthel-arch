import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { canonicalFormSchema, resolveView, revealAt } from 'canonical';
import type { Geometry, GraphView, ResolvedView } from 'canonical';
import { layoutView } from 'layout';
import { Diagram, resolveStyle } from 'render';
import type { DiagramProps } from 'render';
import { NEUTRAL_THEME, placeInBox, metricsOf, primitivesOf } from 'theme';
import type { SlotLayoutBox, ResolvedTheme } from 'theme';

import { PAINTERS } from '../src/sheet';
import { layerOf, tagWith, sheetOf, property, rectOf, translationOf } from './helpers';

const node = (id: string, title: string, children: unknown[] = []) => ({ id, type: 'servicio', title, description: '', children });

/** a { a1 a2 } -> b -> c, with two steps: first `a`, then `b` and `c`. */
function makeView(state = {}, steps: unknown[] = []): GraphView {
  const source = canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: {
      nodes: [node('a', 'A', [node('a.a1', 'A1'), node('a.a2', 'A2')]), node('b', 'B'), node('c', 'C')],
      edges: [
        { from: { node: 'a.a1' }, to: { node: 'b' } },
        { from: { node: 'b' }, to: { node: 'c' } },
      ],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], steps }],
  });
  return resolveView(source, 'v', state) as GraphView;
}

const STEPS = [
  { title: 'uno', show: [{ selector: 'a.**' }, { selector: 'a' }], hide: [] },
  { title: 'dos', show: [{ selector: 'b' }, { selector: 'c' }], hide: [] },
];

/** Theme with a Layer stack: rounded shape, fill and Palette border. */
const WITH_LAYERS: ResolvedTheme = {
  ...NEUTRAL_THEME,
  nodo: {
    slots: NEUTRAL_THEME.nodo.slots,
    textos: {},
    tipos: {},
    estados: {},
    capas: [
      { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 12 } } },
      { nombre: 'fondo', primitiva: { tipo: 'solid', props: { color: 'amber' } } },
      { nombre: 'borde', primitiva: { tipo: 'border', props: { color: 'blue', width: 2 } } },
    ],
  },
};

async function props(view: ResolvedView, extra: Partial<DiagramProps> = {}): Promise<DiagramProps> {
  const geometry: Geometry = await layoutView(view, NEUTRAL_THEME);
  return { view, geometry, theme: NEUTRAL_THEME, width: 800, height: 600, ...extra };
}

/** Walks the element tree the component returns (without DOM). */
function find(tree: ReactNode, who: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (tree === null || typeof tree !== 'object') return undefined;
  if (Array.isArray(tree)) return tree.map((n) => find(n, who)).find((e) => e !== undefined);
  const element = tree as ReactElement<Record<string, unknown>>;
  if (who(element)) return element;
  return find(element.props?.['children'] as ReactNode, who);
}

const drawing = (p: DiagramProps): string => renderToStaticMarkup(<Diagram {...p} />);
const partOf = (html: string, id: string): string | undefined => tagWith(html.slice(html.indexOf(`data-id="${id}"`)), 'data-part="nodo"');
const opacityOf = (html: string, id: string): string | undefined => property(partOf(html, id), 'opacity');
const worldOf = (html: string): string | undefined => tagWith(html, 'class="rd-mundo"');

describe('Diagram: hybrid structure', () => {
  it('there are three flat layers in Group, Edge, Node order under a container', async () => {
    const html = drawing(await props(makeView()));
    const [g, a, n] = ['grupos', 'aristas', 'nodos'].map((c) => html.indexOf(`data-capa="${c}"`)) as [number, number, number];

    expect(html).toMatch(/^<div class="rd-\w+" data-diagram="" data-camara="0 0 \d+ \d+" style="width:800px;height:600px">/);
    expect(g).toBeGreaterThan(-1);
    expect(g).toBeLessThan(a);
    expect(a).toBeLessThan(n);
    expect(tagWith(html, 'data-capa="aristas"')).toContain('aria-hidden="true"');
  });

  it('open Groups go in their layer, leaf Nodes in the Nodes layer and Edges in the SVG', async () => {
    const html = drawing(await props(makeView()));
    const ids = (layer: 'grupos' | 'aristas' | 'nodos', attribute: string): string[] =>
      [...layerOf(html, layer).matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))].map((m) => m[1]!);

    expect(ids('grupos', 'data-id')).toEqual(['a']);
    expect(ids('nodos', 'data-id')).toEqual(['a.a1', 'a.a2', 'b', 'c']);
    expect(ids('aristas', 'data-edge')).toEqual(['a.a1 -&gt; b', 'b -&gt; c']);
    expect(ids('nodos', 'data-edge')).toEqual([]);
  });

  it('a single pan/zoom transform on the container, with the camera framing', async () => {
    const html = drawing(await props(makeView(), { camera: { x: 10, y: 20, width: 400, height: 300 } }));

    expect(html).toContain('data-camara="10 20 400 300"');
    expect(property(worldOf(html), 'transform')).toBe('translate(-20px,-40px) scale(2)');
    expect(html.match(/scale\(/g)).toHaveLength(1);
  });

  it('a camera with another aspect ratio is centered like a viewBox', async () => {
    const html = drawing(await props(makeView(), { camera: { x: 0, y: 0, width: 400, height: 600 } }));

    // scale 1 (min(2, 1)); 400 px left over in width, 200 on each side.
    expect(property(worldOf(html), 'transform')).toBe('translate(200px,0px) scale(1)');
  });

  it('each box is in absolute canvas coordinates, also those of a Node inside a Group', async () => {
    const p = await props(makeView());
    const html = drawing(p);
    const { a, 'a.a1': a1, b } = p.geometry.nodes;

    expect(translationOf(tagWith(html, 'data-id="a"'))).toEqual({ x: a!.x, y: a!.y });
    expect(translationOf(tagWith(html, 'data-id="a.a1"'))).toEqual({ x: a!.x + a1!.x, y: a!.y + a1!.y });
    expect(translationOf(tagWith(html, 'data-id="b"'))).toEqual({ x: b!.x, y: b!.y });
    expect(rectOf(tagWith(html, 'data-id="a.a1"'))).toMatchObject({ width: a1!.width, height: a1!.height });
  });

  it('the world measures like the geometry and the Edges go in an SVG of the same size', async () => {
    const p = await props(makeView());
    const html = drawing(p);
    const { width, height } = p.geometry;

    expect(property(worldOf(html), 'width')).toBe(`${width}px`);
    expect(property(worldOf(html), 'height')).toBe(`${height}px`);
    expect(html).toContain(`width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`);
  });

  it('each Slot goes on the rectangle the shared placement reserved', async () => {
    const p = await props(makeView());
    const html = drawing(p);
    const { slots } = placeInBox(metricsOf(NEUTRAL_THEME, 'architecture'), { titulo: 'b', atributos: [], icono: false }, p.geometry.nodes['b']!.width);
    const title = tagWith(html.slice(html.indexOf('data-id="b"')), 'data-slot="title"');

    expect(rectOf(title)).toEqual(slots.title);
    expect(title).toContain('class="rd-slot rd-title"');
  });

  describe('Slots badge, desc, footer and counter', () => {
    const COLUMN: SlotLayoutBox = { direccion: 'column', gap: 0, pad: 0, hijos: [{ slot: 'title' }, { slot: 'badge' }, { slot: 'desc' }, { slot: 'footer' }] };
    const ROW: SlotLayoutBox = { direccion: 'row', gap: 8, pad: 0, hijos: [{ slot: 'title' }, { slot: 'counter' }] };
    const withSlots = (slots: ResolvedTheme['nodo']['slots'], texts: ResolvedTheme['nodo']['textos'] = {}): ResolvedTheme => ({ ...NEUTRAL_THEME, nodo: { ...NEUTRAL_THEME.nodo, slots, textos: texts } });
    const draw = async (theme: ResolvedTheme, state = {}) => {
      const v = makeView(state);
      const nodes = v.nodes.map((n) => (n.id === 'b' ? { ...n, description: 'Reparte la carga', source: [{ kind: 'ruta', ref: 'src/b.ts' }] } : n));
      const geometry = await layoutView({ ...v, nodes }, theme);
      return { html: drawing({ view: { ...v, nodes }, geometry, theme, width: 800, height: 600 }), geometry };
    };
    const slotOf = (html: string, id: string, slot: string) => tagWith(html.slice(html.indexOf(`data-id="${id}"`)), `data-slot="${slot}"`);

    it('each new Slot is painted on its rectangle with its text', async () => {
      const { html, geometry } = await draw(withSlots(COLUMN));
      const slots = geometry.nodes['b']!.slots!;

      for (const [slot, text] of [['badge', 'servicio'], ['desc', 'Reparte la carga'], ['footer', 'src/b.ts']] as const) {
        expect(rectOf(slotOf(html, 'b', slot))).toEqual(slots[slot]);
        expect(html).toContain(`>${text}</div>`);
      }
      // The reserved text size (14 * 0.74) is written on the element.
      expect(property(slotOf(html, 'b', 'badge'), 'font-size')).toBe('10.36px');
    });

    it('a Node without description nor source does not paint desc nor footer', async () => {
      const { html } = await draw(withSlots(COLUMN));

      expect(slotOf(html, 'c', 'desc')).toBeUndefined();
      expect(slotOf(html, 'c', 'footer')).toBeUndefined();
      expect(slotOf(html, 'c', 'badge')).toBeDefined();
    });

    it('counter is only painted on the collapsed Group, with the number of children', async () => {
      const { html } = await draw(withSlots(ROW), { collapsed: ['a'] });

      expect(slotOf(html, 'a', 'counter')).toBeDefined();
      expect(slotOf(html, 'b', 'counter')).toBeUndefined();
      expect(html).toContain('>2</div>');
      expect(html).not.toContain('A (2)');
    });

    it('a thick border publishes its width in --rd-borde and the Slots shift by that distance (the last row is not clipped)', async () => {
      const thick: ResolvedTheme = { ...NEUTRAL_THEME, nodo: { ...NEUTRAL_THEME.nodo, capas: [{ nombre: 'borde', primitiva: { tipo: 'border', props: { color: 'blue', width: 4 } } }] as never } };
      const { html } = await draw(thick);
      const sheet = sheetOf(html);

      expect(sheet).toMatch(/\.rd-nodo\{[^}]*--rd-borde:4px/);
      expect(sheet).toContain('.rd-icono{margin:calc(-1 * var(--rd-borde, 0px))');
      expect(sheet).toContain('.rd-attrs{clip-path:inset(0 var(--rd-borde, 0px) var(--rd-borde, 0px))');
    });

    it('the text style (alpha, text-align) and the counter box style come out in the sheet', async () => {
      const { html } = await draw(
        withSlots(
          { direccion: 'column', gap: 0, pad: 0, hijos: [{ slot: 'title' }, { slot: 'badge' }, { slot: 'counter' }] },
          {
            title: { tipo: 'text', props: { weight: 600, style: 'normal', transform: 'none', 'text-align': 'start' } },
            badge: { tipo: 'text', props: { weight: 400, style: 'normal', transform: 'none', alpha: 0.5, 'text-align': 'end' } },
            counter: { tipo: 'chip', props: { weight: 700, radius: 8, fill: 'amber', border: 'blue' } },
          },
        ),
      );
      const sheet = sheetOf(html);

      expect(sheet).toMatch(/data-slot="title"\]\{[^}]*text-align:left/);
      expect(sheet).toMatch(/data-slot="badge"\]\{[^}]*opacity:0.5[^}]*text-align:right/);
      expect(sheet).toMatch(new RegExp(String.raw`data-slot="counter"\]\{[^}]*border-radius:8px[^}]*background:${NEUTRAL_THEME.palette['amber']}[^}]*border:1px solid ${NEUTRAL_THEME.palette['blue']}`));
    });

    it('a Theme with icon variant dot shows the dot in the Node kind color even if the kind declares no icon, and reserves its spot', async () => {
      const ICON_ROW: SlotLayoutBox = { direccion: 'row', gap: 8, pad: 0, hijos: [{ slot: 'icon' }, { slot: 'title' }] };
      const withDot = withSlots(ICON_ROW, { icon: { tipo: 'icon', props: { variant: 'dot', side: 7, radius: 6, fill: 'COLOR' } } });
      const withGlyph = withSlots(ICON_ROW, { icon: { tipo: 'icon', props: { variant: 'plain', side: 7 } } });
      const { html, geometry } = await draw(withDot);
      const { geometry: withoutDot } = await draw(withGlyph);

      expect(rectOf(slotOf(html, 'b', 'icon'))).toMatchObject({ width: 7, height: 7 });
      expect(slotOf(html, 'b', 'icon')).toContain('data-variante="dot"');
      expect(slotOf(html, 'b', 'icon')).not.toContain('data-icon=');
      expect(geometry.nodes['b']!.width).toBeGreaterThan(withoutDot.nodes['b']!.width - 1);
      expect(withoutDot.nodes['b']!.slots?.['icon']).toBeUndefined();
    });

    it('font mono and border-width reach the text, the counter and the icon; the dot with ring sits on a ring', async () => {
      const { html } = await draw(
        withSlots(
          { direccion: 'row', gap: 0, pad: 0, hijos: [{ slot: 'icon' }, { slot: 'badge' }, { slot: 'counter' }] },
          {
            icon: { tipo: 'icon', props: { variant: 'dot', side: 18, radius: 6, ring: 'amber', border: 'blue', 'border-width': 2 } },
            badge: { tipo: 'text', props: { weight: 400, style: 'normal', transform: 'none', font: 'mono', border: 'blue', 'border-width': 2 } },
            counter: { tipo: 'chip', props: { weight: 700, radius: 8, border: 'blue', 'border-width': 2, font: 'mono' } },
          },
        ),
        { collapsed: ['a'] },
      );
      const sheet = sheetOf(html);
      const mono = NEUTRAL_THEME.fonts.mono;

      expect(sheet).toMatch(new RegExp(String.raw`data-slot="badge"\]\{[^}]*font-family:${mono}[^}]*border:2px solid`));
      expect(sheet).toMatch(new RegExp(String.raw`data-slot="counter"\]\{[^}]*font-family:${mono}[^}]*border:2px solid`));
      expect(sheet).toMatch(new RegExp(String.raw`data-variante="dot"\]\{[^}]*background:radial-gradient\(circle closest-side,currentColor 0 44%,${NEUTRAL_THEME.palette['amber']} 46%\)[^}]*border:2px solid`));
      // The counter text is centered inside its 2px border.
      const countSlot = slotOf(html, 'a', 'counter');
      expect(property(countSlot, 'line-height')).toBe(`${rectOf(countSlot).height - 4}px`);
    });
  });

  it('each Node is a box with contain: layout style', async () => {
    const html = drawing(await props(makeView()));

    expect(sheetOf(html)).toMatch(/\.rd-caja\{[^}]*contain:layout style/);
    expect(html).toMatch(/class="rd-caja" data-id="b"/);
  });
});

describe('Diagram: style sheet', () => {
  it('compiles the Theme Layers to CSS in order, and the Node kind color goes as a variable', async () => {
    const html = drawing(await props(makeView(), { theme: WITH_LAYERS }));

    expect(sheetOf(html)).toContain('border-radius:12px;background:#d97706;border:2px solid #2563eb');
    expect(property(partOf(html, 'b'), '--trazo')).toBe('#9ca3af');
  });

  it('is deterministic and the states are selectors', async () => {
    const p = await props(makeView());
    const sheet = sheetOf(drawing(p));

    expect(sheetOf(drawing(p))).toBe(sheet);
    for (const state of ['selected', 'hover', 'ghost']) expect(sheet).toContain(`.rd-estado[data-state="${state}"]{`);
    expect(sheet).toContain('.rd-estado[data-state="ghost"]{border:2px dashed #9ca3af;opacity:0.7}');
  });

  it('without Layers in the Theme the default look of the Style is used', async () => {
    expect(sheetOf(drawing(await props(makeView())))).toContain('border-radius:6px;background:#ffffff;border:1px solid var(--trazo, #9ca3af)');
  });

  it('two Themes give different scope classes, so they do not clash on the same page', async () => {
    const className = (html: string): string => /^<div class="(rd-\w+)"/.exec(html)![1]!;
    const a = drawing(await props(makeView()));
    const b = drawing(await props(makeView(), { theme: WITH_LAYERS }));

    expect(className(a)).not.toBe(className(b));
    expect(sheetOf(b)).not.toContain(`.${className(a)}`);
  });

  it('every catalog Primitive has its painter', () => {
    expect(Object.keys(PAINTERS).sort()).toEqual(primitivesOf('capa-nodo').sort());
  });

  it('a hostile Theme value cannot close the sheet nor inject rules', async () => {
    const hostile: ResolvedTheme = { ...WITH_LAYERS, palette: { ...WITH_LAYERS.palette, amber: 'red}</style><script>x()</script>' } };
    const html = drawing(await props(makeView(), { theme: hostile }));

    expect(html).not.toContain('<script>');
    expect(sheetOf(html)).not.toContain('</style>');
    expect(sheetOf(html)).toContain('background:red/stylescriptx()/script');
  });
});

describe('Diagram', () => {
  it('draws Nodes, Groups and Edges', async () => {
    const html = drawing(await props(makeView()));

    for (const id of ['a', 'a.a1', 'a.a2', 'b', 'c']) expect(html).toContain(`data-id="${id}"`);
    expect(html).toContain('data-edge="a.a1 -&gt; b"');
  });

  it('Edge labels go in a pass after all strokes, with the visibility of their Edge', async () => {
    const base = makeView();
    const view: ResolvedView = { ...base, edges: base.edges.map((e, i) => (i === 0 ? { ...e, label: 'uno' } : e)) };
    const html = drawing(await props(view, { visibility: (id) => (id === 'a.a1 -> b' ? 0.5 : 1) }));
    const lastEdge = html.lastIndexOf('<g data-edge="');

    expect(html.indexOf('data-edge-labels="a.a1 -&gt; b"')).toBeGreaterThan(lastEdge);
    expect(html).toMatch(/<g data-edge-labels="a.a1 -&gt; b" opacity="0.5"/);
  });

  it('visibility 0, 1 and a fraction show in the opacity of Nodes and Edges', async () => {
    const visibility = (id: string): number => ({ b: 0, c: 0.5, 'b -> c': 0.25 })[id] ?? 1;
    const html = drawing(await props(makeView(), { visibility }));

    expect(opacityOf(html, 'b')).toBe('0');
    expect(opacityOf(html, 'c')).toBe('0.5');
    expect(opacityOf(html, 'a.a1')).toBeUndefined();
    expect(html).toMatch(/<g data-edge="b -&gt; c" opacity="0.25"/);
    expect(html).not.toMatch(/<g data-edge="a.a1 -&gt; b" opacity/);
  });

  it('a collapsed Group is a single Node with a counter and without children', async () => {
    const html = drawing(await props(makeView({ collapsed: ['a'] })));

    expect(html).toContain('A (2)');
    expect(html).not.toContain('data-id="a.a1"');
    expect(html).toContain('data-edge="a -&gt; b"');
    expect(layerOf(html, 'nodos')).toContain('data-id="a"');
    expect(layerOf(html, 'grupos')).not.toContain('data-id=');
    expect(partOf(html, 'a')).toContain('data-collapsed=""');
  });

  it('with revealAt the result matches the expected step', async () => {
    const view = makeView({}, STEPS);
    const base = await props(view);
    const inStep = (k: number): string => drawing({ ...base, visibility: revealAt(view, k) });

    expect(opacityOf(inStep(1), 'a.a1')).toBeUndefined();
    expect(opacityOf(inStep(1), 'b')).toBe('0');
    expect(opacityOf(inStep(2), 'b')).toBeUndefined();
    expect(opacityOf(inStep(1.5), 'b')).toBe('0');
  });

  it('no state of its own: the same props produce the same tree', async () => {
    const p = await props(makeView(), { visibility: (id) => (id === 'c' ? 0.3 : 1) });

    expect(drawing(p)).toBe(drawing(p));
    expect(JSON.stringify(Diagram(p))).toBe(JSON.stringify(Diagram(p)));
  });

  it('a Node or Edge with visibility 0 gets no clicks', async () => {
    const visibility = (id: string): number => (id === 'b' || id === 'b -> c' ? 0 : 1);
    const html = drawing(await props(makeView(), { visibility }));

    expect(property(partOf(html, 'b'), 'pointer-events')).toBe('none');
    expect(property(partOf(html, 'c'), 'pointer-events')).toBeUndefined();
    expect(html).toMatch(/<g data-edge="b -&gt; c" opacity="0" pointer-events="none"/);
  });

  it('the arrow marker takes the Theme border color and there are no ids to share', async () => {
    const dark = { ...NEUTRAL_THEME, tokens: { ...NEUTRAL_THEME.tokens, border: '#4b5563' } };
    const a = drawing(await props(makeView()));
    const b = drawing(await props(makeView(), { theme: dark }));

    expect(a).toContain('data-marker="fin"');
    expect(a).not.toContain('<marker');
    expect(b).toMatch(/data-marker="fin"[^>]*><path d="[^"]+" fill="#4b5563"/);
  });

  it('changing a Style value changes what Diagram draws', async () => {
    const base = await props(makeView());
    const style = resolveStyle(NEUTRAL_THEME, 'architecture');
    const another = { ...style, node: { ...style.node, radius: 13, fill: '#fafafa' }, glyphs: { expandedGlyph: 'v', collapsedGlyph: '>' } };
    const draw = (e: typeof style): string => drawing({ ...base, onToggle: () => {}, style: e });

    expect(draw(another)).not.toBe(draw(style));
    expect(sheetOf(draw(another))).toContain('border-radius:13px;background:#fafafa');
    expect(draw(another)).toContain('>v<');
  });

  it('clicking a Node calls onSelect with its id; clicking an Edge, with the Edge one', async () => {
    const onSelect = vi.fn();
    const tree = Diagram(await props(makeView(), { onSelect }));
    // The click goes on the Node's own part, a child of the `data-id` box.
    const byId = (id: string) => find(find(tree, (e) => e.props['data-id'] === id)!.props['children'] as ReactNode, (e) => e.props['data-part'] === 'nodo')!;
    const perEdge = (id: string) => find(tree, (e) => e.props['data-edge'] === id)!;

    (byId('b').props['onClick'] as () => void)();
    (perEdge('b -> c').props['onClick'] as () => void)();

    expect(onSelect.mock.calls).toEqual([['b'], ['b -> c']]);
  });

  it('the control of a Group calls onToggle with its id without selecting it', async () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    const tree = Diagram(await props(makeView(), { onToggle, onSelect }));
    const control = find(tree, (e) => e.props['data-toggle'] === 'a')!;
    const stop = vi.fn();

    (control.props['onClick'] as (ev: { stopPropagation(): void }) => void)({ stopPropagation: stop });

    expect(onToggle).toHaveBeenCalledWith('a');
    expect(stop).toHaveBeenCalled();
    expect(find(tree, (e) => e.props['data-toggle'] === 'b')).toBeUndefined();
  });

  it('the collapse control only shows when hovering its box or with keyboard focus inside', async () => {
    const sheet = sheetOf(drawing(await props(makeView(), { onToggle: () => undefined })));

    expect(sheet).toMatch(/\.rd-control\{[^}]*opacity:0/);
    expect(sheet).toMatch(/\.rd-caja:hover \.rd-control,\.rd-[a-z0-9]+ \.rd-caja:focus-within \.rd-control\{opacity:1\}/);
  });

  it('without onToggle no collapse controls are drawn', async () => {
    expect(drawing(await props(makeView()))).not.toContain('data-toggle');
  });

  describe('visual states', () => {
    const marks = (html: string, state: string): string[] => [...html.matchAll(new RegExp(`<[^>]*data-state="${state}"[^>]*>`, 'g'))].map((m) => m[0]);

    it('a selected Node carries an outline inside its box, styled by the sheet with the Style color', async () => {
      const html = drawing(await props(makeView(), { states: { b: ['selected'] } }));
      const style = resolveStyle(NEUTRAL_THEME, 'architecture');
      const [mark] = marks(html, 'selected');

      expect(mark).toContain('data-selected="b"');
      expect(mark).toContain('class="rd-estado"');
      expect(html.slice(html.indexOf('data-id="b"'), html.indexOf('data-id="c"'))).toContain('data-state="selected"');
      expect(sheetOf(html)).toContain(`.rd-estado[data-state="selected"]{border:3px solid ${style.states.selected.color}}`);
    });

    it('without states no mark is drawn', async () => {
      expect(drawing(await props(makeView())).replace(/<style>[\s\S]*<\/style>/, '')).not.toContain('data-state');
    });

    it('a marked Edge is drawn in its SVG layer; an Attribute that is not shown, is not', async () => {
      const states = { 'b -> c': ['hover'], 'a#x': ['selected'] } as const;
      const html = drawing(await props(makeView(), { states }));

      expect(marks(layerOf(html, 'aristas'), 'hover')).toHaveLength(1);
      expect(marks(layerOf(html, 'aristas'), 'hover')[0]).toContain('<path');
      expect(marks(html, 'selected')).toHaveLength(0);
    });

    it('ghost and hover use their own Style entries', async () => {
      const style = resolveStyle(NEUTRAL_THEME, 'architecture');
      const another = { ...style, states: { ...style.states, ghost: { ...style.states.ghost, color: 'hotpink' } } };
      const sheet = sheetOf(drawing(await props(makeView(), { states: { c: ['ghost'] }, style: another })));

      expect(sheet).toContain('.rd-estado[data-state="ghost"]{border:2px dashed hotpink;opacity:0.7}');
      expect(sheet).toContain(`.rd-estado[data-state="hover"]{border:2px solid ${style.states.hover.color};opacity:0.6}`);
    });

    it('a selected Attribute marks its row, on the placement rectangle', async () => {
      const source = canonicalFormSchema.parse({
        specification: { nodeTypes: [{ name: 'servicio' }] },
        model: { nodes: [{ ...node('t', 'T'), attributes: [{ name: 'id', type: 'int' }, { name: 'nombre', type: 'text' }] }], edges: [] },
        views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
      });
      const v = resolveView(source, 'v')!;
      const p = await props(v, { states: { 't#nombre': ['selected'] } });
      const mark = marks(drawing(p), 'selected')[0];
      const m = metricsOf(NEUTRAL_THEME, 'architecture');

      expect(mark).toContain('data-selected="t#nombre"');
      expect(rectOf(mark)).toEqual({ x: 0, y: m.cabecera + m.fila, width: p.geometry.nodes['t']!.width, height: m.fila });
    });
  });
});
