/**
 * Side-by-side screenshots of the prototype (`prototype/render-hibrido`) against the Theme gallery in `dev`; needs `pnpm build`.
 * Usage: `pnpm screenshots <theme>... [open|coverage]`, `pnpm screenshots --all [view]` or
 * `pnpm screenshots --workspace <path> --view <id> [--prototype <variant>] <theme>...` (on a temporary copy).
 * `--out <dir>` (docs, with `--prefix`, `--width`, `--height`, `--scale`): only PNG `<prefix><theme>.png`; 1600x900 frame and scale 2 by default.
 * Output: PNG and a comparison page in `$SCREENSHOTS_DIR` (`/tmp/rinthel-screenshots` by default), served by a mini server
 * that stays alive at the end. Chromium: `$CHROMIUM_PATH` or the Playwright cache; a single engine so they are comparable.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';
import type { Browser } from 'playwright';

import { chromiumPath } from '../tests/helpers/chromium.ts';
import { THEME_VARIANT, preparePrototype } from './screenshots/prototype.ts';
import { startGalleryDev, serveStatic } from './screenshots/servers.ts';
import { prepareWorkspace } from './screenshots/workspace.ts';

const REPO = resolve(import.meta.dirname, '..');
const GALLERY = 'examples/themes/gallery';
const EXAMPLE_THEMES = 'examples/rinthel-arch/themes';
const VIEWPORT = { width: 1600, height: 900 };
const VIEWS = ['open', 'coverage'] as const;
type View = (typeof VIEWS)[number];

const fail = (message: string): never => {
  console.error(message);
  return process.exit(1);
};

interface Request {
  workspace: string;
  /** `--theme-path` of dev: Themes and fonts the Workspace does not bring. */
  themeFolder?: string;
  themes: string[];
  viewOf: (theme: string) => string;
  /** `undefined` = no prototype. */
  variantOf: (theme: string) => string | undefined;
  title: string;
  /** `gallery` or `workspace`. */
  side: string;
  /** `--out`: no comparison page. */
  docs?: { dir: string; prefix: string; scale: number; frame: { width: number; height: number } };
}

const USAGE = `Usage: pnpm screenshots <theme>... [${VIEWS.join('|')}]  or  pnpm screenshots --all [view]
       pnpm screenshots --workspace <path> --view <id> [--prototype <variant>] <theme>...`;

function readArguments(): Request {
  const { values: v, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: { all: { type: 'boolean', default: false }, workspace: { type: 'string' }, out: { type: 'string' }, prefix: { type: 'string' }, scale: { type: 'string' }, width: { type: 'string' }, height: { type: 'string' }, view: { type: 'string' }, prototype: { type: 'string' } },
    allowPositionals: true,
  });
  if (v.workspace !== undefined) {
    const request = workspaceRequest(v.workspace, v.view, v.prototype, positionals);
    if (v.out !== undefined) request.docs = { dir: resolve(REPO, v.out), prefix: v.prefix ?? '', scale: Number(v.scale ?? 2), frame: { width: Number(v.width ?? VIEWPORT.width), height: Number(v.height ?? VIEWPORT.height) } };
    return request;
  }
  if (v.view !== undefined || v.prototype !== undefined) return fail(`--view and --prototype go with --workspace.\n${USAGE}`);
  // The View, if given, goes last.
  const view = VIEWS.includes(positionals[positionals.length - 1] as View) ? (positionals.pop() as View) : 'open';
  const names = Object.keys(THEME_VARIANT);
  let themes = positionals;
  if (v.all) {
    if (positionals.length > 0) fail(`Unknown View '${positionals[0]}'. Use: ${VIEWS.join(', ')}.`);
    themes = names;
  }
  if (themes.length === 0) return fail(`${USAGE}\nThemes: ${names.join(', ')}`);
  const unknown = themes.find((t) => !names.includes(t));
  if (unknown !== undefined) return fail(`Unknown Theme '${unknown}'. Themes: ${names.join(', ')}`);
  return {
    workspace: GALLERY,
    themeFolder: EXAMPLE_THEMES,
    themes,
    viewOf: (t) => (view === 'open' ? `${t}-reference` : t),
    variantOf: (t) => (view === 'open' ? THEME_VARIANT[t] : undefined),
    title: `Prototype against gallery (View ${view})`,
    side: 'gallery',
  };
}

function workspaceRequest(path: string, view: string | undefined, variant: string | undefined, themes: string[]): Request {
  if (view === undefined || themes.length === 0) return fail(`With --workspace, --view and at least one Theme are required.\n${USAGE}`);
  const variants = Object.values(THEME_VARIANT);
  if (variant !== undefined && !variants.includes(variant)) return fail(`Unknown variant '${variant}'. Variants: ${variants.join(', ')}`);
  const copy = prepareWorkspace(resolve(REPO, path), view, themes, process.env['SCREENSHOTS_DIR'] ?? '/tmp/rinthel-screenshots');
  const compared = variant === undefined ? '' : ` against prototype variant ${variant}`;
  return { workspace: copy.folder, themes, viewOf: copy.viewOf, variantOf: () => variant, title: `${path}, View ${view}${compared}`, side: 'workspace' };
}

