import { describe, expect, it } from 'vitest';

import { combineIconProviders, canonicalFormSchema, genericIcons, resolveView, workspaceIcons } from 'canonical';
import type { IconProvider, Theme, GraphView, ResolvedView } from 'canonical';
import { layoutView as layoutDeVista } from 'layout';

import { toHtml, tagWith, rectOf } from './helpers';
import { NEUTRAL_THEME, metricsOf } from 'theme';
import type { ResolvedTheme } from 'theme';

/** `layoutView` of a graph View (architecture or flow): these tests look at Edge paths and boxes. */
const layoutView = async (...args: Parameters<typeof layoutDeVista>) => {
  const geometry = await layoutDeVista(...args);
  if (geometry.kind !== 'grafo') throw new Error('expected a graph Geometry');
  return geometry;
};


const node = (id: string, title: string, type: string, children: unknown[] = []) => ({
  id,
  type,
  title,
  description: '',
  children,
});

/** Group `a` with two services, a database outside and a color and label override. */
function view(state = {}): GraphView {
  const source = canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio', color: 'blue' }, { name: 'base', color: 'green' }] },
    model: {
      nodes: [
        node('a', 'Plataforma', 'servicio', [node('a.api', 'API', 'servicio'), node('a.auth', 'Auth & <Tokens>', 'servicio')]),
        node('db', 'Base de datos', 'base'),
      ],
      edges: [{ from: { node: 'a.api' }, to: { node: 'db' }, fromCardinality: '1', toCardinality: '0..*' }, { from: { node: 'a.api' }, to: { node: 'a.auth' } }],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], overrides: [{ node: 'db', color: 'red', label: 'Postgres' }] }],
  });
  return resolveView(source, 'v', state) as GraphView;
}

const DARK: ResolvedTheme = {
  name: 'oscuro',
  palette: { ...NEUTRAL_THEME.palette, blue: '#60a5fa', green: '#4ade80', red: '#f87171' },
  fonts: { body: 'Inter, sans-serif', mono: 'monospace' },
  tokens: { background: '#111827', foreground: '#f9fafb', border: '#4b5563', fontSize: '16px' },
  nodo: NEUTRAL_THEME.nodo,
  grupo: NEUTRAL_THEME.grupo,
  arista: NEUTRAL_THEME.arista,
  pagina: NEUTRAL_THEME.pagina,
};

async function draw(theme: Theme, state = {}): Promise<string> {
  const v = view(state);
  const geometry = await layoutView(v, theme);
  return toHtml({ view: v, geometry, theme, width: 800, height: 600 });
}

