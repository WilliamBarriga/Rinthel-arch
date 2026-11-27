import { describe, expect, it } from 'vitest';

import { openSession } from 'session';
import { colocarNodo, contenidoDeNodo, pilaDeFila, piezasDeAtributo } from 'tema';

const ER = `specification { node tabla }
model {
  tabla orders "Pedidos" {
    id: uuid pk
    customer_id: uuid pk fk
    email: text? uk
  }
  tabla customers "Clientes" {
    id: uuid pk
    name: text
  }
  orders#customer_id "1..*" -> "1" customers#id "pertenece" identifying
}
view tablas { type er  include ** }
view arq { type architecture  include ** }
`;
const PALETTE = `palette { papel "#fefce8"  tinta "#1f2937"  azul "#2563eb"  verde "#16a34a"  rojo "#dc2626" }`;
const NODE = `  node {
    layer forma rect { radius 6 }
    layer relleno solid { color papel }
    layer borde border { color tinta width 1 }
    slots { title attrs }
    NODE_EXTRA
  }`;
const theme = (nodeExtra = '', rest = '') => ({ 'main.dg': `${ER}theme t {\n  ${PALETTE}\n${NODE.replace('NODE_EXTRA', nodeExtra)}\n${rest}\n}\n`.replace('view tablas { type er  include ** }', 'view tablas { type er  include **  theme t }').replace('view arq { type architecture  include ** }', 'view arq { type architecture  include **  theme t }') });

describe('session seam: ER Theme, zone', () => {
  it('a Layer with zone header reaches the Resolved style of the table', async () => {
    const session = openSession(theme('layer cab solid { color azul  zone header }'));

    expect((await session.diagnose()).filter((i) => i.severity === 'error')).toEqual([]);
    const header = session.style('tablas')!.pintura.nodo.capas.find((c) => c.nombre === 'cab')!;
    expect(header.props['zone']).toBe('header');
    expect(header.props['color']).toBe('#2563eb');
  });

  it('zone accepts all, header and body; any other value is a Theme issue', async () => {
    const issues = await openSession(theme('layer cab solid { color azul  zone pie }')).diagnose();

    expect(issues.map((i) => i.code)).toEqual(['theme-invalid-value']);
  });
});

const ROW = (body: string): ReturnType<typeof theme> => theme('', `  row {\n${body}\n  }`);
const colors = (session: ReturnType<typeof openSession>, view: string, row: Parameters<typeof pilaDeFila>[1]): string[] => {
  const paint = session.style(view)!.pintura.fila;
  return paint === undefined ? [] : pilaDeFila(paint, row).map((c) => String(c.props['color']));
};
const plain = { impar: false, keys: [], opcional: false } as const;

