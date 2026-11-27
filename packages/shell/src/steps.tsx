/** Reveal Steps: the current Step becomes `Diagram` visibility through `revealAt`; the geometry does not change. */
import { useMemo } from 'react';
import type { ReactElement } from 'react';

import { revealAt } from 'canonical';
import type { Visibility, ResolvedView } from 'canonical';

import { useControlled } from './controlled';
import { initialStepOfType } from './hash';

export interface StepsProps {
  /** Controlled current Step: 0 is before the first, k applies steps 1..k. */
  step?: number | undefined;
  /** Initial Step when uncontrolled (0 by default). */
  defaultStep?: number | undefined;
  /** The user asks for another Step (already clamped to 0..N). */
  onStepChange?: ((step: number) => void) | undefined;
  /** Explicit visibility: it rules over the one derived from the Steps. */
  visibility?: Visibility | undefined;
}

export interface StepsInView {
  visibility: Visibility | undefined;
  /** Previous/next controls; `null` if the View has no `steps`. */
  controls: ReactElement | null;
}

const clamp = (step: number, total: number): number => Math.min(Math.max(Number.isNaN(step) ? 0 : step, 0), total);

export function useSteps(view: ResolvedView, props: StepsProps): StepsInView {
  const total = view.steps.length;
  const [currentStep, setStep] = useControlled(props.step, props.defaultStep ?? initialStepOfType(view.type, total), props.onStepChange);
  const step = clamp(currentStep, total);

  const derived = useMemo(() => (total === 0 ? undefined : revealAt(view, step)), [view, total, step]);
  const visibility = props.visibility ?? derived;
  if (total === 0) return { visibility, controls: null };

  const go = (target: number): void => setStep(clamp(target, total));
  const current = view.steps[step - 1];
  const controls = (
    <div
      className="rd-chrome rd-pasos"
      data-pasos
    >
      <button type="button" aria-label="Previous step" disabled={step <= 0} onClick={() => go(step - 1)}>
        &lt;
      </button>
      <span>{current === undefined ? `Step 0 of ${total}` : `Step ${step} of ${total}: ${current.title}`}</span>
      <button type="button" aria-label="Next step" disabled={step >= total} onClick={() => go(step + 1)}>
        &gt;
      </button>
    </div>
  );
  return { visibility, controls };
}
