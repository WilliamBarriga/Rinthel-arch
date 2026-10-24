import { describe, expect, it } from 'vitest';

import type { Tema } from 'canonico';
import { TEMA_NEUTRO, cascada, colocarEnCaja, estiloResuelto, tablaDeMetricas, temaResueltoSchema, textosAMedir } from 'tema';
import type { OpDeCapa } from 'tema';

const capa = (nombre: string, tipo: string, props: Record<string, number | string>) => ({ nombre, primitiva: { tipo, props } });
const op = (nombre: string, props: Record<string, number | string>, primitiva?: string): OpDeCapa => ({ nombre, props, ...(primitiva !== undefined && { primitiva }) });

const conNodo = { ...TEMA_NEUTRO.nodo, capas: [capa('caja', 'rect', { radius: 3 }), capa('relleno', 'solid', { color: 'red' })] };
const tema = (grupo: Record<string, unknown> = {}): Tema => ({ ...TEMA_NEUTRO, nodo: conNodo, grupo: { ...TEMA_NEUTRO.grupo, ...grupo } }) as Tema;

describe('Grupo del Tema: pila propia', () => {
  it('un Tema sin group resuelve un Grupo sobrio de sus tokens, nunca las Capas del Nodo', () => {
    for (const sinGrupo of [tema(), TEMA_NEUTRO as Tema]) {
      const { abierto, colapsado } = estiloResuelto(sinGrupo).pintura.grupo;
      const nombresDelNodo = estiloResuelto(sinGrupo).pintura.nodo.capas.map((c) => c.nombre);

      expect(abierto.capas.map((c) => c.nombre)).toEqual(['caja', 'relleno', 'borde']);
      expect(abierto.capas.find((c) => c.nombre === 'relleno')?.props['color']).toContain((sinGrupo.tokens as Record<string, string>)['foreground']);
      expect(abierto.capas.find((c) => c.nombre === 'borde')?.tipo).toBe('border');
      expect(colapsado.capas.find((c) => c.nombre === 'borde')?.tipo).toBe('dashed');
      if (nombresDelNodo.length > 0) expect(abierto.capas).not.toEqual(estiloResuelto(sinGrupo).pintura.nodo.capas);
    }
    expect(estiloResuelto(tema()).pintura.grupo.abierto.capas.find((c) => c.nombre === 'relleno')?.props['color']).not.toBe('#dc2626');
  });

  it('con Capas propias, la cascada del Grupo es base, Tipo, colapsado y estado, sin tocar las del Nodo', () => {
    const t = tema({
      capas: [capa('caja', 'rect', { radius: 16 }), capa('borde', 'border', { color: 'gray', width: 1 })],
      tipos: { capa: [op('borde', { color: 'blue' })] },
      colapsado: { ops: [op('borde', { width: 3 })] },
      estados: { hover: [op('borde', { color: 'green' })] },
    });
    const grupo = (nivel: Parameters<typeof cascada>[1]) => cascada(temaResueltoSchema.parse(t), nivel, 'grupo').find((c) => c.nombre === 'borde')?.primitiva.props;

    expect(grupo({})).toMatchObject({ color: 'gray', width: 1 });
    expect(grupo({ tipo: 'capa' })).toMatchObject({ color: 'blue', width: 1 });
    expect(grupo({ tipo: 'capa', colapsado: true })).toMatchObject({ color: 'blue', width: 3 });
    expect(grupo({ colapsado: true, estado: 'hover' })).toMatchObject({ color: 'green', width: 3 });
    expect(cascada(temaResueltoSchema.parse(t)).map((c) => c.nombre)).toEqual(['caja', 'relleno']);
    const pintura = estiloResuelto(t).pintura;
    expect(pintura.grupo.abierto.tipos['capa']?.capas.find((c) => c.nombre === 'borde')?.props['color']).toBe('#2563eb');
    expect(pintura.grupo.colapsado.estados['hover']?.find((c) => c.nombre === 'borde')?.props['width']).toBe(3);
    expect(pintura.nodo.capas.map((c) => c.nombre)).toEqual(['caja', 'relleno']);
  });

  it('un parche de estado o de Tipo del Grupo no puede tocar las Metricas; el colapsado si', () => {
    const base = { capas: [capa('forma', 'rect', { radius: 4 })] };

    expect(temaResueltoSchema.safeParse(tema({ ...base, estados: { hover: [op('forma', {}, 'circle')] } })).success).toBe(false);
    expect(temaResueltoSchema.safeParse(tema({ ...base, tipos: { x: [op('forma', {}, 'circle')] } })).success).toBe(false);
    expect(temaResueltoSchema.safeParse(tema({ ...base, colapsado: { ops: [op('forma', {}, 'circle')] } })).success).toBe(true);
  });

  it('la cabecera no admite el Slot attrs y valida los parches contra la pila del Grupo', () => {
    const conAtributos = temaResueltoSchema.safeParse(tema({ slots: { direccion: 'row', gap: 0, pad: 0, hijos: [{ slot: 'attrs' }] } }));
    const sinCapa = temaResueltoSchema.safeParse(tema({ estados: { hover: [op('borde', { color: 'blue' })] } }));

    expect(conAtributos.error?.issues.map((i) => i.path.join('.'))).toEqual(['grupo.slots']);
    expect(sinCapa.error?.issues.map((i) => i.path.slice(0, 3).join('.'))).toEqual(['grupo.estados.hover']);
  });
});

