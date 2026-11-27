import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { edgeId } from 'canonical';
import { layoutView } from 'layout';
import { openSession, createUndoHistory, undo, editInHistory } from 'session';
import type { UndoHistory, Intent } from 'session';
import { InteractiveView } from 'shell';
import { NEUTRAL_THEME } from 'theme';
import { positionOf, pressAt } from './helpers';

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

const mount = async (view: string) => {
  const source = openSession({ 'main.dg': ER }).source!;
  const r = render(<InteractiveView source={source} view={view} theme={NEUTRAL_THEME} layout={(v, t, m) => layoutView(v, t, { measures: m })} width={900} height={600} morphMs={0} />);
  await waitFor(() => expect(r.container.querySelector('.rd-vista[data-layout="listo"] [data-id="clientes"]')).not.toBeNull(), { timeout: 8000 });
  return { ...r, source };
};

describe('ER: Grupo colapsado', () => {
  it('looks like a single Node with a counter, without rows', async () => {
    const { container } = await mount('solo_una');
    const g = container.querySelector('[data-id="ventas"]')!;
    expect(g.querySelector('[data-attribute]')).toBeNull();
    expect(g.textContent).toContain('Ventas (2)');
    expect(container.querySelector('[data-id="ventas.pedidos"]')).toBeNull();
  });

  it('a single lifted FK keeps its markers and its identifying line', async () => {
    const { container } = await mount('solo_una');
    const edges = [...container.querySelectorAll('[data-edge]')];
    expect(edges).toHaveLength(1);
    const shapes = [...edges[0]!.querySelectorAll('[data-marker]')].map((g) => g.getAttribute('data-shape'));
    expect(shapes).toEqual(['many', 'one']);
    expect(edges[0]!.querySelector('path[data-capa]')!.getAttribute('stroke-dasharray')).toBeNull();
  });

  it('several aggregated FKs go without markers, with a counter and non-identifying', async () => {
    const { container } = await mount('varias');
    const edges = [...container.querySelectorAll('[data-edge]')];
    expect(edges).toHaveLength(2);
    const toProducts = edges.find((a) => a.getAttribute('data-edge')!.includes('productos'))!;
    expect(toProducts.querySelector('[data-marker]')).toBeNull();
    expect(toProducts.querySelector('path[data-capa]')!.getAttribute('stroke-dasharray')).not.toBeNull();
    const toCustomers = edges.find((a) => a !== toProducts)!;
    expect(toCustomers.querySelectorAll('[data-marker]')).toHaveLength(2);
  });
});

