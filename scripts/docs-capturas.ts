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
  { paso: 4, tema: 'tienda' },
  { paso: 5, tema: 'neon' },
];

function capturar(args: string[], script = 'scripts/capturas.ts'): void {
  const r = spawnSync(process.execPath, [resolve(REPO, script), ...args], { cwd: REPO, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

capturar(['--workspace', 'examples/rinthel-arch', '--vista', 'abierto', '--salida', 'docs/img/temas', '--alto', '640', '--escala', '1.5', ...TEMAS]);
for (const { paso, tema } of PASOS) {
  capturar(['--workspace', `examples/tutorial/paso-${paso}`, '--vista', 'principal', '--salida', 'docs/img/tutorial', '--ancho', '1100', '--alto', '280', '--prefijo', `paso-${paso}-`, tema]);
}

// Sin Pasos: una Vista con Pasos captura vacia en el Paso 0.
const PASO_6 = ['--workspace', 'examples/tutorial/paso-6', '--ancho', '1100', '--alto', '560'];
for (const [vista, nombre] of [['comprar-secuencia', 'secuencia'], ['tablas', 'er']] as const) {
  capturar([...PASO_6, '--vista', vista, '--salida', 'docs/img/tutorial', '--prefijo', `paso-6-${nombre}-`, 'tienda']);
  capturar([...PASO_6, '--vista', vista, '--salida', 'docs/img/tipos', '--prefijo', `${nombre}-`, 'tienda']);
}

capturar(['--salida', 'docs/img/estudio'], 'scripts/capturas-estudio.ts');
