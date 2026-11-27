import { describe, expect, it } from 'vitest';

import { combineIconProviders, canonicalFormSchema, genericIcons, resolveView, workspaceIcons } from 'canonical';
import { layoutView } from 'layout';
import { toHtml, tagWith } from './helpers';
import type { DiagramProps } from 'render';
import { NEUTRAL_THEME } from 'theme';

type Detail = NonNullable<DiagramProps['detail']>;

async function draw(detail?: Detail): Promise<string> {
  const source = canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'tabla', icon: 'database' }] },
    model: {
      nodes: [{ id: 'usuarios', type: 'tabla', title: 'Usuarios del sistema', description: '', children: [], attributes: [{ name: 'id', type: 'uuid' }] }],
      edges: [],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], overrides: [{ node: 'usuarios', label: 'Usr' }] }],
  });
  const view = resolveView(source, 'v')!;
  const geometry = await layoutView(view, NEUTRAL_THEME);
  const icons = combineIconProviders(workspaceIcons({}), genericIcons());
  return toHtml({ view, geometry, theme: NEUTRAL_THEME, width: 800, height: 600, icons, ...(detail !== undefined && { detail }) });
}

describe('Diagram: detail level', () => {
  it('etiqueta: only the short label, without Attributes, with icon', async () => {
    const svg = await draw('etiqueta');
    expect(svg).toContain('>Usr<');
    expect(svg).not.toContain('Usuarios del sistema');
    expect(svg).not.toContain('id: uuid');
    expect(svg).toContain('data-icon="database"');
  });

  it('titulo: honors the View override label, without Attributes', async () => {
    const svg = await draw('titulo');
    expect(svg).toContain('>Usr<');
    expect(svg).not.toContain('Usuarios del sistema');
    expect(svg).not.toContain('id: uuid');
  });

  it('completo: honors the override label and adds the Attributes', async () => {
    const svg = await draw('completo');
    expect(svg).toContain('>Usr<');
    expect(svg).not.toContain('Usuarios del sistema');
    expect(svg).toContain('id: uuid');
  });

  it('without detail it draws as before: label and Attributes', async () => {
    const svg = await draw();
    expect(svg).toContain('>Usr<');
    expect(svg).toContain('id: uuid');
  });

  it('the Node box and the camera are identical across levels', async () => {
    const shape = (s: string) => [tagWith(s, 'data-id="usuarios"'), /data-camara="[^"]*"/.exec(s)![0]];
    const base = shape(await draw('etiqueta'));
    expect(shape(await draw('titulo'))).toEqual(base);
    expect(shape(await draw('completo'))).toEqual(base);
  });
});
