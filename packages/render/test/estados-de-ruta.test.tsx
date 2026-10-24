import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';
import { layoutView } from 'layout';
import { Diagram, resolverEstilo } from 'render';
import type { DiagramProps } from 'render';
import { TEMA_NEUTRO } from 'tema';

import { hojaDe } from './ayudas';

const nodo = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });

async function props(extra: Partial<DiagramProps> = {}): Promise<DiagramProps> {
  const fuente = fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: { nodes: [nodo('a'), nodo('b'), nodo('c')], edges: [{ from: { node: 'a' }, to: { node: 'b' } }, { from: { node: 'b' }, to: { node: 'c' } }] },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  });
  const view = resolveView(fuente, 'v')!;
  return { view, geometry: await layoutView(view, TEMA_NEUTRO), theme: TEMA_NEUTRO, width: 800, height: 600, ...extra };
}
const dibujo = (p: DiagramProps): string => renderToStaticMarkup(<Diagram {...p} />);
const marcas = (completo: string, atributo: string): string[] => [...completo.replace(/<style>[\s\S]*<\/style>/, '').matchAll(new RegExp(`<[^>]*${atributo}[^>]*>`, 'g'))].map((m) => m[0]);

describe('Diagram: estados de ruta y foco como selectores', () => {
  it('la hoja trae un selector por estado: en-ruta y foco con contorno, atenuado con opacidad', async () => {
    const hoja = hojaDe(dibujo(await props()));
    const estilo = resolverEstilo(TEMA_NEUTRO);

    expect(hoja).toContain(`.rd-estado[data-state="en-ruta"]{border:${estilo.estados['en-ruta'].ancho}px solid ${estilo.estados['en-ruta'].color}}`);
    expect(hoja).toContain('.rd-estado[data-state="foco"]{');
    expect(hoja).toMatch(/\[data-atenuado\]\{opacity:0\.\d+\}/);
    expect(hoja).not.toContain('.rd-estado[data-state="atenuado"]');
  });

  it('un Nodo en-ruta y otro con foco llevan su contorno; el atenuado, una marca de atenuado en su caja', async () => {
    const html = dibujo(await props({ estados: { a: ['en-ruta'], b: ['foco'], c: ['atenuado'] } }));

    expect(html.slice(html.indexOf('data-id="a"'), html.indexOf('data-id="b"'))).toContain('data-state="en-ruta"');
    expect(html.slice(html.indexOf('data-id="b"'), html.indexOf('data-id="c"'))).toContain('data-state="foco"');
    expect(marcas(html, 'data-atenuado')).toHaveLength(1);
    expect(marcas(html, 'data-atenuado')[0]).toContain('data-id="c"');
    expect(marcas(html, 'data-state="atenuado"')).toHaveLength(0);
  });

  it('una Arista en-ruta lleva su trazo de estado y una atenuada su marca', async () => {
    const html = dibujo(await props({ estados: { 'a -> b': ['en-ruta'], 'b -> c': ['atenuado'] } }));

    expect(marcas(html, 'data-state="en-ruta"').some((m) => m.startsWith('<path'))).toBe(true);
    expect(marcas(html, 'data-atenuado')[0]).toContain('data-edge="b -&gt; c"');
  });

  it('el contorno de estado de una ruta con codo sigue la misma esquina que el trazo de la Arista', async () => {
    const linea = { nombre: 'linea', primitiva: { tipo: 'line', props: { color: 'gray', width: 2, style: 'solid', corner: 'round', radius: 8, cut: 6 } } };
    const redondo = { ...TEMA_NEUTRO, arista: { ...TEMA_NEUTRO.arista, capas: [linea] } };
    const base = await props({ theme: redondo });
    const codo = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }];
    const geometry = { ...base.geometry, edges: { ...base.geometry.edges, 'a -> b': { ...base.geometry.edges['a -> b']!, points: codo } } };
    const html = dibujo({ ...base, geometry, estados: { 'a -> b': ['en-ruta'] } });

    const contorno = marcas(html, 'data-state="en-ruta"').find((m) => m.startsWith('<path'))!;
    expect(contorno).toContain('d="M 0 0 L 52 0 Q 60 0 60 8 L 60 60"');
  });

  it('el anillo de foco es irremovible: un Estilo que lo deja sin grosor se dibuja con el minimo', async () => {
    const base = resolverEstilo(TEMA_NEUTRO);
    const sinAnillo = { ...base, estados: { ...base.estados, foco: { ...base.estados.foco, ancho: 0 } } };
    const html = dibujo(await props({ estilo: sinAnillo, estados: { a: ['foco'], 'a -> b': ['foco'] } }));

    expect(hojaDe(html)).toMatch(/\.rd-estado\[data-state="foco"\]\{border:[2-9]px solid/);
    expect(marcas(html, 'data-state="foco"').find((m) => m.startsWith('<path'))).toMatch(/stroke-width="[2-9]/);
  });

  it('sin estados no hay marcas de atenuado', async () => {
    expect(dibujo(await props()).replace(/<style>[\s\S]*<\/style>/, '')).not.toContain('data-atenuado');
  });
});
