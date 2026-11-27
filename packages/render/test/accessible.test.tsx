import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import { layoutView } from 'layout';
import { Diagram } from 'render';
import type { DiagramProps } from 'render';
import { HIGH_CONTRAST_THEME, NEUTRAL_THEME } from 'theme';
import type { ResolvedTheme } from 'theme';

const node = (id: string, type: string, title: string, children: unknown[] = []) => ({ id, type, title, description: '', children });

async function props(theme: ResolvedTheme): Promise<DiagramProps> {
  const source = canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }, { name: 'base' }] },
    model: {
      nodes: [node('api', 'servicio', 'API de pagos'), node('db', 'base', 'Base de pagos'), node('g', 'servicio', 'Grupo', [node('g.x', 'servicio', 'X')])],
      edges: [{ from: { node: 'api' }, to: { node: 'db' }, label: 'consulta' }],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  });
  const view = resolveView(source, 'v')!;
  return { view, geometry: await layoutView(view, theme), theme, width: 800, height: 600 };
}

/** `aria-label` of the `data-part="nodo"` element of the box of Node `id`. */
const labelOf = (html: string, id: string): string => {
  const rest = html.slice(html.indexOf(`data-id="${id}"`));
  return /data-part="nodo"[^>]*aria-label="([^"]*)"/.exec(rest)?.[1] ?? '';
};

describe('Diagram: accessible content', () => {
  it('each Node is announced with its label, its kind and its relation to other Nodes', async () => {
    const html = renderToStaticMarkup(<Diagram {...await props(NEUTRAL_THEME)} />);

    expect(labelOf(html, 'api')).toBe('API de pagos, servicio, va a Base de pagos (consulta)');
    expect(labelOf(html, 'db')).toBe('Base de pagos, base, comes from API de pagos (consulta)');
    expect(labelOf(html, 'g')).toBe('Grupo, servicio, group with 1 children');
  });

  it('the accessible name does not depend on the Theme and the Edge SVG is decorative', async () => {
    const neutral = renderToStaticMarkup(<Diagram {...await props(NEUTRAL_THEME)} />);
    const height = renderToStaticMarkup(<Diagram {...await props(HIGH_CONTRAST_THEME)} />);

    for (const id of ['api', 'db', 'g']) expect(labelOf(height, id)).toBe(labelOf(neutral, id));
    expect(neutral).toMatch(/<svg[^>]*data-capa="aristas"[^>]*aria-hidden="true"/);
  });
});
