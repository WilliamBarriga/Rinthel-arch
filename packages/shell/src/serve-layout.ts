/** Worker side of `workerAdapter`. Its own file so the page does not pull ELK in when bundling. */
import { layoutWithMetrics } from 'layout';
import type { LayoutOptions } from 'layout';

import type { LayoutPort, LayoutRequest, LayoutResponse } from './worker-layout';

/** Serves the `workerAdapter` requests on `port`; in a Worker, `serveLayout(self)`. */
export function serveLayout(port: LayoutPort, options: Pick<LayoutOptions, 'elk'> = {}): void {
  port.onmessage = ({ data }) => {
    const { id, view, metrics } = data as LayoutRequest;
    layoutWithMetrics(view, metrics, options).then(
      (geometry) => port.postMessage({ id, geometry } satisfies LayoutResponse),
      (error: unknown) => port.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies LayoutResponse),
    );
  };
}
