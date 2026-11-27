/**
 * Chromium for Playwright, shared by the UI end-to-end tests (`packages/cli/test/e2e-dev-ui.test.ts`) and the
 * screenshots (`scripts/screenshots.ts`, `scripts/screenshots-dev-ui.ts`); all import it by path. A single engine so
 * tests and screenshots see the same thing.
 * Order: `$CHROMIUM_PATH` as is, or the executable of the latest `chromium-<rev>` revision in the Playwright cache
 * (`$PLAYWRIGHT_BROWSERS_PATH` or the platform's) that has one of the platform's names (Linux, macOS or Windows; the
 * installed one may not be the one the Playwright version expects). Without any, it throws with the command that
 * installs it.
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Executable paths inside `chromium-<rev>/`, per platform (the names changed between versions). */
const EXECUTABLES: Readonly<Record<string, readonly string[]>> = {
  linux: ['chrome-linux64/chrome', 'chrome-linux/chrome'],
  darwin: ['chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-x64/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'],
  win32: ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe'],
};

/** Playwright's browser cache for the platform. */
function playwrightCache(env: Readonly<Record<string, string | undefined>>, platform: string): string {
  const own = env['PLAYWRIGHT_BROWSERS_PATH'];
  if (own !== undefined && own !== '0') return own;
  if (platform === 'darwin') return join(homedir(), 'Library/Caches/ms-playwright');
  if (platform === 'win32') return join(env['LOCALAPPDATA'] ?? join(homedir(), 'AppData/Local'), 'ms-playwright');
  return join(homedir(), '.cache/ms-playwright');
}

export function chromiumPath(env: Readonly<Record<string, string | undefined>> = process.env, cache?: string, platform: string = process.platform): string {
  const configured = env['CHROMIUM_PATH'];
  if (configured !== undefined) return configured;
  const folder = cache ?? playwrightCache(env, platform);
  const revisions = existsSync(folder) ? readdirSync(folder).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9))) : [];
  for (const revision of revisions) {
    for (const executable of EXECUTABLES[platform] ?? []) {
      const path = join(folder, revision, executable);
      if (existsSync(path)) return path;
    }
  }
  throw new Error(`No Chromium for ${platform} in ${folder}. Set CHROMIUM_PATH or run \`pnpm exec playwright install chromium\`.`);
}
