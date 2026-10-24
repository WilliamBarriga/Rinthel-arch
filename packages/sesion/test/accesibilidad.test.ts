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

  it('si el Nodo muestra la insignia (badge), el nombre del Tipo los distingue: no hay solo-color', async () => {
    const conInsignia = tema('COLOR').replace('slots { title attrs }', 'slots { title badge attrs }');
    const issues = await abrirSesion({ 'main.dg': modelo + conInsignia + vista }).diagnosticar();

    expect(issues.filter((i) => i.code === 'W_THEME_COLOR_ONLY')).toEqual([]);
  });

  it('un Tema que no usa el color del Tipo ni tiene mal contraste no avisa', async () => {
    const issues = await abrirSesion({ 'main.dg': modelo + tema('rojo').replace('rojo "#f0f0f0"', 'rojo "#ffffff"') + vista }).diagnosticar();

    expect(issues).toEqual([]);
  });

  it.each(['', 'neutral', 'neutral-dark', 'alto-contraste'])('el Tema incorporado %j no da ningun warning, con Grupos abiertos y cerrados', async (nombre) => {
    // Un .dg minimo como lo empieza una persona: Tipos con color e icono, un Grupo abierto, uno cerrado y Aristas.
    const colores = `specification {
  node servicio { color blue  icon server }  node base { color green  icon database }
  node cola { color amber }  node otro { color purple }  node equipo { color gray }
}
model {
  equipo plataforma "Plataforma" { servicio a "API"  base b "Datos" }
  equipo bordes "Bordes" { cola c  otro d }
  plataforma.a -> plataforma.b "lee"
  plataforma.a -> bordes.c
}
view v { type architecture include **  collapsed bordes${nombre === '' ? '' : `  theme ${nombre}`} }
`;

    expect(await abrirSesion({ 'main.dg': colores }).diagnosticar()).toEqual([]);
  });
});
