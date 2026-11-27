import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, edgeId, resolveView } from 'canonical';
import type { Theme, GraphView, ResolvedView } from 'canonical';
import { claveDeLayout, layoutConMetricas, layoutView as layoutDeVista } from 'layout';
import { NEUTRAL_THEME, textKey, metricsOf, metricsTable } from 'theme';

/** `layoutView` de una Vista de grafo (architecture o flow): estas pruebas miran cajas y rutas de Aristas. */
const layoutView = async (...args: Parameters<typeof layoutDeVista>) => {
  const geometria = await layoutDeVista(...args);
  if (geometria.kind !== 'grafo') throw new Error('se esperaba una Geometria de grafo');
  return geometria;
};


const capas = [
  { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 0 } } },
  { nombre: 'relleno', primitiva: { tipo: 'solid', props: { color: 'blue' } } },
];
const conTipos = (tipos: Record<string, unknown[]>, capasBase: unknown[] = capas) =>
  ({ ...NEUTRAL_THEME, nodo: { ...NEUTRAL_THEME.nodo, capas: capasBase, tipos } }) as Theme;
const grande = conTipos({ db: [{ nombre: 'forma', primitiva: 'circle', props: {} }] });

const nodo = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, type, title: id, description: '', children: [], ...extra });

function vistaDe(nodes: unknown[], edges: unknown[]): GraphView {
  const fuente = canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }, { name: 'db' }] },
    model: { nodes, edges },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  });
  return resolveView(fuente, 'v') as GraphView;
}
const dosTipos = (): ResolvedView => vistaDe([nodo('api', 'servicio'), nodo('datos', 'db')], [{ from: { node: 'api' }, to: { node: 'datos' }, label: 'lee' }]);

describe('Metricas por Tipo y relayout por clave de estructura', () => {
  it('cajas distintas por Tipo en una misma Vista', async () => {
    const g = await layoutView(dosTipos(), grande);

    expect(g.nodes['datos']!.width).toBe(g.nodes['datos']!.height);
    expect(g.nodes['api']!.width).not.toBe(g.nodes['api']!.height);
  });

  it('un Tema con Metricas identicas reutiliza la clave de layout aunque cambie la pintura', () => {
    const otraPintura = conTipos({ db: [{ nombre: 'forma', primitiva: 'circle', props: {} }] }, [
      capas[0],
      { nombre: 'relleno', primitiva: { tipo: 'solid', props: { color: 'red' } } },
      { nombre: 'aura', primitiva: { tipo: 'border', props: { color: 'red', width: 4 } } },
    ]);

    expect(claveDeLayout(dosTipos(), otraPintura)).toBe(claveDeLayout(dosTipos(), grande));
    expect(claveDeLayout(dosTipos(), grande)).not.toBe(claveDeLayout(dosTipos(), conTipos({})));
  });

  it('la Arista a nodo#atributo termina en la fila dibujada aunque el Tipo cambie la caja', async () => {
    const v = vistaDe(
      [nodo('api', 'servicio'), nodo('t', 'db', { attributes: [{ name: 'id', type: 'uuid' }] })],
      [{ from: { node: 'api' }, to: { node: 't', attribute: 'id' } }],
    );
    const g = await layoutView(v, grande);
    const m = metricsOf(NEUTRAL_THEME, 'architecture');
    const ruta = g.edges[edgeId(v.edges[0]!)]!.points;

    const caja = g.nodes['t']!;
    // El tipo `db` es un circulo: el contenido (cabecera + una fila) va centrado en su caja cuadrada.
    const arriba = (caja.height - (m.cabecera + m.fila)) / 2;

    expect(ruta[ruta.length - 1]!.y).toBe(caja.y + arriba + m.cabecera + m.fila / 2);
  });
});

describe('medicion de texto en el layout', () => {
  const tema = NEUTRAL_THEME as unknown as Theme;
  const una = (): ResolvedView => vistaDe([nodo('api', 'servicio')], []);
  const medidasDe = (ancho: number, hash = 'aaaa') => {
    const m = metricsTable(tema, 'architecture').base;
    return { nivel: 'medido' as const, fuentes: { sans: hash }, anchos: { [textKey(NEUTRAL_THEME.fonts.body, m.fontSize, 'api')]: ancho } };
  };

  it('con medidas la caja sale del ancho medido; sin ellas, de la estimacion', async () => {
    const estimada = await layoutView(una(), tema);
    const medida = await layoutView(una(), tema, { medidas: medidasDe(400) });

    expect(medida.nodes['api']!.width).toBe(400 + metricsTable(tema, 'architecture').base.paddingHorizontal);
    expect(estimada.nodes['api']!.width).toBe(120);
  });

  it('la clave cambia con el origen de las medidas y con el hash de fuente, y con nada mas de la pintura', () => {
    const clave = (m?: ReturnType<typeof medidasDe>) => claveDeLayout(una(), tema, metricsTable(tema, 'architecture', m));
    const repintado = { ...tema, palette: { ...tema.palette, blue: '#ff0000' } } as Theme;

    expect(clave(medidasDe(400))).not.toBe(clave());
    expect(clave(medidasDe(400, 'bbbb'))).not.toBe(clave(medidasDe(400)));
    expect(claveDeLayout(una(), repintado, metricsTable(repintado, 'architecture'))).toBe(clave());
  });
});

describe('layout de secuencia exige Metricas de secuencia', () => {
  const secuencia = (): ResolvedView => {
    const fuente = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: {
        nodes: [nodo('a', 'servicio'), nodo('b', 'servicio')],
        interactions: [{ id: 'i', title: 'I', items: [{ type: 'message', from: 'a', to: 'b', label: 'x', kind: 'sync' }] }],
      },
      views: [{ id: 'v', type: 'sequence', interaction: 'i', include: [], exclude: [] }],
    });
    return resolveView(fuente, 'v')!;
  };

  it('una tabla de Vista de arquitectura lanza error en vez de caer en defectos', async () => {
    await expect(layoutConMetricas(secuencia(), metricsTable(NEUTRAL_THEME, 'architecture'))).rejects.toThrow(/sequence part/);
  });

  it('la tabla de Tipo sequence lo coloca', async () => {
    expect((await layoutConMetricas(secuencia(), metricsTable(NEUTRAL_THEME, 'sequence'))).kind).toBe('secuencia');
  });
});
