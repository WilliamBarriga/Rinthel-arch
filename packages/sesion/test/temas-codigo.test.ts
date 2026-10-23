import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const modelo = `specification { node servicio { color rojo } }
model {
  servicio api { attrs { id: int } }
  servicio db
  api -> db
}
`;

const vista = `view v {
  type architecture
  include **
  theme t
}
`;

const CAPAS = `    layer forma rect { radius 8 }
    layer relleno solid { color papel }
    slots { title attrs }`;

const tema = (extra: string) => `theme t extends neutral {
  palette { rojo "#dc2626"  papel "#fefce8" }
  node {
${CAPAS}
${extra}
  }
}
`;

const CON_CODIGO = '    layer aura code over { component Aurora  hue 3 }';
const trabajo = (extra: string) => ({ 'main.dg': modelo + tema(extra) + vista });

describe('seam sesion: Capa code', () => {
  it('una Capa code compila y llega al Estilo resuelto con el componente y sus parametros', async () => {
    const sesion = abrirSesion(trabajo(CON_CODIGO));

    expect((await sesion.diagnosticar()).filter((x) => x.severity === 'error')).toEqual([]);
    const capa = sesion.estilo('v')!.pintura.nodo.capas.find((c) => c.nombre === 'aura');
    expect(capa).toEqual({ nombre: 'aura', tipo: 'code', props: { component: 'Aurora', hue: 3 }, encima: true });
  });

  it('una Capa code no cambia el tamano de la caja ni las Metricas', async () => {
    const sin = abrirSesion(trabajo(''));
    const con = abrirSesion(trabajo(CON_CODIGO));

    expect(con.estilo('v')!.metricas).toEqual(sin.estilo('v')!.metricas);
    const [a, b] = await Promise.all([sin.geometria('v'), con.geometria('v')]);
    expect(b!.geometry.nodes).toEqual(a!.geometry.nodes);
    expect(b!.layoutKey).toBe(a!.layoutKey);
  });

  it('un Tema con codigo emite un warning y uno sin codigo no', async () => {
    const con = await abrirSesion(trabajo(CON_CODIGO)).diagnosticar();
    const sin = await abrirSesion(trabajo('')).diagnosticar();

    expect(con.filter((i) => i.code === 'W_THEME_WITH_CODE')).toEqual([
      expect.objectContaining({ severity: 'warning', file: 'main.dg', message: expect.stringContaining('Aurora') }),
    ]);
    expect(sin.filter((i) => i.code === 'W_THEME_WITH_CODE')).toEqual([]);
  });

  it('con el registro de componentes, uno inexistente es un error', async () => {
    const sesion = abrirSesion(trabajo(CON_CODIGO), { componentes: {} });

    const issues = await sesion.diagnosticar();
    expect(issues.filter((i) => i.code === 'E_THEME_COMPONENT_MISSING')).toEqual([
      expect.objectContaining({ severity: 'error', message: expect.stringContaining('Aurora') }),
    ]);
  });

  it('con el registro, un parametro que el componente no declara o de otro tipo es un error', async () => {
    const desconocido = await abrirSesion(trabajo(CON_CODIGO), { componentes: { Aurora: { parametros: { brillo: 'numero' } } } }).diagnosticar();
    const tipo = await abrirSesion(trabajo(CON_CODIGO), { componentes: { Aurora: { parametros: { hue: 'texto' } } } }).diagnosticar();
    const bien = await abrirSesion(trabajo(CON_CODIGO), { componentes: { Aurora: { parametros: { hue: 'numero' } } } }).diagnosticar();

    expect(desconocido.filter((i) => i.code === 'E_THEME_COMPONENT_PARAMS')).toHaveLength(1);
    expect(tipo.filter((i) => i.code === 'E_THEME_COMPONENT_PARAMS')).toHaveLength(1);
    expect(bien.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('el registro sin parametros declarados acepta cualquier parametro', async () => {
    const issues = await abrirSesion(trabajo(CON_CODIGO), { componentes: { Aurora: {} } }).diagnosticar();
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('un parche de estado puede cambiar los parametros de la Capa code', async () => {
    const extra = `${CON_CODIGO}
    state hover { layer aura { hue 9 } }`;
    const sesion = abrirSesion(trabajo(extra));

    expect((await sesion.diagnosticar()).filter((i) => i.severity === 'error')).toEqual([]);
    const hover = sesion.estilo('v')!.pintura.nodo.estados.hover!.find((c) => c.nombre === 'aura');
    expect(hover!.props).toEqual({ component: 'Aurora', hue: 9 });
  });
});
