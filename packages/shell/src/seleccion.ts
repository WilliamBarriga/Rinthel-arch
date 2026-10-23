/**
 * Seleccion de elementos: controlada por id (`selected`) o propia (una `Seleccion` con tipo de elemento).
 * Devuelve la Seleccion vigente, los Estados para el render y la accion de pulsar un elemento.
 */
import { useMemo, useState } from 'react';

import type { VistaResuelta } from 'canonico';
import type { EstadoVisual, Estados } from 'render';

import { SELECCION_VACIA, elementoPorId, seleccionar } from './interaccion';
import type { ElementoSeleccionable, Seleccion } from './interaccion';

export interface ResultadoDeSeleccion {
  estados: Estados;
  /** Aplica el clic sobre un elemento; devuelve si queda seleccionado (para avisar y navegar). */
  pulsar: (elemento: ElementoSeleccionable, acumula: boolean) => { seleccionado: boolean; seleccion: Seleccion };
}

/** Une a los estados de seleccion los de hover (id bajo el raton) y fantasma (id arrastrandose). */
export function conEstadosTransitorios(base: Estados, hover: string | undefined, fantasma: string | undefined): Estados {
  if (hover === undefined && fantasma === undefined) return base;
  const unido: Record<string, readonly EstadoVisual[]> = { ...base };
  if (hover !== undefined) unido[hover] = [...(unido[hover] ?? []), 'hover'];
  if (fantasma !== undefined) unido[fantasma] = [...(unido[fantasma] ?? []), 'fantasma'];
  return unido;
}

export function useSeleccion(
  vista: VistaResuelta,
  selected: string | null | undefined,
  selection?: readonly string[],
): ResultadoDeSeleccion & { seleccion: Seleccion } {
  const [propia, setPropia] = useState<Seleccion>(SELECCION_VACIA);
  const seleccion = useMemo<Seleccion>(() => {
    if (selection !== undefined) return selection.map((id) => elementoPorId(vista, id));
    if (selected === undefined) return propia;
    const elemento = selected === null ? undefined : elementoPorId(vista, selected);
    return elemento === undefined ? SELECCION_VACIA : [elemento];
  }, [selection, selected, propia, vista]);
  const estados = useMemo<Estados>(() => {
    const porId: Record<string, ['seleccionado']> = {};
    for (const elemento of seleccion) porId[elemento.id] = ['seleccionado'];
    return porId;
  }, [seleccion]);
  const pulsar = (elemento: ElementoSeleccionable, acumula: boolean): { seleccionado: boolean; seleccion: Seleccion } => {
    const siguiente = seleccionar(seleccion, elemento, acumula ? 'alternar' : 'reemplazar');
    if (selected === undefined && selection === undefined) setPropia(siguiente);
    return { seleccionado: siguiente.some((e) => e.tipo === elemento.tipo && e.id === elemento.id), seleccion: siguiente };
  };
  return { seleccion, estados, pulsar };
}
