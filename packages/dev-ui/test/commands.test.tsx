// @vitest-environment jsdom
import { EditorView } from '@codemirror/view';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { doubleClickOnNode, canvasReady, mountDevUi, pressNode } from './ui-helpers';

afterEach(cleanup);

const DSL = `specification {
  node servicio
}

model {
  servicio api "API" "Puerta de entrada"
  servicio db "Base de datos" "Guarda las cuentas"
  api -> db "lee"
}

view mapa {
  type architecture
  include **
}

view otra {
  type architecture
  include db
}
`;

/** Cursor line of the editor of `file` (the Code tab jumps to `file:line`). */
function editorLine(file: string): number | undefined {
  const box = screen.queryByRole('textbox', { name: `Code of ${file}` });
  const view = box === null ? null : EditorView.findFromDOM(box);
  return view === null ? undefined : view.state.doc.lineAt(view.state.selection.main.head).number;
}

const type = (key: string, o: Record<string, boolean> = {}, target: Element = document.body) => fireEvent.keyDown(target, { key, ...o });

describe('island shortcuts', () => {
  it('Mod+B hides and brings back the left island; Mod+J the right one', async () => {
    await mountDevUi({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Views' });

    type('b', { ctrlKey: true });
    expect(screen.queryByRole('listbox', { name: 'Views' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show left panel' })).toBeTruthy();
    type('b', { ctrlKey: true });
    expect(screen.getByRole('listbox', { name: 'Views' })).toBeTruthy();

    type('j', { ctrlKey: true });
    expect(screen.queryByRole('tablist', { name: 'Right panel' })).toBeNull();
    type('j', { ctrlKey: true });
    expect(screen.getByRole('tablist', { name: 'Right panel' })).toBeTruthy();
  });

  it('the hide buttons declare their shortcut', async () => {
    await mountDevUi({ 'main.dg': DSL });

    expect((await screen.findByRole('button', { name: 'Hide left panel' })).getAttribute('aria-keyshortcuts')).toBe('Control+B');
    expect(screen.getByRole('button', { name: 'Hide right panel' }).getAttribute('aria-keyshortcuts')).toBe('Control+J');
  });
});

describe('undo and redo through the registry', () => {
  it('Ctrl+Z outside text asks `dev` to undo and Ctrl+Y to redo (with an empty Undo history, they notify)', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL });
    await canvasReady(container, 'mapa');

    type('z', { ctrlKey: true });
    expect((await screen.findByRole('alert')).textContent).toContain('Nothing to undo');
    type('y', { ctrlKey: true });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Nothing to redo'));
  });

  it('in a text field Ctrl+Z belongs to the browser: it does not reach `dev`', async () => {
    await mountDevUi({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Views' });
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();

    type('z', { ctrlKey: true }, field);

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('alert')).toBeNull();
    field.remove();
  });
});

describe('E opens Code', () => {
  it('with a Node selected, at its block; without a selection, at the View block', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL });
    await canvasReady(container, 'mapa');

    type('e');
    expect(screen.getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(editorLine('main.dg')).toBe(11));

    pressNode(container, 'db');
    await waitFor(() => expect(window.location.hash).toContain('s=db'));
    type('e');
    await waitFor(() => expect(editorLine('main.dg')).toBe(7));
  });

  it('double click on a Node opens Code at its block', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL });
    await canvasReady(container, 'mapa');

    doubleClickOnNode(container, 'db');

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('true'));
    await waitFor(() => expect(editorLine('main.dg')).toBe(7));
  });

  it('opening Code also opens Issues in the right island', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL });
    await canvasReady(container, 'mapa');

    type('e');

    expect(screen.getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Issues' }).getAttribute('aria-selected')).toBe('true');
  });
});

const finder = async () => {
  type('k', { ctrlKey: true });
  const dialog = await screen.findByRole('dialog', { name: 'Finder' });
  return { dialog, field: within(dialog).getByRole('combobox', { name: 'Search' }) };
};
const write = (field: HTMLElement, text: string) => fireEvent.change(field, { target: { value: text } });

