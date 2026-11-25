/** Estados de una lectura por version que no son el dato, iguales en todos los paneles: un `status` con la carga o el fallo. */
import type { ReactElement } from 'react';

import type { EstadoDeLectura } from './use-lectura-por-version';

/** `que` nombra lo que se lee (`Loading <que>...`); con el dato no muestra nada. */
export function AvisoDeLectura({ lectura, que }: { lectura: EstadoDeLectura<unknown>; que: string }): ReactElement | null {
  if (lectura.tipo === 'dato') return null;
  return (
    <p className="ui-tenue" role="status">
      {lectura.tipo === 'cargando' ? `Loading ${que}...` : lectura.mensaje}
    </p>
  );
}
