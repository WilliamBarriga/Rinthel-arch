/** Build of the browser assets and the paths `cli` serves under `/_dev-ui/`. */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildDevUi } from '../src/build';
import { DEV_UI_ROUTE, devUiAssets } from '../src/index';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function temporary(): string {
  const folder = mkdtempSync(join(tmpdir(), 'rinthel-dev-ui-'));
  folders.push(folder);
  return folder;
}

describe('buildDevUi', () => {
  it('writes the HTML, the page JS (module) with its chunks, the worker JS and the CSS; the HTML requests them under /_dev-ui/', async () => {
    const output = temporary();

    await buildDevUi({ output });

    expect(readdirSync(output).sort()).toEqual(['chunks', 'export.js', 'index.html', 'page.js', 'style.css', 'worker.js']);
    const html = readFileSync(join(output, 'index.html'), 'utf8');
    expect(html).toContain(`<script type="module" src="${DEV_UI_ROUTE}page.js"></script>`);
    expect(html).toContain(`<link rel="stylesheet" href="${DEV_UI_ROUTE}style.css">`);
    const page = readFileSync(join(output, 'page.js'), 'utf8');
    expect(page.includes('EventSource') && page.includes(DEV_UI_ROUTE) && page.includes('worker.js')).toBe(true);
    expect(readFileSync(join(output, 'worker.js'), 'utf8').length).toBeGreaterThan(1000);
    expect(readFileSync(join(output, 'style.css'), 'utf8')).toContain('#raiz');
  }, 60_000);

  it('CodeMirror goes in a chunk loaded when Code opens, not in the page', async () => {
    const output = temporary();

    await buildDevUi({ output });

    const page = readFileSync(join(output, 'page.js'), 'utf8');
    const chunks = readdirSync(join(output, 'chunks')).map((t) => readFileSync(join(output, 'chunks', t), 'utf8'));
    expect(page.includes('cm-scroller')).toBe(false);
    expect(chunks.some((t) => t.includes('cm-scroller'))).toBe(true);
    expect(page).toContain('./chunks/');
  }, 60_000);

  it('the export page is one script without the editor or its own ELK (ELK goes once, in the Worker)', async () => {
    const output = temporary();

    await buildDevUi({ output });

    const exported = readFileSync(join(output, 'export.js'), 'utf8');
    expect(exported).not.toMatch(/^\s*import\b|\bimport\(/m);
    expect(exported.includes('cm-scroller')).toBe(false);
    expect(exported.includes('org.eclipse.elk')).toBe(false);
    expect(readFileSync(join(output, 'worker.js'), 'utf8')).toContain('org.eclipse.elk');
  }, 60_000);

  it('ELK ships once, in the Worker: no page chunk carries a copy', async () => {
    const output = temporary();

    await buildDevUi({ output });

    const elk = (file: string): boolean => readFileSync(join(output, file), 'utf8').includes('org.eclipse.elk');
    const page = ['page.js', ...readdirSync(join(output, 'chunks')).map((t) => join('chunks', t))];
    expect(page.filter(elk)).toEqual([]);
    expect(elk('worker.js')).toBe(true);
  }, 60_000);

  it('the CSS step is pluggable: it gets the entry and its output is the served stylesheet', async () => {
    const output = temporary();
    const entries: string[] = [];

    await buildDevUi({
      output: output,
      css: async (entry) => {
        entries.push(entry);
        return '/* hoja propia */';
      },
    });

    expect(entries).toEqual([expect.stringMatching(/style\.css$/)]);
    expect(readFileSync(join(output, 'style.css'), 'utf8')).toBe('/* hoja propia */');
  }, 60_000);
});

describe('devUiAssets', () => {
  it('gives the HTML of / and, by name under /_dev-ui/, the same files the build produces, inside dist/', () => {
    const { index, files } = devUiAssets();

    expect(index.endsWith(`${sep}dist${sep}dev-ui${sep}index.html`)).toBe(true);
    const chunks = readdirSync(join(index, '..', 'chunks')).map((t) => `chunks/${t}`);
    expect(chunks.length).toBeGreaterThan(0);
    expect(Object.keys(files).sort()).toEqual(['style.css', 'page.js', ...chunks, 'worker.js'].sort());
    for (const [name, route] of Object.entries(files)) expect(route).toBe(join(index, '..', ...name.split('/')));
  });
});
