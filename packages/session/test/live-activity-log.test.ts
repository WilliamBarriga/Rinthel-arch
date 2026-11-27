/** The live Activity log through the Live workspace (`connection` and `listen`), with `inMemoryPort` and a fake clock. */
import { afterEach, describe, expect, it } from 'vitest';

import type { DevActivity } from 'canonical';
import { openLiveWorkspace, inMemoryPort } from 'session';
import type { LiveWorkspacePort, LiveWorkspace } from 'session';

import { activityEvent as event, activityLines as lines } from '../../../tests/ayudas/actividad';
import { fakeClock } from '../../../tests/ayudas/reloj';

const MAIN = 'specification { node servicio }\nmodel { servicio a "A" }\n';

const opened: LiveWorkspace[] = [];
afterEach(() => {
  for (const ws of opened.splice(0)) ws.close();
});

async function open(port: LiveWorkspacePort) {
  const clock = fakeClock();
  const ws = await openLiveWorkspace({ port, clock, debounceMs: 100, root: '/ws', now: () => 0 });
  opened.push(ws);
  const pushed: DevActivity[] = [];
  ws.listen((e) => {
    if (e.name === 'actividad') pushed.push(e.data);
  });
  return { ws, clock, pushed };
}

/** The activity a client would receive on connect. */
const activityOnConnect = (ws: LiveWorkspace): DevActivity | undefined => ws.connection().find((e) => e.name === 'actividad')?.data as DevActivity | undefined;
const previousPids = (ws: LiveWorkspace): number[] => activityOnConnect(ws)?.eventos.map((e) => e.pid) ?? [];

describe('live Activity log', () => {
  it('on open replays the last 50 events of the log as activity with previos', async () => {
    const { ws } = await open(inMemoryPort({ own: { 'main.dg': MAIN }, activity: lines(...Array.from({ length: 60 }, (_, i) => event(i))) }));

    expect(activityOnConnect(ws)?.previos).toBe(true);
    expect(previousPids(ws)).toEqual(Array.from({ length: 50 }, (_, i) => i + 10));
  });

  it('with a log that does not exist yet it connects without events', async () => {
    const { ws } = await open(inMemoryPort({ own: { 'main.dg': MAIN } }));

    expect(activityOnConnect(ws)).toEqual({ previos: true, eventos: [] });
  });

  it('pushes the appended events as a single batch after the debounce, without the broken lines', async () => {
    const port = inMemoryPort({ own: { 'main.dg': MAIN } });
    const { ws, clock, pushed } = await open(port);

    port.appendActivity(lines(event(1, { command: 'edit', target: { view: 'v' } })));
    port.appendActivity('{esto no es json\n');
    clock.advance(50);
    port.appendActivity(lines(event(2)));
    clock.advance(99);
    expect(pushed).toEqual([]);
    clock.advance(1);

    expect(pushed).toEqual([{ previos: false, eventos: [event(1, { command: 'edit', target: { view: 'v' } }), event(2)] }]);
    expect(previousPids(ws)).toEqual([1, 2]);
  });

  it('a shortened, rotated or deleted log is read again from the start', async () => {
    const port = inMemoryPort({ own: { 'main.dg': MAIN }, activity: lines(event(1), event(2), event(3)) });
    const { clock, pushed } = await open(port);

    port.rewriteActivity(lines(event(4)));
    clock.advance(100);
    port.rewriteActivity(undefined);
    clock.advance(100);
    port.appendActivity(lines(event(5)));
    clock.advance(100);

    expect(pushed.flatMap(({ eventos }) => eventos.map((e) => e.pid))).toEqual([4, 5]);
  });

  it('a read failure is ignored: the next notice retries', async () => {
    const port = inMemoryPort({ own: { 'main.dg': MAIN } });
    let broken = false;
    const { clock, pushed } = await open({
      ...port,
      activity: {
        read: () => {
          if (broken) throw new Error('EBUSY');
          return port.activity?.read();
        },
        watch: (onChange) => port.activity!.watch(onChange),
      },
    });

    broken = true;
    port.appendActivity(lines(event(1)));
    clock.advance(100);
    expect(pushed).toEqual([]);
    broken = false;
    port.appendActivity(lines(event(2)));
    clock.advance(100);

    expect(pushed).toEqual([{ previos: false, eventos: [event(1), event(2)] }]);
  });

  it('close stops watching the log and cancels the pending debounce', async () => {
    const port = inMemoryPort({ own: { 'main.dg': MAIN } });
    const { ws, clock, pushed } = await open(port);

    port.appendActivity(lines(event(1)));
    ws.close();
    expect(clock.pending()).toBe(0);
    port.appendActivity(lines(event(2)));
    clock.advance(100);

    expect(clock.pending()).toBe(0);
    expect(pushed).toEqual([]);
  });
});
