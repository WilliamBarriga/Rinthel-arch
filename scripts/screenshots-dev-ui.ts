/**
 * Screenshots of the `dev` UI for the guides (`docs/img/dev-ui/`); `pnpm docs:screenshots` launches it and it needs
 * `pnpm build` and Chromium. It opens `dev` on a copy of `examples/rinthel-arch` with an Activity log seeded by the CLI
 * and captures the whole page: View with Details, Code with the Theme gallery, the agent feed after an external `edit`
 * and the Finder. Usage: `node scripts/screenshots-dev-ui.ts [--out <dir>]`.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';
import type { Page } from 'playwright';

import { chromiumPath } from '../tests/helpers/chromium.ts';
import { startGalleryDev } from './screenshots/servers.ts';

const REPO = resolve(import.meta.dirname, '..');
const BIN = join(REPO, 'packages/cli/dist/bin.js');
const VIEW = 'context';
const NODE = 'repo.cli';
const FRAME = { width: 1600, height: 900 };

const { values } = parseArgs({ args: process.argv.slice(2), options: { out: { type: 'string', default: 'docs/img/dev-ui' } } });
const output = resolve(REPO, values.out);

/** Runs the CLI the way an agent would: with a name, so the feed shows it. */
function cli(workspace: string, ...args: string[]): void {
  const r = spawnSync(process.execPath, [BIN, ...args, '--workspace', workspace], { env: { ...process.env, DIAGRAMS_AGENT: 'claude' }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`diagrams ${args.join(' ')} exited ${r.status}:\n${r.stderr}`);
}

async function waitForCanvas(page: Page): Promise<void> {
  await page.waitForSelector(`.rd-vista[data-layout="listo"][data-vista="${VIEW}"]`, { timeout: 60_000 });
  await page.evaluate('document.fonts.ready');
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(output, `${name}.png`), animations: 'disabled' });
  console.log(`captured dev-ui/${name}`);
}

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'screenshots-dev-ui-'));
  cpSync(join(REPO, 'examples/rinthel-arch'), workspace, { recursive: true, filter: (source) => !source.includes('/.diagrams') });
  cli(workspace, 'validate');
  cli(workspace, 'inspect', 'view', VIEW);
  cli(workspace, 'inspect', 'node', NODE);
  mkdirSync(output, { recursive: true });

  const dev = await startGalleryDev(REPO, workspace);
  const browser = await chromium.launch({ executablePath: chromiumPath(), headless: true });
  try {
    const context = await browser.newContext({ viewport: FRAME, deviceScaleFactor: 1.25, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const left = page.getByRole('complementary', { name: 'Left panel' });
    const right = page.getByRole('complementary', { name: 'Right panel' });

    // Index, canvas and Details of the selected Node.
    await page.goto(`${dev.url}#view=${VIEW}&s=${NODE}`);
    await waitForCanvas(page);
    await right.getByRole('region', { name: 'Details' }).getByRole('heading').first().waitFor();
    await capture(page, 'view-and-detail');

    // Code on the left, Theme gallery on the right.
    await left.getByRole('tab', { name: 'Code' }).click();
    await left.getByRole('textbox', { name: /^Code of / }).waitFor();
    await right.getByRole('tab', { name: 'Themes' }).click();
    await page.waitForTimeout(500);
    await capture(page, 'code-and-themes');

    // An agent edits from outside: feed, highlight and Workspace History.
    await left.getByRole('tab', { name: 'Views' }).click();
    await right.getByRole('tab', { name: 'Agent' }).click();
    cli(workspace, 'edit', '--intent', JSON.stringify({ type: 'set-theme', view: VIEW, theme: 'neutral-dark' }));
    await right.getByRole('list', { name: 'Agent activity' }).getByRole('listitem').filter({ hasText: 'edit' }).waitFor();
    await waitForCanvas(page);
    await capture(page, 'agent');

    // Finder (Mod+K).
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog', { name: 'Finder' }).getByRole('combobox', { name: 'Search' }).fill('ses');
    await page.waitForTimeout(500);
    await capture(page, 'search');
    await context.close();
  } finally {
    await browser.close();
    dev.stop();
    rmSync(workspace, { recursive: true, force: true });
  }
}

await main();
