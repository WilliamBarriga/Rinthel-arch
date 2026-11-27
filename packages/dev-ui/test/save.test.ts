import { ChangeSet, Text } from '@codemirror/state';
import { contentHash } from 'canonical';
import { describe, expect, it } from 'vitest';

import type { SendResult } from '../browser/client';
import { createSaver } from '../browser/editor/save';
import type { Merge } from '../browser/editor/reconciliation';
import type { EditsRequest } from '../src/protocol';

const BASE = 'model {\n  servicio api "API"\n  servicio db "Base"\n}\n';

/** A minimal `dev`: one file with its version; rejects with 409 if the version is not the current one. */
function fakeDisk(text: string) {
  const disk = { text, version: 1 };
  const sent: EditsRequest[] = [];
  const merges: Merge[] = [];
  let reads = 0;
  let buffer = text;
  const saver = createSaver({
    file: 'main.dg',
    base: text,
    version: 1,
    waitMs: 1_000_000,
    async send(request): Promise<SendResult> {
      sent.push(request);
      if (request.version !== disk.version) return { ok: false, stale: true, message: 'stale-hash', reason: 'stale-hash' };
      const doc = Text.of(disk.text.split('\n'));
      const changes = ChangeSet.of(
        request.ediciones.map((e) => ({ from: doc.line(e.range.start.line).from + e.range.start.column - 1, to: doc.line(e.range.end.line).from + e.range.end.column - 1, insert: e.replacement })),
        disk.text.length,
      );
      disk.text = changes.apply(doc).toString();
      disk.version += 1;
      return { ok: true, version: disk.version };
    },
    async readDisk() {
      reads += 1;
      return { ...disk };
    },
    onReconcile(merge) {
      merges.push(merge);
      buffer = merge.toBuffer.apply(Text.of(buffer.split('\n'))).toString();
    },
  });
  const type = (before: string, after: string): void => {
    const from = buffer.indexOf(before);
    const changes = ChangeSet.of({ from, to: from + before.length, insert: after }, buffer.length);
    buffer = changes.apply(Text.of(buffer.split('\n'))).toString();
    saver.change(changes);
  };
  const writeOutside = (fresh: string): void => {
    disk.text = fresh;
    disk.version += 1;
  };
  return { saver, disk, sent, merges, type, writeOutside, buffer: () => buffer, reads: () => reads };
}

describe('saver against external writes', () => {
  it('on 409 it merges with the disk, rebases the pending keystrokes and retries the save on the new version', async () => {
    const f = fakeDisk(BASE);
    f.writeOutside(BASE.replace('"API"', '"API publica"'));
    f.type('"Base"', '"Postgres"');
    await f.saver.save();
    expect(f.sent.map((p) => p.version)).toEqual([1, 2]);
    expect(f.disk.text).toBe(BASE.replace('"API"', '"API publica"').replace('"Base"', '"Postgres"'));
    expect(f.buffer()).toBe(f.disk.text);
    expect(f.saver.state()).toEqual({ kind: 'guardado' });
    expect(f.saver.dirty()).toBe(false);
  });

  it('on overlap the disk wins, the lost fragment is reported and nothing is left to save', async () => {
    const f = fakeDisk(BASE);
    f.writeOutside(BASE.replace('"Base"', '"MySQL"'));
    f.type('"Base"', '"Postgres"');
    await f.saver.save();
    expect(f.disk.text).toBe(BASE.replace('"Base"', '"MySQL"'));
    expect(f.buffer()).toBe(f.disk.text);
    expect(f.merges.flatMap((x) => x.lost)).toEqual([{ text: '  servicio db "Postgres"', line: 3, replaces: 1 }]);
    expect(f.saver.dirty()).toBe(false);
  });

  it('the echo of an own save is recognized by hash: it does not read the disk nor touch the buffer', async () => {
    const f = fakeDisk(BASE);
    f.type('"Base"', '"Postgres"');
    await f.saver.save();
    await f.saver.sync({ hash: contentHash(f.disk.text), version: f.disk.version });
    expect(f.reads()).toBe(0);
    expect(f.merges).toEqual([]);
  });

  it('an external change with a clean buffer reaches the buffer with minimal changes and is not sent back', async () => {
    const f = fakeDisk(BASE);
    f.writeOutside(BASE.replace('"API"', '"Gateway"'));
    await f.saver.sync({ hash: contentHash(f.disk.text), version: f.disk.version });
    expect(f.buffer()).toBe(f.disk.text);
    expect(f.merges).toHaveLength(1);
    expect(f.sent).toEqual([]);
    expect(f.saver.dirty()).toBe(false);
  });

  it('another file changing (only the version goes up) updates the base version without reading this one', async () => {
    const f = fakeDisk(BASE);
    f.disk.version = 5;
    await f.saver.sync({ hash: contentHash(BASE), version: 5 });
    f.type('"Base"', '"Postgres"');
    await f.saver.save();
    expect(f.reads()).toBe(0);
    expect(f.sent.map((p) => p.version)).toEqual([5]);
  });
});
