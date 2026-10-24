import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';
import { layoutView } from 'layout';
import { Diagram } from 'render';
import { TEMA_NEUTRO, estiloResuelto } from 'tema';
import type { TemaResuelto } from 'tema';

import { etiquetaCon, hojaDe, propiedad } from './ayudas';

const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [{ id: 'a', type: 'servicio', title: 'A', description: '', children: [] }], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});

const conPagina = (fijo: boolean): TemaResuelto => ({
  ...TEMA_NEUTRO,
  palette: { ...TEMA_NEUTRO.palette, ink: '#102030' },
  pagina: {
    fijo,
    capas: [
      { nombre: 'fondo', primitiva: { tipo: 'solid', props: { color: 'ink' } } },
      { nombre: 'luz', primitiva: { tipo: 'radial', props: { from: 'blue/0.5', to: 'ink/0', x: 15, y: 10 } } },
      { nombre: 'puntos', primitiva: { tipo: 'dots', props: { color: 'ink/0.1', size: 22, radius: 1 } } },
    ],
  },
});

async function dibujo(theme: TemaResuelto): Promise<string> {
  const view = resolveView(fuente, 'v', {})!;
  const geometry = await layoutView(view, theme);
  return renderToStaticMarkup(<Diagram view={view} geometry={geometry} theme={theme} width={800} height={600} />);
}

describe('Diagram: fondo de pagina', () => {
  it('un Tema sin page no pinta capa de pagina: queda el color background del Tema', async () => {
    const html = await dibujo(TEMA_NEUTRO);

    expect(html).not.toContain('data-capa="pagina"');
    expect(hojaDe(html)).toContain('background:#ffffff');
    expect(estiloResuelto(TEMA_NEUTRO).pintura.pagina).toEqual({ capas: [], fijo: false });
  });

  it('page fixed va fuera del mundo, antes de el, y debajo de Grupos, Aristas y Nodos', async () => {
    const html = await dibujo(conPagina(true));
    const [pagina, mundo, grupos] = [html.indexOf('data-capa="pagina"'), html.indexOf('class="rd-mundo"'), html.indexOf('data-capa="grupos"')];

    expect(pagina).toBeGreaterThan(-1);
    expect(pagina).toBeLessThan(mundo);
    expect(mundo).toBeLessThan(grupos);
  });

  it('page sin fixed va dentro del mundo (se mueve con pan/zoom), con margen y antes de los Grupos', async () => {
    const html = await dibujo(conPagina(false));
    const [mundo, pagina, grupos] = [html.indexOf('class="rd-mundo"'), html.indexOf('data-capa="pagina"'), html.indexOf('data-capa="grupos"')];

    expect(mundo).toBeLessThan(pagina);
    expect(pagina).toBeLessThan(grupos);
    expect(propiedad(etiquetaCon(html, 'data-capa="pagina"'), 'left')).toBe('-4000px');
  });

  it('la hoja apila los rellenos: lo ultimo de la pila queda encima y el solido va primero', async () => {
    const regla = /\.rd-\w+ \.rd-pagina\{([^}]*)\}/.exec(hojaDe(await dibujo(conPagina(true))))?.[1] ?? '';

    expect(regla).toContain('background:#102030');
    expect(regla.indexOf('background:#102030')).toBeLessThan(regla.indexOf('background-image'));
    const imagenes = /background-image:(.*?);background-size/.exec(regla)?.[1] ?? '';
    expect(imagenes.indexOf('radial-gradient(circle,')).toBeLessThan(imagenes.indexOf('radial-gradient(circle at'));
    expect(imagenes).toContain('radial-gradient(circle at 15% 10%,rgba(37, 99, 235, 0.5),rgba(16, 32, 48, 0) 110%)');
  });
});
