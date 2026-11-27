import { afterEach, describe, expect, it } from 'vitest';

import type { DevDiff, DevState, DevEvent } from 'canonical';

import { openLiveWorkspace, inMemoryPort } from 'session';
import type { LiveWorkspace } from 'session';

import { activityEvent, activityLines } from '../../../tests/helpers/activity';
import { fakeClock } from '../../../tests/helpers/clock';
import type { FakeClock } from '../../../tests/helpers/clock';

type LiveWorkspaceOptions = Parameters<typeof openLiveWorkspace>[0];

const opened: LiveWorkspace[] = [];
afterEach(() => {
  for (const ws of opened.splice(0)) ws.close();
});

async function open(port: ReturnType<typeof inMemoryPort>, extra: Partial<LiveWorkspaceOptions> = {}) {
  const clock = fakeClock();
  const ws = await openLiveWorkspace({ port, clock, debounceMs: 100, root: '/ws', now: () => 0, ...extra });
  opened.push(ws);
  return { ws, clock };
}

type DataOf<N extends DevEvent['name']> = Extract<DevEvent, { name: N }>['data'];

/** Listens only to the `name` events of the stream; returns how to stop listening. */
const onEvent = <N extends DevEvent['name']>(ws: LiveWorkspace, name: N, fn: (data: DataOf<N>) => void): (() => void) =>
  ws.listen((event) => {
    if (event.name === name) fn(event.data as DataOf<N>);
  });

/** Promise of the next state of the event stream. */
const nextState = (ws: LiveWorkspace): Promise<DevState> =>
  new Promise((ok) => {
    const stop = onEvent(ws, 'estado', (state) => {
      stop();
      ok(state);
    });
  });

/** External edit followed by the full debounce: resolves with the pushed state. */
async function changeOutside(ws: LiveWorkspace, clock: FakeClock, change: () => void): Promise<DevState> {
  const next = nextState(ws);
  change();
  clock.advance(100);
  return next;
}

const sequence = (gap: number) => `specification { node servicio }
model {
  servicio a
  servicio b
  interaction i "I" { a -> b "x" }
}
theme t {
  palette { papel "#fefce8"  tinta "#1f2937" }
  node { layer forma rect  layer relleno solid { color papel }  slots { title } }
  lifeline { gap ${gap} }
}
view v { type sequence  interaction i  theme t }
`;

describe('Live workspace: reload and classification', () => {
  it('changing lifeline { gap } of the Theme of a sequence View is classified as structure', async () => {
    const port = inMemoryPort({ own: { 'main.dg': sequence(100) } });
    const { ws, clock } = await open(port);

    const pushed = await changeOutside(ws, clock, () => port.editOutside('main.dg', sequence(300)));

    expect(pushed.cambio).toBe('estructura');
    expect(pushed.version).toBe(1);
  });

  it('changing row { height } of the Theme of an ER View is classified as structure', async () => {
    const er = (height: number) => `specification { node tabla }
model {
  tabla t1 "T1" {
    id: uuid pk
    name: text
  }
}
theme t {
  palette { papel "#fefce8"  tinta "#1f2937" }
  node { layer forma rect  layer relleno solid { color papel }  slots { title attrs } }
  row { height ${height} }
}
view v { type er  include **  theme t }
`;
    const port = inMemoryPort({ own: { 'main.dg': er(20) } });
    const { ws, clock } = await open(port);

    expect((await changeOutside(ws, clock, () => port.editOutside('main.dg', er(40)))).cambio).toBe('estructura');
  });
});

const MODEL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db
}

