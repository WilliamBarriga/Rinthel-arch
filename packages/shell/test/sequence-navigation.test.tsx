import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveView } from 'canonical';
import { layoutView } from 'layout';
import type { SequenceGeometry } from 'canonical';
import { openSession } from 'session';
import { InteractiveView } from 'shell';
import type { LayoutAdapter } from 'shell';
import { NEUTRAL_THEME } from 'theme';
import { cameraOf, pressAt } from './helpers';

afterEach(cleanup);

const layout: LayoutAdapter = (view, theme, measures) => layoutView(view, theme, { ...(measures !== undefined && { measures }) });
const sourceOf = (text: string) => openSession({ 'main.dg': text }).source!;
const geometryOf = async (text: string, view: string): Promise<SequenceGeometry> => (await layoutView(resolveView(sourceOf(text), view)!, NEUTRAL_THEME)) as SequenceGeometry;
const current = (c: HTMLElement) => c.querySelector('[data-vista]')!.getAttribute('data-vista');
const breadcrumbs = (c: HTMLElement) => [...c.querySelectorAll('[data-breadcrumbs] [data-crumb]')].map((e) => e.getAttribute('data-crumb'));

async function mount(text: string, view: string, waitForLayout: string) {
  const r = render(<InteractiveView source={sourceOf(text)} defaultView={view} theme={NEUTRAL_THEME} layout={layout} width={1200} height={900} />);
  await waitFor(() => expect(r.container.querySelector(waitForLayout)).not.toBeNull(), { timeout: 15000 });
  return r;
}

const base = `specification { node servicio }
model {
  servicio a "A"
  servicio b "B"
  interaction login { a -> b "credenciales" }
  interaction compra {
    a -> b "pedir"
    ref login
  }
  interaction ciclo {
    a -> b "uno"
    ref ciclo
  }
}
`;

/** Presses the tab of the View's first `ref` (outside the line of the Lifelines). */
async function pressRef(c: HTMLElement, text: string, view: string) {
  const g = await geometryOf(text, view);
  const frame = g.fragments.find((m) => m.operator === 'ref')!;
  const y = frame.y + frame.tab.height / 2;
  let x = frame.x + 1;
  while (Object.values(g.lifelines).some((l) => Math.abs(l.x - x) <= 12)) x++;
  pressAt(c, x, y);
}

describe('Sequence: navigation through ref', () => {
  it('a ref with a target navigates to the View that projects the Interaction and adds a breadcrumb', { timeout: 20000 }, async () => {
    const text = `${base}view compra { type sequence\n interaction compra }\nview login { type sequence\n interaction login }\n`;
    const { container } = await mount(text, 'compra', '[data-fragment]');
    await pressRef(container, text, 'compra');
    await waitFor(() => expect(current(container)).toBe('login'), { timeout: 15000 });
    expect(breadcrumbs(container)).toEqual(['compra', 'login']);
  });

  it('a ref without a target View does nothing', { timeout: 20000 }, async () => {
    const text = `${base}view compra { type sequence\n interaction compra }\n`;
    const { container } = await mount(text, 'compra', '[data-fragment]');
    await pressRef(container, text, 'compra');
    expect(current(container)).toBe('compra');
    expect(breadcrumbs(container)).toEqual(['compra']);
  });

  it('a ref to the Interaction of the current View (cycle) does nothing', { timeout: 20000 }, async () => {
    const text = `${base}view ciclo { type sequence\n interaction ciclo }\n`;
    const { container } = await mount(text, 'ciclo', '[data-fragment]');
    await pressRef(container, text, 'ciclo');
    expect(current(container)).toBe('ciclo');
    expect(breadcrumbs(container)).toEqual(['ciclo']);
  });
});

const groups = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio sistema "Sistema" {
    servicio api "API"
    servicio db "DB"
  }
  servicio cola "Cola"
  interaction i {
    m1: cliente -> sistema.api "pedir con una etiqueta muy larga que fuerza el hueco entre columnas"
    m2: sistema -> cola "notificar"
    m3: sistema.db -> cola "evento"
  }
}
view otra { type architecture
 include ** }
view enlazada { type sequence
 interaction i
 depth 1
 link sistema -> otra }
view cerrada { type sequence
 interaction i
 depth 1
 steps { step "uno" { upto m1 }
 step "dos" { upto m2 }
 step "tres" { upto m3 } } }
