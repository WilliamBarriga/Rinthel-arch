// @vitest-environment jsdom
/** Planned elements (ADR 0011) on the Dev UI canvas: drawn with the `planned` state, which interaction states stack on. */
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { canvasReady, mountDevUi, pressNode } from './ui-helpers';

afterEach(cleanup);

const DSL = `specification {
  node service
}

model {
  service shop "Shop" planned {
    service cart "Cart"
  }
  service api "API"
  api -> shop.cart "adds"
}

view map {
  type architecture
  include **
}
`;

describe('planned elements in the Dev UI', () => {
  it('draws a planned Group, its descendants and the Edge touching them as planned, and real ones as usual', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=map' });
    const canvas = await canvasReady(container, 'map');
    const box = (id: string): HTMLElement | null => canvas.querySelector<HTMLElement>(`.rd-caja[data-id="${id}"]`);

    expect(box('shop')?.hasAttribute('data-planeado')).toBe(true);
    expect(box('shop.cart')?.hasAttribute('data-planeado')).toBe(true);
    expect(box('api')?.hasAttribute('data-planeado')).toBe(false);
    expect(canvas.querySelector('[data-edge="api -> shop.cart"]')?.hasAttribute('data-planeado')).toBe(true);
    expect(box('shop.cart')?.querySelector('.rd-estado[data-state="planned"]')).not.toBeNull();
  });

  it('a selected planned Node keeps its planned state', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=map' });
    const canvas = await canvasReady(container, 'map');

    pressNode(container, 'shop.cart');
    const part = canvas.querySelector<HTMLElement>('.rd-caja[data-id="shop.cart"] [data-part="nodo"]');
    expect(part?.getAttribute('data-estados')?.split(' ')).toEqual(['planned', 'selected']);
  });
});
