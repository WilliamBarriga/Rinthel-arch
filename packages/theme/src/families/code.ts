/** `code`: Layer that names a Theme component; the other properties are passed as is to the component. Paint-only. */
import type { PrimitiveDefinition } from '../catalog';

export const CODE = {
  code: {
    family: 'codigo',
    affectsMetrics: false,
    open: true,
    properties: { component: { type: 'name' } },
  },
} as const satisfies Record<string, PrimitiveDefinition>;
