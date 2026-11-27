/**
 * End to end of `diagrams export` in Chromium (Playwright): this repo's example Workspace exported to one HTML file,
 * opened over http (a static server that only knows that file) and over `file://`. The page draws, navigates and
 * switches Theme with no request besides the document; without Web Workers the layout runs on the main thread.
 * Without Chromium it fails with the command that installs it (`chromiumPath`).
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

import { chromiumPath } from '../../../tests/helpers/chromium';

const DEADLINE_MS = 90_000;
const WAIT = { timeout: 30_000 };
const EXAMPLE = join(import.meta.dirname, '..', '..', '..', 'examples', 'rinthel-arch');

let folder: string;
let file: string;
let server: Server;
let urlHttp: string;
let browser: Browser;

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'e2e-export-'));
  file = join(folder, 'rinthel-arch.html');
  const exported = await run(['export', '--workspace', EXAMPLE, '--out', file]);
  expect(exported.exitCode, exported.stdout + exported.stderr).toBe(0);
  const html = readFileSync(file);
  server = createServer((req, res) => {
    if (req.url === '/rinthel-arch.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  urlHttp = `http://127.0.0.1:${(server.address() as AddressInfo).port}/rinthel-arch.html`;
  browser = await chromium.launch({ executablePath: chromiumPath(), headless: true });
}, DEADLINE_MS);

afterAll(async () => {
  await browser?.close();
  await new Promise((ok) => (server === undefined ? ok(undefined) : server.close(ok)));
  if (folder !== undefined) rmSync(folder, { recursive: true, force: true });
});

/** Opens `url` and records every request other than the document itself and `data:`/`blob:` URLs, and page errors. */
async function open(url: string, { withoutWorker = false } = {}): Promise<{ page: Page; foreign: string[]; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(WAIT.timeout);
  const foreign: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u !== url && !u.startsWith('data:') && !u.startsWith('blob:')) foreign.push(u);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  if (withoutWorker) await page.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined }));
  await page.goto(`${url}#view=context`);
  return { page, foreign, errors };
}

const ready = (page: Page, view: string) => page.locator(`.rd-vista[data-vista="${view}"][data-layout="listo"]`).waitFor(WAIT);

async function walk(url: string, options: { withoutWorker?: boolean } = {}): Promise<void> {
  const { page, foreign, errors } = await open(url, options);
  try {
    await ready(page, 'context');
    await page.getByText('Read-only').waitFor();
    expect(await page.getByRole('tab', { name: 'Code' }).count()).toBe(0);

    // Another View from the index.
    await page.getByRole('listbox', { name: 'Views' }).getByRole('option', { name: 'open', exact: true }).click();
    await ready(page, 'open');

    // Theme switching (a Theme with its own fonts): the canvas lays out again with it.
    await page.getByRole('tab', { name: 'Themes' }).click();
    await page.getByRole('listbox', { name: 'Themes' }).getByRole('option', { name: 'blueprint' }).click();
    await page.getByRole('region', { name: 'Theme blueprint' }).waitFor();
    await ready(page, 'open');
    // Its embedded font file loaded (not the fallback).
    await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => f.family.includes('JetBrains Mono') && f.status === 'loaded')), WAIT).toBe(true);

    if (options.withoutWorker !== true) expect(page.workers().length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    expect(foreign).toEqual([]);
  } finally {
    await page.close();
  }
}

describe('e2e: an exported HTML in Chromium', () => {
  it('over http: draws, navigates and switches Theme with no other request', () => walk(urlHttp), DEADLINE_MS);

  it('over file://: the same, with the layout Worker started from a Blob', () => walk(pathToFileURL(file).href), DEADLINE_MS);

  it('without Web Workers the layout runs on the main thread', () => walk(pathToFileURL(file).href, { withoutWorker: true }), DEADLINE_MS);
});
