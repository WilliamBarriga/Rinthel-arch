import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema } from 'canonico';
import type { IssueDeDev, VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout, Camara, VistaInteractivaProps } from 'shell';
import { TEMA_NEUTRO } from 'tema';

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

async function montar(extra: Partial<VistaInteractivaProps> = {}) {
  const r = render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={enFila} width={800} height={600} camera={camara} {...extra} />);
  await waitFor(() => expect(r.container.querySelector('[data-id="a"]')).not.toBeNull());
  return r;
}
const sobre = (c: HTMLElement, x: number, y: number) => fireEvent.mouseMove(c.querySelector('[data-diagram]')!, { clientX: x, clientY: y });
const conEstado = (c: HTMLElement, estado: string) => [...c.querySelectorAll(`[data-state="${estado}"]`)];

function gesto(destino: Element | Window, tipo: string, clientX: number, clientY: number): void {
  const evento = new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: tipo === 'mouseup' ? 0 : 1 });
  Object.defineProperty(evento, 'view', { value: window });
  fireEvent(destino, evento);
}

describe('hover', () => {
  it('pasar el raton por un Nodo lo dibuja en hover y al salir se quita', async () => {
    const { container } = await montar();
    expect(conEstado(container, 'hover')).toHaveLength(0);
    sobre(container, 50, 25);
    expect(conEstado(container, 'hover')).toHaveLength(1);
    expect(container.querySelector('[data-id="a"] [data-state="hover"]')).not.toBeNull();
    sobre(container, 500, 400);
    expect(conEstado(container, 'hover')).toHaveLength(0);
  });

  it('el hover convive con la seleccion del mismo Nodo', async () => {
    const { container } = await montar({ selected: 'a' });
    sobre(container, 50, 25);
    expect(conEstado(container, 'seleccionado')).toHaveLength(1);
    expect(conEstado(container, 'hover')).toHaveLength(1);
  });
});

describe('fantasma de arrastre', () => {
  it('el Nodo arrastrado se dibuja en fantasma hasta soltarlo', async () => {
    const { container } = await montar({ onMoveNode: () => true });
    expect(conEstado(container, 'fantasma')).toHaveLength(0);
    gesto(container.querySelector('[data-id="a"] [data-part="nodo"]')!, 'mousedown', 10, 10);
    gesto(window, 'mousemove', 60, 30);
    expect(container.querySelector('[data-id="a"] [data-state="fantasma"]')).not.toBeNull();
    gesto(window, 'mouseup', 60, 30);
    await waitFor(() => expect(conEstado(container, 'fantasma')).toHaveLength(0));
  });
});

describe('chrome de issues y toasts', () => {
  const issues: IssueDeDev[] = [{ severity: 'error', code: 'E1', message: 'roto', file: 'a.dg', line: 3, column: 1, href: 'vscode://a.dg:3' }] as IssueDeDev[];

  const aviso = { severity: 'warning', code: 'W1', message: 'dudoso', file: 'b.dg', line: 7, column: 2, href: 'vscode://b.dg:7' } as IssueDeDev;
  const desplegar = (c: HTMLElement) => fireEvent.click(c.querySelector('[data-panel="issues"] button')!);

  it('arranca plegado con el conteo de errores y warnings, sin lista', async () => {
    const { container } = await montar({ issues: [...issues, aviso] });
    const panel = container.querySelector('[data-panel="issues"]')!;
    expect(panel.textContent).toContain('1 error');
    expect(panel.textContent).toContain('1 warning');
    expect(panel.querySelector('li')).toBeNull();
    expect(panel.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('desplegado dibuja todos los issues como enlaces con clases y sin estilos en linea; se vuelve a plegar', async () => {
    const { container } = await montar({ issues: [...issues, aviso] });
    desplegar(container);
    const panel = container.querySelector('[data-panel="issues"]')!;
    expect(panel.getAttribute('style')).toBeNull();
    expect(panel.className).toContain('rd-');
    expect(panel.querySelectorAll('li')).toHaveLength(2);
    const enlace = panel.querySelector('a')!;
    expect(enlace.textContent).toBe('a.dg:3');
    expect(enlace.getAttribute('href')).toBe('vscode://a.dg:3');
    expect(panel.textContent).toContain('E1 roto');
    expect(panel.textContent).toContain('W1 dudoso');
    desplegar(container);
    expect(panel.querySelector('li')).toBeNull();
  });

  it('sin issues no hay panel', async () => {
    const { container } = await montar();
    expect(container.querySelector('[data-panel="issues"]')).toBeNull();
  });

  it('dibuja los toasts como alertas con clases', async () => {
    const { container } = await montar({ toasts: ['Pin rechazado'] });
    const toast = container.querySelector('[role="alert"]')!;
    expect(toast.textContent).toBe('Pin rechazado');
    expect(toast.getAttribute('style')).toBeNull();
    expect(toast.className).toContain('rd-');
  });
});
