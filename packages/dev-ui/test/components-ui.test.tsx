// @vitest-environment jsdom
/**
 * Theme components and SSE state in the app mounted over `inMemoryDev`: the code query, the trust confirmation and the
 * bundle go through the client; a malformed response or `estado` event is reported without breaking the UI.
 */
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TEST_BUNDLE, WITH_CODE } from '../src/contract';
import { canvasReady, mountDevUi } from './ui-helpers';

afterEach(cleanup);

const CODE = { components: ['Aurora'], bundle: TEST_BUNDLE };

/** Replaces the response of `route` (GET) with `response()`; counts how many times it was requested. */
function replaceRoute(route: string, response: () => Response) {
  const requested = { n: 0 };
  return {
    requested: requested,
    wrapFetch: (f: typeof fetch) =>
      (async (entry: string | URL | Request, init?: RequestInit) => {
        if (String(entry) !== route) return f(entry, init);
        requested.n++;
        return response();
      }) as typeof fetch,
  };
}

describe('Theme components in the app', () => {
  it('on confirm, dev trusts and the canvas draws the Component; it does not ask again', async () => {
    const questions: string[] = [];
    const { dev, container } = await mountDevUi({ 'main.dg': WITH_CODE }, { code: CODE, confirm: (m) => (questions.push(m), true) });

    await waitFor(() => expect(container.querySelector('[data-aurora="api"]')).not.toBeNull());
    expect(questions).toHaveLength(1);
    expect(questions[0]).toContain('Aurora');
    expect(await (await dev.fetch('/api/code')).json()).toMatchObject({ confiado: true });

    dev.editOutside('main.dg', WITH_CODE.replace('"API"', '"API nueva"'));
    await dev.settled();
    await waitFor(() => expect(container.querySelector('[data-aurora="api"]')?.closest('[data-id="api"]')?.textContent).toContain('API nueva'));
    expect(questions).toHaveLength(1);
  });

  it('on refuse there is no trust nor bundle request, and it does not ask again after another state', async () => {
    let questions = 0;
    const bundle = replaceRoute('/components.js', () => new Response('', { status: 500 }));
    const { dev, container } = await mountDevUi({ 'main.dg': WITH_CODE }, { code: CODE, confirm: () => (questions++, false), wrapFetch: bundle.wrapFetch });
    await canvasReady(container, 'general');
    await waitFor(() => expect(questions).toBe(1));

    dev.editOutside('main.dg', WITH_CODE.replace('"API"', '"API nueva"'));
    await dev.settled();
    await waitFor(() => expect(container.querySelector('[data-id="api"]')?.textContent).toContain('API nueva'));

    expect(questions).toBe(1);
    expect(bundle.requested.n).toBe(0);
    expect(container.querySelector('[data-aurora]')).toBeNull();
    expect(await (await dev.fetch('/api/code')).json()).toMatchObject({ confiado: false });
  });

  it('a malformed /api/code response is reported as a failure, without asking', async () => {
    let questions = 0;
    const code = replaceRoute('/api/code', () => Response.json({ temaConCodigo: 'si' }));
    const { container } = await mountDevUi({ 'main.dg': WITH_CODE }, { code: CODE, confirm: () => (questions++, true), wrapFetch: code.wrapFetch });

    expect((await screen.findByRole('alert')).textContent).toContain('Could not load the Theme components');
    await canvasReady(container, 'general');
    expect(questions).toBe(0);
    expect(container.querySelector('[data-aurora]')).toBeNull();
  });

  it('a bundle that imports a module other than React is reported as a failure', async () => {
    const { container } = await mountDevUi({ 'main.dg': WITH_CODE }, { code: { components: ['Aurora'], bundle: "require('fs'); return {};" }, confirm: () => true });

    expect((await screen.findByRole('alert')).textContent).toContain("cannot import 'fs'");
    await canvasReady(container, 'general');
    expect(container.querySelector('[data-aurora]')).toBeNull();
  });
});

describe('malformed estado event', () => {
  it('does not replace the current state, is reported, and the next valid state is applied', async () => {
    const inject: { send?: (name: string, data: string) => void } = {};
    const { dev, container } = await mountDevUi(
      { 'main.dg': WITH_CODE },
      {
        wrapEvents: (events) => (url, onEvent) => {
          inject.send = onEvent;
          return events(url, onEvent);
        },
      },
    );
    await canvasReady(container, 'general');

    // With a huge `version`: if it were accepted, the following real states would be discarded as old.
    inject.send?.('estado', JSON.stringify({ version: 999_999, vistas: 'general' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Malformed state event');
    expect(container.querySelector('[data-id="api"]')?.textContent).toContain('API');

    dev.editOutside('main.dg', WITH_CODE.replace('"API"', '"API nueva"'));
    await dev.settled();
    await waitFor(() => expect(container.querySelector('[data-id="api"]')?.textContent).toContain('API nueva'));
  });
});
