import { describe, expect, it, vi } from 'vitest';

import { accionDeAtajo, crearAlAtajo } from '../navegador/historial';

const tecla = (o: Partial<Parameters<typeof accionDeAtajo>[0]>) => ({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, enCampoDeTexto: false, repeat: false, ...o });

describe('accionDeAtajo', () => {
  it.each([
    [{ key: 'z', ctrlKey: true }, 'deshacer'],
    [{ key: 'Z', metaKey: true, ctrlKey: false }, 'deshacer'],
    [{ key: 'Z', ctrlKey: true, shiftKey: true }, 'rehacer'],
    [{ key: 'z', metaKey: true, ctrlKey: false, shiftKey: true }, 'rehacer'],
    [{ key: 'y', ctrlKey: true }, 'rehacer'],
  ] as const)('%j -> %s', (o, esperado) => {
    expect(accionDeAtajo(tecla(o))).toBe(esperado);
  });

  it('ignora teclas sin modificador, con alt, otras letras y campos de texto', () => {
    expect(accionDeAtajo(tecla({ ctrlKey: false }))).toBeUndefined();
    expect(accionDeAtajo(tecla({ altKey: true }))).toBeUndefined();
    expect(accionDeAtajo(tecla({ key: 'a' }))).toBeUndefined();
    expect(accionDeAtajo(tecla({ enCampoDeTexto: true }))).toBeUndefined();
    expect(accionDeAtajo(tecla({ repeat: true }))).toBeUndefined();
  });
});

describe('crearAlAtajo', () => {
  it('envia la accion; si se rechaza avisa con el mensaje y recarga solo ante un 409', async () => {
    const enviar = vi.fn(() => Promise.resolve({ ok: false as const, desactualizado: true, mensaje: 'cambio' }));
    const avisar = vi.fn();
    const recargar = vi.fn(() => Promise.resolve());
    await crearAlAtajo({ enviar, avisar, recargar })('deshacer');
    expect(enviar).toHaveBeenCalledWith('deshacer');
    expect(avisar).toHaveBeenCalledWith(expect.stringContaining('cambio'));
    expect(recargar).toHaveBeenCalled();
  });

  it('un rechazo sin desactualizacion avisa sin recargar y el exito no avisa', async () => {
    const avisar = vi.fn();
    const recargar = vi.fn(() => Promise.resolve());
    await crearAlAtajo({ enviar: () => Promise.resolve({ ok: false, desactualizado: false, mensaje: 'Nada que deshacer' }), avisar, recargar })('deshacer');
    expect(avisar).toHaveBeenCalledWith(expect.stringContaining('Nada que deshacer'));
    expect(recargar).not.toHaveBeenCalled();

    const avisar2 = vi.fn();
    await crearAlAtajo({ enviar: () => Promise.resolve({ ok: true }), avisar: avisar2, recargar })('rehacer');
    expect(avisar2).not.toHaveBeenCalled();
  });
});
