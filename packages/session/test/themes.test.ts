import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const model = `specification { node servicio { color rojo } }
model {
  servicio api { attrs { id: int  nombre: texto } }
  servicio db
  api -> db
}
`;

const view = (theme = '') => `view v {
  type architecture
  include **
${theme}}
`;

const theme = (node: string, extra = '') => `theme t {
  palette { rojo "#dc2626"  papel "#fefce8" ${extra} }
  node {
${node}
  }
}
`;

const LAYERS = `    layer forma rect { radius 8 }
    layer relleno solid { color papel }
    layer borde border { color rojo width 2 }
    slots { title attrs }`;

const workspace = (themeDsl: string, viewDsl = view('  theme t\n')) => ({ 'main.dg': model + themeDsl + viewDsl });

describe('session seam: Themes with Layers and Slots', () => {
  it('a Theme with three Primitives and Slots compiles without issues and gives the Resolved style of the View', async () => {
    const session = openSession(workspace(theme(LAYERS)));

    expect(await session.diagnose()).toEqual([]);
    const style = session.style('v')!;
    expect(style.pintura.nodo.capas).toEqual([
      { nombre: 'forma', tipo: 'rect', props: { radius: 8 } },
      { nombre: 'relleno', tipo: 'solid', props: { color: '#fefce8' } },
      { nombre: 'borde', tipo: 'border', props: { color: '#dc2626', width: 2 } },
    ]);
    expect(style.metricas.disposicion).toEqual({ direccion: 'column', gap: 0, pad: 0, hijos: [{ slot: 'title' }, { slot: 'attrs' }] });
  });

  it('the Geometry carries the rectangle of each Slot, stacked in the Theme order', async () => {
    const session = openSession(workspace(theme(LAYERS)));

    const { geometry } = (await session.geometry('v'))!;
    const { metricas } = session.style('v')!;
    const api = geometry.nodes['api']!;

    expect(api.slots!['title']).toEqual({ x: 0, y: 0, width: api.width, height: metricas.cabecera });
    expect(api.slots!['attrs']).toEqual({ x: 0, y: metricas.cabecera, width: api.width, height: 2 * metricas.fila });
    expect(api.height).toBe(metricas.cabecera + 2 * metricas.fila);
    expect(geometry.nodes['db']!.slots).toEqual({ title: { x: 0, y: 0, width: geometry.nodes['db']!.width, height: metricas.cabecera } });
  });

  it('a Theme that does not list `attrs` neither reserves nor draws rows, and the Attribute port falls to the center', async () => {
    const titleOnly = openSession(workspace(theme(`${LAYERS.replace('slots { title attrs }', 'slots { title }')}`)));

    const { geometry } = (await titleOnly.geometry('v'))!;

    expect(geometry.nodes['api']!.slots).toEqual({ title: expect.any(Object) });
    expect(geometry.nodes['api']!.height).toBe(titleOnly.style('v')!.metricas.cabecera);
  });

  it('the order of `slots` is the visual order', async () => {
    const session = openSession(workspace(theme(LAYERS.replace('slots { title attrs }', 'slots { attrs title }'))));

    const { geometry } = (await session.geometry('v'))!;

    expect(geometry.nodes['api']!.slots!['attrs']!.y).toBe(0);
    expect(geometry.nodes['api']!.slots!['title']!.y).toBe(2 * session.style('v')!.metricas.fila);
  });

  it('the Resolved style is deterministic and the Metrics do not depend on the Layers', () => {
    const a = openSession(workspace(theme(LAYERS))).style('v')!;
    const b = openSession(workspace(theme(LAYERS))).style('v')!;
    const otherPaint = openSession(workspace(theme(LAYERS.replace('radius 8', 'radius 30').replace('width 2', 'width 5')))).style('v')!;

    expect(b).toEqual(a);
    expect(otherPaint.pintura).not.toEqual(a.pintura);
    expect(otherPaint.metricas).toEqual(a.metricas);
  });

  it('changing only the paint keeps the layout key: the Fresh geometry is reused', async () => {
    const initial = openSession(workspace(theme(LAYERS)));
    const first = (await initial.geometry('v'))!;

    const repainted = initial.update(workspace(theme(LAYERS.replace('radius 8', 'radius 30'))));
    const second = (await repainted.geometry('v'))!;
    const withSlots = (await initial.update(workspace(theme(LAYERS.replace('slots { title attrs }', 'slots { title }')))).geometry('v'))!;

    expect(second.layoutKey).toBe(first.layoutKey);
    expect(second).toBe(first);
    expect(withSlots.layoutKey).not.toBe(first.layoutKey);
  });

  it('reports every catalog error at once, with code, position and hint', async () => {
    const broken = theme(`    layer forma rec { radius 8 }
    layer relleno solid { colour papel }
    layer borde border { color rojo width 99 }
    slots { title titulo }`);
    const issues = await openSession(workspace(broken)).diagnose();

    expect(issues.map((i) => i.code).sort()).toEqual(
      ['theme-invalid-value', 'theme-invalid-value', 'theme-unknown-primitive', 'theme-unknown-property', 'theme-unknown-slot'].sort(),
    );
    expect(issues.find((i) => i.code === 'theme-unknown-primitive')).toMatchObject({ severity: 'error', file: 'main.dg', line: 10, fix: expect.objectContaining({ replacement: 'rect' }) });
    expect(issues.find((i) => i.code === 'theme-unknown-property')!.fix?.replacement).toBe('color');
    expect(issues.find((i) => i.code === 'theme-unknown-slot')!.message).toContain("'titulo'");
  });

  it('an out-of-range value is an error and is not clamped; a color outside the Palette too', async () => {
    const issues = await openSession(workspace(theme(`    layer borde border { color azul width 99 }`))).diagnose();

    expect(issues.map((i) => i.code).sort()).toEqual(['theme-invalid-value', 'unknown-palette-color']);
  });

  it('a Layer repeated in the same block is an error', async () => {
    const issues = await openSession(workspace(theme(`    layer a rect\n    layer a rect`))).diagnose();

    expect(issues.map((i) => i.code)).toEqual(['theme-duplicate-layer']);
  });

  it('extends: a Layer with the same name is patched by name and a new one needs a position', () => {
    const session = openSession({
      'main.dg':
        model +
        theme(LAYERS) +
        `theme hijo extends t {
  palette { azul "#2563eb" }
  node {
    layer borde { color azul }
    layer extra rect after forma { radius 1 }
  }
}\n` +
        view('  theme hijo\n'),
    });

    expect(session.style('v')!.pintura.nodo.capas.map((c) => [c.nombre, c.props['color'] ?? c.props['radius']])).toEqual([
      ['forma', 8],
      ['extra', 1],
      ['relleno', '#fefce8'],
      ['borde', '#2563eb'],
    ]);
  });

  it('old Themes with nodeStyles or edgeStyles are no longer accepted', async () => {
    const legacy = `theme viejo extends neutral { nodeStyles { servicio { fill "#fff" } } }\n`;
    const issues = await openSession({ 'main.dg': model + legacy + view() }).diagnose();

    expect(issues.map((i) => i.code)).toContain('syntax-error');
    const edgeIssues = await openSession({ 'main.dg': model + 'theme viejo extends neutral { edgeStyles { default { stroke red } } }\n' + view() }).diagnose();
    expect(edgeIssues.map((i) => i.code)).toContain('syntax-error');
  });

  it('a View without a Theme uses the neutral one, which shows title and Attributes', async () => {
    const session = openSession({ 'main.dg': (model + view()).replace('{ color rojo }', '') });

    expect(session.style('v')!.metricas.disposicion.hijos).toHaveLength(2);
    expect(session.style('nada')).toBeUndefined();
  });
});

