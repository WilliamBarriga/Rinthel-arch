import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import type { ResolvedView } from 'canonical';
import { layoutView } from 'layout';
import { Diagram } from 'render';
import type { DiagramProps } from 'render';
import { NEUTRAL_THEME } from 'theme';
import type { ResolvedTheme } from 'theme';

import { layerOf, tagWith, sheetOf } from './helpers';

const node = (id: string, type = 'servicio', children: unknown[] = []) => ({ id, type, title: id.toUpperCase(), description: '', children });
const makeView = (state: { collapsed?: string[] } = {}): ResolvedView =>
  resolveView(
    canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio', color: 'blue' }, { name: 'capa', color: 'green' }, { name: 'externo', color: 'red' }] },
      model: { nodes: [node('g', 'capa', [node('g.a'), node('g.b', 'externo')]), node('h', 'capa', [node('h.a')]), node('x', 'externo')], edges: [{ from: { node: 'g.a' }, to: { node: 'x' } }] },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    }),
    'v',
    state,
  )!;

const layer = (name: string, kind: string, props: Record<string, number | string>) => ({ nombre: name, primitiva: { tipo: kind, props } });
const op = (name: string, props: Record<string, number | string>, primitive?: string) => ({ nombre: name, props, ...(primitive !== undefined && { primitiva: primitive }) });

const theme = (extraNode: Record<string, unknown> = {}, extraGroup: Record<string, unknown> = {}): ResolvedTheme =>
  ({
    ...NEUTRAL_THEME,
    nodo: { ...NEUTRAL_THEME.nodo, capas: [layer('forma', 'rect', { radius: 3 }), layer('relleno', 'solid', { color: 'amber' })], ...extraNode },
    grupo: { ...NEUTRAL_THEME.grupo, ...extraGroup },
  }) as unknown as ResolvedTheme;

async function draw(theme: ResolvedTheme, extra: Partial<DiagramProps> = {}, state: { collapsed?: string[] } = {}) {
  const view = makeView(state);
  const geometry = await layoutView(view, theme);
  const html = renderToStaticMarkup(<Diagram view={view} geometry={geometry} theme={theme} width={800} height={600} {...extra} />);
  return { html, css: sheetOf(html) };
}

