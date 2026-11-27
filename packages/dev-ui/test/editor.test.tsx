// @vitest-environment jsdom
import { completionStatus, startCompletion } from '@codemirror/autocomplete';
import { undo } from '@codemirror/commands';
import { forEachDiagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openTab, annotateRequests, BASIC_DSL, canvasReady, mountDevUi, pressNode } from './ui-helpers';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const DSL = BASIC_DSL;

const annotatePosts = () => annotateRequests();

/** Opens the Code tab and waits for the editor of `file` with its text loaded. */
async function openCode(file = 'main.dg'): Promise<{ box: HTMLElement; view: EditorView }> {
  await pressCode();
  return editorOf(file);
}

const pressCode = (): Promise<void> => openTab('Code');

async function editorOf(file: string): Promise<{ box: HTMLElement; view: EditorView }> {
  const box = await screen.findByRole('textbox', { name: new RegExp(`^Code of ${file.replace('.', '\\.')}`) });
  const view = EditorView.findFromDOM(box);
  if (view === null) throw new Error('no EditorView');
  await waitFor(() => expect(view.state.doc.length).toBeGreaterThan(0));
  return { box, view };
}

const write = (view: EditorView, after: string, text: string): void => {
  const from = view.state.doc.toString().indexOf(after) + after.length;
  view.dispatch({ changes: { from, insert: text }, userEvent: 'input.type' });
};

const cursorLine = (view: EditorView): number => view.state.doc.lineAt(view.state.selection.main.head).number;
const saveState = () => screen.getByRole('status', { name: 'Editor save state' });

describe('DSL editor: saving', () => {
  it('saves ~400 ms after typing stops, with only the minimal changes, and the canvas updates', async () => {
    const { posts, wrapFetch } = annotatePosts();
    const { dev, container } = await mountDevUi({ 'main.dg': DSL }, { wrapFetch });
    await canvasReady(container, 'mapa');
    const { view } = await openCode();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    write(view, 'servicio api "API', ' nueva');
    vi.advanceTimersByTime(399);
    await act(async () => undefined);
    expect(posts).toEqual([]);
    expect(saveState().textContent).toMatch(/Unsaved/);
    vi.advanceTimersByTime(1);
    vi.useRealTimers();

    await waitFor(() => expect(dev.workspace.text('main.dg')).toContain('servicio api "API nueva"'));
    expect(posts).toEqual([
      {
        route: '/api/edit',
        body: { ediciones: [{ file: 'main.dg', range: { start: { line: 6, column: 20 }, end: { line: 6, column: 20 } }, replacement: ' nueva' }], version: expect.any(Number), aunqueNoCompile: true },
      },
    ]);
    await waitFor(() => expect(saveState().textContent).toMatch(/^Saved/));
    expect(await within(screen.getByRole('main', { name: 'Canvas' })).findByText('API nueva')).toBeTruthy();
  });

  it('Mod+S saves right away without the browser dialog; losing focus also saves', async () => {
    const { dev } = await mountDevUi({ 'main.dg': DSL });
    const { box, view } = await openCode();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    write(view, 'include **', '\n  // uno');
    expect(fireEvent.keyDown(box, { key: 's', ctrlKey: true })).toBe(false);
    vi.useRealTimers();
    await waitFor(() => expect(dev.workspace.text('main.dg')).toContain('// uno'));

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    write(view, '// uno', '\n  // dos');
    fireEvent.blur(box);
    vi.useRealTimers();
    await waitFor(() => expect(dev.workspace.text('main.dg')).toContain('// dos'));
  });

  it('a text that does not compile is saved anyway: the canvas keeps the last good Source and the Gestures are disabled with the reason', async () => {
    const { dev, container } = await mountDevUi({ 'main.dg': DSL });
    await canvasReady(container, 'mapa');
    const { box, view } = await openCode();

    write(view, '  api -> db "lee"', '\n  fantasma -> api');
    fireEvent.keyDown(box, { key: 's', ctrlKey: true });

    await waitFor(() => expect(dev.workspace.text('main.dg')).toContain('fantasma -> api'));
    const reason = await screen.findByRole('status', { name: 'Gestures' });
    expect(reason.textContent).toMatch(/Gestures disabled/);
    expect(reason.textContent).toMatch(/main\.dg:9/);
    expect(await canvasReady(container, 'mapa')).toBeTruthy();
  });

  it('the pending save is flushed before undoing in dev', async () => {
    const { posts, wrapFetch } = annotatePosts();
    const { dev } = await mountDevUi({ 'main.dg': DSL }, { wrapFetch });
    const { view } = await openCode();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    write(view, 'include **', '\n  // pendiente');
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    vi.useRealTimers();

    await waitFor(() => expect(posts.map((p) => p.route)).toEqual(['/api/edit', '/api/undo']));
    await waitFor(() => expect(dev.workspace.text('main.dg')).toBe(DSL));
  });
});