describe('Diagram', () => {
  it('draws the View with the dark Theme: Theme background and text in the sheet', async () => {
    const html = await draw(DARK);

    expect(html).toContain('background:#111827;color:#f9fafb;font-family:"Inter", sans-serif;font-size:16px');
  });

  it('draws a collapsed Group as a Node with its counter', async () => {
    const html = await draw(NEUTRAL_THEME, { collapsed: ['a'] });

    expect(html).toContain('>Plataforma (2)<');
    expect(html).not.toContain('data-slot="title" style="left:10px');
  });

  it('draws the Edges with an arrow, as orthogonal paths', async () => {
    const svg = await draw(NEUTRAL_THEME);

    expect(svg).toMatch(/<g data-edge="a\.api -&gt; db"><path d="M [\d. ]+( L [\d. ]+)+" fill="none" stroke="[^"]+" stroke-width="[\d.]+" data-capa="line"/);
    expect(svg).toMatch(/<g data-edge="a\.api -&gt; a\.auth"/);
    expect(svg).toMatch(/<g data-marker="fin" transform="translate\([\d. ]+\) rotate\(-?[\d.]+\)"><path d="M 0 0 L -8 -4 L -8 4 z"/);
  });

  it('draws an Edge between Groups over the border of the collapsed Group', async () => {
    const svg = await draw(NEUTRAL_THEME, { collapsed: ['a'] });

    expect(svg).toMatch(/<g data-edge="a -&gt; db"/);
    expect(svg).not.toMatch(/data-edge="a\.api/);
  });

  it('the cardinality goes next to the endpoint it belongs to', async () => {
    const v = view();
    const geometry = await layoutView(v, NEUTRAL_THEME);
    const svg = toHtml({ view: v, geometry, theme: NEUTRAL_THEME, width: 800, height: 600 });
    const path = geometry.edges['a.api -> db']!.points;
    const start = path[0]!;
    const end = path[path.length - 1]!;
    const position = (side: string, text: string): { x: number; y: number } => {
      const m = new RegExp(`<text data-cardinality="a\\.api -&gt; db:${side}" x="([\\d.-]+)" y="([\\d.-]+)"[^>]*>${text}</text>`).exec(svg);
      expect(m, `cardinalidad ${side}`).not.toBeNull();
      return { x: Number(m![1]), y: Number(m![2]) };
    };
    const near = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
    const origin = position('from', '1');
    const target = position('to', '0\\.\\.\\*');

    expect(near(origin, start)).toBeLessThan(near(origin, end));
    expect(near(target, end)).toBeLessThan(near(target, start));
    expect(svg).not.toContain('data-cardinality="a.api -&gt; a.auth');
  });

  it('the label of an Edge goes over its path, in a single text', async () => {
    const base = view();
    const v: ResolvedView = {
      ...base,
      edges: base.edges.map((edge) => (edge.to.node === 'a.auth' ? { ...edge, label: 'valida <token>' } : edge)),
    };
    const geometry = await layoutView(v, NEUTRAL_THEME);
    const svg = toHtml({ view: v, geometry, theme: NEUTRAL_THEME, width: 800, height: 600 });
    const path = geometry.edges['a.api -> a.auth']!.points;
    const xs = path.map((p) => p.x);
    const ys = path.map((p) => p.y);
    const m = /<text data-edge-label="a\.api -&gt; a\.auth"[^>]* x="([\d.-]+)" y="([\d.-]+)"[^>]*>valida &lt;token&gt;<\/text>/.exec(svg);

    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(Math.min(...xs) - 1);
    expect(Number(m![1])).toBeLessThanOrEqual(Math.max(...xs) + 1);
    expect(Number(m![2])).toBeGreaterThanOrEqual(Math.min(...ys) - 20);
    expect(Number(m![2])).toBeLessThanOrEqual(Math.max(...ys) + 20);
    expect(svg).not.toContain('data-edge-label="a.api -&gt; db"');
  });

  it('is deterministic byte for byte', async () => {
    expect(await draw(NEUTRAL_THEME)).toBe(await draw(NEUTRAL_THEME));
  });

  it('colors come from the Theme by Palette name', async () => {
    const neutral = await draw(NEUTRAL_THEME);
    const dark = await draw(DARK);

    expect(neutral).toContain(NEUTRAL_THEME.palette['blue']);
    expect(neutral).toContain(NEUTRAL_THEME.palette['red']);
    expect(dark).toContain('#60a5fa');
    expect(dark).not.toContain(NEUTRAL_THEME.palette['blue']);
  });

  it('the only hex in the SVG comes from the Theme', async () => {
    const svg = await draw(DARK);
    const allowed = new Set([...Object.values(DARK.palette), ...Object.values(DARK.tokens)].map((c) => c.toLowerCase()));

    for (const hex of svg.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
      expect(allowed.has(hex.toLowerCase())).toBe(true);
    }
  });

  it('escapes the Node text and uses the override label', async () => {
    const svg = await draw(NEUTRAL_THEME);

    expect(svg).toContain('Auth &amp; &lt;Tokens&gt;');
    expect(svg).toContain('Postgres');
    expect(svg).not.toContain('Base de datos');
  });

  it('a collapsed Group does not draw its children', async () => {
    const svg = await draw(NEUTRAL_THEME, { collapsed: ['a'] });

    expect(svg).not.toContain('>API<');
    expect(svg).toContain('Plataforma');
  });

  it('also escapes the Theme values that go into attributes', async () => {
    const hostile: Theme = { ...NEUTRAL_THEME, palette: { ...NEUTRAL_THEME.palette, blue: '"/><script>' }, fonts: { body: 'a"b', mono: 'monospace' } };
    const svg = await draw(hostile);

    expect(svg).not.toContain('<script>');
    expect(svg).not.toMatch(/<script/i);
  });
});

describe('Diagram: Attributes and icons', () => {
  function table(iconList: Record<string, string> = {}): { view: ResolvedView; icons: IconProvider } {
    const source = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'tabla', icon: 'database', color: 'blue' }, { name: 'servicio', icon: 'logo' }] },
      model: {
        nodes: [
          {
            ...node('usuarios', 'Usuarios', 'tabla'),
            attributes: [{ name: 'id', type: 'uuid' }, { name: 'email', type: 'text' }, { name: 'creado', type: 'timestamp' }],
          },
          node('api', 'API', 'servicio'),
        ],
        edges: [{ from: { node: 'api' }, to: { node: 'usuarios', attribute: 'email' } }],
      },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    });
    return { view: resolveView(source, 'v')!, icons: combineIconProviders(workspaceIcons(iconList), genericIcons()) };
  }
  async function drawTable(iconList: Record<string, string> = {}): Promise<string> {
    const { view, icons } = table(iconList);
    const geometry = await layoutView(view, NEUTRAL_THEME);
    return toHtml({ view, geometry, theme: NEUTRAL_THEME, width: 800, height: 600, icons });
  }

  it('draws a table Node with its Attributes in order', async () => {
    const svg = await drawTable();

    expect(svg.indexOf('id: uuid')).toBeGreaterThan(-1);
    expect(svg.indexOf('id: uuid')).toBeLessThan(svg.indexOf('email: text'));
    expect(svg.indexOf('email: text')).toBeLessThan(svg.indexOf('creado: timestamp'));
  });

  it('the Edge to node#attribute ends at the height of the Attribute row', async () => {
    const { view, icons } = table();
    const geometry = await layoutView(view, NEUTRAL_THEME);
    const svg = toHtml({ view, geometry, theme: NEUTRAL_THEME, width: 800, height: 600, icons });
    const { cabecera: header, fila: row } = metricsOf(NEUTRAL_THEME, 'architecture');
    const box = geometry.nodes['usuarios']!;
    const end = geometry.edges['api -> usuarios#email']!.points.at(-1)!;
    const slot = rectOf(tagWith(svg, 'data-slot="attrs"'));
    const drawn = rectOf(tagWith(svg, 'data-attribute="usuarios#email"'));

    expect(end.y).toBe(box.y + header + 1.5 * row);
    expect(slot.y + drawn.y + drawn.height / 2).toBe(header + 1.5 * row);
  });

  it('the Node kind icon is embedded inline, without external references', async () => {
    const svg = await drawTable();
    const icon = /<div [^>]*data-icon="database"[^>]*>([\s\S]*?)<\/div>/.exec(svg);

    expect(icon).not.toBeNull();
    expect(icon![1]).toContain('<ellipse');
    expect(svg).not.toMatch(/href\s*=|<image|url\(https?:/i);
  });

  it('a Workspace icon with external references or scripts is not embedded', async () => {
    const dangerous = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="https://x.test/a.png"/><script>alert(1)</script></svg>';
    const svg = await drawTable({ 'iconos/logo.svg': dangerous });

    expect(svg).not.toContain('x.test');
    expect(svg).not.toContain('<script');
  });

  it.each([
    ['an event without a space', '<svg xmlns="http://www.w3.org/2000/svg"/onload="alert(1)"><circle r="1"/></svg>'],
    ['an event after a quote', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"onclick="x()"/></svg>'],
    ['iframe', '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://x.test"/></svg>'],
    ['animate toward href', '<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" values="javascript:alert(1)"/></a></svg>'],
    ['an unquoted href', '<svg xmlns="http://www.w3.org/2000/svg"><use href=https://x.test/a.svg#i /></svg>'],
    ['a style with import', '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://x.test/a.css";</style></svg>'],
    ['an external url in an attribute', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1" fill="url(https://x.test/g)"/></svg>'],
  ])('a Workspace icon with %s is not embedded', async (_, dangerous) => {
    const svg = (await drawTable({ 'iconos/logo.svg': dangerous })).replace(/<style>[\s\S]*?<\/style>/, '');

    expect(svg).not.toMatch(/x\.test|alert|onload|onclick|<iframe|<animate|<style/);
  });

  it('an icon with an XML prolog and comments is embedded without them', async () => {
    const clean = '<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
    const svg = await drawTable({ 'iconos/logo.svg': clean });

    expect(svg).not.toContain('<?xml');
    expect(svg).not.toContain('<!--');
  });

  it('a Workspace icon with its own width/height ends up at Node size and the SVG stays deterministic', async () => {
    const logo = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
    const svg = await drawTable({ 'iconos/logo.svg': logo });

    expect(svg).not.toContain('width="200"');
    expect(svg).toContain('<circle');
    expect(svg).toBe(await drawTable({ 'iconos/logo.svg': logo }));
  });
});

describe('shared Metrics: layout and drawing', () => {
  const source = canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'tabla' }] },
    model: {
      nodes: [
        { ...node('t', 'Tabla', 'tabla'), attributes: [{ name: 'id', type: 'uuid' }, { name: 'columna_muy_larga_de_verdad', type: 'varchar(255)' }] },
      ],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  });
  const view = resolveView(source, 'v')!;

  async function drawWith(metrics = metricsOf(NEUTRAL_THEME, 'architecture')) {
    const geometry = await layoutView(view, NEUTRAL_THEME, { metricas: metrics });
    const html = toHtml({ view, geometry, theme: NEUTRAL_THEME, width: 800, height: 600, metrics });
    const zone = rectOf(tagWith(html, 'data-slot="attrs"'));
    const fontSizeValue = Number(/\.rd-fila\{[^}]*font-size:([\d.]+)px/.exec(html)![1]);
    const rows = [...html.matchAll(/<div [^>]*data-attribute="t#[^"]+"[^>]*>([^<]*)</g)].map((m) => {
      const r = rectOf(m[0]);
      // Absolute corner inside the Node box (the row is relative to the Slot) and text with its margin.
      return { x: zone.x + r.x + metrics.margenDeTexto, y: zone.y + r.y + r.height / 2, tamano: fontSizeValue, texto: m[1]! };
    });
    return { caja: geometry.nodes['t']!, filas: rows };
  }

  it('what is drawn fits in what is reserved: rows inside the box and text inside the width', async () => {
    const m = metricsOf(NEUTRAL_THEME, 'architecture');
    const { caja: box, filas: rows } = await drawWith();

    expect(rows).toHaveLength(2);
    for (const f of rows) {
      expect(f.y).toBeLessThan(box.height);
      expect(f.x + f.texto.length * f.tamano * m.factorDeAncho).toBeLessThanOrEqual(box.width);
    }
  });

  it('changing a Metric moves layout and drawing together, and what is drawn still fits', async () => {
    const m = metricsOf(NEUTRAL_THEME, 'architecture');
    const base = await drawWith();
    const other = await drawWith({ ...m, cabecera: m.cabecera + 12, fila: m.fila + 6, paddingHorizontal: m.paddingHorizontal + 16 });

    expect(other.caja.height).toBe(base.caja.height + 12 + 2 * 6);
    expect(other.caja.width).toBe(base.caja.width + 16);
    expect(other.filas[0]!.y).toBe(base.filas[0]!.y + 12 + 3);
    expect(other.filas[1]!.y).toBeLessThan(other.caja.height);
  });
});
