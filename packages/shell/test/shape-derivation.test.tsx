import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { openSession } from 'session';
import { InteractiveView } from 'shell';

afterEach(cleanup);

const PALETTE = `palette { papel "#fefce8"  tinta "#1f2937"  azul "#2563eb"  rosa "#ec4899"  cian "#22d3ee" }`;
const theme = (shape: string, node = ''): string =>
  `theme t {\n  ${PALETTE}\n  node {\n    layer forma ${shape}\n    layer relleno gradient { from rosa  to cian  angle 90 }\n    layer borde border { color tinta width 1 }\n    slots { title attrs }\n${node}\n  }\n  edge { layer trazo line { color tinta width 1 } }\n}\n`;

const ER = `specification { node tabla }
model {
  tabla orders "Pedidos" {
    id: uuid pk
    email: text? uk
  }
  tabla customers "Clientes" { id: uuid pk }
  orders#id "1..*" -> "1" customers#id "pertenece"
}
view tablas { type er  include **  theme t }
`;
const SEQ = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  interaction i {
    cliente -> api "pedir"
    alt "ok" { api -> cliente "respuesta" } else "error" { api -> cliente "fallo" }
  }
}
view v { type sequence  interaction i  theme t }
`;

const mount = async (dsl: string, view: string, waitForLayout: string) => {
  const session = openSession({ "main.dg": dsl });
  if (session.source === undefined) throw new Error(JSON.stringify(await session.diagnose()).slice(0, 1500));
  const source = session.source;
  const result = render(
    <InteractiveView source={source} view={view} theme={source.themes.find((t) => t.name === 't')!} layout={(v, t, measures) => layoutView(v, t, { measures })} width={900} height={600} />,
  );
  await waitFor(() => expect(result.container.querySelector(waitForLayout)).not.toBeNull(), { timeout: 8000 });
  return result;
};
const radius = (el: Element): string => getComputedStyle(el).borderRadius;

describe('pill/circle shape derivation (ADR 0009)', () => {
  it('ER: the table of a pill Theme is drawn as a rect with a clamped radius', async () => {
    const { container } = await mount(ER + theme('pill'), 'tablas', '[data-id="orders"]');
    const box = container.querySelector('[data-id="orders"] .rd-nodo')!;
    expect(radius(box)).not.toBe('9999px');
    expect(Number.parseFloat(radius(box))).toBeLessThanOrEqual(12);
  });

  it('ER: circle also stops being a circle', async () => {
    const { container } = await mount(ER + theme('circle'), 'tablas', '[data-id="orders"]');
    expect(radius(container.querySelector('[data-id="orders"] .rd-nodo')!)).not.toBe('50%');
  });

  it('ER: the Theme can bring the pill back with node { diagram er { ... } }', async () => {
    const { container } = await mount(ER + theme('rect { radius 6 }', '    diagram er { layer forma pill }'), 'tablas', '[data-id="orders"]');
    expect(radius(container.querySelector('[data-id="orders"] .rd-nodo')!)).toBe('9999px');
  });

  it('sequence: the Fragment derived from a pill Theme is a rect with a clamped radius', async () => {
    const { container } = await mount(SEQ + theme('pill'), 'v', '[data-fragment]');
    const frame = container.querySelector('[data-fragment]') as HTMLElement;
    expect(frame.style.borderRadius).not.toBe('9999px');
    expect(Number.parseFloat(frame.style.borderRadius)).toBeLessThanOrEqual(12);
  });

  it('sequence: the fill derived for the Fragment does not hide the content (no opaque gradient)', async () => {
    const { container } = await mount(SEQ + theme('rect { radius 6 }'), 'v', '[data-fragment]');
    const frame = container.querySelector('[data-fragment]') as HTMLElement;
    expect(frame.getAttribute('style')).not.toMatch(/gradient/);
    expect(frame.getAttribute('style')).toMatch(/color-mix|rgba|transparent/);
  });

  it('sequence: the Fragments layer goes below Messages, activations and guards', async () => {
    const { container } = await mount(SEQ + theme('rect { radius 6 }'), 'v', '[data-fragment]');
    const layer = (n: string): Element => container.querySelector(`[data-capa="${n}"]`)!;
    const before = (a: Element, b: Element): boolean => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    for (const over of ['lifelines', 'activaciones', 'mensajes', 'guardas']) expect(before(layer('fragmentos'), layer(over))).toBe(true);
  });
});
