/** Humo del enrutador HTTP de `dev`; el comportamiento del estado vivo se prueba en `workspace-vivo.test.ts`. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { iniciarDev } from 'cli';
import { leerWorkspace as leerReal } from '../src/workspace';
import type { OpcionesDeDev, ServidorDev } from 'cli';

const BASE = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db
}

view general {
  type architecture
  include **
}
`;

/** Workspace en memoria con un observador que se dispara a mano. */
function entorno(inicial: Record<string, string>) {
  let archivos = { ...inicial };
  let avisar: (() => void) | undefined;
  return {
    leer: () => ({ ...archivos }),
    observar: (_raiz: string, alCambiar: () => void) => {
      avisar = alCambiar;
      return () => {
        avisar = undefined;
      };
    },
    /** Cambio externo: avisa al observador. */
    escribir(ruta: string, texto: string) {
      archivos = { ...archivos, [ruta]: texto };
      avisar?.();
    },
    /** Escritura de `dev`: no avisa al observador. */
    escribirEdicion: (_raiz: string, ruta: string, texto: string) => {
      archivos = { ...archivos, [ruta]: texto };
    },
    borrar: (_raiz: string, ruta: string) => {
      const { [ruta]: _quitado, ...resto } = archivos;
      archivos = resto;
    },
    texto: (ruta: string) => archivos[ruta],
    observando: () => avisar !== undefined,
  };
}

const carpetas: string[] = [];

/** `estudio` falso: sus estaticos son archivos de una carpeta temporal que la prueba puede reescribir. */
function estudioFalso() {
  const carpeta = mkdtempSync(join(tmpdir(), 'rinthel-estudio-falso-'));
  carpetas.push(carpeta);
  const ruta = (nombre: string) => join(carpeta, nombre);
  const escribir = (nombre: string, texto: string) => writeFileSync(ruta(nombre), texto);
  escribir('index.html', '<!doctype html><title>falso</title>');
  escribir('pagina.js', '/*pagina*/');
  escribir('estilo.css', '/*estilo*/');
  return { estudio: () => ({ indice: ruta('index.html'), archivos: { 'pagina.js': ruta('pagina.js'), 'estilo.css': ruta('estilo.css'), 'ausente.js': ruta('ausente.js') } }), escribir };
}

interface Estado {
  version: number;
  cambio?: string;
  fuente?: { model: { nodes: { id: string }[] } };
  issues: unknown[];
  vistas: string[];
}

const abiertos: ServidorDev[] = [];
async function arrancar(env: ReturnType<typeof entorno>, extra: Partial<OpcionesDeDev> = {}): Promise<ServidorDev> {
  const servidor = await iniciarDev({ workspace: '/ws', leer: env.leer, observar: env.observar, escribir: env.escribirEdicion, borrar: env.borrar, ...extra, debounceMs: 5, puerto: 0 });
  abiertos.push(servidor);
  return servidor;
}
afterEach(async () => {
  await Promise.all(abiertos.splice(0).map((servidor) => servidor.cerrar()));
  for (const carpeta of carpetas.splice(0)) rmSync(carpeta, { recursive: true, force: true });
});

const estado = async (servidor: ServidorDev): Promise<Estado> => (await fetch(`${servidor.url}api/estado`)).json() as Promise<Estado>;
const JSON_ = { 'content-type': 'application/json' };
const post = (servidor: ServidorDev, ruta: string, cuerpo: unknown = {}, cabeceras: Record<string, string> = JSON_) =>
  fetch(`${servidor.url}${ruta}`, { method: 'POST', headers: cabeceras, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) });

/** Lee eventos SSE hasta que `basta` los acepte; devuelve los datos recibidos. */
async function eventos(servidor: ServidorDev, basta: (datos: Estado[]) => boolean, alAbrir?: () => void): Promise<Estado[]> {
  const respuesta = await fetch(`${servidor.url}eventos`);
  expect(respuesta.headers.get('content-type')).toContain('text/event-stream');
  const lector = respuesta.body!.getReader();
  const decodificador = new TextDecoder();
  const datos: Estado[] = [];
  let buffer = '';
  alAbrir?.();
  while (!basta(datos)) {
    const { value, done } = await lector.read();
    if (done) break;
    buffer += decodificador.decode(value);
    const bloques = buffer.split('\n\n');
    buffer = bloques.pop() ?? '';
    for (const bloque of bloques) {
      // El estado viaja como `event: estado`; otros eventos (actividad, diferencia, historial) no cuentan aqui.
      const lineas = bloque.split('\n');
      const linea = lineas.find((l) => l.startsWith('data: '));
      if (linea !== undefined && lineas.includes('event: estado')) datos.push(JSON.parse(linea.slice(6)) as Estado);
    }
  }
  await lector.cancel();
  return datos;
}

