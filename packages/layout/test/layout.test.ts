import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema, resolveView } from 'canonico';
import type { Tema, VistaResuelta } from 'canonico';
import { claveDeLayout, layoutView } from 'layout';

const nodo = (id: string, children: unknown[] = []) => ({
  id,
  type: 'servicio',
  title: id.split('.').pop(),
  description: '',
  children,
});

/** a { a1 a2 a3 }, b { b1 b2 }, c; aristas entre Grupos y a un hijo de otro Grupo. */
function vista(vistaExtra: Record<string, unknown> = {}, estado = {}): VistaResuelta {
  const fuente = fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: {
      nodes: [
        nodo('a', [nodo('a.a1'), nodo('a.a2'), nodo('a.a3')]),
        nodo('b', [nodo('b.b1'), nodo('b.b2')]),
        nodo('c'),
      ],
      edges: [
        { from: { node: 'a.a1' }, to: { node: 'a.a2' } },
        { from: { node: 'a.a2' }, to: { node: 'b.b1' } },
        { from: { node: 'b.b2' }, to: { node: 'c' } },
      ],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], ...vistaExtra }],
  });
  const resuelta = resolveView(fuente, 'v', estado);
  if (resuelta === undefined) throw new Error('Vista inexistente');
  return resuelta;
}

const con = (cambios: Partial<Tema>): Tema => ({ ...TEMA_NEUTRO, ...cambios });

describe('layoutView', () => {
  it('cada Nodo visible tiene tamano positivo y posicion relativa a su Grupo', async () => {
    const geometria = await layoutView(vista(), TEMA_NEUTRO);

    expect(Object.keys(geometria.nodes).sort()).toEqual(['a', 'a.a1', 'a.a2', 'a.a3', 'b', 'b.b1', 'b.b2', 'c']);
    for (const caja of Object.values(geometria.nodes)) {
      expect(caja.width).toBeGreaterThan(0);
      expect(caja.height).toBeGreaterThan(0);
    }
  });

  it('los hijos quedan contenidos en su Grupo', async () => {
    const { nodes } = await layoutView(vista(), TEMA_NEUTRO);

    for (const [grupo, hijos] of [['a', ['a.a1', 'a.a2', 'a.a3']], ['b', ['b.b1', 'b.b2']]] as const) {
      const marco = nodes[grupo]!;
      for (const id of hijos) {
        const hijo = nodes[id]!;
        expect(hijo.x).toBeGreaterThanOrEqual(0);
        expect(hijo.y).toBeGreaterThanOrEqual(0);
        expect(hijo.x + hijo.width).toBeLessThanOrEqual(marco.width);
        expect(hijo.y + hijo.height).toBeLessThanOrEqual(marco.height);
      }
    }
  });

  it('los hermanos no se solapan', async () => {
    const { nodes } = await layoutView(vista(), TEMA_NEUTRO);
    const hermanos = ['a.a1', 'a.a2', 'a.a3'].map((id) => nodes[id]!);

    for (const [i, p] of hermanos.entries()) {
      for (const q of hermanos.slice(i + 1)) {
        const separados =
          p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y;
        expect(separados).toBe(true);
      }
    }
  });

  it('la misma entrada produce la misma geometria', async () => {
    const primera = await layoutView(vista(), TEMA_NEUTRO);
    const segunda = await layoutView(vista(), TEMA_NEUTRO);

    expect(segunda).toEqual(primera);
  });

  it('un Grupo colapsado es un Nodo hoja con su propio tamano', async () => {
    const { nodes } = await layoutView(vista({}, { collapsed: ['a'] }), TEMA_NEUTRO);

    expect(Object.keys(nodes).sort()).toEqual(['a', 'b', 'b.b1', 'b.b2', 'c']);
  });

  it('un texto de fuente mayor da Nodos mas anchos', async () => {
    const largo = vista({ overrides: [{ node: 'c', label: 'Servicio de facturacion' }] });
    const normal = await layoutView(largo, con({ tokens: { ...TEMA_NEUTRO.tokens, fontSize: '14px' } }));
    const grande = await layoutView(largo, con({ tokens: { ...TEMA_NEUTRO.tokens, fontSize: '28px' } }));

    expect(grande.nodes['c']!.width).toBeGreaterThan(normal.nodes['c']!.width);
    expect(grande.nodes['c']!.height).toBeGreaterThan(normal.nodes['c']!.height);
  });

  it('el label de un override cuenta para el tamano', async () => {
    const largo = vista({ overrides: [{ node: 'c', label: 'Un nombre bastante largo para este Nodo' }] });

    const base = await layoutView(vista(), TEMA_NEUTRO);
    const conLabel = await layoutView(largo, TEMA_NEUTRO);

    expect(conLabel.nodes['c']!.width).toBeGreaterThan(base.nodes['c']!.width);
  });
});

describe('claveDeLayout', () => {
  it('cambia con la fuente o el tamano de texto', () => {
    const base = claveDeLayout(vista(), TEMA_NEUTRO);

    expect(claveDeLayout(vista(), con({ fonts: { ...TEMA_NEUTRO.fonts, body: 'Inter' } }))).not.toBe(base);
    expect(claveDeLayout(vista(), con({ tokens: { ...TEMA_NEUTRO.tokens, fontSize: '20px' } }))).not.toBe(base);
  });

  it('no cambia con la paleta, los colores ni los iconos', () => {
    const base = claveDeLayout(vista(), TEMA_NEUTRO);
    const otraPaleta = con({ palette: { ...TEMA_NEUTRO.palette, blue: '#000000' }, tokens: { ...TEMA_NEUTRO.tokens, background: '#000' } });
    const coloreada = vista({ overrides: [{ node: 'c', color: 'blue' }] });

    expect(claveDeLayout(vista(), otraPaleta)).toBe(base);
    expect(claveDeLayout(coloreada, TEMA_NEUTRO)).toBe(base);
  });

  it('cambia con la estructura: otro estado de colapso', () => {
    expect(claveDeLayout(vista({}, { collapsed: ['a'] }), TEMA_NEUTRO)).not.toBe(claveDeLayout(vista(), TEMA_NEUTRO));
  });
});