describe('session seam: ER Theme, row block', () => {
  it('a key pk patch changes the Resolved style only of the rows with that key', async () => {
    const session = openSession(ROW('    layer fondo solid { color papel }\n    key pk { layer fondo { color verde } }'));

    expect((await session.diagnose()).filter((i) => i.severity === 'error')).toEqual([]);
    expect(colors(session, 'tablas', { ...plain, keys: ['pk'] })).toEqual(['#16a34a']);
    expect(colors(session, 'tablas', { ...plain, keys: ['fk'] })).toEqual(['#fefce8']);
    expect(colors(session, 'tablas', plain)).toEqual(['#fefce8']);
  });

  it('keys stack in pk, fk, uk order and optional goes after; alternate paints the odd rows', () => {
    const session = openSession(
      ROW(`    layer fondo solid { color papel }
    alternate { layer fondo { color tinta } }
    key pk { layer fondo { color verde } }
    key fk { layer fondo { color azul } }
    optional { layer fondo { color rojo } }`),
    );

    expect(colors(session, 'tablas', { impar: true, keys: [], opcional: false })).toEqual(['#1f2937']);
    expect(colors(session, 'tablas', { impar: true, keys: ['fk', 'pk'], opcional: false })).toEqual(['#2563eb']);
    expect(colors(session, 'tablas', { impar: false, keys: ['pk'], opcional: true })).toEqual(['#dc2626']);
  });

  it('the size of row name and type changes the measured size and the table width; key changes the chip', () => {
    const measured = (body: string) => {
      const m = openSession(ROW(body)).style('tablas')!.metricas;
      const orders = { name: 'email', type: 'text', optional: true, keys: ['uk'] } as never;
      const node = { id: 'orders', type: 'tabla', title: 'Pedidos', description: '', children: [], attributes: [orders], source: [] } as never;
      return { m, pieces: piezasDeAtributo(orders, m), width: colocarNodo({ ...contenidoDeNodo(node, m), atributos: [orders] }, m).width };
    };
    const base = measured('    layer fondo solid { color papel }');
    const large = measured('    layer fondo solid { color papel }\n    name { size 2 }\n    type { size 1.5 }\n    key { size 1.2 }');

    expect(base.pieces).toHaveLength(1);
    expect(large.pieces.map((p) => p.tamano)).toEqual([large.m.fontSize * 2, large.m.fontSize * large.m.escalaAtributo, large.m.fontSize * 1.5]);
    expect(large.m.fila).toBeGreaterThanOrEqual(Math.ceil(large.m.fontSize * 2 * 1.4));
    expect(large.width).toBeGreaterThan(base.width);
    expect(measured('    height 40\n    name { size 2 }').m.fila).toBe(40);
  });

  it('the row block only applies in an ER View', () => {
    const session = openSession(ROW('    layer fondo solid { color verde }'));

    expect(session.style('tablas')!.pintura.fila).toBeDefined();
    expect(session.style('arq')!.pintura.fila).toBeUndefined();
  });

  it('the name, type and key (chip) text style reaches the Resolved style', () => {
    const session = openSession(ROW('    name { color tinta  weight 600 }\n    type { color azul }\n    key { fill azul  color papel  radius 4 }'));

    const { textos } = session.style('tablas')!.pintura.fila!;
    expect(textos.name?.props).toMatchObject({ color: '#1f2937', weight: 600 });
    expect(textos.type?.props['color']).toBe('#2563eb');
    expect(textos.key).toMatchObject({ tipo: 'chip', props: { fill: '#2563eb', radius: 4 } });
  });

  it('the row height changes the Geometry of the ER tables and not the architecture one', async () => {
    const height = async (dsl: ReturnType<typeof theme>, view: string) => {
      const { geometry } = (await openSession(dsl).geometry(view))!;
      if (geometry.kind !== 'grafo') throw new Error('graph');
      return geometry.nodes['orders']!.height;
    };
    const without = theme();
    const withHeight = ROW('    height 40');

    expect(await height(withHeight, 'tablas')).toBeGreaterThan(await height(without, 'tablas'));
    expect(await height(withHeight, 'arq')).toBe(await height(without, 'arq'));
    expect(openSession(withHeight).style('tablas')!.metricas.fila).toBe(40);
  });

  it('an invalid value or an unknown key are Theme issues, with a fix for typos', async () => {
    const height = await openSession(ROW('    height 500')).diagnose();
    const key = await openSession(ROW('    layer fondo solid { color papel }\n    key pq { layer fondo { color verde } }')).diagnose();
    const text = await openSession(ROW('    names { color tinta }')).diagnose();

    expect(height.map((i) => i.code)).toEqual(['theme-invalid-value']);
    expect(key.map((i) => i.code)).toEqual(['theme-invalid-value']);
    expect(key[0]!.fix?.replacement).toBe('pk');
    expect(text.map((i) => i.code)).toEqual(['theme-invalid-value']);
    expect(text[0]!.fix?.replacement).toBe('name');
  });

  it('a row patch cannot change the box', async () => {
    const issues = await openSession(ROW('    layer fondo solid { color papel }\n    key pk { layer fondo circle }')).diagnose();

    expect(issues.map((i) => i.code)).toContain('theme-state-touches-metrics');
  });
});