describe('dev: rutas', () => {
  it('escucha solo en 127.0.0.1 y sirve / y /_estudio/* del estudio inyectado, sin cache', async () => {
    const { estudio } = estudioFalso();
    const servidor = await arrancar(entorno({ 'main.dg': BASE }), { estudio });

    expect(servidor.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const pagina = await fetch(servidor.url);
    expect(pagina.headers.get('content-type')).toContain('text/html');
    expect(pagina.headers.get('cache-control')).toBe('no-store');
    expect(await pagina.text()).toBe('<!doctype html><title>falso</title>');
    const js = await fetch(`${servidor.url}_estudio/pagina.js`);
    expect([js.headers.get('content-type'), js.headers.get('cache-control'), await js.text()]).toEqual(['text/javascript; charset=utf-8', 'no-store', '/*pagina*/']);
    const css = await fetch(`${servidor.url}_estudio/estilo.css`);
    expect([css.headers.get('content-type'), await css.text()]).toEqual(['text/css; charset=utf-8', '/*estilo*/']);
    expect((await fetch(`${servidor.url}nada`)).status).toBe(404);
  });

  it('lee los estaticos del disco en cada peticion: un rebuild del estudio se ve al recargar', async () => {
    const { estudio, escribir } = estudioFalso();
    const servidor = await arrancar(entorno({ 'main.dg': BASE }), { estudio });
    expect(await (await fetch(`${servidor.url}_estudio/pagina.js`)).text()).toBe('/*pagina*/');

    escribir('pagina.js', '/*pagina nueva*/');
    escribir('index.html', '<p>nueva</p>');

    expect(await (await fetch(`${servidor.url}_estudio/pagina.js`)).text()).toBe('/*pagina nueva*/');
    expect(await (await fetch(servidor.url)).text()).toBe('<p>nueva</p>');
  });

  it('bajo /_estudio/ solo sirve los archivos declarados; uno que falta en disco es 404', async () => {
    const { estudio } = estudioFalso();
    const servidor = await arrancar(entorno({ 'main.dg': BASE }), { estudio });

    expect((await fetch(`${servidor.url}_estudio/index.html`)).status).toBe(404);
    expect((await fetch(`${servidor.url}_estudio/..%2F..%2Fetc%2Fpasswd`)).status).toBe(404);
    expect((await fetch(`${servidor.url}_estudio/ausente.js`)).status).toBe(404);
    expect((await fetch(`${servidor.url}app.js`)).status).toBe(404);
  });

  it('sirve el estado y la Geometria de una Vista; una Vista inexistente es 404', async () => {
    const servidor = await arrancar(entorno({ 'main.dg': BASE }));

    const inicial = await estado(servidor);
    expect(inicial).toMatchObject({ version: 0, vistas: ['general'], issues: [] });
    const vista = (await (await fetch(`${servidor.url}api/vista/general`)).json()) as { view: string; geometry: { nodes: Record<string, unknown> } };
    expect(vista.view).toBe('general');
    expect(Object.keys(vista.geometry.nodes).sort()).toEqual(['api', 'db']);
    expect((await fetch(`${servidor.url}api/vista/no-existe`)).status).toBe(404);
  });

  it('GET /api/inspect/<comando>/<argumento> da el JSON de inspect --json; lo que no existe es 404 con los ids cercanos', async () => {
    const servidor = await arrancar(entorno({ 'main.dg': BASE }));

    const nodo = await fetch(`${servidor.url}api/inspect/nodo/api`);
    expect(nodo.status).toBe(200);
    expect(await nodo.json()).toMatchObject({ comando: 'nodo', nodo: { id: 'api', title: 'API', file: 'main.dg' }, vistas: [{ id: 'general' }] });
    const buscar = (await (await fetch(`${servidor.url}api/inspect/buscar/base`)).json()) as { resultados: { id: string }[] };
    expect(buscar.resultados.map((r) => r.id)).toEqual(['db']);
    const tema = await fetch(`${servidor.url}api/inspect/tema/neutral?tipo=servicio`);
    expect(await tema.json()).toMatchObject({ comando: 'tema', tema: { name: 'neutral', tipo: 'servicio' } });

    const ausente = await fetch(`${servidor.url}api/inspect/nodo/apj`);
    expect(ausente.status).toBe(404);
    expect(await ausente.json()).toEqual({ ok: false, mensaje: "No existe el Nodo 'apj'. Quiza: api", cercanos: ['api'] });
    expect((await fetch(`${servidor.url}api/inspect/otro/x`)).status).toBe(404);
  });

  it('sin inyectar, sirve el build real de estudio', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await iniciarDev({ workspace: '/ws', leer: env.leer, observar: env.observar, puerto: 0 });
    abiertos.push(servidor);

    expect(await (await fetch(servidor.url)).text()).toContain('<script src="/_estudio/pagina.js">');
    expect(await (await fetch(`${servidor.url}_estudio/pagina.js`)).text()).toContain('EventSource');
    expect((await (await fetch(`${servidor.url}_estudio/worker.js`)).text()).length).toBeGreaterThan(1000);
  });

  it('--theme-path (opcion temas) aporta Temas antes del Workspace', async () => {
    const env = entorno({ 'main.dg': BASE });
    const temas = join(import.meta.dirname, 'fixtures', 'temas-extra');
    const servidor = await iniciarDev({ workspace: '/ws', temas, leer: (raiz) => (raiz === '/ws' ? env.leer() : leerReal(raiz)), observar: env.observar, puerto: 0 });
    abiertos.push(servidor);

    const fuente = (await estado(servidor)).fuente as unknown as { themes: { name: string }[] };
    expect(fuente.themes.map(({ name }) => name)).toContain('corporativo');
  });

  it('cerrar libera el puerto y deja de observar', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await arrancar(env);
    expect(env.observando()).toBe(true);

    await servidor.cerrar();

    expect(env.observando()).toBe(false);
    await expect(fetch(servidor.url)).rejects.toThrow();
  });
});