`;
const centerOf = (c: { x: number; y: number; width: number; height: number }) => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
const cameraX = (c: HTMLElement) => Number(cameraOf(c)!.split(' ')[0]);
const xOf = (el: HTMLElement) => {
  const t = /translate\(([-\d.]+)px/.exec(el.style.transform);
  return t === null ? Number.parseFloat(el.style.left) : Number(t[1]);
};

describe('Sequence: link from a Lifeline', () => {
  it('pressing the header of a Group Lifeline with link navigates and does not expand', { timeout: 20000 }, async () => {
    const { container } = await mount(groups, 'enlazada', '[data-lifeline="sistema"]');
    expect(container.querySelector('[data-toggle="sistema"]')).toBeNull();
    const g = await geometryOf(groups, 'enlazada');
    const p = centerOf(g.nodes['sistema']!);
    pressAt(container, p.x, p.y);
    await waitFor(() => expect(current(container)).toBe('otra'), { timeout: 15000 });
    expect(breadcrumbs(container)).toEqual(['enlazada', 'otra']);
  });

  it('Enter with focus on a Lifeline with link navigates', { timeout: 20000 }, async () => {
    const text = groups.replace('    m1:', '    m0: sistema -> cliente "hola"\n    m1:');
    const { container } = await mount(text, 'enlazada', '[data-lifeline="sistema"]');
    const zone = container.querySelector<HTMLElement>('.rd-vista')!;
    fireEvent.focus(zone);
    // Tab walks the Lifelines in column order: the first is the Group's.
    fireEvent.keyDown(zone, { key: 'Enter' });
    await waitFor(() => expect(current(container)).toBe('otra'), { timeout: 15000 });
  });
});

describe('Sequence: expanding a Group Lifeline', () => {
  it('keeps the Step and leaves the left border of the Group at the same screen position', { timeout: 30000 }, async () => {
    const r = render(<InteractiveView source={sourceOf(groups)} defaultView="cerrada" theme={NEUTRAL_THEME} layout={layout} width={1200} height={900} morphMs={0} />);
    const { container } = r;
    await waitFor(() => expect(container.querySelector('[data-toggle="sistema"]')).not.toBeNull(), { timeout: 15000 });
    fireEvent.click(container.querySelector('[data-pasos] [aria-label="Next step"]')!);
    fireEvent.click(container.querySelector('[data-pasos] [aria-label="Next step"]')!);
    fireEvent.click(container.querySelector('[data-pasos] [aria-label="Next step"]')!);
    expect(container.querySelector('[data-pasos]')!.textContent).toContain('Step 3 of 3');
    const before = xOf(container.querySelector<HTMLElement>('[data-id="sistema"]')!) - cameraX(container);

    fireEvent.click(container.querySelector('[data-toggle="sistema"]')!);
    await waitFor(() => expect(container.querySelector('[data-group-box="sistema"]')).not.toBeNull(), { timeout: 15000 });
    expect(container.querySelector('[data-pasos]')!.textContent).toContain('Step 3 of 3');
    const box = container.querySelector<HTMLElement>('[data-group-box="sistema"]')!;
    const after = xOf(box) - cameraX(container);
    expect(after).toBeCloseTo(before, 3);
  });

  it('Enter with focus on the Group Lifeline expands it', { timeout: 30000 }, async () => {
    const text = groups.replace('    m1:', '    m0: sistema -> cliente "hola"\n    m1:');
    const { container } = await mount(`${text}view sinpasos { type sequence\n interaction i\n depth 1 }\n`, 'sinpasos', '[data-toggle="sistema"]');
    const zone = container.querySelector<HTMLElement>('.rd-vista')!;
    fireEvent.focus(zone);
    fireEvent.keyDown(zone, { key: 'Enter' });
    await waitFor(() => expect(container.querySelector('[data-group-box="sistema"]')).not.toBeNull(), { timeout: 15000 });
  });

  it('the morph moves the headers between the old and the new position', { timeout: 30000 }, async () => {
    const frames: Array<(nowMs: number) => void> = [];
    const clock = (frame: (nowMs: number) => void) => {
      frames.push(frame);
      return () => {};
    };
    const { container } = render(<InteractiveView source={sourceOf(groups)} defaultView="cerrada" theme={NEUTRAL_THEME} layout={layout} width={3000} height={900} morphMs={100} clock={clock} />);
    await waitFor(() => expect(container.querySelector('[data-toggle="sistema"]')).not.toBeNull(), { timeout: 15000 });
    const x = (id: string) => xOf(container.querySelector<HTMLElement>(`[data-id="${id}"]`)!);
    const before = x('cola');
    fireEvent.click(container.querySelector('[data-toggle="sistema"]')!);
    await waitFor(() => expect(frames.length).toBeGreaterThan(0), { timeout: 15000 });
    const next = async (ms: number) => act(async () => frames.shift()!(ms));
    await next(1000);
    await next(1050);
    const middle = x('cola');
    await next(1200);
    await waitFor(() => expect(container.querySelector('[data-layout]')!.getAttribute('data-layout')).toBe('listo'));
    const after = x('cola');
    expect(after).not.toBe(before);
    expect(Math.min(before, after)).toBeLessThan(middle);
    expect(middle).toBeLessThan(Math.max(before, after));
  });
});
