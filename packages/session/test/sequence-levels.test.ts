import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonical';
import type { SequenceView } from 'canonical';
import { openSession } from 'session';

const model = (interaction: string, views: string) => `specification { node servicio }
model {
  servicio cliente
  servicio sistema {
    servicio api
    servicio db
  }
  servicio cola
${interaction}
}
${views}`;

const scenario = `  interaction i {
    cliente -> sistema.api "pedir"
    sistema.api -> sistema.db "consultar"
    reply sistema.db -> sistema.api "filas"
    sistema.api -> cola "evento"
    reply sistema.api -> cliente "ok"
  }`;

function resolve(text: string, view = 'v') {
  const session = openSession({ 'main.dg': text });
  const resolved = resolveView(session.source!, view) as SequenceView;
  return { session, resolved, messages: resolved.interaction.messages };
}

describe('session seam: depth, collapsed and exclude in sequence', () => {
  it('depth merges the children into their Group and an inner Message becomes a self message', async () => {
    const text = model(scenario, 'view v { type sequence\n interaction i\n depth 1 }\n');
    const { session, resolved, messages } = resolve(text);
    expect(await session.diagnose()).toEqual([]);
    expect(resolved.nodes.map((n) => n.id)).toEqual(['cliente', 'sistema', 'cola']);
    expect(messages.map((m) => [m.from, m.to])).toEqual([
      ['cliente', 'sistema'],
      ['sistema', 'sistema'],
      ['sistema', 'sistema'],
      ['sistema', 'cola'],
      ['sistema', 'cliente'],
    ]);
    const g = (await session.geometry('v'))!.geometry;
    if (g.kind !== 'secuencia') throw new Error('secuencia');
    // The self message draws the loop (4 points).
    expect(g.messages['1']!.points).toHaveLength(4);
  });

  it('collapsed on a Group does the same as depth for that Group', () => {
    const { resolved } = resolve(model(scenario, 'view v { type sequence\n interaction i\n collapsed sistema }\n'));
    expect(resolved.nodes.map((n) => n.id)).toEqual(['cliente', 'sistema', 'cola']);
  });

  it('exclude removes the Lifeline and its Messages, and a Fragment left empty disappears', () => {
    const text = model(
      `  interaction i {
    cliente -> sistema.api "pedir"
    opt "con cache" {
      sistema.api -> sistema.db "leer"
    }
    reply sistema.api -> cliente "ok"
  }`,
      'view v { type sequence\n interaction i\n exclude sistema.db }\n',
    );
    const { resolved, messages } = resolve(text);
    expect(resolved.nodes.map((n) => n.id)).toEqual(['cliente', 'sistema.api']);
    expect(messages.map((m) => m.path)).toEqual(['0', '2']);
    expect(resolved.interaction.items.map((i) => i.type)).toEqual(['message', 'message']);
  });

  it('exclude of a Collapsed group also removes the Messages of its children', () => {
    const { messages } = resolve(model(scenario, 'view v { type sequence\n interaction i\n depth 1\n exclude sistema }\n'));
    expect(messages).toEqual([]);
  });
});

describe('session seam: autonumber', () => {
  const views = `view completa { type sequence
 interaction i
 autonumber }
view sin_db { type sequence
 interaction i
 exclude sistema.db
 autonumber }
view sin_numero { type sequence
 interaction i }
`;

  it('numbers the projected Messages, replies included, and the number goes into the label', () => {
    const { messages } = resolve(model(scenario, views), 'completa');
    expect(messages.map((m) => m.label)).toEqual(['1. pedir', '2. consultar', '3. filas', '4. evento', '5. ok']);
  });

  it('two Views of the same Interaction number differently according to their exclude', () => {
    const { messages } = resolve(model(scenario, views), 'sin_db');
    expect(messages.map((m) => m.label)).toEqual(['1. pedir', '2. evento', '3. ok']);
  });

  it('a Message without a label is numbered with the number alone', () => {
    const text = model('  interaction i {\n    cliente -> cola\n  }', 'view v { type sequence\n interaction i\n autonumber }\n');
    expect(resolve(text).messages.map((m) => m.label)).toEqual(['1']);
  });

  it('changing autonumber changes the layout key (and the cached geometry)', async () => {
    const session = openSession({ 'main.dg': model(scenario, views) });
    const numbered = (await session.geometry('completa'))!;
    const plain = (await session.geometry('sin_numero'))!;
    expect(numbered.layoutKey).not.toBe(plain.layoutKey);
  });

  it('autonumber outside a sequence View is view-property-for-type', async () => {
    const session = openSession({ 'main.dg': model(scenario, 'view v { type architecture\n include **\n autonumber }\n') });
    const issues = await session.diagnose();
    expect(issues.map((i) => i.code)).toContain('view-property-for-type');
  });

  it('a ref whose Lifelines are merged into a Collapsed group frames only the Group Lifeline', async () => {
    const text = model(`  interaction otra { sistema.api -> sistema.db "x" }
  interaction i {
    cliente -> sistema.api "pedir"
    ref otra
    sistema.api -> cola "evento"
  }`, 'view v { type sequence\n interaction i\n depth 1 }\n');
    const g = (await openSession({ 'main.dg': text }).geometry('v'))!.geometry;
    if (g.kind !== 'secuencia') throw new Error('secuencia');
    const ref = g.fragments.find((m) => m.operator === 'ref')!;
    expect(ref.x).toBeGreaterThan(g.lifelines['cliente']!.x);
    expect(ref.x + ref.width).toBeLessThan(g.lifelines['cola']!.x);
    expect(ref.x).toBeLessThan(g.lifelines['sistema']!.x);
    expect(ref.x + ref.width).toBeGreaterThan(g.lifelines['sistema']!.x);
  });
});
