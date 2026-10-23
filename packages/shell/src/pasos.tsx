/**
 * Pasos de revelado en el shell: el Paso actual (controlable por props o
 * interno) se traduce con `revealAt` en la visibilidad que recibe `Diagram`, y
 * los controles anterior/siguiente lo cambian. La geometria no se toca.
 */
import { useMemo } from 'react';
import type { ReactElement } from 'react';

import { revealAt } from 'canonico';
import type { Visibilidad, VistaResuelta } from 'canonico';

import { useControlado } from './controlado';

export interface PropsDePasos {
  /** Paso actual controlado: 0 es antes del primero, k aplica los pasos 1..k. */
  step?: number | undefined;
  /** Paso inicial cuando no es controlado (0 por defecto). */
  defaultStep?: number | undefined;
  /** El usuario pide otro Paso (ya acotado a 0..N). */
  onStepChange?: ((paso: number) => void) | undefined;
  /** Visibilidad explicita: manda sobre la derivada de los Pasos. */
  visibility?: Visibilidad | undefined;
}

export interface PasosEnVista {
  visibility: Visibilidad | undefined;
  /** Controles anterior/siguiente; `null` si la Vista no tiene `steps`. */
  controles: ReactElement | null;
}

const acotar = (paso: number, total: number): number => Math.min(Math.max(Number.isNaN(paso) ? 0 : paso, 0), total);

export function usePasos(vista: VistaResuelta, props: PropsDePasos): PasosEnVista {
  const total = vista.steps.length;
  const [pasoVigente, fijarPaso] = useControlado(props.step, props.defaultStep ?? 0, props.onStepChange);
  const paso = acotar(pasoVigente, total);

  const derivada = useMemo(() => (total === 0 ? undefined : revealAt(vista, paso)), [vista, total, paso]);
  const visibility = props.visibility ?? derivada;
  if (total === 0) return { visibility, controles: null };

  const ir = (destino: number): void => fijarPaso(acotar(destino, total));
  const actual = vista.steps[paso - 1];
  const controles = (
    <div
      data-pasos
      style={{ position: 'absolute', left: 8, bottom: 8, display: 'flex', gap: 8, alignItems: 'center', font: '12px sans-serif' }}
    >
      <button type="button" aria-label="Paso anterior" disabled={paso <= 0} onClick={() => ir(paso - 1)}>
        &lt;
      </button>
      <span>{actual === undefined ? `Paso 0 de ${total}` : `Paso ${paso} de ${total}: ${actual.title}`}</span>
      <button type="button" aria-label="Paso siguiente" disabled={paso >= total} onClick={() => ir(paso + 1)}>
        &gt;
      </button>
    </div>
  );
  return { visibility, controles };
}
