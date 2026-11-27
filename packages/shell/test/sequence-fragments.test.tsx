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
  servicio db "DB"
  interaction i {
    cliente -> api "pedir"
    critical "reintentar hasta tres veces" {
      api -> db "consultar"
    }
    cliente -> api "fin"
  }
}
view v { type sequence
 interaction i }
`;
const source = openSession({ 'main.dg': text }).source!;

describe('InteractiveView: sequence Fragments', () => {
  it('measures the tab and the guard (they are not clipped) and paints the guard above the activation', async () => {
    const requests: TextToMeasure[] = [];
    // Each character measures 20 px: well above the estimate, so a clip would show.
    const measure = async (texts: TextToMeasure[]): Promise<TextMeasures> => {
      requests.push(...texts);
      return { nivel: 'medido', fuentes: {}, anchos: Object.fromEntries(texts.map((t) => [textKey(t.familia, t.tamano, t.texto, t.peso), t.texto.length * 20])) };
    };
    const layout: LayoutAdapter = (view, theme, measures) => layoutView(view, theme, { ...(measures !== undefined && { measures }) });
    const { container } = render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={layout} measure={measure} width={1200} height={800} />);
    await waitFor(() => expect(container.querySelector('[data-fragment]')).not.toBeNull(), { timeout: 8000 });

    expect(requests.map((t) => t.texto)).toEqual(expect.arrayContaining(['critical', '[reintentar hasta tres veces]']));
    const tabSize = container.querySelector<HTMLElement>('[data-fragment-tab="1"]')!;
    expect(Number.parseFloat(tabSize.style.width)).toBeGreaterThanOrEqual('critical'.length * 20);
    const frame = container.querySelector<HTMLElement>('[data-fragment="1"]')!;
    expect(Number.parseFloat(frame.style.width)).toBeGreaterThanOrEqual('[reintentar hasta tres veces]'.length * 20);
    expect(frame.getAttribute('data-operator')).toBe('critical');

    const guard = container.querySelector('[data-fragment-guard="1:0"]')!;
    expect(guard.textContent).toBe('[reintentar hasta tres veces]');
    const activation = container.querySelector('[data-activation="db"]')!;
    expect(activation.compareDocumentPosition(guard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const edgeStroke = container.querySelector('[data-message="i:0"] path')!.getAttribute('stroke');
    expect(guard.getAttribute('fill')).toBe(edgeStroke);
  });
});
