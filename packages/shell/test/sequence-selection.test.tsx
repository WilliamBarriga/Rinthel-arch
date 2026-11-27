import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveView } from 'canonical';
import { layoutView } from 'layout';
import type { SequenceGeometry } from 'canonical';
import { openSession } from 'session';
import { InteractiveView, deserializeState } from 'shell';
import type { LayoutAdapter } from 'shell';
import { NEUTRAL_THEME } from 'theme';
import { pressAt } from './helpers';

afterEach(cleanup);

const model = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  servicio db "DB"
  interaction checkout {
    pedir: cliente -> api "pedir"
    alt "ok" {
      guardar: api -> db "guardar"
      reply db -> api "listo"
    } else "fallo" {
      api -> db "error"
    }
    note right of db "ojo"
    reply api -> cliente "fin"
  }
}
`;
const withoutSteps = `${model}view v { type sequence\n interaction checkout }\n`;
const withSteps = `${model}view v { type sequence\n interaction checkout\n steps { step "uno" { upto pedir }\n step "dos" { upto guardar } } }\n`;
const layout: LayoutAdapter = (view, theme, measures) => layoutView(view, theme, { ...(measures !== undefined && { measures }) });

const sourceOf = (text: string) => openSession({ 'main.dg': text }).source!;
const geometryOf = async (text: string): Promise<SequenceGeometry> => (await layoutView(resolveView(sourceOf(text), 'v')!, NEUTRAL_THEME)) as SequenceGeometry;
const middle = (c: { x: number; y: number; width: number; height: number }) => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });

/** Point of the tab that does not fall on the line of any Lifeline (the hit order prefers the Lifeline). */
const freeInTab = (g: SequenceGeometry, tab: { x: number; y: number; width: number; height: number }) => {
  for (let x = tab.x + 1; x < tab.x + tab.width; x++) {
    if (Object.values(g.lifelines).every((l) => Math.abs(l.x - x) > 12)) return { x, y: tab.y + tab.height / 2 };
  }
  throw new Error('the tab covers a whole Lifeline');
};

async function mount(text: string, extra: Record<string, unknown> = {}) {
  const ids: string[][] = [];
  const r = render(<InteractiveView source={sourceOf(text)} view="v" theme={NEUTRAL_THEME} layout={layout} width={1200} height={900} onSelectionChange={(s) => ids.push(s)} {...extra} />);
  await waitFor(() => expect(r.container.querySelector('[data-fragment]')).not.toBeNull(), { timeout: 15000 });
  return { ...r, ids, zone: r.container.querySelector<HTMLElement>('.rd-vista')! };
}
const lastOne = (ids: string[][]) => ids.at(-1);

describe('Sequence: hit', () => {
  it('Message by its arrow and by its label; id = Interaction:path', async () => {
    const g = await geometryOf(withoutSteps);
    const { container, ids } = await mount(withoutSteps);
    const arrow = g.messages['0']!.points;
    pressAt(container, (arrow[0]!.x + arrow[1]!.x) / 2, arrow[0]!.y);
    expect(lastOne(ids)).toEqual(['checkout:0']);
    const label = middle(g.messages['1.0.0']!.label!);
    pressAt(container, label.x, label.y);
    expect(lastOne(ids)).toEqual(['checkout:1.0.0']);
    expect(container.querySelector('[data-message="checkout:1.0.0"] [data-state="selected"]')).not.toBeNull();
  });

  it('Note; the activation falls on its Lifeline; the inside of a Fragment lets the click through', async () => {
    const g = await geometryOf(withoutSteps);
    const { container, ids } = await mount(withoutSteps);
    const note = g.notes[0]!;
    pressAt(container, ...Object.values(middle(note)) as [number, number]);
    expect(lastOne(ids)).toEqual(['checkout:2']);
    expect(container.querySelector('[data-note="checkout:2"]')!.getAttribute('data-estados')).toBe('selected');

    const activation = g.activations.find((a) => a.lifeline === 'api')!;
    pressAt(container, activation.x + activation.width / 2, activation.y1 + 2);
    expect(lastOne(ids)).toEqual(['api']);

    const frame = g.fragments[0]!;
    const before = ids.length;
    pressAt(container, frame.x + 6, frame.y + frame.height / 2);
    pressAt(container, frame.x + frame.width / 2, frame.y + frame.tab.height + 4);
    expect(ids.length).toBe(before);
    const line = g.lifelines['db']!;
    pressAt(container, line.x, frame.y + frame.height / 2);
    expect(lastOne(ids)).toEqual(['db']);
  });

  it('Fragment by its tab and by its border', async () => {
    const g = await geometryOf(withoutSteps);
    const { container, ids } = await mount(withoutSteps);
    const frame = g.fragments[0]!;
    const t = freeInTab(g, frame.tab);
    pressAt(container, t.x, t.y);
    expect(lastOne(ids)).toEqual(['checkout:1']);
    ids.length = 0;
    pressAt(container, frame.x + frame.width / 2, frame.y + frame.height);
    expect(lastOne(ids)).toEqual(['checkout:1']);
  });

  it('a hash with checkout:1.0.1 restores the selection of the Message', async () => {
    const source = sourceOf(withoutSteps);
    expect(deserializeState('#p=v&s=checkout:1.0.1', source).selected).toBe('checkout:1.0.1');
    expect(deserializeState('#p=v&s=otra:1.0.1', source).selected).toBeNull();
    const { container } = await mount(withoutSteps, { selected: 'checkout:1.0.1' });
    expect(container.querySelector('[data-message="checkout:1.0.1"] [data-state="selected"]')).not.toBeNull();
  });

  it('what the Step has not revealed is not selected', async () => {
    const g = await geometryOf(withSteps);
    const { container, ids } = await mount(withSteps, { step: 1 });
    const hiddenOne = g.messages['3']!.points;
    pressAt(container, (hiddenOne[0]!.x + hiddenOne[1]!.x) / 2, hiddenOne[0]!.y);
    const note = middle(g.notes[0]!);
    pressAt(container, note.x, note.y);
    const frame = freeInTab(g, g.fragments[0]!.tab);
    pressAt(container, frame.x, frame.y);
    expect(ids).toEqual([]);
    const visible = g.messages['0']!.points;
    pressAt(container, (visible[0]!.x + visible[1]!.x) / 2, visible[0]!.y);
    expect(lastOne(ids)).toEqual(['checkout:0']);
  });

  it('two selected Lifelines emit neither on-path nor dimmed', async () => {
    const { container } = await mount(withoutSteps, { selection: ['cliente', 'db'] });
    expect(container.querySelectorAll('[data-state="selected"]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-state="on-path"]')).toBeNull();
    expect(container.querySelector('[data-atenuado]')).toBeNull();
  });
});

describe('Sequence: keyboard', () => {
  // The header mirrored at the foot repeats each Lifeline's Node: each one is counted only once.
  const withFocus = (c: HTMLElement) => [...new Set([...c.querySelectorAll('[data-state="focus"]')].map((e) => e.closest('[data-id]')?.getAttribute('data-id') ?? e.closest('[data-message]')?.getAttribute('data-message')))];
  const keyName = (zone: HTMLElement, key: string, init: KeyboardEventInit = {}) => act(() => void fireEvent.keyDown(zone, { key, ...init }));

  it('Tab walks the Lifelines in column order and the side arrows jump to the neighbor', async () => {
    const { container, zone } = await mount(withoutSteps);
    fireEvent.focus(zone);
    expect(withFocus(container)).toEqual(['cliente']);
    keyName(zone, 'Tab');
    expect(withFocus(container)).toEqual(['api']);
    keyName(zone, 'ArrowRight');
    expect(withFocus(container)).toEqual(['db']);
    keyName(zone, 'ArrowRight');
    expect(withFocus(container)).toEqual(['db']);
    keyName(zone, 'ArrowLeft');
    expect(withFocus(container)).toEqual(['api']);
    keyName(zone, 'Tab', { shiftKey: true });
    expect(withFocus(container)).toEqual(['cliente']);
  });

  it('down and up walk the Messages in time order; those hidden by the Step are skipped', async () => {
    const { container, zone } = await mount(withoutSteps);
    fireEvent.focus(zone);
    keyName(zone, 'ArrowDown');
    expect(withFocus(container)).toEqual(['checkout:0']);
    keyName(zone, 'ArrowDown');
    keyName(zone, 'ArrowDown');
    expect(withFocus(container)).toEqual(['checkout:1.0.1']);
    keyName(zone, 'ArrowUp');
    expect(withFocus(container)).toEqual(['checkout:1.0.0']);
    cleanup();

    const step = await mount(withSteps, { step: 2 });
    fireEvent.focus(step.zone);
    keyName(step.zone, 'ArrowDown');
    keyName(step.zone, 'ArrowDown');
    keyName(step.zone, 'ArrowDown');
    expect(withFocus(step.container)).toEqual(['checkout:1.0.0']);
  });
});
