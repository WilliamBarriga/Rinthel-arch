import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, idDeArista, resolveView } from 'canonico';
import type { Tema, VistaResuelta } from 'canonico';
import { claveDeLayout, layoutView } from 'layout';
import { TEMA_NEUTRO, metricasDe } from 'tema';

const capas = [
  { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 0, minWidth: 0, minHeight: 0 } } },
  { nombre: 'relleno', primitiva: { tipo: 'solid', props: { color: 'blue' } } },
];
const conTipos = (tipos: Record<string, unknown[]>, capasBase: unknown[] = capas) =>
  ({ ...TEMA_NEUTRO, nodo: { ...TEMA_NEUTRO.nodo, capas: capasBase, tipos } }) as Tema;
const grande = conTipos({ db: [{ nombre: 'forma', props: { minWidth: 240, minHeight: 100 } }] });

const nodo = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, type, title: id, description: '', children: [], ...extra });

function vistaDe(nodes: unknown[], edges: unknown[]): VistaResuelta {
  const fuente = fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }, { name: 'db' }] },
    model: { nodes, edges },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  });
  return resolveView(fuente, 'v')!;
}
const dosTipos = (): VistaResuelta => vistaDe([nodo('api', 'servicio'), nodo('datos', 'db')], [{ from: { node: 'api' }, to: { node: 'datos' }, label: 'lee' }]);

describe('Metricas por Tipo y relayout por clave de estructura', () => {
  it('cajas distintas por Tipo en una misma Vista', async () => {
    const g = await layoutView(dosTipos(), grande);

    expect(g.nodes['datos']).toMatchObject({ width: 240, height: 100 });
    expect(g.nodes['api']).toMatchObject({ width: 120 });
    expect(g.nodes['api']!.height).toBeLessThan(100);
  });

  it('un Tema con Metricas identicas reutiliza la clave de layout aunque cambie la pintura', () => {
    const otraPintura = conTipos({ db: [{ nombre: 'forma', props: { minWidth: 240, minHeight: 100, radius: 20 } }] }, [
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
    const m = metricasDe(TEMA_NEUTRO);
    const ruta = g.edges[idDeArista(v.edges[0]!)]!.points;

    expect(ruta[ruta.length - 1]!.y).toBe(g.nodes['t']!.y + m.cabecera + m.fila / 2);
  });
});
