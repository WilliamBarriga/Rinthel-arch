import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { idDeArista } from 'canonico';
import { layoutView } from 'layout';
import { abrirSesion, hashDeContenido } from 'sesion';
import { VistaInteractiva } from 'shell';
import { crearControlDeEdicion } from '../src/control-de-edicion';
import { TEMA_NEUTRO } from 'tema';
import { posicionDe, pulsarEn } from './ayudas';

afterEach(cleanup);

const ER = `specification { node tabla }
model {
  tabla clientes "Clientes" { id: uuid pk }
  tabla productos "Productos" { id: uuid pk }
  tabla ventas "Ventas" {
    tabla pedidos "Pedidos" {
      id: uuid pk
      cliente_id: uuid fk
      favorito: uuid fk
    }
    tabla lineas "Lineas" {
      pedido_id: uuid fk
      producto_id: uuid fk
    }
  }
  ventas.pedidos#cliente_id "1..*" -> "1" clientes#id identifying
  ventas.pedidos#favorito "0..*" -> "1" productos#id
  ventas.lineas#pedido_id "0..*" -> "1" ventas.pedidos#id
  ventas.lineas#producto_id "0..*" -> "1" productos#id
}
view solo_una { type er  include clientes, ventas  collapsed ventas }
view varias { type er  include clientes, productos, ventas  collapsed ventas }
view abierta { type er  include **  }
`;

const montar = async (vista: string) => {
  const fuente = abrirSesion({ 'main.dg': ER }).fuente!;
  const r = render(<VistaInteractiva source={fuente} view={vista} theme={TEMA_NEUTRO} layout={(v, t, m) => layoutView(v, t, { medidas: m })} width={900} height={600} morphMs={0} />);
  await waitFor(() => expect(r.container.querySelector('.rd-vista[data-layout="listo"] [data-id="clientes"]')).not.toBeNull(), { timeout: 8000 });
  return { ...r, fuente };
};

describe('ER: Grupo colapsado', () => {
  it('se ve como Nodo unico con contador, sin filas', async () => {
    const { container } = await montar('solo_una');
    const g = container.querySelector('[data-id="ventas"]')!;
    expect(g.querySelector('[data-attribute]')).toBeNull();
    expect(g.textContent).toContain('Ventas (2)');
    expect(container.querySelector('[data-id="ventas.pedidos"]')).toBeNull();
  });

  it('una sola FK elevada conserva sus marcadores y su linea identificante', async () => {
    const { container } = await montar('solo_una');
    const aristas = [...container.querySelectorAll('[data-edge]')];
    expect(aristas).toHaveLength(1);
    const formas = [...aristas[0]!.querySelectorAll('[data-marker]')].map((g) => g.getAttribute('data-shape'));
    expect(formas).toEqual(['many', 'one']);
    expect(aristas[0]!.querySelector('path[data-capa]')!.getAttribute('stroke-dasharray')).toBeNull();
  });

  it('varias FK agregadas van sin marcadores, con contador y no identificantes', async () => {
    const { container } = await montar('varias');
    const aristas = [...container.querySelectorAll('[data-edge]')];
    expect(aristas).toHaveLength(2);
    const aProductos = aristas.find((a) => a.getAttribute('data-edge')!.includes('productos'))!;
    expect(aProductos.querySelector('[data-marker]')).toBeNull();
    expect(aProductos.querySelector('path[data-capa]')!.getAttribute('stroke-dasharray')).not.toBeNull();
    const aClientes = aristas.find((a) => a !== aProductos)!;
    expect(aClientes.querySelectorAll('[data-marker]')).toHaveLength(2);
  });
});

const TABLAS = `specification { node tabla }
model {
  tabla a { id: uuid pk  nombre: text }
  tabla b { id: uuid pk  a_id: uuid fk }
  tabla c { b_id: uuid fk }
  b#a_id "0..*" -> "1" a#id
  c#b_id "0..*" -> "1" b#id
}
view v { type er  include ** }
view p { type er  include **  steps { step "Uno" { show a, b, edge b -> a }  step "Dos" { show c } } }
`;

const montarTablas = async (extra: Partial<Parameters<typeof VistaInteractiva>[0]> = {}) => {
  const fuente = abrirSesion({ 'main.dg': TABLAS }).fuente!;
  const r = render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={(v, t, m) => layoutView(v, t, { medidas: m })} width={900} height={600} morphMs={0} {...extra} />);
  await waitFor(() => expect(r.container.querySelector('.rd-vista[data-layout="listo"] [data-id="a"]')).not.toBeNull(), { timeout: 8000 });
  return r;
};

