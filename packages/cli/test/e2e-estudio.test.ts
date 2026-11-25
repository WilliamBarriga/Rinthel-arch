/**
 * La unica punta a punta de la UI: `dev` real sobre una copia del fixture `mediano` y Chromium headless (Playwright).
 * Recorre el flujo de la spec (#184) con locators por rol y nombre accesible; lo demas de la UI se prueba en jsdom
 * dentro de `estudio`. Sin Chromium falla con el comando que lo instala (`rutaDeChromium`).
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';

import { iniciarDev, run } from 'cli';
import type { ServidorDev } from 'cli';

import { rutaDeChromium } from '../../../tests/ayudas/chromium';

const PLAZO_MS = 60_000;
const ESPERA = { timeout: 15_000 };

let workspace: string;
let servidor: ServidorDev;
let navegador: Browser;

beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'e2e-estudio-'));
  cpSync(join(import.meta.dirname, 'fixtures', 'mediano'), workspace, { recursive: true });
  servidor = await iniciarDev({ workspace, puertoHttp: 0 });
  navegador = await chromium.launch({ executablePath: rutaDeChromium(), headless: true });
}, PLAZO_MS);

afterAll(async () => {
  await navegador?.close();
  await servidor?.cerrar();
  if (workspace !== undefined) rmSync(workspace, { recursive: true, force: true });
});

const enDisco = (): string => readFileSync(join(workspace, 'main.dg'), 'utf8');
const numeroDeLinea = (texto: string, aguja: string): number => texto.split('\n').findIndex((l) => l.includes(aguja)) + 1;

/** Desde la linea del cursor en el editor, abre una linea nueva debajo, escribe `texto` y sale del editor. */
async function escribirTrasLinea(pagina: Page, texto: string): Promise<void> {
  await pagina.keyboard.press('End');
  await pagina.keyboard.press('Enter');
  await pagina.keyboard.type(texto);
  await pagina.keyboard.press('Escape');
}

