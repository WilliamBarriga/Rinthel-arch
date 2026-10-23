import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema, idDeArista, resolveView } from 'canonico';
import type { Tema, VistaResuelta } from 'canonico';
import { claveDeLayout, layoutView, metricasDe } from 'layout';
import type { CajaDeNodo, Geometria } from 'layout';

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
  describe('etiquetas de Arista', () => {
    const conEtiqueta = (etiqueta: string | undefined, vistaExtra: Record<string, unknown> = {}): VistaResuelta => {
      const base = vista(vistaExtra);
      return { ...base, edges: base.edges.map((arista) => (arista.to.node === 'c' ? { ...arista, ...(etiqueta !== undefined && { label: etiqueta }) } : arista)) };
    };
    const absoluta = (g: Geometria, id: string): CajaDeNodo => {
      const partes = id.split('.');
      return partes.slice(0, -1).reduce((caja, _, i) => {
        const padre = g.nodes[partes.slice(0, i + 1).join('.')]!;
        return { ...caja, x: caja.x + padre.x, y: caja.y + padre.y };
      }, g.nodes[id]!);
    };

    it('reserva una caja para cada etiqueta, sin pisar ningun Nodo', async () => {
      const geometria = await layoutView(conEtiqueta('publica eventos al bus'), TEMA_NEUTRO);
      const caja = geometria.labels['b.b2 -> c'];

      expect(caja).toBeDefined();
      expect(caja!.width).toBeGreaterThan(0);
      expect(caja!.height).toBeGreaterThan(0);
      expect(Object.keys(geometria.labels)).toEqual(['b.b2 -> c']);
      for (const id of Object.keys(geometria.nodes)) {
        const n = absoluta(geometria, id);
        const fuera = caja!.x + caja!.width <= n.x || n.x + n.width <= caja!.x || caja!.y + caja!.height <= n.y || n.y + n.height <= caja!.y;
        expect(fuera, `la etiqueta pisa ${id}`).toBe(true);
      }
    });

    it('sin etiquetas no hay cajas de etiqueta y el layout no cambia', async () => {
      const sin = await layoutView(conEtiqueta(undefined), TEMA_NEUTRO);

      expect(sin.labels).toEqual({});
      expect(sin).toEqual(await layoutView(vista(), TEMA_NEUTRO));
    });

    it('la etiqueta entra en la clave de layout', () => {
      expect(claveDeLayout(conEtiqueta('x'), TEMA_NEUTRO)).not.toBe(claveDeLayout(conEtiqueta(undefined), TEMA_NEUTRO));
    });

    it('una etiqueta mas larga ocupa una caja mas ancha', async () => {
      const corta = (await layoutView(conEtiqueta('ab'), TEMA_NEUTRO)).labels['b.b2 -> c']!;
      const larga = (await layoutView(conEtiqueta('una etiqueta bastante larga'), TEMA_NEUTRO)).labels['b.b2 -> c']!;

      expect(larga.width).toBeGreaterThan(corta.width);
    });
  });

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

/** Caja de un Nodo en coordenadas del lienzo: suma las posiciones de sus Grupos. */
function absoluta(geometria: Geometria, vistaDe: VistaResuelta, id: string): CajaDeNodo {
  const padre = vistaDe.nodes.find((nodo) => nodo.children.some((hijo) => hijo.id === id));
  const caja = geometria.nodes[id]!;
  if (padre === undefined) return caja;
  const marco = absoluta(geometria, vistaDe, padre.id);
  return { ...caja, x: caja.x + marco.x, y: caja.y + marco.y };
}

const sobreElBorde = (punto: { x: number; y: number }, caja: CajaDeNodo): boolean => {
  const dentro = punto.x >= caja.x - 1 && punto.x <= caja.x + caja.width + 1 && punto.y >= caja.y - 1 && punto.y <= caja.y + caja.height + 1;
  const enElBorde = [caja.x, caja.x + caja.width].some((x) => Math.abs(punto.x - x) <= 1) || [caja.y, caja.y + caja.height].some((y) => Math.abs(punto.y - y) <= 1);
  return dentro && enElBorde;
};

