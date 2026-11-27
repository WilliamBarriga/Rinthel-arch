import { describe, expect, it } from 'vitest';

import { createUndoHistory, undo, editInHistory, contentHash, redo } from 'session';
import type { Intent } from 'session';

import { applyInMemory } from './helpers';

const base = (extra: string) => `specification { node servicio }
model { servicio a  servicio b }
view v {
  type architecture
  include **
${extra}}
`;

const move = (_text: string, x: number, y: number, node = 'a'): Intent => ({
  type: 'move-pin',
  view: 'v',
  node,
  x,
  y,
});

describe('applying an Intent', () => {
  it('moving a Pin produces the same text as writing the pin by hand', () => {
    const text = base('');
    const r = applyInMemory({ 'main.dg': text }, move(text, 5, -7));
    if (!r.ok) throw new Error(r.message);
    expect(r.files['main.dg']).toBe(base('  node a { pin 5,-7 }\n'));
    expect(r.edits).toHaveLength(1);
  });

  it('rejects with a reason', () => {
    const text = base('');
    const r = applyInMemory({ 'main.dg': text }, move(text, 1, 1), { 'main.dg': 'viejo' });
    expect(r).toMatchObject({ ok: false, reason: 'stale-hash', file: 'main.dg' });
  });

  it('with a fresh seen hash it applies; a stale seen hash of another file does not count', () => {
    const text = base('');
    const fresh = applyInMemory({ 'main.dg': text, 'otro.dg': '' }, move(text, 1, 1), { 'main.dg': contentHash(text), 'otro.dg': 'viejo' });
    expect(fresh.ok).toBe(true);
  });
});

describe('Undo history: undo and redo', () => {
  it('moving a Pin and undoing restores the text exactly; redo reapplies it', () => {
    const text = base('  node b { label "B" }\n');
    const e = editInHistory(createUndoHistory({ 'main.dg': text }), move(text, 3, 4));
    if (!e.ok) throw new Error(e.message);
    expect(e.history.files['main.dg']).not.toBe(text);

    const d = undo(e.history);
    expect(d?.files['main.dg']).toBe(text);
    const r = d && redo(d);
    expect(r?.files).toEqual(e.history.files);
  });

  it('with nothing to undo or redo returns undefined', () => {
    const h = createUndoHistory({ 'main.dg': base('') });
    expect(undo(h)).toBeUndefined();
    expect(redo(h)).toBeUndefined();
  });

  it('a new edit drops the future and a rejection does not alter the history', () => {
    const text = base('');
    const e1 = editInHistory(createUndoHistory({ 'main.dg': text }), move(text, 1, 1));
    if (!e1.ok) throw new Error(e1.message);
    const d = undo(e1.history);
    if (!d) throw new Error('nothing undone');
    const e2 = editInHistory(d, move(text, 9, 9));
    if (!e2.ok) throw new Error(e2.message);
    expect(redo(e2.history)).toBeUndefined();

    const bad = editInHistory(e2.history, move(text, 0, 0, 'ghost'));
    expect(bad.ok).toBe(false);
    expect(undo(e2.history)?.files['main.dg']).toBe(text);
  });

  it('two edits are undone in reverse order', () => {
    const t0 = base('');
    const e1 = editInHistory(createUndoHistory({ 'main.dg': t0 }), move(t0, 1, 1));
    if (!e1.ok) throw new Error(e1.message);
    const t1 = e1.history.files['main.dg'] as string;
    const e2 = editInHistory(e1.history, move(t1, 2, 2));
    if (!e2.ok) throw new Error(e2.message);
    const d1 = undo(e2.history);
    expect(d1?.files['main.dg']).toBe(t1);
    expect(d1 && undo(d1)?.files['main.dg']).toBe(t0);
  });
});
