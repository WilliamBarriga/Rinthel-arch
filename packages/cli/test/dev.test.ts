/**
 * Lo propio del adaptador HTTP de `dev`: estaticos, seguridad del transporte (Host, Origin, content-type, tamano), disco y
 * cierre. Las rutas `/api/*`, sus bordes y los eventos SSE los cubre `probarContratoDeDev` (`contrato-dev.test.ts`).
 */
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { eventoDeActividad, eventosSobreFetch, lineasDeActividad } from 'estudio/contrato';
import type { ActividadDeDev } from 'estudio/protocolo';

import { iniciarDev } from 'cli';
import type { OpcionesDeDev, ServidorDev } from 'cli';
import { puertoEnMemoria } from 'sesion';
import type { PuertoDelWorkspaceVivo } from 'sesion';

import { puertoDeDisco } from '../src/dev';

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

/** Workspace en memoria con un observador que se puede consultar. */
function entorno(inicial: Record<string, string>) {
  const base = puertoEnMemoria({ propios: inicial });
  let observadores = 0;
  const puerto: PuertoDelWorkspaceVivo = {
    ...base,
    observar(alCambiar) {
      observadores += 1;
      const dejar = base.observar(alCambiar);
      return () => {
        observadores -= 1;
        dejar();
      };
    },
  };
  return { puerto, observando: () => observadores > 0 };
}

/** El disco real sin `fs.watch`: las pruebas no dependen del watcher del sistema. */
const disco = (raiz: string) => puertoDeDisco(raiz, { observar: () => () => undefined });

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

/** Workspace real en una carpeta temporal, con `main.dg` = `BASE`. */
function workspaceEnDisco(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'rinthel-dev-'));
  carpetas.push(raiz);
  writeFileSync(join(raiz, 'main.dg'), BASE);
  return raiz;
}

const sinCodigo: OpcionesDeDev['compilarCodigo'] = () => ({ componentes: {}, issues: [], bundle: 'return {};' });

const respuesta = async (res: Response) => ({ status: res.status, cuerpo: (await res.json()) as unknown });

const abiertos: ServidorDev[] = [];
async function arrancar(env: ReturnType<typeof entorno>, extra: Partial<OpcionesDeDev> = {}): Promise<ServidorDev> {
  const servidor = await iniciarDev({ workspace: '/ws', puerto: env.puerto, ...extra, debounceMs: 5, puertoHttp: 0 });
  abiertos.push(servidor);
  return servidor;
}
afterEach(async () => {
  await Promise.all(abiertos.splice(0).map((servidor) => servidor.cerrar()));
  for (const carpeta of carpetas.splice(0)) rmSync(carpeta, { recursive: true, force: true });
});

