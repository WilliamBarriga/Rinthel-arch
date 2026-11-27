/**
 * Page background paint: the Theme's fill stack (`page`) as
 * CSS declarations of a single element. Layers go bottom to top;
 * in CSS the first `background-image` image is on top, so they
 * stack in reverse. The `solid` fill (`background`, which resets the
 * images) is emitted before them so it does not override them.
 */
import type { PaintedLayer } from 'theme';

import { STACKABLE_BACKGROUNDS } from './common';
import type { Declarations } from './common';
import { FILL_PAINTERS } from './fill';

export function pageDeclarations(layers: readonly PaintedLayer[]): Declarations {
  const declarations: Declarations = {};
  const accumulated: Record<string, string[]> = {};
  for (const layer of layers) {
    for (const [property, value] of Object.entries(FILL_PAINTERS[layer.tipo as keyof typeof FILL_PAINTERS](layer.props))) {
      if ((STACKABLE_BACKGROUNDS as readonly string[]).includes(property)) (accumulated[property] ??= []).unshift(value);
      else declarations[property] = value;
    }
  }
  for (const property of STACKABLE_BACKGROUNDS) if (accumulated[property] !== undefined) declarations[property] = accumulated[property].join(',');
  return declarations;
}
