import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fuenteCanonicaSchema } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva, hashesDeFamilias } from 'shell';
import type { AdaptadorDeLayout } from 'shell';
import { TEMA_NEUTRO } from 'tema';
import type { MedidasDeTexto, TemaResuelto } from 'tema';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [{ id: 'a', type: 'servicio', title: 'a', description: '', children: [] }], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});
const geometria: Geometria = { nodes: { a: { x: 0, y: 0, width: 100, height: 50 } }, edges: {}, labels: {}, pinsSolapados: [], width: 100, height: 50 };
const CAVEAT: TemaResuelto = { ...TEMA_NEUTRO, fonts: { body: 'Caveat', mono: 'Caveat', fallback: 'cursive' } };
const ARCHIVOS = { 'fuentes/caveat-latin-400-normal.woff2': 'h400', 'fuentes/caveat-latin-700-normal.woff2': 'h700', 'fuentes/inter-latin-400-normal.woff2': 'hi' };
const url = (ruta: string): string => `/fuentes/${ruta}`;

describe('hashesDeFamilias', () => {
  it('une los hashes de los archivos de cada familia declarada y omite las demas', () => {
    expect(hashesDeFamilias(CAVEAT.fonts, ARCHIVOS)).toEqual({ Caveat: 'h400+h700' });
  });
});

describe('VistaInteractiva con fuentes del Workspace', () => {
  it('declara el @font-face de las fuentes del Tema con la URL del consumidor, antes de calcular la geometria', () => {
    const layout: AdaptadorDeLayout = () => new Promise(() => undefined);
    const { container } = render(<VistaInteractiva source={fuente} view="v" theme={CAVEAT} layout={layout} width={400} height={300} fontFiles={ARCHIVOS} fontUrl={url} />);

    const hoja = container.querySelector('style[data-fuentes]')?.textContent ?? '';
    expect(hoja).toContain('font-family:"Caveat"');
    expect(hoja).toContain('url("/fuentes/fuentes/caveat-latin-700-normal.woff2")');
    expect(hoja).not.toContain('Inter');
  });

  it('mide con la fuente real tras cargarla y entrega al layout las medidas con el hash de la fuente', async () => {
    const orden: string[] = [];
    vi.stubGlobal('document', Object.assign(document, { fonts: { load: async (fuente: string) => void orden.push(`carga ${fuente}`) } }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ font: '', measureText: () => ({ width: 77 }) } as unknown as CanvasRenderingContext2D);
    const recibidas: (MedidasDeTexto | undefined)[] = [];
    const layout: AdaptadorDeLayout = async (_vista, _tema, medidas) => (recibidas.push(medidas), geometria);

    render(<VistaInteractiva source={fuente} view="v" theme={CAVEAT} layout={layout} width={400} height={300} fontFiles={ARCHIVOS} fontUrl={url} />);
    await waitFor(() => expect(recibidas).toHaveLength(1));

    expect(orden[0]).toMatch(/^carga \d+(\.\d+)?px "Caveat"$/);
    expect(recibidas[0]).toMatchObject({ nivel: 'medido', fuentes: { Caveat: 'h400+h700' } });
    expect(Object.values(recibidas[0]!.anchos)).toContain(77);
  });

  it('sin fontFiles no declara fuentes y el layout estima', async () => {
    const recibidas: (MedidasDeTexto | undefined)[] = [];
    const layout: AdaptadorDeLayout = async (_vista, _tema, medidas) => (recibidas.push(medidas), geometria);

    const { container } = render(<VistaInteractiva source={fuente} view="v" theme={CAVEAT} layout={layout} width={400} height={300} />);
    await waitFor(() => expect(recibidas).toHaveLength(1));

    expect(container.querySelector('style[data-fuentes]')).toBeNull();
    expect(recibidas[0]).toBeUndefined();
  });

  it('sin fontUrl y con un Tema que declara fuentes no genericas, el panel de issues avisa en vez de medir en silencio con otra fuente', async () => {
    const layout: AdaptadorDeLayout = async () => geometria;
    const { container } = render(<VistaInteractiva source={fuente} view="v" theme={CAVEAT} layout={layout} width={400} height={300} />);

    const panel = container.querySelector('[data-panel="issues"]');
    expect(panel?.textContent).toContain('1 warning');
    (panel?.querySelector('button') as HTMLButtonElement).click();
    await waitFor(() => expect(panel?.textContent).toContain('W_THEME_FONT_NOT_SERVED'));
    expect(panel?.textContent).toContain('Caveat');
  });

  it('con fontUrl, o con un Tema de familias genericas, no avisa', () => {
    const layout: AdaptadorDeLayout = async () => geometria;
    const conUrl = render(<VistaInteractiva source={fuente} view="v" theme={CAVEAT} layout={layout} width={400} height={300} fontFiles={ARCHIVOS} fontUrl={url} />);
    expect(conUrl.container.querySelector('[data-panel="issues"]')).toBeNull();
    cleanup();
    const generico = render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={layout} width={400} height={300} />);
    expect(generico.container.querySelector('[data-panel="issues"]')).toBeNull();
  });
});