describe('dev: SSE', () => {
  it('envia el estado al conectar y el nuevo, con su cambio, tras un cambio en disco', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await arrancar(env);

    const recibidos = await eventos(
      servidor,
      (datos) => datos.length >= 2,
      () => env.escribir('main.dg', BASE.replace('api -> db', 'servicio cache "Cache"\n  api -> db')),
    );

    expect(recibidos[0]!.version).toBe(0);
    expect(recibidos[1]).toMatchObject({ version: 1, cambio: 'estructura' });
    expect(recibidos[1]!.fuente?.model.nodes.map((n) => n.id)).toContain('cache');
  });
});

describe('dev: seguridad', () => {
  it('rechaza peticiones cuyo Host no es 127.0.0.1 o localhost con el puerto del servidor (DNS rebinding)', async () => {
    const servidor = await arrancar(entorno({ 'main.dg': BASE }));
    const puerto = Number(new URL(servidor.url).port);
    const conHost = (host: string | undefined) =>
      new Promise<number>((ok, fallo) => {
        const req = request({ host: '127.0.0.1', port: puerto, path: '/api/estado', headers: host === undefined ? {} : { host } }, (res) => {
          res.resume();
          ok(res.statusCode ?? 0);
        });
        req.on('error', fallo);
        req.end();
      });

    expect(await conHost(`127.0.0.1:${puerto}`)).toBe(200);
    expect(await conHost(`localhost:${puerto}`)).toBe(200);
    expect(await conHost(`evil.example:${puerto}`)).toBe(403);
    expect(await conHost(`127.0.0.1.evil.example:${puerto}`)).toBe(403);
    expect(await conHost('127.0.0.1:1')).toBe(403);
    expect(await conHost('127.0.0.1')).toBe(403);
  });

  it('las rutas POST rechazan Origin ajeno (403), content-type ajeno (415), JSON invalido (400) y otros metodos (405)', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await arrancar(env);
    const cuerpo = { tipo: 'mover-pin', vista: 'general', nodo: 'api', x: 1, y: 2, version: 0 };

    for (const ruta of ['api/edit', 'api/deshacer', 'api/rehacer', 'api/confiar']) {
      expect((await post(servidor, ruta, cuerpo, { ...JSON_, origin: 'http://evil.example' })).status).toBe(403);
      expect((await post(servidor, ruta, cuerpo, { 'content-type': 'text/plain' })).status).toBe(415);
      const roto = await post(servidor, ruta, 'no es json');
      expect(roto.status).toBe(400);
      expect(await roto.json()).toEqual({ ok: false, mensaje: 'JSON invalido' });
      const get = await fetch(`${servidor.url}${ruta}`);
      expect(get.status).toBe(405);
      expect(get.headers.get('allow')).toBe('POST');
    }
    expect(env.texto('main.dg')).toBe(BASE);
  });
});

