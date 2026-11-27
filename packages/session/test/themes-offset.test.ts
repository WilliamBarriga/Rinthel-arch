import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const model = `specification { node servicio { color rojo } }
model {
  servicio api
  servicio db
  api -> db
}
view v {
  type architecture
  include **
  theme t
}
`;

const theme = (shadow: string, state = '') => `theme t {
  palette { rojo "#dc2626"  papel "#fefce8"  tinta "#111111" }
  node {
    layer sombra solid { color tinta ${shadow} }
    layer tarjeta solid { color papel }
    slots { title }
    ${state}
  }
}
`;

const open = (dsl: string) => openSession({ 'main.dg': dsl + model });

describe('session seam: offset and grow of a Layer', () => {
  it('`offset x y` (negatives allowed) and `grow` reach the paint of the Layer', async () => {
    const session = open(theme('offset 4 -3  grow 2'));

    expect(await session.diagnose()).toEqual([]);
    expect(session.style('v')!.pintura.nodo.capas[0]).toEqual({
      nombre: 'sombra',
      tipo: 'solid',
      props: { color: '#111111', 'offset-x': 4, 'offset-y': -3, grow: 2 },
    });
  });

  it('a state patch can move the Layer (a lifting hover) without touching the Metrics', async () => {
    const session = open(theme('offset 4 4', 'state hover { layer sombra { offset 7 7 } }'));

    expect(await session.diagnose()).toEqual([]);
    expect(session.style('v')!.pintura.nodo.estados['hover']![0]!.props).toMatchObject({ 'offset-x': 7, 'offset-y': 7 });
  });

  it('they change neither the layout key nor the boxes', async () => {
    const without = open(theme(''));
    const withOffset = open(theme('offset 12 -12  grow 8'));
    const a = (await without.geometry('v'))!;
    const b = (await withOffset.geometry('v'))!;

    expect(b.layoutKey).toBe(a.layoutKey);
    expect(b.geometry.nodes).toEqual(a.geometry.nodes);
    expect(withOffset.style('v')!.metricas).toEqual(without.style('v')!.metricas);
  });

  it('an out-of-range value is an error with a position, never clamped', async () => {
    const issues = await open(theme('offset 999 0  grow -999')).diagnose();

    expect(issues.map((i) => i.code)).toEqual(['theme-invalid-value', 'theme-invalid-value']);
    expect(issues[0]!.message).toContain("'offset-x'");
    expect(issues[0]!.line).toBeGreaterThan(0);
  });
});
