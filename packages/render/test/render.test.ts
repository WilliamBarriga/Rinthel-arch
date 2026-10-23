import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO, combineIconProviders, fuenteCanonicaSchema, genericIcons, resolveView, workspaceIcons } from 'canonico';
import type { IconProvider, Tema, VistaResuelta } from 'canonico';
import { layoutView, metricasDe } from 'layout';
import { aSvg } from './ayudas';

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
  return aSvg({ view: v, geometry, theme: tema, width: 800, height: 600 });
}

describe('aSvg', () => {
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

    expect(svg).toMatch(/<g data-edge="a\.api -&gt; db"><path d="M [\d. ]+( L [\d. ]+)+" fill="none" stroke="[^"]+" marker-end="url\(#flecha-\w+\)"/);
    expect(svg).toMatch(/<g data-edge="a\.api -&gt; a\.auth"/);
    expect(svg).toMatch(/<marker id="flecha-[\w]+"/);
  });

  it('dibuja una Arista entre Grupos sobre el borde del Grupo colapsado (snapshot)', async () => {
    const svg = await dibujar(TEMA_NEUTRO, { collapsed: ['a'] });

    expect(svg).toMatch(/<g data-edge="a -&gt; db"/);
    expect(svg).not.toMatch(/data-edge="a\.api/);
    expect(svg).toMatchSnapshot();
  });

  it('la cardinalidad va junto al extremo que le corresponde', async () => {
    const v = vista();
    const geometry = await layoutView(v, TEMA_NEUTRO);
    const svg = aSvg({ view: v, geometry, theme: TEMA_NEUTRO, width: 800, height: 600 });
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

  it('la etiqueta de una Arista va sobre su ruta, en un solo texto', async () => {
    const base = vista();
    const v: VistaResuelta = {
      ...base,
      edges: base.edges.map((arista) => (arista.to.node === 'a.auth' ? { ...arista, label: 'valida <token>' } : arista)),
    };
    const geometry = await layoutView(v, TEMA_NEUTRO);
    const svg = aSvg({ view: v, geometry, theme: TEMA_NEUTRO, width: 800, height: 600 });
    const ruta = geometry.edges['a.api -> a.auth']!.points;
    const xs = ruta.map((p) => p.x);
    const ys = ruta.map((p) => p.y);
    const m = /<text data-edge-label="a\.api -&gt; a\.auth"[^>]* x="([\d.-]+)" y="([\d.-]+)"[^>]*>valida &lt;token&gt;<\/text>/.exec(svg);

    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(Math.min(...xs) - 1);
    expect(Number(m![1])).toBeLessThanOrEqual(Math.max(...xs) + 1);
    expect(Number(m![2])).toBeGreaterThanOrEqual(Math.min(...ys) - 20);
    expect(Number(m![2])).toBeLessThanOrEqual(Math.max(...ys) + 20);
    expect(svg).not.toContain('data-edge-label="a.api -&gt; db"');
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
    const hostil: Tema = { ...TEMA_NEUTRO, palette: { ...TEMA_NEUTRO.palette, blue: '"/><script>' }, fonts: { body: 'a"b', mono: 'monospace' } };
    const svg = await dibujar(hostil);

    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&quot;/&gt;&lt;script&gt;');
  });
});

describe('aSvg: Atributos e iconos', () => {
  function tabla(iconos: Record<string, string> = {}): { view: VistaResuelta; icons: IconProvider } {
    const fuente = fuenteCanonicaSchema.parse({
      specification: { nodeTypes: [{ name: 'tabla', icon: 'database', color: 'blue' }, { name: 'servicio', icon: 'logo' }] },
      model: {
        nodes: [
          {
            ...nodo('usuarios', 'Usuarios', 'tabla'),
            attributes: [{ name: 'id', type: 'uuid' }, { name: 'email', type: 'text' }, { name: 'creado', type: 'timestamp' }],
          },
          nodo('api', 'API', 'servicio'),
        ],
        edges: [{ from: { node: 'api' }, to: { node: 'usuarios', attribute: 'email' } }],
      },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    });
    return { view: resolveView(fuente, 'v')!, icons: combineIconProviders(workspaceIcons(iconos), genericIcons()) };
  }
  async function dibujarTabla(iconos: Record<string, string> = {}): Promise<string> {
    const { view, icons } = tabla(iconos);
    const geometry = await layoutView(view, TEMA_NEUTRO);
    return aSvg({ view, geometry, theme: TEMA_NEUTRO, width: 800, height: 600, icons });
  }

  it('dibuja un Nodo tipo tabla con sus Atributos en orden y la Arista al Atributo (snapshot)', async () => {
    const svg = await dibujarTabla();

    expect(svg.indexOf('id: uuid')).toBeGreaterThan(-1);
    expect(svg.indexOf('id: uuid')).toBeLessThan(svg.indexOf('email: text'));
    expect(svg.indexOf('email: text')).toBeLessThan(svg.indexOf('creado: timestamp'));
    expect(svg).toMatchSnapshot();
  });

  it('la Arista a nodo#atributo termina a la altura de la fila del Atributo', async () => {
    const { view, icons } = tabla();
    const geometry = await layoutView(view, TEMA_NEUTRO);
    const svg = aSvg({ view, geometry, theme: TEMA_NEUTRO, width: 800, height: 600, icons });
    const { cabecera, fila } = metricasDe(TEMA_NEUTRO);
    const caja = geometry.nodes['usuarios']!;
    const fin = geometry.edges['api -> usuarios#email']!.points.at(-1)!;
    const fila2 = new RegExp(`<text data-attribute="usuarios#email" x="[\\d.]+" y="([\\d.]+)"`).exec(svg);

    expect(fin.y).toBe(caja.y + cabecera + 1.5 * fila);
    expect(Number(fila2![1])).toBe(cabecera + 1.5 * fila);
  });

  it('el icono del Tipo de nodo se incrusta inline, sin referencias externas', async () => {
    const svg = await dibujarTabla();
    const icono = /<g data-icon="database"[^>]*>([\s\S]*?)<\/g>/.exec(svg);

    expect(icono).not.toBeNull();
    expect(icono![1]).toContain('<ellipse');
    expect(svg).not.toMatch(/href\s*=|<image|url\(https?:/i);
  });

  it('un icono del Workspace con referencias externas o scripts no se incrusta', async () => {
    const peligroso = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="https://x.test/a.png"/><script>alert(1)</script></svg>';
    const svg = await dibujarTabla({ 'iconos/logo.svg': peligroso });

    expect(svg).not.toContain('x.test');
    expect(svg).not.toContain('<script');
  });

  it.each([
    ['evento sin espacio', '<svg xmlns="http://www.w3.org/2000/svg"/onload="alert(1)"><circle r="1"/></svg>'],
    ['evento tras comilla', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"onclick="x()"/></svg>'],
    ['iframe', '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://x.test"/></svg>'],
    ['animate hacia href', '<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" values="javascript:alert(1)"/></a></svg>'],
    ['href sin comillas', '<svg xmlns="http://www.w3.org/2000/svg"><use href=https://x.test/a.svg#i /></svg>'],
    ['style con import', '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://x.test/a.css";</style></svg>'],
    ['url externa en atributo', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1" fill="url(https://x.test/g)"/></svg>'],
  ])('un icono del Workspace con %s no se incrusta', async (_, peligroso) => {
    const svg = await dibujarTabla({ 'iconos/logo.svg': peligroso });

    expect(svg).not.toMatch(/x\.test|alert|onload|onclick|<iframe|<animate|<style/);
  });

  it('un icono con prologo XML y comentarios se incrusta sin ellos', async () => {
    const limpio = '<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
    const svg = await dibujarTabla({ 'iconos/logo.svg': limpio });

    expect(svg).not.toContain('<?xml');
    expect(svg).not.toContain('<!--');
  });

  it('un icono del Workspace con su propio width/height queda a tamano del Nodo y el SVG sigue siendo determinista', async () => {
    const logo = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
    const svg = await dibujarTabla({ 'iconos/logo.svg': logo });

    expect(svg).not.toContain('width="200"');
    expect(svg).toContain('<circle');
    expect(svg).toBe(await dibujarTabla({ 'iconos/logo.svg': logo }));
  });
});

describe('Metricas compartidas: layout y dibujo', () => {
  const fuente = fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'tabla' }] },
    model: {
      nodes: [
        { ...nodo('t', 'Tabla', 'tabla'), attributes: [{ name: 'id', type: 'uuid' }, { name: 'columna_muy_larga_de_verdad', type: 'varchar(255)' }] },
      ],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  });
  const view = resolveView(fuente, 'v')!;

  async function dibujarCon(metricas = metricasDe(TEMA_NEUTRO)) {
    const geometry = await layoutView(view, TEMA_NEUTRO, { metricas });
    const svg = aSvg({ view, geometry, theme: TEMA_NEUTRO, width: 800, height: 600, metricas });
    const filas = [...svg.matchAll(/<text data-attribute="t#[^"]+" x="([\d.]+)" y="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)</g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
      tamano: Number(m[3]),
      texto: m[4]!,
    }));
    return { caja: geometry.nodes['t']!, filas };
  }

  it('lo dibujado cabe en lo reservado: filas dentro de la caja y texto dentro del ancho', async () => {
    const m = metricasDe(TEMA_NEUTRO);
    const { caja, filas } = await dibujarCon();

    expect(filas).toHaveLength(2);
    for (const f of filas) {
      expect(f.y).toBeLessThan(caja.height);
      expect(f.x + f.texto.length * f.tamano * m.factorDeAncho).toBeLessThanOrEqual(caja.width);
    }
  });

  it('cambiar una Metrica mueve layout y dibujo a la vez, y lo dibujado sigue cabiendo', async () => {
    const m = metricasDe(TEMA_NEUTRO);
    const base = await dibujarCon();
    const otra = await dibujarCon({ ...m, cabecera: m.cabecera + 12, fila: m.fila + 6, paddingHorizontal: m.paddingHorizontal + 16 });

    expect(otra.caja.height).toBe(base.caja.height + 12 + 2 * 6);
    expect(otra.caja.width).toBe(base.caja.width + 16);
    expect(otra.filas[0]!.y).toBe(base.filas[0]!.y + 12 + 3);
    expect(otra.filas[1]!.y).toBeLessThan(otra.caja.height);
  });
});
