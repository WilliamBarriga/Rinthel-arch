import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { openSession } from 'session';
import { InteractiveView } from 'shell';
import type { LayoutAdapter } from 'shell';
import { NEUTRAL_THEME } from 'theme';

afterEach(cleanup);

const text = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio sistema "Sistema" {
    servicio api "API"
    servicio db "DB"
  }
  servicio cola "Cola"
  interaction i {
    cliente -> sistema.api "pedir"
    sistema -> sistema "auditar"
    sistema.api -> sistema.db "consultar"
    sistema.db -> cola "evento"
  }
}
view abierta { type sequence
 interaction i }
view cerrada { type sequence
 interaction i
 depth 1 }
`;
const source = openSession({ 'main.dg': text }).source!;
const layout: LayoutAdapter = (view, theme, measures) => layoutView(view, theme, { ...(measures !== undefined && { measures }) });
const rect = (el: HTMLElement) => {
  // Headers are positioned with `transform: translate(x, y)`; the box, with left/top.
  const t = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform);
  const x = t === null ? Number.parseFloat(el.style.left) : Number.parseFloat(t[1]!);
  const y = t === null ? Number.parseFloat(el.style.top) : Number.parseFloat(t[2]!);
  return { x1: x, x2: x + Number.parseFloat(el.style.width), y1: y, y2: y + Number.parseFloat(el.style.height) };
};

describe('InteractiveView: Group box in sequence', () => {
  it('the box of the open Group wraps its children, and the Group\'s own Lifeline goes first inside', { timeout: 15000 }, async () => {
    const { container } = render(<InteractiveView source={source} view="abierta" theme={NEUTRAL_THEME} layout={layout} width={1200} height={800} />);
    await waitFor(() => expect(container.querySelector('[data-group-box="sistema"]')).not.toBeNull(), { timeout: 8000 });
    const box = rect(container.querySelector<HTMLElement>('[data-group-box="sistema"]')!);
    const header = (id: string) => rect(container.querySelector<HTMLElement>(`[data-id="${id}"]`)!);
    for (const id of ['sistema', 'sistema.api', 'sistema.db']) {
      const c = header(id);
      expect(c.x1).toBeGreaterThan(box.x1);
      expect(c.x2).toBeLessThan(box.x2);
      expect(c.y1).toBeGreaterThan(box.y1);
      expect(c.y2).toBeLessThan(box.y2);
    }
    expect(header('cliente').x2).toBeLessThan(box.x1);
    expect(header('cola').x1).toBeGreaterThan(box.x2);
    expect(header('sistema').x1).toBeLessThan(header('sistema.api').x1);
    expect(container.querySelector('[data-group-box="sistema"]')!.textContent).toContain('Sistema');
  });

  it('with the Group closed there is no box', { timeout: 15000 }, async () => {
    const { container } = render(<InteractiveView source={source} view="cerrada" theme={NEUTRAL_THEME} layout={layout} width={1200} height={800} />);
    await waitFor(() => expect(container.querySelector('[data-lifeline="sistema"]')).not.toBeNull(), { timeout: 8000 });
    expect(container.querySelector('[data-group-box]')).toBeNull();
  });
});
