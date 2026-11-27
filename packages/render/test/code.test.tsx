import { readdirSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import type { ResolvedView } from 'canonical';
import { layoutView } from 'layout';
import { Diagram } from 'render';
import type { ThemeComponent, DiagramProps, CodeProps } from 'render';
import { NEUTRAL_THEME } from 'theme';
import type { ResolvedTheme } from 'theme';

import { tagWith, property } from './helpers';

const node = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });
const makeView = (): ResolvedView =>
  resolveView(
    canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio', color: 'blue' }] },
      model: { nodes: [node('a'), node('b')], edges: [{ from: { node: 'a' }, to: { node: 'b' } }] },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    }),
    'v',
    {},
  )!;

const base = [
  { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 8 } } },
  { nombre: 'fondo', primitiva: { tipo: 'solid', props: { color: 'amber' } } },
];
const aura = (above = false) => ({ nombre: 'aura', primitiva: { tipo: 'code', props: { component: 'Aurora', hue: 3 } }, ...(above && { encima: true }) });

const themeWith = (layers: unknown[], states: Record<string, unknown[]> = {}): ResolvedTheme =>
  ({ ...NEUTRAL_THEME, nodo: { slots: NEUTRAL_THEME.nodo.slots, tipos: {}, estados: states, textos: {}, capas: layers } }) as unknown as ResolvedTheme;

async function draw(theme: ResolvedTheme, extra: Partial<DiagramProps> = {}): Promise<string> {
  const view = makeView();
  const geometry = await layoutView(view, NEUTRAL_THEME);
  return renderToStaticMarkup(<Diagram view={view} geometry={geometry} theme={theme} width={800} height={600} {...extra} />);
}

/** Test component that records the props it receives (by element id) and paints a marker. */
function spy(): { received: Map<string, CodeProps>; Aurora: ThemeComponent } {
  const received = new Map<string, CodeProps>();
  const Aurora: ThemeComponent = (props) => {
    received.set(props.id, props);
    return <i data-aurora={props.id} style={{ width: 9999, height: 9999 }} />;
  };
  return { received, Aurora };
}

describe('seam Diagram: code Layer', () => {
  it('the registered component receives read-only props: box, state, colors, id, parameters and bounded data', async () => {
    const { received, Aurora } = spy();
    const html = await draw(themeWith([...base, aura()]), { components: { Aurora }, states: { a: ['hover'] } });

    expect(html).toContain('data-aurora="a"');
    const a = received.get('a')!;
    expect(a.id).toBe('a');
    expect(a.estado).toEqual(['hover']);
    expect(a.parametros).toEqual({ hue: 3 });
    expect(a.datos).toEqual({ tipo: 'servicio', titulo: 'A', tieneContenido: false });
    expect(a.colores.trazo).toBe(NEUTRAL_THEME.palette['blue']);
    expect(a.caja.ancho).toBeGreaterThan(0);
    expect(a.caja.alto).toBeGreaterThan(0);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.parametros)).toBe(true);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(received.get('b')!.estado).toEqual([]);
  });

  it('a state patch changes the parameters the component receives while the state holds', async () => {
    const { received, Aurora } = spy();
    await draw(themeWith([...base, aura()], { hover: [{ nombre: 'aura', props: { hue: 9 } }] }), { components: { Aurora }, states: { a: ['hover'] } });

    expect(received.get('a')!.parametros).toEqual({ hue: 9 });
    expect(received.get('b')!.parametros).toEqual({ hue: 3 });
  });

  it('goes under the content by default and over it with over', async () => {
    const { Aurora } = spy();
    const below = await draw(themeWith([...base, aura()]), { components: { Aurora } });
    const above = await draw(themeWith([...base, aura(true)]), { components: { Aurora } });

    expect(below.indexOf('data-aurora="a"')).toBeLessThan(below.indexOf('data-slot="title"'));
    expect(above.indexOf('data-aurora="a"')).toBeGreaterThan(above.indexOf('data-slot="title"'));
  });

  it('a component does not change the element size: its container measures the box and the box is the one without code', async () => {
    const { Aurora } = spy();
    const withValue = await draw(themeWith([...base, aura()]), { components: { Aurora } });
    const without = await draw(themeWith(base));

    const boxWith = tagWith(withValue, 'data-id="a"');
    expect(property(boxWith, 'width')).toBe(property(tagWith(without, 'data-id="a"'), 'width'));
    expect(property(boxWith, 'height')).toBe(property(tagWith(without, 'data-id="a"'), 'height'));
    const container = tagWith(withValue, 'data-codigo="Aurora"');
    expect(property(container, 'width')).toBe(property(boxWith, 'width'));
    expect(property(container, 'height')).toBe(property(boxWith, 'height'));
  });

  it('an unregistered component leaves the container empty and the rest of the drawing intact', async () => {
    const html = await draw(themeWith([...base, aura()]), { components: {} });

    expect(html).toContain('data-codigo="Aurora"');
    expect(html).toContain('data-slot="title"');
    expect(html).not.toContain('data-aurora');
  });

  it('a component that throws does not bring the drawing down', async () => {
    const Broken: ThemeComponent = () => {
      throw new Error('boom');
    };
    const layers = [...base, { nombre: 'aura', primitiva: { tipo: 'code', props: { component: 'Broken' } } }];
    const html = await draw(themeWith(layers), { components: { Broken } });

    expect(html).toContain('data-slot="title"');
  });

  it('render never imports Workspace code: its sources load no dynamic modules nor evaluate text', () => {
    const folder = new URL('../src/', import.meta.url);
    const files = readdirSync(folder, { recursive: true, encoding: 'utf8' }).filter((f) => /\.tsx?$/.test(f));
    for (const file of files) {
      const text = readFileSync(new URL(file, folder), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(text, file).not.toMatch(/\bimport\s*\(|\brequire\s*\(|\beval\s*\(|new Function\s*\(/);
    }
  });
});