function chromiumOrFail(): string {
  try {
    return chromiumPath();
  } catch (error) {
    return fail((error as Error).message);
  }
}

async function captureGallery(browser: Browser, url: string, view: string, target: string, scale = 2, frame = VIEWPORT): Promise<void> {
  const context = await browser.newContext({ viewport: frame, deviceScaleFactor: scale, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const ready = '.rd-vista[data-layout="listo"]';
  await page.goto(`${url}#p=${encodeURIComponent(view)}`);
  await page.waitForSelector(`${ready}[data-vista="${view}"]`, { timeout: 60_000 });
  await page.evaluate('document.fonts.ready');
  // Fonts may ask for a new layout: wait for the signal again.
  await page.waitForSelector(`${ready}[data-vista="${view}"]`);
  // Out of the frame whatever is not the diagram: shell chrome (breadcrumbs, accessibility) and the UI's bar, islands, legend and toasts.
  await page.addStyleTag({ content: '.rd-chrome, .ui-barra, .ui-isla, .ui-leyenda, .ui-toasts { display: none !important }' });
  await page.locator('.rd-vista').screenshot({ path: target, animations: 'disabled' });
  await context.close();
}

async function capturePrototype(browser: Browser, url: string, variant: string, target: string): Promise<void> {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${url}?variant=${variant}&vista=abierto`, { waitUntil: 'load' });
  // The prototype fills `#st` after measuring the real text against the layout boxes.
  await page.waitForFunction("(document.getElementById('st')?.textContent ?? '') !== ''", undefined, { timeout: 60_000 });
  await page.evaluate('document.fonts.ready');
  await page.addStyleTag({ content: '#bar{display:none !important}' });
  await page.locator('#vp').screenshot({ path: target, animations: 'disabled' });
  await context.close();
}

function comparisonPage(request: Request): string {
  const image = (theme: string, side: string): string => `<figure><figcaption>${side}</figcaption><img src="${theme}-${side}.png" alt="${theme} ${side}"></figure>`;
  const sections = request.themes
    .map((t) => {
      const variant = request.variantOf(t);
      const subtitle = variant === undefined ? '' : ` <small>prototype variant ${variant}</small>`;
      return `<section id="${t}"><h2>${t}${subtitle}</h2><div class="pair">${variant === undefined ? '' : image(t, 'prototype')}${image(t, request.side)}</div></section>`;
    })
    .join('\n');
  const index = request.themes.map((t) => `<a href="#${t}">${t}</a>`).join(' ');
  return `<!doctype html><meta charset="utf-8"><title>Screenshots: ${request.title}</title>
<style>body{font:14px system-ui;margin:16px;background:#18181b;color:#e4e4e7}a{color:#93c5fd;margin-right:10px}h2{margin:28px 0 8px}small{opacity:.6;font-weight:400}
.pair{display:flex;gap:12px;align-items:flex-start}figure{margin:0;flex:1;min-width:0}figcaption{margin-bottom:4px;opacity:.7}img{width:100%;display:block;border:1px solid #3f3f46}</style>
<h1>${request.title}</h1><nav>${index}</nav>
${sections}`;
}

async function main(): Promise<void> {
  const request = readArguments();
  const cache = process.env['SCREENSHOTS_DIR'] ?? '/tmp/rinthel-screenshots';
  const output = request.docs?.dir ?? join(cache, 'output');
  mkdirSync(output, { recursive: true });

  const prototype = request.themes.some((t) => request.variantOf(t) !== undefined) ? preparePrototype(cache, REPO) : undefined;
  const origin = await serveStatic(cache);
  const gallery = await startGalleryDev(REPO, request.workspace, request.themeFolder);
  const browser = await chromium.launch({ executablePath: chromiumOrFail(), headless: true });
  try {
    for (const theme of request.themes) {
      const file = request.docs === undefined ? `${theme}-${request.side}.png` : `${request.docs.prefix}${theme}.png`;
      await captureGallery(browser, gallery.url, request.viewOf(theme), join(output, file), request.docs?.scale, request.docs?.frame);
      const variant = request.variantOf(theme);
      if (prototype !== undefined && variant !== undefined) {
        const prototypeUrl = `${origin}/${prototype.folder.split('/').pop()}/${prototype.page}`;
        await capturePrototype(browser, prototypeUrl, variant, join(output, `${theme}-prototype.png`));
      }
      console.log(`captured ${theme} (${request.viewOf(theme)})`);
    }
  } finally {
    await browser.close();
    gallery.stop();
  }
  if (request.docs !== undefined) return process.exit(0);
  writeFileSync(join(output, 'index.html'), comparisonPage(request));
  console.log(`\nComparison: ${origin}/output/`);
}

await main();
