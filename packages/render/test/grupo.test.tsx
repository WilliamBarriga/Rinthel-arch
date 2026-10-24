import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';
import type { VistaResuelta } from 'canonico';
import { layoutView } from 'layout';
import { Diagram } from 'render';
import type { DiagramProps } from 'render';
import { TEMA_NEUTRO } from 'tema';
import type { TemaResuelto } from 'tema';

import { capaDe, etiquetaCon, hojaDe } from './ayudas';

const nodo = (id: string, type = 'servicio', children: unknown[] = []) => ({ id, type, title: id.toUpperCase(), description: '', children });
const vista = (estado: { collapsed?: string[] } = {}): VistaResuelta =>
  resolveView(
    fuenteCanonicaSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio', color: 'blue' }, { name: 'capa', color: 'green' }, { name: 'externo', color: 'red' }] },
      model: { nodes: [nodo('g', 'capa', [nodo('g.a'), nodo('g.b', 'externo')]), nodo('h', 'capa', [nodo('h.a')]), nodo('x', 'externo')], edges: [{ from: { node: 'g.a' }, to: { node: 'x' } }] },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    }),
    'v',
    estado,
  )!;

const capa = (nombre: string, tipo: string, props: Record<string, number | string>) => ({ nombre, primitiva: { tipo, props } });
const op = (nombre: string, props: Record<string, number | string>, primitiva?: string) => ({ nombre, props, ...(primitiva !== undefined && { primitiva }) });

const tema = (nodoExtra: Record<string, unknown> = {}, grupoExtra: Record<string, unknown> = {}): TemaResuelto =>
  ({
    ...TEMA_NEUTRO,
    nodo: { ...TEMA_NEUTRO.nodo, capas: [capa('forma', 'rect', { radius: 3 }), capa('relleno', 'solid', { color: 'amber' })], ...nodoExtra },
    grupo: { ...TEMA_NEUTRO.grupo, ...grupoExtra },
  }) as unknown as TemaResuelto;

async function dibujar(theme: TemaResuelto, extra: Partial<DiagramProps> = {}, estado: { collapsed?: string[] } = {}) {
  const view = vista(estado);
  const geometry = await layoutView(view, theme);
  const html = renderToStaticMarkup(<Diagram view={view} geometry={geometry} theme={theme} width={800} height={600} {...extra} />);
  return { html, css: hojaDe(html) };
}