view general {
  type architecture
  include **
  theme t
}
`;

const theme = (fill: string, slots = 'title attrs') => `theme t {
  palette { papel "#fefce8"  tinta "#1f2937"  rojo "#dc2626" }
  node {
    layer forma rect { radius 8 }
    layer relleno solid { color ${fill} }
    layer borde border { color tinta width 1 }
    slots { ${slots} }
  }
}
`;

describe('Live workspace: more classification and reload', () => {
  it('a paint-only change is paint and keeps the Geometry', async () => {
    const port = inMemoryPort({ own: { 'main.dg': MODEL + theme('papel') } });
    const { ws, clock } = await open(port);
    const before = await ws.geometry('general');
    expect(ws.state().cambio).toBeUndefined();

    const pushed = await changeOutside(ws, clock, () => port.editOutside('main.dg', MODEL + theme('rojo')));

    expect(pushed.cambio).toBe('pintura');
    expect(await ws.geometry('general')).toEqual(before);
  });

  it('a change of Slots or of the Model is structure', async () => {
    const port = inMemoryPort({ own: { 'main.dg': MODEL + theme('papel') } });
    const { ws, clock } = await open(port);

    expect((await changeOutside(ws, clock, () => port.editOutside('main.dg', MODEL + theme('papel', 'title')))).cambio).toBe('estructura');
    expect((await changeOutside(ws, clock, () => port.editOutside('main.dg', (MODEL + theme('papel', 'title')).replace('"Base de datos"', '"Base"')))).cambio).toBe('estructura');
  });

  it('a .tsx is code and a new font is structure', async () => {
    const port = inMemoryPort({ own: { 'main.dg': MODEL + theme('papel') }, resources: { 'componentes/Rayo.tsx': 'a', 'fuentes/Erica.ttf': 'f1' } });
    const { ws, clock } = await open(port);

    expect((await changeOutside(ws, clock, () => port.touchResource('componentes/Rayo.tsx', 'b'))).cambio).toBe('codigo');
    const withFont = await changeOutside(ws, clock, () => port.touchResource('fuentes/Nueva.woff2', 'f2'));
    expect(withFont.cambio).toBe('estructura');
    expect(Object.keys(withFont.fuentes ?? {}).sort()).toEqual(['fuentes/Erica.ttf', 'fuentes/Nueva.woff2']);
  });

  it('with errors it keeps the last good drawing, without change; once fixed it compares against the last good one', async () => {
    const port = inMemoryPort({ own: { 'main.dg': MODEL + theme('papel') } });
    const { ws, clock } = await open(port);

    const broken = await changeOutside(ws, clock, () => port.editOutside('main.dg', (MODEL + theme('papel')).replace('servicio api', 'servico api')));

    expect(broken.issues[0]).toMatchObject({ file: 'main.dg', line: 6, severity: 'error' });
    expect(broken.issues[0]!.href).toContain('/ws/main.dg:6:');
    expect(broken.cambio).toBeUndefined();
    expect(broken.fuente?.model.nodes.map((n) => n.id)).toEqual(['api', 'db']);
    expect(Object.keys((await ws.geometry('general'))!.geometry.nodes).sort()).toEqual(['api', 'db']);
    const fixed = await changeOutside(ws, clock, () => port.editOutside('main.dg', MODEL + theme('rojo')));
    expect(fixed.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(fixed.cambio).toBe('pintura');
  });

  it('groups consecutive changes into a single recompilation and does not recompile before the debounce', async () => {
    const port = inMemoryPort({ own: { 'main.dg': MODEL + theme('papel') } });
    const { ws, clock } = await open(port);
    const pushed: number[] = [];
    onEvent(ws, 'estado', (e) => pushed.push(e.version));

    for (let i = 0; i < 5; i++) {
      port.editOutside('main.dg', MODEL.replace('"API"', `"API ${i}"`) + theme('papel'));
      clock.advance(50);
    }
    expect(pushed).toEqual([]);
    expect(clock.pending()).toBe(1);
    const next = nextState(ws);
    clock.advance(100);
    await next;

    expect(pushed).toEqual([1]);
    expect(ws.state().fuente?.model.nodes.find(({ id }) => id === 'api')?.title).toBe('API 4');
  });

  it('reload rereads the port without waiting for the debounce; close stops watching', async () => {
    const port = inMemoryPort({ own: { 'main.dg': MODEL + theme('papel') } });
    const { ws, clock } = await open(port);
    port.editOutside('main.dg', MODEL + theme('rojo'));

    await ws.reload();
    expect(ws.state()).toMatchObject({ version: 1, cambio: 'pintura' });

    ws.close();
    port.editOutside('main.dg', MODEL + theme('papel'));
    expect(clock.pending()).toBe(0);
  });

  it('the --theme-path Themes are compiled before the Workspace', async () => {
    const port = inMemoryPort({ own: { 'main.dg': MODEL }, themes: { 'temas/t.dg': theme('papel') } });
    const { ws } = await open(port);

    expect(ws.state().fuente?.themes.map(({ name }) => name)).toContain('t');
    expect(ws.state().issues).toEqual([]);
  });
});

const BASE = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db
}

view general {
  type architecture
  include **
}
`;

const pin = (x: number, y: number) => ({ type: 'move-pin', view: 'general', node: 'api', x, y }) as const;

