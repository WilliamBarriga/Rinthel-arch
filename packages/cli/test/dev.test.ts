import { request } from 'node:http';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { iniciarDev } from 'cli';
import { leerWorkspace as leerReal } from '../src/workspace';
import type { ServidorDev } from 'cli';

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
    escribir(ruta: string, texto: string) {
      archivos = { ...archivos, [ruta]: texto };
      avisar?.();
    },
    /** Escritura del endpoint de edicion: no avisa al observador (lo hace el propio servidor). */
    escribirEdicion: (_raiz: string, ruta: string, texto: string) => {
      archivos = { ...archivos, [ruta]: texto };
    },
    texto: (ruta: string) => archivos[ruta],
    observando: () => avisar !== undefined,
  };
}

const shell = async () => ({ pagina: '/*pagina*/', worker: '/*worker*/' });

interface Estado {
  version: number;
  fuente?: { model: { nodes: { id: string }[] } };
  issues: { file: string; line: number; severity: string; code: string; href: string }[];
  vistas: string[];
  hashes: Record<string, string>;
  archivosDeVista: Record<string, string>;
}

const abiertos: ServidorDev[] = [];
async function arrancar(env: ReturnType<typeof entorno>): Promise<ServidorDev> {
  const servidor = await iniciarDev({ workspace: '/ws', leer: env.leer, observar: env.observar, escribir: env.escribirEdicion, shell, debounceMs: 5, puerto: 0 });
  abiertos.push(servidor);
  return servidor;
}
afterEach(async () => {
  await Promise.all(abiertos.splice(0).map((servidor) => servidor.cerrar()));
});

const estado = async (servidor: ServidorDev): Promise<Estado> => (await fetch(`${servidor.url}api/estado`)).json() as Promise<Estado>;

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
      const linea = bloque.split('\n').find((l) => l.startsWith('data: '));
      if (linea !== undefined) datos.push(JSON.parse(linea.slice(6)) as Estado);
    }
  }
  await lector.cancel();
  return datos;
}

