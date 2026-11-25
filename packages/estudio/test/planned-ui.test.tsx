// @vitest-environment jsdom
/** Planned elements (ADR 0011) on the Dev UI canvas: drawn with the `planned` state, which interaction states stack on. */
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { lienzoListo, montarEstudio, pulsarNodo } from './ayudas-de-ui';

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
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#view=map' });
    const lienzo = await lienzoListo(contenedor, 'map');
    const caja = (id: string): HTMLElement | null => lienzo.querySelector<HTMLElement>(`.rd-caja[data-id="${id}"]`);

    expect(caja('shop')?.hasAttribute('data-planeado')).toBe(true);
    expect(caja('shop.cart')?.hasAttribute('data-planeado')).toBe(true);
    expect(caja('api')?.hasAttribute('data-planeado')).toBe(false);
    expect(lienzo.querySelector('[data-edge="api -> shop.cart"]')?.hasAttribute('data-planeado')).toBe(true);
    expect(caja('shop.cart')?.querySelector('.rd-estado[data-state="planned"]')).not.toBeNull();
  });

  it('a selected planned Node keeps its planned state', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#view=map' });
    const lienzo = await lienzoListo(contenedor, 'map');

    pulsarNodo(contenedor, 'shop.cart');
    const parte = lienzo.querySelector<HTMLElement>('.rd-caja[data-id="shop.cart"] [data-part="nodo"]');
    expect(parte?.getAttribute('data-estados')?.split(' ')).toEqual(['planned', 'selected']);
  });
});
