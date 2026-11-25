/**
 * "Start here" tour (dialog `tour` of the marco, opened with `abrirDialogo('tour')`): coachmarks that dim the UI,
 * highlight the real area of each stop and move the UI there, with Skip, Back and Next. The script is `paradas.tsx`;
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

import { useEstudio } from '../marco/contexto';
import { useTamano } from '../marco/use-tamano';
import { paradasDelTour } from './paradas';
import type { ParadaDelTour } from './paradas';
import { marcarTourVisto } from './visto';

const MARGEN = 8;
const ANCHO_DE_LA_TARJETA = 340;

interface Caja {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The highlighted area of `zona` (with a margin); `null` without one. Measured again when the area resizes
 * (`ResizeObserver`: a panel dragged, another tab) and when the window does (`useTamano`). While the area is not in the
 * page (the stop's `preparar` is still moving the UI there, or a View change replaced it), a `MutationObserver` waits
 * for it.
 */
function useHueco(zona: string | undefined): Caja | null {
  const [caja, setCaja] = useState<Caja | null>(null);
  const { width, height } = useTamano();
  useLayoutEffect(() => {
    if (zona === undefined) return setCaja(null);
    let observado: Element | null = null;
    const alCambiarDeTamano = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => medir());
    const alCambiarLaPagina = new MutationObserver(() => {
      if (document.querySelector(zona) !== observado) medir();
    });
    const medir = (): void => {
      const elemento = document.querySelector(zona);
      if (elemento !== observado) {
        if (observado !== null) alCambiarDeTamano?.unobserve(observado);
        if (elemento !== null) alCambiarDeTamano?.observe(elemento);
        observado = elemento;
      }
      const r = elemento?.getBoundingClientRect();
      setCaja((previa) => {
        if (r === undefined) return null;
        const nueva = { left: r.left - MARGEN, top: r.top - MARGEN, width: r.width + 2 * MARGEN, height: r.height + 2 * MARGEN };
        return previa !== null && Object.entries(nueva).every(([k, v]) => previa[k as keyof Caja] === v) ? previa : nueva;
      });
    };
    medir();
    alCambiarLaPagina.observe(document.body, { childList: true, subtree: true });
    return () => {
      alCambiarDeTamano?.disconnect();
      alCambiarLaPagina.disconnect();
    };
  }, [zona, width, height]);
  return caja;
}

/** The layer over the dimmed rest: the whole window minus `h`, cut out with the even-odd rule. */
function bloqueoSinHueco(h: Caja): CSSProperties {
  const [x0, y0, x1, y1] = [h.left, h.top, h.left + h.width, h.top + h.height];
  return { clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x0}px ${y0}px, ${x1}px ${y0}px, ${x1}px ${y1}px, ${x0}px ${y1}px, ${x0}px ${y0}px)` };
}

/** The card goes beside the highlighted area, below a wide one, or in the center without one. */
function posicionDeLaTarjeta(h: Caja | null): CSSProperties {
  if (h === null || h.width === 0) return { left: '50%', top: '40%', transform: 'translate(-50%, -50%)' };
  const ancho = window.innerWidth;
  if (h.width > ancho * 0.6) return { left: '50%', bottom: 90, transform: 'translateX(-50%)' };
  if (h.top > window.innerHeight / 2) return { left: Math.min(ancho - ANCHO_DE_LA_TARJETA - 16, Math.max(16, h.left)), bottom: window.innerHeight - h.top + 12 };
  if (h.left + h.width + ANCHO_DE_LA_TARJETA + 24 < ancho) return { left: h.left + h.width + 16, top: Math.max(16, h.top) };
  return { left: Math.max(16, h.left - ANCHO_DE_LA_TARJETA - 16), top: Math.max(16, h.top) };
}

export function Tour({ abierto, alCambiar }: { abierto: boolean; alCambiar: (abierto: boolean) => void }): ReactElement {
  const estudio = useEstudio();
  const [paradas, setParadas] = useState<readonly ParadaDelTour[]>([]);
  const [indice, setIndice] = useState(0);
  // The script is read when the tour opens: moving between Views during the tour does not rewrite the next stops.
  useEffect(() => {
    if (!abierto) return;
    marcarTourVisto();
    setParadas(paradasDelTour(estudio.fuente, estudio.vista, estudio.modo));
    setIndice(0);
    // Only on opening.
  }, [abierto]);
  const parada = abierto ? paradas[indice] : undefined;
  useEffect(() => {
    parada?.preparar?.(estudio);
    // Once per stop.
  }, [parada]);
  const hueco = useHueco(parada?.zona);
  const ultima = indice + 1 >= paradas.length;

  return (
    <Dialog.Root open={abierto && parada !== undefined} onOpenChange={alCambiar} modal={false} disablePointerDismissal>
      <Dialog.Portal container={estudio.portales}>
        {hueco === null || hueco.width === 0 ? (
          <div className="ui-tour-velo" />
        ) : (
          <>
            <div className="ui-tour-velo ui-tour-bloqueo" style={bloqueoSinHueco(hueco)} />
            <div className="ui-tour-hueco" style={hueco} />
          </>
        )}
        <Dialog.Popup className="ui-dialogo ui-tour" aria-label="Tour" style={posicionDeLaTarjeta(hueco)}>
          {parada !== undefined && (
            <>
              <small className="ui-tenue">
                {indice + 1} of {paradas.length}
              </small>
              <h3 className="ui-dialogo-titulo">{parada.titulo}</h3>
              <p>{parada.texto}</p>
              <div className="ui-tour-fila">
                <Dialog.Close className="ui-boton">Skip</Dialog.Close>
                <span />
                {indice > 0 && (
                  <button type="button" className="ui-boton" onClick={() => setIndice(indice - 1)}>
                    Back
                  </button>
                )}
                {ultima ? (
                  <Dialog.Close className="ui-boton ui-boton-primario">Done</Dialog.Close>
                ) : (
                  <button type="button" className="ui-boton ui-boton-primario" onClick={() => setIndice(indice + 1)}>
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
