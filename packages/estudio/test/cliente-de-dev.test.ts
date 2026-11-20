import { describe, expect, it, vi } from 'vitest';

import type { EstadoDeDev } from '../src/protocolo';

import { crearClienteDeDev } from '../navegador/cliente';

const buena = { view: 'v', theme: 't', layoutKey: 'k', geometry: { kind: 'grafo', nodes: { a: { x: 0, y: 0, width: 1, height: 1 } }, edges: {}, pinsSolapados: [], width: 1, height: 1 } };

/** `fetch` falso: responde por ruta y anota cada peticion. */
function servidor(rutas: Record<string, { status?: number; cuerpo?: unknown } | Error>) {
  const peticiones: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFalso = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const ruta = String(url);
    peticiones.push({ url: ruta, ...(init !== undefined && { init }) });
    const r = rutas[ruta];
    if (r instanceof Error) return Promise.reject(r);
    if (r === undefined) return Promise.resolve(new Response('No encontrado', { status: 404 }));
    return Promise.resolve(new Response(JSON.stringify(r.cuerpo ?? {}), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } }));
  }) as unknown as typeof fetch;
  return { fetch: fetchFalso, peticiones };
}

const sinEventos = () => () => undefined;

describe('cliente unico de la pagina de dev', () => {
  it('envia una Intencion por POST /api/edit con la version vista y sin hash', async () => {
    const s = servidor({ '/api/edit': { cuerpo: { ok: true, version: 4 } } });
    const cliente = crearClienteDeDev({ fetch: s.fetch, eventos: sinEventos });

    const r = await cliente.editar({ tipo: 'mover-pin', vista: 'general', nodo: 'api', x: 1, y: 2 }, 3);

    expect(r).toEqual({ ok: true, version: 4 });
    expect(s.peticiones).toHaveLength(1);
    expect(s.peticiones[0]?.url).toBe('/api/edit');
    expect(s.peticiones[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(s.peticiones[0]?.init?.body))).toEqual({ tipo: 'mover-pin', vista: 'general', nodo: 'api', x: 1, y: 2, version: 3 });
  });

  it('un 409 es desactualizado; otro rechazo o un fallo de red no, y nunca lanza', async () => {
    const intencion = { tipo: 'ordenar-lifelines' as const, vista: 's', orden: ['a', 'b'] };
    const desactualizado = crearClienteDeDev({ fetch: servidor({ '/api/edit': { status: 409, cuerpo: { ok: false, motivo: 'hash-desactualizado', mensaje: 'cambio' } } }).fetch, eventos: sinEventos });
    const rechazo = crearClienteDeDev({ fetch: servidor({ '/api/edit': { status: 422, cuerpo: { ok: false, mensaje: 'no compila' } } }).fetch, eventos: sinEventos });
    const caido = crearClienteDeDev({ fetch: servidor({ '/api/edit': new Error('caido') }).fetch, eventos: sinEventos });

    expect(await desactualizado.editar(intencion, 0)).toEqual({ ok: false, desactualizado: true, mensaje: 'cambio', motivo: 'hash-desactualizado' });
    expect(await rechazo.editar(intencion, 0)).toEqual({ ok: false, desactualizado: false, mensaje: 'no compila' });
    expect(await caido.editar(intencion, 0)).toEqual({ ok: false, desactualizado: false, mensaje: 'caido' });
  });

  it('deshacer y rehacer van a sus rutas POST', async () => {
    const s = servidor({ '/api/deshacer': { cuerpo: { ok: true, version: 2 } }, '/api/rehacer': { status: 422, cuerpo: { ok: false, mensaje: 'Nada que rehacer' } } });
    const cliente = crearClienteDeDev({ fetch: s.fetch, eventos: sinEventos });

    expect(await cliente.deshacer()).toEqual({ ok: true, version: 2 });
    expect(await cliente.rehacer()).toEqual({ ok: false, desactualizado: false, mensaje: 'Nada que rehacer' });
    expect(s.peticiones.map(({ url, init }) => [url, init?.method])).toEqual([
      ['/api/deshacer', 'POST'],
      ['/api/rehacer', 'POST'],
    ]);
  });

  it('pide la Geometria de una Vista y la valida con el esquema de canonico', async () => {
    const s = servidor({ '/api/vista/v%201': { cuerpo: buena }, '/api/vista/rota': { cuerpo: { ...buena, geometry: { kind: 'grafo', nodes: 3 } } } });
    const cliente = crearClienteDeDev({ fetch: s.fetch, eventos: sinEventos });

    const leida = await cliente.geometria('v 1');
    expect(leida.ok && leida.geometria.geometry.kind).toBe('grafo');

    const rota = await cliente.geometria('rota');
    expect(rota.ok).toBe(false);
    expect(!rota.ok && rota.error).toContain('rota');
  });

  it('una Geometria que no llega (404 o red) es un fallo sin error que mostrar', async () => {
    const cliente = crearClienteDeDev({ fetch: servidor({ '/api/vista/caida': new Error('red') }).fetch, eventos: sinEventos });

    expect(await cliente.geometria('nada')).toEqual({ ok: false });
    expect(await cliente.geometria('caida')).toEqual({ ok: false });
  });

  it('una Geometria que no llega en el plazo es un fallo sin error (la pagina cae al Worker)', async () => {
    const colgado = vi.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
    const cliente = crearClienteDeDev({ fetch: colgado, eventos: sinEventos, plazoDeGeometriaMs: 20 });

    expect(await cliente.geometria('lenta')).toEqual({ ok: false });
  });

  it('estado() no lanza: un fallo de red o una respuesta rota dan undefined', async () => {
    const caido = crearClienteDeDev({ fetch: servidor({ '/api/estado': new Error('red') }).fetch, eventos: sinEventos });
    const roto = crearClienteDeDev({ fetch: servidor({ '/api/estado': { status: 500, cuerpo: { error: 'x' } } }).fetch, eventos: sinEventos });

    expect(await caido.estado()).toBeUndefined();
    expect(await roto.estado()).toBeUndefined();
  });

  it('se suscribe al estado (event: estado) por /eventos y lo pide a /api/estado', async () => {
    const estado = { version: 3, cambio: 'pintura', iconos: {}, vistas: [], issues: [] } satisfies EstadoDeDev;
    let empujar: ((nombre: string, datos: string) => void) | undefined;
    const cerrar = vi.fn();
    const abrir = vi.fn((_url: string, alEvento: (nombre: string, datos: string) => void) => ((empujar = alEvento), cerrar));
    const cliente = crearClienteDeDev({ fetch: servidor({ '/api/estado': { cuerpo: estado } }).fetch, eventos: abrir });
    const recibidos: EstadoDeDev[] = [];

    const baja = cliente.suscribir((e) => recibidos.push(e));
    empujar?.('estado', JSON.stringify(estado));
    empujar?.('actividad', '{"otro":1}');
    baja();

    expect(abrir).toHaveBeenCalledWith('/eventos', expect.any(Function));
    expect(recibidos).toEqual([estado]);
    expect(cerrar).toHaveBeenCalled();
    expect(await cliente.estado()).toEqual(estado);
  });

  it('una sola conexion SSE para todos los oyentes; se cierra al irse el ultimo', () => {
    let empujar: ((nombre: string, datos: string) => void) | undefined;
    const cerrar = vi.fn();
    const abrir = vi.fn((_url: string, alEvento: (nombre: string, datos: string) => void) => ((empujar = alEvento), cerrar));
    const cliente = crearClienteDeDev({ fetch: servidor({}).fetch, eventos: abrir });
    const actividad: unknown[] = [];
    const historial: unknown[] = [];

    const bajaA = cliente.escuchar('actividad', (d) => actividad.push(d));
    const bajaH = cliente.escuchar('historial', (d) => historial.push(d));
    empujar?.('actividad', '{"comando":"edit"}');
    empujar?.('historial', '{"pasado":[]}');
    empujar?.('historial', 'no es json');
    bajaA();
    expect(cerrar).not.toHaveBeenCalled();
    bajaH();

    expect(abrir).toHaveBeenCalledTimes(1);
    expect(actividad).toEqual([{ comando: 'edit' }]);
    expect(historial).toEqual([{ pasado: [] }]);
    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  it('inspecciona por GET /api/inspect: la salida, o el mensaje y los cercanos si no existe', async () => {
    const salida = { contractVersion: 1, comando: 'nodo', nodo: { id: 'api' } };
    const s = servidor({
      '/api/inspect/nodo/api': { cuerpo: salida },
      '/api/inspect/nodo/apj': { status: 404, cuerpo: { ok: false, mensaje: "No existe el Nodo 'apj'. Quiza: api", cercanos: ['api'] } },
      '/api/inspect/tema/neutral?tipo=servicio': { cuerpo: { comando: 'tema' } },
    });
    const cliente = crearClienteDeDev({ fetch: s.fetch, eventos: sinEventos });

    expect(await cliente.inspeccionar('nodo', 'api')).toEqual({ ok: true, salida });
    expect(await cliente.inspeccionar('nodo', 'apj')).toEqual({ ok: false, mensaje: "No existe el Nodo 'apj'. Quiza: api", cercanos: ['api'] });
    expect(await cliente.inspeccionar('tema', 'neutral', { tipo: 'servicio' })).toEqual({ ok: true, salida: { comando: 'tema' } });
    expect(await crearClienteDeDev({ fetch: servidor({}).fetch, eventos: sinEventos }).inspeccionar('vista', 'x')).toMatchObject({ ok: false, cercanos: [] });
  });
});
