/** States of a read by version that are not the datum, the same in every panel: a `status` with the loading or the failure. */
import type { ReactElement } from 'react';

import type { ReadState } from './use-read-by-version';

/** `what` names what is read (`Loading <what>...`); with the datum it shows nothing. */
export function ReadNotice({ reading, what }: { reading: ReadState<unknown>; what: string }): ReactElement | null {
  if (reading.kind === 'dato') return null;
  return (
    <p className="ui-tenue" role="status">
      {reading.kind === 'cargando' ? `Loading ${what}...` : reading.message}
    </p>
  );
}
