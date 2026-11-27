import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { openSession } from 'session';
import { InteractiveView } from 'shell';
import type { LayoutAdapter } from 'shell';
import { pressNode } from './helpers';
import { NEUTRAL_THEME } from 'theme';

afterEach(cleanup);

const text = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  servicio db "DB"
  interaction checkout {
    cliente -> api "pedir"
    api -> db "consultar"
    async api -> db "evento"
    reply db -> api "filas"
    reply api -> cliente "listo"
  }
}
view v { type sequence
 interaction checkout }
`;

const source = openSession({ 'main.dg': text }).source!;
const layout: LayoutAdapter = (view, theme) => layoutView(view, theme);

describe('InteractiveView with a sequence View', () => {
  it('draws the Lifelines, the Messages and the activations, and tells reply from sync by the stroke', async () => {
    const { container } = render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={layout} width={800} height={600} />);
    await waitFor(() => expect(container.querySelector('[data-message]')).not.toBeNull());

    expect([...container.querySelectorAll('.rd-nodos [data-id]')].map((e) => e.getAttribute('data-id'))).toEqual(['cliente', 'api', 'db']);
    expect([...container.querySelectorAll('[data-lifeline]')].map((e) => e.getAttribute('data-lifeline'))).toEqual(['cliente', 'api', 'db']);
    const messages = [...container.querySelectorAll('[data-message]')];
    expect(messages.map((m) => [m.getAttribute('data-message'), m.getAttribute('data-kind')])).toEqual([
      ['checkout:0', 'sync'],
      ['checkout:1', 'sync'],
      ['checkout:2', 'async'],
      ['checkout:3', 'reply'],
      ['checkout:4', 'reply'],
    ]);
    expect([...container.querySelectorAll('[data-activation]')].map((e) => e.getAttribute('data-activation'))).toEqual(['api', 'db']);
    // reply differs from sync by the stroke (dashed against solid in the neutral Theme).
    const stroke = (id: string) => container.querySelector(`[data-message="${id}"] path`)!.getAttribute('stroke-dasharray');
    expect(stroke('checkout:0')).toBeNull();
    expect(stroke('checkout:3')).not.toBeNull();
    expect([...container.querySelectorAll('[data-edge-label]')].map((e) => e.textContent)).toContain('consultar');
  });

  it('clicks on a Lifeline and selects it', async () => {
    const selection: string[][] = [];
    const { container } = render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={layout} width={800} height={600} onSelectionChange={(ids) => selection.push(ids)} />);
    await waitFor(() => expect(container.querySelector('[data-message]')).not.toBeNull());
    pressNode(container, 'api');
    expect(selection.at(-1)).toEqual(['api']);
  });
});

describe('InteractiveView with create and destroy', () => {
  const cycle = `specification { node servicio }
model {
  servicio cliente
  servicio db
  interaction ciclo {
    create cliente -> db "abrir"
    destroy cliente -> db "cerrar"
  }
}
view v { type sequence
 interaction ciclo }
`;

  it('draws the cross marker at the end of the destroyed Lifeline and none on the others', async () => {
    const source = openSession({ 'main.dg': cycle }).source!;
    const { container } = render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={layout} width={800} height={600} />);
    await waitFor(() => expect(container.querySelector('[data-message]')).not.toBeNull());

    expect([...container.querySelectorAll('[data-message]')].map((m) => m.getAttribute('data-kind'))).toEqual(['create', 'destroy']);
    const cross = container.querySelectorAll('[data-lifeline="db"] [data-marker="fin"]');
    expect(cross).toHaveLength(1);
    expect(cross[0]!.querySelectorAll('path')).toHaveLength(1);
    expect(cross[0]!.querySelector('path')!.getAttribute('d')).toMatch(/^M .* L .* M .* L /);
    expect(container.querySelectorAll('[data-lifeline="cliente"] [data-marker]')).toHaveLength(0);
  });
});
