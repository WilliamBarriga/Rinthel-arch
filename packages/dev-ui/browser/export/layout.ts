/**
 * Layout of an exported Dev UI (ADR 0003): the layout Worker comes as text inside the HTML and starts from a Blob. If
 * the browser does not let the page create it, or the Worker fails to start, the same code runs on the main thread
 * behind an in-process message port (one copy of ELK in the file, not two).
 */
import { adaptadorDeWorker } from 'shell';
import type { AdaptadorDeLayout, PuertoDeMensajes } from 'shell';

/** Two ends of an in-process channel: what one posts reaches the other's `onmessage` in a later task. */
function threadChannel(): [PuertoDeMensajes, PuertoDeMensajes] {
  const a: PuertoDeMensajes = { onmessage: null, postMessage: (data) => setTimeout(() => b.onmessage?.({ data })) };
  const b: PuertoDeMensajes = { onmessage: null, postMessage: (data) => setTimeout(() => a.onmessage?.({ data })) };
  return [a, b];
}

/** Runs the Worker code on the main thread: its `self` is the far end of an in-process channel. */
function mainThreadWorker(code: string): PuertoDeMensajes {
  const [page, worker] = threadChannel();
  new Function('self', code)(worker);
  return page;
}

export interface LayoutDependencies {
  /** `new Worker(url)`; by default the browser's. Throwing means "no Worker here". */
  createWorker?: (url: string) => Worker;
}

export function exportedLayout(code: string, { createWorker: createWorker = (url) => new Worker(url) }: LayoutDependencies = {}): AdaptadorDeLayout {
  let inThread: AdaptadorDeLayout | undefined;
  const main = (): AdaptadorDeLayout => (inThread ??= adaptadorDeWorker(mainThreadWorker(code)));
  let inWorker: { layout: AdaptadorDeLayout; down: Promise<'caido'> } | undefined;
  try {
    const worker = createWorker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    const down = new Promise<'caido'>((resolve) => worker.addEventListener('error', () => resolve('caido')));
    inWorker = { layout: adaptadorDeWorker(worker as unknown as PuertoDeMensajes), down };
  } catch {
    inWorker = undefined;
  }
  return async (view, theme, measures) => {
    const current = inWorker;
    if (current === undefined) return main()(view, theme, measures);
    const r = await Promise.race([current.layout(view, theme, measures), current.down]);
    if (r !== 'caido') return r;
    inWorker = undefined;
    return main()(view, theme, measures);
  };
}