describe('Live workspace: Gestures with the seen version', () => {
  it('with the current version it writes the edit, recompiles and answers the new version', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws } = await open(port);

    const r = await ws.edit(pin(10, 20), ws.state().version);

    expect(r).toEqual({ ok: true, version: 1 });
    expect(port.text('main.dg')).toContain('node api { pin 10,20 }');
    expect(ws.state().version).toBe(1);
  });

  it('an old version still stored applies if the file it changes has not changed since then', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE, 'otro.dg': '// otro\n' } });
    const { ws, clock } = await open(port);
    const seen = ws.state().version;
    await changeOutside(ws, clock, () => port.editOutside('otro.dg', '// otro editado\n'));

    const r = await ws.edit(pin(1, 2), seen);

    expect(r.ok).toBe(true);
    expect(port.text('main.dg')).toContain('pin 1,2');
  });

  it('an external change in another file, even before recompiling, is not a conflict', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE, 'otro.dg': '// otro\n' } });
    const { ws } = await open(port);
    port.editOutside('otro.dg', '// otro editado\n');

    expect((await ws.edit(pin(1, 2), 0)).ok).toBe(true);
    expect(port.text('otro.dg')).toBe('// otro editado\n');
  });

  it('an external change in the same file is rejected as stale-hash and nothing is written', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws, clock } = await open(port);
    const seen = ws.state().version;
    port.editOutside('main.dg', `${BASE}\n`);

    expect(await ws.edit(pin(1, 2), seen)).toMatchObject({ ok: false, reason: 'stale-hash' });
    // Also after recompiling: the old version is still stored, but its hash is no longer the one on disk.
    await changeOutside(ws, clock, () => port.editOutside('main.dg', `${BASE}\n\n`));
    expect(await ws.edit(pin(1, 2), seen)).toMatchObject({ ok: false, reason: 'stale-hash' });
    expect(port.text('main.dg')).toBe(`${BASE}\n\n`);
  });

  it('an already forgotten version (more than 16 versions back) is rejected as stale-hash', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE, 'otro.dg': '// 0\n' } });
    const { ws, clock } = await open(port);
    for (let i = 1; i <= 15; i++) await changeOutside(ws, clock, () => port.editOutside('otro.dg', `// ${i}\n`));
    expect(ws.state().version).toBe(15);
    expect((await ws.edit(pin(1, 2), 0)).ok).toBe(true); // version 0 is the 16th stored: still valid

    await changeOutside(ws, clock, () => port.editOutside('otro.dg', '// 17\n'));
    const r = await ws.edit(pin(3, 4), 0);

    expect(r).toMatchObject({ ok: false, reason: 'stale-hash' });
    expect(port.text('main.dg')).toContain('pin 1,2');
  });

  it('without a version it applies over the current text', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws } = await open(port);
    port.editOutside('main.dg', `${BASE}\n`);

    expect((await ws.edit(pin(1, 2))).ok).toBe(true);
  });

  it('a missing View, a missing Node or a --theme-path file are rejected without writing', async () => {
    const [model, views] = BASE.split('\nview general');
    const port = inMemoryPort({ own: { 'main.dg': model as string }, themes: { 'vistas.dg': `view general${views as string}` } });
    const { ws } = await open(port);

    expect(await ws.edit({ ...pin(1, 2), view: 'nada' }, 0)).toMatchObject({ ok: false, reason: 'unknown-view' });
    expect(await ws.edit({ ...pin(1, 2), node: 'ghost' }, 0)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await ws.edit(pin(1, 2), 0)).toMatchObject({ ok: false, reason: 'unknown-file', file: 'vistas.dg' });
    expect(port.read().own).toEqual({ 'main.dg': model });
    expect(ws.state().version).toBe(0);
  });

  it('reorder-lifelines is written with the seen version', async () => {
    const port = inMemoryPort({ own: { 'main.dg': sequence(100) } });
    const { ws } = await open(port);

    expect((await ws.edit({ type: 'reorder-lifelines', view: 'v', order: ['b', 'a'] }, 0)).ok).toBe(true);
    expect(port.text('main.dg')).toContain('order b, a');
  });
});