describe('DSL editor: keys', () => {
  it('Mod+Z inside the editor uses its own history and does not touch the dev Undo history', async () => {
    const { posts, wrapFetch } = annotatePosts();
    await mountDevUi({ 'main.dg': DSL }, { wrapFetch });
    const { box, view } = await openCode();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    write(view, 'include **', '\n  // borrame');
    fireEvent.keyDown(box, { key: 'z', ctrlKey: true });

    expect(view.state.doc.toString()).toBe(DSL);
    expect(posts.filter((p) => p.route === '/api/undo')).toEqual([]);
  });

  it('the editor survives Esc and tab changes: it keeps its fine-grained history', async () => {
    await mountDevUi({ 'main.dg': DSL });
    const { box, view } = await openCode();
    write(view, 'include **', '\n  // borrame');

    view.focus();
    // The first Esc may close the completion that typing opened.
    for (let i = 0; i < 2 && screen.getByRole('tab', { name: 'Views' }).getAttribute('aria-selected') !== 'true'; i++) fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.getByRole('tab', { name: 'Views' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Code' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Issues' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Views' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Code' }));

    const current = await editorOf('main.dg');
    expect(current.view).toBe(view);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(DSL);
  });

  it('Esc closes the completion first and then goes back to Views', async () => {
    await mountDevUi({ 'main.dg': DSL });
    const { box, view } = await openCode();
    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('include') + 3 } });
    startCompletion(view);
    await waitFor(() => expect(completionStatus(view.state)).toBe('active'));

    fireEvent.keyDown(box, { key: 'Escape' });
    expect(completionStatus(view.state)).toBeNull();
    expect(screen.getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(box, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Views' }).getAttribute('aria-selected')).toBe('true'));
  });

  it('F12 jumps to the definition of an id, also in another file', async () => {
    const [model, views] = DSL.split('\nview mapa');
    await mountDevUi({ 'main.dg': model as string, 'vistas.dg': `view mapa${(views as string).replace('include **', 'include db')}` });
    await pressCode();
    fireEvent.change(await screen.findByRole('combobox', { name: 'File' }), { target: { value: 'vistas.dg' } });
    const { box, view } = await editorOf('vistas.dg');

    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('include db') + 'include d'.length } });
    fireEvent.keyDown(box, { key: 'F12' });

    const target = await editorOf('main.dg');
    await waitFor(() => expect(cursorLine(target.view)).toBe(7));
  });

  it('E opens Code at the block of the selected Node', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL });
    await canvasReady(container, 'mapa');
    pressNode(container, 'db');

    fireEvent.keyDown(document.body, { key: 'e' });

    const { view } = await editorOf('main.dg');
    await waitFor(() => expect(cursorLine(view)).toBe(7));
  });
});

