/**
 * One benchmark scenario, in its own process so that `maxRSS` is its own.
 * Usage: `node bench/scenario.ts <scenario>`; prints a JSON line `{ scenario, measures }`.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';

import { resolveView } from 'canonical';
import type { CollapseState, CanonicalForm, Node, Theme, SequenceView } from 'canonical';
import { run } from 'cli';
import { compile } from 'dsl';
import { layoutView } from 'layout';
import { NEUTRAL_THEME } from 'theme';
import { workerAdapter, serveLayout } from 'shell';
import type { LayoutPort } from 'shell';

import { buildDevUi } from 'dev-ui/build';
import { generateSequence, generateWorkspace } from './generator.ts';

const SCENARIOS = ['build-10k', 'relayout-1k', 'relayout-slots', 'relayout-large', 'collapse-5k', 'sequence-large', 'bundle'] as const;
type Scenario = (typeof SCENARIOS)[number];

const ms = (since: number): number => Math.round(performance.now() - since);
const mb = (bytes: number): number => Math.round(bytes / 1024 / 1024);
const kb = (bytes: number): number => Math.round((bytes / 1024) * 10) / 10;

function countNodes(nodes: readonly { children: readonly unknown[] }[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children as typeof nodes), 0);
}

function compileNodes(nodes: number): CanonicalForm {
  const { canonical, issues } = compile(generateWorkspace({ nodes }));
  if (canonical === undefined) throw new Error(`The synthetic Workspace does not compile: ${JSON.stringify(issues.slice(0, 3))}`);
  return canonical;
}

/** Pair of in-memory ports that copy messages like a Worker (structured clone, asynchronous). */
function portPair(): [LayoutPort, LayoutPort] {
  const create = (): LayoutPort & { target?: LayoutPort } => {
    const port: LayoutPort & { target?: LayoutPort } = {
      onmessage: null,
      postMessage(message) {
        const copy = structuredClone(message);
        setTimeout(() => port.target?.onmessage?.({ data: copy }), 0);
      },
    };
    return port;
  };
  const a = create();
  const b = create();
  a.target = b;
  b.target = a;
  return [a, b];
}

async function build10k(): Promise<Record<string, number>> {
  const folder = mkdtempSync(join(tmpdir(), 'bench-build-'));
  try {
    const files = generateWorkspace({ nodes: 10_000 });
    for (const [path, text] of Object.entries(files)) writeFileSync(join(folder, path), text);
    const start = performance.now();
    const { exitCode, stdout, stderr } = await run(['build', '--workspace', folder]);
    const timeMs = ms(start);
    if (exitCode !== 0) throw new Error(`build exited with ${exitCode}: ${stdout}${stderr}`);
    return { nodes: 10_000, timeMs, maxRssMb: mb(process.resourceUsage().maxRSS * 1024) };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const THEME: Theme = NEUTRAL_THEME;

async function relayout(source: CanonicalForm, state: CollapseState, adapter: ReturnType<typeof workerAdapter>, theme: Theme = THEME) {
  const start = performance.now();
  const view = resolveView(source, 'all', state)!;
  const resolutionMs = ms(start);
  await adapter(view, theme);
  return { view, resolutionMs, totalMs: ms(start) };
}

async function relayout1k(): Promise<Record<string, number>> {
  const source = compileNodes(1000);
  const [page, worker] = portPair();
  serveLayout(worker);
  const adapter = workerAdapter(page);
  const cold = await relayout(source, {}, adapter);
  const warm = await relayout(source, {}, adapter);
  // Without a Worker: the same layout called directly, to separate the cost of the messages.
  const start = performance.now();
  await layoutView(cold.view, THEME);
  return {
    visibleNodes: cold.view.nodes.length,
    coldTimeMs: cold.totalMs,
    warmTimeMs: warm.totalMs,
    directLayoutMs: ms(start),
    maxRssMb: mb(process.resourceUsage().maxRSS * 1024),
  };
}

/** Slots nested three levels: the reasonable worst case of `placeInBox`, which runs per Node on every relayout. */
const NESTED_SLOTS = {
  direccion: 'column',
  gap: 4,
  pad: 8,
  hijos: [
    {
      direccion: 'row',
      gap: 6,
      pad: 2,
      hijos: [
        { slot: 'icon' },
        {
          direccion: 'column',
          gap: 2,
          pad: 0,
          hijos: [{ slot: 'title' }, { direccion: 'row', gap: 4, pad: 0, hijos: [{ slot: 'badge', align: 'start' }, { slot: 'counter', align: 'end' }] }],
        },
      ],
    },
    { direccion: 'column', gap: 2, pad: 0, hijos: [{ slot: 'desc' }, { direccion: 'row', gap: 4, pad: 0, hijos: [{ slot: 'footer' }] }] },
    { slot: 'attrs' },
  ],
} as const;

/** Against the same Model with the flat arrangement of the neutral Theme. */
async function relayoutWithNestedSlots(nodes: number): Promise<Record<string, number>> {
  const source = compileNodes(nodes);
  const nested = { ...NEUTRAL_THEME, nodo: { ...NEUTRAL_THEME.nodo, slots: NESTED_SLOTS } } as unknown as Theme;
  const [page, worker] = portPair();
  serveLayout(worker);
  const adapter = workerAdapter(page);
  const neutral = await relayout(source, {}, adapter);
  const cold = await relayout(source, {}, adapter, nested);
  const warm = await relayout(source, {}, adapter, nested);
  return {
    modelNodes: countNodes(source.model.nodes),
    visibleNodes: cold.view.nodes.length,
    neutralTimeMs: neutral.totalMs,
    coldTimeMs: cold.totalMs,
    warmTimeMs: warm.totalMs,
    maxRssMb: mb(process.resourceUsage().maxRSS * 1024),
  };
}

async function collapse5k(): Promise<Record<string, number>> {
  const source = compileNodes(5000);
  const roots = source.model.nodes.filter((n: Node) => n.children.length > 0).map((n: Node) => n.id);
  const [page, worker] = portPair();
  serveLayout(worker);
  const adapter = workerAdapter(page);

  // Initial state: every root closed (a 5k Model is not expanded whole: the shell cap is ~1k).
  const closed: CollapseState = { collapsed: roots };
  const initial = await relayout(source, closed, adapter);
  const largest = [...source.model.nodes].sort((a, b) => countNodes([b]) - countNodes([a]))[0]!;
  const open: CollapseState = { collapsed: roots.filter((id: string) => id !== largest.id), expanded: [largest.id] };
  const expand = await relayout(source, open, adapter);
  const collapse = await relayout(source, closed, adapter);
  return {
    modelNodes: countNodes(source.model.nodes),
    visibleClosed: initial.view.nodes.length,
    visibleOpen: expand.view.nodes.length,
    initialLayoutMs: initial.totalMs,
    expandMs: expand.totalMs,
    expandResolutionMs: expand.resolutionMs,
    collapseMs: collapse.totalMs,
    maxRssMb: mb(process.resourceUsage().maxRSS * 1024),
  };
}

/** Best of 3 runs after a warm-up one. */
async function largeSequence(): Promise<Record<string, number>> {
  const { canonical, issues } = compile(generateSequence({ messages: 1000, lifelines: 50, depth: 3 }));
  if (canonical === undefined) throw new Error(`The synthetic Interaction does not compile: ${JSON.stringify(issues.slice(0, 3))}`);
  const view = resolveView(canonical, 'sequence') as SequenceView;
  const start = performance.now();
  await layoutView(view, THEME);
  const coldMs = ms(start);
  const runs: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    await layoutView(view, THEME);
    runs.push(ms(t));
  }
  return { messages: view.interaction.messages.length, lifelines: view.nodes.length, coldTimeMs: coldMs, timeMs: Math.min(...runs), maxRssMb: mb(process.resourceUsage().maxRSS * 1024) };
}

/** Static imports (`import ... from"./x.js"`) of an ES module of the build, as paths relative to `root`. */
function staticImports(root: string, file: string): string[] {
  const text = readFileSync(join(root, file), 'utf8');
  return [...text.matchAll(/(?:^|;)import\s*(?:\{[^}]*\}\s*from\s*)?"\.\/([^"]+)"/g)].map((m) => join(dirname(file), m[1]!));
}

