/**
 * "Start here" tour (dialog `tour` of the frame, opened with `openDialog('tour')`): coachmarks that dim the UI,
 * highlight the real area of each stop and move the UI there, with Skip, Back and Next. The script is `stops.tsx`;
 * it is read from the Workspace each time the tour opens.
 *
 * The highlighted area stays live: the stops invite to use it (drill into a View, change Step, preview a Theme), so the
 * dialog is not modal and presses never dismiss it (a modal Base UI dialog lays a page-wide backdrop that turns every
 * click into an outside press). Over the dimmed rest lies a layer that takes the presses with the area cut out of it
 * (`clip-path`), so a press there reaches nothing. The tour closes only with Skip, Done or Escape.
 */
import { Dialog } from '@base-ui/react/dialog';
import { useEffect, useLayoutEffect, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import { useDevUi } from '../frame/context';
import { useSize } from '../frame/use-size';
import { tourStops } from './stops';
import type { TourStop } from './stops';
import { markTourSeen } from './seen';

const MARGIN = 8;
const CARD_WIDTH = 340;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The highlighted area of `zone` (with a margin); `null` without one. Measured again when the area resizes
 * (`ResizeObserver`: a panel dragged, another tab) and when the window does (`useSize`). While the area is not in the
 * page (the stop's `prepare` is still moving the UI there, or a View change replaced it), a `MutationObserver` waits
 * for it.
 */
function useGap(zone: string | undefined): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  const { width, height } = useSize();
  useLayoutEffect(() => {
    if (zone === undefined) return setBox(null);
    let observed: Element | null = null;
    const onResize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => measure());
    const onPageChange = new MutationObserver(() => {
      if (document.querySelector(zone) !== observed) measure();
    });
    const measure = (): void => {
      const element = document.querySelector(zone);
      if (element !== observed) {
        if (observed !== null) onResize?.unobserve(observed);
        if (element !== null) onResize?.observe(element);
        observed = element;
      }
      const r = element?.getBoundingClientRect();
      setBox((previous) => {
        if (r === undefined) return null;
        const fresh = { left: r.left - MARGIN, top: r.top - MARGIN, width: r.width + 2 * MARGIN, height: r.height + 2 * MARGIN };
        return previous !== null && Object.entries(fresh).every(([k, v]) => previous[k as keyof Box] === v) ? previous : fresh;
      });
    };
    measure();
    onPageChange.observe(document.body, { childList: true, subtree: true });
    return () => {
      onResize?.disconnect();
      onPageChange.disconnect();
    };
  }, [zone, width, height]);
  return box;
}

/** The layer over the dimmed rest: the whole window minus `h`, cut out with the even-odd rule. */
function blockWithoutGap(h: Box): CSSProperties {
  const [x0, y0, x1, y1] = [h.left, h.top, h.left + h.width, h.top + h.height];
  return { clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x0}px ${y0}px, ${x1}px ${y0}px, ${x1}px ${y1}px, ${x0}px ${y1}px, ${x0}px ${y0}px)` };
}

/** The card goes beside the highlighted area, below a wide one, or in the center without one. */
function cardPosition(h: Box | null): CSSProperties {
  if (h === null || h.width === 0) return { left: '50%', top: '40%', transform: 'translate(-50%, -50%)' };
  const width = window.innerWidth;
  if (h.width > width * 0.6) return { left: '50%', bottom: 90, transform: 'translateX(-50%)' };
  if (h.top > window.innerHeight / 2) return { left: Math.min(width - CARD_WIDTH - 16, Math.max(16, h.left)), bottom: window.innerHeight - h.top + 12 };
  if (h.left + h.width + CARD_WIDTH + 24 < width) return { left: h.left + h.width + 16, top: Math.max(16, h.top) };
  return { left: Math.max(16, h.left - CARD_WIDTH - 16), top: Math.max(16, h.top) };
}

export function Tour({ opened, onChange }: { opened: boolean; onChange: (opened: boolean) => void }): ReactElement {
  const devUi = useDevUi();
  const [stops, setStops] = useState<readonly TourStop[]>([]);
  const [index, setIndex] = useState(0);
  // The script is read when the tour opens: moving between Views during the tour does not rewrite the next stops.
  useEffect(() => {
    if (!opened) return;
    markTourSeen();
    setStops(tourStops(devUi.source, devUi.view, devUi.mode));
    setIndex(0);
    // Only on opening.
  }, [opened]);
  const stop = opened ? stops[index] : undefined;
  useEffect(() => {
    stop?.prepare?.(devUi);
    // Once per stop.
  }, [stop]);
  const gap = useGap(stop?.zone);
  const last = index + 1 >= stops.length;

  return (
    <Dialog.Root open={opened && stop !== undefined} onOpenChange={onChange} modal={false} disablePointerDismissal>
      <Dialog.Portal container={devUi.portals}>
        {gap === null || gap.width === 0 ? (
          <div className="ui-tour-velo" />
        ) : (
          <>
            <div className="ui-tour-velo ui-tour-bloqueo" style={blockWithoutGap(gap)} />
            <div className="ui-tour-hueco" style={gap} />
          </>
        )}
        <Dialog.Popup className="ui-dialogo ui-tour" aria-label="Tour" style={cardPosition(gap)}>
          {stop !== undefined && (
            <>
              <small className="ui-tenue">
                {index + 1} of {stops.length}
              </small>
              <h3 className="ui-dialogo-titulo">{stop.title}</h3>
              <p>{stop.text}</p>
              <div className="ui-tour-fila">
                <Dialog.Close className="ui-boton">Skip</Dialog.Close>
                <span />
                {index > 0 && (
                  <button type="button" className="ui-boton" onClick={() => setIndex(index - 1)}>
                    Back
                  </button>
                )}
                {last ? (
                  <Dialog.Close className="ui-boton ui-boton-primario">Done</Dialog.Close>
                ) : (
                  <button type="button" className="ui-boton ui-boton-primario" onClick={() => setIndex(index + 1)}>
                    Next
                  </button>
                )}
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
