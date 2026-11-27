// @vitest-environment jsdom
import { EditorView } from '@codemirror/view';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { annotateRequests, BASIC_DSL, canvasReady, mountDevUi } from './ui-helpers';
import type { MountOptions } from './ui-helpers';

afterEach(cleanup);

const DSL = BASIC_DSL;

/** Two dangling Edges, each with a single-candidate `fix` (lines 8 and 9 of main.dg). */
const DANGLING = DSL.replace('  api -> db "lee"\n', '  api -> dbb "lee"\n  db -> apii "escribe"\n');

/** The bodies of each POST to `/api/edit`; `before` runs before forwarding it to the fake (to cause races). */
const annotateEdits = (before?: (n: number) => void) => annotateRequests({ route: '/api/edit', ...(before !== undefined && { before }) });

/** Mounts with a good Workspace (to have a canvas), breaks it from outside and opens the Issues tab. */
async function mountWithIssues(text: string, options: MountOptions = {}) {
  const mounted = await mountDevUi({ 'main.dg': DSL }, options);
  await canvasReady(mounted.container, 'mapa');
  mounted.dev.editOutside('main.dg', text);
  await mounted.dev.settled();
  fireEvent.click(screen.getByRole('tab', { name: 'Issues' }));
  const list = await screen.findByRole('list', { name: 'Issues' });
  return { ...mounted, list };
}

describe('Issues panel', () => {
  it('the button of an issue sends its fix through POST /api/edit with the version it was seen at', async () => {
    const { bodies, wrapFetch } = annotateEdits();
    const { dev, list } = await mountWithIssues(DANGLING, { wrapFetch });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    const version = (await (await dev.fetch('/api/state')).json()) as { version: number };

    fireEvent.click(within(list).getByRole('button', { name: 'Apply fix for main.dg:8' }));

    await waitFor(() => expect(dev.workspace.text('main.dg')).toContain('  api -> db "lee"\n'));
    expect(bodies).toEqual([{ ediciones: [{ file: 'main.dg', range: { start: { line: 8, column: 10 }, end: { line: 8, column: 13 } }, replacement: 'db' }], version: version.version }]);
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Issues' })).getAllByRole('listitem')).toHaveLength(1));
  });

  it('an issue jumps to its file:line in the editor', async () => {
    const { list } = await mountWithIssues(DANGLING);

    fireEvent.click(await within(list).findByRole('button', { name: 'main.dg:9' }));

    expect(screen.getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('true');
    const box = await screen.findByRole('textbox', { name: /^Code of main\.dg/ });
    const view = EditorView.findFromDOM(box)!;
    await waitFor(() => expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(9));
  });

  it('the filter keeps only the matching issues and "Apply N fixes" counts the visible ones', async () => {
    const { bodies, wrapFetch } = annotateEdits();
    const { dev, list } = await mountWithIssues(DANGLING, { wrapFetch });
    expect(await screen.findByRole('button', { name: 'Apply 2 fix' })).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter issues' }), { target: { value: 'apii' } });

    expect(within(list).getAllByRole('listitem').map((li) => within(li).getAllByRole('button')[0]!.textContent)).toEqual(['main.dg:9']);
    fireEvent.click(screen.getByRole('button', { name: 'Apply 1 fix' }));
    await waitFor(() => expect(dev.workspace.text('main.dg')).toContain('  db -> api "escribe"\n'));
    expect(dev.workspace.text('main.dg')).toContain('  api -> dbb "lee"\n');
    expect(bodies).toEqual([expect.objectContaining({ descripcion: 'Apply 1 fix' })]);
  });

  it('the severity filter hides the errors and leaves "Apply 0 fixes" disabled', async () => {
    const { list } = await mountWithIssues(DANGLING);

    fireEvent.change(screen.getByRole('combobox', { name: 'Severity' }), { target: { value: 'warning' } });

    await waitFor(() => expect(within(list).queryAllByRole('listitem')).toHaveLength(0));
    expect((screen.getByRole('button', { name: 'Apply 0 fix' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('"Apply N fixes" sends all visible fixes in one request with a description: a single Undo history entry', async () => {
    const { bodies, wrapFetch } = annotateEdits();
    const { dev } = await mountWithIssues(DANGLING, { wrapFetch });

    fireEvent.click(await screen.findByRole('button', { name: 'Apply 2 fix' }));

    await waitFor(() => expect(dev.workspace.text('main.dg')).toBe(DSL.replace('  api -> db "lee"\n', '  api -> db "lee"\n  db -> api "escribe"\n')));
    expect(bodies).toEqual([{ ediciones: [expect.objectContaining({ replacement: 'db' }), expect.objectContaining({ replacement: 'api' })], version: expect.any(Number), descripcion: 'Apply 2 fix' }]);
    expect(await screen.findByText('No issues.')).toBeTruthy();
    // A single undo reverts both fixes.
    await dev.fetch('/api/undo', { method: 'POST', body: '{}' });
    expect(dev.workspace.text('main.dg')).toBe(DANGLING);
  });

  it.each([
    ['overlapping-edits', "Ediciones solapadas en 'main.dg'"],
    ['invalid', 'La edicion introduce un error: x'],
  ])('ante %s no se escribe nada y un aviso da motivo y archivo', async (reason, message) => {
    const rejection = new Response(JSON.stringify({ ok: false, reason, message, file: 'main.dg' }), { status: 422 });
    const { dev } = await mountWithIssues(DANGLING, {
      wrapFetch: (f) => ((entry: string | URL | Request, init?: RequestInit) => (String(entry) === '/api/edit' ? Promise.resolve(rejection) : f(entry, init))) as typeof fetch,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Apply 2 fix' }));

    expect((await screen.findByRole('alert')).textContent).toBe(`No fix was applied (${reason} in main.dg): ${message}`);
    expect(dev.workspace.text('main.dg')).toBe(DANGLING);
  });

  it('on a 409 the panel recomputes over the new state and retries', async () => {
    const outside: { dev?: Awaited<ReturnType<typeof mountDevUi>>['dev'] } = {};
    // Right before the first request, another process adds a line at the top: the seen ranges become stale.
    const { bodies, wrapFetch } = annotateEdits((n) => {
      if (n === 1) outside.dev?.editOutside('main.dg', `// agente\n${DANGLING}`);
    });
    const mounted = await mountWithIssues(DANGLING, { wrapFetch });
    outside.dev = mounted.dev;

    fireEvent.click(await within(mounted.list).findByRole('button', { name: 'Apply fix for main.dg:8' }));

    await waitFor(() => expect(mounted.dev.workspace.text('main.dg')).toContain('  api -> db "lee"\n'));
    expect(mounted.dev.workspace.text('main.dg')).toMatch(/^\/\/ agente\n/);
    expect(bodies).toEqual([
      expect.objectContaining({ ediciones: [expect.objectContaining({ range: expect.objectContaining({ start: { line: 8, column: 10 } }) })] }),
      expect.objectContaining({ ediciones: [expect.objectContaining({ range: expect.objectContaining({ start: { line: 9, column: 10 } }) })] }),
    ]);
  });
});
