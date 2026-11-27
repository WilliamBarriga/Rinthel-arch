/**
 * Theme components of the drawn View: requested again through the client with each state; if loading fails it is
 * reported and the previous ones are kept.
 */
import { useMemo } from 'react';

import type { ComponentesDeTema } from 'render';

import type { DevClient } from '../client';
import { createComponentsLoader } from './components';
import { useReadByVersion } from '../frame/use-read-by-version';

export function useComponents(client: DevClient, version: number | undefined, confirm: (message: string) => boolean, report: (message: string) => void): ComponentesDeTema | undefined {
  const load = useMemo(() => createComponentsLoader(client, confirm), [client, confirm]);
  const reading = useReadByVersion(
    client,
    version,
    version === undefined
      ? undefined
      : {
          key: 'componentes',
          keepOnFailure: true,
          request: async () => {
            const loadResult = await load();
            if (loadResult.ok) return loadResult;
            const message = `Could not load the Theme components: ${loadResult.message}`;
            report(message);
            return { ok: false, message };
          },
        },
  );
  return reading.kind === 'dato' ? reading.datum : undefined;
}
