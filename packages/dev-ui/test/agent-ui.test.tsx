// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ActivityEvent } from 'canonical';

import { activityEvent, activityLines } from '../src/contract';
import { canvasReady, mountDevUi } from './ui-helpers';

afterEach(cleanup);

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db "lee"
}

view mapa {
  type architecture
  include **
}

view detalle {
  type flow
  include api
}

view otra {
  type architecture
  include db
}
`;

const ARGS = ['--workspace', '.', '--intent', '{"tipo":"move-pin"}'];
const event = (pid: number, extra: Partial<ActivityEvent> = {}): ActivityEvent => activityEvent(pid, { args: ARGS, ...extra });
const lines = activityLines;

const feed = () => screen.getByRole('list', { name: 'Agent activity' });
const lastLine = () => screen.getByRole('button', { name: /^Agent last line/ });
const toggleSwitch = () => screen.getByRole('switch', { name: 'Follow the agent' });

describe('agent feed', () => {
  it('on open shows the previous Events, newest at the top, with time, who, command, target and mark; args when expanded', async () => {
    await mountDevUi(
      { 'main.dg': DSL },
      { activity: lines(event(11, { command: 'validate', exitCode: 1, summary: { errors: 2, warnings: 0 } }), event(12, { agent: 'claude', target: { view: 'otra' } })) },
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'Agent' }));

    const items = await waitFor(() => {
      const found = within(feed()).getAllByRole('listitem');
      expect(found).toHaveLength(2);
      return found;
    });
    const [fresh, old] = items as [HTMLElement, HTMLElement];
    expect(fresh.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-19T10:00:00.000Z');
    expect(within(fresh).getByText(/^\d\d:\d\d:\d\d$/)).toBeTruthy();
    expect(within(fresh).getByText('claude')).toBeTruthy();
    expect(within(fresh).getByText('edit')).toBeTruthy();
    expect(within(fresh).getByText('ok')).toBeTruthy();
    expect(within(old).getByText('pid 11')).toBeTruthy();
    expect(within(old).getByText('2 errors')).toBeTruthy();

    expect(within(fresh).queryByText(/--intent/)).toBeNull();
    fireEvent.click(within(fresh).getByRole('button', { name: 'Show args' }));
    expect(within(fresh).getByText(`diagrams edit --workspace . --intent {"tipo":"move-pin"}`)).toBeTruthy();
  });

  it('the target is clickable and goes to the View it names', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL }, { activity: lines(event(1, { target: { view: 'otra' } })) });
    await canvasReady(container, 'mapa');
    fireEvent.click(screen.getByRole('tab', { name: 'Agent' }));

    fireEvent.click(await within(feed()).findByRole('button', { name: 'otra' }));

    await canvasReady(container, 'otra');
    expect(window.location.hash).toBe('#view=otra');
  });
});

describe('agent last line', () => {
  it('the pill shows the last line and counts what is new when not following the agent; a click opens the Agent tab and marks it seen', async () => {
    const { dev } = await mountDevUi({ 'main.dg': DSL }, { activity: lines(event(1)) });
    await waitFor(() => expect(lastLine().getAttribute('aria-label')).toBe('Agent last line: pid 1 edit'));

    act(() => {
      dev.appendActivity(lines(event(2, { agent: 'claude', target: { view: 'otra' } }), event(3, { agent: 'claude', target: { node: 'db' } })));
    });

    await waitFor(() => expect(lastLine().getAttribute('aria-label')).toBe('Agent last line: claude edit db, 2 unseen'));
    expect(lastLine().textContent).toContain('2');
    expect(window.location.hash).not.toContain('view=otra');

    fireEvent.click(lastLine());
    expect(screen.getByRole('tab', { name: 'Agent' }).getAttribute('aria-selected')).toBe('true');
    expect(lastLine().getAttribute('aria-label')).toBe('Agent last line: claude edit db');
  });
});

describe('follow the agent', () => {
  it('target.view navigates; target.node stays if the View contains it or goes to the first one that does; files does not move; the islands do not change', async () => {
    const { dev, container } = await mountDevUi({ 'main.dg': DSL }, { activity: lines(event(1, { target: { view: 'detalle' } })) });
    await canvasReady(container, 'mapa');
    fireEvent.click(toggleSwitch());
    expect(toggleSwitch().getAttribute('aria-checked')).toBe('true');
    // The previous ones do not move.
    expect(window.location.hash).not.toContain('view=detalle');
    const right = screen.getByRole('tablist', { name: 'Right panel' });
    const activeRight = () => within(right).getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;
    expect(activeRight()).toBe('Details');

    act(() => dev.appendActivity(lines(event(2, { target: { view: 'otra' } }))));
    await waitFor(() => expect(window.location.hash).toBe('#view=otra'));

    act(() => dev.appendActivity(lines(event(3, { target: { node: 'db' } }))));
    await waitFor(() => expect(window.location.hash).toBe('#view=otra&s=db'));

    act(() => dev.appendActivity(lines(event(4, { target: { node: 'api' } }))));
    // `mapa` is the default View: the hash omits it.
    await waitFor(() => expect(window.location.hash).toBe('#s=api'));
    expect(screen.getByRole('option', { name: 'mapa' }).getAttribute('aria-selected')).toBe('true');

    act(() => dev.appendActivity(lines(event(5, { target: { files: ['main.dg'] } }))));
    await waitFor(() => expect(lastLine().getAttribute('aria-label')).toBe('Agent last line: pid 5 edit main.dg'));
    expect(window.location.hash).toBe('#s=api');

    expect(activeRight()).toBe('Details');
    expect(screen.getByRole('listbox', { name: 'Views' })).toBeTruthy();
  });

  it('a Node the agent names before the state that creates it arrives is followed when that state arrives', async () => {
    const { dev, container } = await mountDevUi({ 'main.dg': DSL });
    await canvasReady(container, 'mapa');
    fireEvent.click(toggleSwitch());

    act(() => dev.appendActivity(lines(event(2, { target: { node: 'cache' } }))));
    act(() => dev.editOutside('main.dg', DSL.replace('include db', 'include db, cache').replace('servicio db "Base de datos"', 'servicio db "Base de datos"\n  servicio cache "Cache"').replace('include **', 'include api, db')));

    await waitFor(() => expect(window.location.hash).toBe('#view=otra&s=cache'));
  });

  it('the Finder turns it on and off with "Follow the agent: on" and "Follow the agent: off"', async () => {
    await mountDevUi({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Views' });
    const run = async (name: string) => {
      fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
      const dialog = await screen.findByRole('dialog', { name: 'Finder' });
      fireEvent.change(within(dialog).getByRole('combobox', { name: 'Search' }), { target: { value: 'follow' } });
      fireEvent.click(await within(dialog).findByRole('option', { name: new RegExp(name) }));
    };

    await run('Follow the agent: on');
    await waitFor(() => expect(toggleSwitch().getAttribute('aria-checked')).toBe('true'));
    await run('Follow the agent: off');
    await waitFor(() => expect(toggleSwitch().getAttribute('aria-checked')).toBe('false'));
  });

  it('turned off it does not move the canvas', async () => {
    const { dev, container } = await mountDevUi({ 'main.dg': DSL });
    await canvasReady(container, 'mapa');

    act(() => dev.appendActivity(lines(event(2, { target: { view: 'otra' } }))));

    await waitFor(() => expect(lastLine().getAttribute('aria-label')).toContain('1 unseen'));
    expect(window.location.hash).not.toContain('otra');
  });
});
