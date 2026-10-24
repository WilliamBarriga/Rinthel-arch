import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { iniciarDev } from 'cli';
import type { ServidorDev } from 'cli';

const modelo = (fonts: string) => `specification { node servicio }
model { servicio api "API" }
theme t {
  palette { papel "#fefce8" }
  ${fonts}
  node { layer relleno solid { color papel }  slots { title } }
}
view general { type architecture  include **  theme t }
`;

const BYTES = Buffer.from('wOF2-falso-pero-binario\u0000\u0001', 'latin1');
let raiz: string;
let fuera: string;
let servidor: ServidorDev | undefined;

beforeEach(() => {
  fuera = mkdtempSync(join(tmpdir(), 'rinthel-fuera-'));
  raiz = join(fuera, 'workspace');
  mkdirSync(join(raiz, 'fuentes'), { recursive: true });
  writeFileSync(join(raiz, 'main.dg'), modelo('fonts { body "Caveat"  mono "Caveat"  fallback "cursive" }'));
  writeFileSync(join(raiz, 'fuentes', 'caveat-latin-400-normal.woff2'), BYTES);
  writeFileSync(join(raiz, 'fuentes', 'Con Espacios.woff2'), BYTES);
  writeFileSync(join(fuera, 'secreto.woff2'), 'no debe salir');
  symlinkSync(join(fuera, 'secreto.woff2'), join(raiz, 'fuentes', 'enlace.woff2'));
});

afterEach(async () => {
  await servidor?.cerrar();
  servidor = undefined;
  rmSync(fuera, { recursive: true, force: true });
});

async function arrancar(): Promise<ServidorDev> {
  servidor = await iniciarDev({ workspace: raiz, shell: async () => ({ pagina: '', worker: '' }), observar: () => () => undefined, puerto: 0 });
  return servidor;
}

/** GET con la ruta tal cual (sin que el cliente la normalice, como haria un atacante). */
function pedir(url: string, rutaCruda: string): Promise<{ estado: number; cuerpo: Buffer; tipo: string | undefined }> {
  const { hostname, port } = new URL(url);
  return new Promise((ok, fallo) => {
    const req = request({ host: hostname, port, path: rutaCruda, method: 'GET' }, (res) => {
      const trozos: Buffer[] = [];
      res.on('data', (t: Buffer) => trozos.push(t));
      res.on('end', () => ok({ estado: res.statusCode!, cuerpo: Buffer.concat(trozos), tipo: res.headers['content-type'] }));
    });
    req.on('error', fallo);
    req.end();
  });
}

describe('dev: ruta de fuentes del Workspace', () => {
  it('sirve el archivo de fuente del Workspace con su tipo, byte a byte', async () => {
    const { url } = await arrancar();

    const r = await pedir(url, '/fuentes/fuentes/caveat-latin-400-normal.woff2');

    expect(r.estado).toBe(200);
    expect(r.tipo).toBe('font/woff2');
    expect(r.cuerpo.equals(BYTES)).toBe(true);
  });

  it('entiende rutas con espacios codificados', async () => {
    const { url } = await arrancar();

    expect((await pedir(url, '/fuentes/fuentes/Con%20Espacios.woff2')).estado).toBe(200);
  });

  it.each([
    ['..', '/fuentes/../secreto.woff2'],
    ['../ codificado', '/fuentes/..%2Fsecreto.woff2'],
    ['%2e%2e', '/fuentes/%2e%2e/secreto.woff2'],
    ['varios niveles', '/fuentes/fuentes/..%2F..%2Fsecreto.woff2'],
    ['absoluta', () => `/fuentes/${encodeURIComponent(join(fuera, 'secreto.woff2'))}`],
    ['absoluta con barra', () => `/fuentes//${join(fuera, 'secreto.woff2')}`],
  ])('no sirve nada fuera del Workspace (%s)', async (_nombre, ruta) => {
    const { url } = await arrancar();

    const r = await pedir(url, typeof ruta === 'function' ? ruta() : ruta);

    expect(r.estado).toBe(404);
    expect(r.cuerpo.toString()).not.toContain('no debe salir');
  });

  it('no sirve un enlace simbolico que apunta fuera del Workspace', async () => {
    const { url } = await arrancar();

    const r = await pedir(url, '/fuentes/fuentes/enlace.woff2');

    expect(r.estado).toBe(404);
    expect(r.cuerpo.toString()).not.toContain('no debe salir');
  });

  it('solo sirve fuentes: el DSL del propio Workspace y lo inexistente dan 404', async () => {
    const { url } = await arrancar();

    expect((await pedir(url, '/fuentes/main.dg')).estado).toBe(404);
    expect((await pedir(url, '/fuentes/fuentes/no-existe.woff2')).estado).toBe(404);
    expect((await pedir(url, '/fuentes/%E0%A4%A.woff2')).estado).toBe(404);
  });

  it('el estado lista las fuentes del Workspace con su hash', async () => {
    const { url } = await arrancar();

    const estado = (await (await fetch(`${url}api/estado`)).json()) as { fuentes: Record<string, string>; issues: { code: string }[] };

    expect(Object.keys(estado.fuentes).sort()).toEqual(['fuentes/Con Espacios.woff2', 'fuentes/caveat-latin-400-normal.woff2', 'fuentes/enlace.woff2'].sort());
    expect(estado.issues.map((i) => i.code)).not.toContain('E_THEME_FONT_MISSING');
  });

  it('una fuente declarada sin archivo es un error en el estado, con posicion', async () => {
    writeFileSync(join(raiz, 'main.dg'), modelo('fonts { body "Press Start 2P"  mono "monospace"  fallback "monospace" }'));
    const { url } = await arrancar();

    const estado = (await (await fetch(`${url}api/estado`)).json()) as { issues: { code: string; file: string; line: number }[] };

    expect(estado.issues).toContainEqual(expect.objectContaining({ code: 'E_THEME_FONT_MISSING', file: 'main.dg', line: 3 }));
  });
});
