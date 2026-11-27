import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const model = (interaction: string) => `specification { node servicio }
model {
  servicio cliente
  servicio api
  servicio db
  servicio cola
${interaction}
}
view v { type sequence
 interaction i }
`;

async function geometryOf(text: string) {
  const geometry = (await openSession({ 'main.dg': text }).geometry('v'))?.geometry;
  if (geometry?.kind !== 'secuencia') throw new Error('expected the sequence geometry');
  return geometry;
}

describe('session seam: sequence Fragments', () => {
  it('alt with two operands gives a frame covering its Lifelines, a divider and the guards', async () => {
    const text = model(`  interaction i {
    cliente -> api "pedir"
    alt "hay stock" {
      api -> db "reservar"
    } else "sin stock" {
      api -> cliente "rechazar"
    }
    cliente -> api "fin"
  }`);
    expect(await openSession({ 'main.dg': text }).diagnose()).toEqual([]);
    const g = await geometryOf(text);
    const [frame] = g.fragments;
    expect(g.fragments).toHaveLength(1);
    expect(frame!.operator).toBe('alt');
    expect(frame!.operands).toHaveLength(2);
    // The Fragment's Messages carry the path `2.<operand>.<index>`.
    expect(Object.keys(g.messages).sort()).toEqual(['0', '1.0.0', '1.1.0', '2']);
    const reserve = g.messages['1.0.0']!.points[0]!.y;
    const reject = g.messages['1.1.0']!.points[0]!.y;
    // Each Message falls in its operand's band; the frame contains them and the ones outside stay outside.
    const [op1, op2] = frame!.operands as [(typeof frame.operands)[0], (typeof frame.operands)[0]];
    expect(reserve > op1.y1 && reserve < op1.y2).toBe(true);
    expect(reject > op2.y1 && reject < op2.y2).toBe(true);
    expect(op1.divider).toBeUndefined();
    expect(op2.divider).toBe(op1.y2);
    expect(frame!.y).toBeLessThan(op1.y1 + 1);
    expect(frame!.y + frame!.height).toBe(op2.y2);
    expect(g.messages['0']!.points[0]!.y).toBeLessThan(frame!.y);
    expect(g.messages['2']!.points[0]!.y).toBeGreaterThan(frame!.y + frame!.height);
    // Width: from the leftmost Lifeline (cliente) to the rightmost (db) of the content, with padding; cola stays outside.
    expect(frame!.x).toBeLessThan(g.lifelines['cliente']!.x);
    expect(frame!.x + frame!.width).toBeGreaterThan(g.lifelines['db']!.x);
    expect(frame!.x + frame!.width).toBeLessThan(g.lifelines['db']!.x + 60);
    // The first operand's guard goes next to the tab; the second's, under its divider.
    expect(op1.guard!.text).toBe('[hay stock]');
    expect(op1.guard!.box.x).toBeGreaterThanOrEqual(frame!.tab.x + frame!.tab.width);
    expect(op2.guard!.box.y).toBe(op2.divider);
    // The tab fits the measured text of the operator.
    expect(frame!.tab.width).toBeGreaterThan(20);
  });

  it('par stacks its operands vertically with a divider', async () => {
    const g = await geometryOf(
      model(`  interaction i {
    par {
      cliente -> api "a"
    } and {
      cliente -> db "b"
    }
  }`),
    );
    const [frame] = g.fragments;
    expect(frame!.operator).toBe('par');
    expect(frame!.operands[1]!.divider).toBe(frame!.operands[0]!.y2);
    expect(g.messages['0.1.0']!.points[0]!.y).toBeGreaterThan(g.messages['0.0.0']!.points[0]!.y);
  });

  it('three nested levels give concentric frames, each inside the previous one', async () => {
    const g = await geometryOf(
      model(`  interaction i {
    opt "uno" {
      loop "dos" {
        critical "tres" {
          cliente -> api "x"
        }
      }
    }
  }`),
    );
    expect(g.fragments.map((f) => [f.ruta, f.operator, f.nivel])).toEqual([
      ['0', 'opt', 0],
      ['0.0.0', 'loop', 1],
      ['0.0.0.0.0', 'critical', 2],
    ]);
    const [a, b, c] = g.fragments as [(typeof g.fragments)[0], (typeof g.fragments)[0], (typeof g.fragments)[0]];
    for (const [outer, inner] of [[a, b], [b, c]] as const) {
      expect(inner.x).toBeGreaterThan(outer.x);
      expect(inner.x + inner.width).toBeLessThan(outer.x + outer.width);
      expect(inner.y).toBeGreaterThan(outer.y);
      expect(inner.y + inner.height).toBeLessThan(outer.y + outer.height);
    }
    expect(Object.keys(g.messages)).toEqual(['0.0.0.0.0.0.0']);
    // The outer frame stays inside the canvas.
    expect(a.x).toBeGreaterThanOrEqual(0);
  });

  it('a sync without reply inside a Fragment closes its activation at the end of the Fragment', async () => {
    const g = await geometryOf(
      model(`  interaction i {
    opt {
      cliente -> api "a"
    }
    cliente -> db "b"
  }`),
    );
    const frame = g.fragments[0]!;
    const ofApi = g.activations.find((a) => a.lifeline === 'api')!;
    expect(ofApi.y2).toBe(frame.y + frame.height);
    // The `db` one, outside any Fragment, lasts until the end of the Interaction.
    const ofDb = g.activations.find((a) => a.lifeline === 'db')!;
    expect(ofDb.y2).toBeGreaterThan(frame.y + frame.height);
  });

  it('a Fragment whose content falls outside the View disappears', async () => {
    const text = model(`  interaction i {
    cliente -> api "a"
    opt { cola -> db "x" }
  }`).replace('interaction i }', 'interaction i exclude cola }');
    expect((await geometryOf(text)).fragments).toEqual([]);
  });

  it('alt with and, and opt with else give invalid-fragment-operand with a hint, not syntax-error', async () => {
    const diagnose = (body: string) => openSession({ 'main.dg': model(`  interaction i {\n${body}\n  }`) }).diagnose();
    const crossed = await diagnose('alt { cliente -> api } and { cliente -> db }');
    expect(crossed.map((d) => d.code)).toEqual(['invalid-fragment-operand']);
    expect(crossed[0]!.hint).toContain('else');
    expect(crossed[0]!.line).toBe(8);
    const extra = await diagnose('opt { cliente -> api } else { cliente -> db }');
    expect(extra.map((d) => d.code)).toEqual(['invalid-fragment-operand']);
    expect(extra[0]!.hint).toBeDefined();
    const par = await diagnose('par { cliente -> api } else { cliente -> db }');
    expect(par.map((d) => d.code)).toEqual(['invalid-fragment-operand']);
    expect(par[0]!.hint).toContain('and');
  });

  it('a Message with an unknown end inside a Fragment is located in the text', async () => {
    const issues = await openSession({ 'main.dg': model('  interaction i {\n    opt {\n      cliente -> apii "a"\n    }\n  }') }).diagnose();
    expect(issues.map((d) => [d.code, d.line])).toEqual([['unknown-lifeline', 9]]);
  });
});

