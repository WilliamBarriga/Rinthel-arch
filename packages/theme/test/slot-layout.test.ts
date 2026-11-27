import { describe, expect, it } from 'vitest';
import { CODES } from 'canonical';
import { placeLayout, buildLayout, measureLayout } from 'theme';
import type { SlotLayoutBox, BoxInput, SlotMeasure, SlotName } from 'theme';

/** Fixed measures: icon 20x20, title 100x30 (flexible), attrs 80x40 (flexible). */
const measure =
  (absent: SlotName[] = []): SlotMeasure =>
  (slot) =>
    absent.includes(slot) ? undefined : ({ icon: { width: 20, height: 20 }, title: { width: 100, height: 30 }, attrs: { width: 80, height: 40 } } as Partial<Record<SlotName, { width: number; height: number }>>)[slot];

const box = (direction: 'row' | 'column', children: SlotLayoutBox['hijos'], rest: Partial<SlotLayoutBox> = {}): SlotLayoutBox => ({ direccion: direction, gap: 0, pad: 0, hijos: children, ...rest });

describe('Slot layout placement', () => {
  it('a column stacks the Slots and each takes the full width', () => {
    const { slots, alto: height } = placeLayout(box('column', [{ slot: 'title' }, { slot: 'attrs' }]), measure(), 200);

    expect(slots.title).toEqual({ x: 0, y: 0, width: 200, height: 30 });
    expect(slots.attrs).toEqual({ x: 0, y: 30, width: 200, height: 40 });
    expect(height).toBe(70);
  });

  it('a row keeps the icon at its side and the flexible title takes the rest, vertically centered', () => {
    const { slots, alto: height } = placeLayout(box('row', [{ slot: 'icon' }, { slot: 'title' }], { gap: 6 }), measure(), 200);

    expect(slots.icon).toEqual({ x: 0, y: 5, width: 20, height: 20 });
    expect(slots.title).toEqual({ x: 26, y: 0, width: 174, height: 30 });
    expect(height).toBe(30);
  });

  it('gap and pad reserve space and are subtracted from the children width', () => {
    const { slots, alto: height } = placeLayout(box('column', [{ slot: 'title' }, { slot: 'attrs' }], { gap: 4, pad: 10 }), measure(), 200);

    expect(slots.title).toEqual({ x: 10, y: 10, width: 180, height: 30 });
    expect(slots.attrs).toEqual({ x: 10, y: 44, width: 180, height: 40 });
    expect(height).toBe(10 + 30 + 4 + 40 + 10);
  });

  it('nested: a row inside a column, with the natural size of the whole', () => {
    const tree = box('column', [box('row', [{ slot: 'icon' }, { slot: 'title' }], { gap: 6 }), { slot: 'attrs' }], { pad: 8 });

    expect(measureLayout(tree, measure())).toEqual({ width: 2 * 8 + 126, height: 2 * 8 + 30 + 40 });
    const { slots } = placeLayout(tree, measure(), 200);
    expect(slots.icon).toEqual({ x: 8, y: 13, width: 20, height: 20 });
    expect(slots.title).toEqual({ x: 34, y: 8, width: 158, height: 30 });
    expect(slots.attrs).toEqual({ x: 8, y: 38, width: 184, height: 40 });
  });

  it('align places a Slot at its natural size at the start, center or end of the cross axis', () => {
    const placedAt = (align: 'start' | 'center' | 'end') => placeLayout(box('column', [{ slot: 'icon', align }]), measure(), 100).slots.icon;

    expect(placedAt('start')).toEqual({ x: 0, y: 0, width: 20, height: 20 });
    expect(placedAt('center')).toEqual({ x: 40, y: 0, width: 20, height: 20 });
    expect(placedAt('end')).toEqual({ x: 80, y: 0, width: 20, height: 20 });
  });

  it('a Slot without content reserves no space nor leaves a gap, and an empty box disappears', () => {
    const tree = box('column', [box('row', [{ slot: 'icon' }], { pad: 5 }), { slot: 'title' }, { slot: 'attrs' }], { gap: 10 });
    const { slots, alto: height } = placeLayout(tree, measure(['icon', 'attrs']), 100);

    expect(slots).toEqual({ title: { x: 0, y: 0, width: 100, height: 30 } });
    expect(height).toBe(30);
  });

  it('a Slot the tree does not list is not placed', () => {
    expect(Object.keys(placeLayout(box('column', [{ slot: 'title' }]), measure(), 100).slots)).toEqual(['title']);
  });
});

describe('Slot layout validation', () => {
  const entry = (children: BoxInput<string>['hijos'], props: BoxInput<string>['props'] = [], direction = 'column'): BoxInput<string> => ({ ref: 'raiz', direccion: direction, props, hijos: children });

  it('a valid tree returns the layout with defaults', () => {
    const { disposicion: layout, errors } = buildLayout(
      entry([{ ref: 'f', direccion: 'row', props: [{ key: 'gap', value: '6', ref: 'gap' }], hijos: [{ ref: 'i', slot: 'icon' }, { ref: 't', slot: 'title', align: { key: 'align', value: 'end', ref: 'a' } }] }, { ref: 'x', slot: 'attrs' }]),
    );

    expect(errors).toEqual([]);
    expect(layout).toEqual(
      box('column', [box('row', [{ slot: 'icon' }, { slot: 'title', align: 'end' }], { gap: 6 }), { slot: 'attrs' }]),
    );
  });

  it('all errors at once, with code, reference and "did you mean"', () => {
    const { errors } = buildLayout(
      entry(
        [
          { ref: 'h1', slot: 'titl' },
          { ref: 'h2', slot: 'title', align: { key: 'align', value: 'centro', ref: 'a2' } },
          { ref: 'h3', slot: 'title' },
          { ref: 'f', direccion: 'rown', props: [], hijos: [] },
        ],
        [{ key: 'gapp', value: 8, ref: 'p1' }, { key: 'pad', value: 999, ref: 'p2' }],
      ),
    );

    expect(errors.map((e) => [e.code, e.ref])).toEqual([
      [CODES.E_THEME_UNKNOWN_PROPERTY, 'p1'],
      [CODES.E_THEME_INVALID_VALUE, 'p2'],
      [CODES.E_THEME_UNKNOWN_SLOT, 'h1'],
      [CODES.E_THEME_INVALID_VALUE, 'a2'],
      [CODES.E_THEME_UNKNOWN_SLOT, 'h3'],
      [CODES.E_THEME_INVALID_VALUE, 'f'],
    ]);
    expect(errors[0]!.hint).toBe("did you mean 'gap'");
    expect(errors[2]!.hint).toBe("did you mean 'title'");
    expect(errors[3]!.hint).toBe("did you mean 'center'");
    expect(errors[5]!.hint).toBe("did you mean 'row'");
  });
});
