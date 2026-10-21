import { describe, expect, it, vi } from 'vitest';

import { crearAlMover } from '../navegador/mover';
import type { ResultadoDeEnvioDePin } from 'shell';

const datos = { archivosDeVista: { general: 'main.dg' }, hashes: { 'main.dg': 'h1' } };

function armar(respuesta: ResultadoDeEnvioDePin, estado: typeof datos | undefined = datos) {
  const enviar = vi.fn(() => Promise.resolve(respuesta));
  const avisar = vi.fn();
  const recargar = vi.fn(() => Promise.resolve());
  return { enviar, avisar, recargar, alMover: crearAlMover({ estado: () => estado, enviar, avisar, recargar }) };
}

describe('alMover de dev (navegador/mover)', () => {
  it('envia la intencion con el hash del archivo de la Vista y resuelve true', async () => {
    const { alMover, enviar, avisar } = armar({ ok: true });

    expect(await alMover('general', { id: 'api', x: 1, y: 2 })).toBe(true);

    expect(enviar).toHaveBeenCalledWith({ vista: 'general', nodo: 'api', x: 1, y: 2, hash: 'h1' });
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

  it('sin archivo conocido para la Vista no envia nada', async () => {
    const { alMover, enviar, avisar } = armar({ ok: true });

    expect(await alMover('otra', { id: 'api', x: 1, y: 2 })).toBe(false);

    expect(enviar).not.toHaveBeenCalled();
    expect(avisar).toHaveBeenCalledTimes(1);
  });
});
