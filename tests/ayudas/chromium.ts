/**
 * Chromium para Playwright, compartido por la punta a punta de la UI (`packages/cli/test/e2e-dev-ui.test.ts`) y las
 * capturas (`scripts/capturas.ts`, `scripts/capturas-estudio.ts`); todos lo importan por ruta. Un solo motor para que
 * pruebas y capturas vean lo mismo.
 * Orden: `$CHROMIUM_PATH` tal cual, o el ejecutable de la ultima revision `chromium-<rev>` de la cache de Playwright
 * (`$PLAYWRIGHT_BROWSERS_PATH` o la de la plataforma) que tenga uno de los nombres de la plataforma (Linux, macOS o
 * Windows; la instalada puede no ser la que espera la version de Playwright). Sin ninguno lanza con el comando que lo
 * instala.
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Rutas del ejecutable dentro de `chromium-<rev>/`, por plataforma (los nombres cambiaron entre versiones). */
const EJECUTABLES: Readonly<Record<string, readonly string[]>> = {
  linux: ['chrome-linux64/chrome', 'chrome-linux/chrome'],
  darwin: ['chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-x64/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'],
  win32: ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe'],
};

/** Cache de navegadores de Playwright segun la plataforma. */
function cacheDePlaywright(entorno: Readonly<Record<string, string | undefined>>, plataforma: string): string {
  const propia = entorno['PLAYWRIGHT_BROWSERS_PATH'];
  if (propia !== undefined && propia !== '0') return propia;
  if (plataforma === 'darwin') return join(homedir(), 'Library/Caches/ms-playwright');
  if (plataforma === 'win32') return join(entorno['LOCALAPPDATA'] ?? join(homedir(), 'AppData/Local'), 'ms-playwright');
  return join(homedir(), '.cache/ms-playwright');
}

export function rutaDeChromium(entorno: Readonly<Record<string, string | undefined>> = process.env, cache?: string, plataforma: string = process.platform): string {
  const configurada = entorno['CHROMIUM_PATH'];
  if (configurada !== undefined) return configurada;
  const carpeta = cache ?? cacheDePlaywright(entorno, plataforma);
  const revisiones = existsSync(carpeta) ? readdirSync(carpeta).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9))) : [];
  for (const revision of revisiones) {
    for (const ejecutable of EJECUTABLES[plataforma] ?? []) {
      const ruta = join(carpeta, revision, ejecutable);
      if (existsSync(ruta)) return ruta;
    }
  }
  throw new Error(`No hay Chromium para ${plataforma} en ${carpeta}. Define CHROMIUM_PATH o ejecuta \`pnpm exec playwright install chromium\`.`);
}
