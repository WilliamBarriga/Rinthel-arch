import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { openSession } from 'session';
import { InteractiveView } from 'shell';
import type { LayoutAdapter } from 'shell';
import { NEUTRAL_THEME, textKey } from 'theme';
import type { TextMeasures, TextToMeasure } from 'theme';

afterEach(cleanup);

const text = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  interaction login { cliente -> api "auth" }
  interaction i {
    cliente -> api "pedir"
    note over cliente, api "sesion abierta con el servidor de identidad"
    ref login
  }
}
view v { type sequence
 interaction i }
`;
const source = openSession({ 'main.dg': text }).source!;

describe('InteractiveView: sequence Notes and ref', () => {
  it('the Note looks like paper (folded corner, no header) and not like a participant; the ref paints its title', async () => {
    const requests: TextToMeasure[] = [];
    const measure = async (texts: TextToMeasure[]): Promise<TextMeasures> => {
      requests.push(...texts);
      return { nivel: 'medido', fuentes: {}, anchos: Object.fromEntries(texts.map((t) => [textKey(t.familia, t.tamano, t.texto, t.peso), t.texto.length * 8])) };
    };
    const layout: LayoutAdapter = (view, theme, measures) => layoutView(view, theme, { ...(measures !== undefined && { measures }) });
    const { container } = render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={layout} measure={measure} width={1200} height={800} />);
    await waitFor(() => expect(container.querySelector('[data-note]')).not.toBeNull(), { timeout: 8000 });

    expect(requests.map((t) => t.texto)).toEqual(expect.arrayContaining(['identidad', 'login']));
    const note = container.querySelector('[data-note="i:1"]')!;
    expect(note.querySelector('path[data-note-paper]')!.getAttribute('d')).toMatch(/L/);
    const lines = [...note.querySelectorAll('text')].map((t) => t.textContent);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('sesion abierta con el servidor de identidad');
    expect(container.querySelectorAll('[data-lifeline]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-node-id]').length).toBeLessThanOrEqual(2);
    expect(note.closest('[data-lifeline]')).toBeNull();
    expect(note.querySelector('[data-slot]')).toBeNull();
    expect(container.querySelector('[data-fragment="2"]')!.getAttribute('data-operator')).toBe('ref');
    expect(container.querySelector('[data-ref-title="2"]')!.textContent).toBe('login');
  });
});
