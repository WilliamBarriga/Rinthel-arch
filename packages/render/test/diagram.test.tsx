import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { fuenteCanonicaSchema, resolveView, revealAt } from 'canonico';
import type { VistaResuelta } from 'canonico';
import { layoutView } from 'layout';
import type { Geometria } from 'layout';
import { Diagram, resolverEstilo } from 'render';
import type { DiagramProps } from 'render';
import { TEMA_NEUTRO, colocarEnCaja, metricasDe, primitivasDe } from 'tema';
import type { TemaResuelto } from 'tema';

import { PINTORES } from '../src/hoja';
import { capaDe, etiquetaCon, hojaDe, propiedad, rectDe, traslacionDe } from './ayudas';

const nodo = (id: string, title: string, children: unknown[] = []) => ({ id, type: 'servicio', title, description: '', children });

/** a { a1 a2 } -> b -> c, con dos pasos: primero `a`, luego `b` y `c`. */
function vista(estado = {}, steps: unknown[] = []): VistaResuelta {
  const fuente = fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: {
      nodes: [nodo('a', 'A', [nodo('a.a1', 'A1'), nodo('a.a2', 'A2')]), nodo('b', 'B'), nodo('c', 'C')],
      edges: [
        { from: { node: 'a.a1' }, to: { node: 'b' } },
        { from: { node: 'b' }, to: { node: 'c' } },
      ],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], steps }],
  });
  return resolveView(fuente, 'v', estado)!;
}

const PASOS = [
  { title: 'uno', show: [{ selector: 'a.**' }, { selector: 'a' }], hide: [] },
  { title: 'dos', show: [{ selector: 'b' }, { selector: 'c' }], hide: [] },
];

/** Tema con una pila de Capas: forma redonda, relleno y borde de Paleta. */
const CON_CAPAS: TemaResuelto = {
  ...TEMA_NEUTRO,
  nodo: {
    slots: TEMA_NEUTRO.nodo.slots,
    textos: {},
    tipos: {},
    estados: {},
    capas: [
      { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 12 } } },
      { nombre: 'fondo', primitiva: { tipo: 'solid', props: { color: 'amber' } } },
      { nombre: 'borde', primitiva: { tipo: 'border', props: { color: 'blue', width: 2 } } },
    ],
  },
};

async function props(view: VistaResuelta, extra: Partial<DiagramProps> = {}): Promise<DiagramProps> {
  const geometry: Geometria = await layoutView(view, TEMA_NEUTRO);
  return { view, geometry, theme: TEMA_NEUTRO, width: 800, height: 600, ...extra };
}

/** Recorre el arbol de elementos que devuelve el componente (sin DOM). */
function buscar(nodo: ReactNode, quien: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (nodo === null || typeof nodo !== 'object') return undefined;
  if (Array.isArray(nodo)) return nodo.map((n) => buscar(n, quien)).find((e) => e !== undefined);
  const elemento = nodo as ReactElement<Record<string, unknown>>;
  if (quien(elemento)) return elemento;
  return buscar(elemento.props?.['children'] as ReactNode, quien);
}

const dibujo = (p: DiagramProps): string => renderToStaticMarkup(<Diagram {...p} />);
const parteDe = (html: string, id: string): string | undefined => etiquetaCon(html.slice(html.indexOf(`data-id="${id}"`)), 'data-part="nodo"');
const opacidadDe = (html: string, id: string): string | undefined => propiedad(parteDe(html, id), 'opacity');
const mundoDe = (html: string): string | undefined => etiquetaCon(html, 'class="rd-mundo"');

