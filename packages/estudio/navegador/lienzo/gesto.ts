/**
 * Gesto en curso sobre el lienzo (arrastre, pan o zoom con rueda). Medido en Chromium sobre `examples/rinthel-arch`:
 * con `backdrop-filter` el pan sube el p95 de cuadro de ~17 ms a ~33 ms; sin el, 17 ms. Por eso durante el gesto el
 * marco pasa a superficie solida (`data-arrastrando`).
 */
import { useEffect, useRef, useState } from 'react';

/** Tras el ultimo evento de rueda, el zoom se da por terminado. */
const FIN_DE_RUEDA_MS = 200;

export interface GestoEnLienzo {
  enGesto: boolean;
  /** Manejadores para el contenedor del lienzo. */
  props: { onPointerDown: () => void; onPointerUp: () => void; onPointerCancel: () => void; onWheel: () => void };
}

export function useGestoEnLienzo(): GestoEnLienzo {
  const [puntero, setPuntero] = useState(false);
  const [rueda, setRueda] = useState(false);
  const fin = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(fin.current), []);
  return {
    enGesto: puntero || rueda,
    props: {
      onPointerDown: () => setPuntero(true),
      onPointerUp: () => setPuntero(false),
      onPointerCancel: () => setPuntero(false),
      onWheel: () => {
        setRueda(true);
        clearTimeout(fin.current);
        fin.current = setTimeout(() => setRueda(false), FIN_DE_RUEDA_MS);
      },
    },
  };
}