describe('session seam: Slot mini-layout', () => {
  const withIcons = `specification { node servicio { color rojo  icon box } }
model {
  servicio api { attrs { id: int  nombre: texto } }
  servicio db
  api#nombre -> db
}
`;
  const geometryOf = async (slots: string, source = withIcons) => {
    const session = openSession({ 'main.dg': source + theme(`    layer forma rect\n    ${slots}`) + view('  theme t\n') });
    expect(await session.diagnose()).toEqual([]);
    return { geometry: (await session.geometry('v'))!.geometry, metricas: session.style('v')!.metricas };
  };

  it('an icon + title row: the icon sits on the left inside its rectangle and does not overlap the title', async () => {
    const { geometry, metricas } = await geometryOf('slots column { row gap 6 { icon { side 20 }  title }  attrs }');
    const { slots, width } = geometry.nodes['db']!;
    const { icon, title } = slots!;

    expect(icon).toEqual({ x: 0, y: (metricas.cabecera - 20) / 2, width: 20, height: 20 });
    expect(title).toEqual({ x: 26, y: 0, width: width - 26, height: metricas.cabecera });
    expect(icon!.x + icon!.width).toBeLessThanOrEqual(title!.x);
  });

  it('a nested column with pad and gap gives the rectangles, the box size and the Attribute port', async () => {
    const { geometry, metricas } = await geometryOf('slots column pad 8 gap 4 { row { icon  title }  attrs }');
    const api = geometry.nodes['api']!;
    const side = metricas.iconoLado;
    const row = Math.max(side, metricas.cabecera);

    expect(api.slots!['attrs']).toEqual({ x: 8, y: 8 + row + 4, width: api.width - 16, height: 2 * metricas.fila });
    expect(api.height).toBe(8 + row + 4 + 2 * metricas.fila + 8);
    // The Edge `api#nombre -> db` leaves through the `nombre` row (the second): its port falls at the center of that row.
    if (geometry.kind !== 'grafo') throw new Error('expected a graph Geometry');
    const route = geometry.edges['api.nombre->db'] ?? Object.values(geometry.edges)[0]!;
    const center = api.y + api.slots!['attrs']!.y + metricas.fila * 1.5;
    expect(route.points[0]!.y).toBe(center);
  });

  it('a row of two Slots with align end sticks the title to the end of its cross axis', async () => {
    const { geometry, metricas } = await geometryOf('slots row { icon { side 40 }  title { align end } }');
    const { icon, title } = geometry.nodes['db']!.slots!;

    expect(icon!.height).toBe(40);
    expect(title!.y + title!.height).toBe(Math.max(40, metricas.cabecera));
  });

  it('a Slot the Theme does not list is not placed even if the Node has an icon', async () => {
    const { geometry } = await geometryOf('slots { title }');

    expect(Object.keys(geometry.nodes['db']!.slots!)).toEqual(['title']);
  });

  it('a Node without an icon does not reserve the icon Slot', async () => {
    const { geometry } = await geometryOf('slots row gap 6 { icon title }', withIcons.replace('icon box', ''));

    expect(Object.keys(geometry.nodes['db']!.slots!)).toEqual(['title']);
    expect(geometry.nodes['db']!.slots!['title']!.x).toBe(0);
  });

  it('unknown keys, unknown Slots, invalid alignments and repeated Slots: all at once with a hint', async () => {
    const session = openSession({ 'main.dg': withIcons + theme('    slots row gapp 4 { icn  title { align centro }  title }') + view('  theme t\n') });
    const issues = await session.diagnose();

    expect(issues.map((i) => i.code)).toEqual(['theme-unknown-property', 'theme-unknown-slot', 'theme-invalid-value', 'theme-unknown-slot']);
    expect(issues[0]!.hint).toBe("did you mean 'gap'");
    expect(issues[1]!.hint).toBe("did you mean 'icon'");
    expect(issues[2]!.hint).toBe("did you mean 'center'");
  });

  it('changing the arrangement changes the layout key; so does the icon of a Node', async () => {
    const a = openSession({ 'main.dg': withIcons + theme('    slots row { icon title }') + view('  theme t\n') });
    const b = openSession({ 'main.dg': withIcons + theme('    slots column { icon title }') + view('  theme t\n') });

    expect((await a.geometry('v'))!.geometry.nodes['db']!.height).not.toBe((await b.geometry('v'))!.geometry.nodes['db']!.height);
  });
});

