import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';
import type { Tema, VistaResuelta } from 'canonico';
import { layoutView } from 'layout';
import { aHtml, etiquetaCon, hojaDe, propiedad } from './ayudas';
import { TEMA_NEUTRO, construirPrimitiva } from 'tema';

const nodo = (id: string, title: string, children: unknown[] = []) => ({ id, type: 'servicio', title, description: '', children });

function vista(titulo = 'Base', colapsado = false): VistaResuelta {
  const fuente = fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio', color: 'blue' }] },
    model: { nodes: [nodo('a', 'Plataforma', [nodo('a.api', 'API')]), nodo('db', titulo)], edges: [{ from: { node: 'a.api' }, to: { node: 'db' } }] },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], overrides: [] }],
  });
  return resolveView(fuente, 'v', colapsado ? { collapsed: ['a'] } : {})!;
}

/** Capa como la entrega el compilador del DSL: propiedades validadas y con los defectos del catalogo. */
const capa = (nombre: string, tipo: string, props: Record<string, string | number> = {}) => {
  const { primitiva, errores } = construirPrimitiva(tipo, Object.entries(props).map(([clave, valor]) => ({ clave, valor })), TEMA_NEUTRO.palette);
  if (primitiva === undefined) throw new Error(errores.map((e) => e.mensaje).join('; '));
  return { nombre, primitiva: { tipo, props: primitiva.props } };
};
const conCapas = (capas: ReturnType<typeof capa>[], seed?: string): Tema => ({
  ...TEMA_NEUTRO,
  tokens: { ...TEMA_NEUTRO.tokens, ...(seed !== undefined && { seed }) },
  nodo: { ...TEMA_NEUTRO.nodo, capas },
});

async function dibujar(tema: Tema, v = vista()): Promise<string> {
  return aHtml({ view: v, geometry: await layoutView(v, tema), theme: tema, width: 800, height: 600 });
}

/** Marcado de los filtros de mano alzada (`<filter ...>...</filter>`) dentro de la caja del Nodo `id`. */
const filtroDe = (html: string, id: string): string => {
  const desde = html.indexOf(`data-id="${id}"`);
  return /<filter[\s\S]*?<\/filter>/.exec(html.slice(desde))?.[0] ?? '';
};

describe('sombra, glow, vidrio', () => {
  it('apila varias sombras (la ultima encima) con inset, spread y blur 0 duro', async () => {
    const tema = conCapas([
      capa('suave', 'shadow', { color: 'green', y: 8, blur: 16 }),
      capa('dura', 'shadow', { color: 'blue', x: 4, y: 4, spread: 2 }),
      capa('interior', 'shadow', { color: 'gray', inset: 1, y: 0, blur: 6 }),
    ]);

    const hoja = hojaDe(await dibujar(tema));

    expect(hoja).toMatch(/box-shadow:inset 0px 0px 6px 0px #6b7280, 4px 4px 0px 2px #2563eb, 0px 8px 16px 0px #16a34a/);
  });

  it('el glow es un resplandor sin desplazamiento y el vidrio un backdrop-filter', async () => {
    const hoja = hojaDe(await dibujar(conCapas([capa('aura', 'glow', { color: 'blue', radius: 20, spread: 2 }), capa('cristal', 'glass', { blur: 10, saturate: 150 })])));

    expect(hoja).toContain('box-shadow:0px 0px 20px 2px #2563eb');
    expect(hoja).toContain('backdrop-filter:blur(10px) saturate(150%)');
  });
});

describe('mano alzada y giro deterministas', () => {
  const sketch = conCapas([capa('trazo', 'sketch', { roughness: 3 })]);

  it('cada Nodo referencia su propio filtro sembrado', async () => {
    const html = await dibujar(sketch);

    const id = /<filter[^>]*id="([^"]+)"/.exec(filtroDe(html, 'db'))?.[1];
    expect(id).toBeDefined();
    expect(html).toContain(`filter:url(#${id})`);
    expect(filtroDe(html, 'db')).toContain('feTurbulence');
    expect(filtroDe(html, 'db')).not.toBe(filtroDe(html, 'a.api'));
  });

  it('redimensionar o colapsar no cambia el trazo', async () => {
    const base = filtroDe(await dibujar(sketch), 'db');

    expect(base).not.toBe('');
    expect(filtroDe(await dibujar(sketch, vista('Un titulo mucho mas largo para ensanchar la caja')), 'db')).toBe(base);
    expect(filtroDe(await dibujar(sketch, vista('Base', true)), 'db')).toBe(base);
  });

  it('`seed N` cambia el trazo y es reproducible', async () => {
    const sin = filtroDe(await dibujar(sketch), 'db');
    const siete = filtroDe(await dibujar(conCapas([capa('trazo', 'sketch', { roughness: 3 })], '7')), 'db');
    const otraVez = filtroDe(await dibujar(conCapas([capa('trazo', 'sketch', { roughness: 3 })], '7')), 'db');

    expect(siete).toBe(otraVez);
    expect(siete).not.toBe(sin);
  });

  it('el giro es estable, no pasa de 3 grados y varia con la semilla', async () => {
    const giro = async (seed?: string) => {
      const html = await dibujar(conCapas([capa('ladeo', 'tilt', { degrees: 3 })], seed));
      return Number.parseFloat((propiedad(etiquetaCon(html, 'data-id="db"'), 'rotate') ?? '').replace('deg', ''));
    };

    const base = await giro();
    expect(Math.abs(base)).toBeLessThanOrEqual(3);
    expect(await giro()).toBe(base);
    expect(await giro('5')).not.toBe(base);
  });
});

