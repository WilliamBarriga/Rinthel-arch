import { describe, expect, it } from 'vitest';

import { edgeId } from 'canonical';
import { openSession } from 'session';

const ER_MARKER = 12;

const ER = `specification { node tabla }
model {
  tabla orders "Pedidos" {
    id: uuid pk
    customer_id: uuid pk fk
    email: text? uk "unico"
  }
  tabla customers "Clientes" {
    id: uuid pk
    name: text
  }
  tabla items {
    order_id: uuid fk
    sku: text
  }
  orders#customer_id "1..*" -> "1" customers#id "pertenece" identifying
  items#order_id "0..*" -> "1" orders#id
}
view tablas { type er  include ** }
`;

/** The two final segments of each Edge of the View `tablas` of the Session. */
async function finalSegments(session: ReturnType<typeof openSession>) {
  const { geometry } = (await session.geometry('tablas'))!;
  if (geometry.kind !== 'grafo') throw new Error('expected a graph geometry');
  return session.source!.model.edges.flatMap((edge) => {
    const { points } = geometry.edges[edgeId(edge)]!;
    return [points.slice(0, 2), points.slice(-2)] as const;
  });
}

describe('session seam: ER Views', () => {
  it('the ER example compiles without issues and its final segments are horizontal and at least as long as the marker', { timeout: 30000 }, async () => {
    // The first cold diagnosis loads the grammar and the layout; on a loaded machine it goes past the default 5 s.
    const session = openSession({ 'main.dg': ER });

    expect(await session.diagnose()).toEqual([]);
    const segments = await finalSegments(session);
    expect(segments).toHaveLength(4);
    for (const [p, q] of segments) {
      expect(p!.y).toBe(q!.y);
      expect(Math.abs(p!.x - q!.x)).toBeGreaterThanOrEqual(ER_MARKER);
    }
  });

  it('with Pins that put the tables one above the other, the final segment is still horizontal and long', async () => {
    const pins = `view tablas { type er  include **
  node orders { pin 100,100 }  node customers { pin 110,400 }  node items { pin 400,100 } }`;
    const session = openSession({ 'main.dg': ER.replace(/view tablas.*\n/, pins) });

    expect((await session.diagnose()).filter((i) => i.severity === 'error')).toEqual([]);
    for (const [p, q] of await finalSegments(session)) {
      expect(p!.y).toBe(q!.y);
      expect(Math.abs(p!.x - q!.x)).toBeGreaterThanOrEqual(ER_MARKER);
    }
  });

  it('duplicate-key-mark points at the repeated mark and its fix removes it', async () => {
    const text = `specification { node tabla }
model {
  tabla t {
    id: uuid pk fk pk
  }
}
`;
    const issues = await openSession({ 'main.dg': text }).diagnose();

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'duplicate-key-mark', severity: 'error', file: 'main.dg', line: 4, column: 20 });
    const { range, replacement } = issues[0]!.fix!;
    const line = text.split('\n')[3]!;
    expect(line.slice(0, range.start.column - 1) + replacement + line.slice(range.end.column - 1)).toBe('    id: uuid pk fk');
  });

  describe('er-cardinality', () => {
    const model = (cardinality: string, view: string) => `specification { node tabla }
model {
  tabla a { id: int pk }
  tabla b { a_id: int fk }
  b#a_id "${cardinality}" -> "1" a#id
}
view v { type ${view}  include ** }
`;

    it('a cardinality close to a canonical one carries a fix with quotes', async () => {
      const text = model('1.*', 'er');
      const issues = await openSession({ 'main.dg': text }).diagnose();

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ code: 'er-cardinality', severity: 'error', line: 5 });
      const { range, replacement } = issues[0]!.fix!;
      expect(replacement).toBe('"1..*"');
      expect(text.split('\n')[4]!.slice(range.start.column - 1, range.end.column - 1)).toBe('"1.*"');
    });

    it('a distant cardinality carries a hint with the four valid ones and no fix', async () => {
      const [issue] = await openSession({ 'main.dg': model('muchos', 'er') }).diagnose();

      expect(issue).toMatchObject({ code: 'er-cardinality' });
      expect(issue!.fix).toBeUndefined();
      for (const valid of ['0..1', '1', '0..*', '1..*']) expect(issue!.hint).toContain(valid);
    });

    it('canonical cardinalities and architecture Views give no error', async () => {
      expect(await openSession({ 'main.dg': model('0..*', 'er') }).diagnose()).toEqual([]);
      expect(await openSession({ 'main.dg': model('muchos', 'architecture') }).diagnose()).toEqual([]);
    });
  });

  it('pk, fk, uk, er and identifying are still valid as Node and end ids', async () => {
    const text = `specification { node er }
model {
  er pk { fk: int uk }
  er identifying
  er uk
  identifying -> uk
  pk "1" -> "0..*" identifying
  uk -> pk identifying
}
view er { type er  include ** }
`;
    const session = openSession({ 'main.dg': text });

    expect(await session.diagnose()).toEqual([]);
    expect(session.source!.model.nodes.map((n) => n.id)).toEqual(['pk', 'identifying', 'uk']);
    expect(session.source!.model.edges.map((e) => [e.from.node, e.to.node, e.identifying])).toEqual([
      ['identifying', 'uk', undefined],
      ['pk', 'identifying', undefined],
      ['uk', 'pk', true],
    ]);
  });

  it('outside ER the marks are ignored without warning and the Model keeps them', async () => {
    const text = `specification { node tabla }
model {
  tabla t { id: uuid? pk uk "nota" }
  tabla u
  t -> u identifying
}
view arq { type architecture  include ** }
`;
    const session = openSession({ 'main.dg': text });

    expect(await session.diagnose()).toEqual([]);
    expect(session.source!.model.nodes[0]!.attributes[0]).toEqual({ name: 'id', type: 'uuid', notes: 'nota', keys: ['pk', 'uk'], optional: true });
    expect(session.source!.model.edges[0]!.identifying).toBe(true);
  });
});
