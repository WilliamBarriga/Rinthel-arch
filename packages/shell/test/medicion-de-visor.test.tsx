import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva, adaptadorDeWorker, medirEnVisor, servirLayout } from 'shell';
import type { AdaptadorDeLayout, PuertoDeMensajes } from 'shell';
import { TEMA_NEUTRO, claveDeTexto } from 'tema';
import type { MedidasDeTexto, TextoAMedir } from 'tema';

afterEach(cleanup);

const nodo = (id: string) => ({ id, type: 'servicio', title: id, description: '', children: [] });
const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [nodo('a')], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});

describe('medirEnVisor', () => {
  it('carga cada fuente antes de medir y devuelve anchos por clave con el hash de cada fuente', async () => {
    const orden: string[] = [];
    const textos: TextoAMedir[] = [
      { familia: 'Inter', tamano: 14, texto: 'hola' },
      { familia: 'Inter', tamano: 12, texto: 'x' },
    ];

    const medidas = await medirEnVisor(textos, {
      hashes: { Inter: 'abcd1234' },
      cargar: async (fuente, texto) => void orden.push(`carga ${fuente} ${texto}`),
      ancho: (fuente, texto) => (orden.push(`mide ${fuente} ${texto}`), texto.length * 10),
    });

    expect(orden.indexOf('carga 14px Inter hola')).toBeLessThan(orden.indexOf('mide 14px Inter hola'));
    expect(orden.indexOf('carga 12px Inter x')).toBeLessThan(orden.indexOf('mide 12px Inter x'));
    expect(medidas).toEqual({
      nivel: 'medido',
      fuentes: { Inter: 'abcd1234' },
      anchos: { [claveDeTexto('Inter', 14, 'hola')]: 40, [claveDeTexto('Inter', 12, 'x')]: 10 },
    });
  });
});

describe('VistaInteractiva con medicion real', () => {
  const geometria: Geometria = { nodes: { a: { x: 0, y: 0, width: 100, height: 50 } }, edges: {}, labels: {}, pinsSolapados: [], width: 100, height: 50 };

  it('espera las medidas y se las entrega al layout; sin medidor el layout no las recibe', async () => {
    const recibidas: (MedidasDeTexto | undefined)[] = [];
    const layout: AdaptadorDeLayout = async (_vista, _tema, medidas) => (recibidas.push(medidas), geometria);
    const medidas: MedidasDeTexto = { nivel: 'medido', fuentes: { sans: 'h1' }, anchos: {} };
    let pedidos: TextoAMedir[] = [];

    const { container } = render(
      <VistaInteractiva
        source={fuente}
        view="v"
        theme={TEMA_NEUTRO}
        layout={layout}
        width={400}
        height={300}
        measure={async (textos) => ((pedidos = textos), medidas)}
      />,
    );
    await waitFor(() => expect(container.querySelector('[data-id="a"]')).not.toBeNull());

    expect(pedidos.map((t) => t.texto)).toContain('a');
    expect(recibidas).toEqual([medidas]);
  });
});

describe('layout en Worker con medidas', () => {
  it('las medidas viajan en la peticion y llegan a layoutView', async () => {
    const [pagina, worker] = (() => {
      const crear = (): PuertoDeMensajes & { destino?: PuertoDeMensajes } => {
        const p: PuertoDeMensajes & { destino?: PuertoDeMensajes } = {
          onmessage: null,
          postMessage(m) {
            const copia = structuredClone(m);
            setTimeout(() => p.destino?.onmessage?.({ data: copia }), 0);
          },
        };
        return p;
      };
      const a = crear();
      const b = crear();
      a.destino = b;
      b.destino = a;
      return [a, b];
    })();
    servirLayout(worker);
    const adaptador = adaptadorDeWorker(pagina);
    const vista = { ...(await import('canonico')).resolveView(fuente, 'v')! };
    const m = TEMA_NEUTRO.fonts['body']!;
    const fontSize = 14;

    const sin = await adaptador(vista, TEMA_NEUTRO);
    const con = await adaptador(vista, TEMA_NEUTRO, { nivel: 'medido', fuentes: {}, anchos: { [claveDeTexto(m, fontSize, 'a')]: 600 } });

    expect(sin.nodes['a']!.width).toBe(120);
    expect(con.nodes['a']!.width).toBe(632);
  });
});