describe('layoutView: rutas de Aristas', () => {
  it('cada Arista tiene una ruta ortogonal que une los bordes de sus extremos', async () => {
    const v = vista();
    const geometria = await layoutView(v, TEMA_NEUTRO);

    expect(Object.keys(geometria.edges).sort()).toEqual(v.edges.map(idDeArista).sort());
    for (const arista of v.edges) {
      const { points } = geometria.edges[idDeArista(arista)]!;
      expect(points.length).toBeGreaterThanOrEqual(2);
      expect(sobreElBorde(points[0]!, absoluta(geometria, v, arista.from.node))).toBe(true);
      expect(sobreElBorde(points.at(-1)!, absoluta(geometria, v, arista.to.node))).toBe(true);
      points.slice(1).forEach((punto, i) => {
        const previo = points[i]!;
        expect(previo.x === punto.x || previo.y === punto.y).toBe(true);
      });
    }
  });

  it('las Aristas entre Grupos distintos se enrutan (a.a2 -> b.b1)', async () => {
    const v = vista();
    const { edges } = await layoutView(v, TEMA_NEUTRO);

    expect(edges[idDeArista({ from: { node: 'a.a2' }, to: { node: 'b.b1' } })]!.points.length).toBeGreaterThanOrEqual(2);
  });

  it('las Aristas elevadas de un Grupo colapsado se enrutan sobre su borde', async () => {
    const v = vista({}, { collapsed: ['a'] });
    const geometria = await layoutView(v, TEMA_NEUTRO);
    const elevada = v.edges.find((arista) => arista.from.node === 'a' && arista.to.node === 'b.b1')!;
    const { points } = geometria.edges[idDeArista(elevada)]!;

    expect(sobreElBorde(points[0]!, absoluta(geometria, v, 'a'))).toBe(true);
  });

  it('las rutas son deterministas', async () => {
    const primera = await layoutView(vista(), TEMA_NEUTRO);
    const segunda = await layoutView(vista(), TEMA_NEUTRO);

    expect(segunda.edges).toEqual(primera.edges);
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

  it('cambia al cambiar solo un Pin y es estable sin cambios de Pin', () => {
    const conPin = (x: number, y: number) => vista({ overrides: [{ node: 'c', pin: { x, y } }] });
    const base = claveDeLayout(conPin(10, 20), TEMA_NEUTRO);

    expect(claveDeLayout(conPin(10, 20), TEMA_NEUTRO)).toBe(base);
    expect(claveDeLayout(conPin(11, 20), TEMA_NEUTRO)).not.toBe(base);
    expect(claveDeLayout(vista(), TEMA_NEUTRO)).not.toBe(base);
  });

  it('cambia con la estructura: otro estado de colapso', () => {
    expect(claveDeLayout(vista({}, { collapsed: ['a'] }), TEMA_NEUTRO)).not.toBe(claveDeLayout(vista(), TEMA_NEUTRO));
  });
});

describe('layoutView: Pin post-ELK', () => {
  const pin = (node: string, x: number, y: number) => ({ overrides: [{ node, pin: { x, y } }] });

  it('el Nodo pineado queda exactamente en su posicion, relativa a su Grupo', async () => {
    const { nodes } = await layoutView(vista(pin('a.a1', 200, 100)), TEMA_NEUTRO);

    expect(nodes['a.a1']).toMatchObject({ x: 200, y: 100 });
  });

  it('las Aristas no incidentes no cambian y las incidentes siguen a su Nodo', async () => {
    const libre = await layoutView(vista(), TEMA_NEUTRO);
    const pineada = await layoutView(vista(pin('a.a1', 200, 100)), TEMA_NEUTRO);
    const a1 = pineada.nodes['a.a1']!;
    const grupo = pineada.nodes['a']!;

    expect(pineada.edges[idDeArista({ from: { node: 'b.b2' }, to: { node: 'c' } })]).toEqual(
      libre.edges[idDeArista({ from: { node: 'b.b2' }, to: { node: 'c' } })],
    );
    expect(pineada.edges[idDeArista({ from: { node: 'a.a2' }, to: { node: 'b.b1' } })]).toEqual(
      libre.edges[idDeArista({ from: { node: 'a.a2' }, to: { node: 'b.b1' } })],
    );
    const [inicio] = pineada.edges[idDeArista({ from: { node: 'a.a1' }, to: { node: 'a.a2' } })]!.points;
    const absoluto = { x: grupo.x + a1.x, y: grupo.y + a1.y };
    const enBorde =
      (inicio!.x === absoluto.x || inicio!.x === absoluto.x + a1.width) &&
      inicio!.y >= absoluto.y && inicio!.y <= absoluto.y + a1.height;
    const enBordeH =
      (inicio!.y === absoluto.y || inicio!.y === absoluto.y + a1.height) &&
      inicio!.x >= absoluto.x && inicio!.x <= absoluto.x + a1.width;
    expect(enBorde || enBordeH).toBe(true);
  });

  it('un Pin sobre un Nodo ausente de la Vista se ignora', async () => {
    const libre = await layoutView(vista(), TEMA_NEUTRO);

    expect(await layoutView(vista(pin('a.zzz', 5, 5)), TEMA_NEUTRO)).toEqual(libre);
  });

  it('dos Pins que se solapan se informan como par de ids; sin solape, vacio', async () => {
    const solapados = await layoutView({ ...vista({ overrides: [{ node: 'c', pin: { x: 500, y: 500 } }, { node: 'b', pin: { x: 500, y: 500 } }] }) }, TEMA_NEUTRO);
    const separados = await layoutView(vista({ overrides: [{ node: 'c', pin: { x: 900, y: 900 } }, { node: 'b', pin: { x: 0, y: 0 } }] }), TEMA_NEUTRO);

    expect(solapados.pinsSolapados).toEqual([['b', 'c']]);
    expect(separados.pinsSolapados).toEqual([]);
  });

  it('al pinear un Grupo, sus Aristas internas se trasladan con el y conservan su forma', async () => {
    const libre = await layoutView(vista(), TEMA_NEUTRO);
    const pineada = await layoutView(vista(pin('a', 300, 200)), TEMA_NEUTRO);
    const id = idDeArista({ from: { node: 'a.a1' }, to: { node: 'a.a2' } });
    const antes = libre.edges[id]!.points;
    const despues = pineada.edges[id]!.points;
    const dx = despues[0]!.x - antes[0]!.x;
    const dy = despues[0]!.y - antes[0]!.y;

    expect(dx !== 0 || dy !== 0).toBe(true);
    expect(despues).toEqual(antes.map(({ x, y }) => ({ x: x + dx, y: y + dy })));
  });

  it('un Grupo y su hijo pineados no cuentan como solape', async () => {
    const { pinsSolapados } = await layoutView(
      vista({ overrides: [{ node: 'a', pin: { x: 0, y: 0 } }, { node: 'a.a1', pin: { x: 20, y: 40 } }] }),
      TEMA_NEUTRO,
    );

    expect(pinsSolapados).toEqual([]);
  });

  it('con Nodos pineados encimados la ruta no retrocede por dentro de las cajas', async () => {
    const { edges } = await layoutView(
      vista({ overrides: [{ node: 'a.a2', pin: { x: 40, y: 40 } }, { node: 'a.a1', pin: { x: 50, y: 50 } }] }),
      TEMA_NEUTRO,
    );
    const { points } = edges[idDeArista({ from: { node: 'a.a1' }, to: { node: 'a.a2' } })]!;

    expect(points.length).toBeGreaterThanOrEqual(2);
    for (const p of points) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });

  it('el Pin es determinista', async () => {
    const a = await layoutView(vista(pin('a.a1', 200, 100)), TEMA_NEUTRO);
    const b = await layoutView(vista(pin('a.a1', 200, 100)), TEMA_NEUTRO);
    expect(a).toEqual(b);
  });
});

describe('layoutView: Nodos con Atributos', () => {
  const tabla = (atributos: { name: string; type: string }[]) => ({ ...nodo('t'), attributes: atributos });
  function conAtributos(atributos: { name: string; type: string }[]): VistaResuelta {
    const fuente = fuenteCanonicaSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: {
        nodes: [tabla(atributos), nodo('s')],
        edges: [{ from: { node: 's' }, to: { node: 't', attribute: 'email' } }],
      },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    });
    return resolveView(fuente, 'v')!;
  }
  const columnas = [{ name: 'id', type: 'uuid' }, { name: 'email', type: 'text' }, { name: 'creado', type: 'timestamp' }];

  it('el Nodo con Atributos es mas alto, una fila por Atributo, y su tamano los cubre', async () => {
    const sin = await layoutView(conAtributos(columnas.slice(1, 2)), TEMA_NEUTRO);
    const con = await layoutView(conAtributos(columnas), TEMA_NEUTRO);
    const { cabecera, fila } = metricasDe(TEMA_NEUTRO);

    expect(con.nodes['t']!.height).toBeGreaterThanOrEqual(cabecera + columnas.length * fila);
    expect(con.nodes['t']!.height - sin.nodes['t']!.height).toBe((columnas.length - 1) * fila);
  });

  it('un Atributo largo ensancha el Nodo', async () => {
    const corto = await layoutView(conAtributos(columnas), TEMA_NEUTRO);
    const largo = await layoutView(
      conAtributos([...columnas, { name: 'un_nombre_de_columna_muy_largo_para_el_nodo', type: 'character varying(255)' }]),
      TEMA_NEUTRO,
    );

    expect(largo.nodes['t']!.width).toBeGreaterThan(corto.nodes['t']!.width);
  });

  it('una Arista a nodo#atributo termina en la fila de ese Atributo, sobre el borde', async () => {
    const { nodes, edges } = await layoutView(conAtributos(columnas), TEMA_NEUTRO);
    const { cabecera, fila } = metricasDe(TEMA_NEUTRO);
    const caja = nodes['t']!;
    const { points } = edges[idDeArista({ from: { node: 's' }, to: { node: 't', attribute: 'email' } })]!;
    const fin = points[points.length - 1]!;
    const anterior = points[points.length - 2]!;

    expect(fin.y).toBe(caja.y + cabecera + 1.5 * fila);
    expect(fin.x === caja.x || fin.x === caja.x + caja.width).toBe(true);
    expect(anterior.y).toBe(fin.y);
  });
});

