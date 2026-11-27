import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, edgeId, resolveView, revealAt } from 'canonical';

const node = (id: string, children: unknown[] = []) => ({
  id,
  type: 'servicio',
  title: id,
  description: '',
  children,
});

/** a { a1 a2 }, b, c; edges a.a1 -> b, b -> c */
function view(extraView: Record<string, unknown>, state = {}) {
  const source = canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: {
      nodes: [node('a', [node('a.a1'), node('a.a2')]), node('b'), node('c')],
      edges: [
        { from: { node: 'a.a1' }, to: { node: 'b' } },
        { from: { node: 'b' }, to: { node: 'c' } },
      ],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], ...extraView }],
  });
  const resolved = resolveView(source, 'v', state);
  if (resolved === undefined) throw new Error('View not found');
  return resolved;
}

const show = (...selectors: string[]) => selectors.map((selector) => ({ selector }));
const step = (title: string, show: unknown[], hide: unknown[] = []) => ({ title, show, hide });

const AB = edgeId({ from: { node: 'a.a1' }, to: { node: 'b' } });
const BC = edgeId({ from: { node: 'b' }, to: { node: 'c' } });

describe('revealAt', () => {
  it('without steps everything is revealed at any position', () => {
    const visibility = revealAt(view({}), 0);

    expect(['a', 'a.a1', 'b', 'c', AB, BC].map(visibility)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(revealAt(view({}), 7)('b')).toBe(1);
  });

  it('an integer position k applies Steps 1..k: only 0 and 1', () => {
    const v = view({ steps: [step('uno', show('b')), step('dos', show('c'))] });

    expect(['b', 'c'].map(revealAt(v, 0))).toEqual([0, 0]);
    expect(['b', 'c'].map(revealAt(v, 1))).toEqual([1, 0]);
    expect(['b', 'c'].map(revealAt(v, 2))).toEqual([1, 1]);
  });

  it('an out-of-range position is clamped to the existing Steps', () => {
    const v = view({ steps: [step('uno', show('b'))] });

    expect(revealAt(v, 9)('b')).toBe(1);
    expect(revealAt(v, -3)('b')).toBe(0);
  });

  it('visibility is always 0 or 1: a fraction does not interpolate, it applies the previous whole Step', () => {
    const v = view({ steps: [step('uno', show('b')), step('dos', show('c'))] });

    expect(['b', 'c'].map(revealAt(v, 0.25))).toEqual([0, 0]);
    expect(['b', 'c'].map(revealAt(v, 1.5))).toEqual([1, 0]);
    expect(['b', 'c'].map(revealAt(v, 1.99))).toEqual([1, 0]);
  });

  it('what came before stays visible (cumulative) and hide hides it', () => {
    const v = view({ steps: [step('uno', show('b', 'c')), step('dos', [], show('b'))] });

    expect(['b', 'c'].map(revealAt(v, 1))).toEqual([1, 1]);
    expect(['b', 'c'].map(revealAt(v, 2))).toEqual([0, 1]);
  });

  it('naming a Group does not reveal its children; `a.*` reveals the Group and its direct children', () => {
    const v = view({ steps: [step('uno', show('a')), step('dos', show('a.*'))] });

    expect(['a', 'a.a1', 'a.a2'].map(revealAt(v, 1))).toEqual([1, 0, 0]);
    expect(['a', 'a.a1', 'a.a2'].map(revealAt(v, 2))).toEqual([1, 1, 1]);
  });

  it('`a.*` reveals Group `a` even if it was not named before', () => {
    const v = view({ steps: [step('uno', show('a.*'))] });

    expect(['a', 'a.a1', 'a.a2', 'b'].map(revealAt(v, 1))).toEqual([1, 1, 1, 0]);
  });

  it('`hide a.*` hides the Group and its direct children', () => {
    const v = view({ steps: [step('uno', show('**')), step('dos', [], show('a.*'))] });

    expect(['a', 'a.a1', 'a.a2', 'b'].map(revealAt(v, 2))).toEqual([0, 0, 0, 1]);
  });

  it('an Edge appears on its own once both its ends are visible', () => {
    const v = view({ steps: [step('uno', show('b')), step('dos', show('c')), step('tres', show('a.a1'))] });

    expect([AB, BC].map(revealAt(v, 1))).toEqual([0, 0]);
    expect([AB, BC].map(revealAt(v, 2))).toEqual([0, 1]);
    expect([AB, BC].map(revealAt(v, 3))).toEqual([1, 1]);
  });

  it('an Edge named by a later Step waits for that Step', () => {
    const v = view({
      steps: [
        step('uno', show('b', 'c')),
        step('dos', [{ from: 'b', to: 'c' }]),
      ],
    });

    expect(revealAt(v, 1)(BC)).toBe(0);
    expect(revealAt(v, 2)(BC)).toBe(1);
  });

  it('a named Edge still needs both ends visible', () => {
    const v = view({ steps: [step('uno', [{ from: 'b', to: 'c' }]), step('dos', show('b', 'c'))] });

    expect(revealAt(v, 1)(BC)).toBe(0);
    expect(revealAt(v, 2)(BC)).toBe(1);
  });

  it('hide on an Edge hides it even while its ends stay visible', () => {
    const v = view({ steps: [step('uno', show('b', 'c')), step('dos', [], [{ from: 'b', to: 'c' }])] });

    expect(revealAt(v, 1)(BC)).toBe(1);
    expect(revealAt(v, 2)(BC)).toBe(0);
  });

  it('a collapsed Group is visible when any child is revealed', () => {
    const v = view(
      { steps: [step('uno', show('b')), step('dos', show('a.a2'))] },
      { collapsed: ['a'] },
    );

    expect(revealAt(v, 1)('a')).toBe(0);
    expect(revealAt(v, 2)('a')).toBe(1);
  });

  it('a collapsed Group is also revealed by naming it or with `a.*`', () => {
    const named = view({ steps: [step('uno', show('a'))] }, { collapsed: ['a'] });
    const children = view({ steps: [step('uno', show('a.*'))] }, { collapsed: ['a'] });

    expect(revealAt(named, 1)('a')).toBe(1);
    expect(revealAt(children, 1)('a')).toBe(1);
  });

  it('naming an Edge of a child waits for it even when the Group is collapsed', () => {
    const v = view(
      { steps: [step('uno', show('a', 'b')), step('dos', [{ from: 'a.a1', to: 'b' }])] },
      { collapsed: ['a'] },
    );
    const lifted = edgeId({ from: { node: 'a' }, to: { node: 'b' } });

    expect(revealAt(v, 1)(lifted)).toBe(0);
    expect(revealAt(v, 2)(lifted)).toBe(1);
  });

  it('a NaN position is treated as 0', () => {
    const v = view({ steps: [step('uno', show('b'))] });

    expect(revealAt(v, Number.NaN)('b')).toBe(0);
  });
});