/** Body of the first rule with that exact selector (without the scope class). */
const rule = (css: string, selector: string): string | undefined => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)\\.rd-[a-z0-9]+ ${escaped}\\{([^}]*)\\}`).exec(css)?.[1];
};

describe('Diagram: Node, open Group and collapsed Group each have their own paint', () => {
  it('each element carries its class and their selectors stay apart', async () => {
    const { html, css } = await draw(theme(), {}, { collapsed: ['h'] });

    expect(layerOf(html, 'grupos')).toContain('class="rd-grupo"');
    expect(layerOf(html, 'nodos')).toContain('class="rd-nodo"');
    expect(layerOf(html, 'nodos')).toContain('class="rd-colapsado"');
    expect(tagWith(html, 'data-id="h"')).toContain('data-elemento="colapsado"');
    expect(tagWith(html, 'data-id="g"')).toContain('data-elemento="grupo"');
    expect(css).not.toMatch(/\.rd-nodo, ?[^{]*\.rd-grupo[^{]*\{[^}]*border-radius/);
  });

  it('a Theme without group paints the Group with its plain token stack and never with the Node Layers', async () => {
    const { css } = await draw(theme());
    const nodeRule = rule(css, '.rd-nodo')!;
    const group = rule(css, '.rd-grupo')!;

    expect(nodeRule).toContain('background:#d97706');
    expect(group).not.toContain('#d97706');
    expect(group).toContain('border-radius:8px');
    expect(group).toContain('color-mix(in srgb, #1f2937 4%, transparent)');
    expect(rule(css, '.rd-colapsado')).toContain('dashed');
  });

  it('the group Layers, its per-kind and per-state patches and the collapsed one come from its own stack', async () => {
    const group = {
      capas: [layer('caja', 'rect', { radius: 20 }), layer('fondo', 'solid', { color: 'gray' }), layer('borde', 'border', { color: 'blue', width: 2 })],
      tipos: { capa: [op('fondo', { color: 'green' })] },
      estados: { hover: [op('borde', { color: 'red' })] },
      colapsado: { ops: [op('fondo', { color: 'purple' })] },
    };
    const { css } = await draw(theme({}, group), {}, { collapsed: ['h'] });

    expect(rule(css, '.rd-grupo:not([data-tipo])')).toContain('background:#6b7280');
    expect(rule(css, '.rd-grupo[data-tipo="capa"]')).toContain('background:#16a34a');
    expect(rule(css, '.rd-grupo[data-tipo="capa"]')).toContain('border-radius:20px');
    expect(rule(css, '.rd-grupo:not([data-tipo])[data-estados~="hover"]')).toBe('border:2px solid #dc2626');
    expect(rule(css, '.rd-colapsado:not([data-tipo])')).toContain('background:#7c3aed');
    expect(rule(css, '.rd-caja[data-elemento="grupo"]:not([data-tipo]) .rd-estado')).toBe('border-radius:20px');
  });
});

describe('Diagram: Node kind and state patches painted the same on Nodes and Groups', () => {
  const halo = layer('halo', 'solid', { color: 'red', 'offset-x': 4, 'offset-y': 4, grow: 2 });

  it('a Node kind patch changes its box and its own element; only the Node of that kind carries it', async () => {
    const t = theme({
      capas: [layer('forma', 'rect', { radius: 3 }), layer('relleno', 'solid', { color: 'amber' }), layer('borde', 'border', { color: 'gray', width: 1 })],
      tipos: { externo: [op('borde', { color: 'gray' }, 'dashed'), { ...op('halo', { color: 'red', 'offset-x': 4, 'offset-y': 4, grow: 2 }, 'solid'), antes: 'relleno' }, op('relleno', { color: 'blue' })] },
    });
    const { html, css } = await draw(t);

    expect(tagWith(html, 'data-id="x"')).toContain('data-tipo="externo"');
    expect(tagWith(html, 'data-id="g.a"')).not.toContain('data-tipo');
    expect(rule(css, '.rd-nodo:not([data-tipo])')).toContain('border:1px solid #6b7280');
    expect(rule(css, '.rd-nodo[data-tipo="externo"]')).toContain('border:1px dashed #6b7280');
    expect(rule(css, '.rd-nodo[data-tipo="externo"]')).toContain('background:#2563eb');
    expect(rule(css, '.rd-nodo[data-tipo="externo"] .rd-anim[data-anim="halo"]')).toContain('translate:4px 4px');
    expect(rule(css, '.rd-nodo[data-tipo="externo"]')).not.toContain('translate');
    expect(layerOf(html, 'nodos').match(/data-anim="halo"/g)).toHaveLength(2);
    expect(css).not.toMatch(/\.rd-nodo:not\(\[data-tipo\]\) \.rd-anim\[data-anim="halo"\]/);
  });

  it('the same patch on a Group is painted the same way: Layer with its own element and state', async () => {
    const t = theme({}, {
      capas: [layer('caja', 'rect', { radius: 10 }), layer('fondo', 'solid', { color: 'gray' })],
      tipos: { capa: [{ ...op('halo', halo.primitiva.props, 'solid'), antes: 'fondo' }] },
      estados: { hover: [op('fondo', { color: 'blue' })] },
    });
    const { html, css } = await draw(t, { states: { g: ['hover'] } });

    expect(tagWith(html, 'data-id="g"')).toContain('data-tipo="capa"');
    expect(layerOf(html, 'grupos')).toContain('data-anim="halo"');
    expect(rule(css, '.rd-grupo[data-tipo="capa"] .rd-anim[data-anim="halo"]')).toContain('translate:4px 4px');
    expect(rule(css, '.rd-grupo[data-tipo="capa"][data-estados~="hover"]')).toBe('background:#2563eb');
    expect(rule(css, '.rd-grupo[data-tipo="capa"]')).toBe('border-radius:10px;background:#6b7280;--rd-borde:0px');
  });

  it('a state changes only what changes and gives back its initial value to what it removes', async () => {
    const t = theme({
      capas: [layer('forma', 'rect', { radius: 3 }), layer('relleno', 'solid', { color: 'amber' }), layer('sombra', 'shadow', { x: 0, y: 2, blur: 4, spread: 0, inset: 0, color: 'gray' })],
      estados: { hover: [op('sombra', { y: 8 })], dimmed: [{ nombre: 'sombra', props: {}, quitar: true }] },
    });
    const { css } = await draw(t);

    expect(rule(css, '.rd-nodo[data-estados~="hover"]')).toBe('box-shadow:0px 8px 4px 0px #6b7280');
    expect(rule(css, '.rd-nodo[data-estados~="dimmed"]')).toBe('box-shadow:initial');
  });

  it('COLOR is the Node color variable, with and without alpha, in a sheet that serves every color', async () => {
    const t = theme({ capas: [layer('forma', 'rect', { radius: 3 }), layer('relleno', 'solid', { color: 'COLOR/0.25' }), layer('borde', 'border', { color: 'COLOR', width: 1 })] });
    const { css, html } = await draw(t);

    expect(rule(css, '.rd-nodo')).toContain('background:color-mix(in srgb, var(--trazo) 25%, transparent)');
    expect(rule(css, '.rd-nodo')).toContain('border:1px solid var(--trazo)');
    expect(tagWith(html, 'aria-label="G.A')).toContain('--trazo:#2563eb');
  });

  it('mix with COLOR is mixed by the browser: color-mix of the Node variable with the Palette one', async () => {
    const t = theme({ capas: [layer('forma', 'rect', { radius: 3 }), layer('relleno', 'gradient', { from: 'mix(COLOR, gray, 0.3)', to: 'COLOR', angle: 180 })] });
    const { css } = await draw(t);

    expect(rule(css, '.rd-nodo')).toContain('linear-gradient(180deg,color-mix(in srgb, var(--trazo) 70%, #6b7280),var(--trazo))');
  });
});

describe('Diagram: Group head', () => {
  it('the title text style (uppercase, tracking, size, alpha, chip and dot) comes from the Theme as CSS', async () => {
    const title = { tipo: 'text', props: { weight: 600, style: 'normal', transform: 'uppercase', size: 0.8, tracking: 0.1, alpha: 0.6, fill: 'COLOR/0.2', border: 'COLOR/0.5', radius: 50, pad: 8, dot: 'COLOR' } };
    const { css, html } = await draw(theme({}, { textos: { title } }));
    const titleRule = rule(css, '.rd-grupo .rd-slot[data-slot="title"]')!;

    expect(layerOf(html, 'grupos')).toContain('font-size:11.2px'); // the placement reserves and sets the size
    expect(titleRule).toContain('text-transform:uppercase');
    expect(titleRule).toContain('letter-spacing:0.1em');
    expect(titleRule).toContain('opacity:0.6');
    expect(titleRule).toContain('background:color-mix(in srgb, var(--trazo) 20%, transparent)');
    expect(titleRule).toContain('border:1px solid color-mix(in srgb, var(--trazo) 50%, transparent)');
    expect(titleRule).toContain('border-radius:50px');
    expect(titleRule).toContain('padding-left:8px');
    expect(rule(css, '.rd-grupo .rd-slot[data-slot="title"]::before')).toContain('background:var(--trazo)');
    expect(rule(css, '.rd-nodo .rd-slot[data-slot="title"]')).toBeUndefined();
  });

  it('the head icon uses the Group Slot style and leaves room for the collapse control', async () => {
    const t = theme({}, { textos: { icon: { tipo: 'icon', props: { variant: 'dot', side: 10, radius: 6, fill: 'COLOR' } } } });
    const { html, css } = await draw(t, { onToggle: () => undefined, icons: { keys: () => ['box'], resolve: () => '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>' } });

    expect(rule(css, '.rd-grupo .rd-icono[data-variante="dot"]')).toContain('background:var(--trazo)');
    expect(html).toContain('data-toggle="g"');
  });
});
