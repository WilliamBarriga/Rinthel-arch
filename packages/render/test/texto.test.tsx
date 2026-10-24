import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';
import { layoutView } from 'layout';
import { Diagram } from 'render';
import { TEMA_NEUTRO } from 'tema';
import type { TemaResuelto } from 'tema';

import { capaDe, etiquetaCon, hojaDe } from './ayudas';

const vista = resolveView(
  fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio', color: 'blue', icon: 'box' }] },
    model: {
      nodes: [
        { id: 'a', type: 'servicio', title: 'Api', description: '', children: [] },
        { id: 'b', type: 'servicio', title: 'Base', description: '', children: [] },
      ],
      edges: [{ from: { node: 'a' }, to: { node: 'b' }, label: 'lee' }],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  }),
  'v',
)!;

const tema = (titulo: Record<string, number | string>, etiqueta: Record<string, number | string> = {}, icono?: Record<string, number | string>): TemaResuelto =>
  ({
    ...TEMA_NEUTRO,
    nodo: {
      ...TEMA_NEUTRO.nodo,
      capas: [{ nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 0 } } }],
      textos: { title: { tipo: 'text', props: { weight: 700, ...titulo } }, ...(icono !== undefined && { icon: { tipo: 'icon', props: icono } }) },
    },
    arista: { ...TEMA_NEUTRO.arista, etiqueta: { tipo: 'label', props: { fill: 'blue', ...etiqueta } } },
  }) as unknown as TemaResuelto;

const iconos = { keys: () => ['box'], resolve: () => '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>' };

async function dibujar(theme: TemaResuelto) {
  const geometry = await layoutView(vista, theme);
  const html = renderToStaticMarkup(<Diagram view={vista} geometry={geometry} theme={theme} width={800} height={600} icons={iconos} />);
  return { html, css: hojaDe(html) };
}

const regla = (css: string, selector: string): string | undefined => {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)\\.rd-[a-z0-9]+ ${escapado}\\{([^}]*)\\}`).exec(css)?.[1];
};

describe('Diagram: estilo de texto de los Slots y de la etiqueta', () => {
  it('`prefix` se escribe delante del titulo, despues de pasar a mayusculas', async () => {
    const { html } = await dibujar(tema({ prefix: '> ', transform: 'uppercase' }));

    expect(capaDe(html, 'nodos')).toContain('>&gt; API</div>');
  });

  it('`glow` del texto es un resplandor (text-shadow) del color dado, COLOR incluido', async () => {
    const { css } = await dibujar(tema({ glow: 'COLOR/0.8' }));

    expect(regla(css, '.rd-nodo .rd-slot[data-slot="title"]')).toContain('text-shadow:0 0 8px color-mix(in srgb, var(--trazo) 80%, transparent)');
  });

  it('`glyph` fija el lado del glifo dentro de la caja del icono; sin el, el glifo ocupa el 60% del lado', async () => {
    const caja = { variant: 'box', side: 34, radius: 10 };
    const conGlifo = await dibujar(tema({}, {}, { ...caja, glyph: 16 }));
    const sinGlifo = await dibujar(tema({}, {}, caja));

    const lado = (html: string) => /<svg width="([\d.]+)" height="([\d.]+)"/.exec(capaDe(html, 'nodos'))?.slice(1);
    expect(lado(conGlifo.html)).toEqual(['16', '16']);
    expect(lado(sinGlifo.html)).toEqual(['20', '20']);
  });

  it('la etiqueta de Arista en cursiva', async () => {
    const { html } = await dibujar(tema({}, { style: 'italic' }));

    expect(etiquetaCon(html, 'data-edge-label=')).toContain('font-style="italic"');
  });
});