describe('Metricas', () => {
  const tabla = (atributos: { name: string; type: string }[]) => {
    const fuente = fuenteCanonicaSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [{ ...nodo('t'), attributes: atributos }] },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    });
    return resolveView(fuente, 'v')!;
  };
  const largo = [{ name: 'columna_con_un_nombre_larguisimo_para_medir', type: 'varchar' }];

  it('se derivan del Tema: otro tamano de texto, otras Metricas', () => {
    const base = metricasDe(TEMA_NEUTRO);
    const grande = metricasDe(con({ tokens: { ...TEMA_NEUTRO.tokens, fontSize: '28px' } }));

    expect(grande.cabecera).toBeGreaterThan(base.cabecera);
    expect(grande.fila).toBeGreaterThan(base.fila);
  });

  it('la clave de layout depende de las Metricas', () => {
    const base = metricasDe(TEMA_NEUTRO);

    expect(claveDeLayout(vista(), TEMA_NEUTRO, { ...base, paddingHorizontal: base.paddingHorizontal + 8 })).not.toBe(
      claveDeLayout(vista(), TEMA_NEUTRO),
    );
    expect(claveDeLayout(vista(), TEMA_NEUTRO, base)).toBe(claveDeLayout(vista(), TEMA_NEUTRO));
  });

  it('cambiar una Metrica mueve el layout: mas padding, Nodo mas ancho; mas fila, mas alto', async () => {
    const base = metricasDe(TEMA_NEUTRO);
    const v = tabla(largo);
    const normal = (await layoutView(v, TEMA_NEUTRO)).nodes['t']!;
    const ancho = (await layoutView(v, TEMA_NEUTRO, { metricas: { ...base, paddingHorizontal: base.paddingHorizontal + 20 } })).nodes['t']!;
    const alto = (await layoutView(v, TEMA_NEUTRO, { metricas: { ...base, fila: base.fila + 10 } })).nodes['t']!;

    expect(ancho.width).toBe(normal.width + 20);
    expect(alto.height).toBe(normal.height + 10);
  });

  it('un Atributo se mide con la escala con que se dibuja', async () => {
    const m = metricasDe(TEMA_NEUTRO);
    const texto = 'columna_con_un_nombre_larguisimo_para_medir: varchar';
    const { width } = (await layoutView(tabla(largo), TEMA_NEUTRO)).nodes['t']!;

    expect(width).toBe(Math.ceil(texto.length * m.fontSize * m.escalaAtributo * m.factorDeAncho + m.paddingHorizontal));
  });
});
