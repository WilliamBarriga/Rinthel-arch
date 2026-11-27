/**
 * Regenerates the PNGs of `docs/img/` (`pnpm docs:screenshots`; needs `pnpm build` and Chromium): Themes, tutorial
 * steps, the `sequence`/`er` Views of step 6 and the `dev` UI (`scripts/screenshots-dev-ui.ts`).
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const THEMES = ['soft-card', 'glass-chip', 'neobrutalist', 'blueprint', 'soft-light', 'crt-terminal', 'synthwave', 'editorial', 'bauhaus', 'sticky-notes', 'keycaps', 'metro-map', 'pcb', 'pixel-art'];
// Each step is captured with the Theme it declares (the first two, the built-in `neutral`).
const STEPS = [
  { step: 1, theme: 'neutral' },
  { step: 2, theme: 'neutral' },
  { step: 3, theme: 'neutral-dark' },
  { step: 4, theme: 'shop' },
  { step: 5, theme: 'neon' },
];

function capture(args: string[], script = 'scripts/screenshots.ts'): void {
  const r = spawnSync(process.execPath, [resolve(REPO, script), ...args], { cwd: REPO, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

capture(['--workspace', 'examples/rinthel-arch', '--view', 'open', '--out', 'docs/img/themes', '--height', '640', '--scale', '1.5', ...THEMES]);
for (const { step, theme } of STEPS) {
  capture(['--workspace', `examples/tutorial/step-${step}`, '--view', 'main', '--out', 'docs/img/tutorial', '--width', '1100', '--height', '280', '--prefix', `step-${step}-`, theme]);
}

// Without Steps: a View with Steps captures empty at Step 0.
const STEP_6 = ['--workspace', 'examples/tutorial/step-6', '--width', '1100', '--height', '560'];
for (const [view, name] of [['purchase-sequence', 'sequence'], ['tables', 'er']] as const) {
  capture([...STEP_6, '--view', view, '--out', 'docs/img/tutorial', '--prefix', `step-6-${name}-`, 'shop']);
  capture([...STEP_6, '--view', view, '--out', 'docs/img/diagram-types', '--prefix', `${name}-`, 'shop']);
}

capture(['--out', 'docs/img/dev-ui'], 'scripts/screenshots-dev-ui.ts');
