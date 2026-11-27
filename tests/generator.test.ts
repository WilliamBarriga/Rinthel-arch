import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonical';
import type { Node, SequenceView } from 'canonical';
import { compile } from 'dsl';

import { generateSequence, generateWorkspace } from '../bench/generator';

const count = (nodes: readonly Node[]): number => nodes.reduce((sum, node) => sum + 1 + count(node.children), 0);
const depth = (nodes: readonly Node[]): number => nodes.reduce((max, node) => Math.max(max, 1 + depth(node.children)), 0);

describe('generateWorkspace', () => {
  it.each([1, 10, 137, 1000])('compiles without issues and has exactly %i Nodes', (nodes) => {
    const { issues, canonical } = compile(generateWorkspace({ nodes }));

    expect(issues).toEqual([]);
    expect(count(canonical!.model.nodes)).toBe(nodes);
  });

  it('is deterministic: same input, same files; another seed, another graph', () => {
    expect(generateWorkspace({ nodes: 200 })).toEqual(generateWorkspace({ nodes: 200 }));
    expect(generateWorkspace({ nodes: 200, seed: 2 })).not.toEqual(generateWorkspace({ nodes: 200 }));
  });

  it('generates nested Groups and Edges in proportion to the Nodes', () => {
    const { canonical } = compile(generateWorkspace({ nodes: 500, edgesPerNode: 2 }));

    expect(depth(canonical!.model.nodes)).toBeGreaterThanOrEqual(3);
    expect(canonical!.model.edges).toHaveLength(1000);
  });

  it('declares a View that includes the whole Model', () => {
    const { canonical } = compile(generateWorkspace({ nodes: 20 }));

    expect(canonical!.views.map((view) => view.id)).toEqual(['all']);
    expect(canonical!.views[0]!.include).toEqual(['**']);
  });

  it('is generic: it does not mention Rinthel', () => {
    expect(JSON.stringify(generateWorkspace({ nodes: 50 })).toLowerCase()).not.toContain('rinthel');
  });
});

describe('generateSequence', () => {
  const generate = (messages: number) => compile(generateSequence({ messages }));

  it.each([1, 30, 1000])('compiles without issues and has exactly %i Messages', (messages) => {
    const { issues, canonical } = generate(messages);

    expect(issues).toEqual([]);
    const view = resolveView(canonical!, 'sequence') as SequenceView;
    expect(view.interaction.messages).toHaveLength(messages);
  });

  it('has 50 Lifelines and Fragments nested three levels', () => {
    const view = resolveView(generate(1000).canonical!, 'sequence') as SequenceView;

    expect(view.nodes).toHaveLength(50);
    const deepest = Math.max(...view.interaction.messages.map((m) => m.scope?.length ?? 0));
    expect(deepest).toBe(3);
  });

  it('is deterministic: same input, same files; another seed, another Interaction', () => {
    expect(generateSequence({ messages: 200 })).toEqual(generateSequence({ messages: 200 }));
    expect(generateSequence({ messages: 200, seed: 2 })).not.toEqual(generateSequence({ messages: 200 }));
  });
});
