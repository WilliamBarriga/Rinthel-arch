import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const model = `specification { node servicio { color rojo } }
model {
  servicio api "Pasarela de pagos internacional"
  servicio db "DB"
  api -> db "lee"
}
view v {
  type architecture
  include **
  theme t
}
`;

const theme = (title: string, label = '') => `theme t {
  palette { rojo "#dc2626"  papel "#fefce8"  tinta "#111111" }
  node {
    layer tarjeta solid { color papel }
    slots { title { ${title} } }
  }
  edge {
    layer linea line { color tinta }
    label { fill papel ${label} }
  }
}
`;

const open = (dsl: string) => openSession({ 'main.dg': dsl + model });

describe('session seam: text style of a Slot (prefix and glow)', () => {
  it('`prefix` puts a text before the Slot text: it is measured, so the box grows', async () => {
    const without = open(theme('weight 700'));
    const withPrefix = open(theme('weight 700  prefix "> "'));

    expect(await withPrefix.diagnose()).toEqual([]);
    expect(withPrefix.style('v')!.pintura.nodo.textos['title']!.props['prefix']).toBe('> ');
    const width = async (s: typeof without) => (await s.geometry('v'))!.geometry.nodes['api']!.width;
    expect(await width(withPrefix)).toBeGreaterThan(await width(without));
  });

  it('a too long `prefix` is a located error, it is not clipped', async () => {
    const issues = await open(theme('prefix "-------------->"')).diagnose();

    expect(issues.map((i) => i.code)).toContain('theme-invalid-value');
    expect(issues.find((i) => i.code === 'theme-invalid-value')!.message).toMatch(/prefix/);
  });

  it('text `glow` is a Palette color and only paints: it does not change the Metrics', async () => {
    const without = open(theme('weight 700'));
    const withGlow = open(theme('weight 700  glow rojo/0.8'));

    expect(await withGlow.diagnose()).toEqual([]);
    expect(withGlow.style('v')!.pintura.nodo.textos['title']!.props['glow']).toBe('rgba(220, 38, 38, 0.8)');
    expect((await withGlow.geometry('v'))!.geometry.nodes).toEqual((await without.geometry('v'))!.geometry.nodes);
  });

  it('the Edge label accepts `style italic`', async () => {
    const session = open(theme('weight 700', 'style italic'));

    expect(await session.diagnose()).toEqual([]);
    expect(session.style('v')!.pintura.arista.etiqueta.props['style']).toBe('italic');
  });
});