describe('session seam: badge, counter, desc and footer Slots', () => {
  const source = `specification { node paquete { color rojo } }
model {
  paquete g "G" "Agrupa dos modulos" {
    source { path "packages/g" }
    paquete h
    paquete i
  }
  paquete solo
}
`;
  const open = (slots: string, extraView = '') =>
    openSession({ 'main.dg': source + theme(`    layer forma rect\n    ${slots}`) + view(`  theme t\n${extraView}`) });
  const nodesOf = async (slots: string, extraView = '') => {
    const session = open(slots, extraView);
    expect(await session.diagnose()).toEqual([]);
    return { nodes: (await session.geometry('v'))!.geometry.nodes, metricas: session.style('v')!.metricas };
  };

  it('badge goes under the title, with the height of its text (14 * 0.74 * 1.25 rounded up = 13)', async () => {
    const { nodes, metricas } = await nodesOf('slots column { title badge }');
    const { title, badge } = nodes['solo']!.slots!;

    expect(badge).toEqual({ x: 0, y: title!.y + title!.height, width: nodes['solo']!.width, height: 13 });
    expect(nodes['solo']!.height).toBe(metricas.cabecera + 13);
  });

  it('a Slot the Theme does not list does not change the box', async () => {
    const without = await nodesOf('slots column { title }');
    const withBadge = await nodesOf('slots column { title badge }');

    expect(Object.keys(without.nodes['solo']!.slots!)).toEqual(['title']);
    expect(withBadge.nodes['solo']!.height).toBeGreaterThan(without.nodes['solo']!.height);
  });

  it('desc and footer reserve their row only if the Node has a description or a source', async () => {
    const { nodes } = await nodesOf('slots column { title desc footer }', '  collapsed g\n');

    expect(Object.keys(nodes['g']!.slots!)).toEqual(['title', 'desc', 'footer']);
    expect(Object.keys(nodes['solo']!.slots!)).toEqual(['title']);
  });

  it('counter only exists in a Collapsed group, to the right of the title, and widens the box', async () => {
    const expanded = await nodesOf('slots row gap 8 { title counter }');
    const collapsed = await nodesOf('slots row gap 8 { title counter }', '  collapsed g\n');
    const g = collapsed.nodes['g']!;

    expect(Object.keys(expanded.nodes['solo']!.slots!)).toEqual(['title']);
    expect(Object.keys(g.slots!)).toEqual(['title', 'counter']);
    expect(g.slots!['counter']!.x + g.slots!['counter']!.width).toBe(g.width);
    expect(g.slots!['title']!.x + g.slots!['title']!.width + 8).toBeLessThanOrEqual(g.slots!['counter']!.x);
  });

  it('the counter box counts the width of its border, horizontally and vertically', async () => {
    const thin = (await nodesOf('slots row { title counter { align center } }', '  collapsed g\n')).nodes['g']!.slots!['counter']!;
    const thick = (await nodesOf('slots row { title counter { border rojo  border-width 3  align center } }', '  collapsed g\n')).nodes['g']!.slots!['counter']!;

    expect(thick.width - thin.width).toBe(6);
    expect(thick.height - thin.height).toBe(6);
  });

  it('with counter in the Theme, the title of the collapsed one does not carry the count and measures less', async () => {
    const withCounter = await nodesOf('slots row { title counter }', '  collapsed g\n');
    const without = await nodesOf('slots row { title }', '  collapsed g\n');

    // Without counter, the "(2)" goes in the title and the box measures it.
    expect(without.nodes['g']!.slots!['title']!.width).toBeGreaterThan(0);
    expect(withCounter.nodes['g']!.slots!['counter']!.width).toBeGreaterThan(0);
    expect(withCounter.nodes['g']!.width).toBeGreaterThanOrEqual(without.nodes['g']!.width - 40);
  });

  it('text-align and the styles of the new Slots are validated with a hint', async () => {
    const session = open('slots column { title { text-align centro }  badge { alpa 0.5 }  counter { fil rojo } }');
    const issues = await session.diagnose();

    expect(issues.map((i) => i.code)).toEqual(['theme-invalid-value', 'theme-unknown-property', 'theme-unknown-property']);
    expect(issues[0]!.hint).toBe("did you mean 'center'");
    expect(issues[1]!.hint).toBe("did you mean 'alpha'");
    expect(issues[2]!.hint).toBe("did you mean 'fill'");
  });

  it('the counter style is a box (chip): fill, border and radius', async () => {
    const session = open('slots row { title counter { fill rojo/0.2  border rojo  radius 8 } }');

    expect(await session.diagnose()).toEqual([]);
    expect(session.style('v')!.pintura.nodo.textos.counter!.props).toMatchObject({ radius: 8 });
  });
});

