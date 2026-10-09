import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema } from 'canonico';
import type { VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva, deserializarEstado, hashDelNavegador, serializarEstado, useEstadoEnHash } from 'shell';
import type { AdaptadorDeHash, AdaptadorDeLayout, EstadoDeShell } from 'shell';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '#');
});

const nodo = (id: string, children: unknown[] = []) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children });
const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [nodo('g', [nodo('g.h'), nodo('g.i')]), nodo('x'), nodo('y')], edges: [] },
  views: [
    {
      id: 'a',
      type: 'architecture',
      include: ['g', 'x'],
      exclude: [],
      links: [{ node: 'x', view: 'b' }],
      steps: [
        { title: 'uno', show: [{ selector: 'g' }] },
        { title: 'dos', show: [{ selector: 'x' }] },
      ],
    },
    { id: 'b', type: 'architecture', include: ['y'], exclude: [], links: [{ node: 'y', view: 'a' }] },
  ],
});

const POR_DEFECTO: EstadoDeShell = { path: ['a'], state: {}, selected: null, step: 0 };

const completo: EstadoDeShell = {
  path: ['a', 'b', 'a'],
  state: { expanded: ['g'], collapsed: [] },
  selected: 'x',
  step: 2,
  camera: { x: 10.5, y: -3, width: 400, height: 300 },
};

describe('serializarEstado y deserializarEstado', () => {
  it('ida y vuelta sin perdida', () => {
    expect(deserializarEstado(serializarEstado(completo), fuente)).toEqual(completo);
  });

  it('ids con caracteres especiales sobreviven', () => {
    const f = fuenteCanonicaSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [nodo('a_b-1')], edges: [] },
      views: [{ id: 'v 1,2&=%', type: 'flow', include: ['**'], exclude: [] }],
    });
    const e: EstadoDeShell = { path: ['v 1,2&=%'], state: {}, selected: 'a_b-1', step: 0 };
    expect(deserializarEstado(serializarEstado(e), f)).toEqual(e);
  });

  it('el estado por defecto serializa a hash vacio', () => {
    expect(serializarEstado(POR_DEFECTO, 'a')).toBe('');
    expect(deserializarEstado('', fuente)).toEqual(POR_DEFECTO);
  });

  it('acepta el prefijo #', () => {
    expect(deserializarEstado('#' + serializarEstado(completo), fuente)).toEqual(completo);
  });

  it('hash basura cae al estado por defecto', () => {
    for (const h of ['%%%', '===&&&', 'p=&s=&t=abc&cam=x,y', 'zzz']) {
      expect(deserializarEstado(h, fuente)).toEqual(POR_DEFECTO);
    }
  });

  it('ids inexistentes caen al default por campo', () => {
    const e = deserializarEstado('p=a&p=nada&p=b&s=fantasma&e=g&e=nope&c=zzz&t=9', fuente);
    expect(e.path).toEqual(['a', 'b']);
    expect(e.selected).toBeNull();
    expect(e.state).toEqual({ expanded: ['g'], collapsed: [] });
    expect(e.step).toBe(0);
  });

  it('Vista inexistente cae a la Vista por defecto', () => {
    expect(deserializarEstado('p=nada', fuente).path).toEqual(['a']);
  });

  it('el Paso se acota a los Pasos de la Vista activa', () => {
    expect(deserializarEstado('p=b&t=1', fuente).step).toBe(0);
    expect(deserializarEstado('p=a&t=-1', fuente).step).toBe(0);
    expect(deserializarEstado('p=a&t=1', fuente).step).toBe(1);
  });

  it('camara invalida se descarta', () => {
    expect(deserializarEstado('cam=1,2,0,5', fuente).camera).toBeUndefined();
    expect(deserializarEstado('cam=1,2,3', fuente).camera).toBeUndefined();
    expect(deserializarEstado('cam=1,2,NaN,5', fuente).camera).toBeUndefined();
  });
});

