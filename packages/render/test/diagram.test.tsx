import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema, resolveView, revealAt } from 'canonico';
import type { VistaResuelta } from 'canonico';
import { layoutView } from 'layout';
import type { Geometria } from 'layout';
import { Diagram, renderToSvgString, resolverEstilo } from 'render';
import type { DiagramProps } from 'render';

const nodo = (id: string, title: string, children: unknown[] = []) => ({ id, type: 'servicio', title, description: '', children });

/** a { a1 a2 } -> b -> c, con dos pasos: primero `a`, luego `b` y `c`. */
function vista(estado = {}, steps: unknown[] = []): VistaResuelta {
  const fuente = fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: {
      nodes: [nodo('a', 'A', [nodo('a.a1', 'A1'), nodo('a.a2', 'A2')]), nodo('b', 'B'), nodo('c', 'C')],
      edges: [
        { from: { node: 'a.a1' }, to: { node: 'b' } },
        { from: { node: 'b' }, to: { node: 'c' } },
      ],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], steps }],
  });
  return resolveView(fuente, 'v', estado)!;
}

const PASOS = [
  { title: 'uno', show: [{ selector: 'a.**' }, { selector: 'a' }], hide: [] },
  { title: 'dos', show: [{ selector: 'b' }, { selector: 'c' }], hide: [] },
];

async function props(view: VistaResuelta, extra: Partial<DiagramProps> = {}): Promise<DiagramProps> {
  const geometry: Geometria = await layoutView(view, TEMA_NEUTRO);
  return { view, geometry, theme: TEMA_NEUTRO, width: 800, height: 600, ...extra };
}

/** Recorre el arbol de elementos que devuelve el componente (sin DOM). */
function buscar(nodo: ReactNode, quien: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (nodo === null || typeof nodo !== 'object') return undefined;
  if (Array.isArray(nodo)) return nodo.map((n) => buscar(n, quien)).find((e) => e !== undefined);
  const elemento = nodo as ReactElement<Record<string, unknown>>;
  if (quien(elemento)) return elemento;
  return buscar(elemento.props?.['children'] as ReactNode, quien);
}

const opacidadDe = (html: string, marca: string): string | undefined =>
  new RegExp(`<g data-id="${marca}"[^>]*><g data-part="nodo"( opacity="([\\d.]+)")?`).exec(html)?.[2];