describe('Finder', () => {
  it('Mod+K opens it inside the chrome (not in the body, where it would lose its tokens); Escape closes it', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Views' });

    const { dialog, field } = await finder();
    expect(container.contains(dialog)).toBe(true);
    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Finder' })).toBeNull());
  });

  it('finds Views and jumps to the chosen one', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL });
    await canvasReady(container, 'mapa');
    const { dialog, field } = await finder();

    write(field, 'otr');
    fireEvent.click(await within(dialog).findByRole('option', { name: /^otra/ }));

    await canvasReady(container, 'otra');
    expect(window.location.hash).toBe('#view=otra');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Finder' })).toBeNull());
  });

  it('finds Nodes with inspect search (with their file:line) and opens their Details', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL });
    await canvasReady(container, 'mapa');
    const { dialog, field } = await finder();

    write(field, 'base');
    const node = await within(dialog).findByRole('option', { name: /Base de datos/ });
    expect(node.textContent).toContain('main.dg:7');
    fireEvent.click(node);

    await waitFor(() => expect(window.location.hash).toContain('s=db'));
    const detail = screen.getByRole('region', { name: 'Details' });
    expect(await within(detail).findByRole('heading', { name: 'Base de datos' })).toBeTruthy();
  });

  it('a Node the active View does not show leads to the first View that does and stays selected', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL });
    await canvasReady(container, 'mapa');
    const first = await finder();
    write(first.field, 'otr');
    fireEvent.click(await within(first.dialog).findByRole('option', { name: /^otra/ }));
    await canvasReady(container, 'otra');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Finder' })).toBeNull());
    const { dialog, field } = await finder();

    write(field, 'API');
    fireEvent.click(await within(dialog).findByRole('option', { name: /^API/ }));

    await canvasReady(container, 'mapa');
    await waitFor(() => expect(window.location.hash).toContain('s=api'));
    const detail = screen.getByRole('region', { name: 'Details' });
    expect(await within(detail).findByRole('heading', { name: 'API' })).toBeTruthy();
  });

  it('jumps to file:line in Code', async () => {
    await mountDevUi({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Views' });
    const { dialog, field } = await finder();

    write(field, 'main.dg:12');
    fireEvent.click(await within(dialog).findByRole('option', { name: /main\.dg:12/ }));

    expect(screen.getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(editorLine('main.dg')).toBe(12));
  });

  it('runs registry commands and shows their shortcut', async () => {
    await mountDevUi({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Views' });
    const { dialog, field } = await finder();

    write(field, 'left pan');
    expect((await within(dialog).findByRole('option', { name: /left panel/ })).textContent).toContain('Ctrl+B');
    write(field, 'undo hist');
    fireEvent.click(await within(dialog).findByRole('option', { name: /Open Undo history/ }));

    expect(screen.getByRole('tab', { name: 'Undo history' }).getAttribute('aria-selected')).toBe('true');
  });

  it('the top bar pill opens it and announces Mod+K', async () => {
    await mountDevUi({ 'main.dg': DSL });
    const pill = await screen.findByRole('button', { name: 'Search' });
    expect(pill.getAttribute('aria-keyshortcuts')).toBe('Control+K');

    fireEvent.click(pill);
    expect(await screen.findByRole('dialog', { name: 'Finder' })).toBeTruthy();
  });
});

describe('shortcuts help', () => {
  it('`?` opens it grouped by scope with the platform keys', async () => {
    await mountDevUi({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Views' });

    type('?', { shiftKey: true });
    const help = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    const global = within(help).getByRole('region', { name: 'Global' });
    expect(within(global).getByText('Undo').parentElement!.textContent).toContain('Ctrl+Z');
    expect(within(global).getByText('Redo').parentElement!.textContent).toContain('Ctrl+Y');
    expect(within(help).getByRole('region', { name: 'Canvas' })).toBeTruthy();
  });

  it('on mac keys are written with Cmd and Ctrl+Y does not show', async () => {
    await mountDevUi({ 'main.dg': DSL }, { platform: 'mac' });
    await screen.findByRole('listbox', { name: 'Views' });

    type('/', { metaKey: true });
    const help = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    const redo = within(help).getByText('Redo').parentElement!.textContent;
    expect(redo).toContain('Cmd+Shift+Z');
    expect(redo).not.toContain('Ctrl+Y');
  });
});
