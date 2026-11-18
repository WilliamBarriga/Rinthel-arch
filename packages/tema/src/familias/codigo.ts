/** `code`: Capa que nombra un Componente de Tema; el resto de propiedades se pasan tal cual al componente. Solo pinta. */
import type { DefinicionDePrimitiva } from '../catalogo';

export const CODIGO = {
  code: {
    familia: 'codigo',
    afectaMetricas: false,
    abierta: true,
    propiedades: { component: { tipo: 'nombre' } },
  },
} as const satisfies Record<string, DefinicionDePrimitiva>;