describe('Live workspace: undo, redo and write queue', () => {
  it('undo restores the exact previous text and redo reapplies the edit', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws } = await open(port);
    await ws.edit(pin(1, 2), 0);
    const withPin = port.text('main.dg');

    expect(await ws.undo()).toEqual({ ok: true, version: 2 });
    expect(port.text('main.dg')).toBe(BASE);
    expect((await ws.redo()).ok).toBe(true);
    expect(port.text('main.dg')).toBe(withPin);
  });

  it('with nothing to undo or redo it rejects with its reason and does not write', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws } = await open(port);

    expect(await ws.undo()).toMatchObject({ ok: false, reason: 'nothing-to-undo' });
    expect(await ws.redo()).toMatchObject({ ok: false, reason: 'nothing-to-redo' });
    expect(port.text('main.dg')).toBe(BASE);
  });

  it('an edit that does not change the text is not pushed; a new edit discards what could be redone', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws } = await open(port);
    await ws.edit(pin(1, 2));
    await ws.edit(pin(1, 2));
    expect((await ws.undo()).ok).toBe(true);
    expect(port.text('main.dg')).toBe(BASE);
    expect((await ws.undo()).ok).toBe(false);

    await ws.edit(pin(3, 4));
    expect(await ws.redo()).toMatchObject({ ok: false, reason: 'nothing-to-redo' });
  });

  it('an external write does not reset the File history: undo gives 409 only if a file the entry restores changed outside', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE, 'otro.dg': '// otro\n' } });
    const { ws, clock } = await open(port);
    await ws.edit(pin(1, 2));
    const withPin = port.text('main.dg')!;

    // Another file changes outside dev: the entry stays valid and undo does not overwrite the foreign change.
    await changeOutside(ws, clock, () => port.editOutside('otro.dg', '// otro a mano\n'));
    expect((await ws.undo()).ok).toBe(true);
    expect(port.read().own).toEqual({ 'main.dg': BASE, 'otro.dg': '// otro a mano\n' });
    expect((await ws.redo()).ok).toBe(true);
    expect(port.text('main.dg')).toBe(withPin);

    // The file the entry restores changes outside dev: 409 without overwriting it, and the File history is still there.
    const external = `${withPin}\n// editado a mano\n`;
    await changeOutside(ws, clock, () => port.editOutside('main.dg', external));
    expect(await ws.undo()).toMatchObject({ ok: false, reason: 'stale-hash', file: 'main.dg' });
    expect(await ws.undo()).toMatchObject({ ok: false, reason: 'stale-hash' });
    expect(port.text('main.dg')).toBe(external);
    expect(ws.history().pasado).toHaveLength(1);

    // An edit over the external text is pushed on top: undoing it goes back to the external text.
    await ws.edit(pin(5, 6));
    expect((await ws.undo()).ok).toBe(true);
    expect(port.text('main.dg')).toBe(external);
  });

  it('undo deletes the file the edit created and redo creates it again', async () => {
    const base = inMemoryPort({ own: { 'main.dg': BASE } });
    const port = { ...base, write: (path: string, text: string) => (base.write(path, text), path === 'main.dg' && base.write('extra.dg', '// extra\n')) };
    const { ws } = await open(port as typeof base);
    await ws.edit(pin(1, 2));
    expect(base.text('extra.dg')).toBe('// extra\n');

    expect((await ws.undo()).ok).toBe(true);
    expect(base.text('extra.dg')).toBeUndefined();
    expect((await ws.redo()).ok).toBe(true);
    expect(base.text('extra.dg')).toBe('// extra\n');
  });

  it('if the write fails halfway, it reverts what was written, propagates the failure and the history stays valid', async () => {
    const base = inMemoryPort({ own: { 'main.dg': BASE, 'b.dg': '// b\n' } });
    const failure = { active: false };
    const port = {
      ...base,
      write(path: string, text: string) {
        if (failure.active && path === 'main.dg') throw new Error('disco lleno');
        base.write(path, text);
      },
    };
    const { ws } = await open(port as typeof base);
    await ws.edit(pin(1, 2));
    const withPin = base.text('main.dg');
    base.editOutside('b.dg', '// b\n'); // no text change: the history stays valid
    await ws.undo();

    failure.active = true;
    await expect(ws.redo()).rejects.toThrow('disco lleno');
    expect(base.text('main.dg')).toBe(BASE);

    failure.active = false;
    expect((await ws.redo()).ok).toBe(true);
    expect(base.text('main.dg')).toBe(withPin);
  });

  it('concurrent operations are applied one after the other', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws } = await open(port);
    await ws.edit(pin(1, 2));
    await ws.edit(pin(3, 4));

    const results = await Promise.all([ws.undo(), ws.undo(), ws.undo()]);

    expect(results.map((r) => r.ok)).toEqual([true, true, false]);
    expect(port.text('main.dg')).toBe(BASE);
    // Two edits with the same seen version: the second one sees the text the first wrote and is rejected.
    const [a, b] = await Promise.all([ws.edit(pin(7, 8), ws.state().version), ws.edit(pin(9, 9), ws.state().version)]);
    expect(a.ok).toBe(true);
    expect(b).toMatchObject({ ok: false, reason: 'stale-hash' });
  });
});

