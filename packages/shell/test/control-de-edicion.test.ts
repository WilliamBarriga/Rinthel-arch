// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { hashDeContenido } from 'sesion';

import { crearControlDeEdicion } from '../src/control-de-edicion';

const base = (extra: string) => `specification { node servicio }
model { servicio a  servicio b }
view v {
  type architecture
  include **
${extra}}
`;

describe('crearControlDeEdicion', () => {
  it('aplica una Intencion, deshace y rehaceres; expone si se puede', () => {
    const texto = base('');
    const control = crearControlDeEdicion({ 'main.dg': texto });
    expect(control.puedeDeshacer()).toBe(false);

    const r = control.aplicar({ tipo: 'mover-pin', vista: 'v', nodo: 'a', x: 2, y: 3, hash: hashDeContenido(texto) });
    expect(r.ok).toBe(true);
    expect(control.archivos()['main.dg']).toBe(base('  node a { pin 2,3 }\n'));
    expect(control.puedeDeshacer()).toBe(true);

    expect(control.deshacer()).toBe(true);
    expect(control.archivos()['main.dg']).toBe(texto);
    expect(control.puedeRehacer()).toBe(true);

    expect(control.rehacer()).toBe(true);
    expect(control.archivos()['main.dg']).toBe(base('  node a { pin 2,3 }\n'));
    expect(control.rehacer()).toBe(false);
  });

  it('un rechazo no cambia el estado', () => {
    const texto = base('');
    const control = crearControlDeEdicion({ 'main.dg': texto });
    const r = control.aplicar({ tipo: 'mover-pin', vista: 'v', nodo: 'a', x: 2, y: 3, hash: 'viejo' });
    expect(r).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
    expect(control.archivos()['main.dg']).toBe(texto);
    expect(control.deshacer()).toBe(false);
  });
});
