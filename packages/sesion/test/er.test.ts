import { describe, expect, it } from 'vitest';

import { idDeArista } from 'canonico';
import { abrirSesion } from 'sesion';

const MARCADOR_ER = 12;

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

/** Verifica los dos tramos finales de cada Arista de la Vista `tablas` de la Sesion. */
async function tramosFinales(sesion: ReturnType<typeof abrirSesion>) {
  const { geometry } = (await sesion.geometria('tablas'))!;
  if (geometry.kind !== 'grafo') throw new Error('se esperaba geometria de grafo');
  return sesion.fuente!.model.edges.flatMap((arista) => {
    const { points } = geometry.edges[idDeArista(arista)]!;
    return [points.slice(0, 2), points.slice(-2)] as const;
  });
}

describe('seam sesion: Vistas ER', () => {
  it('el ejemplo ER compila sin issues y sus tramos finales son horizontales y miden al menos el marcador', { timeout: 30000 }, async () => {
    // El primer diagnostico en frio carga la gramatica y el layout; con la maquina cargada pasa de los 5 s por defecto.
    const sesion = abrirSesion({ 'main.dg': ER });

    expect(await sesion.diagnosticar()).toEqual([]);
    const tramos = await tramosFinales(sesion);
    expect(tramos).toHaveLength(4);
    for (const [p, q] of tramos) {
      expect(p!.y).toBe(q!.y);
      expect(Math.abs(p!.x - q!.x)).toBeGreaterThanOrEqual(MARCADOR_ER);
    }
  });

  it('con Pins que dejan las tablas una sobre otra, el tramo final sigue siendo horizontal y largo', async () => {
    const pines = `view tablas { type er  include **
  node orders { pin 100,100 }  node customers { pin 110,400 }  node items { pin 400,100 } }`;
    const sesion = abrirSesion({ 'main.dg': ER.replace(/view tablas.*\n/, pines) });

    expect((await sesion.diagnosticar()).filter((i) => i.severity === 'error')).toEqual([]);
    for (const [p, q] of await tramosFinales(sesion)) {
      expect(p!.y).toBe(q!.y);
      expect(Math.abs(p!.x - q!.x)).toBeGreaterThanOrEqual(MARCADOR_ER);
    }
  });

  it('E_DUPLICATE_KEY_MARK senala la marca repetida y su fix la borra', async () => {
    const texto = `specification { node tabla }
model {
  tabla t {
    id: uuid pk fk pk
  }
}
`;
    const issues = await abrirSesion({ 'main.dg': texto }).diagnosticar();

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'E_DUPLICATE_KEY_MARK', severity: 'error', file: 'main.dg', line: 4, column: 20 });
    const { range, replacement } = issues[0]!.fix!;
    const linea = texto.split('\n')[3]!;
    expect(linea.slice(0, range.start.column - 1) + replacement + linea.slice(range.end.column - 1)).toBe('    id: uuid pk fk');
  });

  describe('E_ER_CARDINALITY', () => {
    const modelo = (cardinalidad: string, vista: string) => `specification { node tabla }
model {
  tabla a { id: int pk }
  tabla b { a_id: int fk }
  b#a_id "${cardinalidad}" -> "1" a#id
}
view v { type ${vista}  include ** }
`;

    it('una cardinalidad cercana a una canonica lleva fix con comillas', async () => {
      const texto = modelo('1.*', 'er');
      const issues = await abrirSesion({ 'main.dg': texto }).diagnosticar();

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ code: 'E_ER_CARDINALITY', severity: 'error', line: 5 });
      const { range, replacement } = issues[0]!.fix!;
      expect(replacement).toBe('"1..*"');
      expect(texto.split('\n')[4]!.slice(range.start.column - 1, range.end.column - 1)).toBe('"1.*"');
    });

    it('una cardinalidad lejana lleva hint con las cuatro validas y sin fix', async () => {
      const [issue] = await abrirSesion({ 'main.dg': modelo('muchos', 'er') }).diagnosticar();

      expect(issue).toMatchObject({ code: 'E_ER_CARDINALITY' });
      expect(issue!.fix).toBeUndefined();
      for (const valida of ['0..1', '1', '0..*', '1..*']) expect(issue!.hint).toContain(valida);
    });

    it('las cardinalidades canonicas y las Vistas de arquitectura no dan error', async () => {
      expect(await abrirSesion({ 'main.dg': modelo('0..*', 'er') }).diagnosticar()).toEqual([]);
      expect(await abrirSesion({ 'main.dg': modelo('muchos', 'architecture') }).diagnosticar()).toEqual([]);
    });
  });

  it('pk, fk, uk, er e identifying siguen valiendo como id de Nodo y de extremo', async () => {
    const texto = `specification { node er }
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
    const sesion = abrirSesion({ 'main.dg': texto });

    expect(await sesion.diagnosticar()).toEqual([]);
    expect(sesion.fuente!.model.nodes.map((n) => n.id)).toEqual(['pk', 'identifying', 'uk']);
    expect(sesion.fuente!.model.edges.map((e) => [e.from.node, e.to.node, e.identifying])).toEqual([
      ['identifying', 'uk', undefined],
      ['pk', 'identifying', undefined],
      ['uk', 'pk', true],
    ]);
  });

  it('fuera de ER las marcas se ignoran sin aviso y el Modelo las conserva', async () => {
    const texto = `specification { node tabla }
model {
  tabla t { id: uuid? pk uk "nota" }
  tabla u
  t -> u identifying
}
view arq { type architecture  include ** }
`;
    const sesion = abrirSesion({ 'main.dg': texto });

    expect(await sesion.diagnosticar()).toEqual([]);
    expect(sesion.fuente!.model.nodes[0]!.attributes[0]).toEqual({ name: 'id', type: 'uuid', notes: 'nota', keys: ['pk', 'uk'], optional: true });
    expect(sesion.fuente!.model.edges[0]!.identifying).toBe(true);
  });
});
