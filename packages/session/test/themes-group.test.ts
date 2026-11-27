import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const model = `specification { node servicio { color rojo }  node capa { color azul } }
model {
  capa plataforma "Plataforma" {
    servicio api
    servicio db
  }
  servicio externo
  plataforma.api -> plataforma.db
  externo -> plataforma.api
}
view v {
  type architecture
  include **
  theme t
}
`;
const palette = `palette { rojo "#dc2626"  azul "#2563eb"  papel "#fefce8"  tinta "#1f2937" }`;
const NODE = `  node {
    layer forma rect { radius 3 }
    layer relleno solid { color papel }
    slots { title }
  }`;
const theme = (group: string, node = NODE) => `theme t {
  ${palette}
${node}
${group}
}
`;
const open = (dsl: string, extra = '') => openSession({ 'main.dg': dsl + model + extra });
const names = (layers: ReadonlyArray<{ nombre: string }>): string[] => layers.map((c) => c.nombre);

describe('session seam: Theme group block', () => {
  it('a Theme without group resolves a sober Group from its tokens and never the Node Layers', async () => {
    const session = open(theme(''));
    const { nodo, grupo } = session.style('v')!.pintura;

    expect(await session.diagnose()).toEqual([]);
    expect(names(nodo.capas)).toEqual(['forma', 'relleno']);
    expect(names(grupo.abierto.capas)).toEqual(['box', 'fill', 'border']);
    expect(JSON.stringify(grupo.abierto.capas)).not.toContain('#fefce8');
    expect(grupo.colapsado.capas.find((c) => c.nombre === 'border')?.tipo).toBe('dashed');
  });

  it('declares Layers, patches by kind, by state and the collapsed patch with the same syntax as node', async () => {
    const session = open(
      theme(`  group {
    layer caja rect { radius 16 }
    layer fondo solid { color papel/0.5 }
    layer borde dashed { color tinta width 1 }
    type capa { layer fondo { color azul/0.2 } }
    state hover { layer borde { color azul } }
    state collapsed { layer fondo { color tinta }  layer borde border { color tinta width 2 } }
  }`),
    );
    const { grupo } = session.style('v')!.pintura;
    const layerOf = (layers: ReadonlyArray<{ nombre: string; props: Record<string, unknown>; tipo: string }>, name: string) => layers.find((c) => c.nombre === name);

    expect(await session.diagnose()).toEqual([]);
    expect(names(grupo.abierto.capas)).toEqual(['caja', 'fondo', 'borde']);
    expect(layerOf(grupo.abierto.capas, 'borde')).toMatchObject({ tipo: 'dashed', props: { color: '#1f2937', width: 1 } });
    expect(layerOf(grupo.abierto.tipos['capa']!.capas, 'fondo')?.props['color']).toBe('rgba(37, 99, 235, 0.2)');
    expect(layerOf(grupo.abierto.estados['hover']!, 'borde')?.props['color']).toBe('#2563eb');
    // Closed: another stack (the collapsed patch), with its own kind and its states on top.
    expect(layerOf(grupo.colapsado.capas, 'fondo')?.props['color']).toBe('#1f2937');
    expect(layerOf(grupo.colapsado.capas, 'borde')?.tipo).toBe('border');
    expect(layerOf(grupo.colapsado.estados['hover']!, 'borde')?.props['color']).toBe('#2563eb');
  });

  it('a Theme extends the group of its parent and patches it by Layer name', async () => {
    const parent = `theme base {
  ${palette}
  group {
    layer caja rect { radius 16 }
    layer borde border { color tinta width 1 }
  }
}
`;
    const child = `theme t extends base { group { layer borde { width 3 } } }\n`;
    const session = openSession({ 'main.dg': parent + child + model });

    expect(await session.diagnose()).toEqual([]);
    expect(session.style('v')!.pintura.grupo.abierto.capas.find((c) => c.nombre === 'borde')?.props).toMatchObject({ width: 3, color: '#1f2937' });
    expect(names(session.style('v')!.pintura.grupo.abierto.capas)).toEqual(['caja', 'borde']);
  });

  it('padding and header feed the Metrics table of the open Group', async () => {
    const little = open(theme('  group { padding 4 }'));
    const much = open(theme('  group { padding 20 10 }'));
    const withHeader = open(theme('  group { padding 4  slots row gap 4 pad 12 { icon { variant box side 40 }  title } }'));
    const openGroup = (s: ReturnType<typeof openSession>) => s.style('v')!.tabla.grupoAbierto.paddingGrupo;

    expect(openGroup(little)).toMatchObject({ left: 4, right: 4, bottom: 4 });
    expect(openGroup(much)).toMatchObject({ left: 10, right: 10, bottom: 20 });
    expect(openGroup(much).top - openGroup(little).top).toBe(16);
    expect(openGroup(withHeader).top).toBeGreaterThan(openGroup(little).top);
  });

  it('the children of a Group do not overlap its header, not even a tall chip header', async () => {
    const dsl = theme(`  group {
    layer caja rect { radius 12 }
    slots row gap 8 pad 10 { icon { variant box side 36 }  title { size 1.4  fill azul  pad 8 } }
    padding 6
  }`);
    const session = open(dsl);
    const g = (await session.geometry('v'))!.geometry;
    const header = session.style('v')!.tabla.grupoAbierto.paddingGrupo.top - 6;

    expect(await session.diagnose()).toEqual([]);
    // Children coordinates are relative to the Group: none starts before the header ends.
    for (const id of ['plataforma.api', 'plataforma.db']) expect(g.nodes[id]!.y).toBeGreaterThanOrEqual(header);
    expect(g.nodes['plataforma']!.width).toBeGreaterThanOrEqual(g.nodes['plataforma.api']!.width + 12);
  });

  it('the width of an open Group contains its header even if the children are narrow', async () => {
    const title = 'Plataforma de integracion con un titulo larguisimo';
    const withTitle = (dsl: string) => dsl.replace('"Plataforma"', `"${title}"`);
    const plain = openSession({ 'main.dg': withTitle(theme('')) + model.replace('"Plataforma"', `"${title}"`) });
    const chip = openSession({ 'main.dg': theme('  group { slots row gap 6 pad 6 { icon  title { fill azul  pad 10  dot azul  transform uppercase  tracking 0.2 } } }') + model.replace('"Plataforma"', `"${title}"`) });
    const width = async (s: ReturnType<typeof openSession>) => (await s.geometry('v'))!.geometry.nodes['plataforma']!.width;
    const child = (await plain.geometry('v'))!.geometry.nodes['plataforma.api']!.width;

    expect(await width(plain)).toBeGreaterThan(child + 32);
    expect(await width(chip)).toBeGreaterThan(await width(plain));
    expect(await width(chip)).toBeGreaterThanOrEqual(chip.style('v')!.tabla.grupoAbierto.margenDeControl * 2 + title.length * 8);
  });

  it('errors at once, with code and "did you mean": Layer, state, attrs Slot, padding and Metrics of a kind', async () => {
    const session = open(
      theme(`  group {
    layer caja rect { radius 16 }
    state hovr { layer caja { radius 4 } }
    state hover { layer caja { radiu 4 } }
    slots row { icon  attrs }
    padding 1 2 3
    type capa { layer caja circle }
  }`),
    );
    const issues = await session.diagnose();
    const codes = issues.map((i) => i.code).sort();

    expect(codes).toEqual(
      expect.arrayContaining(['theme-unknown-state', 'theme-unknown-property', 'theme-unknown-slot', 'theme-invalid-value', 'theme-state-touches-metrics']),
    );
    expect(issues.find((i) => i.code === 'theme-unknown-state')?.fix?.replacement).toBe('hover');
    expect(issues.find((i) => i.code === 'theme-unknown-property')?.fix?.replacement).toBe('radius');
    expect(issues.every((i) => i.line > 0)).toBe(true);
  });

  it('a Group state cannot touch the Slots; collapsed can, and it changes the box of the closed Group', async () => {
    const broken = open(theme('  group { layer caja rect  state hover { slots { title } } }'));
    const good = open(
      theme('  group { layer caja rect  state collapsed { layer caja circle  slots column pad 4 { title { transform uppercase } } } }'),
      '',
    );
    const m = good.style('v')!.tabla;

    expect((await broken.diagnose()).map((i) => i.code)).toEqual(['theme-state-touches-metrics']);
    expect(await good.diagnose()).toEqual([]);
    expect(m.grupoColapsado.cajaCuadrada).toBe(true);
    expect(m.grupoAbierto.cajaCuadrada).toBe(false);
    expect(m.grupoColapsado.disposicion.hijos).toEqual([{ slot: 'title' }]);
    expect(m.grupoColapsado.titulo.mayusculas).toBe(true);
  });
});
