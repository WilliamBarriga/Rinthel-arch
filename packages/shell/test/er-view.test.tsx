import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { edgeId } from 'canonical';
import { layoutView } from 'layout';
import { openSession } from 'session';
import { InteractiveView } from 'shell';
import { NEUTRAL_THEME } from 'theme';

afterEach(cleanup);

const ER = `specification { node tabla }
model {
  tabla orders "Pedidos" {
    id: uuid pk
    customer_id: uuid pk fk
    email: text? uk
  }
  tabla customers "Clientes" {
    id: uuid pk
    name: text
  }
  tabla items {
    order_id: uuid fk
  }
  orders#customer_id "1..*" -> "1" customers#id "pertenece" identifying
  items#order_id "0..1" -> "0..*" orders#id
}
view tablas { type er  include ** }
view arq { type architecture  include ** }
`;

const mount = async (view: string) => {
  const source = openSession({ 'main.dg': ER }).source!;
  const result = render(<InteractiveView source={source} view={view} theme={NEUTRAL_THEME} layout={(resolvedView, theme, measures) => layoutView(resolvedView, theme, { measures })} width={900} height={600} />);
  await waitFor(() => expect(result.container.querySelector('.rd-vista[data-layout="listo"] [data-id="orders"]')).not.toBeNull());
  return { ...result, source };
};

const idOf = (source: { model: { edges: Parameters<typeof edgeId>[0][] } }, i: number) => edgeId(source.model.edges[i]!);

describe('ER View in jsdom', () => {
  it('each table shows its header and one row per Attribute with a chip per key mark', async () => {
    const { container } = await mount('tablas');

    const row = container.querySelector('[data-attribute="orders#customer_id"]')!;
    expect(row.textContent).toContain('customer_id: uuid');
    expect([...row.querySelectorAll('[data-key]')].map((chip) => [chip.getAttribute('data-key'), chip.textContent])).toEqual([['pk', 'PK'], ['fk', 'FK']]);
    expect(container.querySelector('[data-attribute="orders#email"]')!.textContent).toContain('email: text?');
    expect(container.querySelector('[data-attribute="customers#name"]')!.querySelector('[data-key]')).toBeNull();
    expect(container.querySelectorAll('[data-id="orders"] [data-attribute]')).toHaveLength(3);
  });

  it('FKs carry the marker of their cardinality at each end and no arrow', async () => {
    const { container, source } = await mount('tablas');

    const shapes = (id: string) => [...container.querySelectorAll(`[data-edge="${id}"] [data-marker]`)].map((g) => [g.getAttribute('data-marker'), g.getAttribute('data-shape')]);
    expect(shapes(idOf(source, 0))).toEqual([['origen', 'many'], ['fin', 'one']]);
    expect(shapes(idOf(source, 1))).toEqual([['origen', 'zero-one'], ['fin', 'zero-many']]);
  });

  it('the identifying one is solid and the non-identifying one dashed', async () => {
    const { container, source } = await mount('tablas');

    const stroke = (id: string) => container.querySelector(`[data-edge="${id}"] path[data-capa]`)!;
    expect(stroke(idOf(source, 0)).getAttribute('stroke-dasharray')).toBeNull();
    expect(stroke(idOf(source, 1)).getAttribute('stroke-dasharray')).not.toBeNull();
  });

  it('an architecture View draws no chips nor changes the Edge style', async () => {
    const { container, source } = await mount('arq');

    expect(container.querySelector('[data-key]')).toBeNull();
    expect(container.querySelector('[data-attribute="orders#email"]')!.textContent).toBe('email: text');
    expect([...container.querySelectorAll(`[data-edge="${idOf(source, 1)}"] [data-marker]`)].map((g) => g.getAttribute('data-shape'))).not.toContain('zero-many');
  });
});
