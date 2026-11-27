/**
 * Frame F: the full-screen canvas and on top of it the pill bar, the side islands with the registry tabs
 * (`tabs.tsx`), the legend, the toasts and the dialogs. It is drawn inside `DevUiProviders`.
 */
import { lazy, Suspense } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { Migas } from 'shell';
import type { Navegacion } from 'shell';

import { FinderPill } from '../commands/finder-pill';
import { useCanvasGesture } from '../canvas/gesture';
import { TourPill } from '../tour/tour-pill';
import { useDevUi } from './context';
import { SideIsland } from './island';
import { availableIn } from './mode';
import { TOP_BAR_PILLS } from './tabs';
import { useChrome } from './providers';

const Finder = lazy(() => import('../commands/finder').then((m) => ({ default: m.Finder })));
const Help = lazy(() => import('../commands/help').then((m) => ({ default: m.Help })));
const Tour = lazy(() => import('../tour/tour').then((m) => ({ default: m.Tour })));

interface FrameProps {
  /** Breadcrumbs over the hash path; `undefined` without a Source. */
  navigation: Navegacion | undefined;
  canvas: ReactNode;
  legend?: ReactNode;
}

export function Frame({ navigation, canvas, legend }: FrameProps): ReactElement {
  const { reasonWithoutGestures, mode, canWrite } = useDevUi();
  const { islands, available, tabs, chooseTab, dialog, loaded, closeDialog, notice, onPortalsMount } = useChrome();
  const gesture = useCanvasGesture();
  const solid = islands.izquierda.dragging || islands.derecha.dragging || gesture.inGesture;

  return (
    <div className="ui-chrome" data-arrastrando={solid ? '' : undefined}>
      <main className="ui-lienzo" aria-label="Canvas" {...gesture.props}>
        {canvas}
      </main>
      <header className="ui-barra">
        <span className="ui-pildora ui-marca">rinthel-arch</span>
        {!canWrite && <span className="ui-pildora ui-tenue">Read-only</span>}
        {navigation !== undefined && (
          <div className="ui-pildora ui-migas">
            <Migas navegacion={navigation} />
          </div>
        )}
        <FinderPill />
        <TourPill />
        {reasonWithoutGestures !== undefined && (
          <div role="status" aria-label="Gestures" className="ui-pildora ui-aviso-gestos">
            {reasonWithoutGestures}
          </div>
        )}
        {availableIn(TOP_BAR_PILLS, mode).map(({ id, Content }) => (
          <div key={id} className="ui-pildora">
            <Content />
          </div>
        ))}
      </header>
      <SideIsland side="izquierda" id="ui-isla-izquierda" name="left panel" island={islands.izquierda} tabs={available.izquierda} active={tabs.izquierda} onTabChange={(p) => chooseTab('izquierda', p)} />
      <SideIsland side="derecha" id="ui-isla-derecha" name="right panel" island={islands.derecha} tabs={available.derecha} active={tabs.derecha} onTabChange={(p) => chooseTab('derecha', p)} />
      {legend}
      {notice !== undefined && (
        <div className="ui-toasts">
          <div role="alert" className="ui-toast">
            {notice}
          </div>
        </div>
      )}
      {/* The dialogs (Base UI Dialog and Autocomplete) are chunks loaded when opened. */}
      <Suspense fallback={null}>
        {loaded.has('buscador') && <Finder opened={dialog === 'buscador'} onChange={closeDialog} />}
        {loaded.has('ayuda') && <Help opened={dialog === 'ayuda'} onChange={closeDialog} />}
        {loaded.has('tour') && <Tour opened={dialog === 'tour'} onChange={closeDialog} />}
      </Suspense>
      <div className="ui-portales" ref={onPortalsMount} />
    </div>
  );
}