describe('DSL editor: issues and read-only', () => {
  it('the file issues show inline from the state', async () => {
    // Without a good Source there is never a canvas (nor a frame remount): the tab is pressed directly.
    await mountDevUi({ 'main.dg': DSL.replace('api -> db "lee"', 'api -> fantasma') });
    fireEvent.click(await screen.findByRole('tab', { name: 'Code' }));
    const { view } = await editorOf('main.dg');

    await waitFor(() => {
      const found: { severity: string; line: number }[] = [];
      forEachDiagnostic(view.state, (d) => found.push({ severity: d.severity, line: view.state.doc.lineAt(d.from).number }));
      expect(found).toContainEqual({ severity: 'error', line: 8 });
    });
  });

  it('a --theme-path file opens read-only', async () => {
    await mountDevUi({ 'main.dg': DSL }, { themes: { 'tema.dg': 'theme claro extends neutral {}\n' } });
    await pressCode();
    fireEvent.change(await screen.findByRole('combobox', { name: 'File' }), { target: { value: 'tema.dg' } });

    const { box, view } = await editorOf('tema.dg');
    expect(box.getAttribute('aria-label')).toBe('Code of tema.dg (read-only)');
    expect(view.state.readOnly).toBe(true);
  });

  it('a --theme-path file open read-only receives external writes', async () => {
    const { posts, wrapFetch } = annotatePosts();
    const { dev } = await mountDevUi({ 'main.dg': DSL }, { themes: { 'tema.dg': 'theme claro extends neutral {}\n' }, wrapFetch });
    await pressCode();
    fireEvent.change(await screen.findByRole('combobox', { name: 'File' }), { target: { value: 'tema.dg' } });
    const { view } = await editorOf('tema.dg');

    dev.editThemeOutside('tema.dg', 'theme claro extends neutral {\n  palette { acento "#f43f5e" }\n}\n');

    await waitFor(() => expect(view.state.doc.toString()).toContain('#f43f5e'));
    expect(posts).toEqual([]);
  });
});

