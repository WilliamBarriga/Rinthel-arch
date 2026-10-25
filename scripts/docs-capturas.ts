/**
 * Regenera los PNG de la documentacion en `docs/img/` (necesita `pnpm build` y Chromium; ver `capturas.ts`):
 *   - `docs/img/temas/<tema>.png`: la Vista `abierto` de `examples/rinthel-arch` con cada uno de los 14 Temas.
 *   - `docs/img/tutorial/paso-<n>-<tema>.png`: la Vista `principal` de cada paso de `examples/tutorial`.
 * Uso: `pnpm docs:capturas`. No forma parte de `pnpm test`.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const TEMAS = ['soft-card', 'glass-chip', 'neobrutalist', 'blueprint', 'claro-suave', 'crt-terminal', 'synthwave', 'editorial', 'bauhaus', 'sticky-notes', 'keycaps', 'metro-map', 'pcb', 'pixel-art'];
// Cada paso del tutorial se captura con el Tema que declara (el primero y el segundo, el incorporado `neutral`).
const PASOS = [
  { paso: 1, tema: 'neutral' },
  { paso: 2, tema: 'neutral' },
  { paso: 3, tema: 'neutral-dark' },
  { paso: 4, tema: 'tienda' },
  { paso: 5, tema: 'neon' },
];

function capturar(args: string[]): void {
  const r = spawnSync(process.execPath, [resolve(REPO, 'scripts/capturas.ts'), ...args], { cwd: REPO, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

capturar(['--workspace', 'examples/rinthel-arch', '--vista', 'abierto', '--salida', 'docs/img/temas', '--alto', '640', '--escala', '1.5', ...TEMAS]);
for (const { paso, tema } of PASOS) {
  capturar(['--workspace', `examples/tutorial/paso-${paso}`, '--vista', 'principal', '--salida', 'docs/img/tutorial', '--ancho', '1100', '--alto', '280', '--prefijo', `paso-${paso}-`, tema]);
}
