import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { openSession } from 'session';
import { InteractiveView } from 'shell';
import type { LayoutAdapter } from 'shell';

afterEach(cleanup);

const PALETTE = `palette { papel "#fefce8"  tinta "#1f2937"  azul "#2563eb"  verde "#16a34a"  rojo "#dc2626"  gris "#e5e7eb" }`;
const NODE = `  node {\n    layer forma rect { radius 6 }\n    layer relleno solid { color papel }\n    layer borde border { color tinta width 1 }\n    slots { title attrs }\n  }`;
const layout: LayoutAdapter = (view, theme, measures) => layoutView(view, theme, { ...(measures !== undefined && { measures }) });

const mount = async (text: string, view: string, waitForLayout: string, selected: string) => {
  const source = openSession({ 'main.dg': text }).source!;
  const r = render(
    <InteractiveView source={source} view={view} theme={source.themes.find((t) => t.name === 't')!} layout={layout} width={1200} height={900} selected={selected} />,
  );
  await waitFor(() => expect(r.container.querySelector(`.rd-vista[data-layout="listo"] ${waitForLayout}`)).not.toBeNull(), { timeout: 15000 });
  return r;
};

const SEQUENCE = (blocks: string): string => `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  interaction i {
    alt "ok" {
      pedir: cliente -> api "pedir"
    } else "fallo" {
      api -> cliente "error"
    }
    note right of api "ojo"
  }
}
view v { type sequence  interaction i  theme t }
theme t {
  ${PALETTE}
${NODE}
${blocks}
}
`;

describe('Theme states painted in sequence', () => {
  it('a selected Fragment paints the stack of its selected state', async () => {
    const { container } = await mount(SEQUENCE('  fragment { layer caja solid { color papel }  layer borde border { color tinta width 1 }  state selected { layer caja { color verde } } }'), 'v', '[data-fragment]', 'i:0');

    const frame = container.querySelector('[data-fragment="0"]')!;
    expect(frame.getAttribute('data-estados')).toBe('selected');
    expect(frame.getAttribute('style')).toMatch(/#16a34a|rgb\(22, 163, 74\)/);
  });

  it('a Fragment without that state is painted as at rest', async () => {
    const { container } = await mount(SEQUENCE('  fragment { layer caja solid { color papel }  layer borde border { color tinta width 1 }  state selected { layer caja { color verde } } }'), 'v', '[data-fragment]', 'i:1');

    expect(container.querySelector('[data-fragment="0"]')!.getAttribute('style')).not.toMatch(/#16a34a|rgb\(22, 163, 74\)/);
  });

  it('a selected Note paints the fill of its selected state', async () => {
    const { container } = await mount(SEQUENCE('  note { layer papel solid { color gris }  layer borde border { color tinta width 1 }  state selected { layer papel { color rojo } } }'), 'v', '[data-note]', 'i:1');

    const role = container.querySelector('[data-note="i:1"] [data-note-paper]')!;
    expect(role.getAttribute('fill')).toBe('#dc2626');
  });
});

const ER = (row: string): string => `specification { node tabla }
model {
  tabla orders "Pedidos" {
    id: uuid pk
    email: text? uk
  }
}
view tablas { type er  include **  theme t }
theme t {
  ${PALETTE}
${NODE}
  row {
${row}
  }
}
`;

describe('Theme states painted in ER', () => {
  it('a selected row paints the stack of row state selected; the others stay at rest', async () => {
    const { container, session } = await mountEr(ER('    layer fondo solid { color papel }\n    state selected { layer fondo { color verde } }\n    state hover { layer fondo { color azul } }'), 'orders#id');

    const row = (a: string) => container.querySelector(`[data-attribute="orders#${a}"]`)!.getAttribute('style');
    expect(row('id')).toMatch(/#16a34a|rgb\(22, 163, 74\)/);
    expect(row('email')).toMatch(/#fefce8|rgb\(254, 252, 232\)/);
    expect((await session.diagnose()).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('the size of row name changes the painted size of the name', async () => {
    const { container } = await mountEr(ER('    layer fondo solid { color papel }\n    name { size 1.5 }'), 'orders#id');

    const name = container.querySelector('[data-attribute="orders#id"] [data-fila-texto="name"]') as HTMLElement;
    expect(name.style.fontSize).toBe('21px');
  });
});

async function mountEr(text: string, selected: string) {
  const session = openSession({ 'main.dg': text });
  const source = session.source!;
  const r = render(<InteractiveView source={source} view="tablas" theme={source.themes.find((t) => t.name === 't')!} layout={layout} width={900} height={600} selected={selected} />);
  await waitFor(() => expect(r.container.querySelector('.rd-vista[data-layout="listo"] [data-id="orders"]')).not.toBeNull(), { timeout: 15000 });
  return { ...r, session };
}
