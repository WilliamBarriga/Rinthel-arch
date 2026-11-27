import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const base = (extra = '') => `specification { node servicio }
model { servicio a  servicio b  servicio c }
view v {
  type architecture
  include **
${extra}}
view w {
  type architecture
  include a
}
`;

const withOverlappingPins = base('  node a { pin 0,0 }\n  node b { pin 10,10 }\n');

describe('Session', () => {
  it('diagnose returns the compile issues of an in-memory Workspace', async () => {
    const session = openSession({ 'main.dg': 'specification { node servicio }\nmodel {\n  servicio api {' });

    const issues = await session.diagnose();

    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.severity === 'error' && i.file === 'main.dg')).toBe(true);
    expect(session.source).toBeUndefined();
  });

  it('a valid Workspace without Pins has no issues and computes no layout', async () => {
    const session = openSession({ 'main.dg': base() });

    expect(await session.diagnose()).toEqual([]);
    expect(session.source?.views.map((v) => v.id)).toEqual(['v', 'w']);
    expect(session.viewsWithGeometry()).toEqual([]);
  });

  it('diagnose emits overlapping-pins with a position and only pays layout in Views with 2 or more Pins', async () => {
    const session = openSession({ 'main.dg': withOverlappingPins });

    const issues = await session.diagnose();

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'overlapping-pins', severity: 'warning', file: 'main.dg' });
    expect(issues[0]?.related).toHaveLength(1);
    expect(session.viewsWithGeometry()).toEqual(['v']);
  });

  it('geometry is lazy, memoized per View and cacheable (view, theme, layoutKey)', async () => {
    const session = openSession({ 'main.dg': base() });

    const first = await session.geometry('w');
    const second = await session.geometry('w');

    expect(first).toBe(second);
    expect(first).toMatchObject({ view: 'w', theme: 'neutral' });
    expect(first?.geometry.kind).toBe('grafo');
    expect(Object.keys(first?.geometry.nodes ?? {})).toEqual(['a']);
    expect(session.viewsWithGeometry()).toEqual(['w']);
    expect(await session.geometry('no-existe')).toBeUndefined();
  });

  it('build returns canonico.json, one geometry per View and the warnings', async () => {
    const session = openSession({ 'main.dg': withOverlappingPins });

    const { files, issues } = await session.build();

    expect(Object.keys(files).sort()).toEqual(['canonico.json', 'geometria/v.json', 'geometria/w.json']);
    expect(JSON.parse(files['geometria/v.json']!)).toMatchObject({ view: 'v', theme: 'neutral', geometry: { kind: 'grafo' } });
    expect(issues.map((i) => i.code)).toEqual(['overlapping-pins']);
  });

  it('build with errors produces no files', async () => {
    const session = openSession({ 'main.dg': 'model {' });

    const { files, issues } = await session.build();

    expect(files).toEqual({});
    expect(issues.length).toBeGreaterThan(0);
  });

  it('the theme of the option is used unless the View declares its own', async () => {
    const source = `specification { node servicio }
theme claro extends neutral { palette { acento "#0ea5e9" } }
model { servicio a }
view v { type architecture  include * }
view w { type architecture  include *  theme neutral }
`;
    const session = openSession({ 'main.dg': source }, { theme: 'claro' });

    expect((await session.geometry('v'))?.theme).toBe('claro');
    expect((await session.geometry('w'))?.theme).toBe('neutral');
  });

  it('geometry with another Theme: the View with that Theme, without touching the memoized one; undefined if the View or the Theme is missing', async () => {
    const source = `specification { node servicio }
theme claro extends neutral { palette { acento "#0ea5e9" } }
model { servicio a }
view v { type architecture  include * }
`;
    const session = openSession({ 'main.dg': source });

    expect((await session.geometry('v', { theme: 'claro' }))?.theme).toBe('claro');
    expect(session.viewsWithGeometry()).toEqual([]);
    expect((await session.geometry('v'))?.theme).toBe('neutral');
    expect(await session.geometry('v', { theme: 'nada' })).toBeUndefined();
    expect(await session.geometry('nada', { theme: 'claro' })).toBeUndefined();
  });

  it('update returns another Session without mutating the previous one', async () => {
    const before = openSession({ 'main.dg': base() });
    await before.geometry('w');

    const after = before.update({ 'main.dg': 'model {' });

    expect(after).not.toBe(before);
    expect(before.source).toBeDefined();
    expect(after.source).toBeUndefined();
    expect(await before.diagnose()).toEqual([]);
  });

  it('update reuses the geometry if the layoutKey does not change and recomputes it if it does', async () => {
    const before = openSession({ 'main.dg': base() });
    const geoW = await before.geometry('w');
    const geoV = await before.geometry('v');

    const after = before.update({ 'main.dg': base().replace('include **', 'include a, b') });

    expect(await after.geometry('w')).toBe(geoW);
    expect(await after.geometry('v')).not.toBe(geoV);
    expect(Object.keys((await after.geometry('v'))?.geometry.nodes ?? {}).sort()).toEqual(['a', 'b']);
  });

  it('update recomputes if the Pins change even if the layoutKey is the same', async () => {
    const before = openSession({ 'main.dg': base('  node a { pin 0,0 }\n') });
    const geo = await before.geometry('v');

    const after = before.update({ 'main.dg': base('  node a { pin 300,300 }\n') });
    const next = await after.geometry('v');

    expect(next).not.toBe(geo);
    // The Pin anchors the center: the neutral card measures 160 x 54.
    expect(next?.geometry.nodes['a']).toMatchObject({ x: 220, y: 273, width: 160, height: 54 });
  });
});
