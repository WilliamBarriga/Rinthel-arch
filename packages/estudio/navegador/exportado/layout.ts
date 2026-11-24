/**
 * Layout of an exported Dev UI (ADR 0003): the layout Worker comes as text inside the HTML and starts from a Blob. If
 * the browser does not let the page create it, or the Worker fails to start, the same code runs on the main thread
 * behind an in-process message port (one copy of ELK in the file, not two).
 */
import { adaptadorDeWorker } from 'shell';
import type { AdaptadorDeLayout, PuertoDeMensajes } from 'shell';

/** Two ends of an in-process channel: what one posts reaches the other's `onmessage` in a later task. */
function canalEnHilo(): [PuertoDeMensajes, PuertoDeMensajes] {
  const a: PuertoDeMensajes = { onmessage: null, postMessage: (data) => setTimeout(() => b.onmessage?.({ data })) };
  const b: PuertoDeMensajes = { onmessage: null, postMessage: (data) => setTimeout(() => a.onmessage?.({ data })) };
  return [a, b];
}

/** Runs the Worker code on the main thread: its `self` is the far end of an in-process channel. */
function workerEnHiloPrincipal(codigo: string): PuertoDeMensajes {
  const [pagina, worker] = canalEnHilo();
  new Function('self', codigo)(worker);
  return pagina;
}

export interface DependenciasDelLayout {
  /** `new Worker(url)`; by default the browser's. Throwing means "no Worker here". */
  crearWorker?: (url: string) => Worker;
}

export function layoutExportado(codigo: string, { crearWorker = (url) => new Worker(url) }: DependenciasDelLayout = {}): AdaptadorDeLayout {
  let enHilo: AdaptadorDeLayout | undefined;
  const principal = (): AdaptadorDeLayout => (enHilo ??= adaptadorDeWorker(workerEnHiloPrincipal(codigo)));
  let enWorker: { layout: AdaptadorDeLayout; caido: Promise<'caido'> } | undefined;
  try {
    const worker = crearWorker(URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' })));
    const caido = new Promise<'caido'>((resolver) => worker.addEventListener('error', () => resolver('caido')));
    enWorker = { layout: adaptadorDeWorker(worker as unknown as PuertoDeMensajes), caido };
  } catch {
    enWorker = undefined;
  }
  return async (vista, tema, medidas) => {
    const actual = enWorker;
    if (actual === undefined) return principal()(vista, tema, medidas);
    const r = await Promise.race([actual.layout(vista, tema, medidas), actual.caido]);
    if (r !== 'caido') return r;
    enWorker = undefined;
    return principal()(vista, tema, medidas);
  };
}
