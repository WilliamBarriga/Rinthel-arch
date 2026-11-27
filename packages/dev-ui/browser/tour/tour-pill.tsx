/** "1-minute tour" pill of the top bar: shown until the tour is used or the pill dismissed (`seen.ts`), then never again. */
import type { ReactElement } from 'react';

import { useDevUi } from '../frame/context';
import { markTourSeen, useTourSeen } from './seen';

export function TourPill(): ReactElement | null {
  const { openDialog } = useDevUi();
  if (useTourSeen()) return null;
  return (
    <div className="ui-pildora ui-pildora-tour">
      <button type="button" className="ui-pildora-tour-abrir" onClick={() => openDialog('tour')}>
        1-minute tour
      </button>
      <button type="button" aria-label="Dismiss the tour" onClick={markTourSeen}>
        x
      </button>
    </div>
  );
}
