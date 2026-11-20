/**
 * Chromium para Playwright, compartido por la punta a punta de la UI (`e2e-estudio.test.ts`) y `scripts/capturas.ts`
 * (que lo importa por ruta: vive aqui porque un paquete no puede importar fuera de su carpeta). Un solo motor para que
 * pruebas y capturas vean lo mismo.
 * Orden: `$CHROMIUM_PATH` tal cual, o la ultima revision `chromium-<rev>` de la cache de Playwright (la instalada puede
 * no ser la que espera la version de Playwright). Sin ninguna lanza con el comando que la instala.
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function rutaDeChromium(entorno: Readonly<Record<string, string | undefined>> = process.env, cache = join(homedir(), '.cache/ms-playwright')): string {
  const configurada = entorno['CHROMIUM_PATH'];
  if (configurada !== undefined) return configurada;
  const revisiones = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(a.slice(9)) - Number(b.slice(9))) : [];
  const ultima = revisiones[revisiones.length - 1];
  if (ultima === undefined) throw new Error(`No hay Chromium en ${cache}. Define CHROMIUM_PATH o ejecuta \`pnpm exec playwright install chromium\`.`);
  return join(cache, ultima, 'chrome-linux64/chrome');
}