describe('trazo de Arista a mano alzada', () => {
  const linea = (props: Record<string, string | number>) => {
    const { primitiva, errores } = construirPrimitiva('line', Object.entries(props).map(([clave, valor]) => ({ clave, valor })), TEMA_NEUTRO.palette, 'capa-arista');
    if (primitiva === undefined) throw new Error(errores.map((e) => e.mensaje).join('; '));
    return { nombre: 'linea', primitiva };
  };
  const conTrazo = (props: Record<string, string | number>): Tema => ({ ...TEMA_NEUTRO, arista: { ...TEMA_NEUTRO.arista, capas: [linea({ color: 'blue', ...props })] } });
  const aristas = (html: string): string => /data-capa="aristas"[\s\S]*?<\/svg>/.exec(html)?.[0] ?? '';

  it('roughness desplaza el trazo con un filtro de ruido en el lienzo, que no desaparece en tramos rectos', async () => {
    const svg = aristas(await dibujar(conTrazo({ roughness: 3.5, frequency: 0.035 })));
    const id = /<filter[^>]*id="([^"]+)"/.exec(svg)?.[1];

    expect(id).toBeDefined();
    expect(svg).toMatch(/<filter[^>]*filterUnits="userSpaceOnUse"/);
    expect(svg).toContain('baseFrequency="0.035"');
    expect(svg).toContain('scale="3.5"');
    expect(svg).toContain(`filter="url(#${id})"`);
  });

  it('sin roughness el trazo no lleva filtro', async () => {
    const svg = aristas(await dibujar(conTrazo({})));

    expect(svg).not.toContain('<filter');
    expect(svg).not.toContain('filter="url(');
  });
});

