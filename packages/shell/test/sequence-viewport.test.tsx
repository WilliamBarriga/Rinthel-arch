import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { openSession } from 'session';
import { InteractiveView } from 'shell';
import type { LayoutAdapter } from 'shell';
import { NEUTRAL_THEME } from 'theme';

afterEach(cleanup);

const layout: LayoutAdapter = (view, theme, measures) => layoutView(view, theme, { ...(measures !== undefined && { measures }) });
const text = `specification { node servicio }
model {
  servicio a "A"
  servicio b "B"
  interaction i {
    a -> b "uno"
    a -> b "dos"
    a -> b "tres"
    a -> b "cuatro"
    a -> b "cinco"
    a -> b "seis"
  }
}
view v { type sequence
 interaction i }
`;

describe('Sequence: clipping to the viewport', () => {
  it('a Lifeline whose header is outside the camera still draws its line and its activation', { timeout: 20000 }, async () => {
    const source = openSession({ 'main.dg': text }).source!;
    // Camera below the headers: the line and the activations are seen, the headers are not.
    const { container } = render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={layout} width={600} height={100} camera={{ x: 0, y: 200, width: 600, height: 100 }} />);
    await waitFor(() => expect(container.querySelector('[data-activation]')).not.toBeNull(), { timeout: 15000 });
    expect(container.querySelector('[data-lifeline="a"]')).not.toBeNull();
  });

  it('a Lifeline outside the camera is not drawn and its activation does not break the drawing either', { timeout: 20000 }, async () => {
    const source = openSession({ 'main.dg': text }).source!;
    const { container } = render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={layout} width={100} height={100} camera={{ x: 0, y: 200, width: 100, height: 100 }} />);
    await waitFor(() => expect(container.querySelector('[data-lifeline="a"]')).not.toBeNull(), { timeout: 15000 });
    expect(container.querySelector('[data-lifeline="b"]')).toBeNull();
  });
});