describe('Live workspace: visible File history and jump (#193)', () => {
  it('jumping to a past entry leaves the text right after it, keeps the future and shows it with ids and time', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    let now = 1000;
    const { ws } = await open(port, { now: () => (now += 1000) });
    await ws.edit(pin(1, 2));
    const withOne = port.text('main.dg');
    await ws.edit(pin(3, 4));
    await ws.edit(pin(5, 6));

    expect(await ws.jump(1)).toMatchObject({ ok: true });
    expect(port.text('main.dg')).toBe(withOne);
    const h = ws.history();
    expect(h.pasado).toEqual([{ id: 1, descripcion: 'move api in general', archivos: ['main.dg'], cuando: 2000, alcanzable: true }]);
    expect(h.futuro.map((e) => e.id)).toEqual([2, 3]);
    expect(h.inicio).toEqual({ alcanzable: true });

    expect((await ws.jump(0)).ok).toBe(true);
    expect(port.text('main.dg')).toBe(BASE);
    expect((await ws.jump(3)).ok).toBe(true);
    expect(ws.history().pasado.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('each entry names only the files it changed and carries an increasing id that is not reused when the future is discarded', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE, 'otro.dg': '// otro\n' } });
    const { ws } = await open(port);
    await ws.edit(pin(1, 2));
    await ws.edit(pin(3, 4));
    await ws.edit(pin(5, 6));
    await ws.undo();

    await ws.edit(pin(7, 8));

    expect(ws.history().pasado.map(({ id, archivos }) => [id, archivos])).toEqual([
      [1, ['main.dg']],
      [2, ['main.dg']],
      [4, ['main.dg']],
    ]);
    expect(ws.history().futuro).toEqual([]);
  });

  it('jumping to a future entry redoes up to it and keeps what comes after', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws } = await open(port);
    await ws.edit(pin(1, 2));
    await ws.edit(pin(3, 4));
    const withTwo = port.text('main.dg');
    await ws.edit(pin(5, 6));
    await ws.jump(0);

    expect((await ws.jump(2)).ok).toBe(true);

    expect(port.text('main.dg')).toBe(withTwo);
    expect(ws.history().pasado.map((e) => e.id)).toEqual([1, 2]);
    expect(ws.history().futuro.map((e) => e.id)).toEqual([3]);
  });

  it('jumping does not write a file that changes and comes back along the way', async () => {
    const base = inMemoryPort({ own: { 'main.dg': BASE } });
    const written: string[] = [];
    const port = { ...base, write: (path: string, text: string) => (written.push(path), base.write(path, text)) };
    const { ws } = await open(port as typeof base);
    await ws.edit({ edits: [{ file: 'main.dg', range: { start: point(1, 1), end: point(1, 1) }, replacement: '// x\n' }] });
    await ws.edit({ edits: [{ file: 'main.dg', range: { start: point(1, 1), end: point(2, 1) }, replacement: '' }] });
    written.length = 0;

    expect((await ws.jump(0)).ok).toBe(true);

    expect(written).toEqual([]);
    expect(base.text('main.dg')).toBe(BASE);
    expect(ws.history().futuro).toHaveLength(2);
  });

  it('an external write makes unreachable, with a reason, the entries that would restore that file; jumping to them is 409', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws, clock } = await open(port);
    await ws.edit(pin(1, 2));
    await ws.edit(pin(3, 4));
    await changeOutside(ws, clock, () => port.editOutside('main.dg', `${port.text('main.dg')}\n`));

    const h = ws.history();
    expect(h.pasado[0]).toMatchObject({ id: 1, alcanzable: false, reason: expect.stringContaining('main.dg') });
    expect(h.pasado[1]).toMatchObject({ id: 2, alcanzable: true });
    expect(await ws.jump(1)).toMatchObject({ ok: false, reason: 'stale-hash', file: 'main.dg' });
    expect(await ws.jump(42)).toMatchObject({ ok: false, reason: 'unknown-entry' });
  });
});

describe('Live workspace: trust in code', () => {
  it('does not trust the code until trust(), unless told beforehand', async () => {
    const code = { components: {}, issues: [], bundle: 'return { A: 1 };' };
    const { ws } = await open(inMemoryPort({ own: { 'main.dg': BASE } }), { compileCode: () => code });
    expect(ws.code()).toEqual({ components: [], trusted: false, bundle: 'return { A: 1 };' });
    ws.trust();
    expect(ws.code().trusted).toBe(true);

    const { ws: trusted } = await open(inMemoryPort({ own: { 'main.dg': BASE } }), { trustCode: true });
    expect(trusted.code().trusted).toBe(true);
  });
});

const point = (line: number, column: number) => ({ line, column });

