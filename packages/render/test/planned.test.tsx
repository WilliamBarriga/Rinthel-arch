import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, idDeArista, idDeElementoDeSecuencia, resolveView } from 'canonico';
import type { VistaDeGrafo, VistaDeSecuencia, VistaResuelta } from 'canonico';
import { layoutView } from 'layout';
import type { DiagramProps } from 'render';
import { TEMA_NEUTRO } from 'tema';
import type { TemaResuelto } from 'tema';

import { aHtml, etiquetaCon, hojaDe } from './ayudas';

const nodo = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'service', title: id.toUpperCase(), description: '', children: [], ...extra });

/** `real -> plan` (planned by its end), `real -> other`; `plan` is planned; `t#coupon` a planned Attribute. */
const FUENTE = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'service' }] },
  model: {
    nodes: [
      nodo('real'),
      nodo('plan', { planned: true }),
      nodo('other'),
      nodo('t', { attributes: [{ name: 'id', type: 'uuid', keys: ['pk'] }, { name: 'coupon', type: 'text', keys: ['fk'], planned: true }] }),
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

async function dibujar(id: string, extra: Partial<DiagramProps> = {}): Promise<string> {
  const view = resolveView(FUENTE, id) as VistaResuelta;
  const theme = (extra.theme as TemaResuelto | undefined) ?? TEMA_NEUTRO;
  return aHtml({ view, geometry: await layoutView(view, theme), theme, width: 800, height: 600, ...extra });
}

const caja = (html: string, id: string): string | undefined => etiquetaCon(html, `class="rd-caja" data-id="${id}"`);
const parte = (html: string, id: string): string | undefined => etiquetaCon(html.slice(html.indexOf(`data-id="${id}"`)), 'data-part="nodo"');

describe('planned elements on the canvas', () => {
  it('the default Theme draws a planned Node faded with a dashed contour, a real one untouched', async () => {
    const html = await dibujar('arch');
    const hoja = hojaDe(html);

    expect(caja(html, 'plan')).toContain('data-planeado=""');
    expect(caja(html, 'real')).not.toContain('data-planeado');
    expect(parte(html, 'plan')).toMatch(/data-estados="planned"/);
    expect(html).toMatch(/<div class="rd-estado" data-state="planned"/);
    expect(hoja).toMatch(/\[data-planeado\]\{opacity:0\.\d+\}/);
    expect(hoja).toMatch(/\.rd-estado\[data-state="planned"\]\{[^}]*dashed/);
  });

  it('never changes Metrics: the planned Node keeps the size it would have if real', async () => {
    const view = resolveView(FUENTE, 'arch') as VistaDeGrafo;
    const real = await layoutView({ ...view, nodes: view.nodes.map(({ planned: _p, ...n }) => n) }, TEMA_NEUTRO);
    const planeada = await layoutView(view, TEMA_NEUTRO);
    expect(planeada).toEqual(real);
  });

  it('an Edge touching a planned Node is drawn planned with a dashed line', async () => {
    const html = await dibujar('arch');
    const view = resolveView(FUENTE, 'arch') as VistaDeGrafo;
    const [haciaPlan, haciaOtro] = view.edges.map((arista) => idDeArista(arista).replaceAll('>', '&gt;'));

    expect(etiquetaCon(html, `data-edge="${haciaPlan}"`)).toContain('data-planeado=""');
    expect(etiquetaCon(html, `data-edge="${haciaOtro}"`)).not.toContain('data-planeado');
    expect(hojaDe(html)).toMatch(/\[data-planeado\] > path\[data-capa\]\{stroke-dasharray:/);
  });

  it('a Message to a planned Lifeline is drawn planned (sequence)', async () => {
    const html = await dibujar('seq');
    const view = resolveView(FUENTE, 'seq') as VistaDeSecuencia;
    const [aOtro, aPlan] = view.interaction.messages.map((m) => idDeElementoDeSecuencia('flow', m.ruta));

    expect(etiquetaCon(html, `data-message="${aPlan}"`)).toContain('data-planeado=""');
    expect(etiquetaCon(html, `data-message="${aOtro}"`)).not.toContain('data-planeado');
    expect(etiquetaCon(html, 'data-lifeline="plan"')).toContain('data-planeado=""');
    expect(caja(html, 'plan')).toContain('data-planeado=""');
  });

  it('a planned Attribute shows a PLAN chip after its key chips (er)', async () => {
    const html = await dibujar('data');
    const fila = html.slice(html.indexOf('data-attribute="t#coupon"'));
    const chips = [...fila.slice(0, fila.indexOf('data-attribute', 10) === -1 ? undefined : fila.indexOf('data-attribute', 10)).matchAll(/data-key="([a-z]+)"[^>]*>([A-Z]+)</g)].map((m) => [m[1], m[2]]);
    expect(chips).toEqual([
      ['fk', 'FK'],
      ['planned', 'PLAN'],
    ]);
    const id = html.slice(html.indexOf('data-attribute="t#id"'), html.indexOf('data-attribute="t#coupon"'));
    expect(id).not.toContain('data-key="planned"');
  });

  it('a Theme with its own planned patch restyles the state instead of the default look', async () => {
    const propio: TemaResuelto = {
      ...TEMA_NEUTRO,
      name: 'own',
      nodo: {
        ...TEMA_NEUTRO.nodo,
        capas: [{ nombre: 'borde', primitiva: { tipo: 'border', props: { color: 'gray', width: 1 } } }],
        estados: { planned: [{ nombre: 'borde', props: { color: 'red' } }] },
      },
    };
    const html = await dibujar('arch', { theme: propio });

    expect(caja(html, 'plan')).not.toContain('data-planeado');
    expect(html).not.toMatch(/<div class="rd-estado" data-state="planned"/);
    expect(parte(html, 'plan')).toMatch(/data-estados="planned"/);
    expect(hojaDe(html)).toMatch(/\[data-estados~="planned"\]\{[^}]*#dc2626/);
  });
});

describe('a Theme restyles planned Edges and Messages (paint-only)', () => {
  const linea = (nombre: string, props: Record<string, string | number>) => ({ nombre, primitiva: { tipo: 'line', props: { width: 1, style: 'solid', corner: 'sharp', cut: 6, ...props } } });
  const conPlanned: TemaResuelto = {
    ...TEMA_NEUTRO,
    name: 'own-lines',
    arista: { ...TEMA_NEUTRO.arista, capas: [linea('line', { color: 'gray' })], estados: { planned: [{ nombre: 'line', props: { color: 'red', style: 'dotted' } }] } },
  };

  it('a planned Edge takes the Theme stack of its planned patch, without the default dashed look', async () => {
    const html = await dibujar('arch', { theme: conPlanned });
    const view = resolveView(FUENTE, 'arch') as VistaDeGrafo;
    const [haciaPlan, haciaOtro] = view.edges.map((arista) => idDeArista(arista).replaceAll('>', '&gt;'));
    const trazo = (id: string): string => html.slice(html.indexOf(`data-edge="${id}"`), html.indexOf('</g>', html.indexOf(`data-edge="${id}"`)));

    expect(etiquetaCon(html, `data-edge="${haciaPlan}"`)).not.toContain('data-planeado');
    expect(trazo(haciaPlan)).toContain('stroke="#dc2626"');
    expect(trazo(haciaPlan)).toContain('stroke-linecap="round"');
    expect(trazo(haciaOtro)).not.toContain('stroke="#dc2626"');
  });

  it('without a message block, a planned Message takes the Edge planned patch (sequence)', async () => {
    const html = await dibujar('seq', { theme: conPlanned });
    const view = resolveView(FUENTE, 'seq') as VistaDeSecuencia;
    const [aOtro, aPlan] = view.interaction.messages.map((m) => idDeElementoDeSecuencia('flow', m.ruta));
    const trazo = (id: string): string => html.slice(html.indexOf(`data-message="${id}"`), html.indexOf('</g>', html.indexOf(`data-message="${id}"`)));

    expect(etiquetaCon(html, `data-message="${aPlan}"`)).not.toContain('data-planeado');
    expect(trazo(aPlan)).toContain('stroke="#dc2626"');
    expect(trazo(aOtro)).not.toContain('stroke="#dc2626"');
  });

  it('never changes the layout: Metrics are the same with or without the patch', async () => {
    const view = resolveView(FUENTE, 'arch') as VistaDeGrafo;
    expect(await layoutView(view, conPlanned)).toEqual(await layoutView(view, { ...conPlanned, arista: { ...conPlanned.arista, estados: {} } }));
  });
});
