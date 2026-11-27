import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const MODEL = `specification { node servicio }
model {
  servicio cliente
  servicio api
  servicio db
  servicio cola
  interaction compra "Compra" {
    cliente -> api "pedido"
    api -> db "consulta"
    async api -> cliente "evento"
    reply db -> api "ok"
    create api -> cola "nueva"
    api -> api "validar"
    destroy api -> cola
  }
}
`;
const PALETTE = `palette { papel "#fefce8"  tinta "#1f2937"  azul "#2563eb"  rojo "#dc2626" }`;
const BASE = `  ${PALETTE}
  node { layer forma rect  layer relleno solid { color papel }  layer borde border { color tinta }  slots { title } }
  edge { layer linea line { color tinta  width 1 }  end arrow { size 8 } }`;
const open = (blocks = '') =>
  openSession({ 'main.dg': `${MODEL}theme t {\n${BASE}\n${blocks}\n}\nview v { type sequence  interaction compra  theme t }\n` });
const errors = async (session: ReturnType<typeof open>) => (await session.diagnose()).filter((i) => i.severity === 'error');
const stroke = (session: ReturnType<typeof open>, kind: string) => {
  const message = session.style('v')!.pintura.secuencia!.mensaje!.base;
  return message.variantes[kind]?.capas ?? message.capas;
};
async function geometry(session: ReturnType<typeof open>) {
  const g = (await session.geometry('v'))?.geometry;
  if (g?.kind !== 'secuencia') throw new Error('expected a sequence');
  return g;
}

describe('session seam: explicit sequence Theme', () => {
  it('message { kind async { ... } } changes only the async stroke', async () => {
    const session = open('  message {\n    layer linea line { color tinta  width 1 }\n    end arrow { size 8 }\n    kind async { layer linea { color azul  width 3 } }\n  }');

    expect(await errors(session)).toEqual([]);
    expect(stroke(session, 'async').map((c) => [c.props['color'], c.props['width']])).toEqual([['#2563eb', 3]]);
    expect(stroke(session, 'sync').map((c) => [c.props['color'], c.props['width']])).toEqual([['#1f2937', 1]]);
    expect(stroke(session, 'reply').map((c) => c.props['color'])).toEqual(['#1f2937']);
  });

  it('a lifeline gap in the Theme changes the Geometry', async () => {
    const base = await geometry(open());
    const wide = await geometry(open('  lifeline { gap 300 }'));

    const distance = (g: typeof base) => g.lifelines['api']!.x - g.lifelines['cliente']!.x;
    expect(distance(base)).toBeLessThan(300);
    expect(distance(wide)).toBeGreaterThanOrEqual(300);
  });

  it('the gap between Messages, the Fragment padding and the activation width also adjust the Geometry', async () => {
    const base = await geometry(open());
    const adjusted = await geometry(open('  message { gap 80  loop-width 80 }\n  activation { width 20 }'));

    const spacing = (g: typeof base) => g.messages['1']!.points[0]!.y - g.messages['0']!.points[0]!.y;
    expect(spacing(adjusted)).toBeGreaterThan(spacing(base));
    expect(adjusted.activations[0]!.width).toBe(20);
    const loop = (g: typeof base) => Math.max(...g.messages['5']!.points.map((p) => p.x)) - g.lifelines['api']!.x;
    expect(loop(adjusted)).toBeGreaterThan(loop(base));
  });

  it('without sequence blocks, the Style delivers the stacks already derived from edge and node (ADR 0009)', () => {
    const sequence = open().style('v')!.pintura.secuencia!;

    expect([sequence.lifeline, sequence.mensaje, sequence.activacion, sequence.fragmento, sequence.nota].every((e) => e?.derivado === true)).toBe(true);
    // Lifeline: the Edge stroke, dashed, with `cross` at the end of a destroyed one.
    expect(sequence.lifeline!.base.capas.map((c) => [c.props['color'], c.props['style']])).toEqual([['#1f2937', 'dashed']]);
    expect(sequence.lifeline!.base.fin?.tipo).toBe('cross');
    // Message: `reply` with the opposite continuity and chevron; `sync` solid with an arrow.
    expect(sequence.mensaje!.base.tipos['reply']).toMatchObject({ capas: [{ props: { style: 'dashed' } }], fin: { tipo: 'chevron', props: { size: 8 } } });
    expect(sequence.mensaje!.base.tipos['sync']).toMatchObject({ capas: [{ props: { style: 'solid' } }], fin: { tipo: 'arrow' } });
    // Sober activation: only the Node's shape, fill and border.
    expect(sequence.activacion!.capas.map((c) => c.nombre)).toEqual(['forma', 'relleno', 'borde']);
    // Guards with the color of the Edge stroke; "paper" Note without `amber` in the Palette: the Theme border.
    expect(sequence.fragmento!.colorDeGuarda).toBe('#1f2937');
    expect(sequence.nota!.papel).toMatchObject({ opacidadDeRelleno: 0.2 });
  });

  it('an ER table with a pill shape is derived as rect and the row arrives derived', () => {
    const er = openSession({
      'main.dg': `specification { node tabla }\nmodel { tabla t { id: uuid pk } }\ntheme p {\n  ${PALETTE}\n  node { layer forma pill  layer relleno solid { color papel }  slots { title attrs } }\n}\nview e { type er  include **  theme p }\n`,
    });

    const paint = er.style('e')!.pintura;
    expect(paint.nodo.capas[0]).toMatchObject({ tipo: 'rect', props: { radius: 8 } });
    expect(paint.fila).toMatchObject({ derivado: true, base: [] });
  });

  it('an out-of-range value or an unknown Message kind are Theme issues', async () => {
    const outOfRange = await open('  lifeline { gap 5 }').diagnose();
    const typo = await open('  message { kind asynk { layer linea { width 2 } } }').diagnose();

    expect(outOfRange.map((i) => i.code)).toEqual(['theme-invalid-value']);
    expect(typo.map((i) => i.code)).toEqual(['theme-invalid-value']);
    expect(typo[0]!.fix).toBeDefined();
  });
});

