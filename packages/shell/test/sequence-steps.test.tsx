import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { openSession } from 'session';
import { InteractiveView } from 'shell';
import type { LayoutAdapter } from 'shell';
import { NEUTRAL_THEME } from 'theme';

afterEach(cleanup);

const body = (view: string) => `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  servicio db "DB"
  servicio nuevo "Nuevo"
  interaction i {
    pedir: cliente -> api "pedir"
    note right of api "ojo"
    alt "ok" {
      guardar: api -> db "guardar"
      reply db -> api "listo"
    } else "fallo" {
      api -> db "error"
    }
    crear: create api -> nuevo "crear"
    reply api -> cliente "fin"
  }
}
${view}
`;
const layout: LayoutAdapter = (view, theme, measures) => layoutView(view, theme, { ...(measures !== undefined && { measures }) });

const mount = (view: string, step: number) => {
  const source = openSession({ 'main.dg': body(view) }).source!;
  return render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={layout} step={step} width={1200} height={900} />);
};
const opacity = (el: Element | null): number => {
  if (el === null) throw new Error('elemento ausente');
  const v = el.getAttribute('opacity') ?? (el as HTMLElement).style?.opacity ?? '';
  return v === '' ? 1 : Number(v);
};
const waitForLayout = (c: HTMLElement) => waitFor(() => expect(c.querySelector('[data-fragment]')).not.toBeNull(), { timeout: 15000 });
const view = 'view v { type sequence\n interaction i\n steps { step "uno" { upto pedir }\n step "dos" { upto guardar }\n step "tres" { upto crear } } }';

describe('InteractiveView: sequence Steps', () => {
  it('Step 2 (upto guardar): clipped activation, guard of the second operand hidden and born Lifeline hidden', async () => {
    const { container: c } = mount(view, 2);
    await waitForLayout(c);
    // The Geometry is the full one: the Message 'fin' exists but is not seen.
    expect(opacity(c.querySelector('[data-message="i:2.0.0"]'))).toBe(1);
    expect(opacity(c.querySelector('[data-message="i:4"]'))).toBe(0);
    expect(opacity(c.querySelector('[data-fragment-guard="2:0"]'))).toBe(1);
    expect(opacity(c.querySelector('[data-fragment-guard="2:1"]'))).toBe(0);
    expect(opacity(c.querySelector('[data-fragment-operator="2"]'))).toBe(1);
    expect(opacity(c.querySelector('[data-lifeline="nuevo"]'))).toBe(0);
    expect(opacity(c.querySelector('[data-lifeline="db"]'))).toBe(1);
    // The activation of api (from 'pedir' to 'fin') is clipped at the arrow of 'guardar'.
    const activation = c.querySelector<HTMLElement>('[data-activation="api"]')!;
    const complete = mount(view, 3);
    await waitForLayout(complete.container);
    const finalValue = complete.container.querySelector<HTMLElement>('[data-activation="api"]')!;
    expect(Number.parseFloat(activation.style.height)).toBeLessThan(Number.parseFloat(finalValue.style.height));
    expect(opacity(c.querySelector('[data-note="i:1"]'))).toBe(1);
  });

  it('Step 3 (upto crear): the born Lifeline appears and the geometry does not change', async () => {
    const { container: c } = mount(view, 3);
    await waitForLayout(c);
    expect(opacity(c.querySelector('[data-lifeline="nuevo"]'))).toBe(1);
    expect(opacity(c.querySelector('[data-fragment-guard="2:1"]'))).toBe(1);
    expect(opacity(c.querySelector('[data-message="i:4"]'))).toBe(0);
  });

  it('without a controlled Step, the View enters its first Step (ADR 0009), not empty', async () => {
    const source = openSession({ 'main.dg': body(view) }).source!;
    const { container: c } = render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={layout} width={1200} height={900} />);
    await waitForLayout(c);
    expect(opacity(c.querySelector('[data-message="i:0"]'))).toBe(1);
    expect(opacity(c.querySelector('[data-message="i:2.0.0"]'))).toBe(0);
    expect(c.querySelector('[data-pasos]')?.textContent).toContain('Step 1 of 3');
  });
});
