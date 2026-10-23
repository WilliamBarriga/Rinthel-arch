import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';
import { layoutView } from 'layout';
import { Diagram } from 'render';
import type { DiagramProps } from 'render';
import { TEMA_ALTO_CONTRASTE, TEMA_NEUTRO } from 'tema';
import type { TemaResuelto } from 'tema';

const nodo = (id: string, type: string, title: string, children: unknown[] = []) => ({ id, type, title, description: '', children });

async function props(theme: TemaResuelto): Promise<DiagramProps> {
  const fuente = fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }, { name: 'base' }] },
    model: {
      nodes: [nodo('api', 'servicio', 'API de pagos'), nodo('db', 'base', 'Base de pagos'), nodo('g', 'servicio', 'Grupo', [nodo('g.x', 'servicio', 'X')])],
      edges: [{ from: { node: 'api' }, to: { node: 'db' }, label: 'consulta' }],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  });
  const view = resolveView(fuente, 'v')!;
  return { view, geometry: await layoutView(view, theme), theme, width: 800, height: 600 };
}

const etiquetaDe = (html: string, id: string): string => {
  const caja = new RegExp(`<div class="rd-caja"[^>]*data-id="${id}"[^>]*>`).exec(html)?.[0] ?? '';
  return /aria-label="([^"]*)"/.exec(caja)?.[1] ?? '';
};

describe('Diagram: contenido accesible', () => {
  it('cada Nodo se anuncia con su etiqueta, su Tipo y su relacion con otros Nodos', async () => {
    const html = renderToStaticMarkup(<Diagram {...await props(TEMA_NEUTRO)} />);

    expect(etiquetaDe(html, 'api')).toBe('API de pagos, servicio, va a Base de pagos (consulta)');
    expect(etiquetaDe(html, 'db')).toBe('Base de pagos, base, viene de API de pagos (consulta)');
    expect(etiquetaDe(html, 'g')).toBe('Grupo, servicio, grupo con 1 hijos');
  });

  it('el nombre accesible no depende del Tema y el SVG de Aristas es decorativo', async () => {
    const neutro = renderToStaticMarkup(<Diagram {...await props(TEMA_NEUTRO)} />);
    const alto = renderToStaticMarkup(<Diagram {...await props(TEMA_ALTO_CONTRASTE)} />);

    for (const id of ['api', 'db', 'g']) expect(etiquetaDe(alto, id)).toBe(etiquetaDe(neutro, id));
    expect(neutro).toMatch(/<svg[^>]*data-capa="aristas"[^>]*aria-hidden="true"/);
  });
});