describe('Grupo del Tema: Metricas', () => {
  it('el padding superior del Grupo abierto es el alto de la cabecera mas el de la zona de hijos', () => {
    const chico = tablaDeMetricas(tema({ padding: { top: 5, left: 7, bottom: 9, right: 11 } })).grupoAbierto;
    const grande = tablaDeMetricas(tema({ padding: { top: 25, left: 7, bottom: 9, right: 11 } })).grupoAbierto;
    const cabecera = colocarEnCaja(chico, { titulo: '', atributos: [], icono: true }, 200);

    expect(chico.paddingGrupo).toMatchObject({ left: 7, bottom: 9, right: 11 });
    expect(chico.paddingGrupo.top).toBe(cabecera.height + 5);
    expect(grande.paddingGrupo.top - chico.paddingGrupo.top).toBe(20);
  });

  it('una cabecera mas alta (icono en caja grande, texto mayor) empuja a los hijos y nunca los solapa', () => {
    const alta = tema({
      slots: { direccion: 'row', gap: 6, pad: 6, hijos: [{ slot: 'icon' }, { slot: 'title' }] },
      textos: { icon: { tipo: 'icon', props: { variant: 'box', side: 40, radius: 6 } }, title: { tipo: 'text', props: { size: 2 } } },
    });
    const normal = tablaDeMetricas(tema()).grupoAbierto;
    const metricas = tablaDeMetricas(alta).grupoAbierto;
    const { slots, height } = colocarEnCaja(metricas, { titulo: 'x', atributos: [], icono: true }, 300);

    expect(metricas.paddingGrupo.top).toBeGreaterThan(normal.paddingGrupo.top);
    expect(height).toBeLessThanOrEqual(metricas.paddingGrupo.top);
    for (const rect of Object.values(slots)) expect(rect.y + rect.height).toBeLessThanOrEqual(metricas.paddingGrupo.top);
  });

  it('el ancho minimo del Grupo abierto es el de su cabecera; un chip se mide a su ancho natural', () => {
    const chip = tema({ textos: { title: { tipo: 'text', props: { size: 1, fill: 'blue', pad: 10, dot: 'blue' } } } });
    const abierto = tablaDeMetricas(chip).grupoAbierto;
    const largo = colocarEnCaja(abierto, { titulo: 'plataforma', atributos: [], icono: false }, 400);
    const corto = colocarEnCaja(abierto, { titulo: 'x', atributos: [], icono: false }, 400);

    expect(abierto.anchoMinimo).toBe(0);
    expect(largo.slots.title!.width).toBeGreaterThan(corto.slots.title!.width);
    expect(largo.slots.title!.width).toBeLessThan(400 - 2 * 6);
    // El punto (un `size` en em) y el relleno (pad a cada lado) entran en el ancho del chip.
    expect(corto.slots.title!.width).toBeGreaterThanOrEqual(2 * 10 + abierto.fontSize);
  });

  it('el Grupo colapsado es una hoja con sus propios Slots, y textos de mayusculas y tracking ensanchan el titulo medido', () => {
    const t = tema({
      colapsado: { ops: [], slots: { direccion: 'column', gap: 0, pad: 0, hijos: [{ slot: 'title' }] } },
      textos: { title: { tipo: 'text', props: { transform: 'uppercase', tracking: 0.2, size: 0.8 } } },
    });
    const tabla = tablaDeMetricas(t);
    const medidos = textosAMedir({ nodes: [{ id: 'g', type: 'capa', children: [{ id: 'h', children: [] }], label: 'plataforma', attributes: [], source: [], description: '', collapsed: false, childCount: 1 }], edges: [] } as never, tabla).map((m) => m.texto);

    expect(tabla.grupoColapsado.disposicion.hijos).toEqual([{ slot: 'title' }]);
    // Sin parche de Slots, el Grupo cerrado usa los del Nodo (una hoja), no la cabecera.
    expect(tablaDeMetricas(tema()).grupoColapsado.disposicion).toEqual(TEMA_NEUTRO.nodo.slots);
    expect(tabla.grupoAbierto.disposicion.hijos.map((h) => ('slot' in h ? h.slot : '?'))).toEqual(['icon', 'title']);
    expect(medidos).toContain('PLATAFORMA');
    expect(tablaDeMetricas(tema()).grupoAbierto.titulo).toMatchObject({ tracking: 0, mayusculas: false });
  });
});