describe('dev', () => {
  it('escucha solo en 127.0.0.1 y sirve el shell', async () => {
    const servidor = await arrancar(entorno({ 'main.dg': BASE }));

    expect(servidor.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const pagina = await fetch(servidor.url);
    expect(pagina.headers.get('content-type')).toContain('text/html');
    expect(await pagina.text()).toContain('<script src="/app.js">');
    expect(await (await fetch(`${servidor.url}app.js`)).text()).toBe('/*pagina*/');
    expect(await (await fetch(`${servidor.url}worker.js`)).text()).toBe('/*worker*/');
  });

  it('expone el estado inicial y la geometria de cada Vista', async () => {
    const servidor = await arrancar(entorno({ 'main.dg': BASE }));

    const inicial = await estado(servidor);
    expect(inicial.vistas).toEqual(['general']);
    expect(inicial.fuente?.model.nodes.map((n) => n.id)).toEqual(['api', 'db']);
    expect(inicial.issues).toEqual([]);
    const vista = (await (await fetch(`${servidor.url}api/vista/general`)).json()) as { view: string; geometry: { nodes: Record<string, unknown> } };
    expect(vista.view).toBe('general');
    expect(Object.keys(vista.geometry.nodes).sort()).toEqual(['api', 'db']);
    expect((await fetch(`${servidor.url}api/vista/no-existe`)).status).toBe(404);
  });

  it('editar un .dg empuja el estado nuevo por SSE', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await arrancar(env);

    const recibidos = await eventos(
      servidor,
      (datos) => datos.some((d) => d.fuente?.model.nodes.some((n) => n.id === 'cache')),
      () => env.escribir('main.dg', BASE.replace('api -> db', 'servicio cache "Cache"\n  api -> db')),
    );

    const ultimo = recibidos.at(-1)!;
    expect(ultimo.fuente?.model.nodes.map((n) => n.id)).toContain('cache');
    expect(ultimo.version).toBeGreaterThan(0);
    const vista = (await (await fetch(`${servidor.url}api/vista/general`)).json()) as { geometry: { nodes: Record<string, unknown> } };
    expect(Object.keys(vista.geometry.nodes)).toContain('cache');
  });

  it('un error de sintaxis o validacion sale como issue con archivo:linea y conserva la Vista previa', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await arrancar(env);

    const recibidos = await eventos(
      servidor,
      (datos) => datos.some((d) => d.issues.length > 0),
      () => env.escribir('main.dg', BASE.replace('servicio api', 'servico api')),
    );

    const roto = recibidos.find((d) => d.issues.length > 0)!;
    expect(roto.issues[0]).toMatchObject({ file: 'main.dg', line: 6, severity: 'error' });
    expect(roto.issues[0]!.href).toContain('main.dg:6');
    expect(roto.fuente?.model.nodes.map((n) => n.id)).toEqual(['api', 'db']);
    const vista = await fetch(`${servidor.url}api/vista/general`);
    expect(vista.status).toBe(200);
    expect(Object.keys(((await vista.json()) as { geometry: { nodes: object } }).geometry.nodes).sort()).toEqual(['api', 'db']);

    // Al corregirlo, los issues desaparecen.
    const despues = await eventos(
      servidor,
      (datos) => datos.some((d) => d.issues.length === 0),
      () => env.escribir('main.dg', BASE),
    );
    expect(despues.at(-1)!.issues).toEqual([]);
  });

  it('agrupa varias escrituras seguidas en una sola recompilacion (debounce)', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await arrancar(env);
    const antes = (await estado(servidor)).version;

    for (let i = 0; i < 5; i++) env.escribir('main.dg', `${BASE}\n// ${i}\n`);
    await new Promise((ok) => setTimeout(ok, 300));

    expect((await estado(servidor)).version).toBe(antes + 1);
  });

  it('el shell real (sin fake) se empaqueta y se sirve', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await iniciarDev({ workspace: '/ws', leer: env.leer, observar: env.observar, puerto: 0 });
    abiertos.push(servidor);

    const app = await (await fetch(`${servidor.url}app.js`)).text();
    expect(app).toContain('EventSource');
    expect((await (await fetch(`${servidor.url}worker.js`)).text()).length).toBeGreaterThan(1000);
  }, 30000);

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

  it('--theme-path (opcion temas) aporta Temas antes del Workspace', async () => {
    const env = entorno({ 'main.dg': BASE });
    const temas = join(import.meta.dirname, 'fixtures', 'temas-extra');
    const servidor = await iniciarDev({ workspace: '/ws', temas, leer: (raiz) => (raiz === '/ws' ? env.leer() : leerReal(raiz)), observar: env.observar, shell, puerto: 0 });
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

  describe('POST /api/pin (ADR 0005)', () => {
    const post = (servidor: ServidorDev, cuerpo: unknown, cabeceras: Record<string, string> = { 'content-type': 'application/json' }) =>
      fetch(`${servidor.url}api/pin`, { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo) });

    it('el estado expone el hash de cada archivo', async () => {
      const servidor = await arrancar(entorno({ 'main.dg': BASE }));
      expect(Object.keys((await estado(servidor)).hashes)).toEqual(['main.dg']);
    });

    it('el estado dice en que archivo esta cada Vista, para elegir el hash', async () => {
      const servidor = await arrancar(entorno({ 'main.dg': BASE }));
      const { archivosDeVista, hashes } = await estado(servidor);
      expect(archivosDeVista).toEqual({ general: 'main.dg' });
      expect(hashes[archivosDeVista['general']!]).toBeDefined();
    });

    it('escribe el Pin en el .dg, recompila y responde con la version nueva', async () => {
      const env = entorno({ 'main.dg': BASE });
      const servidor = await arrancar(env);
      const antes = await estado(servidor);

      const res = await post(servidor, { vista: 'general', nodo: 'api', x: 10, y: 20, hash: antes.hashes['main.dg'] });

      expect(res.status).toBe(200);
      const cuerpo = (await res.json()) as { ok: boolean; version: number };
      expect(cuerpo.ok).toBe(true);
      expect(env.texto('main.dg')).toContain('node api { pin 10,20 }');
      const despues = await estado(servidor);
      expect(cuerpo.version).toBe(despues.version);
      expect(despues.version).toBeGreaterThan(antes.version);
      expect(despues.hashes['main.dg']).not.toBe(antes.hashes['main.dg']);
    });

    it('con hash desactualizado responde 409 y no escribe', async () => {
      const env = entorno({ 'main.dg': BASE });
      const servidor = await arrancar(env);
      const hash = (await estado(servidor)).hashes['main.dg'];
      env.escribir('main.dg', BASE + '\n');

      const res = await post(servidor, { vista: 'general', nodo: 'api', x: 1, y: 2, hash });

      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
      expect(env.texto('main.dg')).toBe(BASE + '\n');
    });

    it('con Vista o Nodo inexistente responde 422 y no escribe', async () => {
      const env = entorno({ 'main.dg': BASE });
      const servidor = await arrancar(env);
      const hash = (await estado(servidor)).hashes['main.dg'];

      const vista = await post(servidor, { vista: 'nada', nodo: 'api', x: 1, y: 2, hash });
      const nodo = await post(servidor, { vista: 'general', nodo: 'fantasma', x: 1, y: 2, hash });

      expect(vista.status).toBe(422);
      expect(await vista.json()).toMatchObject({ ok: false, motivo: 'vista-desconocida' });
      expect(nodo.status).toBe(422);
      expect(env.texto('main.dg')).toBe(BASE);
    });

    it('rechaza cuerpos mal formados (400), content-type ajeno (415) y metodos distintos de POST (405)', async () => {
      const env = entorno({ 'main.dg': BASE });
      const servidor = await arrancar(env);

      expect((await post(servidor, { vista: 'general', nodo: 'api', x: 'a', y: 2, hash: 'h' })).status).toBe(400);
      expect((await post(servidor, { vista: 'general' })).status).toBe(400);
      expect((await post(servidor, { vista: 'general', nodo: 'api', x: 1, y: 2, hash: 'h' }, { 'content-type': 'text/plain' })).status).toBe(415);
      expect((await fetch(`${servidor.url}api/pin`)).status).toBe(405);
      expect(env.texto('main.dg')).toBe(BASE);
    });

    it('no escribe archivos que no son del Workspace (los de --theme-path): responde 422', async () => {
      const [modelo, vistas] = BASE.split('\nview general');
      const propios = { 'main.dg': modelo as string };
      const deTemas = { 'vistas.dg': `view general${vistas as string}` };
      const escritos: string[] = [];
      const servidor = await iniciarDev({
        workspace: '/ws',
        temas: '/temas',
        leer: (raiz) => (raiz === '/temas' ? deTemas : propios),
        observar: () => () => undefined,
        escribir: (_raiz, ruta) => void escritos.push(ruta),
        shell,
        puerto: 0,
      });
      abiertos.push(servidor);
      const { hashes } = await estado(servidor);

      const res = await post(servidor, { vista: 'general', nodo: 'api', x: 1, y: 2, hash: hashes['vistas.dg'] });

      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ ok: false, motivo: 'archivo-desconocido', file: 'vistas.dg' });
      expect(escritos).toEqual([]);
    });

    it('redondea las coordenadas del Pin a enteros', async () => {
      const env = entorno({ 'main.dg': BASE });
      const servidor = await arrancar(env);
      const hash = (await estado(servidor)).hashes['main.dg'];

      const res = await post(servidor, { vista: 'general', nodo: 'api', x: 10.6, y: 20.2, hash });

      expect(res.status).toBe(200);
      expect(env.texto('main.dg')).toContain('node api { pin 11,20 }');
    });

    it('rechaza peticiones con Origin ajeno (CSRF desde otra pagina)', async () => {
      const env = entorno({ 'main.dg': BASE });
      const servidor = await arrancar(env);
      const hash = (await estado(servidor)).hashes['main.dg'];

      const res = await post(servidor, { vista: 'general', nodo: 'api', x: 1, y: 2, hash }, { 'content-type': 'application/json', origin: 'http://evil.example' });

      expect(res.status).toBe(403);
      expect(env.texto('main.dg')).toBe(BASE);
    });
  });
});
