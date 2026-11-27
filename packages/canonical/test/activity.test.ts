import { describe, expect, it } from 'vitest';

import { createActivityReader } from '../src/index';
import type { ActivityEvent } from '../src/index';

const event = (command: ActivityEvent['command'], extra: Partial<ActivityEvent> = {}): ActivityEvent => ({
  contractVersion: 2,
  ts: '2026-11-19T10:00:00.000Z',
  pid: 42,
  command,
  args: ['--workspace', '.'],
  exitCode: 0,
  durationMs: 3,
  ...extra,
});
const line = (e: ActivityEvent): string => `${JSON.stringify(e)}\n`;

describe('Activity log reader', () => {
  it('returns the new events on each read and skips lines that do not parse or do not match the schema', () => {
    const read = createActivityReader();
    const one = line(event('validate'));
    expect(read(one).map((e) => e.command)).toEqual(['validate']);
    expect(read(one)).toEqual([]);
    const text = `${one}{roto\n${JSON.stringify({ command: 'edit' })}\n${line(event('edit', { target: { view: 'v' } }))}`;
    expect(read(text)).toEqual([event('edit', { target: { view: 'v' } })]);
  });

  it('a line without a trailing newline waits until it is complete', () => {
    const read = createActivityReader();
    const complete = line(event('build'));
    expect(read(complete.slice(0, 20))).toEqual([]);
    expect(read(complete).map((e) => e.command)).toEqual(['build']);
  });

  it('a truncated, rotated or missing file is read again from the start', () => {
    const read = createActivityReader();
    read(line(event('validate')) + line(event('build')));
    expect(read(line(event('inspect'))).map((e) => e.command)).toEqual(['inspect']);
    expect(read(undefined)).toEqual([]);
    expect(read(line(event('edit'))).map((e) => e.command)).toEqual(['edit']);
  });
});