describe('Live workspace: editor text edits', () => {
  it('applies the edits with the seen version and leaves a "text of <file>" entry in the File history', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws } = await open(port);
    const r = await ws.edit({ edits: [{ file: 'main.dg', range: { start: point(7, 30), end: point(7, 30) }, replacement: ' "Datos"' }] }, ws.state().version);

    expect(r).toEqual({ ok: true, version: 1 });
    expect(port.text('main.dg')).toContain('servicio db "Base de datos" "Datos"');
    expect(ws.history()).toMatchObject({ pasado: [{ descripcion: 'text of main.dg', archivos: ['main.dg'] }], futuro: [] });
    expect((await ws.undo()).ok).toBe(true);
    expect(port.text('main.dg')).toBe(BASE);
    expect(ws.history()).toMatchObject({ pasado: [], futuro: [{ descripcion: 'text of main.dg', archivos: ['main.dg'] }] });
  });

  it('the description of the request wins; an Intent describes itself', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws } = await open(port);
    await ws.edit(pin(1, 2));
    await ws.edit({ edits: [{ file: 'main.dg', range: { start: point(1, 1), end: point(1, 1) }, replacement: '// hola\n' }], description: 'Apply 1 fix' });

    expect(ws.history().pasado.map((e) => e.descripcion)).toEqual(['move api in general', 'Apply 1 fix']);
  });

  it('if the file changed outside since the seen version, it rejects with stale-hash without writing', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws } = await open(port);
    const seen = ws.state().version;
    port.editOutside('main.dg', `${BASE}\n`);

    const r = await ws.edit({ edits: [{ file: 'main.dg', range: { start: point(1, 1), end: point(1, 1) }, replacement: '// x\n' }] }, seen);
    expect(r).toMatchObject({ ok: false, reason: 'stale-hash', file: 'main.dg' });
    expect(port.text('main.dg')).toBe(`${BASE}\n`);
  });

  it('with evenIfBroken it saves a text with errors; the state keeps the last good Canonical form with the issues', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws } = await open(port);
    const broken = { edits: [{ file: 'main.dg', range: { start: point(8, 3), end: point(8, 3) }, replacement: 'fantasma -> ' }] };

    expect(await ws.edit(broken, 0)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await ws.edit({ ...broken, evenIfBroken: true }, 0)).toMatchObject({ ok: true });
    expect(port.text('main.dg')).toContain('fantasma -> api -> db');
    expect(ws.state().fuente?.views.map((v) => v.id)).toEqual(['general']);
    expect(ws.state().issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('writing to a --theme-path file gives unknown-file', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE }, themes: { 'tema.dg': 'theme t {}\n' } });
    const { ws } = await open(port);
    const r = await ws.edit({ edits: [{ file: 'tema.dg', range: { start: point(1, 1), end: point(1, 1) }, replacement: '// x\n' }], evenIfBroken: true }, 0);
    expect(r).toMatchObject({ ok: false, reason: 'unknown-file', file: 'tema.dg' });
  });
});

describe('Live workspace: fix and "Apply N fix"', () => {
  const DANGLING = {
    'main.dg': BASE.replace('  api -> db\n', '  api -> dbb\n'),
    'mas.dg': 'model {\n  db -> apii\n}\n',
  };
  const fixesOf = (ws: LiveWorkspace) => ws.state().issues.flatMap((i) => (i.fix === undefined ? [] : [i.fix]));

  it('the fixes of several files go in one request: they are written together and stay as a single File history entry', async () => {
    const port = inMemoryPort({ own: DANGLING });
    const { ws } = await open(port);
    const fixes = fixesOf(ws);
    expect(fixes.map((f) => f.file).sort()).toEqual(['main.dg', 'mas.dg']);

    const r = await ws.edit({ edits: fixes, description: 'Aplicar 2 fix' }, ws.state().version);

    expect(r.ok).toBe(true);
    expect(port.text('main.dg')).toContain('  api -> db\n');
    expect(port.text('mas.dg')).toBe('model {\n  db -> api\n}\n');
    expect(ws.state().issues).toEqual([]);
    expect(ws.history().pasado).toMatchObject([{ descripcion: 'Aplicar 2 fix', archivos: ['main.dg', 'mas.dg'] }]);
    expect((await ws.undo()).ok).toBe(true);
    expect([port.text('main.dg'), port.text('mas.dg')]).toEqual([DANGLING['main.dg'], DANGLING['mas.dg']]);
  });

  it('if two fixes overlap it writes nothing, gives reason and file and does not touch the File history', async () => {
    const port = inMemoryPort({ own: DANGLING });
    const { ws } = await open(port);
    const fixes = fixesOf(ws);
    const inMain = fixes.find((f) => f.file === 'main.dg')!;

    const r = await ws.edit({ edits: [...fixes, { ...inMain, replacement: 'otro' }], description: 'Aplicar 3 fix' }, ws.state().version);

    expect(r).toMatchObject({ ok: false, reason: 'overlapping-edits', file: 'main.dg' });
    expect([port.text('main.dg'), port.text('mas.dg')]).toEqual([DANGLING['main.dg'], DANGLING['mas.dg']]);
    expect(ws.history().pasado).toEqual([]);
  });
});

