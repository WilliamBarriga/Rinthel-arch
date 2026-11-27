/**
 * Benchmark of the ADR 0003 thresholds, outside `pnpm test`: `pnpm bench` or, once built, `node bench/run.ts [scenario...]`.
 * Each scenario runs in its own process; it exits 1 if any threshold fails. Times depend on the machine and its load.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

type Measures = Record<string, number>;

interface Threshold {
  scenario: string;
  description: string;
  /** In the unit of the limit. */
  measure: (m: Measures) => number;
  limit: number;
  unit: string;
}

const THRESHOLDS: readonly Threshold[] = [
  { scenario: 'build-10k', description: 'build of a 10k Node View: time', measure: (m) => m['timeMs']! / 1000, limit: 60, unit: 's' },
  { scenario: 'build-10k', description: 'build of a 10k Node View: peak memory (RSS)', measure: (m) => m['maxRssMb']!, limit: 2560, unit: 'MiB' },
  { scenario: 'relayout-1k', description: 'interactive relayout with 1k visible Nodes (cold)', measure: (m) => m['coldTimeMs']! / 1000, limit: 2, unit: 's' },
  { scenario: 'relayout-1k', description: 'interactive relayout with 1k visible Nodes (warm)', measure: (m) => m['warmTimeMs']! / 1000, limit: 2, unit: 's' },
  { scenario: 'relayout-slots', description: 'relayout with 500 Nodes and nested Slots (cold)', measure: (m) => m['coldTimeMs']! / 1000, limit: 2, unit: 's' },
  { scenario: 'relayout-slots', description: 'relayout with 500 Nodes and nested Slots (warm)', measure: (m) => m['warmTimeMs']! / 1000, limit: 2, unit: 's' },
  { scenario: 'relayout-large', description: 'relayout with 3000 Nodes with nested Groups and Slots (cold)', measure: (m) => m['coldTimeMs']! / 1000, limit: 8, unit: 's' },
  { scenario: 'relayout-large', description: 'relayout with 3000 Nodes with nested Groups and Slots (warm)', measure: (m) => m['warmTimeMs']! / 1000, limit: 8, unit: 's' },
  { scenario: 'collapse-5k', description: 'collapse (expand) with 5k Model Nodes', measure: (m) => m['expandMs']! / 1000, limit: 3, unit: 's' },
  { scenario: 'collapse-5k', description: 'collapse (close) with 5k Model Nodes', measure: (m) => m['collapseMs']! / 1000, limit: 3, unit: 's' },
  { scenario: 'sequence-large', description: 'sequence layout with 1000 Messages, 50 Lifelines and Fragments 3 levels deep (cold)', measure: (m) => m['coldTimeMs']! / 1000, limit: 0.5, unit: 's' },
  { scenario: 'sequence-large', description: 'sequence layout with 1000 Messages, 50 Lifelines and Fragments 3 levels deep (warm)', measure: (m) => m['timeMs']! / 1000, limit: 0.5, unit: 's' },
  { scenario: 'bundle', description: 'shell bundle: Worker (gzip)', measure: (m) => m['workerGzipKb']!, limit: 1024, unit: 'KiB' },
  { scenario: 'bundle', description: 'dev page: initial load without ELK or editor (gzip)', measure: (m) => m['pageGzipKb']!, limit: 500, unit: 'KiB' },
  { scenario: 'bundle', description: 'dev page: editor chunk, when opening Code (gzip)', measure: (m) => m['editorGzipKb']!, limit: 200, unit: 'KiB' },
];

const ALL = [...new Set(THRESHOLDS.map((t) => t.scenario))];
const requested = process.argv.slice(2);
const scenarios = requested.length === 0 ? ALL : requested;
const unknown = scenarios.find((s) => !ALL.includes(s));
if (unknown !== undefined) {
  process.stderr.write(`Unknown scenario '${unknown}'. Scenarios: ${ALL.join(', ')}\n`);
  process.exit(2);
}

const measures = new Map<string, Measures>();
for (const scenario of scenarios) {
  process.stderr.write(`Running ${scenario}...\n`);
  const result = spawnSync(process.execPath, [join(import.meta.dirname, 'scenario.ts'), scenario], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stderr.write(`${scenario} failed (code ${result.status}):\n${result.stderr}${result.stdout}`);
    process.exit(2);
  }
  measures.set(scenario, (JSON.parse(result.stdout) as { measures: Measures }).measures);
  process.stdout.write(`${scenario}: ${JSON.stringify(measures.get(scenario))}\n`);
}

let failures = 0;
process.stdout.write('\nThresholds (ADR 0003)\n');
for (const threshold of THRESHOLDS.filter((t) => measures.has(t.scenario))) {
  const value = threshold.measure(measures.get(threshold.scenario)!);
  const passes = value < threshold.limit;
  if (!passes) failures++;
  process.stdout.write(`${passes ? 'OK  ' : 'FAIL'} ${threshold.description}: ${value.toFixed(1)} ${threshold.unit} (limit ${threshold.limit} ${threshold.unit})\n`);
}
process.exit(failures === 0 ? 0 : 1);
