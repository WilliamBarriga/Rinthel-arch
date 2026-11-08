import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonico';
import { abrirSesion } from 'sesion';

const modelo = `specification { node servicio }
model {
  servicio cliente
  servicio api
  servicio db
  interaction checkout "Compra" {
    pedido: cliente -> api "POST"
    api -> db "consulta"
    reply db -> api "filas"
    final: reply api -> cliente "201"
  }
}
`;
const vista = (cuerpo: string, extra = '') => `${modelo}view v { type sequence\n interaction checkout\n${extra}\n${cuerpo}\n}\n`;
const codigos = async (texto: string) => (await abrirSesion({ 'main.dg': texto }).diagnosticar()).map((i) => i.code);

describe('seam sesion: Pasos de secuencia', () => {
  it('upto bien escrito y creciente compila sin issues', async () => {
    const texto = vista('steps { step "a" { upto pedido }\n step "b" { upto final } }');
    expect(await codigos(texto)).toEqual([]);
  });

  it('E_UNKNOWN_STEP con fix por typo en upto', async () => {
    const res = await abrirSesion({ 'main.dg': vista('steps { step "a" { upto pedidoo } }') }).diagnosticar();
    expect(res.map((i) => i.code)).toEqual(['E_UNKNOWN_STEP']);
    expect(res[0]!.fix?.replacement).toBe('pedido');
  });

  it('E_STEP_NOT_PROJECTED con hint si un exclude quita el Mensaje', async () => {
    const res = await abrirSesion({ 'main.dg': vista('steps { step "a" { upto pedido } }', ' exclude cliente') }).diagnosticar();
    expect(res.map((i) => i.code)).toEqual(['E_STEP_NOT_PROJECTED']);
    expect(res[0]!.hint).toBeTruthy();
  });

  it('E_STEP_NOT_ADVANCING con related al Paso anterior', async () => {
    const res = await abrirSesion({ 'main.dg': vista('steps { step "a" { upto final }\n step "b" { upto pedido } }') }).diagnosticar();
    expect(res.map((i) => i.code)).toEqual(['E_STEP_NOT_ADVANCING']);
    expect(res[0]!.related).toHaveLength(1);
    expect(res[0]!.related![0]!.line).toBeLessThan(res[0]!.line);
  });

  it('E_STEP_NOT_ADVANCING si repite el mismo Mensaje', async () => {
    expect(await codigos(vista('steps { step "a" { upto pedido }\n step "b" { upto pedido } }'))).toEqual(['E_STEP_NOT_ADVANCING']);
  });

  it('E_STEPS_EACH_WITH_STEP', async () => {
    expect(await codigos(vista('steps each\n steps { step "a" { upto pedido } }'))).toEqual(['E_STEPS_EACH_WITH_STEP']);
  });

  it('steps each solo compila sin issues', async () => {
    expect(await codigos(vista('steps each'))).toEqual([]);
  });

  it('show y hide en secuencia: E_VIEW_PROPERTY_FOR_TYPE con hint a step { upto }', async () => {
    const res = await abrirSesion({ 'main.dg': vista('steps { step "a" { show cliente\n hide api } }') }).diagnosticar();
    expect(res.map((i) => i.code)).toEqual(['E_VIEW_PROPERTY_FOR_TYPE', 'E_VIEW_PROPERTY_FOR_TYPE']);
    expect(res[0]!.hint).toContain('upto');
  });

  it('upto y steps each fuera de secuencia: E_VIEW_PROPERTY_FOR_TYPE', async () => {
    const arq = `specification { node servicio }\nmodel { servicio a }\n`;
    expect(await codigos(`${arq}view v { type architecture\n include **\n steps { step "a" { upto x } } }\n`)).toEqual(['E_VIEW_PROPERTY_FOR_TYPE']);
    expect(await codigos(`${arq}view v { type architecture\n include **\n steps each }\n`)).toEqual(['E_VIEW_PROPERTY_FOR_TYPE']);
  });

  it('steps each con exclude da un Paso por Mensaje proyectado, titulado con la etiqueta o from -> to', async () => {
    const texto = `${modelo.replace('    api -> db "consulta"', '    api -> db')}view v { type sequence\n interaction checkout\n exclude cliente\n steps each\n}\n`;
    const sesion = abrirSesion({ 'main.dg': texto });
    expect(await sesion.diagnosticar()).toEqual([]);
    const resuelta = resolveView(sesion.fuente!, 'v')!;
    expect(resuelta.steps.map((p) => p.title)).toEqual(['api -> db', 'filas']);
    expect(resuelta.steps.map((p) => p.corte)).toEqual(resuelta.interaction!.messages.map((m) => m.ruta));
  });
});