describe('Diagram: estructura hibrida', () => {
  it('son tres capas planas en orden Grupo, Arista, Nodo bajo un contenedor', async () => {
    const html = dibujo(await props(vista()));
    const [g, a, n] = ['grupos', 'aristas', 'nodos'].map((c) => html.indexOf(`data-capa="${c}"`)) as [number, number, number];

    expect(html).toMatch(/^<div class="rd-\w+" data-diagram="" data-camara="0 0 \d+ \d+" style="width:800px;height:600px">/);
    expect(g).toBeGreaterThan(-1);
    expect(g).toBeLessThan(a);
    expect(a).toBeLessThan(n);
    expect(etiquetaCon(html, 'data-capa="aristas"')).toContain('aria-hidden="true"');
  });

  it('los Grupos abiertos van en su capa, los Nodos hoja en la de Nodos y las Aristas en el SVG', async () => {
    const html = dibujo(await props(vista()));
    const ids = (capa: 'grupos' | 'aristas' | 'nodos', atributo: string): string[] =>
      [...capaDe(html, capa).matchAll(new RegExp(`${atributo}="([^"]+)"`, 'g'))].map((m) => m[1]!);

    expect(ids('grupos', 'data-id')).toEqual(['a']);
    expect(ids('nodos', 'data-id')).toEqual(['a.a1', 'a.a2', 'b', 'c']);
    expect(ids('aristas', 'data-edge')).toEqual(['a.a1 -&gt; b', 'b -&gt; c']);
    expect(ids('nodos', 'data-edge')).toEqual([]);
  });

  it('un unico transform de pan/zoom en el contenedor, con el encuadre de la camara', async () => {
    const html = dibujo(await props(vista(), { camera: { x: 10, y: 20, width: 400, height: 300 } }));

    expect(html).toContain('data-camara="10 20 400 300"');
    expect(propiedad(mundoDe(html), 'transform')).toBe('translate(-20px,-40px) scale(2)');
    expect(html.match(/scale\(/g)).toHaveLength(1);
  });

  it('una camara con otra proporcion se centra como un viewBox', async () => {
    const html = dibujo(await props(vista(), { camera: { x: 0, y: 0, width: 400, height: 600 } }));

    // escala 1 (min(2, 1)); sobran 400 px a lo ancho, 200 a cada lado.
    expect(propiedad(mundoDe(html), 'transform')).toBe('translate(200px,0px) scale(1)');
  });

  it('cada caja esta en coordenadas absolutas del lienzo, tambien las de un Nodo dentro de un Grupo', async () => {
    const p = await props(vista());
    const html = dibujo(p);
    const { a, 'a.a1': a1, b } = p.geometry.nodes;

    expect(traslacionDe(etiquetaCon(html, 'data-id="a"'))).toEqual({ x: a!.x, y: a!.y });
    expect(traslacionDe(etiquetaCon(html, 'data-id="a.a1"'))).toEqual({ x: a!.x + a1!.x, y: a!.y + a1!.y });
    expect(traslacionDe(etiquetaCon(html, 'data-id="b"'))).toEqual({ x: b!.x, y: b!.y });
    expect(rectDe(etiquetaCon(html, 'data-id="a.a1"'))).toMatchObject({ width: a1!.width, height: a1!.height });
  });

  it('el mundo mide como la geometria y las Aristas van en un SVG del mismo tamano', async () => {
    const p = await props(vista());
    const html = dibujo(p);
    const { width, height } = p.geometry;

    expect(propiedad(mundoDe(html), 'width')).toBe(`${width}px`);
    expect(propiedad(mundoDe(html), 'height')).toBe(`${height}px`);
    expect(html).toContain(`width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`);
  });

  it('cada Slot va en el rectangulo que reservo la colocacion compartida', async () => {
    const p = await props(vista());
    const html = dibujo(p);
    const { slots } = colocarEnCaja(metricasDe(TEMA_NEUTRO), { titulo: 'b', atributos: [], icono: false }, p.geometry.nodes['b']!.width);
    const titulo = etiquetaCon(html.slice(html.indexOf('data-id="b"')), 'data-slot="title"');

    expect(rectDe(titulo)).toEqual(slots.title);
    expect(titulo).toContain('class="rd-slot rd-title"');
  });

  it('cada Nodo es una caja con contain: layout style', async () => {
    const html = dibujo(await props(vista()));

    expect(hojaDe(html)).toMatch(/\.rd-caja\{[^}]*contain:layout style/);
    expect(html).toMatch(/class="rd-caja" data-id="b"/);
  });
});

describe('Diagram: hoja de estilo', () => {
  it('compila las Capas del Tema a CSS en orden, con el color de Tipo del Nodo como variable', async () => {
    const html = dibujo(await props(vista(), { theme: CON_CAPAS }));

    expect(hojaDe(html)).toContain('border-radius:12px;background:#d97706;border:2px solid var(--trazo, #2563eb)');
    expect(propiedad(parteDe(html, 'b'), '--trazo')).toBe('#9ca3af');
  });

  it('es determinista y los estados son selectores', async () => {
    const p = await props(vista());
    const hoja = hojaDe(dibujo(p));

    expect(hojaDe(dibujo(p))).toBe(hoja);
    for (const estado of ['seleccionado', 'hover', 'fantasma']) expect(hoja).toContain(`.rd-estado[data-state="${estado}"]{`);
    expect(hoja).toContain('.rd-estado[data-state="fantasma"]{border:2px dashed #9ca3af;opacity:0.7}');
  });

  it('sin Capas en el Tema se usa el aspecto por defecto del Estilo', async () => {
    expect(hojaDe(dibujo(await props(vista())))).toContain('border-radius:6px;background:#ffffff;border:1px solid var(--trazo, #9ca3af)');
  });

  it('dos Temas dan clases de alcance distintas, asi no se pisan en la misma pagina', async () => {
    const clase = (html: string): string => /^<div class="(rd-\w+)"/.exec(html)![1]!;
    const a = dibujo(await props(vista()));
    const b = dibujo(await props(vista(), { theme: CON_CAPAS }));

    expect(clase(a)).not.toBe(clase(b));
    expect(hojaDe(b)).not.toContain(`.${clase(a)}`);
  });

  it('cada Primitiva del catalogo tiene su pintor', () => {
    expect(Object.keys(PINTORES).sort()).toEqual(primitivasDe('capa-nodo').sort());
  });

  it('un valor hostil del Tema no puede cerrar la hoja ni inyectar reglas', async () => {
    const hostil: TemaResuelto = { ...CON_CAPAS, palette: { ...CON_CAPAS.palette, amber: 'red}</style><script>x()</script>' } };
    const html = dibujo(await props(vista(), { theme: hostil }));

    expect(html).not.toContain('<script>');
    expect(hojaDe(html)).not.toContain('</style>');
    expect(hojaDe(html)).toContain('background:red/stylescriptx()/script');
  });
});

describe('Diagram', () => {
  it('dibuja Nodos, Grupos y Aristas', async () => {
    const html = dibujo(await props(vista()));

    for (const id of ['a', 'a.a1', 'a.a2', 'b', 'c']) expect(html).toContain(`data-id="${id}"`);
    expect(html).toContain('data-edge="a.a1 -&gt; b"');
  });

  it('visibility 0, 1 y fraccion se reflejan en la opacidad de Nodos y Aristas', async () => {
    const visibility = (id: string): number => ({ b: 0, c: 0.5, 'b -> c': 0.25 })[id] ?? 1;
    const html = dibujo(await props(vista(), { visibility }));

    expect(opacidadDe(html, 'b')).toBe('0');
    expect(opacidadDe(html, 'c')).toBe('0.5');
    expect(opacidadDe(html, 'a.a1')).toBeUndefined();
    expect(html).toMatch(/<g data-edge="b -&gt; c" opacity="0.25"/);
    expect(html).not.toMatch(/<g data-edge="a.a1 -&gt; b" opacity/);
  });

  it('un Grupo colapsado es un Nodo unico con contador y sin hijos', async () => {
    const html = dibujo(await props(vista({ collapsed: ['a'] })));

    expect(html).toContain('A (2)');
    expect(html).not.toContain('data-id="a.a1"');
    expect(html).toContain('data-edge="a -&gt; b"');
    expect(capaDe(html, 'nodos')).toContain('data-id="a"');
    expect(capaDe(html, 'grupos')).not.toContain('data-id=');
    expect(parteDe(html, 'a')).toContain('data-collapsed=""');
  });

  it('con revealAt el resultado coincide con el paso esperado', async () => {
    const view = vista({}, PASOS);
    const base = await props(view);
    const enPaso = (k: number): string => dibujo({ ...base, visibility: revealAt(view, k) });

    expect(opacidadDe(enPaso(1), 'a.a1')).toBeUndefined();
    expect(opacidadDe(enPaso(1), 'b')).toBe('0');
    expect(opacidadDe(enPaso(2), 'b')).toBeUndefined();
    expect(opacidadDe(enPaso(1.5), 'b')).toBe('0');
  });

  it('sin estado propio: las mismas props producen el mismo arbol', async () => {
    const p = await props(vista(), { visibility: (id) => (id === 'c' ? 0.3 : 1) });

    expect(dibujo(p)).toBe(dibujo(p));
    expect(JSON.stringify(Diagram(p))).toBe(JSON.stringify(Diagram(p)));
  });

  it('un Nodo o Arista con visibilidad 0 no recibe clics', async () => {
    const visibility = (id: string): number => (id === 'b' || id === 'b -> c' ? 0 : 1);
    const html = dibujo(await props(vista(), { visibility }));

    expect(propiedad(parteDe(html, 'b'), 'pointer-events')).toBe('none');
    expect(propiedad(parteDe(html, 'c'), 'pointer-events')).toBeUndefined();
    expect(html).toMatch(/<g data-edge="b -&gt; c" opacity="0" pointer-events="none"/);
  });

  it('el marcador de flecha toma el color de borde del Tema y no hay ids que compartir', async () => {
    const oscuro = { ...TEMA_NEUTRO, tokens: { ...TEMA_NEUTRO.tokens, border: '#4b5563' } };
    const a = dibujo(await props(vista()));
    const b = dibujo(await props(vista(), { theme: oscuro }));

    expect(a).toContain('data-marker="fin"');
    expect(a).not.toContain('<marker');
    expect(b).toMatch(/data-marker="fin"[^>]*><path d="[^"]+" fill="#4b5563"/);
  });

  it('cambiar un valor del Estilo cambia lo que dibuja Diagram', async () => {
    const base = await props(vista());
    const estilo = resolverEstilo(TEMA_NEUTRO);
    const otro = { ...estilo, nodo: { ...estilo.nodo, radio: 13, relleno: '#fafafa' }, glifos: { expandido: 'v', colapsado: '>' } };
    const dibujar = (e: typeof estilo): string => dibujo({ ...base, onToggle: () => {}, estilo: e });

    expect(dibujar(otro)).not.toBe(dibujar(estilo));
    expect(hojaDe(dibujar(otro))).toContain('border-radius:13px;background:#fafafa');
    expect(dibujar(otro)).toContain('>v<');
  });

  it('pulsar un Nodo llama a onSelect con su id; pulsar una Arista, con el de la Arista', async () => {
    const onSelect = vi.fn();
    const arbol = Diagram(await props(vista(), { onSelect }));
    // El clic va en la parte propia del Nodo, hija de la caja `data-id`.
    const porId = (id: string) => buscar(buscar(arbol, (e) => e.props['data-id'] === id)!.props['children'] as ReactNode, (e) => e.props['data-part'] === 'nodo')!;
    const porArista = (id: string) => buscar(arbol, (e) => e.props['data-edge'] === id)!;

    (porId('b').props['onClick'] as () => void)();
    (porArista('b -> c').props['onClick'] as () => void)();

    expect(onSelect.mock.calls).toEqual([['b'], ['b -> c']]);
  });

  it('el control de un Grupo llama a onToggle con su id sin seleccionarlo', async () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    const arbol = Diagram(await props(vista(), { onToggle, onSelect }));
    const control = buscar(arbol, (e) => e.props['data-toggle'] === 'a')!;
    const detener = vi.fn();

    (control.props['onClick'] as (ev: { stopPropagation(): void }) => void)({ stopPropagation: detener });

    expect(onToggle).toHaveBeenCalledWith('a');
    expect(detener).toHaveBeenCalled();
    expect(buscar(arbol, (e) => e.props['data-toggle'] === 'b')).toBeUndefined();
  });

  it('sin onToggle no se dibujan controles de colapso', async () => {
    expect(dibujo(await props(vista()))).not.toContain('data-toggle');
  });

  describe('estados visuales', () => {
    const marcas = (html: string, estado: string): string[] => [...html.matchAll(new RegExp(`<[^>]*data-state="${estado}"[^>]*>`, 'g'))].map((m) => m[0]);

    it('un Nodo seleccionado lleva un contorno dentro de su caja, estilado por la hoja con el color del Estilo', async () => {
      const html = dibujo(await props(vista(), { estados: { b: ['seleccionado'] } }));
      const estilo = resolverEstilo(TEMA_NEUTRO);
      const [marca] = marcas(html, 'seleccionado');

      expect(marca).toContain('data-selected="b"');
      expect(marca).toContain('class="rd-estado"');
      expect(html.slice(html.indexOf('data-id="b"'), html.indexOf('data-id="c"'))).toContain('data-state="seleccionado"');
      expect(hojaDe(html)).toContain(`.rd-estado[data-state="seleccionado"]{border:3px solid ${estilo.estados.seleccionado.color}}`);
    });

    it('sin estados no se dibuja ninguna marca', async () => {
      expect(dibujo(await props(vista())).replace(/<style>[\s\S]*<\/style>/, '')).not.toContain('data-state');
    });

    it('una Arista marcada se dibuja en su capa SVG; un Atributo que no se muestra, no', async () => {
      const estados = { 'b -> c': ['hover'], 'a#x': ['seleccionado'] } as const;
      const html = dibujo(await props(vista(), { estados }));

      expect(marcas(capaDe(html, 'aristas'), 'hover')).toHaveLength(1);
      expect(marcas(capaDe(html, 'aristas'), 'hover')[0]).toContain('<path');
      expect(marcas(html, 'seleccionado')).toHaveLength(0);
    });

    it('el fantasma y el hover usan sus propias entradas del Estilo', async () => {
      const estilo = resolverEstilo(TEMA_NEUTRO);
      const otro = { ...estilo, estados: { ...estilo.estados, fantasma: { ...estilo.estados.fantasma, color: 'hotpink' } } };
      const hoja = hojaDe(dibujo(await props(vista(), { estados: { c: ['fantasma'] }, estilo: otro })));

      expect(hoja).toContain('.rd-estado[data-state="fantasma"]{border:2px dashed hotpink;opacity:0.7}');
      expect(hoja).toContain(`.rd-estado[data-state="hover"]{border:2px solid ${estilo.estados.hover.color};opacity:0.6}`);
    });

    it('un Atributo seleccionado marca su fila, en el rectangulo de la colocacion', async () => {
      const fuente = fuenteCanonicaSchema.parse({
        specification: { nodeTypes: [{ name: 'servicio' }] },
        model: { nodes: [{ ...nodo('t', 'T'), attributes: [{ name: 'id', type: 'int' }, { name: 'nombre', type: 'text' }] }], edges: [] },
        views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
      });
      const v = resolveView(fuente, 'v')!;
      const p = await props(v, { estados: { 't#nombre': ['seleccionado'] } });
      const marca = marcas(dibujo(p), 'seleccionado')[0];
      const m = metricasDe(TEMA_NEUTRO);

      expect(marca).toContain('data-selected="t#nombre"');
      expect(rectDe(marca)).toEqual({ x: 0, y: m.cabecera + m.fila, width: p.geometry.nodes['t']!.width, height: m.fila });
    });
  });
});
