/** Entry of the `dev` page: assembles the real browser dependencies and mounts `<DevUi>` in `#raiz`. */
import { createRoot } from 'react-dom/client';

import { workerAdapter, browserHash } from 'shell';
import type { LayoutAdapter, LayoutPort } from 'shell';

import { DEV_EVENTS } from '../src/protocol';
import { DEV_UI_ROUTE } from '../src/routes';
import type { ClientDependencies } from './client';
import { DevUi } from './dev-ui';

/** One `EventSource` per connection; each named protocol event arrives with its name. */
const events: ClientDependencies['events'] = (url, onEvent) => {
  const origin = new EventSource(url);
  for (const name of DEV_EVENTS) origin.addEventListener(name, (event) => onEvent(name, (event as MessageEvent<string>).data));
  return () => origin.close();
};

function layoutInWorker(): LayoutAdapter {
  let adapter: Promise<LayoutAdapter> | undefined;
  return (view, theme, measures) => {
    adapter ??= fetch(`${DEV_UI_ROUTE}worker.js`)
      .then((r) => r.text())
      .then((code) => workerAdapter(new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))) as unknown as LayoutPort));
    return adapter.then((layout) => layout(view, theme, measures));
  };
}

const browserFetch: typeof fetch = (...args) => fetch(...args);
const confirm = (message: string): boolean => window.confirm(message);

createRoot(document.getElementById('raiz') as HTMLElement).render(<DevUi fetch={browserFetch} events={events} hash={browserHash(window)} layout={layoutInWorker()} confirm={confirm} />);