describe('ER: seleccion', () => {
  it('pulsar una fila selecciona el Atributo', async () => {
    const onSelect = vi.fn();
    const { container } = await montarTablas({ onSelect });
    const [x, y] = posicionDe(container, 'a')!;
    const alto = Number.parseFloat(container.querySelector<HTMLElement>('[data-id="a"]')!.style.height);
    const ancho = Number.parseFloat(container.querySelector<HTMLElement>('[data-id="a"]')!.style.width);
    for (let dy = 2; dy < alto; dy += 3) pulsarEn(container, x + ancho / 2, y + dy);
    const ids = onSelect.mock.calls.map((c) => c[0] as string);
    expect(ids).toContain('a#nombre');
    expect(ids).toContain('a#id');
  });

  it('dos tablas seleccionadas muestran la ruta mas corta sobre las FK', async () => {
    const { container } = await montarTablas({ selection: ['a', 'c'] });
    const enRuta = [...container.querySelectorAll('.rd-caja [data-state="en-ruta"]')].map((e) => e.closest('[data-id]')!.getAttribute('data-id')).sort();
    expect(enRuta).toEqual(['a', 'b', 'c']);
    expect(container.querySelectorAll('path[data-state="en-ruta"]').length).toBeGreaterThanOrEqual(2);
  });
});

describe('ER: arrastrar una tabla', () => {
  it('escribe un Pin con mover-pin y se deshace', async () => {
    const control = crearControlDeEdicion({ 'main.dg': TABLAS });
    const onMoveNode = vi.fn(({ id, x, y }: { id: string; x: number; y: number }) => control.aplicar({ tipo: 'mover-pin', vista: 'v', nodo: id, x, y, hash: hashDeContenido(control.archivos()['main.dg']!) }).ok);
    const { container } = await montarTablas({ onMoveNode, camera: { x: 0, y: 0, width: 900, height: 600 } });
    const cabecera = container.querySelector('[data-id="a"] [data-part="nodo"]')!;
    const gesto = (d: Element | Window, tipo: string, cx: number, cy: number) => {
      const e = new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, buttons: tipo === 'mouseup' ? 0 : 1 });
      Object.defineProperty(e, 'view', { value: window });
      fireEvent(d, e);
    };
    gesto(cabecera, 'mousedown', 10, 10);
    gesto(window, 'mousemove', 70, 40);
    gesto(window, 'mouseup', 70, 40);

    expect(onMoveNode).toHaveBeenCalledTimes(1);
    expect(control.archivos()['main.dg']).toMatch(/node a \{ pin /);
    expect(control.deshacer()).toBe(true);
    expect(control.archivos()['main.dg']).toBe(TABLAS);
  });

  it('arrastrar desde una fila mueve la tabla entera: la fila nunca es objeto del arrastre', async () => {
    const onMoveNode = vi.fn((_m: { id: string; x: number; y: number }) => {});
    const { container } = await montarTablas({ onMoveNode });
    const fila = container.querySelector('[data-attribute="a#nombre"]')!;
    const gesto = (d: Element | Window, tipo: string, cx: number, cy: number) => {
      const e = new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, buttons: tipo === 'mouseup' ? 0 : 1 });
      Object.defineProperty(e, 'view', { value: window });
      fireEvent(d, e);
    };
    gesto(fila, 'mousedown', 10, 10);
    gesto(window, 'mousemove', 70, 40);
    gesto(window, 'mouseup', 70, 40);
    expect(onMoveNode).toHaveBeenCalledTimes(1);
    expect(onMoveNode.mock.calls[0]![0]).toMatchObject({ id: 'a' });
  });
});

describe('ER: Pasos', () => {
  it('un Paso revela tablas y FK como en arquitectura', async () => {
    const fuente = abrirSesion({ 'main.dg': TABLAS }).fuente!;
    const { container } = render(<VistaInteractiva source={fuente} view="p" theme={TEMA_NEUTRO} layout={(v, t, m) => layoutView(v, t, { medidas: m })} width={900} height={600} morphMs={0} />);
    await waitFor(() => expect(container.querySelector('.rd-vista[data-layout="listo"] [data-id="a"]')).not.toBeNull(), { timeout: 8000 });
    const opacidad = (id: string) => {
      const el = container.querySelector(`[data-id="${id}"], [data-edge="${id}"]`);
      const parte = el?.querySelector<HTMLElement>('[data-part]');
      const v = parte != null ? parte.style.opacity : el?.getAttribute('opacity');
      return v === null || v === undefined || v === '' ? '1' : v;
    };
    const paso = () => fireEvent.click(screen.getByRole('button', { name: 'Paso siguiente' }));
    const idFk = idDeArista(fuente.model.edges[0]!);
    expect(opacidad('a')).toBe('0');
    paso();
    expect(opacidad('a')).toBe('1');
    expect(opacidad('b')).toBe('1');
    expect(opacidad(idFk)).toBe('1');
    expect(opacidad('c')).toBe('0');
    paso();
    expect(opacidad('c')).toBe('1');
  });
});
