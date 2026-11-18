import { describe, expect, it, vi } from 'vitest';

import { crearAlMover, crearAlOrdenar } from '../navegador/mover';
import type { ResultadoDeEnvio } from '../navegador/cliente';

const datos = { version: 7 };

function armar(respuesta: ResultadoDeEnvio, estadoVisto: typeof datos | null = datos) {
  const estado = estadoVisto ?? undefined;
  const enviar = vi.fn(() => Promise.resolve(respuesta));
  const avisar = vi.fn();
  const recargar = vi.fn(() => Promise.resolve());
  return { enviar, avisar, recargar, alMover: crearAlMover({ estado: () => estado, enviar, avisar, recargar }) };
}

describe('alMover de dev (navegador/mover)', () => {
  it('envia la intencion con la version del estado vista y resuelve true', async () => {
    const { alMover, enviar, avisar } = armar({ ok: true });

    expect(await alMover('general', { id: 'api', x: 1, y: 2 })).toBe(true);

    expect(enviar).toHaveBeenCalledWith({ tipo: 'mover-pin', vista: 'general', nodo: 'api', x: 1, y: 2 }, 7);
    expect(avisar).not.toHaveBeenCalled();
  });

  it('ante un 409 (hash desactualizado) avisa, recarga el estado y resuelve false', async () => {
    const { alMover, avisar, recargar } = armar({ ok: false, desactualizado: true, mensaje: 'cambio' });

    expect(await alMover('general', { id: 'api', x: 1, y: 2 })).toBe(false);

    expect(avisar).toHaveBeenCalledWith(expect.stringContaining('se recargo la Vista'));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('ante otro rechazo avisa sin recargar', async () => {
    const { alMover, avisar, recargar } = armar({ ok: false, desactualizado: false, mensaje: 'Nodo inexistente' });

    expect(await alMover('general', { id: 'api', x: 1, y: 2 })).toBe(false);

    expect(avisar).toHaveBeenCalledWith('No se pudo mover el Pin: Nodo inexistente');
    expect(recargar).not.toHaveBeenCalled();
  });

  it('sin estado todavia no envia nada', async () => {
    const { alMover, enviar, avisar } = armar({ ok: true }, null);

    expect(await alMover('general', { id: 'api', x: 1, y: 2 })).toBe(false);

    expect(enviar).not.toHaveBeenCalled();
    expect(avisar).toHaveBeenCalledTimes(1);
  });
});

describe('alOrdenar de dev (navegador/mover)', () => {
  const armarOrden = (respuesta: ResultadoDeEnvio) => {
    const enviar = vi.fn(() => Promise.resolve(respuesta));
    const avisar = vi.fn();
    const recargar = vi.fn(() => Promise.resolve());
    return { enviar, avisar, recargar, alOrdenar: crearAlOrdenar({ estado: () => datos, enviar, avisar, recargar }) };
  };

  it('envia la Intencion ordenar-lifelines con la version del estado vista', async () => {
    const { alOrdenar, enviar } = armarOrden({ ok: true });
    expect(await alOrdenar('general', { orden: ['b', 'a'] })).toBe(true);
    expect(enviar).toHaveBeenCalledWith({ tipo: 'ordenar-lifelines', vista: 'general', orden: ['b', 'a'] }, 7);
  });

  it('ante un 409 avisa, recarga y resuelve false', async () => {
    const { alOrdenar, avisar, recargar } = armarOrden({ ok: false, desactualizado: true, mensaje: 'cambio' });
    expect(await alOrdenar('general', { orden: ['a'] })).toBe(false);
    expect(avisar).toHaveBeenCalledWith(expect.stringContaining('se recargo la Vista'));
    expect(recargar).toHaveBeenCalledTimes(1);
  });
});
