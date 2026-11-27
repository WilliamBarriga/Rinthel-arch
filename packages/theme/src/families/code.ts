/** `code`: Layer that names a Theme component; the other properties are passed as is to the component. Paint-only. */
import type { PrimitiveDefinition } from '../catalog';

export const CODE = {
  code: {
    familia: 'codigo',
    afectaMetricas: false,
    abierta: true,
    propiedades: { component: { tipo: 'nombre' } },
  },
} as const satisfies Record<string, PrimitiveDefinition>;
