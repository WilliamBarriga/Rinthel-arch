import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { layoutView } from 'layout';
import { abrirSesion } from 'sesion';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout, VistaInteractivaProps } from 'shell';
import { TEMA_NEUTRO } from 'tema';

import { posicionDe } from './ayudas';

afterEach(cleanup);

const texto = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio sistema "Sistema" {
    servicio api "API"
    servicio db "DB"
  }
  servicio cola "Cola"
  interaction i {
    cliente -> sistema.api "pedir"
    sistema -> sistema "auditar"
    sistema.api -> sistema.db "consultar"
    sistema.db -> cola "evento"
  }
}
view abierta { type sequence
 interaction i }
view cerrada { type sequence
 interaction i
 depth 1 }
`;
const fuente = abrirSesion({ 'main.dg': texto }).fuente!;
const layout: AdaptadorDeLayout = (vista, tema, medidas) => layoutView(vista, tema, { ...(medidas !== undefined && { medidas }) });
const camara = { x: 0, y: 0, width: 1200, height: 800 };

async function montar(vista: string, extra: Partial<VistaInteractivaProps> = {}) {
  const r = render(<VistaInteractiva source={fuente} view={vista} theme={TEMA_NEUTRO} layout={layout} width={1200} height={800} camera={camara} {...extra} />);
  await waitFor(() => expect(r.container.querySelector('[data-lifeline="cola"]')).not.toBeNull(), { timeout: 8000 });
  return r;
}

function gesto(destino: Element | Window, tipo: string, clientX: number, clientY: number): void {
  const evento = new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: tipo === 'mouseup' ? 0 : 1 });
  Object.defineProperty(evento, 'view', { value: window });
  fireEvent(destino, evento);
}

/** Centro de la cabecera de una Lifeline en coordenadas del lienzo (camara 1:1). */
function centro(c: HTMLElement, id: string): [number, number] {
  const [x, y] = posicionDe(c, id)!;
  const caja = c.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
  return [x + Number.parseFloat(caja.style.width) / 2, y + Number.parseFloat(caja.style.height) / 2];
}

/** Arrastra la cabecera de `id` hasta `haciaX` (centro) y suelta. */
function arrastrarCabecera(c: HTMLElement, id: string, haciaX: number): void {
  const [x, y] = centro(c, id);
  gesto(c.querySelector(`[data-id="${id}"]`)!, 'mousedown', x, y);
  gesto(window, 'mousemove', (x + haciaX) / 2, y);
  gesto(window, 'mousemove', haciaX, y);
  gesto(window, 'mouseup', haciaX, y);
}

const T = { timeout: 15000 };

describe('VistaInteractiva: ordenar Lifelines por arrastre', () => {
  it('arrastrar una cabecera avisa el orden visible completo, sin mover la camara', T, async () => {
    const onReorderLifelines = vi.fn();
    const onCameraChange = vi.fn();
    const { container } = await montar('abierta', { onReorderLifelines, onCameraChange });
    arrastrarCabecera(container, 'cliente', centro(container, 'cola')[0] + 20);
    expect(onReorderLifelines).toHaveBeenCalledWith({ orden: ['sistema', 'sistema.api', 'sistema.db', 'cola', 'cliente'] });
    expect(onCameraChange).not.toHaveBeenCalled();
  });

  it('la cabecera arrastrada va en fantasma mientras dura el gesto', T, async () => {
    const { container } = await montar('abierta', { onReorderLifelines: vi.fn() });
    const [x, y] = centro(container, 'cliente');
    gesto(container.querySelector('[data-id="cliente"]')!, 'mousedown', x, y);
    gesto(window, 'mousemove', x + 60, y);
    expect(container.querySelector('[data-id="cliente"]')!.getAttribute('data-estados') ?? container.querySelector('[data-id="cliente"] [data-estados]')?.getAttribute('data-estados')).toContain('fantasma');
    gesto(window, 'mouseup', x + 60, y);
  });

  it('una hija solo se mueve dentro del box de su Grupo', T, async () => {
    const onReorderLifelines = vi.fn();
    const { container } = await montar('abierta', { onReorderLifelines });
    // Mucho mas a la derecha que la cola: dentro del box solo puede quedar la ultima.
    arrastrarCabecera(container, 'sistema.api', centro(container, 'cola')[0] + 300);
    expect(onReorderLifelines).toHaveBeenCalledWith({ orden: ['cliente', 'sistema', 'sistema.db', 'sistema.api', 'cola'] });
    onReorderLifelines.mockClear();
    // Mucho mas a la izquierda que el cliente: no pasa de la Lifeline propia del Grupo.
    arrastrarCabecera(container, 'sistema.db', centro(container, 'cliente')[0] - 300);
    expect(onReorderLifelines).toHaveBeenCalledWith({ orden: ['cliente', 'sistema', 'sistema.db', 'sistema.api', 'cola'] });
  });

  it('arrastrar la cabecera del box mueve el bloque como hijas consecutivas', T, async () => {
    const onReorderLifelines = vi.fn();
    const { container } = await montar('abierta', { onReorderLifelines });
    const titulo = container.querySelector<HTMLElement>('[data-group-box-title="sistema"]')!;
    const caja = container.querySelector<HTMLElement>('[data-group-box="sistema"]')!;
    const x = Number.parseFloat(caja.style.left) + Number.parseFloat(titulo.style.left) + 5;
    const y = Number.parseFloat(caja.style.top) + Number.parseFloat(titulo.style.top) + 5;
    gesto(titulo, 'mousedown', x, y);
    gesto(window, 'mousemove', x + 100, y);
    gesto(window, 'mousemove', centro(container, 'cola')[0] + 20, y);
    gesto(window, 'mouseup', centro(container, 'cola')[0] + 20, y);
    expect(onReorderLifelines).toHaveBeenCalledWith({ orden: ['cliente', 'cola', 'sistema', 'sistema.api', 'sistema.db'] });
  });

  it('un arrastre que no cambia el orden no avisa; un clic sigue seleccionando', T, async () => {
    const onReorderLifelines = vi.fn();
    const { container } = await montar('abierta', { onReorderLifelines });
    arrastrarCabecera(container, 'cola', centro(container, 'cola')[0] + 40);
    expect(onReorderLifelines).not.toHaveBeenCalled();
  });

  it('sin onReorderLifelines no hay arrastre', T, async () => {
    const { container } = await montar('abierta');
    arrastrarCabecera(container, 'cliente', 1100);
    expect(container.querySelector('[data-id="cliente"]')).not.toBeNull();
  });

  it('con el Grupo colapsado el orden visible lleva al Grupo como una Lifeline', T, async () => {
    const onReorderLifelines = vi.fn();
    const { container } = await montar('cerrada', { onReorderLifelines });
    arrastrarCabecera(container, 'sistema', centro(container, 'cola')[0] + 20);
    expect(onReorderLifelines).toHaveBeenCalledWith({ orden: ['cliente', 'cola', 'sistema'] });
  });
});