/** `file` and everything it imports statically (what the browser downloads before running it). */
function closure(root: string, file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const other of staticImports(root, file)) closure(root, other, seen);
  return seen;
}

async function shellBundle(): Promise<Record<string, number>> {
  // The real `dev` page as `dev-ui` builds it (`dev.tsx`, ES module with chunks) and the Worker (ELK, without zod).
  const output = mkdtempSync(join(tmpdir(), 'rinthel-bundle-'));
  try {
    await buildDevUi({ output });
    const gzip = (files: Iterable<string>): number => [...files].reduce((total, f) => total + gzipSync(readFileSync(join(output, f)), { level: 9 }).length, 0);
    const initial = closure(output, 'page.js');
    const code = readdirSync(join(output, 'chunks')).find((t) => t.startsWith('code-panel-'));
    const editorOnly = code === undefined ? [] : [...closure(output, `chunks/${code}`)].filter((f) => !initial.has(f));
    const worker = gzip(['worker.js']);
    // Floor: what elkjs weighs split into api (page) + worker, with nothing of ours.
    const lib = join(import.meta.dirname, '..', 'packages', 'layout', 'node_modules', 'elkjs', 'lib');
    const elkApi = gzipSync(readFileSync(join(lib, 'elk-api.js')), { level: 9 }).length;
    const elkWorker = gzipSync(readFileSync(join(lib, 'elk-worker.min.js')), { level: 9 }).length;
    return {
      pageGzipKb: kb(gzip(initial)),
      editorGzipKb: kb(gzip(editorOnly)),
      workerGzipKb: kb(worker),
      totalGzipKb: kb(gzip(initial) + worker),
      elkApiPlusWorkerGzipKb: kb(elkApi + elkWorker),
    };
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}

const scenario = process.argv[2] as Scenario | undefined;
if (scenario === undefined || !SCENARIOS.includes(scenario)) {
  process.stderr.write(`Usage: node bench/scenario.ts <${SCENARIOS.join('|')}>\n`);
  process.exit(2);
}
const runners: Record<Scenario, () => Promise<Record<string, number>>> = {
  'build-10k': build10k,
  'relayout-1k': relayout1k,
  'relayout-slots': () => relayoutWithNestedSlots(500),
  'relayout-large': () => relayoutWithNestedSlots(3000),
  'collapse-5k': collapse5k,
  'sequence-large': largeSequence,
  bundle: shellBundle,
};
const measures = await runners[scenario]();
process.stdout.write(`${JSON.stringify({ scenario, measures })}\n`);
