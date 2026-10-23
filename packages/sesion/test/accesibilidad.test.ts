import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const modelo = `specification { node servicio { color rojo }  node base { color azul } }
model {
  servicio api
  base db
  api -> db
}
`;
const vista = `view v {
  type architecture
  include **
  theme t
}
`;
const tema = (relleno: string, extra = '') => `theme t {
  palette { rojo "#f0f0f0"  azul "#f0e0e0" }
  ${extra}
  node {
    layer forma rect { radius 4 }
    layer relleno solid { color ${relleno} }
    slots { title attrs }
  }
}
`;

describe('seam sesion: accesibilidad del Tema', () => {
  it('un contraste bajo es un warning con el Tipo y no bloquea construir', async () => {
    const sesion = abrirSesion({ 'main.dg': modelo + tema('COLOR', 'tokens { foreground "#ffffff" }') + vista });

    const issues = await sesion.diagnosticar();
    const contraste = issues.filter((i) => i.code === 'W_THEME_LOW_CONTRAST');

    expect(contraste.map((i) => i.severity)).toEqual(['warning', 'warning']);
    expect(contraste[0]!.message).toContain("'servicio'");
    expect(issues.some((i) => i.severity === 'error')).toBe(false);
    const construido = await sesion.construir();
    expect(Object.keys(construido.archivos)).toContain('geometria/v.json');
  });

  it('dos Tipos que solo difieren por color dan el warning solo-color en la Vista', async () => {
    const issues = await abrirSesion({ 'main.dg': modelo + tema('COLOR') + vista }).diagnosticar();
    const soloColor = issues.filter((i) => i.code === 'W_THEME_COLOR_ONLY');

    expect(soloColor).toHaveLength(1);
    expect(soloColor[0]).toMatchObject({ severity: 'warning', file: 'main.dg' });
    expect(soloColor[0]!.message).toContain("'servicio'");
    expect(soloColor[0]!.message).toContain("'base'");
  });

  it('un Tema que no usa el color del Tipo ni tiene mal contraste no avisa', async () => {
    const issues = await abrirSesion({ 'main.dg': modelo + tema('rojo').replace('rojo "#f0f0f0"', 'rojo "#ffffff"') + vista }).diagnosticar();

    expect(issues).toEqual([]);
  });

  it.each(['', 'neutral', 'neutral-dark', 'alto-contraste'])('el Tema incorporado %j no da warnings de contraste', async (nombre) => {
    const colores = `specification { node servicio { color blue }  node base { color green }  node cola { color amber }  node otro { color purple } }
model { servicio a  base b  cola c  otro d  a -> b }
view v { type architecture include **${nombre === '' ? '' : `  theme ${nombre}`} }
`;

    // `solo-color` depende de los Tipos del Modelo (con 4 Tipos de una misma forma avisa en cualquier Tema); aqui se mide el Tema.
    const issues = await abrirSesion({ 'main.dg': colores }).diagnosticar();
    expect(issues.filter((i) => i.code !== 'W_THEME_COLOR_ONLY')).toEqual([]);
  });
});
