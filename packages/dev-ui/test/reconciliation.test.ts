import { Text } from '@codemirror/state';
import type { ChangeSet } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { minimalDiff, threeWayMerge } from '../browser/editor/reconciliation';

const apply = (changes: ChangeSet, text: string): string => changes.apply(Text.of(text.split('\n'))).toString();
const stretches = (changes: ChangeSet): { from: number; to: number; inserts: string }[] => {
  const output: { from: number; to: number; inserts: string }[] = [];
  changes.iterChanges((from, to, _b, _hb, inserts) => output.push({ from, to, inserts: inserts.toString() }));
  return output;
};

const BASE = ['model {', '  servicio api "API"', '  servicio db "Base"', '  servicio cola "Cola"', '  api -> db', '}', ''].join('\n');

describe('minimal diff', () => {
  it('without changes there are no stretches', () => {
    expect(minimalDiff(BASE, BASE).empty).toBe(true);
  });

  it('a change inside a line touches only the differing characters', () => {
    const after = BASE.replace('"Base"', '"Base de datos"');
    const changes = minimalDiff(BASE, after);
    const from = BASE.indexOf('"Base"') + '"Base'.length;
    expect(stretches(changes)).toEqual([{ from, to: from, inserts: ' de datos' }]);
    expect(apply(changes, BASE)).toBe(after);
  });

  it('two distant changes are two stretches and what lies between is untouched', () => {
    const after = BASE.replace('model {', 'model  {').replace('api -> db', 'api -> cola');
    expect(stretches(minimalDiff(BASE, after))).toHaveLength(2);
    expect(apply(minimalDiff(BASE, after), BASE)).toBe(after);
  });

  it('reproduces the target with added and deleted lines and without a final newline', () => {
    const cases: [string, string][] = [
      ['x', 'x\ny'],
      ['x\ny', 'x'],
      ['', 'hola\n'],
      ['a\nb\nc\n', 'c\nb\na\n'],
      [BASE, BASE.replace('  servicio cola "Cola"\n', '').replace('}', '  db -> api\n}')],
    ];
    for (const [before, after] of cases) expect(apply(minimalDiff(before, after), before)).toBe(after);
  });

  it('reproduces the target on texts of random lines (fixed seed)', () => {
    let seed = 7;
    const random = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const text = (): string => Array.from({ length: random(12) }, () => 'abc'[random(3)] as string).join('\n');
    for (let i = 0; i < 300; i++) {
      const before = text();
      const after = text();
      expect(apply(minimalDiff(before, after), before)).toBe(after);
    }
  });
});

describe('3-way merge (base, disk, buffer)', () => {
  it('without overlap it merges both sides: the buffer gets only the disk part and pending keystrokes are rebased onto the disk', () => {
    const disk = BASE.replace('"API"', '"API publica"');
    const buffer = BASE.replace('api -> db', 'api -> db "lee"');
    const merged = BASE.replace('"API"', '"API publica"').replace('api -> db', 'api -> db "lee"');
    const f = threeWayMerge(BASE, disk, buffer);
    expect(f.text).toBe(merged);
    expect(apply(f.toBuffer, buffer)).toBe(merged);
    expect(stretches(f.toBuffer)).toEqual([{ from: buffer.indexOf('"API') + 4, to: buffer.indexOf('"API') + 4, inserts: ' publica' }]);
    expect(apply(f.pending, disk)).toBe(merged);
    expect(stretches(f.pending)).toEqual([{ from: disk.indexOf('api -> db') + 9, to: disk.indexOf('api -> db') + 9, inserts: ' "lee"' }]);
    expect(f.lost).toEqual([]);
  });

  it('on overlap the disk wins and the buffer fragment is kept to recover it, with its line in the result', () => {
    const disk = BASE.replace('"Base"', '"Postgres"');
    const buffer = BASE.replace('"Base"', '"MySQL"').replace('model {', 'model  {');
    const f = threeWayMerge(BASE, disk, buffer);
    expect(f.text).toBe(disk.replace('model {', 'model  {'));
    expect(apply(f.toBuffer, buffer)).toBe(f.text);
    expect(apply(f.pending, disk)).toBe(f.text);
    expect(f.lost).toEqual([{ text: '  servicio db "MySQL"', line: 3, replaces: 1 }]);
  });

  it('two changes on the same line overlap even if they do not touch the same characters', () => {
    const disk = BASE.replace('"Base"', '"Bases"');
    const buffer = BASE.replace('servicio db', 'servicio datos');
    const f = threeWayMerge(BASE, disk, buffer);
    expect(f.text).toBe(disk);
    expect(f.lost).toEqual([{ text: '  servicio datos "Base"', line: 3, replaces: 1 }]);
  });

  it('two insertions at the same point overlap', () => {
    const disk = BASE.replace('}\n', '  db -> cola\n}\n');
    const buffer = BASE.replace('}\n', '  cola -> api\n}\n');
    const f = threeWayMerge(BASE, disk, buffer);
    expect(f.text).toBe(disk);
    expect(f.pending.empty).toBe(true);
    expect(f.lost).toEqual([{ text: '  cola -> api', line: 6, replaces: 0 }]);
  });

  it('with the disk equal to the base the buffer stays intact and everything stays pending', () => {
    const buffer = BASE.replace('api -> db', 'api -> cola');
    const f = threeWayMerge(BASE, BASE, buffer);
    expect(f.text).toBe(buffer);
    expect(f.toBuffer.empty).toBe(true);
    expect(apply(f.pending, BASE)).toBe(buffer);
  });

  it('with a clean buffer the result is the disk and nothing stays pending', () => {
    const disk = BASE.replace('api -> db', 'db -> api');
    const f = threeWayMerge(BASE, disk, BASE);
    expect(f.text).toBe(disk);
    expect(f.pending.empty).toBe(true);
    expect(apply(f.toBuffer, BASE)).toBe(disk);
  });
});