describe('Diagram', () => {
  it('dibuja Nodos, Grupos y Aristas como un SVG', async () => {
    const html = renderToStaticMarkup(<Diagram {...await props(vista())} />);

    expect(html).toMatch(/^<svg [^>]*width="800" height="600" viewBox="0 0 \d+ \d+"/);
    for (const id of ['a', 'a.a1', 'a.a2', 'b', 'c']) expect(html).toContain(`data-id="${id}"`);
    expect(html).toContain('data-edge="a.a1 -&gt; b"');
  });

  it('visibility 0, 1 y fraccion se reflejan en la opacidad de Nodos y Aristas', async () => {
    const visibility = (id: string): number => ({ b: 0, c: 0.5, 'b -> c': 0.25 })[id] ?? 1;
    const html = renderToStaticMarkup(<Diagram {...await props(vista(), { visibility })} />);

    expect(opacidadDe(html, 'b')).toBe('0');
    expect(opacidadDe(html, 'c')).toBe('0.5');
    expect(opacidadDe(html, 'a.a1')).toBeUndefined();
    expect(html).toMatch(/<g data-edge="b -&gt; c" opacity="0.25"/);
    expect(html).not.toMatch(/<g data-edge="a.a1 -&gt; b" opacity/);
  });

  it('un Grupo colapsado es un Nodo unico con contador y sin hijos', async () => {
    const html = renderToStaticMarkup(<Diagram {...await props(vista({ collapsed: ['a'] }))} />);

    expect(html).toContain('A (2)');
    expect(html).not.toContain('data-id="a.a1"');
    expect(html).toContain('data-edge="a -&gt; b"');
  });

  it('con revealAt el resultado coincide con el paso esperado', async () => {
    const view = vista({}, PASOS);
    const base = await props(view);
    const enPaso = (k: number): string => renderToStaticMarkup(<Diagram {...base} visibility={revealAt(view, k)} />);

    expect(opacidadDe(enPaso(1), 'a.a1')).toBeUndefined();
    expect(opacidadDe(enPaso(1), 'b')).toBe('0');
    expect(opacidadDe(enPaso(2), 'b')).toBeUndefined();
    expect(opacidadDe(enPaso(1.5), 'b')).toBe('0.5');
  });

  it('sin estado propio: las mismas props producen el mismo arbol', async () => {
    const p = await props(vista(), { visibility: (id) => (id === 'c' ? 0.3 : 1) });

    expect(renderToStaticMarkup(<Diagram {...p} />)).toBe(renderToStaticMarkup(<Diagram {...p} />));
    expect(JSON.stringify(Diagram(p))).toBe(JSON.stringify(Diagram(p)));
  });

  it('un Nodo o Arista con visibilidad 0 no recibe clics', async () => {
    const visibility = (id: string): number => (id === 'b' || id === 'b -> c' ? 0 : 1);
    const html = renderToStaticMarkup(<Diagram {...await props(vista(), { visibility })} />);

    expect(html).toMatch(/<g data-part="nodo" opacity="0" pointer-events="none"/);
    expect(html).toMatch(/<g data-edge="b -&gt; c" opacity="0" pointer-events="none"/);
    expect(html).not.toMatch(/<g data-part="nodo" opacity="0" pointer-events="none"[^>]*>[\s\S]*?data-id="a\.a1"/);
  });

  it('dos Diagram con temas distintos no comparten el id del marcador de flecha', async () => {
    const oscuro = { ...TEMA_NEUTRO, tokens: { ...TEMA_NEUTRO.tokens, border: '#4b5563' } };
    const id = (html: string): string => /<marker id="([^"]+)"/.exec(html)![1]!;
    const a = renderToStaticMarkup(<Diagram {...await props(vista())} />);
    const b = renderToStaticMarkup(<Diagram {...await props(vista(), { theme: oscuro })} />);

    expect(id(a)).not.toBe(id(b));
    expect(b).toContain(`url(#${id(b)})`);
  });

  it('cambiar un valor del Estilo cambia por igual el SVG exportado y Diagram', async () => {
    const base = await props(vista());
    const estilo = resolverEstilo(TEMA_NEUTRO);
    const otro = { ...estilo, nodo: { ...estilo.nodo, radio: 13, relleno: '#fafafa' }, glifos: { expandido: 'v', colapsado: '>' } };
    const conToggle = { onToggle: () => {} };
    const exportado = (e: typeof estilo) => renderToSvgString({ ...base, estilo: e });
    const componente = (e: typeof estilo) => renderToStaticMarkup(<Diagram {...base} {...conToggle} estilo={e} />);

    expect(exportado(otro)).not.toBe(exportado(estilo));
    expect(exportado(otro)).toContain('rx="13"');
    expect(exportado(otro)).toContain('fill="#fafafa"');
    expect(componente(otro)).toContain('rx="13"');
    expect(componente(otro)).toContain('fill="#fafafa"');
    expect(componente(otro)).toContain('>v<');
    // Sin handlers la cadena y el componente dibujan lo mismo con el mismo Estilo.
    expect(renderToStaticMarkup(<Diagram {...base} estilo={otro} />).replace(/ xmlns="[^"]*"/, '')).toContain('rx="13"');
  });

  it('la camara controlada fija el viewBox', async () => {
    const html = renderToStaticMarkup(<Diagram {...await props(vista(), { camera: { x: 10, y: 20, width: 300, height: 200 } })} />);

    expect(html).toContain('viewBox="10 20 300 200"');
  });

  it('pulsar un Nodo llama a onSelect con su id; pulsar una Arista, con el de la Arista', async () => {
    const onSelect = vi.fn();
    const arbol = Diagram(await props(vista(), { onSelect }));
    // El clic va en la parte propia del Nodo, hija del `<g data-id>`.
    const porId = (id: string) => buscar(buscar(arbol, (e) => e.props['data-id'] === id)!.props['children'] as ReactNode, (e) => e.props['data-part'] === 'nodo')!;
    const porArista = (id: string) => buscar(arbol, (e) => e.props['data-edge'] === id)!;

    (porId('b').props['onClick'] as () => void)();
    (porArista('b -> c').props['onClick'] as () => void)();

    expect(onSelect.mock.calls).toEqual([['b'], ['b -> c']]);
  });

  it('el control de un Grupo llama a onToggle con su id sin seleccionarlo', async () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    const arbol = Diagram(await props(vista(), { onToggle, onSelect }));
    const control = buscar(arbol, (e) => e.props['data-toggle'] === 'a')!;
    const detener = vi.fn();

    (control.props['onClick'] as (ev: { stopPropagation(): void }) => void)({ stopPropagation: detener });

    expect(onToggle).toHaveBeenCalledWith('a');
    expect(detener).toHaveBeenCalled();
    expect(buscar(arbol, (e) => e.props['data-toggle'] === 'b')).toBeUndefined();
  });

  it('sin onToggle no se dibujan controles de colapso', async () => {
    const html = renderToStaticMarkup(<Diagram {...await props(vista())} />);

    expect(html).not.toContain('data-toggle');
  });
});
