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
      edges: [{ from: { node: 'a.api' }, to: { node: 'db' }, fromCardinality: '1', toCardinality: '0..*' }, { from: { node: 'a.api' }, to: { node: 'a.auth' } }],
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

  it('dibuja las Aristas con flecha, como rutas ortogonales', async () => {
    const svg = await dibujar(TEMA_NEUTRO);

    expect(svg).toMatch(/<path data-edge="a\.api -&gt; db"[^>]* d="M [\d. ]+( L [\d. ]+)+"[^>]* marker-end="url\(#flecha\)"/);
    expect(svg).toMatch(/<path data-edge="a\.api -&gt; a\.auth"/);
    expect(svg).toContain('<marker id="flecha"');
  });

  it('dibuja una Arista entre Grupos sobre el borde del Grupo colapsado (snapshot)', async () => {
    const svg = await dibujar(TEMA_NEUTRO, { collapsed: ['a'] });

    expect(svg).toMatch(/<path data-edge="a -&gt; db"/);
    expect(svg).not.toMatch(/data-edge="a\.api/);
    expect(svg).toMatchSnapshot();
  });

  it('la cardinalidad va junto al extremo que le corresponde', async () => {
    const v = vista();
    const geometry = await layoutView(v, TEMA_NEUTRO);
    const svg = renderToSvgString({ view: v, geometry, theme: TEMA_NEUTRO, width: 800, height: 600 });
    const ruta = geometry.edges['a.api -> db']!.points;
    const inicio = ruta[0]!;
    const fin = ruta[ruta.length - 1]!;
    const posicion = (lado: string, texto: string): { x: number; y: number } => {
      const m = new RegExp(`<text data-cardinality="a\\.api -&gt; db:${lado}" x="([\\d.-]+)" y="([\\d.-]+)"[^>]*>${texto}</text>`).exec(svg);
      expect(m, `cardinalidad ${lado}`).not.toBeNull();
      return { x: Number(m![1]), y: Number(m![2]) };
    };
    const cerca = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
    const origen = posicion('from', '1');
    const destino = posicion('to', '0\\.\\.\\*');

    expect(cerca(origen, inicio)).toBeLessThan(cerca(origen, fin));
    expect(cerca(destino, fin)).toBeLessThan(cerca(destino, inicio));
    expect(svg).not.toContain('data-cardinality="a.api -&gt; a.auth');
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

  it('escapa tambien los valores del Tema que van en atributos', async () => {
    const hostil: Tema = { ...TEMA_NEUTRO, palette: { ...TEMA_NEUTRO.palette, blue: '"/><script>' }, fonts: { body: 'a"b' } };
    const svg = await dibujar(hostil);

    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&quot;/&gt;&lt;script&gt;');
  });
});
