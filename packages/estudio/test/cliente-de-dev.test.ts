import { describe, expect, it, vi } from 'vitest';

import type { EstadoDeDev } from '../src/protocolo';

import { crearClienteDeDev } from '../navegador/cliente';

const buena = { view: 'v', theme: 't', layoutKey: 'k', geometry: { kind: 'grafo', nodes: { a: { x: 0, y: 0, width: 1, height: 1 } }, edges: {}, pinsSolapados: [], width: 1, height: 1 } };

/** `fetch` falso: responde por ruta y anota cada peticion. */
function servidor(rutas: Record<string, { status?: number; cuerpo?: unknown; texto?: string; tipo?: string } | Error>) {
  const peticiones: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFalso = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const ruta = String(url);
    peticiones.push({ url: ruta, ...(init !== undefined && { init }) });
    const r = rutas[ruta];
    if (r instanceof Error) return Promise.reject(r);
    if (r === undefined) return Promise.resolve(new Response('No encontrado', { status: 404 }));
    return Promise.resolve(new Response(r.texto ?? JSON.stringify(r.cuerpo ?? {}), { status: r.status ?? 200, headers: { 'content-type': r.tipo ?? 'application/json' } }));
  }) as unknown as typeof fetch;
  return { fetch: fetchFalso, peticiones };
}

const sinEventos = () => () => undefined;