describe('useEstadoEnHash', () => {
  const adaptadorFake = (inicial = '') => {
    let hash = inicial;
    const oyentes = new Set<() => void>();
    const escrituras: { hash: string; reemplazar: boolean }[] = [];
    const a: AdaptadorDeHash = {
      leer: () => hash,
      escribir: (h, o) => {
        hash = h;
        escrituras.push({ hash: h, reemplazar: o.reemplazar });
      },
      suscribir: (cb) => {
        oyentes.add(cb);
        return () => oyentes.delete(cb);
      },
    };
    return {
      a,
      escrituras,
      navegar: (h: string) => {
        hash = h;
        oyentes.forEach((o) => o());
      },
    };
  };

  it('arranca desde el hash y lo expone como props', () => {
    const { a } = adaptadorFake(serializarEstado(completo));
    const { result } = renderHook(() => useEstadoEnHash({ source: fuente, hash: a, camera: true }));
    expect(result.current.view).toBe('a');
    expect(result.current.path).toEqual(completo.path);
    expect(result.current.state).toEqual(completo.state);
    expect(result.current.selected).toBe('x');
    expect(result.current.step).toBe(2);
    expect(result.current.camera).toEqual(completo.camera);
  });

  it('los avisos escriben el hash; el cambio de Vista empuja historial y reinicia el resto', () => {
    const { a, escrituras } = adaptadorFake();
    const { result } = renderHook(() => useEstadoEnHash({ source: fuente, hash: a, camera: true }));
    act(() => result.current.onSelect('x'));
    act(() => result.current.onStepChange(1));
    act(() => result.current.onStateChange({ expanded: ['g'] }));
    act(() => result.current.onCameraChange({ x: 1, y: 2, width: 3, height: 4 }));
    expect(escrituras.every((e) => e.reemplazar)).toBe(true);
    const antes = deserializarEstado(escrituras[escrituras.length - 1]!.hash, fuente);
    expect(antes).toMatchObject({ selected: 'x', step: 1, state: { expanded: ['g'] }, camera: { x: 1, y: 2, width: 3, height: 4 } });

    act(() => result.current.onPathChange(['a', 'b']));
    const ultima = escrituras[escrituras.length - 1]!;
    expect(ultima.reemplazar).toBe(false);
    expect(deserializarEstado(ultima.hash, fuente)).toEqual({ path: ['a', 'b'], state: {}, selected: null, step: 0 });
    expect(result.current.selected).toBeNull();
    expect(result.current.camera).toBeUndefined();
  });

  it('sin camera:true el viewport no se lee ni se escribe', () => {
    const { a, escrituras } = adaptadorFake('cam=1,2,3,4');
    const { result } = renderHook(() => useEstadoEnHash({ source: fuente, hash: a }));
    expect(result.current.camera).toBeUndefined();
    act(() => result.current.onCameraChange({ x: 9, y: 9, width: 9, height: 9 }));
    expect(escrituras).toEqual([]);
  });

  it('un cambio externo del hash (atras del navegador) actualiza el estado', () => {
    const { a, navegar } = adaptadorFake();
    const { result } = renderHook(() => useEstadoEnHash({ source: fuente, hash: a }));
    act(() => navegar('p=a&p=b'));
    expect(result.current.view).toBe('b');
  });

  it('un cambio de ruta que mantiene la Vista conserva el resto', () => {
    const { a } = adaptadorFake('s=x');
    const { result } = renderHook(() => useEstadoEnHash({ source: fuente, hash: a }));
    act(() => result.current.onPathChange(['a', 'a']));
    expect(result.current.selected).toBe('x');
  });

  it('Vista por defecto configurable', () => {
    const { a } = adaptadorFake();
    const { result } = renderHook(() => useEstadoEnHash({ source: fuente, hash: a, defaultView: 'b' }));
    expect(result.current.view).toBe('b');
  });
});

describe('integracion con VistaInteractiva y location.hash', () => {
  const layout: AdaptadorDeLayout = async (vista: VistaResuelta) => {
    const nodes: Geometria['nodes'] = {};
    vista.nodes.forEach((n, i) => {
      nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
    });
    return { nodes, edges: {}, pinsSolapados: [], width: 500, height: 50 };
  };
  function App() {
    const props = useEstadoEnHash({ source: fuente, hash: hashDelNavegador(window), camera: true });
    return <VistaInteractiva source={fuente} theme={TEMA_NEUTRO} layout={layout} width={800} height={600} {...props} />;
  }
  const dibujado = (c: HTMLElement, id: string) => waitFor(() => expect(c.querySelector(`svg [data-id="${id}"]`)).not.toBeNull());

  it('recargar con el hash restaura Vista y ruta', async () => {
    const primera = render(<App />);
    await dibujado(primera.container, 'x');
    fireEvent.click(primera.container.querySelector('[data-id="x"] [data-part="nodo"]')!);
    await dibujado(primera.container, 'y');
    expect(window.location.hash).toContain('p=a&p=b');
    primera.unmount();

    const segunda = render(<App />);
    await dibujado(segunda.container, 'y');
    expect(Array.from(document.querySelectorAll('[data-breadcrumbs] [data-crumb]')).map((e) => e.getAttribute('data-crumb'))).toEqual(['a', 'b']);
  });

  it('restaura Paso y seleccion en la Vista inicial', async () => {
    window.history.replaceState(null, '', '#s=g&t=1');
    const { container } = render(<App />);
    await dibujado(container, 'x');
    expect(container.querySelector('[data-selected="g"]')).not.toBeNull();
    expect(container.textContent).toContain('Paso 1 de 2');
  });

  it('hash invalido no rompe', async () => {
    window.history.replaceState(null, '', '#p=nada&s=zzz&t=99');
    const { container } = render(<App />);
    await dibujado(container, 'x');
  });
});
