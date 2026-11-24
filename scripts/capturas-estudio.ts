/**
 * Capturas de la UI de `dev` para las guias (`docs/img/estudio/`); lo lanza `pnpm docs:capturas` y necesita `pnpm build`
 * y Chromium. Abre `dev` sobre una copia de `examples/rinthel-arch` con un Registro de actividad sembrado por el CLI y
 * captura la pagina entera: Vista con Detalle, Codigo con la galeria de Temas, feed del agente tras un `edit` externo y
 * el Buscador. Uso: `node scripts/capturas-estudio.ts [--salida <dir>]`.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';
import type { Page } from 'playwright';

import { rutaDeChromium } from '../tests/ayudas/chromium.ts';
import { iniciarDevDeGaleria } from './capturas/servidores.ts';

const REPO = resolve(import.meta.dirname, '..');
const BIN = join(REPO, 'packages/cli/dist/bin.js');
const VISTA = 'paquetes';
const NODO = 'cli';
const ENCUADRE = { width: 1600, height: 900 };

const { values } = parseArgs({ args: process.argv.slice(2), options: { salida: { type: 'string', default: 'docs/img/estudio' } } });
const salida = resolve(REPO, values.salida);

/** Corre el CLI como lo haria un agente: con nombre, para que el feed lo muestre. */
function cli(workspace: string, ...args: string[]): void {
  const r = spawnSync(process.execPath, [BIN, ...args, '--workspace', workspace], { env: { ...process.env, DIAGRAMS_AGENTE: 'claude' }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`diagrams ${args.join(' ')} salio ${r.status}:\n${r.stderr}`);
}

async function esperarLienzo(pagina: Page): Promise<void> {
  await pagina.waitForSelector(`.rd-vista[data-layout="listo"][data-vista="${VISTA}"]`, { timeout: 60_000 });
  await pagina.evaluate('document.fonts.ready');
}

async function capturar(pagina: Page, nombre: string): Promise<void> {
  await pagina.screenshot({ path: join(salida, `${nombre}.png`), animations: 'disabled' });
  console.log(`capturado estudio/${nombre}`);
}

async function principal(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'capturas-estudio-'));
  cpSync(join(REPO, 'examples/rinthel-arch'), workspace, { recursive: true, filter: (origen) => !origen.includes('/.diagrams') });
  cli(workspace, 'validate');
  cli(workspace, 'inspect', 'vista', VISTA);
  cli(workspace, 'inspect', 'nodo', 'cli');
  mkdirSync(salida, { recursive: true });

  const dev = await iniciarDevDeGaleria(REPO, workspace);
  const navegador = await chromium.launch({ executablePath: rutaDeChromium(), headless: true });
  try {
    const contexto = await navegador.newContext({ viewport: ENCUADRE, deviceScaleFactor: 1.25, reducedMotion: 'reduce' });
    const pagina = await contexto.newPage();
    pagina.setDefaultTimeout(30_000);
    const izquierdo = pagina.getByRole('complementary', { name: 'Left panel' });
    const derecho = pagina.getByRole('complementary', { name: 'Right panel' });

    // Indice, lienzo y Detalle del Nodo seleccionado.
    await pagina.goto(`${dev.url}#vista=${VISTA}&s=${NODO}`);
    await esperarLienzo(pagina);
    await derecho.getByRole('region', { name: 'Details' }).getByRole('heading').first().waitFor();
    await capturar(pagina, 'vista-y-detalle');

    // Codigo a la izquierda, galeria de Temas a la derecha.
    await izquierdo.getByRole('tab', { name: 'Code' }).click();
    await izquierdo.getByRole('textbox', { name: /^Code of / }).waitFor();
    await derecho.getByRole('tab', { name: 'Themes' }).click();
    await pagina.waitForTimeout(500);
    await capturar(pagina, 'codigo-y-temas');

    // Un agente edita por fuera: feed, resaltado e Historial del Workspace.
    await izquierdo.getByRole('tab', { name: 'Views' }).click();
    await derecho.getByRole('tab', { name: 'Agent' }).click();
    cli(workspace, 'edit', '--intent', JSON.stringify({ type: 'set-theme', view: VISTA, theme: 'neutral-dark' }));
    await derecho.getByRole('list', { name: 'Agent activity' }).getByRole('listitem').filter({ hasText: 'edit' }).waitFor();
    await esperarLienzo(pagina);
    await capturar(pagina, 'agente');

    // Buscador (Mod+K).
    await pagina.keyboard.press('Control+k');
    await pagina.getByRole('dialog', { name: 'Finder' }).getByRole('combobox', { name: 'Search' }).fill('ses');
    await pagina.waitForTimeout(500);
    await capturar(pagina, 'buscador');
    await contexto.close();
  } finally {
    await navegador.close();
    dev.detener();
    rmSync(workspace, { recursive: true, force: true });
  }
}

await principal();
