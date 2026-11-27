import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const model = `specification { node servicio { color rojo }  node base { color azul } }
model {
  servicio api
  base db
  api -> db
}
`;
const view = `view v {
  type architecture
  include **
  theme t
}
`;
const theme = (fill: string, extra = '') => `theme t {
  palette { rojo "#f0f0f0"  azul "#f0e0e0" }
  ${extra}
  node {
    layer forma rect { radius 4 }
    layer relleno solid { color ${fill} }
    slots { title attrs }
  }
}
`;

describe('session seam: Theme accessibility', () => {
  it('low contrast is a warning with the Node kind and does not block build', async () => {
    const session = openSession({ 'main.dg': model + theme('COLOR', 'tokens { foreground "#ffffff" }') + view });

    const issues = await session.diagnose();
    const contrast = issues.filter((i) => i.code === 'theme-low-contrast');

    expect(contrast.map((i) => i.severity)).toEqual(['warning', 'warning']);
    expect(contrast[0]!.message).toContain("'servicio'");
    expect(issues.some((i) => i.severity === 'error')).toBe(false);
    const built = await session.build();
    expect(Object.keys(built.files)).toContain('geometria/v.json');
  });

  it('two Node kinds that differ only by color give the color-only warning on the View', async () => {
    const issues = await openSession({ 'main.dg': model + theme('COLOR') + view }).diagnose();
    const colorOnly = issues.filter((i) => i.code === 'theme-color-only');

    expect(colorOnly).toHaveLength(1);
    expect(colorOnly[0]).toMatchObject({ severity: 'warning', file: 'main.dg' });
    expect(colorOnly[0]!.message).toContain("'servicio'");
    expect(colorOnly[0]!.message).toContain("'base'");
  });

  it('if the Node shows the badge, the Node kind name tells them apart: no color-only', async () => {
    const withBadge = theme('COLOR').replace('slots { title attrs }', 'slots { title badge attrs }');
    const issues = await openSession({ 'main.dg': model + withBadge + view }).diagnose();

    expect(issues.filter((i) => i.code === 'theme-color-only')).toEqual([]);
  });

  it('the color-only check of each View uses its Diagram type: the diagram flow badge only tells apart in the flow one', async () => {
    const withBadgeInFlow = theme('COLOR').replace('slots { title attrs }', 'slots { title attrs }\n    diagram flow { slots { title badge attrs } }');
    const views = view + view.replace('view v', 'view f').replace('architecture', 'flow');
    const issues = await openSession({ 'main.dg': model + withBadgeInFlow + views }).diagnose();

    const colorOnly = issues.filter((i) => i.code === 'theme-color-only');
    expect(colorOnly.map((i) => i.message.match(/View '(\w+)'/)?.[1])).toEqual(['v']);
  });

  it('a Theme that does not use the Node kind color and has no bad contrast does not warn', async () => {
    const issues = await openSession({ 'main.dg': model + theme('rojo').replace('rojo "#f0f0f0"', 'rojo "#ffffff"') + view }).diagnose();

    expect(issues).toEqual([]);
  });

  it.each(['', 'neutral', 'neutral-dark', 'high-contrast'])('the built-in Theme %j gives no warning, with open and closed Groups', async (name) => {
    // A minimal .dg as a person starts it: Node kinds with color and icon, an open Group, a closed one and Edges.
    const colors = `specification {
  node servicio { color blue  icon server }  node base { color green  icon database }
  node cola { color amber }  node otro { color purple }  node equipo { color gray }
}
model {
  equipo plataforma "Plataforma" { servicio a "API"  base b "Datos" }
  equipo bordes "Bordes" { cola c  otro d }
  plataforma.a -> plataforma.b "lee"
  plataforma.a -> bordes.c
}
view v { type architecture include **  collapsed bordes${name === '' ? '' : `  theme ${name}`} }
`;

    expect(await openSession({ 'main.dg': colors }).diagnose()).toEqual([]);
  });
});
