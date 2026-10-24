import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const modelo = `specification { node servicio { color rojo }  node capa { color azul } }
model {
  capa plataforma "Plataforma" {
    servicio api
    servicio db
  }
  servicio externo
  plataforma.api -> plataforma.db
  externo -> plataforma.api
}
view v {
  type architecture
  include **
  theme t
}
`;
const paleta = `palette { rojo "#dc2626"  azul "#2563eb"  papel "#fefce8"  tinta "#1f2937" }`;
const NODO = `  node {
    layer forma rect { radius 3 }
    layer relleno solid { color papel }
    slots { title }
  }`;
const tema = (grupo: string, nodo = NODO) => `theme t {
  ${paleta}
${nodo}
${grupo}
}
`;
const abrir = (dsl: string, extra = '') => abrirSesion({ 'main.dg': dsl + modelo + extra });
const nombres = (capas: ReadonlyArray<{ nombre: string }>): string[] => capas.map((c) => c.nombre);

describe('seam sesion: bloque group del Tema', () => {
  it('un Tema sin group resuelve un Grupo sobrio de sus tokens y nunca las Capas del Nodo', async () => {
    const sesion = abrir(tema(''));
    const { nodo, grupo } = sesion.estilo('v')!.pintura;

    expect(await sesion.diagnosticar()).toEqual([]);
    expect(nombres(nodo.capas)).toEqual(['forma', 'relleno']);
    expect(nombres(grupo.abierto.capas)).toEqual(['caja', 'relleno', 'borde']);
    expect(JSON.stringify(grupo.abierto.capas)).not.toContain('#fefce8');
    expect(grupo.colapsado.capas.find((c) => c.nombre === 'borde')?.tipo).toBe('dashed');
  });

  it('declara Capas, parches por Tipo, por estado y el parche collapsed con la misma sintaxis que node', async () => {
    const sesion = abrir(
      tema(`  group {
    layer caja rect { radius 16 }
    layer fondo solid { color papel/0.5 }
    layer borde dashed { color tinta width 1 }
    type capa { layer fondo { color azul/0.2 } }
    state hover { layer borde { color azul } }
    state collapsed { layer fondo { color tinta }  layer borde border { color tinta width 2 } }
  }`),
    );
    const { grupo } = sesion.estilo('v')!.pintura;
    const de = (capas: ReadonlyArray<{ nombre: string; props: Record<string, unknown>; tipo: string }>, nombre: string) => capas.find((c) => c.nombre === nombre);

    expect(await sesion.diagnosticar()).toEqual([]);
    expect(nombres(grupo.abierto.capas)).toEqual(['caja', 'fondo', 'borde']);
    expect(de(grupo.abierto.capas, 'borde')).toMatchObject({ tipo: 'dashed', props: { color: '#1f2937', width: 1 } });
    expect(de(grupo.abierto.tipos['capa']!.capas, 'fondo')?.props['color']).toBe('rgba(37, 99, 235, 0.2)');
    expect(de(grupo.abierto.estados['hover']!, 'borde')?.props['color']).toBe('#2563eb');
    // Cerrado: otra pila (el parche collapsed), con su propio Tipo y sus estados encima.
    expect(de(grupo.colapsado.capas, 'fondo')?.props['color']).toBe('#1f2937');
    expect(de(grupo.colapsado.capas, 'borde')?.tipo).toBe('border');
    expect(de(grupo.colapsado.estados['hover']!, 'borde')?.props['color']).toBe('#2563eb');
  });

  it('un Tema extiende el group de su padre y lo parchea por nombre de Capa', async () => {
    const padre = `theme base {
  ${paleta}
  group {
    layer caja rect { radius 16 }
    layer borde border { color tinta width 1 }
  }
}
`;
    const hijo = `theme t extends base { group { layer borde { width 3 } } }\n`;
    const sesion = abrirSesion({ 'main.dg': padre + hijo + modelo });

    expect(await sesion.diagnosticar()).toEqual([]);
    expect(sesion.estilo('v')!.pintura.grupo.abierto.capas.find((c) => c.nombre === 'borde')?.props).toMatchObject({ width: 3, color: '#1f2937' });
    expect(nombres(sesion.estilo('v')!.pintura.grupo.abierto.capas)).toEqual(['caja', 'borde']);
  });

  it('padding y cabecera alimentan la tabla de Metricas del Grupo abierto', async () => {
    const poco = abrir(tema('  group { padding 4 }'));
    const mucho = abrir(tema('  group { padding 20 10 }'));
    const conCabecera = abrir(tema('  group { padding 4  slots row gap 4 pad 12 { icon { variant box side 40 }  title } }'));
    const abierto = (s: ReturnType<typeof abrirSesion>) => s.estilo('v')!.tabla.grupoAbierto.paddingGrupo;

    expect(abierto(poco)).toMatchObject({ left: 4, right: 4, bottom: 4 });
    expect(abierto(mucho)).toMatchObject({ left: 10, right: 10, bottom: 20 });
    expect(abierto(mucho).top - abierto(poco).top).toBe(16);
    expect(abierto(conCabecera).top).toBeGreaterThan(abierto(poco).top);
  });

  it('los hijos de un Grupo no se solapan con su cabecera, ni con una cabecera de chip alta', async () => {
    const dsl = tema(`  group {
    layer caja rect { radius 12 }
    slots row gap 8 pad 10 { icon { variant box side 36 }  title { size 1.4  fill azul  pad 8 } }
    padding 6
  }`);
    const sesion = abrir(dsl);
    const g = (await sesion.geometria('v'))!.geometry;
    const cabecera = sesion.estilo('v')!.tabla.grupoAbierto.paddingGrupo.top - 6;

    expect(await sesion.diagnosticar()).toEqual([]);
    // Coordenadas de los hijos relativas al Grupo: ninguno empieza antes de que acabe la cabecera.
    for (const id of ['plataforma.api', 'plataforma.db']) expect(g.nodes[id]!.y).toBeGreaterThanOrEqual(cabecera);
    expect(g.nodes['plataforma']!.width).toBeGreaterThanOrEqual(g.nodes['plataforma.api']!.width + 12);
  });

  it('el ancho de un Grupo abierto contiene su cabecera aunque los hijos sean angostos', async () => {
    const titulo = 'Plataforma de integracion con un titulo larguisimo';
    const conTitulo = (dsl: string) => dsl.replace('"Plataforma"', `"${titulo}"`);
    const sin = abrirSesion({ 'main.dg': conTitulo(tema('')) + modelo.replace('"Plataforma"', `"${titulo}"`) });
    const chip = abrirSesion({ 'main.dg': tema('  group { slots row gap 6 pad 6 { icon  title { fill azul  pad 10  dot azul  transform uppercase  tracking 0.2 } } }') + modelo.replace('"Plataforma"', `"${titulo}"`) });
    const ancho = async (s: ReturnType<typeof abrirSesion>) => (await s.geometria('v'))!.geometry.nodes['plataforma']!.width;
    const hijo = (await sin.geometria('v'))!.geometry.nodes['plataforma.api']!.width;

    expect(await ancho(sin)).toBeGreaterThan(hijo + 32);
    expect(await ancho(chip)).toBeGreaterThan(await ancho(sin));
    expect(await ancho(chip)).toBeGreaterThanOrEqual(chip.estilo('v')!.tabla.grupoAbierto.margenDeControl * 2 + titulo.length * 8);
  });

  it('errores a la vez, con codigo y "quisiste decir": Capa, estado, Slot attrs, padding y Metricas de un Tipo', async () => {
    const sesion = abrir(
      tema(`  group {
    layer caja rect { radius 16 }
    state hovr { layer caja { radius 4 } }
    state hover { layer caja { radiu 4 } }
    slots row { icon  attrs }
    padding 1 2 3
    type capa { layer caja circle }
  }`),
    );
    const issues = await sesion.diagnosticar();
    const codigos = issues.map((i) => i.code).sort();

    expect(codigos).toEqual(
      expect.arrayContaining(['E_THEME_UNKNOWN_STATE', 'E_THEME_UNKNOWN_PROPERTY', 'E_THEME_UNKNOWN_SLOT', 'E_THEME_INVALID_VALUE', 'E_THEME_STATE_TOUCHES_METRICS']),
    );
    expect(issues.find((i) => i.code === 'E_THEME_UNKNOWN_STATE')?.fix?.replacement).toBe('hover');
    expect(issues.find((i) => i.code === 'E_THEME_UNKNOWN_PROPERTY')?.fix?.replacement).toBe('radius');
    expect(issues.every((i) => i.line > 0)).toBe(true);
  });

  it('un state de Grupo no puede tocar los Slots; collapsed si, y cambia la caja del Grupo cerrado', async () => {
    const malo = abrir(tema('  group { layer caja rect  state hover { slots { title } } }'));
    const bueno = abrir(
      tema('  group { layer caja rect  state collapsed { layer caja circle  slots column pad 4 { title { transform uppercase } } } }'),
      '',
    );
    const m = bueno.estilo('v')!.tabla;

    expect((await malo.diagnosticar()).map((i) => i.code)).toEqual(['E_THEME_STATE_TOUCHES_METRICS']);
    expect(await bueno.diagnosticar()).toEqual([]);
    expect(m.grupoColapsado.cajaCuadrada).toBe(true);
    expect(m.grupoAbierto.cajaCuadrada).toBe(false);
    expect(m.grupoColapsado.disposicion.hijos).toEqual([{ slot: 'title' }]);
    expect(m.grupoColapsado.titulo.mayusculas).toBe(true);
  });
});
