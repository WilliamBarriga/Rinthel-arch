/** Layout in a Web Worker: `workerAdapter` (page) talks through a `LayoutPort` with `serveLayout` (Worker). */
import type { Geometry, ResolvedView } from 'canonical';
import { metricsTable } from 'theme';
import type { MetricsTable } from 'theme';

import type { LayoutAdapter } from './interactive-view';

/** The minimum asked of a `Worker` or `MessagePort`. */
export interface LayoutPort {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export interface LayoutRequest {
  id: number;
  view: ResolvedView;
  /** Already resolved Metrics (the Theme is validated once, in the page): the Worker does not bundle the Theme schema. */
  metrics: MetricsTable;
}
export type LayoutResponse = { id: number; geometry: Geometry } | { id: number; error: string };

/** Layout adapter that delegates to the Worker at the other end of `port`. One request per call; responses are matched by id. */
export function workerAdapter(port: LayoutPort): LayoutAdapter {
  let next = 0;
  const pending = new Map<number, { ok: (g: Geometry) => void; failure: (e: Error) => void }>();
  port.onmessage = ({ data }) => {
    const response = data as LayoutResponse;
    const wait = pending.get(response.id);
    if (wait === undefined) return;
    pending.delete(response.id);
    if ('error' in response) wait.failure(new Error(response.error));
    else wait.ok(response.geometry);
  };
  return (view, theme, measures) =>
    new Promise<Geometry>((ok, failure) => {
      const id = next++;
      pending.set(id, { ok, failure });
      port.postMessage({ id, view, metrics: metricsTable(theme, view.type, measures) } satisfies LayoutRequest);
    });
}
