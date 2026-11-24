/** "1-minute tour" pill of the top bar: shown until the tour is used or the pill dismissed (`visto.ts`), then never again. */
import type { ReactElement } from 'react';

import { useEstudio } from '../marco/contexto';
import { marcarTourVisto, useTourVisto } from './visto';

export function PildoraDelTour(): ReactElement | null {
  const { abrirDialogo } = useEstudio();
  if (useTourVisto()) return null;
  return (
    <div className="ui-pildora ui-pildora-tour">
      <button type="button" className="ui-pildora-tour-abrir" onClick={() => abrirDialogo('tour')}>
        1-minute tour
      </button>
      <button type="button" aria-label="Dismiss the tour" onClick={marcarTourVisto}>
        x
      </button>
    </div>
  );
}
