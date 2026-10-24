/**
 * Pintura del fondo de pagina: la pila de rellenos del Tema (`page`) como
 * declaraciones CSS de un solo elemento. Las Capas van de abajo hacia arriba;
 * en CSS la primera imagen de `background-image` queda encima, asi que se
 * apilan al reves. El relleno `solid` (`background`, que reinicia las
 * imagenes) se emite antes que ellas para no pisarlas.
 */
import type { CapaPintada } from 'tema';

import { FONDOS_ACUMULABLES } from './comun';
import type { Declaraciones } from './comun';
import { PINTORES_DE_RELLENO } from './relleno';

export function declaracionesDePagina(capas: readonly CapaPintada[]): Declaraciones {
  const declaraciones: Declaraciones = {};
  const acumulados: Record<string, string[]> = {};
  for (const capa of capas) {
    for (const [propiedad, valor] of Object.entries(PINTORES_DE_RELLENO[capa.tipo as keyof typeof PINTORES_DE_RELLENO](capa.props))) {
      if ((FONDOS_ACUMULABLES as readonly string[]).includes(propiedad)) (acumulados[propiedad] ??= []).unshift(valor);
      else declaraciones[propiedad] = valor;
    }
  }
  for (const propiedad of FONDOS_ACUMULABLES) if (acumulados[propiedad] !== undefined) declaraciones[propiedad] = acumulados[propiedad].join(',');
  return declaraciones;
}
