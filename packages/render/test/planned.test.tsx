import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, edgeId, sequenceElementId, resolveView } from 'canonical';
import type { GraphView, SequenceView, ResolvedView } from 'canonical';
import { layoutView } from 'layout';
import type { DiagramProps } from 'render';
import { NEUTRAL_THEME } from 'theme';
import type { ResolvedTheme } from 'theme';

import { toHtml, tagWith, sheetOf } from './helpers';

const node = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'service', title: id.toUpperCase(), description: '', children: [], ...extra });

/** `real -> plan` (planned by its end), `real -> other`; `plan` is planned; `t#coupon` a planned Attribute. */
const FONT = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'service' }] },
  model: {
    nodes: [
      node('real'),
      node('plan', { planned: true }),
      node('other'),
      node('t', { attributes: [{ name: 'id', type: 'uuid', keys: ['pk'] }, { name: 'coupon', type: 'text', keys: ['fk'], planned: true }] }),
    ],
    edges: [
      { from: { node: 'real' }, to: { node: 'plan' } },
      { from: { node: 'real' }, to: { node: 'other' } },
    ],
    interactions: [
      {
        id: 'flow',
        title: 'Flow',
        items: [
          { type: 'message', from: 'real', to: 'other' },
          { type: 'message', from: 'real', to: 'plan' },
        ],
      },
    ],
  },
  views: [
    { id: 'arch', type: 'architecture', include: ['real', 'plan', 'other'] },
    { id: 'data', type: 'er', include: ['t'] },
    { id: 'seq', type: 'sequence', interaction: 'flow' },
  ],
});

async function draw(id: string, extra: Partial<DiagramProps> = {}): Promise<string> {
  const view = resolveView(FONT, id) as ResolvedView;
  const theme = (extra.theme as ResolvedTheme | undefined) ?? NEUTRAL_THEME;
  return toHtml({ view, geometry: await layoutView(view, theme), theme, width: 800, height: 600, ...extra });
}

const box = (html: string, id: string): string | undefined => tagWith(html, `class="rd-caja" data-id="${id}"`);
const part = (html: string, id: string): string | undefined => tagWith(html.slice(html.indexOf(`data-id="${id}"`)), 'data-part="nodo"');