describe('decoracion y desbordes', () => {
  const adornado = conCapas([capa('sombra', 'shadow', { color: 'gray', blur: 20 }), capa('cinta', 'tape', { color: 'blue/0.5' }), capa('aro', 'ring', { color: 'blue', offset: 8 }), capa('trazo', 'sketch')]);

  it('las Capas pintadas sobresalen sin cambiar la geometria ni las cajas', async () => {
    const plano = conCapas([]);
    const v = vista();

    expect(await layoutView(v, adornado)).toEqual(await layoutView(v, plano));
    const caja = (html: string) => etiquetaCon(html, 'data-id="db"');
    expect(caja(await dibujar(adornado))).toBe(caja(await dibujar(plano)));
  });

  it('la cinta es un elemento propio que sobresale por arriba y no recibe clics; el aro sale por outline', async () => {
    const html = await dibujar(adornado);

    expect(html).toMatch(/class="rd-cinta"[^>]*style="[^"]*top:-8px/);
    expect(hojaDe(html)).toContain('outline:2px solid #2563eb;outline-offset:8px');
    expect(hojaDe(html)).toContain('.rd-cinta{');
  });

  it('el doblez es una esquina superior derecha doblada que tapa el borde, con el fondo de pagina y sombra dura', async () => {
    const html = await dibujar(conCapas([capa('borde', 'border', { color: 'gray', width: 2 }), capa('doblez', 'fold', { color: 'blue', size: 14, shadow: 'gray' })]));
    const doblez = etiquetaCon(html.slice(html.indexOf('data-id="db"')), 'class="rd-doblez"');

    expect(propiedad(doblez, 'top')).toBe('-2px');
    expect(propiedad(doblez, 'right')).toBe('-2px');
    expect(propiedad(doblez, 'border-width')).toBe('0 14px 14px 0');
    expect(propiedad(doblez, 'border-color')).toBe(`transparent ${TEMA_NEUTRO.tokens.background} #2563eb transparent`);
    expect(propiedad(doblez, 'box-shadow')).toBe('-2px 2px 0 #6b7280');
  });

  it('los pines son dos peines del color de la Capa que sobresalen por arriba y por abajo, con margen lateral', async () => {
    const html = await dibujar(conCapas([capa('patas', 'pins', { color: 'gray', width: 4, step: 11, length: 6, margin: 10 })]));
    const pines = etiquetaCon(html.slice(html.indexOf('data-id="db"')), 'class="rd-pines"');
    const peine = 'repeating-linear-gradient(90deg,#6b7280 0 4px,transparent 4px 11px)';

    expect(propiedad(pines, 'left')).toBe('10px');
    expect(propiedad(pines, 'right')).toBe('10px');
    expect(propiedad(pines, 'top')).toBe('-6px');
    expect(propiedad(pines, 'bottom')).toBe('-6px');
    expect(propiedad(pines, 'background-image')).toBe(`${peine},${peine}`);
    expect(propiedad(pines, 'background-size')).toBe('100% 6px,100% 6px');
    expect(propiedad(pines, 'background-position')).toBe('0 0,0 100%');
    expect(hojaDe(html)).toMatch(/\.rd-pines\{position:absolute;[^}]*background-repeat:no-repeat/);
  });

  it('la cinta con angle se gira ese angulo fijo, igual en todos los elementos', async () => {
    const html = await dibujar(conCapas([capa('cinta', 'tape', { color: 'blue/0.5', angle: -4 })]));

    expect(etiquetaCon(html.slice(html.indexOf('data-id="db"')), 'class="rd-cinta"')).toContain('rotate(-4deg)');
    expect(etiquetaCon(html.slice(html.indexOf('data-id="a.api"')), 'class="rd-cinta"')).toContain('rotate(-4deg)');
  });

  it('la franja es una banda del color de la Capa en un lado de la caja, sobre su borde y recortada por su contorno', async () => {
    const html = await dibujar(conCapas([capa('borde', 'border', { color: 'gray', width: 3 }), capa('franja', 'stripe', { color: 'blue', side: 'right', width: 12 })]));
    const franja = etiquetaCon(html.slice(html.indexOf('data-id="db"')), 'class="rd-franja"');

    expect(propiedad(franja, 'left')).toBe('-3px');
    expect(propiedad(franja, 'top')).toBe('-3px');
    expect(propiedad(franja, 'width')).toBe('calc(100% + 6px)');
    expect(propiedad(franja, 'background')).toBe('linear-gradient(to left,#2563eb 12px,transparent 12px)');
    expect(hojaDe(html)).toMatch(/\.rd-franja\{position:absolute;[^}]*border-radius:inherit/);
  });
});

