import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { openSession } from 'session';
import { InteractiveView } from 'shell';

afterEach(cleanup);

const ER = `specification { node tabla }
model {
  tabla orders "Pedidos" {
    id: uuid pk
    customer_id: uuid pk fk
    email: text? uk
  }
  tabla customers "Clientes" {
    id: uuid pk
    name: text
  }
  orders#customer_id "1..*" -> "1" customers#id "pertenece" identifying
}
view tablas { type er  include **  theme t }
`;
const PALETTE = `palette { papel "#fefce8"  tinta "#1f2937"  azul "#2563eb"  verde "#16a34a"  rojo "#dc2626"  gris "#e5e7eb" }`;
const theme = (node: string, rest = ''): string =>
  `theme t {\n  ${PALETTE}\n  node {\n    layer forma rect { radius 6 }\n    layer relleno solid { color papel }\n    layer borde border { color tinta width 1 }\n    slots { title attrs }\n${node}\n  }\n${rest}\n}\n`;

const mount = async (dsl: string) => {
  const session = openSession({ 'main.dg': ER + dsl });
  const source = session.source!;
  const result = render(
    <InteractiveView source={source} view="tablas" theme={source.themes.find((t) => t.name === 't')!} layout={(view, currentTheme, measures) => layoutView(view, currentTheme, { measures })} width={900} height={600} />,
  );
  await waitFor(() => expect(result.container.querySelector('.rd-vista[data-layout="listo"] [data-id="orders"]')).not.toBeNull(), { timeout: 15000 });
  return { ...result, sesion: session };
};

describe('ER Theme in jsdom: zone', () => {
  it('a zone header Layer paints only the header band, up to where the rows start', async () => {
    const { container } = await mount(theme('    layer cab solid { color azul  zone header }'));

    // The table appears before the layout settles its Slots: wait for the band and the rows, not only the box.
    await waitFor(() => {
      expect(container.querySelector('[data-id="orders"] [data-zona="header"]')).not.toBeNull();
      expect(container.querySelector('[data-id="orders"] [data-slot="attrs"]')).not.toBeNull();
    });
    const zone = container.querySelector('[data-id="orders"] [data-zona="header"]') as HTMLElement;
    const rows = container.querySelector('[data-id="orders"] [data-slot="attrs"]') as HTMLElement;
    expect(zone).not.toBeNull();
    expect(zone.style.top).toBe('0px');
    // The band reaches where the rows start, minus the border width (--rd-borde) that shifts the Slots.
    expect(zone.getAttribute('style')).toContain(`height: calc(${rows.style.top} - var(--rd-borde, 0px))`);
    expect(zone.getAttribute('style')).toMatch(/#2563eb|rgb\(37, 99, 235\)/);
    const box = container.querySelector('[data-id="orders"] .rd-nodo') as HTMLElement;
    expect(container.querySelector('[data-id="orders"] [data-zona="body"]')).toBeNull();
    expect(box).not.toBeNull();
  });

  it('zone body covers from the rows to the foot of the table', async () => {
    const { container } = await mount(theme('    layer cuerpo solid { color gris  zone body }'));

    const zone = container.querySelector('[data-id="orders"] [data-zona="body"]') as HTMLElement;
    const rows = container.querySelector('[data-id="orders"] [data-slot="attrs"]') as HTMLElement;
    expect(zone.style.top).toBe(rows.style.top);
  });

  it('a Layer without zone still paints the whole box, without a zone element', async () => {
    const { container } = await mount(theme(''));

    expect(container.querySelector('[data-zona]')).toBeNull();
  });
});

const ROW = (body: string): string => theme('', `  row {\n${body}\n  }`);
const styleOf = (el: Element): string => el.getAttribute('style') ?? '';
const color = (hex: string, rgb: string): RegExp => new RegExp(`${hex}|${rgb.replace(/[()]/g, '\\$&')}`);

describe('ER Theme in jsdom: row block', () => {
  it('each row paints its stack: the base, the odd rows one and the one of its key mark', async () => {
    const { container } = await mount(
      ROW(`    layer fondo solid { color papel }
    alternate { layer fondo { color gris } }
    key pk { layer fondo { color verde } }`),
    );

    const row = (a: string) => container.querySelector(`[data-attribute="orders#${a}"]`)!;
    expect(styleOf(row('id'))).toMatch(color('#16a34a', 'rgb(22, 163, 74)'));
    expect(styleOf(row('customer_id'))).toMatch(color('#16a34a', 'rgb(22, 163, 74)'));
    expect(styleOf(row('email'))).toMatch(color('#fefce8', 'rgb(254, 252, 232)'));
    expect(styleOf(container.querySelector('[data-attribute="customers#name"]')!)).toMatch(color('#e5e7eb', 'rgb(229, 231, 235)'));
  });

  it('the stripe side bottom separator of the row is an element inside it', async () => {
    const { container } = await mount(ROW('    layer sep stripe { color tinta  side bottom  width 1 }'));

    expect(container.querySelector('[data-attribute="orders#id"] .rd-franja')).not.toBeNull();
  });

  it('the style of name, type and key applies to each text and each chip', async () => {
    const { container } = await mount(ROW('    name { weight 700 }\n    type { color azul }\n    key { fill azul  color papel  radius 4 }'));

    const row = container.querySelector('[data-attribute="orders#customer_id"]')!;
    expect(row.textContent).toContain('customer_id: uuid');
    expect(styleOf(row.querySelector('[data-fila-texto="name"]')!)).toContain('font-weight: 700');
    expect(styleOf(row.querySelector('[data-fila-texto="type"]')!)).toMatch(color('#2563eb', 'rgb(37, 99, 235)'));
    const chip = row.querySelector('[data-key="pk"]')!;
    expect(styleOf(chip)).toMatch(color('#2563eb', 'rgb(37, 99, 235)'));
    expect(styleOf(chip)).toContain('border-radius: 4px');
  });

  it('the Theme row height is that of each drawn row', async () => {
    const { container } = await mount(ROW('    height 40'));

    expect((container.querySelector('[data-attribute="orders#id"]') as HTMLElement).style.height).toBe('40px');
  });
});

describe('ER Theme in jsdom: markers', () => {
  it('the Theme changes the color and size of the marker, but not the shape that fixes the cardinality', async () => {
    const { container } = await mount(theme('', '  edge { diagram er { end arrow { size 9  color rojo } } }'));

    const marks = [...container.querySelectorAll('[data-marker]')];
    expect(marks.map((g) => [g.getAttribute('data-marker'), g.getAttribute('data-shape')])).toEqual([['origen', 'many'], ['fin', 'one']]);
    for (const g of marks) expect(g.querySelector('path')?.getAttribute('stroke')).toMatch(color('#dc2626', 'rgb(220, 38, 38)'));
  });
});
