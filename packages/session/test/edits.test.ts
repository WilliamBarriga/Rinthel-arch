import { describe, expect, it } from 'vitest';

import { openSession, applyToWorkspace, contentHash } from 'session';
import type { Applicable } from 'session';

import { applyInMemory } from './helpers';

type WorkspacePort = Parameters<typeof applyToWorkspace>[0];
type HashedEdit = Extract<Applicable, readonly unknown[]>[number] & { hash: string };

const base = (extra: string) => `specification { node servicio }
model { servicio a  servicio b }
view v {
  type architecture
  include **
${extra}}
`;

const intent = (_text: string, x = 5, y = -7) => ({
  type: 'move-pin' as const,
  view: 'v',
  node: 'a',
  x,
  y,
});

describe('Intent move-pin', () => {
  it('inserts a new override without touching the rest of the file', async () => {
    const text = base('');
    const r = applyInMemory({ 'main.dg': text }, intent(text));

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.files['main.dg']).toBe(base('  node a { pin 5,-7 }\n'));
      expect(r.edits).toHaveLength(1);
      expect((await openSession(r.files).diagnose()).some((i) => i.severity === 'error')).toBe(false);
    }
  });

  it('adds the pin to an existing override without pin', () => {
    const text = base('  node a { label "A" }\n');
    const r = applyInMemory({ 'main.dg': text }, intent(text));
    if (!r.ok) throw new Error(r.message);

    expect(r.files['main.dg']).toBe(base('  node a { label "A" pin 5,-7 }\n'));
  });

  it('adds the pin to an empty override', () => {
    const text = base('  node a {}\n');
    const r = applyInMemory({ 'main.dg': text }, intent(text));
    if (!r.ok) throw new Error(r.message);

    expect(r.files['main.dg']).toBe(base('  node a { pin 5,-7 }\n'));
  });

  it('replaces an existing pin and the resulting Session reflects it without new issues', async () => {
    const text = base('  node a { label "A" pin 1,2 }\n  node b { pin 100,100 }\n');
    const r = applyInMemory({ 'main.dg': text }, intent(text));
    if (!r.ok) throw new Error(r.message);

    expect(r.files['main.dg']).toBe(base('  node a { label "A" pin 5,-7 }\n  node b { pin 100,100 }\n'));
    const session = openSession(r.files);
    expect(await session.diagnose()).toEqual(await openSession({ 'main.dg': text }).diagnose());
    expect(session.source?.views[0]?.overrides.find((o) => o.node === 'a')?.pin).toEqual({ x: 5, y: -7 });
  });

  it('a stale hash rejects the edit and changes nothing', () => {
    const text = base('');

    const r = applyInMemory({ 'main.dg': text }, intent(text), { 'main.dg': contentHash('otra cosa') });

    expect(r).toMatchObject({ ok: false, reason: 'stale-hash' });
  });

  it('an unknown view or node is rejected', () => {
    const text = base('');
    expect(applyInMemory({ 'main.dg': text }, { ...intent(text), view: 'nada' })).toMatchObject({ ok: false, reason: 'unknown-view' });
    expect(applyInMemory({ 'main.dg': text }, { ...intent(text), node: 'nada' })).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('applies the coordinate limit to the output: rounds x and y to integers and clamps them to a reasonable range', () => {
    const text = base('');
    const pin = (x: number, y: number) => {
      const e = applyInMemory({ 'main.dg': text }, intent(text, x, y));
      return e.ok ? e.files['main.dg'] : e;
    };
    expect(pin(10.6, -3.4)).toBe(base('  node a { pin 11,-3 }\n'));
    expect(pin(1e12, -1e12)).toBe(base('  node a { pin 100000,-100000 }\n'));
    expect(pin(1e-9, -0.2)).toBe(base('  node a { pin 0,0 }\n'));
  });
});

/** Write door over an in-memory Workspace: returns the result and the text that ended up written. */
function writeEdits(files: Record<string, string>, edits: HashedEdit[]) {
  let current = { ...files };
  const port: WorkspacePort = {
    read: () => ({ disk: current, own: current }),
    write: (path, text) => {
      current = { ...current, [path]: text };
    },
  };
  const r = applyToWorkspace(port, edits);
  return { ...r, files: current };
}

describe('write door with structured edits', () => {
  it('applies the already computed Gesture edits (inputs of --edits and of the validate fix)', () => {
    const text = base('');
    const r = writeEdits({ 'main.dg': text }, [
      {
        file: 'main.dg',
        range: { start: { line: 2, column: 30 }, end: { line: 2, column: 31 } },
        replacement: 'c',
        hash: contentHash(text),
      },
    ]);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.files['main.dg']).toBe(base('').replace('servicio b', 'servicio c'));
      expect(r.changed).toEqual(['main.dg']);
    }
  });

  it('rejects everything if one of several edits has a stale hash', () => {
    const range = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
    const r = writeEdits(
      { 'a.dg': 'x', 'b.dg': 'y' },
      [
        { file: 'a.dg', range, replacement: 'z', hash: contentHash('x') },
        { file: 'b.dg', range, replacement: 'z', hash: 'viejo' },
      ],
    );
    expect(r).toMatchObject({ ok: false, reason: 'stale-hash', file: 'b.dg' });
  });

  it('rejects an edit that introduces errors', () => {
    const text = base('');
    const point = { line: 1, column: 1 };
    const r = writeEdits(
      { 'main.dg': text },
      [{ file: 'main.dg', range: { start: point, end: point }, replacement: '}}}', hash: contentHash(text) }],
    );
    expect(r).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('a preexisting error whose message changes does not block an unrelated edit', () => {
    // Same code and file; the message changes because the edit changes a name quoted in it.
    const broken = `specification { node servicio }
model { servicio a  servicio b  a -> nada }
view v {
  type architecture
  include **
}
`;
    const hash = contentHash(broken);
    const r = writeEdits({ 'main.dg': broken }, [
      { file: 'main.dg', range: { start: { line: 2, column: 38 }, end: { line: 2, column: 42 } }, replacement: 'otra', hash },
    ]);
    expect(r).toMatchObject({ ok: true });
  });

  it('an edit that adds a second error of the same code in the same file is rejected', () => {
    const broken = `specification { node servicio }
model { servicio a  servicio b  a -> nada }
view v {
  type architecture
  include **
}
`;
    const hash = contentHash(broken);
    const r = writeEdits({ 'main.dg': broken }, [
      { file: 'main.dg', range: { start: { line: 2, column: 42 }, end: { line: 2, column: 42 } }, replacement: ' b -> fantasma', hash },
    ]);
    expect(r).toMatchObject({ ok: false, reason: 'invalid' });
  });
});