/** Cuerpo de la primera regla con ese selector exacto (sin la clase de alcance). */
const regla = (css: string, selector: string): string | undefined => {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)\\.rd-[a-z0-9]+ ${escapado}\\{([^}]*)\\}`).exec(css)?.[1];
};

describe('Diagram: Nodo, Grupo abierto y Grupo colapsado tienen cada uno su pintura', () => {
  it('cada elemento lleva su clase y sus selectores quedan separados', async () => {
    const { html, css } = await dibujar(tema(), {}, { collapsed: ['h'] });

    expect(capaDe(html, 'grupos')).toContain('class="rd-grupo"');
    expect(capaDe(html, 'nodos')).toContain('class="rd-nodo"');
    expect(capaDe(html, 'nodos')).toContain('class="rd-colapsado"');
    expect(etiquetaCon(html, 'data-id="h"')).toContain('data-elemento="colapsado"');
    expect(etiquetaCon(html, 'data-id="g"')).toContain('data-elemento="grupo"');
    expect(css).not.toMatch(/\.rd-nodo, ?[^{]*\.rd-grupo[^{]*\{[^}]*border-radius/);
  });

  it('un Tema sin group pinta el Grupo con su pila sobria de los tokens y nunca con las Capas del Nodo', async () => {
    const { css } = await dibujar(tema());
    const nodo = regla(css, '.rd-nodo')!;
    const grupo = regla(css, '.rd-grupo')!;

    expect(nodo).toContain('background:#d97706');
    expect(grupo).not.toContain('#d97706');
    expect(grupo).toContain('border-radius:8px');
    expect(grupo).toContain('color-mix(in srgb, #1f2937 4%, transparent)');
    expect(regla(css, '.rd-colapsado')).toContain('dashed');
  });

  it('las Capas de group, sus parches por Tipo, por estado y el colapsado salen de su propia pila', async () => {
    const grupo = {
      capas: [capa('caja', 'rect', { radius: 20 }), capa('fondo', 'solid', { color: 'gray' }), capa('borde', 'border', { color: 'blue', width: 2 })],
      tipos: { capa: [op('fondo', { color: 'green' })] },
      estados: { hover: [op('borde', { color: 'red' })] },
      colapsado: { ops: [op('fondo', { color: 'purple' })] },
    };
    const { css } = await dibujar(tema({}, grupo), {}, { collapsed: ['h'] });

    // Con un Tipo con parches, la base se acota a "sin Tipo" y el Tipo trae su pila completa.
    expect(regla(css, '.rd-grupo:not([data-tipo])')).toContain('background:#6b7280');
    expect(regla(css, '.rd-grupo[data-tipo="capa"]')).toContain('background:#16a34a');
    expect(regla(css, '.rd-grupo[data-tipo="capa"]')).toContain('border-radius:20px');
    expect(regla(css, '.rd-grupo:not([data-tipo])[data-estados~="hover"]')).toBe('border:2px solid #dc2626');
    expect(regla(css, '.rd-colapsado:not([data-tipo])')).toContain('background:#7c3aed');
    expect(regla(css, '.rd-caja[data-elemento="grupo"]:not([data-tipo]) .rd-estado')).toBe('border-radius:20px');
  });
});

describe('Diagram: parches de Tipo y de estado pintados igual en Nodos y Grupos', () => {
  const halo = capa('halo', 'solid', { color: 'red', 'offset-x': 4, 'offset-y': 4, grow: 2 });

  it('un parche de Tipo del Nodo cambia su caja y su elemento propio; solo lo lleva el Nodo de ese Tipo', async () => {
    const t = tema({
      capas: [capa('forma', 'rect', { radius: 3 }), capa('relleno', 'solid', { color: 'amber' }), capa('borde', 'border', { color: 'gray', width: 1 })],
      tipos: { externo: [op('borde', { color: 'gray' }, 'dashed'), { ...op('halo', { color: 'red', 'offset-x': 4, 'offset-y': 4, grow: 2 }, 'solid'), antes: 'relleno' }, op('relleno', { color: 'blue' })] },
    });
    const { html, css } = await dibujar(t);

    expect(etiquetaCon(html, 'data-id="x"')).toContain('data-tipo="externo"');
    expect(etiquetaCon(html, 'data-id="g.a"')).not.toContain('data-tipo');
    expect(regla(css, '.rd-nodo:not([data-tipo])')).toContain('border:1px solid #6b7280');
    expect(regla(css, '.rd-nodo[data-tipo="externo"]')).toContain('border:1px dashed #6b7280');
    expect(regla(css, '.rd-nodo[data-tipo="externo"]')).toContain('background:#2563eb');
    // El halo desplazado del Tipo: un elemento propio bajo el Nodo de ese Tipo, no fusionado en la caja.
    expect(regla(css, '.rd-nodo[data-tipo="externo"] .rd-anim[data-anim="halo"]')).toContain('translate:4px 4px');
    expect(regla(css, '.rd-nodo[data-tipo="externo"]')).not.toContain('translate');
    expect(capaDe(html, 'nodos').match(/data-anim="halo"/g)).toHaveLength(2);
    expect(css).not.toMatch(/\.rd-nodo:not\(\[data-tipo\]\) \.rd-anim\[data-anim="halo"\]/);
  });

  it('el mismo parche en un Grupo se pinta por la misma ruta: Capa con elemento propio y estado', async () => {
    const t = tema({}, {
      capas: [capa('caja', 'rect', { radius: 10 }), capa('fondo', 'solid', { color: 'gray' })],
      tipos: { capa: [{ ...op('halo', halo.primitiva.props, 'solid'), antes: 'fondo' }] },
      estados: { hover: [op('fondo', { color: 'blue' })] },
    });
    const { html, css } = await dibujar(t, { estados: { g: ['hover'] } });

    expect(etiquetaCon(html, 'data-id="g"')).toContain('data-tipo="capa"');
    expect(capaDe(html, 'grupos')).toContain('data-anim="halo"');
    expect(regla(css, '.rd-grupo[data-tipo="capa"] .rd-anim[data-anim="halo"]')).toContain('translate:4px 4px');
    expect(regla(css, '.rd-grupo[data-tipo="capa"][data-estados~="hover"]')).toBe('background:#2563eb');
    // El halo no esta fusionado en la caja del Grupo de ese Tipo.
    expect(regla(css, '.rd-grupo[data-tipo="capa"]')).toBe('border-radius:10px;background:#6b7280');
  });

  it('un estado cambia solo lo que cambia y devuelve su valor inicial a lo que quita', async () => {
    const t = tema({
      capas: [capa('forma', 'rect', { radius: 3 }), capa('relleno', 'solid', { color: 'amber' }), capa('sombra', 'shadow', { x: 0, y: 2, blur: 4, spread: 0, inset: 0, color: 'gray' })],
      estados: { hover: [op('sombra', { y: 8 })], atenuado: [{ nombre: 'sombra', props: {}, quitar: true }] },
    });
    const { css } = await dibujar(t);

    expect(regla(css, '.rd-nodo[data-estados~="hover"]')).toBe('box-shadow:0px 8px 4px 0px #6b7280');
    expect(regla(css, '.rd-nodo[data-estados~="atenuado"]')).toBe('box-shadow:initial');
  });

  it('COLOR es la variable del color del Nodo, con y sin alfa, en una hoja que sirve a todos los colores', async () => {
    const t = tema({ capas: [capa('forma', 'rect', { radius: 3 }), capa('relleno', 'solid', { color: 'COLOR/0.25' }), capa('borde', 'border', { color: 'COLOR', width: 1 })] });
    const { css, html } = await dibujar(t);

    expect(regla(css, '.rd-nodo')).toContain('background:color-mix(in srgb, var(--trazo) 25%, transparent)');
    expect(regla(css, '.rd-nodo')).toContain('border:1px solid var(--trazo)');
    expect(etiquetaCon(html, 'aria-label="G.A')).toContain('--trazo:#2563eb');
  });

  it('mix con COLOR lo mezcla el navegador: color-mix de la variable del Nodo con el de Paleta', async () => {
    const t = tema({ capas: [capa('forma', 'rect', { radius: 3 }), capa('relleno', 'gradient', { from: 'mix(COLOR, gray, 0.3)', to: 'COLOR', angle: 180 })] });
    const { css } = await dibujar(t);

    expect(regla(css, '.rd-nodo')).toContain('linear-gradient(180deg,color-mix(in srgb, var(--trazo) 70%, #6b7280),var(--trazo))');
  });
});

describe('Diagram: cabecera del Grupo', () => {
  it('el estilo de texto del titulo (mayusculas, tracking, tamano, alfa, chip y punto) sale del Tema como CSS', async () => {
    const titulo = { tipo: 'text', props: { weight: 600, style: 'normal', transform: 'uppercase', size: 0.8, tracking: 0.1, alpha: 0.6, fill: 'COLOR/0.2', border: 'COLOR/0.5', radius: 50, pad: 8, dot: 'COLOR' } };
    const { css, html } = await dibujar(tema({}, { textos: { title: titulo } }));
    const reglaTitulo = regla(css, '.rd-grupo .rd-slot[data-slot="title"]')!;

    expect(capaDe(html, 'grupos')).toContain('font-size:11.2px'); // el tamano lo reserva y fija la colocacion
    expect(reglaTitulo).toContain('text-transform:uppercase');
    expect(reglaTitulo).toContain('letter-spacing:0.1em');
    expect(reglaTitulo).toContain('opacity:0.6');
    expect(reglaTitulo).toContain('background:color-mix(in srgb, var(--trazo) 20%, transparent)');
    expect(reglaTitulo).toContain('border:1px solid color-mix(in srgb, var(--trazo) 50%, transparent)');
    expect(reglaTitulo).toContain('border-radius:50px');
    expect(reglaTitulo).toContain('padding-left:8px');
    expect(regla(css, '.rd-grupo .rd-slot[data-slot="title"]::before')).toContain('background:var(--trazo)');
    // El estilo de un elemento no se filtra al otro.
    expect(regla(css, '.rd-nodo .rd-slot[data-slot="title"]')).toBeUndefined();
  });

  it('el icono de la cabecera usa el estilo de Slots del Grupo y deja sitio al control de colapso', async () => {
    const t = tema({}, { textos: { icon: { tipo: 'icon', props: { variant: 'dot', side: 10, radius: 6, fill: 'COLOR' } } } });
    const { html, css } = await dibujar(t, { onToggle: () => undefined, icons: { keys: () => ['box'], resolve: () => '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>' } });

    expect(regla(css, '.rd-grupo .rd-icono[data-variante="dot"]')).toContain('background:var(--trazo)');
    expect(html).toContain('data-toggle="g"');
  });
});
