import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const model = (interactions: string, view = 'view v { type sequence\n interaction i }') => `specification { node servicio }
model {
  servicio cliente
  servicio api
  servicio db
  servicio cola
${interactions}
}
${view}
`;

async function geometryOf(text: string) {
  const geometry = (await openSession({ 'main.dg': text }).geometry('v'))?.geometry;
  if (geometry?.kind !== 'secuencia') throw new Error('expected the sequence geometry');
  return geometry;
}

const spacing = (g: Awaited<ReturnType<typeof geometryOf>>, a: string, b: string): number => Math.abs(g.lifelines[b]!.x - g.lifelines[a]!.x);

describe('session seam: sequence Notes and ref', () => {
  it('a Note is not a participant and `over X, Y` widens the spacing between X and Y', async () => {
    const without = model('  interaction i {\n    cliente -> api "a"\n    note over cliente, api "x"\n  }');
    const longText = 'una nota muy larga que obliga a separar las columnas bastante mas de lo normal';
    const withLong = model(`  interaction i {\n    cliente -> api "a"\n    note over cliente, api "${longText}"\n  }`);
    expect(await openSession({ 'main.dg': withLong }).diagnose()).toEqual([]);
    const short = await geometryOf(without);
    const g = await geometryOf(withLong);
    expect(Object.keys(g.lifelines).sort()).toEqual(['api', 'cliente']);
    expect(g.notes).toHaveLength(1);
    expect(spacing(g, 'cliente', 'api')).toBeGreaterThan(spacing(short, 'cliente', 'api'));
    const note = g.notes[0]!;
    // The Note covers both Lifelines, sits below the Message and its text wraps over several lines.
    expect(note.x).toBeLessThanOrEqual(g.lifelines['cliente']!.x);
    expect(note.x + note.width).toBeGreaterThanOrEqual(g.lifelines['api']!.x);
    expect(note.y).toBeGreaterThan(g.messages['0']!.points[0]!.y);
    expect(note.lines.length).toBeGreaterThan(1);
    expect(note.lines.join(' ')).toBe(longText);
    expect(g.height).toBeGreaterThan(note.y + note.height);
  });

  it('left of and right of anchor the Note to one side of the Lifeline', async () => {
    const g = await geometryOf(model('  interaction i {\n    cliente -> api "a"\n    note left of cliente "izq"\n    note right of api "der"\n  }'));
    const [left, right] = g.notes as [(typeof g.notes)[0], (typeof g.notes)[0]];
    expect(left.x + left.width).toBeLessThanOrEqual(g.lifelines['cliente']!.x);
    expect(right.x).toBeGreaterThanOrEqual(g.lifelines['api']!.x);
    expect(g.width).toBeGreaterThanOrEqual(right.x + right.width);
    expect(left.x).toBeGreaterThanOrEqual(0);
  });

  it('the ref frame covers the participants of the referenced Interaction present in the View', async () => {
    const g = await geometryOf(
      model('  interaction login { api -> db "auth" }\n  interaction i {\n    cliente -> api "a"\n    api -> db "b"\n    cola -> cliente "z"\n    ref login\n  }'),
    );
    const frame = g.fragments.find((m) => m.operator === 'ref')!;
    expect(frame.title?.text).toBe('login');
    expect(frame.x).toBeGreaterThan(g.lifelines['cliente']!.x);
    expect(frame.x).toBeLessThan(g.lifelines['api']!.x);
    expect(frame.x + frame.width).toBeGreaterThan(g.lifelines['db']!.x);
    expect(frame.x + frame.width).toBeLessThan(g.lifelines['cola']!.x);
    expect(frame.y).toBeGreaterThan(g.messages['2']!.points[0]!.y);
  });

  it('with no participants in common the ref frame covers every Lifeline', async () => {
    const g = await geometryOf(model('  interaction otra { db -> cola "x" }\n  interaction i {\n    cliente -> api "a"\n    ref otra\n  }'));
    const frame = g.fragments.find((m) => m.operator === 'ref')!;
    expect(frame.x).toBeLessThan(g.lifelines['cliente']!.x);
    expect(frame.x + frame.width).toBeGreaterThan(g.lifelines['api']!.x);
  });

  it('a cyclic ref (an Interaction that references itself) is valid', async () => {
    const text = model('  interaction i {\n    cliente -> api "a"\n    ref i\n  }');
    expect(await openSession({ 'main.dg': text }).diagnose()).toEqual([]);
  });
});
