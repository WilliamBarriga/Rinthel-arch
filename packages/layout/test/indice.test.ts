import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';
import type { VistaResuelta } from 'canonico';
import { indiceDeGeometria } from 'layout';

const nodo = (id: string, children: unknown[] = []) => ({ id, type: 'servicio', title: id.split('.').pop(), description: '', children });

/** a { a1 { a1x } a2 }, c. */
function vista(estado = {}): VistaResuelta {
  const fuente = fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: { nodes: [nodo('a', [nodo('a.a1', [nodo('a.a1.x')]), nodo('a.a2')]), nodo('c')] },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  });
  return resolveView(fuente, 'v', estado)!;
}

const caja = (x: number, y: number) => ({ x, y, width: 10, height: 10 });

describe('indiceDeGeometria', () => {
  it('suma las posiciones de los Grupos ancestros en cada caja absoluta', () => {
    const indice = indiceDeGeometria(vista(), {
      nodes: { a: caja(100, 200), 'a.a1': caja(10, 20), 'a.a1.x': caja(1, 2), 'a.a2': caja(5, 6), c: caja(7, 8) },
    });
    expect(indice.cajas.get('a')).toEqual(caja(100, 200));
    expect(indice.cajas.get('a.a1')).toEqual(caja(110, 220));
    expect(indice.cajas.get('a.a1.x')).toEqual(caja(111, 222));
    expect(indice.cajas.get('a.a2')).toEqual(caja(105, 206));
    expect(indice.cajas.get('c')).toEqual(caja(7, 8));
  });

  it('da el padre de cada Nodo anidado y las raices son los que nadie anida', () => {
    const indice = indiceDeGeometria(vista(), { nodes: {} });
    expect(Object.fromEntries(indice.padre)).toEqual({ 'a.a1': 'a', 'a.a1.x': 'a.a1', 'a.a2': 'a' });
    expect(indice.raices.map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('un Grupo colapsado es una hoja: sus hijos no entran', () => {
    const indice = indiceDeGeometria(vista({ collapsed: ['a'] }), { nodes: { a: caja(3, 4), c: caja(0, 0) } });
    expect([...indice.cajas.keys()].sort()).toEqual(['a', 'c']);
    expect(indice.padre.size).toBe(0);
    expect(indice.raices.map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('omite los Nodos sin caja en la geometria', () => {
    const indice = indiceDeGeometria(vista(), { nodes: { a: caja(1, 1), c: caja(2, 2) } });
    expect([...indice.cajas.keys()].sort()).toEqual(['a', 'c']);
  });
});
