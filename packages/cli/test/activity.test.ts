import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ACTIVITY_CONTRACT_VERSION, activityEventSchema } from 'canonical';
import type { ActivityEvent } from 'canonical';
import { run } from 'cli';

const DG = `specification { node servicio }
model {
  servicio a "A"
  servicio b "B"
  a -> b
}
view general {
  type architecture
  include **
}
`;

const WITH_ERRORS = `specification { node servicio }
model {
  servicio a "A"
  a -> nadie
}
view general {
  type architecture
  include **
}
`;

function workspace(text = DG): string {
  const root = mkdtempSync(join(tmpdir(), 'activity-'));
  writeFileSync(join(root, 'main.dg'), text);
  return root;
}

const log = (root: string) => join(root, '.diagrams', 'activity.jsonl');

function eventList(root: string): ActivityEvent[] {
  if (!existsSync(log(root))) return [];
  return readFileSync(log(root), 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => activityEventSchema.parse(JSON.parse(line)));
}

/** On: the package test environment turns it off by default. */
const active = { env: {} };

describe('Activity log', () => {
  it('validate leaves an Event with its summary and no stdout nor stderr', async () => {
    const root = workspace();
    const r = await run(['validate', '--workspace', root, '--json'], active);
    expect(r.exitCode).toBe(0);

    const [event, ...rest] = eventList(root);
    expect(rest).toEqual([]);
    expect(event).toMatchObject({
      contractVersion: ACTIVITY_CONTRACT_VERSION,
      pid: process.pid,
      command: 'validate',
      args: ['--workspace', root, '--json'],
      exitCode: 0,
      summary: { errors: 0, warnings: 0 },
    });
    expect(event?.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(event?.ts ?? ''))).toBe(false);
    expect(event).not.toHaveProperty('agente');
    expect(event).not.toHaveProperty('objetivo');
    expect(JSON.stringify(event)).not.toContain('stdout');
  });

  it('also logs exit 1 (with summary) and usage failure 2', async () => {
    const root = workspace(WITH_ERRORS);
    expect((await run(['build', '--workspace', root], active)).exitCode).toBe(1);
    expect((await run(['validate', '--workspace', root, '--max-issues', '0'], active)).exitCode).toBe(2);

    const [build, usage] = eventList(root);
    expect(build).toMatchObject({ command: 'build', exitCode: 1 });
    expect(build?.summary?.errors).toBeGreaterThan(0);
    expect(usage).toMatchObject({ command: 'validate', exitCode: 2, args: ['--workspace', root, '--max-issues', '0'] });
    expect(usage).not.toHaveProperty('resumen');
  });

  it('skill, help and a --workspace that is missing or does not resolve do not log', async () => {
    const root = workspace();
    await run(['skill', '--workspace', root], active);
    await run(['validate', '--help'], active);
    await run(['help', 'build'], active);
    expect(eventList(root)).toEqual([]);
    expect((await run(['validate'], active)).exitCode).toBe(2);
    const missingRoot = join(root, 'no-existe');
    expect((await run(['validate', '--workspace', missingRoot], active)).exitCode).toBe(2);
    expect(existsSync(join(missingRoot, '.diagrams'))).toBe(false);
    expect(existsSync(join(root, '.diagrams'))).toBe(false);
  });

  it('DIAGRAMS_ACTIVITY=0 turns it off and DIAGRAMS_AGENT reaches agent', async () => {
    const root = workspace();
    await run(['validate', '--workspace', root], { env: { DIAGRAMS_ACTIVITY: '0' } });
    expect(eventList(root)).toEqual([]);
    await run(['validate', '--workspace', root], { env: { DIAGRAMS_AGENT: 'revisor' } });
    expect(eventList(root).map((e) => e.agent)).toEqual(['revisor']);
  });

  it('inspect carries in target the View, Node or Theme it names; search does not', async () => {
    const root = workspace();
    await run(['inspect', 'view', 'general', '--workspace', root], active);
    await run(['inspect', 'node', 'zzz', '--workspace', root], active);
    await run(['inspect', 'theme', 'neutral', '--workspace', root], active);
    await run(['inspect', 'search', 'a', '--workspace', root], active);

    expect(eventList(root).map(({ exitCode, target }) => ({ exitCode, target }))).toEqual([
      { exitCode: 0, target: { view: 'general' } },
      { exitCode: 1, target: { node: 'zzz' } },
      { exitCode: 0, target: { theme: 'neutral' } },
      { exitCode: 0, target: undefined },
    ]);
  });

  it('edit carries the View and Node of the Intent and the files it wrote', async () => {
    const root = workspace();
    const pin = ['--view', 'general', '--node', 'a', '--x', '1', '--y', '2'];
    expect((await run(['edit', '--workspace', root, ...pin], active)).exitCode).toBe(0);
    const order = JSON.stringify({ type: 'reorder-lifelines', view: 'nada', order: ['a'] });
    expect((await run(['edit', '--workspace', root, '--intent', order], active)).exitCode).toBe(1);
    const editsJson = JSON.stringify([
      { file: 'main.dg', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: '// hello\n' },
    ]);
    expect((await run(['edit', '--workspace', root, '--edits', editsJson], active)).exitCode).toBe(0);

    expect(eventList(root).map(({ exitCode, target }) => ({ exitCode, target }))).toEqual([
      { exitCode: 0, target: { view: 'general', node: 'a', files: ['main.dg'] } },
      { exitCode: 1, target: { view: 'nada' } },
      { exitCode: 0, target: { files: ['main.dg'] } },
    ]);
  });

  it('a failure writing the log does not change stdout, stderr nor the exit code', async () => {
    const root = workspace();
    const expected = await run(['validate', '--workspace', root, '--json'], { env: { DIAGRAMS_ACTIVITY: '0' } });
    writeFileSync(join(root, '.diagrams'), 'not a folder');
    expect(await run(['validate', '--workspace', root, '--json'], active)).toEqual(expected);
  });

  it('past 1 MB it rotates to activity.1.jsonl', async () => {
    const root = workspace();
    mkdirSync(join(root, '.diagrams'));
    const oldName = `${'x'.repeat(1024 * 1024)}\n`;
    writeFileSync(log(root), oldName);
    await run(['validate', '--workspace', root], active);
    expect(readFileSync(join(root, '.diagrams', 'activity.1.jsonl'), 'utf8')).toBe(oldName);
    expect(eventList(root).map((e) => e.command)).toEqual(['validate']);
  });

  it('build replaces canonico.json and geometria/ and keeps the log', async () => {
    const root = workspace();
    await run(['validate', '--workspace', root], active);
    await run(['build', '--workspace', root], active);
    expect(existsSync(join(root, '.diagrams', 'geometria', 'general.json'))).toBe(true);
    writeFileSync(join(root, 'main.dg'), WITH_ERRORS);
    await run(['build', '--workspace', root], active);

    expect(existsSync(join(root, '.diagrams', 'canonico.json'))).toBe(false);
    expect(existsSync(join(root, '.diagrams', 'geometria'))).toBe(false);
    expect(eventList(root).map((e) => [e.command, e.exitCode])).toEqual([['validate', 0], ['build', 0], ['build', 1]]);
  });
});
