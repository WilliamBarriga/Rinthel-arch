/**
 * Builds the publishable `rinthel-arch` npm package in `npm/` (run after `pnpm build`; `npm pack` in `npm/` packs it):
 * - `dist/bin.js`: the whole CLI and its workspace packages bundled with esbuild (esbuild itself stays a dependency:
 *   it ships a native binary per platform and compiles Theme components at runtime).
 * - `dist/estudio/`: the Dev UI static assets, where `estudio` looks for them relative to the bundle.
 * - `dist/*.wasm`: the Scanner's tree-sitter runtime and grammars, loaded only by `scan`.
 * - `skills/`: a copy of the repo's `skills/` tree, the Pi package resource (`pi.skills`).
 * - `LICENSE`,`LICENSE-LIKEC4` and `THIRD-PARTY-NOTICES.md` (generated from `pnpm licenses list`).
 * Nothing is published here.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { build } from 'esbuild';
import { activosDelEstudio } from 'estudio';

const REPO = resolve(import.meta.dirname, '..');
const PACKAGE = join(REPO, 'npm');
const DIST = join(PACKAGE, 'dist');

interface LicenseEntry {
  name: string;
  versions: string[];
  paths: string[];
  license: string;
  homepage?: string;
}

/** elkjs is dual-licensed; we redistribute it under EPL-2.0, whose section 3.1(a) asks for this source statement. */
const EXTRA_NOTICES: Record<string, string> = {
  elkjs:
    'elkjs is redistributed unmodified, minified inside `dist/bin.js` and `dist/estudio/worker.js`, under the Eclipse Public License 2.0 ' +
    '(chosen from `EPL-2.0 OR GPL-3.0-or-later`). Its Source Code is available under that license at https://github.com/kieler/elkjs ' +
    '(the Java sources of the Eclipse Layout Kernel at https://github.com/eclipse-elk/elk) and in the `elkjs` package on npm.',
};

async function bundleCli(): Promise<void> {
  await build({
    entryPoints: [join(REPO, 'packages', 'cli', 'src', 'bin.ts')],
    outfile: join(DIST, 'bin.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    minify: true,
    legalComments: 'none',
    external: ['esbuild'],
    logLevel: 'warning',
    // CommonJS dependencies bundled into ESM (langium, chevrotain, vscode-languageserver) call `require`.
    banner: { js: "import{createRequire as __rinthelRequire}from'node:module';const require=__rinthelRequire(import.meta.url);" },
  });
}

function copyDevUi(): void {
  cpSync(dirname(activosDelEstudio().indice), join(DIST, 'estudio'), { recursive: true });
}

/** Every `.wasm` at the root of a Scanner dependency (web-tree-sitter's runtime and each grammar), next to `bin.js`. */
function copyWasm(): void {
  const scannerDir = join(REPO, 'packages', 'scanner');
  const deps = Object.keys((JSON.parse(readFileSync(join(scannerDir, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }).dependencies);
  for (const dependency of deps) {
    const folder = realpathSync(join(scannerDir, 'node_modules', dependency));
    for (const file of readdirSync(folder).filter((f) => f.endsWith('.wasm'))) copyFileSync(join(folder, file), join(DIST, file));
  }
}

function licenseTexts(folder: string): string[] {
  return readdirSync(folder)
    .filter((file) => /^(licen[cs]e|copying|notice)(\.|-|$)/i.test(file))
    .sort()
    .map((file) => readFileSync(join(folder, file), 'utf8').trim());
}

/** Third-party packages in the production closure of the workspace, bundled into `dist/`; esbuild ships on its own. */
function thirdPartyNotices(): string {
  const output = execFileSync('pnpm', ['licenses', 'list', '--prod', '--recursive', '--json'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const packages = Object.values(JSON.parse(output) as Record<string, LicenseEntry[]>)
    .flat()
    .filter((p) => p.name !== 'esbuild')
    .sort((a, b) => a.name.localeCompare(b.name));
  const sections = packages.map((p) => {
    const header = [`## ${p.name}`, '', `Version ${p.versions.join(', ')}. License: ${p.license}.${p.homepage === undefined ? '' : ` ${p.homepage}`}`];
    const extra = EXTRA_NOTICES[p.name] === undefined ? [] : ['', EXTRA_NOTICES[p.name]!];
    const texts = licenseTexts(p.paths[0]!).map((text) => ['', '```', text, '```'].join('\n'));
    return [...header, ...extra, ...texts].join('\n');
  });
  return [
    '# Third-party notices',
    '',
    'rinthel-arch (MIT, see `LICENSE`) bundles the following third-party software in `dist/`. The DSL grammar is derived from LikeC4 (MIT, see `LICENSE-LIKEC4`).',
    '',
    ...sections.flatMap((s) => [s, '']),
  ].join('\n');
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
await bundleCli();
copyDevUi();
copyWasm();
// The single `skills/` tree, found by Pi through the `pi.skills` field of `npm/package.json`.
rmSync(join(PACKAGE, 'skills'), { recursive: true, force: true });
cpSync(join(REPO, 'skills'), join(PACKAGE, 'skills'), { recursive: true });
copyFileSync(join(REPO, 'LICENSE'), join(PACKAGE, 'LICENSE'));
copyFileSync(join(REPO, 'packages', 'dsl', 'LICENSE-LIKEC4'), join(PACKAGE, 'LICENSE-LIKEC4'));
writeFileSync(join(PACKAGE, 'THIRD-PARTY-NOTICES.md'), thirdPartyNotices());
