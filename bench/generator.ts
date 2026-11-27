/**
 * Synthetic Workspaces for the ADR 0003 thresholds. `generateWorkspace` gives exactly `nodes` Nodes in an almost
 * complete forest (10k Nodes are 4-5 levels), Edges between leaves and an `all` View with the whole Model.
 * Deterministic: same input, same files (seeded PRNG, no clock).
 */
export interface GeneratorOptions {
  /** Groups and leaves, at least 1. */
  nodes: number;
  /** 1.5 by default. */
  edgesPerNode?: number;
  /** Children per Group; 8 by default. */
  branches?: number;
  /** 10 by default; never more than `nodes`. */
  roots?: number;
  /** 1 by default. */
  seed?: number;
}

/** mulberry32. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INDENT = '  ';

export function generateWorkspace(options: GeneratorOptions): Record<string, string> {
  const { nodes, edgesPerNode = 1.5, branches = 8, seed = 1 } = options;
  const roots = Math.min(options.roots ?? 10, nodes);
  const random = prng(seed);

  // Node i >= roots hangs from floor((i - roots) / branches): the parent always comes first.
  const children: number[][] = Array.from({ length: nodes }, () => []);
  for (let i = roots; i < nodes; i++) children[Math.floor((i - roots) / branches)]!.push(i);

  const ids: string[] = Array.from({ length: nodes });
  const lines: string[] = [];
  const emit = (i: number, prefix: string, level: number): void => {
    const local = `n${i}`;
    ids[i] = prefix === '' ? local : `${prefix}.${local}`;
    const indent = INDENT.repeat(level);
    if (children[i]!.length === 0) {
      lines.push(`${indent}service ${local} "Service ${i}"`);
      return;
    }
    lines.push(`${indent}module ${local} "Module ${i}" {`);
    for (const child of children[i]!) emit(child, ids[i]!, level + 1);
    lines.push(`${indent}}`);
  };
  for (let i = 0; i < roots; i++) emit(i, '', 1);

  const leaves = children.flatMap((c, i) => (c.length === 0 ? [i] : []));
  const target = Math.min(Math.round(nodes * edgesPerNode), leaves.length * (leaves.length - 1));
  const seen = new Set<string>();
  const edges: string[] = [];
  while (edges.length < target) {
    const a = Math.floor(random() * leaves.length);
    // 80% of the Edges are local (neighbor leaves); the rest cross the graph.
    const b = random() < 0.8 ? a + 1 + Math.floor(random() * 8) : Math.floor(random() * leaves.length);
    if (b >= leaves.length || b === a || seen.has(`${a}>${b}`)) continue;
    seen.add(`${a}>${b}`);
    edges.push(`${INDENT}${ids[leaves[a]!]} -> ${ids[leaves[b]!]}`);
  }

  const text = [
    'specification {',
    `${INDENT}node service`,
    `${INDENT}node module`,
    '}',
    '',
    'model {',
    ...lines,
    ...edges,
    '}',
    '',
    'view all {',
    `${INDENT}type architecture`,
    `${INDENT}include **`,
    '}',
    '',
  ].join('\n');
  return { 'main.dg': text };
}

export interface SequenceOptions {
  /** At least 1. */
  messages: number;
  /** 50 by default, at least 2. */
  lifelines?: number;
  /** Maximum Fragment nesting; 3 by default. */
  depth?: number;
  /** 1 by default. */
  seed?: number;
}

/** A `sequence` View of the `large` Interaction with nested Fragments (opt, loop, alt, par). Deterministic. */
export function generateSequence(options: SequenceOptions): Record<string, string> {
  const { messages, lifelines = 50, depth = 3, seed = 1 } = options;
  const random = prng(seed);
  const lines: string[] = [];
  let remaining = messages;
  const integer = (n: number): number => Math.floor(random() * n);
  const message = (level: number): void => {
    const from = integer(lifelines);
    const to = (from + 1 + integer(lifelines - 1)) % lifelines;
    lines.push(`${INDENT.repeat(level)}l${from} -> l${to} "m${messages - remaining}"`);
    remaining--;
  };
  const fragment = (level: number, fragmentLevel: number): void => {
    const indent = INDENT.repeat(level);
    const operator = ['opt', 'loop', 'alt', 'par'][integer(4)]!;
    const separator = operator === 'par' ? 'and' : 'else';
    const operands = operator === 'alt' || operator === 'par' ? 2 : 1;
    for (let k = 0; k < operands; k++) {
      lines.push(k === 0 ? `${indent}${operator} "g${remaining}" {` : `${indent}} ${separator} "g${remaining}" {`);
      const own = 2 + integer(3);
      for (let i = 0; i < own && remaining > 0; i++) message(level + 1);
      if (fragmentLevel < depth && remaining > 0) fragment(level + 1, fragmentLevel + 1);
      if (remaining > 0) message(level + 1);
    }
    lines.push(`${indent}}`);
  };
  while (remaining > 0) {
    for (let i = 0; i < 4 && remaining > 0; i++) message(2);
    if (remaining > 0) fragment(2, 1);
  }

  const text = [
    'specification {',
    `${INDENT}node service`,
    '}',
    '',
    'model {',
    ...Array.from({ length: lifelines }, (_, i) => `${INDENT}service l${i} "Service ${i}"`),
    `${INDENT}interaction large {`,
    ...lines,
    `${INDENT}}`,
    '}',
    '',
    'view sequence {',
    `${INDENT}type sequence`,
    `${INDENT}interaction large`,
    '}',
    '',
  ].join('\n');
  return { 'main.dg': text };
}
