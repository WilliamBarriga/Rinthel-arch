import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, idDeArista, resolveView, revealAt } from 'canonico';

const nodo = (id: string, children: unknown[] = []) => ({
  id,
  type: 'servicio',
  title: id,
  description: '',
  children,
});

/** a { a1 a2 }, b, c; aristas a.a1 -> b, b -> c */
function vista(vistaExtra: Record<string, unknown>, estado = {}) {
  const fuente = fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: {
      nodes: [nodo('a', [nodo('a.a1'), nodo('a.a2')]), nodo('b'), nodo('c')],
      edges: [
        { from: { node: 'a.a1' }, to: { node: 'b' } },
        { from: { node: 'b' }, to: { node: 'c' } },
      ],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], ...vistaExtra }],
  });
  const resuelta = resolveView(fuente, 'v', estado);
  if (resuelta === undefined) throw new Error('Vista inexistente');
  return resuelta;
}

const mostrar = (...selectores: string[]) => selectores.map((selector) => ({ selector }));
const paso = (title: string, show: unknown[], hide: unknown[] = []) => ({ title, show, hide });

const AB = idDeArista({ from: { node: 'a.a1' }, to: { node: 'b' } });
const BC = idDeArista({ from: { node: 'b' }, to: { node: 'c' } });

describe('revealAt', () => {
  it('sin steps todo esta revelado en cualquier posicion', () => {
    const visibilidad = revealAt(vista({}), 0);

    expect(['a', 'a.a1', 'b', 'c', AB, BC].map(visibilidad)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(revealAt(vista({}), 7)('b')).toBe(1);
  });

  it('una posicion entera k aplica los pasos 1..k: 0 y 1 solamente', () => {
    const v = vista({ steps: [paso('uno', mostrar('b')), paso('dos', mostrar('c'))] });

    expect(['b', 'c'].map(revealAt(v, 0))).toEqual([0, 0]);
    expect(['b', 'c'].map(revealAt(v, 1))).toEqual([1, 0]);
    expect(['b', 'c'].map(revealAt(v, 2))).toEqual([1, 1]);
  });

  it('una posicion fuera de rango se acota a los pasos existentes', () => {
    const v = vista({ steps: [paso('uno', mostrar('b'))] });

    expect(revealAt(v, 9)('b')).toBe(1);
    expect(revealAt(v, -3)('b')).toBe(0);
  });

  it('la visibilidad es siempre 0 o 1: una fraccion no interpola, aplica el paso entero anterior', () => {
    const v = vista({ steps: [paso('uno', mostrar('b')), paso('dos', mostrar('c'))] });

    expect(['b', 'c'].map(revealAt(v, 0.25))).toEqual([0, 0]);
    expect(['b', 'c'].map(revealAt(v, 1.5))).toEqual([1, 0]);
    expect(['b', 'c'].map(revealAt(v, 1.99))).toEqual([1, 0]);
  });

  it('lo anterior sigue visible (acumulativo) y hide lo oculta', () => {
    const v = vista({ steps: [paso('uno', mostrar('b', 'c')), paso('dos', [], mostrar('b'))] });

    expect(['b', 'c'].map(revealAt(v, 1))).toEqual([1, 1]);
    expect(['b', 'c'].map(revealAt(v, 2))).toEqual([0, 1]);
  });

  it('nombrar un Grupo no revela sus hijos; `a.*` revela el Grupo y sus hijos directos', () => {
    const v = vista({ steps: [paso('uno', mostrar('a')), paso('dos', mostrar('a.*'))] });

    expect(['a', 'a.a1', 'a.a2'].map(revealAt(v, 1))).toEqual([1, 0, 0]);
    expect(['a', 'a.a1', 'a.a2'].map(revealAt(v, 2))).toEqual([1, 1, 1]);
  });

  it('`a.*` revela el Grupo `a` aunque no se haya nombrado antes', () => {
    const v = vista({ steps: [paso('uno', mostrar('a.*'))] });

    expect(['a', 'a.a1', 'a.a2', 'b'].map(revealAt(v, 1))).toEqual([1, 1, 1, 0]);
  });

  it('`hide a.*` oculta el Grupo y sus hijos directos', () => {
    const v = vista({ steps: [paso('uno', mostrar('**')), paso('dos', [], mostrar('a.*'))] });

    expect(['a', 'a.a1', 'a.a2', 'b'].map(revealAt(v, 2))).toEqual([0, 0, 0, 1]);
  });

  it('una Arista aparece sola cuando sus dos extremos son visibles', () => {
    const v = vista({ steps: [paso('uno', mostrar('b')), paso('dos', mostrar('c')), paso('tres', mostrar('a.a1'))] });

    expect([AB, BC].map(revealAt(v, 1))).toEqual([0, 0]);
    expect([AB, BC].map(revealAt(v, 2))).toEqual([0, 1]);
    expect([AB, BC].map(revealAt(v, 3))).toEqual([1, 1]);
  });

  it('una Arista nombrada por un paso posterior espera a ese paso', () => {
    const v = vista({
      steps: [
        paso('uno', mostrar('b', 'c')),
        paso('dos', [{ from: 'b', to: 'c' }]),
      ],
    });

    expect(revealAt(v, 1)(BC)).toBe(0);
    expect(revealAt(v, 2)(BC)).toBe(1);
  });

  it('una Arista nombrada sigue necesitando ambos extremos visibles', () => {
    const v = vista({ steps: [paso('uno', [{ from: 'b', to: 'c' }]), paso('dos', mostrar('b', 'c'))] });

    expect(revealAt(v, 1)(BC)).toBe(0);
    expect(revealAt(v, 2)(BC)).toBe(1);
  });

  it('hide de una Arista la oculta aunque sus extremos sigan visibles', () => {
    const v = vista({ steps: [paso('uno', mostrar('b', 'c')), paso('dos', [], [{ from: 'b', to: 'c' }])] });

    expect(revealAt(v, 1)(BC)).toBe(1);
    expect(revealAt(v, 2)(BC)).toBe(0);
  });

  it('un Grupo colapsado es visible si algun hijo esta revelado', () => {
    const v = vista(
      { steps: [paso('uno', mostrar('b')), paso('dos', mostrar('a.a2'))] },
      { collapsed: ['a'] },
    );

    expect(revealAt(v, 1)('a')).toBe(0);
    expect(revealAt(v, 2)('a')).toBe(1);
  });

  it('un Grupo colapsado se revela tambien nombrandolo o con `a.*`', () => {
    const nombrado = vista({ steps: [paso('uno', mostrar('a'))] }, { collapsed: ['a'] });
    const hijos = vista({ steps: [paso('uno', mostrar('a.*'))] }, { collapsed: ['a'] });

    expect(revealAt(nombrado, 1)('a')).toBe(1);
    expect(revealAt(hijos, 1)('a')).toBe(1);
  });

  it('nombrar una Arista de un hijo la espera aunque el Grupo este colapsado', () => {
    const v = vista(
      { steps: [paso('uno', mostrar('a', 'b')), paso('dos', [{ from: 'a.a1', to: 'b' }])] },
      { collapsed: ['a'] },
    );
    const elevada = idDeArista({ from: { node: 'a' }, to: { node: 'b' } });

    expect(revealAt(v, 1)(elevada)).toBe(0);
    expect(revealAt(v, 2)(elevada)).toBe(1);
  });

  it('una posicion NaN se trata como 0', () => {
    const v = vista({ steps: [paso('uno', mostrar('b'))] });

    expect(revealAt(v, Number.NaN)('b')).toBe(0);
  });
});
