/**
 * End to end of `diagrams export` in Chromium (Playwright): this repo's example Workspace exported to one HTML file,
 * opened over http (a static server that only knows that file) and over `file://`. The page draws, navigates and
 * switches Theme with no request besides the document; without Web Workers the layout runs on the main thread.
 * Without Chromium it fails with the command that installs it (`rutaDeChromium`).
 */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';

import { run } from 'cli';

import { rutaDeChromium } from '../../../tests/ayudas/chromium';

const PLAZO_MS = 90_000;
const ESPERA = { timeout: 30_000 };
const EJEMPLO = join(import.meta.dirname, '..', '..', '..', 'examples', 'rinthel-arch');

let carpeta: string;
let archivo: string;
let servidor: Server;
let urlHttp: string;
let navegador: Browser;

beforeAll(async () => {
  carpeta = mkdtempSync(join(tmpdir(), 'e2e-export-'));
  archivo = join(carpeta, 'rinthel-arch.html');
  const exportado = await run(['export', '--workspace', EJEMPLO, '--out', archivo]);
  expect(exportado.exitCode, exportado.stdout + exportado.stderr).toBe(0);
  const html = readFileSync(archivo);
  servidor = createServer((req, res) => {
    if (req.url === '/rinthel-arch.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  urlHttp = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/rinthel-arch.html`;
  navegador = await chromium.launch({ executablePath: rutaDeChromium(), headless: true });
}, PLAZO_MS);

afterAll(async () => {
  await navegador?.close();
  await new Promise((ok) => (servidor === undefined ? ok(undefined) : servidor.close(ok)));
  if (carpeta !== undefined) rmSync(carpeta, { recursive: true, force: true });
});

/** Opens `url` and records every request other than the document itself and `data:`/`blob:` URLs, and page errors. */
async function abrir(url: string, { sinWorker = false } = {}): Promise<{ pagina: Page; ajenas: string[]; errores: string[] }> {
  const pagina = await navegador.newPage({ viewport: { width: 1600, height: 900 } });
  pagina.setDefaultTimeout(ESPERA.timeout);
  const ajenas: string[] = [];
  const errores: string[] = [];
  pagina.on('request', (r) => {
    const u = r.url();
    if (u !== url && !u.startsWith('data:') && !u.startsWith('blob:')) ajenas.push(u);
  });
  pagina.on('pageerror', (e) => errores.push(e.message));
  if (sinWorker) await pagina.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined }));
  await pagina.goto(`${url}#vista=packages`);
  return { pagina, ajenas, errores };
}

const listo = (pagina: Page, vista: string) => pagina.locator(`.rd-vista[data-vista="${vista}"][data-layout="listo"]`).waitFor(ESPERA);

async function recorrer(url: string, opciones: { sinWorker?: boolean } = {}): Promise<void> {
  const { pagina, ajenas, errores } = await abrir(url, opciones);
  try {
    await listo(pagina, 'packages');
    await pagina.getByText('Read-only').waitFor();
    expect(await pagina.getByRole('tab', { name: 'Code' }).count()).toBe(0);

    // Another View from the index.
    await pagina.getByRole('listbox', { name: 'Views' }).getByRole('option', { name: 'open', exact: true }).click();
    await listo(pagina, 'open');

    // Theme switching (a Theme with its own fonts): the canvas lays out again with it.
    await pagina.getByRole('tab', { name: 'Themes' }).click();
    await pagina.getByRole('listbox', { name: 'Themes' }).getByRole('option', { name: 'blueprint' }).click();
    await pagina.getByRole('region', { name: 'Theme blueprint' }).waitFor();
    await listo(pagina, 'open');
    // Its embedded font file loaded (not the fallback).
    await expect.poll(() => pagina.evaluate(() => [...document.fonts].some((f) => f.family.includes('JetBrains Mono') && f.status === 'loaded')), ESPERA).toBe(true);

    if (opciones.sinWorker !== true) expect(pagina.workers().length).toBeGreaterThan(0);
    expect(errores).toEqual([]);
    expect(ajenas).toEqual([]);
  } finally {
    await pagina.close();
  }
}

describe('e2e: an exported HTML in Chromium', () => {
  it('over http: draws, navigates and switches Theme with no other request', () => recorrer(urlHttp), PLAZO_MS);

  it('over file://: the same, with the layout Worker started from a Blob', () => recorrer(pathToFileURL(archivo).href), PLAZO_MS);

  it('without Web Workers the layout runs on the main thread', () => recorrer(pathToFileURL(archivo).href, { sinWorker: true }), PLAZO_MS);
});
