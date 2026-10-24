import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const modelo = `specification { node servicio { color rojo } }
model {
  servicio api "Pasarela de pagos internacional"
  servicio db "DB"
  api -> db "lee"
}
view v {
  type architecture
  include **
  theme t
}
`;

const tema = (titulo: string, etiqueta = '') => `theme t {
  palette { rojo "#dc2626"  papel "#fefce8"  tinta "#111111" }
  node {
    layer tarjeta solid { color papel }
    slots { title { ${titulo} } }
  }
  edge {
    layer linea line { color tinta }
    label { fill papel ${etiqueta} }
  }
}
`;

const abrir = (dsl: string) => abrirSesion({ 'main.dg': dsl + modelo });

describe('seam sesion: estilo de texto de un Slot (prefijo y glow)', () => {
  it('`prefix` antepone un texto al del Slot: se mide, asi que la caja crece', async () => {
    const sin = abrir(tema('weight 700'));
    const con = abrir(tema('weight 700  prefix "> "'));

    expect(await con.diagnosticar()).toEqual([]);
    expect(con.estilo('v')!.pintura.nodo.textos['title']!.props['prefix']).toBe('> ');
    const ancho = async (s: typeof sin) => (await s.geometria('v'))!.geometry.nodes['api']!.width;
    expect(await ancho(con)).toBeGreaterThan(await ancho(sin));
  });

  it('un `prefix` demasiado largo es un error situado, no se recorta', async () => {
    const issues = await abrir(tema('prefix "-------------->"')).diagnosticar();

    expect(issues.map((i) => i.code)).toContain('E_THEME_INVALID_VALUE');
    expect(issues.find((i) => i.code === 'E_THEME_INVALID_VALUE')!.message).toMatch(/prefix/);
  });

  it('`glow` del texto es un color de Paleta y solo pinta: no cambia las Metricas', async () => {
    const sin = abrir(tema('weight 700'));
    const con = abrir(tema('weight 700  glow rojo/0.8'));

    expect(await con.diagnosticar()).toEqual([]);
    expect(con.estilo('v')!.pintura.nodo.textos['title']!.props['glow']).toBe('rgba(220, 38, 38, 0.8)');
    expect((await con.geometria('v'))!.geometry.nodes).toEqual((await sin.geometria('v'))!.geometry.nodes);
  });

  it('la etiqueta de Arista acepta `style italic`', async () => {
    const sesion = abrir(tema('weight 700', 'style italic'));

    expect(await sesion.diagnosticar()).toEqual([]);
    expect(sesion.estilo('v')!.pintura.arista.etiqueta.props['style']).toBe('italic');
  });
});