describe('rutaDeChromium', () => {
  it('sin CHROMIUM_PATH ni cache de Playwright falla con el comando que instala Chromium', () => {
    expect(() => rutaDeChromium({}, join(tmpdir(), 'sin-cache-de-playwright'))).toThrow('pnpm exec playwright install chromium');
  });

  it('toma CHROMIUM_PATH tal cual', () => {
    expect(rutaDeChromium({ CHROMIUM_PATH: '/opt/chrome' }, '/no/existe')).toBe('/opt/chrome');
  });

  it('busca el ejecutable de la ultima revision segun la plataforma', () => {
    const cache = mkdtempSync(join(tmpdir(), 'cache-de-playwright-'));
    const ejecutable = (revision: string, ruta: string): string => {
      const completa = join(cache, revision, ruta);
      mkdirSync(dirname(completa), { recursive: true });
      writeFileSync(completa, '');
      return completa;
    };
    try {
      ejecutable('chromium-1100', 'chrome-linux64/chrome');
      const linux = ejecutable('chromium-1200', 'chrome-linux/chrome');
      const mac = ejecutable('chromium-1200', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium');
      const windows = ejecutable('chromium-1200', 'chrome-win64/chrome.exe');
      expect(rutaDeChromium({}, cache, 'linux')).toBe(linux);
      expect(rutaDeChromium({}, cache, 'darwin')).toBe(mac);
      expect(rutaDeChromium({}, cache, 'win32')).toBe(windows);
      expect(() => rutaDeChromium({}, cache, 'aix')).toThrow('pnpm exec playwright install chromium');
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  });
});

describe('e2e: la UI de dev en Chromium', () => {
  it('indice, Vista, editor, edit externo, Mod+K, deshacer desde el Historial y redimensionado', async () => {
    const pagina = await navegador.newPage({ viewport: { width: 1600, height: 900 } });
    pagina.setDefaultTimeout(ESPERA.timeout);
    const lienzo = pagina.getByRole('main', { name: 'Canvas' });
    const izquierdo = pagina.getByRole('complementary', { name: 'Left panel' });
    const derecho = pagina.getByRole('complementary', { name: 'Right panel' });

    // 1. Indice.
    await pagina.goto(servidor.url);
    const indice = izquierdo.getByRole('listbox', { name: 'Views' });
    await expect.poll(() => indice.getByRole('option').allInnerTexts(), ESPERA).toEqual([expect.stringContaining('general'), 'datos', expect.stringContaining('detalle')]);

    // 2. Abrir una Vista.
    await indice.getByRole('option', { name: 'datos' }).click();
    await lienzo.getByRole('group', { name: /^Pedidos, tabla/ }).waitFor();
    await expect.poll(() => pagina.url(), ESPERA).toContain('#vista=datos');

    // 3. Escribir en el editor: se guarda en disco y el lienzo se actualiza.
    await izquierdo.getByRole('tab', { name: 'Code' }).click();
    await izquierdo.getByRole('textbox', { name: 'Code of main.dg' }).click();
    await pagina.keyboard.press('Control+Home');
    for (let i = 1; i < numeroDeLinea(enDisco(), '"Pedidos"'); i++) await pagina.keyboard.press('ArrowDown');
    await escribirTrasLinea(pagina, 'tabla facturas "Facturas"');
    await expect.poll(enDisco, ESPERA).toContain('tabla facturas "Facturas"');
    await expect.poll(() => izquierdo.getByRole('status', { name: 'Editor save state' }).textContent(), ESPERA).toBe('Saved');
    await lienzo.getByRole('group', { name: /^Facturas, tabla/ }).waitFor();

    // 4. `diagrams edit` desde fuera: el feed del agente lo muestra y el lienzo lo resalta.
    const texto = enDisco();
    const linea = numeroDeLinea(texto, '"Usuarios"');
    const columna = texto.split('\n')[linea - 1]!.indexOf('Usuarios') + 1;
    const edits = [{ file: 'main.dg', range: { start: { line: linea, column: columna }, end: { line: linea, column: columna + 'Usuarios'.length } }, replacement: 'Clientes' }];
    const edicion = await run(['edit', '--workspace', workspace, '--edits', JSON.stringify(edits)], { entorno: { DIAGRAMS_AGENT: 'e2e' } });
    expect(edicion.exitCode, edicion.stdout + edicion.stderr).toBe(0);
    await derecho.getByRole('tab', { name: 'Agent' }).click();
    await derecho.getByRole('list', { name: 'Agent activity' }).getByRole('listitem').filter({ hasText: 'e2e' }).filter({ hasText: 'edit' }).waitFor();
    await lienzo.getByRole('group', { name: /^Clientes, tabla/ }).waitFor();
    await expect.poll(() => pagina.getByRole('status', { name: 'Canvas highlight' }).getByRole('listitem').allInnerTexts(), ESPERA).toContain('plataforma.datos.usuarios');
    await expect.poll(() => izquierdo.getByRole('textbox', { name: 'Code of main.dg' }).innerText(), ESPERA).toContain('"Clientes"');

    // 5. Mod+K a `archivo:linea` y escribir alli.
    const destino = numeroDeLinea(enDisco(), '"Cliente web"');
    await pagina.keyboard.press('Control+k');
    const buscador = pagina.getByRole('dialog', { name: 'Finder' });
    await buscador.getByRole('combobox', { name: 'Search' }).fill(`main.dg:${destino}`);
    await buscador.getByRole('option', { name: `Open main.dg:${destino}` }).waitFor();
    await pagina.keyboard.press('Enter');
    await buscador.waitFor({ state: 'hidden' });
    await escribirTrasLinea(pagina, 'servicio movil "App movil"');
    await expect.poll(enDisco, ESPERA).toContain('servicio movil "App movil"');
    expect(numeroDeLinea(enDisco(), '"App movil"')).toBe(destino + 1);

    // 6. Deshacer desde el Historial: saltar a la entrada anterior quita lo escrito en el paso 5 y conserva lo demas.
    await derecho.getByRole('tab', { name: 'Undo history' }).click();
    const historial = derecho.getByRole('list', { name: 'Change history' });
    await expect.poll(() => historial.getByRole('listitem').count(), ESPERA).toBe(3);
    await historial.getByRole('listitem').nth(1).getByRole('button').click();
    await expect.poll(enDisco, ESPERA).not.toContain('App movil');
    expect(enDisco()).toContain('tabla facturas "Facturas"');
    expect(enDisco()).toContain('"Clientes"');
    await expect.poll(() => historial.getByRole('listitem').nth(1).getByRole('button').getAttribute('aria-current'), ESPERA).toBe('step');

    // Arrastrar el borde del panel izquierdo lo ensancha (desde el minimo: abrir Codigo ya lo ensancho).
    const separador = izquierdo.getByRole('separator', { name: 'Width of the left panel' });
    await separador.focus();
    await pagina.keyboard.press('Home');
    await expect.poll(async () => separador.getAttribute('aria-valuenow'), ESPERA).toBe(await separador.getAttribute('aria-valuemin'));
    // La isla anima su ancho: se espera a que llegue al minimo antes de medir.
    await expect.poll(async () => (await izquierdo.boundingBox())!.width, ESPERA).toBeLessThan(Number(await separador.getAttribute('aria-valuemin')) + 4);
    const ancho = (await izquierdo.boundingBox())!.width;
    const borde = (await separador.boundingBox())!;
    const y = borde.y + borde.height / 2;
    await pagina.mouse.move(borde.x + borde.width / 2, y);
    await pagina.mouse.down();
    await pagina.mouse.move(borde.x + borde.width / 2 + 120, y, { steps: 5 });
    await pagina.mouse.up();
    await expect.poll(async () => (await izquierdo.boundingBox())!.width, ESPERA).toBeGreaterThan(ancho + 100);

    await pagina.close();
  }, PLAZO_MS);
});