describe('dev: edicion, deshacer y rehacer (ADR 0005, ADR 0007)', () => {
  it('POST /api/edit aplica la Intencion con la version vista y responde la version nueva', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await arrancar(env);

    const res = await post(servidor, 'api/edit', { tipo: 'mover-pin', vista: 'general', nodo: 'api', x: 1, y: 2, version: 0 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: 1 });
    expect(env.texto('main.dg')).toContain('node api { pin 1,2 }');
    expect((await estado(servidor)).version).toBe(1);
  });

  it('POST /api/edit valida la Intencion con el esquema de canonico (400); /api/pin ya no existe', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await arrancar(env);

    for (const cuerpo of [{ tipo: 'mover-pin', vista: 'general', nodo: 'api', x: '10', y: 2 }, { tipo: 'otra', vista: 'general' }, { vista: 'general', nodo: 'api', x: 1, y: 2 }]) {
      const res = await post(servidor, 'api/edit', cuerpo);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, mensaje: 'Se esperaba una Intencion { tipo, ... }' });
    }
    expect((await post(servidor, 'api/pin', { vista: 'general', nodo: 'api', x: 10, y: 20, version: 0 })).status).toBe(404);
    expect(env.texto('main.dg')).toBe(BASE);
  });

  it('traduce los rechazos con la tabla unica: 409 texto desactualizado, 422 el resto', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await arrancar(env);
    env.escribirEdicion('/ws', 'main.dg', `${BASE}\n`);

    const viejo = await post(servidor, 'api/edit', { tipo: 'mover-pin', vista: 'general', nodo: 'api', x: 1, y: 2, version: 0 });
    expect(viejo.status).toBe(409);
    expect(await viejo.json()).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
    const olvidada = await post(servidor, 'api/edit', { tipo: 'mover-pin', vista: 'general', nodo: 'api', x: 1, y: 2, version: 99 });
    expect(olvidada.status).toBe(409);
    const vista = await post(servidor, 'api/edit', { tipo: 'mover-pin', vista: 'nada', nodo: 'api', x: 1, y: 2 });
    expect(vista.status).toBe(422);
    expect(await vista.json()).toMatchObject({ ok: false, motivo: 'vista-desconocida' });
    expect(env.texto('main.dg')).toBe(`${BASE}\n`);
  });

  it('no escribe archivos de --theme-path: 422 archivo-desconocido', async () => {
    const [modelo, vistas] = BASE.split('\nview general');
    const escritos: string[] = [];
    const servidor = await iniciarDev({
      workspace: '/ws',
      temas: '/temas',
      leer: (raiz): Record<string, string> => (raiz === '/temas' ? { 'vistas.dg': `view general${vistas as string}` } : { 'main.dg': modelo as string }),
      observar: () => () => undefined,
      escribir: (_raiz, ruta) => void escritos.push(ruta),
      puerto: 0,
    });
    abiertos.push(servidor);

    const res = await post(servidor, 'api/edit', { tipo: 'mover-pin', vista: 'general', nodo: 'api', x: 1, y: 2, version: 0 });

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, motivo: 'archivo-desconocido', file: 'vistas.dg' });
    expect(escritos).toEqual([]);
  });

  it('deshacer y rehacer: 200 con la version, 422 sin nada que hacer, 409 tras una edicion externa', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await arrancar(env);
    expect(await (await post(servidor, 'api/deshacer')).json()).toMatchObject({ ok: false, motivo: 'nada-que-deshacer' });
    const sinRehacer = await post(servidor, 'api/rehacer');
    expect(sinRehacer.status).toBe(422);
    expect(await sinRehacer.json()).toMatchObject({ ok: false, motivo: 'nada-que-rehacer' });

    await post(servidor, 'api/edit', { tipo: 'mover-pin', vista: 'general', nodo: 'api', x: 1, y: 2, version: 0 });
    const conPin = env.texto('main.dg');
    const deshecho = await post(servidor, 'api/deshacer');
    expect(deshecho.status).toBe(200);
    expect(await deshecho.json()).toEqual({ ok: true, version: 2 });
    expect(env.texto('main.dg')).toBe(BASE);
    expect((await post(servidor, 'api/rehacer')).status).toBe(200);
    expect(env.texto('main.dg')).toBe(conPin);

    env.escribirEdicion('/ws', 'main.dg', `${conPin!}\n// a mano\n`);
    const externo = await post(servidor, 'api/deshacer');
    expect(externo.status).toBe(409);
    expect(await externo.json()).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
  });

  it('un fallo de escritura responde 500 y no deja el texto a medias', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await arrancar(env, {
      escribir: () => {
        throw new Error('disco lleno');
      },
    });

    const res = await post(servidor, 'api/edit', { tipo: 'mover-pin', vista: 'general', nodo: 'api', x: 1, y: 2, version: 0 });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, mensaje: 'disco lleno' });
    expect(env.texto('main.dg')).toBe(BASE);
  });
});
