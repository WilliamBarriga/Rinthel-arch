/**
 * Benchmark de los umbrales del ADR 0003. Fuera de la suite por defecto:
 * `pnpm bench` (construye los paquetes y corre todo) o, ya construido,
 * `node bench/ejecutar.ts [escenario...]` con escenarios entre `build-10k`,
 * `relayout-1k`, `relayout-slots`, `colapso-5k` y `bundle`. Cada escenario corre en un proceso
 * aparte (memoria maxima propia) y el exit code es 1 si algun umbral falla.
 *
 * Los umbrales son los del ADR 0003 (con su enmienda): 2.5 GiB de RSS en el
 * build de 10k Nodos y 500 KiB por artefacto de bundle. Los tiempos dependen de la maquina y de su carga.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

type Medidas = Record<string, number>;

interface Umbral {
  escenario: string;
  descripcion: string;
  /** Medida contra el limite, con su unidad. */
  medida: (m: Medidas) => number;
  limite: number;
  unidad: string;
}

const UMBRALES: readonly Umbral[] = [
  { escenario: 'build-10k', descripcion: 'build de una Vista de 10k Nodos: tiempo', medida: (m) => m['tiempoMs']! / 1000, limite: 60, unidad: 's' },
  { escenario: 'build-10k', descripcion: 'build de una Vista de 10k Nodos: memoria maxima (RSS)', medida: (m) => m['maxRssMb']!, limite: 2560, unidad: 'MiB' },
  { escenario: 'relayout-1k', descripcion: 'relayout interactivo con 1k Nodos visibles (en frio)', medida: (m) => m['tiempoFrioMs']! / 1000, limite: 2, unidad: 's' },
  { escenario: 'relayout-1k', descripcion: 'relayout interactivo con 1k Nodos visibles (en caliente)', medida: (m) => m['tiempoCalienteMs']! / 1000, limite: 2, unidad: 's' },
  { escenario: 'relayout-slots', descripcion: 'relayout con 500 Nodos y Slots anidados (en frio)', medida: (m) => m['tiempoFrioMs']! / 1000, limite: 2, unidad: 's' },
  { escenario: 'relayout-slots', descripcion: 'relayout con 500 Nodos y Slots anidados (en caliente)', medida: (m) => m['tiempoCalienteMs']! / 1000, limite: 2, unidad: 's' },
  { escenario: 'colapso-5k', descripcion: 'colapso (expandir) con 5k Nodos del Modelo', medida: (m) => m['expandirMs']! / 1000, limite: 3, unidad: 's' },
  { escenario: 'colapso-5k', descripcion: 'colapso (cerrar) con 5k Nodos del Modelo', medida: (m) => m['colapsarMs']! / 1000, limite: 3, unidad: 's' },
  { escenario: 'bundle', descripcion: 'bundle del shell: Worker (gzip)', medida: (m) => m['workerGzipKb']!, limite: 500, unidad: 'KiB' },
  { escenario: 'bundle', descripcion: 'bundle del shell: pagina sin ELK (gzip)', medida: (m) => m['paginaGzipKb']!, limite: 500, unidad: 'KiB' },
];

const TODOS = [...new Set(UMBRALES.map((u) => u.escenario))];
const pedidos = process.argv.slice(2);
const escenarios = pedidos.length === 0 ? TODOS : pedidos;
const desconocido = escenarios.find((e) => !TODOS.includes(e));
if (desconocido !== undefined) {
  process.stderr.write(`Escenario desconocido '${desconocido}'. Escenarios: ${TODOS.join(', ')}\n`);
  process.exit(2);
}

const medidas = new Map<string, Medidas>();
for (const escenario of escenarios) {
  process.stderr.write(`Corriendo ${escenario}...\n`);
  const resultado = spawnSync(process.execPath, [join(import.meta.dirname, 'escenario.ts'), escenario], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (resultado.status !== 0) {
    process.stderr.write(`${escenario} fallo (codigo ${resultado.status}):\n${resultado.stderr}${resultado.stdout}`);
    process.exit(2);
  }
  medidas.set(escenario, (JSON.parse(resultado.stdout) as { medidas: Medidas }).medidas);
  process.stdout.write(`${escenario}: ${JSON.stringify(medidas.get(escenario))}\n`);
}

let fallos = 0;
process.stdout.write('\nUmbrales (ADR 0003)\n');
for (const umbral of UMBRALES.filter((u) => medidas.has(u.escenario))) {
  const valor = umbral.medida(medidas.get(umbral.escenario)!);
  const cumple = valor < umbral.limite;
  if (!cumple) fallos++;
  process.stdout.write(`${cumple ? 'OK   ' : 'FALLA'} ${umbral.descripcion}: ${valor.toFixed(1)} ${umbral.unidad} (limite ${umbral.limite} ${umbral.unidad})\n`);
}
process.exit(fallos === 0 ? 0 : 1);
