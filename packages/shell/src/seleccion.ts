/**
 * Seleccion de elementos: controlada por id (`selected`) o propia (una `Seleccion` con tipo de elemento).
 * Devuelve la Seleccion vigente, los Estados para el render y la accion de pulsar un elemento.
 */
import { useMemo, useState } from 'react';

import type { VistaResuelta } from 'canonico';
import type { Estados } from 'render';

import { SELECCION_VACIA, elementoPorId, seleccionar } from './interaccion';
import type { ElementoSeleccionable, Seleccion } from './interaccion';

export interface ResultadoDeSeleccion {
  estados: Estados;
  /** Aplica el clic sobre un elemento; devuelve si queda seleccionado (para avisar y navegar). */
  pulsar: (elemento: ElementoSeleccionable, acumula: boolean) => boolean;
}

export function useSeleccion(vista: VistaResuelta, selected: string | null | undefined): ResultadoDeSeleccion & { seleccion: Seleccion } {
  const [propia, setPropia] = useState<Seleccion>(SELECCION_VACIA);
  const seleccion = useMemo<Seleccion>(() => {
    if (selected === undefined) return propia;
    const elemento = selected === null ? undefined : elementoPorId(vista, selected);
    return elemento === undefined ? SELECCION_VACIA : [elemento];
  }, [selected, propia, vista]);
  const estados = useMemo<Estados>(() => {
    const porId: Record<string, ['seleccionado']> = {};
    for (const elemento of seleccion) porId[elemento.id] = ['seleccionado'];
    return porId;
  }, [seleccion]);
  const pulsar = (elemento: ElementoSeleccionable, acumula: boolean): boolean => {
    const siguiente = seleccionar(seleccion, elemento, acumula ? 'alternar' : 'reemplazar');
    if (selected === undefined) setPropia(siguiente);
    return siguiente.some((e) => e.tipo === elemento.tipo && e.id === elemento.id);
  };
  return { seleccion, estados, pulsar };
}