const BOTH = `specification { node servicio  node tabla }
model {
  servicio cliente
  servicio api
  tabla orders "Pedidos" { id: uuid pk
    customer_id: uuid fk }
  tabla customers "Clientes" { id: uuid pk }
  orders#customer_id "0..*" -> "1" customers#id identifying
  interaction i {
    cliente -> api "pedir"
    alt "ok" { async api -> cliente "200" } else "falla" { async api -> cliente "500" }
    reply api -> cliente "fin"
    note over cliente, api "fin"
  }
}
`;
const withTheme = (theme: string) => openSession({ 'main.dg': `${BOTH}view s { type sequence  interaction i  theme ${theme} }\nview e { type er  include orders, customers  theme ${theme} }\n` });

describe('session seam: built-in Themes and sequence/ER', () => {
  it.each(['neutral', 'neutral-dark', 'high-contrast'])('%s draws sequence and ER without warnings or errors', async (theme) => {
    expect(await withTheme(theme).diagnose()).toEqual([]);
  });

  it.each(['neutral', 'high-contrast'])('%s explicitly declares every new Theme element', (theme) => {
    const session = withTheme(theme);
    const sequence = session.style('s')!.pintura.secuencia!;
    expect(Object.keys(sequence).sort()).toEqual(['activacion', 'fragmento', 'lifeline', 'mensaje', 'nota']);
    expect(Object.keys(sequence.mensaje!.base.variantes).sort()).toEqual(['async', 'create', 'destroy', 'reply']);
    expect(session.style('e')!.pintura.fila).toBeDefined();
  });

  it('neutral-dark inherits the elements of neutral and only changes the Palette', () => {
    const dark = withTheme('neutral-dark').style('s')!.pintura.secuencia!;
    const light = withTheme('neutral').style('s')!.pintura.secuencia!;
    expect(Object.keys(dark)).toEqual(Object.keys(light));
    expect(dark.mensaje!.base.capas.map((c) => c.nombre)).toEqual(light.mensaje!.base.capas.map((c) => c.nombre));
    expect(dark.mensaje!.base.capas[0]!.props['color']).not.toBe(light.mensaje!.base.capas[0]!.props['color']);
  });

  it('high-contrast uses thicker strokes than neutral', () => {
    const strokeWidth = (theme: string) => Number(withTheme(theme).style('s')!.pintura.secuencia!.mensaje!.base.capas.at(-1)!.props['width']);
    expect(strokeWidth('high-contrast')).toBeGreaterThan(strokeWidth('neutral'));
  });
});

describe('session seam: color-only in Messages and identifying Edges', () => {
  const colorOnly = async (theme: string, view: string) => {
    const base = theme.includes('  edge {') ? BASE.split('\n').filter((l) => !l.startsWith('  edge {')).join('\n') : BASE;
    const issues = await openSession({ 'main.dg': `${BOTH}theme t {\n${base}\n${theme}\n}\nview s { type sequence  interaction i  theme t }\nview e { type er  include orders, customers  theme t }\n` }).diagnose();
    return issues.filter((i) => i.code === 'theme-color-only' && i.message.includes(`'${view}'`));
  };

  it('warns if reply only changes color with respect to sync', async () => {
    const warnings = await colorOnly('  message {\n    layer linea line { color tinta  style solid }\n    end arrow { size 8 }\n    kind reply { layer linea { color rojo } }\n  }', 's');

    expect(warnings.map((i) => i.message)).toEqual([
      "In View 's', Messages 'sync' and 'reply' differ only by color",
      "In View 's', Messages 'async' and 'reply' differ only by color",
    ]);
  });

  it('does not warn with the edge derivation nor if reply changes the stroke', async () => {
    expect(await colorOnly('', 's')).toEqual([]);
    expect(await colorOnly('  message {\n    layer linea line { color tinta  style solid }\n    end arrow { size 8 }\n    kind reply { layer linea { color rojo  style dashed } }\n  }', 's')).toEqual([]);
  });

  it('warns if the identifying and the non-identifying Edge are equal except for color', async () => {
    const warnings = await colorOnly('  edge { layer linea line { color tinta  style dotted }  identifying { layer linea { color azul } } }', 'e');

    expect(warnings.map((i) => i.message)).toEqual(["In View 'e', identifying and non-identifying Edges differ only by color"]);
  });

  it('does not warn with a solid identifying and a dashed non-identifying Edge', async () => {
    expect(await colorOnly('  edge { layer linea line { color tinta  style solid }  identifying { layer linea { color azul } } }', 'e')).toEqual([]);
  });
});
