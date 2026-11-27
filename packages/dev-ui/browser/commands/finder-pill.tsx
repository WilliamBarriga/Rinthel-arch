/** Top bar pill that opens the Finder and announces Mod+K (apart from the Finder, which loads when opened). */
import type { ReactElement } from 'react';

import { useDevUi } from '../frame/context';
import { ButtonWithShortcut } from './shortcut';

export function FinderPill(): ReactElement {
  const { openDialog } = useDevUi();
  return (
    <ButtonWithShortcut command="buscador" className="ui-pildora ui-pildora-buscador" aria-label="Search" onClick={() => openDialog('buscador')}>
      Search
    </ButtonWithShortcut>
  );
}
