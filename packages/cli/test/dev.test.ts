import { afterEach, describe, expect, it } from 'vitest';

import { iniciarDev } from 'cli';
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
    observando: () => avisar !== undefined,
  };
}

const shell = async () => ({ pagina: '/*pagina*/', worker: '/*worker*/' });

interface Estado {
  version: number;
  fuente?: { model: { nodes: { id: string }[] } };
  issues: { file: string; line: number; severity: string; code: string; href: string }[];
  vistas: string[];
}

const abiertos: ServidorDev[] = [];
async function arrancar(env: ReturnType<typeof entorno>): Promise<ServidorDev> {
  const servidor = await iniciarDev({ workspace: '/ws', leer: env.leer, observar: env.observar, shell, debounceMs: 5, puerto: 0 });
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

  it('cerrar libera el puerto y deja de observar', async () => {
    const env = entorno({ 'main.dg': BASE });
    const servidor = await arrancar(env);
    expect(env.observando()).toBe(true);

    await servidor.cerrar();

    expect(env.observando()).toBe(false);
    await expect(fetch(servidor.url)).rejects.toThrow();
  });
});
