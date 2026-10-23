import { readdirSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';
import type { VistaResuelta } from 'canonico';
import { layoutView } from 'layout';
import { Diagram } from 'render';
import type { ComponenteDeTema, DiagramProps, PropsDeCodigo } from 'render';
import { TEMA_NEUTRO } from 'tema';
import type { TemaResuelto } from 'tema';

import { etiquetaCon, propiedad } from './ayudas';

const nodo = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });
const vista = (): VistaResuelta =>
  resolveView(
    fuenteCanonicaSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio', color: 'blue' }] },
      model: { nodes: [nodo('a'), nodo('b')], edges: [{ from: { node: 'a' }, to: { node: 'b' } }] },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    }),
    'v',
    {},
  )!;

const base = [
  { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 8 } } },
  { nombre: 'fondo', primitiva: { tipo: 'solid', props: { color: 'amber' } } },
];
const aura = (encima = false) => ({ nombre: 'aura', primitiva: { tipo: 'code', props: { component: 'Aurora', hue: 3 } }, ...(encima && { encima: true }) });

const temaCon = (capas: unknown[], estados: Record<string, unknown[]> = {}): TemaResuelto =>
  ({ ...TEMA_NEUTRO, nodo: { slots: ['title', 'attrs'], tipos: {}, estados, textos: {}, capas } }) as unknown as TemaResuelto;

async function dibujar(theme: TemaResuelto, extra: Partial<DiagramProps> = {}): Promise<string> {
  const view = vista();
  const geometry = await layoutView(view, TEMA_NEUTRO);
  return renderToStaticMarkup(<Diagram view={view} geometry={geometry} theme={theme} width={800} height={600} {...extra} />);
}

/** Componente de prueba que anota las props que recibe (por id de elemento) y pinta un marcador. */
function espia(): { recibidas: Map<string, PropsDeCodigo>; Aurora: ComponenteDeTema } {
  const recibidas = new Map<string, PropsDeCodigo>();
  const Aurora: ComponenteDeTema = (props) => {
    recibidas.set(props.id, props);
    return <i data-aurora={props.id} style={{ width: 9999, height: 9999 }} />;
  };
  return { recibidas, Aurora };
}

describe('seam Diagram: Capa code', () => {
  it('el componente registrado recibe props de solo lectura: caja, estado, colores, id, parametros y datos acotados', async () => {
    const { recibidas, Aurora } = espia();
    const html = await dibujar(temaCon([...base, aura()]), { componentes: { Aurora }, estados: { a: ['hover'] } });

    expect(html).toContain('data-aurora="a"');
    const a = recibidas.get('a')!;
    expect(a.id).toBe('a');
    expect(a.estado).toEqual(['hover']);
    expect(a.parametros).toEqual({ hue: 3 });
    expect(a.datos).toEqual({ tipo: 'servicio', titulo: 'A', tieneContenido: false });
    expect(a.colores.trazo).toBe(TEMA_NEUTRO.palette['blue']);
    expect(a.caja.ancho).toBeGreaterThan(0);
    expect(a.caja.alto).toBeGreaterThan(0);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.parametros)).toBe(true);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(recibidas.get('b')!.estado).toEqual([]);
  });

  it('un parche de estado cambia los parametros que recibe el componente mientras el estado vale', async () => {
    const { recibidas, Aurora } = espia();
    await dibujar(temaCon([...base, aura()], { hover: [{ nombre: 'aura', props: { hue: 9 } }] }), { componentes: { Aurora }, estados: { a: ['hover'] } });

    expect(recibidas.get('a')!.parametros).toEqual({ hue: 9 });
    expect(recibidas.get('b')!.parametros).toEqual({ hue: 3 });
  });

  it('va bajo el contenido por defecto y sobre el con over', async () => {
    const { Aurora } = espia();
    const debajo = await dibujar(temaCon([...base, aura()]), { componentes: { Aurora } });
    const encima = await dibujar(temaCon([...base, aura(true)]), { componentes: { Aurora } });

    expect(debajo.indexOf('data-aurora="a"')).toBeLessThan(debajo.indexOf('data-slot="title"'));
    expect(encima.indexOf('data-aurora="a"')).toBeGreaterThan(encima.indexOf('data-slot="title"'));
  });

  it('un componente no cambia el tamano del elemento: su contenedor mide la caja y la caja es la de sin codigo', async () => {
    const { Aurora } = espia();
    const con = await dibujar(temaCon([...base, aura()]), { componentes: { Aurora } });
    const sin = await dibujar(temaCon(base));

    const cajaCon = etiquetaCon(con, 'data-id="a"');
    expect(propiedad(cajaCon, 'width')).toBe(propiedad(etiquetaCon(sin, 'data-id="a"'), 'width'));
    expect(propiedad(cajaCon, 'height')).toBe(propiedad(etiquetaCon(sin, 'data-id="a"'), 'height'));
    const contenedor = etiquetaCon(con, 'data-codigo="Aurora"');
    expect(propiedad(contenedor, 'width')).toBe(propiedad(cajaCon, 'width'));
    expect(propiedad(contenedor, 'height')).toBe(propiedad(cajaCon, 'height'));
  });

  it('un componente sin registrar deja el contenedor vacio y el resto del dibujo intacto', async () => {
    const html = await dibujar(temaCon([...base, aura()]), { componentes: {} });

    expect(html).toContain('data-codigo="Aurora"');
    expect(html).toContain('data-slot="title"');
    expect(html).not.toContain('data-aurora');
  });

  it('un componente que lanza no tumba el dibujo', async () => {
    const Roto: ComponenteDeTema = () => {
      throw new Error('boom');
    };
    const capas = [...base, { nombre: 'aura', primitiva: { tipo: 'code', props: { component: 'Roto' } } }];
    const html = await dibujar(temaCon(capas), { componentes: { Roto } });

    expect(html).toContain('data-slot="title"');
  });

  it('render nunca importa codigo del Workspace: sus fuentes no cargan modulos dinamicos ni evaluan texto', () => {
    const carpeta = new URL('../src/', import.meta.url);
    const archivos = readdirSync(carpeta, { recursive: true, encoding: 'utf8' }).filter((f) => /\.tsx?$/.test(f));
    for (const archivo of archivos) {
      const texto = readFileSync(new URL(archivo, carpeta), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(texto, archivo).not.toMatch(/\bimport\s*\(|\brequire\s*\(|\beval\s*\(|new Function\s*\(/);
    }
  });
});