describe('Live workspace: reading files for the editor', () => {
  it('lists the Workspace .dg files and the --theme-path ones (read-only) with their hash and the version', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE }, themes: { 'tema.dg': 'theme t {}\n' } });
    const { ws } = await open(port);
    const { version, archivos } = ws.files();
    expect(version).toBe(0);
    expect(archivos.map(({ file, soloLectura }) => ({ file, soloLectura }))).toEqual([
      { file: 'main.dg', soloLectura: false },
      { file: 'tema.dg', soloLectura: true },
    ]);
    expect(archivos[0]?.hash).toMatch(/^[0-9a-f]+$/);
  });

  it('gives the current text of a file with its hash and the version; a missing one is undefined', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws } = await open(port);
    expect(ws.file('main.dg')).toMatchObject({ file: 'main.dg', texto: BASE, version: 0 });
    expect(ws.file('nada.dg')).toBeUndefined();
  });
});

describe('Live workspace: Diff', () => {
  const collect = (ws: LiveWorkspace): DevDiff[] => {
    const received: DevDiff[] = [];
    onEvent(ws, 'diferencia', (d) => received.push(d));
    return received;
  };

  it('an external write pushes the Diff against the previous Session, with external origin and the state version', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws, clock } = await open(port);
    const received = collect(ws);

    const state = await changeOutside(ws, clock, () => port.editOutside('main.dg', BASE.replace('servicio db "Base de datos"', 'servicio db "Datos"\n  servicio cola "Cola"')));

    expect(received).toEqual([
      {
        version: state.version,
        origen: 'externo',
        agregados: [{ kind: 'node', id: 'cola' }],
        quitados: [],
        cambiados: [{ elemento: { kind: 'node', id: 'db' }, propiedades: [{ nombre: 'title', clase: 'texto' }] }],
      },
    ]);
  });

  it('UI writes (Intent, undo, redo) are own and their echo does not push another Diff', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws, clock } = await open(port);
    const received = collect(ws);

    await ws.edit(pin(1, 2), 0);
    await ws.undo();
    await ws.redo();
    clock.advance(100);
    await ws.reload();

    expect(received.map((d) => [d.origen, d.version])).toEqual([
      ['propio', 1],
      ['propio', 2],
      ['propio', 3],
    ]);
    expect(received[0]?.cambiados).toEqual([{ elemento: { kind: 'view', id: 'general' }, propiedades: [{ nombre: 'overrides', clase: 'estructura' }] }]);
  });

  it('jumping in the File history is an own write: its Diff comes with own origin and its echo does not push another', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws, clock } = await open(port);
    await ws.edit(pin(1, 2));
    await ws.edit(pin(3, 4));
    const received = collect(ws);

    expect(await ws.jump(0)).toMatchObject({ ok: true });
    expect((await ws.jump(2)).ok).toBe(true);
    clock.advance(100);
    await ws.reload();

    expect(received.map((d) => d.origen)).toEqual(['propio', 'propio']);
    expect(received[0]?.cambiados).toEqual([{ elemento: { kind: 'view', id: 'general' }, propiedades: [{ nombre: 'overrides', clase: 'estructura' }] }]);
  });

  it('a UI write recompiled together with an external one in another file is external', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE, 'otro.dg': 'model {\n  servicio x "X"\n}\n' } });
    const { ws } = await open(port);
    const received = collect(ws);

    port.editOutside('otro.dg', 'model {\n  servicio x "X nuevo"\n}\n');
    await ws.edit(pin(1, 2), 0);

    expect(received.map((d) => d.origen)).toEqual(['externo']);
    expect(received[0]?.cambiados.map((c) => c.elemento)).toEqual([
      { kind: 'node', id: 'x' },
      { kind: 'view', id: 'general' },
    ]);
  });

  it('several Sessions with errors in a row give a single Diff against the last good Session', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws, clock } = await open(port);
    const received = collect(ws);

    await changeOutside(ws, clock, () => port.editOutside('main.dg', BASE.replace('servicio api', 'servico api')));
    await changeOutside(ws, clock, () => port.editOutside('main.dg', BASE.replace('servicio api "API"', 'servico api "API 2"')));
    expect(received).toEqual([]);
    const fixed = await changeOutside(ws, clock, () => port.editOutside('main.dg', BASE.replace('"API"', '"API 3"')));

    expect(received).toEqual([
      { version: fixed.version, origen: 'externo', agregados: [], quitados: [], cambiados: [{ elemento: { kind: 'node', id: 'api' }, propiedades: [{ nombre: 'title', clase: 'texto' }] }] },
    ]);
  });

  it('UI text edits, even saved without compiling with evenIfBroken, give a single own Diff', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws } = await open(port);
    const received = collect(ws);
    const insert = (text: string) => ({ edits: [{ file: 'main.dg', range: { start: point(6, 18), end: point(6, 18) }, replacement: text }], evenIfBroken: true });

    await ws.edit(insert(' "Atiende'));
    expect(received).toEqual([]);
    await ws.edit(insert('"'));

    expect(received.map((d) => [d.origen, d.cambiados.map((c) => c.elemento)])).toEqual([['propio', [{ kind: 'node', id: 'api' }]]]);
  });

  it('going back to the last good Session pushes nothing and the next own write no longer inherits the external origin', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE, 'otro.dg': '// otro\n' } });
    const { ws, clock } = await open(port);
    const received = collect(ws);

    await changeOutside(ws, clock, () => port.editOutside('otro.dg', 'model { roto'));
    await changeOutside(ws, clock, () => port.editOutside('otro.dg', '// otro\n'));
    expect(received).toEqual([]);
    await ws.edit(pin(1, 2));

    expect(received.map((d) => d.origen)).toEqual(['propio']);
  });
});