const TABLES = `specification { node tabla }
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

const mountTables = async (extra: Partial<Parameters<typeof InteractiveView>[0]> = {}) => {
  const source = openSession({ 'main.dg': TABLES }).source!;
  const r = render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={(v, t, m) => layoutView(v, t, { measures: m })} width={900} height={600} morphMs={0} {...extra} />);
  await waitFor(() => expect(r.container.querySelector('.rd-vista[data-layout="listo"] [data-id="a"]')).not.toBeNull(), { timeout: 8000 });
  return r;
};

describe('ER: selection', () => {
  it('pressing a row selects the Attribute', async () => {
    const onSelect = vi.fn();
    const { container } = await mountTables({ onSelect });
    const [x, y] = positionOf(container, 'a')!;
    const height = Number.parseFloat(container.querySelector<HTMLElement>('[data-id="a"]')!.style.height);
    const width = Number.parseFloat(container.querySelector<HTMLElement>('[data-id="a"]')!.style.width);
    for (let dy = 2; dy < height; dy += 3) pressAt(container, x + width / 2, y + dy);
    const ids = onSelect.mock.calls.map((c) => c[0] as string);
    expect(ids).toContain('a#nombre');
    expect(ids).toContain('a#id');
  });

  it('two selected tables show the shortest path over the FKs', async () => {
    const { container } = await mountTables({ selection: ['a', 'c'] });
    const onPath = [...container.querySelectorAll('.rd-caja [data-state="on-path"]')].map((e) => e.closest('[data-id]')!.getAttribute('data-id')).sort();
    expect(onPath).toEqual(['a', 'b', 'c']);
    expect(container.querySelectorAll('path[data-state="on-path"]').length).toBeGreaterThanOrEqual(2);
  });
});

describe('ER: dragging a table', () => {
  it('writes a Pin with move-pin and is undone', async () => {
    let undoHistory: UndoHistory = createUndoHistory({ 'main.dg': TABLES });
    const control = {
      files: () => undoHistory.files,
      apply(i: Intent) {
        const r = editInHistory(undoHistory, i);
        if (r.ok) undoHistory = r.history;
        return r;
      },
      undo() {
        const h = undo(undoHistory);
        if (h !== undefined) undoHistory = h;
        return h !== undefined;
      },
    };
    const onMoveNode = vi.fn(({ id, x, y }: { id: string; x: number; y: number }) => control.apply({ type: 'move-pin', view: 'v', node: id, x, y }).ok);
    const { container } = await mountTables({ onMoveNode, camera: { x: 0, y: 0, width: 900, height: 600 } });
    const header = container.querySelector('[data-id="a"] [data-part="nodo"]')!;
    const gesture = (d: Element | Window, kind: string, cx: number, cy: number) => {
      const e = new MouseEvent(kind, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, buttons: kind === 'mouseup' ? 0 : 1 });
      Object.defineProperty(e, 'view', { value: window });
      fireEvent(d, e);
    };
    gesture(header, 'mousedown', 10, 10);
    gesture(window, 'mousemove', 70, 40);
    gesture(window, 'mouseup', 70, 40);

    expect(onMoveNode).toHaveBeenCalledTimes(1);
    expect(control.files()['main.dg']).toMatch(/node a \{ pin /);
    expect(control.undo()).toBe(true);
    expect(control.files()['main.dg']).toBe(TABLES);
  });

  it('dragging from a row moves the whole table: the row is never the object of the drag', async () => {
    const onMoveNode = vi.fn((_m: { id: string; x: number; y: number }) => {});
    const { container } = await mountTables({ onMoveNode });
    const row = container.querySelector('[data-attribute="a#nombre"]')!;
    const gesture = (d: Element | Window, kind: string, cx: number, cy: number) => {
      const e = new MouseEvent(kind, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, buttons: kind === 'mouseup' ? 0 : 1 });
      Object.defineProperty(e, 'view', { value: window });
      fireEvent(d, e);
    };
    gesture(row, 'mousedown', 10, 10);
    gesture(window, 'mousemove', 70, 40);
    gesture(window, 'mouseup', 70, 40);
    expect(onMoveNode).toHaveBeenCalledTimes(1);
    expect(onMoveNode.mock.calls[0]![0]).toMatchObject({ id: 'a' });
  });
});

describe('ER: Pasos', () => {
  it('a Step reveals tables and FKs as in architecture', async () => {
    const source = openSession({ 'main.dg': TABLES }).source!;
    const { container } = render(<InteractiveView source={source} view="p" theme={NEUTRAL_THEME} layout={(v, t, m) => layoutView(v, t, { measures: m })} width={900} height={600} morphMs={0} />);
    await waitFor(() => expect(container.querySelector('.rd-vista[data-layout="listo"] [data-id="a"]')).not.toBeNull(), { timeout: 8000 });
    const opacity = (id: string) => {
      const el = container.querySelector(`[data-id="${id}"], [data-edge="${id}"]`);
      const part = el?.querySelector<HTMLElement>('[data-part]');
      const v = part != null ? part.style.opacity : el?.getAttribute('opacity');
      return v === null || v === undefined || v === '' ? '1' : v;
    };
    const step = () => fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    const fkId = edgeId(source.model.edges[0]!);
    const back = () => fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    // Enters Step 1: Step 0 would leave it empty.
    expect(container.querySelector('[data-pasos]')?.textContent).toContain('Step 1 of 2');
    expect(opacity('a')).toBe('1');
    expect(opacity('b')).toBe('1');
    expect(opacity(fkId)).toBe('1');
    expect(opacity('c')).toBe('0');
    step();
    expect(opacity('c')).toBe('1');
    back();
    back();
    expect(opacity('a')).toBe('0');
  });
});
