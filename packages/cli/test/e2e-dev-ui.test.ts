/**
 * The only end to end of the UI: real `dev` over a copy of the `medium` fixture and headless Chromium (Playwright).
 * It walks the spec flow (#184) with locators by role and accessible name; the rest of the UI is tested in jsdom
 * inside `dev-ui`. Without Chromium it fails with the command that installs it (`rutaDeChromium`).
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';

import { startDev, run } from 'cli';
import type { DevServer } from 'cli';

import { rutaDeChromium } from '../../../tests/ayudas/chromium';

const DEADLINE_MS = 60_000;
const WAIT = { timeout: 15_000 };

let workspace: string;
let server: DevServer;
let browser: Browser;

beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'e2e-dev-ui-'));
  cpSync(join(import.meta.dirname, 'fixtures', 'medium'), workspace, { recursive: true });
  server = await startDev({ workspace, httpPort: 0 });
  browser = await chromium.launch({ executablePath: rutaDeChromium(), headless: true });
}, DEADLINE_MS);

afterAll(async () => {
  await browser?.close();
  await server?.close();
  if (workspace !== undefined) rmSync(workspace, { recursive: true, force: true });
});

const onDisk = (): string => readFileSync(join(workspace, 'main.dg'), 'utf8');
const lineNumber = (text: string, needle: string): number => text.split('\n').findIndex((l) => l.includes(needle)) + 1;

/** From the cursor line in the editor, opens a new line below, types `text` and leaves the editor. */
async function writeAfterLine(page: Page, text: string): Promise<void> {
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
}

