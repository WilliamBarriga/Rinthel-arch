import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';
import { layoutView } from 'layout';
import { adaptadorDeWorker } from 'shell';
import { TEMA_NEUTRO } from 'tema';

import { empaquetarShellDev } from '../packages/cli/src/dev-shell';

/**
 * El Worker de layout no valida Temas: la pagina resuelve el Tema una vez y le manda Metricas (ADR 0003,
 * enmienda), y `dev` lo empaqueta con un zod inerte. Si algo que el Worker importa llamara a zod, el bundle
 * real fallaria aqui. Se ejecuta el bundle que sirve `dev`, tal cual, con un `self` falso. Requiere los
 * paquetes construidos.
 */
describe('Worker de layout empaquetado', () => {
  it('calcula la misma geometria que layoutView sin validar el Tema', async () => {
    const fuente = fuenteCanonicaSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: {
        nodes: [
          { id: 'a', type: 'servicio', title: 'A', description: '', children: [] },
          { id: 'g', type: 'servicio', title: 'G', description: '', children: [{ id: 'g.b', type: 'servicio', title: 'B', description: '', children: [] }] },
        ],
        edges: [{ from: { node: 'a' }, to: { node: 'g.b' } }],
      },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], collapsed: [] }],
    });
    const vista = resolveView(fuente, 'v')!;
    const { worker } = await empaquetarShellDev();

    // Contexto con `self` como global, igual que un Web Worker.
    const global: Record<string, unknown> & { onmessage?: (e: { data: unknown }) => void; postMessage?: (m: unknown) => void } = { setTimeout, clearTimeout, queueMicrotask, console };
    global.self = global;
    const respuesta = new Promise<{ geometria?: unknown; error?: string }>((ok) => {
      global.postMessage = (m) => ok(m as never);
    });
    runInNewContext(worker, global);

    // La pagina arma la peticion con su adaptador; el Worker solo ve Metricas.
    const peticion = new Promise<unknown>((ok) => {
      void adaptadorDeWorker({ postMessage: ok, onmessage: null })(vista, TEMA_NEUTRO);
    });
    global.onmessage!({ data: await peticion });

    const { geometria, error } = await respuesta;
    expect(error).toBeUndefined();
    // ELK no posiciona dentro de un `vm` (sin su Worker propio), pero el tamano de cada caja y sus Slots
    // salen de las Metricas que recibio el Worker, y deben ser los mismos que con el Tema directo.
    const tamanos = (g: Awaited<ReturnType<typeof layoutView>>): unknown =>
      Object.fromEntries(Object.entries(g.nodes).filter(([id]) => id !== 'g').map(([id, c]) => [id, { w: c.width, h: c.height, slots: c.slots }]));
    expect(tamanos(geometria as never)).toEqual(tamanos(await layoutView(vista, TEMA_NEUTRO)));
  });
});