describe('Live workspace: event protocol', () => {
  it('the connection snapshot gives state, File history and the activity with previos, in that order', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE }, activity: activityLines(activityEvent(3)) });
    const { ws } = await open(port);
    await ws.edit(pin(1, 2));

    const connection = ws.connection();

    expect(connection.map(({ name }) => name)).toEqual(['estado', 'historial', 'actividad']);
    expect(connection[0]?.data).toMatchObject({ version: 1 });
    expect(connection[1]?.data).toMatchObject({ pasado: [{ id: 1, descripcion: 'move api in general', archivos: ['main.dg'] }], futuro: [] });
    expect(connection[2]?.data).toEqual({ previos: true, eventos: [activityEvent(3)] });
  });

  it('after each state comes its File history and then its Diff; appended activity arrives alone after the debounce', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws, clock } = await open(port);
    const received: DevEvent[] = [];
    ws.listen((event) => received.push(event));

    await ws.edit(pin(1, 2), 0);
    await changeOutside(ws, clock, () => port.editOutside('main.dg', BASE.replace('"API"', '"API nueva"')));
    port.appendActivity(activityLines(activityEvent(9)));
    expect(received.map(({ name }) => name)).toEqual(['estado', 'historial', 'diferencia', 'estado', 'historial', 'diferencia']);
    clock.advance(100);

    expect(received.map(({ name }) => name).slice(6)).toEqual(['actividad']);
    expect(received[1]?.data).toMatchObject({ pasado: [{ id: 1 }], inicio: { alcanzable: true } });
    expect(received[4]?.data).toMatchObject({ pasado: [{ id: 1 }], inicio: { alcanzable: false } });
    expect(received.map((e) => (e.name === 'diferencia' ? [e.data.origen, e.data.version] : undefined)).filter(Boolean)).toEqual([
      ['propio', 1],
      ['externo', 2],
    ]);
    expect(received[6]?.data).toEqual({ previos: false, eventos: [activityEvent(9)] });
  });

  it('stopping listening cuts the stream', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE } });
    const { ws } = await open(port);
    const received: DevEvent[] = [];
    const stop = ws.listen((event) => received.push(event));

    stop();
    await ws.edit(pin(1, 2), 0);

    expect(received).toEqual([]);
  });
});

describe('Live workspace: old file conventions (the Dev UI fix action)', () => {
  it('reports old-workspace-convention and its rename fix renames the file, together with a text fix', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE, 'temas/t.dg': 'theme t extends neutral { node { state hover { layer borde { width 2 } } } }\n' } });
    const { ws } = await open(port);
    const fixes = ws.state().issues.flatMap((i) => (i.fix === undefined ? [] : [i.fix]));
    expect(ws.state().issues.map((i) => i.code).sort()).toEqual(['old-catalog-value', 'old-workspace-convention']);

    const r = await ws.edit({ edits: fixes }, ws.state().version);

    expect(r).toMatchObject({ ok: true });
    expect(port.text('themes/t.dg')).toContain('layer border');
    expect(port.text('temas/t.dg')).toBeUndefined();
    expect(ws.state().issues).toEqual([]);
  });

  it('a rename onto an existing path is rejected with invalid-rename and nothing is written', async () => {
    const port = inMemoryPort({ own: { 'main.dg': BASE, 'temas/t.dg': 'theme t extends neutral-dark {\n}\n', 'themes/u.dg': 'theme u extends neutral-dark {\n}\n' } });
    const { ws } = await open(port);
    const fix = ws.state().issues.find((i) => i.code === 'old-workspace-convention')?.fix;

    expect(await ws.edit({ edits: [fix!] }, ws.state().version)).toMatchObject({ ok: false, reason: 'invalid-rename' });
    expect(port.text('temas/t.dg')).toBeDefined();
  });
});