describe('rutaDeChromium', () => {
  it('without CHROMIUM_PATH nor a Playwright cache it fails with the command that installs Chromium', () => {
    expect(() => rutaDeChromium({}, join(tmpdir(), 'no-playwright-cache'))).toThrow('pnpm exec playwright install chromium');
  });

  it('takes CHROMIUM_PATH as is', () => {
    expect(rutaDeChromium({ CHROMIUM_PATH: '/opt/chrome' }, '/no/existe')).toBe('/opt/chrome');
  });

  it('looks for the executable of the latest revision for the platform', () => {
    const cache = mkdtempSync(join(tmpdir(), 'playwright-cache-'));
    const executable = (revision: string, path: string): string => {
      const complete = join(cache, revision, path);
      mkdirSync(dirname(complete), { recursive: true });
      writeFileSync(complete, '');
      return complete;
    };
    try {
      executable('chromium-1100', 'chrome-linux64/chrome');
      const linux = executable('chromium-1200', 'chrome-linux/chrome');
      const mac = executable('chromium-1200', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium');
      const windows = executable('chromium-1200', 'chrome-win64/chrome.exe');
      expect(rutaDeChromium({}, cache, 'linux')).toBe(linux);
      expect(rutaDeChromium({}, cache, 'darwin')).toBe(mac);
      expect(rutaDeChromium({}, cache, 'win32')).toBe(windows);
      expect(() => rutaDeChromium({}, cache, 'aix')).toThrow('pnpm exec playwright install chromium');
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  });
});

describe('e2e: the dev UI in Chromium', () => {
  it('index, View, editor, external edit, Mod+K, undo from the History and resizing', async () => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.setDefaultTimeout(WAIT.timeout);
    const canvas = page.getByRole('main', { name: 'Canvas' });
    const leftOne = page.getByRole('complementary', { name: 'Left panel' });
    const rightOne = page.getByRole('complementary', { name: 'Right panel' });

    // 1. Index.
    await page.goto(server.url);
    const index = leftOne.getByRole('listbox', { name: 'Views' });
    await expect.poll(() => index.getByRole('option').allInnerTexts(), WAIT).toEqual([expect.stringContaining('general'), 'datos', expect.stringContaining('detalle')]);

    // 2. Open a View.
    await index.getByRole('option', { name: 'datos' }).click();
    await canvas.getByRole('group', { name: /^Pedidos, tabla/ }).waitFor();
    await expect.poll(() => page.url(), WAIT).toContain('#view=datos');

    // 3. Type in the editor: it is saved to disk and the canvas updates.
    await leftOne.getByRole('tab', { name: 'Code' }).click();
    await leftOne.getByRole('textbox', { name: 'Code of main.dg' }).click();
    await page.keyboard.press('Control+Home');
    for (let i = 1; i < lineNumber(onDisk(), '"Pedidos"'); i++) await page.keyboard.press('ArrowDown');
    await writeAfterLine(page, 'tabla facturas "Facturas"');
    await expect.poll(onDisk, WAIT).toContain('tabla facturas "Facturas"');
    await expect.poll(() => leftOne.getByRole('status', { name: 'Editor save state' }).textContent(), WAIT).toBe('Saved');
    await canvas.getByRole('group', { name: /^Facturas, tabla/ }).waitFor();

    // 4. `diagrams edit` from outside: the agent feed shows it and the canvas highlights it.
    const text = onDisk();
    const line = lineNumber(text, '"Usuarios"');
    const column = text.split('\n')[line - 1]!.indexOf('Usuarios') + 1;
    const edits = [{ file: 'main.dg', range: { start: { line, column }, end: { line, column: column + 'Usuarios'.length } }, replacement: 'Clientes' }];
    const edition = await run(['edit', '--workspace', workspace, '--edits', JSON.stringify(edits)], { env: { DIAGRAMS_AGENT: 'e2e' } });
    expect(edition.exitCode, edition.stdout + edition.stderr).toBe(0);
    await rightOne.getByRole('tab', { name: 'Agent' }).click();
    await rightOne.getByRole('list', { name: 'Agent activity' }).getByRole('listitem').filter({ hasText: 'e2e' }).filter({ hasText: 'edit' }).waitFor();
    await canvas.getByRole('group', { name: /^Clientes, tabla/ }).waitFor();
    await expect.poll(() => page.getByRole('status', { name: 'Canvas highlight' }).getByRole('listitem').allInnerTexts(), WAIT).toContain('plataforma.datos.usuarios');
    await expect.poll(() => leftOne.getByRole('textbox', { name: 'Code of main.dg' }).innerText(), WAIT).toContain('"Clientes"');

    // 5. Mod+K to `file:line` and type there.
    const target = lineNumber(onDisk(), '"Cliente web"');
    await page.keyboard.press('Control+k');
    const finder = page.getByRole('dialog', { name: 'Finder' });
    await finder.getByRole('combobox', { name: 'Search' }).fill(`main.dg:${target}`);
    await finder.getByRole('option', { name: `Open main.dg:${target}` }).waitFor();
    await page.keyboard.press('Enter');
    await finder.waitFor({ state: 'hidden' });
    await writeAfterLine(page, 'servicio movil "App movil"');
    await expect.poll(onDisk, WAIT).toContain('servicio movil "App movil"');
    expect(lineNumber(onDisk(), '"App movil"')).toBe(target + 1);

    // 6. Undo from the History: jumping to the previous entry removes what was typed in step 5 and keeps the rest.
    await rightOne.getByRole('tab', { name: 'Undo history' }).click();
    const history = rightOne.getByRole('list', { name: 'Change history' });
    await expect.poll(() => history.getByRole('listitem').count(), WAIT).toBe(3);
    await history.getByRole('listitem').nth(1).getByRole('button').click();
    await expect.poll(onDisk, WAIT).not.toContain('App movil');
    expect(onDisk()).toContain('tabla facturas "Facturas"');
    expect(onDisk()).toContain('"Clientes"');
    await expect.poll(() => history.getByRole('listitem').nth(1).getByRole('button').getAttribute('aria-current'), WAIT).toBe('step');

    // Dragging the edge of the left panel widens it (from the minimum: opening Code already widened it).
    const separator = leftOne.getByRole('separator', { name: 'Width of the left panel' });
    await separator.focus();
    await page.keyboard.press('Home');
    await expect.poll(async () => separator.getAttribute('aria-valuenow'), WAIT).toBe(await separator.getAttribute('aria-valuemin'));
    // The island animates its width: wait for it to reach the minimum before measuring.
    await expect.poll(async () => (await leftOne.boundingBox())!.width, WAIT).toBeLessThan(Number(await separator.getAttribute('aria-valuemin')) + 4);
    const width = (await leftOne.boundingBox())!.width;
    const border = (await separator.boundingBox())!;
    const y = border.y + border.height / 2;
    await page.mouse.move(border.x + border.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(border.x + border.width / 2 + 120, y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await leftOne.boundingBox())!.width, WAIT).toBeGreaterThan(width + 100);

    await page.close();
  }, DEADLINE_MS);
});
