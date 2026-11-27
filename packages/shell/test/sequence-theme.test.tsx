import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { openSession } from 'session';
import { InteractiveView } from 'shell';

afterEach(cleanup);

const MODEL = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  servicio cola "Cola"
  interaction i {
    cliente -> api "pedir"
    alt "ok" {
      async api -> cola "evento"
      note right of cola "listo"
    } else "falla" {
      reply api -> cliente "error"
    }
    destroy api -> cola
  }
}
view v { type sequence  interaction i  theme t }
`;
const PALETTE = `palette { papel "#fefce8"  tinta "#1f2937"  azul "#2563eb"  rojo "#dc2626"  verde "#16a34a"  ambar "#d97706" }`;
const BASE = `  node { layer forma rect  layer relleno solid { color papel }  layer borde border { color tinta }  slots { title } }
  edge { layer linea line { color tinta  width 1 }  end arrow { size 8 } }`;

const mount = async (blocks: string) => {
  const session = openSession({ 'main.dg': `${MODEL}theme t {\n  ${PALETTE}\n${BASE}\n${blocks}\n}\n` });
  expect((await session.diagnose()).filter((i) => i.severity === 'error')).toEqual([]);
  const source = session.source!;
  const result = render(
    <InteractiveView source={source} view="v" theme={source.themes.find((t) => t.name === 't')!} layout={(view, theme, measures) => layoutView(view, theme, { measures })} width={1000} height={700} />,
  );
  await waitFor(() => expect(result.container.querySelector('[data-message]')).not.toBeNull(), { timeout: 15000 });
  return result.container;
};
const strokeOf = (c: HTMLElement, message: string): string => c.querySelector(`[data-message="i:${message}"]`)!.innerHTML;

describe('sequence View: Themes with explicit elements', () => {
  it('message { kind async { ... } } changes only the stroke of async Messages', async () => {
    const c = await mount('  message {\n    layer linea line { color tinta  width 1 }\n    end arrow { size 8 }\n    kind async { layer linea { color rojo  width 3 } }\n  }');

    expect(strokeOf(c, '1.0.0')).toMatch(/#dc2626|rgb\(220, 38, 38\)/);
    expect(strokeOf(c, '0')).not.toMatch(/#dc2626|rgb\(220, 38, 38\)/);
  }, 20000);

  it('lifeline { end ... } changes the marker of the destroyed Lifeline and its stroke', async () => {
    const c = await mount('  lifeline {\n    layer linea line { color verde  width 2  style solid }\n    end arrow { size 14  color rojo }\n  }');

    const html = c.querySelector('[data-lifeline="cola"]')!.innerHTML;
    expect(html).toMatch(/#16a34a|rgb\(22, 163, 74\)/);
    expect(c.querySelector('[data-lifeline="api"]')!.innerHTML).toMatch(/#16a34a|rgb\(22, 163, 74\)/);
  }, 20000);

  it('activation, fragment and note take their stack from the Theme', async () => {
    const c = await mount(`  activation { layer forma rect  layer relleno solid { color azul }  width 14 }
  fragment {
    layer forma rect
    layer relleno solid { color verde/0.1 }
    layer borde border { color verde }
    operator { color ambar  weight 700 }
    guard { color rojo }
    divider { color rojo  width 2 }
    op alt { layer borde { color azul } }
  }
  note { layer relleno solid { color azul/0.3 }  layer borde border { color azul }  text { color rojo } }`);

    const activation = c.querySelector('[data-activation]') as HTMLElement;
    expect(activation.getAttribute('style')).toMatch(/#2563eb|rgb\(37, 99, 235\)/);
    expect(activation.style.width).toBe('14px');
    const frame = c.querySelector('[data-fragment="1"]') as HTMLElement;
    expect(frame.getAttribute('style')).toMatch(/#2563eb|rgb\(37, 99, 235\)/);
    expect(c.querySelector('[data-fragment-operator="1"]')!.getAttribute('fill')).toBe('#d97706');
    expect(c.querySelector('[data-fragment-guard="1:0"]')!.getAttribute('fill')).toBe('#dc2626');
    expect(c.querySelector('[data-fragment-divider="1:1"]')!.getAttribute('style')).toMatch(/2px/);
    const role = c.querySelector('[data-note] path[data-note-paper]')!;
    expect(role.getAttribute('stroke')).toBe('#2563eb');
    expect(c.querySelector('[data-note] text')!.getAttribute('fill')).toBe('#dc2626');
  }, 20000);

  it('without declared elements the edge and node derivation is kept', async () => {
    const c = await mount('');

    expect(c.querySelector('[data-note-paper]')!.getAttribute('stroke')).toBe('#9ca3af');
    expect(c.querySelector('[data-message="i:0"]')).not.toBeNull();
  }, 20000);
});
