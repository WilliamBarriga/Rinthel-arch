import { describe, expect, it } from 'vitest';

import type { CachedGeometry } from 'canonical';

import type { EstadoDeDev } from '../src/protocolo';
import type { LecturaDeGeometria } from '../navegador/cliente';
import { crearGeometriasDeDev } from '../navegador/lienzo/geometrias';

const geometria = (view: string): CachedGeometry => ({ view, theme: 't', layoutKey: 'k', geometry: { kind: 'grafo', nodes: {}, edges: {}, labels: {}, pinsSolapados: [], width: 1, height: 1 } });

/** La Fuente es opaca para la cache: solo importa que exista. */
const estado = (version: number, cambio?: EstadoDeDev['cambio']): EstadoDeDev => ({
  version,
  ...(cambio !== undefined && { cambio }),
  fuente: { views: [{ id: 'a' }, { id: 'b' }] } as unknown as EstadoDeDev['fuente'],
  iconos: {},
  vistas: ['a', 'b'],
  issues: [],
});

/** Servidor falso de Geometrias: cada peticion queda pendiente hasta que la prueba la responde. */
function servidor() {
  const pedidas: Array<{ vista: string; responder: (l: LecturaDeGeometria) => Promise<void> }> = [];
  const pedir = (vista: string) =>
    new Promise<LecturaDeGeometria>((ok) => {
      pedidas.push({
        vista,
        responder: async (l) => {
          ok(l);
          await new Promise((listo) => setTimeout(listo, 0));
        },
      });
    });
  return { pedir, vistas: () => pedidas.map(({ vista }) => vista), ultima: () => pedidas[pedidas.length - 1]! };
}

function armar(activa = 'a') {
  const s = servidor();
  const cache = crearGeometriasDeDev({ pedir: s.pedir, vistaInicial: () => activa });
  return { s, cache };
}

describe('Geometria bajo demanda de la pagina de dev', () => {
  it('al arrancar pide solo la Geometria de la Vista activa y dibuja cuando llega', async () => {
    const { s, cache } = armar('b');

    cache.recibir(estado(0));
    expect(s.vistas()).toEqual(['b']);
    expect(cache.dibujable()).toBeUndefined();

    await s.ultima().responder({ ok: true, geometria: geometria('b') });
    expect(cache.dibujable()?.estado.version).toBe(0);
    expect(Object.keys(cache.dibujable()?.geometrias ?? {})).toEqual(['b']);
  });

  it('tras un cambio de estructura pide solo la Vista activa y conserva el dibujo anterior hasta que llega', async () => {
    const { s, cache } = armar();
    cache.recibir(estado(0));
    await s.ultima().responder({ ok: true, geometria: geometria('a') });

    cache.recibir(estado(1, 'estructura'));
    expect(s.vistas()).toEqual(['a', 'a']);
    expect(cache.dibujable()?.estado.version).toBe(0);

    const nueva = geometria('a');
    await s.ultima().responder({ ok: true, geometria: nueva });
    expect(cache.dibujable()?.estado.version).toBe(1);
    expect(cache.dibujable()?.geometrias['a']).toBe(nueva);
  });

  it('tras un cambio de pintura (o de codigo) no pide Geometria y dibuja ya con la vigente', async () => {
    const { s, cache } = armar();
    cache.recibir(estado(0));
    const vigente = geometria('a');
    await s.ultima().responder({ ok: true, geometria: vigente });

    cache.recibir(estado(1, 'pintura'));
    cache.recibir(estado(2, 'codigo'));

    expect(s.vistas()).toEqual(['a']);
    expect(cache.dibujable()?.estado.version).toBe(2);
    expect(cache.dibujable()?.geometrias['a']).toBe(vigente);
  });

  it('si se salto una version no sabe que cambio: pide de nuevo la Vista activa', async () => {
    const { s, cache } = armar();
    cache.recibir(estado(0));
    await s.ultima().responder({ ok: true, geometria: geometria('a') });

    cache.recibir(estado(3, 'pintura'));

    expect(s.vistas()).toEqual(['a', 'a']);
  });

  it('navegar a otra Vista pide su Geometria una sola vez; sin respuesta no hay Geometria (la calcula el Worker)', async () => {
    const { s, cache } = armar();
    cache.recibir(estado(0));
    await s.ultima().responder({ ok: true, geometria: geometria('a') });

    cache.activar('b');
    cache.activar('b');
    expect(s.vistas()).toEqual(['a', 'b']);

    await s.ultima().responder({ ok: false });
    expect(cache.dibujable()?.geometrias['b']).toBeUndefined();
    expect(cache.dibujable()?.errores).toEqual([]);

    cache.activar('a');
    expect(s.vistas()).toEqual(['a', 'b']);
  });

  it('si la Geometria de la Vista activa no llega tras un cambio de estructura, dibuja sin ella', async () => {
    const { s, cache } = armar();
    cache.recibir(estado(0));
    await s.ultima().responder({ ok: true, geometria: geometria('a') });

    cache.recibir(estado(1, 'estructura'));
    await s.ultima().responder({ ok: false });

    expect(cache.dibujable()?.estado.version).toBe(1);
    expect(cache.dibujable()?.geometrias).toEqual({});
  });

  it('una Geometria malformada se reporta como error y no se entrega', async () => {
    const { s, cache } = armar();
    cache.recibir(estado(0));

    await s.ultima().responder({ ok: false, error: 'Geometria malformada en la Vista a' });

    expect(cache.dibujable()?.geometrias).toEqual({});
    expect(cache.dibujable()?.errores).toEqual(['Geometria malformada en la Vista a']);
  });

  it('una respuesta de antes de un cambio de estructura se descarta', async () => {
    const { s, cache } = armar();
    cache.recibir(estado(0));
    await s.ultima().responder({ ok: true, geometria: geometria('a') });
    cache.activar('b');
    const tardia = s.ultima();

    cache.recibir(estado(1, 'estructura'));
    expect(s.vistas()).toEqual(['a', 'b', 'b']);
    const nueva = geometria('b');
    await s.ultima().responder({ ok: true, geometria: nueva });
    await tardia.responder({ ok: true, geometria: geometria('b') });

    expect(cache.dibujable()?.geometrias['b']).toBe(nueva);
    expect(cache.dibujable()?.geometrias['a']).toBeUndefined();
  });

  it('avisa a los suscriptores cuando cambia lo dibujable', async () => {
    const { s, cache } = armar();
    let avisos = 0;
    cache.suscribir(() => (avisos += 1));

    cache.recibir(estado(0));
    await s.ultima().responder({ ok: true, geometria: geometria('a') });

    expect(avisos).toBeGreaterThan(0);
  });
});
