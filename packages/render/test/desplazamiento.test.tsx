import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';
import type { VistaResuelta } from 'canonico';
import { layoutView } from 'layout';
import { Diagram } from 'render';
import type { DiagramProps } from 'render';
import { TEMA_NEUTRO, construirTransicion } from 'tema';
import type { TemaResuelto } from 'tema';

import { hojaDe } from './ayudas';

const nodo = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });
const vista = (): VistaResuelta =>
  resolveView(
    fuenteCanonicaSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [nodo('a'), nodo('b')], edges: [{ from: { node: 'a' }, to: { node: 'b' } }] },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    }),
    'v',
    {},
  )!;

const capas = (sombra: Record<string, number>) => [
  { nombre: 'sombra', primitiva: { tipo: 'solid', props: { color: 'blue', ...sombra } } },
  { nombre: 'tarjeta', primitiva: { tipo: 'solid', props: { color: 'amber' } } },
];

const temaCon = (nodoExtra: Record<string, unknown> = {}): TemaResuelto =>
  ({ ...TEMA_NEUTRO, nodo: { slots: TEMA_NEUTRO.nodo.slots, tipos: {}, estados: {}, capas: capas({ 'offset-x': 4, 'offset-y': -3, grow: 2 }), ...nodoExtra } }) as unknown as TemaResuelto;

async function dibujar(theme: TemaResuelto, extra: Partial<DiagramProps> = {}) {
  const view = vista();
  const geometry = await layoutView(view, TEMA_NEUTRO);
  const html = renderToStaticMarkup(<Diagram view={view} geometry={geometry} theme={theme} width={800} height={600} {...extra} />);
  return { html, geometry };
}

describe('Diagram: offset y grow de una Capa', () => {
  it('la Capa desplazada se pinta movida, en su propio elemento, y la caja medida no cambia', async () => {
    const { html, geometry } = await dibujar(temaCon());
    const { html: sinDesplazar, geometry: geometriaBase } = await dibujar(temaCon({ capas: capas({}) }));
    const css = hojaDe(html);

    expect(html.match(/class="rd-anim" data-anim="sombra"/g)).toHaveLength(2);
    const regla = css.match(/\.rd-anim\[data-anim="sombra"\]\{([^}]*)\}/)![1]!;
    expect(regla).toContain('translate:4px -3px');
    expect(regla).toContain('z-index:-1'); // una sombra desplazada queda bajo el relleno de la tarjeta
    expect(regla).toContain('width:calc(100% + 2px);height:calc(100% + 2px)');
    // La Capa sin desplazamiento sigue fusionada en la caja.
    expect(css).not.toMatch(/\.rd-nodo,[^{]*\{[^}]*translate/);
    expect(sinDesplazar).not.toContain('data-anim="sombra"');
    expect(geometry).toEqual(geometriaBase);
    expect(html).toContain('transform:translate(');
  });

  it('un parche de estado mueve la Capa solo con ese estado y respeta la transition', async () => {
    const transicion = construirTransicion([{ clave: 'duration', valor: 150 }]).animacion!;
    const tema = temaCon({
      capas: capas({ 'offset-x': 4, 'offset-y': 4 }),
      estados: { hover: [{ nombre: 'sombra', props: { 'offset-x': 7, 'offset-y': 7 } }] },
      animacion: { transicion },
    });
    const { html } = await dibujar(tema, { estados: { a: ['hover'] } });
    const css = hojaDe(html);

    expect(css).toMatch(/\.rd-anim\[data-anim="sombra"\]\{[^}]*translate:4px 4px/);
    expect(css).toMatch(/\[data-estados~="hover"\] \.rd-anim\[data-anim="sombra"\]\{[^}]*translate:7px 7px/);
    expect(css).toMatch(/transition:[^;}]*translate 150ms/);
    expect(css).not.toMatch(/@keyframes/);
  });
});