const JSON_ = { 'content-type': 'application/json' };
const post = (servidor: ServidorDev, ruta: string, cuerpo: unknown = {}, cabeceras: Record<string, string> = JSON_) =>
  fetch(`${servidor.url}${ruta}`, { method: 'POST', headers: cabeceras, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) });

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

  it('sin inyectar, sirve el build real de estudio', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await iniciarDev({ workspace: '/ws', puerto: env.puerto, puertoHttp: 0 });
    abiertos.push(servidor);

    expect(await (await fetch(servidor.url)).text()).toContain('<script type="module" src="/_estudio/pagina.js">');
    const pagina = await (await fetch(`${servidor.url}_estudio/pagina.js`)).text();
    const trozo = /"\.\/(trozos\/[^"]+\.js)"/.exec(pagina)?.[1];
    expect(trozo).toBeDefined();
    const servido = await fetch(`${servidor.url}_estudio/${trozo}`);
    expect([servido.status, servido.headers.get('content-type')]).toEqual([200, 'text/javascript; charset=utf-8']);
    expect((await (await fetch(`${servidor.url}_estudio/worker.js`)).text()).length).toBeGreaterThan(1000);
  });

  it('--theme-path (opcion temas) aporta Temas antes del Workspace', async () => {
    const temas = join(import.meta.dirname, 'fixtures', 'temas-extra');
    const servidor = await iniciarDev({ workspace: workspaceEnDisco(), temas, compilarCodigo: sinCodigo, puertoHttp: 0 });
    abiertos.push(servidor);

    const fuente = ((await (await fetch(`${servidor.url}api/estado`)).json()) as { fuente: { themes: { name: string }[] } }).fuente;
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

  it('todo POST exige Origin propio (403) y JSON (415), y limita el cuerpo (413), antes de llegar a la API', async () => {
    const raiz = workspaceEnDisco();
    const servidor = await iniciarDev({ workspace: raiz, puerto: disco(raiz), compilarCodigo: sinCodigo, puertoHttp: 0 });
    abiertos.push(servidor);
    const cuerpo = { type: 'move-pin', view: 'general', node: 'api', x: 1, y: 2 };

    for (const ruta of ['api/edit', 'api/deshacer', 'api/rehacer', 'api/historial/saltar', 'api/confiar', 'api/nada']) {
      expect(await respuesta(await post(servidor, ruta, cuerpo, { ...JSON_, origin: 'http://evil.example' }))).toEqual({ status: 403, cuerpo: { ok: false, message: 'Origin not allowed' } });
      expect(await respuesta(await post(servidor, ruta, cuerpo, { 'content-type': 'text/plain' }))).toEqual({ status: 415, cuerpo: { ok: false, message: 'Expected application/json' } });
    }
    expect(await respuesta(await post(servidor, 'api/edit', { ...cuerpo, relleno: 'x'.repeat(70 * 1024) }))).toEqual({ status: 413, cuerpo: { ok: false, message: 'Request body too large' } });
    expect((await post(servidor, 'api/edit', cuerpo, { ...JSON_, origin: servidor.url.replace(/\/$/, '') })).status).toBe(200);
    expect(readFileSync(join(raiz, 'main.dg'), 'utf8')).toContain('node api { pin 1,2 }');
  });
});

describe('dev: disco y Registro de actividad', () => {
  it('POST /api/edit escribe en el disco del Workspace y deshacer lo restaura', async () => {
    const raiz = workspaceEnDisco();
    const servidor = await iniciarDev({ workspace: raiz, puerto: disco(raiz), compilarCodigo: sinCodigo, puertoHttp: 0 });
    abiertos.push(servidor);

    expect((await post(servidor, 'api/edit', { type: 'move-pin', view: 'general', node: 'api', x: 1, y: 2 })).status).toBe(200);
    expect(readFileSync(join(raiz, 'main.dg'), 'utf8')).toContain('node api { pin 1,2 }');
    expect((await post(servidor, 'api/deshacer')).status).toBe(200);
    expect(readFileSync(join(raiz, 'main.dg'), 'utf8')).toBe(BASE);
  });

  it('observa .diagrams/activity.jsonl aparte del Workspace: reproduce lo previo al conectar y empuja lo anexado', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'rinthel-dev-actividad-'));
    carpetas.push(raiz);
    writeFileSync(join(raiz, 'main.dg'), BASE);
    mkdirSync(join(raiz, '.diagrams'));
    writeFileSync(join(raiz, '.diagrams', 'activity.jsonl'), lineasDeActividad(eventoDeActividad(1)));
    const servidor = await iniciarDev({ workspace: raiz, puerto: disco(raiz), compilarCodigo: sinCodigo, puertoHttp: 0 });
    abiertos.push(servidor);
    const fetchDelServidor: typeof fetch = (ruta, init) => fetch(new URL(String(ruta).replace(/^\//, ''), servidor.url), init);

    const recibidos = await new Promise<ActividadDeDev[]>((ok) => {
      const lista: ActividadDeDev[] = [];
      const cerrar = eventosSobreFetch(fetchDelServidor)('/eventos', (nombre, datos) => {
        if (nombre !== 'actividad') return;
        lista.push(JSON.parse(datos) as ActividadDeDev);
        if (lista.length === 1) appendFileSync(join(raiz, '.diagrams', 'activity.jsonl'), lineasDeActividad(eventoDeActividad(2)));
        else {
          cerrar();
          ok(lista);
        }
      });
    });

    expect(recibidos.map((a) => [a.previos, a.eventos.map((e) => e.pid)])).toEqual([
      [true, [1]],
      [false, [2]],
    ]);
  });
});
