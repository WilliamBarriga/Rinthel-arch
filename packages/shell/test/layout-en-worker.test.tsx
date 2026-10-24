import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';
import { layoutView } from 'layout';
import { VistaInteractiva, adaptadorDeWorker, servirLayout } from 'shell';
import type { PuertoDeMensajes } from 'shell';
import { TEMA_NEUTRO } from 'tema';
import { posicionDe } from './ayudas';

afterEach(cleanup);

/** Par de puertos en memoria que copian los mensajes como lo haria un Worker (structured clone, asincrono). */
function parDePuertos(): [PuertoDeMensajes, PuertoDeMensajes] {
  const crear = (): PuertoDeMensajes & { destino?: PuertoDeMensajes } => {
    const puerto: PuertoDeMensajes & { destino?: PuertoDeMensajes } = {
      onmessage: null,
      postMessage(mensaje) {
        const copia = structuredClone(mensaje);
        setTimeout(() => puerto.destino?.onmessage?.({ data: copia }), 0);
      },
    };
    return puerto;
  };
  const a = crear();
  const b = crear();
  a.destino = b;
  b.destino = a;
  return [a, b];
}

const nodo = (id: string, title: string, children: unknown[] = []) => ({ id, type: 'servicio', title, description: '', children });
const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: {
    nodes: [nodo('c', 'C'), nodo('g', 'G', [nodo('g.a', 'A'), nodo('g.b', 'B')])],
    edges: [{ from: { node: 'c' }, to: { node: 'g.a' } }],
  },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], collapsed: ['g'] }],
});

describe('layout en Worker', () => {
  it('da la misma geometria que layoutView directo (mismo codigo en Node y Worker)', async () => {
    const [pagina, worker] = parDePuertos();
    servirLayout(worker);
    const vista = resolveView(fuente, 'v', { expanded: ['g'] })!;
    const porWorker = await adaptadorDeWorker(pagina)(vista, TEMA_NEUTRO);
    expect(porWorker).toEqual(await layoutView(vista, TEMA_NEUTRO));
  });

  it('un fallo del layout en el Worker rechaza la promesa del adaptador', async () => {
    const [pagina, worker] = parDePuertos();
    servirLayout(worker, { elk: { layout: () => Promise.reject(new Error('elk roto')) } as never });
    const vista = resolveView(fuente, 'v')!;
    await expect(adaptadorDeWorker(pagina)(vista, TEMA_NEUTRO)).rejects.toThrow('elk roto');
  });

  it('integracion con ELK real: expandir un Grupo mantiene su posicion en pantalla', async () => {
    const [pagina, worker] = parDePuertos();
    servirLayout(worker);
    const { container } = render(
      <VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={adaptadorDeWorker(pagina)} width={800} height={600} morphMs={0} />,
    );
    const ids = () => [...container.querySelectorAll('[data-id]')].map((e) => e.getAttribute('data-id'));
    const pantalla = () => {
      const t = posicionDe(container, 'g')!;
      const vb = container.querySelector('[data-diagram]')!.getAttribute('data-camara')!.split(' ').map(Number);
      return [t[0] - vb[0]!, t[1] - vb[1]!];
    };
    await waitFor(() => expect(ids()).toEqual(['c', 'g']), { timeout: 5000 });
    const antes = pantalla();

    fireEvent.click(container.querySelector('[data-toggle="g"]')!);
    await waitFor(() => expect(ids()).toContain('g.a'), { timeout: 5000 });
    expect(pantalla()[0]).toBeCloseTo(antes[0]!, 5);
    expect(pantalla()[1]).toBeCloseTo(antes[1]!, 5);
  });
});
