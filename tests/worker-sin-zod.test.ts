import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import { layoutView } from 'layout';
import { adaptadorDeWorker } from 'shell';
import { TEMA_NEUTRO } from 'tema';

import { activosDelEstudio } from 'estudio';

/** El bundle del Worker que produce el build de `estudio` y sirve `dev`. */
const workerDelEstudio = (): string => readFileSync(activosDelEstudio().archivos['worker.js']!, 'utf8');

/**
 * Ejecuta el bundle del Worker que sirve `dev` (con zod inerte) con un `self` falso: si algo que importa llamara a zod,
 * fallaria aqui. Requiere los paquetes construidos (incluido `estudio`).
 */
describe('Worker de layout empaquetado', () => {
  it('calcula la misma geometria que layoutView sin validar el Tema', async () => {
    const fuente = canonicalFormSchema.parse({
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
    const worker = workerDelEstudio();

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
  }, 30_000);

  it('una Vista de secuencia da en el Worker la misma geometria que en Node', async () => {
    const fuente = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: {
        nodes: [
          { id: 'a', type: 'servicio', title: 'A', description: '', children: [] },
          { id: 'b', type: 'servicio', title: 'B', description: '', children: [] },
        ],
        edges: [],
        interactions: [{ id: 'i', title: 'I', items: [{ type: 'message', from: 'a', to: 'b', label: 'ida' }, { type: 'message', kind: 'reply', from: 'b', to: 'a' }] }],
      },
      views: [{ id: 'v', type: 'sequence', interaction: 'i' }],
    });
    const vista = resolveView(fuente, 'v')!;
    const worker = workerDelEstudio();
    const global: Record<string, unknown> & { onmessage?: (e: { data: unknown }) => void; postMessage?: (m: unknown) => void } = { setTimeout, clearTimeout, queueMicrotask, console };
    global.self = global;
    const respuesta = new Promise<{ geometria?: unknown; error?: string }>((ok) => {
      global.postMessage = (m) => ok(m as never);
    });
    runInNewContext(worker, global);
    const peticion = new Promise<unknown>((ok) => {
      void adaptadorDeWorker({ postMessage: ok, onmessage: null })(vista, TEMA_NEUTRO);
    });
    global.onmessage!({ data: await peticion });

    const { geometria, error } = await respuesta;
    expect(error).toBeUndefined();
    expect(geometria).toEqual(await layoutView(vista, TEMA_NEUTRO));
    expect((geometria as { kind: string }).kind).toBe('secuencia');
  }, 30_000);
});
