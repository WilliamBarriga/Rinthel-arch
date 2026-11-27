import { describe, expect, it } from 'vitest';

import { openSession, applyToWorkspace, contentHash, inMemoryPort } from 'session';
import type { Intent } from 'session';

type WorkspacePort = Parameters<typeof applyToWorkspace>[0];

const text = `specification { node servicio }
model { servicio a }
view v {
  type architecture
  include **
}
`;

/** The in-memory adapter of `session`, recording each write. */
function fake(own: Record<string, string>, themes: Record<string, string> = {}) {
  const ws = inMemoryPort({ own, themes });
  const writes: string[] = [];
  const port: WorkspacePort = {
    read: () => ws.read(),
    write: (path, next) => {
      writes.push(path);
      ws.write(path, next);
    },
  };
  return { port, writes, text: (path: string) => ws.text(path) };
}

const move = (_t: string, extra: Partial<Extract<Intent, { type: 'move-pin' }>> = {}): Intent => ({
  type: 'move-pin',
  view: 'v',
  node: 'a',
  x: 4,
  y: 6,
  ...extra,
});

describe('in-memory Workspace', () => {
  it('what the door writes is seen by the Session opened over it; Themes are only read and a removed file disappears', async () => {
    const ws = inMemoryPort({ own: { 'main.dg': text, 'nota.dg': '// nota\n' }, themes: { 'tema.dg': 'theme t {}\n' } });

    expect(applyToWorkspace(ws, move(text)).ok).toBe(true);
    ws.remove('nota.dg');

    const { disk, own } = ws.read();
    expect(Object.keys(disk).sort()).toEqual(['main.dg', 'tema.dg']);
    expect(Object.keys(own)).toEqual(['main.dg']);
    const session = openSession(disk);
    expect(session.source?.views[0]?.overrides).toEqual([expect.objectContaining({ node: 'a', pin: { x: 4, y: 6 } })]);
    expect(ws.text('nota.dg')).toBeUndefined();
  });
});

describe('applyToWorkspace', () => {
  it('writes only the changed files and reports them', () => {
    const ws = fake({ 'main.dg': text, 'otro.dg': '' });
    const r = applyToWorkspace(ws.port, move(text));
    expect(r).toMatchObject({ ok: true, changed: ['main.dg'], edits: [{ file: 'main.dg', replacement: expect.stringContaining('pin 4,6') }] });
    expect(ws.writes).toEqual(['main.dg']);
    expect(ws.text('main.dg')).toContain('node a { pin 4,6 }');
  });

  it('rejects with a reason and writes nothing', () => {
    const ws = fake({ 'main.dg': text });
    const r = applyToWorkspace(ws.port, move(text), { 'main.dg': 'viejo' });
    expect(r).toMatchObject({ ok: false, reason: 'stale-hash', file: 'main.dg' });
    expect(ws.writes).toEqual([]);
  });

  it('a stale seen hash of another file does not block the edit; without seen it applies over the current text', () => {
    const ws = fake({ 'main.dg': text, 'otro.dg': '' });
    expect(applyToWorkspace(ws.port, move(text), { 'otro.dg': 'viejo', 'main.dg': contentHash(text) })).toMatchObject({ ok: true, changed: ['main.dg'] });
    expect(applyToWorkspace(ws.port, move(text, { x: 9 }))).toMatchObject({ ok: true });
  });

  it('does not write a file outside the Workspace (it comes from a theme)', () => {
    const ws = fake({}, { 'main.dg': text });
    const r = applyToWorkspace(ws.port, move(text));
    expect(r).toMatchObject({ ok: false, reason: 'unknown-file', file: 'main.dg' });
    expect(ws.writes).toEqual([]);
  });

  it('writes a list of structured edits all or nothing', () => {
    const ws = fake({ 'main.dg': text, 'otro.dg': 'x' });
    const point = { line: 2, column: 19 };
    const edit = { file: 'main.dg', range: { start: point, end: point }, replacement: '  servicio b', hash: contentHash(text) };
    const r = applyToWorkspace(ws.port, [edit]);
    expect(r).toMatchObject({ ok: true, changed: ['main.dg'], edits: [edit] });
    expect(ws.text('main.dg')).toContain('servicio a  servicio b }');

    const stale = applyToWorkspace(ws.port, [{ file: 'otro.dg', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: '\n', hash: contentHash('x') }, edit]);
    expect(stale).toMatchObject({ ok: false, reason: 'stale-hash', file: 'main.dg' });
    expect(ws.writes).toEqual(['main.dg']);
  });

  it('a structured edit over a theme file is rejected without writing', () => {
    const ws = fake({ 'main.dg': text }, { 'tema.dg': 'theme t {}\n' });
    const point = { line: 1, column: 1 };
    const r = applyToWorkspace(ws.port, [{ file: 'tema.dg', range: { start: point, end: point }, replacement: '\n', hash: contentHash('theme t {}\n') }]);
    expect(r).toMatchObject({ ok: false, reason: 'unknown-file', file: 'tema.dg' });
    expect(ws.writes).toEqual([]);
  });
});

describe('editor text edits (without hash, with seen)', () => {
  const point = { line: 2, column: 19 };
  const addB = { file: 'main.dg', range: { start: point, end: point }, replacement: '  servicio b' };

  it('without its own hash, concurrency is decided by seen: the hash the editor saw', () => {
    const ws = fake({ 'main.dg': text });
    expect(applyToWorkspace(ws.port, [addB], { 'main.dg': 'viejo' })).toMatchObject({ ok: false, reason: 'stale-hash', file: 'main.dg' });
    expect(ws.writes).toEqual([]);
    expect(applyToWorkspace(ws.port, [addB], { 'main.dg': contentHash(text) })).toMatchObject({ ok: true, changed: ['main.dg'] });
    expect(ws.text('main.dg')).toContain('servicio a  servicio b }');
  });

  it('without hash or seen for the file, it applies over the current text', () => {
    const ws = fake({ 'main.dg': text });
    expect(applyToWorkspace(ws.port, [addB])).toMatchObject({ ok: true, changed: ['main.dg'] });
  });

  it('by default rejects a text that introduces an error; with evenIfBroken it writes it anyway', () => {
    const ws = fake({ 'main.dg': text });
    const broken = { ...addB, replacement: ' -> fantasma' };
    expect(applyToWorkspace(ws.port, [broken])).toMatchObject({ ok: false, reason: 'invalid' });
    expect(ws.writes).toEqual([]);

    expect(applyToWorkspace(ws.port, [broken], undefined, { evenIfBroken: true })).toMatchObject({ ok: true, changed: ['main.dg'] });
    expect(ws.text('main.dg')).toContain('servicio a -> fantasma }');
  });

  it('evenIfBroken does not skip the other rejections: invalid range and theme file', () => {
    const ws = fake({ 'main.dg': text }, { 'tema.dg': 'theme t {}\n' });
    const outside = { file: 'main.dg', range: { start: { line: 99, column: 1 }, end: { line: 99, column: 1 } }, replacement: 'x' };
    expect(applyToWorkspace(ws.port, [outside], undefined, { evenIfBroken: true })).toMatchObject({ ok: false, reason: 'invalid-range' });
    const inTheme = { file: 'tema.dg', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: '\n' };
    expect(applyToWorkspace(ws.port, [inTheme], undefined, { evenIfBroken: true })).toMatchObject({ ok: false, reason: 'unknown-file', file: 'tema.dg' });
    expect(ws.writes).toEqual([]);
  });
});