describe('DSL editor against external writes', () => {
  it('with a clean buffer it applies the disk change keeping cursor, selection and scroll, and marks the changed lines', async () => {
    const { posts, wrapFetch } = annotatePosts();
    const { dev } = await mountDevUi({ 'main.dg': DSL }, { wrapFetch });
    const { view } = await openCode();
    const includeStart = view.state.doc.toString().indexOf('include');
    view.dispatch({ selection: { anchor: includeStart, head: includeStart + 'include'.length } });
    view.scrollDOM.scrollTop = 40;
    const scroll = view.scrollDOM.scrollTop;

    dev.editOutside('main.dg', DSL.replace('specification {', '// del agente\nspecification {').replace('"API"', '"API publica"'));

    await waitFor(() => expect(view.state.doc.toString()).toContain('"API publica"'));
    expect(view.state.doc.toString()).toBe(dev.workspace.text('main.dg'));
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe('include');
    expect(view.scrollDOM.scrollTop).toBe(scroll);
    const marked = [...document.querySelectorAll('.cm-line.ui-linea-del-disco')].map((l) => l.textContent);
    expect(marked).toEqual(['// del agente', '  servicio api "API publica"']);
    expect(posts).toEqual([]);
    expect(saveState().textContent).toMatch(/^Saved/);
  });

  it('with a dirty buffer a 409 is merged with the disk and the save is retried', async () => {
    const { posts, wrapFetch, release } = retainListings();
    const { dev } = await mountDevUi({ 'main.dg': DSL }, { wrapFetch });
    const { view } = await openCode();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    write(view, 'include **', '\n  // mio');
    dev.editOutside('main.dg', DSL.replace('"API"', '"API publica"'));
    await act(async () => dev.settled());
    vi.advanceTimersByTime(400);
    vi.useRealTimers();

    const merged = DSL.replace('"API"', '"API publica"').replace('include **', 'include **\n  // mio');
    await waitFor(() => expect(dev.workspace.text('main.dg')).toBe(merged));
    expect(posts.filter((p) => p.route === '/api/edit')).toHaveLength(2);
    await waitFor(() => expect(saveState().textContent).toMatch(/^Saved/));
    expect(view.state.doc.toString()).toBe(merged);
    release();
  });

  it('on overlap the disk wins and a notice offers to recover the lost fragment until it expires', async () => {
    const { wrapFetch } = retainListings();
    const { dev } = await mountDevUi({ 'main.dg': DSL }, { wrapFetch });
    const { view } = await openCode();

    write(view, '"Base de datos', ' (mia)');
    dev.editOutside('main.dg', DSL.replace('"Base de datos"', '"Postgres"'));
    await act(async () => dev.settled());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.blur(view.contentDOM);

    // The 409, the disk read and the retry are promises without timers: flushing the queue is enough.
    for (let i = 0; i < 50 && screen.queryByRole('alert', { name: 'External write' }) === null; i++) await act(() => vi.advanceTimersByTimeAsync(0));
    const notice = screen.getByRole('alert', { name: 'External write' });
    expect(notice.textContent).toMatch(/the disk won in one place \(line 7\)/);
    expect(view.state.doc.toString()).toBe(DSL.replace('"Base de datos"', '"Postgres"'));
    expect(dev.workspace.text('main.dg')).toBe(DSL.replace('"Base de datos"', '"Postgres"'));

    act(() => vi.advanceTimersByTime(15_000 - 1));
    expect(screen.queryByRole('alert', { name: 'External write' })).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('alert', { name: 'External write' })).toBeNull();
  });

  it('recovering puts mine in place of what the disk won, without duplicating the line, and it is saved', async () => {
    const { wrapFetch } = retainListings();
    const { dev } = await mountDevUi({ 'main.dg': DSL }, { wrapFetch });
    const { view } = await openCode();

    write(view, '"Base de datos', ' (mia)');
    dev.editOutside('main.dg', DSL.replace('"Base de datos"', '"Postgres"'));
    await act(async () => dev.settled());
    fireEvent.blur(view.contentDOM);
    const notice = await screen.findByRole('alert', { name: 'External write' });

    fireEvent.click(within(notice).getByRole('button', { name: 'Restore mine' }));
    fireEvent.blur(view.contentDOM);

    const recovered = DSL.replace('"Base de datos"', '"Base de datos (mia)"');
    expect(view.state.doc.toString()).toBe(recovered);
    await waitFor(() => expect(dev.workspace.text('main.dg')).toBe(recovered));
    expect(screen.queryByRole('alert', { name: 'External write' })).toBeNull();
  });

  it('the watcher echo of an own save is recognized by hash and neither rereads nor touches the buffer', async () => {
    const reads: string[] = [];
    const { dev } = await mountDevUi(
      { 'main.dg': DSL },
      {
        wrapFetch: (f) => (async (entry: string | URL | Request, init?: RequestInit) => {
          if (String(entry).startsWith('/api/file/')) reads.push(String(entry));
          return f(entry, init);
        }) as typeof fetch,
      },
    );
    const { box, view } = await openCode();
    const diskLines: number[] = [];
    view.dispatch({ selection: { anchor: 0 } });

    write(view, 'include **', '\n  // mio');
    fireEvent.keyDown(box, { key: 's', ctrlKey: true });
    await waitFor(() => expect(dev.workspace.text('main.dg')).toContain('// mio'));
    await act(async () => dev.settled());
    await waitFor(() => expect(saveState().textContent).toMatch(/^Saved/));
    await act(async () => new Promise((r) => setTimeout(r, 50)));

    expect(reads).toEqual(['/api/file/main.dg']);
    for (const l of document.querySelectorAll('.cm-line.ui-linea-del-disco')) diskLines.push(Number(l.textContent));
    expect(diskLines).toEqual([]);
    expect(view.state.doc.toString()).toBe(dev.workspace.text('main.dg'));
  });
});

/** Records the POSTs and holds back the `/api/files` responses (the editor does not learn of the change until the 409). */
function retainListings(): ReturnType<typeof annotatePosts> & { release(): void } {
  const annotated = annotatePosts();
  const retained: (() => void)[] = [];
  let retain = false;
  return {
    posts: annotated.posts,
    bodies: annotated.bodies,
    release() {
      retain = false;
      for (const r of retained.splice(0)) r();
    },
    wrapFetch: (f) => {
      const withPosts = annotated.wrapFetch(f);
      return (async (entry: string | URL | Request, init?: RequestInit) => {
        if (String(entry) === '/api/files' && retain) await new Promise<void>((r) => retained.push(r));
        // The first listing (on open) goes through; from then on they are held back.
        if (String(entry) === '/api/files') retain = true;
        return withPosts(entry, init);
      }) as typeof fetch;
    },
  };
}
