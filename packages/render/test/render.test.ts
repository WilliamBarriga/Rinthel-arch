import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema, resolveView } from 'canonico';
import type { Tema, VistaResuelta } from 'canonico';
import { layoutView } from 'layout';
import { renderToSvgString } from 'render';

const nodo = (id: string, title: string, type: string, children: unknown[] = []) => ({
  id,
  type,
  title,
  description: '',
  children,
});

/** Grupo `a` con dos servicios, una base fuera y un override de color y label. */
function vista(estado = {}): VistaResuelta {
  const fuente = fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio', color: 'blue' }, { name: 'base', color: 'green' }] },
    model: {
      nodes: [
        nodo('a', 'Plataforma', 'servicio', [nodo('a.api', 'API', 'servicio'), nodo('a.auth', 'Auth & <Tokens>', 'servicio')]),
        nodo('db', 'Base de datos', 'base'),
      ],
      edges: [{ from: { node: 'a.api' }, to: { node: 'db' } }],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], overrides: [{ node: 'db', color: 'red', label: 'Postgres' }] }],
  });
  return resolveView(fuente, 'v', estado)!;
}

const OSCURO: Tema = {
  name: 'oscuro',
  palette: { ...TEMA_NEUTRO.palette, blue: '#60a5fa', green: '#4ade80', red: '#f87171' },
  fonts: { body: 'Inter, sans-serif', mono: 'monospace' },
  tokens: { background: '#111827', foreground: '#f9fafb', border: '#4b5563', fontSize: '16px' },
};

async function dibujar(tema: Tema, estado = {}): Promise<string> {
  const v = vista(estado);
  const geometry = await layoutView(v, tema);
  return renderToSvgString({ view: v, geometry, theme: tema, width: 800, height: 600 });
}

describe('renderToSvgString', () => {
  it('dibuja la Vista con el Tema neutro (snapshot)', async () => {
    expect(await dibujar(TEMA_NEUTRO)).toMatchSnapshot();
  });

  it('dibuja la Vista con un Tema oscuro (snapshot)', async () => {
    expect(await dibujar(OSCURO)).toMatchSnapshot();
  });

  it('dibuja un Grupo colapsado como un Nodo con su contador (snapshot)', async () => {
    expect(await dibujar(TEMA_NEUTRO, { collapsed: ['a'] })).toMatchSnapshot();
  });

  it('es determinista byte a byte', async () => {
    expect(await dibujar(TEMA_NEUTRO)).toBe(await dibujar(TEMA_NEUTRO));
  });

  it('es un SVG con el tamano pedido y el viewBox de la geometria', async () => {
    const svg = await dibujar(TEMA_NEUTRO);

    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="800" height="600" viewBox="0 0 \d+ \d+">/);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('los colores salen del Tema por nombre de Paleta', async () => {
    const neutro = await dibujar(TEMA_NEUTRO);
    const oscuro = await dibujar(OSCURO);

    expect(neutro).toContain(TEMA_NEUTRO.palette['blue']);
    expect(neutro).toContain(TEMA_NEUTRO.palette['red']);
    expect(oscuro).toContain('#60a5fa');
    expect(oscuro).not.toContain(TEMA_NEUTRO.palette['blue']);
  });

  it('el unico hex del SVG viene del Tema', async () => {
    const svg = await dibujar(OSCURO);
    const permitidos = new Set([...Object.values(OSCURO.palette), ...Object.values(OSCURO.tokens)].map((c) => c.toLowerCase()));

    for (const hex of svg.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
      expect(permitidos.has(hex.toLowerCase())).toBe(true);
    }
  });

  it('escapa el texto de los Nodos y usa el label del override', async () => {
    const svg = await dibujar(TEMA_NEUTRO);

    expect(svg).toContain('Auth &amp; &lt;Tokens&gt;');
    expect(svg).toContain('Postgres');
    expect(svg).not.toContain('Base de datos');
  });

  it('un Grupo colapsado no dibuja a sus hijos', async () => {
    const svg = await dibujar(TEMA_NEUTRO, { collapsed: ['a'] });

    expect(svg).not.toContain('>API<');
    expect(svg).toContain('Plataforma');
  });
});