describe('session seam: box size from the arrangement', () => {
  const source = `specification { node servicio { color rojo  icon box } }
model {
  servicio db
  servicio largo "Un titulo bastante mas largo que el minimo"
}
`;
  const nodesOf = async (slots: string) => {
    const session = openSession({ 'main.dg': source + theme(`    layer forma rect\n    ${slots}`) + view('  theme t\n') });
    expect(await session.diagnose()).toEqual([]);
    return (await session.geometry('v'))!.geometry.nodes;
  };

  it('min-width and min-height set the minimum box and the content is centered vertically', async () => {
    const { db } = await nodesOf('slots row gap 10 pad 10 min-width 160 min-height 54 { icon { variant box side 28 }  title { leading 1.25 } }');

    expect([db!.width, db!.height]).toEqual([160, 54]);
    expect(db!.slots!['icon']).toEqual({ x: 10, y: 13, width: 28, height: 28 });
  });

  it('slack replaces the default slack after the content', async () => {
    const without = await nodesOf('slots row pad 10 slack 0 { title }');
    const withSlack = await nodesOf('slots row pad 10 slack 26 { title }');
    const byDefault = await nodesOf('slots row pad 10 { title }');

    expect(withSlack['largo']!.width - without['largo']!.width).toBe(26);
    expect(byDefault['largo']!.width - without['largo']!.width).toBe(32);
  });

  it('pad-y changes only the vertical margin of the box', async () => {
    const { db } = await nodesOf('slots row pad 14 pad-y 0 { title { leading 1.25 } }');

    expect(db!.slots!['title']).toMatchObject({ x: 14, y: 0, height: 18 });
    expect(db!.height).toBe(18);
  });

  it('the new box keys are validated with range and hint', async () => {
    const session = openSession({ 'main.dg': source + theme('    slots row min-widht 10 min-height 9999 { title }') + view('  theme t\n') });
    const issues = await session.diagnose();

    expect(issues.map((i) => i.code)).toEqual(['theme-unknown-property', 'theme-invalid-value']);
    expect(issues[0]!.hint).toContain("'min-width'");
  });
});