describe('cliente unico de la pagina de dev', () => {
  it('envia una Intencion por POST /api/edit con la version vista y sin hash', async () => {
    const s = servidor({ '/api/edit': { cuerpo: { ok: true, version: 4 } } });
    const cliente = crearClienteDeDev({ fetch: s.fetch, eventos: sinEventos });

    const r = await cliente.editar({ type: 'move-pin', view: 'general', node: 'api', x: 1, y: 2 }, 3);

    expect(r).toEqual({ ok: true, version: 4 });
    expect(s.peticiones).toHaveLength(1);
    expect(s.peticiones[0]?.url).toBe('/api/edit');
    expect(s.peticiones[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(s.peticiones[0]?.init?.body))).toEqual({ type: 'move-pin', view: 'general', node: 'api', x: 1, y: 2, version: 3 });
  });

  it('un 409 es desactualizado; otro rechazo o un fallo de red no, y nunca lanza', async () => {
    const intencion = { type: 'reorder-lifelines' as const, view: 's', order: ['a', 'b'] };
    const desactualizado = crearClienteDeDev({ fetch: servidor({ '/api/edit': { status: 409, cuerpo: { ok: false, reason: 'stale-hash', message: 'cambio' } } }).fetch, eventos: sinEventos });
    const rechazo = crearClienteDeDev({ fetch: servidor({ '/api/edit': { status: 422, cuerpo: { ok: false, message: 'no compila' } } }).fetch, eventos: sinEventos });
    const caido = crearClienteDeDev({ fetch: servidor({ '/api/edit': new Error('caido') }).fetch, eventos: sinEventos });

    expect(await desactualizado.editar(intencion, 0)).toEqual({ ok: false, desactualizado: true, message: 'cambio', reason: 'stale-hash' });
    expect(await rechazo.editar(intencion, 0)).toEqual({ ok: false, desactualizado: false, message: 'no compila' });
    expect(await caido.editar(intencion, 0)).toEqual({ ok: false, desactualizado: false, message: 'caido' });
  });

  it('deshacer y rehacer van a sus rutas POST', async () => {
    const s = servidor({ '/api/deshacer': { cuerpo: { ok: true, version: 2 } }, '/api/rehacer': { status: 422, cuerpo: { ok: false, message: 'Nada que rehacer' } } });
    const cliente = crearClienteDeDev({ fetch: s.fetch, eventos: sinEventos });

    expect(await cliente.deshacer()).toEqual({ ok: true, version: 2 });
    expect(await cliente.rehacer()).toEqual({ ok: false, desactualizado: false, message: 'Nada que rehacer' });
    expect(s.peticiones.map(({ url, init }) => [url, init?.method])).toEqual([
      ['/api/deshacer', 'POST'],
      ['/api/rehacer', 'POST'],
    ]);
  });

  it('pide la Geometria de una Vista y la valida con el esquema de canonical', async () => {
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
    empujar?.('actividad', '{"command":"edit"}');
    empujar?.('historial', '{"pasado":[]}');
    empujar?.('historial', 'no es json');
    bajaA();
    expect(cerrar).not.toHaveBeenCalled();
    bajaH();

    expect(abrir).toHaveBeenCalledTimes(1);
    expect(actividad).toEqual([{ command: 'edit' }]);
    expect(historial).toEqual([{ pasado: [] }]);
    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  it('inspecciona por GET /api/inspect: la salida, o el mensaje y los cercanos si no existe', async () => {
    const salida = { contractVersion: 2, command: 'search', query: 'api', results: [] };
    const deTema = { contractVersion: 2, command: 'search', query: 'neutral', results: [] };
    const s = servidor({
      '/api/inspect/search/api': { cuerpo: salida },
      '/api/inspect/node/apj': { status: 404, cuerpo: { ok: false, message: "No such Node 'apj'. Did you mean: api", suggestions: ['api'] } },
      '/api/inspect/theme/neutral?tipo=servicio': { cuerpo: deTema },
    });
    const cliente = crearClienteDeDev({ fetch: s.fetch, eventos: sinEventos });

    expect(await cliente.inspeccionar('search', 'api')).toEqual({ ok: true, salida });
    expect(await cliente.inspeccionar('node', 'apj')).toEqual({ ok: false, message: "No such Node 'apj'. Did you mean: api", suggestions: ['api'] });
    expect(await cliente.inspeccionar('theme', 'neutral', { tipo: 'servicio' })).toEqual({ ok: true, salida: deTema });
    expect(await crearClienteDeDev({ fetch: servidor({}).fetch, eventos: sinEventos }).inspeccionar('view', 'x')).toMatchObject({ ok: false, suggestions: [] });
  });

  it('una escritura aceptada con una respuesta que no es la del protocolo es un fallo, no un exito', async () => {
    const s = servidor({ '/api/edit': { cuerpo: { ok: 'si' } }, '/api/confiar': { cuerpo: { aceptado: true } }, '/api/rehacer': { cuerpo: { ok: true } } });
    const cliente = crearClienteDeDev({ fetch: s.fetch, eventos: sinEventos });

    expect(await cliente.editar({ type: 'move-pin', view: 'general', node: 'api', x: 1, y: 2 }, 3)).toMatchObject({ ok: false, desactualizado: false, message: expect.stringContaining('Malformed response from /api/edit') });
    expect(await cliente.confiar()).toMatchObject({ ok: false, message: expect.stringContaining('Malformed response from /api/confiar') });
    expect(await cliente.rehacer()).toMatchObject({ ok: false, message: expect.stringContaining('Malformed response from /api/rehacer') });
  });

  it('un rechazo con un cuerpo fuera del protocolo da el estado y la ruta, y su motivo no se cuela', async () => {
    const s = servidor({ '/api/edit': { status: 422, cuerpo: { ok: false, message: 7, reason: 'inventado' } }, '/api/historial/saltar': { status: 409, cuerpo: { error: 'x' } } });
    const cliente = crearClienteDeDev({ fetch: s.fetch, eventos: sinEventos });

    expect(await cliente.editarTexto({ ediciones: [{ file: 'a.dg', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: 'x' }] })).toEqual({ ok: false, desactualizado: false, message: 'Error 422 at /api/edit' });
    expect(await cliente.saltar(2)).toEqual({ ok: false, desactualizado: true, message: 'Error 409 at /api/historial/saltar' });
  });

  it('el bundle de Componentes solo vale con 200 y content-type de JavaScript', async () => {
    const bundle = 'module.exports = {}';
    const bueno = crearClienteDeDev({ fetch: servidor({ '/componentes.js': { texto: bundle, tipo: 'text/javascript; charset=utf-8' } }).fetch, eventos: sinEventos });
    const html = crearClienteDeDev({ fetch: servidor({ '/componentes.js': { texto: '<html></html>', tipo: 'text/html' } }).fetch, eventos: sinEventos });
    const prohibido = crearClienteDeDev({ fetch: servidor({ '/componentes.js': { status: 403, cuerpo: { ok: false, message: 'El codigo del Workspace no esta confirmado' } } }).fetch, eventos: sinEventos });

    expect(await bueno.bundleDeComponentes()).toEqual({ ok: true, valor: bundle });
    expect(await html.bundleDeComponentes()).toEqual({ ok: false, message: expect.stringContaining('text/html') });
    expect(await prohibido.bundleDeComponentes()).toEqual({ ok: false, message: 'El codigo del Workspace no esta confirmado' });
  });

  it('GET /api/codigo y /api/archivos malformados son fallos con su motivo', async () => {
    const s = servidor({ '/api/codigo': { cuerpo: { temaConCodigo: 'si' } }, '/api/archivos': { cuerpo: { version: 1 } } });
    const cliente = crearClienteDeDev({ fetch: s.fetch, eventos: sinEventos });

    expect(await cliente.codigo()).toEqual({ ok: false, message: expect.stringContaining('Malformed response from /api/codigo') });
    expect(await cliente.archivos()).toEqual({ ok: false, message: expect.stringContaining('Malformed response from /api/archivos') });
  });

  it('una salida de inspect que no cumple el esquema es un fallo', async () => {
    const s = servidor({ '/api/inspect/search/api': { cuerpo: { contractVersion: 2, command: 'search', query: 'api', results: 'muchos' } } });
    const cliente = crearClienteDeDev({ fetch: s.fetch, eventos: sinEventos });

    expect(await cliente.inspeccionar('search', 'api')).toEqual({ ok: false, message: expect.stringContaining('Malformed response from /api/inspect/search/api'), suggestions: [] });
  });
});
