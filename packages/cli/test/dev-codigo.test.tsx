import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { iniciarDev } from 'cli';
import type { ServidorDev } from 'cli';

import { cargarComponentes, crearCargadorDeCodigo } from '../navegador/componentes';
import { comandoDev } from '../src/dev';

const FIXTURE = resolve(__dirname, 'fixtures/tema-codigo');
const shell = async () => ({ pagina: '', worker: '' });

const carpetas: string[] = [];
const abiertos: ServidorDev[] = [];
afterEach(async () => {
  await Promise.all(abiertos.splice(0).map((s) => s.cerrar()));
  for (const carpeta of carpetas.splice(0)) rmSync(carpeta, { recursive: true, force: true });
});

function copia(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'rinthel-dev-codigo-'));
  carpetas.push(raiz);
  cpSync(FIXTURE, raiz, { recursive: true });
  return raiz;
}

/** Observador manual: el test avisa de los cambios del disco cuando los termina de escribir. */
function observador() {
  let avisar: (() => void) | undefined;
  return { observar: (_raiz: string, alCambiar: () => void) => ((avisar = alCambiar), () => (avisar = undefined)), cambiar: () => avisar?.() };
}

async function arrancar(raiz: string, extra: { confiarEnCodigo?: boolean } = {}) {
  const obs = observador();
  const servidor = await iniciarDev({ workspace: raiz, observar: obs.observar, shell, debounceMs: 5, puerto: 0, ...extra });
  abiertos.push(servidor);
  return { servidor, cambiar: obs.cambiar };
}

interface Estado {
  version: number;
  cambio?: string;
  fuente?: unknown;
  issues: Array<{ code: string; file: string; line: number }>;
}
const estado = async (s: ServidorDev): Promise<Estado> => (await fetch(`${s.url}api/estado`)).json() as Promise<Estado>;
const codigo = async (s: ServidorDev) => (await fetch(`${s.url}api/codigo`)).json() as Promise<{ temaConCodigo: boolean; componentes: string[]; confiado: boolean }>;
const confiar = (s: ServidorDev) => fetch(`${s.url}api/confiar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
const bundle = async (s: ServidorDev) => fetch(`${s.url}componentes.js`);
const dibujarAurora = (texto: string) => renderToStaticMarkup(createElement(cargarComponentes(texto)['Aurora']!, { id: 'api', parametros: { hue: 3 } } as never));

async function esperarEstado(servidor: ServidorDev, version: number): Promise<Estado> {
  for (let i = 0; i < 200; i++) {
    const actual = await estado(servidor);
    if (actual.version >= version) return actual;
    await new Promise((ok) => setTimeout(ok, 10));
  }
  throw new Error('el estado no llego');
}

describe('dev: Temas con codigo', () => {
  it('avisa del codigo y no lo sirve hasta la confirmacion explicita', async () => {
    const { servidor } = await arrancar(copia());

    expect(servidor.conCodigo).toEqual(['Aurora']);
    expect(await codigo(servidor)).toEqual({ temaConCodigo: true, componentes: ['Aurora'], confiado: false });
    expect((await bundle(servidor)).status).toBe(403);

    expect((await confiar(servidor)).status).toBe(200);
    expect((await codigo(servidor)).confiado).toBe(true);
    const respuesta = await bundle(servidor);
    expect(respuesta.status).toBe(200);
    expect(dibujarAurora(await respuesta.text())).toBe('<i data-aurora="api" data-hue="3"></i>');
  });

  it('confirmar exige JSON y origen del propio servidor', async () => {
    const { servidor } = await arrancar(copia());

    const ajeno = await fetch(`${servidor.url}api/confiar`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: '{}' });
    const sinJson = await fetch(`${servidor.url}api/confiar`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });

    expect([ajeno.status, sinJson.status]).toEqual([403, 415]);
    expect((await codigo(servidor)).confiado).toBe(false);
  });

  it('con confianza previa el codigo se sirve desde el principio; un Workspace sin codigo no tiene nada que confirmar', async () => {
    const confiado = await arrancar(copia(), { confiarEnCodigo: true });
    expect((await bundle(confiado.servidor)).status).toBe(200);

    const raiz = copia();
    rmSync(join(raiz, 'componentes'), { recursive: true });
    writeFileSync(join(raiz, 'main.dg'), 'specification { node servicio }\nmodel { servicio api }\nview v { type architecture include ** }\n');
    const sin = await arrancar(raiz);
    expect(sin.servidor.conCodigo).toEqual([]);
    expect(await codigo(sin.servidor)).toEqual({ temaConCodigo: false, componentes: [], confiado: false });
  });

  it('un cambio en el .tsx se empuja como codigo y se vuelve a registrar', async () => {
    const raiz = copia();
    const { servidor, cambiar } = await arrancar(raiz, { confiarEnCodigo: true });
    const antes = await estado(servidor);

    writeFileSync(join(raiz, 'componentes', 'aurora.tsx'), 'export function Aurora({ id }: { id: string }) { return <b data-v2={id} />; }\n');
    cambiar();
    const despues = await esperarEstado(servidor, antes.version + 1);

    expect(despues.cambio).toBe('codigo');
    expect(renderToStaticMarkup(createElement(cargarComponentes(await (await bundle(servidor)).text())['Aurora']!, { id: 'api' } as never))).toBe('<b data-v2="api"></b>');
  });

  it('un .tsx que no compila sale como issue con file y line y dev conserva el ultimo dibujo bueno', async () => {
    const raiz = copia();
    const { servidor, cambiar } = await arrancar(raiz, { confiarEnCodigo: true });
    const antes = await estado(servidor);

    writeFileSync(join(raiz, 'componentes', 'aurora.tsx'), 'export function Aurora() {\n  const x = ;\n  return x;\n}\n');
    cambiar();
    const roto = await esperarEstado(servidor, antes.version + 1);

    expect(roto.issues).toContainEqual(expect.objectContaining({ code: 'E_THEME_CODE_COMPILE', file: 'componentes/aurora.tsx', line: 2 }));
    expect(roto.fuente).toEqual(antes.fuente);
    expect(dibujarAurora(await (await bundle(servidor)).text())).toBe('<i data-aurora="api" data-hue="3"></i>');
  });

  it('el cargador del navegador pide confirmacion una vez, registra los componentes y no insiste si se rechazo', async () => {
    const { servidor } = await arrancar(copia());
    const base = servidor.url.replace(/\/$/, '');

    let preguntas = 0;
    const rechaza = crearCargadorDeCodigo({ fetch, base, confirmar: () => (preguntas++, false) });
    expect(await rechaza()).toBeUndefined();
    expect(await rechaza()).toBeUndefined();
    expect(preguntas).toBe(1);
    expect((await codigo(servidor)).confiado).toBe(false);

    const acepta = crearCargadorDeCodigo({ fetch, base, confirmar: () => true });
    const registro = await acepta();
    expect(Object.keys(registro ?? {})).toEqual(['Aurora']);
    expect((await codigo(servidor)).confiado).toBe(true);
  });

  it('el comando avisa del codigo y pide confirmacion; --trust-code la da de antemano', async () => {
    const dependencias = { shell, observar: () => () => undefined };
    const sin = await comandoDev(['--workspace', copia(), '--port', '0'], dependencias);
    expect(sin.exitCode).toBe(0);
    expect(sin.stdout).toContain('Aurora');
    expect(sin.stdout).toContain('confirmacion');

    const con = await comandoDev(['--workspace', copia(), '--port', '0', '--trust-code'], dependencias);
    expect(con.exitCode).toBe(0);
    expect(con.stdout).not.toContain('confirmacion');
  });
});