describe('planned elements on the canvas', () => {
  it('the default Theme draws a planned Node faded with a dashed contour, a real one untouched', async () => {
    const html = await draw('arch');
    const sheet = sheetOf(html);

    expect(box(html, 'plan')).toContain('data-planeado=""');
    expect(box(html, 'real')).not.toContain('data-planeado');
    expect(part(html, 'plan')).toMatch(/data-estados="planned"/);
    expect(html).toMatch(/<div class="rd-estado" data-state="planned"/);
    expect(sheet).toMatch(/\[data-planeado\]\{opacity:0\.\d+\}/);
    expect(sheet).toMatch(/\.rd-estado\[data-state="planned"\]\{[^}]*dashed/);
  });

  it('never changes Metrics: the planned Node keeps the size it would have if real', async () => {
    const view = resolveView(FONT, 'arch') as GraphView;
    const actual = await layoutView({ ...view, nodes: view.nodes.map(({ planned: _p, ...n }) => n) }, NEUTRAL_THEME);
    const withPlanned = await layoutView(view, NEUTRAL_THEME);
    expect(withPlanned).toEqual(actual);
  });

  it('an Edge touching a planned Node is drawn planned with a dashed line', async () => {
    const html = await draw('arch');
    const view = resolveView(FONT, 'arch') as GraphView;
    const [towardPlan, towardOther] = view.edges.map((edge) => edgeId(edge).replaceAll('>', '&gt;'));

    expect(tagWith(html, `data-edge="${towardPlan}"`)).toContain('data-planeado=""');
    expect(tagWith(html, `data-edge="${towardOther}"`)).not.toContain('data-planeado');
    expect(sheetOf(html)).toMatch(/\[data-planeado\] > path\[data-capa\]\{stroke-dasharray:/);
  });

  it('a Message to a planned Lifeline is drawn planned (sequence)', async () => {
    const html = await draw('seq');
    const view = resolveView(FONT, 'seq') as SequenceView;
    const [toOther, toPlan] = view.interaction.messages.map((m) => sequenceElementId('flow', m.path));

    expect(tagWith(html, `data-message="${toPlan}"`)).toContain('data-planeado=""');
    expect(tagWith(html, `data-message="${toOther}"`)).not.toContain('data-planeado');
    expect(tagWith(html, 'data-lifeline="plan"')).toContain('data-planeado=""');
    expect(box(html, 'plan')).toContain('data-planeado=""');
  });

  it('a planned Attribute shows a PLAN chip after its key chips (er)', async () => {
    const html = await draw('data');
    const row = html.slice(html.indexOf('data-attribute="t#coupon"'));
    const chips = [...row.slice(0, row.indexOf('data-attribute', 10) === -1 ? undefined : row.indexOf('data-attribute', 10)).matchAll(/data-key="([a-z]+)"[^>]*>([A-Z]+)</g)].map((m) => [m[1], m[2]]);
    expect(chips).toEqual([
      ['fk', 'FK'],
      ['planned', 'PLAN'],
    ]);
    const id = html.slice(html.indexOf('data-attribute="t#id"'), html.indexOf('data-attribute="t#coupon"'));
    expect(id).not.toContain('data-key="planned"');
  });

  it('a Theme with its own planned patch restyles the state instead of the default look', async () => {
    const ownValue: ResolvedTheme = {
      ...NEUTRAL_THEME,
      name: 'own',
      nodo: {
        ...NEUTRAL_THEME.nodo,
        capas: [{ nombre: 'borde', primitiva: { tipo: 'border', props: { color: 'gray', width: 1 } } }],
        estados: { planned: [{ nombre: 'borde', props: { color: 'red' } }] },
      },
    };
    const html = await draw('arch', { theme: ownValue });

    expect(box(html, 'plan')).not.toContain('data-planeado');
    expect(html).not.toMatch(/<div class="rd-estado" data-state="planned"/);
    expect(part(html, 'plan')).toMatch(/data-estados="planned"/);
    expect(sheetOf(html)).toMatch(/\[data-estados~="planned"\]\{[^}]*#dc2626/);
  });
});

describe('a Theme restyles planned Edges and Messages (paint-only)', () => {
  const line = (name: string, props: Record<string, string | number>) => ({ nombre: name, primitiva: { tipo: 'line', props: { width: 1, style: 'solid', corner: 'sharp', cut: 6, ...props } } });
  const withPlanned: ResolvedTheme = {
    ...NEUTRAL_THEME,
    name: 'own-lines',
    arista: { ...NEUTRAL_THEME.arista, capas: [line('line', { color: 'gray' })], estados: { planned: [{ nombre: 'line', props: { color: 'red', style: 'dotted' } }] } },
  };

  it('a planned Edge takes the Theme stack of its planned patch, without the default dashed look', async () => {
    const html = await draw('arch', { theme: withPlanned });
    const view = resolveView(FONT, 'arch') as GraphView;
    const [towardPlan, towardOther] = view.edges.map((edge) => edgeId(edge).replaceAll('>', '&gt;'));
    const stroke = (id: string): string => html.slice(html.indexOf(`data-edge="${id}"`), html.indexOf('</g>', html.indexOf(`data-edge="${id}"`)));

    expect(tagWith(html, `data-edge="${towardPlan}"`)).not.toContain('data-planeado');
    expect(stroke(towardPlan)).toContain('stroke="#dc2626"');
    expect(stroke(towardPlan)).toContain('stroke-linecap="round"');
    expect(stroke(towardOther)).not.toContain('stroke="#dc2626"');
  });

  it('without a message block, a planned Message takes the Edge planned patch (sequence)', async () => {
    const html = await draw('seq', { theme: withPlanned });
    const view = resolveView(FONT, 'seq') as SequenceView;
    const [toOther, toPlan] = view.interaction.messages.map((m) => sequenceElementId('flow', m.path));
    const stroke = (id: string): string => html.slice(html.indexOf(`data-message="${id}"`), html.indexOf('</g>', html.indexOf(`data-message="${id}"`)));

    expect(tagWith(html, `data-message="${toPlan}"`)).not.toContain('data-planeado');
    expect(stroke(toPlan)).toContain('stroke="#dc2626"');
    expect(stroke(toOther)).not.toContain('stroke="#dc2626"');
  });

  it('never changes the layout: Metrics are the same with or without the patch', async () => {
    const view = resolveView(FONT, 'arch') as GraphView;
    expect(await layoutView(view, withPlanned)).toEqual(await layoutView(view, { ...withPlanned, arista: { ...withPlanned.arista, estados: {} } }));
  });
});
