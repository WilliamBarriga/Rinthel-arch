/** `dev` state over SSE: keeps the one with the highest `version` and passes it to the Geometries before drawing it. */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DevState } from '../../src/protocol';
import type { DevClient } from '../client';
import type { DevGeometries } from '../canvas/geometries';

/**
 * `current` gives the last received state (the one Writing uses), even if the render has not seen it yet. A malformed
 * `estado` event does not replace it: it goes to `report`.
 */
export function useDevState(client: DevClient, geometries: DevGeometries, report: (message: string) => void): { state: DevState | undefined; current: () => DevState | undefined; receive: (state: DevState) => void } {
  const [state, setState] = useState<DevState>();
  const last = useRef<DevState | undefined>(undefined);
  const receive = useCallback(
    (fresh: DevState): void => {
      if (last.current !== undefined && fresh.version < last.current.version) return;
      last.current = fresh;
      geometries.receive(fresh);
      setState(fresh);
    },
    [geometries],
  );
  useEffect(() => client.subscribe(receive, (message) => report(`${message}; keeping the current state`)), [client, receive, report]);
  const current = useCallback(() => last.current, []);
  return { state, current, receive };
}
