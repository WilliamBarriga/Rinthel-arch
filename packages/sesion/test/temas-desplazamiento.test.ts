import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const modelo = `specification { node servicio { color rojo } }
model {
  servicio api
  servicio db
  api -> db
}
view v {
  type architecture
  include **
  theme t
}
`;

const tema = (sombra: string, estado = '') => `theme t {
  palette { rojo "#dc2626"  papel "#fefce8"  tinta "#111111" }
  node {
    layer sombra solid { color tinta ${sombra} }
    layer tarjeta solid { color papel }
    slots { title }
    ${estado}
  }
}
`;

const abrir = (dsl: string) => abrirSesion({ 'main.dg': dsl + modelo });

describe('seam sesion: offset y grow de una Capa', () => {
  it('`offset x y` (admite negativos) y `grow` llegan a la pintura de la Capa', async () => {
    const sesion = abrir(tema('offset 4 -3  grow 2'));

    expect(await sesion.diagnosticar()).toEqual([]);
    expect(sesion.estilo('v')!.pintura.nodo.capas[0]).toEqual({
      nombre: 'sombra',
      tipo: 'solid',
      props: { color: '#111111', 'offset-x': 4, 'offset-y': -3, grow: 2 },
    });
  });

  it('un parche de estado puede mover la Capa (hover que levanta) sin tocar las Metricas', async () => {
    const sesion = abrir(tema('offset 4 4', 'state hover { layer sombra { offset 7 7 } }'));

    expect(await sesion.diagnosticar()).toEqual([]);
    expect(sesion.estilo('v')!.pintura.nodo.estados['hover']![0]!.props).toMatchObject({ 'offset-x': 7, 'offset-y': 7 });
  });

  it('no alteran la clave de layout ni las cajas', async () => {
    const sin = abrir(tema(''));
    const con = abrir(tema('offset 12 -12  grow 8'));
    const a = (await sin.geometria('v'))!;
    const b = (await con.geometria('v'))!;

    expect(b.layoutKey).toBe(a.layoutKey);
    expect(b.geometry.nodes).toEqual(a.geometry.nodes);
    expect(con.estilo('v')!.metricas).toEqual(sin.estilo('v')!.metricas);
  });

  it('un valor fuera de rango es un error con posicion, nunca se recorta', async () => {
    const issues = await abrir(tema('offset 999 0  grow -999')).diagnosticar();

    expect(issues.map((i) => i.code)).toEqual(['E_THEME_INVALID_VALUE', 'E_THEME_INVALID_VALUE']);
    expect(issues[0]!.message).toContain("'offset-x'");
    expect(issues[0]!.line).toBeGreaterThan(0);
  });
});