describe('session seam: create and destroy with Fragments', () => {
  const diagnostics = (interaction: string) => openSession({ 'main.dg': model(interaction) }).diagnose();

  it('create-not-first if the target appeared earlier in another Fragment or outside it', async () => {
    const res = await diagnostics(`  interaction i {
    opt { cliente -> db "x" }
    alt { create api -> db "abrir" } else { api -> cliente }
  }`);
    expect(res.map((i) => i.code)).toEqual(['create-not-first']);
    expect(res[0]!.related![0]!.line).toBeLessThan(res[0]!.line);
  });

  it('after-destroy if the destroy is in a Fragment and the appearance comes later, outside or inside', async () => {
    const res = await diagnostics(`  interaction i {
    opt { destroy cliente -> db }
    api -> db "tarde"
    loop { db -> cola }
  }`);
    expect(res.map((i) => i.code)).toEqual(['after-destroy', 'after-destroy']);
    expect(res[0]!.related![0]!.line).toBeLessThan(res[0]!.line);
  });

  it('valid create and destroy inside Fragments give no issues', async () => {
    expect(await diagnostics(`  interaction i {
    cliente -> api
    opt { create api -> db "abrir" }
    opt { destroy api -> db "cerrar" }
  }`)).toEqual([]);
  });

  it('in a Fragment the created header moves down to its Message and the destroyed line is cut at it', async () => {
    const g = await geometryOf(model(`  interaction i {
    cliente -> api "pedir"
    opt "nuevo" {
      create api -> db "abrir"
      api -> db "consulta"
      destroy api -> db "cerrar"
    }
    cliente -> api "fin"
  }`));
    const create = g.messages['1.0.0']!.points[0]!.y;
    const cut = g.messages['1.0.2']!.points[0]!.y;
    expect(g.nodes['db']!.y).toBeGreaterThan(g.nodes['cliente']!.y);
    expect(g.nodes['db']!.y + g.nodes['db']!.height / 2).toBe(create);
    expect(g.lifelines['db']!.y1).toBe(g.nodes['db']!.y + g.nodes['db']!.height);
    expect(g.lifelines['db']!.y2).toBe(cut);
    expect(g.lifelines['db']!.destroyed).toBe(true);
    expect(g.lifelines['api']!.destroyed).toBeUndefined();
  });

  it('a ref inside an alt stays inside the alt frame, also when it covers more Lifelines than the alt Messages', async () => {
    const g = await geometryOf(model(`  interaction otra { cliente -> cola "x" }
  interaction i {
    cliente -> api "pedir"
    alt "hay stock" {
      api -> db "reservar"
      ref otra
    }
  }`));
    const alt = g.fragments.find((m) => m.operator === 'alt')!;
    const ref = g.fragments.find((m) => m.operator === 'ref')!;
    expect(ref.x).toBeGreaterThanOrEqual(alt.x);
    expect(ref.x + ref.width).toBeLessThanOrEqual(alt.x + alt.width);
  });
});
