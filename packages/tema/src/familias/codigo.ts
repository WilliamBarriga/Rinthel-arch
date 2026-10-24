/**
 * Familia codigo (ADR 0008): `code` es la via de escape. Una Capa mas de la pila
 * que nombra un Componente de Tema (modulo `.tsx` del Workspace, registrado por
 * el adaptador del render). `component` es obligatoria y el resto de propiedades
 * son los parametros declarados del Tema, pasados tal cual al componente. Solo
 * pinta: nunca afecta a las Metricas ni al tamano del elemento.
 */
import type { DefinicionDePrimitiva } from '../catalogo';

export const CODIGO = {
  code: {
    familia: 'codigo',
    afectaMetricas: false,
    abierta: true,
    propiedades: { component: { tipo: 'nombre' } },
  },
} as const satisfies Record<string, DefinicionDePrimitiva>;
