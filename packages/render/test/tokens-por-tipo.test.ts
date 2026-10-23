import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema, resolveView, temaSchema } from 'canonico';
import type { Tema, VistaResuelta } from 'canonico';
import { layoutView } from 'layout';
import { renderToSvgString, resolverEstilo } from 'render';

const nodo = (id: string, type: string) => ({ id, type, title: id, description: '', children: [] });

function vista(): VistaResuelta {
  const fuente = fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio', color: 'blue' }, { name: 'tabla' }] },
    model: {
      nodes: [nodo('api', 'servicio'), nodo('usuarios', 'tabla')],
      edges: [{ from: { node: 'api' }, to: { node: 'usuarios' } }],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], overrides: [] }],
  });
  return resolveView(fuente, 'v', {})!;
}

/** Tema de ejemplo: un servicio y una tabla se distinguen por relleno, sombra y trazo. */
const TEMA_EJEMPLO: Tema = {
  ...TEMA_NEUTRO,
  name: 'ejemplo-por-tipo',
  nodeStyles: {
    servicio: { fill: '#dbeafe', shadow: { dx: 2, dy: 3, blur: 4, color: '#000000' } },
    tabla: { fill: '#fef3c7', stroke: 'amber', strokeWidth: 2 },
  },
  edgeStyles: { default: { stroke: '#ff0000', strokeWidth: 3 } },
};

async function dibujar(tema: Tema): Promise<string> {
  const v = vista();
  const geometry = await layoutView(v, tema);
  return renderToSvgString({ view: v, geometry, theme: tema, width: 800, height: 600 });
}

/** Primera caja (`<rect>`) dibujada para un Nodo. */
const cajaDe = (svg: string, id: string): string => svg.match(new RegExp(`data-id="${id}".*?<rect[^>]*>`, 's'))![0];

describe('tokens por Tipo de nodo y de Arista', () => {
  it('el esquema acepta tokens por tipo y rechaza claves desconocidas', () => {
    expect(temaSchema.safeParse(TEMA_EJEMPLO).success).toBe(true);
    expect(temaSchema.safeParse({ ...TEMA_NEUTRO, nodeStyles: { servicio: { relleno: 'x' } } }).success).toBe(false);
    expect(temaSchema.safeParse({ ...TEMA_NEUTRO, nodeStyles: { servicio: { shadow: { dx: 1 } } } }).success).toBe(false);
    expect(temaSchema.safeParse({ ...TEMA_NEUTRO, edgeStyles: { default: { strokeWidth: -1 } } }).success).toBe(false);
  });

  it('sin tokens por tipo el SVG es el de siempre', async () => {
    const svg = await dibujar(TEMA_NEUTRO);

    expect(svg).not.toContain('<filter');
    expect(svg).not.toContain('filter=');
    expect(cajaDe(svg, 'api')).toContain(`fill="${TEMA_NEUTRO.tokens['background']}"`);
    expect(resolverEstilo(TEMA_NEUTRO).nodo.porTipo).toEqual({});
  });

  it('cada Tipo de nodo se dibuja con su relleno, trazo y sombra', async () => {
    const svg = await dibujar(TEMA_EJEMPLO);

    expect(cajaDe(svg, 'api')).toContain('fill="#dbeafe"');
    expect(cajaDe(svg, 'api')).toContain('filter="url(#sombra-servicio)"');
    expect(cajaDe(svg, 'api')).toContain(`stroke="${TEMA_NEUTRO.palette['blue']}"`);
    expect(cajaDe(svg, 'usuarios')).toContain('fill="#fef3c7"');
    expect(cajaDe(svg, 'usuarios')).toContain(`stroke="${TEMA_NEUTRO.palette['amber']}"`);
    expect(cajaDe(svg, 'usuarios')).toContain('stroke-width="2"');
    expect(cajaDe(svg, 'usuarios')).not.toContain('filter=');
    expect(svg).toMatch(/<filter id="sombra-servicio"[^>]*>.*<feDropShadow dx="2" dy="3" stdDeviation="4"/s);
  });

  it('la Arista toma el trazo del tipo default, con su flecha del mismo color', async () => {
    const svg = await dibujar(TEMA_EJEMPLO);

    expect(svg).toMatch(/<path d="M[^"]*" fill="none" stroke="#ff0000" stroke-width="3" marker-end="url\(#flecha-ff0000\)"/);
    expect(svg).toContain('id="flecha-ff0000"');
  });

  it('el Estilo expone los tokens con la Paleta resuelta', () => {
    const estilo = resolverEstilo(TEMA_EJEMPLO);

    expect(estilo.nodo.porTipo['tabla']).toEqual({ relleno: '#fef3c7', trazo: TEMA_NEUTRO.palette['amber'], anchoTrazo: 2 });
    expect(estilo.arista.porTipo['default']).toEqual({ color: '#ff0000', ancho: 3 });
  });
});
