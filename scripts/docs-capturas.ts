/**
 * Regenera los PNG de `docs/img/` (`pnpm docs:capturas`; necesita `pnpm build` y Chromium): Temas, pasos del
 * tutorial, Vistas `sequence`/`er` del paso 6 y la UI de `dev` (`scripts/capturas-estudio.ts`).
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const TEMAS = ['soft-card', 'glass-chip', 'neobrutalist', 'blueprint', 'soft-light', 'crt-terminal', 'synthwave', 'editorial', 'bauhaus', 'sticky-notes', 'keycaps', 'metro-map', 'pcb', 'pixel-art'];
// Cada paso se captura con el Tema que declara (los dos primeros, el incorporado `neutral`).
const PASOS = [
  { paso: 1, tema: 'neutral' },
  { paso: 2, tema: 'neutral' },
  { paso: 3, tema: 'neutral-dark' },
  { paso: 4, tema: 'shop' },
  { paso: 5, tema: 'neon' },
];

function capturar(args: string[], script = 'scripts/capturas.ts'): void {
  const r = spawnSync(process.execPath, [resolve(REPO, script), ...args], { cwd: REPO, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

capturar(['--workspace', 'examples/rinthel-arch', '--view', 'open', '--out', 'docs/img/temas', '--height', '640', '--scale', '1.5', ...TEMAS]);
for (const { paso, tema } of PASOS) {
  capturar(['--workspace', `examples/tutorial/step-${paso}`, '--view', 'main', '--out', 'docs/img/tutorial', '--width', '1100', '--height', '280', '--prefix', `step-${paso}-`, tema]);
}

// Sin Pasos: una Vista con Pasos captura vacia en el Paso 0.
const PASO_6 = ['--workspace', 'examples/tutorial/step-6', '--width', '1100', '--height', '560'];
for (const [vista, nombre] of [['purchase-sequence', 'sequence'], ['tables', 'er']] as const) {
  capturar([...PASO_6, '--view', vista, '--out', 'docs/img/tutorial', '--prefix', `step-6-${nombre}-`, 'shop']);
  capturar([...PASO_6, '--view', vista, '--out', 'docs/img/tipos', '--prefix', `${nombre}-`, 'shop']);
}

capturar(['--out', 'docs/img/estudio'], 'scripts/capturas-estudio.ts');
