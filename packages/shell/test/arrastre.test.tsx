import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema } from 'canonico';
import type { VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva, crearEnviadorDePin } from 'shell';
import type { AdaptadorDeLayout, Camara, VistaInteractivaProps } from 'shell';

afterEach(cleanup);

const nodo = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });
const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [nodo('a'), nodo('b')], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});
const enFila: AdaptadorDeLayout = async (vista: VistaResuelta) => {
  const nodes: Geometria['nodes'] = {};
  vista.nodes.forEach((n, i) => {
    nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
  });
  return { nodes, edges: {}, labels: {}, pinsSolapados: [], width: 300, height: 50 };
};
const camara: Camara = { x: 0, y: 0, width: 800, height: 600 };

function gesto(destino: Element | Window, tipo: string, clientX: number, clientY: number): void {
  const evento = new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: tipo === 'mouseup' ? 0 : 1 });
  Object.defineProperty(evento, 'view', { value: window });
  fireEvent(destino, evento);
}

async function montar(extra: Partial<VistaInteractivaProps> = {}) {
  const r = render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={enFila} width={800} height={600} camera={camara} {...extra} />);
  await waitFor(() => expect(r.container.querySelector('[data-id="a"]')).not.toBeNull());
  return r;
}
const nodoA = (c: HTMLElement) => c.querySelector('[data-id="a"] [data-part="nodo"]')!;
const posicionA = (c: HTMLElement) => c.querySelector('[data-id="a"]')!.getAttribute('transform');

describe('arrastre de Nodos (onMoveNode)', () => {
  it('soltar un Nodo avisa su posicion nueva y no mueve la camara', async () => {
    const onMoveNode = vi.fn();
    const onCameraChange = vi.fn();
    const { container } = await montar({ onMoveNode, onCameraChange });

    gesto(nodoA(container), 'mousedown', 10, 10);
    gesto(window, 'mousemove', 60, 30);
    gesto(window, 'mouseup', 60, 30);

    expect(onMoveNode).toHaveBeenCalledWith({ id: 'a', x: 50, y: 20 });
    expect(onCameraChange).not.toHaveBeenCalled();
  });

  it('muestra el Nodo en la posicion nueva mientras arrastra', async () => {
    const { container } = await montar({ onMoveNode: vi.fn() });
    gesto(nodoA(container), 'mousedown', 10, 10);
    gesto(window, 'mousemove', 60, 30);
    expect(posicionA(container)).toBe('translate(50 20)');
    gesto(window, 'mouseup', 60, 30);
  });

  it('el desplazamiento se mide en unidades de la geometria, no en px', async () => {
    const onMoveNode = vi.fn();
    const { container } = await montar({ onMoveNode, camera: { x: 0, y: 0, width: 400, height: 300 } });
    gesto(nodoA(container), 'mousedown', 10, 10);
    gesto(window, 'mousemove', 110, 10);
    gesto(window, 'mouseup', 110, 10);
    expect(onMoveNode).toHaveBeenCalledWith({ id: 'a', x: 50, y: 0 });
  });

  it('un clic sin movimiento sigue seleccionando y no avisa', async () => {
    const onMoveNode = vi.fn();
    const onSelect = vi.fn();
    const { container } = await montar({ onMoveNode, onSelect });
    gesto(nodoA(container), 'mousedown', 10, 10);
    gesto(window, 'mouseup', 10, 10);
    fireEvent.click(nodoA(container));
    expect(onMoveNode).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('arrastrar no selecciona', async () => {
    const onSelect = vi.fn();
    const { container } = await montar({ onMoveNode: vi.fn(), onSelect });
    gesto(nodoA(container), 'mousedown', 10, 10);
    gesto(window, 'mousemove', 60, 30);
    gesto(window, 'mouseup', 60, 30);
    fireEvent.click(nodoA(container));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('arrastrar el fondo sigue moviendo la camara', async () => {
    const onCameraChange = vi.fn();
    const onMoveNode = vi.fn();
    const { container } = await montar({ onMoveNode, onCameraChange });
    gesto(container.firstElementChild!, 'mousedown', 100, 100);
    gesto(window, 'mousemove', 60, 90);
    gesto(window, 'mouseup', 60, 90);
    expect(onMoveNode).not.toHaveBeenCalled();
    expect(onCameraChange.mock.calls.at(-1)![0]).toMatchObject({ x: 40, y: 10 });
  });

  it('sin onMoveNode (export estatico) arrastrar un Nodo mueve la camara', async () => {
    const onCameraChange = vi.fn();
    const { container } = await montar({ onCameraChange });
    gesto(nodoA(container), 'mousedown', 100, 100);
    gesto(window, 'mousemove', 60, 90);
    gesto(window, 'mouseup', 60, 90);
    expect(onCameraChange.mock.calls.at(-1)![0]).toMatchObject({ x: 40, y: 10 });
    expect(posicionA(container)).toBe('translate(0 0)');
  });

  it('si el aviso resuelve false el Nodo vuelve a su sitio', async () => {
    const { container } = await montar({ onMoveNode: () => Promise.resolve(false) });
    gesto(nodoA(container), 'mousedown', 10, 10);
    gesto(window, 'mousemove', 60, 30);
    await act(async () => gesto(window, 'mouseup', 60, 30));
    await waitFor(() => expect(posicionA(container)).toBe('translate(0 0)'));
  });

  it('si el aviso resuelve true el Nodo queda donde se solto', async () => {
    const { container } = await montar({ onMoveNode: () => Promise.resolve(true) });
    gesto(nodoA(container), 'mousedown', 10, 10);
    gesto(window, 'mousemove', 60, 30);
    await act(async () => gesto(window, 'mouseup', 60, 30));
    expect(posicionA(container)).toBe('translate(50 20)');
  });
});

describe('crearEnviadorDePin', () => {
  const intencion = { vista: 'v', nodo: 'a', x: 1, y: 2, hash: 'h' };
  const respuesta = (estado: number, cuerpo: unknown) => Promise.resolve(new Response(JSON.stringify(cuerpo), { status: estado }));

  it('envia la intencion por POST JSON a /api/pin', async () => {
    const f = vi.fn().mockReturnValue(respuesta(200, { ok: true, version: 3 }));
    const r = await crearEnviadorDePin(f)(intencion);
    expect(r).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/pin');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(intencion);
  });

  it('un 409 se informa como desactualizado', async () => {
    const f = vi.fn().mockReturnValue(respuesta(409, { ok: false, motivo: 'hash-desactualizado', mensaje: 'cambio' }));
    expect(await crearEnviadorDePin(f)(intencion)).toEqual({ ok: false, desactualizado: true, mensaje: 'cambio' });
  });

  it('otros rechazos llevan el mensaje', async () => {
    const f = vi.fn().mockReturnValue(respuesta(422, { ok: false, motivo: 'invalida', mensaje: 'no compila' }));
    expect(await crearEnviadorDePin(f)(intencion)).toEqual({ ok: false, desactualizado: false, mensaje: 'no compila' });
  });

  it('un fallo de red es un rechazo, no una excepcion', async () => {
    const f = vi.fn().mockRejectedValue(new Error('caido'));
    expect(await crearEnviadorDePin(f)(intencion)).toEqual({ ok: false, desactualizado: false, mensaje: 'caido' });
  });
});
