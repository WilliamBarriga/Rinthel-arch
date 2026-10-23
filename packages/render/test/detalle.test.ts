import { describe, expect, it } from 'vitest';

import { combineIconProviders, fuenteCanonicaSchema, genericIcons, resolveView, workspaceIcons } from 'canonico';
import { layoutView } from 'layout';
import { aSvg } from './ayudas';
import type { DiagramProps } from 'render';
import { TEMA_NEUTRO } from 'tema';

type Detalle = NonNullable<DiagramProps['detail']>;

async function dibujar(detail?: Detalle): Promise<string> {
  const fuente = fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'tabla', icon: 'database' }] },
    model: {
      nodes: [{ id: 'usuarios', type: 'tabla', title: 'Usuarios del sistema', description: '', children: [], attributes: [{ name: 'id', type: 'uuid' }] }],
      edges: [],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], overrides: [{ node: 'usuarios', label: 'Usr' }] }],
  });
  const view = resolveView(fuente, 'v')!;
  const geometry = await layoutView(view, TEMA_NEUTRO);
  const icons = combineIconProviders(workspaceIcons({}), genericIcons());
  return aSvg({ view, geometry, theme: TEMA_NEUTRO, width: 800, height: 600, icons, ...(detail !== undefined && { detail }) });
}

describe('aSvg: nivel de detalle', () => {
  it('etiqueta: solo la etiqueta corta, sin Atributos, con icono', async () => {
    const svg = await dibujar('etiqueta');
    expect(svg).toContain('>Usr<');
    expect(svg).not.toContain('Usuarios del sistema');
    expect(svg).not.toContain('id: uuid');
    expect(svg).toContain('data-icon="database"');
  });

  it('titulo: respeta el label del override de la Vista, sin Atributos', async () => {
    const svg = await dibujar('titulo');
    expect(svg).toContain('>Usr<');
    expect(svg).not.toContain('Usuarios del sistema');
    expect(svg).not.toContain('id: uuid');
  });

  it('completo: respeta el label del override y anade los Atributos', async () => {
    const svg = await dibujar('completo');
    expect(svg).toContain('>Usr<');
    expect(svg).not.toContain('Usuarios del sistema');
    expect(svg).toContain('id: uuid');
  });

  it('sin detail se dibuja como antes: etiqueta y Atributos', async () => {
    const svg = await dibujar();
    expect(svg).toContain('>Usr<');
    expect(svg).toContain('id: uuid');
  });

  it('el rectangulo del Nodo y el viewBox son identicos entre niveles', async () => {
    const forma = (s: string) => [/<rect[^>]*rx[^>]*>/.exec(s)![0], /viewBox="[^"]*"/.exec(s)![0]];
    const base = forma(await dibujar('etiqueta'));
    expect(forma(await dibujar('titulo'))).toEqual(base);
    expect(forma(await dibujar('completo'))).toEqual(base);
  });
});
