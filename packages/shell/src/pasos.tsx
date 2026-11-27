/** Pasos de revelado: el Paso actual se traduce con `revealAt` en la visibilidad de `Diagram`; la geometria no cambia. */
import { useMemo } from 'react';
import type { ReactElement } from 'react';

import { revealAt } from 'canonical';
import type { Visibility, ResolvedView } from 'canonical';

import { useControlado } from './controlado';
import { pasoInicialDeTipo } from './hash';

export interface PropsDePasos {
  /** Paso actual controlado: 0 es antes del primero, k aplica los pasos 1..k. */
  step?: number | undefined;
  /** Paso inicial cuando no es controlado (0 por defecto). */
  defaultStep?: number | undefined;
  /** El usuario pide otro Paso (ya acotado a 0..N). */
  onStepChange?: ((paso: number) => void) | undefined;
  /** Visibilidad explicita: manda sobre la derivada de los Pasos. */
  visibility?: Visibility | undefined;
}

export interface PasosEnVista {
  visibility: Visibility | undefined;
  /** Controles anterior/siguiente; `null` si la Vista no tiene `steps`. */
  controles: ReactElement | null;
}

const acotar = (paso: number, total: number): number => Math.min(Math.max(Number.isNaN(paso) ? 0 : paso, 0), total);

export function usePasos(vista: ResolvedView, props: PropsDePasos): PasosEnVista {
  const total = vista.steps.length;
  const [pasoVigente, fijarPaso] = useControlado(props.step, props.defaultStep ?? pasoInicialDeTipo(vista.type, total), props.onStepChange);
  const paso = acotar(pasoVigente, total);

  const derivada = useMemo(() => (total === 0 ? undefined : revealAt(vista, paso)), [vista, total, paso]);
  const visibility = props.visibility ?? derivada;
  if (total === 0) return { visibility, controles: null };

  const ir = (destino: number): void => fijarPaso(acotar(destino, total));
  const actual = vista.steps[paso - 1];
  const controles = (
    <div
      className="rd-chrome rd-pasos"
      data-pasos
    >
      <button type="button" aria-label="Previous step" disabled={paso <= 0} onClick={() => ir(paso - 1)}>
        &lt;
      </button>
      <span>{actual === undefined ? `Step 0 of ${total}` : `Step ${paso} of ${total}: ${actual.title}`}</span>
      <button type="button" aria-label="Next step" disabled={paso >= total} onClick={() => ir(paso + 1)}>
        &gt;
      </button>
    </div>
  );
  return { visibility, controles };
}
